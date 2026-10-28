import type { ReactNode } from 'react'
import { BookOpen, ClipboardList, Settings2, ShieldAlert } from 'lucide-react'
import type { Route } from '../lib/router'
import { href } from '../lib/router'
import { isNotebookConfigured, isVlmConfigured, useSettings } from '../store/settings'
import { RESPONSIBLE } from '../data/responsible'

function BrandMark() {
  return (
    <span className="brand-mark" aria-hidden>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 10c.7-.7 1.69 0 2.5 0a2.5 2.5 0 1 0 0-5 .5.5 0 0 1-.5-.5 2.5 2.5 0 1 0-5 0c0 .81.7 1.8 0 2.5l-7 7c-.7.7-1.69 0-2.5 0a2.5 2.5 0 0 0 0 5c.28 0 .5.22.5.5a2.5 2.5 0 1 0 5 0c0-.81-.7-1.8 0-2.5Z" />
      </svg>
    </span>
  )
}

export function Shell({ route, children }: { route: Route; children: ReactNode }) {
  const s = useSettings()
  const vlmOk = isVlmConfigured(s)
  const vlmLabel = vlmOk ? (s.provider === 'anthropic' ? 'Claude' : s.provider === 'browser' ? 'IA no navegador' : 'MedGemma local') : 'VLM não configurado'
  const nlm = !s.mcpEnabled
    ? { dot: '', label: 'NotebookLM inativo' }
    : !isNotebookConfigured(s)
      ? { dot: 'warn', label: 'NotebookLM por configurar' }
      : s.mcpLastCheck && !s.mcpLastCheck.ok
        ? { dot: 'err', label: 'NotebookLM: erro' }
        : s.mcpLastCheck?.ok
          ? { dot: 'ok', label: 'NotebookLM ligado' }
          : { dot: 'warn', label: 'NotebookLM por testar' }
  const nav: { r: Route; label: string; short: string; icon: ReactNode; match: Route['name'][] }[] = [
    { r: { name: 'worklist' }, label: 'Lista de trabalho', short: 'Estudos', icon: <ClipboardList size={18} />, match: ['worklist', 'case'] },
    { r: { name: 'method' }, label: 'Método e evidência', short: 'Método', icon: <BookOpen size={18} />, match: ['method'] },
    { r: { name: 'settings' }, label: 'Definições', short: 'Definições', icon: <Settings2 size={18} />, match: ['settings'] },
  ]

  return (
    <div className="app">
      <div className="banner" role="note">
        <ShieldAlert size={14} aria-hidden />
        <span className="banner-long">
          <strong>Protótipo de investigação e ensino.</strong> Não é um dispositivo médico. As sugestões da IA exigem sempre validação por um
          médico — não utilizar para decisões clínicas.
        </span>
        <span className="banner-short">
          <strong>Protótipo de investigação</strong> — não é dispositivo médico
        </span>
      </div>

      <header className="topbar">
        <a className="brand" href={href({ name: 'worklist' })}>
          <BrandMark />
          <span>MSK·VLM</span>
          <span className="brand-sub">Imagiologia musculoesquelética assistida por IA</span>
        </a>
        <nav className="nav" aria-label="Navegação principal">
          {nav.map((n) => (
            <a key={n.label} href={href(n.r)} aria-current={n.match.includes(route.name) ? 'page' : undefined}>
              {n.icon}
              {n.label}
            </a>
          ))}
        </nav>
        <div className="topbar-right">
          <a className="conn-pill" href={href({ name: 'settings' })} title="Estado do modelo de visão-linguagem" aria-label={`Modelo: ${vlmLabel}`}>
            <span className={`dot ${vlmOk ? 'ok' : 'warn'}`} />
            <span className="label">{vlmLabel}</span>
          </a>
          <a className="conn-pill" href={href({ name: 'settings' })} title={s.mcpLastCheck ? `NotebookLM: ${s.mcpLastCheck.summary}` : 'Ligação ao NotebookLM via MCP'} aria-label={nlm.label}>
            <span className={`dot ${nlm.dot}`} />
            <span className="label">{nlm.label}</span>
          </a>
        </div>
      </header>

      <main className="main" id="conteudo">
        {children}
      </main>

      <nav className="bottom-nav" aria-label="Navegação">
        {nav.map((n) => (
          <a key={n.label} href={href(n.r)} aria-current={n.match.includes(route.name) ? 'page' : undefined}>
            {n.icon}
            <span>{n.short}</span>
          </a>
        ))}
      </nav>

      {/* On a case the named credit would sit right under the AI result: show only the privacy note there (hidden on phones). */}
      <footer className={`footer ${route.name === 'case' ? 'footer-case' : ''}`}>
        {route.name !== 'case' && (
          <span>
            Responsável clínico da plataforma (não revê casos): <strong style={{ color: 'var(--text-2)' }}>{RESPONSIBLE.name}</strong>
            <span className="footer-long"> — {RESPONSIBLE.specialty}</span>
          </span>
        )}
        <span className="footer-long">As imagens são processadas no seu navegador. Só são enviadas ao fornecedor de IA que configurar, quando pedir uma análise.</span>
      </footer>
    </div>
  )
}
