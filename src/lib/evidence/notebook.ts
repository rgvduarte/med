import { isNotebookConfigured, useSettings } from '../../store/settings'
import { askNotebook } from './mcp'

export interface NotebookAnswer {
  answer: string
  sources: string[]
}

/** Asks the user's NotebookLM notebook (via the local MCP bridge) one literature question. */
export async function queryNotebook(question: string): Promise<NotebookAnswer> {
  const s = useSettings.getState()
  if (!isNotebookConfigured(s)) throw new Error('NotebookLM ativo mas sem caderno ou ponte configurados (Definições).')
  const r = await askNotebook(s, question)
  const sources = r.citations.length
    ? r.citations.map((c) => `[${c.number}] ${c.title}${c.excerpt ? ` — «${c.excerpt.slice(0, 240)}»` : ''}`)
    : r.sources
  return { answer: r.answer, sources }
}
