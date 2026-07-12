"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import { MetodoPagamento } from "@prisma/client";
import { CalendarDays, ChevronLeft, ChevronRight, LoaderCircle, Minus, Plus, ShoppingCart, Trash2, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  CartTransparentPayment,
  type CartCheckoutSession,
} from "@/components/cart-transparent-payment";
import { Dialog, DialogClose, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Drawer, DrawerClose, DrawerContent, DrawerTitle } from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { calculatePaymentAmounts, formatCurrency } from "@/lib/pedidos";
import {
  BUSINESS_RULES,
  getScheduleForWeekday,
  SUPPORTED_PAYMENT_METHODS,
  type BusinessScheduleByWeekday,
} from "@/lib/site-config";
import { cn } from "@/lib/utils";

type CartItem = {
  id: string;
  productId: string;
  name: string;
  slug: string;
  type: string;
  category: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
  image: string;
  totalUnidades: number;
  maxTiposSalgado: number;
  permitePagamentoParcial: boolean;
  saboresSugeridos: string[];
  comboItens: Array<{ nome: string; quantidade: number }>;
  selectedItems: SelectedItem[];
};

type CartData = {
  items: CartItem[];
  itemCount: number;
  totalAmount: number;
};

type CartBusinessStatusData = {
  isOpen: boolean;
  message: string;
  minimumLeadHours: number;
  operationSchedule: BusinessScheduleByWeekday;
};

const EMPTY_CART: CartData = {
  items: [],
  itemCount: 0,
  totalAmount: 0,
};

type SelectedItem = {
  tipo: string;
  quantidade: number;
};

const PAYMENT_PERCENTAGES = [50, 100] as const;

function getSimpleCartError(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : fallback;

  if (/tipos|unidades/i.test(message)) return "Confira os sabores e as quantidades do pedido.";
  if (/remover/i.test(message)) return "Nao foi possivel remover este item. Tente novamente.";
  if (/atualizar/i.test(message)) return "Nao foi possivel salvar a alteracao. Tente novamente.";
  if (/finalizar/i.test(message)) return "Nao foi possivel finalizar o pedido. Tente novamente.";
  return message;
}

function useDesktopCart() {
  const [isDesktop, setIsDesktop] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(min-width: 768px)");
    const update = () => setIsDesktop(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  return isDesktop;
}

let notifyCartChanged: (() => void) | null = null;

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

function formatWhatsAppInput(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 11);

  if (digits.length <= 2) return digits;
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }

  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

function formatDateLabel(value: string) {
  if (!value) return "Selecione a data";

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
    cells.push({ date: new Date(month.getFullYear(), month.getMonth(), -index), currentMonth: false });
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push({ date: new Date(month.getFullYear(), month.getMonth(), day), currentMonth: true });
  }

  while (cells.length % 7 !== 0) {
    const nextDay = cells.length - (startWeekday + daysInMonth) + 1;
    cells.push({ date: new Date(month.getFullYear(), month.getMonth() + 1, nextDay), currentMonth: false });
  }

  return cells;
}

function buildDeliveryDateTime(date: string, time: string) {
  // Horário escolhido na loja em America/Sao_Paulo.
  // Enviar com offset evita o bug de selecionar 10:00 e salvar 07:00 no servidor em UTC.
  return `${date}T${time}:00-03:00`;
}

function getBusinessDateInputValue(value = new Date()) {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(value);
}

function getTimeSlots(
  dateValue: string,
  minDate: Date,
  operationSchedule: BusinessScheduleByWeekday,
) {
  if (!dateValue) return [] as string[];

  const selectedDate = new Date(`${dateValue}T12:00:00`);
  const weekday = selectedDate.getDay();
  const schedule = getScheduleForWeekday(operationSchedule, weekday);

  if (!schedule) return [] as string[];

  const slots: string[] = [];
  const selectedKey = dateValue;
  const minKey = formatDateInputValue(minDate);
  const openMinutes = schedule.openHour * 60;
  const closeMinutes = schedule.closeHour * 60;
  const minMinutes = minDate.getHours() * 60 + Math.ceil(minDate.getMinutes() / BUSINESS_RULES.slotMinutes) * BUSINESS_RULES.slotMinutes;
  const firstMinutes = Math.max(openMinutes, selectedKey === minKey ? minMinutes : openMinutes);

  for (let minutes = firstMinutes; minutes <= closeMinutes; minutes += BUSINESS_RULES.slotMinutes) {
    const hours = Math.floor(minutes / 60);
    const remainder = minutes % 60;
    slots.push(`${String(hours).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`);
  }

  return slots;
}

async function readCart() {
  const response = await fetch("/api/cart", { cache: "no-store" });
  if (!response.ok) {
    throw new Error("Nao foi possivel carregar o carrinho.");
  }

  return (await response.json()) as CartData;
}

export function AddToCartControls({ productId }: { productId: string }) {
  const [quantity, setQuantity] = useState(1);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const addToCart = async () => {
    try {
      setLoading(true);
      setErrorMessage(null);
      const response = await fetch("/api/cart/add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId, quantity }),
      });
      const data = (await response.json().catch(() => null)) as { error?: string } | null;

      if (!response.ok) {
        throw new Error(data?.error || "Nao foi possivel adicionar ao carrinho.");
      }

      toast.success("Produto adicionado ao carrinho.");
      notifyCartChanged?.();
    } catch (error) {
      setErrorMessage(getSimpleCartError(error, "Nao foi possivel adicionar ao carrinho."));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mt-auto flex flex-col gap-3">
      <div className="flex min-h-14 items-center justify-between rounded-full border border-[#b8ca7e] bg-white px-2">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => setQuantity((current) => Math.max(1, current - 1))}
          className="h-11 w-11 rounded-full text-[#14521b]"
          aria-label="Diminuir quantidade"
        >
          <Minus className="h-4 w-4" />
        </Button>
        <span className="min-w-10 text-center text-lg font-black text-[#0b3d18]">{quantity}</span>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => setQuantity((current) => current + 1)}
          className="h-11 w-11 rounded-full text-[#14521b]"
          aria-label="Aumentar quantidade"
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      <Button
        type="button"
        disabled={loading}
        onClick={() => void addToCart()}
        className="min-h-12 rounded-full bg-[#176c2a] text-base font-bold text-white hover:bg-[#125621]"
      >
        {loading ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : <ShoppingCart className="mr-2 h-4 w-4" />}
        Adicionar
      </Button>
      {errorMessage ? (
        <p role="alert" className="text-sm font-semibold text-red-700">{errorMessage}</p>
      ) : null}
    </div>
  );
}

export function FloatingCart({
  businessStatus,
}: {
  businessStatus: CartBusinessStatusData;
}) {
  const [cart, setCart] = useState<CartData>(EMPTY_CART);
  const [open, setOpen] = useState(false);
  const isDesktop = useDesktopCart();
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [checkingOut, setCheckingOut] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [itemError, setItemError] = useState<{ id: string; message: string } | null>(null);
  const [checkoutSession, setCheckoutSession] = useState<CartCheckoutSession | null>(null);
  const [checkoutPaid, setCheckoutPaid] = useState(false);
  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [paymentPercentage, setPaymentPercentage] = useState<50 | 100>(50);
  const [paymentMethod, setPaymentMethod] = useState<MetodoPagamento>(MetodoPagamento.PIX);
  const minDeliveryDate = useMemo(
    () => getMinDeliveryDate(businessStatus.minimumLeadHours),
    [businessStatus.minimumLeadHours]
  );
  const minDeliveryDateKey = useMemo(() => formatDateInputValue(minDeliveryDate), [minDeliveryDate]);
  const [deliveryDate, setDeliveryDate] = useState(formatDateInputValue(minDeliveryDate));
  const [deliveryTime, setDeliveryTime] = useState(formatTimeInputValue(minDeliveryDate));
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [displayMonth, setDisplayMonth] = useState(() => startOfMonth(minDeliveryDate));
  const selectedItemsSavePromises = useRef(new Set<Promise<void>>());

  const loadCart = async () => {
    try {
      setCart(await readCart());
    } catch {
      setCart(EMPTY_CART);
    }
  };

  useEffect(() => {
    notifyCartChanged = loadCart;
    void loadCart();

    return () => {
      notifyCartChanged = null;
    };
  }, []);

  const updateCart = (next: CartData) => {
    setCart(next);
  };

  const setItemQuantity = async (item: CartItem, quantity: number) => {
    try {
      setItemError(null);
      const nextQuantity = Math.max(1, quantity);
      const selectedItems =
        item.category === "COMBO" && item.comboItens.length > 0
          ? item.comboItens.map((comboItem) => ({
              tipo: comboItem.nome,
              quantidade: comboItem.quantidade * nextQuantity,
            }))
          : item.selectedItems;
      setLoadingId(item.id);
      const response = await fetch(`/api/cart/item/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quantity: nextQuantity, selectedItems }),
      });

      if (!response.ok) throw new Error("Nao foi possivel atualizar.");
      updateCart((await response.json()) as CartData);
    } catch (error) {
      setItemError({ id: item.id, message: getSimpleCartError(error, "Nao foi possivel alterar a quantidade.") });
    } finally {
      setLoadingId(null);
    }
  };

  const removeItem = async (item: CartItem) => {
    try {
      setItemError(null);
      setLoadingId(item.id);
      const response = await fetch(`/api/cart/item/${item.id}`, { method: "DELETE" });

      if (!response.ok) throw new Error("Nao foi possivel remover.");
      updateCart((await response.json()) as CartData);
    } catch (error) {
      setItemError({ id: item.id, message: getSimpleCartError(error, "Nao foi possivel remover este item.") });
    } finally {
      setLoadingId(null);
    }
  };

  const clearCart = async () => {
    const response = await fetch("/api/cart", { method: "DELETE" });
    if (response.ok) {
      updateCart((await response.json()) as CartData);
    }
  };

  const calendarDays = useMemo(() => getCalendarDays(displayMonth), [displayMonth]);
  const timeSlots = useMemo(
    () => getTimeSlots(deliveryDate, minDeliveryDate, businessStatus.operationSchedule),
    [businessStatus.operationSchedule, deliveryDate, minDeliveryDate]
  );
  const deliveryTimeIsValid = timeSlots.includes(deliveryTime);
  const scheduledAt = buildDeliveryDateTime(deliveryDate, deliveryTime);
  const selectedDateHasNoSchedule = Boolean(deliveryDate) && timeSlots.length === 0;
  const storeClosedBlocksSelectedDate = !businessStatus.isOpen && deliveryDate === getBusinessDateInputValue();
  const selectDeliveryDate = (nextDate: string) => {
    setDeliveryDate(nextDate);
    setActionError(null);
    const nextSlots = getTimeSlots(nextDate, minDeliveryDate, businessStatus.operationSchedule);
    if (!nextSlots.includes(deliveryTime)) setDeliveryTime(nextSlots[0] || "");
    setCalendarOpen(false);
  };
  const canCheckout = useMemo(
    () =>
      cart.items.length > 0 &&
      !checkingOut &&
      customerName.trim().length >= 2 &&
      /^\S+@\S+\.\S+$/.test(customerEmail.trim()) &&
      customerPhone.replace(/\D/g, "").length >= 10 &&
      Boolean(deliveryDate) &&
      deliveryTimeIsValid &&
      !storeClosedBlocksSelectedDate,
    [cart.items.length, checkingOut, customerEmail, customerName, customerPhone, deliveryDate, deliveryTimeIsValid, storeClosedBlocksSelectedDate]
  );
  const allowsPartialPayment = useMemo(
    () => cart.items.length > 0 && cart.items.every((item) => item.permitePagamentoParcial),
    [cart.items]
  );
  const paymentPreview = useMemo(
    () => calculatePaymentAmounts(cart.totalAmount, paymentPercentage, paymentMethod),
    [cart.totalAmount, paymentPercentage, paymentMethod]
  );
  const selectedPaymentMethod = SUPPORTED_PAYMENT_METHODS.find((method) => method.id === paymentMethod);
  const cartValidation = useMemo(() => {
    for (const item of cart.items) {
      const totalRequired = item.totalUnidades * item.quantity;
      const maxTypes = item.maxTiposSalgado * item.quantity;
      const selected = item.selectedItems.filter((entry) => entry.tipo.trim() && entry.quantidade > 0);
      const totalSelected = selected.reduce((sum, entry) => sum + entry.quantidade, 0);

      if (totalSelected !== totalRequired) {
        return `${item.name}: selecione exatamente ${totalRequired} unidades nos tipos.`;
      }

      if (selected.length > maxTypes) {
        return `${item.name}: escolha no maximo ${maxTypes} tipos.`;
      }

      if (item.category === "COMBO" && item.comboItens.length > 0) {
        for (const comboItem of item.comboItens) {
          const selectedItem = selected.find(
            (entry) => entry.tipo.trim().toLowerCase() === comboItem.nome.trim().toLowerCase()
          );
          const requiredQuantity = comboItem.quantidade * item.quantity;

          if (!selectedItem || selectedItem.quantidade !== requiredQuantity) {
            return `${item.name}: esse combo possui composicao fixa.`;
          }
        }
      }
    }

    return null;
  }, [cart.items]);
  const checkoutGuidance = cartValidation
    ? getSimpleCartError(new Error(cartValidation), cartValidation)
    : customerName.trim().length < 2
      ? "Informe o nome para finalizar o pedido."
      : !/^\S+@\S+\.\S+$/.test(customerEmail.trim())
        ? "Informe um e-mail valido para o pagamento."
      : customerPhone.replace(/\D/g, "").length < 10
        ? "Informe um WhatsApp valido para finalizar o pedido."
        : !deliveryDate || !deliveryTimeIsValid
          ? "Informe uma data e horario validos."
          : storeClosedBlocksSelectedDate
            ? "Escolha uma data futura para continuar."
            : null;

  useEffect(() => {
    if (!allowsPartialPayment && paymentPercentage === 50) {
      setPaymentPercentage(100);
    }
  }, [allowsPartialPayment, paymentPercentage]);

  const checkout = async () => {
    if (cartValidation) {
      setActionError(cartValidation);
      return;
    }

    try {
      setCheckingOut(true);
      setActionError(null);
      await Promise.allSettled(Array.from(selectedItemsSavePromises.current));
      const response = await fetch("/api/checkout/cart", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerName,
          customerEmail,
          customerPhone,
          paymentPercentage,
          paymentMethod,
          scheduledAt,
        }),
      });
      const data = (await response.json().catch(() => null)) as
        | ({ error?: string } & Partial<CartCheckoutSession>)
        | null;

      if (
        !response.ok ||
        !data?.orderId ||
        !data.externalReference ||
        !data.paymentMethod ||
        typeof data.chargedAmount !== "number"
      ) {
        throw new Error(data?.error || "Nao foi possivel finalizar.");
      }

      setCheckoutSession({
        orderId: data.orderId,
        externalReference: data.externalReference,
        paymentMethod: data.paymentMethod,
        chargedAmount: data.chargedAmount,
      });
      setCheckingOut(false);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Erro ao finalizar carrinho.");
      setCheckingOut(false);
    }
  };

  const updateSelectedItems = (item: CartItem, selectedItems: SelectedItem[]) => {
    const normalizedSelectedItems = selectedItems.map((entry) => ({
      tipo: entry.tipo,
      quantidade: Math.max(0, Math.floor(Number(entry.quantidade || 0))),
    }));

    setCart((current) => ({
      ...current,
      items: current.items.map((cartItem) =>
        cartItem.id === item.id
          ? { ...cartItem, selectedItems: normalizedSelectedItems }
          : cartItem
      ),
    }));

    const savePromise = fetch(`/api/cart/item/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ quantity: item.quantity, selectedItems: normalizedSelectedItems }),
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Nao foi possivel atualizar os tipos.");
      })
      .catch((error) => {
        setItemError({ id: item.id, message: getSimpleCartError(error, "Nao foi possivel salvar os sabores.") });
        void loadCart();
      })
      .finally(() => {
        selectedItemsSavePromises.current.delete(savePromise);
      });

    selectedItemsSavePromises.current.add(savePromise);
  };

  const patchSelectedItem = (item: CartItem, index: number, patch: Partial<SelectedItem>) => {
    const current = item.selectedItems.length > 0 ? item.selectedItems : [{ tipo: "", quantidade: 0 }];
    const next = current.map((entry, entryIndex) =>
      entryIndex === index ? { ...entry, ...patch } : entry
    );

    updateSelectedItems(item, next);
  };

  const removeSelectedItem = (item: CartItem, index: number) => {
    const next = item.selectedItems.filter((_, entryIndex) => entryIndex !== index);
    updateSelectedItems(item, next.length > 0 ? next : [{ tipo: "", quantidade: 0 }]);
  };

  const CartRoot = isDesktop ? Dialog : Drawer;
  const CartContent = isDesktop ? DialogContent : DrawerContent;
  const selectedSchedule = deliveryDate
    ? getScheduleForWeekday(
        businessStatus.operationSchedule,
        new Date(`${deliveryDate}T12:00:00`).getDay()
      )
    : null;
  const selectedWeekday = deliveryDate
    ? new Intl.DateTimeFormat("pt-BR", { weekday: "long" }).format(
        new Date(`${deliveryDate}T12:00:00`)
      )
    : "dia escolhido";

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-5 right-5 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-[#0b3d18] text-white shadow-[0_18px_50px_rgba(11,61,24,0.35)] transition hover:bg-[#156326]"
        aria-label="Abrir carrinho"
      >
        <ShoppingCart className="h-6 w-6" />
        {cart.itemCount > 0 ? (
          <span className="absolute -right-1 -top-1 flex h-6 min-w-6 items-center justify-center rounded-full bg-[#f4d330] px-1 text-xs font-black text-[#0b3d18]">
            {cart.itemCount}
          </span>
        ) : null}
      </button>

      <CartRoot
        open={open}
        onOpenChange={(nextOpen) => {
          setOpen(nextOpen);
          if (!nextOpen && checkoutPaid) {
            setCheckoutSession(null);
            setCheckoutPaid(false);
          }
        }}
      >
        <CartContent
          className={cn(
            "grid grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden bg-white p-0",
            isDesktop
              ? "h-[86vh] w-[min(94vw,72rem)] max-w-6xl rounded-2xl [&>[data-slot=dialog-close]]:hidden"
              : "h-[calc(100dvh-0.75rem)] max-h-none rounded-t-3xl border-x-0 border-b-0 [&>[data-slot=drawer-header]]:pt-2"
          )}
        >
          <DialogHeader className={cn(
            "flex-row items-center justify-between border-b border-[#d7e3b4] bg-white px-4 py-3 text-left sm:px-6",
            !isDesktop && "pt-6"
          )}>
            <div>
              {isDesktop ? (
                <DialogTitle className="text-xl font-black text-[#0b3d18] sm:text-2xl">Seu carrinho</DialogTitle>
              ) : (
                <DrawerTitle className="text-xl font-black text-[#0b3d18]">Seu carrinho</DrawerTitle>
              )}
              <p className="mt-1 text-sm font-medium text-[#3f5f45]">
                {cart.itemCount} {cart.itemCount === 1 ? "item" : "itens"}
              </p>
            </div>
            {isDesktop ? <DialogClose asChild>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-11 w-11 shrink-0 rounded-full border-[#9fb66a] text-[#174d22]"
                aria-label="Fechar carrinho"
              >
                <X className="h-5 w-5" />
              </Button>
            </DialogClose> : <DrawerClose asChild>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-11 w-11 shrink-0 rounded-full border-[#9fb66a] text-[#174d22]"
                aria-label="Fechar carrinho"
              >
                <X className="h-5 w-5" />
              </Button>
            </DrawerClose>}
          </DialogHeader>

          <div className="min-h-0 overflow-y-auto overscroll-contain bg-[#f8fbeF] px-4 py-5 sm:px-6">
          {checkoutSession ? (
            <CartTransparentPayment
              session={checkoutSession}
              customerEmail={customerEmail}
              onPaid={() => {
                setCheckoutPaid(true);
                void loadCart();
              }}
            />
          ) : cart.items.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-[#aabd73] bg-white p-8 text-center text-base font-medium text-[#405348]">
              Seu carrinho esta vazio.
            </div>
          ) : (
            <div className="space-y-4">
              {cart.items.map((item) => (
                <div
                  key={item.id}
                  className="grid gap-4 rounded-2xl border border-[#cad99b] bg-[#fbfff0] p-4 sm:grid-cols-[72px_1fr_auto]"
                >
                  <div className="relative h-20 overflow-hidden rounded-xl bg-white sm:h-16">
                    <Image src={item.image} alt={item.name} fill unoptimized className="object-cover" />
                  </div>
                  <div>
                    <p className="text-lg font-black leading-snug text-[#0b3d18]">{item.name}</p>
                    <p className="text-base text-[#46594c]">{item.type}</p>
                    <p className="mt-1 text-lg font-bold text-[#14521b]">
                      {formatCurrency(item.subtotal)}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 sm:justify-end">
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      disabled={loadingId === item.id}
                      onClick={() => void setItemQuantity(item, item.quantity - 1)}
                      className="h-11 w-11 rounded-full border-[#9fb66a]"
                      aria-label={`Diminuir quantidade de ${item.name}`}
                    >
                      <Minus className="h-4 w-4" />
                    </Button>
                    <span className="w-8 text-center text-lg font-black text-[#17251a]">{item.quantity}</span>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      disabled={loadingId === item.id}
                      onClick={() => void setItemQuantity(item, item.quantity + 1)}
                      className="h-11 w-11 rounded-full border-[#9fb66a]"
                      aria-label={`Aumentar quantidade de ${item.name}`}
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      disabled={loadingId === item.id}
                      onClick={() => void removeItem(item)}
                      className="ml-auto h-11 w-11 rounded-full border-red-300 text-red-700 hover:bg-red-50 sm:ml-0"
                      aria-label={`Remover ${item.name} do carrinho`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  {itemError?.id === item.id ? (
                    <p role="alert" className="text-sm font-semibold text-red-700 sm:col-span-3">
                      {itemError.message}
                    </p>
                  ) : null}
                  <div className="space-y-3 sm:col-span-3">
                    <div className="flex flex-col gap-3 rounded-[1.5rem] border border-[#dfeab9] bg-white p-3 sm:p-4">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-base font-bold text-[#0b3d18]">Sabores do pedido</p>
                        <p className="text-sm font-semibold text-[#405348]">
                          {item.selectedItems.reduce((sum, entry) => sum + Number(entry.quantidade || 0), 0)}
                          /{item.totalUnidades * item.quantity} un
                        </p>
                      </div>

                      <div className="space-y-2">
                        {(item.selectedItems.length > 0 ? item.selectedItems : [{ tipo: "", quantidade: 0 }]).map(
                          (entry, index) => (
                            <div
                              key={`${item.id}-${index}`}
                              className="grid gap-3 rounded-[1.25rem] border border-[#edf3d7] bg-[linear-gradient(180deg,#fbfff0,#f7fde3)] p-3 sm:grid-cols-[1fr_112px_auto]"
                            >
                              <div className="space-y-2">
                                <label className="text-sm font-medium text-[#284a2e]">
                                  {item.category === "COMBO"
                                    ? `Item do combo ${index + 1}`
                                    : `Tipo de salgado ${index + 1}`}
                                </label>
                                {item.category === "COMBO" ? (
                                  <Input
                                    value={entry.tipo}
                                    disabled
                                    className="h-11 border-[#d8e8a4] bg-white"
                                  />
                                ) : item.saboresSugeridos.length > 0 ? (
                                  <Select
                                    value={entry.tipo}
                                    onValueChange={(value) => patchSelectedItem(item, index, { tipo: value })}
                                  >
                                    <SelectTrigger className="h-11 w-full border-[#d8e8a4] bg-white">
                                      <SelectValue placeholder="Selecione o salgado" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {item.saboresSugeridos.map((sabor) => (
                                        <SelectItem key={sabor} value={sabor}>
                                          {sabor}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                ) : (
                                  <Input
                                    value={entry.tipo}
                                    onChange={(event) =>
                                      patchSelectedItem(item, index, { tipo: event.target.value })
                                    }
                                    placeholder="Ex: coxinha"
                                    className="h-11 border-[#d8e8a4] bg-white"
                                  />
                                )}
                              </div>

                              <div className="space-y-2">
                                <label className="text-sm font-medium text-[#284a2e]">Quantidade</label>
                                <Input
                                  type="number"
                                  min="0"
                                  step="1"
                                  disabled={item.category === "COMBO"}
                                  value={entry.quantidade}
                                  onChange={(event) =>
                                    patchSelectedItem(item, index, {
                                      quantidade: Math.max(
                                        0,
                                        Math.floor(Number(event.target.value || 0))
                                      ),
                                    })
                                  }
                                  className="h-11 border-[#d8e8a4] bg-white"
                                />
                              </div>

                              <div className="flex items-end">
                                <Button
                                  type="button"
                                  variant="outline"
                                  disabled={item.category === "COMBO" || item.selectedItems.length <= 1}
                                  onClick={() => removeSelectedItem(item, index)}
                                  className="h-11 w-full rounded-xl border-[#d8e8a4] text-[#1b5e20] hover:bg-[#eff8d0] sm:w-auto"
                                >
                                  <Minus className="mr-2 h-4 w-4" />
                                  Remover
                                </Button>
                              </div>
                            </div>
                          )
                        )}
                      </div>

                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <p className="text-sm text-[#405348]">
                          Maximo de {item.maxTiposSalgado * item.quantity} tipos para este item.
                        </p>
                        <Button
                          type="button"
                          variant="outline"
                          disabled={
                            item.category === "COMBO" ||
                            item.selectedItems.length >= item.maxTiposSalgado * item.quantity
                          }
                          onClick={() =>
                            updateSelectedItems(item, [
                              ...item.selectedItems,
                              { tipo: "", quantidade: 0 },
                            ])
                          }
                          className="min-h-11 rounded-xl border-[#9fb66a] text-base font-semibold text-[#14521b]"
                        >
                          <Plus className="mr-2 h-4 w-4" />
                          Tipo
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}

              <div className="pt-2">
                <p className="text-xs font-black uppercase tracking-[0.16em] text-[#52705a]">Finalizacao</p>
                <h2 className="mt-1 text-xl font-black text-[#0b3d18]">Complete os 3 passos</h2>
                <p className="mt-1 text-sm text-[#405348]">Preencha de cima para baixo. Leva menos de um minuto.</p>
              </div>

              <section className="rounded-2xl border border-[#b8ca7e] bg-white p-4" aria-labelledby="cart-step-customer">
                <div className="mb-4 flex items-center gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#176c2a] text-base font-black text-white">1</span>
                  <div>
                    <h3 id="cart-step-customer" className="text-lg font-black text-[#0b3d18]">Seus dados</h3>
                    <p className="text-sm text-[#405348]">Usaremos o WhatsApp para confirmar o pedido.</p>
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <label htmlFor="cart-customer-name" className="text-base font-bold text-[#0b3d18]">Seu nome</label>
                  <Input id="cart-customer-name" value={customerName} onChange={(event) => { setCustomerName(event.target.value); setActionError(null); }} placeholder="Digite seu nome" required className="h-12 text-base" aria-invalid={customerName.length > 0 && customerName.trim().length < 2} />
                  {customerName.length > 0 && customerName.trim().length < 2 ? (
                    <p role="alert" className="text-sm font-semibold text-red-700">Informe o nome para finalizar o pedido.</p>
                  ) : null}
                </div>
                <div className="space-y-2">
                  <label htmlFor="cart-customer-phone" className="text-base font-bold text-[#0b3d18]">Seu WhatsApp</label>
                  <Input id="cart-customer-phone" type="tel" inputMode="tel" value={customerPhone} onChange={(event) => { setCustomerPhone(formatWhatsAppInput(event.target.value)); setActionError(null); }} placeholder="(00) 00000-0000" required className="h-12 text-base" aria-invalid={customerPhone.length > 0 && customerPhone.replace(/\D/g, "").length < 10} />
                  {customerPhone.length > 0 && customerPhone.replace(/\D/g, "").length < 10 ? (
                    <p role="alert" className="text-sm font-semibold text-red-700">Informe um WhatsApp valido para finalizar o pedido.</p>
                  ) : null}
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <label htmlFor="cart-customer-email" className="text-base font-bold text-[#0b3d18]">Seu e-mail</label>
                  <Input id="cart-customer-email" type="email" inputMode="email" autoComplete="email" value={customerEmail} onChange={(event) => { setCustomerEmail(event.target.value); setActionError(null); }} placeholder="voce@exemplo.com" required className="h-12 text-base" aria-invalid={customerEmail.length > 0 && !/^\S+@\S+\.\S+$/.test(customerEmail.trim())} />
                  {/* <p className="text-sm text-[#405348]">O Mercado Pago usa o e-mail para processar Pix e cartao.</p> */}
                  {customerEmail.length > 0 && !/^\S+@\S+\.\S+$/.test(customerEmail.trim()) ? (
                    <p role="alert" className="text-sm font-semibold text-red-700">Informe um e-mail valido para o pagamento.</p>
                  ) : null}
                </div>
                </div>
              </section>

              <section className="rounded-2xl border border-[#b8ca7e] bg-[#fbfff0] p-4" aria-labelledby="cart-step-schedule">
                <div className="mb-3 flex items-center gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#176c2a] text-base font-black text-white">2</span>
                  <div>
                    <h3 id="cart-step-schedule" className="text-lg font-black text-[#0b3d18]">Data e horario</h3>
                    <p className="text-sm text-[#405348]">Escolha quando deseja  retirar.</p>
                  </div>
                </div>
                <div className="mb-4 rounded-xl border border-[#c6d590] bg-white p-3 text-sm text-[#284a2e]">
                  <p><strong>Antecedencia minima:</strong> {businessStatus.minimumLeadHours} {businessStatus.minimumLeadHours === 1 ? "hora" : "horas"}.</p>
                  <p className="mt-1 capitalize">
                    <strong>Funcionamento em {selectedWeekday}:</strong>{" "}
                    {selectedSchedule ? `das ${selectedSchedule.openHour}h as ${selectedSchedule.closeHour}h` : "fechado"}.
                  </p>
                </div>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <div className="relative">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setCalendarOpen((current) => !current)}
                      className="h-11 w-full justify-between border-[#d6e7a2] bg-white px-3 text-left text-[#284a2e] hover:bg-[#f7fde3]"
                    >
                      <span className="truncate">{formatDateLabel(deliveryDate)}</span>
                      <CalendarDays className="h-4 w-4 shrink-0" />
                    </Button>

                    {calendarOpen ? (
                      <div className="absolute left-0 top-[calc(100%+0.5rem)] z-30 w-full min-w-[18rem] rounded-2xl border border-[#d8e8a4] bg-white p-4 shadow-[0_24px_60px_rgba(27,94,32,0.18)]">
                        <div className="mb-4 flex items-center justify-between">
                          <Button type="button" variant="ghost" size="icon" onClick={() => setDisplayMonth((current) => addMonths(current, -1))} className="h-11 w-11 rounded-full text-[#14521b] hover:bg-[#f7fde3]">
                            <ChevronLeft className="h-4 w-4" />
                          </Button>
                          <p className="text-sm font-semibold capitalize text-[#0b2d16]">
                            {new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(displayMonth)}
                          </p>
                          <Button type="button" variant="ghost" size="icon" onClick={() => setDisplayMonth((current) => addMonths(current, 1))} className="h-11 w-11 rounded-full text-[#14521b] hover:bg-[#f7fde3]">
                            <ChevronRight className="h-4 w-4" />
                          </Button>
                        </div>

                        <div className="mb-2 grid grid-cols-7 gap-1 text-center text-xs font-semibold uppercase tracking-[0.12em] text-[#6f8a55]">
                          {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sab"].map((day) => (<span key={day} className="py-1">{day}</span>))}
                        </div>

                        <div className="grid grid-cols-7 gap-1">
                          {calendarDays.map(({ date, currentMonth }) => {
                            const dateKey = formatDateInputValue(date);
                            const isSelected = dateKey === deliveryDate;
                            const isDisabled = dateKey < minDeliveryDateKey;

                            return (
                              <button
                                key={`${dateKey}-${currentMonth ? "current" : "other"}`}
                                type="button"
                                disabled={isDisabled}
                                onClick={() => selectDeliveryDate(dateKey)}
                                className={cn(
                                  "h-11 rounded-xl text-sm transition",
                                  isSelected ? "bg-[#1b7f31] font-semibold text-white" : "text-[#284a2e] hover:bg-[#f7fde3]",
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

                  <Select value={deliveryTime} onValueChange={(value) => { setDeliveryTime(value); setActionError(null); }}>
                    <SelectTrigger className="h-11 w-full border-[#d6e7a2] bg-white">
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
                  <p role="alert" className="mt-2 text-sm font-semibold text-red-700">Nao atendemos nessa data. Escolha um dia com horario ativo na operacao.</p>
                ) : storeClosedBlocksSelectedDate ? (
                  <p role="alert" className="mt-2 text-sm font-semibold text-red-700">A loja esta fechada para pedidos de hoje. Escolha uma data futura para continuar.</p>
                ) : !deliveryTimeIsValid ? (
                  <p role="alert" className="mt-2 text-sm font-semibold text-red-700">Informe uma data e horario validos.</p>
                ) : (
                  <p className="mt-2 text-sm text-[#48654f]">Esse horario é para a Retirada do seu pedido.</p>
                )}
              </section>

              <section className="rounded-2xl border border-[#b8ca7e] bg-white p-4" aria-labelledby="cart-step-payment">
                <div className="mb-4 flex items-center gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#176c2a] text-base font-black text-white">3</span>
                  <div>
                    <h3 id="cart-step-payment" className="text-lg font-black text-[#0b3d18]">Pagamento</h3>
                    <p className="text-sm text-[#405348]">Confira quanto pagar agora e escolha a forma.</p>
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-base font-bold text-[#0b3d18]">Quanto pagar agora</label>
                  <Select
                    value={String(paymentPercentage)}
                    onValueChange={(value) => setPaymentPercentage(Number(value) as 50 | 100)}
                  >
                    <SelectTrigger className="h-11 w-full border-[#d6e7a2] bg-white">
                      <SelectValue placeholder="Percentual" />
                    </SelectTrigger>
                    <SelectContent>
                      {(allowsPartialPayment ? PAYMENT_PERCENTAGES : [100]).map((value) => (
                        <SelectItem key={value} value={String(value)}>
                          Pagar {value}% agora
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-sm text-[#405348]">
                    Base: {formatCurrency(paymentPreview.baseAmount)}
                  </p>
                </div>

                <div className="space-y-2">
                  <label className="text-base font-bold text-[#0b3d18]">Forma de pagamento</label>
                  <Select
                    value={paymentMethod}
                    onValueChange={(value) => setPaymentMethod(value as MetodoPagamento)}
                  >
                    <SelectTrigger className="h-11 w-full border-[#d6e7a2] bg-white">
                      <SelectValue placeholder="Metodo" />
                    </SelectTrigger>
                    <SelectContent>
                      {SUPPORTED_PAYMENT_METHODS.filter((method) =>
                        method.id === MetodoPagamento.PIX ||
                        method.id === MetodoPagamento.CARTAO_CREDITO ||
                        method.id === MetodoPagamento.CARTAO_DEBITO
                      ).map((method) => (
                        <SelectItem key={method.id} value={method.id}>
                          {method.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-sm text-[#405348]">
                    {selectedPaymentMethod?.description || "Escolha a forma de pagamento."}
                  </p>
                </div>
                </div>
              </section>

            </div>
          )}
          </div>

          {cart.items.length > 0 && !checkoutSession ? (
            <div className="border-t border-[#c9d99a] bg-white px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 shadow-[0_-8px_24px_rgba(11,61,24,0.10)] sm:px-6">
              {(actionError || checkoutGuidance) ? (
                <p role="alert" className="mb-2 text-sm font-bold text-red-700">
                  {actionError || checkoutGuidance}
                </p>
              ) : null}
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-[#405348]">Total do pedido</p>
                  <p className="text-2xl font-black leading-tight text-[#0b3d18]">{formatCurrency(cart.totalAmount)}</p>
                  <p className="text-sm text-[#405348]">Agora: {formatCurrency(paymentPreview.totalToCharge)}</p>
                </div>
                <Button
                  type="button"
                  disabled={checkingOut || !canCheckout || Boolean(cartValidation)}
                  onClick={() => void checkout()}
                  className="min-h-12 flex-1 rounded-full bg-[#176c2a] px-5 text-base font-black text-white hover:bg-[#125621] sm:flex-none"
                >
                  {checkingOut ? <LoaderCircle className="mr-2 h-5 w-5 animate-spin" /> : null}
                  {checkingOut ? "Enviando pedido..." : "Finalizar pedido"}
                </Button>
              </div>
              <Button
                type="button"
                variant="ghost"
                onClick={() => void clearCart()}
                className="mt-2 min-h-11 w-full text-base font-semibold text-[#14521b]"
              >
                Limpar carrinho
              </Button>
            </div>
          ) : null}
        </CartContent>
      </CartRoot>
    </>
  );
}
