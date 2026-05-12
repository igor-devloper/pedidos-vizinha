import { getManhiaPassword, isManhiaAuthenticated } from "@/lib/admin-auth";
import { getBotServiceMeta } from "@/lib/bot-service";
import { prisma } from "@/lib/db";
import { ManhiaLoginForm } from "@/components/manhia-login-form";
import { ManhiaBotDashboard } from "@/components/manhia-bot-dashboard";

type InstanceItem = {
  id: string;
  name: string;
  phoneNumber?: string;
  status: string;
  webhookUrl?: string;
  createdAt: string;
  updatedAt: string;
  lastConnectedAt?: string;
  lastDisconnectReason?: string;
};

type FlowItem = {
  id: string;
  nome: string;
  descricao: string | null;
  instanceId: string | null;
  gatilho: string;
  resposta: string;
  ativo: boolean;
  prioridade: number;
  createdAt: string;
};

async function getFlows(): Promise<FlowItem[]> {
  try {
    const flows = await prisma.botFlow.findMany({
      orderBy: [{ prioridade: "asc" }, { createdAt: "desc" }],
    });

    return flows.map((flow) => ({
      id: flow.id,
      nome: flow.nome,
      descricao: flow.descricao,
      instanceId: flow.instanceId,
      gatilho: flow.gatilho,
      resposta: flow.resposta,
      ativo: flow.ativo,
      prioridade: flow.prioridade,
      createdAt: flow.createdAt.toISOString(),
    }));
  } catch (error) {
    console.error("GET flows dashboard error", error);
    return [];
  }
}

async function getInstances(): Promise<InstanceItem[]> {
  const { configured } = getBotServiceMeta();

  if (!configured) {
    return [];
  }

  try {
    const response = await fetch(
      `${process.env.BOT_SERVICE_URL}/instances`,
      {
        headers: {
          Authorization: `Bearer ${process.env.BOT_SERVICE_API_KEY}`,
        },
        cache: "no-store",
      }
    );

    if (!response.ok) {
      return [];
    }

    return (await response.json()) as InstanceItem[];
  } catch (error) {
    console.error("GET instances dashboard error", error);
    return [];
  }
}

export default async function ManhiaBotPage() {
  const isConfigured = Boolean(getManhiaPassword());
  const authenticated = await isManhiaAuthenticated();

  if (!authenticated) {
    return <ManhiaLoginForm isConfigured={isConfigured} />;
  }

  const [instances, flows] = await Promise.all([getInstances(), getFlows()]);
  const botMeta = getBotServiceMeta();

  return (
    <ManhiaBotDashboard
      initialInstances={instances}
      initialFlows={flows}
      botConfigured={botMeta.configured}
      botBaseUrl={botMeta.baseUrl}
    />
  );
}
