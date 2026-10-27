import { Info, UserRound } from 'lucide-react'
import { useSettings } from '../../store/settings'

/** Local, unauthenticated identity used only to prefill the report validation dialog. Empty by default. */
export function UserCard() {
  const name = useSettings((s) => s.userDisplayName)
  const licence = useSettings((s) => s.userLicence)
  const update = useSettings((s) => s.update)
  return (
    <section className="card card-pad" id="utilizador" aria-labelledby="utilizador-title">
      <h2 id="utilizador-title" className="row" style={{ gap: 8 }}>
        <UserRound size={18} aria-hidden /> Utilizador
      </h2>
      <div className="grid-2">
        <label className="field">
          <span>Nome a apresentar</span>
          <input className="input" value={name} onChange={(e) => update({ userDisplayName: e.target.value })} autoComplete="name" placeholder="Nome e apelido" />
          <small>Preenche o campo «Nome» no diálogo de validação do relatório.</small>
        </label>
        <label className="field">
          <span>Cédula profissional (opcional)</span>
          <input
            className="input mono"
            value={licence}
            onChange={(e) => update({ userLicence: e.target.value.replace(/[^0-9A-Za-z-]/g, '').slice(0, 16) })}
            inputMode="numeric"
            autoComplete="off"
          />
          <small>Aparece junto ao nome na validação, se preenchida.</small>
        </label>
      </div>
      <div className="callout callout-info">
        <Info size={16} />
        <div>
          Identificação local, sem autenticação. Fica guardada apenas neste navegador e serve só para preencher o diálogo de validação — pode sempre
          alterá-la no momento de validar.
        </div>
      </div>
    </section>
  )
}
