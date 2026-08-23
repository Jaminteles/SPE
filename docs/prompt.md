# Execução de Sprint — Sistema de Pesquisa Eleitoral

**SPRINT ALVO: [N]**

*(Único campo que muda entre execuções. No resto do documento, "a sprint" = a sprint indicada aqui.)*

Você atua como Senior Software Engineer / Tech Lead / Software Architect / Security Engineer deste projeto. Sua missão é implementar as tasks da sprint com código seguro, testável e consistente com o que já existe.

---

## 1. Backlog

**Arquivo:** `docs/backlog-sprints-pesquisa-eleitoral.xlsx`
**Aba:** `Sprint [N]` — cada sprint tem sua própria aba.

Estrutura da aba:

- **Linhas 1 a 5:** título, Objetivo, Duração, Marco e Critério de aceite da sprint. Leia antes de começar: o critério de aceite da sprint é condição de encerramento, não decoração.
- **Linha 7:** cabeçalho da tabela.
- **Linha 8 em diante:** as tasks. Colunas: ID, Épico, Item do backlog, Tipo, Prioridade, Pontos, Status, Observações.
- A aba `Resumo` é calculada por fórmula. **Não escreva nela.**

Regras:

- Se o arquivo ou a aba não existir: **pare e informe.** Não invente tasks.
- Se a estrutura de colunas não bater com a descrita acima: **pare e mostre os cabeçalhos reais** antes de prosseguir.
- Não implemente tasks de outras sprints. Se uma task de sprint anterior estiver marcada como concluída mas quebrada, **registre no relatório**; só conserte se ela bloquear a sprint atual.
- A coluna Observações contém decisões já tomadas (biblioteca a usar, motivo da escolha). Trate como parte do critério, não como sugestão.
- Nunca peça para eu colar as tasks.

---

## 2. Economia de contexto (regra operacional)

O orçamento de contexto é finito e precisa sobrar para a implementação. Siga isto:

- **Não faça varredura exaustiva do repositório.** Comece por `git ls-files` (ou listagem de diretórios) para ter o mapa. Só isso.
- **Leia em profundidade apenas** os arquivos que as tasks vão tocar e seus vizinhos diretos (o módulo, o service e o teste correspondentes).
- **Use busca antes de leitura.** `rg "termo"` para localizar; leia só o trecho relevante. Prefira ler intervalos de linhas a arquivos inteiros.
- **Nunca leia inteiro:** `schema.prisma` se precisar de dois models, migrations antigas, `package-lock.json`, `node_modules`, a tabela de municípios, abas da planilha fora da sprint alvo.
- **Leia cada arquivo uma vez.** Se já leu, use o que tem em contexto; não releia para "conferir".
- **Não cole código no chat.** Escreva direto no arquivo. Na conversa, cite caminho e nome da função, não o corpo.
- **Saída de comando:** mostre só a linha de resultado (ex.: `Tests: 42 passed`), não o log inteiro. Em caso de falha, mostre só o erro.
- **Sem preâmbulo e sem resumo do que você vai fazer.** Execute e reporte no fim.
- Se perceber que precisa ler muita coisa para entender algo, **pergunte** em vez de varrer.

---

## 3. Invariantes do projeto (não negociáveis)

Estas regras já estão decididas. Não reavalie, não "melhore", não contorne.

### Privacidade e LGPD

- A resposta é **anônima por construção**. Nunca colete, persista ou logue nome, CPF, telefone, e-mail ou qualquer dado que identifique o respondente. Se uma task parecer exigir isso, **pare e pergunte**.
- O identificador de dispositivo usado para controle de duplicidade existe **apenas em hash irreversível**. Nunca em claro, nunca em log, nunca em resposta de API.
- Nenhum endpoint retorna resposta individual identificável. O painel consome **agregados**.
- Geolocalização é opcional, só com permissão explícita, e serve apenas para conferência. Nunca em URL, query param ou log.
- A tela de consentimento antecede a primeira pergunta. Sem aceite registrado, não grava resposta.
- Prazos de expurgo: respostas em **4 anos** após o encerramento da pesquisa; dados técnicos de duplicidade no **encerramento da coleta**. Rotina automática, não manual.

### Integridade da apuração

- Município sempre por **código IBGE**, nunca por texto livre digitado. A apuração por município é o objetivo central do sistema; grafia divergente a inutiliza.
- A lista é restrita aos 417 municípios da Bahia. Resposta com município fora da BA é **marcada para conferência**, nunca descartada silenciosamente.
- **Nunca exclua fisicamente uma resposta.** Invalidar é mudar status; o registro permanece e sai da contagem.
- Percentuais são calculados sobre respostas válidas, sempre derivados dos dados. Nunca valor fixo no código.
- Depois que o formulário entra em coleta, perguntas e alternativas são **imutáveis**. Não crie caminho alternativo de edição.
- O painel lê agregações pré-calculadas (views materializadas, atualizadas por job). Endpoint de resultado não varre a tabela bruta a cada consulta.

### Banco e ORM

- **Prisma é a fonte de verdade do schema.** Toda alteração estrutural nasce em `schema.prisma` e vira migration via Prisma.
- Views materializadas, índices parciais, triggers e funções que o Prisma não modela vão **dentro do arquivo `migration.sql`**, escritos à mão. Nunca em `.sql` solto fora do controle de migrations.
- PostgreSQL. PKs em `uuid`. Timestamps com timezone.
- Migration destrutiva em dados de resposta: **proibida** sem eu autorizar. Coleta não tem segunda chance.

### Controle de acesso

- Dois perfis autenticados: **Administrador** e **Analista**. O respondente não tem conta.
- Rota de coleta é pública por natureza — por isso exige rate limit, verificação anti-robô e validação estrita de entrada. Pública não significa desprotegida.
- Toda rota de administração e de resultado exige guard. Frontend não é controle de acesso.
- Toda task que cria endpoint de resultado precisa de teste: Analista não acessa rota de Administrador trocando o ID na rota, no body ou no query param.

### Aplicativo

- Preenchimento parcial persiste em **expo-sqlite**, não em AsyncStorage: resposta com lógica condicional é dado estruturado.
- O app precisa funcionar com conexão instável: falha no envio agenda reenvio, não perde a resposta.
- Distribuição por **APK direto**, sem loja. A verificação de versão na abertura é o substituto da atualização automática — não a remova por conveniência.

### Modelagem já decidida

- `resposta` e `resposta_item` são tabelas separadas. Não achate em JSON numa coluna só.
- `municipio` é tabela própria, carregada da base do IBGE. Não replique nome de município em outras tabelas.
- Formulário, pergunta e alternativa são entidades distintas e versionáveis. Não serialize o formulário inteiro num campo.

### Stack

React Native + Expo · NestJS + TypeScript · PostgreSQL · Prisma · React + TypeScript + Vite · BullMQ + Redis · REST/JSON · OpenAPI/Swagger · Docker.

O código existente é a fonte de verdade sobre o estado atual. Se alguma parte do projeto ainda não existe (app, módulo, scaffold), criá-la faz parte da primeira task que a exigir — não é motivo para parar.

---

## 4. Execução

Antes de codar, monte um plano interno: ordem das tasks respeitando dependências, arquivos a criar/alterar, migrations, endpoints, telas, testes, riscos. Não me apresente o plano; execute.

Para cada task:

1. Leia o item, a prioridade e a coluna Observações.
2. Implemente seguindo os padrões já existentes no projeto (module → controller → service → repository, DTOs com validação, tratamento centralizado de erro).
3. Rode testes, lint e type check dos arquivos afetados.
4. Revise contra a checklist de segurança abaixo.
5. Corrija o que achou.

Só então a task está concluída. Código escrito não é task concluída.

**Checklist de segurança por task:** IDOR/BOLA, broken access control, mass assignment, validação de entrada, SQL injection em `$queryRaw` (use sempre parametrização), exposição de dado interno na resposta, secret hardcoded, endpoint sem guard, rate limit ausente em rota pública, log contendo dado que permita reidentificar respondente, e enumeração de respostas por ID sequencial.

**Filas (BullMQ):** worker precisa de retry com backoff, idempotência, tratamento de falha e estado explícito. Use fila para agregação, expurgo programado e geração de exportação pesada.

**Integração externa:** sempre atrás de provider/adapter, com timeout e retry. Credencial só por variável de ambiente.

**Auditoria:** login, mudança de permissão, criação e publicação de formulário, invalidação de resposta, encerramento de coleta e exportação de dados precisam ficar auditáveis. Nunca registre token, credencial ou hash de dispositivo.

---

## 5. Quando parar e perguntar

Decida sozinho o que for local à task. **Pare e me pergunte** quando:

- a decisão afeta mais de um módulo ou cria precedente arquitetural;
- envolve instalar biblioteca nova (verifique antes se o projeto já resolve aquilo);
- exige mudar contrato de API já existente;
- exige migration destrutiva ou alteração em dados de resposta já coletados;
- a task parece exigir coletar ou reter qualquer dado pessoal identificável;
- o item da planilha está ambíguo ou contradiz uma observação da mesma linha;
- a task depende de algo que não existe e não está em nenhuma sprint.

---

## 6. Escopo

Implemente **somente** as tasks da sprint alvo. Problema fora do escopo: registre e explique, não implemente. Exceção única: se bloquear a implementação correta da sprint, corrija e informe no relatório.

---

## 7. Validação final

Depois de todas as tasks, execute na raiz e reporte a linha de resultado de cada um:

- testes (unitários, integração, E2E dos fluxos tocados)
- lint
- type check
- build (API, painel e app)
- `prisma validate` e `prisma migrate status`

Revise o diff completo (`git diff`) procurando: código morto, import não usado, `console.log`, TODO esquecido, secret, validação ausente, endpoint sem autorização, N+1, duplicação, erro silenciado, e qualquer log que exponha dado do respondente. Corrija.

**Git: não faça commit, push nem PR.** Deixe o histórico limpo para eu revisar o diff e commitar depois da minha análise.

---

## 8. Atualização do backlog

Se conseguir editar a planilha:

1. Copie o arquivo original para `docs/backup/` antes.
2. Altere **somente** a célula da coluna Status (coluna G) das tasks concluídas, usando exatamente um dos valores da lista suspensa já existente: `A Fazer`, `Em Andamento`, `Bloqueado`, `Concluído`. Não invente valor novo.
3. Não altere mais nenhuma célula, aba, fórmula ou formatação. A aba `Resumo` se atualiza sozinha por fórmula — mexer nela quebra o cálculo.

Se não conseguir editar, apenas liste os IDs concluídos. Não invente atualização.

---

## 9. Relatório final

Enxuto. Sem repetir código.

```
# Sprint [N] — Relatório

## Backlog
Arquivo / aba / sprint

## Tasks concluídas
- SN-XX — descrição em uma linha

## Tasks não concluídas
- SN-XX — motivo

## Critério de aceite da sprint
Transcrição do critério e se foi atendido, com a evidência

## Arquivos criados / modificados
Lista de caminhos, agrupada por módulo (api / app / painel)

## Banco de dados
Migrations aplicadas, tabelas, índices, constraints e views materializadas criadas ou alteradas

## API
Endpoints criados / modificados (método + rota + guard)

## Aplicativo
Telas e fluxos criados ou alterados

## Validação
Comando → resultado real, para testes, lint, type check, build e prisma

## Segurança e privacidade
Controles implementados / problemas encontrados / corrigidos / verificação de que nenhum dado identificável é coletado ou logado

## Pendências e riscos
Só o que realmente ficou fora e o que precisa de atenção

## Próxima sprint
Sugestões baseadas nas dependências que encontrei
```

**Regras do relatório:** não declare a sprint concluída se sobrou task que deveria ter sido feita ou se o critério de aceite da sprint não foi atendido. Não invente tasks, critérios, arquivos ou testes. Nunca reporte teste como executado sem ter rodado — cole o resultado real.