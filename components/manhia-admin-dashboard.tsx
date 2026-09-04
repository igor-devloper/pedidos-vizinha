"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCheck,
  ChefHat,
  Clock,
  ChartNoAxesCombined,
  Copy,
  FerrisWheel,
  Heart,
  LoaderCircle,
  LogOut,
  MessageCircle,
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { type ComboItem, type ProductCategory } from "@/lib/produtos";
import { normalizeSaboresList } from "@/lib/sabores";
import type { StoreSiteTheme } from "@/lib/site-theme";
import { cn } from "@/lib/utils";
import {
  formatCurrency,
  formatDateTime,
  getPedidoStatusMeta,
} from "@/lib/pedidos";
import type { BusinessScheduleByWeekday, WeekdayIndex } from "@/lib/site-config";

export type ProdutoAdmin = {
  id: string;
  slug: string;
  nome: string;
  descricao: string;
  preco: string | number;
  precoConfeiteira: string | number | null;
  quantidadeMinimaConfeiteira: number | null;
  ativoConfeiteira: boolean;
  imagemBase64: string;
  categoria: ProductCategory;
  productTypeId: string | null;
  productTypeName: string | null;
  totalUnidades: number;
  maxTiposSalgado: number;
  permitePagamentoParcial: boolean;
  saboresSugeridos: string[];
  comboItens: ComboItem[];
  emPromocao: boolean;
  descontoPercentual: string | number;
  ativo: boolean;
  antecedenciaMinimaHoras: number | null;
  precisaSelecaoDeTipos: boolean;
  createdAt: string;
};

export type ProductTypeAdmin = {
  id: string;
  name: string;
  description: string | null;
  minQuantity: number | null;
  allowsMultiple: boolean;
  productsCount: number;
  createdAt: string;
};

export type SimpleOrderAdmin = {
  id: string;
  source: "SITE" | "WHATSAPP" | "ADMIN";
  code?: string | null;
  isConfeiteira: boolean;
  scheduledAt?: string | null;
  status: "PENDING" | "PAID" | "READY" | "DELIVERED" | "CANCELLED";
  customerName: string | null;
  customerPhone: string | null;
  totalAmount: string | number;
  paymentPercentage: number;
  paymentMethodLabel: string;
  chargedAmount: string | number;
  createdAt: string;
  fulfillmentType: "PICKUP" | "DELIVERY";
  deliveryAddress: string | null;
  deliveryReference: string | null;
  deliveryNeighborhood: string | null;
  deliveryMapsUrl: string | null;
  deliveryFee: number;
  deliveryFeeAgreed: boolean;
  provisionAmount: number;
  provisionTransferredAt: string | null;
  items: {
    id: string;
    productId: string;
    productName: string;
    productType: string;
    quantity: number;
    unitPrice: string | number;
    subtotal: string | number;
    selectedItems?: Array<{ tipo: string; quantidade: number }> | unknown;
  }[];
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
  createdAt: string;
  notificadoClienteAt: string | null;
  notificadoVizinhaAt: string | null;
  prontoAt?: string | null;
  notificadoProntoClienteAt?: string | null;
  notificadoToleranciaAt?: string | null;
  impressoAutomaticamenteAt: string | null;
  provisionAmount: string | number;
  provisionTransferredAt: string | null;
  itens: { id: string; tipo: string; quantidade: number }[];
};

export type StoreSettingsData = {
  isOpen: boolean;
  minimumLeadHours: number;
  allowMultipleOrdersPerSlot: boolean;
  operationSchedule: BusinessScheduleByWeekday;
  siteTheme: StoreSiteTheme;
  featuredProductId: string | null;
  motorcycleCourierPhone: string | null;
};

type ProdutoFormState = {
  nome: string;
  descricao: string;
  preco: string;
  precoConfeiteira: string;
  quantidadeMinimaConfeiteira: string;
  ativoConfeiteira: boolean;
  imagemBase64: string;
  categoria: ProductCategory;
  productTypeId: string;
  totalUnidades: string;
  maxTiposSalgado: string;
  permitePagamentoParcial: boolean;
  saboresSugeridos: string[];
  comboItens: Array<{ nome: string; quantidade: string }>;
  emPromocao: boolean;
  descontoPercentual: string;
  ativo: boolean;
  antecedenciaMinimaHoras: string;
  precisaSelecaoDeTipos: boolean;
};

type OrderEditFlavor = { tipo: string; quantidade: string };

function OrderEditFlavorPicker({
  product,
  flavors,
  onChange,
}: {
  product: ProdutoAdmin;
  flavors: OrderEditFlavor[];
  onChange: (flavors: OrderEditFlavor[]) => void;
}) {
  const total = flavors.reduce((sum, item) => sum + Number(item.quantidade || 0), 0);
  const maxTypes = product.maxTiposSalgado;
  return (
    <div className="mt-3 rounded-[1.35rem] border border-[#f4a8eb] bg-white p-3 sm:p-4">
      <div className="flex items-center justify-between gap-3"><p className="text-base font-bold text-[#641052]">Sabores do pedido</p><p className="text-sm font-bold text-[#72506b]">{total}/{product.totalUnidades} un</p></div>
      <div className="mt-3 space-y-2">
        {flavors.map((flavor, index) => <div key={index} className="grid gap-3 rounded-[1.1rem] bg-[#fff0fc] p-3 sm:grid-cols-[minmax(0,1fr)_130px_auto]">
          <div className="space-y-1"><label className="text-sm font-medium text-[#641052]">Tipo de salgado {index + 1}</label><Select value={flavor.tipo} onValueChange={(tipo) => onChange(flavors.map((item, itemIndex) => itemIndex === index ? { ...item, tipo } : item))}><SelectTrigger className="border-[#f4a8eb] bg-white"><SelectValue placeholder="Selecione o salgado" /></SelectTrigger><SelectContent>{product.saboresSugeridos.map((sabor) => <SelectItem key={sabor} value={sabor}>{sabor}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-1"><label className="text-sm font-medium text-[#641052]">Quantidade</label><Input type="number" min="0" value={flavor.quantidade} onChange={(event) => onChange(flavors.map((item, itemIndex) => itemIndex === index ? { ...item, quantidade: event.target.value } : item))} className="border-[#f4a8eb] bg-white text-center font-bold" /></div>
          <Button type="button" variant="outline" className="self-end border-[#f4a8eb] text-[#e000cf] hover:bg-[#fff0fc]" disabled={flavors.length <= 1} onClick={() => onChange(flavors.filter((_, itemIndex) => itemIndex !== index))}>− Remover</Button>
        </div>)}
      </div>
      <div className="mt-3 flex items-center justify-between gap-3"><p className="text-sm text-[#72506b]">Máximo de {maxTypes} tipos para este item.</p><Button type="button" variant="outline" disabled={flavors.length >= maxTypes} onClick={() => onChange([...flavors, { tipo: "", quantidade: "0" }])} className="rounded-full border-[#f4a8eb] text-[#e000cf] hover:bg-[#fff0fc]">＋ Tipo</Button></div>
    </div>
  );
}


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
  precoConfeiteira: "",
  quantidadeMinimaConfeiteira: "",
  ativoConfeiteira: false,
  imagemBase64: "",
  categoria: "CENTO",
  productTypeId: "",
  totalUnidades: "100",
  maxTiposSalgado: "5",
  permitePagamentoParcial: true,
  saboresSugeridos: [""],
  comboItens: [{ nome: "", quantidade: "1" }],
  emPromocao: false,
  descontoPercentual: "",
  ativo: true,
  antecedenciaMinimaHoras: "",
  precisaSelecaoDeTipos: true,
};

type ProductTypeFormState = {
  name: string;
  description: string;
  minQuantity: string;
  allowsMultiple: boolean;
};

const EMPTY_PRODUCT_TYPE_FORM: ProductTypeFormState = {
  name: "",
  description: "",
  minQuantity: "",
  allowsMultiple: true,
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

const WEEKDAY_OPTIONS: Array<{ value: WeekdayIndex; label: string }> = [
  { value: 0, label: "Domingo" },
  { value: 1, label: "Segunda" },
  { value: 2, label: "Terça" },
  { value: 3, label: "Quarta" },
  { value: 4, label: "Quinta" },
  { value: 5, label: "Sexta" },
  { value: 6, label: "Sábado" },
];

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
    reader.onerror = () =>
      reject(new Error("Não foi possível ler a imagem."));
    reader.readAsDataURL(file);
  });
}

function getSimpleOrderCode(order: Pick<SimpleOrderAdmin, "id" | "code">) {
  return order.code || order.id.slice(0, 10).toUpperCase();
}

function getSimpleOrderDate(
  order: Pick<SimpleOrderAdmin, "createdAt" | "scheduledAt">,
) {
  return order.scheduledAt || order.createdAt;
}

function normalizeSimpleOrderSelectedItems(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => {
      if (!entry || typeof entry !== "object") {
        return null;
      }

      const typed = entry as { tipo?: unknown; quantidade?: unknown };
      const tipo = typeof typed.tipo === "string" ? typed.tipo.trim() : "";
      const quantidade = Number(typed.quantidade);

      if (!tipo || !Number.isFinite(quantidade) || quantidade <= 0) {
        return null;
      }

      return { tipo, quantidade };
    })
    .filter((entry): entry is { tipo: string; quantidade: number } =>
      Boolean(entry),
    );
}

function getSimpleOrderSalgados(order: SimpleOrderAdmin) {
  const map = new Map<string, number>();

  for (const item of order.items) {
    for (const selected of normalizeSimpleOrderSelectedItems(
      item.selectedItems,
    )) {
      map.set(
        selected.tipo,
        (map.get(selected.tipo) ?? 0) + selected.quantidade,
      );
    }
  }

  return Array.from(map.entries()).map(([tipo, quantidade]) => ({
    tipo,
    quantidade,
  }));
}

function getSimpleOrderSalgadosSummary(order: SimpleOrderAdmin) {
  const salgados = getSimpleOrderSalgados(order);
  const total = salgados.reduce((sum, item) => sum + item.quantidade, 0);

  if (salgados.length === 0) {
    return `${order.items.reduce((sum, item) => sum + item.quantity, 0)} produto(s)`;
  }

  return `${total} un - ${salgados
    .map((item) => `${item.tipo}: ${item.quantidade}`)
    .join(" • ")}`;
}

function getSimpleOrderStatusLabel(status: SimpleOrderAdmin["status"]) {
  if (status === "PAID") return "Pago";
  if (status === "READY") return "Pronto";
  if (status === "DELIVERED") return "Entregue";
  if (status === "CANCELLED") return "Cancelado";
  return "Pendente";
}

function mapKanbanStatusToCartStatus(status: "PAGO" | "PRONTO" | "ENTREGUE") {
  if (status === "PRONTO") return "READY" as const;
  if (status === "ENTREGUE") return "DELIVERED" as const;
  return "PAID" as const;
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

function getNextSimpleOrderStatus(status: SimpleOrderAdmin["status"]) {
  if (status === "PAID") return "READY" as const;
  if (status === "READY") return "DELIVERED" as const;
  return null;
}

export function ManhiaAdminDashboard({
  initialProdutos,
  initialPedidos,
  initialSimpleOrders,
  initialProductTypes,
  initialCupons,
  initialSettings,
}: {
  initialProdutos: ProdutoAdmin[];
  initialPedidos: PedidoAdmin[];
  initialSimpleOrders: SimpleOrderAdmin[];
  initialProductTypes: ProductTypeAdmin[];
  initialCupons: CupomAdmin[];
  initialSettings: StoreSettingsData;
}) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<
    | "analise"
    | "pedidos"
    | "salgados"
    | "produtos"
    | "tipos"
    | "cupons"
    | "configuracoes"
  >("pedidos");
  const [produtos, setProdutos] = useState(initialProdutos);
  const [pedidos, setPedidos] = useState(initialPedidos);
  const [simpleOrders, setSimpleOrders] = useState(initialSimpleOrders);
  const [productTypes, setProductTypes] = useState(initialProductTypes);
  const [cupons, setCupons] = useState(initialCupons);
  const [settings, setSettings] = useState(initialSettings);
  const [form, setForm] = useState<ProdutoFormState>(EMPTY_FORM);
  const [productTypeForm, setProductTypeForm] = useState<ProductTypeFormState>(
    EMPTY_PRODUCT_TYPE_FORM,
  );
  const [cupomForm, setCupomForm] = useState<CupomFormState>(EMPTY_CUPOM_FORM);
  const [saving, setSaving] = useState(false);
  const [savingProductType, setSavingProductType] = useState(false);
  const [savingCupom, setSavingCupom] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [transferringProvision, setTransferringProvision] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [productDialogOpen, setProductDialogOpen] = useState(false);
  const [editingProductTypeId, setEditingProductTypeId] = useState<
    string | null
  >(null);
  const [editingCupomId, setEditingCupomId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deletingProductTypeId, setDeletingProductTypeId] = useState<
    string | null
  >(null);
  const [deletingCupomId, setDeletingCupomId] = useState<string | null>(null);
  const [statusLoadingId, setStatusLoadingId] = useState<string | null>(null);
  const [draggedPedidoId, setDraggedPedidoId] = useState<string | null>(null);
  const [dragOverStatus, setDragOverStatus] = useState<
    "PAGO" | "PRONTO" | "ENTREGUE" | null
  >(null);
  const [refreshingPedidos, setRefreshingPedidos] = useState(false);
  const [printingPedidoId, setPrintingPedidoId] = useState<string | null>(null);
  const [selectedPedido, setSelectedPedido] = useState<PedidoAdmin | null>(null);
  const [selectedSimpleOrder, setSelectedSimpleOrder] = useState<SimpleOrderAdmin | null>(null);
  const [editingSimpleOrder, setEditingSimpleOrder] = useState<SimpleOrderAdmin | null>(null);
  const [savingOrderEdit, setSavingOrderEdit] = useState(false);
  const [orderEditItems, setOrderEditItems] = useState<Array<{ productId: string; quantity: string; selectedItems: OrderEditFlavor[] }>>([]);
  const [orderEditFulfillment, setOrderEditFulfillment] = useState<"PICKUP" | "DELIVERY">("PICKUP");
  const [orderEditAddress, setOrderEditAddress] = useState("");
  const [orderEditNeighborhood, setOrderEditNeighborhood] = useState("");
  const [orderEditReference, setOrderEditReference] = useState("");
  const [orderEditScheduledAt, setOrderEditScheduledAt] = useState("");
  const [orderEditPaidAmount, setOrderEditPaidAmount] = useState("");
  const orderEditAddressRef = useRef<HTMLInputElement>(null);
  const [orderEditPlace, setOrderEditPlace] = useState({ placeId: "", city: "", latitude: 0, longitude: 0 });
  const [messageDialogOpen, setMessageDialogOpen] = useState(false);
  const [bulkMessage, setBulkMessage] = useState("");
  const [messageDelaySeconds, setMessageDelaySeconds] = useState("15");
  const [customerCount, setCustomerCount] = useState<number | null>(null);
  const [sendingMessages, setSendingMessages] = useState(false);
  const [stoppingMessages, setStoppingMessages] = useState(false);
  const [messageCampaignId, setMessageCampaignId] = useState<string | null>(null);
  const [messageProgress, setMessageProgress] = useState({ processed: 0, sent: 0, failed: 0 });
  const [analyticsStartDate, setAnalyticsStartDate] = useState("");
  const [analyticsEndDate, setAnalyticsEndDate] = useState("");
  const [analyticsStatus, setAnalyticsStatus] = useState("TODOS");
  const [analyticsProduct, setAnalyticsProduct] = useState("TODOS");

  useEffect(() => {
    if (!editingSimpleOrder || orderEditFulfillment !== "DELIVERY" || !orderEditAddressRef.current) return;
    const setup = () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const google = (window as unknown as { google?: any }).google;
      if (!google?.maps?.places || !orderEditAddressRef.current) return;
      const autocomplete = new google.maps.places.Autocomplete(orderEditAddressRef.current, { componentRestrictions: { country: "br" }, fields: ["place_id", "formatted_address", "address_components", "geometry"], types: ["address"] });
      autocomplete.addListener("place_changed", () => {
        const place = autocomplete.getPlace();
        const component = (type: string) => place.address_components?.find((entry: { types: string[] }) => entry.types.includes(type))?.long_name || "";
        setOrderEditAddress(place.formatted_address || "");
        setOrderEditNeighborhood(component("sublocality_level_1") || component("sublocality") || component("neighborhood"));
        setOrderEditPlace({ placeId: place.place_id || "", city: component("administrative_area_level_2"), latitude: place.geometry?.location?.lat() || 0, longitude: place.geometry?.location?.lng() || 0 });
      });
    };
    const existing = document.querySelector<HTMLScriptElement>('script[data-vizinha-admin-google-maps]');
    if (existing) { existing.addEventListener("load", setup); setup(); return () => existing.removeEventListener("load", setup); }
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "")}&libraries=places&language=pt-BR&region=BR`;
    script.async = true; script.dataset.vizinhaAdminGoogleMaps = "true"; script.addEventListener("load", setup); document.head.appendChild(script);
    return () => script.removeEventListener("load", setup);
  }, [editingSimpleOrder, orderEditFulfillment]);

  const openMessageDialog = async () => {
    setMessageDialogOpen(true);
    setMessageCampaignId(null);
    setMessageProgress({ processed: 0, sent: 0, failed: 0 });
    try {
      const response = await fetch("/api/manhia/mensagens", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Não foi possível contar os clientes.");
      setCustomerCount(data.total);
    } catch (error) {
      setCustomerCount(null);
      toast.error(error instanceof Error ? error.message : "Erro ao carregar clientes.");
    }
  };

  const sendBulkMessage = async () => {
    const message = bulkMessage.trim();
    if (!message) {
      toast.error("Escreva a mensagem antes de enviar.");
      return;
    }

    setSendingMessages(true);
    setMessageProgress({ processed: 0, sent: 0, failed: 0 });
    try {
      const createResponse = await fetch("/api/manhia/mensagens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create", message, delaySeconds: Number(messageDelaySeconds) }),
      });
      const created: { error?: string; id?: string; campaignId?: string; total: number; previouslySent?: number } = await createResponse.json();
      if (!createResponse.ok) throw new Error(created.error || "Não foi possível criar a campanha.");
      const campaignId = created.campaignId || created.id;
      if (!campaignId) {
        throw new Error("A campanha foi criada sem identificador. Atualize a página e tente novamente.");
      }
      setMessageCampaignId(campaignId);
      setCustomerCount(created.total);
      if (created.previouslySent) {
        toast.info(`${created.previouslySent} cliente(s) já haviam recebido esta mesma mensagem e foram ignorados.`);
      }

      let status = "RUNNING";
      while (status === "RUNNING") {
        const response = await fetch("/api/manhia/mensagens", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "process", campaignId }),
        });
        const data: {
          error?: string;
          total: number;
          sent: number;
          failed: number;
          processed: number;
          status: string;
        } = await response.json();
        if (!response.ok) throw new Error(data.error || "Não foi possível enviar as mensagens.");
        status = data.status;
        setCustomerCount(data.total);
        setMessageProgress({ processed: data.processed, sent: data.sent, failed: data.failed });
      }
      if (status === "STOPPED") toast.info("Envio interrompido.");
      else toast.success("Envio concluído.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro durante o envio.");
    } finally {
      setSendingMessages(false);
    }
  };

  const stopBulkMessage = async () => {
    if (!messageCampaignId) return;
    setStoppingMessages(true);
    try {
      const response = await fetch("/api/manhia/mensagens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "stop", campaignId: messageCampaignId }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Não foi possível parar o envio.");
      toast.info("Parada solicitada. Nenhuma nova mensagem será iniciada.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao parar o envio.");
    } finally {
      setStoppingMessages(false);
    }
  };

  const totalBaseVendido = useMemo(
    () => {
      const totalPedidos = pedidos
        .filter((pedido) => pedido.status !== "CANCELADO")
        .reduce((total, pedido) => total + Number(pedido.subtotal || 0), 0);
      const totalOrders = simpleOrders
        .filter((order) => order.status !== "CANCELLED")
        .reduce((total, order) => total + Number(order.totalAmount || 0), 0);

      return totalPedidos + totalOrders;
    },
    [pedidos, simpleOrders],
  );
  const totalProvisionPending = useMemo(
    () => pedidos.filter((item) => !item.provisionTransferredAt).reduce((sum, item) => sum + Number(item.provisionAmount || 0), 0)
      + simpleOrders.filter((item) => !item.provisionTransferredAt).reduce((sum, item) => sum + Number(item.provisionAmount || 0), 0),
    [pedidos, simpleOrders],
  );

  const analytics = useMemo(() => {
    const inPeriod = (date: string) => {
      const timestamp = new Date(date).getTime();
      const start = analyticsStartDate ? new Date(`${analyticsStartDate}T00:00:00`).getTime() : -Infinity;
      const end = analyticsEndDate ? new Date(`${analyticsEndDate}T23:59:59.999`).getTime() : Infinity;
      return timestamp >= start && timestamp <= end;
    };
    const statusMatches = (status: string) => {
      if (analyticsStatus === "TODOS") return true;
      const normalized: Record<string, string> = {
        PENDING: "PENDENTE_PAGAMENTO", PAID: "PAGO", READY: "PRONTO",
        DELIVERED: "ENTREGUE", CANCELLED: "CANCELADO",
      };
      return (normalized[status] || status) === analyticsStatus;
    };
    const filteredPedidos = pedidos.filter((pedido) =>
      inPeriod(pedido.dataEntrega || pedido.createdAt) && statusMatches(pedido.status) &&
      (analyticsProduct === "TODOS" || pedido.produtoNomeSnapshot === analyticsProduct));
    const filteredOrders = simpleOrders.filter((order) =>
      inPeriod(getSimpleOrderDate(order)) && statusMatches(order.status) &&
      (analyticsProduct === "TODOS" || order.items.some((item) => item.productName === analyticsProduct)));
    const statusCounts: Record<string, number> = {
      PENDENTE_PAGAMENTO: 0, PAGO: 0, EM_PREPARO: 0, PRONTO: 0, ENTREGUE: 0, CANCELADO: 0,
    };
    filteredPedidos.forEach((pedido) => { statusCounts[pedido.status] += 1; });
    filteredOrders.forEach((order) => {
      const mapped = { PENDING: "PENDENTE_PAGAMENTO", PAID: "PAGO", READY: "PRONTO", DELIVERED: "ENTREGUE", CANCELLED: "CANCELADO" }[order.status];
      statusCounts[mapped] += 1;
    });
    const productMap = new Map<string, { quantity: number; revenue: number }>();
    filteredPedidos.filter((pedido) => pedido.status !== "CANCELADO").forEach((pedido) => {
      const current = productMap.get(pedido.produtoNomeSnapshot) || { quantity: 0, revenue: 0 };
      current.quantity += pedido.totalUnidades;
      current.revenue += Number(pedido.subtotal || 0);
      productMap.set(pedido.produtoNomeSnapshot, current);
    });
    filteredOrders.filter((order) => order.status !== "CANCELLED").forEach((order) => order.items.forEach((item) => {
      const current = productMap.get(item.productName) || { quantity: 0, revenue: 0 };
      current.quantity += item.quantity;
      current.revenue += Number(item.subtotal || 0);
      productMap.set(item.productName, current);
    }));
    const products = Array.from(productMap, ([name, values]) => ({ name, ...values }));
    const validPedidos = filteredPedidos.filter((pedido) => pedido.status !== "CANCELADO");
    const validOrders = filteredOrders.filter((order) => order.status !== "CANCELLED");
    const sold = validPedidos.reduce((sum, pedido) => sum + Number(pedido.subtotal || 0), 0) + validOrders.reduce((sum, order) => sum + Number(order.totalAmount || 0), 0);
    const received = filteredPedidos.filter((pedido) => !["PENDENTE_PAGAMENTO", "CANCELADO"].includes(pedido.status)).reduce((sum, pedido) => sum + Number(pedido.totalCobrado || 0), 0) + filteredOrders.filter((order) => !["PENDING", "CANCELLED"].includes(order.status)).reduce((sum, order) => sum + Number(order.chargedAmount || order.totalAmount || 0), 0);
    const paymentMap = new Map<string, { total: number; count: number }>();
    validPedidos.forEach((pedido) => { const current = paymentMap.get(pedido.metodoPagamentoLabel) || { total: 0, count: 0 }; current.total += Number(pedido.subtotal || 0); current.count += 1; paymentMap.set(pedido.metodoPagamentoLabel, current); });
    validOrders.forEach((order) => { const current = paymentMap.get(order.paymentMethodLabel) || { total: 0, count: 0 }; current.total += Number(order.totalAmount || 0); current.count += 1; paymentMap.set(order.paymentMethodLabel, current); });
    const total = filteredPedidos.length + filteredOrders.length;
    return {
      total, sold, received, averageTicket: validPedidos.length + validOrders.length ? sold / (validPedidos.length + validOrders.length) : 0,
      provision: filteredPedidos.filter((item) => !item.provisionTransferredAt).reduce((sum, item) => sum + Number(item.provisionAmount || 0), 0) + filteredOrders.filter((item) => !item.provisionTransferredAt).reduce((sum, item) => sum + Number(item.provisionAmount || 0), 0),
      cancellationRate: total ? (statusCounts.CANCELADO / total) * 100 : 0,
      statusCounts,
      topQuantity: [...products].sort((a, b) => b.quantity - a.quantity).slice(0, 5),
      topRevenue: [...products].sort((a, b) => b.revenue - a.revenue).slice(0, 5),
      paymentAverages: Array.from(paymentMap, ([label, value]) => ({ label, average: value.total / value.count })),
    };
  }, [analyticsEndDate, analyticsProduct, analyticsStartDate, analyticsStatus, pedidos, simpleOrders]);

  const handleProvisionTransferred = async () => {
    try {
      setTransferringProvision(true);
      const response = await fetch("/api/manhia/provisoes", { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Não foi possível registrar a transferência.");
      const transferredAt = String(data.transferredAt);
      setPedidos((current) => current.map((item) => Number(item.provisionAmount) > 0 && !item.provisionTransferredAt ? { ...item, provisionTransferredAt: transferredAt } : item));
      setSimpleOrders((current) => current.map((item) => item.provisionAmount > 0 && !item.provisionTransferredAt ? { ...item, provisionTransferredAt: transferredAt } : item));
      toast.success("Transferência da provisão registrada.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao registrar transferência.");
    } finally {
      setTransferringProvision(false);
    }
  };
  const pedidosPorStatus = useMemo(
    () => ({
      PAGO: pedidos
        .filter(
          (pedido) =>
            pedido.status === "PAGO" || pedido.status === "EM_PREPARO",
        )
        .sort(
          (a, b) =>
            new Date(a.dataEntrega).getTime() -
            new Date(b.dataEntrega).getTime(),
        ),
      PRONTO: pedidos
        .filter((pedido) => pedido.status === "PRONTO")
        .sort(
          (a, b) =>
            new Date(a.dataEntrega).getTime() -
            new Date(b.dataEntrega).getTime(),
        ),
      ENTREGUE: pedidos
        .filter((pedido) => pedido.status === "ENTREGUE")
        .sort(
          (a, b) =>
            new Date(a.dataEntrega).getTime() -
            new Date(b.dataEntrega).getTime(),
        ),
    }),
    [pedidos],
  );

  const simpleOrdersPendentes = useMemo(
    () => simpleOrders.filter((order) => order.status === "PENDING"),
    [simpleOrders],
  );
  const pedidosCancelados = useMemo(
    () => pedidos.filter((pedido) => pedido.status === "CANCELADO"),
    [pedidos],
  );
  const simpleOrdersCancelados = useMemo(
    () => simpleOrders.filter((order) => order.status === "CANCELLED"),
    [simpleOrders],
  );

  const simpleOrdersPorStatus = useMemo(
    () => ({
      PAGO: simpleOrders
        .filter((order) => order.status === "PAID")
        .sort(
          (a, b) =>
            new Date(getSimpleOrderDate(a)).getTime() -
            new Date(getSimpleOrderDate(b)).getTime(),
        ),
      PRONTO: simpleOrders
        .filter((order) => order.status === "READY")
        .sort(
          (a, b) =>
            new Date(getSimpleOrderDate(a)).getTime() -
            new Date(getSimpleOrderDate(b)).getTime(),
        ),
      ENTREGUE: simpleOrders
        .filter((order) => order.status === "DELIVERED")
        .sort(
          (a, b) =>
            new Date(getSimpleOrderDate(a)).getTime() -
            new Date(getSimpleOrderDate(b)).getTime(),
        ),
    }),
    [simpleOrders],
  );
  const kanbanPedidosPorStatus = useMemo(
    () =>
      KANBAN_COLUMNS.reduce(
        (acc, column) => {
          acc[column.status] = [
            ...pedidosPorStatus[column.status].map((pedido) => ({
              kind: "pedido" as const,
              id: pedido.id,
              createdAt: pedido.createdAt,
              deliveryAt: pedido.dataEntrega,
              pedido,
            })),
            ...simpleOrdersPorStatus[column.status].map((order) => ({
              kind: "cart" as const,
              id: order.id,
              createdAt: order.createdAt,
              deliveryAt: getSimpleOrderDate(order),
              order,
            })),
          ].sort(
            (a, b) =>
              new Date(a.deliveryAt).getTime() -
                new Date(b.deliveryAt).getTime() ||
              new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
          );

          return acc;
        },
        {
          PAGO: [],
          PRONTO: [],
          ENTREGUE: [],
        } as Record<
          "PAGO" | "PRONTO" | "ENTREGUE",
          Array<
            | {
                kind: "pedido";
                id: string;
                createdAt: string;
                deliveryAt: string;
                pedido: PedidoAdmin;
              }
            | {
                kind: "cart";
                id: string;
                createdAt: string;
                deliveryAt: string;
                order: SimpleOrderAdmin;
              }
          >
        >,
      ),
    [pedidosPorStatus, simpleOrdersPorStatus],
  );
  const pedidosPendentes = useMemo(
    () => pedidos.filter((pedido) => pedido.status === "PENDENTE_PAGAMENTO"),
    [pedidos],
  );

  const pedidosAceitos = useMemo(
    () =>
      pedidos
        .filter(
          (p) => p.status !== "CANCELADO" && p.status !== "PENDENTE_PAGAMENTO",
        )
        .sort(
          (a, b) =>
            new Date(a.dataEntrega).getTime() -
            new Date(b.dataEntrega).getTime(),
        ),
    [pedidos],
  );

  const pedidosParaProduzir = useMemo(
    () => pedidosAceitos.filter((p) => p.status !== "ENTREGUE"),
    [pedidosAceitos],
  );

  const simpleOrdersParaProduzir = useMemo(
    () =>
      simpleOrders.filter(
        (order) => order.status === "PAID" || order.status === "READY",
      ),
    [simpleOrders],
  );

  const salgadosPorDia = useMemo(() => {
    const map = new Map<string, Map<string, number>>();

    const addItem = (dia: string, tipo: string, quantidade: number) => {
      if (!map.has(dia)) map.set(dia, new Map());
      const tiposMap = map.get(dia)!;
      tiposMap.set(tipo, (tiposMap.get(tipo) ?? 0) + quantidade);
    };

    for (const pedido of pedidosParaProduzir) {
      const dia = new Intl.DateTimeFormat("pt-BR", {
        dateStyle: "short",
        timeZone: "America/Sao_Paulo",
      }).format(new Date(pedido.dataEntrega));
      for (const item of pedido.itens) {
        addItem(dia, item.tipo, item.quantidade);
      }
    }

    for (const order of simpleOrdersParaProduzir) {
      const dia = new Intl.DateTimeFormat("pt-BR", {
        dateStyle: "short",
        timeZone: "America/Sao_Paulo",
      }).format(new Date(getSimpleOrderDate(order)));
      for (const item of getSimpleOrderSalgados(order)) {
        addItem(dia, item.tipo, item.quantidade);
      }
    }

    return Array.from(map.entries()).map(([dia, tiposMap]) => ({
      dia,
      itens: Array.from(tiposMap.entries())
        .map(([tipo, quantidade]) => ({ tipo, quantidade }))
        .sort((a, b) => b.quantidade - a.quantidade),
      total: Array.from(tiposMap.values()).reduce((s, q) => s + q, 0),
    }));
  }, [pedidosParaProduzir, simpleOrdersParaProduzir]);

  const salgadosTotaisPorTipo = useMemo(() => {
    const map = new Map<string, number>();

    for (const dia of salgadosPorDia) {
      for (const item of dia.itens) {
        map.set(item.tipo, (map.get(item.tipo) ?? 0) + item.quantidade);
      }
    }

    return Array.from(map.entries())
      .map(([tipo, quantidade]) => ({ tipo, quantidade }))
      .sort((a, b) => b.quantidade - a.quantidade || a.tipo.localeCompare(b.tipo));
  }, [salgadosPorDia]);

  const totalSalgadosParaProduzir = useMemo(
    () =>
      salgadosTotaisPorTipo.reduce(
        (total, item) => total + item.quantidade,
        0,
      ),
    [salgadosTotaisPorTipo],
  );

  const refreshPedidos = async () => {
    try {
      setRefreshingPedidos(true);
      const response = await fetch("/api/manhia/pedidos", {
        cache: "no-store",
      });
      if (!response.ok) {
        throw new Error("Não foi possível atualizar os pedidos.");
      }

      const data = (await response.json()) as
        | PedidoAdmin[]
        | { pedidos?: PedidoAdmin[]; simpleOrders?: SimpleOrderAdmin[] };

      if (Array.isArray(data)) {
        setPedidos(data);
      } else {
        setPedidos(data.pedidos || []);
        setSimpleOrders(data.simpleOrders || []);
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
  }, []);

  const resetForm = () => {
    setForm(EMPTY_FORM);
    setEditingId(null);
  };

  const resetProductTypeForm = () => {
    setProductTypeForm(EMPTY_PRODUCT_TYPE_FORM);
    setEditingProductTypeId(null);
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
        itemIndex === index ? value : item,
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
          : current.saboresSugeridos.filter(
              (_, itemIndex) => itemIndex !== index,
            ),
    }));
  };

  const updateComboItem = (
    index: number,
    patch: Partial<{ nome: string; quantidade: string }>,
  ) => {
    setForm((current) => ({
      ...current,
      comboItens: current.comboItens.map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...patch } : item,
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
    event: React.ChangeEvent<HTMLInputElement>,
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
      toast.error(
        error instanceof Error ? error.message : "Falha ao carregar a imagem.",
      );
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
        editingId
          ? `/api/manhia/produtos/${editingId}`
          : "/api/manhia/produtos",
        {
          method: editingId ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            nome: form.nome,
            descricao: form.descricao,
            preco: form.preco,
            precoConfeiteira: form.precoConfeiteira === "" ? null : form.precoConfeiteira,
            quantidadeMinimaConfeiteira: form.quantidadeMinimaConfeiteira === "" ? null : form.quantidadeMinimaConfeiteira,
            ativoConfeiteira: form.ativoConfeiteira,
            imagemBase64: form.imagemBase64,
            categoria: form.categoria,
            productTypeId: form.productTypeId || null,
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
            antecedenciaMinimaHoras: form.antecedenciaMinimaHoras === "" ? null : form.antecedenciaMinimaHoras,
            precisaSelecaoDeTipos: form.precisaSelecaoDeTipos,
          }),
        },
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
          return current.map((item) =>
            item.id === produto.id ? produto : item,
          );
        }

        return [produto, ...current];
      });

      toast.success(editingId ? "Produto atualizado." : "Produto criado.");
      resetForm();
      setProductDialogOpen(false);
      router.refresh();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Não foi possível salvar.",
      );
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
      precoConfeiteira: produto.precoConfeiteira === null ? "" : Number(produto.precoConfeiteira).toFixed(2),
      quantidadeMinimaConfeiteira: produto.quantidadeMinimaConfeiteira === null ? "" : String(produto.quantidadeMinimaConfeiteira),
      ativoConfeiteira: produto.ativoConfeiteira,
      imagemBase64: produto.imagemBase64,
      categoria: produto.categoria,
      productTypeId: produto.productTypeId || "",
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
      antecedenciaMinimaHoras: produto.antecedenciaMinimaHoras === null ? "" : String(produto.antecedenciaMinimaHoras),
      precisaSelecaoDeTipos: produto.precisaSelecaoDeTipos,
    });
    setProductDialogOpen(true);
  };

  const handleProductTypeSubmit = async (
    event: React.FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();

    try {
      setSavingProductType(true);
      const response = await fetch(
        editingProductTypeId
          ? `/api/manhia/product-types/${editingProductTypeId}`
          : "/api/manhia/product-types",
        {
          method: editingProductTypeId ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: productTypeForm.name,
            description: productTypeForm.description,
            minQuantity: productTypeForm.minQuantity || null,
            allowsMultiple: productTypeForm.allowsMultiple,
          }),
        },
      );

      const data = (await response.json().catch(() => null)) as
        | (ProductTypeAdmin & { error?: string })
        | null;

      if (!response.ok) {
        throw new Error(data?.error || "Não foi possível salvar o tipo.");
      }

      const productType = data as ProductTypeAdmin;
      setProductTypes((current) =>
        editingProductTypeId
          ? current.map((item) =>
              item.id === productType.id ? productType : item,
            )
          : [...current, productType],
      );
      toast.success(editingProductTypeId ? "Tipo atualizado." : "Tipo criado.");
      resetProductTypeForm();
      router.refresh();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Não foi possível salvar o tipo.",
      );
    } finally {
      setSavingProductType(false);
    }
  };

  const handleEditProductType = (productType: ProductTypeAdmin) => {
    setEditingProductTypeId(productType.id);
    setProductTypeForm({
      name: productType.name,
      description: productType.description || "",
      minQuantity: productType.minQuantity
        ? String(productType.minQuantity)
        : "",
      allowsMultiple: productType.allowsMultiple,
    });
  };

  const handleDeleteProductType = async (productTypeId: string) => {
    try {
      setDeletingProductTypeId(productTypeId);
      const response = await fetch(
        `/api/manhia/product-types/${productTypeId}`,
        {
          method: "DELETE",
        },
      );
      const data = (await response.json().catch(() => null)) as {
        error?: string;
      } | null;

      if (!response.ok) {
        throw new Error(data?.error || "Não foi possível excluir o tipo.");
      }

      setProductTypes((current) =>
        current.filter((item) => item.id !== productTypeId),
      );
      toast.success("Tipo removido.");
      router.refresh();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Não foi possível excluir o tipo.",
      );
    } finally {
      setDeletingProductTypeId(null);
    }
  };

  const handleDelete = async (produtoId: string) => {
    try {
      setDeletingId(produtoId);
      const response = await fetch(`/api/manhia/produtos/${produtoId}`, {
        method: "DELETE",
      });

      const data = (await response.json().catch(() => null)) as {
        error?: string;
        mode?: "deleted" | "deactivated";
        produto?: ProdutoAdmin;
      } | null;

      if (!response.ok) {
        throw new Error(data?.error || "Não foi possível excluir o produto.");
      }

      if (data?.mode === "deactivated") {
        setProdutos((current) => current.map((item) => item.id === produtoId ? { ...item, ativo: false } : item));
      } else {
        setProdutos((current) => current.filter((item) => item.id !== produtoId));
      }
      if (editingId === produtoId) {
        resetForm();
      }
      if (data?.mode === "deactivated") {
        toast.info("Produto tem pedidos vinculados e foi desativado em vez de excluído.");
      } else {
        toast.success("Produto removido.");
      }
      router.refresh();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Não foi possível excluir.",
      );
    } finally {
      setDeletingId(null);
    }
  };

  const handleCupomSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    try {
      setSavingCupom(true);
      const response = await fetch(
        editingCupomId
          ? `/api/manhia/cupons/${editingCupomId}`
          : "/api/manhia/cupons",
        {
          method: editingCupomId ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(cupomForm),
        },
      );

      const data = (await response.json().catch(() => null)) as
        | (CupomAdmin & { error?: string })
        | null;

      if (!response.ok) {
        throw new Error(data?.error || "Não foi possível salvar o cupom.");
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
      toast.error(
        error instanceof Error
          ? error.message
          : "Não foi possível salvar o cupom.",
      );
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

      const data = (await response.json().catch(() => null)) as {
        error?: string;
      } | null;

      if (!response.ok) {
        throw new Error(data?.error || "Não foi possível excluir o cupom.");
      }

      setCupons((current) => current.filter((item) => item.id !== cupomId));
      if (editingCupomId === cupomId) {
        resetCupomForm();
      }
      toast.success("Cupom removido.");
      router.refresh();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Não foi possível excluir o cupom.",
      );
    } finally {
      setDeletingCupomId(null);
    }
  };

  const handleCopyCupom = async (codigo: string) => {
    try {
      await navigator.clipboard.writeText(codigo);
      toast.success("Código copiado.");
    } catch {
      toast.error("Não foi possível copiar o código.");
    }
  };

  const handleUpdatePedidoStatus = async (
    pedidoId: string,
    status: PedidoAdmin["status"],
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
        throw new Error(
          data?.error || "Não foi possível atualizar o pedido.",
        );
      }

      const pedido = data as PedidoAdmin;
      setPedidos((current) =>
        current.map((item) => (item.id === pedido.id ? pedido : item)),
      );
      toast.success("Status atualizado.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Falha ao atualizar.",
      );
    } finally {
      setStatusLoadingId(null);
    }
  };

  const handleConfirmManualPayment = async (pedido: PedidoAdmin) => {
    try {
      setStatusLoadingId(pedido.id);
      const response = await fetch(
        `/api/manhia/pedidos/${pedido.id}/pagamento-manual`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            valorPago: Number(pedido.totalCobrado),
            observacao: "Pagamento em dinheiro confirmado pelo painel",
          }),
        },
      );

      const data = (await response.json().catch(() => null)) as
        | (PedidoAdmin & { error?: string })
        | null;

      if (!response.ok) {
        throw new Error(
          data?.error || "Não foi possível confirmar o pagamento.",
        );
      }

      const updatedPedido = data as PedidoAdmin;
      setPedidos((current) =>
        current.map((item) =>
          item.id === updatedPedido.id ? updatedPedido : item,
        ),
      );
      toast.success("Pagamento confirmado e mensagens enviadas.");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Falha ao confirmar pagamento.",
      );
    } finally {
      setStatusLoadingId(null);
    }
  };

  const handleDropPedido = (status: "PAGO" | "PRONTO" | "ENTREGUE") => {
    if (!draggedPedidoId) {
      return;
    }

    const dragged = draggedPedidoId;
    setDraggedPedidoId(null);
    setDragOverStatus(null);

    if (dragged.startsWith("cart:")) {
      const orderId = dragged.replace("cart:", "");
      const order = simpleOrders.find((item) => item.id === orderId);
      const cartStatus = mapKanbanStatusToCartStatus(status);

      if (
        !order ||
        order.status === cartStatus ||
        statusLoadingId === order.id
      ) {
        return;
      }

      void handleUpdateSimpleOrderStatus(order.id, cartStatus);
      return;
    }

    const pedidoId = dragged.startsWith("pedido:")
      ? dragged.replace("pedido:", "")
      : dragged;
    const pedido = pedidos.find((item) => item.id === pedidoId);

    if (!pedido || pedido.status === status || statusLoadingId === pedido.id) {
      return;
    }

    void handleUpdatePedidoStatus(pedido.id, status);
  };

  const updateOperationScheduleDay = (
    weekday: WeekdayIndex,
    patch: Partial<BusinessScheduleByWeekday[WeekdayIndex]>,
  ) => {
    setSettings((current) => {
      const currentDay = current.operationSchedule[weekday];
      const nextOpenHour = Math.max(
        0,
        Math.min(23, Math.round(patch.openHour ?? currentDay.openHour)),
      );
      const nextCloseHour = Math.max(
        nextOpenHour,
        Math.min(23, Math.round(patch.closeHour ?? currentDay.closeHour)),
      );

      return {
        ...current,
        operationSchedule: {
          ...current.operationSchedule,
          [weekday]: {
            ...currentDay,
            ...patch,
            openHour: nextOpenHour,
            closeHour: nextCloseHour,
          },
        },
      };
    });
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
        throw new Error(
          data?.error || "Não foi possível salvar as configurações.",
        );
      }

      setSettings({
        isOpen: Boolean(data?.isOpen),
        minimumLeadHours: Number(
          data?.minimumLeadHours ?? nextSettings.minimumLeadHours,
        ),
        allowMultipleOrdersPerSlot: Boolean(
          data?.allowMultipleOrdersPerSlot ??
          nextSettings.allowMultipleOrdersPerSlot,
        ),
        operationSchedule:
          data?.operationSchedule ?? nextSettings.operationSchedule,
        siteTheme: (data?.siteTheme ??
          nextSettings.siteTheme) as StoreSiteTheme,
        featuredProductId:
          data?.featuredProductId ?? nextSettings.featuredProductId ?? null,
        motorcycleCourierPhone:
          data?.motorcycleCourierPhone ?? nextSettings.motorcycleCourierPhone ?? null,
      });
      toast.success("Configurações salvas.");
      router.refresh();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Falha ao salvar configurações.",
      );
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
        throw new Error(
          data?.error || "Não foi possível enviar para a impressora.",
        );
      }

      const pedido = data as PedidoAdmin;
      setPedidos((current) =>
        current.map((item) => (item.id === pedido.id ? pedido : item)),
      );
      toast.success("Pedido enviado para a impressora.");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? `${error.message} Abrindo impressão pelo navegador.`
          : "Falha ao imprimir. Abrindo impressão pelo navegador.",
      );
      window.open(
        `/manhia/pedidos/${pedidoId}/imprimir`,
        "_blank",
        "noopener,noreferrer",
      );
    } finally {
      setPrintingPedidoId(null);
    }
  };

  const handlePrintSimpleOrder = async (orderId: string) => {
    try {
      setPrintingPedidoId(orderId);
      const response = await fetch(`/api/manhia/orders/${orderId}/imprimir`, {
        method: "POST",
      });

      const data = (await response.json().catch(() => null)) as
        | (SimpleOrderAdmin & { error?: string })
        | null;

      if (!response.ok) {
        throw new Error(
          data?.error || "Não foi possível enviar o carrinho para a impressora.",
        );
      }

      const updatedOrder = data as SimpleOrderAdmin;
      setSimpleOrders((current) =>
        current.map((item) =>
          item.id === updatedOrder.id ? updatedOrder : item,
        ),
      );
      toast.success("Pedido do carrinho enviado para a impressora.");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Falha ao imprimir pedido do carrinho.",
      );
    } finally {
      setPrintingPedidoId(null);
    }
  };

  const handleUpdateSimpleOrderStatus = async (
    orderId: string,
    status: SimpleOrderAdmin["status"],
  ) => {
    try {
      setStatusLoadingId(orderId);
      const response = await fetch(`/api/manhia/orders/${orderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });

      const data = (await response.json().catch(() => null)) as
        | (SimpleOrderAdmin & { error?: string })
        | null;

      if (!response.ok) {
        throw new Error(
          data?.error || "Não foi possível atualizar o pedido do carrinho.",
        );
      }

      const updatedOrder = data as SimpleOrderAdmin;
      setSimpleOrders((current) =>
        current.map((item) =>
          item.id === updatedOrder.id ? updatedOrder : item,
        ),
      );
      toast.success("Status do carrinho atualizado.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Falha ao atualizar carrinho.",
      );
    } finally {
      setStatusLoadingId(null);
    }
  };

  const openSimpleOrderEditor = (order: SimpleOrderAdmin) => {
    setOrderEditItems(order.items.map((item) => ({ productId: item.productId, quantity: String(item.quantity), selectedItems: Array.isArray(item.selectedItems) && item.selectedItems.length ? item.selectedItems.map((entry) => ({ tipo: entry.tipo, quantidade: String(entry.quantidade) })) : [{ tipo: "", quantidade: "0" }] })));
    setOrderEditFulfillment(order.fulfillmentType);
    setOrderEditAddress(order.deliveryAddress || "");
    setOrderEditNeighborhood(order.deliveryNeighborhood || "");
    setOrderEditReference(order.deliveryReference || "");
    setOrderEditScheduledAt((order.scheduledAt || "").slice(0, 16));
    setOrderEditPaidAmount(String(Number(order.chargedAmount || 0).toFixed(2)));
    setOrderEditPlace({ placeId: "", city: "", latitude: 0, longitude: 0 });
    setEditingSimpleOrder(order);
  };

  const saveSimpleOrderEdit = async () => {
    if (!editingSimpleOrder) return;
    try {
      setSavingOrderEdit(true);
      const items = orderEditItems
        .filter((item) => item.productId)
        .map((item) => ({ productId: item.productId, quantity: Math.floor(Number(item.quantity)), selectedItems: item.selectedItems.map((entry) => ({ tipo: entry.tipo.trim(), quantidade: Math.floor(Number(entry.quantidade)) })).filter((entry) => entry.tipo && Number.isInteger(entry.quantidade) && entry.quantidade > 0) }));
      const response = await fetch(`/api/manhia/orders/${editingSimpleOrder.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "EDIT", items, fulfillmentType: orderEditFulfillment, deliveryAddress: orderEditAddress, deliveryNeighborhood: orderEditNeighborhood, deliveryReference: orderEditReference, deliveryPlaceId: orderEditPlace.placeId, deliveryCity: orderEditPlace.city, deliveryLatitude: orderEditPlace.latitude, deliveryLongitude: orderEditPlace.longitude, scheduledAt: orderEditScheduledAt, paidAmount: Number(orderEditPaidAmount) }),
      });
      const data = (await response.json().catch(() => null)) as (SimpleOrderAdmin & { error?: string }) | null;
      if (!response.ok) throw new Error(data?.error || "Não foi possível alterar o pedido.");
      const updated = data as SimpleOrderAdmin;
      setSimpleOrders((current) => current.map((item) => item.id === updated.id ? updated : item));
      setSelectedSimpleOrder(updated);
      setEditingSimpleOrder(null);
      toast.success("Pedido alterado e cliente avisado.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao alterar pedido.");
    } finally {
      setSavingOrderEdit(false);
    }
  };

  const handleConfirmSimpleOrderManualPayment = async (
    order: SimpleOrderAdmin,
  ) => {
    try {
      setStatusLoadingId(order.id);
      const response = await fetch(
        `/api/manhia/orders/${order.id}/pagamento-manual`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            valorPago: Number(order.chargedAmount || order.totalAmount),
            observacao: "Pagamento em dinheiro confirmado pelo painel",
          }),
        },
      );

      const data = (await response.json().catch(() => null)) as
        | (SimpleOrderAdmin & { error?: string })
        | null;

      if (!response.ok) {
        throw new Error(
          data?.error || "Não foi possível confirmar o pagamento.",
        );
      }

      const updatedOrder = data as SimpleOrderAdmin;
      setSimpleOrders((current) =>
        current.map((item) =>
          item.id === updatedOrder.id ? updatedOrder : item,
        ),
      );
      toast.success("Pagamento do carrinho confirmado.");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Falha ao confirmar pagamento.",
      );
    } finally {
      setStatusLoadingId(null);
    }
  };

  const handleLogout = async () => {
    await fetch("/api/manhia/logout", { method: "POST" });
    router.refresh();
  };

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#f7fde7,#fffaf3_42%,#eef8db)] px-3 py-4 sm:px-6 sm:py-6 lg:px-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <header className="overflow-hidden rounded-[1.4rem] border border-[#d6e7a2] bg-white shadow-sm">
          <div className="grid gap-0 lg:grid-cols-[280px_1fr]">
            <div className="bg-[#0b3d18] p-5 text-white">
              <Badge className="border-[#f4d330] bg-[#f4d330] text-[#0b3d18]">
                Painel da vizinha
              </Badge>
              <h1 className="mt-3 text-2xl font-bold tracking-normal">
                Operação
              </h1>
              <p className="mt-2 text-sm leading-6 text-white/72">
                Pedidos, produtos e funcionamento no mesmo painel.
              </p>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-3 p-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => void openMessageDialog()}
                className="rounded-full border-[#d6e7a2] text-[#1b5e20] hover:bg-[#f7fde7]"
              >
                <MessageCircle className="mr-2 h-4 w-4" />
                Enviar mensagem
              </Button>
              <Button
                type="button"
                disabled={savingSettings}
                onClick={() =>
                  void handleSaveSettings({ isOpen: !settings.isOpen })
                }
                className={cn(
                  "rounded-full px-5 text-white",
                  settings.isOpen
                    ? "bg-rose-600 hover:bg-rose-700"
                    : "bg-[#1b7f31] hover:bg-[#156326]",
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

          <nav className="grid grid-cols-3 border-t border-[#e4edc9] bg-white sm:grid-cols-7">
            {[
              { id: "analise" as const, label: "Análise", icon: ChartNoAxesCombined },
              { id: "pedidos" as const, label: "Pedidos", icon: ShoppingBag },
              { id: "salgados" as const, label: "Salgados", icon: ChefHat },
              { id: "produtos" as const, label: "Produtos", icon: CheckCheck },
              { id: "tipos" as const, label: "Tipos", icon: FerrisWheel },
              { id: "cupons" as const, label: "Cupons", icon: TicketPercent },
              {
                id: "configuracoes" as const,
                label: "Operação",
                icon: SlidersHorizontal,
              },
            ].map((item) => {
              const Icon = item.icon;

              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setActiveTab(item.id);
                  }}
                  className={cn(
                    "flex h-14 items-center justify-center gap-1.5 border-b border-r border-[#e4edc9] px-2 text-[11px] font-bold uppercase tracking-wide transition sm:gap-2 sm:border-b-0 sm:text-sm",
                    activeTab === item.id
                      ? "bg-[#fff3a8] text-[#0b3d18]"
                      : "bg-white text-[#48654f] hover:bg-[#f7fde7]",
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </button>
              );
            })}
          </nav>
        </header>

        {activeTab === "analise" ? (
          <section className="space-y-4">
            <div className="rounded-[2rem] border border-[#d6e7a2] bg-white/95 p-5 shadow-lg shadow-green-900/5">
              <p className="text-xs font-bold uppercase tracking-wide text-[#618038]">Visão geral</p>
              <h2 className="mt-2 text-3xl font-bold text-[#0b3d18]">Análise da operação</h2>
              <p className="mt-2 text-sm text-[#48654f]">Indicadores consolidados dos pedidos e da loja.</p>
              <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div><label className="text-xs font-bold uppercase text-[#618038]">Data inicial</label><Input type="date" value={analyticsStartDate} onChange={(event) => setAnalyticsStartDate(event.target.value)} className="mt-1 border-[#d6e7a2] bg-white" /></div>
                <div><label className="text-xs font-bold uppercase text-[#618038]">Data final</label><Input type="date" value={analyticsEndDate} onChange={(event) => setAnalyticsEndDate(event.target.value)} className="mt-1 border-[#d6e7a2] bg-white" /></div>
                <div><label className="text-xs font-bold uppercase text-[#618038]">Status</label><Select value={analyticsStatus} onValueChange={setAnalyticsStatus}><SelectTrigger className="mt-1 w-full border-[#d6e7a2] bg-white"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="TODOS">Todos</SelectItem>{PEDIDO_STATUS_OPTIONS.map((status) => <SelectItem key={status} value={status}>{getPedidoStatusMeta(status).label}</SelectItem>)}</SelectContent></Select></div>
                <div><label className="text-xs font-bold uppercase text-[#618038]">Produto</label><Select value={analyticsProduct} onValueChange={setAnalyticsProduct}><SelectTrigger className="mt-1 w-full border-[#d6e7a2] bg-white"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="TODOS">Todos</SelectItem>{Array.from(new Set(produtos.map((produto) => produto.nome))).map((nome) => <SelectItem key={nome} value={nome}>{nome}</SelectItem>)}</SelectContent></Select></div>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {[
                { label: "Pedidos", value: analytics.total },
                { label: "Ticket médio", value: formatCurrency(analytics.averageTicket) },
                { label: "Valor vendido", value: formatCurrency(analytics.sold) },
                { label: "Recebido", value: formatCurrency(analytics.received) },
                { label: "Provisão pendente", value: formatCurrency(analytics.provision) },
                { label: "Taxa de cancelamento", value: `${analytics.cancellationRate.toFixed(1)}%` },
              ].map((item) => (
                <Card key={item.label} className="border-[#d6e7a2] bg-[#fbfff0] shadow-sm">
                  <CardHeader className="pb-2"><CardTitle className="text-xs font-bold uppercase tracking-wide text-[#618038]">{item.label}</CardTitle></CardHeader>
                  <CardContent><p className="text-2xl font-bold text-[#0b3d18]">{item.value}</p></CardContent>
                </Card>
              ))}
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              <Card className="border-[#d6e7a2]"><CardHeader><CardTitle className="text-[#0b3d18]">Pedidos por status</CardTitle></CardHeader><CardContent className="grid grid-cols-2 gap-3 sm:grid-cols-3">{PEDIDO_STATUS_OPTIONS.map((status) => <div key={status} className="rounded-xl bg-[#f7fde7] p-3"><p className="text-xs font-bold uppercase text-[#618038]">{getPedidoStatusMeta(status).label}</p><p className="mt-1 text-2xl font-bold text-[#0b3d18]">{analytics.statusCounts[status]}</p></div>)}</CardContent></Card>
              <Card className="border-[#d6e7a2]"><CardHeader><CardTitle className="text-[#0b3d18]">Ticket por pagamento</CardTitle></CardHeader><CardContent className="space-y-3">{analytics.paymentAverages.length ? analytics.paymentAverages.map((item) => <div key={item.label} className="flex justify-between rounded-xl bg-[#f7fde7] p-3"><span className="text-[#48654f]">{item.label}</span><strong className="text-[#0b3d18]">{formatCurrency(item.average)}</strong></div>) : <p className="text-sm text-slate-500">Nenhum pedido no período.</p>}</CardContent></Card>
              <Card className="border-[#d6e7a2]"><CardHeader><CardTitle className="text-[#0b3d18]">Top 5 por quantidade</CardTitle></CardHeader><CardContent className="space-y-3">{analytics.topQuantity.map((item, index) => <div key={item.name} className="flex justify-between border-b border-[#e4edc9] pb-2"><span className="text-[#48654f]">{index + 1}. {item.name}</span><strong className="text-[#0b3d18]">{item.quantity} un</strong></div>)}</CardContent></Card>
              <Card className="border-[#d6e7a2]"><CardHeader><CardTitle className="text-[#0b3d18]">Top 5 por receita</CardTitle></CardHeader><CardContent className="space-y-3">{analytics.topRevenue.map((item, index) => <div key={item.name} className="flex justify-between border-b border-[#e4edc9] pb-2"><span className="text-[#48654f]">{index + 1}. {item.name}</span><strong className="text-[#0b3d18]">{formatCurrency(item.revenue)}</strong></div>)}</CardContent></Card>
            </div>
          </section>
        ) : activeTab === "pedidos" ? (
          <section className="space-y-4">
            <div className="flex flex-col gap-3 rounded-[2rem] border border-[#d6e7a2] bg-white/95 p-5 shadow-lg shadow-green-900/5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-2xl font-semibold text-slate-900">
                  Fila de pedidos
                </h2>
                <p className="text-sm text-slate-500">
                  O painel mostra pagamentos confirmados pelo webhook e permite
                  impressão manual.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <Badge className="border-[#d6e7a2] bg-[#f7fde7] px-4 py-2 text-[#284a2e]">
                  Impressão automatica via serviço
                </Badge>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void refreshPedidos()}
                  className="rounded-full border-[#d6e7a2] text-[#1b5e20] hover:bg-[#f7fde7]"
                >
                  <RefreshCcw
                    className={cn(
                      "mr-2 h-4 w-4",
                      refreshingPedidos && "animate-spin",
                    )}
                  />
                  Atualizar
                </Button>
              </div>
            </div>

            {simpleOrdersPendentes.length > 0 ? (
              <section className="rounded-[1.6rem] border border-[#d6e7a2] bg-white/95 p-4 shadow-sm">
                <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h3 className="font-semibold text-slate-900">
                      Pedidos do carrinho
                    </h3>
                    <p className="text-sm text-slate-500">
                      Pedidos recentes criados pelo novo checkout com múltiplos
                      itens.
                    </p>
                  </div>
                  <Badge className="w-fit border-[#f4d330] bg-[#fff3a8] text-[#735600]">
                    {simpleOrdersPendentes.length} pedido(s)
                  </Badge>
                </div>

                <div className="grid gap-3 lg:grid-cols-2">
                  {simpleOrdersPendentes.map((order) => (
                    <article
                      key={order.id}
                      className="rounded-2xl border border-[#e4edc9] bg-[#fbfff0] p-4"
                    >
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-semibold text-slate-900">
                              Pedido{" "}
                              {order.code || order.id.slice(0, 8).toUpperCase()}
                            </span>
                            <Badge className="border border-[#d6e7a2] bg-white text-[#0b3d18]">
                              {order.status}
                            </Badge>
                            <Badge className="border border-[#d6e7a2] bg-[#eef8d2] text-[#0b3d18]">
                              {order.source}
                            </Badge>
                          </div>
                          <p className="mt-1 text-sm text-slate-500">
                            {order.customerName || "Cliente não informado"} -{" "}
                            {formatDateTime(
                              order.scheduledAt || order.createdAt,
                            )}
                          </p>
                          {order.customerPhone ? (
                            <p className="mt-1 text-sm text-slate-500">
                              {order.customerPhone}
                            </p>
                          ) : null}
                        </div>
                        <p className="text-xl font-bold text-[#0b3d18]">
                          {formatCurrency(
                            Number(order.chargedAmount || order.totalAmount),
                          )}
                        </p>
                      </div>
                      <p className="mt-2 text-sm text-slate-500">
                        Entrega/retirada:{" "}
                        {formatDateTime(order.scheduledAt || order.createdAt)}
                      </p>
                      <p className="mt-1 text-sm text-slate-500">
                        Total: {formatCurrency(Number(order.totalAmount))} -{" "}
                        {order.paymentMethodLabel} ({order.paymentPercentage}%
                        agora)
                      </p>

                      <div className="mt-3 space-y-1 text-sm text-slate-700">
                        {order.items.map((item) => (
                          <p key={item.id}>
                            {item.productName} ({item.productType}) -{" "}
                            {item.quantity} x{" "}
                            {formatCurrency(Number(item.unitPrice))}
                          </p>
                        ))}
                      </div>

                      <div className="mt-4 flex flex-wrap gap-2">
                        {order.status === "PENDING" ? (
                          <Button
                            type="button"
                            disabled={statusLoadingId === order.id}
                            onClick={() =>
                              void handleConfirmSimpleOrderManualPayment(order)
                            }
                            className="rounded-full bg-[#188038] text-white hover:bg-[#12642c]"
                          >
                            <CheckCheck className="mr-2 h-4 w-4" />
                            {statusLoadingId === order.id
                              ? "Confirmando..."
                              : "Confirmar dinheiro"}
                          </Button>
                        ) : (
                          <Badge className="border-emerald-200 bg-emerald-50 text-emerald-800">
                            {order.status === "PAID"
                              ? "Pagamento confirmado"
                              : "Pedido cancelado"}
                          </Badge>
                        )}
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            ) : null}

            {pedidos.length === 0 && simpleOrders.length === 0 ? (
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
                        <h3 className="font-semibold text-amber-950">
                          Aguardando pagamento
                        </h3>
                        <p className="text-sm text-amber-800">
                          Confirme aqui pedidos pagos em dinheiro ou acertados
                          fora do Mercado Pago.
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
                                <Badge
                                  className={
                                    getPedidoStatusMeta(pedido.status).tone
                                  }
                                >
                                  {getPedidoStatusMeta(pedido.status).label}
                                </Badge>
                              </div>
                              <p className="mt-1 text-sm text-slate-500">
                                {pedido.clienteNome} -{" "}
                                {formatDateTime(pedido.dataEntrega)}
                              </p>
                              <p className="mt-1 text-sm text-slate-500">
                                {pedido.produtoNomeSnapshot} -{" "}
                                {pedido.metodoPagamentoLabel}
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
                              <Printer
                                className={cn(
                                  "mr-2 h-4 w-4",
                                  printingPedidoId === pedido.id &&
                                    "animate-pulse",
                                )}
                              />
                              {printingPedidoId === pedido.id
                                ? "Enviando..."
                                : "Imprimir"}
                            </Button>
                            <Button
                              type="button"
                              disabled={statusLoadingId === pedido.id}
                              onClick={() =>
                                void handleConfirmManualPayment(pedido)
                              }
                              className="rounded-full bg-[#1b7f31] text-white hover:bg-[#156326]"
                            >
                              <CheckCheck className="mr-2 h-4 w-4" />
                              {statusLoadingId === pedido.id
                                ? "Confirmando..."
                                : "Confirmar dinheiro"}
                            </Button>
                          </div>
                        </article>
                      ))}
                    </div>
                  </section>
                ) : null}

                {(pedidosCancelados.length > 0 || simpleOrdersCancelados.length > 0) ? (
                  <details className="rounded-[1.6rem] border border-slate-300 bg-slate-50/95 p-4 shadow-sm">
                    <summary className="cursor-pointer font-semibold text-slate-900">
                      Histórico de cancelados ({pedidosCancelados.length + simpleOrdersCancelados.length})
                    </summary>
                    <p className="mt-2 text-sm text-slate-500">
                      Pedidos cancelados permanecem armazenados e podem ser consultados aqui.
                    </p>
                    <div className="mt-3 grid gap-2 lg:grid-cols-2">
                      {pedidosCancelados.map((pedido) => (
                        <button key={`cancelled:pedido:${pedido.id}`} type="button" onClick={() => setSelectedPedido(pedido)} className="rounded-xl border border-slate-200 bg-white p-3 text-left">
                          <strong>{pedido.codigo}</strong> · {pedido.clienteNome}
                          <span className="block text-xs text-slate-500">Pedido legado · {formatDateTime(pedido.dataEntrega)}</span>
                        </button>
                      ))}
                      {simpleOrdersCancelados.map((order) => (
                        <button key={`cancelled:order:${order.id}`} type="button" onClick={() => setSelectedSimpleOrder(order)} className="rounded-xl border border-slate-200 bg-white p-3 text-left">
                          <strong>{getSimpleOrderCode(order)}</strong> · {order.customerName || "Cliente não informado"}
                          <span className="block text-xs text-slate-500">Carrinho · {formatDateTime(getSimpleOrderDate(order))}</span>
                        </button>
                      ))}
                    </div>
                  </details>
                ) : null}

                <div className="-mx-3 flex snap-x snap-mandatory gap-3 overflow-x-auto px-3 pb-3 lg:hidden">
                  {KANBAN_COLUMNS.map((column) => (
                    <section
                      key={`mobile:${column.status}`}
                      className={cn(
                        "min-w-[calc(100vw-2.5rem)] snap-center rounded-[1.6rem] border p-4 shadow-sm sm:min-w-[70vw]",
                        column.accent,
                      )}
                    >
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <div>
                          <h3 className="font-semibold text-slate-900">
                            {column.title}
                          </h3>
                          <p className="text-xs text-slate-500">
                            {column.description}
                          </p>
                        </div>
                        <Badge className={column.badge}>
                          {kanbanPedidosPorStatus[column.status].length}
                        </Badge>
                      </div>

                      <div className="space-y-3">
                        {kanbanPedidosPorStatus[column.status].map((entry) => {
                          if (entry.kind === "pedido") {
                            const { pedido } = entry;
                            const nextStatus = getNextOperationalStatus(
                              pedido.status,
                            );

                            return (
                              <article
                                key={`mobile:pedido:${pedido.id}`}
                                className="rounded-2xl border border-[#d6e7a2] bg-white p-4 shadow-sm"
                              >
                                <div className="flex items-start justify-between gap-3">
                                  <div className="min-w-0">
                                    <div className="flex flex-wrap items-center gap-2">
                                      <h4 className="font-bold text-slate-900">
                                        {pedido.codigo}
                                      </h4>
                                      <Badge className={getPedidoStatusMeta(pedido.status).tone}>
                                        {getPedidoStatusMeta(pedido.status).label}
                                      </Badge>
                                    </div>
                                    <p className="mt-1 truncate text-sm text-slate-500">
                                      {pedido.clienteNome}
                                    </p>
                                  </div>
                                  <p className="shrink-0 font-bold text-[#0b3d18]">
                                    {formatCurrency(Number(pedido.subtotal))}
                                  </p>
                                </div>
                                <p className="mt-3 text-sm text-slate-600">
                                  {formatDateTime(pedido.dataEntrega)} • {pedido.totalUnidades} un
                                </p>
                                <p className="mt-1 line-clamp-2 text-xs text-slate-500">
                                  {pedido.itens
                                    .map((item) => `${item.tipo}: ${item.quantidade}`)
                                    .join(" • ")}
                                </p>
                                <div className="mt-4 grid grid-cols-2 gap-2">
                                  <Button
                                    type="button"
                                    variant="outline"
                                    disabled={printingPedidoId === pedido.id}
                                    onClick={() => void handlePrint(pedido.id)}
                                    className="rounded-full border-[#d6e7a2] text-[#1b5e20]"
                                  >
                                    <Printer className="mr-2 h-4 w-4" />
                                    Imprimir
                                  </Button>
                                  <Button
                                    type="button"
                                    disabled={!nextStatus || statusLoadingId === pedido.id}
                                    onClick={() =>
                                      nextStatus
                                        ? void handleUpdatePedidoStatus(pedido.id, nextStatus)
                                        : undefined
                                    }
                                    className="rounded-full bg-[#1b7f31] text-white hover:bg-[#156326]"
                                  >
                                    {nextStatus ? "Avançar" : "Finalizado"}
                                  </Button>
                                </div>
                              </article>
                            );
                          }

                          const { order } = entry;
                          const nextStatus = getNextSimpleOrderStatus(order.status);

                          return (
                            <article
                              key={`mobile:cart:${order.id}`}
                              className="rounded-2xl border border-[#d6e7a2] bg-white p-4 shadow-sm"
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <h4 className="font-bold text-slate-900">
                                      {getSimpleOrderCode(order)}
                                    </h4>
                                    <Badge className="border-[#d6e7a2] bg-[#f7fde7] text-[#1b5e20]">
                                      {order.isConfeiteira ? "Confeiteira" : "Carrinho"}
                                    </Badge>
                                  </div>
                                  <p className="mt-1 truncate text-sm text-slate-500">
                                    {order.customerName || "Cliente não informado"}
                                  </p>
                                </div>
                                <p className="shrink-0 font-bold text-[#0b3d18]">
                                  {formatCurrency(Number(order.totalAmount))}
                                </p>
                              </div>
                              <p className="mt-3 text-sm text-slate-600">
                                {formatDateTime(getSimpleOrderDate(order))}
                              </p>
                              <p className="mt-1 line-clamp-2 text-xs text-slate-500">
                                {getSimpleOrderSalgadosSummary(order)}
                              </p>
                              <div className="mt-4 grid grid-cols-2 gap-2">
                                <Button
                                  type="button"
                                  variant="outline"
                                  disabled={printingPedidoId === order.id}
                                  onClick={() => void handlePrintSimpleOrder(order.id)}
                                  className="rounded-full border-[#d6e7a2] text-[#1b5e20]"
                                >
                                  <Printer className="mr-2 h-4 w-4" />
                                  Imprimir
                                </Button>
                                <Button
                                  type="button"
                                  disabled={!nextStatus || statusLoadingId === order.id}
                                  onClick={() =>
                                    nextStatus
                                      ? void handleUpdateSimpleOrderStatus(order.id, nextStatus)
                                      : undefined
                                  }
                                  className="rounded-full bg-[#1b7f31] text-white hover:bg-[#156326]"
                                >
                                  {nextStatus ? "Avançar" : "Finalizado"}
                                </Button>
                              </div>
                            </article>
                          );
                        })}

                        {kanbanPedidosPorStatus[column.status].length === 0 ? (
                          <p className="rounded-2xl border border-dashed border-[#b8ca91] bg-white/50 p-5 text-center text-sm text-slate-500">
                            Sem pedidos nesta etapa.
                          </p>
                        ) : null}
                      </div>
                    </section>
                  ))}
                </div>

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
                        dragOverStatus === column.status &&
                          "ring-2 ring-[#f4d330] ring-offset-2",
                      )}
                    >
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <div>
                          <h3 className="font-semibold text-slate-900">
                            {column.title}
                          </h3>
                          <p className="text-sm text-slate-500">
                            {kanbanPedidosPorStatus[column.status].length}{" "}
                            pedido(s)
                          </p>
                        </div>
                        <Badge className={column.badge}>
                          {getPedidoStatusMeta(column.status).label}
                        </Badge>
                      </div>

                      <div className="flex flex-col gap-3">
                        {kanbanPedidosPorStatus[column.status].map((entry, index) => {
                          if (entry.kind === "cart") return null;
                          const { pedido } = entry;

                          return (
                          <button
                            key={`pedido:${pedido.id}`}
                            type="button"
                            style={{ order: index }}
                            draggable={statusLoadingId !== pedido.id}
                            onDragStart={() =>
                              setDraggedPedidoId(`pedido:${pedido.id}`)
                            }
                            onDragEnd={() => {
                              setDraggedPedidoId(null);
                              setDragOverStatus(null);
                            }}
                            onClick={() => setSelectedPedido(pedido)}
                            className={cn(
                              "w-full cursor-grab rounded-2xl border border-[#d6e7a2] bg-[#fffaf3] p-3 text-left shadow-sm transition hover:border-[#f4d330] active:cursor-grabbing",
                              draggedPedidoId === `pedido:${pedido.id}` &&
                                "opacity-60",
                            )}
                          >
                            <div className="flex items-center justify-between gap-3">
                              <span className="font-semibold text-slate-900">
                                {pedido.codigo}
                              </span>
                              <span className="text-sm font-bold text-[#f4d330]">
                                {formatCurrency(Number(pedido.subtotal))}
                              </span>
                            </div>
                            <p className="mt-1 truncate text-sm text-slate-500">
                              {pedido.clienteNome} -{" "}
                              {formatDateTime(pedido.dataEntrega)}
                            </p>
                          </button>
                          );
                        })}

                        {kanbanPedidosPorStatus[column.status].map((entry, index) => {
                          if (entry.kind === "pedido") return null;
                          const { order } = entry;

                          return (
                          <button
                            key={`cart:${order.id}`}
                            type="button"
                            style={{ order: index }}
                            title="Clique para ver os detalhes do pedido do carrinho"
                            aria-label={`Ver detalhes do pedido do carrinho ${getSimpleOrderCode(order)}`}
                            draggable={statusLoadingId !== order.id}
                            onClick={() => setSelectedSimpleOrder(order)}
                            onDragStart={() =>
                              setDraggedPedidoId(`cart:${order.id}`)
                            }
                            onDragEnd={() => {
                              setDraggedPedidoId(null);
                              setDragOverStatus(null);
                            }}
                            className={cn(
                              "w-full cursor-grab rounded-2xl border border-[#d6e7a2] bg-[#fffaf3] p-3 text-left shadow-sm transition hover:border-[#f4d330] active:cursor-grabbing",
                              draggedPedidoId === `cart:${order.id}` &&
                                "opacity-60",
                            )}
                          >
                            <div className="flex items-center justify-between gap-3">
                              <span className="font-semibold text-slate-900">
                                {getSimpleOrderCode(order)}
                              </span>
                              <span className="text-sm font-bold text-[#f4d330]">
                                {formatCurrency(
                                  Number(
                                    order.chargedAmount || order.totalAmount,
                                  ),
                                )}
                              </span>
                            </div>
                            <p className="mt-1 truncate text-sm text-slate-500">
                              {order.customerName || "Cliente não informado"} -{" "}
                              {formatDateTime(getSimpleOrderDate(order))}
                            </p>
                            <p className="mt-1 text-xs font-semibold text-slate-500">Feito em: {formatDateTime(order.createdAt)}</p>
                            {order.fulfillmentType === "DELIVERY" ? (
                              <p className="mt-1 text-xs font-semibold text-blue-700">Entrega: {order.deliveryNeighborhood || order.deliveryAddress}{order.deliveryReference ? ` • Ref.: ${order.deliveryReference}` : ""} • {order.deliveryFeeAgreed ? formatCurrency(order.deliveryFee) : "taxa a combinar"}{order.deliveryMapsUrl ? <> • <a href={order.deliveryMapsUrl} target="_blank" rel="noreferrer" onClick={(event) => event.stopPropagation()} className="underline">abrir mapa</a></> : null}</p>
                            ) : <p className="mt-1 text-xs font-semibold text-emerald-700">Retirada</p>}
                            <p className="mt-1 truncate text-xs text-slate-500">
                              {getSimpleOrderSalgadosSummary(order)}
                            </p>
                            <p className="mt-1 truncate text-xs text-slate-400">
                              Carrinho •{" "}
                              {getSimpleOrderStatusLabel(order.status)} •{" "}
                              {order.paymentMethodLabel}
                            </p>
                          </button>
                          );
                        })}

                        {kanbanPedidosPorStatus[column.status].length === 0 ? (
                          <p className="rounded-2xl border border-dashed border-[#d6e7a2] p-4 text-sm text-slate-500">
                            Sem pedidos nesta etapa.
                          </p>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>

                {pedidosAceitos.map((pedido) => {
                  const meta = getPedidoStatusMeta(pedido.status);
                  const nextStatus = getNextOperationalStatus(pedido.status);

                  return (
                    <Card
                      key={pedido.id}
                      className="hidden"
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
                              {pedido.clienteNome} • {pedido.clienteTelefone}
                            </p>
                            <p className="text-sm text-slate-500">
                              Entrega: {formatDateTime(pedido.dataEntrega)}
                            </p>
                          </div>

                          <div className="text-left sm:text-right">
                            <p className="text-sm text-slate-400">
                              Total cobrado
                            </p>
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
                            <p className="mt-2 text-sm text-slate-700">
                              {pedido.produtoNomeSnapshot}
                            </p>
                            <p className="mt-1 text-sm text-slate-500">
                              {pedido.totalUnidades} unidades •{" "}
                              {pedido.totalTipos} tipos
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
                              void handleUpdatePedidoStatus(
                                pedido.id,
                                value as PedidoAdmin["status"],
                              )
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
                              <Printer
                                className={cn(
                                  "mr-2 h-4 w-4",
                                  printingPedidoId === pedido.id &&
                                    "animate-pulse",
                                )}
                              />
                              {printingPedidoId === pedido.id
                                ? "Enviando..."
                                : "Imprimir"}
                            </Button>
                            <Button
                              type="button"
                              disabled={
                                !nextStatus || statusLoadingId === pedido.id
                              }
                              onClick={() =>
                                nextStatus
                                  ? void handleUpdatePedidoStatus(
                                      pedido.id,
                                      nextStatus,
                                    )
                                  : undefined
                              }
                              className="rounded-full bg-[#1b7f31] text-white hover:bg-[#156326]"
                            >
                              {statusLoadingId === pedido.id
                                ? "Salvando..."
                                : nextStatus
                                  ? "Avancar"
                                  : "Finalizado"}
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
                <h2 className="text-2xl font-semibold text-slate-900">
                  Salgados a produzir
                </h2>
                <p className="text-sm text-slate-500">
                  Quantidades consolidadas dos pedidos aceitos, agrupadas por
                  dia de entrega.
                </p>
              </div>
            </div>

            {salgadosTotaisPorTipo.length > 0 ? (
              <div className="grid gap-4 xl:grid-cols-[320px_1fr]">
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
                  <Card className="border-[#d6e7a2] bg-[#f7fde7] shadow-lg shadow-green-900/5">
                    <CardContent className="p-5">
                      <p className="text-xs font-bold uppercase tracking-wide text-[#618038]">
                        Total geral
                      </p>
                      <p className="mt-2 text-4xl font-bold text-[#0b3d18]">
                        {totalSalgadosParaProduzir}
                      </p>
                      <p className="text-sm font-medium text-slate-500">
                        unidades para produzir
                      </p>
                    </CardContent>
                  </Card>
                  <Card className="border-[#d6e7a2] bg-white/95 shadow-lg shadow-green-900/5">
                    <CardContent className="p-5">
                      <p className="text-xs font-bold uppercase tracking-wide text-[#618038]">
                        Tipos no preparo
                      </p>
                      <p className="mt-2 text-4xl font-bold text-[#0b3d18]">
                        {salgadosTotaisPorTipo.length}
                      </p>
                      <p className="text-sm font-medium text-slate-500">
                        sabores consolidados
                      </p>
                    </CardContent>
                  </Card>
                </div>

                <Card className="border-[#d6e7a2] bg-white/95 shadow-lg shadow-green-900/5">
                  <CardHeader className="border-b border-[#e4edc9] bg-[#fbfff0] pb-3 pt-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <CardTitle className="text-lg text-[#0b3d18]">
                        Total por tipo de salgado
                      </CardTitle>
                      <Badge className="border border-[#d6e7a2] bg-[#fff3a8] text-[#0b3d18]">
                        {totalSalgadosParaProduzir} un
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="p-5">
                    <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
                      {salgadosTotaisPorTipo.map(({ tipo, quantidade }) => (
                        <div
                          key={tipo}
                          className="flex min-h-16 items-center justify-between gap-4 rounded-2xl border border-[#d6e7a2] bg-[#fbfff0] px-4 py-3"
                        >
                          <span className="text-sm font-semibold text-slate-700">
                            {tipo}
                          </span>
                          <span className="shrink-0 text-lg font-bold text-[#1b7f31]">
                            {quantidade} un
                          </span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </div>
            ) : null}

            {salgadosPorDia.length === 0 ? (
              <Card className="border-[#d6e7a2] bg-white/95 shadow-lg shadow-green-900/5">
                <CardContent className="py-10 text-center text-sm text-slate-500">
                  Nenhum pedido aceito com salgados ainda.
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {salgadosPorDia.map(({ dia, itens, total }) => (
                  <Card
                    key={dia}
                    className="border-[#d6e7a2] bg-white/95 shadow-lg shadow-green-900/5"
                  >
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
                            <span className="text-sm font-medium text-slate-700">
                              {tipo}
                            </span>
                            <span className="text-sm font-bold text-[#1b7f31]">
                              {quantidade} un
                            </span>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </section>
        ) : activeTab === "tipos" ? (
          <section className="grid gap-5 xl:grid-cols-[380px_1fr]">
            <Card className="border-[#d6e7a2] bg-white/95 shadow-lg shadow-green-900/5 xl:sticky xl:top-6 xl:self-start">
              <CardHeader className="border-b border-[#e4edc9] bg-[#fbfff0]">
                <p className="text-xs font-bold uppercase tracking-wide text-[#618038]">
                  Tipos de produto
                </p>
                <CardTitle className="text-[#0b3d18]">
                  {editingProductTypeId ? "Editar tipo" : "Novo tipo"}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <form className="space-y-4" onSubmit={handleProductTypeSubmit}>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-700">
                      Nome
                    </label>
                    <Input
                      value={productTypeForm.name}
                      onChange={(event) =>
                        setProductTypeForm((current) => ({
                          ...current,
                          name: event.target.value,
                        }))
                      }
                      placeholder="Ex: Meio Cento"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-700">
                      Descrição
                    </label>
                    <Textarea
                      value={productTypeForm.description}
                      onChange={(event) =>
                        setProductTypeForm((current) => ({
                          ...current,
                          description: event.target.value,
                        }))
                      }
                      className="min-h-24"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-700">
                      Quantidade mínima
                    </label>
                    <Input
                      type="number"
                      min="1"
                      step="1"
                      value={productTypeForm.minQuantity}
                      onChange={(event) =>
                        setProductTypeForm((current) => ({
                          ...current,
                          minQuantity: event.target.value,
                        }))
                      }
                    />
                  </div>

                  <div className="flex items-start gap-3 rounded-2xl border border-[#d6e7a2] bg-[#f7fde7] px-4 py-3">
                    <Checkbox
                      id="product-type-allows-multiple"
                      checked={productTypeForm.allowsMultiple}
                      onCheckedChange={(checked) =>
                        setProductTypeForm((current) => ({
                          ...current,
                          allowsMultiple: Boolean(checked),
                        }))
                      }
                    />
                    <label
                      htmlFor="product-type-allows-multiple"
                      className="text-sm leading-6 text-slate-600"
                    >
                      Usar quantidade mínima: o cliente pode digitar qualquer quantidade inteira a partir do mínimo. Desmarque para manter quantidade fixa.
                    </label>
                  </div>

                  <div className="flex flex-col gap-3 sm:flex-row">
                    <Button
                      type="submit"
                      disabled={savingProductType}
                      className="rounded-full bg-[#1b7f31] text-white hover:bg-[#156326]"
                    >
                      {savingProductType
                        ? "Salvando..."
                        : editingProductTypeId
                          ? "Atualizar tipo"
                          : "Adicionar tipo"}
                    </Button>
                    {editingProductTypeId ? (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={resetProductTypeForm}
                        className="rounded-full border-[#d6e7a2] text-[#1b5e20] hover:bg-[#f7fde7]"
                      >
                        Cancelar edição
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
                    Catálogo
                  </p>
                  <h2 className="text-xl font-bold">Tipos cadastrados</h2>
                </div>
                <Badge className="w-fit border-[#f4d330] bg-[#f4d330] text-[#0b3d18]">
                  {productTypes.length} tipo(s)
                </Badge>
              </div>

              {productTypes.length === 0 ? (
                <div className="p-10 text-center text-sm text-slate-500">
                  Nenhum tipo cadastrado ainda.
                </div>
              ) : (
                <div className="divide-y divide-[#e4edc9]">
                  {productTypes.map((productType) => (
                    <article
                      key={productType.id}
                      className="grid gap-4 p-4 transition hover:bg-[#fbfff0] md:grid-cols-[1fr_auto] md:items-center"
                    >
                      <div className="min-w-0 space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-lg font-bold text-[#0b3d18]">
                            {productType.name}
                          </h3>
                          <Badge className="border border-[#d6e7a2] bg-[#f7fde7] text-[#1b5e20]">
                            {productType.minQuantity
                              ? `${productType.minQuantity} un`
                              : "Sem mínimo"}
                          </Badge>
                          <Badge className="border border-[#f4d330] bg-[#fff3a8] text-[#735600]">
                            {productType.productsCount} produto(s)
                          </Badge>
                        </div>
                        <p className="text-sm text-[#48654f]">
                          {productType.description || "Sem descrição."}
                        </p>
                        {productType.productsCount > 0 ? (
                          <p className="text-sm font-medium text-amber-700">
                            Há produtos vinculados. Remova ou altere esses
                            produtos antes de excluir.
                          </p>
                        ) : null}
                      </div>

                      <div className="flex flex-wrap gap-2 md:justify-end">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => handleEditProductType(productType)}
                          className="rounded-full border-[#d6e7a2] text-[#1b5e20] hover:bg-[#f7fde7]"
                        >
                          <Pencil className="mr-2 h-4 w-4" />
                          Editar
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={
                            deletingProductTypeId === productType.id ||
                            productType.productsCount > 0
                          }
                          onClick={() =>
                            void handleDeleteProductType(productType.id)
                          }
                          className="rounded-full border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          {deletingProductTypeId === productType.id
                            ? "Excluindo..."
                            : "Excluir"}
                        </Button>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>
          </section>
        ) : activeTab === "cupons" ? (
          <section className="grid gap-5 xl:grid-cols-[380px_1fr]">
            <Card className="border-[#d6e7a2] bg-white/95 shadow-lg shadow-green-900/5 xl:sticky xl:top-6 xl:self-start">
              <CardHeader className="border-b border-[#e4edc9] bg-[#fbfff0]">
                <p className="text-xs font-bold uppercase tracking-wide text-[#618038]">
                  Divulgação
                </p>
                <CardTitle className="text-[#0b3d18]">
                  {editingCupomId ? "Editar cupom" : "Novo cupom"}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <form className="space-y-4" onSubmit={handleCupomSubmit}>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-700">
                      Código do cupom
                    </label>
                    <Input
                      value={cupomForm.codigo}
                      onChange={(event) =>
                        setCupomForm((current) => ({
                          ...current,
                          codigo: event.target.value,
                        }))
                      }
                      placeholder="Ex: JOAO10"
                      className="uppercase"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-700">
                      Produto do cupom
                    </label>
                    <Select
                      value={cupomForm.produtoId}
                      onValueChange={(value) =>
                        setCupomForm((current) => ({
                          ...current,
                          produtoId: value,
                        }))
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
                    <label className="text-sm font-medium text-slate-700">
                      Quem vai divulgar
                    </label>
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
                      <label className="text-sm font-medium text-slate-700">
                        Desconto (%)
                      </label>
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
                      <label className="text-sm font-medium text-slate-700">
                        Contato
                      </label>
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
                    <label className="text-sm font-medium text-slate-700">
                      Observação interna
                    </label>
                    <Textarea
                      value={cupomForm.descricao}
                      onChange={(event) =>
                        setCupomForm((current) => ({
                          ...current,
                          descricao: event.target.value,
                        }))
                      }
                      className="min-h-24"
                    />
                  </div>

                  <div className="flex items-start gap-3 rounded-2xl border border-[#d6e7a2] bg-[#f7fde7] px-4 py-3">
                    <Checkbox
                      id="cupom-ativo"
                      checked={cupomForm.ativo}
                      onCheckedChange={(checked) =>
                        setCupomForm((current) => ({
                          ...current,
                          ativo: Boolean(checked),
                        }))
                      }
                    />
                    <label
                      htmlFor="cupom-ativo"
                      className="text-sm leading-6 text-slate-600"
                    >
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
                        Cancelar edição
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
                          <Badge
                            className={
                              cupom.ativo
                                ? "border border-emerald-200 bg-emerald-50 text-emerald-700"
                                : "border border-slate-200 bg-slate-100 text-slate-600"
                            }
                          >
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
                          {cupom.divulgadorContato
                            ? ` - ${cupom.divulgadorContato}`
                            : ""}
                        </p>
                        {cupom.descricao ? (
                          <p className="line-clamp-2 text-sm text-slate-500">
                            {cupom.descricao}
                          </p>
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
                          {deletingCupomId === cupom.id
                            ? "Excluindo..."
                            : "Excluir"}
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
                      Esse controle muda o cardápio e impede novos pedidos
                      quando a loja está fechada.
                    </p>
                  </div>

                  <Button
                    type="button"
                    disabled={savingSettings}
                    onClick={() =>
                      void handleSaveSettings({ isOpen: !settings.isOpen })
                    }
                    className={cn(
                      "h-14 rounded-full px-8 text-base font-bold text-white",
                      settings.isOpen
                        ? "bg-rose-600 hover:bg-rose-700"
                        : "bg-[#1b7f31] hover:bg-[#156326]",
                    )}
                  >
                    {settings.isOpen ? "Fechar agora" : "Abrir agora"}
                  </Button>
                </div>

                <div className="rounded-[1.2rem] border border-[#d6e7a2] bg-[#fbfff0] p-4">
                  <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-end">
                    <div className="space-y-2">
                      <label className="text-sm font-bold text-[#284a2e]">
                        Antecedência mínima para pedido
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
                          minimumLeadHours: Math.max(
                            0,
                            Math.round(settings.minimumLeadHours),
                          ),
                        })
                      }
                      className="h-12 rounded-full bg-[#1b7f31] px-6 font-bold text-white hover:bg-[#156326]"
                    >
                      {savingSettings ? "Salvando..." : "Salvar horário"}
                    </Button>
                  </div>
                </div>

                <div className="rounded-[1.2rem] border border-[#d6e7a2] bg-[#fbfff0] p-4">
                  <p className="text-sm font-bold text-[#284a2e]">Provisão financeira (10%)</p>
                  <p className="mt-1 text-sm text-[#48654f]">Valor reservado no controle interno e ainda pendente de transferência: <strong>{formatCurrency(totalProvisionPending)}</strong>.</p>
                  <Button type="button" disabled={transferringProvision || totalProvisionPending <= 0} onClick={() => void handleProvisionTransferred()} className="mt-3 h-12 rounded-full bg-[#1b7f31] px-6 font-bold text-white hover:bg-[#156326]">{transferringProvision ? "Registrando..." : "Marcar como transferido"}</Button>
                </div>

                <div className="rounded-[1.2rem] border border-[#d6e7a2] bg-[#fbfff0] p-4">
                  <label htmlFor="motorcycle-courier-phone" className="text-sm font-bold text-[#284a2e]">WhatsApp do motoboy</label>
                  <p className="mt-1 text-sm text-[#48654f]">Contato usado pela equipe nos pedidos para entrega.</p>
                  <div className="mt-3 flex flex-col gap-3 sm:flex-row">
                    <Input id="motorcycle-courier-phone" type="tel" value={settings.motorcycleCourierPhone || ""} onChange={(event) => setSettings((current) => ({ ...current, motorcycleCourierPhone: event.target.value }))} placeholder="(83) 99999-9999" className="h-12 bg-white" />
                    <Button type="button" disabled={savingSettings} onClick={() => void handleSaveSettings({ motorcycleCourierPhone: settings.motorcycleCourierPhone })} className="h-12 rounded-full bg-[#1b7f31] px-6 font-bold text-white hover:bg-[#156326]">Salvar motoboy</Button>
                  </div>
                </div>

                <div className="space-y-4 rounded-[1.2rem] border border-[#d6e7a2] bg-[#fbfff0] p-4">
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div>
                      <p className="text-sm font-bold text-[#284a2e]">
                        Horário da operação por dia
                      </p>
                      <p className="mt-1 text-sm leading-6 text-[#48654f]">
                        Defina quais dias aceitam pedidos e o intervalo de
                        atendimento de cada um.
                      </p>
                    </div>
                    <Button
                      type="button"
                      disabled={savingSettings}
                      onClick={() =>
                        void handleSaveSettings({
                          operationSchedule: settings.operationSchedule,
                        })
                      }
                      className="h-12 rounded-full bg-[#1b7f31] px-6 font-bold text-white hover:bg-[#156326]"
                    >
                      {savingSettings ? "Salvando..." : "Salvar horários"}
                    </Button>
                  </div>

                  <div className="grid gap-3">
                    {WEEKDAY_OPTIONS.map((day) => {
                      const schedule = settings.operationSchedule[day.value];

                      return (
                        <div
                          key={day.value}
                          className="grid gap-3 rounded-[1rem] border border-[#d6e7a2] bg-white p-3 sm:grid-cols-[150px_1fr_1fr] sm:items-center"
                        >
                          <label className="flex items-center gap-3 text-sm font-bold text-[#284a2e]">
                            <Checkbox
                              checked={schedule.isOpen}
                              disabled={savingSettings}
                              onCheckedChange={(checked) =>
                                updateOperationScheduleDay(day.value, {
                                  isOpen: Boolean(checked),
                                })
                              }
                            />
                            {day.label}
                          </label>

                          <div className="space-y-1">
                            <label className="text-xs font-bold uppercase tracking-wide text-[#618038]">
                              Abre
                            </label>
                            <Input
                              type="number"
                              min="0"
                              max="23"
                              step="1"
                              value={schedule.openHour}
                              disabled={savingSettings || !schedule.isOpen}
                              onChange={(event) =>
                                updateOperationScheduleDay(day.value, {
                                  openHour: Number(event.target.value || 0),
                                })
                              }
                              className="h-11 border-[#d6e7a2] bg-white text-sm font-bold text-[#0b3d18]"
                            />
                          </div>

                          <div className="space-y-1">
                            <label className="text-xs font-bold uppercase tracking-wide text-[#618038]">
                              Fecha
                            </label>
                            <Input
                              type="number"
                              min="0"
                              max="23"
                              step="1"
                              value={schedule.closeHour}
                              disabled={savingSettings || !schedule.isOpen}
                              onChange={(event) =>
                                updateOperationScheduleDay(day.value, {
                                  closeHour: Number(event.target.value || 0),
                                })
                              }
                              className="h-11 border-[#d6e7a2] bg-white text-sm font-bold text-[#0b3d18]"
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="rounded-[1.2rem] border border-[#d6e7a2] bg-[#fbfff0] p-4">
                  <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                    <div>
                      <p className="text-sm font-bold text-[#284a2e]">
                        Pedidos no mesmo horário
                      </p>
                      <p className="mt-1 text-sm leading-6 text-[#48654f]">
                        Quando desligado, cada horário aceita apenas uma
                        encomenda ativa.
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-semibold text-[#48654f]">
                        {settings.allowMultipleOrdersPerSlot
                          ? "Vários por horário"
                          : "Um por horário"}
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
                      {settings.siteTheme === "PADRAO"
                        ? "Identidade padrão da Vizinha"
                        : settings.siteTheme === "NAMORADOS"
                        ? "Dia dos Namorados em destaque"
                        : settings.siteTheme === "SAO_JOAO"
                          ? "São João em destaque"
                          : "Tema da Copa ativo"}
                    </h3>
                    <p className="mt-2 text-sm leading-6 text-[#7a3149]">
                      Escolha entre a identidade padrão da Vizinha e os temas
                      sazonais de Copa, Dia dos Namorados e São João.
                    </p>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    {[
                      {
                        value: "PADRAO" as const,
                        title: "Padrão da Vizinha",
                        description:
                          "Identidade oficial da marca para usar durante todo o ano.",
                        icon: Star,
                        activeClass:
                          "border-[#e000cf] bg-[#fff0fc] text-[#8f147b]",
                      },
                      {
                        value: "NAMORADOS" as const,
                        title: "Dia dos Namorados",
                        description:
                          "Destaca combos para casais, presentes e um clima romântico.",
                        icon: Heart,
                        activeClass:
                          "border-[#e11d48] bg-[#ffe4ec] text-[#881337]",
                      },
                      {
                        value: "COPA" as const,
                        title: "Copa",
                        description:
                          "Aplica o visual verde e amarelo com combos especiais.",
                        icon: Trophy,
                        activeClass:
                          "border-[#1b7f31] bg-[#f7fde7] text-[#0b3d18]",
                      },
                      {
                        value: "SAO_JOAO" as const,
                        title: "São João",
                        description:
                          "Traz bandeirinhas, milho, estrelas e clima de arraiá.",
                        icon: FerrisWheel,
                        activeClass:
                          "border-[#ff8c00] bg-[#fff3a8] text-[#8b4513]",
                      },
                    ].map((themeOption) => {
                      const Icon = themeOption.icon;
                      const isActive = settings.siteTheme === themeOption.value;

                      return (
                        <button
                          key={themeOption.value}
                          type="button"
                          disabled={savingSettings || isActive}
                          onClick={() =>
                            void handleSaveSettings({
                              siteTheme: themeOption.value,
                            })
                          }
                          className={cn(
                            "flex min-h-32 flex-col items-start gap-3 rounded-[1rem] border p-4 text-left transition",
                            isActive
                              ? themeOption.activeClass
                              : "border-[#f4b6c5] bg-white text-[#7a3149] hover:bg-[#fff0f4]",
                          )}
                        >
                          <Icon className="h-5 w-5" />
                          <span className="text-base font-bold">
                            {themeOption.title}
                          </span>
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

                  {settings.siteTheme === "PADRAO" ? (
                    <div className="rounded-[1rem] border border-[#1b7f31] bg-white px-4 py-3 text-sm leading-6 text-[#284a2e]">
                      <strong className="text-[#0b3d18]">No site:</strong>{" "}
                      a identidade da Vizinha aparece com mensagens atemporais
                      e as cores principais da marca.
                    </div>
                  ) : settings.siteTheme === "NAMORADOS" ? (
                    <div className="rounded-[1rem] border border-[#e11d48] bg-white px-4 py-3 text-sm leading-6 text-[#7a3149]">
                      <strong className="text-[#be123c]">No site:</strong>{" "}
                      textos, etiquetas e destaques passam a falar de Dia dos
                      Namorados, com cores em rosa e vinho.
                    </div>
                  ) : settings.siteTheme === "SAO_JOAO" ? (
                    <div className="rounded-[1rem] border border-[#ff8c00] bg-white px-4 py-3 text-sm leading-6 text-[#8b4513]">
                      <strong className="text-[#cc0000]">No site:</strong>{" "}
                      bandeirinhas, textura xadrez e emojis 🎪 🌽 ⭐ 🎉 entram
                      no cardápio.
                    </div>
                  ) : null}
                </div>

                <div className="space-y-4 rounded-[1.2rem] border border-[#d6e7a2] bg-[#fbfff0] p-4">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wide text-[#618038]">
                      Produto em destaque
                    </p>
                    <h3 className="mt-1 text-xl font-bold text-[#0b3d18]">
                      Escolha o produto principal do cardápio
                    </h3>
                    <p className="mt-2 text-sm leading-6 text-[#48654f]">
                      Esse produto aparece no bloco grande da vitrine. Produtos
                      ocultos não aparecem no cardápio público.
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
                          <SelectItem value="AUTO">
                            Automático: primeiro produto ativo
                          </SelectItem>
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
                  {
                    label: "Pedidos no painel",
                    value: pedidos.length,
                    icon: ShoppingBag,
                  },
                  {
                    label: "Vendido no valor base",
                    value: formatCurrency(totalBaseVendido),
                    icon: CheckCheck,
                  },
                  {
                    label: "Antecedência",
                    value: `${settings.minimumLeadHours}h`,
                    icon: Clock,
                  },
                  {
                    label: "Pedidos por horário",
                    value: settings.allowMultipleOrdersPerSlot
                      ? "Vários"
                      : "Único",
                    icon: TicketPercent,
                  },
                  {
                    label: "Tema do site",
                    value:
                      settings.siteTheme === "PADRAO"
                        ? "Padrão"
                        : settings.siteTheme === "NAMORADOS"
                        ? "Namorados"
                        : settings.siteTheme === "SAO_JOAO"
                          ? "São João"
                          : "Copa",
                    icon:
                      settings.siteTheme === "PADRAO"
                        ? Star
                        : settings.siteTheme === "NAMORADOS"
                        ? Heart
                        : settings.siteTheme === "SAO_JOAO"
                          ? FerrisWheel
                          : Trophy,
                  },
                  {
                    label: "Produto destaque",
                    value:
                      produtos.find(
                        (produto) => produto.id === settings.featuredProductId,
                      )?.nome || "Automático",
                    icon: Star,
                  },
                ].map((item) => {
                  const Icon = item.icon;

                  return (
                    <div
                      key={item.label}
                      className="border-b border-white/10 p-5 last:border-b-0"
                    >
                      <Icon className="h-5 w-5 text-[#f4d330]" />
                      <p className="mt-3 text-2xl font-bold">{item.value}</p>
                      <p className="mt-1 text-sm text-white/70">{item.label}</p>
                    </div>
                  );
                })}
              </aside>
            </div>
          </section>
        ) : activeTab === "produtos" ? (
          <section className="space-y-5">
            <div className="flex flex-col gap-3 rounded-[2rem] border border-[#d6e7a2] bg-white/95 p-5 shadow-lg shadow-green-900/5 sm:flex-row sm:items-center sm:justify-between">
              <div><p className="text-xs font-bold uppercase tracking-wide text-[#618038]">Cardápio</p><h2 className="mt-1 text-2xl font-bold text-[#0b3d18]">Gerenciar produtos</h2></div>
              <Button type="button" onClick={() => { resetForm(); setProductDialogOpen(true); }} className="rounded-full bg-[#1b7f31] text-white hover:bg-[#156326]"><Plus className="mr-2 h-4 w-4" />Novo produto</Button>
            </div>
            <Dialog open={productDialogOpen} onOpenChange={(open) => { setProductDialogOpen(open); if (!open && !saving) resetForm(); }}>
              <DialogContent className="max-h-[90vh] overflow-y-auto border-[#d6e7a2] sm:max-w-2xl">
                <DialogHeader><DialogTitle className="text-[#0b3d18]">{editingId ? "Editar produto" : "Novo produto"}</DialogTitle><DialogDescription>Preencha os dados que serão exibidos no cardápio.</DialogDescription></DialogHeader>
            <Card className="border-0 bg-white shadow-none">
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
                    <label className="text-sm font-medium text-slate-700">
                      Nome do produto
                    </label>
                    <Input
                      value={form.nome}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          nome: event.target.value,
                        }))
                      }
                      placeholder="Ex: Cento completo"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-700">
                      Descrção
                    </label>
                    <Textarea
                      value={form.descricao}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          descricao: event.target.value,
                        }))
                      }
                      className="min-h-28"
                    />
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-slate-700">
                        Valor
                      </label>
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={form.preco}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            preco: event.target.value,
                          }))
                        }
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-medium text-slate-700">
                        Tipo
                      </label>
                      <Select
                        value={form.productTypeId || "NONE"}
                        onValueChange={(value) => {
                          const selectedType = productTypes.find(
                            (type) => type.id === value,
                          );
                          const selectedName =
                            selectedType?.name.toLowerCase() || "";
                          const categoria = selectedName.includes("combo")
                            ? "COMBO"
                            : selectedName.includes("avulso")
                              ? "LANCHONETE"
                              : "CENTO";

                          setForm((current) => ({
                            ...current,
                            productTypeId: value === "NONE" ? "" : value,
                            categoria,
                            totalUnidades: selectedType?.minQuantity
                              ? String(selectedType.minQuantity)
                              : current.totalUnidades,
                          }));
                        }}
                      >
                        <SelectTrigger className="h-10 w-full border-[#d6e7a2] bg-white text-sm text-slate-700">
                          <SelectValue placeholder="Selecione o tipo" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="NONE">Sem tipo</SelectItem>
                          {productTypes.map((productType) => (
                            <SelectItem
                              key={productType.id}
                              value={productType.id}
                            >
                              {productType.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2 rounded-xl border border-pink-200 bg-pink-50 p-3 sm:col-span-2">
                      <div className="flex items-center gap-2">
                        <Checkbox id="produto-confeiteira-ativo" checked={form.ativoConfeiteira} onCheckedChange={(checked) => setForm((current) => ({ ...current, ativoConfeiteira: Boolean(checked) }))} />
                        <label htmlFor="produto-confeiteira-ativo" className="text-sm font-semibold text-pink-900">Disponível para confeiteiras</label>
                      </div>
                      <p className="text-xs text-pink-800">Condição exclusiva da área /confeiteira.</p>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div><label className="text-sm font-medium text-slate-700">Preço para confeiteira</label><Input type="number" min="0" step="0.01" value={form.precoConfeiteira} onChange={(event) => setForm((current) => ({ ...current, precoConfeiteira: event.target.value }))} /></div>
                        <div><label className="text-sm font-medium text-slate-700">Quantidade mínima</label><Input type="number" min="1" step="1" value={form.quantidadeMinimaConfeiteira} onChange={(event) => setForm((current) => ({ ...current, quantidadeMinimaConfeiteira: event.target.value }))} /></div>
                      </div>
                    </div>

                    <div className="flex items-start gap-3 rounded-2xl border border-[#d6e7a2] bg-[#f7fde7] px-4 py-3 sm:col-span-2">
                      <Checkbox id="produto-selecao-tipos" checked={form.precisaSelecaoDeTipos} onCheckedChange={(checked) => setForm((current) => ({ ...current, precisaSelecaoDeTipos: Boolean(checked) }))} />
                      <label htmlFor="produto-selecao-tipos" className="text-sm leading-6 text-slate-600">Este produto exige seleção de tipos/sabores.</label>
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-medium text-slate-700">
                        Total de unidades
                      </label>
                      <Input
                        type="number"
                        min="1"
                        step="1"
                        value={form.totalUnidades}
                        disabled={isComboCategory || !form.precisaSelecaoDeTipos}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            totalUnidades: event.target.value,
                          }))
                        }
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-medium text-slate-700">
                        Máximo de tipos por lote mínimo
                      </label>
                      <Input
                        type="number"
                        min="1"
                        step="1"
                        value={form.maxTiposSalgado}
                        disabled={isComboCategory || !form.precisaSelecaoDeTipos}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            maxTiposSalgado: event.target.value,
                          }))
                        }
                      />
                      <p className="text-xs text-slate-500">
                        Ex.: mínimo 100 e máximo 4 libera 4 tipos em 100 unidades e 8 tipos em 200.
                      </p>
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
                                  updateComboItem(index, {
                                    nome: event.target.value,
                                  })
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
                                  updateComboItem(index, {
                                    quantidade: event.target.value,
                                  })
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
                            Para combo, as quantidades ficam travadas no
                            cadastro e entram prontas no pedido.
                          </p>
                        </div>
                      </div>
                    ) : null}

                    {!isComboCategory && form.precisaSelecaoDeTipos ? (
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
                                onChange={(event) =>
                                  updateSabor(index, event.target.value)
                                }
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
                            Cadastre cada tipo separadamente para a cliente
                            escolher um por vez na montagem.
                          </p>
                        </div>
                      </div>
                    ) : null}

                    <div className="space-y-2 sm:col-span-2">
                      <label className="text-sm font-medium text-slate-700">Antecedência mínima (horas)</label>
                      <Input type="number" min="0" step="1" value={form.antecedenciaMinimaHoras} onChange={(event) => setForm((current) => ({ ...current, antecedenciaMinimaHoras: event.target.value }))} placeholder={`Padrão da loja: ${settings.minimumLeadHours}h`} />
                      <p className="text-xs text-slate-500">Deixe vazio para usar o padrão global da loja.</p>
                    </div>

                    <div className="space-y-2 sm:col-span-2">
                      <label className="text-sm font-medium text-slate-700">
                        Foto do produto
                      </label>
                      <label className="flex h-10 cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed border-[#d6e7a2] bg-[#f7fde7] text-sm font-medium text-[#1b5e20] transition hover:bg-pink-100">
                        {uploading ? (
                          <LoaderCircle className="h-4 w-4 animate-spin" />
                        ) : (
                          <Upload className="h-4 w-4" />
                        )}
                        {form.imagemBase64
                          ? "Trocar imagem"
                          : "Selecionar imagem"}
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
                      <label
                        htmlFor="produto-parcial"
                        className="text-sm leading-6 text-slate-600"
                      >
                        Permitir pagamento de 50% no checkout.
                      </label>
                    </div>

                    <div className="flex items-start gap-3 rounded-2xl border border-[#d6e7a2] bg-[#f7fde7] px-4 py-3">
                      <Checkbox
                        id="produto-promocao"
                        checked={form.emPromocao}
                        onCheckedChange={(checked) =>
                          setForm((current) => ({
                            ...current,
                            emPromocao: Boolean(checked),
                          }))
                        }
                      />
                      <div className="flex-1 space-y-3">
                        <label
                          htmlFor="produto-promocao"
                          className="text-sm leading-6 text-slate-600"
                        >
                          Destacar este produto como promoção.
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
                          setForm((current) => ({
                            ...current,
                            ativo: Boolean(checked),
                          }))
                        }
                      />
                      <label
                        htmlFor="produto-ativo"
                        className="text-sm leading-6 text-slate-600"
                      >
                        Deixar visível no cardápio.
                      </label>
                    </div>
                  </div>

                  {form.imagemBase64 && (
                    <div className="relative aspect-[4/3] overflow-hidden rounded-3xl border border-[#d6e7a2] bg-[#f7fde7]">
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
                    <Button
                      type="submit"
                      disabled={saving}
                      className="rounded-full bg-[#1b7f31] text-white hover:bg-[#156326]"
                    >
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
                        onClick={() => { resetForm(); setProductDialogOpen(false); }}
                        className="rounded-full border-[#d6e7a2] text-[#1b5e20] hover:bg-[#f7fde7]"
                      >
                        Cancelar edição
                      </Button>
                    )}
                  </div>
                </form>
              </CardContent>
            </Card>
              </DialogContent>
            </Dialog>

            <section className="overflow-hidden rounded-[1.4rem] border border-[#d6e7a2] bg-white shadow-sm">
              <div className="flex flex-col gap-2 border-b border-[#e4edc9] bg-[#0b3d18] p-4 text-white sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide text-[#f4d330]">
                    Cardápio
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
                          <h3 className="truncate text-lg font-bold text-[#0b3d18]">
                            {produto.nome}
                          </h3>
                          <Badge
                            className={
                              produto.ativo
                                ? "border border-emerald-200 bg-emerald-50 text-emerald-700"
                                : "border border-slate-200 bg-slate-100 text-slate-600"
                            }
                          >
                            {produto.ativo ? "Ativo" : "Oculto"}
                          </Badge>
                          {produto.emPromocao ? (
                            <Badge className="border border-[#f4d330] bg-[#fff3a8] text-[#735600]">
                              Promoção {Number(produto.descontoPercentual || 0)}
                              %
                            </Badge>
                          ) : null}
                        </div>
                        <p className="line-clamp-2 text-sm leading-6 text-[#48654f]">
                          {produto.descricao}
                        </p>
                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-[#618038]">
                          <span>
                            {produto.productTypeName || produto.categoria}
                          </span>
                          <span>{produto.totalUnidades} un</span>
                          <span>Até {produto.maxTiposSalgado} tipos</span>
                          <span>
                            {produto.permitePagamentoParcial
                              ? "50% ou 100%"
                              : "100%"}
                          </span>
                          <span>Antecedência: {produto.antecedenciaMinimaHoras ?? settings.minimumLeadHours}h</span>
                        </div>
                      </div>

                      <div className="flex flex-col gap-3 md:items-end">
                        {produto.emPromocao &&
                        Number(produto.descontoPercentual || 0) > 0 ? (
                          <div className="text-left md:text-right">
                            <p className="text-sm text-slate-400 line-through">
                              {formatCurrency(Number(produto.preco))}
                            </p>
                            <p className="text-xl font-bold text-[#0b3d18]">
                              {formatCurrency(
                                Number(produto.preco) *
                                  (1 -
                                    Number(produto.descontoPercentual || 0) /
                                      100),
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
                          {!produto.ativo ? (
                            <Button type="button" variant="outline" size="sm" onClick={() => { handleEdit(produto); setForm((current) => ({ ...current, ativo: true })); }} className="rounded-full border-emerald-200 text-emerald-700 hover:bg-emerald-50">Reativar</Button>
                          ) : null}
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
                            {deletingId === produto.id
                              ? "Excluindo..."
                              : "Excluir"}
                          </Button>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>
          </section>
        ) : null}
      </div>

      <Dialog
        open={messageDialogOpen}
        onOpenChange={(open) => {
          if (!sendingMessages) setMessageDialogOpen(open);
        }}
      >
        <DialogContent className="border-[#d6e7a2] sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="text-[#0b3d18]">Mensagem para clientes</DialogTitle>
            <DialogDescription>
              Envia uma mensagem individual para cada telefone único de pedidos não cancelados.
              {customerCount === null ? " Carregando contatos..." : ` ${customerCount} cliente(s) serão incluídos.`}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="bulk-message" className="text-sm font-semibold text-slate-700">Mensagem</label>
              <Textarea
                id="bulk-message"
                value={bulkMessage}
                disabled={sendingMessages}
                maxLength={1500}
                rows={7}
                placeholder="Escreva aqui a mensagem..."
                onChange={(event) => setBulkMessage(event.target.value)}
              />
              <p className="text-right text-xs text-slate-500">{bulkMessage.length}/1.500</p>
            </div>

            <div className="space-y-2">
              <label htmlFor="message-delay" className="text-sm font-semibold text-slate-700">Intervalo entre mensagens (segundos)</label>
              <Input
                id="message-delay"
                type="number"
                min={10}
                max={60}
                value={messageDelaySeconds}
                disabled={sendingMessages}
                onChange={(event) => setMessageDelaySeconds(event.target.value)}
              />
              <p className="text-xs text-amber-700">O mínimo é 10 segundos. O intervalo reduz rajadas, mas não elimina o risco de bloqueio pelo WhatsApp.</p>
              <p className="text-xs text-slate-500">Mantenha esta página aberta até o envio terminar.</p>
            </div>

            {sendingMessages || messageProgress.processed > 0 ? (
              <div className="rounded-xl bg-[#f7fde7] p-3 text-sm text-[#284a2e]">
                Processados: {messageProgress.processed}/{customerCount ?? "…"} · Enviados: {messageProgress.sent} · Falhas: {messageProgress.failed}
              </div>
            ) : null}
          </div>

          <DialogFooter>
            {sendingMessages ? (
              <Button type="button" variant="destructive" disabled={stoppingMessages || !messageCampaignId} onClick={() => void stopBulkMessage()}>
                {stoppingMessages ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : null}
                {stoppingMessages ? "Parando..." : "Parar envio"}
              </Button>
            ) : (
              <Button type="button" variant="outline" onClick={() => setMessageDialogOpen(false)}>Fechar</Button>
            )}
            <Button
              type="button"
              disabled={sendingMessages || customerCount === null || customerCount === 0 || !bulkMessage.trim()}
              onClick={() => void sendBulkMessage()}
              className="bg-[#1b7f31] text-white hover:bg-[#156326]"
            >
              {sendingMessages ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : <MessageCircle className="mr-2 h-4 w-4" />}
              {sendingMessages ? "Enviando..." : "Enviar para todos"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={selectedPedido !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedPedido(null);
        }}
      >
        <DialogContent
          className="max-h-[calc(100vh-2rem)] overflow-y-auto border-[#d6e7a2] sm:max-w-2xl"
          onInteractOutside={(event) => {
            if ((event.target as HTMLElement).closest(".pac-container")) event.preventDefault();
          }}
        >
          {selectedPedido ? (
            <>
              <DialogHeader>
                <DialogTitle className="text-[#0b3d18]">
                  Pedido {selectedPedido.codigo}
                </DialogTitle>
                <DialogDescription>
                  {selectedPedido.clienteNome} • {selectedPedido.clienteTelefone}
                </DialogDescription>
              </DialogHeader>

              <div className="grid gap-3 text-sm sm:grid-cols-2">
                <div className="rounded-xl bg-[#f7fde7] p-3">
                  <p className="font-semibold text-[#1b5e20]">Entrega</p>
                  <p className="mt-1 text-slate-700">{formatDateTime(selectedPedido.dataEntrega)}</p>
                </div>
                <div className="rounded-xl bg-[#f7fde7] p-3">
                  <p className="font-semibold text-[#1b5e20]">Pagamento</p>
                  <p className="mt-1 text-slate-700">{selectedPedido.metodoPagamentoLabel} • {selectedPedido.percentualPagamento}% agora</p>
                  <p className="font-bold text-[#0b3d18]">{formatCurrency(Number(selectedPedido.totalCobrado))}</p>
                </div>
                <div className="rounded-xl bg-[#f7fde7] p-3 sm:col-span-2">
                  <p className="font-semibold text-[#1b5e20]">Produto e itens</p>
                  <p className="mt-1 text-slate-700">{selectedPedido.produtoNomeSnapshot} • {selectedPedido.totalUnidades} unidades • {selectedPedido.totalTipos} tipos</p>
                  <ul className="mt-2 space-y-1 text-slate-700">
                    {selectedPedido.itens.map((item) => <li key={item.id}>{item.tipo}: {item.quantidade} un</li>)}
                  </ul>
                </div>
                <div className="rounded-xl bg-[#f7fde7] p-3 sm:col-span-2">
                  <p className="font-semibold text-[#1b5e20]">Observações</p>
                  <p className="mt-1 whitespace-pre-wrap text-slate-700">{selectedPedido.observacoes || "Sem observações."}</p>
                </div>
              </div>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setSelectedPedido(null)}>Fechar</Button>
                <Button
                  type="button"
                  disabled={printingPedidoId === selectedPedido.id}
                  onClick={() => void handlePrint(selectedPedido.id)}
                  className="bg-[#1b7f31] text-white hover:bg-[#156326]"
                >
                  <Printer className="mr-2 h-4 w-4" />
                  {printingPedidoId === selectedPedido.id ? "Enviando..." : "Imprimir"}
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog
        open={selectedSimpleOrder !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedSimpleOrder(null);
        }}
      >
        <DialogContent className="max-h-[calc(100vh-2rem)] overflow-y-auto border-[#d6e7a2] sm:max-w-2xl">
          {selectedSimpleOrder ? (
            <>
              <DialogHeader>
                <DialogTitle className="text-[#0b3d18]">Pedido {getSimpleOrderCode(selectedSimpleOrder)}{selectedSimpleOrder.isConfeiteira ? " • Confeiteira" : ""}</DialogTitle>
                <DialogDescription>{selectedSimpleOrder.customerName || "Cliente não informado"}{selectedSimpleOrder.customerPhone ? ` • ${selectedSimpleOrder.customerPhone}` : ""}</DialogDescription>
              </DialogHeader>

              <div className="grid gap-3 text-sm sm:grid-cols-2">
                <div className="rounded-xl bg-[#f7fde7] p-3">
                  <p className="font-semibold text-[#1b5e20]">Entrega/retirada</p>
                  <p className="mt-1 text-slate-700">{formatDateTime(getSimpleOrderDate(selectedSimpleOrder))}</p>
                  <p className="mt-1 text-slate-700">{selectedSimpleOrder.fulfillmentType === "DELIVERY" ? selectedSimpleOrder.deliveryAddress || "Entrega" : "Retirada"}</p>
                  {selectedSimpleOrder.deliveryReference ? <p className="mt-1 text-slate-700">Referência: {selectedSimpleOrder.deliveryReference}</p> : null}
                </div>
                <div className="rounded-xl bg-[#f7fde7] p-3">
                  <p className="font-semibold text-[#1b5e20]">Pagamento</p>
                  <p className="mt-1 text-slate-700">{selectedSimpleOrder.paymentMethodLabel} • {selectedSimpleOrder.paymentPercentage}% agora</p>
                  <p className="font-bold text-[#0b3d18]">{formatCurrency(Number(selectedSimpleOrder.chargedAmount || selectedSimpleOrder.totalAmount))}</p>
                </div>
                <div className="rounded-xl bg-[#f7fde7] p-3 sm:col-span-2">
                  <p className="font-semibold text-[#1b5e20]">Itens</p>
                  <ul className="mt-2 space-y-1 text-slate-700">
                    {selectedSimpleOrder.items.map((item) => <li key={item.id}>{item.productName} ({item.productType}) — {item.quantity} x {formatCurrency(Number(item.unitPrice))}</li>)}
                  </ul>
                </div>
              </div>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setSelectedSimpleOrder(null)}>Fechar</Button>
                <Button type="button" variant="outline" onClick={() => openSimpleOrderEditor(selectedSimpleOrder)}>Alterar pedido</Button>
                <Button type="button" disabled={printingPedidoId === selectedSimpleOrder.id} onClick={() => void handlePrintSimpleOrder(selectedSimpleOrder.id)} className="bg-[#1b7f31] text-white hover:bg-[#156326]">
                  <Printer className="mr-2 h-4 w-4" />
                  {printingPedidoId === selectedSimpleOrder.id ? "Enviando..." : "Imprimir"}
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={editingSimpleOrder !== null} onOpenChange={(open) => { if (!open && !savingOrderEdit) setEditingSimpleOrder(null); }}>
        <DialogContent className="max-h-[calc(100vh-2rem)] overflow-y-auto border-[#d6e7a2] sm:max-w-2xl" onInteractOutside={(event) => { if ((event.target as HTMLElement).closest(".pac-container")) event.preventDefault(); }}>
          <DialogHeader>
            <DialogTitle className="text-[#0b3d18]">Alterar pedido</DialogTitle>
            <DialogDescription>O cliente receberá uma confirmação da alteração. O saldo será cobrado pelo checkout seguro quando o pedido estiver pronto.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-3 rounded-xl bg-[#f7fde7] p-3 sm:grid-cols-2">
              <div className="space-y-1"><label className="text-xs font-bold uppercase tracking-wide text-[#52705a]">Data e hora da retirada/entrega</label><Input type="datetime-local" value={orderEditScheduledAt} onChange={(event) => setOrderEditScheduledAt(event.target.value)} /></div>
              <div className="space-y-1"><label className="text-xs font-bold uppercase tracking-wide text-[#52705a]">Valor já pago (R$)</label><Input type="number" min="0" step="0.01" value={orderEditPaidAmount} onChange={(event) => setOrderEditPaidAmount(event.target.value)} /><p className="text-xs text-slate-500">Informe o valor efetivamente recebido. O saldo será recalculado.</p></div>
            </div>
            <div className="space-y-3">
              <div><p className="text-xs font-black uppercase tracking-[0.16em] text-[#618038]">Produtos e quantidades</p><p className="mt-1 text-sm text-slate-500">Ajuste cada produto e a composição dos sabores, como no carrinho.</p></div>
              {orderEditItems.map((item, index) => (
                <div key={`${item.productId}-${index}`} className="rounded-2xl border border-[#d6e7a2] bg-[#f7fde7] p-3 shadow-sm">
                  <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_110px_auto]">
                    <div className="space-y-1"><label className="text-xs font-bold uppercase tracking-wide text-[#52705a]">Produto</label><Select value={item.productId} onValueChange={(value) => setOrderEditItems((current) => current.map((entry, entryIndex) => entryIndex === index ? { ...entry, productId: value, selectedItems: [{ tipo: "", quantidade: "0" }] } : entry))}>
                    <SelectTrigger className="bg-white"><SelectValue placeholder="Produto" /></SelectTrigger>
                    <SelectContent>{produtos.filter((product) => product.ativo && (!editingSimpleOrder?.isConfeiteira || product.ativoConfeiteira)).map((product) => <SelectItem key={product.id} value={product.id}>{product.nome}</SelectItem>)}</SelectContent>
                    </Select></div>
                    <div className="space-y-1"><label className="text-xs font-bold uppercase tracking-wide text-[#52705a]">Quantidade</label><Input className="bg-white text-center font-bold" type="number" min="1" value={item.quantity} onChange={(event) => setOrderEditItems((current) => current.map((entry, entryIndex) => entryIndex === index ? { ...entry, quantity: event.target.value } : entry))} /></div>
                    <Button type="button" variant="outline" className="self-end border-red-200 text-red-700 hover:bg-red-50" disabled={orderEditItems.length === 1} onClick={() => setOrderEditItems((current) => current.filter((_, entryIndex) => entryIndex !== index))}>Remover</Button>
                  </div>
                  {(() => { const product = produtos.find((candidate) => candidate.id === item.productId); return product?.precisaSelecaoDeTipos ? <OrderEditFlavorPicker product={product} flavors={item.selectedItems} onChange={(selectedItems) => setOrderEditItems((current) => current.map((entry, entryIndex) => entryIndex === index ? { ...entry, selectedItems } : entry))} /> : null; })()}
                </div>
              ))}
              <Button type="button" variant="outline" className="w-full border-dashed border-[#91b34a] text-[#1b5e20] hover:bg-[#f7fde7]" onClick={() => setOrderEditItems((current) => [...current, { productId: produtos.find((product) => product.ativo && (!editingSimpleOrder?.isConfeiteira || product.ativoConfeiteira))?.id || "", quantity: "1", selectedItems: [{ tipo: "", quantidade: "0" }] }])}>+ Adicionar produto</Button>
            </div>
            <div className="space-y-2 rounded-xl bg-[#f7fde7] p-3">
              <p className="text-sm font-semibold text-[#1b5e20]">Entrega</p>
              <Select value={orderEditFulfillment} onValueChange={(value) => setOrderEditFulfillment(value as "PICKUP" | "DELIVERY")}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="PICKUP">Retirada</SelectItem><SelectItem value="DELIVERY">Entrega</SelectItem></SelectContent></Select>
              {orderEditFulfillment === "DELIVERY" ? <div className="grid gap-2 sm:grid-cols-3"><Input ref={orderEditAddressRef} value={orderEditAddress} onChange={(event) => setOrderEditAddress(event.target.value)} placeholder="Endereço (selecione no Google Maps)" /><Input value={orderEditNeighborhood} onChange={(event) => setOrderEditNeighborhood(event.target.value)} placeholder="Bairro" /><Input value={orderEditReference} onChange={(event) => setOrderEditReference(event.target.value)} placeholder="Referência" /></div> : null}
            </div>
          </div>
          <DialogFooter><Button type="button" variant="outline" disabled={savingOrderEdit} onClick={() => setEditingSimpleOrder(null)}>Cancelar</Button><Button type="button" disabled={savingOrderEdit} onClick={() => void saveSimpleOrderEdit()} className="bg-[#1b7f31] text-white hover:bg-[#156326]">{savingOrderEdit ? "Salvando..." : "Salvar alteração"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}
