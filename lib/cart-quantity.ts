export type CartQuantityAudience = "VIZINHA" | "CONFEITEIRA";

export type CanonicalSelectedItem = {
  tipo: string;
  quantidade: number;
};

export type CartQuantityProduct = {
  nome?: string;
  categoria?: unknown;
  totalUnidades: number;
  maxTiposSalgado: number;
  precisaSelecaoDeTipos: boolean;
  quantidadeMinimaConfeiteira?: number | null;
  productType?: {
    minQuantity?: number | null;
    allowsMultiple?: boolean | null;
  } | null;
  comboItens?: unknown;
  saboresSugeridos?: string[];
};

export function getAllowedSalgadoTypes(units: number, configuredMaximum: number, lotSize: number) {
  const safeMaximum = Math.max(1, Math.floor(configuredMaximum));
  const safeLotSize = Math.max(1, Math.floor(lotSize));
  return safeMaximum * Math.max(1, Math.floor(units / safeLotSize));
}

export class CartQuantityValidationError extends Error {
  constructor(
    message: string,
    public readonly details: {
      selectedUnits?: number;
      requestedUnits?: number;
      minimumQuantity?: number;
      mode?: "FIXED" | "MINIMUM";
    } = {},
  ) {
    super(message);
    this.name = "CartQuantityValidationError";
  }
}

function requirePositiveInteger(value: unknown, label: string) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new CartQuantityValidationError(`${label} deve ser um número inteiro maior que zero.`);
  }
  return parsed;
}

export function normalizeCartSelectedItemsCanonical(value: unknown): CanonicalSelectedItem[] {
  if (!Array.isArray(value)) return [];

  const merged = new Map<string, CanonicalSelectedItem>();
  for (const rawItem of value) {
    if (!rawItem || typeof rawItem !== "object") continue;
    const entry = rawItem as { tipo?: unknown; quantidade?: unknown };
    const tipo = typeof entry.tipo === "string" ? entry.tipo.trim().replace(/\s+/g, " ") : "";
    const quantidade = Number(entry.quantidade);

    // Campos vazios e zero sao rascunhos de interface, nao itens do pedido.
    if (!tipo || quantidade === 0) continue;
    if (!Number.isInteger(quantidade) || quantidade < 0) {
      throw new CartQuantityValidationError(
        `${tipo || "A quantidade"} deve usar um número inteiro não negativo.`,
      );
    }

    const key = tipo.toLocaleLowerCase("pt-BR");
    const current = merged.get(key);
    if (current) current.quantidade += quantidade;
    else merged.set(key, { tipo, quantidade });
  }

  return [...merged.values()];
}

export function validateCartItemQuantities({
  product,
  audience,
  quantity,
  requestedUnits,
  selectedItems,
  requireCompleteSelection = true,
}: {
  product: CartQuantityProduct;
  audience: CartQuantityAudience;
  quantity: unknown;
  requestedUnits?: unknown;
  selectedItems: unknown;
  requireCompleteSelection?: boolean;
}) {
  const canonicalQuantity = requirePositiveInteger(quantity, "A quantidade do produto");
  const configuredMinimum = audience === "CONFEITEIRA"
    ? product.quantidadeMinimaConfeiteira
    : product.productType?.allowsMultiple
      ? product.productType.minQuantity
      : null;
  const usesMinimumQuantity = Number.isInteger(Number(configuredMinimum)) && Number(configuredMinimum) > 0;
  const minimumQuantity = usesMinimumQuantity ? Number(configuredMinimum) : 1;
  const mode = usesMinimumQuantity ? "MINIMUM" as const : "FIXED" as const;
  const effectiveRequestedUnits = usesMinimumQuantity
    ? requirePositiveInteger(requestedUnits ?? minimumQuantity, "A quantidade solicitada")
    : requirePositiveInteger(product.totalUnidades, "A quantidade configurada do produto") * canonicalQuantity;

  if (usesMinimumQuantity && effectiveRequestedUnits < minimumQuantity) {
    throw new CartQuantityValidationError(
      `A quantidade mínima é ${minimumQuantity}; você solicitou ${effectiveRequestedUnits} unidades.`,
      { requestedUnits: effectiveRequestedUnits, minimumQuantity, mode },
    );
  }

  const normalizedSelectedItems = normalizeCartSelectedItemsCanonical(selectedItems);
  const selectedUnits = normalizedSelectedItems.reduce((sum, item) => sum + item.quantidade, 0);
  const configuredMaxTypes = requirePositiveInteger(product.maxTiposSalgado, "O máximo de tipos");
  const maxTypes = usesMinimumQuantity
    ? getAllowedSalgadoTypes(effectiveRequestedUnits, configuredMaxTypes, minimumQuantity)
    : configuredMaxTypes * canonicalQuantity;

  if (product.precisaSelecaoDeTipos && requireCompleteSelection) {
    if (selectedUnits !== effectiveRequestedUnits) {
      throw new CartQuantityValidationError(
        `Você selecionou ${selectedUnits} de ${effectiveRequestedUnits} unidades.`,
        { selectedUnits, requestedUnits: effectiveRequestedUnits, minimumQuantity, mode },
      );
    }
    if (normalizedSelectedItems.length > maxTypes) {
      throw new CartQuantityValidationError(
        `Você selecionou ${normalizedSelectedItems.length} tipos; o máximo é ${maxTypes}.`,
        { selectedUnits, requestedUnits: effectiveRequestedUnits, minimumQuantity, mode },
      );
    }

    if (String(product.categoria) !== "COMBO" && product.saboresSugeridos?.length) {
      const normalizeName = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR").trim();
      const allowed = new Set(product.saboresSugeridos.map(normalizeName));
      const invalid = normalizedSelectedItems.find((item) => !allowed.has(normalizeName(item.tipo)));
      if (invalid) {
        throw new CartQuantityValidationError(
          `${invalid.tipo} não é uma opção disponível para ${product.nome || "este produto"}.`,
          { selectedUnits, requestedUnits: effectiveRequestedUnits, minimumQuantity, mode },
        );
      }
    }

    if (String(product.categoria) === "COMBO" && Array.isArray(product.comboItens)) {
      const comboItems = product.comboItens
        .map((item) => {
          if (!item || typeof item !== "object") return null;
          const entry = item as { nome?: unknown; quantidade?: unknown };
          const nome = typeof entry.nome === "string" ? entry.nome.trim() : "";
          const quantidade = Number(entry.quantidade);
          return nome && Number.isInteger(quantidade) && quantidade > 0
            ? { nome, quantidade }
            : null;
        })
        .filter((item): item is { nome: string; quantidade: number } => Boolean(item));
      const compositionMatches = comboItems.length === normalizedSelectedItems.length
        && comboItems.every((comboItem) => {
          const selected = normalizedSelectedItems.find(
            (item) => item.tipo.toLocaleLowerCase("pt-BR") === comboItem.nome.toLocaleLowerCase("pt-BR"),
          );
          return selected?.quantidade === comboItem.quantidade * canonicalQuantity;
        });
      if (!compositionMatches) {
        throw new CartQuantityValidationError("Esse combo possui composição fixa e não pode ser alterado.", {
          selectedUnits,
          requestedUnits: effectiveRequestedUnits,
          minimumQuantity,
          mode,
        });
      }
    }
  }

  return {
    mode,
    quantity: usesMinimumQuantity ? 1 : canonicalQuantity,
    requestedUnits: effectiveRequestedUnits,
    minimumQuantity,
    usesMinimumQuantity,
    selectedItems: normalizedSelectedItems,
    selectedUnits,
    maxTypes,
  };
}
