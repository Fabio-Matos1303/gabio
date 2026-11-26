# Cabeçalho compacto do cartão

Status em 2026-11-26: validado, publicação em andamento sob a autorização
de publicação mantida nesta conversa.

Base remota: `a46f2c9ebdf9430d8d4984df99702a7721c83cd5`.
Branch da entrega: `codex/clean-card-heading`, na cópia isolada existente.

O cartão deixa de exibir o título genérico da janela. O título da tarefa
continua visível no conteúdo; o nome do diálogo permanece disponível para
leitores de tela por `aria-labelledby` e título visualmente oculto. O cabeçalho
fica compacto, sem divisor, com o botão de fechar de 44 × 44 px à direita.
Os editores secundários mantêm seus títulos visíveis e o comportamento padrão.

## Validação

- 20 testes existentes dos diálogos passaram; ESLint dos componentes alterados,
  Prettier dos arquivos da entrega e build TypeScript/Vite/PWA aprovados.
  Permanece o aviso anterior de bundle acima de 500 kB.
- Prévia sintética com tráfego externo bloqueado em 360 × 800, 768 × 1024,
  1366 × 768 e 1920 × 1080, começando pelo mobile compacto. Capturas dos quatro
  tamanhos inspecionadas visualmente.
- Verificados nome acessível, ocultação visual do título, cabeçalho de 52 px,
  fechar por botão e Escape, retorno de foco e alvo de toque de 44 px.
- Roteiro completo dos cartões aprovado nos quatro viewports, incluindo
  editores, observações, checklists, reordenação, confirmações, teclado,
  fallback sem blur, contraste amostrado e texto de 200% no mobile.
  Axe sem violações; nenhuma rolagem horizontal da página ou do diálogo.
- Revisão por agente distinto aprovada sem achados de segurança ou
  acessibilidade. Nenhuma alteração em dados, comandos, autorização, banco,
  dependências ou integrações.
- Não foram refeitas localmente a suíte inteira da aplicação, os testes Google
  nem os testes SQL. O CI remoto executa os checks completos.
- Evidências locais: `test-results/task-card-content/report.json` e capturas
  `*-clean-heading.png`. Nenhum dado pessoal usado na validação.

Versão preparada: `clean-card-heading-2026.11.26.1`.
Produção pendente de confirmação na URL pública após o envio do commit.
