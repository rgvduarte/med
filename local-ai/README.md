# IA local: MedGemma no seu computador, sem a API da Anthropic

Esta pasta permite usar o MSK.ai **sem enviar imagens para a Internet**. O modelo de visão-linguagem
(Google **MedGemma**) corre no seu computador através do **Ollama**, e a aplicação comunica com ele em
`http://localhost:11434`. Depois da primeira instalação tudo funciona **offline**.

> **Apenas para investigação e formação.** O MedGemma não é um dispositivo médico. A Google indica que os seus
> resultados "não se destinam a informar diretamente o diagnóstico clínico" e devem ser verificados de forma
> independente. Os termos de utilização (HAI-DEF) proíbem usos que tornem a Google "fabricante" de um dispositivo
> médico e decisões automatizadas em saúde. Todo o relatório tem de ser revisto e validado por um médico.
> Ver [Licença e uso clínico](#8-licença-e-uso-clínico).

---

## Resumo rápido

| Sistema | O que fazer |
|---|---|
| **macOS** (Apple Silicon) | Terminal → `./local-ai/start.sh` → abrir https://rgvduarte.github.io/med/ no Chrome/Edge/Firefox, ou `./local-ai/start.sh --serve` e abrir http://localhost:8080 (necessário no **Safari**) |
| **Windows 10/11** | PowerShell → `powershell -ExecutionPolicy Bypass -File .\local-ai\start.ps1` → abrir https://rgvduarte.github.io/med/ no Edge/Chrome/Firefox |
| **Linux** | `./local-ai/start.sh` (ou Docker Compose, abaixo) |
| **Docker** (Linux/Windows, GPU NVIDIA) | `cd local-ai && docker compose -f docker-compose.yml -f docker-compose.nvidia.yml up -d` → http://localhost:8080 |

Depois, na aplicação: **Definições → MedGemma local / Codespaces**. Os valores por omissão (URL base
`http://localhost:11434/v1`, modelo `medgemma`) já estão certos. Ver a [secção 5](#5-definições-da-aplicação).

---

## 1. Que modelo?

| Modelo (Ollama) | O que é | Recomendação |
|---|---|---|
| **`medgemma1.5:4b`** → `medgemma` | MedGemma 1.5 4B (jan. 2026), multimodal, Q4_K_M, 3,3 GB | **Recomendado.** Melhor que o MedGemma 1 27B em várias tarefas de imagem e muito melhor a localizar estruturas com caixas (IoU 38 vs 16 no Chest ImaGenome). Treinado com RM 3D (inclui joelho) e radiografias do joelho. |
| `medgemma:27b` | MedGemma 1 27B multimodal (jul. 2025), Q4_K_M, 17 GB | Opcional, para computadores com ≥ 32–48 GB. Melhor em texto médico, sem vantagem clara em imagem. |
| `medgemma:4b` | MedGemma 1 4B (mai. 2025) | Substituído pelo 1.5. |

**Cobertura musculoesquelética limitada.** Os dados de treino publicados incluem radiografias e RM do joelho, mas
não incluem conjuntos de fraturas dos membros, MURA nem ecografia. Num estudo independente com radiografias de
tumores ósseos (BTXRD, 3646 casos), o MedGemma 4B (versão não indicada) teve exatidão de 0,68 na deteção (especificidade 0,53) e
sensibilidade de 0,11 para lesões malignas. O MedGemma foi avaliado sobretudo com **uma imagem por pedido**.
Espere menos qualidade do que com o Claude e valide-o nos seus próprios casos antes de confiar nele.

Modelos gerais (sem treino médico) também disponíveis no Ollama, apenas para comparação: `gemma4:e4b`,
`gemma4:26b`, `qwen3.5:9b`, `qwen3-vl:8b`. Para os usar: `BASE_MODEL=qwen3-vl:8b LOCAL_MODEL=qwen3-vl-msk ./local-ai/start.sh`
(no Windows: `.\local-ai\start.ps1 -BaseModel qwen3-vl:8b -LocalModel qwen3-vl-msk`) e indique `qwen3-vl-msk` nas Definições.

## 2. Requisitos

| Modelo | Memória usada (contexto 16k) | Computador mínimo / recomendado |
|---|---|---|
| `medgemma1.5:4b` (Q4_K_M, 3,3 GB) | ≈ 5–6 GB | Mac M1 ou superior com 16 GB (8 GB funciona, mas no limite) · PC com GPU NVIDIA ≥ 8 GB (6 GB no limite) **ou** só CPU com 16 GB de RAM |
| `medgemma1.5:4b-it-q8_0` (5,0 GB) | ≈ 7–8 GB | Mac com 16 GB · GPU ≥ 8–10 GB |
| `medgemma:27b` (Q4_K_M, 17 GB) | ≈ 20–24 GB | Mac com 48 GB (32 GB no limite) · GPU de 24 GB |

Espaço em disco: 4 GB (4B) ou 18 GB (27B). Ollama: macOS 14 Sonoma ou superior; Windows 10 22H2 ou superior;
GPU NVIDIA com controlador ≥ 550 (Linux) / ≥ 551.61 (Windows).

**Tempo por caso** (3 imagens; triagem, achados e relatório). São **estimativas** feitas a partir de testes públicos do
llama.cpp, não medições com este modelo. Meça no seu computador.

| Computador | MedGemma 1.5 4B | MedGemma 27B |
|---|---|---|
| Mac M1/M2/M3/M4 base | 2–4 min | não recomendado |
| Mac M-Pro | 1–2 min | 6–10 min |
| Mac M-Max | < 1 min | 3–5 min |
| PC com RTX 3060 12 GB / 4060 Ti | 30–60 s | não cabe |
| PC com RTX 3090/4090 24 GB | < 30 s | 1–2 min |
| Só CPU (8 núcleos, DDR5) | 5–10 min | impraticável |

O primeiro pedido demora mais porque o modelo é carregado em memória. Em modo local a aplicação envia no máximo
4 imagens por pedido.

## 3. Instalação passo a passo

Precisa de Internet **só na primeira vez** (≈ 3,3 GB para o modelo). Os scripts:

1. instalam o Ollama, se faltar (pedem confirmação);
2. autorizam a origem `https://rgvduarte.github.io` (variável `OLLAMA_ORIGINS`) e desligam as funções de nuvem
   do Ollama (`OLLAMA_NO_CLOUD=1`);
3. transferem `medgemma1.5:4b` e criam a partir dele o modelo `medgemma` (o nome que a aplicação usa por omissão),
   com contexto de 16 384 tokens e temperatura 0 (ver `Modelfile`);
4. fazem um teste com uma imagem e JSON estruturado.

### macOS (Apple Silicon)

1. Abra o **Terminal** na pasta do repositório (`git clone https://github.com/rgvduarte/med.git && cd med`).
2. Execute:
   ```bash
   chmod +x local-ai/start.sh
   ./local-ai/start.sh
   ```
   Se o Ollama não estiver instalado, o script oferece-se para o instalar. Também o pode instalar em
   https://ollama.com/download (arraste o Ollama.app para Aplicações).
3. Para usar o **Safari**, ou para trabalhar sem Internet, sirva a aplicação localmente:
   ```bash
   ./local-ai/start.sh --serve        # abre em http://localhost:8080
   ```
   Precisa do `python3`. Se o macOS pedir para instalar as "Ferramentas de linha de comandos", aceite.
4. O macOS esquece `OLLAMA_ORIGINS` quando reinicia. Volte a correr `./local-ai/start.sh` depois de reiniciar se usar
   a versão do GitHub Pages. Com `--serve` isto não é necessário.

### Windows 10/11

1. Abra o **PowerShell** na pasta do repositório.
2. Execute:
   ```powershell
   powershell -ExecutionPolicy Bypass -File .\local-ai\start.ps1
   ```
   Se o Ollama não estiver instalado, o script oferece-se para o instalar (`irm https://ollama.com/install.ps1 | iex`).
   Também o pode instalar com o `OllamaSetup.exe` de https://ollama.com/download. O script grava `OLLAMA_ORIGINS` e
   `OLLAMA_NO_CLOUD` nas variáveis de ambiente do utilizador e reinicia o Ollama.
3. Abra https://rgvduarte.github.io/med/ no Edge, Chrome ou Firefox e **permita** o acesso ao dispositivo quando
   o navegador perguntar.
4. Opcional: `.\local-ai\start.ps1 -Serve` serve a aplicação em http://localhost:8080 (precisa do Python 3).

### Linux

```bash
chmod +x local-ai/start.sh
./local-ai/start.sh            # ou: ./local-ai/start.sh --serve
```

O instalador oficial cria o serviço `systemd` `ollama`. O script pede `sudo` para criar
`/etc/systemd/system/ollama.service.d/msk-vlm.conf` com `OLLAMA_ORIGINS` e `OLLAMA_NO_CLOUD`.

### Docker Compose (Linux, ou Windows com Docker Desktop)

```bash
cd local-ai
docker compose up -d                                                      # só CPU
docker compose -f docker-compose.yml -f docker-compose.nvidia.yml up -d   # GPU NVIDIA
docker compose -f docker-compose.yml -f docker-compose.amd.yml up -d      # GPU AMD (ROCm, Linux)
docker compose logs -f model-init                                         # acompanhar a transferência
```

Isto cria três serviços: `ollama` (porta 11434, só neste computador), `model-init` (corre uma vez para transferir o
modelo e criar `medgemma`) e `app` (a aplicação compilada a partir deste repositório, em http://localhost:8080, já
configurada para o modelo local; não é preciso mudar nada nas Definições).

* **GPU NVIDIA no Linux:** instale o controlador NVIDIA e o
  [NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html),
  depois `sudo nvidia-ctk runtime configure --runtime=docker && sudo systemctl restart docker`.
* **GPU NVIDIA no Windows:** Docker Desktop com WSL 2 e controlador NVIDIA atualizado (`wsl --update`).
* **macOS:** o Docker não usa a GPU do Mac. Use o Ollama nativo (`./local-ai/start.sh`) e, se quiser, só
  `docker compose up -d app`.
* Outro modelo: `BASE_MODEL=medgemma:27b LOCAL_MODEL=medgemma27-msk docker compose up -d`. Outra porta: `APP_PORT=8090 docker compose up -d`.
* Para verificar se a GPU está a ser usada: `docker compose exec ollama ollama ps` (coluna PROCESSOR).

## 4. Abrir a aplicação

**A. Versão publicada** (https://rgvduarte.github.io/med/), no Chrome, Edge ou Firefox.
O navegador pergunta se o site pode aceder a aplicações e serviços **neste dispositivo**. Escolha **Permitir**.
Esta autorização existe no Chrome desde a versão 142, no Edge desde a 143 e no Firefox desde a 151/153. Se a recusou
por engano, clique no cadeado da barra de endereço → Definições do site → volte a permitir o acesso.
**O Safari não funciona** neste modo: bloqueia pedidos de páginas `https://` para `http://localhost`.

**B. Versão local** (http://localhost:8080), em qualquer navegador, incluindo o Safari, e sem Internet:
`./local-ai/start.sh --serve`, `.\local-ai\start.ps1 -Serve` ou `docker compose up -d`. O `serve.py` usa a pasta
`dist/` se tiver compilado a aplicação (`npm run build`). Caso contrário, transfere uma vez a versão publicada para
`local-ai/.app-cache/`. Abra sempre `http://localhost:8080`, não o endereço IP: as definições ficam guardadas por
endereço, e alguns recursos do navegador só funcionam em `localhost`.

Para programadores com Node.js 22: `npm ci && npm run build && npx vite preview --port 8080 --strictPort`. O
`vite preview` também encaminha `/ollama/*` para `127.0.0.1:11434`, como no Codespaces. Pode então usar a URL base
`/ollama/v1`, sem CORS.

## 5. Definições da aplicação

| Campo | Valor |
|---|---|
| Fornecedor | **MedGemma local / Codespaces** |
| URL base (compatível OpenAI) | `http://localhost:11434/v1` |
| Modelo | `medgemma` |

Notas:
* Em modo local a aplicação envia no máximo 4 imagens por pedido (a 896 px), mostra o progresso da geração e omite
  o "segundo leitor". A verificação das citações continua a ser feita.
* Aqui `medgemma` é o `medgemma1.5:4b` com `num_ctx 16384`. Não confundir com o `medgemma` da biblioteca do Ollama
  (MedGemma 1): não corra `ollama pull medgemma`, porque substituiria este modelo. Corra outra vez o script.
* **Não use `medgemma1.5:4b` diretamente**: por omissão o
  Ollama usa 4096 tokens de contexto em GPUs com menos de 24 GB. Cada imagem ocupa 256 tokens, e um pedido com várias
  imagens e o esquema JSON excede esse limite. Nesse caso o pedido falha, ou é truncado sem aviso.
* Para outro servidor: LM Studio `http://localhost:1234/v1`; llama.cpp `http://localhost:8081/v1` (ver abaixo).

## 6. Alternativas ao Ollama

**llama.cpp (`llama-server`)**: instale com `brew install llama.cpp` (macOS/Linux) ou `winget install llama.cpp`
(Windows). Depois:

```bash
llama-server -hf unsloth/medgemma-1.5-4b-it-GGUF:Q4_K_M --jinja -c 16384 --port 8081 \
  --cors-origins https://rgvduarte.github.io        # ou --cors-origins localhost para a versão local
```

O `-hf` transfere o modelo e o projetor de visão (`mmproj`) automaticamente. Indique sempre `--port`: a porta por
omissão mudou entre versões. Por omissão, `--cors-origins` aceita **qualquer** site (`*`). Restrinja-o como acima.
URL base na aplicação: `http://localhost:8081/v1`.

**LM Studio**: em *Discover*, procure `medgemma-1.5-4b-it` (GGUF) e transfira-o. Depois, em *Developer*, ative
*Enable CORS* e inicie o servidor, ou use `lms server start --cors`. URL base: `http://localhost:1234/v1`. O nome do
modelo é o que aparece em `http://localhost:1234/v1/models`.

## 7. Problemas comuns

| Sintoma | Causa provável e solução |
|---|---|
| "Sem ligação ao servidor local" no GitHub Pages | Falta autorizar a origem (corra o script outra vez), ou recusou a permissão de acesso ao dispositivo no navegador, ou está no Safari (use a versão local). Teste: `curl -i -H "Origin: https://rgvduarte.github.io" http://127.0.0.1:11434/api/version` deve devolver `200` (`403` significa que a origem não está autorizada). |
| `model "medgemma" not found` | Corra `./local-ai/start.sh` (ou `ollama pull medgemma1.5:4b && ollama create medgemma -f local-ai/Modelfile`). |
| Muito lento | `ollama ps`: a coluna PROCESSOR deve indicar `100% GPU`. Reduza o número de imagens por caso ou use `NUM_CTX=8192`. |
| Sem memória | Use o modelo 4B Q4_K_M, feche outras aplicações e reduza o contexto (`NUM_CTX=8192 ./local-ai/start.sh`). |
| JSON inválido ou campos estranhos | Modelos de 4B são mais frágeis. A aplicação já pede temperatura 0 e JSON Schema e tenta uma segunda vez. Reveja sempre o resultado. |
| Respostas em inglês | O MedGemma foi treinado sobretudo em inglês. Pode escolher o relatório em inglês nas Definições. |

Comandos úteis: `ollama ps` (modelos carregados), `ollama list`, `ollama show medgemma --license`,
`ollama rm medgemma`.

## 8. Licença e uso clínico

* O MedGemma é distribuído sob os **Health AI Developer Foundations Terms of Use**
  (https://developers.google.com/health-ai-developer-foundations/terms) e a respetiva
  **Prohibited Use Policy** (https://developers.google.com/health-ai-developer-foundations/prohibited-use-policy).
  Ao usar o modelo aceita esses termos, qualquer que seja a origem de onde o transferiu.
* No Hugging Face os pesos oficiais (`google/medgemma-1.5-4b-it`) exigem sessão iniciada e aceitação dos termos.
  O Ollama (`medgemma1.5`) e as versões GGUF de terceiros (ex.: `unsloth/medgemma-1.5-4b-it-GGUF`) não pedem
  essa aceitação, mas os termos aplicam-se na mesma. Veja-os com `ollama show medgemma1.5:4b --license`.
* Este repositório **não redistribui** o modelo: cada utilizador transfere-o diretamente. Se partilhar o modelo
  (ex.: uma imagem Docker com o modelo incluído), tem de cumprir a secção 3.1 dos termos: fornecer cópia dos termos,
  incluir as restrições de uso e um ficheiro NOTICE com: "HAI-DEF is provided under and subject to the Health AI
  Developer Foundations Terms of Use found at https://developers.google.com/health-ai-developer-foundations/terms".
* Os termos proíbem usar o modelo de forma que leve uma autoridade reguladora a considerar a Google "fabricante" de
  um dispositivo médico. A política de uso proíbe decisões automatizadas em saúde e a prática não licenciada de
  medicina. O uso clínico na UE exigiria avaliação como dispositivo médico (MDR). Esta ferramenta é um protótipo
  de investigação.
