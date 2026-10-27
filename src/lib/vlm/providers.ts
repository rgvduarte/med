import Anthropic from '@anthropic-ai/sdk'
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod'
import * as z from 'zod'
import type { TokenUsage } from '../../types'
import type { Effort, Settings } from '../../store/settings'

export type ContentPart = { type: 'text'; text: string } | { type: 'image'; mediaType: 'image/jpeg' | 'image/png'; base64: string }

export interface GenerateRequest<T> {
  system: string
  parts: ContentPart[]
  schema: z.ZodType<T>
  effort?: Effort
  signal?: AbortSignal
  maxTokens?: number
  /** Called with the number of characters generated so far (streaming providers only). */
  onProgress?: (chars: number) => void
}

export interface GenerateResult<T> {
  data: T
  usage: TokenUsage
  model: string
}

export interface VlmProvider {
  label: string
  model: string
  /** Local models are slower and weaker: the pipeline sends fewer, smaller images and skips the second reader. */
  local: boolean
  /** 'triage' providers (tiny in-browser models) only run the triage stage; findings would be unreliable. */
  scope: 'full' | 'triage'
  generate<T>(req: GenerateRequest<T>): Promise<GenerateResult<T>>
}

// Models with server-side refusal fallback support on the Claude API ("default" routing).
const FALLBACK_MODELS = new Set(['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-fable-5-1', 'claude-opus-5'])

function friendlyAnthropicError(e: unknown): Error {
  if (e instanceof Anthropic.AuthenticationError) return new Error('Chave da API Anthropic inválida ou revogada (401). Verifique-a em Definições.')
  if (e instanceof Anthropic.PermissionDeniedError) return new Error('A chave não tem permissão para este modelo (403).')
  if (e instanceof Anthropic.NotFoundError) return new Error('Modelo não encontrado (404). Escolha outro modelo em Definições.')
  if (e instanceof Anthropic.RateLimitError) return new Error('Limite de pedidos atingido (429). Aguarde um pouco e tente novamente.')
  if (e instanceof Anthropic.BadRequestError) return new Error(`Pedido rejeitado pela API (400): ${e.message}`)
  if (e instanceof Anthropic.APIConnectionError) return new Error('Sem ligação a api.anthropic.com. Verifique a rede.')
  if (e instanceof Anthropic.APIError) return new Error(`Erro da API Anthropic (${e.status ?? '?'}): ${e.message}`)
  return e instanceof Error ? e : new Error(String(e))
}

export class AnthropicProvider implements VlmProvider {
  label = 'Claude (API Anthropic)'
  local = false
  scope = 'full' as const
  model: string
  private client: Anthropic
  private defaultEffort: Effort
  constructor(apiKey: string, model: string, defaultEffort: Effort) {
    this.model = model
    this.defaultEffort = defaultEffort
    // The key is the user's own and goes straight from this browser to api.anthropic.com.
    this.client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true, maxRetries: 2 })
  }

  async generate<T>(req: GenerateRequest<T>): Promise<GenerateResult<T>> {
    const content: Anthropic.Beta.BetaContentBlockParam[] = req.parts.map((p) =>
      p.type === 'text'
        ? { type: 'text', text: p.text }
        : {
            type: 'image',
            source: { type: 'base64', media_type: p.mediaType, data: p.base64 },
            // Images are resized locally; never let the server rescale them, so boxes map 1:1.
            transformations: { oversized_image: 'error' },
          },
    )
    const useFallback = FALLBACK_MODELS.has(this.model)
    // Strip the helper's auto-parse: it throws on refusals/truncation before stop_reason can be read.
    const { type, schema } = betaZodOutputFormat(req.schema)
    try {
      const stream = this.client.beta.messages.stream(
        {
          model: this.model,
          max_tokens: req.maxTokens ?? 32000,
          thinking: { type: 'adaptive' },
          output_config: { effort: req.effort ?? this.defaultEffort, format: { type, schema } },
          system: req.system,
          messages: [{ role: 'user', content }],
          ...(useFallback ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const } : {}),
        },
        { signal: req.signal },
      )
      if (req.onProgress) stream.on('text', (_delta, snapshot) => req.onProgress?.(snapshot.length))
      const msg = await stream.finalMessage()
      if (msg.stop_reason === 'refusal') {
        const cat = msg.stop_details?.category
        throw new Error(`O modelo recusou este pedido${cat ? ` (categoria: ${cat})` : ''}. Reveja as imagens ou tente outro modelo.`)
      }
      if (msg.stop_reason === 'max_tokens') throw new Error('A resposta do modelo foi truncada (limite de tokens). Tente um esforço menor ou menos imagens.')
      if (msg.stop_reason === 'model_context_window_exceeded') throw new Error('Demasiadas imagens para o contexto do modelo. Reduza o número de imagens.')
      // After a server-side fallback, only the text after the last fallback block belongs to the answer.
      const lastFallback = msg.content.map((b) => b.type).lastIndexOf('fallback')
      const text = msg.content
        .slice(lastFallback + 1)
        .map((b) => (b.type === 'text' ? b.text : ''))
        .join('')
      let json: unknown
      try {
        json = JSON.parse(text)
      } catch {
        throw new Error('O modelo não devolveu JSON válido.')
      }
      const parsed = req.schema.safeParse(json)
      if (!parsed.success) {
        throw new Error(
          `Resposta do modelo fora do esquema: ${parsed.error.issues
            .slice(0, 3)
            .map((i) => `${i.path.join('.')}: ${i.message}`)
            .join('; ')}`,
        )
      }
      return {
        data: parsed.data,
        model: msg.model,
        usage: {
          inputTokens: msg.usage.input_tokens + (msg.usage.cache_read_input_tokens ?? 0) + (msg.usage.cache_creation_input_tokens ?? 0),
          outputTokens: msg.usage.output_tokens,
          cacheReadTokens: msg.usage.cache_read_input_tokens ?? 0,
        },
      }
    } catch (e) {
      if (req.signal?.aborted) throw new DOMException('Análise cancelada', 'AbortError')
      throw friendlyAnthropicError(e)
    }
  }
}

/** Local OpenAI-compatible server (Ollama, LM Studio, vLLM) — e.g. MedGemma; images never leave the machine. */
export class OpenAICompatibleProvider implements VlmProvider {
  label = 'Modelo local (compatível OpenAI)'
  local = true
  scope = 'full' as const
  model: string
  private baseUrl: string
  constructor(baseUrl: string, model: string) {
    this.baseUrl = baseUrl
    this.model = model
  }

  async generate<T>(req: GenerateRequest<T>): Promise<GenerateResult<T>> {
    const jsonSchema = z.toJSONSchema(req.schema)
    const userContent = req.parts.map((p) =>
      p.type === 'text' ? { type: 'text', text: p.text } : { type: 'image_url', image_url: { url: `data:${p.mediaType};base64,${p.base64}` } },
    )
    const messages: unknown[] = [
      {
        role: 'system',
        content: `${req.system}\n\nRespond with a single JSON object that validates against this JSON Schema, with no prose and no code fences:\n${JSON.stringify(jsonSchema)}`,
      },
      { role: 'user', content: userContent },
    ]
    let lastError = ''
    let usage: TokenUsage = { inputTokens: 0, outputTokens: 0 }
    for (let attempt = 0; attempt < 2; attempt++) {
      let res: Response
      try {
        res = await fetch(`${this.baseUrl.replace(/\/$/, '')}/chat/completions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: this.model,
            messages,
            response_format: { type: 'json_schema', json_schema: { name: 'output', schema: jsonSchema, strict: true } },
            max_tokens: req.maxTokens ?? 8000,
            // Ollama's /v1 shim defaults to temperature 1.0; MedGemma's card recommends greedy decoding.
            temperature: 0,
            // Streaming keeps slow CPU generations (e.g. in Codespaces) from idling out proxies and gives progress.
            stream: true,
            stream_options: { include_usage: true },
          }),
          signal: req.signal,
        })
      } catch (e) {
        if (req.signal?.aborted) throw new DOMException('Análise cancelada', 'AbortError')
        throw new Error(
          `Sem ligação ao servidor local em ${this.baseUrl}. Confirme que está a correr e que permite pedidos desta origem (CORS, ex.: OLLAMA_ORIGINS). (${e instanceof Error ? e.message : String(e)})`,
        )
      }
      if (!res.ok) throw new Error(`Servidor local respondeu ${res.status}: ${(await res.text()).slice(0, 300)}`)
      const { text, model, promptTokens, completionTokens } = await readCompletion(res, req)
      usage = { inputTokens: usage.inputTokens + promptTokens, outputTokens: usage.outputTokens + completionTokens }
      const raw = text.trim().replace(/^```(?:json)?\s*|\s*```$/g, '')
      try {
        const parsed = req.schema.safeParse(JSON.parse(raw))
        if (parsed.success) return { data: parsed.data, usage, model: model ?? this.model }
        lastError = parsed.error.issues
          .slice(0, 5)
          .map((i) => `${i.path.join('.')}: ${i.message}`)
          .join('; ')
      } catch (e) {
        lastError = `not valid JSON (${e instanceof Error ? e.message : String(e)})`
      }
      messages.push({ role: 'assistant', content: raw.slice(0, 20000) })
      messages.push({ role: 'user', content: `The previous output was invalid: ${lastError}. Return only the corrected JSON object.` })
    }
    throw new Error(`O modelo local não devolveu JSON válido: ${lastError}`)
  }
}

/** Reads a streamed (SSE) or plain JSON chat-completion response from an OpenAI-compatible server. */
async function readCompletion(
  res: Response,
  req: GenerateRequest<unknown>,
): Promise<{ text: string; model?: string; promptTokens: number; completionTokens: number }> {
  type Chunk = {
    model?: string
    choices?: { delta?: { content?: string }; message?: { content?: string } }[]
    usage?: { prompt_tokens?: number; completion_tokens?: number }
  }
  const ctype = res.headers.get('content-type') ?? ''
  if (!ctype.includes('text/event-stream') || !res.body) {
    const body = (await res.json()) as Chunk
    return {
      text: body.choices?.[0]?.message?.content ?? '',
      model: body.model,
      promptTokens: body.usage?.prompt_tokens ?? 0,
      completionTokens: body.usage?.completion_tokens ?? 0,
    }
  }
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buf = ''
  let text = ''
  let model: string | undefined
  let promptTokens = 0
  let completionTokens = 0
  for (;;) {
    let chunk: ReadableStreamReadResult<Uint8Array>
    try {
      chunk = await reader.read()
    } catch (e) {
      if (req.signal?.aborted) throw new DOMException('Análise cancelada', 'AbortError')
      throw e
    }
    if (chunk.done) break
    buf += decoder.decode(chunk.value, { stream: true })
    let nl: number
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).trim()
      buf = buf.slice(nl + 1)
      if (!line.startsWith('data:')) continue
      const data = line.slice(5).trim()
      if (data === '[DONE]') continue
      try {
        const c = JSON.parse(data) as Chunk
        model ??= c.model
        text += c.choices?.[0]?.delta?.content ?? ''
        if (c.usage) {
          promptTokens = c.usage.prompt_tokens ?? promptTokens
          completionTokens = c.usage.completion_tokens ?? completionTokens
        }
      } catch {
        /* ignore keep-alive or partial lines */
      }
    }
    req.onProgress?.(text.length)
  }
  return { text, model, promptTokens, completionTokens }
}

let browserProvider: { key: string; provider: VlmProvider } | null = null

/**
 * Builds the provider chosen in Settings. The in-browser provider is imported lazily (it pulls in
 * Transformers.js + ONNX Runtime) and kept alive so the model is downloaded and compiled only once.
 */
export async function createProvider(
  s: Settings & { apiKey: string },
  onLoadProgress?: (fraction: number, loaded: number, total: number) => void,
): Promise<VlmProvider> {
  if (s.provider === 'anthropic') {
    if (!s.apiKey) throw new Error('Configure a chave da API Anthropic em Definições.')
    return new AnthropicProvider(s.apiKey, s.anthropicModel, s.effort)
  }
  if (s.provider === 'browser') {
    if (typeof navigator === 'undefined' || !('gpu' in navigator)) {
      throw new Error('Este navegador não suporta WebGPU. Use Chrome ou Edge num computador (ou Safari 26+ no Mac).')
    }
    const { BrowserVlmProvider, BROWSER_MODELS } = await import('./browser/BrowserVlmProvider')
    const spec = BROWSER_MODELS[s.browserModel as keyof typeof BROWSER_MODELS] ?? BROWSER_MODELS['qwen3.5-0.8b']
    if (browserProvider?.key !== spec.id) {
      ;(browserProvider?.provider as { dispose?: () => void } | undefined)?.dispose?.()
      browserProvider = { key: spec.id, provider: new BrowserVlmProvider(spec, (f, l, t) => browserLoadListener?.(f, l, t)) }
    }
    browserLoadListener = onLoadProgress
    await (browserProvider.provider as InstanceType<typeof BrowserVlmProvider>).whenReady()
    return browserProvider.provider
  }
  return new OpenAICompatibleProvider(s.localBaseUrl, s.localModel)
}

let browserLoadListener: ((fraction: number, loaded: number, total: number) => void) | undefined
