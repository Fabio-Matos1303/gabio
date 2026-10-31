# Diretrizes de UI responsiva

## Princípio

A interface do Gabio é projetada primeiro para telas móveis e aprimorada progressivamente para tablet e desktop. A versão desktop não deve apenas ampliar espaços: deve usar a área adicional para oferecer contexto sem esconder as ações e informações prioritárias.

Na implementação, escreva os estilos base para mobile e acrescente adaptações com `min-width`. Comece a validação pelo viewport de 360 × 800 antes de avançar para telas maiores.

O padrão visual obrigatório é o [design system do Gabio](design-system.md), aprovado em 2026-10-31. Consulte-o antes de planejar ou desenvolver telas: fundo liso, conteúdo funcional, seções em vidro líquido e navegação em ilha. As regras responsivas deste documento complementam esse padrão.

## Viewports mínimos de validação

- Mobile compacto: 360 × 800, zoom 100%.
- Tablet: 768 × 1024, zoom 100%.
- Notebook: 1366 × 768, zoom 100%.
- Desktop: 1920 × 1080, zoom 100%.

## Regras de usabilidade

- Não criar rolagem horizontal na página.
- Controles primários devem ter área de toque mínima de 44 × 44 px no mobile.
- A primeira dobra deve priorizar informação e ação, não conteúdo institucional.
- Calendários mensais devem exibir as sete colunas sem corte ou rolagem horizontal.
- Informações secundárias podem seguir abaixo da grade no mobile, mas não podem encobri-la.
- Navegação fixa deve reservar espaço no conteúdo e nunca sobrepor ações ou a última linha útil.
- Estados não podem depender apenas de cor; devem ter texto, forma ou legenda complementar.
- Toda tela alterada deve ser verificada nos quatro viewports mínimos antes da entrega.
