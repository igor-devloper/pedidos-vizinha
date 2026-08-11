import { PedidoStatus, Prisma } from "@prisma/client";
import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { getFullStoreStatus, isSameBusinessDate } from "@/lib/business-hours";
import {
  calculateDiscountedSubtotal,
  normalizeCouponCode,
  normalizeDiscountPercent,
} from "@/lib/descontos";
import { createMercadoPagoPreference } from "@/lib/mercado-pago";
import {
  calculatePaymentAmounts,
  createPedidoCode,
  createPedidoSchema,
  normalizePedidoItems,
  parseDeliveryDate,
  validateDeliveryDate,
  validatePedidoAgainstProduto,
} from "@/lib/pedidos";

export async function POST(req: Request) {
  try {
    const rawBody = await req.json();
    const payload = createPedidoSchema.parse(rawBody);

    const produto = await prisma.produto.findUnique({
      where: { id: payload.produtoId },
    });

    if (!produto || !produto.ativo) {
      return NextResponse.json({ error: "Produto não encontrado." }, { status: 404 });
    }

    const itens = normalizePedidoItems(payload.itens);
    const entrega = parseDeliveryDate(payload.dataEntrega);
    const settings = await getFullStoreStatus();

    if (!settings.isOpen && isSameBusinessDate(entrega, new Date())) {
      return NextResponse.json(
        { error: "A loja está fechada para pedidos de hoje. Escolha uma data futura para continuar." },
        { status: 400 }
      );
    }

    validateDeliveryDate(entrega, new Date(), settings.minimumLeadHours, {
      operationSchedule: settings.operationSchedule,
    });

    if (!settings.allowMultipleOrdersPerSlot) {
      const conflictingPedido = await prisma.pedido.findFirst({
        where: {
          dataEntrega: entrega,
          status: {
            not: PedidoStatus.CANCELADO,
          },
        },
        select: {
          id: true,
          codigo: true,
        },
      });

      if (conflictingPedido) {
        return NextResponse.json(
          {
            error:
              "Esse horário já está reservado para outra encomenda. Escolha outro horário para continuar.",
          },
          { status: 409 }
        );
      }
    }

    if (payload.percentualPagamento === 50 && !produto.permitePagamentoParcial) {
      return NextResponse.json(
        { error: "Esse produto exige pagamento integral." },
        { status: 400 }
      );
    }

    const productQuantity = payload.productQuantity;
    const { totalTipos, totalUnidades } = validatePedidoAgainstProduto(produto, itens, productQuantity);
    const baseSubtotal = Number(produto.preco) * productQuantity;
    const produtoDiscountPercent = produto.emPromocao
      ? normalizeDiscountPercent(produto.descontoPercentual)
      : 0;
    const cupomCodigo = normalizeCouponCode(payload.cupomCodigo);
    const cupom = cupomCodigo
      ? await prisma.cupomDesconto.findFirst({
          where: {
            codigo: cupomCodigo,
            produtoId: produto.id,
          },
        })
      : null;

    if (cupomCodigo && (!cupom || !cupom.ativo)) {
      return NextResponse.json(
        { error: "Cupom inválido para este produto ou inativo." },
        { status: 400 }
      );
    }

    const cupomDiscountPercent = cupom ? normalizeDiscountPercent(cupom.descontoPercentual) : 0;
    const totalDiscountPercent = normalizeDiscountPercent(
      produtoDiscountPercent + cupomDiscountPercent
    );
    const discount = calculateDiscountedSubtotal(baseSubtotal, totalDiscountPercent);
    const subtotal = discount.subtotal;
    const payment = calculatePaymentAmounts(
      subtotal,
      payload.percentualPagamento,
      payload.metodoPagamento
    );

    const codigo = createPedidoCode();
    const externalReference = `vizinha-${codigo}`;

    let pedido;

    try {
      pedido = await prisma.pedido.create({
        data: {
          codigo,
          clienteNome: payload.clienteNome.trim(),
          clienteTelefone: payload.clienteTelefone.trim(),
          clienteEmail: payload.clienteEmail?.trim() || null,
          observacoes: payload.observacoes?.trim() || null,
          dataEntrega: entrega,
          percentualPagamento: payload.percentualPagamento,
          metodoPagamento: payload.metodoPagamento,
          metodoPagamentoLabel: payment.methodLabel,
          taxaPercentual: payment.feePercent,
          taxaValor: payment.feeAmount,
          subtotal,
          totalCobrado: payment.totalToCharge,
          totalUnidades,
          totalTipos,
          descontoPercentual: discount.discountPercent,
          descontoValor: discount.discountValue,
          cupomCodigoSnapshot: cupom?.codigo || null,
          cupomDivulgadorSnapshot: cupom?.divulgadorNome || null,
          produtoNomeSnapshot: produto.nome,
          produtoPrecoSnapshot: baseSubtotal,
          mpExternalReference: externalReference,
          produtoId: produto.id,
          cupomId: cupom?.id || null,
          itens: {
            create: itens.map((item) => ({
              tipo: item.tipo,
              quantidade: item.quantidade,
            })),
          },
        },
        include: {
          itens: true,
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        return NextResponse.json(
          {
            error:
              "Esse horário acabou de ser reservado por outra encomenda. Escolha outro horário para continuar.",
          },
          { status: 409 }
        );
      }

      throw error;
    }

    const preference = await createMercadoPagoPreference({
      pedido,
      payer: {
        name: pedido.clienteNome,
        email: pedido.clienteEmail,
        phone: pedido.clienteTelefone,
      },
    });

    await prisma.pedido.update({
      where: { id: pedido.id },
      data: {
        mpPreferenceId: preference.id,
        mpInitPoint: preference.init_point,
      },
    });

    return NextResponse.json({
      pedidoId: pedido.id,
      codigo: pedido.codigo,
      preferenceId: preference.id,
      redirectUrl: preference.init_point,
    });
  } catch (error) {
    console.error("POST /api/pedidos error", error);

    const message =
      error instanceof Error ? error.message : "Não foi possível iniciar o pedido.";

    return NextResponse.json({ error: message }, { status: 400 });
  }
}
