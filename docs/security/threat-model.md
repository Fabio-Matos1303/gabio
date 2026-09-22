# Modelo de ameaças inicial

## Ativos

- Identidades e sessões.
- Contas e transações financeiras.
- Tarefas, rotinas, compromissos e preferências.
- Tokens do Google, Telegram e dispositivos locais.

## Ameaças prioritárias

- Um membro acessar finanças privadas do outro.
- Falsificação de identidade do Telegram.
- Repetição de webhook criando operações duplicadas.
- Prompt injection induzindo ferramenta não autorizada.
- Vazamento de token OAuth, chave de API ou `service_role`.
- Provedor remoto receber dados privados desnecessários.
- Comprometimento da máquina do agente local.
- Logs registrarem textos ou valores sensíveis.

## Controles mínimos

- RLS por `household_id`, `owner_user_id` e `visibility`.
- Pareamento do Telegram com código temporário e IDs autorizados.
- Segredo de webhook, idempotência e auditoria.
- Lista fechada de ferramentas e schemas de saída.
- Credencial de dispositivo revogável e com privilégio mínimo.
- Sanitização antes de inferência remota.
- Confirmação para operações financeiras e conflitos.
- Ambientes e segredos separados.
- Dados exclusivamente sintéticos nos testes.
