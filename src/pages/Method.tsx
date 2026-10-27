import { BookOpen, Brain, ExternalLink, Film, Library, LockKeyhole, ScanLine, ShieldAlert, Stethoscope } from 'lucide-react'
import { RESPONSIBLE } from '../data/responsible'

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

      <div className="prose">
        <h2 className="row" style={{ gap: 8 }}>
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

        <h2 className="row" style={{ gap: 8 }}>
          <Film size={20} /> Vídeo (ecografia e fluoroscopia)
        </h2>
        <p>
          Os modelos de visão-linguagem atuais recebem imagens, não vídeo. Por isso, cada clip é amostrado no navegador: fotogramas distribuídos
          uniformemente ao longo do tempo, mais os fotogramas com maior mudança visual (movimento da sonda, manobras dinâmicas). Os fotogramas-chave
          seguem para o modelo por ordem temporal e com o respetivo tempo, para que a avaliação dinâmica (ex.: conflito subacromial, subluxação
          tendinosa) possa ser descrita. Pode sempre rever o clip original no visualizador.
        </p>

        <h2 className="row" style={{ gap: 8 }}>
          <Brain size={20} /> Modelos
        </h2>
        <ul>
          <li>
            <strong>Claude (Anthropic)</strong>, através do SDK oficial, chamado diretamente do seu navegador com a sua chave. A saída de cada etapa é
            validada contra um esquema estruturado.
          </li>
          <li>
            <strong>Modelo local</strong> compatível com a API OpenAI (ex.: MedGemma em Ollama ou LM Studio). As imagens não saem do seu computador.
          </li>
        </ul>

        <h2 className="row" style={{ gap: 8 }}>
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

        <h2 className="row" style={{ gap: 8 }}>
          <LockKeyhole size={20} /> Privacidade
        </h2>
        <ul>
          <li>Não há servidor da plataforma: o site é estático (GitHub Pages) e tudo corre no seu navegador.</li>
          <li>Os estudos ficam apenas em memória e desaparecem ao fechar ou recarregar a página.</li>
          <li>As imagens só saem do navegador quando pede uma análise, e apenas para o fornecedor de IA que configurou.</li>
          <li>Não introduza nomes, números de processo ou datas de nascimento. Atenção a dados gravados nos próprios píxeis da imagem.</li>
        </ul>

        <h2 className="row" style={{ gap: 8 }}>
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
