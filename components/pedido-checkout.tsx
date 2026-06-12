"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
import { MetodoPagamento } from "@prisma/client";
import {
  AlertTriangle,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Heart,
  LoaderCircle,
  Minus,
  Plus,
  ShieldCheck,
  Trophy,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { calculateDiscountedSubtotal } from "@/lib/descontos";
import { calculatePaymentAmounts, formatCurrency } from "@/lib/pedidos";
import { type ComboItem, PRODUCT_CATEGORY_LABEL, type ProductCategory } from "@/lib/produtos";
import { BUSINESS_RULES } from "@/lib/site-config";
import type { StoreSiteTheme } from "@/lib/site-theme";
import { cn } from "@/lib/utils";

type PaymentMethodOption = {
  id: MetodoPagamento;
  label: string;
  description: string;
  feePercent: number;
};

type ProdutoCheckout = {
  id: string;
  slug: string;
  nome: string;
  descricao: string;
  preco: number;
  imagemBase64: string;
  categoria: ProductCategory;
  totalUnidades: number;
  maxTiposSalgado: number;
  permitePagamentoParcial: boolean;
  emPromocao: boolean;
  descontoPercentual: number;
  saboresSugeridos: string[];
  comboItens: ComboItem[];
};

type AppliedCoupon = {
  codigo: string;
  divulgadorNome: string;
  descontoPercentual: number;
};

type ItemState = {
  tipo: string;
  quantidade: number;
};

const PAYMENT_PERCENTAGES = [50, 100] as const;

type BusinessStatusData = {
  isOpen: boolean;
  message: string;
  minimumLeadHours: number;
};

function getMinDeliveryDate(minimumLeadHours: number) {
  const minDate = new Date(Date.now() + minimumLeadHours * 60 * 60 * 1000);
  minDate.setMinutes(
    Math.ceil(minDate.getMinutes() / BUSINESS_RULES.slotMinutes) * BUSINESS_RULES.slotMinutes,
    0,
    0
  );

  return minDate;
}

function formatDateInputValue(value: Date) {
  const timezoneOffset = value.getTimezoneOffset() * 60_000;
  return new Date(value.getTime() - timezoneOffset).toISOString().slice(0, 10);
}

function formatTimeInputValue(value: Date) {
  return value.toTimeString().slice(0, 5);
}

function formatDateLabel(value: string) {
  if (!value) {
    return "Selecione a data";
  }

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "full",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(`${value}T12:00:00`));
}

function startOfMonth(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), 1);
}

function addMonths(value: Date, amount: number) {
  return new Date(value.getFullYear(), value.getMonth() + amount, 1);
}

function getCalendarDays(month: Date) {
  const firstDay = startOfMonth(month);
  const startWeekday = firstDay.getDay();
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const cells: Array<{ date: Date; currentMonth: boolean }> = [];

  for (let index = startWeekday - 1; index >= 0; index -= 1) {
    cells.push({
      date: new Date(month.getFullYear(), month.getMonth(), -index),
      currentMonth: false,
    });
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push({
      date: new Date(month.getFullYear(), month.getMonth(), day),
      currentMonth: true,
    });
  }

  while (cells.length % 7 !== 0) {
    const nextDay = cells.length - (startWeekday + daysInMonth) + 1;
    cells.push({
      date: new Date(month.getFullYear(), month.getMonth() + 1, nextDay),
      currentMonth: false,
    });
  }

  return cells;
}

function buildDeliveryDateTime(date: string, time: string) {
  return `${date}T${time}`;
}

function getTimeSlots(dateValue: string, minDate: Date, allowExtendedHours: boolean) {
  if (!dateValue) {
    return [] as string[];
  }

  const selectedDate = new Date(`${dateValue}T12:00:00`);
  const weekday = selectedDate.getDay();
  const schedule = BUSINESS_RULES.scheduleByWeekday[
    weekday as keyof typeof BUSINESS_RULES.scheduleByWeekday
  ];

  if (!schedule && !allowExtendedHours) {
    return [] as string[];
  }

  const slots: string[] = [];
  const selectedKey = dateValue;
  const minKey = formatDateInputValue(minDate);
  const openHour = schedule?.openHour ?? 0;
  const closeMinutes = allowExtendedHours ? 23 * 60 + 45 : (schedule?.closeHour ?? 0) * 60;
  const startMinutes =
    openHour * 60 +
    (selectedKey === minKey
      ? Math.max(
          0,
          Math.ceil(minDate.getMinutes() / BUSINESS_RULES.slotMinutes) *
            BUSINESS_RULES.slotMinutes -
            openHour * 60 +
            minDate.getHours() * 60
        )
      : 0);
  const firstMinutes = Math.max(openHour * 60, startMinutes);
  const lastMinutes = closeMinutes;

  for (let minutes = firstMinutes; minutes <= lastMinutes; minutes += BUSINESS_RULES.slotMinutes) {
    const hours = Math.floor(minutes / 60);
    const remainder = minutes % 60;
    slots.push(`${String(hours).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`);
  }

  return slots;
}

export function PedidoCheckout({
  produto,
  paymentMethods,
  businessStatus,
  siteTheme,
}: {
  produto: ProdutoCheckout;
  paymentMethods: PaymentMethodOption[];
  businessStatus: BusinessStatusData;
  siteTheme: StoreSiteTheme;
}) {
  const isCombo = produto.categoria === "COMBO" && produto.comboItens.length > 0;
  const isCentoProduct = produto.categoria === "CENTO";
  const isValentinesTheme = siteTheme === "NAMORADOS";
  const minDeliveryDate = useMemo(
    () => getMinDeliveryDate(businessStatus.minimumLeadHours),
    [businessStatus.minimumLeadHours]
  );
  const minDeliveryDateKey = useMemo(() => formatDateInputValue(minDeliveryDate), [minDeliveryDate]);
  const [clienteNome, setClienteNome] = useState("");
  const [clienteTelefone, setClienteTelefone] = useState("");
  const [clienteEmail, setClienteEmail] = useState("");
  const [dataEntregaData, setDataEntregaData] = useState(formatDateInputValue(minDeliveryDate));
  const [dataEntregaHora, setDataEntregaHora] = useState(formatTimeInputValue(minDeliveryDate));
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [displayMonth, setDisplayMonth] = useState(() => startOfMonth(minDeliveryDate));
  const [observacoes, setObservacoes] = useState("");
  const [percentualPagamento, setPercentualPagamento] = useState<50 | 100>(
    produto.permitePagamentoParcial ? 50 : 100
  );
  const [productQuantity, setProductQuantity] = useState(1);
  const [metodoPagamento, setMetodoPagamento] = useState<MetodoPagamento>(
    paymentMethods[0]?.id || MetodoPagamento.PIX
  );
  const [cupomCodigo, setCupomCodigo] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState<AppliedCoupon | null>(null);
  const [validatingCoupon, setValidatingCoupon] = useState(false);
  const [items, setItems] = useState<ItemState[]>(() => {
    if (isCombo) {
      return produto.comboItens.map((item) => ({
        tipo: item.nome,
        quantidade: item.quantidade,
      }));
    }

    const initial = produto.saboresSugeridos
      .slice(0, Math.min(2, produto.maxTiposSalgado))
      .map((tipo) => ({
        tipo,
        quantidade: 0,
      }));

    return initial.length > 0 ? initial : [{ tipo: "", quantidade: 0 }];
  });
  const [submitting, setSubmitting] = useState(false);

  const totalUnidades = useMemo(
    () => items.reduce((sum, item) => sum + Number(item.quantidade || 0), 0),
    [items]
  );
  const requiredUnits = produto.totalUnidades * productQuantity;
  const maxAllowedTypes = produto.maxTiposSalgado * productQuantity;
  const basePrice = produto.preco * productQuantity;
  const productDiscountPercent = produto.emPromocao ? Number(produto.descontoPercentual || 0) : 0;
  const couponDiscountPercent = appliedCoupon?.descontoPercentual || 0;
  const totalDiscountPercent = Math.min(productDiscountPercent + couponDiscountPercent, 100);
  const discountPreview = calculateDiscountedSubtotal(basePrice, totalDiscountPercent);
  const effectivePrice = discountPreview.subtotal;
  const remaining = requiredUnits - totalUnidades;
  const activeTypes = useMemo(
    () => items.filter((item) => item.tipo.trim() && item.quantidade > 0).length,
    [items]
  );

  const selectedMethod = paymentMethods.find((method) => method.id === metodoPagamento);
  const calendarDays = useMemo(() => getCalendarDays(displayMonth), [displayMonth]);
  const timeSlots = useMemo(
    () => getTimeSlots(dataEntregaData, minDeliveryDate, businessStatus.isOpen),
    [dataEntregaData, minDeliveryDate, businessStatus.isOpen]
  );
  const dataEntrega = buildDeliveryDateTime(dataEntregaData, dataEntregaHora);
  const paymentPreview = useMemo(
    () => calculatePaymentAmounts(effectivePrice, percentualPagamento, metodoPagamento),
    [effectivePrice, percentualPagamento, metodoPagamento]
  );

  const canAddType = !isCombo && items.length < maxAllowedTypes;
  const canSubmit =
    clienteNome.trim().length >= 2 &&
    clienteTelefone.trim().length >= 10 &&
    Boolean(dataEntregaData) &&
    Boolean(dataEntregaHora) &&
    totalUnidades === requiredUnits &&
    activeTypes > 0 &&
    activeTypes <= maxAllowedTypes &&
    businessStatus.isOpen &&
    !submitting;

  const selectedDateHasNoSchedule = Boolean(dataEntregaData) && timeSlots.length === 0;

  const selectDeliveryDate = (nextDate: string) => {
    setDataEntregaData(nextDate);
    const nextSlots = getTimeSlots(nextDate, minDeliveryDate, businessStatus.isOpen);
    if (!nextSlots.includes(dataEntregaHora)) {
      setDataEntregaHora(nextSlots[0] || "");
    }
    setCalendarOpen(false);
  };

  const updateItem = (index: number, patch: Partial<ItemState>) => {
    if (isCombo) {
      return;
    }

    setItems((current) =>
      current.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item))
    );
  };

  const addType = () => {
    if (!canAddType) {
      return;
    }

    setItems((current) => [...current, { tipo: "", quantidade: 0 }]);
  };

  const removeType = (index: number) => {
    if (isCombo) {
      return;
    }

    setItems((current) => current.filter((_, itemIndex) => itemIndex !== index));
  };

  const handleApplyCoupon = async () => {
    const codigo = cupomCodigo.trim();

    if (!codigo) {
      toast.error("Informe o cupom.");
      return;
    }

    try {
      setValidatingCoupon(true);
      const response = await fetch("/api/cupons/validar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ codigo, produtoId: produto.id }),
      });

      const data = (await response.json().catch(() => null)) as
        | (AppliedCoupon & { error?: string })
        | null;

      if (!response.ok || !data) {
        throw new Error(data?.error || "Cupom invalido.");
      }

      setAppliedCoupon({
        codigo: data.codigo,
        divulgadorNome: data.divulgadorNome,
        descontoPercentual: Number(data.descontoPercentual),
      });
      setCupomCodigo(data.codigo);
      toast.success("Cupom aplicado.");
    } catch (error) {
      setAppliedCoupon(null);
      toast.error(error instanceof Error ? error.message : "Nao foi possivel aplicar o cupom.");
    } finally {
      setValidatingCoupon(false);
    }
  };

  const handleRemoveCoupon = () => {
    setAppliedCoupon(null);
    setCupomCodigo("");
  };

  const handleSubmit = async () => {
    if (!canSubmit) {
      toast.error("Revise os dados do pedido antes de continuar.");
      return;
    }

    try {
      setSubmitting(true);
      const response = await fetch("/api/pedidos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          produtoId: produto.id,
          productQuantity,
          clienteNome,
          clienteTelefone,
          clienteEmail,
          observacoes,
          dataEntrega,
          percentualPagamento,
          metodoPagamento,
          cupomCodigo: appliedCoupon?.codigo || "",
          itens: items,
        }),
      });

      const data = (await response.json().catch(() => null)) as
        | { error?: string; redirectUrl?: string }
        | null;

      if (!response.ok || !data?.redirectUrl) {
        throw new Error(data?.error || "Nao foi possivel iniciar o pagamento.");
      }

      window.location.assign(data.redirectUrl);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao criar o pedido.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_420px]">
      <section className="space-y-6">
        {!businessStatus.isOpen ? (
          <Card className="overflow-hidden border-yellow-300 bg-[linear-gradient(135deg,#fff9c4,#fff6e5_55%,#fef3c7)] shadow-lg shadow-yellow-200/40">
            <CardContent className="flex gap-4 p-5">
              <AlertTriangle className="mt-1 h-5 w-5 shrink-0 text-amber-700" />
              <div>
                <p className="text-sm font-black uppercase tracking-[0.18em] text-amber-800">
                  Atendimento fora do horario
                </p>
                <p className="mt-2 text-sm leading-6 text-amber-950">
                  {businessStatus.message} Se voce seguir para o site agora, pode encontrar a loja
                  fechada.
                </p>
              </div>
            </CardContent>
          </Card>
        ) : null}

        <Card
          className={cn(
            "overflow-hidden bg-white/95 shadow-lg",
            isValentinesTheme
              ? "border-[#f4b6c5] shadow-rose-200/30"
              : "border-[#d8e8a4] shadow-green-200/30"
          )}
        >
          <div className="grid gap-0 md:grid-cols-[260px_1fr]">
            <div
              className={cn(
                "relative min-h-72",
                isValentinesTheme
                  ? "bg-[linear-gradient(180deg,#881337,#be123c_52%,#f9a8d4)]"
                  : "bg-[linear-gradient(180deg,#1b5e20,#2e7d32_45%,#fdd835)]"
              )}
            >
              <Image
                src={produto.imagemBase64}
                alt={produto.nome}
                fill
                unoptimized
                className="object-cover"
              />
              <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(7,32,12,0.08),rgba(7,32,12,0.22))]" />
              <div
                className={cn(
                  "absolute left-4 top-4 rounded-full px-3 py-1 text-[11px] font-black uppercase tracking-[0.2em] text-white",
                  isValentinesTheme ? "bg-[#5f1029]/85" : "bg-[#0b3d0b]/85"
                )}
              >
                {isValentinesTheme ? "Dia dos Namorados" : "Copa da Vizinha"}
              </div>
            </div>

            <CardContent
              className={cn(
                "space-y-4 p-6",
                isValentinesTheme
                  ? "bg-[radial-gradient(circle_at_top_right,#fbcfe8_0,transparent_28%),linear-gradient(180deg,#ffffff,#fff1f5)]"
                  : "bg-[radial-gradient(circle_at_top_right,#fff59d_0,transparent_28%),linear-gradient(180deg,#ffffff,#f7ffe7)]"
              )}
            >
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={cn(
                      "rounded-full px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] text-white",
                      isValentinesTheme ? "bg-[#be123c]" : "bg-[#0b5d1e]"
                    )}
                  >
                    {PRODUCT_CATEGORY_LABEL[produto.categoria]}
                  </span>
                  {isCombo ? (
                    <span
                      className={cn(
                        "rounded-full px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em]",
                        isValentinesTheme ? "bg-[#ffe4ec] text-[#9f1239]" : "bg-[#fedf00] text-[#175c2b]"
                      )}
                    >
                      {isValentinesTheme ? "Especial para casal" : "Combo fixo"}
                    </span>
                  ) : null}
                </div>
                <h1 className="mt-3 text-3xl font-black tracking-tight text-[#0b2d16]">
                  {produto.nome}
                </h1>
                <p className="mt-3 text-sm leading-6 text-[#35553d]">{produto.descricao}</p>
              </div>

              <div className="grid gap-3 rounded-[1.5rem] bg-[linear-gradient(135deg,#0f5d22,#1c8d39)] p-4 text-sm text-white sm:grid-cols-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#ffef8d]">
                    Valor
                  </p>
                  {discountPreview.discountValue > 0 ? (
                    <div className="mt-2">
                      <p className="text-sm text-white/60 line-through">{formatCurrency(basePrice)}</p>
                      <p className="text-lg font-semibold">{formatCurrency(effectivePrice)}</p>
                    </div>
                  ) : (
                    <p className="mt-2 text-lg font-semibold">{formatCurrency(effectivePrice)}</p>
                  )}
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#ffef8d]">
                    Unidades
                  </p>
                  <p className="mt-2 text-lg font-semibold">{requiredUnits}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#ffef8d]">
                    Tipos
                  </p>
                  <p className="mt-2 text-lg font-semibold">Ate {maxAllowedTypes}</p>
                </div>
              </div>
            </CardContent>
          </div>
        </Card>

        <Card
          className={cn(
            "bg-white/95 shadow-lg",
            isValentinesTheme
              ? "border-[#f4b6c5] shadow-rose-200/30"
              : "border-[#d8e8a4] shadow-green-200/30"
          )}
        >
          <CardContent className="space-y-6 p-6">
            <div>
              <div className="flex items-center gap-2">
                {isValentinesTheme ? (
                  <Heart className="h-5 w-5 text-[#be123c]" />
                ) : (
                  <Trophy className="h-5 w-5 text-[#1b7f31]" />
                )}
                <h2
                  className={cn(
                    "text-2xl font-semibold",
                    isValentinesTheme ? "text-[#5f1029]" : "text-[#0b2d16]"
                  )}
                >
                  {isCombo ? "Composição do combo" : "Monte os salgados"}
                </h2>
              </div>
              <p className="mt-2 text-sm text-[#48654f]">
                {isCombo
                  ? "Esse combo já vem com quantidades fechadas. O cliente vê exatamente o que está levando."
                  : `A soma precisa fechar em ${requiredUnits} unidades e no maximo ${maxAllowedTypes} tipos.`}
              </p>
            </div>

            {isCentoProduct ? (
              <div className="grid gap-2 rounded-[1.5rem] border border-[#dfeab9] bg-[#f7fde3] p-4 sm:max-w-xs">
                <label className="text-sm font-medium text-[#284a2e]">Quantidade de centos</label>
                <Select
                  value={String(productQuantity)}
                  onValueChange={(value) => setProductQuantity(Number(value))}
                >
                  <SelectTrigger className="w-full border-[#d8e8a4] bg-white">
                    <SelectValue placeholder="Escolha a quantidade" />
                  </SelectTrigger>
                  <SelectContent>
                    {[1, 2, 3, 4, 5].map((value) => (
                      <SelectItem key={value} value={String(value)}>
                        {value} cento{value > 1 ? "s" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-sm text-[#48654f]">
                  Cada cento soma mais {produto.totalUnidades} unidades e libera mais {produto.maxTiposSalgado} tipo{produto.maxTiposSalgado > 1 ? "s" : ""}.
                </p>
              </div>
            ) : null}

            <div className="space-y-3">
              {items.map((item, index) => (
                <div
                  key={`${index}-${item.tipo}`}
                  className="grid gap-3 rounded-[1.5rem] border border-[#dfeab9] bg-[linear-gradient(180deg,#fbfff0,#f7fde3)] p-4 sm:grid-cols-[1fr_120px_auto]"
                >
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-[#284a2e]">
                      {isCombo ? `Item do combo ${index + 1}` : `Tipo de salgado ${index + 1}`}
                    </label>
                    {isCombo ? (
                      <Input value={item.tipo} disabled className="border-[#d8e8a4] bg-white" />
                    ) : produto.saboresSugeridos.length > 0 ? (
                      <Select
                        value={item.tipo}
                        onValueChange={(value) => updateItem(index, { tipo: value })}
                      >
                        <SelectTrigger className="w-full border-[#d8e8a4] bg-white">
                          <SelectValue placeholder="Selecione o salgado" />
                        </SelectTrigger>
                        <SelectContent>
                          {produto.saboresSugeridos.map((sabor) => (
                            <SelectItem key={sabor} value={sabor}>
                              {sabor}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Input
                        value={item.tipo}
                        onChange={(event) => updateItem(index, { tipo: event.target.value })}
                        placeholder="Ex: coxinha"
                      />
                    )}
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium text-[#284a2e]">Quantidade</label>
                    <Input
                      type="number"
                      min="0"
                      step="1"
                      disabled={isCombo}
                      value={item.quantidade}
                      onChange={(event) =>
                        updateItem(index, {
                          quantidade: Math.max(0, Number(event.target.value || 0)),
                        })
                      }
                    />
                  </div>

                  <div className="flex items-end">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => removeType(index)}
                      disabled={isCombo || items.length === 1}
                      className="w-full rounded-xl border-[#d8e8a4] text-[#1b5e20] hover:bg-[#eff8d0]"
                    >
                      <Minus className="mr-2 h-4 w-4" />
                      Remover
                    </Button>
                  </div>
                </div>
              ))}

              {!isCombo ? (
                <Button
                  type="button"
                  variant="outline"
                  disabled={!canAddType}
                  onClick={addType}
                  className="rounded-full border-[#d8e8a4] text-[#1b5e20] hover:bg-[#eff8d0]"
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Adicionar tipo
                </Button>
              ) : null}
            </div>
          </CardContent>
        </Card>

        <Card className="border-[#d8e8a4] bg-white/95 shadow-lg shadow-green-200/30">
          <CardContent className="grid gap-4 p-6 md:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium text-[#284a2e]">Nome</label>
              <Input value={clienteNome} onChange={(event) => setClienteNome(event.target.value)} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-[#284a2e]">Telefone / WhatsApp</label>
              <Input
                value={clienteTelefone}
                onChange={(event) => setClienteTelefone(event.target.value)}
                placeholder="(83) 99999-9999"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-[#284a2e]">E-mail</label>
              <Input
                type="email"
                value={clienteEmail}
                onChange={(event) => setClienteEmail(event.target.value)}
                placeholder="voce@email.com"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-[#284a2e]">Entrega</label>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="relative">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setCalendarOpen((current) => !current)}
                    className="h-11 w-full justify-between border-[#d8e8a4] bg-white px-3 text-left text-[#284a2e] hover:bg-[#f7fde3]"
                  >
                    <span className="truncate">{formatDateLabel(dataEntregaData)}</span>
                    <CalendarDays className="h-4 w-4 shrink-0" />
                  </Button>

                  {calendarOpen ? (
                    <div className="absolute left-0 top-[calc(100%+0.5rem)] z-30 w-full min-w-[18rem] rounded-2xl border border-[#d8e8a4] bg-white p-4 shadow-[0_24px_60px_rgba(27,94,32,0.18)]">
                      <div className="mb-4 flex items-center justify-between">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => setDisplayMonth((current) => addMonths(current, -1))}
                          className="h-9 w-9 rounded-full text-[#1b5e20] hover:bg-[#f7fde3]"
                        >
                          <ChevronLeft className="h-4 w-4" />
                        </Button>
                        <p className="text-sm font-semibold capitalize text-[#0b2d16]">
                          {new Intl.DateTimeFormat("pt-BR", {
                            month: "long",
                            year: "numeric",
                          }).format(displayMonth)}
                        </p>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => setDisplayMonth((current) => addMonths(current, 1))}
                          className="h-9 w-9 rounded-full text-[#1b5e20] hover:bg-[#f7fde3]"
                        >
                          <ChevronRight className="h-4 w-4" />
                        </Button>
                      </div>

                      <div className="mb-2 grid grid-cols-7 gap-1 text-center text-xs font-semibold uppercase tracking-[0.12em] text-[#6f8a55]">
                        {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sab"].map((day) => (
                          <span key={day} className="py-1">
                            {day}
                          </span>
                        ))}
                      </div>

                      <div className="grid grid-cols-7 gap-1">
                        {calendarDays.map(({ date, currentMonth }) => {
                          const dateKey = formatDateInputValue(date);
                          const isSelected = dateKey === dataEntregaData;
                          const isDisabled = dateKey < minDeliveryDateKey;

                          return (
                            <button
                              key={`${dateKey}-${currentMonth ? "current" : "other"}`}
                              type="button"
                              disabled={isDisabled}
                              onClick={() => selectDeliveryDate(dateKey)}
                              className={cn(
                                "h-10 rounded-xl text-sm transition",
                                isSelected
                                  ? "bg-[#1b7f31] font-semibold text-white"
                                  : "text-[#284a2e] hover:bg-[#f7fde3]",
                                !currentMonth && !isSelected && "text-[#9aad8a]",
                                isDisabled && "cursor-not-allowed opacity-35 hover:bg-transparent"
                              )}
                            >
                              {date.getDate()}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ) : null}
                </div>
                <Select value={dataEntregaHora} onValueChange={setDataEntregaHora}>
                  <SelectTrigger className="w-full border-[#d8e8a4] bg-white">
                    <SelectValue placeholder="Selecione o horario" />
                  </SelectTrigger>
                  <SelectContent>
                    {timeSlots.map((time) => (
                      <SelectItem key={time} value={time}>
                        {time}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {selectedDateHasNoSchedule ? (
                <p className="text-sm text-amber-700">
                  Nao atendemos nessa data. Escolha de terca a sabado, das 10h as 17h, ou domingo, das 9h as 13h.
                </p>
              ) : (
                <p className="text-sm text-[#48654f]">
                  Escolha a data e depois o horario para evitar confusão no agendamento.
                </p>
              )}
            </div>
            <div className="space-y-2 md:col-span-2">
              <label className="text-sm font-medium text-[#284a2e]">Observacoes</label>
              <Textarea
                value={observacoes}
                onChange={(event) => setObservacoes(event.target.value)}
                className="min-h-24"
                placeholder="Ponto de referencia, recheios preferidos, observacoes gerais..."
              />
            </div>
          </CardContent>
        </Card>
      </section>

      <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
        <Card className="border-[#d8e8a4] bg-white/95 shadow-lg shadow-green-200/30">
          <CardContent className="space-y-5 p-6">
            <div>
              <h2 className="text-2xl font-semibold text-[#0b2d16]">Pagamento</h2>
              <p className="mt-2 text-sm text-[#48654f]">
                Escolha quanto pagar agora e selecione a forma de pagamento.
              </p>
            </div>

            <div className="grid gap-4 rounded-[1.5rem] border border-[#dfeab9] bg-[#f7fde3] p-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-[#284a2e]">Quanto pagar agora</label>
                <Select
                  value={String(percentualPagamento)}
                  onValueChange={(value) => setPercentualPagamento(Number(value) as 50 | 100)}
                >
                  <SelectTrigger className="h-11 w-full border-[#d8e8a4] bg-white">
                    <SelectValue placeholder="Selecione o valor" />
                  </SelectTrigger>
                  <SelectContent>
                    {(produto.permitePagamentoParcial ? PAYMENT_PERCENTAGES : [100]).map(
                      (value) => (
                        <SelectItem key={value} value={String(value)}>
                          Pagar {value}% agora
                        </SelectItem>
                      )
                    )}
                  </SelectContent>
                </Select>
                <p className="text-sm text-[#48654f]">
                  Base do pagamento: {formatCurrency((effectivePrice * percentualPagamento) / 100)}
                </p>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-[#284a2e]">Forma de pagamento</label>
                <Select
                  value={metodoPagamento}
                  onValueChange={(value) => setMetodoPagamento(value as MetodoPagamento)}
                >
                  <SelectTrigger className="h-11 w-full border-[#d8e8a4] bg-white">
                    <SelectValue placeholder="Selecione a forma de pagamento" />
                  </SelectTrigger>
                  <SelectContent>
                    {paymentMethods.map((method) => (
                      <SelectItem key={method.id} value={method.id}>
                        {method.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-sm text-[#48654f]">
                  {selectedMethod?.description || "Escolha a forma de pagamento."}
                </p>
              </div>
            </div>

            <div className="grid gap-3 rounded-[1.5rem] border border-[#dfeab9] bg-white p-4">
              <label className="text-sm font-medium text-[#284a2e]">Cupom de desconto</label>
              <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                <Input
                  value={cupomCodigo}
                  onChange={(event) => {
                    setCupomCodigo(event.target.value.toUpperCase());
                    if (appliedCoupon) {
                      setAppliedCoupon(null);
                    }
                  }}
                  placeholder="Digite seu cupom"
                  className="uppercase"
                />
                <Button
                  type="button"
                  variant="outline"
                  disabled={validatingCoupon}
                  onClick={appliedCoupon ? handleRemoveCoupon : () => void handleApplyCoupon()}
                  className="rounded-xl border-[#d8e8a4] text-[#1b5e20] hover:bg-[#eff8d0]"
                >
                  {validatingCoupon ? (
                    <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
                  ) : null}
                  {appliedCoupon ? "Remover" : "Aplicar"}
                </Button>
              </div>
              {appliedCoupon ? (
                <p className="text-sm font-medium text-emerald-700">
                  {appliedCoupon.codigo}: {appliedCoupon.descontoPercentual}% aplicado.
                </p>
              ) : (
                <p className="text-sm text-[#48654f]">
                  Use o codigo recebido para ganhar desconto no pedido.
                </p>
              )}
            </div>

            <div className="rounded-[1.6rem] bg-[linear-gradient(135deg,#0b3d0b,#127c2e_45%,#f4c600)] p-5 text-white">
              <p className="text-xs font-black uppercase tracking-[0.22em] text-[#fff2a8]">
                Resumo
              </p>
              <div className="mt-4 space-y-2 text-sm text-white/85">
                <div className="flex items-center justify-between gap-3">
                  <span>Produto</span>
                  <span>{formatCurrency(basePrice)}</span>
                </div>
                {discountPreview.discountValue > 0 ? (
                  <div className="flex items-center justify-between gap-3 text-[#fff2a8]">
                    <span>Desconto ({discountPreview.discountPercent}%)</span>
                    <span>-{formatCurrency(discountPreview.discountValue)}</span>
                  </div>
                ) : null}
                <div className="flex items-center justify-between gap-3">
                  <span>Subtotal</span>
                  <span>{formatCurrency(effectivePrice)}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span>Percentual agora</span>
                  <span>{percentualPagamento}%</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span>Taxa de servico</span>
                  <span>{formatCurrency(paymentPreview.feeAmount)}</span>
                </div>
                <div className="flex items-center justify-between gap-3 text-base font-semibold text-white">
                  <span>Total da etapa</span>
                  <span>{formatCurrency(paymentPreview.totalToCharge)}</span>
                </div>
              </div>
            </div>

            <div className="rounded-[1.5rem] border border-[#dfeab9] bg-[#f7fde3] p-4 text-sm text-[#35553d]">
              <p className="font-semibold text-[#0b2d16]">Validacao do pedido</p>
              <p className={cn("mt-2", remaining === 0 ? "text-emerald-700" : "text-amber-700")}>
                {remaining === 0
                  ? "Quantidade fechada corretamente."
                  : `Faltam ${remaining} unidades para completar o produto.`}
              </p>
              <p className="mt-1">
                Tipos ativos: {activeTypes} de {maxAllowedTypes}
              </p>
              <p className="mt-1">
                Atendimento: terça a sabádo, das 10h as 17h. Domingo, das 9h as 13h. Segunda fechado.
              </p>
              {!businessStatus.isOpen ? (
                <p className="mt-1 font-medium text-amber-700">
                  Aviso: o atendimento esta fechado neste momento.
                </p>
              ) : null}
              <p className="mt-1">Tolerancia de {BUSINESS_RULES.toleranceMinutes} minutos.</p>
            </div>

            <Button
              type="button"
              disabled={!canSubmit}
              onClick={handleSubmit}
              className="h-12 rounded-full bg-[#1b7f31] text-white hover:bg-[#156326]"
            >
              {submitting ? (
                <>
                  <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
                  Redirecionando...
                </>
              ) : (
                businessStatus.isOpen ? "Ir para o pagamento" : "Loja fechada"
              )}
            </Button>

            <div className="flex items-start gap-3 rounded-[1.4rem] border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
              <p>
                Voce sera redirecionada para concluir o pagamento com{" "}
                <strong>{selectedMethod?.label || "o metodo selecionado"}</strong>.
              </p>
            </div>
          </CardContent>
        </Card>
      </aside>
    </div>
  );
}
