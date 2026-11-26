import { Plugin } from "@opencode/plugin"
import { mkdir, writeFile } from "node:fs/promises"
import { join, resolve } from "node:path"
import { pathToFileURL } from "node:url"
import { randomUUID } from "node:crypto"
import { Unsloth, type ModelListResult, type TestConnectionResult } from "./rpc"
import {
  DEFAULT_SETTINGS,
  SETTINGS_KEY,
  normalizeSettings,
  settingsFromOptions,
  settingsToJson,
  settingsView,
  type UnslothModel,
  type UnslothSettings,
  type UnslothSettingsView,
} from "./settings"

/**
 * OpenCode plugin: local image generation through Unsloth Desktop or Studio.
 *
 * Both Unsloth Desktop and Unsloth Studio expose the same OpenAI-compatible
 * local API server, normally on port 8888 (sometimes 8000):
 *   POST {baseURL}/v1/images/generations
 *   GET  {baseURL}/v1/models
 *
 * Auth: Authorization: Bearer sk-unsloth-... (Settings -> API in Unsloth)
 */

type GenerateInput = {
  prompt?: string
  model?: string
  width?: number
  height?: number
  size?: string
  steps?: number
  guidance?: number
  seed?: number
}

type ResolvedConfig = {
  baseURL: string
  autoDetectBaseURL: boolean
  apiKey?: string
  defaultModel: string
  size: string
  steps?: number
  guidance?: number
  seed?: number
  outputDir: string
  allowPublicHosts: boolean
}

type Preset = { match: string; steps: number; guidance: number; label: string }

// Order matters: more specific matches first.
const MODEL_PRESETS: Preset[] = [
  { match: "flux-3-image-klein-base", steps: 50, guidance: 3.5, label: "FLUX.3 Image Klein Base" },
  { match: "flux-3-image-klein", steps: 16, guidance: 1, label: "FLUX.3 Image Klein" },
  { match: "minimax-h3-image", steps: 6, guidance: 0, label: "MiniMax-H3-Image" },
  { match: "qwen-image-2.1-turbo", steps: 8, guidance: 1, label: "Qwen-Image-2.1-Turbo" },
  { match: "qwen-image-2.1", steps: 25, guidance: 1, label: "Qwen-Image-2.1" },
  { match: "moss-image", steps: 25, guidance: 2.5, label: "MOSS-Image" },
]

const DEFAULT_BASE_URL = "http://localhost:8888"

// Unsloth Desktop and Studio both serve the API locally. Desktop usually uses
// 8888; the CLI can use 8000. Probe them in order when auto-detect is enabled.
const CANDIDATE_BASE_URLS = ["http://localhost:8888", "http://localhost:8000"]

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

/** Wrap a caller's abort signal with a timeout for lightweight probes. */
function withTimeout(signal: AbortSignal, ms: number): { signal: AbortSignal; dispose: () => void } {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ms)
  const onAbort = () => controller.abort()
  if (signal.aborted) controller.abort()
  else signal.addEventListener("abort", onAbort, { once: true })
  return {
    signal: controller.signal,
    dispose: () => {
      clearTimeout(timer)
      signal.removeEventListener("abort", onAbort)
    },
  }
}

function presetFor(model: string): Preset | undefined {
  const id = model.toLowerCase()
  return MODEL_PRESETS.find((preset) => id.includes(preset.match))
}

function resolveConfig(settings: UnslothSettings, projectDir: string): ResolvedConfig {
  const configuredBaseURL = settings.baseURL.trim().replace(/\/+$/, "")
  const envName = settings.apiKeyEnv.trim() || DEFAULT_SETTINGS.apiKeyEnv

  return {
    baseURL: configuredBaseURL || DEFAULT_BASE_URL,
    autoDetectBaseURL: settings.autoDetectBaseURL || configuredBaseURL === "",
    apiKey: settings.apiKey.trim() || process.env[envName],
    defaultModel: settings.defaultModel || DEFAULT_SETTINGS.defaultModel,
    size: settings.size || DEFAULT_SETTINGS.size,
    steps: settings.steps,
    guidance: settings.guidance,
    seed: settings.seed,
    outputDir: resolve(projectDir, settings.outputDir || DEFAULT_SETTINGS.outputDir),
    allowPublicHosts: settings.allowPublicHosts === true,
  }
}

function assertLocalHost(baseURL: string, allowPublicHosts: boolean): void {
  if (allowPublicHosts) return
  let host: string
  try {
    host = new URL(baseURL).hostname.toLowerCase()
  } catch {
    throw new Error(`Invalid Unsloth base URL: ${baseURL}`)
  }
  const isLocal =
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "::1" ||
    host === "[::1]" ||
    host.endsWith(".local") ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host)
  if (!isLocal) {
    throw new Error(
      `Refusing to send prompts to non-local host "${host}". Enable "Allow public hosts" in the Unsloth Image settings tab, or set allowPublicHosts: true in plugin options.`,
    )
  }
}

function authHeaders(config: ResolvedConfig): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" }
  if (config.apiKey) headers.Authorization = `Bearer ${config.apiKey}`
  return headers
}

function validateSize(size: string): void {
  const match = /^(\d+)x(\d+)$/i.exec(size)
  if (!match) {
    throw new Error(`Invalid size "${size}" — expected WIDTHxHEIGHT, for example 1024x1024.`)
  }
  for (const [label, value] of [
    ["width", Number(match[1])],
    ["height", Number(match[2])],
  ] as const) {
    if (value < 256 || value > 2048) {
      throw new Error(`${label} ${value} is outside the supported 256–2048 pixel range.`)
    }
    if (value % 16 !== 0) {
      throw new Error(`${label} ${value} must be a multiple of 16.`)
    }
  }
}

function extensionFor(bytes: Uint8Array): { ext: string; mime: string } {
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return { ext: "png", mime: "image/png" }
  }
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { ext: "jpg", mime: "image/jpeg" }
  }
  if (
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return { ext: "webp", mime: "image/webp" }
  }
  return { ext: "png", mime: "image/png" }
}

function text(textValue: string) {
  return { type: "text" as const, text: textValue }
}

function isAbort(error: unknown, signal: AbortSignal): boolean {
  return signal.aborted || (error instanceof Error && error.name === "AbortError")
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function httpFailure(response: Response, baseURL: string): string {
  if (response.status === 401) {
    return "Unsloth rejected the API key (401). Create a key in Unsloth under Settings → API, then set it in the Unsloth Image settings tab or UNSLOTH_API_KEY."
  }
  if (response.status === 404) {
    return `Unsloth endpoint not found at ${baseURL}. Check the base URL and that your Unsloth version supports the image API.`
  }
  return `Unsloth returned ${response.status} ${response.statusText} from ${baseURL}.`
}

function normalizeModels(payload: unknown): UnslothModel[] {
  const source = Array.isArray(payload)
    ? payload
    : isRecord(payload) && Array.isArray(payload.data)
      ? payload.data
      : isRecord(payload) && Array.isArray(payload.models)
        ? payload.models
        : []

  const seen = new Set<string>()
  const models: UnslothModel[] = []
  for (const item of source) {
    let id: string | undefined
    let loaded: boolean | undefined
    if (typeof item === "string") {
      id = item
    } else if (isRecord(item)) {
      const rawID = item.id ?? item.name ?? item.model
      if (typeof rawID === "string") id = rawID
      if (typeof item.loaded === "boolean") loaded = item.loaded
    }
    if (!id || seen.has(id)) continue
    seen.add(id)
    models.push(loaded === undefined ? { id } : { id, loaded })
  }
  return models
}

export default Plugin.define({
  id: "unsloth-image",
  async setup(ctx) {
    const projectDir = ctx.location.directory
    const optionSettings = settingsFromOptions((ctx.options ?? {}) as Record<string, unknown>)
    const stored = await ctx.storage.get(SETTINGS_KEY)
    let settings = normalizeSettings(stored, optionSettings)

    let discoveredBaseURL: string | undefined

    const config = () => resolveConfig(settings, projectDir)

    const currentView = (): UnslothSettingsView => {
      const envName = settings.apiKeyEnv.trim() || DEFAULT_SETTINGS.apiKeyEnv
      return settingsView(settings, !settings.apiKey.trim() && Boolean(process.env[envName]))
    }

    async function activeBaseURL(cfg: ResolvedConfig, signal: AbortSignal): Promise<string> {
      if (!cfg.autoDetectBaseURL && cfg.baseURL) return cfg.baseURL
      if (discoveredBaseURL) return discoveredBaseURL
      for (const candidate of CANDIDATE_BASE_URLS) {
        const timed = withTimeout(signal, 1500)
        try {
          const response = await fetch(`${candidate}/v1/models`, {
            headers: authHeaders(cfg),
            signal: timed.signal,
          })
          // Any HTTP response means a local Unsloth server is there. Auth
          // failures are handled by the calling tool/RPC method.
          if (response.status < 500) {
            discoveredBaseURL = candidate
            return candidate
          }
        } catch {
          // Try the next candidate port.
        } finally {
          timed.dispose()
        }
      }
      return cfg.baseURL || DEFAULT_BASE_URL
    }

    async function fetchModelsFromUnsloth(
      cfg: ResolvedConfig,
      signal: AbortSignal,
    ): Promise<ModelListResult> {
      try {
        const baseURL = await activeBaseURL(cfg, signal)
        assertLocalHost(baseURL, cfg.allowPublicHosts)
        const response = await fetch(`${baseURL}/v1/models`, {
          headers: authHeaders(cfg),
          signal,
        })
        if (!response.ok) {
          return { ok: false, baseURL, models: [], error: httpFailure(response, baseURL) }
        }
        return { ok: true, baseURL, models: normalizeModels(await response.json()) }
      } catch (error) {
        if (isAbort(error, signal)) throw error
        return { ok: false, baseURL: cfg.baseURL, models: [], error: errorMessage(error) }
      }
    }

    const rpcRegistration = await ctx.rpc.register(Unsloth, {
      getSettings: async () => currentView(),

      setSettings: async (input) => {
        const rawInput = isRecord(input) ? input : {}
        let next = normalizeSettings(input, settings)
        // A blank password field means "keep the current key"; otherwise a
        // masked field would erase the key on every unrelated save.
        if (typeof rawInput.apiKey === "string" && rawInput.apiKey.trim() === "" && settings.apiKey) {
          next = { ...next, apiKey: settings.apiKey }
        }
        settings = next
        discoveredBaseURL = undefined
        await ctx.storage.set(SETTINGS_KEY, settingsToJson(settings))
        return currentView()
      },

      listModels: async (_input, context): Promise<ModelListResult> =>
        fetchModelsFromUnsloth(config(), context.signal),

      testConnection: async (_input, context): Promise<TestConnectionResult> => {
        const cfg = config()
        const result = await fetchModelsFromUnsloth(cfg, context.signal)
        return {
          ok: result.ok,
          baseURL: result.baseURL,
          modelCount: result.models.length,
          auth: cfg.apiKey ? "API key configured" : "No API key configured",
          message: result.ok
            ? `Connected to ${result.baseURL}; found ${result.models.length} model(s).`
            : result.error ?? "Could not connect to Unsloth.",
        }
      },
    })

    const registration = await ctx.tool.transform((editor) => {
      editor.namespace({
        name: "unslothimage",
        description: "Local image generation through Unsloth Desktop or Studio",
      })

      editor.add({
        name: "generate",
        description:
          "Generate an image from a text prompt using a locally running Unsloth Desktop or Studio image model. " +
          "Returns the generated image as a file. Use unslothimage.models to discover available models.",
        input: {
          type: "object",
          properties: {
            prompt: { type: "string", description: "Description of the image to generate" },
            model: { type: "string", description: "Unsloth image model ID; defaults to the configured default model" },
            width: { type: "number", description: "Image width in pixels (256–2048, multiple of 16)" },
            height: { type: "number", description: "Image height in pixels (256–2048, multiple of 16)" },
            size: { type: "string", description: "Explicit WIDTHxHEIGHT; overrides width and height" },
            steps: { type: "number", description: "Inference steps; defaults to the model's recommended value" },
            guidance: { type: "number", description: "Guidance scale; defaults to the model's recommended value" },
            seed: { type: "number", description: "Seed for reproducibility" },
          },
          required: ["prompt"],
          additionalProperties: false,
        },
        options: { namespace: "unslothimage", codemode: true },
        execute: async (input, context) => {
          const params = input as GenerateInput
          const signal = context.signal

          try {
            if (!params.prompt || !params.prompt.trim()) {
              throw new Error("A non-empty prompt is required.")
            }

            const cfg = config()
            const endpoint = await activeBaseURL(cfg, signal)
            assertLocalHost(endpoint, cfg.allowPublicHosts)

            const model = params.model ?? cfg.defaultModel
            const preset = presetFor(model)
            const size =
              params.size ??
              (params.width || params.height
                ? `${Math.round(params.width ?? 1024)}x${Math.round(params.height ?? 1024)}`
                : cfg.size)
            validateSize(size)

            const steps = params.steps ?? cfg.steps ?? preset?.steps
            const guidance = params.guidance ?? cfg.guidance ?? preset?.guidance
            const seed = params.seed ?? cfg.seed

            const body: Record<string, unknown> = {
              model,
              prompt: params.prompt,
              size,
              response_format: "b64_json",
            }
            if (steps !== undefined) body.steps = steps
            if (guidance !== undefined) body.guidance = guidance
            if (seed !== undefined) body.seed = seed

            const label = preset?.label ?? model
            await context.progress({ status: `Generating image with ${label} at ${size}…` })

            const response = await fetch(`${endpoint}/v1/images/generations`, {
              method: "POST",
              headers: authHeaders(cfg),
              body: JSON.stringify(body),
              signal,
            })

            if (!response.ok) {
              throw new Error(httpFailure(response, endpoint))
            }

            const payload = (await response.json()) as {
              data?: Array<{ b64_json?: string; url?: string }>
            }
            const first = payload.data?.[0]
            if (!first) {
              throw new Error("Unsloth returned no image data. Check that an image model is loaded.")
            }

            let bytes: Uint8Array
            if (first.b64_json) {
              bytes = Buffer.from(first.b64_json, "base64")
            } else if (first.url) {
              const imageResponse = await fetch(first.url, {
                headers: cfg.apiKey ? { Authorization: `Bearer ${cfg.apiKey}` } : {},
                signal,
              })
              if (!imageResponse.ok) {
                throw new Error(`Could not download generated image (${imageResponse.status}).`)
              }
              bytes = new Uint8Array(await imageResponse.arrayBuffer())
            } else {
              throw new Error("Unsloth response contained neither b64_json nor a URL.")
            }

            if (bytes.length === 0) {
              throw new Error("Unsloth returned an empty image.")
            }

            const { ext, mime } = extensionFor(bytes)
            const fileName = `unsloth-${Date.now()}-${randomUUID().slice(0, 8)}.${ext}`
            await mkdir(cfg.outputDir, { recursive: true })
            const filePath = join(cfg.outputDir, fileName)
            await writeFile(filePath, bytes)

            const uri = pathToFileURL(filePath).toString()
            const settingsLabel = [preset ? `preset ${label}` : model, size]
            if (steps !== undefined) settingsLabel.push(`${steps} steps`)
            if (guidance !== undefined) settingsLabel.push(`guidance ${guidance}`)
            if (seed !== undefined) settingsLabel.push(`seed ${seed}`)

            return {
              content: [
                { type: "file" as const, uri, mime, name: fileName },
                text(`Generated image (${settingsLabel.join(", ")}) saved to ${filePath}`),
              ],
            }
          } catch (error) {
            if (isAbort(error, signal)) {
              return { content: [text("Image generation was cancelled.")] }
            }
            throw new Error(`Unsloth image generation failed: ${errorMessage(error)}`)
          }
        },
      })

      editor.add({
        name: "models",
        description:
          "List models currently available from Unsloth Desktop or Studio, including loaded status. Use this before generate to choose a model.",
        input: {
          type: "object",
          properties: {},
          additionalProperties: false,
        },
        options: { namespace: "unslothimage", codemode: true },
        execute: async (_input, context) => {
          const signal = context.signal
          try {
            await context.progress({ status: "Querying Unsloth models…" })
            const result = await fetchModelsFromUnsloth(config(), signal)
            if (!result.ok) {
              throw new Error(result.error ?? "Could not list Unsloth models.")
            }
            if (result.models.length === 0) {
              return { content: [text("Unsloth reports no available models.")] }
            }

            const lines = result.models.map((model) => {
              const state =
                model.loaded === true ? "loaded" : model.loaded === false ? "not loaded" : "unknown"
              return `- ${model.id} [${state}]`
            })
            return {
              content: [text(`Unsloth models at ${result.baseURL}:\n${lines.join("\n")}`)],
            }
          } catch (error) {
            if (isAbort(error, signal)) {
              return { content: [text("Model query was cancelled.")] }
            }
            throw new Error(`Could not list Unsloth models: ${errorMessage(error)}`)
          }
        },
      })

      editor.add({
        name: "status",
        description:
          "Check whether the Unsloth Desktop or Studio API is reachable and whether an API key is configured.",
        input: {
          type: "object",
          properties: {},
          additionalProperties: false,
        },
        options: { namespace: "unslothimage", codemode: true },
        execute: async (_input, context) => {
          const signal = context.signal
          const cfg = config()
          const auth = cfg.apiKey ? "API key configured" : "No API key configured"
          try {
            const endpoint = await activeBaseURL(cfg, signal)
            assertLocalHost(endpoint, cfg.allowPublicHosts)
            const response = await fetch(`${endpoint}/v1/models`, {
              headers: authHeaders(cfg),
              signal,
            })
            const reachable = response.ok || response.status === 401
            const lines = [
              `Unsloth base URL: ${endpoint}`,
              `Auto-detected: ${cfg.autoDetectBaseURL ? "yes" : "no"}`,
              `Reachable: ${reachable ? "yes" : `no (HTTP ${response.status})`}`,
              `Authentication: ${auth}`,
              `Default model: ${cfg.defaultModel}`,
              `Default size: ${cfg.size}`,
              `Output directory: ${cfg.outputDir}`,
            ]
            if (response.status === 401) {
              lines.push("Note: 401 means the API key is missing or wrong — create one in Settings → API.")
            }
            return { content: [text(lines.join("\n"))] }
          } catch (error) {
            if (isAbort(error, signal)) {
              return { content: [text("Status check was cancelled.")] }
            }
            return {
              content: [
                text(
                  [
                    `Unsloth base URL: ${cfg.baseURL}`,
                    "Reachable: no",
                    `Authentication: ${auth}`,
                    `Error: ${errorMessage(error)}`,
                    "Start Unsloth Desktop or Studio with an image model loaded, then retry.",
                  ].join("\n"),
                ),
              ],
            }
          }
        },
      })
    })

    return async () => {
      await rpcRegistration.dispose()
      await registration.dispose()
    }
  },
})
