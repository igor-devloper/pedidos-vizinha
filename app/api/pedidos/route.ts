import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
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

    validateDeliveryDate(entrega);

    if (payload.percentualPagamento === 50 && !produto.permitePagamentoParcial) {
      return NextResponse.json(
        { error: "Esse produto exige pagamento integral." },
        { status: 400 }
      );
    }

    const { totalTipos, totalUnidades } = validatePedidoAgainstProduto(produto, itens);
    const subtotal = Number(produto.preco);
    const payment = calculatePaymentAmounts(
      subtotal,
      payload.percentualPagamento,
      payload.metodoPagamento
    );

    const codigo = createPedidoCode();
    const externalReference = `vizinha-${codigo}`;

    const pedido = await prisma.pedido.create({
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
        produtoNomeSnapshot: produto.nome,
        produtoPrecoSnapshot: subtotal,
        mpExternalReference: externalReference,
        produtoId: produto.id,
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
