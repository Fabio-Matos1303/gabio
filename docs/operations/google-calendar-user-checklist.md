# Configurar Google Agenda para o Gabio — passo a passo

Este guia trata apenas da configuração que depende da sua conta Google.
A implementação e os testes do aplicativo continuam em paralelo.

## Antes de começar: os dois endereços têm funções diferentes

- Aplicativo: https://gabio.fabiosmo123.workers.dev
- URI de retorno OAuth: https://ukyjbipshqsdbhkwkepq.supabase.co/functions/v1/google-calendar

A URI de retorno deve ser COPIADA para um campo do Google Cloud. Não é uma página
para abrir agora: ela recebe a autorização enviada pelo Google quando você conecta
sua conta pelo Gabio. Enquanto a função não estiver publicada, pode retornar 404.
Mesmo depois de publicada, abrir esse endereço sem state/código não conecta a conta.

## 1. Criar ou escolher o projeto Google Cloud

1. Abra https://console.cloud.google.com/ e entre na conta que administrará o Gabio.
2. No seletor de projeto, ao lado do logotipo Google Cloud, escolha Novo projeto.
3. Nome sugerido: Gabio. Conclua a criação e selecione esse projeto.
4. Use o mesmo projeto nas próximas etapas. Não é necessário cadastrar cartão,
   ativar teste pago ou contratar Google Workspace para estes passos.

Objetivo: associar a API e as credenciais OAuth ao seu aplicativo.

## 2. Habilitar a API correta

1. Acesse APIs e serviços > Biblioteca.
2. Pesquise Google Calendar API.
3. Abra a API e clique em Ativar. Se aparecer Gerenciar, ela já está habilitada.
4. Atalho da biblioteca: https://console.cloud.google.com/apis/library/calendar-json.googleapis.com

Objetivo: permitir que o backend do Gabio acesse o Google Agenda com seu consentimento.
Não habilite Google Tasks, Gemini ou APIs bancárias para esta integração.

## 3. Configurar o consentimento OAuth

1. Abra Google Auth Platform no menu do Google Cloud. Em interfaces anteriores,
   o caminho é APIs e serviços > Tela de consentimento OAuth.
2. Clique em Começar/Get started se a tela ainda não estiver configurada.
3. Nome do aplicativo: Gabio.
4. E-mail de suporte e contato: uma conta sua que você monitore.
5. Público/Audience: Externo, caso usem contas pessoais Gmail. Interno é destinado
   a organizações Google Workspace e não deve ser escolhido para duas contas pessoais.
6. Inicialmente mantenha o status Testing/Em teste.
7. Em Público/Audience > Usuários de teste, adicione as duas contas Google que
   serão usadas por você e sua esposa. As contas Google podem ser diferentes do
   e-mail do login Gabio; cada pessoa autoriza sua própria conexão.

Objetivo: permitir que ambas as contas façam a homologação.
Os nomes das telas podem variar entre português e inglês.

## 4. Cadastrar a permissão mínima

1. Em Google Auth Platform > Acesso a dados/Data Access, clique em
   Adicionar ou remover escopos/Add or remove scopes.
2. Procure e selecione exatamente:

   https://www.googleapis.com/auth/calendar.app.created

3. Se houver campo de inclusão manual, cole esse endereço nele e confirme.
4. Salve. Não selecione acesso completo a todos os calendários.

Objetivo: criar calendários secundários do Gabio e gerenciar eventos neles,
sem conceder leitura/alteração indiscriminada dos seus calendários pessoais.

## 5. Criar o cliente OAuth

1. Abra Google Auth Platform > Clientes/Clients.
   Alternativa da interface antiga: APIs e serviços > Credenciais > Criar credenciais
   > ID do cliente OAuth.
2. Tipo de aplicativo: Aplicativo da Web/Web application.
3. Nome sugerido: Gabio Web.
4. Origens JavaScript autorizadas: o fluxo usa o servidor; pode ficar vazio.
   Caso a interface solicite uma origem, use somente:
   https://gabio.fabiosmo123.workers.dev
5. Em URIs de redirecionamento autorizados/Authorized redirect URIs, adicione
   exatamente, sem espaço, barra extra no final ou parâmetro:

   https://ukyjbipshqsdbhkwkepq.supabase.co/functions/v1/google-calendar

6. Clique em Criar/Create.
7. Guarde o ID do cliente/Client ID e a Chave secreta do cliente/Client secret.
   Se houver opção de download, salve o JSON fora da pasta do projeto e do Git.

Objetivo: identificar o backend que receberá a autorização.
Não criar chave de API nem conta de serviço no lugar de um cliente OAuth.

## 6. Cadastrar os dois valores no Supabase

1. Abra https://supabase.com/dashboard/project/ukyjbipshqsdbhkwkepq
2. No menu lateral, escolha Edge Functions > Secrets.
   Se Secrets não estiver nessa seção, pesquise Secrets nas configurações das funções.
3. Adicione estes dois secrets, um de cada vez:

| Nome                       | Valor a preencher                     |
| -------------------------- | ------------------------------------- |
| GOOGLE_OAUTH_CLIENT_ID     | O ID do cliente criado na etapa 5     |
| GOOGLE_OAUTH_CLIENT_SECRET | A chave secreta do cliente da etapa 5 |

4. Salve. Confira apenas os nomes na lista; não compartilhe os valores.

Objetivo: disponibilizar as credenciais somente para o backend.
Não preencher VITE_*, arquivo .env do frontend ou variáveis do Cloudflare com o
client secret. Não colar o secret no chat, em prints ou em commits.

## 7. O que informar neste chat

Depois de salvar, basta responder:

“Google Calendar API habilitada, duas contas adicionadas como testadoras e os
secrets GOOGLE_OAUTH_CLIENT_ID e GOOGLE_OAUTH_CLIENT_SECRET cadastrados.”

Não envie os valores. As chaves de cifragem e do worker, migrations, publicação
das funções e agendamento serão tratados na implementação, sem pedir que você
invente ou copie credenciais administrativas para o navegador.

## 8. Conectar as contas quando a entrega estiver publicada

1. Entrar no Gabio com a própria conta.
2. Abrir Ajustes > Google Agenda.
3. Selecionar tarefas da casa e/ou suas tarefas privadas.
4. Clicar em Conectar Google Agenda e depois Continuar no Google.
5. Escolher sua conta Google e conferir a permissão solicitada antes de aceitar.
6. Voltar ao Gabio. A sessão que iniciou o processo confirma a conexão.
7. Sua esposa repete o processo entrando com o próprio usuário Gabio.

Ainda não execute essa etapa se a interface informar Em preparação.

## Erros comuns

- redirect_uri_mismatch: conferir a URI exata da etapa 5 e o cliente utilizado.
- access_denied/usuário não autorizado em teste: conferir as duas contas na lista
  de testadores e qual conta está selecionada no consentimento.
- Integração em preparação: backend ainda desativado ou configuração incompleta;
  não indica erro da sua senha Gabio.
- A URI de retorno retorna erro ao abrir manualmente: comportamento esperado;
  iniciar o fluxo pelo aplicativo depois da publicação.
- Autorização pede reconexão após alguns dias: no modo Testing, refresh tokens
  deste tipo de acesso podem expirar em sete dias. Antes do uso contínuo,
  avaliaremos o status de produção e os requisitos aplicáveis ao uso pessoal.

## Fontes oficiais

- Consentimento: https://developers.google.com/workspace/guides/configure-oauth-consent
- Cliente OAuth: https://developers.google.com/workspace/guides/create-credentials
- Permissão Calendar: https://developers.google.com/workspace/calendar/api/auth
- Secrets Supabase: https://supabase.com/docs/guides/functions/secrets
