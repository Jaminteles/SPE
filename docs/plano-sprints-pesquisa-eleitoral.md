# Plano de Sprints — Sistema de Pesquisa Eleitoral

**Versão:** 1.1
**Base:** Documento de Escopo v1.4
**Responsável técnico:** Jamínteles

---

## 1. Premissas do Planejamento

- **Duração da sprint:** 2 semanas, exceto a Sprint 0 (1 semana).
- **Total:** 8 sprints + Sprint 0 = aproximadamente 17 semanas.
- **Equipe:** desenvolvedor único, atuando em tempo parcial.
- **Ordem das entregas:** segue as fases do escopo — a administração de formulários vem antes da coleta, porque não existe formulário pronto.
- **Cada sprint entrega software funcionando**, não apenas código: ao final, o que foi construído deve ser demonstrável.
- **Stack:** definida no item 5.1 do escopo — React Native + Expo, NestJS, PostgreSQL + Prisma, React + Vite, BullMQ + Redis, Docker. As sprints assumem que não haverá troca de tecnologia no meio do caminho.
- Ajustes de capacidade devem alterar o **número de sprints**, nunca o critério de aceite.

---

## 2. Épicos

| Código | Épico | Sprints |
|---|---|---|
| E1 | Fundação e autenticação | 0, 1 |
| E2 | Administração de formulários | 2, 3 |
| E3 | Coleta de respostas | 4 |
| E4 | Integridade dos dados | 5 |
| E5 | Resultados e exportação | 6, 7 |
| E6 | Privacidade e LGPD | 8 |
| E7 | Distribuição e homologação | 8 |

---

## 3. Marcos

| Marco | Ao final de |
|---|---|
| M1 — Administrador consegue montar um formulário completo | Sprint 3 |
| M2 — Pesquisa já pode ser respondida de ponta a ponta | Sprint 5 |
| M3 — Resultados visíveis e exportáveis | Sprint 7 |
| M4 — Sistema pronto para o disparo real | Sprint 8 |

Nenhum disparo real deve ocorrer antes do M4: a coleta funciona no M2, mas sem expurgo, auditoria e teste de carga concluídos.

---

## Sprint 0 — Preparação (1 semana)

**Objetivo:** deixar o terreno pronto para desenvolver sem retrabalho.

- Criação dos repositórios (app, API e painel) com padrão de branches, conforme a stack definida no item 5.1 do escopo.
- Configuração do projeto Expo, do projeto NestJS e do Prisma apontando para o PostgreSQL.
- Ambiente de desenvolvimento e ambiente de homologação no ar, em Docker.
- Modelagem do banco de dados conforme item 5.2 do escopo (diagrama e scripts).
- Carga da tabela de municípios da Bahia (417 registros, com código IBGE, nome e UF).
- Protótipo em baixa fidelidade das telas principais: coleta, administração de formulários e painel.

**Critério de aceite:** banco criado com a base de municípios carregada e consultável; protótipo aprovado.

---

## Sprint 1 — Fundação e Autenticação

**Objetivo:** ter uma API viva com controle de acesso funcionando.

- Estrutura base da API, com padronização de erros e versionamento.
- HTTPS/TLS configurado.
- Entidades `usuario`, `perfil` e `log_auditoria` implementadas.
- Login com senha armazenada em hash forte.
- Perfis Administrador e Analista, com verificação de permissão nas rotas.
- Criação do Administrador inicial via script de implantação.
- Encerramento de sessão por inatividade.
- Registro de auditoria para login, alteração de usuário e alteração de permissão.
- Projeto Android criado (mínimo API 29) com tela de login integrada à API.

**Critério de aceite:** Administrador entra pelo aplicativo, Analista é bloqueado em rota restrita e ambas as tentativas aparecem no log de auditoria.

---

## Sprint 2 — Formulários e Perguntas

**Objetivo:** o Administrador consegue criar o esqueleto de um formulário.

- Entidades `formulario`, `pergunta` e `alternativa`.
- CRUD de formulário: título, descrição, período de vigência, status.
- CRUD de perguntas com os cinco tipos: escolha única, múltipla escolha, escala/nota, texto livre e número.
- CRUD de alternativas.
- Marcação de pergunta obrigatória.
- Ordenação de perguntas e de alternativas.
- Telas correspondentes na área do Administrador dentro do aplicativo.

**Critério de aceite:** um formulário com pelo menos uma pergunta de cada tipo é criado, editado e recuperado pelo aplicativo.

---

## Sprint 3 — Publicação do Formulário

**Objetivo:** transformar o rascunho em pesquisa publicável. **Marco M1.**

- Lógica condicional simples entre perguntas.
- Ciclo de status: rascunho → em coleta → encerrado.
- Bloqueio de edição de perguntas após o início da coleta.
- Pré-visualização do formulário como o respondente verá.
- Duplicação de formulário existente.
- Geração de link e QR Code de acesso.

**Critério de aceite:** formulário publicado gera link e QR Code válidos; a tentativa de editar uma pergunta depois de publicado é recusada.

---

## Sprint 4 — Coleta

**Objetivo:** o respondente consegue responder de ponta a ponta.

- Tela de consentimento com finalidade, anonimato e prazo de retenção, exigindo aceite antes de iniciar.
- Seleção obrigatória do município em lista fechada dos 417 municípios da Bahia, com busca por digitação.
- Captura opcional de geolocalização, mediante permissão.
- Preenchimento sequencial com validação de campos obrigatórios.
- Aplicação da lógica condicional definida na Sprint 3.
- Entidades `resposta` e `resposta_item`; gravação do envio.
- Salvamento local do preenchimento parcial e retomada após interrupção.
- Reenvio automático caso a conexão falhe no momento do envio.
- Tela de confirmação final.

**Critério de aceite:** uma resposta completa é enviada e persistida com município e data/hora; ao fechar o app no meio do preenchimento e reabrir, o progresso é recuperado.

---

## Sprint 5 — Integridade

**Objetivo:** garantir que o número apurado signifique alguma coisa. **Marco M2.**

- Bloqueio de resposta duplicada por dispositivo e por sessão, usando identificador armazenado em hash irreversível.
- Rate limit por origem e verificação anti-robô.
- Registro de data/hora de início e de fim do preenchimento.
- Marcação automática de resposta suspeita: tempo muito baixo, padrão repetitivo de alternativas, volume anômalo da mesma origem.
- Marcação de resposta com município fora da Bahia para conferência.
- Invalidação manual pelo Administrador, sem exclusão física do registro.
- Rotina de agregação pré-calculada dos resultados.

**Critério de aceite:** a segunda tentativa de responder pelo mesmo dispositivo é recusada; uma resposta preenchida em poucos segundos é marcada como suspeita; uma invalidação manual retira o registro da contagem sem apagá-lo.

---

## Sprint 6 — Painel de Resultados

**Objetivo:** ver os números.

- Painel web autenticado, reaproveitando a autenticação da Sprint 1.
- Indicadores gerais: total de respostas, municípios alcançados, válidas x invalidadas.
- Gráfico de barras por candidato.
- Gráfico de pizza com distribuição percentual.
- Gráfico de linhas com evolução da coleta ao longo do tempo.
- Filtros por município, período, formulário e pergunta.
- Consumo das agregações pré-calculadas, sem recalcular a cada consulta.

**Critério de aceite:** o painel abre em tempo aceitável com a base populada de teste e os filtros alteram corretamente os gráficos.

---

## Sprint 7 — Apuração por Município e Exportação

**Objetivo:** entregar o resultado no formato em que ele será usado. **Marco M3.**

- Tabela ranqueada por município, com valores absolutos e percentuais.
- Visualização de cobertura: quais municípios foram alcançados e quais não.
- Cruzamento entre perguntas (por exemplo, intenção de voto por faixa etária).
- Exportação em CSV e XLSX.
- Exportação em PDF com gráficos e tabelas.
- Registro em auditoria de toda exportação realizada.

**Critério de aceite:** os totais do painel batem com os do arquivo exportado; a exportação aparece no log de auditoria com usuário e data/hora.

---

## Sprint 8 — Privacidade, Distribuição e Homologação

**Objetivo:** deixar o sistema apto ao disparo real. **Marco M4.**

- Rotina de expurgo automático das respostas após 4 anos do encerramento da pesquisa.
- Expurgo dos dados técnicos de duplicidade no encerramento da coleta.
- Revisão de conformidade com a LGPD e do texto de consentimento.
- Backup periódico da base configurado e testado.
- Verificação de versão ao abrir o aplicativo, com aviso e link quando houver atualização.
- Geração e assinatura do APK com chave própria.
- Página de download em endereço fixo, com passo a passo de instalação por fonte desconhecida e publicação do hash do arquivo.
- Teste de carga com o porte projetado: 100 mil respostas em base e pico de 300 envios por minuto.
- Manual do Administrador e do Analista.
- Homologação assistida com o Administrador montando um formulário real.

**Critério de aceite:** teste de carga aprovado, expurgo validado em ambiente de homologação e APK instalado com sucesso em aparelho real a partir da página de download.

---

## 4. Riscos de Cronograma

| Risco | Sprint afetada | Mitigação |
|---|---|---|
| Lógica condicional se mostrar mais complexa que o previsto | 3 | Entregar a versão simples (mostrar/ocultar por resposta única) e tratar o resto como evolução |
| Teste de carga reprovar e exigir mudança de infraestrutura | 8 | Antecipar um teste de carga reduzido ainda na Sprint 5 |
| Formulário real do Administrador exigir tipo de pergunta não previsto | 3 ou 8 | Levantar o rascunho das perguntas junto com o Administrador ainda na Sprint 2 |
| Assinatura e distribuição do APK gerarem alertas em aparelhos específicos | 8 | Testar em ao menos três modelos e versões diferentes do Android |
