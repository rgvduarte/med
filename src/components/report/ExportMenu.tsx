import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react'
import { ChevronDown, Copy, FileBraces, FileDown, FileText, Printer, ScrollText } from 'lucide-react'
import type { Case, Report } from '../../types'
import { useCases } from '../../store/cases'
import { reportToMarkdown, reportToText } from '../../lib/report/format'
import { downloadJson, downloadText, toFhirDiagnosticReport } from '../../lib/report/fhir'
import { buildAuditPackage } from '../../lib/report/audit'
import { errorMessage } from '../../lib/util'

interface Item {
  id: string
  icon: ReactNode
  label: string
  hint: string
  disabled?: string
  run: () => Promise<string | void> | string | void
}

function stamp() {
  return new Date().toISOString().slice(0, 10)
}

export function ExportMenu({ c, r, onStatus }: { c: Case; r: Report; onStatus: (msg: string) => void }) {
  const audit = useCases((s) => s.audit)
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const evidence = c.analysis?.evidence ?? []
  const draft = r.status !== 'validated'
  const base = `${c.pseudoId}-relatorio${draft ? '-rascunho' : ''}`

  useEffect(() => {
    if (!open) return
    const onDoc = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false)
        btnRef.current?.focus()
      }
    }
    document.addEventListener('pointerdown', onDoc)
    document.addEventListener('keydown', onKey)
    rootRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]:not([aria-disabled="true"])')?.focus()
    return () => {
      document.removeEventListener('pointerdown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const logged = (format: string) => audit(c.id, { actor: 'user', action: 'Relatório exportado', detail: format })

  const items: Item[] = [
    {
      id: 'print',
      icon: <Printer size={16} />,
      label: 'Imprimir / Guardar PDF',
      hint: draft ? 'A4, com marca de água «RASCUNHO — NÃO VALIDADO»' : 'A4, tema de papel',
      run: () => {
        logged(draft ? 'PDF / impressão (rascunho)' : 'PDF / impressão')
        setTimeout(() => window.print(), 50)
      },
    },
    {
      id: 'copy',
      icon: <Copy size={16} />,
      label: 'Copiar texto',
      hint: draft ? 'Texto simples com cabeçalho «RASCUNHO»' : 'Texto simples para colar no RIS',
      run: async () => {
        await navigator.clipboard.writeText(reportToText(c, r, evidence))
        logged('Texto (área de transferência)')
        return 'Texto do relatório copiado.'
      },
    },
    {
      id: 'md',
      icon: <FileText size={16} />,
      label: 'Markdown (.md)',
      hint: 'Secções, referências e declaração de IA',
      disabled: draft ? 'Disponível depois da validação' : undefined,
      run: () => {
        downloadText(`${base}.md`, reportToMarkdown(c, r, evidence), 'text/markdown;charset=utf-8')
        logged('Markdown')
        return 'Ficheiro Markdown transferido.'
      },
    },
    {
      id: 'fhir',
      icon: <FileBraces size={16} />,
      label: 'FHIR R4 (.json)',
      hint: 'DiagnosticReport + Observation por achado aceite',
      disabled: draft ? 'Disponível depois da validação' : undefined,
      run: () => {
        downloadJson(`${c.pseudoId}-DiagnosticReport.json`, toFhirDiagnosticReport(c, r, evidence))
        logged('FHIR R4 DiagnosticReport')
        return 'FHIR DiagnosticReport transferido.'
      },
    },
    {
      id: 'audit',
      icon: <ScrollText size={16} />,
      label: 'Pacote de auditoria (.json)',
      hint: 'Relatório, achados, evidência, modelo e registo',
      run: async () => {
        downloadJson(`${c.pseudoId}-auditoria-${stamp()}.json`, await buildAuditPackage(c))
        logged('Pacote de auditoria')
        return 'Pacote de auditoria transferido.'
      },
    },
  ]

  const onKeyMenu = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp' && e.key !== 'Home' && e.key !== 'End') return
    e.preventDefault()
    const list = Array.from(rootRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not([aria-disabled="true"])') ?? [])
    const i = list.indexOf(document.activeElement as HTMLButtonElement)
    const next = e.key === 'Home' ? 0 : e.key === 'End' ? list.length - 1 : (i + (e.key === 'ArrowDown' ? 1 : -1) + list.length) % list.length
    list[next]?.focus()
  }

  return (
    <div className="rp-menu-root" ref={rootRef}>
      <button ref={btnRef} className="btn btn-sm" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <FileDown size={14} /> Exportar <ChevronDown size={14} />
      </button>
      {open && (
        <div className="rp-menu" role="menu" aria-label="Exportar relatório" onKeyDown={onKeyMenu}>
          {items.map((it) => (
            <button
              key={it.id}
              role="menuitem"
              className="rp-menu-item"
              aria-disabled={it.disabled ? true : undefined}
              onClick={async () => {
                if (it.disabled) return
                setOpen(false)
                try {
                  const msg = await it.run()
                  if (msg) onStatus(msg)
                } catch (e) {
                  onStatus(`Não foi possível exportar: ${errorMessage(e)}`)
                }
              }}
            >
              <span className="rp-menu-icon">{it.icon}</span>
              <span>
                <span className="rp-menu-label">{it.label}</span>
                <span className="rp-menu-hint">{it.disabled ?? it.hint}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
