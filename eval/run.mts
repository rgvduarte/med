// Offline evaluation of the built-in (in-browser) models on public musculoskeletal radiographs.
// Same library (Transformers.js 4.3.1), same ONNX weights and pinned revisions, same prompts, JSON-schema
// constrained decoding and image sizing as the app's worker — only the backend differs (ONNX Runtime CPU in
// Node instead of WebGPU). Images are read from a local copy of FracAtlas (CC BY 4.0); none are committed.
//
//   npx jiti eval/run.mts --model qwen3.5-2b --task fracture --sample eval/sample-test.json --data <FracAtlas dir> --out eval/results/x.jsonl
import { readFileSync, appendFileSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import * as z from 'zod'
import { AutoModelForImageTextToText, AutoProcessor, RawImage, env, type Tensor } from '@huggingface/transformers'
import { StructuredOutputProcessor } from '@huggingface/transformers-structured-output'
import { BROWSER_MODELS, type BrowserModelKey } from '../src/lib/vlm/browser/models'
import { triageSystem } from '../src/lib/vlm/prompts'
import { TriageSchema } from '../src/lib/vlm/schemas'
import { FRACTURE_SCREEN_SYSTEM, FractureScreenSchema } from './fracture-prompt'

const arg = (name: string, fallback?: string) => {
  const i = process.argv.indexOf(`--${name}`)
  return i > 0 ? process.argv[i + 1] : fallback
}
const modelKey = arg('model', 'qwen3.5-2b') as BrowserModelKey
const task = arg('task', 'triage') as 'triage' | 'fracture'
const sample: { image_id: string; fractured: number; part: string }[] = JSON.parse(readFileSync(arg('sample', 'eval/sample-test.json')!, 'utf8'))
const dataDir = arg('data')!
const out = arg('out', `eval/results/${modelKey}-${task}.jsonl`)!
const limit = Number(arg('limit', '1000000'))

env.allowLocalModels = false
env.cacheDir = arg('cache', '.cache/eval-models')!

const spec = BROWSER_MODELS[modelKey]
const t0 = performance.now()
const processor = await AutoProcessor.from_pretrained(spec.id, { revision: spec.revision })
// The f32 path (q4 everywhere) is what browsers without shader-f16 run; ONNX Runtime CPU executes it natively.
const model = await AutoModelForImageTextToText.from_pretrained(spec.id, { revision: spec.revision, device: 'cpu', dtype: spec.dtype.f32 as never })
console.error(`[load] ${spec.id} in ${((performance.now() - t0) / 1000).toFixed(1)} s`)

// Identical to the worker: longest side <= maxImageSide, both sides multiples of 32.
function fit(raw: RawImage): Promise<RawImage> | RawImage {
  const scale = Math.min(1, spec.maxImageSide / Math.max(raw.width, raw.height))
  const w = Math.max(32, Math.round((raw.width * scale) / 32) * 32)
  const h = Math.max(32, Math.round((raw.height * scale) / 32) * 32)
  return raw.width === w && raw.height === h ? raw : raw.resize(w, h)
}

// Identical to BrowserVlmProvider: the schema is appended to the system prompt and enforced by the grammar.
async function ask<T>(system: string, text: string, schema: z.ZodType<T>, image: RawImage, maxNewTokens: number) {
  const jsonSchema = z.toJSONSchema(schema) as Record<string, unknown>
  const sys = `${system}\n\nRespond only with a JSON object that follows this JSON Schema:\n${JSON.stringify(jsonSchema)}`
  const messages = [
    { role: 'system', content: sys },
    { role: 'user', content: [{ type: 'image' as const }, { type: 'text' as const, text }] },
  ]
  const prompt = processor.apply_chat_template(messages, { add_generation_prompt: true }) as unknown as string
  const inputs = spec.family === 'lfm2-vl' ? await processor(image, prompt, { add_special_tokens: false }) : await processor(prompt, image, { add_special_tokens: false })
  const promptLen = (inputs.input_ids as Tensor).dims.at(-1)!
  const t = performance.now()
  const output = (await model.generate({
    ...inputs,
    max_new_tokens: maxNewTokens,
    do_sample: false,
    repetition_penalty: 1.05,
    logits_processor: new StructuredOutputProcessor(processor.tokenizer!, { type: 'json_schema', json_schema: jsonSchema as never }),
  })) as Tensor
  const newTokens = output.slice(null, [promptLen, output.dims[1]])
  const raw = processor.batch_decode(newTokens, { skip_special_tokens: true })[0]
  const ms = performance.now() - t
  let data: T | undefined
  let error: string | undefined
  try {
    const parsed = schema.safeParse(JSON.parse(raw))
    if (parsed.success) data = parsed.data
    else error = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')
  } catch (e) {
    error = `invalid JSON: ${(e as Error).message}`
  }
  return { data, raw, error, promptTokens: promptLen, outputTokens: newTokens.dims.at(-1)!, ms }
}

// No clinical context, so the body region cannot leak from the prompt.
const CONTEXT = 'Contexto clínico: não fornecido. Uma radiografia musculoesquelética.'

mkdirSync(dirname(out), { recursive: true })
const done = new Set(existsSync(out) ? readFileSync(out, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l).image_id) : [])
let n = 0
for (const item of sample) {
  if (n >= limit) break
  if (done.has(item.image_id)) continue
  n++
  const folder = item.fractured ? 'Fractured' : 'Non_fractured'
  const image = await fit(await RawImage.read(join(dataDir, 'images', folder, item.image_id)))
  const r =
    task === 'triage'
      ? await ask(triageSystem('pt-PT'), CONTEXT, TriageSchema, image, 1536)
      : await ask(FRACTURE_SCREEN_SYSTEM, 'Review this radiograph.', FractureScreenSchema, image, 320)
  const row = { image_id: item.image_id, fractured: item.fractured, part: item.part, model: modelKey, task, w: image.width, h: image.height, ...r }
  appendFileSync(out, JSON.stringify(row) + '\n')
  console.error(`[${n}] ${item.image_id} ${item.part} fx=${item.fractured} ${(r.ms / 1000).toFixed(1)}s in=${r.promptTokens} out=${r.outputTokens} ${r.error ? 'ERROR ' + r.error : JSON.stringify(r.data).slice(0, 160)}`)
}
