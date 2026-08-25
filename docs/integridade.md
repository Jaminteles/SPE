# Integridade da Coleta

Sprint 5. O que garante que o número apurado signifique alguma coisa.

## Princípio

Nenhuma barreira automática **descarta** resposta. Duplicidade é recusada na
porta; suspeita vira **marcação** e vai para conferência humana; só o
Administrador tira uma resposta da contagem — e mesmo assim o registro
permanece no banco.

## Sessão de preenchimento

Abrir a pesquisa cria uma `sessao_coleta`. Ela resolve três coisas de uma vez:

1. **Início real do preenchimento**, medido pelo servidor — o relógio do
   aparelho não é fonte confiável.
2. **Uso único**: o mesmo token não grava duas respostas. Fecha o replay de um
   pacote capturado, mesmo vindo de outro aparelho.
3. **Origem**: guarda o HMAC do endereço de rede, só para medir volume anômalo.

O consumo é atômico (`updateMany` com `usadaEm: null` no WHERE): dois envios
simultâneos com o mesmo token, só um passa.

Tudo aqui é **dado técnico de duplicidade** — mesma classe do hash de
dispositivo, expurgado no encerramento da coleta. O token em claro só existe no
cliente; o banco guarda SHA-256. O endereço de rede nunca é persistido em claro.

### Reenvio tardio

Se a sessão expirar antes de um reenvio da fila local, o app renova a sessão e
tenta de novo com o **mesmo `respostaId`** — o servidor continua tratando o
envio como idempotente. Sem isso, uma resposta guardada offline por muito tempo
seria descartada como falha definitiva.

## Duplicidade

| Barreira | Onde | Resposta |
|---|---|---|
| Mesmo aparelho, mesma pesquisa | índice parcial `uq_resposta_dispositivo_ativo` | 409 |
| Mesma sessão usada duas vezes | `sessao_coleta.usadaEm` | 409 |
| Mesmo pacote reenviado | `respostaId` já gravado | 201 com o registro existente |

O `dispositivoId` é um uuid aleatório gerado na instalação do app, sem relação
com IMEI, MAC ou conta. O servidor grava apenas `HMAC-SHA256` com pepper de
ambiente.

## Marcação automática de suspeita

| Marcação | Regra | Configuração |
|---|---|---|
| `TEMPO_MUITO_BAIXO` | duração abaixo do maior valor entre o piso e o tempo por pergunta respondida | `COLETA_SEGUNDOS_MINIMOS` (15), `COLETA_SEGUNDOS_POR_PERGUNTA` (2) |
| `PADRAO_REPETITIVO` | todas as escolhas na mesma posição da lista, com pelo menos 4 perguntas de escolha | — |
| `VOLUME_ANOMALO_DA_ORIGEM` | sessões consumidas pela mesma origem acima do limite na janela | `COLETA_JANELA_ORIGEM_MIN` (10), `COLETA_LIMITE_ORIGEM` (15) |
| `MUNICIPIO_FORA_DA_BAHIA` | UF do município diferente de BA | — |

Marcada, a resposta entra como `EM_CONFERENCIA` com o motivo em texto. Os
limites são configuráveis porque dependem do tamanho do questionário e do
público — não são verdade universal. Um formulário curto respondido por alguém
apressado não pode sumir da apuração por decisão de heurística.

## Verificação anti-robô

Cloudflare Turnstile, escolhido por gerar menos atrito que o reCAPTCHA, atrás do
adapter `ProvedorAntiRobo` (timeout de 5 s, duas tentativas, credencial só por
ambiente).

| Situação | Comportamento |
|---|---|
| Sem `TURNSTILE_SECRET` | verificação desligada (desenvolvimento e teste) |
| Sem segredo e `TURNSTILE_OBRIGATORIO=true` | envio recusado — não se abre a porta por falta de configuração |
| Provedor fora do ar, obrigatório ligado | envio recusado |
| Provedor fora do ar, obrigatório desligado | envio aceito, sem verificação |

Origem `WEB` exige o desafio quando o Turnstile está configurado. Origem
`APLICATIVO` é dispensada por padrão (`TURNSTILE_EXIGIR_NO_APLICATIVO=false`):
lá o controle é o par sessão + dispositivo, e o widget exigiria um navegador
embutido no app. **A tela web de coleta ainda não existe** — quando existir, é
ela que precisa renderizar o widget e mandar o token em `desafioAntiRobo`.

## Invalidação manual

`POST /formularios/:id/respostas/:respostaId/invalidar`, com motivo obrigatório.

Muda o status para `INVALIDADA` e guarda autor, data e motivo. **Não apaga
nada**: a linha e os itens continuam no banco, apenas fora da contagem. Existe o
caminho de volta (`/revalidar`), também auditado.

Ambas as ações entram na auditoria com `RESPOSTA_INVALIDADA` e
`RESPOSTA_REVALIDADA` — sem hash de dispositivo e sem conteúdo respondido.

## Conferência

`GET /formularios/:id/respostas` lista para conferência: status, município,
tempo, marcações e geolocalização (que existe justamente para isso). A projeção
**não** traz `dispositivoHash` nem os itens respondidos — quem confere
integridade olha tempo e origem, não o voto de ninguém.

## Agregação pré-calculada

Três views materializadas, escritas à mão dentro da migration:

| View | Conteúdo |
|---|---|
| `mv_resumo_formulario` | válidas, em conferência, invalidadas, municípios alcançados, primeira e última resposta |
| `mv_resultado_pergunta` | total e percentual por alternativa, sobre respostas válidas |
| `mv_resultado_municipio` | o mesmo, por código IBGE — a apuração que é o objetivo do sistema |

Todas contam **apenas `status = 'VALIDA'`**, e o percentual é sempre derivado
(`ROUND(total * 100 / total_da_pergunta, 2)`). Cada view tem índice único, o que
permite `REFRESH ... CONCURRENTLY`: a leitura não trava durante a atualização.

A atualização roda numa tarefa periódica em processo (`AGREGACAO_INTERVALO_MIN`,
padrão 10 min), com 5 tentativas e backoff exponencial. `REFRESH` recalcula do
zero, então repetir a tarefa é inofensivo — a idempotência é da própria
operação. `AGREGACAO_INTERVALO_MIN=0` desliga o ciclo e deixa a atualização só
sob demanda.

Com a API replicada, cada réplica roda o próprio ciclo: desperdiça trabalho, não
corrompe dado. É a contrapartida de não depender de Redis.

`POST /agregacao/atualizar` (Administrador) força o recálculo — útil depois de
invalidar respostas em lote.

## Teste de carga reduzido

`npm --prefix apps/api run teste-de-carga`, com `API_URL`, `TOKEN_PESQUISA`,
`CONCORRENCIA` e `TOTAL`. Exercita o caminho completo: abrir a pesquisa (cria
sessão) e enviar (valida, analisa e grava em transação).

Foi antecipado de propósito: descobrir gargalo agora custa barato.
