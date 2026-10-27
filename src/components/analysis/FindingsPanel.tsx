import { useState } from 'react'
import { AlertTriangle, Check, CircleCheck, CircleDot, CircleX, KeyRound, LoaderCircle, Sparkles, X } from 'lucide-react'
import type { Case, Finding, StageState } from '../../types'
import { useCases } from '../../store/cases'
import { isVlmConfigured, useSettings } from '../../store/settings'
import { runAnalysis } from '../../lib/vlm/run'
import { href } from '../../lib/router'
import {
  CERTAINTY_LABEL,
  CERTAINTY_RANGE,
  FINDING_STATUS_LABEL,
  LATERALITY_LABEL,
  MODALITY_LABEL,
  REGION_LABEL,
  SEVERITY_BADGE,
  SEVERITY_LABEL,
  STAGE_LABEL,
} from '../../lib/labels'
import { errorMessage, formatDuration } from '../../lib/util'

function StageIcon({ s }: { s: StageState }) {
  if (s.status === 'running') return <LoaderCircle size={16} className="spin" style={{ color: 'var(--accent)' }} />
  if (s.status === 'done') return <CircleCheck size={16} style={{ color: 'var(--normal)' }} />
  if (s.status === 'error') return <CircleX size={16} style={{ color: 'var(--critical)' }} />
  if (s.status === 'skipped') return <CircleDot size={16} style={{ color: 'var(--text-3)' }} />
  return <CircleDot size={16} style={{ color: 'var(--border-strong)' }} />
}

export function Pipeline({ stages }: { stages: StageState[] }) {
  return (
    <div className="pipeline" aria-label="Etapas da análise">
      {stages.map((s) => {
        const ms = s.startedAt && s.finishedAt ? new Date(s.finishedAt).getTime() - new Date(s.startedAt).getTime() : undefined
        return (
          <div key={s.id} className={`stage ${s.status}`}>
            <StageIcon s={s} />
            <div>
              <div>{STAGE_LABEL[s.id]}</div>
              {s.message && <div className="subtle" style={{ fontSize: 'var(--fs-xs)' }}>{s.message}</div>}
            </div>
            <span className="meta">
              {ms !== undefined ? formatDuration(ms) : ''}
              {s.usage ? ` · ${(s.usage.inputTokens / 1000).toFixed(1)}k/${(s.usage.outputTokens / 1000).toFixed(1)}k tok` : ''}
            </span>
          </div>
        )
      })}
    </div>
  )
}

function FindingCard({ c, f, n, selected, onSelect }: { c: Case; f: Finding; n: number; selected: boolean; onSelect: () => void }) {
  const setStatus = useCases((s) => s.setFindingStatus)
  const updateFinding = useCases((s) => s.updateFinding)
  const lang = c.analysis?.language ?? 'pt-PT'
  const [editing, setEditing] = useState(false)
  const [note, setNote] = useState(f.clinicianNote ?? '')
  const locked = c.status === 'validated'

  return (
    <article
      className={`finding sev-${f.severity} ${selected ? 'selected' : ''} ${f.status === 'rejected' ? 'rejected' : ''}`}
      onClick={onSelect}
      aria-current={selected}
    >
      <div className="finding-head">
        <div>
          <div className="finding-title">
            {n}. {f.label}
          </div>
          <div className="subtle" style={{ fontSize: 'var(--fs-xs)', marginTop: 2 }}>
            {f.anatomicSite}
            {f.laterality !== 'none' && f.laterality !== 'unknown' ? ` · ${LATERALITY_LABEL[f.laterality]}` : ''}
          </div>
        </div>
        <span className={`badge ${SEVERITY_BADGE[f.severity]}`}>{SEVERITY_LABEL[f.severity]}</span>
      </div>
      <p>{f.description}</p>
      <div className="row" style={{ gap: 8 }}>
        <span className="badge badge-ai" title={`Probabilidade aproximada: ${CERTAINTY_RANGE[f.certainty]}`}>
          {CERTAINTY_LABEL[lang][f.certainty]}
        </span>
        {f.classification && (
          <span className="badge badge-info" title={f.classification.rationale}>
            {f.classification.system}: {f.classification.grade}
          </span>
        )}
        <span className="confidence" title="Confiança auto-reportada pelo modelo — não calibrada">
          <span className="bar">
            <i style={{ width: `${Math.round(f.confidence * 100)}%` }} />
          </span>
          {Math.round(f.confidence * 100)}%
        </span>
        {f.status !== 'pending' && <span className={`badge ${f.status === 'rejected' ? 'badge-critical' : 'badge-normal'}`}>{FINDING_STATUS_LABEL[f.status]}</span>}
      </div>
      {f.clinicianNote && !editing && (
        <p style={{ borderLeft: '2px solid var(--info)', paddingLeft: 8 }}>
          <strong style={{ color: 'var(--info)' }}>Nota do médico:</strong> {f.clinicianNote}
        </p>
      )}
      {editing && (
        <div onClick={(e) => e.stopPropagation()} style={{ marginTop: 8 }}>
          <textarea className="textarea" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Correção ou comentário clínico…" aria-label="Nota do médico" />
          <div className="row" style={{ marginTop: 6, gap: 6 }}>
            <button
              className="btn btn-sm btn-primary"
              onClick={() => {
                updateFinding(c.id, f.id, { clinicianNote: note.trim() || undefined })
                setStatus(c.id, f.id, 'edited', note.trim())
                setEditing(false)
              }}
            >
              Guardar nota
            </button>
            <button className="btn btn-sm btn-ghost" onClick={() => setEditing(false)}>
              Cancelar
            </button>
          </div>
        </div>
      )}
      {!locked && !editing && (
        <div className="finding-actions" onClick={(e) => e.stopPropagation()}>
          <button className="btn btn-sm" aria-pressed={f.status === 'accepted'} onClick={() => setStatus(c.id, f.id, 'accepted')}>
            <Check size={14} /> Aceitar
          </button>
          <button className="btn btn-sm" aria-pressed={f.status === 'rejected'} onClick={() => setStatus(c.id, f.id, 'rejected')}>
            <X size={14} /> Rejeitar
          </button>
          <button className="btn btn-sm btn-ghost" onClick={() => setEditing(true)}>
            Anotar
          </button>
        </div>
      )}
    </article>
  )
}

export function FindingsPanel({ c, selectedId, onSelect }: { c: Case; selectedId?: string; onSelect: (id: string) => void }) {
  const settings = useSettings()
  const audit = useCases((s) => s.audit)
  const [error, setError] = useState<string | null>(null)
  const configured = isVlmConfigured(settings)
  const a = c.analysis

  const start = async () => {
    setError(null)
    audit(c.id, { actor: 'user', action: 'Análise pedida' })
    try {
      await runAnalysis(c.id).done
    } catch (e) {
      setError(errorMessage(e))
    }
  }

  return (
    <div>
      {a?.precomputed && (
        <div className="callout callout-info" style={{ marginBottom: 'var(--sp-3)' }}>
          <Sparkles size={16} />
          <div>
            Análise de demonstração <strong>pré-calculada</strong> com o mesmo protocolo ({a.model}). Configure um modelo em Definições para
            analisar os seus próprios estudos.
          </div>
        </div>
      )}

      {a && <Pipeline stages={a.stages} />}

      {!a && (
        <div style={{ display: 'grid', gap: 'var(--sp-3)' }}>
          <p className="muted" style={{ margin: 0 }}>
            O modelo de visão-linguagem analisa as imagens e os fotogramas-chave em seis etapas. Cada etapa produz dados estruturados que
            pode rever.
          </p>
          <Pipeline stages={['preprocess', 'triage', 'findings', 'evidence', 'report', 'verify'].map((id) => ({ id: id as StageState['id'], status: 'pending' }))} />
          {!configured && (
            <div className="callout callout-warn">
              <KeyRound size={16} />
              <div>
                Nenhum modelo configurado. <a href={href({ name: 'settings' })}>Abra as Definições</a> para indicar a sua chave da API Anthropic
                ou um servidor local (ex.: MedGemma).
              </div>
            </div>
          )}
          <button className="btn btn-primary" onClick={start} disabled={!configured || c.status === 'analysing'}>
            <Sparkles size={16} /> Analisar com IA
          </button>
        </div>
      )}

      {error && (
        <div className="callout callout-warn" style={{ margin: 'var(--sp-3) 0' }}>
          <AlertTriangle size={16} />
          <div>{error}</div>
        </div>
      )}

      {a?.triage && (
        <div className="evidence" style={{ marginTop: 'var(--sp-3)' }}>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <strong>Triagem</strong>
            <span className={`badge ${a.triage.imageQuality === 'adequate' ? 'badge-normal' : a.triage.imageQuality === 'limited' ? 'badge-significant' : 'badge-critical'}`}>
              Qualidade: {a.triage.imageQuality === 'adequate' ? 'adequada' : a.triage.imageQuality === 'limited' ? 'limitada' : 'não diagnóstica'}
            </span>
          </div>
          <div className="muted" style={{ marginTop: 4 }}>
            {MODALITY_LABEL[a.triage.modality]} · {REGION_LABEL[a.triage.region]} · {a.triage.view}
            {a.triage.laterality !== 'none' && a.triage.laterality !== 'unknown' ? ` · ${LATERALITY_LABEL[a.triage.laterality]}` : ''}
          </div>
          <div className="muted" style={{ marginTop: 4 }}>{a.triage.summary}</div>
          {a.triage.qualityNotes && <div className="subtle" style={{ marginTop: 4 }}>{a.triage.qualityNotes}</div>}
        </div>
      )}

      {a && a.findings.length > 0 && (
        <>
          <div className="callout callout-ai" style={{ margin: 'var(--sp-3) 0' }}>
            <Sparkles size={16} />
            <div>Sugestões geradas por IA. Reveja cada achado — aceite, rejeite ou anote — antes de validar o relatório.</div>
          </div>
          {a.findings.map((f, i) => (
            <FindingCard key={f.id} c={c} f={f} n={i + 1} selected={f.id === selectedId} onSelect={() => onSelect(f.id)} />
          ))}
        </>
      )}

      {a?.verification && a.verification.issues.length > 0 && (
        <div style={{ marginTop: 'var(--sp-4)' }}>
          <h3 style={{ fontSize: 'var(--fs-sm)', marginBottom: 8 }}>Verificação automática</h3>
          {a.verification.issues.map((it, i) => (
            <div key={i} className={`callout ${it.severity === 'error' ? 'callout-warn' : 'callout-info'}`} style={{ marginBottom: 6 }}>
              <AlertTriangle size={14} />
              <div>
                <strong>{it.section}:</strong> {it.message}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
