import { useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { AlertTriangle, ArrowUpDown, FileImage, ImagePlus, Inbox, LoaderCircle, Search, SlidersHorizontal, Upload, X } from 'lucide-react'
import type { Case, Modality, Region } from '../types'
import { useCases } from '../store/cases'
import { useSettings } from '../store/settings'
import { ACCEPTED_FILES, ingestFiles } from '../lib/imaging/ingest'
import { href, navigate } from '../lib/router'
import { MODALITY_LABEL, REGION_LABEL } from '../lib/labels'
import { CASE_RESULT_LABEL, CASE_RESULT_ORDER, MODALITY_ABBR, MODALITY_DICOM, REPORT_STATE_LABEL, type CaseResult, type ReportState } from '../lib/labels-report'
import { caseResult, compareWorklist, reportState, type WorklistSort } from '../lib/report/state'
import { formatDate, formatDateTime, nowIso, uid } from '../lib/util'
import { ReportStateChip, ResultChip } from '../components/report/StatusChips'
import '../styles/report.css'

function pseudoId(): string {
  const n = crypto.getRandomValues(new Uint16Array(1))[0] % 10000
  return `MSK-${String(n).padStart(4, '0')}`
}

function NewCase() {
  const addCase = useCases((s) => s.addCase)
  const maxKeyframes = useSettings((s) => s.maxKeyframes)
  const inputRef = useRef<HTMLInputElement>(null)
  const [files, setFiles] = useState<File[]>([])
  const [indication, setIndication] = useState('')
  const [age, setAge] = useState('')
  const [sex, setSex] = useState<'' | 'F' | 'M' | 'X'>('')
  const [priority, setPriority] = useState<'routine' | 'urgent'>('routine')
  const [busy, setBusy] = useState<{ label: string; fraction: number } | null>(null)
  const [errors, setErrors] = useState<string[]>([])
  const [active, setActive] = useState(false)

  const pick = (list: FileList | null) => {
    if (!list) return
    setFiles((f) => [...f, ...Array.from(list)])
  }

  const create = async () => {
    if (!files.length) return
    setErrors([])
    setBusy({ label: 'A preparar…', fraction: 0 })
    const r = await ingestFiles(files, { maxKeyframes, onProgress: (label, fraction) => setBusy({ label, fraction }) })
    setBusy(null)
    if (!r.series.length) {
      setErrors(r.errors.length ? r.errors : ['Nenhum ficheiro pôde ser carregado.'])
      return
    }
    const c: Case = {
      id: uid('case'),
      pseudoId: pseudoId(),
      title: r.series.map((s) => `${MODALITY_LABEL[s.modality]} ${REGION_LABEL[s.region].toLowerCase()}`).filter((v, i, a) => a.indexOf(v) === i).join(' + '),
      createdAt: nowIso(),
      ageYears: age ? Number(age) : undefined,
      sex: sex || undefined,
      indication: indication.trim(),
      priority,
      status: 'new',
      series: r.series,
      audit: [
        { at: nowIso(), actor: 'system', action: 'Caso criado', detail: `${r.series.length} série(s) carregada(s) localmente` },
        ...r.warnings.map((w) => ({ at: nowIso(), actor: 'system' as const, action: 'Aviso de ingestão', detail: w })),
        ...r.errors.map((w) => ({ at: nowIso(), actor: 'system' as const, action: 'Ficheiro ignorado', detail: w })),
      ],
    }
    addCase(c)
    navigate({ name: 'case', id: c.id })
  }

  return (
    <section className="card card-pad" aria-labelledby="novo-caso">
      <h2 id="novo-caso">Novo estudo</h2>
      <div
        className={`dropzone ${active ? 'active' : ''}`}
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault()
          setActive(true)
        }}
        onDragLeave={() => setActive(false)}
        onDrop={(e) => {
          e.preventDefault()
          setActive(false)
          pick(e.dataTransfer.files)
        }}
      >
        <Upload size={26} aria-hidden />
        <div>
          <strong>Arraste imagens ou vídeos para aqui</strong> ou clique para escolher
        </div>
        <div className="subtle" style={{ fontSize: 'var(--fs-sm)' }}>
          Radiografia / TC / RM (PNG, JPEG, DICOM) · Ecografia e fluoroscopia (MP4, WebM)
        </div>
        <input ref={inputRef} type="file" multiple accept={ACCEPTED_FILES} hidden onChange={(e) => pick(e.target.files)} />
      </div>

      {files.length > 0 && (
        <ul style={{ listStyle: 'none', padding: 0, margin: 'var(--sp-3) 0', display: 'grid', gap: 4 }}>
          {files.map((f, i) => (
            <li key={i} className="row" style={{ justifyContent: 'space-between', fontSize: 'var(--fs-sm)' }}>
              <span className="row" style={{ gap: 6 }}>
                <FileImage size={14} aria-hidden /> {f.name}
              </span>
              <button className="btn btn-ghost btn-sm" onClick={() => setFiles((fs) => fs.filter((_, j) => j !== i))}>
                Remover
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="grid-2" style={{ marginTop: 'var(--sp-4)' }}>
        <label className="field" style={{ gridColumn: '1 / -1' }}>
          <span>Informação clínica / pergunta clínica</span>
          <textarea className="textarea" value={indication} onChange={(e) => setIndication(e.target.value)} placeholder="Ex.: Queda sobre a mão em extensão; dor na tabaqueira anatómica." />
          <small>Não introduza nomes, números de processo ou outros dados identificáveis.</small>
        </label>
        <label className="field">
          <span>Idade (anos)</span>
          <input className="input" inputMode="numeric" value={age} onChange={(e) => setAge(e.target.value.replace(/\D/g, '').slice(0, 3))} />
        </label>
        <label className="field">
          <span>Sexo</span>
          <select className="select" value={sex} onChange={(e) => setSex(e.target.value as typeof sex)}>
            <option value="">—</option>
            <option value="F">Feminino</option>
            <option value="M">Masculino</option>
            <option value="X">Outro / não indicado</option>
          </select>
        </label>
        <label className="field">
          <span>Prioridade</span>
          <select className="select" value={priority} onChange={(e) => setPriority(e.target.value as typeof priority)}>
            <option value="routine">Normal</option>
            <option value="urgent">Urgente</option>
          </select>
        </label>
      </div>

      {errors.length > 0 && (
        <div className="callout callout-warn" style={{ marginBottom: 'var(--sp-3)' }}>
          <AlertTriangle size={16} />
          <div>
            {errors.map((e, i) => (
              <div key={i}>{e}</div>
            ))}
          </div>
        </div>
      )}

      <div className="row" style={{ justifyContent: 'space-between' }}>
        <span className="subtle" style={{ fontSize: 'var(--fs-sm)' }}>
          Os ficheiros DICOM são anonimizados no navegador antes de qualquer análise.
        </span>
        <button className="btn btn-primary" disabled={!files.length || !!busy} onClick={create}>
          {busy ? <LoaderCircle size={16} className="spin" /> : <Upload size={16} />}
          {busy ? `${busy.label} ${Math.round(busy.fraction * 100)}%` : 'Criar estudo'}
        </button>
      </div>
    </section>
  )
}


type SortKey = WorklistSort
type ReportFilter = 'all' | ReportState
type ResultFilter = 'all' | CaseResult

// Default order never depends on the AI: clinician-set urgency first, then upload date.
const SORTS: { id: SortKey; label: string }[] = [
  { id: 'priority', label: 'Prioridade clínica' },
  { id: 'date', label: 'Carregamento (recentes primeiro)' },
  { id: 'result', label: 'Resultado IA (urgentes primeiro)' },
]

function unique<T>(xs: T[]): T[] {
  return xs.filter((v, i, a) => a.indexOf(v) === i)
}

function lateralityShort(c: Case): string {
  const l = c.series.find((s) => s.laterality && s.laterality !== 'unknown' && s.laterality !== 'none')?.laterality
  return l === 'left' ? ' E' : l === 'right' ? ' D' : l === 'bilateral' ? ' bilat.' : ''
}

function imageCount(c: Case): string {
  const videos = c.series.filter((s) => s.kind === 'video').length
  const images = c.series.filter((s) => s.kind !== 'video').reduce((n, s) => n + s.frames.length, 0)
  return (
    [images ? `${images} ${images === 1 ? 'imagem' : 'imagens'}` : '', videos ? `${videos} ${videos === 1 ? 'vídeo' : 'vídeos'}` : ''].filter(Boolean).join(' + ') ||
    '—'
  )
}

function relativeDate(iso: string): string {
  const d = new Date(iso)
  const diff = Date.now() - d.getTime()
  if (Number.isNaN(diff)) return '—'
  const min = Math.round(diff / 60000)
  if (min < 1) return 'agora'
  if (min < 60) return `há ${min} min`
  if (min < 24 * 60 && new Date().toDateString() === d.toDateString()) return `há ${Math.round(min / 60)} h`
  return formatDate(iso)
}

function FilterSelect<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <label className={`rp-filter ${value !== 'all' ? 'active' : ''}`}>
      <span>{label}</span>
      <select className="select" value={value} onChange={(e) => onChange(e.target.value as T)}>
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </label>
  )
}

export function Worklist() {
  const cases = useCases((s) => s.cases)
  const [q, setQ] = useState('')
  const [modality, setModality] = useState<'all' | Modality>('all')
  const [region, setRegion] = useState<'all' | Region>('all')
  const [result, setResult] = useState<ResultFilter>('all')
  const [reportF, setReportF] = useState<ReportFilter>('all')
  const [sort, setSort] = useState<SortKey>('priority')
  const [filtersOpen, setFiltersOpen] = useState(false)
  const tbodyRef = useRef<HTMLTableSectionElement>(null)

  const rows = useMemo(
    () =>
      cases.map((c) => ({
        c,
        result: caseResult(c),
        report: reportState(c.report),
        modalities: unique(c.series.map((s) => s.modality)),
        regions: unique(c.series.map((s) => s.region)),
      })),
    [cases],
  )

  const present = useMemo(
    () => ({
      modalities: (Object.keys(MODALITY_LABEL) as Modality[]).filter((m) => rows.some((r) => r.modalities.includes(m))),
      regions: (Object.keys(REGION_LABEL) as Region[]).filter((g) => rows.some((r) => r.regions.includes(g))),
    }),
    [rows],
  )

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase()
    return rows
      .filter((r) => modality === 'all' || r.modalities.includes(modality))
      .filter((r) => region === 'all' || r.regions.includes(region))
      .filter((r) => result === 'all' || r.result === result)
      .filter((r) => reportF === 'all' || r.report === reportF)
      .filter((r) => !s || [r.c.pseudoId, r.c.title, r.c.indication, ...r.regions.map((g) => REGION_LABEL[g])].some((v) => v.toLowerCase().includes(s)))
      .sort((a, b) => compareWorklist(sort, a, b))
  }, [rows, q, modality, region, result, reportF, sort])

  const selectFilters = [modality, region, result, reportF].filter((v) => v !== 'all').length
  const activeFilters = selectFilters + (q.trim() ? 1 : 0)
  const clear = () => {
    setQ('')
    setModality('all')
    setRegion('all')
    setResult('all')
    setReportF('all')
  }

  const stats = {
    total: cases.length,
    pending: rows.filter((r) => r.result === 'new').length,
    toValidate: rows.filter((r) => r.report === 'draft' || r.report === 'review').length,
    validated: rows.filter((r) => r.report === 'validated').length,
  }

  const open = (id: string) => navigate({ name: 'case', id })
  const onRowKey = (e: KeyboardEvent<HTMLTableRowElement>, id: string) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      open(id)
      return
    }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    e.preventDefault()
    const els = Array.from(tbodyRef.current?.querySelectorAll<HTMLTableRowElement>('tr') ?? [])
    const i = els.indexOf(e.currentTarget)
    els[Math.max(0, Math.min(els.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)))]?.focus()
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Lista de trabalho</h1>
          <p>Estudos de imagiologia musculoesquelética carregados nesta sessão do navegador.</p>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => document.getElementById('novo-caso')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>
          <ImagePlus size={16} /> Novo estudo
        </button>
      </div>

      <div className="stats">
        <div className="stat">
          <div className="stat-value">{stats.total}</div>
          <div className="stat-label">Estudos</div>
        </div>
        <div className="stat">
          <div className="stat-value">{stats.pending}</div>
          <div className="stat-label">Por analisar</div>
        </div>
        <div className="stat">
          <div className="stat-value" style={{ color: 'var(--ai)' }}>
            {stats.toValidate}
          </div>
          <div className="stat-label">Relatórios por validar</div>
        </div>
        <div className="stat">
          <div className="stat-value" style={{ color: 'var(--normal)' }}>
            {stats.validated}
          </div>
          <div className="stat-label">Validados pelo médico</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 'var(--sp-4)' }}>
        <section className="card" aria-label="Estudos">
          <div className="rp-wl-toolbar">
            <div className="rp-wl-search">
              <Search size={16} className="subtle" aria-hidden />
              <input className="input" type="search" placeholder="Pesquisar ID, região, indicação…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Pesquisar estudos" />
              <button
                type="button"
                className={`btn rp-wl-filter-toggle ${filtersOpen ? 'on' : ''}`}
                aria-expanded={filtersOpen}
                aria-controls="rp-wl-filters"
                onClick={() => setFiltersOpen((v) => !v)}
              >
                <SlidersHorizontal size={15} /> Filtros{selectFilters > 0 ? ` (${selectFilters})` : ''}
              </button>
            </div>
            <div id="rp-wl-filters" className={`rp-wl-filters ${filtersOpen ? 'open' : ''}`} role="group" aria-label="Filtros e ordenação">
              <FilterSelect
                label="Modalidade"
                value={modality}
                onChange={setModality}
                options={[['all', 'Todas'], ...present.modalities.map((m): ['all' | Modality, string] => [m, `${MODALITY_ABBR[m]} · ${MODALITY_LABEL[m]}`])]}
              />
              <FilterSelect label="Região" value={region} onChange={setRegion} options={[['all', 'Todas'], ...present.regions.map((g): ['all' | Region, string] => [g, REGION_LABEL[g]])]} />
              <FilterSelect
                label="Resultado IA"
                value={result}
                onChange={setResult}
                options={[
                  ['all', 'Todos'],
                  ...(Object.keys(CASE_RESULT_ORDER) as CaseResult[])
                    .sort((a, b) => CASE_RESULT_ORDER[a] - CASE_RESULT_ORDER[b])
                    .map((r): [ResultFilter, string] => [r, CASE_RESULT_LABEL[r]]),
                ]}
              />
              <FilterSelect
                label="Relatório"
                value={reportF}
                onChange={setReportF}
                options={[
                  ['all', 'Todos'],
                  ['draft', REPORT_STATE_LABEL.draft],
                  ['review', REPORT_STATE_LABEL.review],
                  ['validated', REPORT_STATE_LABEL.validated],
                  ['none', REPORT_STATE_LABEL.none],
                ]}
              />
              <label className="rp-filter rp-sort">
                <span>
                  <ArrowUpDown size={11} aria-hidden /> Ordenar por
                </span>
                <select className="select" value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
                  {SORTS.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {activeFilters > 0 && (
              <button type="button" className="btn btn-ghost btn-sm rp-wl-clear" onClick={clear}>
                <X size={14} /> Limpar filtros ({activeFilters})
              </button>
            )}
          </div>
          {shown.length === 0 ? (
            <div className="empty">
              <Inbox size={28} aria-hidden />
              {cases.length === 0 ? (
                <div>Ainda não há estudos. Arraste ficheiros DICOM, PNG, JPG ou vídeo (MP4/WebM) para «Novo estudo», abaixo.</div>
              ) : (
                <>
                  <div>Nenhum estudo corresponde aos filtros.</div>
                  <button type="button" className="btn btn-sm" onClick={clear}>
                    Limpar filtros
                  </button>
                </>
              )}
            </div>
          ) : (
            <>
              <ul className="rp-wl-cards" aria-label="Estudos">
                {shown.map(({ c, result: res, report, modalities }) => (
                  <li key={c.id}>
                    <a className="rp-wl-card" href={href({ name: 'case', id: c.id })}>
                      {c.series[0]?.frames[0] ? <img className="thumb rp-wl-thumb" src={c.series[0].frames[0].url} alt="" /> : <span className="thumb rp-wl-thumb" />}
                      <div className="rp-wl-card-body">
                        <div className="rp-wl-card-top">
                          <ResultChip result={res} />
                          <span className="mono subtle rp-wl-id">{c.pseudoId}</span>
                        </div>
                        <div className="rp-wl-card-title">
                          {REGION_LABEL[c.series[0]?.region ?? 'other']}
                          {lateralityShort(c)} · {modalities.map((m) => MODALITY_ABBR[m]).join(' + ')}
                        </div>
                        {c.indication && <div className="muted rp-wl-ind">{c.indication}</div>}
                        <div className="rp-wl-card-meta">
                          {report !== 'none' && <ReportStateChip state={report} />}
                          {c.priority === 'urgent' && <span className="badge badge-critical">Urgente</span>}
                          {c.isDemo && <span className="badge badge-info">Demo</span>}
                          <span className="subtle">
                            {imageCount(c)} · {relativeDate(c.createdAt)}
                          </span>
                        </div>
                      </div>
                    </a>
                  </li>
                ))}
              </ul>
              <div className="table-wrap rp-wl-table">
                <table className="table">
                  <thead>
                    <tr>
                      <th scope="col">Resultado IA</th>
                      <th scope="col">Caso</th>
                      <th scope="col">Região</th>
                      <th scope="col">Mod.</th>
                      <th scope="col">Indicação clínica</th>
                      <th scope="col">Imagens</th>
                      <th scope="col">Relatório</th>
                      <th scope="col">Carregado</th>
                    </tr>
                  </thead>
                  <tbody ref={tbodyRef}>
                    {shown.map(({ c, result: res, report, regions, modalities }) => (
                      <tr key={c.id} onClick={() => open(c.id)} tabIndex={0} onKeyDown={(e) => onRowKey(e, c.id)}>
                        <td>
                          <ResultChip result={res} />
                        </td>
                        <td>
                          <div className="rp-wl-case">
                            {c.series[0]?.frames[0] ? <img className="thumb rp-wl-thumb-sm" src={c.series[0].frames[0].url} alt="" /> : <span className="thumb rp-wl-thumb-sm" />}
                            <div>
                              <div className="mono">{c.pseudoId}</div>
                              {(c.priority === 'urgent' || c.isDemo) && (
                                <div className="rp-wl-badges">
                                  {c.priority === 'urgent' && <span className="badge badge-critical">Urgente</span>}
                                  {c.isDemo && <span className="badge badge-info">Demo</span>}
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                        <td>
                          {regions.map((g) => REGION_LABEL[g]).join(', ')}
                          {lateralityShort(c)}
                          <div className="subtle rp-wl-sub">{[c.ageYears ? `${c.ageYears} anos` : '', c.sex ?? ''].filter(Boolean).join(' · ')}</div>
                        </td>
                        <td>
                          {modalities.map((m) => (
                            <abbr key={m} title={`${MODALITY_LABEL[m]} (DICOM ${MODALITY_DICOM[m]})`} className="rp-mod">
                              {MODALITY_ABBR[m]}
                            </abbr>
                          ))}
                        </td>
                        <td className="muted rp-wl-ind-cell">{c.indication || '—'}</td>
                        <td className="subtle rp-nowrap">{imageCount(c)}</td>
                        <td>
                          <ReportStateChip state={report} />
                        </td>
                        <td className="mono subtle rp-nowrap" title={`Carregado em ${formatDateTime(c.createdAt)}`}>
                          {relativeDate(c.createdAt)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
          <div className="rp-wl-foot">
            {shown.length} de {cases.length} {cases.length === 1 ? 'caso' : 'casos'} · Guardados apenas em memória, neste separador do navegador.
          </div>
        </section>

        <NewCase />
      </div>
    </div>
  )
}
