// Browser MCP client for a NotebookLM MCP server that runs on the user's computer behind
// supergateway (stdio → Streamable HTTP, stateful, CORS allowlist, bearer key).
// The MCP SDK is imported lazily so it is only fetched when NotebookLM is actually used.
//
// Two server kinds are supported (see Definições → NotebookLM):
// - 'nlm-cli' — PyPI notebooklm-mcp-cli: server_info, notebook_get, notebook_query(_start/_status)
// - 'legacy'  — npm notebooklm-mcp 2.x: get_health, ask_question (source_format "json")

import type { Client } from '@modelcontextprotocol/sdk/client/index.js'
import type { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'

export type McpServerKind = 'nlm-cli' | 'legacy'

export interface NotebookCfg {
  kind: McpServerKind
  /** Bridge origin, e.g. http://127.0.0.1:8765 (MCP endpoint at /mcp, health at /healthz). */
  baseUrl: string
  apiKey: string
  /** NotebookLM notebook UUID (nlm-cli). */
  notebookId: string
  /** Full notebook URL (legacy server). */
  notebookUrl: string
}

/** The settings store shape is accepted as-is, so callers can pass useSettings.getState(). */
export interface NotebookSettingsLike {
  mcpServerKind: McpServerKind
  mcpBaseUrl: string
  mcpApiKey: string
  notebookId: string
  notebookUrl: string
}

export type NotebookCfgInput = NotebookCfg | NotebookSettingsLike

export function toNotebookCfg(input: NotebookCfgInput): NotebookCfg {
  if ('kind' in input) return input
  return {
    kind: input.mcpServerKind,
    baseUrl: input.mcpBaseUrl,
    apiKey: input.mcpApiKey,
    notebookId: input.notebookId,
    notebookUrl: input.notebookUrl || (input.notebookId ? `https://notebooklm.google.com/notebook/${input.notebookId}` : ''),
  }
}

export interface McpToolInfo {
  name: string
  description?: string
  inputSchema?: unknown
}

export interface McpSession {
  tools: McpToolInfo[]
  serverName?: string
  serverVersion?: string
  /** Calls a tool and returns its joined text content (throws on isError). */
  callText: (tool: string, args: Record<string, unknown>, timeoutMs?: number) => Promise<string>
  /** Calls a tool and returns its parsed JSON payload (structuredContent or JSON text). */
  callJson: (tool: string, args: Record<string, unknown>, timeoutMs?: number, resetOnProgress?: boolean) => Promise<unknown>
  /** Mcp-Session-Id assigned by the gateway (stateful mode). */
  sessionId: () => string | undefined
  close: () => Promise<void>
}

/** Error with a stable code so the UI can show the matching troubleshooting hint. */
export type McpErrorCode =
  | 'unsupported-browser'
  | 'no-connection'
  | 'origin'
  | 'invalid-key'
  | 'session-expired'
  | 'google-session'
  | 'quota'
  | 'unknown-tool'
  | 'notebook'
  | 'timeout'
  | 'config'
  | 'server'

export class NotebookError extends Error {
  code: McpErrorCode
  hint?: string
  constructor(code: McpErrorCode, message: string, hint?: string) {
    super(message)
    this.name = 'NotebookError'
    this.code = code
    this.hint = hint
  }
}

const TIMEOUTS = {
  health: 3_000,
  connect: 30_000,
  info: 30_000,
  query: 150_000,
  queryServerSec: 120,
  pollEvery: 3_000,
  pollCap: 180_000,
  legacyAsk: 300_000,
}

/** Safari (incl. iOS browsers, which all use WebKit) blocks http://127.0.0.1 from https pages. */
export function isSafariBrowser(ua: string = typeof navigator !== 'undefined' ? navigator.userAgent : ''): boolean {
  if (/iPhone|iPad|iPod/i.test(ua)) return true
  return /Safari\//.test(ua) && !/(Chrome|Chromium|CriOS|Edg|EdgiOS|OPR|FxiOS|Firefox|SamsungBrowser)\//.test(ua)
}

function endpoint(baseUrl: string, path: string): URL {
  let base: URL
  try {
    base = new URL(baseUrl)
  } catch {
    throw new NotebookError('config', `Endereço da ponte inválido: «${baseUrl}».`)
  }
  return new URL(path, base.origin)
}

/** GET <baseUrl>/healthz with a 3 s timeout. Resolves true on HTTP 2xx. */
export async function pingGateway(baseUrl: string, timeoutMs = TIMEOUTS.health): Promise<boolean> {
  const url = endpoint(baseUrl, '/healthz')
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(timeoutMs), cache: 'no-store' })
    return r.ok
  } catch {
    return false
  }
}

function errText(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

/** Maps transport / JSON-RPC / tool errors onto a NotebookError with a stable code. */
export function classifyMcpError(e: unknown, stage: 'connect' | 'call' = 'call'): NotebookError {
  if (e instanceof NotebookError) return e
  const msg = errText(e)
  const code = (e as { code?: unknown })?.code
  const name = (e as { name?: unknown })?.name
  if (code === 401 || /\b401\b|unauthori[sz]ed|invalid api key/i.test(msg))
    return new NotebookError('invalid-key', 'A ponte recusou a chave (401).', 'Chave inválida: copie de novo o comando e reinicie a ponte.')
  if (code === 404 || /\b404\b/.test(msg))
    return new NotebookError('session-expired', 'Sessão MCP expirada ou ponte reiniciada (404).', 'Volte a testar a ligação.')
  if (code === -32602 || /unknown tool/i.test(msg))
    return new NotebookError('unknown-tool', 'A ponte não expõe a ferramenta pedida.', 'Atualize o comando da ponte (copie-o de novo nesta página).')
  if (code === -32001 || /timed? ?out|timeout/i.test(msg) || name === 'TimeoutError')
    return new NotebookError('timeout', 'O NotebookLM demorou demasiado a responder.', 'Cadernos com muitas fontes são mais lentos. Tente de novo.')
  if (/quota|rate.?limit|\b429\b|usage limit|limite/i.test(msg))
    return new NotebookError('quota', 'Limite de utilização do NotebookLM atingido.', 'Tente mais tarde ou consulte «nlm usage».')
  if (/auth|login|cookie|expired|sign.?in/i.test(msg))
    return new NotebookError('google-session', 'Sessão Google expirada ou inexistente.', 'Execute «nlm login» no terminal e volte a testar.')
  if (e instanceof TypeError || /failed to fetch|networkerror|load failed|cors/i.test(msg))
    return stage === 'connect'
      ? new NotebookError('origin', 'O navegador bloqueou o pedido MCP (CORS).', 'Origem não autorizada: o endereço da app mudou ou a ponte foi iniciada com outro comando. Copie de novo o comando.')
      : new NotebookError('no-connection', 'Sem ligação à ponte local.', 'Verifique se o terminal com a ponte está aberto e se permitiu o acesso à rede local.')
  return new NotebookError('server', msg || 'Erro desconhecido do servidor MCP.')
}

type ToolPayload = Record<string, unknown>

/** Normalises a tools/call result: legacy {success,data} envelopes and nlm-cli {status:"error"} dicts. */
export function parseToolResult(res: unknown): unknown {
  const r = res as { content?: { type: string; text?: string }[]; structuredContent?: unknown; isError?: boolean }
  const text = (r.content ?? [])
    .filter((c) => c.type === 'text' && typeof c.text === 'string')
    .map((c) => c.text)
    .join('\n')
  if (r.isError) throw classifyMcpError(new Error(text || 'A ferramenta MCP devolveu um erro.'))
  let data: unknown = r.structuredContent
  if (data === undefined || data === null) {
    try {
      data = text ? JSON.parse(text) : {}
    } catch {
      return text
    }
  }
  // FastMCP wraps non-dict returns as {result: ...}
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    const d = data as ToolPayload
    if ('success' in d) {
      if (!d.success) throw classifyMcpError(new Error(String(d.error ?? 'Erro do servidor NotebookLM.')))
      return d.data ?? {}
    }
    if (d.status === 'error') {
      const err = classifyMcpError(new Error(String(d.error ?? 'Erro do servidor NotebookLM.')))
      if (typeof d.hint === 'string' && !err.hint) err.hint = d.hint
      throw err
    }
  }
  return data
}

/** Opens an MCP session. Accepts a full endpoint URL (no auth) or a NotebookLM bridge config. */
export async function connectMcp(target: string | NotebookCfgInput, timeoutMs = TIMEOUTS.connect): Promise<McpSession> {
  const [{ Client: ClientCtor }, { StreamableHTTPClientTransport: Transport }] = await Promise.all([
    import('@modelcontextprotocol/sdk/client/index.js'),
    import('@modelcontextprotocol/sdk/client/streamableHttp.js'),
  ])
  let url: URL
  let headers: Record<string, string> = {}
  if (typeof target === 'string') {
    try {
      url = new URL(target)
    } catch {
      throw new NotebookError('config', 'URL do endpoint MCP inválido.')
    }
  } else {
    const cfg = toNotebookCfg(target)
    url = endpoint(cfg.baseUrl, '/mcp')
    if (cfg.apiKey) headers = { Authorization: `Bearer ${cfg.apiKey}` }
  }
  const client: Client = new ClientCtor({ name: 'msk-vlm-webapp', version: '0.2.0' })
  const transport: StreamableHTTPClientTransport = new Transport(url, { requestInit: { headers } })
  try {
    await client.connect(transport, { timeout: timeoutMs })
  } catch (e) {
    await client.close().catch(() => undefined)
    throw classifyMcpError(e, 'connect')
  }
  let tools: McpToolInfo[] = []
  try {
    const listed = await client.listTools(undefined, { timeout: timeoutMs })
    tools = listed.tools.map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema }))
  } catch {
    /* some gateways restrict tools/list; tool calls still work */
  }
  const info = client.getServerVersion()
  const call = async (tool: string, args: Record<string, unknown>, timeout: number, resetOnProgress: boolean) => {
    try {
      return await client.callTool({ name: tool, arguments: args }, undefined, { timeout, resetTimeoutOnProgress: resetOnProgress })
    } catch (e) {
      // Keep the raw transport error (with its HTTP code) so the caller can reconnect on 404.
      if ((e as { code?: unknown })?.code === 404) throw e
      throw classifyMcpError(e)
    }
  }
  return {
    tools,
    serverName: info?.name,
    serverVersion: info?.version,
    callText: async (tool, args, t = 120_000) => {
      const res = await call(tool, args, t, true)
      const content = (res as { content?: { type: string; text?: string }[] }).content ?? []
      const text = content
        .filter((c) => c.type === 'text' && c.text)
        .map((c) => c.text)
        .join('\n')
      if ((res as { isError?: boolean }).isError) throw classifyMcpError(new Error(text || 'A ferramenta MCP devolveu um erro.'))
      return text
    },
    callJson: async (tool, args, t = 60_000, resetOnProgress = false) => parseToolResult(await call(tool, args, t, resetOnProgress)),
    sessionId: () => transport.sessionId,
    close: async () => {
      await transport.terminateSession().catch(() => undefined)
      await client.close().catch(() => undefined)
    },
  }
}

// ---------------------------------------------------------------------------
// Cached session (one per bridge + key), reconnect-once on 404, one call at a time.

let cached: { key: string; session: Promise<McpSession>; cfg: NotebookCfg; resolved?: McpSession } | null = null
let queue: Promise<unknown> = Promise.resolve()

function sessionKey(cfg: NotebookCfg) {
  return `${cfg.kind}|${cfg.baseUrl}|${cfg.apiKey}`
}

function getSession(cfg: NotebookCfg): Promise<McpSession> {
  const key = sessionKey(cfg)
  if (cached && cached.key === key) return cached.session
  if (cached) void cached.session.then((s) => s.close()).catch(() => undefined)
  const session = connectMcp(cfg)
  const entry: NonNullable<typeof cached> = { key, session, cfg }
  cached = entry
  session.then(
    (s) => {
      entry.resolved = s
    },
    () => {
      if (cached === entry) cached = null
    },
  )
  return session
}

/** Closes the cached session (e.g. after the settings changed). */
export async function resetMcpSession(): Promise<void> {
  const c = cached
  cached = null
  if (c) await c.session.then((s) => s.close()).catch(() => undefined)
}

function isStreamable404(e: unknown): boolean {
  return (e as { code?: unknown })?.code === 404 && (e as { name?: unknown })?.name !== 'NotebookError'
}

async function callTool(cfg: NotebookCfg, name: string, args: Record<string, unknown>, timeout: number, resetOnProgress = false): Promise<unknown> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const s = await getSession(cfg)
    try {
      return await s.callJson(name, args, timeout, resetOnProgress)
    } catch (e) {
      if (attempt === 0 && isStreamable404(e)) {
        // Session expired or the bridge restarted: SDK 1.32 does not re-initialise by itself.
        await resetMcpSession()
        continue
      }
      throw classifyMcpError(e)
    }
  }
  throw new NotebookError('session-expired', 'Não foi possível restabelecer a sessão MCP.')
}

function serial<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(fn, fn)
  queue = run.catch(() => undefined)
  return run
}

if (typeof window !== 'undefined') {
  // Best effort: end the gateway session (its --sessionTimeout reaps anything missed).
  window.addEventListener('pagehide', () => {
    const c = cached
    const sid = c?.resolved?.sessionId()
    if (!c || !sid) return
    try {
      const url = endpoint(c.cfg.baseUrl, '/mcp')
      void fetch(url, { method: 'DELETE', keepalive: true, headers: { 'Mcp-Session-Id': sid, Authorization: `Bearer ${c.cfg.apiKey}` } }).catch(() => undefined)
    } catch {
      /* invalid base URL — nothing to clean up */
    }
  })
}

// ---------------------------------------------------------------------------
// nlm-cli helpers

export interface ServerInfo {
  version?: string
  authStatus?: 'configured' | 'stale' | 'unverified' | 'not_configured' | 'error' | string
  updateAvailable?: boolean
  updateCommand?: string
  raw: unknown
}

export interface NotebookInfo {
  id: string
  title: string
  sourceCount: number
  sources: Map<string, string>
}

export async function getServerInfo(input: NotebookCfgInput): Promise<ServerInfo> {
  const cfg = toNotebookCfg(input)
  const d = (await serial(() => callTool(cfg, 'server_info', {}, TIMEOUTS.info))) as ToolPayload
  return {
    version: typeof d.version === 'string' ? d.version : undefined,
    authStatus: typeof d.auth_status === 'string' ? d.auth_status : undefined,
    updateAvailable: d.update_available === true,
    updateCommand: typeof d.update_command === 'string' ? d.update_command : undefined,
    raw: d,
  }
}

const notebookCache = new Map<string, NotebookInfo>()

async function getNotebookUnqueued(cfg: NotebookCfg): Promise<NotebookInfo> {
  if (!cfg.notebookId) throw new NotebookError('config', 'Indique o endereço ou o identificador do caderno NotebookLM.')
  const d = (await callTool(cfg, 'notebook_get', { notebook_id: cfg.notebookId }, TIMEOUTS.info)) as ToolPayload
  const list = Array.isArray(d.sources) ? (d.sources as { id?: string; title?: string }[]) : []
  const sources = new Map<string, string>()
  for (const s of list) if (s.id) sources.set(s.id, s.title || s.id)
  const nb: NotebookInfo = {
    id: String(d.id ?? cfg.notebookId),
    title: String(d.title || 'Caderno sem título'),
    sourceCount: typeof d.source_count === 'number' ? d.source_count : list.length,
    sources,
  }
  notebookCache.set(cfg.notebookId, nb)
  return nb
}

/** notebook_get: title, source count and the source_id → title map used for citations. */
export async function getNotebook(input: NotebookCfgInput): Promise<NotebookInfo> {
  const cfg = toNotebookCfg(input)
  return serial(() => getNotebookUnqueued(cfg))
}

interface NlmReference {
  source_id?: string
  citation_number?: number
  cited_text?: string
}

export interface NotebookCitation {
  number: number
  sourceId?: string
  title: string
  excerpt?: string
}

export interface NotebookAnswer {
  answer: string
  /** Unique source titles in order of first citation. */
  sources: string[]
  citations: NotebookCitation[]
  conversationId?: string
}

/** Expands inline markers like [1], [2, 3] or [1-3] into citation numbers, in order of appearance. */
export function citationNumbers(answer: string): number[] {
  const out: number[] = []
  for (const m of answer.matchAll(/\[(\d+(?:\s*[-–,]\s*\d+)*)\]/g)) {
    for (const part of m[1].split(',')) {
      const [a, b] = part.split(/[-–]/).map((x) => Number(x.trim()))
      if (!Number.isFinite(a)) continue
      if (Number.isFinite(b) && b >= a && b - a < 50) for (let n = a; n <= b; n++) out.push(n)
      else out.push(a)
    }
  }
  return out
}

/** Builds the bibliography of a notebook_query result (references[] first, citations{} as fallback). */
export function extractNlmCitations(data: ToolPayload, titles: Map<string, string>): { sources: string[]; citations: NotebookCitation[] } {
  const answer = String(data.answer ?? '')
  const refs = Array.isArray(data.references) ? (data.references as NlmReference[]) : []
  const cmap = data.citations && typeof data.citations === 'object' ? (data.citations as Record<string, string>) : {}
  const byNumber = new Map<number, { sourceId?: string; excerpt?: string }>()
  for (const r of refs) if (typeof r.citation_number === 'number') byNumber.set(r.citation_number, { sourceId: r.source_id, excerpt: r.cited_text })
  if (byNumber.size === 0) for (const [k, v] of Object.entries(cmap)) byNumber.set(Number(k), { sourceId: v })

  let numbers = citationNumbers(answer).filter((n) => byNumber.has(n))
  if (numbers.length === 0) numbers = [...byNumber.keys()].sort((a, b) => a - b)
  const seenNumbers = new Set<number>()
  const citations: NotebookCitation[] = []
  for (const n of numbers) {
    if (seenNumbers.has(n)) continue
    seenNumbers.add(n)
    const ref = byNumber.get(n)
    const title = (ref?.sourceId && titles.get(ref.sourceId)) || ref?.sourceId || `Fonte ${n}`
    citations.push({ number: n, sourceId: ref?.sourceId, title, excerpt: ref?.excerpt })
  }
  const sources: string[] = []
  for (const c of citations) if (!sources.includes(c.title)) sources.push(c.title)
  if (sources.length === 0 && Array.isArray(data.sources_used))
    for (const id of data.sources_used as string[]) {
      const t = titles.get(id) ?? id
      if (!sources.includes(t)) sources.push(t)
    }
  return { sources, citations }
}

async function pollQuery(cfg: NotebookCfg, question: string): Promise<ToolPayload> {
  const started = (await callTool(
    cfg,
    'notebook_query_start',
    { notebook_id: cfg.notebookId, query: question, timeout: TIMEOUTS.queryServerSec + 60, new_conversation: true },
    TIMEOUTS.info,
  )) as ToolPayload
  const queryId = started.query_id
  if (typeof queryId !== 'string') throw new NotebookError('server', 'O servidor não devolveu o identificador da pergunta.')
  const deadline = Date.now() + TIMEOUTS.pollCap
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, TIMEOUTS.pollEvery))
    const st = (await callTool(cfg, 'notebook_query_status', { query_id: queryId }, TIMEOUTS.info)) as ToolPayload
    if (st.status === 'completed') return (st.result ?? {}) as ToolPayload
    if (st.status === 'error') throw classifyMcpError(new Error(String(st.error ?? 'Erro na pergunta ao NotebookLM.')))
  }
  throw new NotebookError('timeout', 'O NotebookLM não respondeu dentro do limite de 3 minutos.')
}

async function askNlmCli(cfg: NotebookCfg, question: string): Promise<NotebookAnswer> {
  if (!cfg.notebookId) throw new NotebookError('config', 'Indique o caderno NotebookLM nas Definições.')
  let titles = notebookCache.get(cfg.notebookId)?.sources
  if (!titles) {
    try {
      titles = (await getNotebookUnqueued(cfg)).sources
    } catch {
      titles = new Map()
    }
  }
  let data: ToolPayload
  try {
    data = (await callTool(
      cfg,
      'notebook_query',
      { notebook_id: cfg.notebookId, query: question, timeout: TIMEOUTS.queryServerSec, new_conversation: true },
      TIMEOUTS.query,
    )) as ToolPayload
  } catch (e) {
    if (e instanceof NotebookError && e.code === 'timeout') data = await pollQuery(cfg, question)
    else throw e
  }
  const { sources, citations } = extractNlmCitations(data, titles)
  return {
    answer: String(data.answer ?? '').trim(),
    sources,
    citations,
    conversationId: typeof data.conversation_id === 'string' ? data.conversation_id : undefined,
  }
}

// ---------------------------------------------------------------------------
// legacy (npm notebooklm-mcp 2.x)

interface LegacySource {
  marker?: string
  number?: number
  sourceName?: string
  sourceText?: string
}

export function parseLegacyAnswer(data: ToolPayload): NotebookAnswer {
  const raw = String(data.answer ?? '')
  const answer = raw.replace(/^\s*\[AI-GENERATED[^\n]*\]\s*\n?/i, '').trim()
  const list = Array.isArray(data.sources) ? (data.sources as LegacySource[]) : []
  const citations: NotebookCitation[] = list.map((s, i) => ({
    number: typeof s.number === 'number' ? s.number : i + 1,
    title: s.sourceName?.trim() || `Fonte ${i + 1}`,
    excerpt: s.sourceText,
  }))
  const sources: string[] = []
  for (const c of citations) if (!sources.includes(c.title)) sources.push(c.title)
  return { answer, sources, citations, conversationId: typeof data.session_id === 'string' ? data.session_id : undefined }
}

async function askLegacy(cfg: NotebookCfg, question: string): Promise<NotebookAnswer> {
  const args: Record<string, unknown> = { question, source_format: 'json' }
  if (cfg.notebookUrl) args.notebook_url = cfg.notebookUrl
  const data = (await callTool(cfg, 'ask_question', args, TIMEOUTS.legacyAsk, true)) as ToolPayload
  return parseLegacyAnswer(data)
}

// ---------------------------------------------------------------------------
// Public high-level API used by the analysis pipeline.

const answerCache = new Map<string, NotebookAnswer>()

function normaliseQuestion(q: string) {
  return q.trim().replace(/\s+/g, ' ').toLowerCase()
}

/**
 * Asks the configured NotebookLM notebook one literature question.
 * Questions must contain findings only — never patient data. Calls run one at a time and
 * identical questions are answered from an in-memory cache for the rest of the session.
 */
export async function askNotebook(input: NotebookCfgInput, question: string): Promise<NotebookAnswer> {
  const cfg = toNotebookCfg(input)
  const q = question.trim().slice(0, 2000)
  if (!q) throw new NotebookError('config', 'Pergunta vazia.')
  const key = `${cfg.kind}|${cfg.notebookId || cfg.notebookUrl}|${normaliseQuestion(q)}`
  const hit = answerCache.get(key)
  if (hit) return hit
  const res = await serial(() => (cfg.kind === 'legacy' ? askLegacy(cfg, q) : askNlmCli(cfg, q)))
  answerCache.set(key, res)
  return res
}

// ---------------------------------------------------------------------------
// «Testar ligação» (Settings): health → connect → server_info → notebook_get

export type TestStepId = 'health' | 'connect' | 'auth' | 'notebook'

export interface TestStep {
  id: TestStepId
  status: 'ok' | 'error' | 'warn' | 'skipped'
  label: string
  detail?: string
}

export interface ConnectionTestResult {
  ok: boolean
  steps: TestStep[]
  summary: string
  error?: NotebookError
}

const AUTH_LABEL: Record<string, string> = {
  configured: 'sessão Google válida',
  unverified: 'sessão Google por verificar',
  stale: 'sessão Google expirada',
  not_configured: 'sem sessão Google',
  error: 'erro na sessão Google',
}

export async function testNotebookConnection(input: NotebookCfgInput): Promise<ConnectionTestResult> {
  const cfg = toNotebookCfg(input)
  const steps: TestStep[] = []
  const fail = (step: TestStep, error: NotebookError): ConnectionTestResult => {
    steps.push(step)
    return { ok: false, steps, summary: error.message, error }
  }

  if (isSafariBrowser()) {
    const err = new NotebookError('unsupported-browser', 'O Safari não permite ligações a 127.0.0.1 a partir de páginas https.', 'Use o Chrome, o Edge ou o Firefox.')
    return fail({ id: 'health', status: 'error', label: 'Navegador', detail: 'Safari' }, err)
  }

  await resetMcpSession()
  const healthy = await pingGateway(cfg.baseUrl).catch(() => false)
  if (!healthy) {
    const err = new NotebookError(
      'no-connection',
      `Sem ligação à ponte em ${cfg.baseUrl}.`,
      'O terminal está fechado, a porta está errada ou a permissão de acesso à rede local foi recusada.',
    )
    return fail({ id: 'health', status: 'error', label: 'Ponte local', detail: `sem resposta em /healthz (${TIMEOUTS.health / 1000} s)` }, err)
  }
  steps.push({ id: 'health', status: 'ok', label: 'Ponte local', detail: `${new URL(cfg.baseUrl).host} responde` })

  let session: McpSession
  try {
    session = await getSession(cfg)
  } catch (e) {
    const err = classifyMcpError(e, 'connect')
    return fail({ id: 'connect', status: 'error', label: 'Ligação MCP', detail: 'POST /mcp falhou' }, err)
  }
  steps.push({
    id: 'connect',
    status: 'ok',
    label: 'Ligação MCP',
    detail: `${session.serverName ?? 'servidor MCP'}${session.serverVersion ? ` ${session.serverVersion}` : ''}${session.tools.length ? ` · ${session.tools.length} ferramentas` : ''}`,
  })

  if (cfg.kind === 'legacy') {
    let authOk = true
    try {
      const h = (await serial(() => callTool(cfg, 'get_health', {}, TIMEOUTS.info))) as ToolPayload
      authOk = h.authenticated !== false
      steps.push({ id: 'auth', status: authOk ? 'ok' : 'error', label: 'Sessão Google', detail: authOk ? 'válida' : 'por iniciar (use a ferramenta setup_auth)' })
    } catch (e) {
      const err = classifyMcpError(e)
      if (err.code !== 'unknown-tool') return fail({ id: 'auth', status: 'error', label: 'Sessão Google', detail: err.message }, err)
      steps.push({ id: 'auth', status: 'skipped', label: 'Sessão Google', detail: 'não verificável neste servidor' })
    }
    steps.push({ id: 'notebook', status: cfg.notebookUrl ? 'ok' : 'warn', label: 'Caderno', detail: cfg.notebookUrl ? 'endereço indicado' : 'indique o endereço do caderno' })
    if (!authOk) {
      const err = new NotebookError('google-session', 'Sessão Google por iniciar no servidor legado.', 'Inicie sessão com a ferramenta setup_auth do servidor.')
      return { ok: false, steps, summary: err.message, error: err }
    }
    return { ok: !!cfg.notebookUrl, steps, summary: `Ligado · servidor legado${cfg.notebookUrl ? '' : ' · caderno por indicar'}` }
  }

  let info: ServerInfo
  try {
    info = await getServerInfo(cfg)
  } catch (e) {
    const err = classifyMcpError(e)
    return fail({ id: 'auth', status: 'error', label: 'Sessão Google', detail: err.message }, err)
  }
  const auth = info.authStatus ?? 'unverified'
  const authOk = auth === 'configured' || auth === 'unverified'
  steps.push({
    id: 'auth',
    status: auth === 'configured' ? 'ok' : authOk ? 'warn' : 'error',
    label: 'Sessão Google',
    detail: `${AUTH_LABEL[auth] ?? auth} (auth_status: ${auth})${info.version ? ` · servidor ${info.version}` : ''}`,
  })
  if (!authOk) {
    const err = new NotebookError('google-session', 'Sessão Google expirada ou inexistente.', 'Execute «nlm login» no terminal e volte a testar.')
    return { ok: false, steps, summary: err.message, error: err }
  }

  if (!cfg.notebookId) {
    steps.push({ id: 'notebook', status: 'warn', label: 'Caderno', detail: 'indique o endereço do caderno' })
    return { ok: false, steps, summary: `Ligado · ${AUTH_LABEL[auth]} · caderno por indicar` }
  }
  try {
    const nb = await getNotebook(cfg)
    steps.push({ id: 'notebook', status: 'ok', label: 'Caderno', detail: `«${nb.title}» · ${nb.sourceCount} fontes` })
    return { ok: true, steps, summary: `Ligado · ${AUTH_LABEL[auth]} · ${nb.sourceCount} ${nb.sourceCount === 1 ? 'fonte' : 'fontes'} no caderno` }
  } catch (e) {
    const err = classifyMcpError(e)
    if (err.code === 'server') {
      err.code = 'notebook'
      err.hint = 'Confirme o endereço do caderno e que a conta Google com sessão iniciada tem acesso a ele.'
    }
    return fail({ id: 'notebook', status: 'error', label: 'Caderno', detail: err.message }, err)
  }
}

// ---------------------------------------------------------------------------
// Bridge command generator (shown in Definições → NotebookLM)

const NLM_TOOLS = ['server_info', 'notebook_list', 'notebook_get', 'notebook_query', 'notebook_query_start', 'notebook_query_status', 'usage_get']
const LEGACY_TOOLS = ['get_health', 'setup_auth', 'list_notebooks', 'ask_question']

export function bridgePort(baseUrl: string): string {
  try {
    const u = new URL(baseUrl)
    return u.port || (u.protocol === 'https:' ? '443' : '80')
  } catch {
    return '8765'
  }
}

/** supergateway 4.2.1 command: stateful Streamable HTTP, exact-origin CORS, bearer key, tool allowlist. */
export function buildBridgeCommand(opts: { kind: McpServerKind; origin: string; apiKey: string; baseUrl: string }): string {
  const legacy = opts.kind === 'legacy'
  const tools = (legacy ? LEGACY_TOOLS : NLM_TOOLS).map((t) => `--tools ${t}`).join(' ')
  const parts = [
    legacy ? 'NOTEBOOKLM_PROFILE=standard NOTEBOOKLM_AI_MARKER=false' : '',
    'npx -y supergateway@4.2.1',
    legacy ? '--stdio "npx -y notebooklm-mcp@2.0.0"' : '--stdio "notebooklm-mcp"',
    '--outputTransport streamableHttp --stateful',
    `--sessionTimeout ${legacy ? 1200000 : 900000}`,
    `--host 127.0.0.1 --port ${bridgePort(opts.baseUrl)} --streamableHttpPath /mcp`,
    `--cors "${opts.origin}"`,
    '--header "Access-Control-Allow-Private-Network: true"',
    `--apiKey "${opts.apiKey}"`,
    tools,
    '--healthEndpoint /healthz',
  ]
  return parts.filter(Boolean).join(' ')
}
