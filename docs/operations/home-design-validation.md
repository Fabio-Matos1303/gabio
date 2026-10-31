# Verificação do redesign da tela inicial

- Data: 2026-10-31.
- Status: implementação local validada; publicação autorizada em 2026-10-31 e em andamento.
- Escopo: hub Início, cabeçalho compartilhado, ilha inferior e estilos compartilhados do design system.
- Método: mobile first, com dados fictícios e gateway sintético da prévia local. Nenhuma conexão com dados de produção foi usada.

## Implementação

- Tokens de cores, superfícies de vidro, espaçamento, cantos e fallback opaco centralizados em `styles.css`.
- Título Início e data, sem introdução promocional; resumos de tarefas e finanças e agenda mensal preservados.
- Seções com superfície leitosa, borda clara e sombra discreta; listas internas sem cards de vidro aninhados.
- Ilha compartilhada com ícones SVG locais, rótulos visíveis, `aria-current` e seleção suave. O MVP continua com Tarefas e Ajustes.
- Indicadores e agenda ocultam resultados durante carregamento ou falha. Histórico financeiro sem movimentação usa mensagem de vazio.

## Validação executada

- Typecheck do frontend aprovado.
- Build do frontend aprovado, incluindo a geração do service worker. Houve aviso de bundle acima de 500 kB, sem falha de build; divisão de módulos não faz parte deste redesign.
- Suíte do frontend: 65 testes aprovados, incluindo os dois novos cenários de carregamento/falha. A suíte emitiu avisos do jsdom sobre `window.scrollTo`, sem falhas de teste.
- Após os ajustes finais, os 38 testes de `App.test.tsx` e `HomeFeedback.test.tsx` foram reexecutados e aprovados, incluindo preservação do MVP sem consultas financeiras/de agenda e estado acessível da aba ativa.
- Formatação dos arquivos da implementação aprovada pelo Prettier.
- Lint aprovado com `pnpm exec eslint . --ignore-pattern "test-results/**"`. A primeira execução de `pnpm lint` incluiu scripts e perfis locais de navegador de `test-results` e falhou nesses artefatos; a configuração do lint não foi alterada para esta entrega.
- Revisão estática independente de segurança sem achados bloqueantes no redesign; não substitui testes de RLS ou autenticação.
- Chromium headless isolado: 360 × 800, 768 × 1024, 1366 × 768 e 1920 × 1080, com inspeção das capturas. Sem rolagem horizontal; calendário com sete colunas e coluna mínima de 44,28 px em 360 px; destinos da ilha com pelo menos 44 × 44 px.
- Última linha da agenda acessível acima da ilha ao rolar até o fim; navegação entre meses, retorno a Hoje e seleção de aba verificados.
- Texto ampliado para 200% sem rolagem horizontal: indicadores se reorganizam e ilha pode ocupar duas linhas, com reserva de espaço suficiente no fim do conteúdo.
- Foco visível por teclado verificado (outline sólido de 2 px) e fallback opaco verificado com preferência de transparência reduzida emulada.
- Contraste calculado dos tokens sobre a superfície de vidro composta com o fundo creme: texto principal 12,86:1, texto secundário 6,27:1 e texto da seleção 10,59:1. Essa verificação não equivale a uma auditoria completa de acessibilidade.
- Evidências locais em `test-results/home-360.png`, `home-768.png`, `home-1366.png`, `home-1920.png`, `home-calendar-360.png`, `home-text-200.png` e `home-layout.json`. Esses artefatos são locais e ignorados pelo Git.
- Prévia sintética disponível no processo local em `http://127.0.0.1:5182/#inicio`, com resposta HTTP 200 verificada pelo Windows. A disponibilidade depende de manter o servidor local em execução.

## Pendências e limites

- Não foi executada homologação em aparelho físico, Safari/iOS, leitor de tela ou instalação da PWA.
- Não foram executados testes de banco/RLS nesta alteração de apresentação. Gateways, contratos e permissões não foram alterados pelo redesign.
- O hub continua bloqueado nos builds de produção pelo modo MVP. Esta alteração não modifica essa política.
- Publicação autorizada pelo usuário em 2026-10-31 para a versão `liquid-glass-ui-2026.10.31.1`. Verificação de versão e disponibilidade em produção em andamento.
