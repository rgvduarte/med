// Core domain model shared by every module (imaging, VLM pipeline, evidence, report, UI).
// Coordinates on images are always normalised to 0..1 relative to the frame's width/height.

export type Modality = 'XR' | 'CT' | 'MR' | 'US' | 'XA' | 'OT'

export type Region =
  | 'shoulder'
  | 'elbow'
  | 'wrist-hand'
  | 'hip-pelvis'
  | 'knee'
  | 'ankle-foot'
  | 'spine'
  | 'long-bones'
  | 'other'

export type Laterality = 'left' | 'right' | 'bilateral' | 'none' | 'unknown'

export type SeriesKind = 'image' | 'video' | 'dicom'

/** One displayable frame: a still image, a video keyframe, or one DICOM frame. */
export interface Frame {
  id: string
  index: number
  /** Seconds from the start of the clip (video / cine only). */
  timeSec?: number
  /** Rendered 8-bit image (data: or blob: URL) used for display and as VLM input. */
  url: string
  width: number
  height: number
  /** Millimetres per pixel [row, column] when known (DICOM PixelSpacing). */
  pixelSpacing?: [number, number]
  /** Raw DICOM pixel data for true window/level in the viewer. Never serialised. */
  raw?: DicomPixels
}

export interface DicomPixels {
  data: Int16Array | Uint16Array | Uint8Array | Float32Array
  rows: number
  columns: number
  slope: number
  intercept: number
  windowCenter: number
  windowWidth: number
  invert: boolean // MONOCHROME1
}

export interface Series {
  id: string
  kind: SeriesKind
  modality: Modality
  region: Region
  description: string
  view?: string
  laterality?: Laterality
  frames: Frame[]
  /** Object URL of the original video clip, for cine playback. */
  videoUrl?: string
  durationSec?: number
  /** De-identified, display-safe DICOM attributes (no PHI). */
  dicomMeta?: Record<string, string>
  /** Tags removed during client-side de-identification (names only, never values). */
  removedTags?: string[]
}

export type CaseStatus = 'new' | 'analysing' | 'analysed' | 'validated' | 'error'

export interface Attribution {
  title: string
  author: string
  license: string
  licenseUrl: string
  sourceUrl: string
  text: string
}

export interface Case {
  id: string
  /** Pseudonymous identifier only — never a real name or record number. */
  pseudoId: string
  title: string
  createdAt: string
  ageYears?: number
  sex?: 'F' | 'M' | 'X'
  indication: string
  priority: 'routine' | 'urgent'
  status: CaseStatus
  series: Series[]
  isDemo?: boolean
  /** Demo cases only: the teaching point described by the image source (shown after review). */
  teachingPoint?: string
  attribution?: Attribution[]
  analysis?: AnalysisResult
  report?: Report
  audit: AuditEntry[]
}

export interface AuditEntry {
  at: string
  actor: 'user' | 'ai' | 'system'
  action: string
  detail?: string
}

// ---------------------------------------------------------------------------
// Analysis pipeline

export type StageId = 'preprocess' | 'triage' | 'findings' | 'evidence' | 'report' | 'verify'

export type StageStatus = 'pending' | 'running' | 'done' | 'skipped' | 'error'

export interface StageState {
  id: StageId
  status: StageStatus
  startedAt?: string
  finishedAt?: string
  message?: string
  usage?: TokenUsage
}

export interface TokenUsage {
  inputTokens: number
  outputTokens: number
  cacheReadTokens?: number
}

export interface Triage {
  modality: Modality
  region: Region
  view: string
  laterality: Laterality
  imageQuality: 'adequate' | 'limited' | 'non-diagnostic'
  qualityNotes: string
  skeletalMaturity: 'adult' | 'skeletally-immature' | 'unknown'
  hardwarePresent: boolean
  summary: string
}

/** Calibrated certainty lexicon (after Panicek & Hricak, AJR 2016). */
export type Certainty =
  | 'consistent-with'
  | 'suspicious-for'
  | 'possible'
  | 'less-likely'
  | 'unlikely'

export type Severity = 'critical' | 'significant' | 'minor' | 'normal'

export type FindingStatus = 'pending' | 'accepted' | 'rejected' | 'edited'

/** Study/finding class shown to the clinician (BoneView-style): shape + colour + text. */
export type FindingClass = 'positive' | 'doubtful' | 'negative' | 'not-assessable'

/** Priority = relevant to the clinical question or urgent; checklist = assessed and not detected. */
export type FindingGroup = 'priority' | 'other' | 'checklist'

export type VerbalConfidence = 'high' | 'moderate' | 'low'

export interface FindingLocation {
  seriesId: string
  frameIndex: number
  /** [x, y, width, height] normalised 0..1; approximate — VLM localisation is coarse. */
  bbox?: [number, number, number, number]
}

export interface Finding {
  id: string
  origin: 'ai' | 'clinician'
  cls: FindingClass
  group: FindingGroup
  label: string
  description: string
  anatomicSite: string
  laterality: Laterality
  certainty: Certainty
  severity: Severity
  /** Self-reported by the model and NOT calibrated — shown only as a word, never as a percentage. */
  confidence: VerbalConfidence
  classification?: { system: string; grade: string; rationale: string }
  locations: FindingLocation[]
  /** Video/cine: first and last keyframe index where the finding is visible. */
  frameRange?: [number, number]
  evidenceQuery: string[]
  /** Evidence ids attached after retrieval. */
  evidenceIds: string[]
  status: FindingStatus
  rejectReason?: string
  clinicianNote?: string
}

export interface EvidenceItem {
  /** Local KB id (e.g. "kuo2022") or "NLM-1".."NLM-n" for NotebookLM answers. */
  id: string
  source: 'kb' | 'notebooklm'
  title: string
  citation: string
  url?: string
  doi?: string
  pmid?: string
  year?: number
  evidenceType?: string
  /** The specific supporting statement(s) offered to the report writer. */
  points: string[]
  /** Finding ids this evidence was retrieved for. */
  findingIds: string[]
  score?: number
}

export interface NotebookLmAnswer {
  question: string
  answer: string
  sources: string[]
  findingIds: string[]
}

export interface VerificationIssue {
  severity: 'error' | 'warning' | 'info'
  section: string
  message: string
}

export interface AnalysisResult {
  provider: string
  model: string
  language: ReportLanguage
  startedAt: string
  finishedAt?: string
  stages: StageState[]
  triage?: Triage
  findings: Finding[]
  evidence: EvidenceItem[]
  notebookLm: NotebookLmAnswer[]
  /** Final second-reader result; revisedIssues = problems fixed by the automatic revision round. */
  verification?: { passed: boolean; issues: VerificationIssue[]; revisedIssues?: number }
  /** True when this result was pre-computed and shipped with a demo case. */
  precomputed?: boolean
  totalUsage?: TokenUsage
}

// ---------------------------------------------------------------------------
// Report

export type ReportLanguage = 'pt-PT' | 'en'

export interface ReportCitation {
  evidenceId: string
  statement: string
}

export interface Report {
  language: ReportLanguage
  /** Free-text AI-use declaration appended automatically (not editable). */
  aiDeclaration?: string
  /** SHA-256 of the canonical report JSON at validation time. */
  contentHash?: string
  /** True when the draft was rewritten once to address the second reader's issues. */
  revisedAfterVerification?: boolean
  clinicalIndication: string
  technique: string
  comparison: string
  findingsByRegion: { heading: string; text: string }[]
  impression: string[]
  recommendations: string[]
  limitations: string
  citations: ReportCitation[]
  status: 'draft' | 'validated'
  generatedBy: string
  generatedAt: string
  editedByClinician: boolean
  validatedBy?: string
  validatedAt?: string

  // --- Report review UI (optional; added for section review and validation) ---
  /** Report sections the clinician accepted or edited ('indication', 'technique', 'comparison', 'findings', 'impression', 'recommendations', 'limitations'). */
  reviewedSections?: string[]
  /** Optional professional licence number («cédula profissional») of the validating clinician. */
  validatorLicence?: string
}
