import { prisma } from "@/lib/db";
import { getProdutoComboItens } from "@/lib/produtos";
import { getManhiaPassword, isManhiaAuthenticated } from "@/lib/admin-auth";
import { normalizeSaboresList } from "@/lib/sabores";
import { ManhiaLoginForm } from "@/components/manhia-login-form";
import {
  ManhiaAdminDashboard,
  type CupomAdmin,
  type PedidoAdmin,
  type ProdutoAdmin,
  type StoreSettingsData,
} from "@/components/manhia-admin-dashboard";
import { getStoreSettings } from "@/lib/business-hours";
import { normalizeStoreSiteTheme } from "@/lib/site-theme";

type ProdutoWithPromocao = Awaited<
  ReturnType<typeof prisma.produto.findMany>
>[number] & {
  emPromocao?: boolean;
};

async function getProdutos(): Promise<ProdutoAdmin[]> {
  try {
    const produtos = (await prisma.produto.findMany({
      orderBy: { createdAt: "desc" },
    })) as ProdutoWithPromocao[];

    return produtos.map((produto) => ({
      id: produto.id,
      slug: produto.slug,
      nome: produto.nome,
      descricao: produto.descricao,
      preco: Number(produto.preco),
      imagemBase64: produto.imagemBase64,
      categoria: produto.categoria as "CENTO" | "LANCHONETE" | "COMBO",
      totalUnidades: produto.totalUnidades,
      maxTiposSalgado: produto.maxTiposSalgado,
      permitePagamentoParcial: produto.permitePagamentoParcial,
      saboresSugeridos: normalizeSaboresList(produto.saboresSugeridos),
      comboItens: getProdutoComboItens(produto as { comboItens?: unknown }),
      emPromocao: Boolean(produto.emPromocao),
      descontoPercentual: Number(produto.descontoPercentual),
      ativo: produto.ativo,
      createdAt: produto.createdAt.toISOString(),
    }));
  } catch (error) {
    console.error("GET produtos manhia page error", error);
    return [];
  }
}

async function getPedidos(): Promise<PedidoAdmin[]> {
  try {
    const pedidos = await prisma.pedido.findMany({
      orderBy: { createdAt: "desc" },
      include: { itens: true },
    });

    return pedidos.map((pedido) => ({
      id: pedido.id,
      codigo: pedido.codigo,
      clienteNome: pedido.clienteNome,
      clienteTelefone: pedido.clienteTelefone,
      clienteEmail: pedido.clienteEmail,
      observacoes: pedido.observacoes,
      dataEntrega: pedido.dataEntrega.toISOString(),
      percentualPagamento: pedido.percentualPagamento,
      metodoPagamentoLabel: pedido.metodoPagamentoLabel,
      subtotal: Number(pedido.subtotal),
      taxaValor: Number(pedido.taxaValor),
      totalCobrado: Number(pedido.totalCobrado),
      descontoPercentual: Number(pedido.descontoPercentual),
      descontoValor: Number(pedido.descontoValor),
      cupomCodigoSnapshot: pedido.cupomCodigoSnapshot,
      cupomDivulgadorSnapshot: pedido.cupomDivulgadorSnapshot,
      totalUnidades: pedido.totalUnidades,
      totalTipos: pedido.totalTipos,
      status: pedido.status,
      produtoNomeSnapshot: pedido.produtoNomeSnapshot,
      notificadoClienteAt: pedido.notificadoClienteAt?.toISOString() || null,
      notificadoVizinhaAt: pedido.notificadoVizinhaAt?.toISOString() || null,
      prontoAt: (pedido as { prontoAt?: Date | null }).prontoAt?.toISOString() || null,
      notificadoProntoClienteAt:
        (pedido as { notificadoProntoClienteAt?: Date | null }).notificadoProntoClienteAt?.toISOString() || null,
      notificadoToleranciaAt:
        (pedido as { notificadoToleranciaAt?: Date | null }).notificadoToleranciaAt?.toISOString() || null,
      impressoAutomaticamenteAt:
        pedido.impressoAutomaticamenteAt?.toISOString() || null,
      itens: pedido.itens.map((item) => ({
        id: item.id,
        tipo: item.tipo,
        quantidade: item.quantidade,
      })),
    }));
  } catch (error) {
    console.error("GET pedidos manhia page error", error);
    return [];
  }
}

async function getCupons(): Promise<CupomAdmin[]> {
  try {
    const cupons = await prisma.cupomDesconto.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        produto: {
          select: {
            id: true,
            nome: true,
          },
        },
      },
    });

    return cupons.map((cupom) => ({
      id: cupom.id,
      codigo: cupom.codigo,
      produtoId: cupom.produtoId,
      produtoNome: cupom.produto.nome,
      divulgadorNome: cupom.divulgadorNome,
      divulgadorContato: cupom.divulgadorContato,
      descricao: cupom.descricao,
      descontoPercentual: Number(cupom.descontoPercentual),
      ativo: cupom.ativo,
      createdAt: cupom.createdAt.toISOString(),
    }));
  } catch (error) {
    console.error("GET cupons manhia page error", error);
    return [];
  }
}

export default async function ManhiaPage() {
  const isConfigured = Boolean(getManhiaPassword());
  const authenticated = await isManhiaAuthenticated();

  if (!authenticated) {
    return <ManhiaLoginForm isConfigured={isConfigured} />;
  }

  const [produtos, pedidos, cupons, settingsRaw] = await Promise.all([
    getProdutos(),
    getPedidos(),
    getCupons(),
    getStoreSettings(),
  ]);

  const initialSettings: StoreSettingsData = {
    isOpen: settingsRaw.isOpen,
    minimumLeadHours: settingsRaw.minimumLeadHours,
    allowMultipleOrdersPerSlot: settingsRaw.allowMultipleOrdersPerSlot,
    siteTheme: normalizeStoreSiteTheme(settingsRaw.siteTheme),
    featuredProductId: settingsRaw.featuredProductId,
  };

  return (
    <ManhiaAdminDashboard
      initialProdutos={produtos}
      initialPedidos={pedidos}
      initialCupons={cupons}
      initialSettings={initialSettings}
    />
  );
}
