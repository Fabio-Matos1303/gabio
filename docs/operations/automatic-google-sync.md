# Atualização automática Google

Data: 2026-11-24. Status: código, migration e cliente publicados; fila da conexão autorizada zerada, com Agenda e Tasks sincronizados. A outra conta permanece em reconexão e não bloqueia essa conexão.

Versão pública: `automatic-google-reading-2026.11.24.1`. Commit da implementação: `cbfadfd14f6514617f320ed7ce8e5dc2310afc72`, sobre `4d518a8e18af614066bfad15d2fa53a749ba4559`. Entrega isolada em worktree; alterações locais anteriores preservadas. Publicação, commit e push autorizados pelo usuário nesta conversa.

## Causas e comportamento corrigido

A leitura externa era manual após invalidação, exigindo “Atualizar leitura Google”. Agora a tela refaz a consulta automaticamente após pelo menos 65 segundos desde a tentativa anterior e renova consultas completas a cada 15 minutos enquanto estiver visível e online. Pausar durante carregamento, falta de autorização, reconexão e paginação pendente. Preservar ações manuais e avisos de erro/consentimento. Conteúdo externo continua somente em memória.

O agendador estava ativo a cada dois minutos, mas uma barreira de limpeza cruzava conexões pelo ID da tarefa. A conta que exigia reconexão bloqueava os envios autorizados da outra. A migration incremental `202611240001_google_sync_connection_isolation.sql` limita a barreira à mesma conexão. Trocas de provedor/categoria nessa conta ainda exigem remoção confirmada da cópia anterior. Elegibilidade, visibilidade, membership, escopos, leases e limites permanecem preservados. Ver ADR-017.

Tasks recebe o estado concluído; Agenda mantém o evento com marca no título. Não há conclusão nativa de tarefa em evento Calendar. O worker processa no máximo dois jobs por chamada e um por conexão; filas acumuladas exigem ciclos adicionais. Não houve alteração na frequência ou nas credenciais do agendador.

## Validação

- `pnpm verify` completo na release isolada: formatação, lint, tipos, 57 testes dos pacotes, 114 web, 57 Google e build PWA aprovados. Permanece aviso de bundle acima de 500 kB.
- Banco QA novo no servidor local, sem conteúdo pessoal, usando somente schema auth e identidades sintéticas: todas as migrations e 365 asserções pgTAP aprovadas, incluindo 18 novas sobre isolamento, conclusão nos dois provedores, consentimento/flag, limpeza dentro da mesma conta, privacidade e privilégios.
- Revisão independente de segurança aprovada. O revisor confirmou que a única mudança efetiva na função é o join por connection_id e executou independentemente as 18 novas asserções, todas aprovadas.
- Prévia sintética nos viewports 360×800, 768×1024, 1366×768 e 1920×1080: sem overflow horizontal da página; conteúdo, seções e navegação preservados. Botão Mais ações com 44×44 px no mobile; diálogo de leitura e retorno ao quadro exercitados. Conferidos fundo creme, superfícies existentes e ausência do alerta manual antigo.
- Não foram feitos nova medição numérica de contraste, auditoria com leitor de tela, fallback sem blur, ampliação de texto, aparelho físico ou teste automatizado de tarefas reais.

## Produção

O diagnóstico por metadados, após login realizado pelo usuário no Dashboard, encontrou cron ativo, 720 execuções em 24 horas e 30 respostas HTTP 200 na hora observada com zero processamentos. Havia 52 pendências. Nenhuma conexão possuía escopo de escrita Tasks; uma exigia reconexão. A barreira cruzada bloqueava 14 atualizações Calendar e 11 Tasks da conexão ativa. Nenhum conteúdo de tarefa, token ou valor Vault foi consultado.

A fonte remota anterior foi conferida por MD5 de prosrc: `5af61c6c5a520e35382f5d4fd6c6143e`, idêntica à base revisada. A primeira tentativa de aplicação pelo editor foi revertida pelo guard de fonte nova; nada foi confirmado nessa transação. A aplicação final substituiu exclusivamente o join na definição canônica existente, em transação com guards antes/depois, e registrou a migration no histórico. Fonte final conferida: `2db63305a6104121208a89c18cb76d4b`, idêntica à migration testada. O histórico contém a definição canônica aplicada; PostgREST recebeu reload schema.

Verificados após aplicação: migration registrada, RLS ativo em tarefas/conexões/vínculos, execução do claim negada a anon/authenticated e permitida a service_role. No primeiro ciclo automático observado, um envio foi concluído e as pendências Calendar da conexão ativa caíram de 14 para 13. Isso confirma retomada do worker; não significa que toda a fila já foi concluída.

URL verificada: https://gabio.fabiosmo123.workers.dev. Version.json confirmou a versão acima. HTML, JavaScript, CSS, manifesto, service worker e registro responderam HTTP 200. JavaScript `/assets/index-PzlCe9YV.js` contém a mensagem de leitura automática e não contém “Atualizar leitura Google”; CSS `/assets/index-BkfgpY77.css` preservado. Quatro checks do commit passaram: Workers Builds, Supabase Preview, application e database-security.

A regra permanente de commit/push foi incluída no AGENTS.md. Este registro final é enviado em commit posterior à implementação, conforme a regra.

## Consentimento e operação

Cada pessoa conclui Ajustes → Integrações → Google → Autorizar Google Tarefas. A conta em reconexão deve refazer o próprio consentimento. Nenhuma pessoa pode autorizar a outra pelo Gabio. Após a publicação, o usuário autorizou Tasks e a consulta de metadados confirmou uma conexão ativa com escopo de escrita. A outra permanece em reconexão e sem escopo Tasks. Não houve mudança de escopos no Console Google nem concessão de permissão por esta automação.

## Recuperação limitada do acúmulo

A reautorização enfileirou 57 operações na conexão ativa: 30 limpezas Tasks, 11 upserts Tasks e 16 upserts Calendar. Foi preparado e enviado o script `supabase/schedules/google_sync_catchup.sql` no commit `029a2ac`, com revisão independente de segurança aprovada. O job temporário usa o mesmo worker e nomes Vault, a cada cinco segundos, por no máximo quinze minutos. O prazo absoluto é embutido no agendamento e conferido antes de cada POST. Sem trabalho disponível na conexão ativa ou ao expirar, o job remove a si próprio; o cron normal de dois minutos é preservado.

Leases, orçamento diário e regras de consentimento/retry permanecem soberanos. Jobs terminais não são reabertos e inserções ambíguas não são repetidas. O prazo impede novos despachos, mas requisições em voo podem terminar depois. Encerramento também pode deixar trabalhos futuros ou de contas em reconexão, que não devem ser contados como recuperados.

Resultado confirmado às 08:50 de 2026-11-24, America/Bahia: nenhuma operação pendente na conexão ativa; 16 projeções Calendar e 11 Tasks com estado synced e sem error_code. As 31 limpezas Tasks observadas no intervalo terminaram com estado deleted. O job temporário executou 54 vezes com sucesso e removeu a si próprio. O único job Google restante é o normal, ativo em `*/2 * * * *`. Foram observadas 58 operações processadas no intervalo completo de diagnóstico; esses contadores são operacionais e não representam quantidade de novas tarefas criadas.

Não foram criadas tarefas reais para testes nem lido seu conteúdo. A verificação de produção usou estados/contagens do worker e a autorização realizada pelo próprio usuário. A outra conexão ainda possui pendências de reconexão e não foi alterada. Os bancos descartáveis de QA foram removidos após os testes, preservando o banco operacional local.

A preferência de destino vale para novas tarefas; vínculos antigos de Agenda permanecem na Agenda. Uma conta pode sincronizar enquanto outra aguarda limpeza/reconexão; remoção de cópias na conta desconectada não é instantânea. Não retentar POSTs ambíguos nem migrar histórico automaticamente. `scripts/operations/inspect-google-sync.sql` permite repetir diagnóstico por metadados sem revelar conteúdo ou credenciais. O agregado HTTP inclui outras integrações do projeto e não comprova sozinho sucesso do worker Google.
