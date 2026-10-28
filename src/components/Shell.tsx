import type { ReactNode } from 'react'
import { BookOpen, ClipboardList, Settings2, ShieldAlert } from 'lucide-react'
import type { Route } from '../lib/router'
import { href } from '../lib/router'
import { isNotebookConfigured, isVlmConfigured, useSettings } from '../store/settings'
import { RESPONSIBLE } from '../data/responsible'
import { GlassDock, GlassTooltip, GlassTooltipContent, GlassTooltipProvider, GlassTooltipTrigger } from './ui/glass'

/** The favicon is the brand mark: one file for the browser tab and the top bar. */
function BrandMark() {
  return <img className="brand-mark" src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" width={32} height={32} />
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
    <GlassTooltipProvider delayDuration={350}>
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
            <span className="brand-name">
              MSK<span className="brand-tld">.ai</span>
            </span>
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
            <GlassTooltip>
              <GlassTooltipTrigger asChild>
                <a className="conn-pill" href={href({ name: 'settings' })} aria-label={`Modelo: ${vlmLabel}`}>
                  <span className={`dot ${vlmOk ? 'ok' : 'warn'}`} />
                  <span className="label">{vlmLabel}</span>
                </a>
              </GlassTooltipTrigger>
              <GlassTooltipContent side="bottom">Estado do modelo de visão-linguagem — abrir Definições</GlassTooltipContent>
            </GlassTooltip>
            <GlassTooltip>
              <GlassTooltipTrigger asChild>
                <a className="conn-pill" href={href({ name: 'settings' })} aria-label={nlm.label}>
                  <span className={`dot ${nlm.dot}`} />
                  <span className="label">{nlm.label}</span>
                </a>
              </GlassTooltipTrigger>
              <GlassTooltipContent side="bottom" align="end">
                {s.mcpLastCheck ? `NotebookLM: ${s.mcpLastCheck.summary}` : 'Ligação ao NotebookLM via MCP'}
              </GlassTooltipContent>
            </GlassTooltip>
          </div>
        </header>

        <main className="main" id="conteudo">
          {children}
        </main>

        <GlassDock
          className="fixed inset-x-3 bottom-[calc(10px+env(safe-area-inset-bottom))] z-30 min-[861px]:hidden"
          label="Navegação"
          items={nav.map((n) => ({ id: n.r.name, icon: n.icon, label: n.short, href: href(n.r), active: n.match.includes(route.name) }))}
        />

        {/* On a case the named credit would sit right under the AI result: show only the privacy note there (hidden on phones). */}
        <footer className={`footer ${route.name === 'case' ? 'footer-case' : ''}`}>
          {route.name !== 'case' && (
            <span>
              Responsável clínico da plataforma (não revê casos): <strong className="text-white/80">{RESPONSIBLE.name}</strong>
              <span className="footer-long"> — {RESPONSIBLE.specialty}</span>
            </span>
          )}
          <span className="footer-long">As imagens são processadas no seu navegador. Só são enviadas ao fornecedor de IA que configurar, quando pedir uma análise.</span>
        </footer>
      </div>
    </GlassTooltipProvider>
  )
}
