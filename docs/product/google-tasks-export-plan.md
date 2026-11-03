# Exportação de tarefas para Google Tarefas

Data: 2026-11-03.
Status: implementação local validada; migration preparada e testada em banco isolado. Novo escopo OAuth e publicação em produção pendentes de aprovação. Registro de entrega: [exportação Google Tarefas](../operations/google-tasks-export.md).

Complemento solicitado posteriormente: a criação e a edição agora distinguem Tarefa e Evento, conforme [ADR-016](../architecture/decisions/016-task-event-kind.md). Eventos usam Agenda com início/fim; tarefas seguem a preferência de destino. O seletor não permite escolher conta, lista ou provedor arbitrário. Conversão explícita de tipo pode trocar a projeção com limpeza da anterior.

## Objetivo

Usar Google Tarefas como destino padrão de exportação de novas tarefas do Gabio. Permitir escolher Google Agenda exclusivamente em Ajustes > Integrações > Google. O cadastro, a edição, o cartão e os comandos de tarefas não recebem seletor de destino.

O Supabase continua sendo a fonte de verdade. Salvar no Gabio acontece antes da sincronização e funciona com Google indisponível. Esta entrega é unidirecional: alterações feitas no Google não alteram a tarefa Gabio.

## Base existente

- O ADR-011 define exportação para calendários secundários, com conexão pessoal, credenciais cifradas, outbox, lease e auditoria.
- O ADR-014 acrescenta consulta pessoal de Google Tasks e Google Agenda. Atualmente Google Tasks tem somente permissão de leitura.
- A Google Tasks API já foi habilitada conforme o registro operacional; confirmar a configuração vigente antes do rollout, sem consultar dados pessoais.
- O worker atual exige prazo e identificador de evento gerado pelo Gabio. Essas premissas são específicas de Agenda e não podem ser copiadas para o adaptador Tasks.
- O frontend usa schemas estritos nas respostas de integração. Novos campos exigem contrato compatível ou endpoint versionado, incluindo compatibilidade com clientes PWA antigos.
- Há alterações locais de outras entregas. Preparar a implementação sobre uma base de produção verificada, preservando o trabalho existente e definindo manifesto exclusivo desta entrega.

Referências: [arquitetura](../architecture/overview.md), [ADR-011](../architecture/decisions/011-google-calendar-task-projection.md), [ADR-014](../architecture/decisions/014-task-views-tags-google-reading.md) e [registro de leitura](../operations/task-views-tags-google-reading.md).

## Regras funcionais

### Preferência e momento da escolha

1. A preferência é por usuário e residência, vinculada à integração pessoal. Não é global para a casa. Cada pessoa exporta para sua própria conta Google, respeitando as categorias já autorizadas.
2. O valor inicial é `google_tasks`. Na ativação da funcionalidade, integrações existentes também passam a usar esse padrão para novas tarefas, preservando escolhas de privacidade, lembretes de Agenda e leitura.
3. Só uma alteração explícita em Ajustes pode definir `google_calendar` para novas tarefas. Não oferecer a opção de enviar simultaneamente aos dois serviços.
4. O destino é registrado pelo servidor para cada tarefa/conexão no momento de sua criação. A configuração vigente é lida na mesma transação que registra a intenção de exportação. Mudança posterior de preferência não redireciona essa intenção nem vínculos anteriores.
5. A regra vale para qualquer origem de criação que passe pelo gateway, incluindo PWA, Telegram e futuras entradas validadas. O cliente/modelo não escolhe nem sobrescreve o destino.
6. Uma nova ocorrência recorrente é uma nova tarefa e segue a preferência vigente ao ser criada. Não criar recorrência nativa paralela no Google.
7. Tarefas recebidas pela leitura do Google continuam externas e pessoais; não são reexportadas nem transformadas em tarefas Gabio.
8. Sem conexão ou com exportação pausada, salvar apenas no Gabio. Conectar posteriormente não exporta todo o histórico automaticamente.

### Tarefas anteriores e mudança de configuração

- Registrar um marco de ativação no servidor. Vínculos e intenções anteriores continuam em Agenda; editar, concluir ou reabrir essas tarefas preserva o destino original.
- Não mover nem duplicar eventos anteriores automaticamente. Tarefas antigas sem intenção de exportação não passam a ser exportadas por uma edição comum.
- Uma intenção nova escolhida para Tasks permanece em Tasks mesmo se a autorização chegar depois ou se a preferência mudar durante a espera.
- Ao selecionar Agenda, novas tarefas sem prazo têm intenção nesse destino, mas aguardam prazo antes de gerar evento. Adicionar prazo posteriormente usa essa intenção.
- Exportação retroativa e migração de tarefas antigas ficam fora da primeira entrega. O novo fluxo não oferece o atual `importUpcoming` de forma implícita. Clientes antigos não podem acionar importação histórica sem um fluxo explicitamente compatível.
- A UI explica junto à preferência: “Vale para tarefas criadas a partir de agora. As tarefas anteriores mantêm o destino original.”

### Projeção no Google Tarefas

| Estado no Gabio                                    | Resultado no Google Tarefas                                                    |
| -------------------------------------------------- | ------------------------------------------------------------------------------ |
| Nova tarefa aberta, com ou sem prazo               | Criar na lista gerenciada autorizada                                           |
| Em andamento                                       | Manter `needsAction`; o estado detalhado continua no Gabio                     |
| Editar título ou prazo                             | Atualizar a mesma tarefa externa                                               |
| Retirar prazo                                      | Limpar a data externa, mantendo a tarefa                                       |
| Concluir uma tarefa já exportada                   | Marcar `completed`                                                             |
| Reabrir uma tarefa já exportada                    | Restaurar `needsAction` e limpar conclusão                                     |
| Cancelar ou excluir, quando permitido pelo domínio | Remover a cópia gerenciada                                                     |
| Concluir/cancelar antes da primeira exportação     | Não criar histórico retroativo; reabrir uma intenção elegível permite exportar |

Criar sob demanda as listas pessoais “Gabio - Casa” e “Gabio - Privado”. Não compartilhar listas nem criar atribuições no Google. Uma tarefa da casa pode ter uma cópia em cada conta que tenha autorizado sua exportação. A atribuição de responsável do Gabio permanece no Gabio.

Enviar inicialmente somente título, data quando houver, estado, link para abrir o Gabio e identificador opaco de reconciliação nas notas. Não exportar descrição, tags, nomes de membros, dados financeiros ou outros campos por conveniência.

O campo `due` da API representa o dia programado, não um prazo com horário. Derivar a data civil de `dueAt` no fuso da residência, inicialmente America/Bahia. O horário exato continua no Gabio. Sem prazo, omitir `due`; nunca inventar meia-noite. Explicar em Ajustes: “O Google Tarefas recebe apenas o dia. Horários e lembretes configurados para o Google Agenda não são enviados.” Não prometer notificações em horário exato no Tasks.

O adaptador Agenda mantém a semântica atual de evento de prazo e seus lembretes. Compromissos e leitura de calendários não mudam de destino.

## Interface somente em Ajustes

Renomear a seção de integração para “Google”, preservando navegação e separando conexão, exportação e leitura.

- Campo “Destino de novas tarefas”, com duas opções: “Google Tarefas” (padrão) e “Google Agenda”.
- Botão “Salvar configurações”; o rascunho não altera a preferência persistida. Proteger contra salvamentos concorrentes com versão e recibo idempotente.
- Manter as escolhas existentes de exportar tarefas da casa e/ou privadas. O padrão não concede exportação de tarefas privadas.
- Exibir lembretes somente quando Agenda estiver selecionada; conservar o valor salvo para um retorno futuro a Agenda.
- Mostrar separadamente destino salvo e autorização disponível: “Autorizar Google Tarefas”, “Sincronização pendente”, “Reconectar” e falhas sanitizadas.
- A autorização não salva rascunhos de configuração nem reverte a preferência. Negar consentimento preserva configurações e integrações já autorizadas.
- A seção de leitura mantém seu consentimento separado. A escrita em Tasks não deve exigir acesso de leitura a calendários pessoais.
- Em desconexão, manter a escolha entre preservar cópias externas e limpar cópias gerenciadas antes de revogar. Informar pendências de limpeza por serviço.

Seguir o [design system](design-system.md) e as [diretrizes responsivas](ui-guidelines.md): mobile first, fundo creme, seção em vidro discreto, controles acessíveis, sem novo destino na ilha. Validar primeiro 360 × 800 e depois 768 × 1024, 1366 × 768 e 1920 × 1080, incluindo teclado, foco, contraste, texto ampliado, fallback sem blur e ausência de sobreposição/rolagem horizontal.

## Autorização e proteção de dados

- Solicitar `https://www.googleapis.com/auth/tasks` exclusivamente no fluxo explícito de autorização da exportação para Tasks. Esse escopo permite criar, editar, organizar e excluir todas as tarefas da conta; não existe nesta API um escopo limitado às listas criadas pelo app. Explicar o alcance real antes do consentimento.
- Internamente limitar escrita às listas e tarefas gerenciadas com vínculo persistido. Não aceitar IDs arbitrários do navegador nem localizar alvos por título.
- Avaliar capacidades pelos escopos efetivamente concedidos: `tasks` também satisfaz leitura de tarefas; `tasks.readonly` nunca satisfaz escrita. A leitura agregada deve continuar exigindo os escopos próprios de cada fonte.
- Conexões atuais sem escrita em Tasks entram em “Autorizar Google Tarefas” para novas intenções. Não fazer fallback para Agenda. Vínculos antigos de Agenda continuam operando com suas permissões existentes.
- Preservar OAuth de servidor, state de uso único, intenção vinculada ao ator, expiração, confirmação de troca de conta, tokens cifrados e RPCs internas restritas. Não substituir refresh token válido por ausência de token numa reautorização.
- Se reconectar rotacionar a geração da leitura e limpar tags externas locais, manter o aviso já previsto pelo ADR-014. IDs de projeções e geração da leitura precisam ter ciclos de vida distintos para não duplicar exportações na reconexão da mesma conta.
- Uma troca de conta confirmada não reutiliza IDs externos da conta anterior. Registrar pendências de limpeza sem acessar a conta revogada.
- Na mudança para privada, remover primeiro cópias que perderam autorização; não publicar a versão privada no destino da casa. Revalidar proprietário, membership, conexão e versão antes de cada operação externa.
- Logs e auditoria contêm IDs internos, operações, versões e códigos de erro; nunca títulos, tokens, respostas completas ou conteúdo de tarefas.

## Implementação técnica

### Contratos, decisão e banco

1. Criar ADR próprio antes de alterar código, complementando ADR-011/014: padrão Tasks, escolha somente em Ajustes, destino fixado por intenção, transição sem migração histórica e sem sincronização bidirecional.
2. Introduzir preferência `newTaskDestination`, versão de configuração e marco de ativação. Para usuários sem conexão, o padrão pode ser derivado no servidor; persistir escolha quando configurada.
3. Criar migrations incrementais para destinos Tasks e vínculos de projeção. Manter os vínculos Agenda existentes. Usar intenção por tarefa/conexão com enum de provedor, escopo de visibilidade, estado, versão desejada, versão enviada e identificação externa opaca.
4. Garantir unicidade de intenção por tarefa/conexão e associação inequívoca de cada trabalho da outbox ao provedor. Uma tarefa pode ter vínculos históricos de limpeza, mas somente uma projeção ativa autorizada por conexão.
5. Registrar a intenção e a outbox na transação de criação/alteração, sem chamada HTTP. Intenções devem existir mesmo sem prazo ou com escrita ainda não autorizada; não consumir tentativas repetidamente enquanto aguarda consentimento.
6. Backfill somente dos vínculos e intenções legados conhecidos como Agenda. Não inferir vínculos por título nem exportar linhas antigas sem vínculo.
7. Toda nova tabela de usuário nasce com RLS e testes positivos e negativos. Credenciais permanecem privadas; mutações passam por gateway/RPC validada, autorizada, idempotente e auditável.

### Adaptadores e worker

Adicionar adaptador Tasks com schemas de entrada/saída, tamanho máximo, timeout, limites e erros normalizados. Reutilizar a infraestrutura de OAuth, outbox e agendamento, isolando a projeção Agenda da projeção Tasks. Evitar renomear todos os módulos legados nesta entrega.

Pontos de alteração previstos:

- `supabase/functions/_shared/google-calendar-service.ts`: autorização por capacidade e novas ações versionadas de configuração/status.
- `supabase/functions/_shared/google-calendar-worker.ts`: despacho por provedor e semântica de data/identidade específica de cada um.
- Novo `google-tasks-provider.ts` e testes próprios: listas, criação, leitura para reconciliação, atualização e exclusão.
- `supabase/functions/_shared/google-reading.ts`: aceitar capacidade de leitura por escopo completo e suprimir cópias Tasks exportadas.
- `apps/web/src/lib/google-calendar.ts`, gateways e `GoogleCalendarSettings.tsx`: contratos novos e preferência exclusiva de Ajustes.
- Novas migrations e testes em `supabase/tests`; atualizar o comando de testes de integração para incluir o adaptador Tasks.

Manter lease, controle de concorrência, geração da intenção, backoff com jitter, teto de tentativas e orçamento por conexão/provedor. Validar novamente antes de envio e antes de confirmar resultado. Persistir exatamente a versão enviada, não a versão corrente obtida depois da chamada. Alterações durante o envio geram trabalho de reconciliação posterior.

### Inserções ambíguas e idempotência

A API Tasks não documenta chave de idempotência de inserção nem o mecanismo de ID determinístico usado atualmente para eventos. Não prometer entrega exatamente uma vez baseada apenas no retry.

- Persistir tentativa e marcador opaco antes da chamada; incluir esse marcador nas notas, sem dados pessoais.
- Persistir o ID retornado antes de concluir a outbox. Recuperar por marcador somente dentro da lista gerenciada, com paginação limitada e comparação exata.
- Em timeout após envio ou falha ao persistir o resultado, marcar “Criação a verificar”. Não repetir o POST automaticamente enquanto o resultado for desconhecido.
- Se encontrar um único resultado inequívoco, vincular e retomar. Se houver múltiplos, marcador removido ou coleta incompleta, bloquear recriação e oferecer revisão/reconciliação em Ajustes. Ausência numa leitura isolada não prova que a inserção falhou.
- Aplicar o mesmo cuidado à criação de listas: não criar listas repetidas após timeout e não assumir propriedade por nome igual. Permitir recuperação explícita em Ajustes quando não houver evidência suficiente.
- Validar essa estratégia com testes de falhas antes de liberar o rollout. Recuperação não autoriza excluir tarefas ou listas não vinculadas.

### Leitura e cópias duplicadas no Gabio

Suprimir na leitura as tarefas Tasks que já representem tarefas Gabio por conexão/lista/ID persistidos, como já ocorre com eventos exportados. Não comparar título ou data. Itens externos sem vínculo continuam visíveis para consulta, sem escrita autorizada por essa origem. Invalidar o cache de leitura em memória após confirmação de exportação; falhas de leitura não devem ser apresentadas como lista vazia.

## Sequência de entrega

1. **Contratos e ADR:** fechar a matriz de estados/capacidades e os contratos compatíveis; registrar casos de transição, offline e clientes antigos.
2. **Banco isolado:** migrations aditivas, intenções, RLS, auditoria, outbox e backfill somente de vínculos conhecidos. Testar com dados sintéticos.
3. **Adaptador e worker:** vertical completa Tasks, incluindo tarefas sem prazo, falhas ambíguas, concorrência e limpeza. Manter a escrita externa nova desativada por flag.
4. **OAuth e Ajustes:** autorização explícita, preferência, status separado por capacidade e regressão de Agenda/leitura. Nenhum seletor no cadastro ou edição de tarefas.
5. **Leitura sem duplicação:** suprimir projeções próprias por vínculo e verificar reconexão/troca de conta.
6. **Revisão e validação:** revisão de segurança por agente distinto do implementador, conforme AGENTS.md; corrigir os achados antes da publicação.
7. **Rollout autorizado:** aplicar somente migrations revisadas e publicar backend compatível antes do frontend. Configurar novo escopo após aprovação humana e obter consentimento individual. Ativar o padrão Tasks e o marco de criação de forma coordenada no servidor.
8. **Produção:** verificar versão, HTML, assets e disponibilidade na URL de produção, além da função de integração. Homologar o fluxo real mediante autorização individual, sem copiar dados pessoais para testes ou logs.

Separar a flag de roteamento padrão da flag de execução de escrita. Na ativação do padrão, conexões sem permissão ficam pendentes. Desligar o worker Tasks em emergência pausa os envios e conserva intenções; não redireciona tarefas para Agenda nem desfaz migrations aplicadas.

Deploy, mudanças de permissões e novo escopo OAuth continuam sujeitos à aprovação humana prevista no AGENTS.md. Este pedido de planejamento não executa essas ações. Preparar a entrega concreta e revisável antes de solicitar as aprovações. Manter meta de custo R$ 0, confirmar cotas vigentes, sem habilitar cobrança automática ou novo serviço pago.

## Critérios de aceite e validação

- Criar tarefa nova em uma integração sem escolha explícita registra destino Tasks, com ou sem prazo e por todas as origens suportadas.
- Trocar para Agenda em Ajustes afeta apenas tarefas posteriores. Rascunhos, comandos de tarefa e clientes antigos não sobrescrevem a preferência.
- Integração legada passa a Tasks para novas tarefas, sem duplicar nem mover os eventos anteriores. Não ocorre backfill silencioso.
- Sem autorização de escrita, salvar funciona e a intenção Tasks aguarda consentimento, sem fallback para Agenda.
- Editar, concluir, reabrir e cancelar operam sobre a mesma projeção. Recorrência cria somente a ocorrência prevista pelo domínio.
- Retirar prazo em Tasks limpa a data; horários/fuso e tarefas sem prazo seguem as regras descritas, incluindo criação perto da meia-noite.
- Retry, workers concorrentes, resposta atrasada e timeout depois de criação não produzem novo POST cego; resultados ambíguos ficam identificados.
- Mudanças de privacidade, saída de membro, revogação e troca de conta não permitem novas escritas indevidas. Limpeza pendente permanece visível.
- Leitura Tasks com escopo `tasks` funciona e não duplica tarefas Gabio; leitura somente com `tasks.readonly` não autoriza escrita.
- Executar pgTAP em banco isolado, incluindo RLS positiva/negativa, privilégios, replay, concorrência e regressão de Agenda; testes de adaptadores, OAuth, contratos e frontend; lint, tipos e build proporcionais.
- Validar Ajustes nos quatro viewports e nos critérios de acessibilidade do design system, com dados fictícios.
- Registrar checks efetivamente executados, revisão independente, migrations aplicadas, versão e disponibilidade verificadas em produção. Implementação permanece pendente de produção até completar essas verificações.

## Fontes oficiais consultadas em 2026-11-03

- [Inserção de tarefas e escopo de escrita](https://developers.google.com/workspace/tasks/reference/rest/v1/tasks/insert).
- [Campos de tarefa, estados e limitação de data sem horário](https://developers.google.com/workspace/tasks/reference/rest/v1/tasks).
- [Escopos disponíveis e alcance da autorização](https://developers.google.com/workspace/tasks/auth).
- [Cotas da Google Tasks API](https://developers.google.com/workspace/tasks/limits).
