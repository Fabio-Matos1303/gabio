# Arquitetura

## Visão geral

```text
PWA / Telegram
      |
      v
Entrada autenticada -> Inbox durável -> Roteador de interpretação
                                          | regras
                                          | Gemini permitido
                                          | Hermes/modelo local
                                          v
                                  comando proposto
                                          |
                                          v
                              Command Gateway validado
                                 | tarefas
                                 | finanças
                                 | calendário
                                 v
                         PostgreSQL + auditoria + outbox
```

O Supabase é a fonte única de verdade. Google Agenda, IndexedDB e o agente local são canais ou réplicas, nunca autoridades concorrentes.

## Princípios

- Toda mutação relevante usa um comando autenticado, idempotente e auditável.
- O ator é resolvido pelo backend; o cliente ou modelo não escolhe sua identidade.
- Regras de autorização vivem em RLS e no Command Gateway.
- A interpretação é substituível por uma interface comum.
- Baixa confiança gera pergunta, não preenchimento inventado.
- Integrações externas usam outbox depois do commit local.
- O agente local só inicia conexões de saída e não expõe portas residenciais.

## Política de inferência

1. Parser determinístico para formatos simples.
2. Gemini para conteúdo permitido pela política de privacidade e dentro da cota.
3. Hermes com Qwen/Phi local para conteúdo sensível, continuidade e processamento privado.
4. Tratamento manual quando nenhuma interpretação for confiável.

Google AI Pro não é tratado como crédito automático da Gemini API. A API usa projeto e cota próprios; o modelo e o provedor são sempre configuração de ambiente.
