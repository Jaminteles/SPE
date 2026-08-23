# Formulários, Perguntas e Alternativas

Sprint 2. Área do Administrador, na API e no aplicativo.

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
| `TelaPergunta` | edita enunciado, obrigatoriedade e rótulos de escala; gerencia e reordena alternativas |

Fora do rascunho, as telas entram em modo somente leitura e mostram o aviso de
imutabilidade. Isso é conveniência: quem recusa de fato é o guard da API.

A publicação e o encerramento pedem confirmação, com o texto explicando a consequência.

A navegação é uma pilha simples de estado em `App.tsx`. Quando o fluxo de coleta chegar,
vale reavaliar uma biblioteca de navegação — hoje seria peso sem retorno.
