# Regras para agentes

Este repositório contém um sistema residencial com dados pessoais e financeiros. Antes de alterar código, leia `docs/product/vision.md`, `docs/architecture/overview.md` e os ADRs relacionados.

## Regras obrigatórias

- Não use dados reais em desenvolvimento, testes, prompts ou logs.
- Nunca grave segredos, tokens, dumps ou arquivos `.env` no repositório.
- Toda entrada externa e toda saída de modelo devem ser validadas por schema.
- Modelos de IA propõem comandos; não recebem SQL livre nem credenciais administrativas.
- Toda tabela de dados do usuário nasce com RLS e testes positivos e negativos.
- Não desabilite RLS para contornar falhas.
- Operações financeiras e integrações externas devem ser idempotentes e auditáveis.
- Não altere uma migration já aplicada; crie uma nova migration incremental.
- Mudanças arquiteturais duradouras exigem ADR.
- APIs gratuitas devem ter adaptador, timeout, limite, fallback e minimização de dados.
- Implementação e revisão de segurança devem ser feitas por agentes distintos.
- Deploy, migration destrutiva, mudança de permissões, novo escopo OAuth e novo custo exigem aprovação humana.
- Preserve alterações existentes e não misture refactors sem relação com a demanda.
- Antes de concluir, execute os checks proporcionais e informe exatamente o que foi ou não validado.
- Uma alteração só está concluída após ser publicada em produção e ter a versão e a disponibilidade verificadas na URL de produção. Código local, commit, build e preview são etapas intermediárias.
- Conduza a entrega até produção quando a publicação estiver autorizada no pedido ou na conversa. Se faltar autorização, acesso ou houver falha de publicação, informe o impedimento e mantenha a alteração como pendente de produção; não a declare concluída.

Interface e mensagens para o usuário devem usar português brasileiro. Código, nomes técnicos e commits usam inglês.
