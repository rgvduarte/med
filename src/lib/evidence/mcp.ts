// Browser MCP client for a NotebookLM MCP server exposed over Streamable HTTP
// (e.g. via supergateway). Loaded lazily so the MCP SDK is only fetched when used.

export interface McpToolInfo {
  name: string
  description?: string
  inputSchema?: unknown
}

export interface McpSession {
  tools: McpToolInfo[]
  serverName?: string
  callText: (tool: string, args: Record<string, unknown>, timeoutMs?: number) => Promise<string>
  close: () => Promise<void>
}

export async function connectMcp(url: string, timeoutMs = 15000): Promise<McpSession> {
  const [{ Client }, { StreamableHTTPClientTransport }] = await Promise.all([
    import('@modelcontextprotocol/sdk/client'),
    import('@modelcontextprotocol/sdk/client/streamableHttp.js'),
  ])
  let endpoint: URL
  try {
    endpoint = new URL(url)
  } catch {
    throw new Error('URL do endpoint MCP inválido.')
  }
  const client = new Client({ name: 'msk-vlm-webapp', version: '0.1.0' })
  const transport = new StreamableHTTPClientTransport(endpoint)
  try {
    await client.connect(transport, { timeout: timeoutMs })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    throw new Error(
      `Não foi possível ligar ao servidor MCP em ${url}. Verifique se está a correr, se o CORS permite esta origem e se o navegador autorizou o acesso à rede local. (${msg})`,
    )
  }
  const listed = await client.listTools(undefined, { timeout: timeoutMs })
  return {
    tools: listed.tools.map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema })),
    serverName: client.getServerVersion()?.name,
    callText: async (tool, args, callTimeout = 120000) => {
      const res = await client.callTool({ name: tool, arguments: args }, undefined, { timeout: callTimeout, resetTimeoutOnProgress: true })
      const content = (res as { content?: { type: string; text?: string }[] }).content ?? []
      const text = content
        .filter((c) => c.type === 'text' && c.text)
        .map((c) => c.text)
        .join('\n')
      if ((res as { isError?: boolean }).isError) throw new Error(text || 'A ferramenta MCP devolveu um erro.')
      return text
    },
    close: async () => {
      await client.close().catch(() => undefined)
    },
  }
}
