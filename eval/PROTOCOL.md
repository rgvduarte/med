# Avaliação da IA integrada em radiografias musculoesqueléticas — protocolo

> Escrito e enviado para o repositório **antes** da execução no conjunto de teste. O histórico do git serve de registo prévio.

## Pergunta

A IA integrada (o modelo que corre no navegador, sem servidores) deve passar a assinalar **«regiões a rever»** (possível fratura) no computador, ou continuar a fazer só a triagem?

## Dados

- **Fonte:** FracAtlas — Abedeen et al., *Scientific Data* 2023. Figshare [10.6084/m9.figshare.22363012](https://doi.org/10.6084/m9.figshare.22363012), CC BY 4.0. São 4083 radiografias, 719 com fratura, com rótulo de região e caixas de fratura (COCO).
- **Critérios de elegibilidade:**
  - uma só região (mão, membro inferior, anca ou ombro);
  - sem material de osteossíntese;
  - não «mixed».
- **Amostra de teste:** `sample-test.json` — 100 imagens.
  - 50 com fratura e 50 sem fratura.
  - Estratificada por região: mão 20 + 20, membro inferior 16 + 16, anca 7 + 7, ombro 7 + 7.
  - Sorteio com semente fixa 20261028.
- **Amostra de desenvolvimento:** `sample-dev.json` — 18 imagens, disjunta da de teste. Serve só para afinar o formato do prompt.
- As imagens não são copiadas para o repositório; só os identificadores.

## Modelos e condições

- **Biblioteca e pesos:** os da app — Transformers.js 4.3.1, pesos ONNX nas revisões fixadas em `src/lib/vlm/browser/models.ts`.
- **Tamanho das imagens:** igual ao do worker — lado maior ≤ 768 px (Qwen) ou ≤ 512 px (LFM), múltiplos de 32.
- **Saída:** JSON com descodificação restrita por gramática.
- **Variante dos pesos:** a variante q4 («f32 path»), que corre em ONNX Runtime CPU. No navegador com `shader-f16`, o Qwen3.5 2B usa o codificador visual em fp16, o que deve ser igual ou melhor.
- **Diferença em relação à app:** só o motor (CPU em vez de WebGPU).
- **Contexto clínico:** nenhum. O prompt não revela a região.

| Tarefa | Modelo | Amostra |
|---|---|---|
| A. Rastreio de fratura (`fracture-prompt.ts`) | Qwen3.5 2B (computador) | 100 imagens de teste |
| B. Triagem: região anatómica (prompt e esquema da app) | LFM2.5-VL 450M (telemóvel) | 100 imagens de teste |
| C. Triagem: região anatómica | Qwen3.5 2B | primeiras 40 imagens de teste |

O prompt da tarefa A fica **congelado** depois da amostra de desenvolvimento. Não há afinação no conjunto de teste.

## Parâmetros

### Primários (tarefa A)

- **Sinal positivo:** `fracture = "yes"` ou `"uncertain"` («região a rever»).
- **Sensibilidade** = sinais positivos nas 50 imagens com fratura ÷ 50.
- **Especificidade** = `"no"` nas 50 imagens sem fratura ÷ 50.
- **Intervalos:** IC 95% de Wilson.
- Uma resposta inválida (JSON) conta como «sem sinal». No uso real seria uma falha silenciosa, por isso não se favorece o modelo.

### Secundários

- **Localização (A):** nas fraturas assinaladas, a fração em que o centro da caixa do modelo (escala 0–1000) cai dentro de uma caixa de fratura do FracAtlas, alargada 10%.
- **Exatidão da região (B, C):** a região da triagem é compatível com o rótulo do FracAtlas.
  - mão → `wrist-hand`, `elbow` ou `long-bones`;
  - membro inferior («leg») → `knee`, `ankle-foot`, `long-bones` ou `hip-pelvis`;
  - anca → `hip-pelvis`;
  - ombro → `shoulder`.
- **Tempo por imagem e taxa de respostas inválidas.**

## Critérios de decisão (fixados antes do teste)

**Ativar «regiões a rever» no computador** só se, na tarefa A, se verificarem as três condições:

1. sensibilidade ≥ 0,85, **com** o limite inferior do IC 95% ≥ 0,75;
2. especificidade ≥ 0,50 (falsos alarmes tolerados, porque cada um é revisto pelo médico);
3. respostas inválidas ≤ 5%.

Se falhar, a IA integrada **continua só com triagem**. Os resultados são publicados na página Método.

**Triagem no telemóvel (tarefa B):**

| Exatidão da região | Decisão |
|---|---|
| ≥ 0,80 | Mantém-se como está. |
| 0,60–0,80 | Rotulada como «experimental». |
| < 0,60 | Retira-se a região da triagem no telemóvel; mostram-se só modalidade e qualidade. |

## Limitações conhecidas à partida

- O FracAtlas é de um só centro (Bangladesh), sobretudo membros; não inclui crianças pequenas de forma separada.
- Mede a deteção de fratura numa imagem, não a leitura completa nem o relatório.
- Com 50 casos por braço, o IC 95% tem cerca de ±10 pontos percentuais.
