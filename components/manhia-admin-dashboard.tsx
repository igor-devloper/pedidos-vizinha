"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCheck,
  LoaderCircle,
  LogOut,
  Pencil,
  Plus,
  Printer,
  RefreshCcw,
  ShoppingBag,
  Trash2,
  Upload,
} from "lucide-react";
import { PedidoStatus } from "@prisma/client";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { normalizeSaboresList } from "@/lib/sabores";
import { cn } from "@/lib/utils";
import { formatCurrency, formatDateTime, getPedidoStatusMeta } from "@/lib/pedidos";

export type ProdutoAdmin = {
  id: string;
  slug: string;
  nome: string;
  descricao: string;
  preco: string | number;
  imagemBase64: string;
  categoria: "CENTO" | "LANCHONETE";
  totalUnidades: number;
  maxTiposSalgado: number;
  permitePagamentoParcial: boolean;
  saboresSugeridos: string[];
  emPromocao: boolean;
  ativo: boolean;
  createdAt: string;
};

export type PedidoAdmin = {
  id: string;
  codigo: string;
  clienteNome: string;
  clienteTelefone: string;
  clienteEmail: string | null;
  observacoes: string | null;
  dataEntrega: string;
  percentualPagamento: number;
  metodoPagamentoLabel: string;
  subtotal: string | number;
  taxaValor: string | number;
  totalCobrado: string | number;
  totalUnidades: number;
  totalTipos: number;
  status: PedidoStatus;
  produtoNomeSnapshot: string;
  notificadoClienteAt: string | null;
  notificadoVizinhaAt: string | null;
  impressoAutomaticamenteAt: string | null;
  itens: { id: string; tipo: string; quantidade: number }[];
};

type ProdutoFormState = {
  nome: string;
  descricao: string;
  preco: string;
  imagemBase64: string;
  categoria: "CENTO" | "LANCHONETE";
  totalUnidades: string;
  maxTiposSalgado: string;
  permitePagamentoParcial: boolean;
  saboresSugeridos: string[];
  emPromocao: boolean;
  ativo: boolean;
};

const EMPTY_FORM: ProdutoFormState = {
  nome: "",
  descricao: "",
  preco: "",
  imagemBase64: "",
  categoria: "CENTO",
  totalUnidades: "100",
  maxTiposSalgado: "5",
  permitePagamentoParcial: true,
  saboresSugeridos: [""],
  emPromocao: false,
  ativo: true,
};

async function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Não foi possível ler a imagem."));
    reader.readAsDataURL(file);
  });
}

export function ManhiaAdminDashboard({
  initialProdutos,
  initialPedidos,
}: {
  initialProdutos: ProdutoAdmin[];
  initialPedidos: PedidoAdmin[];
}) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"pedidos" | "produtos">("pedidos");
  const [produtos, setProdutos] = useState(initialProdutos);
  const [pedidos, setPedidos] = useState(initialPedidos);
  const [form, setForm] = useState<ProdutoFormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [statusLoadingId, setStatusLoadingId] = useState<string | null>(null);
  const [refreshingPedidos, setRefreshingPedidos] = useState(false);
  const [autoPrintEnabled, setAutoPrintEnabled] = useState(false);
  const printedRef = useRef<Set<string>>(new Set());

  const ativos = useMemo(
    () => produtos.filter((produto) => produto.ativo).length,
    [produtos]
  );
  const pagos = useMemo(
    () => pedidos.filter((pedido) => pedido.status === PedidoStatus.PAGO).length,
    [pedidos]
  );

  useEffect(() => {
    const stored = window.localStorage.getItem("vizinha:auto-print");
    if (stored === "true") {
      setAutoPrintEnabled(true);
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem("vizinha:auto-print", String(autoPrintEnabled));
  }, [autoPrintEnabled]);

  const refreshPedidos = async () => {
    try {
      setRefreshingPedidos(true);
      const response = await fetch("/api/manhia/pedidos", { cache: "no-store" });
      if (!response.ok) {
        throw new Error("Não foi possível atualizar os pedidos.");
      }

      const data = (await response.json()) as PedidoAdmin[];
      setPedidos(data);

      if (autoPrintEnabled) {
        for (const pedido of data) {
          if (
            pedido.status === PedidoStatus.PAGO &&
            !pedido.impressoAutomaticamenteAt &&
            !printedRef.current.has(pedido.id)
          ) {
            printedRef.current.add(pedido.id);
            window.open(`/manhia/pedidos/${pedido.id}/imprimir?auto=1`, "_blank", "noopener,noreferrer");
            void fetch(`/api/manhia/pedidos/${pedido.id}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ printed: true }),
            });
          }
        }
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Falha ao carregar pedidos.";
      toast.error(message);
    } finally {
      setRefreshingPedidos(false);
    }
  };

  const handlePollingPedidos = useEffectEvent(() => {
    void refreshPedidos();
  });

  useEffect(() => {
    const interval = window.setInterval(() => {
      handlePollingPedidos();
    }, 20000);

    return () => window.clearInterval(interval);
  }, [autoPrintEnabled]);

  const resetForm = () => {
    setForm(EMPTY_FORM);
    setEditingId(null);
  };

  const updateSabor = (index: number, value: string) => {
    setForm((current) => ({
      ...current,
      saboresSugeridos: current.saboresSugeridos.map((item, itemIndex) =>
        itemIndex === index ? value : item
      ),
    }));
  };

  const addSabor = () => {
    setForm((current) => ({
      ...current,
      saboresSugeridos: [...current.saboresSugeridos, ""],
    }));
  };

  const removeSabor = (index: number) => {
    setForm((current) => ({
      ...current,
      saboresSugeridos:
        current.saboresSugeridos.length === 1
          ? [""]
          : current.saboresSugeridos.filter((_, itemIndex) => itemIndex !== index),
    }));
  };

  const handleImageChange = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    try {
      setUploading(true);
      const dataUrl = await fileToDataUrl(file);
      setForm((current) => ({ ...current, imagemBase64: dataUrl }));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao carregar a imagem.");
    } finally {
      setUploading(false);
      event.target.value = "";
    }
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    try {
      setSaving(true);

      const response = await fetch(
        editingId ? `/api/manhia/produtos/${editingId}` : "/api/manhia/produtos",
        {
          method: editingId ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            nome: form.nome,
            descricao: form.descricao,
            preco: form.preco,
            imagemBase64: form.imagemBase64,
            categoria: form.categoria,
            totalUnidades: form.totalUnidades,
            maxTiposSalgado: form.maxTiposSalgado,
            permitePagamentoParcial: form.permitePagamentoParcial,
            saboresSugeridos: normalizeSaboresList(form.saboresSugeridos),
            emPromocao: form.emPromocao,
            ativo: form.ativo,
          }),
        }
      );

      const data = (await response.json().catch(() => null)) as
        | (ProdutoAdmin & { error?: string })
        | null;

      if (!response.ok) {
        throw new Error(data?.error || "Não foi possível salvar o produto.");
      }

      const produto = data as ProdutoAdmin;

      setProdutos((current) => {
        if (editingId) {
          return current.map((item) => (item.id === produto.id ? produto : item));
        }

        return [produto, ...current];
      });

      toast.success(editingId ? "Produto atualizado." : "Produto criado.");
      resetForm();
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível salvar.");
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (produto: ProdutoAdmin) => {
    setEditingId(produto.id);
    setActiveTab("produtos");
    setForm({
      nome: produto.nome,
      descricao: produto.descricao,
      preco: Number(produto.preco).toFixed(2),
      imagemBase64: produto.imagemBase64,
      categoria: produto.categoria,
      totalUnidades: String(produto.totalUnidades),
      maxTiposSalgado: String(produto.maxTiposSalgado),
      permitePagamentoParcial: produto.permitePagamentoParcial,
      saboresSugeridos:
        normalizeSaboresList(produto.saboresSugeridos).length > 0
          ? normalizeSaboresList(produto.saboresSugeridos)
          : [""],
      emPromocao: produto.emPromocao,
      ativo: produto.ativo,
    });
  };

  const handleDelete = async (produtoId: string) => {
    try {
      setDeletingId(produtoId);
      const response = await fetch(`/api/manhia/produtos/${produtoId}`, {
        method: "DELETE",
      });

      const data = (await response.json().catch(() => null)) as { error?: string } | null;

      if (!response.ok) {
        throw new Error(data?.error || "Não foi possível excluir o produto.");
      }

      setProdutos((current) => current.filter((item) => item.id !== produtoId));
      if (editingId === produtoId) {
        resetForm();
      }
      toast.success("Produto removido.");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível excluir.");
    } finally {
      setDeletingId(null);
    }
  };

  const handleUpdatePedidoStatus = async (pedidoId: string, status: PedidoStatus) => {
    try {
      setStatusLoadingId(pedidoId);
      const response = await fetch(`/api/manhia/pedidos/${pedidoId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });

      const data = (await response.json().catch(() => null)) as
        | (PedidoAdmin & { error?: string })
        | null;

      if (!response.ok) {
        throw new Error(data?.error || "Não foi possível atualizar o pedido.");
      }

      const pedido = data as PedidoAdmin;
      setPedidos((current) => current.map((item) => (item.id === pedido.id ? pedido : item)));
      toast.success("Status atualizado.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao atualizar.");
    } finally {
      setStatusLoadingId(null);
    }
  };

  const handlePrint = (pedidoId: string) => {
    window.open(`/manhia/pedidos/${pedidoId}/imprimir`, "_blank", "noopener,noreferrer");
  };

  const handleLogout = async () => {
    await fetch("/api/manhia/logout", { method: "POST" });
    router.refresh();
  };

  return (
    <main className="px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <section className="rounded-[2rem] border border-pink-200/80 bg-white/95 p-6 shadow-xl shadow-pink-100/40">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="space-y-2">
              <Badge className="border border-pink-200 bg-pink-100 text-pink-700">
                Painel da vizinha
              </Badge>
              <h1 className="text-3xl font-semibold text-pink-800">Pedidos e cardápio</h1>
              <p className="max-w-3xl text-sm leading-6 text-slate-500">
                Acompanhe os pedidos pagos, imprima os cupons e ajuste os produtos
                do cardápio em um painel pensado para celular.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <div className="rounded-2xl border border-pink-100 bg-pink-50/80 px-4 py-3 text-sm text-slate-700">
                <span className="font-semibold text-pink-700">{pedidos.length}</span> pedidos
              </div>
              <div className="rounded-2xl border border-pink-100 bg-pink-50/80 px-4 py-3 text-sm text-slate-700">
                <span className="font-semibold text-pink-700">{pagos}</span> pagos
              </div>
              <div className="rounded-2xl border border-pink-100 bg-pink-50/80 px-4 py-3 text-sm text-slate-700">
                <span className="font-semibold text-pink-700">{ativos}</span> produtos ativos
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={handleLogout}
                className="rounded-full border-pink-200 text-pink-700 hover:bg-pink-50"
              >
                <LogOut className="mr-2 h-4 w-4" />
                Sair
              </Button>
            </div>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-4">
          <button
            type="button"
            onClick={() => setActiveTab("pedidos")}
            className={cn(
              "rounded-[1.6rem] border p-4 text-left shadow-sm transition",
              activeTab === "pedidos"
                ? "border-pink-300 bg-[#fff3f8]"
                : "border-pink-100 bg-white hover:border-pink-200"
            )}
          >
            <ShoppingBag className="h-5 w-5 text-pink-600" />
            <p className="mt-3 text-lg font-semibold text-slate-900">Pedidos</p>
            <p className="mt-1 text-sm text-slate-500">Acompanhar status e impressão.</p>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("produtos")}
            className={cn(
              "rounded-[1.6rem] border p-4 text-left shadow-sm transition",
              activeTab === "produtos"
                ? "border-pink-300 bg-[#fff3f8]"
                : "border-pink-100 bg-white hover:border-pink-200"
            )}
          >
            <CheckCheck className="h-5 w-5 text-pink-600" />
            <p className="mt-3 text-lg font-semibold text-slate-900">Produtos</p>
            <p className="mt-1 text-sm text-slate-500">Cadastrar regras e sabores sugeridos.</p>
          </button>
        </section>

        {activeTab === "pedidos" ? (
          <section className="space-y-4">
            <div className="flex flex-col gap-3 rounded-[2rem] border border-pink-100 bg-white/95 p-5 shadow-lg shadow-pink-100/30 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-2xl font-semibold text-slate-900">Fila de pedidos</h2>
                <p className="text-sm text-slate-500">
                  O painel mostra pagamentos confirmados pelo webhook e permite impressão manual.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-2 rounded-full border border-pink-100 bg-pink-50 px-4 py-2 text-sm text-slate-600">
                  <input
                    type="checkbox"
                    checked={autoPrintEnabled}
                    onChange={(event) => setAutoPrintEnabled(event.target.checked)}
                  />
                  Impressão automática no PC
                </label>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void refreshPedidos()}
                  className="rounded-full border-pink-200 text-pink-700 hover:bg-pink-50"
                >
                  <RefreshCcw className={cn("mr-2 h-4 w-4", refreshingPedidos && "animate-spin")} />
                  Atualizar
                </Button>
              </div>
            </div>

            {pedidos.length === 0 ? (
              <Card className="border-pink-200 bg-white/95 shadow-lg shadow-pink-100/40">
                <CardContent className="py-10 text-center text-sm text-slate-500">
                  Nenhum pedido recebido ainda.
                </CardContent>
              </Card>
            ) : (
              pedidos.map((pedido) => {
                const meta = getPedidoStatusMeta(pedido.status);

                return (
                  <Card
                    key={pedido.id}
                    className="border-pink-200 bg-white/95 shadow-lg shadow-pink-100/30"
                  >
                    <CardContent className="space-y-4 p-5">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="text-xl font-semibold text-slate-900">
                              Pedido {pedido.codigo}
                            </h3>
                            <Badge className={meta.tone}>{meta.label}</Badge>
                            <Badge className="border border-pink-200 bg-pink-50 text-pink-700">
                              {pedido.metodoPagamentoLabel}
                            </Badge>
                          </div>
                          <p className="text-sm text-slate-500">
                            {pedido.clienteNome} • {pedido.clienteTelefone}
                          </p>
                          <p className="text-sm text-slate-500">
                            Entrega: {formatDateTime(pedido.dataEntrega)}
                          </p>
                        </div>

                        <div className="text-left sm:text-right">
                          <p className="text-sm text-slate-400">Total cobrado</p>
                          <p className="text-2xl font-semibold text-pink-700">
                            {formatCurrency(Number(pedido.totalCobrado))}
                          </p>
                          <p className="text-xs text-slate-500">
                            {pedido.percentualPagamento}% pago agora
                          </p>
                        </div>
                      </div>

                      <div className="grid gap-4 rounded-[1.5rem] border border-pink-100 bg-[#fff8fb] p-4 md:grid-cols-3">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-pink-600">
                            Produto
                          </p>
                          <p className="mt-2 text-sm text-slate-700">{pedido.produtoNomeSnapshot}</p>
                          <p className="mt-1 text-sm text-slate-500">
                            {pedido.totalUnidades} unidades • {pedido.totalTipos} tipos
                          </p>
                        </div>

                        <div>
                          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-pink-600">
                            Itens
                          </p>
                          <div className="mt-2 flex flex-col gap-1 text-sm text-slate-700">
                            {pedido.itens.map((item) => (
                              <span key={item.id}>
                                {item.tipo}: {item.quantidade} un
                              </span>
                            ))}
                          </div>
                        </div>

                        <div>
                          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-pink-600">
                            Observações
                          </p>
                          <p className="mt-2 text-sm text-slate-700">
                            {pedido.observacoes || "Sem observações."}
                          </p>
                        </div>
                      </div>

                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <Select
                          value={pedido.status}
                          disabled={statusLoadingId === pedido.id}
                          onValueChange={(value) =>
                            void handleUpdatePedidoStatus(pedido.id, value as PedidoStatus)
                          }
                        >
                          <SelectTrigger className="h-11 w-full rounded-xl border-pink-100 bg-white text-sm text-slate-700 sm:w-[220px]">
                            <SelectValue placeholder="Selecione o status" />
                          </SelectTrigger>
                          <SelectContent>
                            {Object.values(PedidoStatus).map((status) => (
                              <SelectItem key={status} value={status}>
                                {getPedidoStatusMeta(status).label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>

                        <div className="flex flex-wrap gap-3">
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => handlePrint(pedido.id)}
                            className="rounded-full border-pink-200 text-pink-700 hover:bg-pink-50"
                          >
                            <Printer className="mr-2 h-4 w-4" />
                            Imprimir
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })
            )}
          </section>
        ) : (
          <section className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
            <Card className="border-pink-200 bg-white/95 shadow-lg shadow-pink-100/40">
              <CardHeader>
                <CardTitle className="text-pink-800">
                  {editingId ? "Editar produto" : "Novo produto"}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <form className="space-y-4" onSubmit={handleSubmit}>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-700">Nome do produto</label>
                    <Input
                      value={form.nome}
                      onChange={(event) =>
                        setForm((current) => ({ ...current, nome: event.target.value }))
                      }
                      placeholder="Ex: Cento completo"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-700">Descrição</label>
                    <Textarea
                      value={form.descricao}
                      onChange={(event) =>
                        setForm((current) => ({ ...current, descricao: event.target.value }))
                      }
                      className="min-h-28"
                    />
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-slate-700">Valor</label>
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={form.preco}
                        onChange={(event) =>
                          setForm((current) => ({ ...current, preco: event.target.value }))
                        }
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-medium text-slate-700">Categoria</label>
                      <Select
                        value={form.categoria}
                        onValueChange={(value) =>
                          setForm((current) => ({
                            ...current,
                            categoria: value as "CENTO" | "LANCHONETE",
                          }))
                        }
                      >
                        <SelectTrigger className="h-10 w-full border-pink-100 bg-white text-sm text-slate-700">
                          <SelectValue placeholder="Selecione a categoria" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="CENTO">Cento</SelectItem>
                          <SelectItem value="LANCHONETE">Lanchonete</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-medium text-slate-700">Total de unidades</label>
                      <Input
                        type="number"
                        min="1"
                        step="1"
                        value={form.totalUnidades}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            totalUnidades: event.target.value,
                          }))
                        }
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-medium text-slate-700">Máximo de tipos</label>
                      <Input
                        type="number"
                        min="1"
                        step="1"
                        value={form.maxTiposSalgado}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            maxTiposSalgado: event.target.value,
                          }))
                        }
                      />
                    </div>

                    <div className="space-y-2 sm:col-span-2">
                      <label className="text-sm font-medium text-slate-700">
                        Sabores sugeridos
                      </label>
                      <div className="space-y-3 rounded-[1.4rem] border border-pink-100 bg-[#fff8fb] p-4">
                        {form.saboresSugeridos.map((sabor, index) => (
                          <div
                            key={`sabor-${index}`}
                            className="flex flex-col gap-3 sm:flex-row sm:items-center"
                          >
                            <Input
                              value={sabor}
                              onChange={(event) => updateSabor(index, event.target.value)}
                              placeholder={`Ex: sabor ${index + 1}`}
                              className="flex-1 border-pink-100 bg-white"
                            />
                            <Button
                              type="button"
                              variant="outline"
                              onClick={() => removeSabor(index)}
                              className="rounded-full border-pink-200 text-pink-700 hover:bg-pink-50"
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              Remover
                            </Button>
                          </div>
                        ))}

                        <Button
                          type="button"
                          variant="outline"
                          onClick={addSabor}
                          className="rounded-full border-pink-200 text-pink-700 hover:bg-pink-50"
                        >
                          <Plus className="mr-2 h-4 w-4" />
                          Adicionar sabor
                        </Button>
                        <p className="text-sm text-slate-500">
                          Cadastre cada tipo separadamente para a cliente escolher um por vez na montagem.
                        </p>
                      </div>
                    </div>

                    <div className="space-y-2 sm:col-span-2">
                      <label className="text-sm font-medium text-slate-700">Foto do produto</label>
                      <label className="flex h-10 cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed border-pink-200 bg-pink-50 text-sm font-medium text-pink-700 transition hover:bg-pink-100">
                        {uploading ? (
                          <LoaderCircle className="h-4 w-4 animate-spin" />
                        ) : (
                          <Upload className="h-4 w-4" />
                        )}
                        {form.imagemBase64 ? "Trocar imagem" : "Selecionar imagem"}
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={handleImageChange}
                        />
                      </label>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-start gap-3 rounded-2xl border border-pink-100 bg-pink-50/60 px-4 py-3">
                      <Checkbox
                        id="produto-parcial"
                        checked={form.permitePagamentoParcial}
                        onCheckedChange={(checked) =>
                          setForm((current) => ({
                            ...current,
                            permitePagamentoParcial: Boolean(checked),
                          }))
                        }
                      />
                      <label htmlFor="produto-parcial" className="text-sm leading-6 text-slate-600">
                        Permitir pagamento de 50% no checkout.
                      </label>
                    </div>

                    <div className="flex items-start gap-3 rounded-2xl border border-pink-100 bg-pink-50/60 px-4 py-3">
                      <Checkbox
                        id="produto-promocao"
                        checked={form.emPromocao}
                        onCheckedChange={(checked) =>
                          setForm((current) => ({ ...current, emPromocao: Boolean(checked) }))
                        }
                      />
                      <label htmlFor="produto-promocao" className="text-sm leading-6 text-slate-600">
                        Destacar este produto como promoção.
                      </label>
                    </div>

                    <div className="flex items-start gap-3 rounded-2xl border border-pink-100 bg-pink-50/60 px-4 py-3">
                      <Checkbox
                        id="produto-ativo"
                        checked={form.ativo}
                        onCheckedChange={(checked) =>
                          setForm((current) => ({ ...current, ativo: Boolean(checked) }))
                        }
                      />
                      <label htmlFor="produto-ativo" className="text-sm leading-6 text-slate-600">
                        Deixar visível no cardápio.
                      </label>
                    </div>
                  </div>

                  {form.imagemBase64 && (
                    <div className="relative aspect-[4/3] overflow-hidden rounded-3xl border border-pink-100 bg-pink-50">
                      <Image
                        src={form.imagemBase64}
                        alt={form.nome || "Prévia do produto"}
                        fill
                        unoptimized
                        className="object-cover"
                      />
                    </div>
                  )}

                  <div className="flex flex-col gap-3 sm:flex-row">
                    <Button type="submit" disabled={saving} className="rounded-full bg-pink-600 text-white hover:bg-pink-700">
                      {saving ? (
                        <>
                          <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
                          Salvando...
                        </>
                      ) : editingId ? (
                        "Atualizar produto"
                      ) : (
                        <>
                          <Plus className="mr-2 h-4 w-4" />
                          Adicionar produto
                        </>
                      )}
                    </Button>

                    {editingId && (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={resetForm}
                        className="rounded-full border-pink-200 text-pink-700 hover:bg-pink-50"
                      >
                        Cancelar edição
                      </Button>
                    )}
                  </div>
                </form>
              </CardContent>
            </Card>

            <section className="space-y-4">
              {produtos.length === 0 ? (
                <Card className="border-pink-200 bg-white/95 shadow-lg shadow-pink-100/40">
                  <CardContent className="py-10 text-center text-sm text-slate-500">
                    Nenhum produto cadastrado ainda.
                  </CardContent>
                </Card>
              ) : (
                produtos.map((produto) => (
                  <Card
                    key={produto.id}
                    className="overflow-hidden border-pink-200 bg-white/95 shadow-lg shadow-pink-100/30"
                  >
                    <div className="grid gap-0 md:grid-cols-[220px_1fr]">
                      <div className="relative min-h-56 bg-pink-50">
                        <Image
                          src={produto.imagemBase64}
                          alt={produto.nome}
                          fill
                          unoptimized
                          className="object-cover"
                        />
                      </div>

                      <CardContent className="flex flex-col gap-4 p-5">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div className="space-y-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <h2 className="text-xl font-semibold text-slate-900">{produto.nome}</h2>
                              <Badge className={produto.ativo ? "border border-emerald-200 bg-emerald-50 text-emerald-700" : "border border-slate-200 bg-slate-100 text-slate-600"}>
                                {produto.ativo ? "Ativo" : "Oculto"}
                              </Badge>
                              {produto.emPromocao && (
                                <Badge className="border border-amber-200 bg-amber-50 text-amber-700">
                                  Promoção
                                </Badge>
                              )}
                            </div>
                            <p className="text-sm leading-6 text-slate-500">{produto.descricao}</p>
                            <p className="text-sm text-slate-500">
                              {produto.totalUnidades} unidades • até {produto.maxTiposSalgado} tipos •{" "}
                              {produto.permitePagamentoParcial ? "aceita 50% ou 100%" : "somente 100%"}
                            </p>
                            {produto.saboresSugeridos.length > 0 && (
                              <p className="text-sm text-slate-500">
                                Sugestões: {produto.saboresSugeridos.join(", ")}
                              </p>
                            )}
                          </div>

                          <div className="text-left sm:text-right">
                            <p className="text-sm text-slate-400">Valor</p>
                            <p className="text-xl font-semibold text-pink-700">
                              {formatCurrency(Number(produto.preco))}
                            </p>
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-3">
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => handleEdit(produto)}
                            className="rounded-full border-pink-200 text-pink-700 hover:bg-pink-50"
                          >
                            <Pencil className="mr-2 h-4 w-4" />
                            Editar
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            disabled={deletingId === produto.id}
                            onClick={() => void handleDelete(produto.id)}
                            className="rounded-full border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            {deletingId === produto.id ? "Excluindo..." : "Excluir"}
                          </Button>
                          <Button
                            asChild
                            type="button"
                            variant="outline"
                            className="rounded-full border-pink-200 text-pink-700 hover:bg-pink-50"
                          >
                            <Link href={`/pedido/${produto.slug}`}>Ver pedido</Link>
                          </Button>
                        </div>
                      </CardContent>
                    </div>
                  </Card>
                ))
              )}
            </section>
          </section>
        )}
      </div>
    </main>
  );
}
