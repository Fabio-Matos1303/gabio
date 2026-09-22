# Visão do produto

Gabio é um sistema privado de gestão residencial para duas pessoas. Centraliza tarefas, finanças e compromissos, com entrada pela PWA e por texto natural no Telegram.

## Objetivos do MVP

1. Criar, atribuir, repetir e concluir tarefas.
2. Registrar contas, receitas, despesas, orçamentos e parcelamentos com visibilidade compartilhada ou privada.
3. Criar compromissos em um calendário secundário do Google e alertar sobre conflitos entre eventos originados pelo sistema.
4. Interpretar entradas em português por regras, Gemini ou agente local, sempre com validação e confirmação proporcional ao risco.
5. Funcionar em Chrome no Android, tablet e Windows como PWA responsiva.

## Fora do MVP

- Integração bancária/Open Finance.
- Aplicativos nativos publicados em lojas.
- Sincronização bidirecional com o Google Agenda.
- Alteração autônoma de produção por agentes.
- Dependência obrigatória de qualquer modelo de IA.

## Restrições

- Custo recorrente alvo de R$ 0 dentro de cotas gratuitas.
- Subdomínio gratuito `*.pages.dev` aceito.
- Dados financeiros privados nunca podem aparecer para o outro membro da residência.
- O sistema central continua funcionando com o computador local e os provedores de IA desligados.
