# Rascunho das perguntas reais — S2-08

**Status: aguardando validação do Administrador.**

Este documento é o instrumento de levantamento, não a decisão. A finalidade da task,
segundo a própria planilha, é *"evitar descobrir na Sprint 8 um tipo de pergunta não
previsto"*. Por isso o que interessa aqui não é o texto definitivo das perguntas — é
confirmar que **todo formato que a pesquisa vai usar já cabe no que o sistema suporta**.

## O que o sistema suporta hoje

| Tipo | Como se responde | Alternativas | Configuração |
|---|---|---|---|
| `UNICA_ESCOLHA` | marca uma opção | sim, mínimo 2 | — |
| `MULTIPLA_ESCOLHA` | marca quantas quiser | sim, mínimo 2 | — |
| `ESCALA` | escolhe um número na faixa | não | mínimo e máximo (0 a 10), com rótulos opcionais nas pontas |
| `TEXTO_LIVRE` | digita | não | — |
| `NUMERO` | digita um número | não | — |

Toda pergunta pode ser **obrigatória ou opcional** e tem **ordem** definida.
O município **não é pergunta**: vem da lista fechada dos 417 municípios da Bahia,
por código IBGE, numa tela própria antes do questionário.

## Rascunho proposto (a ser substituído pelo do Administrador)

Serve como ponto de partida e como prova de que os cinco tipos cobrem uma rodada real.

1. **Você pretende votar nas próximas eleições?** — `UNICA_ESCOLHA`, obrigatória
   · Sim, com certeza · Provavelmente sim · Provavelmente não · Não pretendo votar
2. **Se a eleição fosse hoje, em quem você votaria para governador?** — `UNICA_ESCOLHA`, obrigatória
   · (lista de candidatos) · Branco/nulo · Não sei / não decidi
3. **E para senador?** — `UNICA_ESCOLHA`, obrigatória
4. **Quais temas mais pesam na sua decisão?** — `MULTIPLA_ESCOLHA`, obrigatória
   · Saúde · Educação · Segurança · Emprego e renda · Transporte · Outro
5. **Que nota você dá para a gestão estadual atual?** — `ESCALA` de 0 a 10, obrigatória
   · rótulos: "Péssima" e "Ótima"
6. **Há quantos anos você mora neste município?** — `NUMERO`, opcional
7. **Quer comentar alguma coisa sobre a pesquisa?** — `TEXTO_LIVRE`, opcional

## Perguntas que preciso que você responda

Estas são as decisões que só o Administrador pode tomar. Enquanto não vierem, a
S2-08 não fecha.

1. **Faixa etária, escolaridade e renda entram na pesquisa?** Se sim, viram perguntas de
   `UNICA_ESCOLHA` com faixas fechadas — e é importante decidir agora, porque faixa de
   renda combinada com município pequeno pode reidentificar respondente.
2. **Vai haver pergunta de ordenação** ("coloque em ordem de prioridade")? **Este formato
   não existe hoje** e seria um tipo novo. É o caso mais provável de estouro na Sprint 8.
3. **Vai haver pergunta em grade/matriz** (várias afirmações avaliadas na mesma escala)?
   Também não existe como tipo próprio; hoje viraria uma pergunta `ESCALA` por linha.
4. **Alguma pergunta depende da resposta anterior** (lógica condicional)? O escopo prevê,
   mas ainda não foi implementado — precisa entrar numa sprint antes da coleta.
5. **A escala será sempre 0–10?** Se a pesquisa usar 1–5 ("muito ruim" a "muito bom"), o
   sistema já cobre, mas convém padronizar antes de publicar.
6. **Quantas perguntas no total?** Acima de ~15 o abandono no meio do preenchimento cresce,
   e isso muda o desenho da tela de coleta.
7. **O texto livre é mesmo necessário?** Campo aberto é o único lugar por onde um respondente
   pode digitar algo que o identifique. Se ficar, ele deve ser opcional e com aviso explícito
   de não escrever dados pessoais.

## Como registrar a resposta

Preencha abaixo e o rascunho vira o conteúdo do primeiro formulário real.

- Validado por:
- Data:
- Tipos novos necessários (se algum):
- Observações:
