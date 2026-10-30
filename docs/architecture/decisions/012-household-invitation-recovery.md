# ADR-012: Recuperação de convite residencial no onboarding

- Status: implementado localmente; publicação depende de aprovação humana.
- Data: 2026-10-30.

## Problema

O onboarding dependia exclusivamente de `join` na URL. Um retorno de autenticação
sem esse parâmetro oferecia criar uma residência para quem havia sido convidado.
O cadastro de uma identidade no Auth não equivale ao aceite residencial.

## Decisão

Uma RPC sem parâmetros recupera somente o UUID do convite ativo do e-mail
confirmado da própria identidade autenticada, sem permitir consulta de endereços
arbitrários. Não retorna dados da residência nem efetiva o aceite. Havendo mais
de um convite, exige o link original em vez de escolher um destino.

Sem `join`, o onboarding consulta essa RPC antes de mostrar criação de residência.
Falha de consulta bloqueia a criação e oferece nova tentativa. O aceite continua
explícito, validando UUID, e-mail confirmado, prazo, revogação e limite de membros.

O banco também recusa criar uma residência quando há convite ativo para o e-mail
da conta. Criação e aceite usam o mesmo lock transacional por identidade para
evitar matrículas concorrentes. O bootstrap já concluído permanece idempotente.

Se uma conta já possui residência e abre um convite, a interface mostra o
conflito; não descarta o convite silenciosamente nem transfere dados. O usuário
pode verificar o convite (incluindo replay de um aceite já concluído) ou optar
explicitamente por continuar na residência atual.

## Operação e limites

Publicar primeiro a migration incremental `202610290003`, depois o frontend.
Antes da atualização do banco, a consulta inexistente bloqueia onboarding sem
link em vez de oferecer criação indevida. Links explícitos continuam funcionando.

A correção previne novos cadastros separados. Não move contas, tarefas, finanças,
integrações ou dados já existentes. A regularização de uma conta vinculada à casa
errada exige diagnóstico e aprovação específicos, preservando privacidade e
histórico. Não apagar usuários para refazer o convite.

Conferir também a URL pública, redirects autorizados e template do e-mail no
ambiente de destino para preservar `join` no retorno. A recuperação não substitui
essa configuração e não comprova qual etapa removeu o parâmetro em produção.
