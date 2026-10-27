import { create } from 'zustand'
import type { ReportLanguage } from '../types'

export type Provider = 'anthropic' | 'openai-compatible'
export type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max'

export interface Settings {
  provider: Provider
  anthropicModel: string
  effort: Effort
  /** OpenAI-compatible local endpoint (e.g. Ollama / LM Studio serving MedGemma). */
  localBaseUrl: string
  localModel: string
  /** NotebookLM via an MCP server exposed over Streamable HTTP. */
  mcpEnabled: boolean
  mcpUrl: string
  mcpToolName: string
  notebookUrl: string
  reportLanguage: ReportLanguage
  maxKeyframes: number
  rememberKey: boolean
}

export const DEFAULT_SETTINGS: Settings = {
  provider: 'anthropic',
  anthropicModel: 'claude-opus-5-5',
  effort: 'high',
  localBaseUrl: 'http://localhost:11434/v1',
  localModel: 'medgemma',
  mcpEnabled: false,
  mcpUrl: 'http://localhost:8000/mcp',
  mcpToolName: 'ask_question',
  notebookUrl: '',
  reportLanguage: 'pt-PT',
  maxKeyframes: 12,
  rememberKey: false,
}

const SETTINGS_KEY = 'mskvlm.settings.v1'
const KEY_KEY = 'mskvlm.apikey.v1'

function safeGet(storage: Storage | undefined, key: string): string | null {
  try {
    return storage ? storage.getItem(key) : null
  } catch {
    return null
  }
}

function safeSet(storage: Storage | undefined, key: string, value: string | null) {
  try {
    if (!storage) return
    if (value === null) storage.removeItem(key)
    else storage.setItem(key, value)
  } catch {
    /* storage unavailable (private mode) — keep in memory only */
  }
}

const local = typeof window !== 'undefined' ? window.localStorage : undefined
const session = typeof window !== 'undefined' ? window.sessionStorage : undefined

function loadSettings(): Settings {
  const raw = safeGet(local, SETTINGS_KEY)
  if (!raw) return DEFAULT_SETTINGS
  try {
    return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<Settings>) }
  } catch {
    return DEFAULT_SETTINGS
  }
}

function loadKey(remember: boolean): string {
  return (remember ? safeGet(local, KEY_KEY) : safeGet(session, KEY_KEY)) ?? ''
}

interface SettingsState extends Settings {
  /** Never written to localStorage unless the user opts in with rememberKey. */
  apiKey: string
  update: (patch: Partial<Settings>) => void
  setApiKey: (key: string) => void
  reset: () => void
}

const initial = loadSettings()

export const useSettings = create<SettingsState>((set, get) => ({
  ...initial,
  apiKey: loadKey(initial.rememberKey),
  update: (patch) => {
    set(patch)
    const { apiKey: _k, update: _u, setApiKey: _s, reset: _r, ...rest } = get()
    safeSet(local, SETTINGS_KEY, JSON.stringify(rest))
    if ('rememberKey' in patch) persistKey(get().apiKey, get().rememberKey)
  },
  setApiKey: (key) => {
    set({ apiKey: key })
    persistKey(key, get().rememberKey)
  },
  reset: () => {
    safeSet(local, SETTINGS_KEY, null)
    safeSet(local, KEY_KEY, null)
    safeSet(session, KEY_KEY, null)
    set({ ...DEFAULT_SETTINGS, apiKey: '' })
  },
}))

function persistKey(key: string, remember: boolean) {
  if (remember) {
    safeSet(local, KEY_KEY, key || null)
    safeSet(session, KEY_KEY, null)
  } else {
    safeSet(session, KEY_KEY, key || null)
    safeSet(local, KEY_KEY, null)
  }
}

export function isVlmConfigured(s: Pick<SettingsState, 'provider' | 'apiKey' | 'localBaseUrl'>): boolean {
  return s.provider === 'anthropic' ? s.apiKey.trim().length > 0 : s.localBaseUrl.trim().length > 0
}
