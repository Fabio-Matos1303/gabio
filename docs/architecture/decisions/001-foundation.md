# ADR-001: Fundação técnica

- Status: aceito
- Data: 2026-09-22

## Decisão

Adotar monorepo TypeScript com pnpm, React/Vite para a PWA e Supabase como fonte única de verdade. O frontend será uma SPA/PWA estática hospedável no Cloudflare Pages.

## Consequências

- Contratos e regras puras podem ser compartilhados.
- Não há servidor SSR permanente.
- RLS é parte obrigatória da segurança.
- A evolução pode ser feita por pequenas mudanças versionadas no mesmo repositório.
