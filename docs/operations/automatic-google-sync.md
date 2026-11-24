# Atualização automática Google

Data: 2026-11-24. Status: publicação, commit e push autorizados; verificações de produção em andamento.

Versão candidata: `automatic-google-reading-2026.11.24.1`. Base remota: `4d518a8e18af614066bfad15d2fa53a749ba4559`. Entrega composta em worktree isolada, preservando alterações anteriores do workspace.

## Diagnóstico confirmado no código

- A leitura externa era manual após invalidação, exibindo “Atualizar leitura Google”.
- A conclusão Gabio já gera projeção: Tasks atualiza status; Agenda mantém histórico com marca no título. Não existe conclusão nativa de tarefa em evento Calendar.
- O agendador versionado chama o worker a cada dois minutos; o worker processa até dois jobs por chamada. Não foi verificada sua execução no ambiente de produção nesta demanda. Fila acumulada pode exigir vários ciclos.
- Tasks exige consentimento pessoal de escrita e preferência para novas tarefas. Vínculos antigos de Agenda permanecem no destino original. A entrega anterior registrou consentimento individual e conferência do Console Google como pendentes; isso não comprova o estado atual de uma conta.

## Correção preparada

Leitura automática após invalidação, com cooldown de 65 segundos, e atualização de consultas completas a cada 15 minutos com tela visível e conexão. Pausar durante carregamento, falta de autorização, reconexão e paginação pendente. Preservar ações manuais e avisos de erro/consentimento. Nenhum dado externo novo é persistido. Ver ADR-017.

## Validação executada

- Suíte web: 113 testes aprovados. Depois foi adicionado um teste de retorno da conexão; os cinco testes do hook passaram em execução específica.
- Typecheck web e ESLint dos quatro arquivos TypeScript alterados aprovados.
- Prettier dos arquivos frontend e ADR aprovado.
- Build PWA aprovado; permanece aviso de bundle acima de 500 kB.
- Revisão independente de segurança do hook e integração: sem bloqueadores; revisão estática.

Não foram executados banco, consulta operacional SQL, testes com Google real, homologação de consentimento, validação visual nos quatro viewports nem publicação. Nenhuma migration ou segredo foi alterado. Alterações locais anteriores foram preservadas.

## Próxima etapa operacional

Executar `scripts/operations/inspect-google-sync.sql` com acesso de operador: somente metadados e contagens, sem conteúdo pessoal ou credenciais. Confirmar cron ativo, presença dos dois secrets por nome, execuções e respostas HTTP. Sucesso no cron significa despacho, não sucesso da função. O agregado HTTP inclui respostas de outras integrações do projeto e não é prova isolada do worker Google. Conferir pendências/erros por provedor, destino padrão, escopo e roteamento.

Tratar causa encontrada antes de declarar envio corrigido. Não retentar inserções Tasks ambíguas cegamente, não migrar vínculos históricos e não modificar consentimentos de outras pessoas. Consentimento deve ser concluído pela própria pessoa em Ajustes > Integrações > Google > Autorizar Google Tarefas.

Publicação exige autorização conforme AGENTS.md. Com autorização, compor release isolada preservando outras alterações, verificar checks, publicar e confirmar versão e disponibilidade na URL de produção. A entrega permanece pendente até essa verificação.

## Diagnóstico autenticado e validação da candidata

Consultas por metadados no Dashboard, após login realizado pelo usuário: cron ativo a cada dois minutos, 720 execuções com sucesso em 24 horas e 30 respostas HTTP 200 na hora observada, todas com zero jobs processados. Fila com 52 pendências; nenhuma das duas conexões possui escrita Tasks e uma exige reconexão. Não foram consultados conteúdo de tarefas, tokens ou valores de Vault.

Confirmada barreira entre contas: 14 atualizações Calendar e 11 Tasks da conexão ativa aguardavam exclusões na outra conexão em reconexão. A migration incremental limita o join da barreira à mesma conexão, sem outras mudanças na função e sem alterar migrations anteriores. A autorização de publicação e ajuste do agendador foi concedida nesta conversa em 2026-11-24; a correção não exige nova permissão OAuth.

Na release isolada, `pnpm verify` aprovado: formatação, lint, tipos, 57 testes dos pacotes, 114 web, 57 Google e build PWA. Banco QA novo no servidor local, com somente schema auth e identidades sintéticas: todas as migrations e 365 checks pgTAP aprovados, incluindo 18 novos de isolamento da fila. As tentativas iniciais de montagem da infraestrutura QA exigiram reproduzir os privilégios padrão do Supabase; nenhum banco operacional foi alterado. Foram corrigidas duas asserções novas para reconhecer que o payload Calendar legado omite o campo provider.

A regra permanente de commit/push está incluída no AGENTS.md: publicar o commit enviado e enviar também o registro final. Revisão de segurança independente do frontend aprovada; revisão da migration concreta e execução de produção serão registradas abaixo.
