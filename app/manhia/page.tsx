import { prisma } from "@/lib/db";
import { getManhiaPassword, isManhiaAuthenticated } from "@/lib/admin-auth";
import { ManhiaLoginForm } from "@/components/manhia-login-form";
import {
  ManhiaProdutosAdmin,
  type ProdutoAdmin,
} from "@/components/manhia-produtos-admin";

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
      nome: produto.nome,
      descricao: produto.descricao,
      preco: Number(produto.preco),
      imagemBase64: produto.imagemBase64,
      categoria: produto.categoria,
      emPromocao: Boolean(produto.emPromocao),
      ativo: produto.ativo,
      createdAt: produto.createdAt.toISOString(),
    }));
  } catch (error) {
    console.error("GET produtos manhia page error", error);
    return [];
  }
}

export default async function ManhiaPage() {
  const isConfigured = Boolean(getManhiaPassword());
  const authenticated = await isManhiaAuthenticated();

  if (!authenticated) {
    return <ManhiaLoginForm isConfigured={isConfigured} />;
  }

  const produtos = await getProdutos();
  return <ManhiaProdutosAdmin initialProdutos={produtos} />;
}
