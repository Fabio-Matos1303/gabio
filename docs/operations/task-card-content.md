# Cartões com observações e checklists

Data: 2026-11-24.

**Status em 2026-11-25: banco publicado e verificado; cliente em preparação para
publicação.** O usuário autorizou continuar a entrega em produção nesta data.
Commit/push do cliente e a verificação da versão pública permanecem em andamento.

## Escopo implementado

- Cartão com título editável, propriedades compactas e salvamento por seção sem
  fechar o diálogo. Prazo, tipo do item e recorrência compartilham agendamento.
- Observações em texto simples, até 10.000 unidades UTF-16, sem interpretação HTML.
- Até 20 checklists por cartão, cada uma com até 100 itens. Edição de nome e texto,
  marcação, remoção e ordenação por botões acessíveis. Exclusão de lista confirmada.
- Progresso resumido no quadro; confirmação de conclusão com itens pendentes.
- Recorrência copia texto e listas ativas para a próxima ocorrência, com novos
  identificadores e itens desmarcados. Não conclui a tarefa automaticamente.
- Conteúdo herda acesso do cartão. Mudança de privado para compartilhado avisa
  sobre o conteúdo interno; concluídas/canceladas permanecem somente consulta.
- Versões capturadas ao abrir cada editor, comandos idempotentes, fila persistida
  por usuário/residência e coordenação com a fila de propriedades/conclusão.
- Leitura de detalhes separada do resumo e sem armazenar detalhes em snapshots.
  Exportações Google não recebem observações/checklists.

Comentários, atividade visível, anexos, prioridade, modelos e subtarefas
independentes não fazem parte desta primeira entrega.

Decisões e limites: [ADR-018](../architecture/decisions/018-task-card-content.md).

## Banco e segurança

Migration incremental de produção: `20261125105946_task_card_content.sql`.
Ela consolida integralmente os corpos das migrations de desenvolvimento
`202611240002_task_card_content.sql` e
`202611240003_harden_card_checklist_identity.sql`, preservadas no workspace
original de QA. Os delimitadores transacionais internos foram removidos: a
publicação tem apenas um BEGIN/COMMIT, sem exposição do gateway intermediário.
O nome do arquivo foi alinhado ao timestamp retornado pelo Supabase, sem alterar
o conteúdo SQL aplicado. Nenhuma migration previamente publicada foi modificada.
O checkout das migrations exige LF em `.gitattributes`, preservando também no
Windows os hashes de fonte conferidos pelos guards.

SHA-256 revisado e aplicado:
`b2326df5750f47fc35ad6a4375ffb0622ebce50a58ee2f4ca07f7bb0f516acfb`.

O SQL foi aplicado pela integração Supabase após teste exato em banco limpo e
revisão independente. Guards de baseline precedem o DDL; hash e configuração de
segurança final são conferidos antes do commit. Confirmados em produção: quatro
tabelas com RLS, gateway final com MD5
`7855c012b0e11e0f02ef9a6cf0b3e3ff`, leitores v3/detalhes presentes, escrita direta
negada, recibos inacessíveis e execução do trigger negada ao cliente. Gateway
permitido a authenticated e negado a anon. Nenhum conteúdo pessoal foi consultado
ou usado nos testes. Clientes antigos mantêm listagens e recibos legados.

A revisão de segurança foi feita por agente distinto da implementação. Foram
corrigidos sobrescrita após atualização remota, persistência de conteúdo após
perda de acesso confirmada, conclusão antes de sincronizar conteúdo e divergência
de whitespace/limites de texto. A proteção adicional de colisões de IDs passou por
nova revisão e teste concorrente real. Não restaram achados concretos abertos no
escopo revisado.

## Checks executados

| Check                                                   | Resultado                                                                                                                                     |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm test`                                             | 185 testes aprovados: 31 contratos, 24 domínio, 5 roteador e 125 web                                                                          |
| `pnpm test:calendar`                                    | 59 testes aprovados                                                                                                                           |
| `pnpm typecheck`                                        | Aprovado                                                                                                                                      |
| `pnpm build`                                            | Aprovado; aviso de bundle acima de 500 kB permanece                                                                                           |
| ESLint em `apps`, `packages` e scripts desta entrega    | Aprovado                                                                                                                                      |
| Prettier nos arquivos da entrega                        | Aprovado                                                                                                                                      |
| 16 arquivos SQL de teste em PostgreSQL Supabase isolado | 423 asserções aprovadas, incluindo 46 cenários novos                                                                                          |
| Concorrência real em duas conexões                      | Colisão de UUID entre residências: um sucesso e um conflito, sem troca de proprietário; notas simultâneas: um sucesso e um conflito de versão |
| Chromium com gateway sintético                          | Fluxos aprovados nos quatro viewports                                                                                                         |

O comando global `pnpm lint` encontra cópias antigas de configuração dentro de
`test-results` e falha ao determinar `tsconfigRootDir`. A verificação proporcional
foi executada sobre os fontes e scripts, sem alterar configurações alheias.

O startup completo do Supabase local falhou no estado local disponível. Para os
testes SQL foi criado um container exclusivo `gabio-card-test-db`, com a imagem
Supabase PostgreSQL `17.6.1.167`, todas as migrations aplicadas e somente fixtures
sintéticas. O schema Auth inicial da imagem recebeu a coluna de compatibilidade
`email_confirmed_at`, necessária às fixtures existentes. Testes usaram mudança
real para a role `authenticated`; não houve consulta a dados de produção.

## UI e acessibilidade

Validação começou em **360 × 800**, seguindo para **768 × 1024**, **1366 × 768** e
**1920 × 1080**. Capturas dos quatro tamanhos foram inspecionadas. O desktop usa
coluna lateral; no mobile as propriedades precedem o conteúdo. Texto ampliado em
200% adapta as propriedades para uma coluna, sem rolagem horizontal.

Nos quatro viewports foram testados: observações, marcação, criação e ordenação
de itens, salvamento de título mantendo diálogo aberto, progresso no quadro,
cancelamento da conclusão com pendências, contenção de foco por teclado,
movimento reduzido e fallback sem blur. O diálogo permaneceu dentro do viewport,
com conteúdo rolável e sem sobreposição da ilha às ações. Controles têm altura
mínima de 44 px; foco visível e rótulos funcionais foram preservados.

Axe Core executado no diálogo com regras WCAG A/AA/2.1 AA não detectou violações.
Alguns casos de contraste sobre vidro ficaram como verificação incompleta do
motor. A medição complementar usou cores de texto computadas e pixels de fundo
nas capturas de oito tipos de texto por viewport: 32 amostras, todas acima de
4,5:1 (mínimo 4,75:1). Essa amostragem não é certificação de todos os estados e
combinações de conteúdo. Não houve teste com leitor de tela humano, dispositivo
Android físico ou fluxo integrado entre navegador e a API Supabase real.

Artefatos locais, ignorados pelo Git:

- `test-results/task-card-content/report.json`;
- `test-results/task-card-content/360x800.png` e demais viewports;
- capturas `*-fallback.png` e `360-text-200.png`.

Reprodução: executar a prévia sintética com
`node apps/web/node_modules/vite/bin/vite.js --config apps/web/vite.preview.config.ts`
e `node scripts/qa-task-card.cjs`. O script aceita os caminhos de módulos de QA em
`GABIO_PLAYWRIGHT_MODULE`, `GABIO_AXE_MODULE` e `GABIO_PNG_MODULE`. Na validação,
Playwright 1.56.1, Axe Core 4.10.3 e PNGJS 7.0.0 foram instalados somente no
diretório temporário, sem modificar dependências do produto. O teste concorrente
está em `scripts/test-task-card-concurrency.cjs` e usa exclusivamente o container
de testes nomeado.

## Preparação da publicação em 2026-11-25

- Remoto atualizado por HTTPS, sem alterar a configuração SSH nem desabilitar
  verificação de chaves. Base: `a8323d5ede578cf9c2f28cf4d5b1296cba12ba1c`.
- Release em worktree isolada `Gabio-card-release`, branch
  `codex/task-card-content`. Alterações locais preexistentes preservadas.
- `pnpm verify` completo aprovado nessa cópia: formatação, lint, tipos, 185 testes
  da aplicação, 59 Google e build PWA. Aviso de bundle acima de 500 kB permanece.
- O checkout Windows foi normalizado localmente para LF, sem mudanças de conteúdo
  nos arquivos alheios. Um documento histórico (`m2-tasks.md`) estava codificado em
  Windows-1252; sua codificação foi corrigida para UTF-8 para atender o check global
  de formatação, preservando o texto e recuperando os acentos.
- A migration consolidada exata passou em um segundo container limpo,
  `gabio-card-bundle-qa`: 15 suítes SQL/411 asserções. A diferença para o QA anterior
  é a ausência da suíte M5 não publicada no remoto atual; ela não foi incluída na
  entrega. Teste concorrente também aprovado na release.
- QA Chromium da release isolada aprovado nos quatro viewports, incluindo
  teclado, texto ampliado, fallback e medição de contraste. Relatórios em
  `test-results/task-card-content` dessa worktree.
- Versão preparada: `task-card-content-2026.11.25.1`.

A publicação do cliente, a disponibilidade na URL de produção e o registro final
com commit/push ainda precisam ser confirmados antes de considerar a entrega
concluída.
