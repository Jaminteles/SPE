# Coleta

Sprint 4. Fluxo do respondente, da abertura do link ao envio da resposta.

## Princípio

O respondente **não tem conta e não se identifica**. A rota é pública por
natureza — e por isso é a mais protegida do sistema: rate limit próprio,
validação estrita, token opaco no lugar do id interno e nenhum campo de
identificação aceito no corpo.

## Ordem do fluxo

```
consentimento → município → perguntas (uma por tela) → revisão → envio
```

A ordem é fixa. O consentimento antecede a primeira pergunta, sempre: sem
aceite registrado nada é gravado, nem no aparelho nem no servidor.

## Consentimento

`TelaConsentimento` traz finalidade, anonimato, o que é guardado, prazo de
retenção (4 anos para a resposta, encerramento da coleta para o dado técnico de
duplicidade) e voluntariedade. O aceite grava `consentimentoEm` no rascunho
local e viaja no pacote de envio.

> O texto é a base legal mínima e **precisa de validação do responsável pela
> pesquisa** antes da coleta real.

## Município

Lista fechada dos 417 municípios da Bahia, com busca por digitação que **filtra**
— nunca cria. O que sai da tela é sempre o **código IBGE**; o nome fica só como
rótulo local, porque grafia divergente inutilizaria a apuração por município.

Resposta com município fora da Bahia não é descartada: entra como
`EM_CONFERENCIA`, com o motivo registrado.

## Perguntas

Uma pergunta por tela, com barra de progresso. Os cinco tipos são renderizados
com o controle adequado (rádio, caixas, escala com rótulos, número, texto).
Pergunta obrigatória trava o avanço; opcional é sinalizada como tal.

A **lógica condicional** roda igual nos dois lados: `perguntasVisiveis` no app e
`perguntasAplicaveis` no serviço aplicam a mesma regra. Quando uma resposta
oculta perguntas já respondidas, o app apaga essas respostas do rascunho —
resposta de pergunta oculta é recusada pelo servidor, e com razão.

## Preenchimento parcial

Persistido em **expo-sqlite** (`apps/app/src/coleta/banco-local.ts`), não em
armazenamento chave-valor: resposta com lógica condicional é dado estruturado.

| Tabela local | Papel |
|---|---|
| `rascunho` | pesquisa em andamento: token, id da resposta, consentimento, município, posição atual, geolocalização |
| `rascunho_item` | uma linha por pergunta respondida |
| `envio_pendente` | fila de reenvio, com tentativas e próxima tentativa |

Cada passo grava na hora. Ao reabrir a mesma pesquisa, o app retoma no ponto
exato: consentimento pendente → consentimento; município em branco → município;
resto → pergunta onde parou.

## Envio e reenvio

O pacote entra na fila local **antes** de qualquer tentativa de rede. Se o envio
falhar, a resposta fica guardada e é reenviada sozinha:

- na abertura do app;
- quando o app volta ao primeiro plano;
- por toque do usuário.

O backoff é 30s, 2min, 8min, 32min, com teto de 2h. Falha definitiva (4xx que
não seja 429) sai da fila — reenviar não resolveria.

O `respostaId` é gerado no aparelho, o que torna o envio **idempotente**: o mesmo
pacote reenviado devolve o registro já gravado, sem duplicar. Resposta duplicada
do mesmo aparelho na mesma pesquisa é barrada pelo índice parcial
`uq_resposta_dispositivo_ativo` e responde 409.

## Identificação do aparelho

O app gera um uuid aleatório na primeira execução e guarda no armazenamento
seguro. Não vem de IMEI, MAC, conta ou qualquer coisa ligada à pessoa.

O servidor **nunca persiste esse valor**: grava `HMAC-SHA256(DEVICE_HASH_PEPPER,
dispositivoId)`. Sem o pepper de ambiente o hash não volta ao original, e o
identificador em claro não aparece em log nem em resposta de API.

## Geolocalização

Opcional, pedida explicitamente na tela de revisão, com texto dizendo que serve
apenas para conferência e que recusar não impede o envio. Nunca vai em URL nem
em query param — viaja no corpo do POST.

## Endpoints

| Método | Rota | Guard |
|---|---|---|
| GET | `/api/v1/coleta/:token` | público · 30 req/min por origem |
| POST | `/api/v1/coleta/:token/respostas` | público · 10 req/min por origem |

Os limites são configuráveis por ambiente (`COLETA_THROTTLE_LIMITE_ABERTURA`,
`COLETA_THROTTLE_LIMITE_ENVIO`, `COLETA_THROTTLE_TTL_MS`) e o padrão é
restritivo.

`TokenDeColetaPipe` recusa qualquer token fora do formato base64url de 22
caracteres antes de tocar no banco.

O formulário público devolve só o que a tela precisa: título, descrição,
perguntas e alternativas. Nada de id de formulário, status, autor ou contagem.

## O que o servidor confere no envio

O app decide o que mostrar; o servidor **confere tudo de novo**:

- pesquisa existe, está em coleta e dentro da vigência;
- consentimento aceito;
- município existe na base do IBGE;
- cada item pertence a uma pergunta da pesquisa;
- tipo compatível (alternativa da própria pergunta, escala dentro da faixa,
  texto para texto, número para número);
- pergunta obrigatória visível respondida;
- nenhuma resposta em pergunta que a condição não habilitou;
- datas declaradas sem absurdo (nada no futuro, coleta não anterior ao aceite).

## Teto de respostas por aparelho

Um aparelho envia no máximo **10 respostas por hora**
(`COLETA_LIMITE_POR_APARELHO_HORA`). Estourado o teto, a rota responde **429** e não grava.

Isto é diferente das marcações automáticas. Marcação é suspeita sobre uma resposta e quem
julga é o Administrador — ela nunca descarta nada. Teto é limite de uso da instalação, e
julgar caso a caso seria tarde demais: o custo do abuso já teria sido pago.

A contagem sai da tabela de respostas, filtrada pelo hash do aparelho, e não de um contador
em memória — reinício da API ou uma segunda instância zerariam o contador, e o teto viraria
decoração. O índice parcial `ix_resposta_dispositivo_recebido` cobre exatamente esse filtro.

Por aparelho e não por IP: o IP muda a cada troca de rede e é compartilhado por todo mundo
atrás do mesmo NAT — uma escola inteira sairia pelo mesmo endereço. O rate limit por origem
continua existindo, na frente, como primeira barreira.

O reenvio do mesmo pacote **não** consome vaga: a idempotência é conferida antes do teto, e
quem já gravou está pedindo o recibo de novo, não gastando um envio novo.

## Teto de pesquisas em coleta

Cada conta tem no máximo **10 pesquisas simultaneamente em coleta**
(`LIMITE_PESQUISAS_EM_COLETA`), conferido na publicação — o momento em que a pesquisa passa a
consumir recurso de verdade: link vivo, sessões abertas, respostas chegando. Rascunho não
custa nada e não entra na conta.

A cota é do **dono** da pesquisa, não de quem aperta o botão: o Administrador pode publicar a
pesquisa de outra pessoa, e isso consome a cota de quem criou.

Encerrar devolve a vaga — o teto é de simultâneas, não de total já publicado.

## Verificação anti-robô

Está em task própria (Cloudflare Turnstile) e ainda não entrou. Até lá, a rota
pública conta com rate limit por origem e validação estrita.
