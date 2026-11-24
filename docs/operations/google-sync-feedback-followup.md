# Aviso de leitura e conclusão no Google

Data: 2026-11-24. Status: correção da leitura publicada e verificada; diagnóstico das conclusões em produção pendente de acesso operacional e esclarecimento da visualização afetada. Versão pública: `automatic-google-reading-2026.11.24.2`. Publicação coberta pela autorização da correção Google nesta conversa.

O print do usuário mostra rate_limited na leitura, apresentado como “Google precisa de atenção”. Um teste de integração reproduziu duas consultas no primeiro disparo automático: o efeito que iniciava a leitura atualizava a referência, mas o hook de timer recebia o número anterior capturado durante renderização. A segunda consulta atingia o limite de sessenta segundos do servidor.

O hook agora lê a referência atual, elimina a duplicação, faz uma retomada após 65 segundos no primeiro bloqueio e volta a quinze minutos se o limite persistir. Esse estado não apresenta alerta de atenção e impede solicitações manuais repetidas. Continuação bloqueada é retomada automaticamente com o cursor da tentativa e mantém os itens acumulados. Connected com páginas pendentes continua usando paginação manual. Nenhum novo schema, escopo, armazenamento ou limite de servidor.

Dois testes de integração cobrem: primeiro bloqueio, segunda recusa e fallback, ausência de alerta, controles desabilitados/reativados e retomada do cursor. Revisão independente aprovou e executou 16 testes de TaskViews/hook, todos aprovados. O teste inicial falhou por requisição duplicada e passou após a correção da referência.

Conclusões Gabio continuam enfileiradas na transação e enviadas pelo worker de dois minutos, não por requisição imediata em cada clique. Tasks recebe status completed; projeção Calendar usa prefixo Concluída/Concluído, sem checkbox nativo. Isso descreve o código, não comprova o estado de uma cópia específica no Google. O usuário informou concluídas ainda pendentes; diagnóstico agregado de status/versionamento em produção permanece em andamento. Não usar conteúdo pessoal ou dados reais em testes.

Esta correção de aviso não deve ser apresentada como prova de correção da conclusão no Google. A primeira tentativa de diagnóstico pelo Dashboard foi interrompida por geometria indisponível da janela; solicitado ao usuário restaurar a janela. Nenhum comando SQL desse diagnóstico foi executado até esse ponto.

Validação local: `pnpm verify` aprovado com formatação, lint, tipos, 57 testes dos pacotes, 116 web, 57 Google e build PWA. Em seguida foram adicionados dois testes do worker com dados sintéticos: conclusão e reabertura atualizam a mesma identidade remota, enviam o estado esperado e confirmam a versão exata em Calendar e Tasks. A suíte Google final passou com 59 testes. Nenhum código de backend foi alterado nesta etapa.

Prévia sintética do estado rate_limited nos quatro viewports 360×800, 768×1024, 1366×768 e 1920×1080: sem overflow horizontal; aviso de atenção ausente, mensagem automática legível, botão desabilitado e foco retornando a Mais ações ao fechar. Mantidos fundo creme, seções, navegação e CSS existente. Não foram refeitos contraste numérico, leitor de tela, fallback sem blur ou validação em aparelho físico. O modo sintético de cooldown foi temporário e não integra a publicação.

## Publicação verificada

Commit `4e9154f510497d76b0ef8fea00676a59971070ac` enviado para main. A URL https://gabio.fabiosmo123.workers.dev/version.json confirmou a versão .2. HTML, manifesto, versão, JavaScript, CSS, service worker e registro responderam HTTP 200. Assets `/assets/index-BmHeAGpS.js` e `/assets/index-BkfgpY77.css`. Quatro checks aprovados: Workers Builds, Supabase Preview, application e database-security. Nenhuma função Edge, migration, credencial ou agendamento foi alterado nesta publicação.

O registro final e o diagnóstico `scripts/operations/inspect-google-completion.sql` seguem em commit posterior. A revisão independente aprovou esse SQL por somente leitura e reexecutou os 59 testes Google. O diagnóstico agrupa versões/estados das concluídas, fila e orçamento de leitura, sem conteúdo ou credenciais; ainda não foi executado no ambiente de produção. Mesmo synced_version igual à versão local demonstra confirmação do envio pelo worker, sem garantir ausência de edição externa posterior.

O usuário foi informado do bloqueio da janela (geometria indisponível após uma tentativa de recuperação) e recebeu perguntas para restaurá-la e esclarecer se as pendências aparecem no Google Agenda, no calendário Gabio ou em ambos. Essa parte da demanda permanece aberta. Não concluir que os itens relatados estão atualizados apenas porque os testes sintéticos passaram.
