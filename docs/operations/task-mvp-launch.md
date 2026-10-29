# Lançamento do MVP de tarefas

Escopo aprovado em 2026-10-29: PWA online para duas pessoas, com login,
residência, tarefas e ajustes. Uma conexão com a internet é requisito de uso.
Funcionamento offline não é critério de lançamento.

## Funcionalidades implementadas localmente

- Criação e edição de título, prazo, responsável, recorrência e visibilidade.
- Quadro A fazer, Em andamento e Concluídas; conclusão direta e reabertura.
- Command Gateway com controle de versão, idempotência e auditoria.
- Navegação reduzida a Tarefas e Ajustes por padrão.
- Ícones PNG de 192/512 pixels e ícone adaptativo.
- PWA inicia em /#tarefas; navegação considera área segura inferior.

## Trabalho necessário antes da homologação

1. Validar online login, recuperação de senha, convite e acesso das duas pessoas.
2. Validar criação, edição, conclusão, reabertura e próxima ocorrência recorrente.
3. Validar isolamento de tarefas privadas e acesso compartilhado entre as contas.
4. Validar concorrência entre dois dispositivos e apresentação de erros de rede.
5. Validar formulários, teclado, áreas de toque e quadro em viewport mobile.
6. Validar instalação, ícone, janela standalone e atualização da PWA.
7. Conferir migrations incrementais de in_progress no ambiente de destino.
8. Consolidar commits e preparar publicação revisável.

## Retirado do caminho crítico

- Bootstrap de sessão/residência sem rede.
- Reabertura totalmente offline e sincronização em segundo plano.
- Novas melhorias de cache e projeção offline.

A fila e o cache já implementados permanecem preservados. Uma pendência local
não deve ser apresentada como confirmação do servidor. Respostas perdidas ainda
exigem replay idempotente para proteger operações online contra duplicação.

## Homologação humana

Após a versão de homologação estar disponível, enviar ao usuário a URL, o
identificador da versão e o roteiro abaixo. Não solicitar testes de versões ainda
não publicadas ou declarar testes de dispositivo sem execução real.

Em Chrome Android com internet:

- Instalar a PWA e conferir ícone e abertura em janela própria.
- Entrar com cada conta e conferir acesso à mesma residência.
- Criar e editar tarefa, incluindo responsável e prazo.
- Iniciar, concluir diretamente e reabrir uma tarefa não recorrente.
- Concluir tarefa recorrente e conferir uma única próxima ocorrência.
- Conferir tarefa compartilhada e isolamento de tarefa privada.
- Fechar e reabrir o aplicativo online e conferir persistência dos dados.
- Conferir atualização da PWA sem perder tarefas confirmadas.

Critério de aceite: fluxos online aprovados, sem bloqueios relevantes de segurança,
checks técnicos aprovados e instalação Android homologada.

A publicação e migrations em produção exigem aprovação conforme AGENTS.md.

## Atualização online em 2026-10-29

A tela permite atualizar manualmente e consulta o servidor a cada 30 segundos
enquanto visível, além de consultar ao retornar à tela. Formulários não são
remontados nessas consultas. Não há garantia de atualização instantânea.
O envio bloqueia ações concorrentes; confirmação e falha de consulta posterior
são apresentadas separadamente. Atualização manual também reenvia pendências
com o mesmo commandId, preservando idempotência.

## Validação da versão tasks-mvp-2026.10.29.1

- 36 testes do frontend e 36 dos pacotes aprovados em cópia isolada no disco Linux.
- 71 testes PostgreSQL de autenticação, tarefas, recorrência e privilégios aprovados.
- Revisão visual em Chrome com viewport de 320, 390, 768 e 1280 pixels, usando somente dados sintéticos.
- Editor mobile ajustado para campos de pelo menos 44 pixels.
- Teste de regressão StrictMode aprovado; referência de contexto é restaurada no setup do efeito.
- URLs de autenticação e recuperação e preflight CORS de convite conferidos em produção.
- Supabase retomado após status INACTIVE; histórico remoto estava aplicado até M3.
- Migrations 202609270001 e 202609270002 de tarefas aplicadas em produção.
- Endurecimento adicional de execução anônima preparado em 202610290001 e testado localmente; aplicação remota depende de aprovação humana.
- A migration 202609270003 e a função Telegram ficam fora desta publicação.

A inspeção de viewport não substitui o teste de instalação, toque e teclado no
Android físico. Após publicação, conferir /version.json e a versão em Ajustes.

## Publicação e recuperação

O manifesto scripts/task-release-files.json lista os arquivos permitidos para o
commit de lançamento. Não usar git add . ou db push indiscriminado: existem
arquivos M5 ainda em desenvolvimento no diretório local.

Cloudflare: build pnpm build:production; deploy npx wrangler deploy; raiz do
repositório. A configuração wrangler.jsonc serve apps/web/dist como SPA.
Variáveis públicas: VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY do projeto remoto;
VITE_TASKS_MVP=true (também é o padrão). Nunca fornecer service_role no frontend.

Em caso de regressão do frontend, retornar o deploy Cloudflare à versão anterior.
As migrations de tarefas são incrementais e compatíveis com o cliente anterior;
não remover o enum nem reescrever histórico para reverter a interface.
