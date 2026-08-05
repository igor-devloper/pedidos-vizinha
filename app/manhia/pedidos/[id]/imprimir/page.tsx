import { redirect } from "next/navigation";

import { AutoPrint } from "@/components/auto-print";
import { PrintButton } from "@/components/print-button";
import { isManhiaAuthenticated } from "@/lib/admin-auth";
import { prisma } from "@/lib/db";
import { formatCurrency, formatDateTime } from "@/lib/pedidos";

export default async function ImprimirPedidoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ auto?: string }>;
}) {
  const authenticated = await isManhiaAuthenticated();
  if (!authenticated) {
    redirect("/manhia");
  }

  const [{ id }, query] = await Promise.all([params, searchParams]);
  const pedido = await prisma.pedido.findUnique({
    where: { id },
    include: { itens: true },
  });

  if (!pedido) {
    return <main className="p-6 text-sm text-slate-500">Pedido não encontrado.</main>;
  }

  return (
    <main className="thermal-print-page mx-auto w-full max-w-md bg-white p-6 text-[12px] leading-tight text-slate-900 print:m-0 print:w-[58mm] print:max-w-none print:p-0">
      <AutoPrint enabled={query.auto === "1"} />
      <style>
        {`
          @page {
            size: 58mm 150mm;
            margin: 0;
          }

          @media print {
            html,
            body {
              width: 58mm;
              min-width: 58mm;
              height: auto;
              margin: 0 !important;
              padding: 0 !important;
              overflow: visible;
              background: #fff !important;
            }

            body * {
              visibility: hidden;
            }

            .thermal-print-page,
            .thermal-print-page * {
              visibility: visible;
            }

            .thermal-print-page {
              position: absolute;
              left: 0;
              top: 0;
              width: 58mm !important;
              max-width: 58mm !important;
              min-height: 0 !important;
              height: auto !important;
              padding: 2mm 3mm 0 !important;
              color: #000 !important;
              font-family: Arial, sans-serif !important;
              font-size: 9.5px !important;
              line-height: 1.22 !important;
              break-after: avoid;
              page-break-after: avoid;
            }

            .thermal-receipt {
              width: 52mm;
              break-inside: avoid;
              page-break-inside: avoid;
            }

            .thermal-section {
              margin-top: 2.5mm !important;
              padding-top: 2mm !important;
            }

            .thermal-print-hidden {
              display: none !important;
            }
          }
        `}
      </style>

      <div className="thermal-receipt">
        <div className="space-y-1 text-center">
          <p className="text-base font-bold leading-tight print:text-[13px]">
            Vizinha Salgateria
          </p>
          <p>Pedido {pedido.codigo}</p>
          <p>Feito em: {formatDateTime(pedido.createdAt.toISOString())}</p>
          <p>{formatDateTime(pedido.dataEntrega.toISOString())}</p>
        </div>

        <div className="thermal-section mt-4 border-t border-dashed border-slate-400 pt-3">
          <p>Cliente: {pedido.clienteNome}</p>
          <p>Telefone: {pedido.clienteTelefone}</p>
          {pedido.clienteEmail && <p>E-mail: {pedido.clienteEmail}</p>}
          <p>Produto: {pedido.produtoNomeSnapshot}</p>
          <p>
            Pagamento: {pedido.percentualPagamento}% via {pedido.metodoPagamentoLabel}
          </p>
        </div>

        <div className="thermal-section mt-4 border-t border-dashed border-slate-400 pt-3">
          {pedido.itens.map((item) => (
            <p key={item.id}>
              {item.tipo} x {item.quantidade}
            </p>
          ))}
        </div>

        <div className="thermal-section mt-4 border-t border-dashed border-slate-400 pt-3">
          <p>Subtotal: {formatCurrency(Number(pedido.subtotal))}</p>
          <p>Taxa de serviço: {formatCurrency(Number(pedido.taxaValor))}</p>
          <p className="font-bold">Total: {formatCurrency(Number(pedido.totalCobrado))}</p>
        </div>

        {pedido.observacoes && (
          <div className="thermal-section mt-4 border-t border-dashed border-slate-400 pt-3">
            <p>Obs: {pedido.observacoes}</p>
          </div>
        )}
      </div>

      <div className="thermal-print-hidden mt-6 print:hidden">
        <PrintButton pedidoId={pedido.id} />
      </div>
    </main>
  );
}
