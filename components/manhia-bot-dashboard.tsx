"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  Bot,
  LoaderCircle,
  PauseCircle,
  PlayCircle,
  Plus,
  QrCode,
  RefreshCw,
  Save,
  Trash2,
  WandSparkles,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";

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

type FlowFormState = {
  nome: string;
  descricao: string;
  instanceId: string;
  gatilho: string;
  resposta: string;
  ativo: boolean;
  prioridade: string;
};

const EMPTY_FLOW: FlowFormState = {
  nome: "",
  descricao: "",
  instanceId: "",
  gatilho: "",
  resposta: "",
  ativo: true,
  prioridade: "0",
};

function getStatusClass(status: string) {
  switch (status) {
    case "connected":
      return "border border-emerald-200 bg-emerald-50 text-emerald-700";
    case "qr":
      return "border border-amber-200 bg-amber-50 text-amber-700";
    case "connecting":
      return "border border-sky-200 bg-sky-50 text-sky-700";
    case "disconnected":
      return "border border-slate-200 bg-slate-100 text-slate-600";
    default:
      return "border border-pink-200 bg-pink-50 text-pink-700";
  }
}

export function ManhiaBotDashboard({
  initialInstances,
  initialFlows,
  botConfigured,
  botBaseUrl,
}: {
  initialInstances: InstanceItem[];
  initialFlows: FlowItem[];
  botConfigured: boolean;
  botBaseUrl: string | null;
}) {
  const [instances, setInstances] = useState(initialInstances);
  const [flows, setFlows] = useState(initialFlows);
  const [loadingInstances, setLoadingInstances] = useState(false);
  const [creatingInstance, setCreatingInstance] = useState(false);
  const [actingInstanceId, setActingInstanceId] = useState<string | null>(null);
  const [qrInstanceId, setQrInstanceId] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [qrStatus, setQrStatus] = useState<"idle" | "loading" | "error">("idle");
  const [editingFlowId, setEditingFlowId] = useState<string | null>(null);
  const [savingFlow, setSavingFlow] = useState(false);
  const [deletingFlowId, setDeletingFlowId] = useState<string | null>(null);
  const [instanceForm, setInstanceForm] = useState({
    name: "",
    phoneNumber: "",
    webhookUrl: "",
  });
  const [flowForm, setFlowForm] = useState<FlowFormState>(EMPTY_FLOW);

  const connectedCount = useMemo(
    () => instances.filter((instance) => instance.status === "connected").length,
    [instances]
  );

  const refreshInstances = async () => {
    try {
      setLoadingInstances(true);
      const response = await fetch("/api/manhia/bot/instances", {
        cache: "no-store",
      });
      const data = (await response.json().catch(() => null)) as
        | InstanceItem[]
        | { error?: string }
        | null;

      if (!response.ok || !Array.isArray(data)) {
        const message =
          data && typeof data === "object" && "error" in data
            ? data.error
            : "Falha ao atualizar instancias.";
        throw new Error(message || "Falha ao atualizar instancias.");
      }

      setInstances(data);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Falha ao atualizar instancias.";
      toast.error(message);
    } finally {
      setLoadingInstances(false);
    }
  };

  const refreshFlows = async () => {
    try {
      const response = await fetch("/api/manhia/bot/flows", {
        cache: "no-store",
      });
      const data = (await response.json().catch(() => null)) as
        | FlowItem[]
        | { error?: string }
        | null;

      if (!response.ok || !Array.isArray(data)) {
        const message =
          data && typeof data === "object" && "error" in data
            ? data.error
            : "Falha ao atualizar fluxos.";
        throw new Error(message || "Falha ao atualizar fluxos.");
      }

      setFlows(data);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Falha ao atualizar fluxos.";
      toast.error(message);
    }
  };

  const fetchQr = async (instanceId: string) => {
    try {
      setQrStatus("loading");
      const response = await fetch(`/api/manhia/bot/instances/${instanceId}/qr`, {
        cache: "no-store",
      });
      const data = (await response.json().catch(() => null)) as
        | { dataUrl?: string; error?: string }
        | null;

      if (!response.ok || !data?.dataUrl) {
        const message = data?.error || "QR ainda nao disponivel.";
        throw new Error(message);
      }

      setQrDataUrl(data.dataUrl);
      setQrStatus("idle");
    } catch (error) {
      setQrDataUrl(null);
      setQrStatus("error");
      const message = error instanceof Error ? error.message : "Falha ao buscar QR.";
      toast.error(message);
    }
  };

  useEffect(() => {
    if (!qrInstanceId) {
      return;
    }

    void fetchQr(qrInstanceId);

    const interval = window.setInterval(() => {
      void fetchQr(qrInstanceId);
      void refreshInstances();
    }, 4000);

    return () => window.clearInterval(interval);
  }, [qrInstanceId]);

  const handleCreateInstance = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    try {
      setCreatingInstance(true);
      const response = await fetch("/api/manhia/bot/instances", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: instanceForm.name,
          phoneNumber: instanceForm.phoneNumber || undefined,
          webhookUrl: instanceForm.webhookUrl || undefined,
        }),
      });

      const data = (await response.json().catch(() => null)) as
        | InstanceItem
        | { error?: string }
        | null;

      if (!response.ok || !data || "error" in data) {
        throw new Error(data?.error || "Falha ao criar instancia.");
      }

      setInstances((current) => [data, ...current]);
      setInstanceForm({ name: "", phoneNumber: "", webhookUrl: "" });
      toast.success("Instancia criada.");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Falha ao criar instancia.";
      toast.error(message);
    } finally {
      setCreatingInstance(false);
    }
  };

  const handleInstanceAction = async (
    instanceId: string,
    action: "start" | "stop" | "delete"
  ) => {
    try {
      setActingInstanceId(instanceId);
      const response = await fetch(
        action === "delete"
          ? `/api/manhia/bot/instances/${instanceId}`
          : `/api/manhia/bot/instances/${instanceId}/${action}`,
        {
          method: action === "delete" ? "DELETE" : "POST",
        }
      );

      const data = (await response.json().catch(() => null)) as
        | InstanceItem
        | { removed?: boolean; error?: string }
        | null;

      if (!response.ok) {
        throw new Error(
          data && typeof data === "object" && "error" in data
            ? data.error
            : "Falha ao executar acao."
        );
      }

      if (action === "delete") {
        setInstances((current) => current.filter((item) => item.id !== instanceId));
        if (qrInstanceId === instanceId) {
          setQrInstanceId(null);
          setQrDataUrl(null);
        }
      } else if (data && !("removed" in data)) {
        setInstances((current) =>
          current.map((item) => (item.id === instanceId ? data : item))
        );
      }

      toast.success(
        action === "start"
          ? "Instancia iniciada."
          : action === "stop"
            ? "Instancia parada."
            : "Instancia excluida."
      );

      void refreshInstances();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Falha ao executar acao.";
      toast.error(message);
    } finally {
      setActingInstanceId(null);
    }
  };

  const resetFlowForm = () => {
    setFlowForm(EMPTY_FLOW);
    setEditingFlowId(null);
  };

  const handleSaveFlow = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    try {
      setSavingFlow(true);
      const response = await fetch(
        editingFlowId
          ? `/api/manhia/bot/flows/${editingFlowId}`
          : "/api/manhia/bot/flows",
        {
          method: editingFlowId ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            nome: flowForm.nome,
            descricao: flowForm.descricao || undefined,
            instanceId: flowForm.instanceId || undefined,
            gatilho: flowForm.gatilho,
            resposta: flowForm.resposta,
            ativo: flowForm.ativo,
            prioridade: Number(flowForm.prioridade || 0),
          }),
        }
      );

      const data = (await response.json().catch(() => null)) as
        | FlowItem
        | { error?: string }
        | null;

      if (!response.ok || !data || "error" in data) {
        throw new Error(data?.error || "Falha ao salvar fluxo.");
      }

      if (editingFlowId) {
        setFlows((current) =>
          current.map((item) => (item.id === data.id ? data : item))
        );
      } else {
        setFlows((current) => [data, ...current]);
      }

      toast.success(editingFlowId ? "Fluxo atualizado." : "Fluxo criado.");
      resetFlowForm();
      void refreshFlows();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Falha ao salvar fluxo.";
      toast.error(message);
    } finally {
      setSavingFlow(false);
    }
  };

  const handleEditFlow = (flow: FlowItem) => {
    setEditingFlowId(flow.id);
    setFlowForm({
      nome: flow.nome,
      descricao: flow.descricao || "",
      instanceId: flow.instanceId || "",
      gatilho: flow.gatilho,
      resposta: flow.resposta,
      ativo: flow.ativo,
      prioridade: String(flow.prioridade),
    });
  };

  const handleDeleteFlow = async (flowId: string) => {
    try {
      setDeletingFlowId(flowId);
      const response = await fetch(`/api/manhia/bot/flows/${flowId}`, {
        method: "DELETE",
      });

      const data = (await response.json().catch(() => null)) as
        | { ok?: boolean; error?: string }
        | null;

      if (!response.ok) {
        throw new Error(data?.error || "Falha ao excluir fluxo.");
      }

      setFlows((current) => current.filter((item) => item.id !== flowId));
      if (editingFlowId === flowId) {
        resetFlowForm();
      }
      toast.success("Fluxo excluido.");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Falha ao excluir fluxo.";
      toast.error(message);
    } finally {
      setDeletingFlowId(null);
    }
  };

  return (
    <main className="px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <section className="flex flex-col gap-4 rounded-[2rem] border border-pink-200/80 bg-white/95 p-6 shadow-xl shadow-pink-100/50">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-2">
              <Badge className="border border-pink-200 bg-pink-100 text-pink-700">
                Painel estilo Sinapse
              </Badge>
              <h1 className="text-3xl font-semibold text-pink-800">
                Dashboard de instancias e fluxos
              </h1>
              <p className="max-w-3xl text-sm leading-6 text-slate-500">
                Aqui voce gerencia instancias, abre QR em tempo real e edita os
                fluxos automatizados do bot.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <Button
                asChild
                variant="outline"
                className="rounded-full border-pink-200 text-pink-700 hover:bg-pink-50"
              >
                <Link href="/manhia">Produtos</Link>
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => void refreshInstances()}
                className="rounded-full border-pink-200 text-pink-700 hover:bg-pink-50"
              >
                <RefreshCw className="mr-2 h-4 w-4" />
                Atualizar
              </Button>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-2xl border border-pink-100 bg-pink-50/80 p-4">
              <p className="text-xs uppercase tracking-[0.25em] text-pink-500">
                Instancias
              </p>
              <p className="mt-2 text-2xl font-semibold text-slate-900">
                {instances.length}
              </p>
            </div>
            <div className="rounded-2xl border border-pink-100 bg-pink-50/80 p-4">
              <p className="text-xs uppercase tracking-[0.25em] text-pink-500">
                Conectadas
              </p>
              <p className="mt-2 text-2xl font-semibold text-slate-900">
                {connectedCount}
              </p>
            </div>
            <div className="rounded-2xl border border-pink-100 bg-pink-50/80 p-4">
              <p className="text-xs uppercase tracking-[0.25em] text-pink-500">
                Fluxos
              </p>
              <p className="mt-2 text-2xl font-semibold text-slate-900">
                {flows.length}
              </p>
            </div>
            <div className="rounded-2xl border border-pink-100 bg-pink-50/80 p-4">
              <p className="text-xs uppercase tracking-[0.25em] text-pink-500">
                Servico do bot
              </p>
              <p className="mt-2 text-sm font-semibold text-slate-900">
                {botConfigured ? "Configurado" : "Pendente"}
              </p>
              {botBaseUrl && (
                <p className="mt-1 break-all text-xs text-slate-500">{botBaseUrl}</p>
              )}
            </div>
          </div>

          {!botConfigured && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
              Defina `BOT_SERVICE_URL` e `BOT_SERVICE_API_KEY` no app Next para o
              painel conseguir conversar com o servico do bot.
            </div>
          )}
        </section>

        <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
          <section className="space-y-6">
            <Card className="border-pink-200 bg-white/95 shadow-lg shadow-pink-100/40">
              <CardHeader>
                <CardTitle className="text-pink-800">
                  Criar nova instancia
                </CardTitle>
              </CardHeader>
              <CardContent>
                <form className="grid gap-4 md:grid-cols-2" onSubmit={handleCreateInstance}>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-700">
                      Nome da instancia
                    </label>
                    <Input
                      value={instanceForm.name}
                      onChange={(event) =>
                        setInstanceForm((current) => ({
                          ...current,
                          name: event.target.value,
                        }))
                      }
                      placeholder="Ex: Atendimento Vizinha"
                      className="border-pink-100 bg-white focus-visible:ring-pink-400"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-700">
                      Numero principal
                    </label>
                    <Input
                      value={instanceForm.phoneNumber}
                      onChange={(event) =>
                        setInstanceForm((current) => ({
                          ...current,
                          phoneNumber: event.target.value,
                        }))
                      }
                      placeholder="5583..."
                      className="border-pink-100 bg-white focus-visible:ring-pink-400"
                    />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <label className="text-sm font-medium text-slate-700">
                      Webhook da instancia
                    </label>
                    <Input
                      value={instanceForm.webhookUrl}
                      onChange={(event) =>
                        setInstanceForm((current) => ({
                          ...current,
                          webhookUrl: event.target.value,
                        }))
                      }
                      placeholder="https://seu-backend.com/webhooks/whatsapp"
                      className="border-pink-100 bg-white focus-visible:ring-pink-400"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <Button
                      type="submit"
                      disabled={creatingInstance || !botConfigured}
                      className="rounded-full bg-pink-600 text-white hover:bg-pink-700"
                    >
                      {creatingInstance ? (
                        <>
                          <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
                          Criando...
                        </>
                      ) : (
                        <>
                          <Plus className="mr-2 h-4 w-4" />
                          Criar instancia
                        </>
                      )}
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>

            <Card className="border-pink-200 bg-white/95 shadow-lg shadow-pink-100/40">
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-pink-800">Instancias</CardTitle>
                {loadingInstances && (
                  <LoaderCircle className="h-4 w-4 animate-spin text-pink-500" />
                )}
              </CardHeader>
              <CardContent className="space-y-4">
                {instances.length === 0 ? (
                  <p className="text-sm text-slate-500">
                    Nenhuma instancia cadastrada ainda.
                  </p>
                ) : (
                  instances.map((instance) => (
                    <div
                      key={instance.id}
                      className="rounded-3xl border border-pink-100 bg-gradient-to-b from-white to-pink-50/60 p-5"
                    >
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                        <div className="space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <h2 className="text-lg font-semibold text-slate-900">
                              {instance.name}
                            </h2>
                            <Badge className={getStatusClass(instance.status)}>
                              {instance.status}
                            </Badge>
                          </div>
                          <p className="text-sm text-slate-500">
                            ID: <span className="font-mono text-xs">{instance.id}</span>
                          </p>
                          {instance.phoneNumber && (
                            <p className="text-sm text-slate-500">
                              Numero: {instance.phoneNumber}
                            </p>
                          )}
                          {instance.webhookUrl && (
                            <p className="break-all text-sm text-slate-500">
                              Webhook: {instance.webhookUrl}
                            </p>
                          )}
                          {instance.lastConnectedAt && (
                            <p className="text-xs text-slate-400">
                              Ultima conexao:{" "}
                              {new Date(instance.lastConnectedAt).toLocaleString("pt-BR")}
                            </p>
                          )}
                        </div>

                        <div className="flex flex-wrap gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            disabled={actingInstanceId === instance.id || !botConfigured}
                            onClick={() => void handleInstanceAction(instance.id, "start")}
                            className="rounded-full border-pink-200 text-pink-700 hover:bg-pink-50"
                          >
                            <PlayCircle className="mr-2 h-4 w-4" />
                            Iniciar
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            disabled={actingInstanceId === instance.id || !botConfigured}
                            onClick={() => void handleInstanceAction(instance.id, "stop")}
                            className="rounded-full border-pink-200 text-pink-700 hover:bg-pink-50"
                          >
                            <PauseCircle className="mr-2 h-4 w-4" />
                            Parar
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            disabled={!botConfigured}
                            onClick={() => {
                              setQrInstanceId(instance.id);
                              setQrDataUrl(null);
                              setQrStatus("loading");
                            }}
                            className="rounded-full border-pink-200 text-pink-700 hover:bg-pink-50"
                          >
                            <QrCode className="mr-2 h-4 w-4" />
                            Ver QR
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            disabled={actingInstanceId === instance.id || !botConfigured}
                            onClick={() => void handleInstanceAction(instance.id, "delete")}
                            className="rounded-full border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Excluir
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </section>

          <section className="space-y-6">
            <Card className="border-pink-200 bg-white/95 shadow-lg shadow-pink-100/40">
              <CardHeader>
                <CardTitle className="text-pink-800">CRUD visual de fluxos</CardTitle>
              </CardHeader>
              <CardContent>
                <form className="space-y-4" onSubmit={handleSaveFlow}>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-slate-700">
                        Nome do fluxo
                      </label>
                      <Input
                        value={flowForm.nome}
                        onChange={(event) =>
                          setFlowForm((current) => ({
                            ...current,
                            nome: event.target.value,
                          }))
                        }
                        placeholder="Ex: Menu inicial"
                        className="border-pink-100 bg-white focus-visible:ring-pink-400"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-slate-700">
                        Instancia
                      </label>
                      <select
                        value={flowForm.instanceId}
                        onChange={(event) =>
                          setFlowForm((current) => ({
                            ...current,
                            instanceId: event.target.value,
                          }))
                        }
                        className="h-9 w-full rounded-md border border-pink-100 bg-white px-3 text-sm text-slate-700 outline-none focus:border-pink-300"
                      >
                        <option value="">Todas / global</option>
                        {instances.map((instance) => (
                          <option key={instance.id} value={instance.id}>
                            {instance.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-700">
                      Descricao
                    </label>
                    <Input
                      value={flowForm.descricao}
                      onChange={(event) =>
                        setFlowForm((current) => ({
                          ...current,
                          descricao: event.target.value,
                        }))
                      }
                      placeholder="Resumo rapido do papel desse fluxo"
                      className="border-pink-100 bg-white focus-visible:ring-pink-400"
                    />
                  </div>

                  <div className="grid gap-4 md:grid-cols-[1fr_160px]">
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-slate-700">
                        Gatilho
                      </label>
                      <Input
                        value={flowForm.gatilho}
                        onChange={(event) =>
                          setFlowForm((current) => ({
                            ...current,
                            gatilho: event.target.value,
                          }))
                        }
                        placeholder="Ex: oi, menu, 1"
                        className="border-pink-100 bg-white focus-visible:ring-pink-400"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-slate-700">
                        Prioridade
                      </label>
                      <Input
                        type="number"
                        min="0"
                        value={flowForm.prioridade}
                        onChange={(event) =>
                          setFlowForm((current) => ({
                            ...current,
                            prioridade: event.target.value,
                          }))
                        }
                        className="border-pink-100 bg-white focus-visible:ring-pink-400"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-700">
                      Resposta
                    </label>
                    <Textarea
                      value={flowForm.resposta}
                      onChange={(event) =>
                        setFlowForm((current) => ({
                          ...current,
                          resposta: event.target.value,
                        }))
                      }
                      placeholder={"Oi! Escolha uma opcao:\n1 - Cardapio\n2 - Atendente"}
                      className="min-h-32 border-pink-100 bg-white focus-visible:ring-pink-400"
                    />
                  </div>

                  <label className="flex items-center gap-3 rounded-2xl border border-pink-100 bg-pink-50/70 px-4 py-3 text-sm text-slate-600">
                    <input
                      type="checkbox"
                      checked={flowForm.ativo}
                      onChange={(event) =>
                        setFlowForm((current) => ({
                          ...current,
                          ativo: event.target.checked,
                        }))
                      }
                    />
                    Deixar esse fluxo ativo.
                  </label>

                  <div className="flex flex-wrap gap-3">
                    <Button
                      type="submit"
                      disabled={savingFlow}
                      className="rounded-full bg-pink-600 text-white hover:bg-pink-700"
                    >
                      {savingFlow ? (
                        <>
                          <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
                          Salvando...
                        </>
                      ) : (
                        <>
                          <Save className="mr-2 h-4 w-4" />
                          {editingFlowId ? "Atualizar fluxo" : "Criar fluxo"}
                        </>
                      )}
                    </Button>
                    {editingFlowId && (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={resetFlowForm}
                        className="rounded-full border-pink-200 text-pink-700 hover:bg-pink-50"
                      >
                        Cancelar edicao
                      </Button>
                    )}
                  </div>
                </form>
              </CardContent>
            </Card>

            <Card className="border-pink-200 bg-white/95 shadow-lg shadow-pink-100/40">
              <CardHeader>
                <CardTitle className="text-pink-800">Fluxos cadastrados</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {flows.length === 0 ? (
                  <p className="text-sm text-slate-500">
                    Nenhum fluxo cadastrado ainda.
                  </p>
                ) : (
                  flows.map((flow) => (
                    <div
                      key={flow.id}
                      className="rounded-3xl border border-pink-100 bg-gradient-to-b from-white to-pink-50/60 p-5"
                    >
                      <div className="flex flex-col gap-4">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div className="space-y-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="text-lg font-semibold text-slate-900">
                                {flow.nome}
                              </h3>
                              <Badge
                                className={
                                  flow.ativo
                                    ? "border border-emerald-200 bg-emerald-50 text-emerald-700"
                                    : "border border-slate-200 bg-slate-100 text-slate-600"
                                }
                              >
                                {flow.ativo ? "Ativo" : "Pausado"}
                              </Badge>
                              <Badge className="border border-pink-200 bg-white text-pink-700">
                                Prioridade {flow.prioridade}
                              </Badge>
                            </div>
                            {flow.descricao && (
                              <p className="text-sm text-slate-500">{flow.descricao}</p>
                            )}
                          </div>
                          <div className="text-xs text-slate-400">
                            {flow.instanceId ? `Instancia ${flow.instanceId}` : "Global"}
                          </div>
                        </div>

                        <Separator className="bg-pink-100" />

                        <div className="grid gap-4 md:grid-cols-2">
                          <div className="rounded-2xl border border-pink-100 bg-white p-4">
                            <p className="text-xs uppercase tracking-[0.2em] text-pink-500">
                              Gatilho
                            </p>
                            <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">
                              {flow.gatilho}
                            </p>
                          </div>
                          <div className="rounded-2xl border border-pink-100 bg-white p-4">
                            <p className="text-xs uppercase tracking-[0.2em] text-pink-500">
                              Resposta
                            </p>
                            <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">
                              {flow.resposta}
                            </p>
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-3">
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => handleEditFlow(flow)}
                            className="rounded-full border-pink-200 text-pink-700 hover:bg-pink-50"
                          >
                            <WandSparkles className="mr-2 h-4 w-4" />
                            Editar fluxo
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            disabled={deletingFlowId === flow.id}
                            onClick={() => void handleDeleteFlow(flow.id)}
                            className="rounded-full border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            {deletingFlowId === flow.id ? "Excluindo..." : "Excluir"}
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </section>
        </div>
      </div>

      <Dialog
        open={Boolean(qrInstanceId)}
        onOpenChange={(open) => {
          if (!open) {
            setQrInstanceId(null);
            setQrDataUrl(null);
            setQrStatus("idle");
          }
        }}
      >
        <DialogContent className="max-w-xl border-pink-200 bg-white">
          <DialogHeader>
            <DialogTitle className="text-pink-800">QR em tempo real</DialogTitle>
            <DialogDescription>
              O painel tenta atualizar o QR automaticamente a cada poucos segundos.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {qrStatus === "loading" && !qrDataUrl ? (
              <div className="flex min-h-80 flex-col items-center justify-center gap-3 rounded-3xl border border-pink-100 bg-pink-50/70">
                <LoaderCircle className="h-8 w-8 animate-spin text-pink-500" />
                <p className="text-sm text-slate-500">Buscando QR...</p>
              </div>
            ) : qrDataUrl ? (
              <div className="space-y-4">
                <div className="relative mx-auto aspect-square w-full max-w-sm overflow-hidden rounded-3xl border border-pink-100 bg-white p-4 shadow-sm">
                  <Image
                    src={qrDataUrl}
                    alt="QR code da instancia"
                    fill
                    unoptimized
                    className="object-contain p-4"
                  />
                </div>
                <p className="text-center text-sm text-slate-500">
                  Escaneie com o WhatsApp e mantenha esta janela aberta ate a conexao abrir.
                </p>
              </div>
            ) : (
              <div className="flex min-h-80 flex-col items-center justify-center gap-3 rounded-3xl border border-amber-200 bg-amber-50/70 px-6 text-center">
                <Bot className="h-8 w-8 text-amber-600" />
                <p className="text-sm text-amber-700">
                  O QR ainda nao foi disponibilizado por essa instancia. Inicie a
                  conexao e tente novamente.
                </p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </main>
  );
}
