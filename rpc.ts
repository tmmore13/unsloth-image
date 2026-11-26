import { Rpc } from "@opencode/plugin/rpc"
import type { UnslothModel, UnslothSettings, UnslothSettingsView } from "./settings"

export type ModelListResult = {
  ok: boolean
  baseURL: string
  models: UnslothModel[]
  error?: string
}

export type TestConnectionResult = {
  ok: boolean
  baseURL: string
  modelCount: number
  auth: string
  message: string
}

const settingsProperties = {
  baseURL: { type: "string" },
  autoDetectBaseURL: { type: "boolean" },
  apiKey: { type: "string" },
  apiKeyEnv: { type: "string" },
  defaultModel: { type: "string" },
  size: { type: "string" },
  steps: { type: "number" },
  guidance: { type: "number" },
  seed: { type: "number" },
  outputDir: { type: "string" },
  allowPublicHosts: { type: "boolean" },
} as const

const settingsViewProperties = {
  ...settingsProperties,
  apiKeyFromEnv: { type: "boolean" },
} as const

const emptyInput = {
  type: "object",
  properties: {},
  additionalProperties: false,
} as const

const modelSchema = {
  type: "object",
  properties: {
    id: { type: "string" },
    loaded: { type: "boolean" },
  },
  required: ["id"],
  additionalProperties: false,
} as const

export const Unsloth = Rpc.define({
  id: "unsloth-image",
  methods: {
    getSettings: {
      input: emptyInput,
      output: {
        type: "object",
        properties: settingsViewProperties,
        required: [
          "baseURL",
          "autoDetectBaseURL",
          "apiKey",
          "apiKeyEnv",
          "defaultModel",
          "size",
          "outputDir",
          "allowPublicHosts",
          "apiKeyFromEnv",
        ],
        additionalProperties: false,
      },
    },
    setSettings: {
      input: {
        type: "object",
        properties: settingsProperties,
        additionalProperties: false,
      },
      output: {
        type: "object",
        properties: settingsViewProperties,
        required: [
          "baseURL",
          "autoDetectBaseURL",
          "apiKey",
          "apiKeyEnv",
          "defaultModel",
          "size",
          "outputDir",
          "allowPublicHosts",
          "apiKeyFromEnv",
        ],
        additionalProperties: false,
      },
    },
    listModels: {
      input: emptyInput,
      output: {
        type: "object",
        properties: {
          ok: { type: "boolean" },
          baseURL: { type: "string" },
          models: { type: "array", items: modelSchema },
          error: { type: "string" },
        },
        required: ["ok", "baseURL", "models"],
        additionalProperties: false,
      },
    },
    testConnection: {
      input: emptyInput,
      output: {
        type: "object",
        properties: {
          ok: { type: "boolean" },
          baseURL: { type: "string" },
          modelCount: { type: "number" },
          auth: { type: "string" },
          message: { type: "string" },
        },
        required: ["ok", "baseURL", "modelCount", "auth", "message"],
        additionalProperties: false,
      },
    },
  },
  events: {},
} as const)

export type { UnslothModel, UnslothSettings, UnslothSettingsView }
