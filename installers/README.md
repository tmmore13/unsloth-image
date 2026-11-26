# Unsloth Image plugin installers

This directory builds the distributable installers for the OpenCode Unsloth Image plugin.

## Artifacts

Built files are written to `installers/dist/`:

| File | Platform | Install location |
|------|----------|------------------|
| `unsloth-image-installer.exe` | Windows | `%USERPROFILE%\.config\opencode\plugins\unsloth-image` |
| `opencode-unsloth-image_1.1.0_all.deb` | Ubuntu / Debian | `/etc/opencode/plugins/unsloth-image` |
| `SHA256SUMS` | All | Checksums for the two artifacts |

The installers contain only the plugin source and the prebuilt GUI bundle. No API key, prompt, image, or generated data is embedded.

## Windows

Run the executable:

```powershell
.\unsloth-image-installer.exe
```

Options:

```text
--dir PATH    Install into a custom directory.
--system      Install machine-wide under %ProgramData%\opencode\plugins.
--uninstall   Remove the installed plugin folder.
-h, --help    Show help.
```

Environment overrides:

```powershell
$env:OPENCODE_UNSLOTH_INSTALL_DIR = "C:\path\to\plugins\unsloth-image"
$env:OPENCODE_UNSLOTH_SYSTEM = "1"  # equivalent to --system
```

If a previous installation exists, it is renamed to `<target>.backup-<timestamp>` before the new files are written.

After installing:

1. Set `UNSLOTH_API_KEY`, or open **OpenCode Desktop → Settings → Unsloth Image** and enter the key.
2. Start Unsloth Studio/Desktop with an image model loaded.
3. Restart OpenCode (or run `/reload`).

To uninstall:

```powershell
.\unsloth-image-installer.exe --uninstall
```

## Ubuntu / Debian

```bash
sudo apt install ./opencode-unsloth-image_1.1.0_all.deb
```

The package installs into OpenCode's system config directory, so it is available to every user machine-wide. OpenCode reads `/etc/opencode/plugins/` for all users.

After installing, set `UNSLOTH_API_KEY` or use the Desktop Settings tab, start Unsloth, and restart OpenCode.

To remove:

```bash
sudo apt remove opencode-unsloth-image
```

## Rebuilding

From the plugin directory:

```bash
npm install
npm run build:all
```

`build:all` builds the GUI bundle first, then both installers. You can run `npm run build:installers` by itself when the GUI bundle is already current.

The Windows `.exe` is a Node.js single-executable application generated with `node --build-sea`. It must be built with Node.js 26 or newer on Windows because it embeds the local `node.exe` binary. The `.deb` is architecture-independent (`all`) and is assembled directly, so it can be built on any platform.

Verify artifacts with:

```powershell
Get-FileHash .\installers\dist\*.exe -Algorithm SHA256
Get-FileHash .\installers\dist\*.deb -Algorithm SHA256
```

or on Linux:

```bash
cd installers/dist
sha256sum -c SHA256SUMS
```
