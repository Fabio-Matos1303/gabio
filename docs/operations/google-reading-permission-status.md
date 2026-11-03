# Estado da autorização de leitura Google

Versão: `google-reading-status-2026.11.03.1`. Base: `d2d4bcb7fe7e87964c5c63e9cd066e2064613c07`. Publicação, migration e atualização da função autorizadas pelo usuário em 2026-11-03.

## Comportamento

A seção Ver no Gabio mostra o estado retornado pelo servidor: Leitura autorizada, Leitura não autorizada, Reconectar para ler, Desconexão em andamento ou Leitura indisponível. Falha de consulta é Não foi possível verificar a leitura; não inferir permissões a partir de Conectado ou da caixa de consentimento.

O action reading_status retorna apenas um enum e consulta o RPC service-only gc_read_permission_status. A função considera membership, status da conexão, conjunto completo dos três escopos e existência de credencial. Não retorna tokens, escopos brutos, tarefas, eventos, geração ou identificadores. Não faz chamadas ao Google, nem consome leases ou cotas de leitura. Reflete as permissões registradas na última autorização; revogação externa ainda não detectada depende das consultas normais do Google para marcar reconnect.

Endpoint separado mantém o status antigo sem campos novos, preservando clientes antigos com schema estrito. Método opcional no gateway e validação de schema permitem mostrar indisponibilidade durante publicação parcial, sem apresentar uma falsa ausência de autorização.

A caixa de consentimento fica somente no diálogo de nova autorização, não representa a permissão persistida. Gerenciar leitura e fechar o diálogo não revogam o acesso. Preparar um link não altera o estado para autorizado; o status é recarregado após a conclusão OAuth autenticada. O link fica no diálogo, sem perder acesso atrás do modal.

A reconexão de leitura mantém os grupos e o lembrete já salvos; rascunhos de exportação não são aplicados. Uma conexão nova usa casa/sem privadas/sem lembrete, apresentados no diálogo antes da autorização. Avisos de privacidade e perda de tags continuam visíveis no diálogo.

## Validação

- 15 checks pgTAP passaram em banco isolado sem dados reais: privilégios, ausência de conexão, grant parcial, falta de credencial, autorização completa, membros da mesma casa, outsider, estados de reconexão/limpeza/desconexão e remoção de membership. Confirmados ausência de conteúdo sensível e de consumo do orçamento/lease.
- Composição isolada da versão candidata: 94 testes web e 45 testes Google passaram, além de lint, tipos do cliente/serviço e build PWA. Build mantém aviso de chunk maior que 500 kB.
- Revisor distinto executou 36 testes Edge e revisou novo RPC, grants, autenticação, saída e compatibilidade. Corrigido consentimento que carregava preferências de exportação ainda não salvas; revisão posterior sem bloqueadores. Revisor não repetiu testes após esse ajuste.
- Na prévia fictícia, confirmado status autorizado após recarga, ausência de checkbox visível fora do modal e preservação do status ao marcar e cancelar nova autorização. Modal contido no viewport e sem rolagem horizontal em 360 × 800, 768 × 1025, 1366 × 767 e 1920 × 1080 CSS px. Escala do host gerou diferença de 1 px na altura de tablet/notebook em relação às metas. Preservados materiais, cores, botões e diálogo do design system; sem nova biblioteca visual. Evidência: test-results/google-reading-status-final.png. Não foi realizado novo consentimento OAuth com conta real.

## Publicação

Migration 202611030001 aplicada com histórico conferido e privilégios verificados: service_role permitido, authenticated/anon negados. Função google-calendar publicada, versão 7 ACTIVE. Consulta reading_status anônima retornou HTTP 401 e Cache-Control: no-store. Cliente segue para publicação e verificação pública.

1. Aplicar somente 202611030001_google_reading_permission_status.sql e registrar histórico com SQL exato, em transação. A função é restrita ao service_role; authenticated e anon sem execução direta. Não há tabela nova nem alteração de RLS.
2. Publicar google-calendar com o novo handler antes do cliente. Manter flags, permissões e escopos atuais.
3. Publicar o cliente e verificar a versão, HTML e assets na URL de produção. Testar que reading_status anônimo continua retornando 401.
4. Nenhum novo escopo OAuth, custo, consentimento automático ou leitura de dados reais faz parte desta revisão.
