# ADR-003: Gemini como provedor externo opcional

- Status: aceito
- Data: 2026-09-22

## Decisão

O Gemini será um adaptador opcional para interpretar texto de baixa sensibilidade após sanitização. O núcleo continuará funcionando com regras determinísticas, modelo local ou confirmação manual.

O plano Google AI Pro do proprietário não será confundido com faturamento da Gemini Developer API. A integração poderá usar:

1. a camada gratuita da Gemini Developer API, em projeto e cota próprios; ou
2. Vertex AI, quando os créditos mensais do Google Cloud associados ao benefício do Google Developer Program forem resgatados e houver orçamento/limite configurado.

## Guardas

- Gemini recebe somente o payload sanitizado selecionado pelo backend.
- Dados financeiros privados, segredos e identificadores não usam provedor externo.
- Saída é validada em runtime e nunca é executada diretamente.
- Cota esgotada ou cobrança desabilitada aciona o modelo local ou revisão manual.
- A ativação exige limite de orçamento e nenhuma chave é armazenada no cliente.

## Referências

- [Benefícios do Google AI Pro](https://support.google.com/googleone/answer/14534406)
- [Faturamento da Gemini API](https://ai.google.dev/gemini-api/docs/billing)
