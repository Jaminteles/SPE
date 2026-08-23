# Documento de Escopo — Sistema de Pesquisa Eleitoral

**Versão:** 1.4
**Data:** 21/08/2026
**Responsável técnico:** Jamínteles

---

## 1. Visão Geral

Sistema para aplicação de pesquisas eleitorais em larga escala, distribuído por link e respondido via aplicativo, com apuração automática dos resultados **segmentada por município**. O sistema permite acompanhar, em tempo real, o alcance da pesquisa e a distribuição das intenções de voto em cada localidade atingida.

### 1.1 Objetivos

- Coletar respostas de pesquisa eleitoral de forma massiva e descentralizada.
- Identificar automaticamente o município de origem de cada resposta.
- Consolidar e apresentar os resultados em painéis com gráficos e tabelas.
- Restringir o acesso aos resultados apenas a usuários autorizados.
- Permitir a criação de novos formulários no futuro, sem necessidade de reescrever o sistema.

### 1.2 Decisões já definidas

| Questão | Decisão |
|---|---|
| Plataforma de uso | Aplicativo |
| Quantidade de formulários | Um formulário inicial, com estrutura preparada para novos formulários |
| Apresentação dos resultados | Gráficos e dados brutos |
| Privacidade | Restrita — resultados não são de consulta pública |
| Sistema operacional | Android |
| Abrangência | Estadual — Bahia (BA), 417 municípios |
| Forma de coleta | Autopreenchimento pelo respondente |
| Retenção das respostas | 4 anos |
| Porte estimado | Mediano (ver item 4 — Desempenho) |
| Versão mínima do Android | Android 10 (API 29) |
| Distribuição do aplicativo | APK direto, sem publicação em loja |
| Montagem do formulário | Feita dentro do próprio aplicativo, pelo Administrador |
| Stack | React Native + Expo, NestJS, PostgreSQL + Prisma (detalhada no item 5.1) |

---

## 2. Perfis de Usuário

**Respondente (público geral)**
Recebe o link/convite, responde ao formulário e finaliza. Não possui cadastro nem acesso a resultados.

**Analista**
Acessa o painel de resultados, aplica filtros, visualiza gráficos e exporta dados.

**Administrador**
Cria e edita formulários, define o período de coleta, gerencia usuários e permissões, encerra pesquisas e audita o sistema.

Com a coleta definida como autopreenchimento, o sistema tem apenas dois perfis autenticados: **Administrador** e **Analista**. O respondente não possui conta.

---

## 3. Escopo Funcional

### 3.1 Módulo de Formulários (Administrador)

Este módulo é operado **dentro do próprio aplicativo**, em área restrita ao Administrador. Como o conteúdo do formulário inicial não é entregue pronto, o módulo deixa de ser um recurso futuro e passa a ser pré-requisito da primeira coleta.

- Criação de formulários com título, descrição, período de vigência e status (rascunho, em coleta, encerrado).
- Cadastro de perguntas com os tipos: escolha única, múltipla escolha, escala/nota, texto livre e número.
- Definição de perguntas obrigatórias e opcionais.
- Ordenação de perguntas e de alternativas.
- Lógica condicional simples (exibir a pergunta B apenas se a resposta de A for X).
- Duplicação de formulário existente como base para um novo.
- Geração de link e QR Code de acesso à pesquisa.

### 3.2 Módulo de Coleta (Respondente)

- Abertura do formulário via link/QR Code, sem necessidade de cadastro.
- Preenchimento sequencial, com validação de campos obrigatórios.
- Identificação do município do respondente por meio de:
  - seleção manual em lista oficial de municípios (obrigatória);
  - captura de geolocalização com consentimento (complementar, para conferência).
- Registro local de respostas parciais e retomada em caso de interrupção ou queda de conexão.
- Reenvio automático do formulário concluído caso a conexão falhe no momento do envio.
- Tela de confirmação ao final do envio.

### 3.3 Módulo de Controle de Integridade

- Bloqueio de resposta duplicada por dispositivo e por sessão.
- Registro de data/hora de início e fim do preenchimento.
- Marcação de respostas suspeitas (tempo de preenchimento muito baixo, padrão repetitivo de alternativas, volume anômalo vindo do mesmo dispositivo).
- Possibilidade de invalidar respostas manualmente pelo administrador, sem exclusão física do registro.

### 3.4 Módulo de Resultados (Analista / Administrador)

**Indicadores gerais**
- Total de respostas recebidas.
- Número de municípios alcançados.
- Respostas válidas x invalidadas.
- Evolução da coleta ao longo do tempo.

**Visualizações**
- Gráfico de barras: intenção de voto por candidato.
- Gráfico de pizza/rosca: distribuição percentual.
- Gráfico de linhas: evolução da intenção de voto por período.
- Mapa ou tabela ranqueada por município.
- Tabela detalhada com valores absolutos e percentuais.

**Filtros**
- Por município, por período de coleta, por formulário e por pergunta.
- Cruzamento entre perguntas (ex.: intenção de voto por faixa etária).

**Exportação**
- CSV e XLSX com os dados consolidados.
- PDF com o relatório dos gráficos e tabelas.

### 3.5 Módulo de Acesso e Segurança

- Autenticação obrigatória para acessar qualquer resultado.
- Perfis com permissões distintas (Administrador, Analista, Pesquisador).
- Registro de auditoria (log de quem acessou, exportou ou alterou o quê e quando).
- Encerramento de sessão por inatividade.

---

## 4. Requisitos Não Funcionais

**Privacidade e conformidade (LGPD)**
- As respostas são anônimas: não são coletados nome, CPF, telefone ou e-mail do respondente.
- Dados técnicos usados apenas para controle de duplicidade devem ser armazenados de forma irreversível (hash) e com prazo de expurgo definido.
- Tela de consentimento antes do início do formulário, informando finalidade, anonimato e prazo de retenção.
- Os resultados são exibidos apenas de forma agregada; não há tela de consulta de resposta individual identificável.
- Prazo de retenção das respostas: **4 anos** contados do encerramento da pesquisa, com rotina automática de expurgo ao final do período.
- Os dados técnicos de controle de duplicidade têm prazo de retenção menor, expurgados junto com o encerramento da coleta.

**Desempenho e disponibilidade**
- Dimensionamento para porte mediano: base projetada de até **100 mil respostas** por pesquisa e pico de aproximadamente **300 envios por minuto** nas primeiras horas após o disparo.
- Tempo de carregamento do formulário compatível com conexões móveis instáveis.
- Painel de resultados com agregações pré-calculadas, evitando recalcular tudo a cada consulta.
- A arquitetura deve permitir ampliar o dimensionamento sem reescrita, caso o volume real supere a projeção.

**Compatibilidade**
- Aplicativo Android, versão mínima **Android 10 (API 29)** — cobre a ampla maioria dos aparelhos em uso e evita o custo de suportar versões antigas.
- Acesso ao painel de resultados por navegador.
- Versão iOS não faz parte desta entrega.

**Distribuição**
- O aplicativo é distribuído por **APK direto**, sem publicação na Google Play.
- APK assinado com chave própria, hospedado em endereço fixo e divulgado por QR Code.
- O respondente precisará autorizar a instalação de fonte desconhecida; o material de divulgação deve trazer esse passo a passo.
- Como não há atualização automática pela loja, o aplicativo deve verificar a versão ao abrir e avisar quando houver uma nova, com link para download.
- O aplicativo deve tratar o bloqueio do Play Protect, que pode alertar o usuário na instalação.

**Segurança**
- Comunicação criptografada (HTTPS/TLS).
- Senhas armazenadas com hash forte.
- Proteção contra automação de envios (rate limit e verificação anti-robô).
- Backup periódico da base.

---

## 5. Arquitetura

**Aplicativo móvel (React Native + Expo)** — responsável pela coleta e pela área do Administrador, com armazenamento local do preenchimento parcial e reenvio automático.

**API (NestJS + TypeScript)** — recebe as respostas, valida, aplica as regras de integridade, persiste os dados e serve as agregações ao painel. Os *guards* e *roles* do NestJS atendem à separação entre Administrador e Analista.

**Banco de dados (PostgreSQL + Prisma)** — armazena formulários, perguntas, alternativas, respostas e a tabela oficial de municípios (código IBGE, nome, UF). As agregações pré-calculadas são resolvidas por *views* materializadas.

**Painel web (React + TypeScript + Vite)** — consome a API, renderiza gráficos e permite exportação.

**Processamento assíncrono (BullMQ + Redis)** — executa a rotina de agregação e o expurgo programado dos 4 anos.

### 5.1 Stack definida

| Camada | Tecnologia |
|---|---|
| Aplicativo Android | React Native + Expo (APK assinado via EAS Build) |
| Armazenamento local no app | expo-sqlite |
| Atualização do app | expo-updates, com verificação de versão na abertura |
| Backend | NestJS + TypeScript |
| Banco de dados | PostgreSQL |
| ORM | Prisma |
| Painel web | React + TypeScript + Vite |
| Gráficos | Recharts (gráficos padrão) ou ECharts (se houver mapa por município) |
| Filas e agendamento | BullMQ + Redis |
| Autenticação | JWT com senha em hash forte |
| Anti-robô | Cloudflare Turnstile |
| Exportação XLSX | ExcelJS |
| Exportação PDF | Puppeteer, renderizando o próprio painel |
| Infraestrutura | Docker, hospedado em VPS |

**Justificativa da escolha do React Native:** o aplicativo é composto por formulários e listagens, sem exigência de recursos nativos avançados que justifiquem Kotlin. Além disso, o mesmo código pode ser publicado como web por meio de `react-native-web`, o que mantém aberta a alternativa de permitir resposta pelo navegador, sem instalação — mitigação direta do risco de atrito na instalação por APK.

### 5.2 Entidades principais

- `formulario` — título, descrição, status, período de vigência.
- `pergunta` — vínculo com formulário, enunciado, tipo, obrigatoriedade, ordem.
- `alternativa` — vínculo com pergunta, texto, ordem.
- `municipio` — código IBGE, nome, UF.
- `resposta` — vínculo com formulário e município, data/hora, origem, status (válida/invalidada).
- `resposta_item` — vínculo com resposta, pergunta e alternativa (ou valor livre).
- `usuario` e `perfil` — acesso ao painel e permissões.
- `log_auditoria` — ação, usuário, data/hora.

O uso do **código IBGE** como chave do município é essencial para garantir a consistência da apuração e evitar divergências por grafia.

---

## 6. Entregáveis

1. Documento de escopo e requisitos (este documento).
2. Modelagem do banco de dados (diagrama e scripts).
3. Protótipo de telas do aplicativo e do painel.
4. Aplicativo móvel de coleta.
5. API e banco de dados implantados.
6. Painel web de resultados com gráficos, filtros e exportação.
7. Manual de uso (administrador e analista).

---

## 7. Fora do Escopo

Os itens abaixo **não** fazem parte desta versão e, se necessários, serão tratados como evolução:

- Disparo de mensagens (SMS, WhatsApp, e-mail) pelo próprio sistema — a distribuição do link é feita por meios externos.
- Cálculo de margem de erro, ponderação estatística da amostra e projeção de resultados.
- Integração com dados oficiais do TSE.
- Cadastro e autenticação de respondentes.
- Aplicação presencial por pesquisadores de campo e todo o suporte que ela exigiria (modo offline completo, controle de cotas por entrevistador, remuneração).
- Versão para iOS.
- Aplicativo em versão desktop instalável.

---

## 8. Premissas

- A pesquisa tem abrangência estadual na Bahia: a lista de municípios será carregada com os 417 municípios da UF, obtida da base oficial do IBGE.
- Respostas registradas fora da Bahia são marcadas para conferência.
- A distribuição da pesquisa será feita por canais externos já existentes.
- O conteúdo do formulário inicial (perguntas e alternativas) será montado pelo Administrador dentro do aplicativo, e não entregue previamente ao desenvolvimento.
- O sistema não garante representatividade estatística da amostra: ele apura o que foi respondido.

---

## 9. Riscos e Mitigações

| Risco | Impacto | Mitigação |
|---|---|---|
| Respostas duplicadas ou fraudulentas | Distorção do resultado | Controle por dispositivo, rate limit, marcação de respostas suspeitas e invalidação manual |
| Município informado incorretamente | Apuração errada por localidade | Lista fechada com código IBGE e conferência opcional por geolocalização |
| Pico de acessos no disparo | Indisponibilidade | Infraestrutura escalável e fila de processamento |
| Uso indevido dos dados / exposição | Sanção legal (LGPD) | Anonimato por padrão, acesso restrito, log de auditoria e expurgo programado |
| Baixa adesão em municípios pequenos | Amostra desbalanceada | Painel de acompanhamento de cobertura por município durante a coleta |
| Autosseleção do respondente (só responde quem tem interesse) | Amostra enviesada | Deixar explícito no relatório que a pesquisa não é probabilística; acompanhar cobertura por município durante a coleta |
| Retenção de 4 anos amplia a janela de exposição dos dados | Sanção legal (LGPD) | Anonimato desde a coleta, acesso restrito, criptografia e expurgo automático ao fim do prazo |
| Atrito na instalação por APK (fonte desconhecida, alerta do Play Protect) | Queda expressiva no número de respostas | Página de download com passo a passo ilustrado, APK assinado e verificação de versão dentro do app |
| Circulação de APK adulterado se passando pelo oficial | Coleta comprometida e dano à imagem | Divulgar apenas um endereço oficial de download e publicar o hash do arquivo |
| Formulário montado às pressas, com perguntas mal formuladas | Resultado inutilizável, sem correção possível após o disparo | Pré-visualização e teste obrigatórios antes de publicar; bloquear edição de perguntas depois que a coleta iniciar |

---

## 10. Fases Sugeridas

**Fase 1 — Levantamento e modelagem**
Validação dos requisitos, modelagem do banco, carga da base de municípios da Bahia e protótipo das telas.

**Fase 2 — Backend e administração de formulários**
API, banco de dados, autenticação e área do Administrador dentro do app para criar e editar formulários. Antecipada porque não há formulário pronto: sem ela, não há o que coletar.

**Fase 3 — Coleta**
Tela de consentimento, seleção de município, preenchimento, controle de integridade, retomada local e reenvio automático.

**Fase 4 — Resultados**
Painel web com gráficos, filtros por município e período, e exportação.

**Fase 5 — Homologação e distribuição**
Testes com carga simulada, ajustes de LGPD, geração e assinatura do APK, página de download com instruções de instalação e treinamento do Administrador.

