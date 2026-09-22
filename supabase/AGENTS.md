# Regras do Supabase

- Toda tabela exposta deve habilitar RLS na mesma migration em que é criada.
- Inclua políticas positivas e negativas para dados privados e compartilhados.
- A PWA, Telegram e agente local nunca recebem `service_role`.
- Migrations aplicadas são imutáveis; correções entram em uma nova migration.
- Use `timestamptz` para instantes, `date` para datas civis e inteiros para centavos.
- Seeds e testes contêm somente identidades e dados sintéticos.
- Funções `security definer` devem fixar `search_path` e possuir escopo mínimo.
