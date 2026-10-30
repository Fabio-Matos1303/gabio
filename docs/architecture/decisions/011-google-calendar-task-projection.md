# ADR-011: Projeção de tarefas no Google Agenda

- Status: aceito para implementação pelo usuário em 2026-10-29; ativação OAuth depende de configuração e consentimento de cada conta.
- Data: 2026-10-29.

## Decisão

O Supabase é a fonte de verdade. Cada usuário autoriza sua própria conta Google
por OAuth de servidor e escolhe exportar tarefas compartilhadas e/ou privadas.
Usar somente o escopo calendar.app.created, confirmado nos endpoints de criação
de calendário secundário e de eventos. Não ler calendários pessoais nem Google Tasks.

Manter destinos separados Gabio - Casa e Gabio - Privado, sem ACL ou convidados
automáticos. Tarefas privadas são exportadas somente para a conexão do dono.
O compartilhamento manual de um calendário no Google foge das permissões do Gabio.

Prazos usam o instante persistido, fuso America/Bahia e evento visual transparente
de 15 minutos. Não reservar ocupação por prazo nem criar regras RRULE; a recorrência
continua produzindo ocorrências no gateway de tarefas. Concluídas mantêm o histórico
com marca no título e sem lembretes; canceladas ou sem prazo removem sua projeção.

## Segurança e consistência

A mutação de tarefa enfileira integração na mesma transação, sem enviar HTTP no
commit. O worker lê o estado mais recente, valida conexão/consentimento/membership,
processa com lease e faz retry limitado. Estado/IDs tornam o replay idempotente.
Mudanças de visibilidade priorizam remoção de destinos que perderam autorização.
Uma indisponibilidade Google não impede a criação da tarefa.

OAuth usa state aleatório de uso único, TTL e vínculo à identidade Gabio; tokens
ficam cifrados no servidor, fora de tabelas expostas e logs. Clientes não executam
RPCs administrativas. O callback não confia em usuário/household enviados pelo browser.
Chaves de integração, de cifragem e do agendador não possuem prefixo VITE_.
A flag GOOGLE_CALENDAR_ENABLED começa false. Não habilitar Google sem credenciais.

## Operação

Sincronização assíncrona iniciada por outbox e agendador autenticado. Interface
expõe estado, preferências, sincronização manual e desconexão com escolha de
limpeza. Não prometer remoção instantânea de dados já copiados ao Google.
Falhas, revogação e tokens expirados são visíveis; recursos centrais seguem úteis.

Uma conexão Google e um preview Cloudflare não constituem ambiente de dados isolado:
backends são os definidos nas variáveis de build. Testes automáticos usam somente
fakes e dados sintéticos. Nenhum deploy nem consentimento externo ocorre por este ADR.

## Consequências

Não há sincronização Google -> Gabio, leitura de disponibilidade pessoal ou reserva
de horário nesta entrega. Data civil sem horário exige contrato próprio posterior.
Custos e cotas continuam sujeitos aos limites gratuitos do projeto, sem ativar
cobrança automática. O rollout exige revisão independente e os checks de banco,
provider, OAuth e interface, além de homologação humana da conta real.

Plano: ../../operations/google-calendar-integration-plan.md

Fontes: https://developers.google.com/workspace/calendar/api/auth e
https://developers.google.com/workspace/calendar/api/v3/reference/events/insert
