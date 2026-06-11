import { normalizeSaboresList } from "@/lib/sabores";
import { normalizeDiscountPercent } from "@/lib/descontos";

export const PRODUCT_CATEGORIES = ["CENTO", "LANCHONETE", "COMBO"] as const;

export type ProductCategory = (typeof PRODUCT_CATEGORIES)[number];

export type ComboItem = {
  nome: string;
  quantidade: number;
};

export const PRODUCT_CATEGORY_LABEL: Record<ProductCategory, string> = {
  CENTO: "Cento",
  LANCHONETE: "Lanchonete",
  COMBO: "Combo",
};

export type ProdutoPayloadInput = {
  nome?: string;
  descricao?: string;
  preco?: number | string;
  imagemBase64?: string;
  categoria?: ProductCategory;
  totalUnidades?: number | string;
  maxTiposSalgado?: number | string;
  permitePagamentoParcial?: boolean;
  saboresSugeridos?: string[];
  comboItens?: ComboItem[] | null;
  emPromocao?: boolean;
  descontoPercentual?: number | string;
  ativo?: boolean;
};

function normalizeCategoria(value: string | undefined): ProductCategory {
  return PRODUCT_CATEGORIES.includes(value as ProductCategory)
    ? (value as ProductCategory)
    : "CENTO";
}

export function normalizeComboItens(value: unknown): ComboItem[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (!item || typeof item !== "object") {
        return null;
      }

      const nome =
        "nome" in item && typeof item.nome === "string" ? item.nome.trim() : "";
      const quantidade =
        "quantidade" in item ? Number(item.quantidade) : Number.NaN;

      if (!nome || !Number.isInteger(quantidade) || quantidade <= 0) {
        return null;
      }

      return { nome, quantidade };
    })
    .filter((item): item is ComboItem => Boolean(item));
}

export function validateProdutoPayload(body: ProdutoPayloadInput) {
  const nome = body.nome?.trim() || "";
  const descricao = body.descricao?.trim() || "";
  const preco = Number(body.preco);
  const imagemBase64 = body.imagemBase64?.trim() || "";
  const categoria = normalizeCategoria(body.categoria);
  const permitePagamentoParcial = body.permitePagamentoParcial ?? true;
  const saboresSugeridos = normalizeSaboresList(body.saboresSugeridos);
  const comboItens = normalizeComboItens(body.comboItens);
  const emPromocao = body.emPromocao ?? false;
  const descontoPercentual = normalizeDiscountPercent(body.descontoPercentual);
  const ativo = body.ativo ?? true;

  if (!nome) {
    return { error: "Informe o nome do produto." };
  }

  if (!descricao) {
    return { error: "Informe a descricao do produto." };
  }

  if (!Number.isFinite(preco) || preco <= 0) {
    return { error: "Informe um valor valido." };
  }

  if (emPromocao && descontoPercentual <= 0) {
    return { error: "Informe o percentual de desconto da promocao." };
  }

  if (!imagemBase64.startsWith("data:image/")) {
    return { error: "Envie uma imagem valida para o produto." };
  }

  if (imagemBase64.length > 2_500_000) {
    return { error: "A imagem ficou muito grande. Tente um arquivo menor." };
  }

  if (categoria === "COMBO") {
    if (comboItens.length === 0) {
      return { error: "Cadastre ao menos um item fixo para o combo." };
    }

    const totalUnidades = comboItens.reduce((sum, item) => sum + item.quantidade, 0);
    const maxTiposSalgado = comboItens.length;

    return {
      data: {
        nome,
        descricao,
        preco: Number(preco.toFixed(2)),
        imagemBase64,
        categoria,
        totalUnidades,
        maxTiposSalgado,
        permitePagamentoParcial,
        saboresSugeridos: comboItens.map((item) => item.nome),
        comboItens,
        emPromocao,
        descontoPercentual,
        ativo,
      },
    };
  }

  const totalUnidades = Number(body.totalUnidades);
  const maxTiposSalgado = Number(body.maxTiposSalgado);

  if (!Number.isInteger(totalUnidades) || totalUnidades <= 0) {
    return { error: "Informe o total de unidades do produto." };
  }

  if (!Number.isInteger(maxTiposSalgado) || maxTiposSalgado <= 0) {
    return { error: "Informe o limite de tipos permitidos." };
  }

  return {
    data: {
      nome,
      descricao,
      preco: Number(preco.toFixed(2)),
      imagemBase64,
      categoria,
      totalUnidades,
      maxTiposSalgado,
      permitePagamentoParcial,
      saboresSugeridos,
      comboItens: [],
      emPromocao,
      descontoPercentual,
      ativo,
    },
  };
}

export function getProdutoComboItens(produto: { comboItens?: unknown }): ComboItem[] {
  return normalizeComboItens(produto.comboItens);
}

export function isComboProduto(produto: { categoria?: unknown; comboItens?: unknown }): boolean {
  return produto.categoria === "COMBO" && getProdutoComboItens(produto).length > 0;
}
