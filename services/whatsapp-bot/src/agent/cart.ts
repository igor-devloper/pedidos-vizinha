import {
  CartQuantityValidationError,
  getAllowedSalgadoTypes,
  validateCartItemQuantities,
} from "../order-quantity.js";
import { matchName, resolveFlavors, type FlavorRequest } from "./name-matching.js";

// Regras de carrinho do agente. Espelham as do site (order-quantity + order-creation-service):
// quem manda é o código, o modelo só conversa. O site revalida tudo ao gerar o resumo/pedido.

export type AgentProduct = {
  id: string;
  nome: string;
  descricao: string;
  preco: string;
  descontoPercentual: string;
  categoria: string;
  emPromocao: boolean;
  totalUnidades: number;
  maxTiposSalgado: number;
  permitePagamentoParcial: boolean;
  saboresSugeridos: string[];
  comboItens: unknown;
  antecedenciaMinimaHoras: number | null;
  precisaSelecaoDeTipos: boolean;
  minQuantity: number | null;
  allowsMultiple: boolean | null;
};

export type CartLine = {
  productId: string;
  quantity: number;
  requestedUnits: number;
  selectedItems: Array<{ tipo: string; quantidade: number }>;
};

export type SetLineArgs = {
  produto: string;
  quantidade?: number;
  quantidade_em?: "unidades" | "lotes";
  sabores?: FlavorRequest[];
};

export type CartFailure = { ok: false; erro: string; sugestoes?: string[] };

const money = (value: number) =>
  value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** Venda por unidades soltas (Cento, Meio cento, Porção) em vez de pacote fixo. */
export const usesUnits = (product: AgentProduct) =>
  Boolean(product.allowsMultiple && product.minQuantity && product.minQuantity > 0);

/** Tamanho do lote: a cada lote completo o limite de sabores se repete. */
export const lotSize = (product: AgentProduct) =>
  usesUnits(product) ? (product.minQuantity as number) : product.totalUnidades;

export function finalUnitPrice(product: AgentProduct) {
  const base = Number(product.preco);
  const discount = product.emPromocao ? Number(product.descontoPercentual) || 0 : 0;
  return Number((base * (1 - discount / 100)).toFixed(2));
}

/** Mesma fórmula do site: preço × unidades ÷ lote (por unidades) ou preço × quantidade (pacote). */
export function lineSubtotal(product: AgentProduct, line: CartLine) {
  const price = finalUnitPrice(product);
  return usesUnits(product)
    ? Number(((price * line.requestedUnits) / product.totalUnidades).toFixed(2))
    : Number((price * line.quantity).toFixed(2));
}

export function maxTypesFor(product: AgentProduct, line: Pick<CartLine, "requestedUnits" | "quantity">) {
  return usesUnits(product)
    ? getAllowedSalgadoTypes(line.requestedUnits, product.maxTiposSalgado, product.minQuantity as number)
    : product.maxTiposSalgado * line.quantity;
}

export function describeRule(product: AgentProduct) {
  if (!product.precisaSelecaoDeTipos) return "";
  if (String(product.categoria) === "COMBO") return "Composição fixa, não precisa escolher sabores.";
  const lot = lotSize(product);
  return usesUnits(product)
    ? `A cada ${lot} unidades você escolhe até ${product.maxTiposSalgado} sabores.`
    : `Você escolhe até ${product.maxTiposSalgado} sabores.`;
}

const isCombo = (product: AgentProduct) => String(product.categoria) === "COMBO";

function comboSelection(product: AgentProduct, quantity: number) {
  if (!Array.isArray(product.comboItens)) return [];
  return product.comboItens.flatMap((raw) => {
    const entry = raw as { nome?: unknown; quantidade?: unknown };
    const nome = typeof entry?.nome === "string" ? entry.nome.trim() : "";
    const amount = Number(entry?.quantidade);
    return nome && Number.isInteger(amount) && amount > 0 ? [{ tipo: nome, quantidade: amount * quantity }] : [];
  });
}

export type LineStatus = {
  selectedUnits: number;
  missingUnits: number;
  maxTypes: number;
  complete: boolean;
  problems: string[];
};

export function lineStatus(product: AgentProduct, line: CartLine): LineStatus {
  const selectedUnits = line.selectedItems.reduce((sum, item) => sum + item.quantidade, 0);
  const maxTypes = maxTypesFor(product, line);
  const problems: string[] = [];

  if (!product.precisaSelecaoDeTipos) {
    return { selectedUnits, missingUnits: 0, maxTypes, complete: true, problems };
  }

  const missingUnits = Math.max(0, line.requestedUnits - selectedUnits);
  if (selectedUnits > line.requestedUnits) {
    problems.push(`Os sabores somam ${selectedUnits}, mas o pedido é de ${line.requestedUnits} unidades.`);
  }
  if (line.selectedItems.length > maxTypes) {
    problems.push(`${line.selectedItems.length} sabores; o limite é ${maxTypes}.`);
  }

  if (problems.length === 0 && missingUnits === 0) {
    try {
      validateCartItemQuantities({
        product: { ...product, productType: { minQuantity: product.minQuantity, allowsMultiple: product.allowsMultiple } },
        audience: "VIZINHA",
        quantity: line.quantity,
        requestedUnits: line.requestedUnits,
        selectedItems: line.selectedItems,
      });
    } catch (error) {
      problems.push(error instanceof CartQuantityValidationError || error instanceof Error ? error.message : "Pedido inválido.");
    }
  }

  return { selectedUnits, missingUnits, maxTypes, complete: missingUnits === 0 && problems.length === 0, problems };
}

/** Combinações exatas de lotes que fecham `units` (ex.: 80 = Meio cento + Porção). */
export function suggestSplit(units: number, products: AgentProduct[]) {
  const lots = products
    .filter(usesUnits)
    .map((product) => ({ size: product.minQuantity as number, nome: product.nome }))
    .filter((lot, index, all) => all.findIndex((other) => other.size === lot.size) === index)
    .sort((a, b) => b.size - a.size);
  if (units <= 0 || units > 5000 || lots.length === 0) return null;

  // Menor número de itens que soma exatamente `units`.
  const best: Array<number | null> = Array(units + 1).fill(null);
  const pick: number[] = Array(units + 1).fill(-1);
  best[0] = 0;
  for (let total = 1; total <= units; total += 1) {
    lots.forEach((lot, index) => {
      const previous = total - lot.size;
      if (previous >= 0 && best[previous] !== null) {
        const candidate = (best[previous] as number) + 1;
        if (best[total] === null || candidate < (best[total] as number)) {
          best[total] = candidate;
          pick[total] = index;
        }
      }
    });
  }
  if (best[units] === null) return null;

  const counts = new Map<number, number>();
  for (let total = units; total > 0; total -= lots[pick[total]].size) {
    counts.set(pick[total], (counts.get(pick[total]) ?? 0) + 1);
  }
  const parts = [...counts.entries()].map(([index, count]) => `${count} × ${lots[index].nome} (${lots[index].size} un)`);
  return `${parts.join(" + ")} = ${units} unidades`;
}

function evenSplitHint(units: number, flavors: string[]) {
  if (flavors.length < 2 || units % flavors.length !== 0) return null;
  const each = units / flavors.length;
  return `Sugestão: ${each} de cada (${flavors.join(", ")}) — confirme com o cliente antes de usar.`;
}

export function findProduct(products: AgentProduct[], reference: string) {
  const match = matchName(reference, products.map((product) => product.nome));
  if (match.status === "match") {
    return { ok: true as const, product: products.find((product) => product.nome === match.option)! };
  }
  if (match.status === "ambiguous") {
    return {
      ok: false as const,
      erro: `"${reference}" pode ser mais de um produto. Pergunte qual: ${match.options.join(" ou ")}.`,
    };
  }
  return {
    ok: false as const,
    erro: `Não temos "${reference}" no cardápio. Produtos disponíveis: ${products.map((product) => product.nome).join(", ")}.`,
  };
}

/**
 * Cria ou substitui a linha de um produto. Valida mínimo, limite de sabores e soma das
 * quantidades. Devolve erro explicativo (com alternativas) para o agente reformular.
 */
export function setLine(products: AgentProduct[], lines: CartLine[], args: SetLineArgs) {
  const found = findProduct(products, args.produto);
  if (!found.ok) return { ok: false, erro: found.erro } satisfies CartFailure;
  const { product } = found;
  const existing = lines.find((line) => line.productId === product.id);
  const lot = lotSize(product);

  // 1) Quantidade
  let quantity: number;
  let requestedUnits: number;
  if (args.quantidade !== undefined && args.quantidade !== null) {
    const amount = Number(args.quantidade);
    if (!Number.isInteger(amount) || amount < 1) {
      return { ok: false, erro: "A quantidade precisa ser um número inteiro maior que zero." } satisfies CartFailure;
    }
    if (usesUnits(product)) {
      requestedUnits = args.quantidade_em === "lotes" ? amount * lot : amount;
      quantity = 1;
    } else {
      quantity = amount;
      requestedUnits = product.totalUnidades * amount;
    }
  } else if (existing) {
    quantity = existing.quantity;
    requestedUnits = existing.requestedUnits;
  } else {
    return { ok: false, erro: `Falta a quantidade de ${product.nome}.` } satisfies CartFailure;
  }

  if (usesUnits(product) && requestedUnits < lot) {
    const split = suggestSplit(requestedUnits, products);
    return {
      ok: false,
      erro: `${product.nome} tem mínimo de ${lot} unidades; o cliente pediu ${requestedUnits}.`,
      sugestoes: [
        ...(split ? [`Montar ${split}`] : []),
        `Aumentar para ${lot} unidades de ${product.nome}`,
      ],
    } satisfies CartFailure;
  }

  // 2) Sabores
  let selectedItems = existing?.selectedItems ?? [];
  if (isCombo(product)) {
    selectedItems = comboSelection(product, quantity);
  } else if (!product.precisaSelecaoDeTipos) {
    selectedItems = [];
  } else if (args.sabores !== undefined) {
    const requests = args.sabores.filter((entry) => entry && String(entry.sabor || "").trim());
    const { resolved, problems } = resolveFlavors(requests, product.saboresSugeridos);
    if (problems.length) {
      const unknown = problems.filter((problem) => problem.kind === "none");
      const ambiguous = problems.filter((problem) => problem.kind === "ambiguous");
      return {
        ok: false,
        erro: [
          ...unknown.map((problem) => `Não temos "${problem.input}" em ${product.nome}.`),
          ...ambiguous.map((problem) => `"${problem.input}" pode ser: ${problem.kind === "ambiguous" ? problem.options.join(" ou ") : ""}.`),
          `Sabores de ${product.nome}: ${product.saboresSugeridos.join(", ")}.`,
        ].join(" "),
        sugestoes: ["Peça ao cliente para escolher entre os sabores disponíveis, sem inventar."],
      } satisfies CartFailure;
    }

    if (resolved.length === 1 && !resolved[0].quantidade) {
      resolved[0].quantidade = requestedUnits;
    }
    const missingAmount = resolved.filter((entry) => !entry.quantidade);
    if (missingAmount.length) {
      return {
        ok: false,
        erro: `Faltam as quantidades de: ${missingAmount.map((entry) => entry.tipo).join(", ")}. A soma precisa fechar ${requestedUnits}.`,
        sugestoes: [evenSplitHint(requestedUnits, resolved.map((entry) => entry.tipo)) ?? "Pergunte quanto o cliente quer de cada sabor."],
      } satisfies CartFailure;
    }
    selectedItems = resolved;
  }

  // 3) Limites
  const draftLine: CartLine = { productId: product.id, quantity, requestedUnits, selectedItems };
  const status = lineStatus(product, draftLine);
  const maxTypes = status.maxTypes;

  if (selectedItems.length > maxTypes) {
    const nextUnits = usesUnits(product) ? (Math.floor(requestedUnits / lot) + 1) * lot : requestedUnits;
    return {
      ok: false,
      erro: `Para ${requestedUnits} unidades de ${product.nome} o limite é de ${maxTypes} sabores (${describeRule(product)}). O cliente pediu ${selectedItems.length}.`,
      sugestoes: [
        `Escolher no máximo ${maxTypes} sabores`,
        ...(usesUnits(product)
          ? [`Pedir ${nextUnits} unidades, que libera até ${getAllowedSalgadoTypes(nextUnits, product.maxTiposSalgado, lot)} sabores`]
          : []),
      ],
    } satisfies CartFailure;
  }

  if (status.selectedUnits > requestedUnits) {
    return {
      ok: false,
      erro: `Os sabores somam ${status.selectedUnits}, mas o pedido de ${product.nome} é de ${requestedUnits} unidades.`,
      sugestoes: ["Ajuste as quantidades para a soma fechar o total, confirmando com o cliente."],
    } satisfies CartFailure;
  }

  const line = draftLine;
  const next = existing
    ? lines.map((entry) => (entry.productId === product.id ? line : entry))
    : [...lines, line];
  return { ok: true, lines: next, product, line, status, replaced: Boolean(existing) } as const;
}

export function removeLine(products: AgentProduct[], lines: CartLine[], reference: string) {
  const inCart = products.filter((product) => lines.some((line) => line.productId === product.id));
  const found = findProduct(inCart, reference);
  if (!found.ok) return { ok: false, erro: found.erro } satisfies CartFailure;
  return {
    ok: true,
    product: found.product,
    lines: lines.filter((line) => line.productId !== found.product.id),
  } as const;
}

export type CartView = {
  produto: string;
  unidades: number;
  quantidadeDePacotes: number | null;
  sabores: Array<{ sabor: string; quantidade: number }>;
  faltamUnidades: number;
  limiteDeSabores: number | null;
  completo: boolean;
  problemas: string[];
  subtotal: string;
  subtotalNumero: number;
};

export function describeCart(products: AgentProduct[], lines: CartLine[]) {
  const items: CartView[] = [];
  let total = 0;
  for (const line of lines) {
    const product = products.find((entry) => entry.id === line.productId);
    if (!product) continue;
    const status = lineStatus(product, line);
    const subtotal = lineSubtotal(product, line);
    total += subtotal;
    items.push({
      produto: product.nome,
      unidades: line.requestedUnits,
      quantidadeDePacotes: usesUnits(product) ? null : line.quantity,
      sabores: line.selectedItems.map((item) => ({ sabor: item.tipo, quantidade: item.quantidade })),
      faltamUnidades: status.missingUnits,
      limiteDeSabores: product.precisaSelecaoDeTipos && !isCombo(product) ? status.maxTypes : null,
      completo: status.complete,
      problemas: status.problems,
      subtotal: money(subtotal),
      subtotalNumero: subtotal,
    });
  }
  const totalRounded = Number(total.toFixed(2));
  return {
    itens: items,
    totalDosProdutos: money(totalRounded),
    totalNumero: totalRounded,
    todosCompletos: items.length > 0 && items.every((item) => item.completo),
  };
}
