import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const DEFAULT_PRODUCT_TYPES = [
  { name: "Cento", description: "100 unidades de salgado", minQuantity: 100, allowsMultiple: true },
  { name: "Meio Cento", description: "50 unidades de salgado", minQuantity: 50, allowsMultiple: true },
  { name: "Porção", description: "30 unidades de salgado", minQuantity: 30, allowsMultiple: true },
  { name: "Avulso", description: "Produto vendido por unidade", minQuantity: 1, allowsMultiple: true },
] as const;

async function main() {
  for (const type of DEFAULT_PRODUCT_TYPES) {
    await prisma.productType.upsert({
      where: { name: type.name },
      update: type,
      create: type,
    });
  }

  const [cento, meioCento, porcao, avulso] = await Promise.all([
    prisma.productType.findUniqueOrThrow({ where: { name: "Cento" } }),
    prisma.productType.findUniqueOrThrow({ where: { name: "Meio Cento" } }),
    prisma.productType.findUniqueOrThrow({ where: { name: "Porção" } }),
    prisma.productType.findUniqueOrThrow({ where: { name: "Avulso" } }),
  ]);

  const produtos = await prisma.produto.findMany({
    where: { productTypeId: null },
    select: { id: true, categoria: true, totalUnidades: true },
  });

  for (const produto of produtos) {
    const productTypeId =
      produto.categoria === "LANCHONETE"
        ? avulso.id
        : produto.totalUnidades === 50
          ? meioCento.id
          : produto.totalUnidades === 30
            ? porcao.id
            : cento.id;

    await prisma.produto.update({
      where: { id: produto.id },
      data: { productTypeId },
    });
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
