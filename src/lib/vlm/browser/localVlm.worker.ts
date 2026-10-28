// In-browser VLM worker (Transformers.js 4.3.x + WebGPU). Loaded lazily by BrowserVlmProvider.
// Images and prompts never leave this tab; only model weights are downloaded (from huggingface.co).
import {
  AutoModelForImageTextToText,
  AutoProcessor,
  InterruptableStoppingCriteria,
  RawImage,
  TextStreamer,
  env,
  type PreTrainedModel,
  type Processor,
  type ProgressInfo,
  type Tensor,
} from '@huggingface/transformers'
import { StructuredOutputProcessor } from '@huggingface/transformers-structured-output'
import type { BrowserModelSpec, ComponentDtype, FromWorker, ToWorker } from './protocol'
// Self-hosted ONNX Runtime WASM (same version Transformers.js bundles) -> no cdn.jsdelivr.net at runtime.
import ortMjs from 'onnxruntime-web/ort-wasm-simd-threaded.asyncify.mjs?url'
import ortWasm from 'onnxruntime-web/ort-wasm-simd-threaded.asyncify.wasm?url'

env.allowLocalModels = false // never probe /models/ on github.io
env.useBrowserCache = true // Cache Storage, key env.cacheKey ('transformers-cache')
env.backends.onnx.wasm!.wasmPaths = { mjs: ortMjs, wasm: ortWasm }

const post = (m: FromWorker) => self.postMessage(m)

let processor: Processor | null = null
let model: PreTrainedModel | null = null
let spec: BrowserModelSpec | null = null
// One stopper per request, created synchronously when the request arrives, so a cancel that comes
// before generation starts is not lost and cannot hit a different request. Generations run one at a time.
const stoppers = new Map<number, InterruptableStoppingCriteria>()
let queue: Promise<void> = Promise.resolve()

async function load(s: BrowserModelSpec) {
  if (!('gpu' in navigator)) throw new Error('WebGPU indisponível neste navegador.')
  const adapter = await navigator.gpu.requestAdapter()
  if (!adapter) throw new Error('Sem adaptador WebGPU (GPU bloqueada ou não suportada).')
  const dtype: Record<string, ComponentDtype> = adapter.features.has('shader-f16') ? s.dtype.f16 : s.dtype.f32

  // Aggregate byte progress across files; 'progress_total' is emitted by from_pretrained in v4.
  const onProgress = (p: ProgressInfo) => {
    if (p.status === 'progress_total') post({ type: 'progress', progress: p.progress, loaded: p.loaded, total: p.total })
  }
  processor = await AutoProcessor.from_pretrained(s.id, { revision: s.revision })
  model = await AutoModelForImageTextToText.from_pretrained(s.id, {
    revision: s.revision,
    device: 'webgpu',
    dtype,
    progress_callback: onProgress,
  })
  if (processor.tokenizer) StructuredOutputProcessor.warmup(processor.tokenizer) // pays the vocab precompute once
  spec = s
  post({ type: 'ready', modelId: s.id, dtype })
}

async function toImage(img: { mediaType: string; base64: string }, maxSide: number): Promise<RawImage> {
  const bytes = Uint8Array.from(atob(img.base64), (c) => c.charCodeAt(0))
  const raw = await RawImage.fromBlob(new Blob([bytes], { type: img.mediaType }))
  const scale = Math.min(1, maxSide / Math.max(raw.width, raw.height))
  // Multiples of 32 keep the 16px patches x 2x2 merge of both Qwen and LFM2-VL aligned, and bound the
  // visual tokens (~(w/32)*(h/32)). LFM2-VL at <= 512 px stays a single tile (no extra tiles on phones).
  const w = Math.max(32, Math.round((raw.width * scale) / 32) * 32)
  const h = Math.max(32, Math.round((raw.height * scale) / 32) * 32)
  return raw.width === w && raw.height === h ? raw : raw.resize(w, h)
}

async function generate(req: Extract<ToWorker, { type: 'generate' }>) {
  if (!model || !processor || !spec) throw new Error('Modelo não carregado.')
  const images = await Promise.all(req.images.map((i) => toImage(i, spec!.maxImageSide)))
  const messages = [
    { role: 'system', content: req.system },
    { role: 'user', content: [...images.map(() => ({ type: 'image' as const })), { type: 'text' as const, text: req.text }] },
  ]
  // Processor.apply_chat_template defaults to tokenize:false -> string (typed loosely, hence the cast).
  const prompt = processor.apply_chat_template(messages, { add_generation_prompt: true }) as unknown as string
  // Qwen processors take (text, images); LFM2-VL's takes (images, text) and needs at least one image.
  const inputs =
    spec.family === 'lfm2-vl'
      ? images.length
        ? await processor(images, prompt, { add_special_tokens: false })
        : processor.tokenizer!(prompt, { add_special_tokens: false })
      : await processor(prompt, images.length ? images : null, { add_special_tokens: false })
  const promptLen = (inputs.input_ids as Tensor).dims.at(-1)!

  const stopper = stoppers.get(req.id) ?? new InterruptableStoppingCriteria()
  const t0 = performance.now()
  const streamer = new TextStreamer(processor.tokenizer!, {
    skip_prompt: true,
    skip_special_tokens: true,
    callback_function: (text: string) => post({ type: 'token', id: req.id, text }),
  })
  const output = (await model.generate({
    ...inputs,
    max_new_tokens: req.maxNewTokens,
    do_sample: false, // greedy: reproducible output for the same image
    repetition_penalty: 1.05,
    streamer,
    stopping_criteria: stopper,
    // New processor per call: it holds per-sequence grammar state. Only batch size 1 is supported.
    ...(req.jsonSchema
      ? { logits_processor: new StructuredOutputProcessor(processor.tokenizer!, { type: 'json_schema', json_schema: req.jsonSchema as never }) }
      : {}),
  })) as Tensor
  const newTokens = output.slice(null, [promptLen, output.dims[1]])
  const text = processor.batch_decode(newTokens, { skip_special_tokens: true })[0]
  post({ type: 'result', id: req.id, text, inputTokens: promptLen, outputTokens: newTokens.dims.at(-1)!, ms: performance.now() - t0 })
}

self.addEventListener('message', async (e: MessageEvent<ToWorker>) => {
  const msg = e.data
  try {
    if (msg.type === 'load') await load(msg.spec)
    else if (msg.type === 'generate') {
      stoppers.set(msg.id, new InterruptableStoppingCriteria())
      const job = queue.then(() => generate(msg)).finally(() => stoppers.delete(msg.id))
      queue = job.catch(() => undefined)
      await job
    } else if (msg.type === 'interrupt') stoppers.get(msg.id)?.interrupt()
  } catch (err) {
    post({ type: 'error', id: msg.type === 'generate' ? msg.id : undefined, message: err instanceof Error ? err.message : String(err) })
  }
})
