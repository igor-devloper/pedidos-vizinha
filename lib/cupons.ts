import { normalizeCouponCode, normalizeDiscountPercent } from "@/lib/descontos";

export type CupomPayloadInput = {
  codigo?: string;
  divulgadorNome?: string;
  divulgadorContato?: string | null;
  descricao?: string | null;
  descontoPercentual?: number | string;
  produtoId?: string;
  ativo?: boolean;
};

export function validateCupomPayload(body: CupomPayloadInput) {
  const codigo = normalizeCouponCode(body.codigo);
  const divulgadorNome = body.divulgadorNome?.trim() || "";
  const divulgadorContato = body.divulgadorContato?.trim() || null;
  const descricao = body.descricao?.trim() || null;
  const descontoPercentual = normalizeDiscountPercent(body.descontoPercentual);
  const produtoId = body.produtoId?.trim() || "";
  const ativo = body.ativo ?? true;

  if (!codigo) {
    return { error: "Informe o codigo do cupom." };
  }

  if (codigo.length < 3) {
    return { error: "Use um codigo de cupom com pelo menos 3 caracteres." };
  }

  if (!divulgadorNome) {
    return { error: "Informe quem vai divulgar o cupom." };
  }

  if (!produtoId) {
    return { error: "Escolha o produto deste cupom." };
  }

  if (descontoPercentual <= 0 || descontoPercentual > 100) {
    return { error: "Informe um desconto entre 1% e 100%." };
  }

  return {
    data: {
      codigo,
      divulgadorNome,
      divulgadorContato,
      descricao,
      descontoPercentual,
      produtoId,
      ativo,
    },
  };
}
