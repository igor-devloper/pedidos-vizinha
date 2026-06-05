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
    <main className="mx-auto max-w-md bg-white p-6 text-[13px] text-slate-900 print:max-w-none print:p-4">
      <AutoPrint enabled={query.auto === "1"} />
      <div className="space-y-2 text-center">
        <p className="text-lg font-bold">Vizinha Salgateria</p>
        <p>Pedido {pedido.codigo}</p>
        <p>{formatDateTime(pedido.dataEntrega.toISOString())}</p>
      </div>

      <div className="mt-5 border-t border-dashed border-slate-400 pt-4">
        <p>Cliente: {pedido.clienteNome}</p>
        <p>Telefone: {pedido.clienteTelefone}</p>
        {pedido.clienteEmail && <p>E-mail: {pedido.clienteEmail}</p>}
        <p>Produto: {pedido.produtoNomeSnapshot}</p>
        <p>
          Pagamento: {pedido.percentualPagamento}% via {pedido.metodoPagamentoLabel}
        </p>
      </div>

      <div className="mt-5 border-t border-dashed border-slate-400 pt-4">
        {pedido.itens.map((item) => (
          <p key={item.id}>
            {item.tipo} x {item.quantidade}
          </p>
        ))}
      </div>

      <div className="mt-5 border-t border-dashed border-slate-400 pt-4">
        <p>Subtotal: {formatCurrency(Number(pedido.subtotal))}</p>
        <p>Taxa de serviço: {formatCurrency(Number(pedido.taxaValor))}</p>
        <p className="font-bold">Total: {formatCurrency(Number(pedido.totalCobrado))}</p>
      </div>

      {pedido.observacoes && (
        <div className="mt-5 border-t border-dashed border-slate-400 pt-4">
          <p>Obs: {pedido.observacoes}</p>
        </div>
      )}

      <div className="mt-6 print:hidden">
        <PrintButton />
      </div>
    </main>
  );
}
