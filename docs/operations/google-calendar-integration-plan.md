# Plano de integração de tarefas com Google Agenda

Status: plano aprovado em 2026-10-29; implementação em andamento, integração não ativada.
Data: 2026-10-29.

## Objetivo e escopo

Exibir no Google Agenda as tarefas com prazo criadas no Gabio, sem depender do
computador local ou de IA. O Supabase continua sendo a fonte de verdade.
Primeira entrega unidirecional: Gabio -> Google Agenda. Eventos criados no Google
não viram tarefas; editar um evento no Google não altera a tarefa no Gabio.
Não é uma integração com Google Tasks. Login por e-mail permanece como está.

## Comportamento proposto

- Ajustes > Integrações > Google Agenda: conectar, ver estado, sincronizar e desconectar.
- Cada membro conecta a própria conta e escolhe exportar tarefas compartilhadas,
  privadas ou ambas. Nada é exportado antes do consentimento explícito.
- Dois calendários secundários por conta, criados sob demanda: Gabio - Casa e
  Gabio - Privado. Nenhum compartilhamento de calendário ou convite é automático.
- A mesma tarefa compartilhada pode aparecer em cada conta conectada, sem
  duplicação dentro de uma conta. Conectar uma pessoa não conecta a outra.
- Tarefas privadas são exportadas somente para a conexão do proprietário, mesmo
  que haja responsável diferente em dados legados. Validar novamente no servidor.
- Tarefa sem prazo não gera evento. Adicionar prazo cria; alterar prazo ou título
  atualiza; retirar prazo ou cancelar remove apenas o evento gerenciado pelo app.
- O evento contém título, prazo, estado e link para abrir a tarefa; não inclui
  dados financeiros, e-mails de membros ou descrições privadas de outros recursos.
- Ao concluir, manter o evento com indicação Concluída e remover lembretes futuros;
  ao reabrir tarefa permitida, restaurar título/estado e lembretes configurados.
- Prazo vencido não gera alerta retroativo. Lembrete Google é uma preferência por
  usuário e depende das permissões/configurações do Google Agenda no dispositivo.
- Recorrência segue o modelo atual: cada ocorrência do Gabio vira um evento
  independente. Só exportar ocorrências existentes; não criar RRULE no Google.
- Ativação inicial oferece importar tarefas abertas com prazo de hoje em diante,
  com contagem prévia. Tarefas antigas/concluídas não são exportadas por padrão.

## Prazo versus compromisso

Hoje o contrato tem dueAt e a interface usa datetime-local. Preservar o instante
existente, exibindo com fuso IANA da residência, inicialmente America/Bahia.
O fuso do celular não pode deslocar silenciosamente o prazo cadastrado.

Na primeira entrega, o evento de prazo usa horário do dueAt, duração visual de
15 minutos e transparência livre; isso representa um lembrete, não reserva de
15 minutos de trabalho. Explicar essa representação na preferência de exportação.
O recurso de data sem horário é uma extensão posterior: persistir data civil
explicitamente, sem converter meia-noite em timestamp por suposição. Quando
suportado, usar evento de dia inteiro e fim exclusivo no dia seguinte.

A etapa seguinte adiciona Agendar execução com início/fim explícitos. Somente
esses intervalos haverá alerta de sobreposição com outros compromissos criados
pelo Gabio, consultando e validando os intervalos no backend transacionalmente.
Prazo pontual não dispara conflito. Não ler a agenda pessoal completa nesta fase.

## Autorização e privacidade

Usar OAuth Authorization Code no servidor, com state aleatório, expirável e de uso
único ligado à sessão Gabio, proteção contra troca de conta e redirect URI exata.
Usar PKCE quando suportado pelo fluxo adotado. Não alterar o provedor de login.
Solicitar acesso offline para renovar autorização sem exigir o app aberto.

Escopo proposto: https://www.googleapis.com/auth/calendar.app.created, que permite
criar calendários secundários e gerir seus eventos. Validar os endpoints usados
com esse escopo antes de fixá-lo no ADR; não ampliar permissões automaticamente.

Refresh tokens cifrados no backend, com chave em secret de servidor e plano de
rotação. Nenhum token OAuth no navegador, IndexedDB, logs ou tabelas expostas pela
API pública. Segredos do cliente OAuth ficam somente no backend. Metadados de
conexão possuem RLS; procedimentos de credenciais sem EXECUTE para anon/clientes.

Cada operação verifica residência, proprietário, consentimento vigente, versão
da tarefa e destino permitido. Calendários privados não são compartilhados pelo
Gabio. Compartilhamento manual pelo usuário no Google pode expor os eventos desse
calendário; isso precisa estar claro na interface de conexão.

Ao passar tarefa de compartilhada para privada, priorizar remoção dos eventos
dos outros membros e mover a cópia do dono para calendário privado. Exibir remoção
pendente até confirmação externa; não prometer retirada instantânea do Google.
O que já foi visualizado/exportado por outra pessoa não pode ser desfeito.

Desconectar oferece parar exportação mantendo eventos, ou remover eventos
Gabio antes de revogar. Revogar externamente torna a conexão Reconectar; conservar
somente o registro mínimo de pendências de remoção, sem tentar acesso sem consentimento.
Saída de membro cancela novos envios e agenda limpeza dos destinos ainda autorizados.

## Backend e modelo de dados

A tabela calendar_events atual serve a compromissos e só tem um google_event_id.
Não usar esse campo para várias contas nem tratar tarefas como compromissos locais.
Criar migrations incrementais específicas:

- google_calendar_connections: usuário, residência, estado, escopos, expiração e
  metadados de conta estritamente necessários. Credenciais em armazenamento privado.
- google_calendar_targets: conexão, classe compartilhada/privada e calendarId.
- task_calendar_links: tarefa, conexão, destino, eventId, etag, versão exportada e
  último erro sanitizado; unicidade por tarefa/conexão/destino ativo.
- Preferências: categorias exportadas, lembrete e política de tarefas concluídas.
- Estender outbox_events com estado de retry/lease/falha terminal se necessário;
  payload mínimo com IDs e versão, sem título ou tokens.

A mutação de tarefa e o registro na outbox acontecem na mesma transação. O app
confirma a gravação local e apresenta Sincronizando, Sincronizada, Erro ou Reconectar.
O Google indisponível nunca impede salvar uma tarefa no Gabio.

Uma Edge Function de worker processa lotes com exclusão concorrente, timeout e
retry com backoff/jitter e teto de tentativas. Identificadores externos estáveis,
compatíveis com o formato aceito pelo Google, impedem duplicações após timeout.
Em inserção ambígua/409, buscar o evento gerenciado e reconciliar. Usar etag nas
atualizações e revalidar estado atual antes de enviar trabalho antigo.

Cron do Supabase aciona o worker mesmo sem navegador aberto, inicialmente a cada
2 minutos (cerca de 21.600 chamadas/mês se acionado sempre), com lotes pequenos,
limite diário, métricas e execução vazia barata. Confirmar cotas reais do projeto.
Autenticação interna dedicada; nenhum endpoint de worker aceita chave pública como
credencial administrativa. Credencial do agendador em armazenamento de secrets.

Reconciliação periódica limitada aos calendários/eventos do Gabio detecta remoções
ou alterações externas. Ao alterar no Google, não importar mudanças: mostrar aviso
e permitir Restaurar dados do Gabio. Uma atualização posterior no Gabio é autoridade.
Backlog após erro, revogação ou pausa é retomado sem exportar versões obsoletas.

## Etapas e critérios de entrega

1. Contratos e decisão arquitetural: aprovar regras acima, campos, política de
   exclusão/conclusão, escopo OAuth e matriz de privacidade. ADR separado aceito
   antes da implementação. Não alterar migrations já aplicadas.
2. Banco e worker com Google simulado: RLS, outbox, deduplicação, retry, revogação,
   mudança de visibilidade, recorrência e atualização fora de ordem testados.
3. OAuth e configurações: conectar cada pessoa, negar consentimento, reconectar,
   desconectar e mostrar estado sem expor credenciais. Testes CSRF e replay.
4. Vertical ponta a ponta: tarefa com prazo -> evento; edição -> mesmo evento;
   conclusão -> estado; recorrência -> única próxima ocorrência; reprocessamento
   não duplica. App funciona com Google fora do ar e com conexão de apenas um membro.
5. Homologação com calendário dedicado: duas identidades sintéticas em testes;
   validação humana autorizada das contas reais sem dados em logs ou testes.
   Conferir fuso, privacidade, lembretes Android e limpeza de eventos.
6. Revisão independente, CI e deploy aprovado. Feature flag desativada por padrão
   até conexão/configuração verificadas; desligar integração não apaga tarefas.
7. Evolução posterior: reservar intervalos de execução, conflitos entre compromissos
   Gabio, data sem horário e notificações próprias. Sincronização bidirecional e
   Google Tasks permanecem fora deste escopo.

## Ações que dependerão do usuário

- Criar/escolher projeto Google Cloud e habilitar Google Calendar API.
- Configurar consentimento e cliente OAuth Web. Após definir o endpoint de callback,
  cadastrar a URL HTTPS exata fornecida pela implementação, sem curingas.
- Cadastrar client ID/client secret em secrets do Supabase, nunca em VITE_* nem Git.
- Autorizar o novo escopo e o deploy quando a entrega estiver revisável.
- Cada membro conectar sua conta e selecionar as opções de exportação.
- Homologar eventos e alertas no Google Agenda/Android.

O modo Testing do OAuth pode expirar refresh tokens em 7 dias para esse tipo de
acesso. Planejar publicação do consentimento e conferir a exceção de uso pessoal
para duas pessoas e os requisitos vigentes; não prometer aprovação automática nem
pedir verificação de domínio workers.dev sem antes confirmar o procedimento.

## Custo e limites

Meta de custo continua R$ 0. Consultar cotas efetivas do Google Cloud e Supabase
antes de ativar; não habilitar cobrança ou excedentes automaticamente. Google AI
Pro não é requisito desta integração. Usar mutações e lotes em vez de polling
frequente de calendários pessoais. A documentação consultada cita limiar gratuito
diário da Calendar API e mudanças de quotas em 2026; não assumir gratuidade ilimitada.

## Fontes oficiais consultadas

- Escopos: https://developers.google.com/workspace/calendar/api/auth
- Eventos e IDs: https://developers.google.com/workspace/calendar/api/v3/reference/events/insert
- OAuth e tokens: https://developers.google.com/identity/protocols/oauth2/
- Verificação: https://developers.google.com/identity/protocols/oauth2/production-readiness/sensitive-scope-verification
- Cotas: https://developers.google.com/workspace/calendar/api/guides/quota
- Agendamento: https://supabase.com/docs/guides/functions/schedule-functions
