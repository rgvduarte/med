// Messages between the main thread and the in-browser VLM worker.

export type ComponentDtype = 'q4' | 'q4f16' | 'fp16' | 'fp32'

export interface BrowserModelSpec {
  /** Hugging Face repo id of the ONNX build, e.g. "onnx-community/Qwen3.5-0.8B-ONNX". */
  id: string
  /** Processor calling convention: Qwen takes (text, images), LFM2-VL takes (images, text). */
  family: 'qwen' | 'lfm2-vl'
  label: string
  licence: string
  /** Total download in MB for the f16 and f32 dtype paths (weights only, from the repo listing). */
  downloadMb: { f16: number; f32: number }
  /** Pinned commit so the cached weights and the code never drift apart. */
  revision: string
  /** Per-component dtype; keys are the ONNX file stems in the repo's onnx/ folder. */
  dtype: { f16: Record<string, ComponentDtype>; f32: Record<string, ComponentDtype> }
  /** Longest image side in pixels fed to the vision encoder (multiple of 32 for Qwen). */
  maxImageSide: number
}

export type ToWorker =
  | { type: 'load'; spec: BrowserModelSpec }
  | {
      type: 'generate'
      id: number
      system: string
      text: string
      images: { mediaType: string; base64: string }[]
      /** JSON Schema (draft 2020-12) to constrain decoding, or null for free text. */
      jsonSchema: Record<string, unknown> | null
      maxNewTokens: number
    }
  | { type: 'interrupt'; id: number }

export type FromWorker =
  | { type: 'progress'; progress: number; loaded: number; total: number }
  | { type: 'ready'; modelId: string; dtype: Record<string, ComponentDtype> }
  | { type: 'token'; id: number; text: string }
  | { type: 'result'; id: number; text: string; inputTokens: number; outputTokens: number; ms: number }
  | { type: 'error'; id?: number; message: string }
