# Alinhamento vertical da barra de tarefas

Status em 2026-11-26: validado; publicação em andamento sob a autorização
mantida nesta conversa.

Base remota: `bf03cf2a9273758dffd13ca872af1e8c7d149d33`.
Branch: `codex/vertical-task-toolbar`, na cópia isolada existente.

O usuário esclareceu que a centralização pretendida era vertical. As
visualizações voltam à esquerda e as ferramentas à direita. Ambos os grupos
ficam no centro vertical da linha de controles. No mobile compacto, as duas
linhas mantêm espaços externos simétricos e os ícones ficam centrados nos botões.

O resumo vazio deixa de reservar uma linha no grid, que acrescentava espaço
inferior e deslocava visualmente os controles. A região de status continua
acessível, incluindo atualização do Google. Contagens, filtros ativos e
parcialidade continuam visíveis quando há informação a apresentar.

## Validação

- 12 testes existentes de TaskViews aprovados.
- ESLint do componente alterado, Prettier dos arquivos da entrega, whitespace
  e build TypeScript/Vite/PWA aprovados. Permanece o aviso anterior de bundle
  acima de 500 kB.
- Prévia exclusivamente sintética, tráfego externo bloqueado, em 360 × 800,
  768 × 1024, 1366 × 768 e 1920 × 1080, começando pelo mobile. Capturas dos
  quatro tamanhos inspecionadas visualmente.
- Medidas confirmaram grupos nas laterais, centros verticais coincidentes
  no tablet/notebook/desktop e espaços externos simétricos no mobile. Ícones
  centrados nos botões e alvos de toque de pelo menos 44 px em todos os tamanhos.
- Quadro, Semana e Mês sem overflow da página. Filtros ativos continuam
  exibindo o resumo; fallback sem blur verificado. Axe sem violações na barra.
- Revisão independente de segurança aprovada sem achados. Não há alteração
  de comandos, validação, permissões, dados, dependências ou integrações.
- Não foram repetidos localmente os testes de App, SQL, Google ou a suíte
  inteira. O CI remoto executa os checks completos. Não houve medição nova de
  contraste por pixels nem teste de texto ampliado nesta correção de alinhamento.

Evidências locais: `test-results/task-card-content/vertical-toolbar.json` e
capturas `*-vertical-toolbar.png`.

Versão preparada: `vertical-task-toolbar-2026.11.26.1`.
Produção pendente de confirmação após o envio do commit.
