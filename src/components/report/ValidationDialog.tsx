import { useEffect, useRef, useState } from 'react'
import { BadgeCheck, CircleCheckBig, CircleX, LoaderCircle, Lock, X } from 'lucide-react'
import type { Case, Report } from '../../types'
import { useCases } from '../../store/cases'
import { useSettings } from '../../store/settings'
import { buildAiDeclaration, citedEvidence } from '../../lib/report/format'
import { reportContentHash, shortHash } from '../../lib/report/hash'
import { isVerified, pendingFindings } from '../../lib/report/state'
import { errorMessage, nowIso } from '../../lib/util'
import { href } from '../../lib/router'

function Check({ ok, children, detail }: { ok: boolean; children: string; detail?: string }) {
  return (
    <li className={`rp-check ${ok ? 'ok' : 'no'}`}>
      {ok ? <CircleCheckBig size={16} aria-hidden /> : <CircleX size={16} aria-hidden />}
      <span>
        <span className="sr-only">{ok ? 'Cumprido: ' : 'Por cumprir: '}</span>
        {children}
        {detail && <span className="rp-check-detail">{detail}</span>}
      </span>
    </li>
  )
}

/** Blocking, checklist-driven validation (spec §4.3). Computes a SHA-256 of the report on success. */
export function ValidationDialog({ c, r, open, onClose, onDone }: { c: Case; r: Report; open: boolean; onClose: () => void; onDone: (msg: string) => void }) {
  const ref = useRef<HTMLDialogElement>(null)
  const updateCase = useCases((s) => s.updateCase)
  const audit = useCases((s) => s.audit)
  const userName = useSettings((s) => s.userDisplayName)
  const userLicence = useSettings((s) => s.userLicence)
  const [name, setName] = useState(userName)
  const [licence, setLicence] = useState(userLicence)
  const [ack, setAck] = useState(false)
  const [assumeRefs, setAssumeRefs] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()

  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) {
      setName(useSettings.getState().userDisplayName)
      setLicence(useSettings.getState().userLicence)
      setAck(false)
      setAssumeRefs(false)
      setError(undefined)
      d.showModal()
    } else if (!open && d.open) d.close()
  }, [open])

  const pending = pendingFindings(c).length
  const conclusionReviewed = (r.reviewedSections ?? []).includes('impression')
  const unverified = citedEvidence(r, c.analysis?.evidence ?? []).filter((e) => !isVerified(e))
  const refsOk = unverified.length === 0 || assumeRefs
  const canValidate = pending === 0 && conclusionReviewed && refsOk && ack && name.trim().length >= 3 && !busy

  const submit = async () => {
    if (!canValidate) return
    setBusy(true)
    setError(undefined)
    try {
      const at = nowIso()
      const by = name.trim()
      const lic = licence.trim()
      const base: Report = { ...r, status: 'validated', validatedBy: by, validatorLicence: lic || undefined, validatedAt: at, contentHash: undefined }
      const withDecl: Report = { ...base, aiDeclaration: buildAiDeclaration(c, base) }
      const hash = await reportContentHash(withDecl)
      const final: Report = { ...withDecl, contentHash: hash }
      updateCase(c.id, { status: 'validated', report: final })
      audit(c.id, { actor: 'user', action: 'Relatório validado', detail: `${by}${lic ? ` (cédula ${lic})` : ''} · SHA-256 ${shortHash(hash)}` })
      onDone('Relatório validado e bloqueado.')
      onClose()
    } catch (e) {
      setError(`Não foi possível validar: ${errorMessage(e)}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <dialog ref={ref} className="rp-dialog" aria-labelledby="rp-validate-title" onClose={onClose} onCancel={onClose}>
      <form
        method="dialog"
        onSubmit={(e) => {
          e.preventDefault()
          void submit()
        }}
      >
        <header className="rp-dialog-head">
          <h2 id="rp-validate-title">
            <BadgeCheck size={18} aria-hidden /> Validar relatório
          </h2>
          <button type="button" className="btn btn-ghost btn-icon" aria-label="Fechar" onClick={onClose}>
            <X size={18} />
          </button>
        </header>
        <div className="rp-dialog-body">
          <h3 className="rp-dialog-sub">Verificações automáticas</h3>
          <ul className="rp-checks">
            <Check ok={pending === 0} detail={pending ? 'Aceite, edite ou rejeite cada achado no separador Achados.' : undefined}>
              {`Todos os achados foram revistos (${pending} ${pending === 1 ? 'pendente' : 'pendentes'})`}
            </Check>
            <Check ok={conclusionReviewed} detail={conclusionReviewed ? undefined : 'Aceite ou edite a secção «Conclusão» antes de validar.'}>
              Conclusão revista
            </Check>
            <Check ok={refsOk} detail={unverified.length ? `${unverified.length} referência(s) citada(s) sem DOI/PMID verificado.` : undefined}>
              Referências não verificadas removidas ou assumidas
            </Check>
          </ul>
          {unverified.length > 0 && (
            <label className="rp-checkbox">
              <input type="checkbox" checked={assumeRefs} onChange={(e) => setAssumeRefs(e.target.checked)} />
              <span>Assumo a responsabilidade pelas referências não verificadas citadas no texto.</span>
            </label>
          )}

          <h3 className="rp-dialog-sub">Médico que valida</h3>
          <div className="rp-dialog-grid">
            <label className="field">
              <span>Nome</span>
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required minLength={3} />
            </label>
            <label className="field">
              <span>Cédula profissional (opcional)</span>
              <input className="input mono" value={licence} onChange={(e) => setLicence(e.target.value)} inputMode="numeric" autoComplete="off" />
            </label>
          </div>
          <p className="rp-dialog-note">
            Identificação local, sem autenticação.{' '}
            {!userName && (
              <>
                Pode guardar o seu nome em{' '}
                <a href={`${href({ name: 'settings' })}`} onClick={onClose}>
                  Definições → Utilizador
                </a>
                .
              </>
            )}
          </p>

          <label className="rp-checkbox rp-checkbox-strong">
            <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} />
            <span>Revi as imagens e assumo a responsabilidade clínica pelo conteúdo deste relatório.</span>
          </label>

          <p className="rp-dialog-note">
            <Lock size={13} aria-hidden /> Ao validar, o relatório fica bloqueado e é calculado um hash SHA-256 do conteúdo. Validação local; não constitui
            assinatura eletrónica qualificada.
          </p>
          {error && (
            <div className="callout callout-warn" role="alert">
              <CircleX size={16} />
              <div>{error}</div>
            </div>
          )}
        </div>
        <footer className="rp-dialog-foot">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className="btn btn-primary" disabled={!canValidate}>
            {busy ? <LoaderCircle size={15} className="spin" /> : <BadgeCheck size={15} />} Validar e bloquear
          </button>
        </footer>
      </form>
    </dialog>
  )
}
