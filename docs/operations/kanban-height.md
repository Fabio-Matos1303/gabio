# Altura e rolagem do kanban

Versão: `kanban-height-2026.11.05.1`. Publicação autorizada pelo usuário em 2026-11-05.
Base: `dff6cea7d0065910afc04aed30af4a15a00035e1`.

A seção de tarefas ocupa no máximo 120vh. As três colunas mantêm altura uniforme independentemente da quantidade de cartões, com cabeçalhos fora da área de rolagem e rolagem vertical independente nos cartões. O calendário permanece acessível por rolagem dentro da mesma seção. Diálogos mantêm sua camada modal.

## Validação anterior à publicação

- CSS anterior ao ajuste comparado com main: conteúdo idêntico. Publicação restrita ao bloco CSS acrescentado, identificação de versão e este registro; demais alterações locais preservadas.
- 109 testes web e build/PWA aprovados. Prettier do CSS aprovado. Build mantém aviso de bundle superior a 500 kB.
- Chromium com dados fictícios: 360 × 800, 768 × 1024, 1366 × 768 e 1920 × 1080. Seção medida em 960, 1228,80, 921,59 e 1296 px, respectivamente, dentro de 120vh com arredondamento subpixel.
- Estresse com 25 cópias adicionais de cartões sintéticos por coluna: alturas permaneceram iguais antes/depois. Verificados rolagem por roda, cabeçalhos estáveis, foco no último controle, diálogos dentro do viewport e ausência de overflow horizontal da página. Calendário também limitado a 120vh.
- Revisão estática de segurança por agente distinto sem bloqueadores. Sem alterações em dados, permissões, OAuth ou integrações.
- Não repetidos: contraste, fallback sem blur, leitor de tela, texto ampliado, toque físico e Safari/iOS.
- Evidências locais: `test-results/kanban-height-layout.json` e capturas `kanban-height-{360,768,1366,1920}.png`.

A confirmação de produção deve verificar a versão acima, HTTP 200 para HTML, versão, JavaScript, CSS, manifesto e service worker, além dos seletores de altura e rolagem no CSS publicado.
