import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import {
  Activity,
  ArrowLeft,
  BookOpenCheck,
  ChevronDown,
  ChevronUp,
  CircleX,
  FileText,
  Info,
  LoaderCircle,
  Lock,
  Maximize2,
  Minimize2,
  ScanSearch,
  ScrollText,
  ShieldCheck,
} from 'lucide-react'
import type { Case } from '../types'
import { useCase, useCases } from '../store/cases'
import { href } from '../lib/router'
import { LATERALITY_LABEL, MODALITY_LABEL, REGION_LABEL } from '../lib/labels'
import { LATERALITY_SHORT, MODALITY_SHORT, ageBand, plural } from '../lib/labels-findings'
import { formatDate, formatDateTime, formatTime } from '../lib/util'
import { Viewer, type FocusRequest } from '../components/viewer/Viewer'
import { SeriesPanel } from '../components/viewer/SeriesPanel'
import { ClassChip } from '../components/viewer/ClassChip'
import { findingCodes, isLocked, navigableFindings, primaryLocation, reviewProgress, studyClass } from '../components/viewer/findingModel'
import { FindingsPanel, type FindingActionRequest } from '../components/analysis/FindingsPanel'
import { AnalyseButton, PipelinePanel, pipelineProgress, useAnalysisRun } from '../components/analysis/PipelinePanel'
import { EvidencePanel } from '../components/analysis/EvidencePanel'
import { ReportPanel } from '../components/report/ReportPanel'
import '../styles/workspace.css'

type Tab = 'findings' | 'evidence' | 'report' | 'analysis' | 'info' | 'audit'
type Sheet = 'min' | 'half' | 'full'

const TAB_LABEL: Record<Tab, string> = {
  findings: 'Achados',
  evidence: 'Evidência',
  report: 'Relatório',
  analysis: 'Análise',
  info: 'Caso',
  audit: 'Registo',
}

const TAB_ORDER: Tab[] = ['findings', 'evidence', 'report', 'analysis', 'info', 'audit']

function useMediaQuery(query: string): boolean {
  const [match, setMatch] = useState(() => (typeof window !== 'undefined' ? window.matchMedia(query).matches : false))
  useEffect(() => {
    const mq = window.matchMedia(query)
    const on = () => setMatch(mq.matches)
    on()
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [query])
  return match
}

// ---------------------------------------------------------------------------

function CaseInfo({ c }: { c: Case }) {
  return (
    <div className="wsx-info">
      <dl>
        <div>
          <dt>ID pseudonimizado</dt>
          <dd className="mono">{c.pseudoId}</dd>
        </div>
        <div>
          <dt>Sexo · faixa etária</dt>
          <dd>
            {c.sex ?? '—'} · {ageBand(c.ageYears)}
          </dd>
        </div>
        <div>
          <dt>Prioridade</dt>
          <dd>{c.priority === 'urgent' ? 'Urgente' : 'Normal'}</dd>
        </div>
        <div>
          <dt>Criado</dt>
          <dd>{formatDateTime(c.createdAt)}</dd>
        </div>
        <div>
          <dt>Indicação clínica</dt>
          <dd>{c.indication || '—'}</dd>
        </div>
      </dl>
      <h3>Séries</h3>
      {c.series.map((s, i) => (
        <div key={s.id} className="evidence">
          <div style={{ fontWeight: 600 }}>
            Série {i + 1} · {s.description}
          </div>
          <div className="subtle">
            {MODALITY_LABEL[s.modality]} · {REGION_LABEL[s.region]} · {plural(s.frames.length, 'imagem', 'imagens')}
            {s.laterality && s.laterality !== 'unknown' ? ` · ${LATERALITY_LABEL[s.laterality]}` : ''}
            {s.durationSec ? ` · clip ${formatTime(s.durationSec)}` : ''}
          </div>
          {s.removedTags && s.removedTags.length > 0 && (
            <div className="subtle" style={{ marginTop: 4 }}>
              Anonimização: {plural(s.removedTags.length, 'etiqueta identificativa removida', 'etiquetas identificativas removidas')}.
            </div>
          )}
        </div>
      ))}
      {c.teachingPoint && (
        <details className="evidence" style={{ marginTop: 'var(--sp-3)' }}>
          <summary style={{ cursor: 'pointer', fontWeight: 600 }}>Ponto de ensino (descrição da fonte) — abrir só depois de ler as imagens</summary>
          <p className="muted" style={{ margin: '8px 0 0' }}>{c.teachingPoint}</p>
        </details>
      )}
      {c.attribution && c.attribution.length > 0 && (
        <>
          <h3>Origem das imagens (licença aberta)</h3>
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
        </>
      )}
    </div>
  )
}

function AuditLog({ c }: { c: Case }) {
  return (
    <ol className="wsx-audit">
      {[...c.audit].reverse().map((a, i) => (
        <li key={i}>
          <div className="row" style={{ justifyContent: 'space-between', gap: 8 }}>
            <span style={{ fontWeight: 600 }}>{a.action}</span>
            <span className={`badge ${a.actor === 'ai' ? 'badge-ai' : a.actor === 'user' ? 'badge-info' : 'badge-neutral'}`}>
              {a.actor === 'ai' ? 'IA' : a.actor === 'user' ? 'Clínico' : 'Sistema'}
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

function CaseHeader({ c }: { c: Case }) {
  const { running } = useAnalysisRun(c)
  const s0 = c.series[0]
  const modalities = [...new Set(c.series.map((s) => MODALITY_SHORT[s.modality]))].join(' + ')
  const region = s0 ? `${REGION_LABEL[s0.region]}${s0.laterality ? ` ${LATERALITY_SHORT[s0.laterality]}` : ''}`.trim() : ''
  const meta = [`${c.sex ?? '—'} · ${ageBand(c.ageYears)}`, region, modalities, formatDate(c.createdAt)].filter(Boolean).join(' · ')
  const removed = c.series.reduce((n, s) => n + (s.removedTags?.length ?? 0), 0)
  const stages = c.analysis?.stages ?? []
  const done = stages.filter((s) => s.status === 'done' || s.status === 'skipped').length
  const progress = pipelineProgress(c)
  return (
    <header className="wsx-head">
      <a className="btn btn-ghost btn-sm btn-icon wsx-back" href={href({ name: 'worklist' })} aria-label="Voltar à lista de trabalho" title="Voltar à lista de trabalho">
        <ArrowLeft size={18} aria-hidden />
      </a>
      <div className="wsx-head-main">
        <h1 className="wsx-head-id">
          <span className="mono">{c.pseudoId}</span>
          <span className="wsx-head-title">{c.title}</span>
        </h1>
        <p className="wsx-head-meta">
          <span>{meta}</span>
          {c.indication && (
            <span className="wsx-head-q" title={c.indication}>
              {' '}
              · «{c.indication}»
            </span>
          )}
        </p>
      </div>
      <div className="wsx-head-chips">
        {c.priority === 'urgent' && <span className="badge badge-critical">Urgente</span>}
        {c.isDemo && <span className="badge badge-info wsx-hide-sm">Demonstração</span>}
        <span
          className="wsx-chip is-ok wsx-hide-sm"
          title={`Identificador pseudonimizado${removed ? `; ${plural(removed, 'etiqueta DICOM identificativa removida', 'etiquetas DICOM identificativas removidas')}` : ''}. Confirme que a imagem não tem texto identificativo gravado.`}
        >
          <ShieldCheck size={13} aria-hidden /> Anonimizado
        </span>
        {c.report?.status === 'validated' ? (
          <span className="wsx-chip is-ok">
            <Lock size={12} aria-hidden /> Validado
          </span>
        ) : c.report ? (
          <span className="wsx-chip is-ai" title="Rascunho gerado por IA — verificar">
            Rascunho IA
          </span>
        ) : null}
        {running && (
          <span className="wsx-chip is-run" role="status">
            <LoaderCircle size={12} className="spin" aria-hidden /> A analisar… {stages.length ? `${done}/${stages.length}` : ''}
          </span>
        )}
        {!running && c.status === 'error' && (
          <span className="wsx-chip is-err">
            <CircleX size={12} aria-hidden /> Erro na análise
          </span>
        )}
      </div>
      {!c.analysis && !running && c.status !== 'validated' && (
        <span className="wsx-head-cta">
          <AnalyseButton c={c} className="btn btn-primary btn-sm" />
        </span>
      )}
      {running && (
        <div className="wsx-progress" role="progressbar" aria-label="Progresso da análise" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)}>
          <i style={{ width: `${Math.max(4, progress * 100)}%` }} />
        </div>
      )}
    </header>
  )
}

// ---------------------------------------------------------------------------

export function CaseWorkspace({ id }: { id: string }) {
  // Keyed by case id so every case opens fresh: AI overlays off, first series, «Achados» tab.
  return <Workspace key={id} id={id} />
}

function Workspace({ id }: { id: string }) {
  const c = useCase(id)
  const acceptFinding = useCases((s) => s.acceptFinding)
  const mobile = useMediaQuery('(max-width: 860px)')
  const [seriesId, setSeriesId] = useState<string | undefined>()
  const [frameIndex, setFrameIndex] = useState(0)
  const [tab, setTab] = useState<Tab>(() => (c?.status === 'analysing' ? 'analysis' : 'findings'))
  const [selectedId, setSelectedId] = useState<string | undefined>()
  const [hoveredId, setHoveredId] = useState<string | undefined>()
  const [aiVisible, setAiVisible] = useState(false)
  const [revealedId, setRevealedId] = useState<string | undefined>()
  const [focus, setFocus] = useState<FocusRequest | undefined>()
  const [actionReq, setActionReq] = useState<FindingActionRequest | undefined>()
  const [sheet, setSheet] = useState<Sheet>(() => (c?.status === 'analysing' ? 'half' : 'min'))
  const nonce = useRef(0)
  const { running } = useAnalysisRun(c)

  const series = c?.series.find((s) => s.id === seriesId) ?? c?.series[0]
  const seriesNumber = c && series ? c.series.indexOf(series) + 1 : 0
  const fi = Math.min(frameIndex, Math.max(0, (series?.frames.length ?? 1) - 1))
  const findings = useMemo(() => c?.analysis?.findings ?? [], [c?.analysis?.findings])
  const codes = useMemo(() => findingCodes(findings), [findings])
  const nav = useMemo(() => navigableFindings(findings, codes), [findings, codes])
  const navIndex = nav.findIndex((f) => f.id === selectedId)

  // «Análise» takes focus while a run is in progress; «Achados» comes back when it finishes.
  const prevStatus = useRef(c?.status)
  useEffect(() => {
    const prev = prevStatus.current
    prevStatus.current = c?.status
    if (c?.status === 'analysing' && prev !== 'analysing') {
      setTab('analysis')
      setSheet((s) => (s === 'min' ? 'half' : s))
    } else if (prev === 'analysing' && c?.status === 'analysed') {
      setTab((t) => (t === 'analysis' ? 'findings' : t))
    }
  }, [c?.status])

  const selectFinding = useCallback(
    (fid: string, source: 'list' | 'viewer' | 'nav') => {
      const f = c?.analysis?.findings.find((x) => x.id === fid)
      if (!c || !f) return
      setSelectedId(fid)
      if (!aiVisible) setRevealedId(fid)
      const loc = primaryLocation(f, c.series)
      if (source !== 'viewer' && loc) {
        setSeriesId(loc.seriesId)
        setFrameIndex(loc.bbox ? loc.frameIndex : (f.frameRange?.[0] ?? loc.frameIndex))
      }
      nonce.current += 1
      setFocus({ id: fid, nonce: nonce.current, zoom: source !== 'viewer' })
      if (source !== 'list') setTab('findings')
      if (mobile) setSheet((s) => (source === 'viewer' ? (s === 'min' ? 'half' : s) : s === 'full' ? 'half' : s))
    },
    [c, aiVisible, mobile],
  )

  // Opening the sheet (mobile) brings the selected row into view.
  useEffect(() => {
    if (sheet === 'min') return
    const id = window.requestAnimationFrame(() => document.querySelector('.fp-row.is-sel')?.scrollIntoView({ block: 'nearest' }))
    return () => window.cancelAnimationFrame(id)
  }, [sheet])

  const navigateFindings = (dir: 1 | -1) => {
    if (!nav.length) return
    const i = navIndex < 0 ? (dir === 1 ? 0 : nav.length - 1) : (navIndex + dir + nav.length) % nav.length
    selectFinding(nav[i].id, 'nav')
  }

  const toggleAi = () => {
    setAiVisible((v) => !v)
    setRevealedId(undefined)
  }

  const onFindingKey = (kind: 'accept' | 'reject' | 'edit') => {
    if (!c || !selectedId || isLocked(c)) return
    const f = findings.find((x) => x.id === selectedId)
    if (!f || f.group === 'checklist' || f.status === 'rejected') return
    if (kind === 'accept') {
      if (f.status !== 'accepted' && f.status !== 'edited') acceptFinding(c.id, f.id)
      return
    }
    setTab('findings')
    if (mobile) setSheet((s) => (s === 'min' ? 'half' : s))
    nonce.current += 1
    setActionReq({ id: f.id, kind, nonce: nonce.current })
  }

  const stepSeries = (dir: 1 | -1) => {
    if (!c || !series) return
    const i = c.series.indexOf(series)
    const next = c.series[Math.min(c.series.length - 1, Math.max(0, i + dir))]
    if (next && next.id !== series.id) {
      setSeriesId(next.id)
      setFrameIndex(0)
    }
  }

  // Sheet (mobile): tap toggles, vertical swipe steps between the three heights.
  const swipe = useRef<{ y: number; swiped: boolean } | null>(null)
  const onHandleDown = (e: ReactPointerEvent) => {
    swipe.current = { y: e.clientY, swiped: false }
  }
  const onHandleUp = (e: ReactPointerEvent) => {
    const s = swipe.current
    if (!s) return
    const dy = e.clientY - s.y
    if (Math.abs(dy) > 28) {
      s.swiped = true
      setSheet((cur) => (dy < 0 ? (cur === 'min' ? 'half' : 'full') : cur === 'full' ? 'half' : 'min'))
    }
  }
  const onHandleClick = () => {
    if (swipe.current?.swiped) {
      swipe.current = null
      return
    }
    swipe.current = null
    setSheet((cur) => (cur === 'min' ? 'half' : cur === 'half' ? 'min' : 'half'))
  }

  const onTabKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight' && e.key !== 'Home' && e.key !== 'End') return
    e.preventDefault()
    e.stopPropagation()
    const i = TAB_ORDER.indexOf(tab)
    const next = e.key === 'Home' ? 0 : e.key === 'End' ? TAB_ORDER.length - 1 : (i + (e.key === 'ArrowRight' ? 1 : -1) + TAB_ORDER.length) % TAB_ORDER.length
    setTab(TAB_ORDER[next])
    document.getElementById(`wsx-tab-${TAB_ORDER[next]}`)?.focus()
  }

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

  const sc = studyClass(c.analysis)
  const { pending } = reviewProgress(findings)
  const nEvidence = (c.analysis?.evidence.length ?? 0) + (c.analysis?.notebookLm.length ?? 0)
  const tabIcon: Record<Tab, ReactNode> = {
    findings: <ScanSearch size={17} aria-hidden />,
    evidence: <BookOpenCheck size={17} aria-hidden />,
    report: <FileText size={17} aria-hidden />,
    analysis: running ? <LoaderCircle size={17} className="spin" aria-hidden /> : <Activity size={17} aria-hidden />,
    info: <Info size={17} aria-hidden />,
    audit: <ScrollText size={17} aria-hidden />,
  }
  const tabCount: Partial<Record<Tab, number>> = {
    findings: c.analysis ? (pending.length || undefined) : undefined,
    evidence: nEvidence || undefined,
  }
  const reviewable = findings.filter((f) => f.group !== 'checklist').length
  const handleText = running
    ? 'Análise em curso'
    : !c.analysis
      ? 'Sem análise de IA'
      : pending.length
        ? plural(pending.length, 'achado por rever', 'achados por rever')
        : reviewable
          ? 'Achados revistos'
          : 'Sem achados para rever'

  return (
    <div className={`wsx ${mobile ? 'is-mobile' : ''} sheet-${sheet} ${c.series.length > 1 ? 'has-many' : 'has-one'}`}>
      <CaseHeader c={c} />
      <div className="wsx-body">
        <aside className="wsx-series">
          <SeriesPanel
            c={c}
            activeId={series?.id}
            onSelect={(sid) => {
              setSeriesId(sid)
              setFrameIndex(0)
            }}
          />
        </aside>

        <section className="wsx-center" aria-label="Visualizador">
          <Viewer
            c={c}
            series={series}
            seriesNumber={seriesNumber}
            frameIndex={fi}
            onFrameIndex={setFrameIndex}
            onSeriesStep={stepSeries}
            codes={codes}
            aiVisible={aiVisible}
            onToggleAi={toggleAi}
            revealedId={revealedId}
            selectedId={selectedId}
            hoveredId={hoveredId}
            onHover={setHoveredId}
            onSelectFinding={(fid) => selectFinding(fid, 'viewer')}
            onNavigate={navigateFindings}
            navIndex={navIndex}
            navTotal={nav.length}
            focus={focus}
            onFindingKey={onFindingKey}
          />
        </section>

        <aside className="wsx-side" aria-label="Painel do caso">
          {mobile && (
            <div className="wsx-handle" onPointerDown={onHandleDown} onPointerUp={onHandleUp}>
              <span className="wsx-grabber" aria-hidden />
              <div className="wsx-handle-row">
                <button
                  type="button"
                  className="wsx-handle-btn"
                  aria-expanded={sheet !== 'min'}
                  aria-controls="wsx-sheet"
                  onClick={onHandleClick}
                  aria-label={`${sheet === 'min' ? 'Abrir' : 'Recolher'} painel: ${TAB_LABEL[tab]}. ${handleText}`}
                >
                  {running ? (
                    <span className="wsx-chip is-run">
                      <LoaderCircle size={12} className="spin" aria-hidden /> IA
                    </span>
                  ) : sc ? (
                    <ClassChip cls={sc} small />
                  ) : (
                    <span className="badge badge-neutral">Sem IA</span>
                  )}
                  <span className="wsx-handle-text">
                    <strong>{TAB_LABEL[tab]}</strong> · {handleText}
                  </span>
                  {sheet === 'min' ? <ChevronUp size={18} aria-hidden /> : <ChevronDown size={18} aria-hidden />}
                </button>
                {sheet !== 'min' && (
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm btn-icon"
                    aria-label={sheet === 'full' ? 'Reduzir painel' : 'Expandir painel'}
                    title={sheet === 'full' ? 'Reduzir painel' : 'Expandir painel'}
                    onClick={() => setSheet((s) => (s === 'full' ? 'half' : 'full'))}
                  >
                    {sheet === 'full' ? <Minimize2 size={16} aria-hidden /> : <Maximize2 size={16} aria-hidden />}
                  </button>
                )}
              </div>
            </div>
          )}
          <div id="wsx-sheet" className="wsx-sheet">
            <div className="wsx-tabs" role="tablist" aria-label="Secções do caso" onKeyDown={onTabKey}>
              {TAB_ORDER.map((t) => (
                <button
                  key={t}
                  id={`wsx-tab-${t}`}
                  type="button"
                  role="tab"
                  className="wsx-tab"
                  aria-selected={tab === t}
                  aria-controls="wsx-tabpanel"
                  tabIndex={tab === t ? 0 : -1}
                  onClick={() => {
                    setTab(t)
                    if (mobile) setSheet((s) => (s === 'min' ? 'half' : s))
                  }}
                >
                  <span className="wsx-tab-ic">
                    {tabIcon[t]}
                    {tabCount[t] !== undefined && <span className={`wsx-tab-count ${t === 'findings' ? 'is-pending' : ''}`}>{tabCount[t]}</span>}
                  </span>
                  <span className="wsx-tab-label">{TAB_LABEL[t]}</span>
                </button>
              ))}
            </div>
            <div key={tab} id="wsx-tabpanel" className="wsx-panel" role="tabpanel" aria-labelledby={`wsx-tab-${tab}`}>
              {tab === 'findings' && (
                <FindingsPanel
                  c={c}
                  codes={codes}
                  selectedId={selectedId}
                  hoveredId={hoveredId}
                  onSelect={(fid) => selectFinding(fid, 'list')}
                  onHover={setHoveredId}
                  actionRequest={actionReq}
                  onOpenTab={setTab}
                />
              )}
              {tab === 'evidence' && <EvidencePanel c={c} onSelectFinding={(fid) => selectFinding(fid, 'list')} />}
              {tab === 'report' && <ReportPanel c={c} />}
              {tab === 'analysis' && <PipelinePanel c={c} />}
              {tab === 'info' && <CaseInfo c={c} />}
              {tab === 'audit' && <AuditLog c={c} />}
            </div>
          </div>
        </aside>
      </div>
    </div>
  )
}
