# Unsloth Image Plugin for OpenCode

Generate images from OpenCode chat using image models running locally in [Unsloth Studio](https://unsloth.ai/docs/basics/diffusion-image) or Unsloth Desktop. Prompts and images stay on your machine; the only key involved is Unsloth's **local** API key, not a cloud provider key.

## Prerequisites

1. **Install / update Unsloth**:

   - macOS / Linux / WSL: `curl -fsSL https://unsloth.ai/install.sh | sh`
   - Windows PowerShell: `irm https://unsloth.ai/install.ps1 | iex`
   - Or download Unsloth Desktop from <https://unsloth.ai/download>

2. **Start Unsloth** with the API enabled:

   ```bash
   unsloth studio -H 0.0.0.0 -p 8888
   ```

   Open <http://localhost:8888>. Unsloth Desktop normally uses the same local API on port 8888; the plugin also probes port 8000.

3. **Create a local API key** in Unsloth: **Settings → API → Create**. Copy the `sk-unsloth-…` value.

4. **Load an image model** in the **Images** page (for example FLUX.3 Image Klein or Qwen-Image-2.1-Turbo). Alternatively enable **Switch image and video model by request** in **Settings → API** so the tool's `model` argument selects the model automatically.

5. **Provide the key** using one of:

   ```powershell
   $env:UNSLOTH_API_KEY = "sk-unsloth-..."
   ```

   ```bash
   export UNSLOTH_API_KEY="sk-unsloth-..."
   ```

   Or enter it in the OpenCode Desktop **Unsloth Image** settings tab.

## Installation

### Windows

Run the packaged installer:

```powershell
.\unsloth-image-installer.exe
```

It installs to `%USERPROFILE%\.config\opencode\plugins\unsloth-image`. Use `--system` to install machine-wide under `%ProgramData%\opencode\plugins`, or `--dir PATH` for a custom location. See [`installers/README.md`](installers/README.md) for all options and uninstall instructions.

### Ubuntu / Debian

```bash
sudo apt install ./opencode-unsloth-image_1.1.0_all.deb
```

The package installs to `/etc/opencode/plugins/unsloth-image`, which OpenCode loads for every user on the machine. Remove with `sudo apt remove opencode-unsloth-image`.

### Manual installation

The plugin can also live at `.opencode/plugins/unsloth-image/` in a project and is auto-discovered by OpenCode. To load an explicit local path, add to `opencode.jsonc`:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": ["./plugins/unsloth-image"]
}
```

Reload OpenCode with `/reload` after editing config.

## Desktop Settings tab

OpenCode Desktop shows a dedicated **Unsloth Image** tab under **Settings**. It is built with the experimental GUI plugin API, so it requires Desktop; the terminal UI keeps using config options and environment variables.

The tab includes:

- **Auto-detect Unsloth port** — probes `http://localhost:8888` and `http://localhost:8000`
- **Base URL** — manual override when auto-detection is off
- **API key** — password field; leave blank to keep the current key
- **API key environment variable** — defaults to `UNSLOTH_API_KEY`
- **Test connection** — checks connectivity, auth, and reported models
- **Refresh models** — calls `GET /v1/models` and populates the detected-model picker
- **Default model** — select a detected model or type an ID manually
- **Default size / steps / guidance / seed**
- **Output directory**
- **Allow public hosts**

Settings are persisted with OpenCode's plugin storage. The API key is **not** written to `opencode.jsonc`; a blank key in the UI means “keep the stored/environment value”. Use the environment variable when you prefer the key to live only in the process environment.

The tab only appears when the server part of the plugin loaded successfully. Restart Desktop if you installed or updated the plugin while it was running.

## Configuration via `opencode.jsonc` (optional)

```jsonc
{
  "plugins": [
    {
      "package": "./plugins/unsloth-image",
      "options": {
        "baseURL": "http://localhost:8888",
        "autoDetectBaseURL": true,
        "apiKey": "{env:UNSLOTH_API_KEY}",
        "defaultModel": "unsloth/flux-3-image-klein-FP8",
        "size": "1024x1024",
        "outputDir": "./generated-images"
      }
    }
  ]
}
```

| Option | Default | Description |
|--------|---------|-------------|
| `baseURL` | blank | Manual Unsloth API base URL; blank enables probing |
| `autoDetectBaseURL` | `true` | Probe localhost ports 8888 and 8000 |
| `apiKey` | `process.env.UNSLOTH_API_KEY` | Local `sk-unsloth-…` key |
| `apiKeyEnv` | `UNSLOTH_API_KEY` | Env var name to read when `apiKey` is blank |
| `defaultModel` | `unsloth/flux-3-image-klein-FP8` | Model used when none is passed |
| `size` | `1024x1024` | Default `WIDTHxHEIGHT` (256–2048, multiples of 16) |
| `steps` | model preset | Override inference steps |
| `guidance` | model preset | Override guidance scale |
| `seed` | random | Override seed |
| `outputDir` | `.opencode/generated-images` | Where images are saved (relative to project) |
| `allowPublicHosts` | `false` | Allow non-local base URLs (use with care) |

Per-call tool arguments override saved settings; saved settings override config options; config options override model presets.

## Tools

| Tool | Purpose |
|------|---------|
| `unslothimage.generate` | Generate an image from a prompt using a local Unsloth model |
| `unslothimage.models` | List models available from the Unsloth API, with loaded status |
| `unslothimage.status` | Check connectivity, auth, detected base URL, default model/size, and output directory |

### Model presets

The plugin applies Unsloth's documented defaults automatically when a model is selected:

| Model (match on ID) | Steps | Guidance |
|---------------------|-------|----------|
| FLUX.3 Image Klein Base | 50 | 3.5 |
| FLUX.3 Image Klein | 16 | 1 |
| MiniMax-H3-Image | 6 | 0 |
| Qwen-Image-2.1-Turbo | 8 | 1 |
| Qwen-Image-2.1 | 25 | 1 |
| MOSS-Image | 25 | 2.5 |

Explicit `steps` / `guidance` arguments and saved settings override these presets.

## Usage

In OpenCode chat, just ask:

> Generate a lighthouse on a coastal cliff at golden hour using the local Unsloth model.

Or be specific:

> Use `unslothimage.generate` with model `Qwen-Image-2.1-Turbo`, size `1024x1024`, and the prompt "a neon ramen shop in rainy Tokyo".

The image is saved under `outputDir` and returned as a `Tool.FileContent` result with a local `file://` URI. That is the supported OpenCode tool-result shape. OpenCode Desktop 2.3.2 renders it as a file attachment/path rather than a true inline `<img>` preview because the GUI plugin API does not yet expose a tool-result renderer; the image can still be opened immediately from the returned path. Press Ctrl+C while generating to cancel the request.

## Troubleshooting

- **`Reachable: no` from `unslothimage.status`** — start Unsloth (`unsloth studio -p 8888`) and confirm <http://localhost:8888> opens.
- **`401 Unauthorized`** — create/recreate a key in **Settings → API** and set `UNSLOTH_API_KEY` or the settings field.
- **`Unsloth returned no image data`** — load an image model in the **Images** page first, or enable request-based model switching.
- **Size errors** — use dimensions between 256 and 2048 that are multiples of 16.
- **Non-local host refused** — set `allowPublicHosts: true` only if you intentionally expose Unsloth over a network, and protect it with a strong API key.
- **No Unsloth Image settings tab** — use OpenCode Desktop, make sure the server plugin loaded, and restart Desktop. The tab is not available in the terminal UI.

## Development

```bash
npm install
npm run build:all       # GUI bundle + Windows .exe + Ubuntu .deb
npm run build:gui       # GUI bundle only
npm run build:installers
npx tsc --noEmit
```

Installer details are in [`installers/README.md`](installers/README.md).
