# ADR-002: Inferência híbrida e substituível

- Status: aceito
- Data: 2026-09-22

## Decisão

Modelos implementam um contrato comum e produzem somente comandos propostos. Regras determinísticas são tentadas primeiro. Gemini é permitido conforme classificação e consentimento; Hermes com modelo local processa conteúdo sensível ou serve de fallback.

## Guardas

- Nenhum modelo recebe SQL ou credenciais administrativas.
- Saídas são não confiáveis até validação.
- Financeiro privado não sai de forma identificável.
- Quota, indisponibilidade ou troca de modelo não quebram o núcleo.
