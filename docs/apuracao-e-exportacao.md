# Apuração por Município e Exportação

Sprint 7. Entrega o resultado no formato em que ele será usado.

## Princípio

O arquivo exportado é montado **pelo mesmo serviço que alimenta o painel**
(`ResultadosService`). Nenhum total é recalculado no caminho da exportação e
nenhum percentual é fixo no código: se a tela e o arquivo divergissem, a
apuração perderia valor como documento.

Continua valendo o invariante do painel: toda leitura sai de view materializada
atualizada pelo job de agregação. A exportação não varre `resposta`.

## Novas leituras

| Rota | Guard | O que devolve |
|---|---|---|
| `GET /resultados/:formularioId/ranking-municipios` | Administrador, Analista | ranking por município no recorte, com absoluto, posição e percentual |
| `GET /resultados/:formularioId/cobertura` | Administrador, Analista | os 417 municípios da Bahia, com zero para os não alcançados |
| `GET /resultados/:formularioId/cruzamento` | Administrador, Analista | matriz de duas perguntas (ex.: intenção de voto por faixa etária) |

O ranking sai de `mv_evolucao_coleta` — a mesma view do indicador de respostas
válidas. É o que garante que a soma da tabela feche com o total do painel e com
o arquivo exportado.

A cobertura é sempre da pesquisa inteira: cobertura é alcance acumulado da
coleta, não recorte de leitura. Município não alcançado permanece na lista com
zero, porque essa lista é a que orienta o próximo dia de campo.

### Cruzamento

`mv_cruzamento_pergunta` é uma segunda tabela de fatos: par de perguntas × par
de alternativas × município. Ela existe porque o cruzamento precisa olhar duas
perguntas da **mesma** resposta, vínculo que `mv_resultado_detalhado` já
perdeu.

- cada par aparece uma única vez, na ordem das perguntas do formulário
  (`pa.ordem < pb.ordem`); a API aceita as duas orientações e devolve orientado
  como o chamador pediu;
- a dimensão de dia fica **de fora**: com ela o produto cartesiano de pares
  cresce rápido demais para um refresh honesto. O cruzamento aceita filtro de
  município, não de período;
- percentual de cada célula é sobre o total da linha — é assim que se lê
  "intenção de voto por faixa etária".

## Exportação

| Rota | Guard | Formato |
|---|---|---|
| `GET /exportacao/:formularioId/csv` | Administrador, Analista | tabela única normalizada, `;` e UTF-8 com BOM |
| `GET /exportacao/:formularioId/xlsx` | Administrador, Analista | planilha ExcelJS: Resumo, Por pergunta, Municípios, Evolução |
| `GET /exportacao/:formularioId/pdf` | Administrador, Analista | o próprio painel renderizado no Puppeteer |

Os filtros da query são os mesmos do painel — o arquivo sai com o recorte que
estava na tela. As três rotas têm rate limit próprio
(`EXPORTACAO_THROTTLE_LIMITE`, padrão 6 por minuto), porque exportar é caro.

**Só agregado sai daqui.** Não existe caminho que exporte resposta individual:
nem id de resposta, nem hash de dispositivo, nem geolocalização, nem horário
individual de envio.

No CSV, texto que começa com `=`, `+`, `-` ou `@` é prefixado com apóstrofo: sem
isso, conteúdo vindo do banco viraria fórmula ao abrir no Excel.

### PDF

O Puppeteer abre **o próprio painel** em modo de impressão
(`?impressao=1&formularioId=…`), como o backlog decidiu: os gráficos não são
reimplementados no servidor, então PDF e tela não podem divergir.

O access token de quem pediu a exportação é injetado no contexto da página antes
do primeiro script (`window.__SPE_TOKEN_DE_IMPRESSAO__`), nunca em query string
nem em `localStorage`. O painel adota o token só em memória e marca
`data-impressao="pronta"` quando os dados chegaram e os gráficos terminaram de
desenhar — é esse sinal que o renderizador espera.

Operação:

- `PAINEL_URL` precisa ser a **URL pública** do painel: é a origem que passa no
  CORS da API e a mesma que os usuários acessam. O host tem de ser resolvível de
  dentro do container da API;
- a imagem da API instala o Chromium do sistema (`PUPPETEER_EXECUTABLE_PATH`),
  porque o Chromium que o Puppeteer baixa é compilado para glibc e não roda em
  Alpine;
- `EXPORTACAO_PDF_TIMEOUT_MS` limita cada tentativa; são duas tentativas e a
  falha vira `503`, não erro silencioso;
- `EXPORTACAO_PDF_TLS_INVALIDO=true` só em homologação, onde o certificado é
  autoassinado.

## Auditoria

Toda exportação concluída gera `EXPORTACAO_GERADA` com usuário, data/hora,
formato, nome do arquivo, tamanho, o recorte pedido e o total de respostas
válidas do recorte. O token da requisição, o hash de dispositivo e a
geolocalização nunca entram — a higienização do `AuditoriaService` recusa essas
chaves de qualquer origem.

## Verificação

- `apps/api/src/exportacao/exportacao.service.spec.ts` — totais, escape de
  fórmula, auditoria sem dado de respondente, recusa de rascunho;
- `apps/api/src/resultados/resultados.service.spec.ts` — ranking, cobertura e
  matriz de cruzamento;
- `apps/api/test/apuracao-e-exportacao.e2e-spec.ts` — critério de aceite da
  sprint contra banco de verdade: o total do CSV bate com o indicador do painel
  e a exportação aparece no log de auditoria. O PDF não entra na suite: ele
  exige o painel servido, então é verificação de ambiente.
