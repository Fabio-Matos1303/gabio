# Gabio

Sistema privado de gestão residencial para tarefas, finanças, calendário e automações, acessível como PWA e pelo Telegram.

O projeto usa uma arquitetura híbrida: regras determinísticas primeiro, Gemini quando a política de dados permitir e um agente Hermes/Qwen/Phi local para privacidade e continuidade. O modelo nunca é a autoridade sobre permissões ou alterações de dados.

## Estado

Fundação em construção. O primeiro marco cobre monorepo, contratos, domínio, PWA mínima, banco local e políticas de segurança.

## Stack

- React + Vite + TypeScript
- PostgreSQL, Auth e Edge Functions no Supabase
- Cloudflare Pages/Workers
- Gemini API por adaptador
- Hermes com modelo local por adaptador OpenAI-compatible
- pnpm workspaces

## Desenvolvimento

Requisitos planejados:

- Node.js 24 LTS
- pnpm fixado no `packageManager`
- Docker para o Supabase local

Após instalar as dependências:

```bash
pnpm install
pnpm verify
pnpm dev
supabase db start
supabase test db
```

Copie `.env.example` para `.env.local` e preencha apenas valores de desenvolvimento. Nunca use dados ou credenciais de produção localmente.

## Documentação

- [Visão do produto](docs/product/vision.md)
- [Arquitetura](docs/architecture/overview.md)
- [Modelo de ameaças](docs/security/threat-model.md)
- [Decisões arquiteturais](docs/architecture/decisions/)
