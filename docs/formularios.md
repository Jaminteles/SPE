# Formulários, Perguntas e Alternativas

Sprints 2 e 3. Área do Administrador, na API e no aplicativo.

## Ciclo de vida

```
RASCUNHO ──publicar──> EM_COLETA ──encerrar──> ENCERRADO
   │
   └── excluir (só enquanto não houver resposta)
```

**Só existe escrita em `RASCUNHO`.** Publicado o formulário, perguntas e alternativas
são imutáveis, e o próprio formulário também: título, descrição e vigência param de
aceitar alteração. Não há caminho de volta e não há edição alternativa — mudar conteúdo
significa criar outro formulário/versão.

A regra vive num único lugar: `FormulariosService.exigirRascunho`, chamada por toda
operação de escrita. Quem tenta editar depois recebe `409`.

A troca de status usa trava otimista (`WHERE status = <origem>`): duas publicações
simultâneas não passam as duas.

## Validação para publicar

- ao menos uma pergunta;
- pergunta de escolha única ou múltipla com ao menos duas alternativas;
- pergunta de escala com faixa definida.

Faltando qualquer coisa, a resposta é `400` com a lista do que falta.

## Tipos de pergunta

| Tipo | Alternativas | Configuração própria |
|---|---|---|
| `UNICA_ESCOLHA` | obrigatórias (mín. 2) | — |
| `MULTIPLA_ESCOLHA` | obrigatórias (mín. 2) | — |
| `ESCALA` | não aceita | `escalaMinimo`, `escalaMaximo` (0 a 10) e rótulos das pontas |
| `TEXTO_LIVRE` | não aceita | — |
| `NUMERO` | não aceita | — |

O **tipo não muda depois de criado** — não está no DTO de atualização. Mudar o tipo é
criar outra pergunta, porque o tipo define como a resposta será apurada.

O banco reforça o que o serviço valida: `ck_pergunta_escala_coerente` garante que a
configuração de escala só existe no tipo `ESCALA` e sempre completa.

## Ordem

`ordem` começa em 1 e é contígua. Ao criar, a pergunta entra no fim; ao excluir, as
seguintes sobem (`decrement`), sem buraco.

A reordenação recebe **todos** os ids na ordem desejada — lista incompleta, com
repetição ou com id de outro contexto é recusada com `400`. A gravação é em duas fases
dentro de uma transação, porque `(formulario_id, ordem)` é único: primeiro desloca para
uma faixa alta livre, depois grava a ordem final.

## Lógica condicional

Escopo entregue: **mostrar/ocultar por resposta única**, exatamente o piso que a observação
da planilha definiu como aceitável caso a complexidade estourasse.

A pergunta guarda `condicaoAlternativaId`. Ela só aparece para quem escolheu aquela
alternativa. A pergunta de origem é derivada da alternativa — a API devolve as duas
(`condicaoAlternativaId` e `condicaoPerguntaId`) para o cliente não precisar cruzar.

Regras, validadas no serviço:

- a alternativa precisa ser do **mesmo formulário**;
- a pergunta de origem precisa ser de **escolha única**;
- a origem precisa ter **ordem anterior** à pergunta condicionada;
- **reordenar** não pode deixar a dependente antes da origem;
- não se exclui pergunta ou alternativa da qual outra pergunta depende (409 explicando qual);
- a publicação recusa condição que aponte para pergunta posterior.

O banco reforça o mesmo com um **constraint trigger deferido**
(`tg_pergunta_condicao_valida`): a validação roda no commit, porque a reordenação troca
várias linhas na mesma transação e só o estado final precisa ser coerente.

Não há encadeamento de condições em cadeia nem condição por múltipla escolha, escala,
texto ou número. Isso é deliberado.

## Link de acesso e QR Code

A publicação gera um `tokenPublico` de 22 caracteres aleatórios. O link é
`{COLETA_BASE_URL}/r/{token}` — o uuid interno **nunca** aparece na URL, então não há como
enumerar pesquisa trocando um valor.

`GET /formularios/:id/acesso` devolve `url`, `token` e `qrCodeSvg`. O QR é gerado pela
biblioteca `qrcode`, isolada atrás de `ProvedorQrCode`: processamento local, sem rede e
sem credencial.

O `ck_formulario_token_publico_coerente` garante no banco que rascunho nunca tem token e
que formulário publicado ou encerrado sempre tem. O link continua válido depois do
encerramento, para conferência.

## Duplicação

`POST /formularios/:id/duplicar` faz cópia profunda — perguntas, alternativas e a lógica
condicional remapeada para os ids novos. A cópia nasce em **rascunho**, sem token público e
sem nenhuma resposta, com `versao` = versão da origem + 1.

É o caminho previsto para "editar" o que já está em coleta: o original permanece intacto e
a nova rodada é montada em cima da cópia.

## Endpoints

Todos exigem perfil **Administrador**.

| Método | Rota |
|---|---|
| GET | `/api/v1/formularios` |
| GET | `/api/v1/formularios/:id` |
| POST | `/api/v1/formularios` |
| PATCH | `/api/v1/formularios/:id` |
| DELETE | `/api/v1/formularios/:id` |
| POST | `/api/v1/formularios/:id/publicar` |
| POST | `/api/v1/formularios/:id/encerrar` |
| GET | `/api/v1/formularios/:id/acesso` |
| POST | `/api/v1/formularios/:id/duplicar` |
| POST | `/api/v1/formularios/:id/perguntas` |
| PATCH | `/api/v1/formularios/:id/perguntas/ordem` |
| PATCH | `/api/v1/formularios/:id/perguntas/:perguntaId` |
| DELETE | `/api/v1/formularios/:id/perguntas/:perguntaId` |
| POST | `/api/v1/formularios/:id/perguntas/:perguntaId/alternativas` |
| PATCH | `/api/v1/formularios/:id/perguntas/:perguntaId/alternativas/ordem` |
| PATCH | `/api/v1/formularios/:id/perguntas/:perguntaId/alternativas/:alternativaId` |
| DELETE | `/api/v1/formularios/:id/perguntas/:perguntaId/alternativas/:alternativaId` |

Pergunta e alternativa vivem sob o pai na própria URL, e o id do pai entra no `WHERE`
da consulta. Pedir uma pergunta pelo formulário errado devolve `404` — não vaza nem a
existência do recurso.

`GET /formularios/:id` traz formulário, perguntas e alternativas em **uma consulta**,
já ordenados. É o mesmo endpoint que o aplicativo usa para recuperar o formulário.

## Auditoria

`FORMULARIO_CRIADO`, `FORMULARIO_ALTERADO`, `FORMULARIO_EXCLUIDO`, `FORMULARIO_PUBLICADO`
e `COLETA_ENCERRADA`. Alteração de pergunta e de alternativa entra como
`FORMULARIO_ALTERADO`, com o detalhe da operação — a trilha aponta para o formulário,
que é a unidade que interessa numa auditoria de pesquisa.

## Telas do aplicativo

| Tela | O que faz |
|---|---|
| `TelaFormularios` | lista as pesquisas com status e contagem de perguntas; cria rascunho |
| `TelaFormulario` | edita dados, lista e reordena perguntas, acrescenta pergunta dos cinco tipos, publica e encerra |
| `TelaPergunta` | edita enunciado, obrigatoriedade e rótulos de escala; gerencia e reordena alternativas; mostra e remove a condição |
| `TelaPreVisualizacao` | mostra o formulário como o respondente verá, aplicando a lógica condicional em tempo real |

A pré-visualização é simulação: nada é enviado nem gravado. A regra de exibição é a mesma
do servidor — sem condição aparece sempre; com condição, aparece quando a alternativa que
a habilita está marcada.

O link de coleta aparece na tela do formulário publicado, com compartilhamento pelo próprio
sistema operacional. A **imagem** do QR Code fica no painel web: renderizar SVG no React
Native exigiria `react-native-svg`, dependência que não se justifica só por isso agora.

Fora do rascunho, as telas entram em modo somente leitura e mostram o aviso de
imutabilidade. Isso é conveniência: quem recusa de fato é o guard da API.

A publicação e o encerramento pedem confirmação, com o texto explicando a consequência.

A navegação é uma pilha simples de estado em `App.tsx`. Quando o fluxo de coleta chegar,
vale reavaliar uma biblioteca de navegação — hoje seria peso sem retorno.
