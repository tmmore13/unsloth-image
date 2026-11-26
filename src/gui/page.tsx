import { createSignal, onMount, Show } from "solid-js"
import { usePlugin } from "@opencode/plugin/gui"
import { Unsloth, type ModelListResult, type TestConnectionResult } from "../../rpc"
import {
  DEFAULT_SETTINGS,
  stripSettingsView,
  type UnslothSettings,
  type UnslothSettingsView,
} from "../../settings"
import type { definition } from "./definition"

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function UnslothSettingsPage() {
  const ctx = usePlugin<typeof definition>()
  const ui = ctx.ui
  const rpc = () => ctx.client.rpc(Unsloth)

  const [settings, setSettings] = createSignal<UnslothSettings>(DEFAULT_SETTINGS)
  const [models, setModels] = createSignal<UnslothSettingsView["defaultModel"][]>([])
  const [message, setMessage] = createSignal("")
  const [busy, setBusy] = createSignal(false)
  const [apiKeyFromEnv, setApiKeyFromEnv] = createSignal(false)

  function patch<K extends keyof UnslothSettings>(key: K, value: UnslothSettings[K]) {
    setSettings((previous) => ({ ...previous, [key]: value }))
  }

  function applyView(view: UnslothSettingsView) {
    setSettings(stripSettingsView(view))
    setApiKeyFromEnv(view.apiKeyFromEnv === true)
  }

  async function refreshModels(announce = true) {
    setBusy(true)
    try {
      const result = (await rpc().listModels({})) as ModelListResult
      setModels(result.models.map((model) => model.id))
      if (announce) {
        setMessage(
          result.ok
            ? `Detected ${result.models.length} model(s) at ${result.baseURL}.`
            : result.error ?? "Could not detect Unsloth models.",
        )
      }
    } catch (error) {
      if (announce) setMessage(errorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  async function reload() {
    setBusy(true)
    try {
      const view = (await rpc().getSettings({})) as UnslothSettingsView
      applyView(view)
      await refreshModels()
    } catch (error) {
      setMessage(errorMessage(error))
      setBusy(false)
    }
  }

  async function save() {
    setBusy(true)
    try {
      const view = (await rpc().setSettings(settings())) as UnslothSettingsView
      applyView(view)
      await refreshModels(false)
      setMessage("Settings saved. Unsloth models refreshed.")
    } catch (error) {
      setMessage(errorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  async function testConnection() {
    setBusy(true)
    try {
      const result = (await rpc().testConnection({})) as TestConnectionResult
      setMessage(result.message)
      if (result.ok) await refreshModels(false)
    } catch (error) {
      setMessage(errorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  onMount(() => {
    void reload()
  })

  const numberText = (key: "steps" | "guidance" | "seed") => {
    const value = settings()[key]
    return value === undefined ? "" : String(value)
  }

  const setNumberText = (key: "steps" | "guidance" | "seed", value: string) => {
    const trimmed = value.trim()
    if (trimmed === "") {
      patch(key, undefined)
      return
    }
    const parsed = Number(trimmed)
    patch(key, Number.isFinite(parsed) ? parsed : undefined)
  }

  const sizeValid = () => {
    const match = /^(\d+)x(\d+)$/i.exec(settings().size)
    if (!match) return false
    return [Number(match[1]), Number(match[2])].every(
      (value) => value >= 256 && value <= 2048 && value % 16 === 0,
    )
  }

  const modelOptions = () => {
    const current = settings().defaultModel
    const options: Array<{ value: string; label: string }> = []
    const seen = new Set<string>()
    for (const id of models()) {
      if (seen.has(id)) continue
      seen.add(id)
      options.push({ value: id, label: id === current ? `${id} (selected)` : id })
    }
    if (current && !seen.has(current)) {
      options.unshift({ value: current, label: `${current} (saved)` })
    }
    return options
  }

  return (
    <ui.SettingsLayout
      title={ctx.t("title")}
      description={ctx.t("description")}
      actions={
        <>
          <ui.Button size="small" onClick={() => void reload()} disabled={busy()}>
            Reload
          </ui.Button>
          <ui.Button size="small" variant="contrast" onClick={() => void save()} disabled={busy()}>
            Save
          </ui.Button>
        </>
      }
    >
      <ui.SettingsSection
        title="Connection"
        footer={<Show when={message()}>{message()}</Show>}
      >
        <ui.SettingsRow
          id="connection.autoDetect"
          title="Auto-detect Unsloth port"
          description="Probe localhost:8888 and localhost:8000 for a running Unsloth Desktop or Studio API."
        >
          <ui.Switch
            label="Auto-detect Unsloth port"
            hideLabel
            checked={settings().autoDetectBaseURL}
            onChange={(checked) => {
              patch("autoDetectBaseURL", checked)
              if (checked) patch("baseURL", "")
            }}
          />
        </ui.SettingsRow>

        <ui.SettingsRow
          id="connection.baseURL"
          title="Base URL"
          description="Leave blank when auto-detecting. Examples: http://localhost:8888, http://localhost:8000."
        >
          <ui.TextInput
            label="Base URL"
            type="url"
            placeholder="Auto-detect"
            disabled={settings().autoDetectBaseURL}
            value={settings().baseURL}
            onInput={(value) => patch("baseURL", value)}
            onSubmit={() => void save()}
          />
        </ui.SettingsRow>

        <ui.SettingsRow
          id="connection.apiKey"
          title="API key"
          description={
            apiKeyFromEnv()
              ? `Using ${settings().apiKeyEnv} from the environment. Leave blank to keep using it.`
              : "Create a key in Unsloth under Settings → API. Stored locally by the OpenCode plugin."
          }
        >
          <ui.TextInput
            label="API key"
            type="password"
            placeholder={apiKeyFromEnv() ? "From environment" : "sk-unsloth-..."}
            value={settings().apiKey}
            onInput={(value) => patch("apiKey", value)}
            onSubmit={() => void save()}
          />
        </ui.SettingsRow>

        <ui.SettingsRow
          id="connection.apiKeyEnv"
          title="API key environment variable"
          description="Used when the API key field is blank."
        >
          <ui.TextInput
            label="API key environment variable"
            value={settings().apiKeyEnv}
            onInput={(value) => patch("apiKeyEnv", value)}
            onSubmit={() => void save()}
          />
        </ui.SettingsRow>

        <ui.SettingsRow
          id="connection.test"
          title="Connection test"
          description="Check connectivity, authentication, and how many models Unsloth reports."
        >
          <ui.Button size="small" busy={busy()} onClick={() => void testConnection()}>
            Test connection
          </ui.Button>
        </ui.SettingsRow>
      </ui.SettingsSection>

      <ui.SettingsSection title="Models">
        <ui.SettingsRow
          id="models.detect"
          title="Detected models"
          description="Queried live from Unsloth's GET /v1/models endpoint."
        >
          <div>
            <ui.Button size="small" busy={busy()} onClick={() => void refreshModels()}>
              Refresh models
            </ui.Button>
            <span>{models().length ? `${models().length} found` : "None detected"}</span>
          </div>
        </ui.SettingsRow>

        <Show when={modelOptions().length > 0}>
          <ui.SettingsRow
            id="models.defaultModel"
            title="Default model"
            description="Select a model detected from Unsloth, or enter one manually below."
          >
            <ui.Select
              label="Default model"
              options={modelOptions()}
              value={settings().defaultModel || undefined}
              placeholder="Choose a model"
              onChange={(value) => patch("defaultModel", value)}
            />
          </ui.SettingsRow>
        </Show>

        <ui.SettingsRow
          id="models.manualModel"
          title="Default model ID (manual)"
          description="Takes precedence over the detected-model picker."
        >
          <ui.TextInput
            label="Default model ID"
            placeholder="unsloth/flux-3-image-klein-FP8"
            value={settings().defaultModel}
            onInput={(value) => patch("defaultModel", value)}
            onSubmit={() => void save()}
          />
        </ui.SettingsRow>
      </ui.SettingsSection>

      <ui.SettingsSection title="Generation defaults">
        <ui.SettingsRow
          id="generation.size"
          title="Default size"
          description="WIDTHxHEIGHT, 256–2048 pixels per side, multiples of 16."
        >
          <ui.TextInput
            label="Default size"
            invalid={!sizeValid()}
            value={settings().size}
            onInput={(value) => patch("size", value)}
            onSubmit={() => void save()}
          />
        </ui.SettingsRow>

        <ui.SettingsRow
          id="generation.steps"
          title="Default steps"
          description="Blank uses the model preset or Unsloth's default."
        >
          <ui.TextInput
            label="Default steps"
            value={numberText("steps")}
            onInput={(value) => setNumberText("steps", value)}
            onSubmit={() => void save()}
          />
        </ui.SettingsRow>

        <ui.SettingsRow
          id="generation.guidance"
          title="Default guidance"
          description="Blank uses the model preset or Unsloth's default."
        >
          <ui.TextInput
            label="Default guidance"
            value={numberText("guidance")}
            onInput={(value) => setNumberText("guidance", value)}
            onSubmit={() => void save()}
          />
        </ui.SettingsRow>

        <ui.SettingsRow
          id="generation.seed"
          title="Default seed"
          description="Blank lets Unsloth choose a random seed."
        >
          <ui.TextInput
            label="Default seed"
            value={numberText("seed")}
            onInput={(value) => setNumberText("seed", value)}
            onSubmit={() => void save()}
          />
        </ui.SettingsRow>
      </ui.SettingsSection>

      <ui.SettingsSection title="Output and security">
        <ui.SettingsRow
          id="output.outputDir"
          title="Output directory"
          description="Relative paths are resolved from the current OpenCode project directory."
        >
          <ui.TextInput
            label="Output directory"
            value={settings().outputDir}
            onInput={(value) => patch("outputDir", value)}
            onSubmit={() => void save()}
          />
        </ui.SettingsRow>

        <ui.SettingsRow
          id="security.allowPublicHosts"
          title="Allow public hosts"
          description="Only enable this if you intentionally expose Unsloth on a non-local network."
        >
          <ui.Switch
            label="Allow public hosts"
            hideLabel
            checked={settings().allowPublicHosts}
            onChange={(checked) => patch("allowPublicHosts", checked)}
          />
        </ui.SettingsRow>
      </ui.SettingsSection>
    </ui.SettingsLayout>
  )
}
