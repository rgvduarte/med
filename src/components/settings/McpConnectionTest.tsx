import { useState } from 'react'
import { CircleCheck, CircleX, LoaderCircle, PlugZap } from 'lucide-react'
import { useSettings } from '../../store/settings'
import { connectMcp, type McpToolInfo } from '../../lib/evidence/mcp'
import { errorMessage } from '../../lib/util'

export function McpConnectionTest() {
  const url = useSettings((s) => s.mcpUrl)
  const toolName = useSettings((s) => s.mcpToolName)
  const [state, setState] = useState<{ status: 'idle' | 'busy' | 'ok' | 'error'; message?: string; tools?: McpToolInfo[] }>({ status: 'idle' })

  const test = async () => {
    setState({ status: 'busy' })
    try {
      const s = await connectMcp(url)
      await s.close()
      const has = s.tools.some((t) => t.name === toolName)
      setState({
        status: has ? 'ok' : 'error',
        tools: s.tools,
        message: has
          ? `Ligado${s.serverName ? ` a ${s.serverName}` : ''}. Ferramenta "${toolName}" disponível.`
          : `Ligado, mas a ferramenta "${toolName}" não existe neste servidor.`,
      })
    } catch (e) {
      setState({ status: 'error', message: errorMessage(e) })
    }
  }

  return (
    <div>
      <button className="btn" onClick={test} disabled={state.status === 'busy' || !url}>
        {state.status === 'busy' ? <LoaderCircle size={15} className="spin" /> : <PlugZap size={15} />} Testar ligação
      </button>
      {state.message && (
        <div className={`callout ${state.status === 'ok' ? 'callout-info' : 'callout-warn'}`} style={{ marginTop: 'var(--sp-3)' }}>
          {state.status === 'ok' ? <CircleCheck size={16} /> : <CircleX size={16} />}
          <div>
            <div>{state.message}</div>
            {state.tools && state.tools.length > 0 && (
              <div className="subtle" style={{ marginTop: 4 }}>
                Ferramentas: <span className="mono">{state.tools.map((t) => t.name).join(', ')}</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
