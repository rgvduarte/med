import * as z from 'zod'

// Model-facing output schemas (one per pipeline stage). Kept to the JSON-schema subset that
// structured outputs support; ranges and limits are stated in descriptions, not keywords.

const REGION = z.enum(['shoulder', 'elbow', 'wrist-hand', 'hip-pelvis', 'knee', 'ankle-foot', 'spine', 'long-bones', 'other'])
const LATERALITY = z.enum(['left', 'right', 'bilateral', 'none', 'unknown'])

export const TriageSchema = z.object({
  in_scope: z.boolean().describe('true if the images are musculoskeletal medical images that this tool can assess'),
  out_of_scope_reason: z.string().describe('empty string when in_scope is true'),
  modality: z.enum(['XR', 'CT', 'MR', 'US', 'XA', 'OT']),
  region: REGION,
  view: z.string().describe('projection(s) / plane(s) / ultrasound view, e.g. "PA and lateral", "sagittal PD FS", "longitudinal supraspinatus"'),
  laterality: LATERALITY.describe('from visible side markers or anatomy; "unknown" if not determinable'),
  image_quality: z.enum(['adequate', 'limited', 'non-diagnostic']),
  quality_notes: z.string().describe('positioning, exposure, motion, coverage, artefacts; empty if none'),
  skeletal_maturity: z.enum(['adult', 'skeletally-immature', 'unknown']),
  hardware_present: z.boolean(),
  images: z
    .array(z.object({ image_number: z.number().int(), content: z.string().describe('what this image shows (view/plane/structure)') }))
    .describe('one entry per input image, in order'),
  summary: z.string().describe('one or two sentences describing the examination'),
})
export type TriageOut = z.infer<typeof TriageSchema>

export const FindingsSchema = z.object({
  checklist: z
    .array(
      z.object({
        item: z.string().describe('a checklist item that was assessed, e.g. "Fratura do rádio distal"'),
        result: z.enum(['present', 'absent', 'indeterminate']),
      }),
    )
    .describe('every item of the systematic checklist, including the negatives'),
  findings: z
    .array(
      z.object({
        label: z.string().describe('short finding name, e.g. "Fratura do terço médio do escafoide"'),
        description: z.string().describe('1–3 sentences: the visual evidence for this finding (what you see and where)'),
        anatomic_site: z.string(),
        laterality: LATERALITY,
        certainty: z
          .enum(['consistent-with', 'suspicious-for', 'possible', 'less-likely', 'unlikely'])
          .describe('calibrated lexicon: consistent-with >90%, suspicious-for ~75%, possible ~50%, less-likely ~25%, unlikely <10%'),
        severity: z.enum(['critical', 'significant', 'minor']).describe('clinical importance'),
        confidence: z.enum(['high', 'moderate', 'low']).describe('your confidence that the finding is truly present'),
        relevant_to_question: z.boolean().describe('true if it answers the clinical question or is urgent'),
        classification: z
          .object({ system: z.string(), grade: z.string(), rationale: z.string() })
          .nullable()
          .describe('only if an established system applies and the image supports it (e.g. Garden, Danis-Weber, Kellgren-Lawrence, Salter-Harris, Genant, Neer); else null'),
        locations: z
          .array(
            z.object({
              image_number: z.number().int(),
              bbox: z
                .object({ x: z.number(), y: z.number(), w: z.number(), h: z.number() })
                .nullable()
                .describe('approximate box, normalised 0–1 relative to that image (x,y = top-left). null if diffuse or not localisable'),
            }),
          )
          .describe('images where the finding is visible'),
        frame_range: z
          .object({ first_image_number: z.number().int(), last_image_number: z.number().int() })
          .nullable()
          .describe('for video keyframes / cine only: first and last keyframe where it is visible; else null'),
        evidence_query: z.array(z.string()).describe('2–5 English search terms for the literature (diagnosis, classification, imaging test)'),
      }),
    )
    .describe('positive or uncertain findings only (no normal statements)'),
  pertinent_negatives: z.array(z.string()).describe('relevant normal statements answering the clinical question'),
  limitations: z.string().describe('limits of this assessment (views missing, quality, single frame, VLM limitations)'),
})
export type FindingsOut = z.infer<typeof FindingsSchema>

export const ReportSchema = z.object({
  clinical_indication: z.string(),
  technique: z.string().describe('modality, region, views/sequences/frames assessed and that the analysis was AI-assisted'),
  comparison: z.string().describe('e.g. "Sem exames prévios disponíveis para comparação."'),
  findings_sections: z
    .array(z.object({ heading: z.string(), text: z.string() }))
    .describe('radiograph: Alinhamento / Osso / Articulações / Partes moles; MR/US: per structure; plus "Estudo dinâmico" for cine'),
  conclusion: z.array(z.string()).describe('numbered conclusion items, at most 5, most important first, answering the clinical question explicitly'),
  recommendations: z.array(z.string()).describe('evidence-based next steps (further imaging, follow-up, correlation); may be empty'),
  limitations: z.string(),
  citations: z.array(z.object({ evidence_id: z.string(), statement: z.string() })).describe('which evidence id supports which statement'),
})
export type ReportOut = z.infer<typeof ReportSchema>

export const VerifySchema = z.object({
  passed: z.boolean().describe('true if no error-level issue was found'),
  issues: z.array(
    z.object({
      severity: z.enum(['error', 'warning', 'info']),
      section: z.string(),
      message: z.string(),
    }),
  ),
})
export type VerifyOut = z.infer<typeof VerifySchema>
