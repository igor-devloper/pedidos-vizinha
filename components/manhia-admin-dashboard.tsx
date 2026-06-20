"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useEffectEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCheck,
  ChefHat,
  Clock,
  Copy,
  Heart,
  LoaderCircle,
  LogOut,
  Pencil,
  Plus,
  Printer,
  RefreshCcw,
  ShoppingBag,
  SlidersHorizontal,
  Star,
  TicketPercent,
  Trophy,
  Trash2,
  Upload,
} from "lucide-react";
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
import {
  type ComboItem,
  type ProductCategory,
} from "@/lib/produtos";
import { normalizeSaboresList } from "@/lib/sabores";
import type { StoreSiteTheme } from "@/lib/site-theme";
import { cn } from "@/lib/utils";
import { formatCurrency, formatDateTime, getPedidoStatusMeta } from "@/lib/pedidos";

export type ProdutoAdmin = {
  id: string;
  slug: string;
  nome: string;
  descricao: string;
  preco: string | number;
  imagemBase64: string;
  categoria: ProductCategory;
  totalUnidades: number;
  maxTiposSalgado: number;
  permitePagamentoParcial: boolean;
  saboresSugeridos: string[];
  comboItens: ComboItem[];
  emPromocao: boolean;
  descontoPercentual: string | number;
  ativo: boolean;
  createdAt: string;
};

export type CupomAdmin = {
  id: string;
  codigo: string;
  produtoId: string;
  produtoNome: string;
  divulgadorNome: string;
  divulgadorContato: string | null;
  descricao: string | null;
  descontoPercentual: string | number;
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
  descontoPercentual: string | number;
  descontoValor: string | number;
  cupomCodigoSnapshot: string | null;
  cupomDivulgadorSnapshot: string | null;
  totalUnidades: number;
  totalTipos: number;
  status:
    | "PENDENTE_PAGAMENTO"
    | "PAGO"
    | "EM_PREPARO"
    | "PRONTO"
    | "ENTREGUE"
    | "CANCELADO";
  produtoNomeSnapshot: string;
  notificadoClienteAt: string | null;
  notificadoVizinhaAt: string | null;
  prontoAt?: string | null;
  notificadoProntoClienteAt?: string | null;
  notificadoToleranciaAt?: string | null;
  impressoAutomaticamenteAt: string | null;
  itens: { id: string; tipo: string; quantidade: number }[];
};

export type StoreSettingsData = {
  isOpen: boolean;
  minimumLeadHours: number;
  allowMultipleOrdersPerSlot: boolean;
  siteTheme: StoreSiteTheme;
  featuredProductId: string | null;
};

type ProdutoFormState = {
  nome: string;
  descricao: string;
  preco: string;
  imagemBase64: string;
  categoria: ProductCategory;
  totalUnidades: string;
  maxTiposSalgado: string;
  permitePagamentoParcial: boolean;
  saboresSugeridos: string[];
  comboItens: Array<{ nome: string; quantidade: string }>;
  emPromocao: boolean;
  descontoPercentual: string;
  ativo: boolean;
};

type CupomFormState = {
  codigo: string;
  produtoId: string;
  divulgadorNome: string;
  divulgadorContato: string;
  descricao: string;
  descontoPercentual: string;
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
  comboItens: [{ nome: "", quantidade: "1" }],
  emPromocao: false,
  descontoPercentual: "",
  ativo: true,
};

const EMPTY_CUPOM_FORM: CupomFormState = {
  codigo: "",
  produtoId: "",
  divulgadorNome: "",
  divulgadorContato: "",
  descricao: "",
  descontoPercentual: "",
  ativo: true,
};

const PEDIDO_STATUS_OPTIONS = [
  "PENDENTE_PAGAMENTO",
  "PAGO",
  "EM_PREPARO",
  "PRONTO",
  "ENTREGUE",
  "CANCELADO",
] as const;

const KANBAN_COLUMNS = [
  {
    status: "PAGO",
    title: "Aceitos",
    description: "Pedidos pagos para preparar.",
    accent: "border-[#b7d78a] bg-[#f7fde7]",
    badge: "border-[#8fbd55] bg-[#e9f7cc] text-[#1f6b2c]",
  },
  {
    status: "PRONTO",
    title: "Prontos",
    description: "Aguardando retirada ou entrega.",
    accent: "border-[#f0cf62] bg-[#fff8d9]",
    badge: "border-[#e5bd35] bg-[#fff1a8] text-[#735600]",
  },
  {
    status: "ENTREGUE",
    title: "Entregues",
    description: "Pedidos finalizados.",
    accent: "border-[#4faa64] bg-[#eef9ef]",
    badge: "border-[#2f8f46] bg-[#dff3df] text-[#145c25]",
  },
] as const satisfies Array<{
  status: "PAGO" | "PRONTO" | "ENTREGUE";
  title: string;
  description: string;
  accent: string;
  badge: string;
}>;

async function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("NÃ£o foi possÃ­vel ler a imagem."));
    reader.readAsDataURL(file);
  });
}

function getNextOperationalStatus(status: PedidoAdmin["status"]) {
  if (status === "PAGO" || status === "EM_PREPARO") {
    return "PRONTO" as const;
  }

  if (status === "PRONTO") {
    return "ENTREGUE" as const;
  }

  return null;
}

export function ManhiaAdminDashboard({
  initialProdutos,
  initialPedidos,
  initialCupons,
  initialSettings,
}: {
  initialProdutos: ProdutoAdmin[];
  initialPedidos: PedidoAdmin[];
  initialCupons: CupomAdmin[];
  initialSettings: StoreSettingsData;
}) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"pedidos" | "salgados" | "produtos" | "cupons" | "configuracoes">("pedidos");
  const [produtos, setProdutos] = useState(initialProdutos);
  const [pedidos, setPedidos] = useState(initialPedidos);
  const [cupons, setCupons] = useState(initialCupons);
  const [settings, setSettings] = useState(initialSettings);
  const [form, setForm] = useState<ProdutoFormState>(EMPTY_FORM);
  const [cupomForm, setCupomForm] = useState<CupomFormState>(EMPTY_CUPOM_FORM);
  const [saving, setSaving] = useState(false);
  const [savingCupom, setSavingCupom] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingCupomId, setEditingCupomId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deletingCupomId, setDeletingCupomId] = useState<string | null>(null);
  const [statusLoadingId, setStatusLoadingId] = useState<string | null>(null);
  const [draggedPedidoId, setDraggedPedidoId] = useState<string | null>(null);
  const [dragOverStatus, setDragOverStatus] = useState<"PAGO" | "PRONTO" | "ENTREGUE" | null>(null);
  const [refreshingPedidos, setRefreshingPedidos] = useState(false);
  const [printingPedidoId, setPrintingPedidoId] = useState<string | null>(null);

  const ativos = useMemo(
    () => produtos.filter((produto) => produto.ativo).length,
    [produtos]
  );
  const totalBaseVendido = useMemo(
    () =>
      pedidos
        .filter((pedido) => pedido.status !== "CANCELADO")
        .reduce((total, pedido) => total + Number(pedido.subtotal || 0), 0),
    [pedidos]
  );
  const pedidosPorStatus = useMemo(
    () => ({
      PAGO: pedidos
        .filter((pedido) => pedido.status === "PAGO" || pedido.status === "EM_PREPARO")
        .sort((a, b) => new Date(a.dataEntrega).getTime() - new Date(b.dataEntrega).getTime()),
      PRONTO: pedidos
        .filter((pedido) => pedido.status === "PRONTO")
        .sort((a, b) => new Date(a.dataEntrega).getTime() - new Date(b.dataEntrega).getTime()),
      ENTREGUE: pedidos
        .filter((pedido) => pedido.status === "ENTREGUE")
        .sort((a, b) => new Date(a.dataEntrega).getTime() - new Date(b.dataEntrega).getTime()),
    }),
    [pedidos]
  );
  const pedidosPendentes = useMemo(
    () => pedidos.filter((pedido) => pedido.status === "PENDENTE_PAGAMENTO"),
    [pedidos]
  );

  const pedidosAceitos = useMemo(
    () =>
      pedidos
        .filter((p) => p.status !== "CANCELADO" && p.status !== "PENDENTE_PAGAMENTO")
        .sort((a, b) => new Date(a.dataEntrega).getTime() - new Date(b.dataEntrega).getTime()),
    [pedidos]
  );

  const pedidosParaProduzir = useMemo(
    () => pedidosAceitos.filter((p) => p.status !== "ENTREGUE"),
    [pedidosAceitos]
  );

  const salgadosPorDia = useMemo(() => {
    const map = new Map<string, Map<string, number>>();
    for (const pedido of pedidosParaProduzir) {
      const dia = new Intl.DateTimeFormat("pt-BR", {
        dateStyle: "short",
        timeZone: "America/Sao_Paulo",
      }).format(new Date(pedido.dataEntrega));
      if (!map.has(dia)) map.set(dia, new Map());
      const tiposMap = map.get(dia)!;
      for (const item of pedido.itens) {
        tiposMap.set(item.tipo, (tiposMap.get(item.tipo) ?? 0) + item.quantidade);
      }
    }
    return Array.from(map.entries()).map(([dia, tiposMap]) => ({
      dia,
      itens: Array.from(tiposMap.entries())
        .map(([tipo, quantidade]) => ({ tipo, quantidade }))
        .sort((a, b) => b.quantidade - a.quantidade),
      total: Array.from(tiposMap.values()).reduce((s, q) => s + q, 0),
    }));
  }, [pedidosParaProduzir]);

  const refreshPedidos = async () => {
    try {
      setRefreshingPedidos(true);
      const response = await fetch("/api/manhia/pedidos", { cache: "no-store" });
      if (!response.ok) {
        throw new Error("NÃ£o foi possÃ­vel atualizar os pedidos.");
      }

      const data = (await response.json()) as PedidoAdmin[];
      setPedidos(data);
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
  }, []);

  const resetForm = () => {
    setForm(EMPTY_FORM);
    setEditingId(null);
  };

  const resetCupomForm = () => {
    setCupomForm(EMPTY_CUPOM_FORM);
    setEditingCupomId(null);
  };

  const isComboCategory = form.categoria === "COMBO";

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

  const updateComboItem = (
    index: number,
    patch: Partial<{ nome: string; quantidade: string }>
  ) => {
    setForm((current) => ({
      ...current,
      comboItens: current.comboItens.map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...patch } : item
      ),
    }));
  };

  const addComboItem = () => {
    setForm((current) => ({
      ...current,
      comboItens: [...current.comboItens, { nome: "", quantidade: "1" }],
    }));
  };

  const removeComboItem = (index: number) => {
    setForm((current) => ({
      ...current,
      comboItens:
        current.comboItens.length === 1
          ? [{ nome: "", quantidade: "1" }]
          : current.comboItens.filter((_, itemIndex) => itemIndex !== index),
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
            comboItens: form.comboItens.map((item) => ({
              nome: item.nome,
              quantidade: Number(item.quantidade || 0),
            })),
            emPromocao: form.emPromocao,
            descontoPercentual: form.emPromocao ? form.descontoPercentual : 0,
            ativo: form.ativo,
          }),
        }
      );

      const data = (await response.json().catch(() => null)) as
        | (ProdutoAdmin & { error?: string })
        | null;

      if (!response.ok) {
        throw new Error(data?.error || "NÃ£o foi possÃ­vel salvar o produto.");
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
      toast.error(error instanceof Error ? error.message : "NÃ£o foi possÃ­vel salvar.");
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
      comboItens:
        produto.comboItens.length > 0
          ? produto.comboItens.map((item) => ({
              nome: item.nome,
              quantidade: String(item.quantidade),
            }))
          : [{ nome: "", quantidade: "1" }],
      emPromocao: produto.emPromocao,
      descontoPercentual: String(produto.descontoPercentual || ""),
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
        throw new Error(data?.error || "NÃ£o foi possÃ­vel excluir o produto.");
      }

      setProdutos((current) => current.filter((item) => item.id !== produtoId));
      if (editingId === produtoId) {
        resetForm();
      }
      toast.success("Produto removido.");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "NÃ£o foi possÃ­vel excluir.");
    } finally {
      setDeletingId(null);
    }
  };

  const handleCupomSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    try {
      setSavingCupom(true);
      const response = await fetch(
        editingCupomId ? `/api/manhia/cupons/${editingCupomId}` : "/api/manhia/cupons",
        {
          method: editingCupomId ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(cupomForm),
        }
      );

      const data = (await response.json().catch(() => null)) as
        | (CupomAdmin & { error?: string })
        | null;

      if (!response.ok) {
        throw new Error(data?.error || "Nao foi possivel salvar o cupom.");
      }

      const cupom = data as CupomAdmin;

      setCupons((current) => {
        if (editingCupomId) {
          return current.map((item) => (item.id === cupom.id ? cupom : item));
        }

        return [cupom, ...current];
      });

      toast.success(editingCupomId ? "Cupom atualizado." : "Cupom criado.");
      resetCupomForm();
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Nao foi possivel salvar o cupom.");
    } finally {
      setSavingCupom(false);
    }
  };

  const handleEditCupom = (cupom: CupomAdmin) => {
    setEditingCupomId(cupom.id);
    setActiveTab("cupons");
    setCupomForm({
      codigo: cupom.codigo,
      produtoId: cupom.produtoId,
      divulgadorNome: cupom.divulgadorNome,
      divulgadorContato: cupom.divulgadorContato || "",
      descricao: cupom.descricao || "",
      descontoPercentual: String(cupom.descontoPercentual || ""),
      ativo: cupom.ativo,
    });
  };

  const handleDeleteCupom = async (cupomId: string) => {
    try {
      setDeletingCupomId(cupomId);
      const response = await fetch(`/api/manhia/cupons/${cupomId}`, {
        method: "DELETE",
      });

      const data = (await response.json().catch(() => null)) as { error?: string } | null;

      if (!response.ok) {
        throw new Error(data?.error || "Nao foi possivel excluir o cupom.");
      }

      setCupons((current) => current.filter((item) => item.id !== cupomId));
      if (editingCupomId === cupomId) {
        resetCupomForm();
      }
      toast.success("Cupom removido.");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Nao foi possivel excluir o cupom.");
    } finally {
      setDeletingCupomId(null);
    }
  };

  const handleCopyCupom = async (codigo: string) => {
    try {
      await navigator.clipboard.writeText(codigo);
      toast.success("Codigo copiado.");
    } catch {
      toast.error("Nao foi possivel copiar o codigo.");
    }
  };

  const handleUpdatePedidoStatus = async (
    pedidoId: string,
    status: PedidoAdmin["status"]
  ) => {
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
        throw new Error(data?.error || "NÃ£o foi possÃ­vel atualizar o pedido.");
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

  const handleConfirmManualPayment = async (pedido: PedidoAdmin) => {
    try {
      setStatusLoadingId(pedido.id);
      const response = await fetch(`/api/manhia/pedidos/${pedido.id}/pagamento-manual`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          valorPago: Number(pedido.totalCobrado),
          observacao: "Pagamento em dinheiro confirmado pelo painel",
        }),
      });

      const data = (await response.json().catch(() => null)) as
        | (PedidoAdmin & { error?: string })
        | null;

      if (!response.ok) {
        throw new Error(data?.error || "Nao foi possivel confirmar o pagamento.");
      }

      const updatedPedido = data as PedidoAdmin;
      setPedidos((current) =>
        current.map((item) => (item.id === updatedPedido.id ? updatedPedido : item))
      );
      toast.success("Pagamento confirmado e mensagens enviadas.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao confirmar pagamento.");
    } finally {
      setStatusLoadingId(null);
    }
  };

  const handleDropPedido = (status: "PAGO" | "PRONTO" | "ENTREGUE") => {
    if (!draggedPedidoId) {
      return;
    }

    const pedido = pedidos.find((item) => item.id === draggedPedidoId);
    setDraggedPedidoId(null);
    setDragOverStatus(null);

    if (!pedido || pedido.status === status || statusLoadingId === pedido.id) {
      return;
    }

    void handleUpdatePedidoStatus(pedido.id, status);
  };

  const handleSaveSettings = async (patch: Partial<StoreSettingsData>) => {
    const nextSettings = { ...settings, ...patch };

    try {
      setSavingSettings(true);
      const response = await fetch("/api/manhia/configuracoes", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(nextSettings),
      });

      const data = (await response.json().catch(() => null)) as
        | (StoreSettingsData & { error?: string })
        | null;

      if (!response.ok) {
        throw new Error(data?.error || "Nao foi possivel salvar as configuracoes.");
      }

      setSettings({
        isOpen: Boolean(data?.isOpen),
        minimumLeadHours: Number(data?.minimumLeadHours ?? nextSettings.minimumLeadHours),
        allowMultipleOrdersPerSlot: Boolean(
          data?.allowMultipleOrdersPerSlot ?? nextSettings.allowMultipleOrdersPerSlot
        ),
        siteTheme: (data?.siteTheme ?? nextSettings.siteTheme) as StoreSiteTheme,
        featuredProductId: data?.featuredProductId ?? nextSettings.featuredProductId ?? null,
      });
      toast.success("Configuracoes salvas.");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao salvar configuracoes.");
    } finally {
      setSavingSettings(false);
    }
  };

  const handlePrint = async (pedidoId: string) => {
    try {
      setPrintingPedidoId(pedidoId);
      const response = await fetch(`/api/manhia/pedidos/${pedidoId}/imprimir`, {
        method: "POST",
      });

      const data = (await response.json().catch(() => null)) as
        | (PedidoAdmin & { error?: string })
        | null;

      if (!response.ok) {
        throw new Error(data?.error || "Nao foi possivel enviar para a impressora.");
      }

      const pedido = data as PedidoAdmin;
      setPedidos((current) => current.map((item) => (item.id === pedido.id ? pedido : item)));
      toast.success("Pedido enviado para a impressora.");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? `${error.message} Abrindo impressao pelo navegador.`
          : "Falha ao imprimir. Abrindo impressao pelo navegador."
      );
      window.open(`/manhia/pedidos/${pedidoId}/imprimir`, "_blank", "noopener,noreferrer");
    } finally {
      setPrintingPedidoId(null);
    }
  };

  const handleLogout = async () => {
    await fetch("/api/manhia/logout", { method: "POST" });
    router.refresh();
  };

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#f7fde7,#fffaf3_42%,#eef8db)] px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <header className="overflow-hidden rounded-[1.4rem] border border-[#d6e7a2] bg-white shadow-sm">
          <div className="grid gap-0 lg:grid-cols-[280px_1fr_auto]">
            <div className="bg-[#0b3d18] p-5 text-white">
              <Badge className="border-[#f4d330] bg-[#f4d330] text-[#0b3d18]">
                Painel da vizinha
              </Badge>
              <h1 className="mt-3 text-2xl font-bold tracking-normal">Operação</h1>
              <p className="mt-2 text-sm leading-6 text-white/72">
                Pedidos, produtos e funcionamento no mesmo painel.
              </p>
            </div>

            <div className="grid grid-cols-2 border-y border-[#e4edc9] bg-[#fbfff0] sm:grid-cols-5 lg:border-y-0">
              {[
                { label: "Pedidos", value: pedidos.length },
                { label: "Valor base", value: formatCurrency(totalBaseVendido) },
                { label: "Produtos", value: ativos },
                { label: "Loja", value: settings.isOpen ? "Aberta" : "Fechada" },
                { label: "Tema", value: settings.siteTheme === "NAMORADOS" ? "Namorados" : "Copa" },
              ].map((item) => (
                <div key={item.label} className="border-r border-[#e4edc9] p-4">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-[#618038]">
                    {item.label}
                  </p>
                  <p className="mt-2 text-lg font-bold text-[#0b3d18]">{item.value}</p>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between gap-3 p-4 lg:flex-col lg:items-stretch lg:justify-center">
              <Button
                type="button"
                disabled={savingSettings}
                onClick={() => void handleSaveSettings({ isOpen: !settings.isOpen })}
                className={cn(
                  "rounded-full px-5 text-white",
                  settings.isOpen ? "bg-rose-600 hover:bg-rose-700" : "bg-[#1b7f31] hover:bg-[#156326]"
                )}
              >
                {settings.isOpen ? "Fechar loja" : "Abrir loja"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={handleLogout}
                className="rounded-full border-[#d6e7a2] text-[#1b5e20] hover:bg-[#f7fde7]"
              >
                <LogOut className="mr-2 h-4 w-4" />
                Sair
              </Button>
            </div>
          </div>

          <nav className="grid border-t border-[#e4edc9] bg-white sm:grid-cols-5">
            {[
              { id: "pedidos" as const, label: "Pedidos", icon: ShoppingBag },
              { id: "salgados" as const, label: "Salgados", icon: ChefHat },
              { id: "produtos" as const, label: "Produtos", icon: CheckCheck },
              { id: "cupons" as const, label: "Cupons", icon: TicketPercent },
              { id: "configuracoes" as const, label: "Operação", icon: SlidersHorizontal },
            ].map((item) => {
              const Icon = item.icon;

              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveTab(item.id)}
                  className={cn(
                    "flex h-14 items-center justify-center gap-2 border-b border-[#e4edc9] text-sm font-bold uppercase tracking-wide transition sm:border-b-0 sm:border-r",
                    activeTab === item.id
                      ? "bg-[#fff3a8] text-[#0b3d18]"
                      : "bg-white text-[#48654f] hover:bg-[#f7fde7]"
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </button>
              );
            })}
          </nav>
        </header>

        {activeTab === "pedidos" ? (
          <section className="space-y-4">
            <div className="flex flex-col gap-3 rounded-[2rem] border border-[#d6e7a2] bg-white/95 p-5 shadow-lg shadow-green-900/5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-2xl font-semibold text-slate-900">Fila de pedidos</h2>
                <p className="text-sm text-slate-500">
                  O painel mostra pagamentos confirmados pelo webhook e permite impressão manual.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <Badge className="border-[#d6e7a2] bg-[#f7fde7] px-4 py-2 text-[#284a2e]">
                  Impressao automatica via servico
                </Badge>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void refreshPedidos()}
                  className="rounded-full border-[#d6e7a2] text-[#1b5e20] hover:bg-[#f7fde7]"
                >
                  <RefreshCcw className={cn("mr-2 h-4 w-4", refreshingPedidos && "animate-spin")} />
                  Atualizar
                </Button>
              </div>
            </div>

            {pedidos.length === 0 ? (
              <Card className="border-[#d6e7a2] bg-white/95 shadow-lg shadow-green-900/5">
                <CardContent className="py-10 text-center text-sm text-slate-500">
                  Nenhum pedido recebido ainda.
                </CardContent>
              </Card>
            ) : (
              <>
                {pedidosPendentes.length > 0 ? (
                  <section className="rounded-[1.6rem] border border-amber-200 bg-amber-50/80 p-4 shadow-sm">
                    <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <h3 className="font-semibold text-amber-950">Aguardando pagamento</h3>
                        <p className="text-sm text-amber-800">
                          Confirme aqui pedidos pagos em dinheiro ou acertados fora do Mercado Pago.
                        </p>
                      </div>
                      <Badge className="w-fit border-amber-300 bg-amber-100 text-amber-900">
                        {pedidosPendentes.length} pendente(s)
                      </Badge>
                    </div>

                    <div className="grid gap-3 lg:grid-cols-2">
                      {pedidosPendentes.map((pedido) => (
                        <article
                          key={pedido.id}
                          className="rounded-2xl border border-amber-200 bg-white p-4 shadow-sm"
                        >
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                            <div>
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="font-semibold text-slate-900">
                                  Pedido {pedido.codigo}
                                </span>
                                <Badge className={getPedidoStatusMeta(pedido.status).tone}>
                                  {getPedidoStatusMeta(pedido.status).label}
                                </Badge>
                              </div>
                              <p className="mt-1 text-sm text-slate-500">
                                {pedido.clienteNome} - {formatDateTime(pedido.dataEntrega)}
                              </p>
                              <p className="mt-1 text-sm text-slate-500">
                                {pedido.produtoNomeSnapshot} - {pedido.metodoPagamentoLabel}
                              </p>
                            </div>
                            <div className="text-left sm:text-right">
                              <p className="text-sm text-slate-400">Valor</p>
                              <p className="text-xl font-bold text-[#0b3d18]">
                                {formatCurrency(Number(pedido.totalCobrado))}
                              </p>
                            </div>
                          </div>

                          <div className="mt-4 flex flex-wrap gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              disabled={printingPedidoId === pedido.id}
                              onClick={() => void handlePrint(pedido.id)}
                              className="rounded-full border-amber-200 text-amber-800 hover:bg-amber-50"
                            >
                              <Printer className={cn("mr-2 h-4 w-4", printingPedidoId === pedido.id && "animate-pulse")} />
                              {printingPedidoId === pedido.id ? "Enviando..." : "Imprimir"}
                            </Button>
                            <Button
                              type="button"
                              disabled={statusLoadingId === pedido.id}
                              onClick={() => void handleConfirmManualPayment(pedido)}
                              className="rounded-full bg-[#1b7f31] text-white hover:bg-[#156326]"
                            >
                              <CheckCheck className="mr-2 h-4 w-4" />
                              {statusLoadingId === pedido.id ? "Confirmando..." : "Confirmar dinheiro"}
                            </Button>
                          </div>
                        </article>
                      ))}
                    </div>
                  </section>
                ) : null}

                <div className="hidden gap-4 lg:grid lg:grid-cols-3">
                  {KANBAN_COLUMNS.map((column) => (
                    <div
                      key={column.status}
                      onDragOver={(event) => {
                        event.preventDefault();
                        setDragOverStatus(column.status);
                      }}
                      onDragLeave={() => setDragOverStatus(null)}
                      onDrop={() => handleDropPedido(column.status)}
                      className={cn(
                        "min-h-[520px] rounded-[1.6rem] border p-4 shadow-sm transition",
                        column.accent,
                        dragOverStatus === column.status && "ring-2 ring-[#f4d330] ring-offset-2"
                      )}
                    >
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <div>
                          <h3 className="font-semibold text-slate-900">{column.title}</h3>
                          <p className="text-sm text-slate-500">
                            {pedidosPorStatus[column.status].length} pedido(s)
                          </p>
                        </div>
                        <Badge className={column.badge}>
                          {getPedidoStatusMeta(column.status).label}
                        </Badge>
                      </div>

                      <div className="space-y-3">
                        {pedidosPorStatus[column.status].map((pedido) => (
                          <button
                            key={pedido.id}
                            type="button"
                            draggable={statusLoadingId !== pedido.id}
                            onDragStart={() => setDraggedPedidoId(pedido.id)}
                            onDragEnd={() => {
                              setDraggedPedidoId(null);
                              setDragOverStatus(null);
                            }}
                            onClick={() => void handlePrint(pedido.id)}
                            className={cn(
                              "w-full cursor-grab rounded-2xl border border-[#d6e7a2] bg-[#fffaf3] p-3 text-left shadow-sm transition hover:border-[#f4d330] active:cursor-grabbing",
                              draggedPedidoId === pedido.id && "opacity-60"
                            )}
                          >
                            <div className="flex items-center justify-between gap-3">
                              <span className="font-semibold text-slate-900">{pedido.codigo}</span>
                              <span className="text-sm font-bold text-[#f4d330]">
                                {formatCurrency(Number(pedido.subtotal))}
                              </span>
                            </div>
                            <p className="mt-1 truncate text-sm text-slate-500">
                              {pedido.clienteNome} - {formatDateTime(pedido.dataEntrega)}
                            </p>
                          </button>
                        ))}

                        {pedidosPorStatus[column.status].length === 0 ? (
                          <p className="rounded-2xl border border-dashed border-[#d6e7a2] p-4 text-sm text-slate-500">
                            Sem pedidos nesta etapa.
                          </p>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>

                {pedidosAceitos
                  .map((pedido) => {
                const meta = getPedidoStatusMeta(pedido.status);
                const nextStatus = getNextOperationalStatus(pedido.status);

                return (
                  <Card
                    key={pedido.id}
                    className="border-[#d6e7a2] bg-white/95 shadow-lg shadow-green-900/5 lg:hidden"
                  >
                    <CardContent className="space-y-4 p-5">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="text-xl font-semibold text-slate-900">
                              Pedido {pedido.codigo}
                            </h3>
                            <Badge className={meta.tone}>{meta.label}</Badge>
                            <Badge className="border border-[#d6e7a2] bg-[#f7fde7] text-[#1b5e20]">
                              {pedido.metodoPagamentoLabel}
                            </Badge>
                          </div>
                          <p className="text-sm text-slate-500">
                            {pedido.clienteNome} â€¢ {pedido.clienteTelefone}
                          </p>
                          <p className="text-sm text-slate-500">
                            Entrega: {formatDateTime(pedido.dataEntrega)}
                          </p>
                        </div>

                        <div className="text-left sm:text-right">
                          <p className="text-sm text-slate-400">Total cobrado</p>
                          <p className="text-2xl font-bold text-[#f4d330]">
                            {formatCurrency(Number(pedido.totalCobrado))}
                          </p>
                          <p className="text-xs text-slate-500">
                            {pedido.percentualPagamento}% pago agora
                          </p>
                        </div>
                      </div>

                      <div className="grid gap-4 rounded-[1.5rem] border border-[#d6e7a2] bg-[#f7fde7] p-4 md:grid-cols-3">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wide text-[#1b7f31]">
                            Produto
                          </p>
                          <p className="mt-2 text-sm text-slate-700">{pedido.produtoNomeSnapshot}</p>
                          <p className="mt-1 text-sm text-slate-500">
                            {pedido.totalUnidades} unidades â€¢ {pedido.totalTipos} tipos
                          </p>
                        </div>

                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wide text-[#1b7f31]">
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
                          <p className="text-xs font-semibold uppercase tracking-wide text-[#1b7f31]">
                            ObservaÃ§Ãµes
                          </p>
                          <p className="mt-2 text-sm text-slate-700">
                            {pedido.observacoes || "Sem observaÃ§Ãµes."}
                          </p>
                        </div>
                      </div>

                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <Select
                          value={pedido.status}
                          disabled={statusLoadingId === pedido.id}
                          onValueChange={(value) =>
                            void handleUpdatePedidoStatus(pedido.id, value as PedidoAdmin["status"])
                          }
                        >
                          <SelectTrigger className="h-11 w-full rounded-xl border-[#d6e7a2] bg-white text-sm text-slate-700 sm:w-[220px]">
                            <SelectValue placeholder="Selecione o status" />
                          </SelectTrigger>
                          <SelectContent>
                            {PEDIDO_STATUS_OPTIONS.map((status) => (
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
                            disabled={printingPedidoId === pedido.id}
                            onClick={() => void handlePrint(pedido.id)}
                            className="rounded-full border-[#d6e7a2] text-[#1b5e20] hover:bg-[#f7fde7]"
                          >
                            <Printer className={cn("mr-2 h-4 w-4", printingPedidoId === pedido.id && "animate-pulse")} />
                            {printingPedidoId === pedido.id ? "Enviando..." : "Imprimir"}
                          </Button>
                          <Button
                            type="button"
                            disabled={!nextStatus || statusLoadingId === pedido.id}
                            onClick={() =>
                              nextStatus ? void handleUpdatePedidoStatus(pedido.id, nextStatus) : undefined
                            }
                            className="rounded-full bg-[#1b7f31] text-white hover:bg-[#156326]"
                          >
                            {statusLoadingId === pedido.id ? "Salvando..." : nextStatus ? "Avancar" : "Finalizado"}
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
              </>
            )}
          </section>
        ) : activeTab === "salgados" ? (
          <section className="space-y-4">
            <div className="flex flex-col gap-3 rounded-[2rem] border border-[#d6e7a2] bg-white/95 p-5 shadow-lg shadow-green-900/5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-2xl font-semibold text-slate-900">Salgados a produzir</h2>
                <p className="text-sm text-slate-500">
                  Quantidades consolidadas dos pedidos aceitos, agrupadas por dia de entrega.
                </p>
              </div>
            </div>

            {salgadosPorDia.length === 0 ? (
              <Card className="border-[#d6e7a2] bg-white/95 shadow-lg shadow-green-900/5">
                <CardContent className="py-10 text-center text-sm text-slate-500">
                  Nenhum pedido aceito com salgados ainda.
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {salgadosPorDia.map(({ dia, itens, total }) => (
                  <Card key={dia} className="border-[#d6e7a2] bg-white/95 shadow-lg shadow-green-900/5">
                    <CardHeader className="border-b border-[#e4edc9] bg-[#f7fde7] pb-3 pt-4">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-bold uppercase tracking-wide text-[#618038]">
                          Entrega {dia}
                        </p>
                        <Badge className="border border-[#d6e7a2] bg-[#fff3a8] text-[#0b3d18]">
                          {total} un total
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="pt-4">
                      <div className="space-y-2">
                        {itens.map(({ tipo, quantidade }) => (
                          <div
                            key={tipo}
                            className="flex items-center justify-between rounded-xl border border-[#e4edc9] bg-[#fbfff0] px-4 py-2"
                          >
                            <span className="text-sm font-medium text-slate-700">{tipo}</span>
                            <span className="text-sm font-bold text-[#1b7f31]">{quantidade} un</span>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </section>
        ) : activeTab === "cupons" ? (
          <section className="grid gap-5 xl:grid-cols-[380px_1fr]">
            <Card className="border-[#d6e7a2] bg-white/95 shadow-lg shadow-green-900/5 xl:sticky xl:top-6 xl:self-start">
              <CardHeader className="border-b border-[#e4edc9] bg-[#fbfff0]">
                <p className="text-xs font-bold uppercase tracking-wide text-[#618038]">
                  Divulgacao
                </p>
                <CardTitle className="text-[#0b3d18]">
                  {editingCupomId ? "Editar cupom" : "Novo cupom"}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <form className="space-y-4" onSubmit={handleCupomSubmit}>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-700">Codigo do cupom</label>
                    <Input
                      value={cupomForm.codigo}
                      onChange={(event) =>
                        setCupomForm((current) => ({ ...current, codigo: event.target.value }))
                      }
                      placeholder="Ex: JOAO10"
                      className="uppercase"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-700">Produto do cupom</label>
                    <Select
                      value={cupomForm.produtoId}
                      onValueChange={(value) =>
                        setCupomForm((current) => ({ ...current, produtoId: value }))
                      }
                    >
                      <SelectTrigger className="h-10 w-full border-[#d6e7a2] bg-white text-sm text-slate-700">
                        <SelectValue placeholder="Selecione o produto" />
                      </SelectTrigger>
                      <SelectContent>
                        {produtos.map((produto) => (
                          <SelectItem key={produto.id} value={produto.id}>
                            {produto.nome}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-700">Quem vai divulgar</label>
                    <Input
                      value={cupomForm.divulgadorNome}
                      onChange={(event) =>
                        setCupomForm((current) => ({
                          ...current,
                          divulgadorNome: event.target.value,
                        }))
                      }
                      placeholder="Ex: Joao Silva"
                    />
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-slate-700">Desconto (%)</label>
                      <Input
                        type="number"
                        min="1"
                        max="100"
                        step="0.01"
                        value={cupomForm.descontoPercentual}
                        onChange={(event) =>
                          setCupomForm((current) => ({
                            ...current,
                            descontoPercentual: event.target.value,
                          }))
                        }
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-medium text-slate-700">Contato</label>
                      <Input
                        value={cupomForm.divulgadorContato}
                        onChange={(event) =>
                          setCupomForm((current) => ({
                            ...current,
                            divulgadorContato: event.target.value,
                          }))
                        }
                        placeholder="WhatsApp ou Instagram"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-700">Observacao interna</label>
                    <Textarea
                      value={cupomForm.descricao}
                      onChange={(event) =>
                        setCupomForm((current) => ({ ...current, descricao: event.target.value }))
                      }
                      className="min-h-24"
                    />
                  </div>

                  <div className="flex items-start gap-3 rounded-2xl border border-[#d6e7a2] bg-[#f7fde7] px-4 py-3">
                    <Checkbox
                      id="cupom-ativo"
                      checked={cupomForm.ativo}
                      onCheckedChange={(checked) =>
                        setCupomForm((current) => ({ ...current, ativo: Boolean(checked) }))
                      }
                    />
                    <label htmlFor="cupom-ativo" className="text-sm leading-6 text-slate-600">
                      Cupom ativo para clientes usarem no checkout.
                    </label>
                  </div>

                  <div className="flex flex-col gap-3 sm:flex-row">
                    <Button
                      type="submit"
                      disabled={savingCupom}
                      className="rounded-full bg-[#1b7f31] text-white hover:bg-[#156326]"
                    >
                      {savingCupom ? (
                        <>
                          <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
                          Salvando...
                        </>
                      ) : editingCupomId ? (
                        "Atualizar cupom"
                      ) : (
                        <>
                          <Plus className="mr-2 h-4 w-4" />
                          Adicionar cupom
                        </>
                      )}
                    </Button>

                    {editingCupomId ? (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={resetCupomForm}
                        className="rounded-full border-[#d6e7a2] text-[#1b5e20] hover:bg-[#f7fde7]"
                      >
                        Cancelar edicao
                      </Button>
                    ) : null}
                  </div>
                </form>
              </CardContent>
            </Card>

            <section className="overflow-hidden rounded-[1.4rem] border border-[#d6e7a2] bg-white shadow-sm">
              <div className="flex flex-col gap-2 border-b border-[#e4edc9] bg-[#0b3d18] p-4 text-white sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide text-[#f4d330]">
                    Cupons
                  </p>
                  <h2 className="text-xl font-bold">Cupons cadastrados</h2>
                </div>
                <Badge className="w-fit border-[#f4d330] bg-[#f4d330] text-[#0b3d18]">
                  {cupons.length} cupom(ns)
                </Badge>
              </div>

              {cupons.length === 0 ? (
                <div className="p-10 text-center text-sm text-slate-500">
                  Nenhum cupom cadastrado ainda.
                </div>
              ) : (
                <div className="divide-y divide-[#e4edc9]">
                  {cupons.map((cupom) => (
                    <article
                      key={cupom.id}
                      className="grid gap-4 p-4 transition hover:bg-[#fbfff0] md:grid-cols-[1fr_auto] md:items-center"
                    >
                      <div className="min-w-0 space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-mono text-lg font-bold text-[#0b3d18]">
                            {cupom.codigo}
                          </h3>
                          <Badge className={cupom.ativo ? "border border-emerald-200 bg-emerald-50 text-emerald-700" : "border border-slate-200 bg-slate-100 text-slate-600"}>
                            {cupom.ativo ? "Ativo" : "Inativo"}
                          </Badge>
                          <Badge className="border border-[#f4d330] bg-[#fff3a8] text-[#735600]">
                            {Number(cupom.descontoPercentual)}%
                          </Badge>
                        </div>
                        <p className="text-sm text-[#48654f]">
                          Produto: {cupom.produtoNome}
                        </p>
                        <p className="text-sm text-[#48654f]">
                          Divulgador: {cupom.divulgadorNome}
                          {cupom.divulgadorContato ? ` - ${cupom.divulgadorContato}` : ""}
                        </p>
                        {cupom.descricao ? (
                          <p className="line-clamp-2 text-sm text-slate-500">{cupom.descricao}</p>
                        ) : null}
                      </div>

                      <div className="flex flex-wrap gap-2 md:justify-end">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => void handleCopyCupom(cupom.codigo)}
                          className="rounded-full border-[#d6e7a2] text-[#1b5e20] hover:bg-[#f7fde7]"
                        >
                          <Copy className="mr-2 h-4 w-4" />
                          Copiar
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => handleEditCupom(cupom)}
                          className="rounded-full border-[#d6e7a2] text-[#1b5e20] hover:bg-[#f7fde7]"
                        >
                          <Pencil className="mr-2 h-4 w-4" />
                          Editar
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={deletingCupomId === cupom.id}
                          onClick={() => void handleDeleteCupom(cupom.id)}
                          className="rounded-full border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          {deletingCupomId === cupom.id ? "Excluindo..." : "Excluir"}
                        </Button>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>
          </section>
        ) : activeTab === "configuracoes" ? (
          <section className="overflow-hidden rounded-[1.4rem] border border-[#d6e7a2] bg-white shadow-sm">
            <div className="grid lg:grid-cols-[1fr_340px]">
              <div className="space-y-6 p-5 sm:p-6">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wide text-[#618038]">
                      Controle de atendimento
                    </p>
                    <h2 className="mt-2 text-3xl font-bold tracking-normal text-[#0b3d18]">
                      Loja {settings.isOpen ? "aberta" : "fechada"}
                    </h2>
                    <p className="mt-2 max-w-xl text-sm leading-6 text-[#48654f]">
                      Esse controle muda o cardapio e impede novos pedidos quando a loja esta fechada.
                    </p>
                  </div>

                  <Button
                    type="button"
                    disabled={savingSettings}
                    onClick={() => void handleSaveSettings({ isOpen: !settings.isOpen })}
                    className={cn(
                      "h-14 rounded-full px-8 text-base font-bold text-white",
                      settings.isOpen ? "bg-rose-600 hover:bg-rose-700" : "bg-[#1b7f31] hover:bg-[#156326]"
                    )}
                  >
                    {settings.isOpen ? "Fechar agora" : "Abrir agora"}
                  </Button>
                </div>

                <div className="rounded-[1.2rem] border border-[#d6e7a2] bg-[#fbfff0] p-4">
                  <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-end">
                    <div className="space-y-2">
                      <label className="text-sm font-bold text-[#284a2e]">
                        Antecedencia minima para pedido
                      </label>
                      <Input
                        type="number"
                        min="0"
                        step="1"
                        value={settings.minimumLeadHours}
                        onChange={(event) =>
                          setSettings((current) => ({
                            ...current,
                            minimumLeadHours: Number(event.target.value || 0),
                          }))
                        }
                        className="h-12 max-w-30 mx-4 border-[#d6e7a2] bg-white text-lg font-bold text-[#0b3d18]"
                      />
                    </div>
                    <Button
                      type="button"
                      disabled={savingSettings}
                      onClick={() =>
                        void handleSaveSettings({
                          minimumLeadHours: Math.max(0, Math.round(settings.minimumLeadHours)),
                        })
                      }
                      className="h-12 rounded-full bg-[#1b7f31] px-6 font-bold text-white hover:bg-[#156326]"
                    >
                      {savingSettings ? "Salvando..." : "Salvar horario"}
                    </Button>
                  </div>
                </div>

                <div className="rounded-[1.2rem] border border-[#d6e7a2] bg-[#fbfff0] p-4">
                  <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                    <div>
                      <p className="text-sm font-bold text-[#284a2e]">
                        Pedidos no mesmo horario
                      </p>
                      <p className="mt-1 text-sm leading-6 text-[#48654f]">
                        Quando desligado, cada horario aceita apenas uma encomenda ativa.
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-semibold text-[#48654f]">
                        {settings.allowMultipleOrdersPerSlot ? "Varios por horario" : "Um por horario"}
                      </span>
                      <Checkbox
                        id="allow-multiple-orders-per-slot"
                        checked={settings.allowMultipleOrdersPerSlot}
                        disabled={savingSettings}
                        onCheckedChange={(checked) =>
                          void handleSaveSettings({
                            allowMultipleOrdersPerSlot: Boolean(checked),
                          })
                        }
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-4 rounded-[1.2rem] border border-[#f4b6c5] bg-[#fff5f8] p-4">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wide text-[#b4234b]">
                      Tema do site
                    </p>
                    <h3 className="mt-1 text-xl font-bold text-[#5f1029]">
                      {settings.siteTheme === "NAMORADOS"
                        ? "Dia dos Namorados em destaque"
                        : "Tema da Copa ativo"}
                    </h3>
                    <p className="mt-2 text-sm leading-6 text-[#7a3149]">
                      Troque a vitrine e a pagina do produto entre a campanha da Copa e a
                      campanha romantica.
                    </p>
                  </div>

                  <div className="grid gap-3 md:grid-cols-2">
                    {[
                      {
                        value: "NAMORADOS" as const,
                        title: "Dia dos Namorados",
                        description: "Destaca combos para casal, presentes e clima romantico.",
                        icon: Heart,
                        activeClass: "border-[#e11d48] bg-[#ffe4ec] text-[#881337]",
                      },
                      {
                        value: "COPA" as const,
                        title: "Copa",
                        description: "Volta para o visual verde e amarelo com combos especiais.",
                        icon: Trophy,
                        activeClass: "border-[#1b7f31] bg-[#f7fde7] text-[#0b3d18]",
                      },
                    ].map((themeOption) => {
                      const Icon = themeOption.icon;
                      const isActive = settings.siteTheme === themeOption.value;

                      return (
                        <button
                          key={themeOption.value}
                          type="button"
                          disabled={savingSettings || isActive}
                          onClick={() => void handleSaveSettings({ siteTheme: themeOption.value })}
                          className={cn(
                            "flex min-h-32 flex-col items-start gap-3 rounded-[1rem] border p-4 text-left transition",
                            isActive
                              ? themeOption.activeClass
                              : "border-[#f4b6c5] bg-white text-[#7a3149] hover:bg-[#fff0f4]"
                          )}
                        >
                          <Icon className="h-5 w-5" />
                          <span className="text-base font-bold">{themeOption.title}</span>
                          <span className="text-sm leading-5 opacity-80">
                            {themeOption.description}
                          </span>
                          <span className="mt-auto text-xs font-bold uppercase tracking-wide">
                            {isActive ? "Ativo agora" : "Aplicar tema"}
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  {settings.siteTheme === "NAMORADOS" ? (
                    <div className="rounded-[1rem] border border-[#e11d48] bg-white px-4 py-3 text-sm leading-6 text-[#7a3149]">
                      <strong className="text-[#be123c]">No site:</strong> textos, etiquetas e
                      destaques passam a falar de Dia dos Namorados, com cores em rosa e vinho.
                    </div>
                  ) : null}
                </div>

                <div className="space-y-4 rounded-[1.2rem] border border-[#d6e7a2] bg-[#fbfff0] p-4">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wide text-[#618038]">
                      Produto em destaque
                    </p>
                    <h3 className="mt-1 text-xl font-bold text-[#0b3d18]">
                      Escolha o produto principal do cardapio
                    </h3>
                    <p className="mt-2 text-sm leading-6 text-[#48654f]">
                      Esse produto aparece no bloco grande da vitrine. Produtos ocultos nao
                      aparecem no cardapio publico.
                    </p>
                  </div>

                  <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
                    <div className="space-y-2">
                      <label className="text-sm font-bold text-[#284a2e]">
                        Destaque atual
                      </label>
                      <Select
                        value={settings.featuredProductId ?? "AUTO"}
                        onValueChange={(value) =>
                          setSettings((current) => ({
                            ...current,
                            featuredProductId: value === "AUTO" ? null : value,
                          }))
                        }
                      >
                        <SelectTrigger className="h-12 w-full border-[#d6e7a2] bg-white text-sm text-[#0b3d18]">
                          <SelectValue placeholder="Selecione um produto" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="AUTO">Automatico: primeiro produto ativo</SelectItem>
                          {produtos.map((produto) => (
                            <SelectItem key={produto.id} value={produto.id}>
                              {produto.nome}
                              {produto.ativo ? "" : " (oculto)"}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <Button
                      type="button"
                      disabled={savingSettings}
                      onClick={() =>
                        void handleSaveSettings({
                          featuredProductId: settings.featuredProductId,
                        })
                      }
                      className="h-12 rounded-full bg-[#1b7f31] px-6 font-bold text-white hover:bg-[#156326]"
                    >
                      {savingSettings ? "Salvando..." : "Salvar destaque"}
                    </Button>
                  </div>
                </div>
              </div>

              <aside className="grid border-t border-[#e4edc9] bg-[#0b3d18] text-white lg:border-l lg:border-t-0">
                {[
                  { label: "Pedidos no painel", value: pedidos.length, icon: ShoppingBag },
                  { label: "Vendido no valor base", value: formatCurrency(totalBaseVendido), icon: CheckCheck },
                  { label: "Antecedencia", value: `${settings.minimumLeadHours}h`, icon: Clock },
                  {
                    label: "Pedidos por horario",
                    value: settings.allowMultipleOrdersPerSlot ? "Varios" : "Unico",
                    icon: TicketPercent,
                  },
                  {
                    label: "Tema do site",
                    value: settings.siteTheme === "NAMORADOS" ? "Namorados" : "Copa",
                    icon: settings.siteTheme === "NAMORADOS" ? Heart : Trophy,
                  },
                  {
                    label: "Produto destaque",
                    value:
                      produtos.find((produto) => produto.id === settings.featuredProductId)?.nome ||
                      "Automatico",
                    icon: Star,
                  },
                ].map((item) => {
                  const Icon = item.icon;

                  return (
                    <div key={item.label} className="border-b border-white/10 p-5 last:border-b-0">
                      <Icon className="h-5 w-5 text-[#f4d330]" />
                      <p className="mt-3 text-2xl font-bold">{item.value}</p>
                      <p className="mt-1 text-sm text-white/70">{item.label}</p>
                    </div>
                  );
                })}
              </aside>
            </div>
          </section>
        ) : (
          <section className="grid gap-5 xl:grid-cols-[380px_1fr]">
            <Card className="border-[#d6e7a2] bg-white/95 shadow-lg shadow-green-900/5 xl:sticky xl:top-6 xl:self-start">
              <CardHeader className="border-b border-[#e4edc9] bg-[#fbfff0]">
                <p className="text-xs font-bold uppercase tracking-wide text-[#618038]">
                  Editor
                </p>
                <CardTitle className="text-[#0b3d18]">
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
                    <label className="text-sm font-medium text-slate-700">Descrção</label>
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
                            categoria: value as ProductCategory,
                          }))
                        }
                      >
                        <SelectTrigger className="h-10 w-full border-[#d6e7a2] bg-white text-sm text-slate-700">
                          <SelectValue placeholder="Selecione a categoria" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="CENTO">Cento</SelectItem>
                          <SelectItem value="LANCHONETE">Lanchonete</SelectItem>
                          <SelectItem value="COMBO">Combo</SelectItem>
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
                        disabled={isComboCategory}
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
                        disabled={isComboCategory}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            maxTiposSalgado: event.target.value,
                          }))
                        }
                      />
                    </div>

                    {isComboCategory ? (
                      <div className="space-y-2 sm:col-span-2">
                        <label className="text-sm font-medium text-slate-700">
                          Itens fixos do combo
                        </label>
                        <div className="space-y-3 rounded-[1.4rem] border border-[#d6e7a2] bg-[#f7fde7] p-4">
                          {form.comboItens.map((item, index) => (
                            <div
                              key={`combo-${index}`}
                              className="grid gap-3 sm:grid-cols-[1fr_140px_auto]"
                            >
                              <Input
                                value={item.nome}
                                onChange={(event) =>
                                  updateComboItem(index, { nome: event.target.value })
                                }
                                placeholder={`Ex: item ${index + 1}`}
                                className="border-[#d6e7a2] bg-white"
                              />
                              <Input
                                type="number"
                                min="1"
                                step="1"
                                value={item.quantidade}
                                onChange={(event) =>
                                  updateComboItem(index, { quantidade: event.target.value })
                                }
                                className="border-[#d6e7a2] bg-white"
                              />
                              <Button
                                type="button"
                                variant="outline"
                                onClick={() => removeComboItem(index)}
                                className="rounded-full border-[#d6e7a2] text-[#1b5e20] hover:bg-[#f7fde7]"
                              >
                                <Trash2 className="mr-2 h-4 w-4" />
                                Remover
                              </Button>
                            </div>
                          ))}

                          <Button
                            type="button"
                            variant="outline"
                            onClick={addComboItem}
                            className="rounded-full border-[#d6e7a2] text-[#1b5e20] hover:bg-[#f7fde7]"
                          >
                            <Plus className="mr-2 h-4 w-4" />
                            Adicionar item fixo
                          </Button>
                          <p className="text-sm text-slate-500">
                            Para combo, as quantidades ficam travadas no cadastro e entram prontas no pedido.
                          </p>
                        </div>
                      </div>
                    ) : null}

                    {!isComboCategory ? (
                      <div className="space-y-2 sm:col-span-2">
                        <label className="text-sm font-medium text-slate-700">
                          Sabores sugeridos
                        </label>
                        <div className="space-y-3 rounded-[1.4rem] border border-[#d6e7a2] bg-[#f7fde7] p-4">
                          {form.saboresSugeridos.map((sabor, index) => (
                            <div
                              key={`sabor-${index}`}
                              className="flex flex-col gap-3 sm:flex-row sm:items-center"
                            >
                              <Input
                                value={sabor}
                                onChange={(event) => updateSabor(index, event.target.value)}
                                placeholder={`Ex: sabor ${index + 1}`}
                                className="flex-1 border-[#d6e7a2] bg-white"
                              />
                              <Button
                                type="button"
                                variant="outline"
                                onClick={() => removeSabor(index)}
                                className="rounded-full border-[#d6e7a2] text-[#1b5e20] hover:bg-[#f7fde7]"
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
                            className="rounded-full border-[#d6e7a2] text-[#1b5e20] hover:bg-[#f7fde7]"
                          >
                            <Plus className="mr-2 h-4 w-4" />
                            Adicionar sabor
                          </Button>
                          <p className="text-sm text-slate-500">
                            Cadastre cada tipo separadamente para a cliente escolher um por vez na montagem.
                          </p>
                        </div>
                      </div>
                    ) : null}

                    <div className="space-y-2 sm:col-span-2">
                      <label className="text-sm font-medium text-slate-700">Foto do produto</label>
                      <label className="flex h-10 cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed border-[#d6e7a2] bg-[#f7fde7] text-sm font-medium text-[#1b5e20] transition hover:bg-pink-100">
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
                    <div className="flex items-start gap-3 rounded-2xl border border-[#d6e7a2] bg-[#f7fde7] px-4 py-3">
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

                    <div className="flex items-start gap-3 rounded-2xl border border-[#d6e7a2] bg-[#f7fde7] px-4 py-3">
                      <Checkbox
                        id="produto-promocao"
                        checked={form.emPromocao}
                        onCheckedChange={(checked) =>
                          setForm((current) => ({ ...current, emPromocao: Boolean(checked) }))
                        }
                      />
                      <div className="flex-1 space-y-3">
                        <label htmlFor="produto-promocao" className="text-sm leading-6 text-slate-600">
                          Destacar este produto como promocao.
                        </label>
                        {form.emPromocao ? (
                          <div className="grid gap-2 sm:max-w-48">
                            <label className="text-xs font-bold uppercase tracking-wide text-[#618038]">
                              Desconto (%)
                            </label>
                            <Input
                              type="number"
                              min="0"
                              max="100"
                              step="0.01"
                              value={form.descontoPercentual}
                              onChange={(event) =>
                                setForm((current) => ({
                                  ...current,
                                  descontoPercentual: event.target.value,
                                }))
                              }
                              className="border-[#d6e7a2] bg-white"
                            />
                          </div>
                        ) : null}
                      </div>
                    </div>

                    <div className="flex items-start gap-3 rounded-2xl border border-[#d6e7a2] bg-[#f7fde7] px-4 py-3">
                      <Checkbox
                        id="produto-ativo"
                        checked={form.ativo}
                        onCheckedChange={(checked) =>
                          setForm((current) => ({ ...current, ativo: Boolean(checked) }))
                        }
                      />
                      <label htmlFor="produto-ativo" className="text-sm leading-6 text-slate-600">
                        Deixar visivel no cardapio.
                      </label>
                    </div>
                  </div>

                  {form.imagemBase64 && (
                    <div className="relative aspect-[4/3] overflow-hidden rounded-3xl border border-[#d6e7a2] bg-[#f7fde7]">
                      <Image
                        src={form.imagemBase64}
                        alt={form.nome || "PrÃ©via do produto"}
                        fill
                        unoptimized
                        className="object-cover"
                      />
                    </div>
                  )}

                  <div className="flex flex-col gap-3 sm:flex-row">
                    <Button type="submit" disabled={saving} className="rounded-full bg-[#1b7f31] text-white hover:bg-[#156326]">
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
                        className="rounded-full border-[#d6e7a2] text-[#1b5e20] hover:bg-[#f7fde7]"
                      >
                        Cancelar edição
                      </Button>
                    )}
                  </div>
                </form>
              </CardContent>
            </Card>

            <section className="overflow-hidden rounded-[1.4rem] border border-[#d6e7a2] bg-white shadow-sm">
              <div className="flex flex-col gap-2 border-b border-[#e4edc9] bg-[#0b3d18] p-4 text-white sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide text-[#f4d330]">
                    Cardapio
                  </p>
                  <h2 className="text-xl font-bold">Produtos cadastrados</h2>
                </div>
                <Badge className="w-fit border-[#f4d330] bg-[#f4d330] text-[#0b3d18]">
                  {produtos.length} item(ns)
                </Badge>
              </div>

              {produtos.length === 0 ? (
                <div className="p-10 text-center text-sm text-slate-500">
                  Nenhum produto cadastrado ainda.
                </div>
              ) : (
                <div className="divide-y divide-[#e4edc9]">
                  {produtos.map((produto) => (
                    <article
                      key={produto.id}
                      className="grid gap-4 p-4 transition hover:bg-[#fbfff0] md:grid-cols-[72px_1fr_auto] md:items-center"
                    >
                      <div className="relative h-20 overflow-hidden rounded-xl border border-[#d6e7a2] bg-[#f7fde7] md:h-16">
                        <Image
                          src={produto.imagemBase64}
                          alt={produto.nome}
                          fill
                          unoptimized
                          className="object-cover"
                        />
                      </div>

                      <div className="min-w-0 space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="truncate text-lg font-bold text-[#0b3d18]">{produto.nome}</h3>
                          <Badge className={produto.ativo ? "border border-emerald-200 bg-emerald-50 text-emerald-700" : "border border-slate-200 bg-slate-100 text-slate-600"}>
                            {produto.ativo ? "Ativo" : "Oculto"}
                          </Badge>
                          {produto.emPromocao ? (
                            <Badge className="border border-[#f4d330] bg-[#fff3a8] text-[#735600]">
                              Promoção {Number(produto.descontoPercentual || 0)}%
                            </Badge>
                          ) : null}
                        </div>
                        <p className="line-clamp-2 text-sm leading-6 text-[#48654f]">{produto.descricao}</p>
                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-[#618038]">
                          <span>{produto.categoria}</span>
                          <span>{produto.totalUnidades} un</span>
                          <span>Ate {produto.maxTiposSalgado} tipos</span>
                          <span>{produto.permitePagamentoParcial ? "50% ou 100%" : "100%"}</span>
                        </div>
                      </div>

                      <div className="flex flex-col gap-3 md:items-end">
                        {produto.emPromocao && Number(produto.descontoPercentual || 0) > 0 ? (
                          <div className="text-left md:text-right">
                            <p className="text-sm text-slate-400 line-through">
                              {formatCurrency(Number(produto.preco))}
                            </p>
                            <p className="text-xl font-bold text-[#0b3d18]">
                              {formatCurrency(
                                Number(produto.preco) *
                                  (1 - Number(produto.descontoPercentual || 0) / 100)
                              )}
                            </p>
                          </div>
                        ) : (
                          <p className="text-xl font-bold text-[#0b3d18]">
                            {formatCurrency(Number(produto.preco))}
                          </p>
                        )}
                        <div className="flex flex-wrap gap-2 md:justify-end">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => handleEdit(produto)}
                            className="rounded-full border-[#d6e7a2] text-[#1b5e20] hover:bg-[#f7fde7]"
                          >
                            <Pencil className="mr-2 h-4 w-4" />
                            Editar
                          </Button>
                          <Button
                            asChild
                            type="button"
                            variant="outline"
                            size="sm"
                            className="rounded-full border-[#d6e7a2] text-[#1b5e20] hover:bg-[#f7fde7]"
                          >
                            <Link href={`/pedido/${produto.slug}`}>Ver</Link>
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={deletingId === produto.id}
                            onClick={() => void handleDelete(produto.id)}
                            className="rounded-full border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            {deletingId === produto.id ? "Excluindo..." : "Excluir"}
                          </Button>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>
          </section>
        )}
      </div>
    </main>
  );
}
