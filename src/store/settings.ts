import { create } from 'zustand'
import type { ReportLanguage } from '../types'

export type Provider = 'anthropic' | 'openai-compatible' | 'browser'
export type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max'

/**
 * Which NotebookLM MCP server runs behind the local supergateway bridge:
 * - 'nlm-cli': PyPI notebooklm-mcp-cli (recommended; tools server_info / notebook_get / notebook_query)
 * - 'legacy':  npm notebooklm-mcp 2.x (archived; tool ask_question driving a Chrome window)
 */
export type McpServerKind = 'nlm-cli' | 'legacy'

/** Outcome of the last «Testar ligação» run, used by the connection pill in the app bar. */
export interface McpCheck {
  ok: boolean
  at: string
  summary: string
}

export interface Settings {
  provider: Provider
  /** True once the user picks a provider in Settings; until then the build default applies. */
  providerChosen: boolean
  anthropicModel: string
  effort: Effort
  /** OpenAI-compatible local endpoint (e.g. Ollama / LM Studio serving MedGemma). */
  localBaseUrl: string
  localModel: string
  /** In-browser model (WebGPU, Transformers.js) — experimental, triage only. */
  browserModel: string
  /** NotebookLM via a local MCP server bridged to Streamable HTTP by supergateway. */
  mcpEnabled: boolean
  mcpServerKind: McpServerKind
  /** Bridge origin; the MCP endpoint is <baseUrl>/mcp and the health check <baseUrl>/healthz. */
  mcpBaseUrl: string
  /**
   * Random key shared with the local bridge (supergateway, via SUPERGATEWAY_API_KEY). It only protects
   * the loopback port from other local processes; it is not a credential to a paid service.
   */
  mcpApiKey: string
  notebookUrl: string
  /** UUID parsed from notebookUrl (or typed directly). */
  notebookId: string
  mcpLastCheck?: McpCheck
  reportLanguage: ReportLanguage
  maxKeyframes: number
  rememberKey: boolean
  /** Local, unauthenticated identity used only to prefill the report validation dialog. */
  userDisplayName: string
  userLicence: string
}

export const DEFAULT_MCP_BASE_URL = 'http://127.0.0.1:8765'

// Build-time defaults (set by .devcontainer/devcontainer.json in GitHub Codespaces, where the
// app is served next to Ollama and reaches it through the same-origin /ollama proxy).
const env = import.meta.env

export const DEFAULT_SETTINGS: Settings = {
  // Built-in model by default (no key, no server); Codespaces/local builds set openai-compatible.
  provider: env.VITE_DEFAULT_PROVIDER === 'openai-compatible' || env.VITE_DEFAULT_PROVIDER === 'anthropic' ? env.VITE_DEFAULT_PROVIDER : 'browser',
  providerChosen: false,
  anthropicModel: 'claude-opus-5-5',
  effort: 'high',
  localBaseUrl: env.VITE_LOCAL_BASE_URL || 'http://localhost:11434/v1',
  localModel: env.VITE_LOCAL_MODEL || 'medgemma',
  browserModel: 'qwen3.5-0.8b',
  mcpEnabled: false,
  mcpServerKind: 'nlm-cli',
  mcpBaseUrl: DEFAULT_MCP_BASE_URL,
  mcpApiKey: '',
  notebookUrl: '',
  notebookId: '',
  reportLanguage: 'pt-PT',
  maxKeyframes: 12,
  rememberKey: false,
  userDisplayName: '',
  userLicence: '',
}

const SETTINGS_KEY = 'mskvlm.settings.v1'
const KEY_KEY = 'mskvlm.apikey.v1'

const NOTEBOOK_ID_RE = /notebook\/([0-9a-f-]{36})/i
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Extracts the notebook UUID from a NotebookLM URL, or accepts a bare UUID. */
export function parseNotebookId(input: string): string {
  const v = input.trim()
  const m = v.match(NOTEBOOK_ID_RE)
  if (m) return m[1].toLowerCase()
  return UUID_RE.test(v) ? v.toLowerCase() : ''
}

/** 32 random bytes as hex (64 characters). */
export function generateBridgeKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

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

type StoredSettings = Partial<Settings> & { mcpUrl?: string; mcpToolName?: string }

/** Maps settings saved by earlier versions (mcpUrl / mcpToolName) onto the current shape. */
function migrate(stored: StoredSettings): Partial<Settings> {
  const { mcpUrl, mcpToolName, ...rest } = stored
  const out: Partial<Settings> = { ...rest }
  if (!out.mcpBaseUrl && mcpUrl && mcpUrl !== 'http://localhost:8000/mcp') {
    try {
      out.mcpBaseUrl = new URL(mcpUrl).origin
    } catch {
      /* ignore an invalid legacy URL */
    }
  }
  if (!out.mcpServerKind && mcpToolName && mcpToolName !== 'ask_question') out.mcpServerKind = 'nlm-cli'
  if (out.notebookUrl && !out.notebookId) out.notebookId = parseNotebookId(out.notebookUrl)
  // Settings saved before providerChosen existed held the old default (Claude) or a localhost server that
  // can never work on a phone: move them once to the built-in default. A remembered Claude key is a choice.
  if (out.providerChosen === undefined) {
    const keptClaude = out.provider === 'anthropic' && !!safeGet(local, KEY_KEY)
    out.providerChosen = keptClaude
    if (!keptClaude) out.provider = DEFAULT_SETTINGS.provider
  }
  return out
}

function persistSettings(s: Settings) {
  safeSet(local, SETTINGS_KEY, JSON.stringify(s))
}

function loadSettings(): Settings {
  const raw = safeGet(local, SETTINGS_KEY)
  let loaded: Settings = DEFAULT_SETTINGS
  if (raw) {
    try {
      const stored = JSON.parse(raw) as StoredSettings
      loaded = { ...DEFAULT_SETTINGS, ...migrate(stored) }
      if (stored.providerChosen === undefined) persistSettings(loaded)
    } catch {
      loaded = DEFAULT_SETTINGS
    }
  }
  if (!loaded.mcpApiKey) {
    // Generated once on first load and kept so the bridge command the user copied keeps working.
    loaded = { ...loaded, mcpApiKey: generateBridgeKey() }
    persistSettings(loaded)
  }
  return loaded
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

function pickSettings(s: SettingsState): Settings {
  const { apiKey: _k, update: _u, setApiKey: _s, reset: _r, ...rest } = s
  return rest
}

export const useSettings = create<SettingsState>((set, get) => ({
  ...initial,
  apiKey: loadKey(initial.rememberKey),
  update: (patch) => {
    set(patch)
    persistSettings(pickSettings(get()))
    if ('rememberKey' in patch) persistKey(get().apiKey, get().rememberKey)
  },
  setApiKey: (key) => {
    set({ apiKey: key })
    persistKey(key, get().rememberKey)
  },
  reset: () => {
    safeSet(local, KEY_KEY, null)
    safeSet(session, KEY_KEY, null)
    const fresh: Settings = { ...DEFAULT_SETTINGS, mcpApiKey: generateBridgeKey() }
    persistSettings(fresh)
    set({ ...fresh, mcpLastCheck: undefined, apiKey: '' })
  },
}))

// Storage is per origin, not per path: on https://<user>.github.io/<repo>/ every Pages site of the same
// account can read this key and the settings (bridge key included), and the --cors /
// OLLAMA_ORIGINS grants cover them too. Serve the app from its own origin (custom domain, or a
// dedicated account/organisation) when other Pages sites of that account are not equally trusted.
function persistKey(key: string, remember: boolean) {
  if (remember) {
    safeSet(local, KEY_KEY, key || null)
    safeSet(session, KEY_KEY, null)
  } else {
    safeSet(session, KEY_KEY, key || null)
    safeSet(local, KEY_KEY, null)
  }
}

export function hasWebGpu(): boolean {
  return typeof navigator !== 'undefined' && 'gpu' in navigator
}

export function isVlmConfigured(s: Pick<SettingsState, 'provider' | 'apiKey' | 'localBaseUrl'>): boolean {
  if (s.provider === 'anthropic') return s.apiKey.trim().length > 0
  if (s.provider === 'browser') return hasWebGpu()
  return s.localBaseUrl.trim().length > 0
}

/** True when NotebookLM is switched on and has what it needs to be queried. */
export function isNotebookConfigured(s: Pick<Settings, 'mcpEnabled' | 'mcpServerKind' | 'mcpBaseUrl' | 'mcpApiKey' | 'notebookId' | 'notebookUrl'>): boolean {
  if (!s.mcpEnabled || !s.mcpBaseUrl.trim() || !s.mcpApiKey) return false
  return s.mcpServerKind === 'legacy' ? s.notebookUrl.trim().length > 0 : s.notebookId.length > 0
}
