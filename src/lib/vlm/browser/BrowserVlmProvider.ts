// Main-thread side of the in-browser provider. Import this module dynamically so neither it nor the
// worker (which pulls in Transformers.js + ONNX Runtime) lands in the main bundle.
import * as z from 'zod'
import type { GenerateRequest, GenerateResult, VlmProvider } from '../providers'
import type { FromWorker, ToWorker } from './protocol'
import { BROWSER_MODELS, clearInFlight, markInFlight, type BrowserModelKey } from './models'

export { BROWSER_MODELS }

export class BrowserVlmProvider implements VlmProvider {
  label = 'No navegador'
  local = true
  scope = 'triage' as const
  model: string
  private worker: Worker
  private ready: Promise<void>
  private nextId = 1
  private rejectReady?: (e: Error) => void
  private pending = new Map<number, (e: Error) => void>()

  private failAll(e: Error) {
    this.rejectReady?.(e)
    for (const reject of this.pending.values()) reject(e)
    this.pending.clear()
  }

  private key: BrowserModelKey

  constructor(key: BrowserModelKey, onProgress?: (fraction: number, loaded: number, total: number) => void) {
    const spec = BROWSER_MODELS[key]
    this.key = key
    this.model = spec.id
    this.label = `No navegador · ${spec.label}`
    markInFlight(key, 'load')
    // Vite: new URL(...) must be written inline inside new Worker(...) for detection.
    this.worker = new Worker(new URL('./localVlm.worker.ts', import.meta.url), { type: 'module', name: 'local-vlm' })
    // A worker that fails to load or crashes must not leave analyses waiting forever.
    this.worker.addEventListener('error', (e) => this.failAll(new Error(e.message || 'Falha no motor do modelo no navegador.')))
    this.ready = new Promise<void>((resolve, reject) => {
      this.rejectReady = reject
      const onMsg = (e: MessageEvent<FromWorker>) => {
        const m = e.data
        if (m.type === 'progress') onProgress?.(m.progress / 100, m.loaded, m.total)
        else if (m.type === 'ready') { this.worker.removeEventListener('message', onMsg); clearInFlight(); resolve() }
        else if (m.type === 'error' && m.id === undefined) { this.worker.removeEventListener('message', onMsg); reject(new Error(m.message)) }
      }
      this.worker.addEventListener('message', onMsg)
    })
    this.send({ type: 'load', spec })
  }

  private send(m: ToWorker) {
    this.worker.postMessage(m)
  }

  /** Resolves once the weights are downloaded (or read from Cache Storage) and compiled on the GPU. */
  whenReady(): Promise<void> {
    return this.ready
  }

  /** Free GPU memory: terminating the worker destroys its WebGPU device. */
  dispose() {
    this.worker.terminate()
  }

  private run(req: Omit<Extract<ToWorker, { type: 'generate' }>, 'type' | 'id'>, signal?: AbortSignal, onProgress?: (chars: number) => void) {
    const id = this.nextId++
    markInFlight(this.key, 'generate')
    let chars = 0
    return new Promise<Extract<FromWorker, { type: 'result' }>>((resolve, reject) => {
      const onAbort = () => {
        this.send({ type: 'interrupt', id })
        cleanup()
        reject(new DOMException('Análise cancelada', 'AbortError'))
      }
      const cleanup = () => {
        clearInFlight()
        this.worker.removeEventListener('message', onMsg)
        signal?.removeEventListener('abort', onAbort)
        this.pending.delete(id)
      }
      this.pending.set(id, (e) => {
        cleanup()
        reject(e)
      })
      const onMsg = (e: MessageEvent<FromWorker>) => {
        const m = e.data
        if (!('id' in m) || m.id !== id) return
        if (m.type === 'token') {
          chars += m.text.length
          onProgress?.(chars)
          return
        }
        if (m.type === 'result' || m.type === 'error') {
          cleanup()
          if (signal?.aborted) reject(new DOMException('Análise cancelada', 'AbortError'))
          else if (m.type === 'result') resolve(m)
          else reject(new Error(m.message))
        }
      }
      this.worker.addEventListener('message', onMsg)
      signal?.addEventListener('abort', onAbort, { once: true })
      this.send({ type: 'generate', id, ...req })
    })
  }

  async generate<T>(req: GenerateRequest<T>): Promise<GenerateResult<T>> {
    await this.ready
    const text = req.parts.filter((p) => p.type === 'text').map((p) => p.text).join('\n\n')
    // Small models degrade quickly with several images; send only the first (key) image.
    const images = req.parts.flatMap((p) => (p.type === 'image' ? [{ mediaType: p.mediaType, base64: p.base64 }] : [])).slice(0, 1)
    const jsonSchema = z.toJSONSchema(req.schema) as Record<string, unknown>
    const system = `${req.system}\n\nRespond only with a JSON object that follows this JSON Schema:\n${JSON.stringify(jsonSchema)}`

    // Decoding is grammar-constrained, so JSON.parse cannot fail unless max_new_tokens truncates the output;
    // zod still runs because the grammar does not enforce semantics, and one retry covers truncation.
    let lastError = ''
    let inputTokens = 0
    let outputTokens = 0
    for (let attempt = 0; attempt < 2; attempt++) {
      const r = await this.run({ system, text, images, jsonSchema, maxNewTokens: (req.maxTokens ?? 1536) * (attempt + 1) }, req.signal, req.onProgress)
      inputTokens += r.inputTokens
      outputTokens += r.outputTokens
      try {
        const parsed = req.schema.safeParse(JSON.parse(r.text))
        if (parsed.success) return { data: parsed.data, usage: { inputTokens, outputTokens }, model: this.model }
        lastError = parsed.error.issues.slice(0, 3).map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')
      } catch (e) {
        lastError = `JSON truncado ou inválido (${e instanceof Error ? e.message : String(e)})`
      }
    }
    throw new Error(`O modelo no navegador não devolveu JSON válido: ${lastError}`)
  }
}
