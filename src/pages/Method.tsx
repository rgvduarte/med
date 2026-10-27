import { BookOpen, Brain, CircleCheckBig, CircleX, ExternalLink, Film, Gauge, Library, LockKeyhole, ScanLine, ShieldAlert, Stethoscope, Target } from 'lucide-react'
import { RESPONSIBLE } from '../data/responsible'
import { KB } from '../lib/evidence/kb'
import { EvidenceIndex } from '../components/EvidenceIndex'
import '../styles/report.css'

const TOC = [
  { id: 'm-uso', label: 'Utilização prevista' },
  { id: 'm-pipeline', label: 'Pipeline' },
  { id: 'm-video', label: 'Vídeo' },
  { id: 'm-modelos', label: 'Modelos' },
  { id: 'm-evidencia', label: 'Evidência' },
  { id: 'm-privacidade', label: 'Privacidade' },
  { id: 'm-limitacoes', label: 'Limitações' },
  { id: 'm-desempenho', label: 'Desempenho conhecido' },
]

/** Peer-reviewed references on AI-assisted fracture detection and automation bias (DOI links). */
// Drawn from the verified evidence base: dedicated fracture detectors, general VLM evaluations, automation bias.
const PERFORMANCE_REF_IDS = [
  'kuo2022-ai-fracture-meta',
  'guermazi2022-ai-fracture-mrmc',
  'suh2024-gpt4v-gemini-diagnosis-please',
  'huppertz2025-gpt4v-fabricated-findings',
  'haupt2026-mllm-pediatric-wrist-fracture',
  'takita2026-genai-vs-physicians-radiology-meta',
  'dratsch2023-automation-bias',
]
const PERFORMANCE_REFS = PERFORMANCE_REF_IDS.map((id) => KB.find((e) => e.id === id))
  .filter((e): e is NonNullable<typeof e> => !!e)
  .map((e) => ({ text: `${e.authors} ${e.title} ${e.journal}. ${e.year}.`, doi: e.doi, point: e.key_points_pt[0] }))

function Toc() {
  return (
    <nav className="rp-section-nav rp-toc" aria-label="Nesta página">
      {TOC.map((t) => (
        <button key={t.id} type="button" className="btn btn-sm btn-ghost" onClick={() => document.getElementById(t.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>
          {t.label}
        </button>
      ))}
    </nav>
  )
}

export function Method() {
  return (
    <div className="page page-narrow">
      <div className="page-head">
        <div>
          <h1>Método e evidência</h1>
          <p>Como a plataforma analisa imagens e vídeos musculoesqueléticos e fundamenta o relatório em literatura revista por pares.</p>
        </div>
      </div>

      <section className="card card-pad">
        <div className="person">
          <div className="avatar" aria-hidden>
            <Stethoscope size={24} />
          </div>
          <div>
            <div className="subtle" style={{ fontSize: 'var(--fs-xs)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Responsável clínico da plataforma
            </div>
            <div style={{ fontSize: 'var(--fs-lg)', fontWeight: 650 }}>{RESPONSIBLE.name}</div>
            <div className="muted">{RESPONSIBLE.specialty}</div>
            <div className="row" style={{ gap: 6, marginTop: 6 }}>
              {RESPONSIBLE.areas.map((a) => (
                <span key={a} className="badge badge-neutral">
                  {a}
                </span>
              ))}
            </div>
            <a href={RESPONSIBLE.profileUrl} target="_blank" rel="noreferrer" className="row" style={{ gap: 4, marginTop: 8, fontSize: 'var(--fs-sm)' }}>
              Perfil profissional <ExternalLink size={13} />
            </a>
          </div>
        </div>
      </section>

      <Toc />

      <div className="prose">
        <h2 id="m-uso" className="row" style={{ gap: 8 }}>
          <Target size={20} aria-hidden /> Utilização prevista e não prevista
        </h2>
        <div className="rp-use-grid">
          <div className="rp-use rp-use-yes">
            <h3>
              <CircleCheckBig size={16} aria-hidden /> Prevista
            </h3>
            <ul>
              <li>Ensino e formação em imagiologia musculoesquelética, com casos anonimizados.</li>
              <li>Investigação sobre modelos de visão-linguagem e relatórios fundamentados em literatura.</li>
              <li>Demonstração de um fluxo de revisão: sugestões da IA, verificação pelo médico, validação e registo de auditoria.</li>
              <li>Exercícios de leitura em que o médico compara a sua interpretação com as sugestões da IA, depois de ler as imagens.</li>
            </ul>
          </div>
          <div className="rp-use rp-use-no">
            <h3>
              <CircleX size={16} aria-hidden /> Não prevista
            </h3>
            <ul>
              <li>Diagnóstico, triagem ou priorização de doentes reais.</li>
              <li>Decisões terapêuticas ou de encaminhamento com base nas sugestões da IA.</li>
              <li>Utilização sem supervisão de um médico qualificado, ou por doentes.</li>
              <li>Carregamento de dados pessoais identificáveis (nomes, números de processo, datas de nascimento).</li>
              <li>Substituição de um relatório oficial ou de um dispositivo médico com marcação CE.</li>
            </ul>
          </div>
        </div>

        <h2 id="m-pipeline" className="row" style={{ gap: 8 }}>
          <ScanLine size={20} /> Pipeline de análise
        </h2>
        <ol className="steps">
          <li>
            <strong>Pré-processamento local.</strong> Os ficheiros são abertos no navegador. Os DICOM são lidos e anonimizados: só atributos não
            identificáveis (modalidade, região, incidência, espaçamento de píxeis) são mantidos. As imagens são redimensionadas para o tamanho ótimo
            do modelo (lado maior ≤ 1568 px).
          </li>
          <li>
            <strong>Triagem.</strong> O modelo identifica a modalidade, a região anatómica, a incidência, a lateralidade e a qualidade técnica. Se a
            imagem não for diagnóstica, diz isso explicitamente em vez de inventar achados.
          </li>
          <li>
            <strong>Pesquisa sistemática.</strong> Uma lista de verificação específica da região e da modalidade (ex.: alinhamento, osso, cartilagem e
            articulação, partes moles; ou ecotextura tendinosa, derrame e achados dinâmicos na ecografia) obriga a uma leitura completa. Cada achado
            sai em formato estruturado, com localização aproximada na imagem, grau de certeza e classificação quando aplicável (ex.: Garden,
            Kellgren-Lawrence, Weber).
          </li>
          <li>
            <strong>Recuperação de evidência.</strong> Para cada achado, a plataforma procura na base de evidência curada (artigos verificados no
            PubMed) e, se ligado, pergunta ao seu caderno <strong>NotebookLM</strong> através de MCP.
          </li>
          <li>
            <strong>Síntese do relatório.</strong> O relatório estruturado (informação clínica, técnica, achados por região, conclusão,
            recomendações, limitações) só pode citar a evidência recuperada, com marcadores <code>[id]</code> verificáveis.
          </li>
          <li>
            <strong>Verificação.</strong> Uma passagem independente compara o relatório com os achados e com a evidência, e assinala afirmações sem
            suporte, lateralidade inconsistente ou certezas exageradas.
          </li>
        </ol>

        <h2 id="m-video" className="row" style={{ gap: 8 }}>
          <Film size={20} /> Vídeo (ecografia e fluoroscopia)
        </h2>
        <p>
          Os modelos de visão-linguagem atuais recebem imagens, não vídeo. Por isso, cada clip é amostrado no navegador: fotogramas distribuídos
          uniformemente ao longo do tempo, mais os fotogramas com maior mudança visual (movimento da sonda, manobras dinâmicas). Os fotogramas-chave
          seguem para o modelo por ordem temporal e com o respetivo tempo, para que a avaliação dinâmica (ex.: conflito subacromial, subluxação
          tendinosa) possa ser descrita. Pode sempre rever o clip original no visualizador.
        </p>

        <h2 id="m-modelos" className="row" style={{ gap: 8 }}>
          <Brain size={20} /> Modelos
        </h2>
        <ul>
          <li>
            <strong>Claude (Anthropic)</strong>, através do SDK oficial, chamado diretamente do seu navegador com a sua chave. A saída de cada etapa é
            validada contra um esquema estruturado.
          </li>
          <li>
            <strong>MedGemma 1.5 4B</strong> (Google, modelo médico aberto) num servidor compatível com a API OpenAI — no seu computador (pasta{' '}
            <code>local-ai/</code> do repositório) ou no <strong>GitHub Codespaces</strong> (botão no README), sem API paga. Em CPU é lento, por isso o
            modo local envia no máximo 4 imagens e omite o segundo leitor.
          </li>
          <li>
            <strong>No navegador (experimental)</strong>: Qwen3.5 0,8B com WebGPU, sem instalar nada. Apenas triagem (modalidade, região, incidência,
            qualidade) — um modelo deste tamanho não é fiável para achados.
          </li>
        </ul>

        <h2 id="m-evidencia" className="row" style={{ gap: 8 }}>
          <Library size={20} /> Evidência
        </h2>
        <p>
          A <strong>base curada</strong> reúne guidelines, meta-análises, estudos de exatidão diagnóstica e artigos originais de classificação em
          trauma, patologia degenerativa, ecografia musculoesquelética, medicina desportiva e IA em radiologia. Cada referência foi confirmada no
          PubMed/Crossref (título, revista, ano, DOI, PMID). Cada ponto-chave foi conferido contra o resumo original por um segundo verificador
          independente.
        </p>
        <p>
          O <strong>NotebookLM</strong> permite usar o seu próprio caderno de fontes. A ligação faz-se por um servidor MCP no seu computador (ver
          Definições). As respostas do caderno aparecem como evidência <code>NLM-n</code>, separadas da base curada.
        </p>
        <EvidenceIndex />

        <h2 id="m-privacidade" className="row" style={{ gap: 8 }}>
          <LockKeyhole size={20} /> Privacidade
        </h2>
        <ul>
          <li>Não há servidor da plataforma: o site é estático (GitHub Pages) e tudo corre no seu navegador.</li>
          <li>Os estudos ficam apenas em memória e desaparecem ao fechar ou recarregar a página.</li>
          <li>As imagens só saem do navegador quando pede uma análise, e apenas para o fornecedor de IA que configurou.</li>
          <li>Não introduza nomes, números de processo ou datas de nascimento. Atenção a dados gravados nos próprios píxeis da imagem.</li>
        </ul>

        <h2 id="m-limitacoes" className="row" style={{ gap: 8 }}>
          <ShieldAlert size={20} /> Limitações e uso responsável
        </h2>
        <ul>
          <li>
            Os modelos de visão-linguagem generalistas têm exatidão diagnóstica limitada e variável em imagem médica, e podem produzir achados
            plausíveis mas falsos. A localização (caixas) é aproximada.
          </li>
          <li>A "confiança" apresentada é auto-reportada pelo modelo e não está calibrada.</li>
          <li>
            Existe risco de viés de automação: o médico tende a aceitar sugestões erradas da IA. Reveja sempre as imagens antes de ler as sugestões.
          </li>
          <li>
            Esta plataforma é um protótipo de investigação e ensino. Não é um dispositivo médico com marcação CE e não deve ser usada para decisões
            clínicas.
          </li>
        </ul>

        <h2 id="m-desempenho" className="row" style={{ gap: 8 }}>
          <Gauge size={20} aria-hidden /> Desempenho conhecido
        </h2>
        <div className="callout callout-warn rp-perf-callout">
          <ShieldAlert size={16} />
          <div>
            <strong>Este pipeline não foi validado clinicamente.</strong> Não existem dados de sensibilidade, especificidade ou concordância com
            radiologistas para esta plataforma, nem para a combinação de modelo, instruções e evidência que utiliza.
          </div>
        </div>
        <ul>
          <li>
            Os resultados publicados de deteção de fraturas por IA referem-se a <strong>detetores dedicados</strong>, treinados e validados para essa
            tarefa — não a modelos de visão-linguagem generalistas como os usados aqui. Não os transponha para esta plataforma.
          </li>
          <li>
            As sugestões podem falhar achados subtis (ex.: fraturas do escafoide, lesões ocultas), localizar mal as alterações ou descrever achados que
            não existem.
          </li>
          <li>
            A confiança é declarada pelo próprio modelo e mostrada apenas em palavras (alta, moderada, baixa); não é uma probabilidade calibrada.
          </li>
          <li>
            Sugestões de IA erradas podem levar o leitor a erros (viés de automação). Leia as imagens antes de abrir as sugestões.
          </li>
        </ul>
        <p>Literatura de referência sobre deteção de fraturas assistida por IA e viés de automação:</p>
        <ol className="rp-perf-refs">
          {PERFORMANCE_REFS.map((r) => (
            <li key={r.doi}>
              {r.text}{' '}
              <a href={`https://doi.org/${r.doi}`} target="_blank" rel="noreferrer" className="rp-inline-link">
                doi:{r.doi} <ExternalLink size={12} aria-hidden />
              </a>
              {r.point && <div className="subtle" style={{ fontSize: 'var(--fs-sm)' }}>{r.point}</div>}
            </li>
          ))}
        </ol>

        <h2 className="row" style={{ gap: 8 }}>
          <BookOpen size={20} /> Código
        </h2>
        <p>
          Código aberto em{' '}
          <a href="https://github.com/rgvduarte/med" target="_blank" rel="noreferrer">
            github.com/rgvduarte/med
          </a>
          .
        </p>
      </div>
    </div>
  )
}
