import { Prisma } from "@prisma/client";

/**
 * Consultas sem filtro de status e sem limite implicito. A paginacao futura deve
 * ser explicita e acompanhada de total/cursor no painel.
 */
export const MANHIA_ORDER_HISTORY_QUERY = {
  orderBy: [{ createdAt: "desc" }],
  include: { items: true },
} satisfies Prisma.OrderFindManyArgs;

export const MANHIA_PEDIDO_HISTORY_QUERY = {
  orderBy: [{ createdAt: "desc" }],
  include: { itens: true, produto: true },
} satisfies Prisma.PedidoFindManyArgs;
