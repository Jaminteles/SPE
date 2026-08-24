# Manual do Analista

O perfil **Analista** existe para ler resultado: painel, apuração por município,
cruzamentos e exportação. Não administra pesquisa nem usuários — isso é do
Administrador ([manual-administrador.md](./manual-administrador.md)).

## 1. Entrar

Endereço do painel, e-mail e senha. A sessão expira por inatividade (30 min) e
tem prazo absoluto (8 h).

## 2. Escolher o recorte

O topo do painel tem quatro filtros que se combinam:

| Filtro | Efeito |
|---|---|
| Pesquisa | qual formulário está sendo lido |
| Pergunta | restringe os gráficos a uma pergunta |
| Município | restringe tudo a um município (por código IBGE) |
| Período | restringe por data de recebimento |

Trocar de pesquisa limpa os demais filtros — pergunta de uma pesquisa não existe
na outra.

## 3. Ler os blocos

**Indicadores.** "Respostas válidas" respeita o recorte filtrado. "Em
conferência" e "Invalidadas" são sempre da pesquisa inteira: medem integridade da
coleta, não resultado.

**Gráficos.** Barras e pizza mostram a pergunta em foco; a linha mostra a
evolução diária, com acumulado.

**Apuração por município.** O objetivo central do sistema: ranking com
respostas válidas e percentual sobre o total do recorte. O rodapé fecha com o
total — se a soma da coluna não bater com o indicador, é defeito; avise.

**Cobertura da Bahia.** Quantos dos 417 municípios já têm ao menos uma resposta
válida, e a lista dos que faltam. A cobertura é sempre da pesquisa inteira,
independentemente do período filtrado.

## 4. Como os percentuais são calculados

Sempre sobre **respostas válidas**, derivados dos dados na hora da consulta:

- percentual de alternativa: sobre o total de respostas daquela pergunta no
  recorte;
- percentual de município: sobre o total de válidas do recorte;
- percentual no cruzamento: sobre o total da **linha**.

Resposta invalidada continua no banco, fora da contagem. Nenhum percentual é
valor fixo no código.

Os números vêm de agregação recalculada periodicamente — uma resposta enviada
agora entra no próximo ciclo. O rodapé dos indicadores mostra o horário da
última agregação.

## 5. Cruzamento entre perguntas

Disponível na API (`/resultados/:id/cruzamento`) para cruzar duas perguntas da
mesma pesquisa — por exemplo, intenção de voto por faixa etária. Cada linha soma
100%: lê-se "dentro de quem escolheu X, como se distribui Y".

O cruzamento aceita filtro de município, mas não de período.

## 6. Exportar

Bloco **Exportar**, com os filtros que estão na tela:

- **CSV** — tabela única normalizada (`;`, UTF-8), para reprocessar;
- **XLSX** — Resumo, Por pergunta, Municípios e Evolução em abas;
- **PDF** — o painel como está, com gráficos e tabelas.

O arquivo bate com a tela porque sai da mesma fonte. Toda exportação fica no log
de auditoria com seu usuário, data e hora — inclusive as suas.

Só agregados são exportados. Não existe caminho, para nenhum perfil, que exporte
resposta individual.

## 7. Limites do seu perfil

Estas ações respondem "seu perfil não tem acesso a este recurso", e isso é
esperado:

- criar, editar, publicar ou encerrar pesquisa;
- ver ou invalidar respostas individuais;
- criar usuário ou trocar permissão;
- forçar atualização de agregação ou operar o expurgo;
- ler o log de auditoria.

Trocar identificador na URL não muda nada: quem decide o acesso é o servidor,
pelo seu perfil.

## 8. Perguntas frequentes

**O total mudou entre duas leituras.** A coleta continua e a agregação recalcula
periodicamente. Para um número citável, fixe o período no filtro e exporte.

**Um município aparece com zero.** Ninguém respondeu ali ainda, ou as respostas
estão em conferência. A lista de cobertura mostra exatamente quem falta.

**O arquivo exportado difere do painel.** Não deveria: confira se os filtros são
os mesmos e se a agregação não rodou entre uma coisa e outra. Persistindo, é
defeito — reporte.
