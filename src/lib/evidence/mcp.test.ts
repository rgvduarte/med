import { describe, expect, it } from 'vitest'
import { buildBridgeCommand, citationNumbers, classifyMcpError, extractNlmCitations, isSafariBrowser, parseLegacyAnswer, parseToolResult, toNotebookCfg } from './mcp'

describe('citationNumbers', () => {
  it('expands lists and ranges in order of appearance', () => {
    expect(citationNumbers('A [1]. B [2, 3]. C [4-6] and [2].')).toEqual([1, 2, 3, 4, 5, 6, 2])
  })
})

describe('extractNlmCitations (nlm-cli)', () => {
  const titles = new Map([
    ['s-a', 'Kuo 2022 – AI fracture detection'],
    ['s-b', 'Mallee 2015 – scaphoid imaging'],
  ])
  it('maps markers through references[] and keeps first-citation order', () => {
    const r = extractNlmCitations(
      {
        answer: 'X [2]. Y [1, 2].',
        references: [
          { source_id: 's-a', citation_number: 1, cited_text: 'a' },
          { source_id: 's-b', citation_number: 2, cited_text: 'b' },
        ],
      },
      titles,
    )
    expect(r.sources).toEqual(['Mallee 2015 – scaphoid imaging', 'Kuo 2022 – AI fracture detection'])
    expect(r.citations[0]).toMatchObject({ number: 2, sourceId: 's-b', excerpt: 'b' })
  })
  it('falls back to citations{} with string keys', () => {
    const r = extractNlmCitations({ answer: 'Z [1]', citations: { '1': 's-a' } }, titles)
    expect(r.sources).toEqual(['Kuo 2022 – AI fracture detection'])
  })
  it('lists all references when the answer has no markers', () => {
    const r = extractNlmCitations({ answer: 'no markers', references: [{ source_id: 's-b', citation_number: 1 }] }, titles)
    expect(r.sources).toEqual(['Mallee 2015 – scaphoid imaging'])
  })
})

describe('parseLegacyAnswer', () => {
  it('strips the AI marker line and reads sources[]', () => {
    const r = parseLegacyAnswer({
      answer: '[AI-GENERATED via Gemini 2.5 (NotebookLM) — verify]\nThe answer [1].',
      sources: [{ marker: '[1]', number: 1, sourceName: 'Paper A', sourceText: 'excerpt' }],
    })
    expect(r.answer).toBe('The answer [1].')
    expect(r.sources).toEqual(['Paper A'])
  })
})

describe('parseToolResult', () => {
  it('unwraps the legacy {success,data} envelope', () => {
    expect(parseToolResult({ content: [{ type: 'text', text: JSON.stringify({ success: true, data: { answer: 'ok' } }) }] })).toEqual({ answer: 'ok' })
  })
  it('throws a classified error for nlm-cli {status:"error"}', () => {
    expect(() => parseToolResult({ structuredContent: { status: 'error', error: 'Authentication expired, run nlm login' } })).toThrow(/Sessão Google/)
  })
})

describe('classifyMcpError', () => {
  it('recognises 401 and 404 transport errors', () => {
    expect(classifyMcpError(Object.assign(new Error('Error POSTing to endpoint'), { code: 401 })).code).toBe('invalid-key')
    expect(classifyMcpError(Object.assign(new Error('Error POSTing to endpoint'), { code: 404 })).code).toBe('session-expired')
  })
})

describe('bridge command and config', () => {
  it('embeds the exact origin, key, port and tool allowlist', () => {
    const cmd = buildBridgeCommand({ kind: 'nlm-cli', origin: 'https://user.github.io', apiKey: 'abc', baseUrl: 'http://127.0.0.1:8765' })
    expect(cmd).toContain('--cors "https://user.github.io"')
    expect(cmd).toContain('--apiKey "abc"')
    expect(cmd).toContain('--port 8765')
    expect(cmd).toContain('--stateful')
    expect(cmd).toContain('--tools notebook_query')
    expect(cmd).not.toContain('ask_question')
  })
  it('maps the settings store shape', () => {
    const cfg = toNotebookCfg({ mcpServerKind: 'nlm-cli', mcpBaseUrl: 'http://127.0.0.1:8765', mcpApiKey: 'k', notebookId: 'id-1', notebookUrl: '' })
    expect(cfg).toMatchObject({ kind: 'nlm-cli', apiKey: 'k', notebookUrl: 'https://notebooklm.google.com/notebook/id-1' })
  })
  it('detects Safari but not Chrome', () => {
    expect(isSafariBrowser('Mozilla/5.0 (Macintosh) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15')).toBe(true)
    expect(isSafariBrowser('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36')).toBe(false)
  })
})
