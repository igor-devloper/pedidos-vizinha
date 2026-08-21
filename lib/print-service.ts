import type { Pedido, PedidoItem } from "@prisma/client";

import { buildPrintableReceipt } from "@/lib/pedidos";

type PedidoWithItens = Pedido & {
  itens: PedidoItem[];
};

type PrintReason = "auto-accepted" | "manual";

function getPrintServiceUrl() {
  return (
    process.env.PRINT_SERVICE_URL?.trim() ||
    process.env.BAILEYS_SERVICE_URL?.trim() ||
    process.env.BOT_SERVICE_URL?.trim() ||
    ""
  );
}

function getPrintApiKey() {
  return (
    process.env.PRINT_SERVICE_API_KEY?.trim() ||
    process.env.BOT_API_KEY?.trim() ||
    process.env.BOT_SERVICE_API_KEY?.trim() ||
    ""
  );
}

export async function sendPedidoToPrintService(
  pedido: PedidoWithItens,
  reason: PrintReason
) {
  const baseUrl = getPrintServiceUrl();
  const apiKey = getPrintApiKey();

  if (!baseUrl || !apiKey) {
    console.warn("Thermal print skipped: print service is not configured.", {
      pedidoId: pedido.id,
      codigo: pedido.codigo,
      reason,
    });
    return { ok: false, skipped: true };
  }

  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/print-jobs`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey.replace(/^Bearer\s+/i, "")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      orderId: pedido.id,
      code: pedido.codigo,
      reason,
      printer: {
        model: "Knup KP-IM607",
        widthMm: 58,
        dpi: 203,
        commandSet: "ESC/POS",
      },
      receipt: buildPrintableReceipt(pedido),
      order: {
        customerName: pedido.clienteNome,
        customerPhone: pedido.clienteTelefone,
        deliveryAt: pedido.dataEntrega.toISOString(),
        productName: pedido.produtoNomeSnapshot,
        total: Number(pedido.totalCobrado),
      },
    }),
    signal: AbortSignal.timeout(6000),
  });

  if (!response.ok) {
    const details = await response.text().catch(() => "");
    throw new Error(`Falha ao enviar pedido para impressora: ${response.status} ${details}`);
  }

  return response.json().catch(() => ({ ok: true }));
}

export async function sendCartOrderToPrintService({
  orderId,
  code,
  reason,
  receipt,
  customerName,
  customerPhone,
  deliveryAt,
  total,
  isConfeiteira,
}: {
  orderId: string;
  code: string;
  reason: PrintReason;
  receipt: string;
  customerName?: string | null;
  customerPhone?: string | null;
  deliveryAt?: string | null;
  total: number;
  isConfeiteira?: boolean;
}) {
  const baseUrl = getPrintServiceUrl();
  const apiKey = getPrintApiKey();

  if (!baseUrl || !apiKey) {
    console.warn("Thermal print skipped: print service is not configured.", {
      orderId,
      code,
      reason,
    });
    return { ok: false, skipped: true };
  }

  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/print-jobs`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey.replace(/^Bearer\s+/i, "")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      orderId,
      code,
      reason,
      printer: {
        model: "Knup KP-IM607",
        widthMm: 58,
        dpi: 203,
        commandSet: "ESC/POS",
      },
      receipt,
      order: {
        customerName,
        customerPhone,
        deliveryAt,
        productName: "Pedido do carrinho",
        isConfeiteira: Boolean(isConfeiteira),
        total,
      },
    }),
    signal: AbortSignal.timeout(6000),
  });

  if (!response.ok) {
    const details = await response.text().catch(() => "");
    throw new Error(`Falha ao enviar pedido para impressora: ${response.status} ${details}`);
  }

  return response.json().catch(() => ({ ok: true }));
}
