# Painel de Resultados

Sprint 6. O que o Administrador e o Analista veem.

## Princípio

O painel **nunca** pede cálculo em cima da tabela bruta. Toda leitura sai de
view materializada, atualizada pelo job de agregação. É isso que faz o painel
abrir rápido independentemente do volume coletado — e é invariante do projeto,
não otimização.

## Agregações que o painel consome

| View | Papel |
|---|---|
| `mv_resumo_formulario` | totais da pesquisa inteira: válidas, em conferência, invalidadas, municípios alcançados, período com resposta |
| `mv_resultado_detalhado` | fato agregado com as quatro dimensões — formulário × pergunta × alternativa × município × dia |
| `mv_evolucao_coleta` | série diária por formulário e município |
| `mv_alcance_municipio` | respostas válidas por município, para o filtro e a cobertura |
| `mv_resultado_pergunta`, `mv_resultado_municipio` | leituras diretas criadas na Sprint 5, mantidas |

O fato detalhado existe porque os quatro filtros se combinam. Uma view por
recorte multiplicaria views sem fim; com as dimensões na mesma tabela, cada
consulta é um `GROUP BY` sobre ela. Só há linha para combinação que aconteceu.

**Percentual nunca é materializado no recorte**: as views guardam contagem, e o
percentual é derivado no momento da consulta, sobre o total de respostas válidas
daquele recorte. Alternativa sem resposta aparece com zero — barra faltando
esconde informação.

## Endpoints

Todos exigem autenticação e aceitam **Administrador e Analista** — o Analista
existe para ler resultado.

| Método | Rota |
|---|---|
| GET | `/api/v1/resultados/formularios` |
| GET | `/api/v1/resultados/:id/indicadores` |
| GET | `/api/v1/resultados/:id/perguntas` |
| GET | `/api/v1/resultados/:id/evolucao` |
| GET | `/api/v1/resultados/:id/municipios` |

Filtros por query: `perguntaId`, `municipioCodigoIbge`, `de`, `ate`. Todos
validados; parâmetro não declarado derruba a requisição com 400.

Nenhuma dessas rotas dá acesso a administração. Formulário em rascunho não tem
resultado: responde 404, igual a pesquisa inexistente.

### Recorte dos indicadores

`respostasValidas` respeita os filtros. `emConferencia` e `invalidadas` são
sempre da pesquisa inteira, porque medem **integridade da coleta**, não
resultado — misturar as duas coisas num mesmo cartão confunde quem lê.

## Painel

React + Vite, autenticação reaproveitada da API.

| Tela | Conteúdo |
|---|---|
| Login | e-mail e senha, com mensagem única para credencial inválida |
| Painel | filtros, cinco indicadores, três gráficos e a tabela de todas as perguntas |

Gráficos com **Recharts**, conforme a decisão do backlog:

- **barras horizontais** para a intenção por alternativa — rótulo de candidato é
  longo e barra deitada mantém o texto legível;
- **pizza** para a distribuição percentual — poucas fatias que somam o todo, que
  é o único caso em que pizza funciona;
- **linhas** para a evolução da coleta, com a série do dia e a acumulada.

A paleta vive em CSS custom properties com variante para tema escuro; os
gráficos leem as mesmas variáveis, então claro e escuro saem consistentes.

Trocar qualquer filtro recarrega os quatro blocos em paralelo.

### Sessão no navegador

O **access token fica só em memória** — some ao recarregar a aba, o que reduz a
janela de um XSS. O refresh token vai para o `localStorage`, porque sem ele não
há como retomar a sessão depois do reload; a API já o rotaciona a cada uso e o
invalida no logout.

Uma renovação por vez: várias telas em paralelo não disparam vários refresh.

## O que ainda não tem

Mapa por município. A observação do backlog previu a migração de Recharts para
ECharts caso o mapa entre — não entrou nesta sprint, e o Recharts segue
suficiente para os três gráficos atuais.
