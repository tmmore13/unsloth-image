#!/usr/bin/env node
/*
 * Entry point embedded into the Windows single-executable installer.
 * Only Node built-ins and embedded SEA assets are available here.
 */
const fs = require("node:fs")
const path = require("node:path")
const os = require("node:os")
const sea = require("node:sea")

const PREFIX = "payload/"

function fail(message) {
  console.error(`Unsloth Image installer: ${message}`)
  process.exitCode = 1
}

function asset(name, encoding) {
  return sea.getAsset(PREFIX + name, encoding)
}

function parseArgs(argv) {
  const args = {
    help: false,
    uninstall: false,
    system: false,
    dir: undefined,
  }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === "--help" || arg === "-h") args.help = true
    else if (arg === "--uninstall") args.uninstall = true
    else if (arg === "--system") args.system = true
    else if (arg === "--dir" || arg.startsWith("--dir=")) {
      const value = arg === "--dir" ? argv[++i] : arg.slice("--dir=".length)
      if (!value) throw new Error("--dir requires a path")
      args.dir = value
    } else {
      throw new Error(`Unknown argument: ${arg}`)
    }
  }
  return args
}

function targetDirectory(args) {
  if (args.dir) return path.resolve(args.dir)
  if (process.env.OPENCODE_UNSLOTH_INSTALL_DIR) {
    return path.resolve(process.env.OPENCODE_UNSLOTH_INSTALL_DIR)
  }
  if (args.system || process.env.OPENCODE_UNSLOTH_SYSTEM === "1") {
    const programData = process.env.ProgramData || "C:\\ProgramData"
    return path.join(programData, "opencode", "plugins", "unsloth-image")
  }
  return path.join(os.homedir(), ".config", "opencode", "plugins", "unsloth-image")
}

function printHelp(target) {
  console.log(`Unsloth Image plugin installer

Usage:
  unsloth-image-installer.exe [options]

Options:
  --dir PATH    Install into PATH instead of the default OpenCode plugin folder.
  --system      Install machine-wide under %ProgramData%\\opencode\\plugins.
  --uninstall   Remove the installed plugin folder.
  -h, --help    Show this help.

Default target: ${target}

Environment:
  OPENCODE_UNSLOTH_INSTALL_DIR   Override the default target.
  OPENCODE_UNSLOTH_SYSTEM=1      Equivalent to --system.

After installing, set UNSLOTH_API_KEY (or use the Desktop Settings tab), start
Unsloth Studio/Desktop with an image model loaded, then restart OpenCode.`)
}

function backupExisting(target) {
  if (!fs.existsSync(target)) return undefined
  const stamp = new Date().toISOString().replace(/[:.]/g, "-")
  const backup = `${target}.backup-${stamp}`
  try {
    fs.renameSync(target, backup)
    return backup
  } catch {
    return undefined
  }
}

function install(target, manifest) {
  fs.mkdirSync(path.dirname(target), { recursive: true })
  const backup = backupExisting(target)
  fs.mkdirSync(target, { recursive: true })

  const root = path.resolve(target) + path.sep
  for (const file of manifest.files) {
    const relative = String(file).replace(/\\/g, "/")
    const destination = path.resolve(target, relative)
    if (!destination.startsWith(root)) {
      throw new Error(`Refusing to write outside install directory: ${relative}`)
    }
    fs.mkdirSync(path.dirname(destination), { recursive: true })
    fs.writeFileSync(destination, Buffer.from(asset(relative)))
  }

  console.log(`Installed Unsloth Image ${manifest.version} to:`)
  console.log(`  ${target}`)
  if (backup) {
    console.log(`Previous installation backed up to:`)
    console.log(`  ${backup}`)
  }
  console.log("")
  console.log("Next steps:")
  console.log("  1. Set UNSLOTH_API_KEY, or open OpenCode Desktop Settings -> Unsloth Image.")
  console.log("  2. Start Unsloth Studio/Desktop with an image model loaded.")
  console.log("  3. Restart OpenCode (or run /reload) and ask it to generate an image.")
}

function uninstall(target) {
  if (!fs.existsSync(target)) {
    console.log(`Nothing to uninstall at ${target}`)
    return
  }
  fs.rmSync(target, { recursive: true, force: true })
  console.log(`Removed Unsloth Image plugin from:`)
  console.log(`  ${target}`)
  console.log("Restart OpenCode to unload it.")
}

function main() {
  if (!sea.isSea()) {
    fail("Run the packaged .exe; this script cannot read embedded assets here.")
    return
  }

  let args
  try {
    args = parseArgs(process.argv.slice(2))
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error))
    return
  }

  const target = targetDirectory(args)
  if (args.help) {
    printHelp(target)
    return
  }

  const manifest = JSON.parse(asset("manifest.json", "utf8"))
  if (args.uninstall) {
    uninstall(target)
    return
  }

  install(target, manifest)
}

try {
  main()
} catch (error) {
  fail(error instanceof Error ? error.stack || error.message : String(error))
}
