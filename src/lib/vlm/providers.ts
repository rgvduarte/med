import Anthropic from '@anthropic-ai/sdk'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
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
}

export interface GenerateResult<T> {
  data: T
  usage: TokenUsage
  model: string
}

export interface VlmProvider {
  label: string
  model: string
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
        : { type: 'image', source: { type: 'base64', media_type: p.mediaType, data: p.base64 } },
    )
    const useFallback = FALLBACK_MODELS.has(this.model)
    try {
      const stream = this.client.beta.messages.stream(
        {
          model: this.model,
          max_tokens: req.maxTokens ?? 32000,
          thinking: { type: 'adaptive' },
          output_config: { effort: req.effort ?? this.defaultEffort, format: zodOutputFormat(req.schema) },
          system: req.system,
          messages: [{ role: 'user', content }],
          ...(useFallback ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const } : {}),
        },
        { signal: req.signal },
      )
      const msg = await stream.finalMessage()
      if (msg.stop_reason === 'refusal') {
        throw new Error('O modelo recusou este pedido (filtro de segurança). Reveja as imagens ou tente outro modelo.')
      }
      if (msg.stop_reason === 'max_tokens') throw new Error('A resposta do modelo foi truncada (limite de tokens). Tente um esforço menor.')
      if (msg.parsed_output == null) throw new Error('O modelo não devolveu dados estruturados válidos.')
      return {
        data: msg.parsed_output as T,
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
      if (attempt > 0) messages.push({ role: 'user', content: `The previous output was invalid: ${lastError}. Return only the corrected JSON object.` })
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
            stream: false,
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
      const body = (await res.json()) as {
        choices?: { message?: { content?: string }; finish_reason?: string }[]
        usage?: { prompt_tokens?: number; completion_tokens?: number }
        model?: string
      }
      usage = {
        inputTokens: usage.inputTokens + (body.usage?.prompt_tokens ?? 0),
        outputTokens: usage.outputTokens + (body.usage?.completion_tokens ?? 0),
      }
      const raw = (body.choices?.[0]?.message?.content ?? '').trim().replace(/^```(?:json)?\s*|\s*```$/g, '')
      try {
        const parsed = req.schema.safeParse(JSON.parse(raw))
        if (parsed.success) return { data: parsed.data, usage, model: body.model ?? this.model }
        lastError = parsed.error.issues
          .slice(0, 5)
          .map((i) => `${i.path.join('.')}: ${i.message}`)
          .join('; ')
      } catch (e) {
        lastError = `not valid JSON (${e instanceof Error ? e.message : String(e)})`
      }
    }
    throw new Error(`O modelo local não devolveu JSON válido: ${lastError}`)
  }
}

export function providerFromSettings(s: Settings & { apiKey: string }): VlmProvider {
  if (s.provider === 'anthropic') {
    if (!s.apiKey) throw new Error('Configure a chave da API Anthropic em Definições.')
    return new AnthropicProvider(s.apiKey, s.anthropicModel, s.effort)
  }
  return new OpenAICompatibleProvider(s.localBaseUrl, s.localModel)
}
