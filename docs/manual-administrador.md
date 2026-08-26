# Manual do Administrador

Quem tem perfil **Administrador** monta a pesquisa, publica, acompanha a coleta,
encerra e exporta. Quem só lê resultado é o Analista — o manual dele é
[manual-analista.md](./manual-analista.md).

## 1. Entrar

- **Painel** (navegador): endereço do painel, e-mail e senha.
- **Aplicativo** (Android): a mesma conta. É pelo aplicativo que se monta e
  publica a pesquisa em campo.

A sessão expira por inatividade (30 min) e tem prazo absoluto (8 h). Expirou,
entre de novo — não é erro.

## 2. Montar a pesquisa

No aplicativo, **Formulários → Nova pesquisa**:

1. **Título e descrição.** O título aparece para quem responde.
2. **Perguntas.** Cada uma tem um tipo:
   - *Única escolha* — uma alternativa entre várias;
   - *Múltipla escolha* — mais de uma alternativa;
   - *Escala* — nota entre um mínimo e um máximo (ex.: 0 a 10);
   - *Número* — valor numérico livre;
   - *Texto livre* — resposta escrita.
3. **Alternativas.** Perguntas de escolha exigem no mínimo duas.
4. **Lógica condicional** (opcional): uma pergunta só aparece se determinada
   alternativa de uma pergunta **anterior** tiver sido escolhida. Use para não
   perguntar o que não faz sentido para aquele respondente.
5. **Pré-visualização.** Responda a própria pesquisa antes de publicar; é a
   forma mais barata de achar pergunta mal escrita.

### O que conferir antes de publicar

- a ordem das perguntas faz sentido lida em voz alta;
- as alternativas cobrem as respostas possíveis (inclusive "Nenhum deles" e
  "Não sei", quando couber);
- as condicionais apontam para a alternativa certa;
- não há pergunta pedindo nome, telefone, CPF ou e-mail. O sistema não guarda
  isso, e perguntar quebraria a promessa feita ao respondente.

## 3. Publicar

**Formulário → Publicar.** A partir daí:

- a pesquisa ganha um **link público** e um **QR Code** (o link usa um token
  aleatório, nunca o identificador interno);
- **perguntas e alternativas ficam imutáveis.** Não existe caminho de edição
  depois da publicação: mudar pergunta no meio da coleta misturaria respostas de
  perguntas diferentes na mesma apuração. Se errou, encerre e publique uma nova
  versão;
- a coleta pode começar.

## 4. Acompanhar a coleta

No painel:

- **Indicadores** — válidas no recorte, municípios alcançados, em conferência e
  invalidadas;
- **Apuração por município** — ranking com absoluto e percentual;
- **Cobertura** — quais municípios ainda não têm resposta. É esta lista que
  orienta o próximo dia de campo;
- **Evolução** — respostas por dia.

Os números vêm de agregação recalculada periodicamente, não a cada clique: uma
resposta enviada agora aparece no próximo ciclo.

### Respostas em conferência

O sistema marca automaticamente respostas suspeitas (preenchimento rápido demais,
repetição do mesmo aparelho, município fora da Bahia). Elas **não** entram na
contagem de válidas e **não** são descartadas: ficam separadas para você olhar.

Ao revisar, você pode **invalidar** (sai da contagem, registro permanece) ou
**revalidar**. Nunca há exclusão — e toda decisão fica registrada com seu nome e
o horário.

## 5. Encerrar a coleta

**Formulário → Encerrar.** Duas coisas acontecem:

1. a pesquisa para de aceitar respostas;
2. os **dados técnicos de duplicidade são apagados** automaticamente (o código do
   aparelho e as sessões de coleta). É o que foi prometido no termo de
   consentimento.

O resultado continua inteiro: encerrar não apaga resposta. As respostas são
apagadas automaticamente 4 anos depois do encerramento.

Encerrar não tem volta. Confira se a coleta acabou mesmo antes.

## 6. Exportar

No painel, bloco **Exportar** — o arquivo sai com o mesmo recorte dos filtros
que estão na tela:

- **CSV** — tabela única, para reprocessar;
- **XLSX** — planilha com uma aba por bloco;
- **PDF** — o painel como está, com gráficos e tabelas.

Toda exportação fica no log de auditoria com seu usuário, data e hora. Só saem
agregados: nenhuma resposta individual.

## 7. Usuários e permissões

O bloco **Usuários**, no fim do painel web, só aparece para o Administrador. Ali se cria conta,
troca perfil, desativa e redefine senha.

| Perfil | Pode | Enxerga |
|---|---|---|
| Administrador | tudo, inclusive gerenciar contas | todas as pesquisas |
| Analista | só ler resultado e exportar | todas as pesquisas |
| Pesquisador | montar e acompanhar as próprias pesquisas | **só as próprias** |

- crie contas **Analista** para quem só precisa ler resultado da equipe;
- crie contas **Pesquisador** para quem toca a própria pesquisa e não deve ver a dos outros;
- desative quem saiu da equipe — desativar encerra as sessões abertas;
- senha forte é exigida: 12 caracteres, com maiúscula, minúscula e número;
- a senha **não aparece na tela depois de criada**, nem para você. Passe-a por um caminho
  seguro; esquecida, o caminho é redefinir, não recuperar;
- criação, alteração de perfil e desativação ficam auditadas.

Você não desativa a própria conta nem troca o próprio perfil — a API recusa, e o painel nem
oferece o botão. É o que impede o sistema de ficar sem nenhum administrador.

Se a instalação tiver **cadastro aberto** (`CADASTRO_ABERTO`), qualquer pessoa cria a própria
conta de Pesquisador confirmando o e-mail, sem passar por você.

Não compartilhe conta. Auditoria só serve se o nome no log for o de quem agiu.

## 8. Quando algo dá errado

| Sintoma | O que fazer |
|---|---|
| "Sua sessão expirou" | entre de novo; nada foi perdido |
| Aplicativo pede atualização e bloqueia | instale a versão da página de download; a versão antiga não pode mais gravar |
| Resposta enviada não aparece no painel | aguarde o próximo ciclo de agregação, ou use **atualizar agregações** |
| Número do painel diferente do arquivo exportado | os dois saem da mesma fonte; se divergirem, avise a equipe técnica — é defeito, não ajuste |
| Coletador sem internet em campo | normal: o aplicativo guarda no aparelho e reenvia sozinho quando a conexão voltar |

## 9. O que o sistema nunca faz

- não guarda nome, CPF, telefone ou e-mail de quem responde;
- não mostra resposta individual identificável — nem para você;
- não apaga resposta por decisão de tela, só por prazo cumprido;
- não aceita município digitado à mão: sempre a lista oficial do IBGE.

Se alguém pedir algo dessa lista, a resposta é não — e o motivo é a promessa
feita a cada respondente na tela de consentimento.
