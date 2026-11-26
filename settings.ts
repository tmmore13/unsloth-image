export type UnslothSettings = {
  baseURL: string
  autoDetectBaseURL: boolean
  apiKey: string
  apiKeyEnv: string
  defaultModel: string
  size: string
  steps?: number
  guidance?: number
  seed?: number
  outputDir: string
  allowPublicHosts: boolean
}

export type UnslothSettingsView = UnslothSettings & {
  apiKeyFromEnv: boolean
}

export type UnslothModel = {
  id: string
  loaded?: boolean
}

export const SETTINGS_KEY = "unsloth-image.settings"

export const DEFAULT_SETTINGS: UnslothSettings = {
  baseURL: "",
  autoDetectBaseURL: true,
  apiKey: "",
  apiKeyEnv: "UNSLOTH_API_KEY",
  defaultModel: "unsloth/flux-3-image-klein-FP8",
  size: "1024x1024",
  outputDir: ".opencode/generated-images",
  allowPublicHosts: false,
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function stringValue(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback
}

function boolValue(value: unknown, fallback: boolean): boolean {
  if (typeof value === "boolean") return value
  if (value === "true") return true
  if (value === "false") return false
  return fallback
}

function optionalNumber(value: unknown, fallback: number | undefined): number | undefined {
  if (value === undefined || value === null || value === "") return undefined
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN
  return Number.isFinite(parsed) ? parsed : fallback
}

export function normalizeSettings(
  input: unknown,
  previous: UnslothSettings = DEFAULT_SETTINGS,
): UnslothSettings {
  const raw = isRecord(input) ? input : {}
  const baseURL = stringValue(raw.baseURL, previous.baseURL).trim().replace(/\/+$/, "")
  const autoDetectBaseURL =
    baseURL === "" ? true : raw.autoDetectBaseURL === undefined ? previous.autoDetectBaseURL : boolValue(raw.autoDetectBaseURL, false)

  return {
    baseURL,
    autoDetectBaseURL,
    apiKey: stringValue(raw.apiKey, previous.apiKey),
    apiKeyEnv: stringValue(raw.apiKeyEnv, previous.apiKeyEnv) || DEFAULT_SETTINGS.apiKeyEnv,
    defaultModel: stringValue(raw.defaultModel, previous.defaultModel) || DEFAULT_SETTINGS.defaultModel,
    size: stringValue(raw.size, previous.size) || DEFAULT_SETTINGS.size,
    steps: optionalNumber(raw.steps, previous.steps),
    guidance: optionalNumber(raw.guidance, previous.guidance),
    seed: optionalNumber(raw.seed, previous.seed),
    outputDir: stringValue(raw.outputDir, previous.outputDir) || DEFAULT_SETTINGS.outputDir,
    allowPublicHosts: boolValue(raw.allowPublicHosts, previous.allowPublicHosts),
  }
}

export function settingsFromOptions(options: Record<string, unknown>): UnslothSettings {
  const hasExplicitBaseURL = typeof options.baseURL === "string" && options.baseURL.trim() !== ""
  return normalizeSettings(
    {
      baseURL: options.baseURL ?? "",
      autoDetectBaseURL: !hasExplicitBaseURL,
      apiKey: options.apiKey ?? "",
      apiKeyEnv: options.apiKeyEnv ?? DEFAULT_SETTINGS.apiKeyEnv,
      defaultModel: options.defaultModel ?? DEFAULT_SETTINGS.defaultModel,
      size: options.size ?? DEFAULT_SETTINGS.size,
      steps: options.steps,
      guidance: options.guidance,
      seed: options.seed,
      outputDir: options.outputDir ?? DEFAULT_SETTINGS.outputDir,
      allowPublicHosts: options.allowPublicHosts === true,
    },
    DEFAULT_SETTINGS,
  )
}

export function settingsToJson(settings: UnslothSettings): Record<string, string | number | boolean> {
  const json: Record<string, string | number | boolean> = {
    baseURL: settings.baseURL,
    autoDetectBaseURL: settings.autoDetectBaseURL,
    apiKey: settings.apiKey,
    apiKeyEnv: settings.apiKeyEnv,
    defaultModel: settings.defaultModel,
    size: settings.size,
    outputDir: settings.outputDir,
    allowPublicHosts: settings.allowPublicHosts,
  }
  if (settings.steps !== undefined) json.steps = settings.steps
  if (settings.guidance !== undefined) json.guidance = settings.guidance
  if (settings.seed !== undefined) json.seed = settings.seed
  return json
}

export function settingsView(settings: UnslothSettings, apiKeyFromEnv: boolean): UnslothSettingsView {
  return { ...settings, apiKeyFromEnv }
}

export function stripSettingsView(view: UnslothSettingsView): UnslothSettings {
  const { apiKeyFromEnv: _apiKeyFromEnv, ...settings } = view
  return settings
}
