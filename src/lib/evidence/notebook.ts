import { useSettings } from '../../store/settings'
import { connectMcp } from './mcp'

export interface NotebookAnswer {
  answer: string
  sources: string[]
}

/** Asks the user's NotebookLM notebook (via the local MCP bridge) one literature question. */
export async function queryNotebook(question: string): Promise<NotebookAnswer> {
  const s = useSettings.getState()
  const session = await connectMcp(s.mcpUrl)
  try {
    const text = await session.callText(s.mcpToolName, { question, ...(s.notebookUrl ? { notebook_url: s.notebookUrl } : {}) })
    let answer = text
    let sources: string[] = []
    try {
      const data = JSON.parse(text) as { success?: boolean; data?: { answer?: string; sources?: { sourceName?: string; number?: number }[] }; answer?: string }
      answer = data.data?.answer ?? data.answer ?? text
      sources = (data.data?.sources ?? []).map((x) => `[${x.number ?? '?'}] ${x.sourceName ?? ''}`.trim())
    } catch {
      /* plain-text answer */
    }
    return { answer: answer.replace(/^\[AI-GENERATED[^\n]*\n/, '').trim(), sources }
  } finally {
    await session.close()
  }
}
