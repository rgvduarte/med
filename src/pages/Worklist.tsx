import { useMemo, useRef, useState } from 'react'
import { AlertTriangle, FileImage, Inbox, LoaderCircle, Search, Upload } from 'lucide-react'
import type { Case } from '../types'
import { useCases } from '../store/cases'
import { useSettings } from '../store/settings'
import { ACCEPTED_FILES, ingestFiles } from '../lib/imaging/ingest'
import { navigate } from '../lib/router'
import { MODALITY_LABEL, REGION_LABEL, STATUS_BADGE, STATUS_LABEL } from '../lib/labels'
import { formatDateTime, nowIso, uid } from '../lib/util'

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

export function Worklist() {
  const cases = useCases((s) => s.cases)
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<'all' | 'pending' | 'done'>('all')

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase()
    return cases
      .filter((c) => (filter === 'all' ? true : filter === 'pending' ? c.status !== 'validated' : c.status === 'validated'))
      .filter((c) => !s || [c.pseudoId, c.title, c.indication].some((v) => v.toLowerCase().includes(s)))
      .sort((a, b) => (a.priority === b.priority ? (a.createdAt < b.createdAt ? 1 : -1) : a.priority === 'urgent' ? -1 : 1))
  }, [cases, q, filter])

  const stats = {
    total: cases.length,
    pending: cases.filter((c) => c.status === 'new').length,
    draft: cases.filter((c) => c.status === 'analysed').length,
    validated: cases.filter((c) => c.status === 'validated').length,
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Lista de trabalho</h1>
          <p>Estudos de imagiologia musculoesquelética carregados nesta sessão do navegador.</p>
        </div>
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
            {stats.draft}
          </div>
          <div className="stat-label">Rascunhos da IA por validar</div>
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
          <div className="worklist-toolbar">
            <div className="row" style={{ gap: 6, flex: 1, minWidth: 200, flexWrap: 'nowrap' }}>
              <Search size={16} className="subtle" aria-hidden />
              <input className="input" placeholder="Pesquisar por ID, região ou indicação…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Pesquisar" />
            </div>
            <div className="row" style={{ gap: 4 }} role="group" aria-label="Filtro">
              {(
                [
                  ['all', 'Todos'],
                  ['pending', 'Por validar'],
                  ['done', 'Validados'],
                ] as const
              ).map(([k, l]) => (
                <button key={k} className={`btn btn-sm ${filter === k ? '' : 'btn-ghost'}`} aria-pressed={filter === k} onClick={() => setFilter(k)}>
                  {l}
                </button>
              ))}
            </div>
          </div>
          {shown.length === 0 ? (
            <div className="empty">
              <Inbox size={28} aria-hidden />
              <div>Ainda não há estudos. Carregue imagens abaixo ou abra um caso de demonstração.</div>
            </div>
          ) : (
            <>
            <ul className="wl-cards" aria-label="Estudos">
              {shown.map((c) => {
                const f = c.analysis?.findings.filter((x) => x.severity !== 'normal') ?? []
                const crit = f.filter((x) => x.severity === 'critical').length
                return (
                  <li key={c.id}>
                    <a className="wl-card" href={`#/caso/${encodeURIComponent(c.id)}`}>
                      {c.series[0]?.frames[0] ? <img className="thumb thumb-lg" src={c.series[0].frames[0].url} alt="" /> : <span className="thumb thumb-lg" />}
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div className="row" style={{ gap: 6, justifyContent: 'space-between', flexWrap: 'nowrap' }}>
                          <span className="mono subtle" style={{ fontSize: 'var(--fs-xs)' }}>{c.pseudoId}</span>
                          <span className={`badge ${STATUS_BADGE[c.status]}`}>{STATUS_LABEL[c.status]}</span>
                        </div>
                        <div style={{ fontWeight: 600, color: 'var(--text)', marginTop: 2 }}>{c.title}</div>
                        {c.indication && <div className="muted wl-ind">{c.indication}</div>}
                        <div className="row" style={{ gap: 6, marginTop: 6 }}>
                          {c.priority === 'urgent' && <span className="badge badge-critical">Urgente</span>}
                          {c.isDemo && <span className="badge badge-info">Demo</span>}
                          {c.analysis && (
                            <span className={`badge ${crit ? 'badge-critical' : f.length ? 'badge-significant' : 'badge-normal'}`}>{f.length ? `${f.length} achado(s)` : 'Sem alterações'}</span>
                          )}
                        </div>
                      </div>
                    </a>
                  </li>
                )
              })}
            </ul>
            <div className="table-wrap wl-table">
              <table className="table">
                <thead>
                  <tr>
                    <th aria-label="Miniatura" />
                    <th>ID</th>
                    <th>Estudo</th>
                    <th>Indicação clínica</th>
                    <th>Prioridade</th>
                    <th>Estado</th>
                    <th>Achados IA</th>
                    <th>Data</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((c) => {
                    const f = c.analysis?.findings.filter((x) => x.severity !== 'normal') ?? []
                    const crit = f.filter((x) => x.severity === 'critical').length
                    return (
                      <tr key={c.id} onClick={() => navigate({ name: 'case', id: c.id })} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && navigate({ name: 'case', id: c.id })}>
                        <td>{c.series[0]?.frames[0] && <img className="thumb" src={c.series[0].frames[0].url} alt="" />}</td>
                        <td className="mono">
                          {c.pseudoId}
                          {c.isDemo && (
                            <div>
                              <span className="badge badge-info">Demo</span>
                            </div>
                          )}
                        </td>
                        <td>
                          <div style={{ fontWeight: 600 }}>{c.title}</div>
                          <div className="subtle" style={{ fontSize: 'var(--fs-sm)' }}>
                            {c.series.length} série(s) · {c.series.reduce((n, s) => n + s.frames.length, 0)} imagem(ns)
                            {c.ageYears ? ` · ${c.ageYears} anos` : ''}
                            {c.sex ? ` · ${c.sex}` : ''}
                          </div>
                        </td>
                        <td style={{ maxWidth: 320 }} className="muted">
                          {c.indication || '—'}
                        </td>
                        <td>{c.priority === 'urgent' ? <span className="badge badge-critical">Urgente</span> : <span className="badge badge-neutral">Normal</span>}</td>
                        <td>
                          <span className={`badge ${STATUS_BADGE[c.status]}`}>{STATUS_LABEL[c.status]}</span>
                        </td>
                        <td>
                          {c.analysis ? (
                            <span className={`badge ${crit ? 'badge-critical' : f.length ? 'badge-significant' : 'badge-normal'}`}>{f.length ? `${f.length} achado(s)` : 'Sem alterações'}</span>
                          ) : (
                            <span className="subtle">—</span>
                          )}
                        </td>
                        <td className="mono subtle" style={{ whiteSpace: 'nowrap' }}>
                          {formatDateTime(c.createdAt)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            </>
          )}
        </section>

        <NewCase />
      </div>
    </div>
  )
}
