CREATE TABLE "BotFlow" (
  "id" TEXT NOT NULL,
  "nome" TEXT NOT NULL,
  "descricao" TEXT,
  "instanceId" TEXT,
  "gatilho" TEXT NOT NULL,
  "resposta" TEXT NOT NULL,
  "ativo" BOOLEAN NOT NULL DEFAULT true,
  "prioridade" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "BotFlow_pkey" PRIMARY KEY ("id")
);
