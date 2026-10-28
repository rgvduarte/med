# MSK.ai — Imagiologia musculoesquelética assistida por IA

> **Protótipo de investigação e ensino. Não é um dispositivo médico.** As sugestões da IA exigem sempre validação por um médico e não devem ser usadas para decisões clínicas.

**Aplicação:** https://rgvduarte.github.io/med/

[![Abrir no GitHub Codespaces](https://github.com/codespaces/badge.svg)](https://codespaces.new/rgvduarte/med?quickstart=1)

Responsável clínico: **Dr. David Coutinho** — Medicina Física e de Reabilitação (Fisiatria).

## O que faz

Plataforma web para análise de radiografia, TC, RM, ecografia e fluoroscopia musculoesqueléticas com modelos de visão-linguagem (VLM). O relatório estruturado é fundamentado em literatura revista por pares.

- **Visualizador clínico** ao estilo PACS: janela/nível, zoom, rodar, espelhar, medições de distância e ângulo, cine para vídeo.
- **Ingestão no navegador:**
  - PNG/JPEG;
  - DICOM, anonimizado localmente;
  - vídeo de ecografia ou fluoroscopia, de onde são extraídos fotogramas-chave por amostragem uniforme e por mudança de cena.
- **Pipeline de análise em 6 etapas:**
  1. pré-processamento;
  2. triagem (modalidade, região, incidência, qualidade);
  3. pesquisa sistemática com lista de verificação por região;
  4. recuperação de evidência;
  5. síntese do relatório;
  6. segunda passagem de verificação pelo mesmo modelo (não é um leitor independente; omitida em modo local).
- **Achados com certeza expressa com o léxico de Panicek & Hricak** (auto-reportada pelo modelo, não calibrada). A confiança aparece em palavras, nunca em percentagem. As marcações aparecem ocultas por defeito, para o médico ler primeiro.
- **Evidência:**
  - base curada de referências verificadas no PubMed/Crossref por dois agentes independentes;
  - opcionalmente, o caderno **NotebookLM** do utilizador, ligado por MCP.
- **Relatório:**
  - estrutura ESR: indicação, técnica, achados, conclusão, recomendações, limitações e referências;
  - declaração de utilização de IA;
  - validação local com hash SHA-256;
  - exportação em PDF, texto, Markdown, FHIR R4 e pacote de auditoria.

## Modelos de IA — escolha em Definições

Por defeito a app usa a **IA integrada**: um modelo que corre dentro do navegador (WebGPU). Não precisa de instalar nada, nem de chaves, contas ou servidores, e as imagens não saem do dispositivo. O modelo é descarregado uma vez do Hugging Face e fica guardado no navegador.

| Opção | Onde corre | Custo | Qualidade | Para quê |
|---|---|---|---|---|
| **IA integrada** (por defeito) | O seu dispositivo, dentro do separador | Gratuito | Baixa — só triagem nesta versão | Abrir e usar, sem configurar |
| **Claude Opus 5.5** (API Anthropic) | Servidores da Anthropic (a chave fica no seu navegador) | Pago por utilização | A mais alta | Análise completa |
| **MedGemma 1.5 4B** (Google, modelo médico aberto) | O seu computador **ou** GitHub Codespaces | Gratuito | Intermédia | Análise completa sem API |

A IA integrada escolhe o modelo pelo aparelho:

- **Computador:** Qwen3.5 2B (Apache-2.0), cerca de 2,1 GB.
- **Telemóvel e tablet:** LFM2.5-VL 450M (LFM Open License v1.0), cerca de 0,3 GB. O iOS fecha páginas que usem mais de cerca de 1,5 GB de memória.

Se o navegador fechar a página por falta de memória, a app deteta-o na visita seguinte e passa para um modelo mais pequeno. No iPhone é experimental. Para o Safari não apagar o modelo, use **Partilhar → Adicionar ao ecrã principal**.

São modelos pequenos e genéricos, não validados em imagem musculoesquelética. Nesta versão fazem só a triagem: modalidade, região, incidência e qualidade.

### MedGemma no GitHub Codespaces (sem API)

1. Clique em **[Abrir no GitHub Codespaces](https://codespaces.new/rgvduarte/med?quickstart=1)**. Precisa de uma conta GitHub; o plano gratuito inclui 120 horas-núcleo por mês.
2. Aguarde 5–10 minutos na primeira vez. O ambiente instala o Ollama, descarrega o MedGemma 1.5 4B (3,3 GB) e arranca a app.
3. A app abre automaticamente na porta 4173, já configurada para o MedGemma.

Notas:
- O Codespace não tem GPU. Cada análise demora vários minutos, por isso o modo local envia no máximo 4 imagens e omite o segundo leitor. Escolha a máquina de 8 núcleos para cerca do dobro da velocidade.
- As imagens vão do seu navegador para a sua máquina virtual no GitHub, não para um fornecedor de IA. Use apenas imagens anonimizadas.
- Os termos do GitHub permitem o Codespaces para desenvolvimento e teste, não como serviço clínico em produção. O MedGemma está sujeito aos [termos HAI-DEF da Google](https://developers.google.com/health-ai-developer-foundations/terms).

### MedGemma no seu computador

Veja [`local-ai/`](local-ai/).

### Claude (API Anthropic)

Em **Definições**, introduza a sua chave da API. A chave é usada diretamente pelo navegador para falar com `api.anthropic.com` e, por defeito, fica apenas na sessão do separador.

## NotebookLM (opcional)

Ligue o seu caderno NotebookLM através de uma ponte MCP local (`notebooklm-mcp-cli` + `supergateway`). As instruções e o comando gerado estão em **Definições → NotebookLM**. Funciona em Chrome, Edge e Firefox; o Safari bloqueia pedidos a `localhost`.

## Desenvolvimento

```bash
npm ci
npm run dev        # http://localhost:5173
npm test           # testes unitários (vitest)
npm run build      # build estático para dist/
```

A cada push, o workflow em `.github/workflows/deploy.yml` compila e publica no ramo `gh-pages`.

Para ver a interface com dados de exemplo em desenvolvimento, abra `http://localhost:5173/?fixture=1#/`.

## Privacidade

- Não há servidor da plataforma: o site é estático e tudo corre no navegador.
- Os estudos ficam apenas em memória e desaparecem ao recarregar a página.
- Com a IA integrada (por defeito), as imagens nunca saem do navegador: só os pesos do modelo são descarregados.
- Com Claude ou MedGemma, as imagens só saem do navegador quando pede uma análise, e apenas para o fornecedor que configurou.

## Segurança

- **Política de segurança de conteúdo (CSP).** A página só pode ligar-se a:
  - `api.anthropic.com`;
  - `localhost` e `127.0.0.1` (Ollama, ponte NotebookLM);
  - Hugging Face, para o modelo no navegador.

  Para um servidor HTTPS próprio, por exemplo um túnel, compile com `CSP_CONNECT_EXTRA="https://o-seu-servidor" npm run build`.
- **Origem partilhada.** No GitHub Pages, todos os sites de `rgvduarte.github.io` partilham a mesma origem e, por isso, o mesmo armazenamento local: chave da API (se a guardar), chave da ponte NotebookLM e autorizações CORS. Para uso continuado, prefira um domínio próprio ou uma conta/organização dedicada a esta app. Use sempre uma chave da API com limite de gastos.

## Licenças

- **Código:** deste repositório.
- **Interface:** componentes de vidro adaptados do [Ein UI](https://github.com/einui/einui) (MIT) — ver [`src/components/ui/glass/`](src/components/ui/glass/).
- **Imagens de demonstração:** licenças abertas, com atribuição na própria app.
- **Modelos:** cada um tem a sua licença — MedGemma (HAI-DEF), Qwen3.5 (Apache-2.0), LFM2.5-VL (LFM Open License v1.0).
