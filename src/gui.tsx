import { Plugin, SettingsPage } from "@opencode/plugin/gui"
import { definition } from "./gui/definition"
import { UnslothSettingsPage } from "./gui/page"

export default Plugin.define({
  ...definition,
  setup(ctx) {
    ctx.add(SettingsPage, {
      id: "unsloth-image",
      icon: "server",
      get title() {
        return ctx.t("title")
      },
      get entries() {
        return [
          { id: "connection.autoDetect", title: "Auto-detect Unsloth port", keywords: "unsloth port localhost" },
          { id: "connection.baseURL", title: "Base URL", keywords: "unsloth url desktop studio" },
          { id: "connection.apiKey", title: "API key", keywords: "unsloth auth token" },
          { id: "connection.apiKeyEnv", title: "API key environment variable", keywords: "unsloth env secret" },
          { id: "connection.test", title: "Connection test", keywords: "unsloth status" },
          { id: "models.detect", title: "Detected models", keywords: "unsloth models refresh" },
          { id: "models.defaultModel", title: "Default model", keywords: "unsloth model" },
          { id: "generation.size", title: "Default size", keywords: "unsloth image dimensions" },
          { id: "generation.steps", title: "Default steps", keywords: "unsloth diffusion" },
          { id: "generation.guidance", title: "Default guidance", keywords: "unsloth cfg" },
          { id: "generation.seed", title: "Default seed", keywords: "unsloth reproducibility" },
          { id: "output.outputDir", title: "Output directory", keywords: "unsloth images files" },
          { id: "security.allowPublicHosts", title: "Allow public hosts", keywords: "unsloth network security" },
        ]
      },
      render: () => <UnslothSettingsPage />,
    })
  },
})
