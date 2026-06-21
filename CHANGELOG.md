# Changelog

## 2026-06-21 - Refatoração de tipos, carrinho, checkout e dashboard

- Adicionado `ProductType` ao Prisma, com tipos padrão: Cento, Meio Cento, Porção e Avulso.
- Adicionado vínculo `productTypeId` em `Produto`, preservando a categoria legada para compatibilidade com checkout antigo, bot, impressão e relatórios.
- Adicionados modelos `Cart`, `CartItem`, `Order`, `OrderItem` e enum `OrderStatus`.
- Criada migration incremental `20260621120000_refactor_types_and_cart` com criação de tabelas, seed SQL e migração dos produtos existentes.
- Criado seed `prisma/seed.ts` para reforçar tipos padrão e preencher produtos sem tipo.
- Criadas APIs de carrinho:
  - `POST /api/cart/add`
  - `GET /api/cart`
  - `PATCH /api/cart/item/[id]`
  - `DELETE /api/cart/item/[id]`
  - `DELETE /api/cart`
- Criado checkout de carrinho em `POST /api/checkout/cart`, com criação de `Order` antes do redirecionamento ao Mercado Pago.
- Adicionada preferência Mercado Pago multi-item para carrinho.
- Atualizado webhook Mercado Pago para marcar `Order` do carrinho como `PAID`/`CANCELLED` e limpar o carrinho pago.
- Criada página `/pedido/confirmacao` com resumo do pedido do carrinho.
- Adicionados componentes públicos de carrinho:
  - seletor de quantidade e botão `Adicionar`
  - carrinho flutuante com badge
  - drawer/modal com itens, edição de quantidade, remoção, limpeza e finalização
- Atualizado cardápio público para exibir tipo dinâmico de produto e manter link para o fluxo antigo de montagem detalhada.
- Adicionadas APIs administrativas para tipos de produto:
  - `GET /api/manhia/product-types`
  - `POST /api/manhia/product-types`
  - `PATCH /api/manhia/product-types/[id]`
  - `DELETE /api/manhia/product-types/[id]`
- Atualizado dashboard `/manhia`:
  - nova aba `Tipos`
  - cadastro, edição e exclusão de tipos
  - aviso/bloqueio para exclusão de tipos com produtos vinculados
  - select dinâmico de tipo no cadastro/edição de produto
  - listagem dos pedidos recentes do novo carrinho
- Adicionado tema `São João` ao sistema de temas:
  - nome interno `SAO_JOAO`
  - opção ativável no dashboard
  - cores amarelo, vermelho, verde, laranja e acento terroso
  - bandeirinhas CSS no topo da vitrine
  - textura xadrez leve
  - fonte Lobster em títulos da campanha
  - emojis temáticos visíveis

## Observações de migração

- `npx.cmd prisma migrate dev --name refactor_types_and_cart` foi executado, mas o Prisma detectou drift no banco Neon e pediu reset do schema. O reset não foi executado para preservar os dados.
- A migration incremental foi aplicada sem perda de dados com:
  `npx.cmd prisma db execute --file prisma\migrations\20260621120000_refactor_types_and_cart\migration.sql --schema prisma\schema.prisma`
- `npx.cmd prisma db seed` foi executado com sucesso.
- Verificação pós-seed confirmou `productsWithoutType: 0`.

## Validação

- `npx.cmd prisma generate`
- `npm.cmd run build`
- `npm.cmd run lint`
