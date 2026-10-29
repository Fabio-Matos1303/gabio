# Google Agenda: configuração e homologação

## Estado e limites da entrega

O login Gabio continua por e-mail/senha. Conectar Google concede acesso apenas a
calendários secundários criados pelo app; não importa eventos pessoais, Google
Tasks ou dados financeiros. Cada pessoa conecta sua conta separadamente.
A tela fica em Ajustes > Google Agenda. A seção pode ser ocultada definindo
VITE_GOOGLE_CALENDAR_ENABLED=false no build; o servidor permanece desativado
até GOOGLE_CALENDAR_ENABLED=true e suas credenciais estarem válidas.

## Configuração no Google Cloud

1. Criar ou escolher um projeto destinado ao Gabio, sem ativar serviços pagos.
2. Habilitar Google Calendar API.
3. Configurar consentimento OAuth (Google Auth Platform), contato do desenvolvedor
   e público adequado às duas contas. Adicionar ambas como testadoras durante o teste.
4. Declarar somente o escopo https://www.googleapis.com/auth/calendar.app.created.
5. Criar cliente OAuth do tipo Aplicativo da Web.
6. Cadastrar esta URI de redirecionamento exatamente:
   https://ukyjbipshqsdbhkwkepq.supabase.co/functions/v1/google-calendar
7. Guardar client ID e client secret em Supabase > Edge Functions > Secrets,
   respectivamente GOOGLE_OAUTH_CLIENT_ID e GOOGLE_OAUTH_CLIENT_SECRET.
   Não colar segredos no chat, em commits ou em variáveis VITE_*.

O modo Testing pode expirar refresh tokens em sete dias. Antes do uso contínuo,
conferir os requisitos de produção e exceções aplicáveis a uso pessoal. Não
prometer remoção da tela de aviso nem aprovação automática de verificação.

## Configuração de servidor

- PUBLIC_APP_URL=https://gabio.fabiosmo123.workers.dev
- GOOGLE_OAUTH_CLIENT_ID e GOOGLE_OAUTH_CLIENT_SECRET: valores do cliente OAuth.
- GOOGLE_TOKEN_ENCRYPTION_KEY: chave aleatória forte, conforme formato validado
  pelo módulo de cifragem; guardar de forma recuperável fora do Git.
- GOOGLE_CALENDAR_WORKER_SECRET: segredo aleatório exclusivo do agendador.
- GOOGLE_CALENDAR_ENABLED=false inicialmente; true somente após conferir
  credenciais, migrations, funções, cotas e consentimento.

As funções google-calendar e google-calendar-worker desativam o verify_jwt
padrão por suportarem callback público/agendamento. Isso não elimina a
verificação de autorização: POST de usuário exige sessão validada e worker exige
segredo dedicado. Não habilitar esses endpoints com uma anon key como segredo.

Aplicar somente a migration revisada 202610290002_google_calendar_integration.sql.
Não executar db push indiscriminado neste diretório: há migration M5 ainda em
trabalho que não pertence à integração Google. Registrar a migration no histórico
quando aplicada pelo processo de publicação.

Publicar ambas as funções após revisão e configurar o agendamento autenticado a
cada dois minutos com os limites do worker. O SQL idempotente está em
supabase/schedules/google_calendar_worker.sql e usa os secrets de Vault
gabio_google_calendar_project_url (URL do projeto Supabase) e
gabio_google_calendar_worker_secret (mesmo segredo exclusivo do worker). Credencial do agendador fica em secret
servidor/Vault. Não incluir tokens no SQL versionado, logs ou payload de outbox.
Não iniciar agendamento permanente enquanto a integração estiver desativada.

## Roteiro de teste humano

1. Abrir a versão publicada, entrar e acessar Ajustes > Google Agenda.
2. Selecionar as tarefas da casa e, se desejado, as suas privadas; escolher lembrete.
3. Conectar e continuar no Google. Conferir a conta e as permissões antes de aceitar.
4. Criar tarefa compartilhada com prazo futuro e verificar um evento no calendário
   Gabio - Casa. Aguardar processamento assíncrono e atualizar o estado no Gabio.
5. Editar prazo e título; confirmar atualização do mesmo evento, sem duplicação.
6. Concluir e conferir marca Concluída/ausência de lembretes futuros.
7. Testar uma tarefa recorrente: somente a próxima ocorrência existente é enviada.
8. A outra pessoa conecta a própria conta e vê a mesma tarefa compartilhada em
   seu calendário. Tarefa privada deve aparecer apenas para seu proprietário.
9. Alterar compartilhada para privada e conferir remoção das cópias que perderam
   autorização; durante indisponibilidade pode haver remoção pendente no Google.
10. Desconectar, escolhendo manter ou remover eventos. Tarefas no Gabio permanecem.

O prazo é um lembrete transparente de quinze minutos; não representa horário
reservado. A entrega não detecta conflitos com eventos pessoais no Google.
Lembretes no Android dependem do Google Agenda e das permissões do dispositivo.

## Recuperação

- Revogação Google ou refresh token inválido exige Reconectar, não novo cadastro Gabio.
- Erro temporário preserva a tarefa e retenta com limite; sincronização manual
  reaproveita identificadores. Não apagar IDs externos para forçar um retry.
- Desligar GOOGLE_CALENDAR_ENABLED interrompe novas chamadas sem apagar tarefas.
- Não rotacionar a chave de cifragem sem migração das credenciais existentes;
  preservar backup seguro ou exigir nova autorização de cada pessoa.
- Calendário compartilhado manualmente no Google pode expor eventos exportados.

## Referências

https://developers.google.com/workspace/calendar/api/auth
https://developers.google.com/identity/protocols/oauth2/
https://developers.google.com/workspace/calendar/api/guides/quota
https://supabase.com/docs/guides/functions/schedule-functions

## Evidências de validação

Validação local: frontend e contratos de UI, pacotes de domínio, testes do provider/OAuth/worker e assertions PostgreSQL em banco vazio isolado. Teste vertical adicional com SQL real e API Google simulada cobriu duas contas, edição, mudança de privacidade, remoção/recriação, conclusão e desconexão. Deno check dos endpoints aprovado. Layout conferido em 320, 390, 768 e 1280 pixels, sem overflow horizontal e com alvos de toque de 44 pixels.

Essas evidências não substituem consentimento e teste com contas Google reais; nenhuma chamada real ao Google foi usada nos testes automáticos.

A reconciliação diária revisita apenas eventos já exportados (até 100 por rodada,
com rodízio). O Gabio permanece a autoridade: dados editados no Google podem ser
restaurados pela sincronização. Eventos apagados externamente são recriados com
novo ID; calendário apagado exige reparo confirmado na interface. Esse reparo
pode deixar um calendário vazio de tentativa anterior no Google, que pode ser
excluído manualmente. Não há leitura dos calendários pessoais.
