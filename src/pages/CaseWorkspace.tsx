import { useCallback, useMemo, useState } from 'react'
import { ArrowLeft, BookMarked, FileText, History, Info, ListChecks } from 'lucide-react'
import type { Case, Finding } from '../types'
import { useCase } from '../store/cases'
import { href } from '../lib/router'
import { LATERALITY_LABEL, MODALITY_LABEL, REGION_LABEL, STATUS_BADGE, STATUS_LABEL } from '../lib/labels'
import { formatDateTime, formatTime } from '../lib/util'
import { Viewer, type OverlayBox } from '../components/viewer/Viewer'
import { FindingsPanel } from '../components/analysis/FindingsPanel'
import { EvidencePanel } from '../components/analysis/EvidencePanel'
import { ReportPanel } from '../components/report/ReportPanel'

type Tab = 'findings' | 'evidence' | 'report' | 'info' | 'audit'

const SEVERITY_COLOR: Record<Finding['severity'], string> = {
  critical: '#ff4d4f',
  significant: '#ffa940',
  minor: '#fadb14',
  normal: '#52c41a',
}

function CaseInfo({ c }: { c: Case }) {
  return (
    <div style={{ display: 'grid', gap: 'var(--sp-4)' }}>
      <dl style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '6px 16px', margin: 0, fontSize: 'var(--fs-sm)' }}>
        <dt className="subtle">ID pseudonimizado</dt>
        <dd className="mono" style={{ margin: 0 }}>
          {c.pseudoId}
        </dd>
        <dt className="subtle">Idade / sexo</dt>
        <dd style={{ margin: 0 }}>
          {c.ageYears ? `${c.ageYears} anos` : '—'} / {c.sex ?? '—'}
        </dd>
        <dt className="subtle">Prioridade</dt>
        <dd style={{ margin: 0 }}>{c.priority === 'urgent' ? 'Urgente' : 'Normal'}</dd>
        <dt className="subtle">Criado</dt>
        <dd style={{ margin: 0 }}>{formatDateTime(c.createdAt)}</dd>
        <dt className="subtle">Indicação</dt>
        <dd style={{ margin: 0 }}>{c.indication || '—'}</dd>
      </dl>
      <div>
        <h3 style={{ fontSize: 'var(--fs-sm)', marginBottom: 8 }}>Séries</h3>
        {c.series.map((s) => (
          <div key={s.id} className="evidence">
            <div style={{ fontWeight: 600 }}>{s.description}</div>
            <div className="subtle">
              {MODALITY_LABEL[s.modality]} · {REGION_LABEL[s.region]} · {s.frames.length} imagem(ns)
              {s.laterality && s.laterality !== 'unknown' ? ` · ${LATERALITY_LABEL[s.laterality]}` : ''}
              {s.durationSec ? ` · clip ${formatTime(s.durationSec)}` : ''}
            </div>
            {s.removedTags && s.removedTags.length > 0 && (
              <div className="subtle" style={{ marginTop: 4 }}>
                Anonimização: {s.removedTags.length} atributo(s) identificável(eis) descartado(s).
              </div>
            )}
          </div>
        ))}
      </div>
      {c.attribution && c.attribution.length > 0 && (
        <div>
          <h3 style={{ fontSize: 'var(--fs-sm)', marginBottom: 8 }}>Origem das imagens (licença aberta)</h3>
          {c.attribution.map((a, i) => (
            <p key={i} className="subtle" style={{ fontSize: 'var(--fs-xs)', margin: '0 0 6px' }}>
              {a.text}{' '}
              <a href={a.sourceUrl} target="_blank" rel="noreferrer">
                fonte
              </a>{' '}
              ·{' '}
              <a href={a.licenseUrl} target="_blank" rel="noreferrer">
                {a.license}
              </a>
            </p>
          ))}
        </div>
      )}
    </div>
  )
}

function AuditLog({ c }: { c: Case }) {
  return (
    <ol style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 8 }}>
      {[...c.audit].reverse().map((a, i) => (
        <li key={i} className="evidence" style={{ marginBottom: 0 }}>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <span style={{ fontWeight: 600 }}>{a.action}</span>
            <span className={`badge ${a.actor === 'ai' ? 'badge-ai' : a.actor === 'user' ? 'badge-info' : 'badge-neutral'}`}>
              {a.actor === 'ai' ? 'IA' : a.actor === 'user' ? 'Utilizador' : 'Sistema'}
            </span>
          </div>
          {a.detail && <div className="muted">{a.detail}</div>}
          <div className="mono subtle" style={{ fontSize: 'var(--fs-xs)' }}>
            {formatDateTime(a.at)}
          </div>
        </li>
      ))}
    </ol>
  )
}

export function CaseWorkspace({ id }: { id: string }) {
  const c = useCase(id)
  const [seriesId, setSeriesId] = useState<string | undefined>(undefined)
  const [frameIndex, setFrameIndex] = useState(0)
  const [tab, setTab] = useState<Tab>('findings')
  const [selectedFinding, setSelectedFinding] = useState<string | undefined>()

  const series = c?.series.find((s) => s.id === seriesId) ?? c?.series[0]

  const selectFinding = useCallback(
    (fid: string) => {
      setSelectedFinding(fid)
      const f = c?.analysis?.findings.find((x) => x.id === fid)
      const loc = f?.locations[0]
      if (loc) {
        setSeriesId(loc.seriesId)
        setFrameIndex(loc.frameIndex)
      }
      setTab('findings')
    },
    [c],
  )

  const overlays: OverlayBox[] = useMemo(() => {
    if (!c?.analysis || !series) return []
    const out: OverlayBox[] = []
    c.analysis.findings.forEach((f, i) => {
      if (f.status === 'rejected') return
      for (const loc of f.locations) {
        if (loc.seriesId !== series.id || loc.frameIndex !== frameIndex || !loc.bbox) continue
        out.push({
          id: f.id,
          bbox: loc.bbox,
          label: `${i + 1}. ${f.label}`,
          color: SEVERITY_COLOR[f.severity],
          selected: f.id === selectedFinding,
          dashed: f.certainty !== 'consistent-with',
        })
      }
    })
    return out
  }, [c, series, frameIndex, selectedFinding])

  if (!c) {
    return (
      <div className="page">
        <div className="empty">
          <div>Caso não encontrado nesta sessão. Os estudos carregados ficam apenas em memória e desaparecem ao recarregar a página.</div>
          <a className="btn" href={href({ name: 'worklist' })}>
            <ArrowLeft size={16} /> Voltar à lista de trabalho
          </a>
        </div>
      </div>
    )
  }

  const nFindings = c.analysis?.findings.length ?? 0
  const nEvidence = c.analysis?.evidence.length ?? 0

  return (
    <div style={{ display: 'grid', gridTemplateRows: 'auto 1fr', height: '100%', minHeight: 0 }}>
      <div className="case-header">
        <a className="btn btn-ghost btn-sm" href={href({ name: 'worklist' })} aria-label="Voltar">
          <ArrowLeft size={16} />
        </a>
        <span className="mono subtle">{c.pseudoId}</span>
        <h1>{c.title}</h1>
        <span className={`badge ${STATUS_BADGE[c.status]}`}>{STATUS_LABEL[c.status]}</span>
        {c.priority === 'urgent' && <span className="badge badge-critical">Urgente</span>}
        {c.isDemo && <span className="badge badge-info">Caso de demonstração</span>}
        <span className="muted" style={{ marginLeft: 'auto', fontSize: 'var(--fs-sm)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '40%' }} title={c.indication}>
          {c.indication}
        </span>
      </div>

      <div className="workspace">
        <aside className="ws-series" aria-label="Séries">
          {c.series.map((s) => (
            <button
              key={s.id}
              className="series-thumb"
              aria-pressed={s.id === series?.id}
              onClick={() => {
                setSeriesId(s.id)
                setFrameIndex(0)
              }}
              title={s.description}
            >
              <img src={s.frames[0]?.url} alt="" />
              <span>
                {MODALITY_LABEL[s.modality]}
                {s.frames.length > 1 ? ` · ${s.frames.length}` : ''}
              </span>
            </button>
          ))}
        </aside>

        <section className="ws-center" aria-label="Visualizador">
          <Viewer
            series={series}
            frameIndex={Math.min(frameIndex, (series?.frames.length ?? 1) - 1)}
            onFrameIndex={setFrameIndex}
            overlays={overlays}
            onSelectOverlay={selectFinding}
            cornerTopLeft={`${c.pseudoId}\n${c.ageYears ? `${c.ageYears} A` : ''}${c.sex ? ` ${c.sex}` : ''}\n${formatDateTime(c.createdAt)}`}
            cornerBottomRight={c.analysis ? `IA: ${overlays.length} marcação(ões)\nSugestões — verificar` : ''}
          />
        </section>

        <aside className="ws-side" aria-label="Análise">
          <div className="tabs" role="tablist">
            <button className="tab" role="tab" aria-selected={tab === 'findings'} onClick={() => setTab('findings')}>
              <ListChecks size={15} /> Achados {nFindings > 0 && <span className="count">{nFindings}</span>}
            </button>
            <button className="tab" role="tab" aria-selected={tab === 'evidence'} onClick={() => setTab('evidence')}>
              <BookMarked size={15} /> Evidência {nEvidence > 0 && <span className="count">{nEvidence}</span>}
            </button>
            <button className="tab" role="tab" aria-selected={tab === 'report'} onClick={() => setTab('report')}>
              <FileText size={15} /> Relatório
            </button>
            <button className="tab" role="tab" aria-selected={tab === 'info'} onClick={() => setTab('info')} aria-label="Informação do caso">
              <Info size={15} />
            </button>
            <button className="tab" role="tab" aria-selected={tab === 'audit'} onClick={() => setTab('audit')} aria-label="Registo de auditoria">
              <History size={15} />
            </button>
          </div>
          <div className="tab-panel" role="tabpanel">
            {tab === 'findings' && <FindingsPanel c={c} selectedId={selectedFinding} onSelect={selectFinding} />}
            {tab === 'evidence' && <EvidencePanel c={c} />}
            {tab === 'report' && <ReportPanel c={c} />}
            {tab === 'info' && <CaseInfo c={c} />}
            {tab === 'audit' && <AuditLog c={c} />}
          </div>
        </aside>
      </div>
    </div>
  )
}

