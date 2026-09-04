"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
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
import type { StoreSiteTheme } from "@/lib/site-theme";
import { getDeliveryFee, type FulfillmentType } from "@/lib/delivery";
import type { CartAudience } from "@/lib/cart";
import { validateCartItemQuantities } from "@/lib/cart-quantity";

type CartItem = {
  id: string;
  productId: string;
  name: string;
  slug: string;
  type: string;
  category: string;
  quantity: number;
  requestedUnits: number;
  usesMinimumQuantity: boolean;
  minimumQuantity: number;
  minimumLeadHours: number | null;
  unitPrice: number;
  subtotal: number;
  image: string;
  totalUnidades: number;
  maxTiposSalgado: number;
  permitePagamentoParcial: boolean;
  saboresSugeridos: string[];
  comboItens: Array<{ nome: string; quantidade: number }>;
  selectedItems: SelectedItem[];
  precisaSelecaoDeTipos: boolean;
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

type GoogleAddressComponent = { long_name: string; types: string[] };
type GooglePlace = {
  place_id?: string;
  formatted_address?: string;
  address_components?: GoogleAddressComponent[];
  geometry?: { location?: { lat(): number; lng(): number } };
};
type GoogleMapsApi = {
  maps: {
    LatLngBounds: new (southWest: { lat: number; lng: number }, northEast: { lat: number; lng: number }) => unknown;
    places: { Autocomplete: new (input: HTMLInputElement, options: object) => { setBounds(bounds: unknown): void; addListener(event: string, callback: () => void): void; getPlace(): GooglePlace } };
  };
};

const PAYMENT_PERCENTAGES = [50, 100] as const;
let googleMapsLoadPromise: Promise<void> | null = null;

function preloadGoogleMaps() {
  if (typeof window === "undefined") return Promise.resolve();
  if ((window as unknown as { google?: GoogleMapsApi }).google?.maps?.places) return Promise.resolve();
  if (googleMapsLoadPromise) return googleMapsLoadPromise;

  googleMapsLoadPromise = new Promise((resolve, reject) => {
    let attempts = 0;
    const waitForPlaces = () => {
      if ((window as unknown as { google?: GoogleMapsApi }).google?.maps?.places) return resolve();
      attempts += 1;
      if (attempts >= 100) return reject(new Error("Google Places não carregou."));
      window.setTimeout(waitForPlaces, 75);
    };
    const existing = document.querySelector<HTMLScriptElement>('script[data-vizinha-google-maps]');
    if (!existing) {
      const script = document.createElement("script");
      script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "")}&libraries=places&language=pt-BR&region=BR`;
      script.async = true;
      script.dataset.vizinhaGoogleMaps = "true";
      script.onerror = () => reject(new Error("Falha ao carregar o Google Maps."));
      document.head.appendChild(script);
    }
    waitForPlaces();
  });
  return googleMapsLoadPromise;
}

function getSimpleCartError(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : fallback;

  if (/tipos|unidades/i.test(message)) return "Confira os sabores e as quantidades do pedido.";
  if (/remover/i.test(message)) return "Não foi possível remover este item. Tente novamente.";
  if (/atualizar/i.test(message)) return "Não foi possível salvar a alteração. Tente novamente.";
  if (/finalizar/i.test(message)) return "Não foi possível finalizar o pedido. Tente novamente.";
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

async function readCart(audience: CartAudience = "VIZINHA") {
  const response = await fetch(`/api/cart?audience=${audience}`, { cache: "no-store" });
  if (!response.ok) {
    throw new Error("Não foi possível carregar o carrinho.");
  }

  return (await response.json()) as CartData;
}

function getCartThemeStyle(siteTheme: StoreSiteTheme) {
  const isDefaultTheme = siteTheme === "PADRAO";

  return {
    "--cart-accent": isDefaultTheme ? "#e000cf" : "#176c2a",
    "--cart-accent-hover": isDefaultTheme ? "#b800aa" : "#125621",
    "--cart-dark": isDefaultTheme ? "#641052" : "#0b3d18",
    "--cart-muted": isDefaultTheme ? "#72506b" : "#405348",
    "--cart-border": isDefaultTheme ? "#f4a8eb" : "#b8ca7e",
    "--cart-surface": isDefaultTheme ? "#fff0fc" : "#f7fde3",
    "--cart-badge": isDefaultTheme ? "#bff2ec" : "#f4d330",
  } as CSSProperties;
}

export function AddToCartControls({
  productId,
  siteTheme,
  minimumQuantity,
  usesMinimumQuantity = false,
  audience = "VIZINHA",
}: {
  productId: string;
  siteTheme: StoreSiteTheme;
  minimumQuantity?: number | null;
  usesMinimumQuantity?: boolean;
  audience?: CartAudience;
}) {
  const [quantity, setQuantity] = useState(String(usesMinimumQuantity ? Math.max(1, minimumQuantity || 1) : 1));
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const addToCart = async () => {
    try {
      setErrorMessage(null);
      const parsedQuantity = Math.floor(Number(quantity));
      const requiredMinimum = usesMinimumQuantity ? Math.max(1, minimumQuantity || 1) : 1;
      if (!Number.isInteger(parsedQuantity) || parsedQuantity < requiredMinimum) {
        setErrorMessage(usesMinimumQuantity ? `Informe pelo menos ${requiredMinimum} unidades.` : "Informe uma quantidade válida.");
        return;
      }
      setLoading(true);
      const response = await fetch("/api/cart/add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(usesMinimumQuantity ? { productId, requestedUnits: parsedQuantity, audience } : { productId, quantity: parsedQuantity, audience }),
      });
      const data = (await response.json().catch(() => null)) as { error?: string } | null;

      if (!response.ok) {
        throw new Error(data?.error || "Não foi possível adicionar ao carrinho.");
      }

      toast.success("Produto adicionado ao carrinho.");
      notifyCartChanged?.();
    } catch (error) {
      setErrorMessage(getSimpleCartError(error, "Não foi possível adicionar ao carrinho."));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={getCartThemeStyle(siteTheme)} className="mt-auto flex flex-col gap-3">
      <div className="space-y-1">
        <label className="text-sm font-bold text-[var(--cart-dark)]">{usesMinimumQuantity ? "Quantidade de unidades" : "Quantidade"}</label>
        <Input type="number" inputMode="numeric" min="0" step="1" value={quantity} onChange={(event) => { setQuantity(event.target.value); setErrorMessage(null); }} className="h-14 rounded-full border-[var(--cart-border)] bg-white px-5 text-center text-lg font-black text-[var(--cart-dark)]" />
        {usesMinimumQuantity ? <p className="text-xs text-[var(--cart-muted)]">Mínimo de {minimumQuantity} unidades; você pode informar qualquer quantidade inteira maior.</p> : null}
      </div>

      <Button
        type="button"
        disabled={loading}
        onClick={() => void addToCart()}
        className="min-h-12 rounded-full bg-[var(--cart-accent)] text-base font-bold text-white hover:bg-[var(--cart-accent-hover)]"
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
  siteTheme,
  audience = "VIZINHA",
}: {
  businessStatus: CartBusinessStatusData;
  siteTheme: StoreSiteTheme;
  audience?: CartAudience;
}) {
  const [cart, setCart] = useState<CartData>(EMPTY_CART);
  const [open, setOpen] = useState(false);
  const isDesktop = useDesktopCart();
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [checkingOut, setCheckingOut] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [itemError, setItemError] = useState<{ id: string; message: string } | null>(null);
  const [quantityDrafts, setQuantityDrafts] = useState<Record<string, string>>({});
  const [checkoutSession, setCheckoutSession] = useState<CartCheckoutSession | null>(null);
  const [checkoutStep, setCheckoutStep] = useState<"FORM" | "REVIEW">("FORM");
  const [checkoutPaid, setCheckoutPaid] = useState(false);
  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [fulfillmentType, setFulfillmentType] = useState<FulfillmentType>("PICKUP");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [deliveryReference, setDeliveryReference] = useState("");
  const [deliveryPlace, setDeliveryPlace] = useState({ placeId: "", neighborhood: "", city: "", latitude: 0, longitude: 0 });
  const addressInputRef = useRef<HTMLInputElement>(null);
  const cartScrollRef = useRef<HTMLDivElement>(null);
  const [paymentPercentage, setPaymentPercentage] = useState<50 | 100>(50);
  const [paymentMethod, setPaymentMethod] = useState<MetodoPagamento>(MetodoPagamento.PIX);
  const effectiveMinimumLeadHours = useMemo(
    () => Math.max(businessStatus.minimumLeadHours, ...cart.items.map((item) => item.minimumLeadHours ?? businessStatus.minimumLeadHours)),
    [businessStatus.minimumLeadHours, cart.items],
  );
  const minDeliveryDate = useMemo(
    () => getMinDeliveryDate(effectiveMinimumLeadHours),
    [effectiveMinimumLeadHours]
  );
  const minDeliveryDateKey = useMemo(() => formatDateInputValue(minDeliveryDate), [minDeliveryDate]);
  const [deliveryDate, setDeliveryDate] = useState(formatDateInputValue(minDeliveryDate));
  const [deliveryTime, setDeliveryTime] = useState(formatTimeInputValue(minDeliveryDate));
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [displayMonth, setDisplayMonth] = useState(() => startOfMonth(minDeliveryDate));
  const cartThemeStyle = getCartThemeStyle(siteTheme);
  const cartSaveChain = useRef<Promise<void>>(Promise.resolve());
  const latestCartSaveError = useRef<Error | null>(null);

  const enqueueCartSave = (operation: () => Promise<void>) => {
    const next = cartSaveChain.current
      .catch(() => undefined)
      .then(async () => {
        try {
          await operation();
          latestCartSaveError.current = null;
        } catch (error) {
          const normalizedError = error instanceof Error ? error : new Error("Não foi possível salvar o carrinho.");
          latestCartSaveError.current = normalizedError;
          throw normalizedError;
        }
      });
    cartSaveChain.current = next;
    return next;
  };

  const showReview = () => {
    if (!canCheckout || cartValidation) {
      setActionError(checkoutGuidance || cartValidation || "Confira os dados do pedido.");
      return;
    }
    setActionError(null);
    setCheckoutStep("REVIEW");
    window.setTimeout(() => cartScrollRef.current?.scrollTo({ top: 0, behavior: "smooth" }), 0);
  };

  useEffect(() => { void preloadGoogleMaps().catch(() => undefined); }, []);

  useEffect(() => {
    if (fulfillmentType !== "DELIVERY" || !addressInputRef.current) return;
    let cancelled = false;
    const setup = () => {
      if (cancelled || !addressInputRef.current) return;
      const google = (window as unknown as { google?: GoogleMapsApi }).google;
      if (!google?.maps?.places) return;
      const autocomplete = new google.maps.places.Autocomplete(addressInputRef.current, {
        componentRestrictions: { country: "br" },
        fields: ["place_id", "formatted_address", "address_components", "geometry"],
        types: ["address"],
      });
      autocomplete.setBounds(new google.maps.LatLngBounds({ lat: -7.25, lng: -35.05 }, { lat: -6.85, lng: -34.75 }));
      autocomplete.addListener("place_changed", () => {
        const place = autocomplete.getPlace();
        const component = (type: string) => place.address_components?.find((item) => item.types.includes(type))?.long_name || "";
        const neighborhood = component("sublocality_level_1") || component("sublocality") || component("neighborhood");
        const formattedAddress = place.formatted_address || addressInputRef.current?.value || "";
        if (addressInputRef.current) addressInputRef.current.value = formattedAddress;
        setDeliveryAddress(formattedAddress);
        setDeliveryPlace({ placeId: place.place_id || "", neighborhood, city: component("administrative_area_level_2"), latitude: place.geometry?.location?.lat() || 0, longitude: place.geometry?.location?.lng() || 0 });
        setActionError(null);
      });
    };
    void preloadGoogleMaps().then(setup).catch(() => setActionError("Não foi possível carregar o Google Maps. Verifique sua conexão e tente novamente."));
    return () => { cancelled = true; };
  }, [fulfillmentType]);

  const loadCart = async () => {
    try {
      setCart(await readCart(audience));
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
      await enqueueCartSave(async () => {
        const response = await fetch(`/api/cart/item/${item.id}?audience=${audience}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(item.usesMinimumQuantity ? { requestedUnits: nextQuantity, selectedItems, audience } : { quantity: nextQuantity, selectedItems, audience }),
        });
        const data = (await response.json().catch(() => null)) as (CartData & { error?: string }) | null;
        if (!response.ok || !data) throw new Error(data?.error || "Não foi possível atualizar.");
        updateCart(data);
      });
      setQuantityDrafts((current) => { const next = { ...current }; delete next[item.id]; return next; });
    } catch (error) {
      setItemError({ id: item.id, message: getSimpleCartError(error, "Não foi possível alterar a quantidade.") });
    } finally {
      setLoadingId(null);
    }
  };

  const commitRequestedUnits = (item: CartItem) => {
    const rawValue = quantityDrafts[item.id] ?? String(item.requestedUnits);
    const parsedValue = Math.floor(Number(rawValue));
    if (!Number.isInteger(parsedValue) || parsedValue < item.minimumQuantity) {
      setItemError({ id: item.id, message: `${item.name}: informe pelo menos ${item.minimumQuantity} unidades.` });
      return;
    }
    setItemError(null);
    if (parsedValue !== item.requestedUnits) void setItemQuantity(item, parsedValue);
    else setQuantityDrafts((current) => { const next = { ...current }; delete next[item.id]; return next; });
  };

  const removeItem = async (item: CartItem) => {
    try {
      setItemError(null);
      setLoadingId(item.id);
      const response = await fetch(`/api/cart/item/${item.id}?audience=${audience}`, { method: "DELETE" });

      if (!response.ok) throw new Error("Não foi possível remover.");
      updateCart((await response.json()) as CartData);
    } catch (error) {
      setItemError({ id: item.id, message: getSimpleCartError(error, "Não foi possível remover este item.") });
    } finally {
      setLoadingId(null);
    }
  };

  const calendarDays = useMemo(() => getCalendarDays(displayMonth), [displayMonth]);
  const timeSlots = useMemo(
    () => getTimeSlots(deliveryDate, minDeliveryDate, businessStatus.operationSchedule),
    [businessStatus.operationSchedule, deliveryDate, minDeliveryDate]
  );
  useEffect(() => {
    const nextDate = formatDateInputValue(minDeliveryDate);
    const currentSlots = getTimeSlots(deliveryDate, minDeliveryDate, businessStatus.operationSchedule);
    if (deliveryDate < nextDate || !currentSlots.includes(deliveryTime)) {
      const nextSlots = getTimeSlots(nextDate, minDeliveryDate, businessStatus.operationSchedule);
      const nextTime = nextSlots[0] || "";
      if (deliveryDate !== nextDate) {
        setDeliveryDate(nextDate);
        setDisplayMonth(startOfMonth(minDeliveryDate));
      }
      if (deliveryTime !== nextTime) setDeliveryTime(nextTime);
    }
  }, [businessStatus.operationSchedule, deliveryDate, deliveryTime, minDeliveryDate]);
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
      !storeClosedBlocksSelectedDate &&
      (fulfillmentType === "PICKUP" || Boolean(deliveryPlace.placeId && deliveryPlace.neighborhood && deliveryReference.trim().length >= 3)),
    [cart.items.length, checkingOut, customerEmail, customerName, customerPhone, deliveryDate, deliveryTimeIsValid, storeClosedBlocksSelectedDate, fulfillmentType, deliveryPlace, deliveryReference]
  );
  const allowsPartialPayment = useMemo(
    () => cart.items.length > 0 && cart.items.every((item) => item.permitePagamentoParcial),
    [cart.items]
  );
  const deliveryFee = fulfillmentType === "DELIVERY" ? getDeliveryFee(deliveryPlace.neighborhood) : { fee: 0, label: "Retirada", agreed: true };
  const orderTotal = Number((cart.totalAmount + deliveryFee.fee).toFixed(2));
  const paymentPreview = useMemo(
    () => calculatePaymentAmounts(orderTotal, paymentPercentage, paymentMethod),
    [orderTotal, paymentPercentage, paymentMethod]
  );
  const selectedPaymentMethod = SUPPORTED_PAYMENT_METHODS.find((method) => method.id === paymentMethod);
  const cartValidation = useMemo(() => {
    for (const item of cart.items) {
      if (item.usesMinimumQuantity && item.id in quantityDrafts) {
        const draft = Math.floor(Number(quantityDrafts[item.id]));
        if (!Number.isInteger(draft) || draft < item.minimumQuantity) {
          return `${item.name}: informe pelo menos ${item.minimumQuantity} unidades.`;
        }
      }
      try {
        validateCartItemQuantities({
          product: {
            nome: item.name,
            categoria: item.category,
            totalUnidades: item.totalUnidades,
            maxTiposSalgado: item.maxTiposSalgado,
            precisaSelecaoDeTipos: item.precisaSelecaoDeTipos,
            quantidadeMinimaConfeiteira: audience === "CONFEITEIRA" && item.usesMinimumQuantity ? item.minimumQuantity : null,
            productType: audience === "VIZINHA"
              ? { allowsMultiple: item.usesMinimumQuantity, minQuantity: item.minimumQuantity }
              : null,
            comboItens: item.comboItens,
          },
          audience,
          quantity: item.quantity,
          requestedUnits: item.id in quantityDrafts ? Number(quantityDrafts[item.id]) : item.requestedUnits,
          selectedItems: item.selectedItems,
        });
      } catch (error) {
        return `${item.name}: ${error instanceof Error ? error.message : "Confira as quantidades selecionadas."}`;
      }
    }

    return null;
  }, [audience, cart.items, quantityDrafts]);
  const checkoutGuidance = cartValidation
    ? getSimpleCartError(new Error(cartValidation), cartValidation)
    : customerName.trim().length < 2
      ? "Informe o nome para finalizar o pedido."
      : !/^\S+@\S+\.\S+$/.test(customerEmail.trim())
        ? "Informe um e-mail válido para o pagamento."
      : customerPhone.replace(/\D/g, "").length < 10
        ? "Informe um WhatsApp válido para finalizar o pedido."
        : fulfillmentType === "DELIVERY" && (!deliveryPlace.placeId || !deliveryPlace.neighborhood)
          ? "Selecione o endereço completo em uma sugestão do Google Maps."
          : fulfillmentType === "DELIVERY" && deliveryReference.trim().length < 3
            ? "Informe um ponto de referência para o entregador."
        : !deliveryDate || !deliveryTimeIsValid
          ? "Informe uma data e horário válidos."
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
      await cartSaveChain.current.catch(() => undefined);
      if (latestCartSaveError.current) throw latestCartSaveError.current;
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
          fulfillmentType,
          deliveryAddress,
          deliveryReference,
          deliveryNeighborhood: deliveryPlace.neighborhood,
          deliveryCity: deliveryPlace.city,
          deliveryPlaceId: deliveryPlace.placeId,
          deliveryLatitude: deliveryPlace.latitude,
          deliveryLongitude: deliveryPlace.longitude,
          audience,
          items: cart.items.map((item) => ({
            id: item.id,
            quantity: item.quantity,
            requestedUnits: item.id in quantityDrafts
              ? Number(quantityDrafts[item.id])
              : item.requestedUnits,
            selectedItems: item.selectedItems,
          })),
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
        throw new Error(data?.error || "Não foi possível finalizar.");
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

    const savePromise = enqueueCartSave(async () => {
      const response = await fetch(`/api/cart/item/${item.id}?audience=${audience}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quantity: item.quantity, selectedItems: normalizedSelectedItems, audience }),
      });
      const data = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) throw new Error(data?.error || "Não foi possível atualizar os tipos.");
    });
    void savePromise.catch((error) => {
      setItemError({ id: item.id, message: getSimpleCartError(error, "Não foi possível salvar os sabores.") });
    });
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
        style={cartThemeStyle}
        onClick={() => setOpen(true)}
        className="fixed bottom-5 right-5 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-[var(--cart-dark)] text-white shadow-[0_18px_50px_rgba(100,16,82,0.28)] transition hover:bg-[var(--cart-accent-hover)]"
        aria-label="Abrir carrinho"
      >
        <ShoppingCart className="h-6 w-6" />
        {cart.itemCount > 0 ? (
          <span className="absolute -right-1 -top-1 flex h-6 min-w-6 items-center justify-center rounded-full bg-[var(--cart-badge)] px-1 text-xs font-black text-[var(--cart-dark)]">
            {cart.itemCount}
          </span>
        ) : null}
      </button>

      <CartRoot
        modal={false}
        open={open}
        onOpenChange={(nextOpen) => {
          setOpen(nextOpen);
          if (!nextOpen && !checkoutSession) setCheckoutStep("FORM");
          if (!nextOpen && checkoutPaid) {
            setCheckoutSession(null);
            setCheckoutPaid(false);
          }
        }}
      >
        <CartContent
          style={cartThemeStyle}
          className={cn(
            "grid grid-rows-[auto_minmax(0,1fr)] gap-0 overflow-hidden bg-white p-0",
            isDesktop
              ? "h-[min(90vh,56rem)] w-[94vw] max-w-none rounded-2xl sm:w-[94vw] sm:max-w-none md:w-[92vw] md:max-w-5xl lg:w-[88vw] lg:max-w-6xl xl:w-[80vw] [&>[data-slot=dialog-close]]:hidden"
              : "rounded-t-3xl border-x-0 border-b-0 [&>[data-slot=drawer-header]]:pt-2"
          )}
        >
          <DialogHeader className={cn(
            "flex-row items-center justify-between border-b border-[var(--cart-border)] bg-white px-4 py-3 text-left sm:px-6",
            !isDesktop && "pt-6"
          )}>
            <div>
              {isDesktop ? (
                <DialogTitle className="text-xl font-black text-[var(--cart-dark)] sm:text-2xl">{checkoutStep === "REVIEW" && !checkoutSession ? "Revise seu pedido" : "Seu carrinho"}</DialogTitle>
              ) : (
                <DrawerTitle className="text-xl font-black text-[var(--cart-dark)]">{checkoutStep === "REVIEW" && !checkoutSession ? "Revise seu pedido" : "Seu carrinho"}</DrawerTitle>
              )}
              <p className="mt-1 text-sm font-medium text-[var(--cart-muted)]">
                {cart.itemCount} {cart.itemCount === 1 ? "item" : "itens"}
              </p>
              {!checkoutSession && (actionError || (checkoutStep === "FORM" ? checkoutGuidance : null)) ? (
                <p role="alert" className="mt-1 max-w-xl text-sm font-bold text-red-700">
                  {actionError || (checkoutStep === "FORM" ? checkoutGuidance : null)}
                </p>
              ) : null}
            </div>
            {isDesktop ? <DialogClose asChild>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-11 w-11 shrink-0 rounded-full border-[var(--cart-border)] text-[var(--cart-accent)]"
                aria-label="Fechar carrinho"
              >
                <X className="h-5 w-5" />
              </Button>
            </DialogClose> : <DrawerClose asChild>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-11 w-11 shrink-0 rounded-full border-[var(--cart-border)] text-[var(--cart-accent)]"
                aria-label="Fechar carrinho"
              >
                <X className="h-5 w-5" />
              </Button>
            </DrawerClose>}
          </DialogHeader>

          <div ref={cartScrollRef} className="min-h-0 scroll-pb-32 overflow-y-auto overscroll-contain bg-[var(--cart-surface)] px-4 py-5 sm:px-6">
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
            <div className="rounded-2xl border border-dashed border-[var(--cart-border)] bg-white p-8 text-center text-base font-medium text-[var(--cart-muted)]">
              Seu carrinho está vazio.
            </div>
          ) : checkoutStep === "REVIEW" ? (
            <div className="mx-auto max-w-2xl space-y-4">
              <div className="rounded-2xl border border-[var(--cart-border)] bg-white p-5">
                <p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--cart-muted)]">Confira antes de pagar</p>
                <h2 className="mt-1 text-2xl font-black text-[var(--cart-dark)]">Resumo do pedido</h2>
                <div className="mt-4 space-y-3">
                  {cart.items.map((item) => (
                    <div key={item.id} className="border-b border-[var(--cart-border)] pb-3 last:border-0 last:pb-0">
                      <div className="flex justify-between gap-4 font-bold text-[var(--cart-dark)]">
                        <span>{item.usesMinimumQuantity ? `${item.requestedUnits} un de ${item.name}` : `${item.quantity}x ${item.name}`}</span>
                        <span>{formatCurrency(item.subtotal)}</span>
                      </div>
                      <p className="mt-1 text-sm text-[var(--cart-muted)]">{item.selectedItems.filter((entry) => entry.quantidade > 0).map((entry) => `${entry.tipo}: ${entry.quantidade}`).join(" • ")}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-2xl border border-[var(--cart-border)] bg-white p-5 text-sm text-[var(--cart-muted)]">
                <h3 className="text-lg font-black text-[var(--cart-dark)]">Dados e recebimento</h3>
                <p className="mt-3"><strong className="text-[var(--cart-dark)]">Cliente:</strong> {customerName}</p>
                <p><strong className="text-[var(--cart-dark)]">WhatsApp:</strong> {customerPhone}</p>
                <p><strong className="text-[var(--cart-dark)]">Modalidade:</strong> {fulfillmentType === "DELIVERY" ? "Entrega" : "Retirada"}</p>
                {fulfillmentType === "DELIVERY" ? <><p><strong className="text-[var(--cart-dark)]">Endereço:</strong> {deliveryAddress}</p><p><strong className="text-[var(--cart-dark)]">Referência:</strong> {deliveryReference}</p></> : null}
                <p><strong className="text-[var(--cart-dark)]">Data e horário:</strong> {formatDateLabel(deliveryDate)} às {deliveryTime}</p>
              </div>

              <div className="rounded-2xl border-2 border-[var(--cart-border)] bg-white p-5">
                <h3 className="text-lg font-black text-[var(--cart-dark)]">Valores</h3>
                <div className="mt-4 space-y-2 text-sm text-[var(--cart-muted)]">
                  <div className="flex justify-between gap-4"><span>Produtos</span><span>{formatCurrency(cart.totalAmount)}</span></div>
                  <div className="flex justify-between gap-4"><span>Entrega</span><span>{fulfillmentType === "DELIVERY" ? (deliveryFee.agreed ? formatCurrency(deliveryFee.fee) : "A combinar") : "Grátis"}</span></div>
                  <div className="flex justify-between gap-4 border-t border-[var(--cart-border)] pt-2 font-bold text-[var(--cart-dark)]"><span>Total do pedido</span><span>{formatCurrency(orderTotal)}</span></div>
                  <div className="flex justify-between gap-4"><span>Pagamento agora ({paymentPercentage}%)</span><span>{formatCurrency(paymentPreview.baseAmount)}</span></div>
                  {paymentPreview.feeAmount > 0 ? <div className="flex justify-between gap-4"><span>Taxa da forma de pagamento</span><span>{formatCurrency(paymentPreview.feeAmount)}</span></div> : null}
                  <div className="mt-3 flex justify-between gap-4 rounded-xl bg-[var(--cart-surface)] p-3 text-lg font-black text-[var(--cart-dark)]"><span>Total a pagar agora</span><span>{formatCurrency(paymentPreview.totalToCharge)}</span></div>
                  {paymentPercentage === 50 ? <p className="pt-1 text-xs">Restante do pedido: {formatCurrency(orderTotal - paymentPreview.baseAmount)}.</p> : null}
                </div>
              </div>
              <div className="grid grid-cols-[auto_1fr] gap-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
                <Button type="button" variant="outline" disabled={checkingOut} onClick={() => { setCheckoutStep("FORM"); setActionError(null); window.setTimeout(() => cartScrollRef.current?.scrollTo({ top: 0 }), 0); }} className="min-h-12 rounded-full border-[var(--cart-border)] px-5 font-bold text-[var(--cart-dark)]">Voltar</Button>
                <Button type="button" disabled={checkingOut} onClick={() => void checkout()} className="min-h-12 rounded-full bg-[var(--cart-accent)] px-5 text-base font-black text-white hover:bg-[var(--cart-accent-hover)]">
                  {checkingOut ? <LoaderCircle className="mr-2 h-5 w-5 animate-spin" /> : null}
                  {checkingOut ? "Preparando pagamento..." : `Pagar ${formatCurrency(paymentPreview.totalToCharge)}`}
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {cart.items.map((item) => (
                <div
                  key={item.id}
                  className="grid gap-4 rounded-2xl border border-[var(--cart-border)] bg-[var(--cart-surface)] p-4 md:grid-cols-[88px_minmax(0,1fr)_auto] lg:gap-6 lg:p-5"
                >
                  <div className="relative h-20 overflow-hidden rounded-xl bg-white sm:h-16">
                    <Image src={item.image} alt={item.name} fill unoptimized className="object-cover" />
                  </div>
                  <div>
                    <p className="text-lg font-black leading-snug text-[var(--cart-dark)]">{item.name}</p>
                    <p className="text-base text-[var(--cart-muted)]">{item.type}</p>
                    <p className="mt-1 text-lg font-bold text-[var(--cart-accent)]">
                      {formatCurrency(item.subtotal)}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 sm:justify-end">
                    {!item.usesMinimumQuantity ? <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      disabled={loadingId === item.id}
                      onClick={() => void setItemQuantity(item, item.quantity - 1)}
                      className="h-11 w-11 rounded-full border-[var(--cart-border)]"
                      aria-label={`Diminuir quantidade de ${item.name}`}
                    >
                      <Minus className="h-4 w-4" />
                    </Button> : null}
                    {item.usesMinimumQuantity ? <Input type="number" inputMode="numeric" min="0" step="1" value={quantityDrafts[item.id] ?? String(item.requestedUnits)} onChange={(event) => { setQuantityDrafts((current) => ({ ...current, [item.id]: event.target.value })); setItemError(null); }} onBlur={() => commitRequestedUnits(item)} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} className="h-11 w-28 text-center font-black" /> : <span className="w-8 text-center text-lg font-black text-[#17251a]">{item.quantity}</span>}
                    {!item.usesMinimumQuantity ? <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      disabled={loadingId === item.id}
                      onClick={() => void setItemQuantity(item, item.quantity + 1)}
                      className="h-11 w-11 rounded-full border-[var(--cart-border)]"
                      aria-label={`Aumentar quantidade de ${item.name}`}
                    >
                      <Plus className="h-4 w-4" />
                    </Button> : null}
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
                    <p role="alert" className="text-sm font-semibold text-red-700 md:col-span-3">
                      {itemError.message}
                    </p>
                  ) : null}
                  {item.precisaSelecaoDeTipos ? <div className="space-y-3 md:col-span-3">
                    <div className="flex flex-col gap-3 rounded-[1.5rem] border border-[var(--cart-border)] bg-white p-3 sm:p-4">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-base font-bold text-[var(--cart-dark)]">Sabores do pedido</p>
                        <p className="text-sm font-semibold text-[var(--cart-muted)]">
                          {item.selectedItems.reduce((sum, entry) => sum + Number(entry.quantidade || 0), 0)}
                          /{item.requestedUnits} un
                        </p>
                      </div>

                      <div className="space-y-2">
                        {(item.selectedItems.length > 0 ? item.selectedItems : [{ tipo: "", quantidade: 0 }]).map(
                          (entry, index) => (
                            <div
                              key={`${item.id}-${index}`}
                              className="grid gap-3 rounded-[1.25rem] border border-[var(--cart-surface)] bg-[linear-gradient(180deg,var(--cart-surface),var(--cart-surface))] p-3 md:grid-cols-[minmax(220px,1fr)_140px_auto] lg:gap-4 lg:p-4"
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
                                    className="h-11 border-[var(--cart-border)] bg-white"
                                  />
                                ) : item.saboresSugeridos.length > 0 ? (
                                  <Select
                                    value={entry.tipo}
                                    onValueChange={(value) => patchSelectedItem(item, index, { tipo: value })}
                                  >
                                    <SelectTrigger className="h-11 w-full border-[var(--cart-border)] bg-white">
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
                                    className="h-11 border-[var(--cart-border)] bg-white"
                                  />
                                )}
                              </div>

                              <div className="space-y-2">
                                <label className="text-sm font-medium text-[#284a2e]">Quantidade</label>
                                <Input
                                  type="number"
                                  inputMode="numeric"
                                  pattern="[0-9]*"
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
                                  className="h-11 border-[var(--cart-border)] bg-white"
                                />
                              </div>

                              <div className="flex items-end">
                                <Button
                                  type="button"
                                  variant="outline"
                                  disabled={item.category === "COMBO" || item.selectedItems.length <= 1}
                                  onClick={() => removeSelectedItem(item, index)}
                                  className="h-11 w-full rounded-xl border-[var(--cart-border)] text-[var(--cart-accent)] hover:bg-[var(--cart-surface)] sm:w-auto"
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
                        <p className="text-sm text-[var(--cart-muted)]">
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
                          className="min-h-11 rounded-xl border-[var(--cart-border)] text-base font-semibold text-[var(--cart-accent)]"
                        >
                          <Plus className="mr-2 h-4 w-4" />
                          Tipo
                        </Button>
                      </div>
                    </div>
                  </div> : null}
                </div>
              ))}

              <div className="pt-2">
                <p className="text-xs font-black uppercase tracking-[0.16em] text-[#52705a]">Finalização</p>
                <h2 className="mt-1 text-xl font-black text-[var(--cart-dark)]">Complete os 3 passos</h2>
                <p className="mt-1 text-sm text-[var(--cart-muted)]">Preencha de cima para baixo. Leva menos de um minuto.</p>
              </div>

              <section className="rounded-2xl border border-[var(--cart-border)] bg-white p-4" aria-labelledby="cart-step-customer">
                <div className="mb-4 flex items-center gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--cart-accent)] text-base font-black text-white">1</span>
                  <div>
                    <h3 id="cart-step-customer" className="text-lg font-black text-[var(--cart-dark)]">Seus dados</h3>
                    <p className="text-sm text-[var(--cart-muted)]">Usaremos o WhatsApp para confirmar o pedido.</p>
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <label htmlFor="cart-customer-name" className="text-base font-bold text-[var(--cart-dark)]">Seu nome</label>
                  <Input id="cart-customer-name" value={customerName} onChange={(event) => { setCustomerName(event.target.value); setActionError(null); }} placeholder="Digite seu nome" required className="h-12 text-base" aria-invalid={customerName.length > 0 && customerName.trim().length < 2} />
                  {customerName.length > 0 && customerName.trim().length < 2 ? (
                    <p role="alert" className="text-sm font-semibold text-red-700">Informe o nome para finalizar o pedido.</p>
                  ) : null}
                </div>
                <div className="space-y-2">
                  <label htmlFor="cart-customer-phone" className="text-base font-bold text-[var(--cart-dark)]">Seu WhatsApp</label>
                  <Input id="cart-customer-phone" type="tel" inputMode="tel" value={customerPhone} onChange={(event) => { setCustomerPhone(formatWhatsAppInput(event.target.value)); setActionError(null); }} placeholder="(00) 00000-0000" required className="h-12 text-base" aria-invalid={customerPhone.length > 0 && customerPhone.replace(/\D/g, "").length < 10} />
                  {customerPhone.length > 0 && customerPhone.replace(/\D/g, "").length < 10 ? (
                    <p role="alert" className="text-sm font-semibold text-red-700">Informe um WhatsApp válido para finalizar o pedido.</p>
                  ) : null}
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <label htmlFor="cart-customer-email" className="text-base font-bold text-[var(--cart-dark)]">Seu e-mail</label>
                  <Input id="cart-customer-email" type="email" inputMode="email" autoComplete="email" value={customerEmail} onChange={(event) => { setCustomerEmail(event.target.value); setActionError(null); }} placeholder="email@exemplo.com" required className="h-12 text-base" aria-invalid={customerEmail.length > 0 && !/^\S+@\S+\.\S+$/.test(customerEmail.trim())} />
                  {/* <p className="text-sm text-[var(--cart-muted)]">O Mercado Pago usa o e-mail para processar Pix e cartão.</p> */}
                  {customerEmail.length > 0 && !/^\S+@\S+\.\S+$/.test(customerEmail.trim()) ? (
                    <p role="alert" className="text-sm font-semibold text-red-700">Informe um e-mail válido para o pagamento.</p>
                  ) : null}
                </div>
                </div>
              </section>

              <section className="rounded-2xl border border-[var(--cart-border)] bg-white p-4">
                <h3 className="text-lg font-black text-[var(--cart-dark)]">Como você quer receber?</h3>
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <Button type="button" variant={fulfillmentType === "PICKUP" ? "default" : "outline"} onClick={() => { setFulfillmentType("PICKUP"); setActionError(null); }} className="h-12">Retirada</Button>
                  <Button type="button" variant={fulfillmentType === "DELIVERY" ? "default" : "outline"} onClick={() => { setFulfillmentType("DELIVERY"); setActionError(null); }} className="h-12">Entrega</Button>
                </div>
                {fulfillmentType === "DELIVERY" ? (
                  <div className="mt-4 space-y-2">
                    <label htmlFor="cart-delivery-address" className="text-base font-bold text-[var(--cart-dark)]">Endereço de entrega</label>
                    <Input ref={addressInputRef} id="cart-delivery-address" autoComplete="off" defaultValue={deliveryAddress} onInput={() => { if (deliveryPlace.placeId) { setDeliveryPlace({ placeId: "", neighborhood: "", city: "", latitude: 0, longitude: 0 }); setDeliveryAddress(""); } }} placeholder="Digite rua e número e escolha uma sugestão" className="h-12 text-base" />
                    <label htmlFor="cart-delivery-reference" className="pt-2 text-base font-bold text-[var(--cart-dark)]">Ponto de referência</label>
                    <Input id="cart-delivery-reference" value={deliveryReference} onChange={(event) => setDeliveryReference(event.target.value)} placeholder="Ex.: próximo à praça, portão azul" className="h-12 text-base" />
                    {deliveryPlace.placeId ? <p className="text-sm font-bold text-[#284a2e]">{deliveryPlace.neighborhood}: {deliveryFee.agreed ? formatCurrency(deliveryFee.fee) : "taxa a combinar"}</p> : <p className="text-sm text-[var(--cart-muted)]">Selecione uma sugestão do Google para confirmar o local.</p>}
                  </div>
                ) : null}
              </section>

              <section className="rounded-2xl border border-[var(--cart-border)] bg-[var(--cart-surface)] p-4" aria-labelledby="cart-step-schedule">
                <div className="mb-3 flex items-center gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--cart-accent)] text-base font-black text-white">2</span>
                  <div>
                    <h3 id="cart-step-schedule" className="text-lg font-black text-[var(--cart-dark)]">Data e horário</h3>
                    <p className="text-sm text-[var(--cart-muted)]">Escolha quando deseja {fulfillmentType === "DELIVERY" ? "receber" : "retirar"}.</p>
                  </div>
                </div>
                <div className="mb-4 rounded-xl border border-[#c6d590] bg-white p-3 text-sm text-[#284a2e]">
                  <p><strong>Antecedência mínima:</strong> {effectiveMinimumLeadHours} {effectiveMinimumLeadHours === 1 ? "hora" : "horas"}.</p>
                  <p className="mt-1 capitalize">
                    <strong>Funcionamento em {selectedWeekday}:</strong>{" "}
                    {selectedSchedule ? `das ${selectedSchedule.openHour}h às ${selectedSchedule.closeHour}h` : "fechado"}.
                  </p>
                </div>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <div className="relative">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setCalendarOpen((current) => !current)}
                      className="h-11 w-full justify-between border-[var(--cart-border)] bg-white px-3 text-left text-[#284a2e] hover:bg-[var(--cart-surface)]"
                    >
                      <span className="truncate">{formatDateLabel(deliveryDate)}</span>
                      <CalendarDays className="h-4 w-4 shrink-0" />
                    </Button>

                    {calendarOpen ? (
                      <div className="absolute left-0 top-[calc(100%+0.5rem)] z-30 w-full min-w-[18rem] rounded-2xl border border-[var(--cart-border)] bg-white p-4 shadow-[0_24px_60px_rgba(27,94,32,0.18)]">
                        <div className="mb-4 flex items-center justify-between">
                          <Button type="button" variant="ghost" size="icon" onClick={() => setDisplayMonth((current) => addMonths(current, -1))} className="h-11 w-11 rounded-full text-[var(--cart-accent)] hover:bg-[var(--cart-surface)]">
                            <ChevronLeft className="h-4 w-4" />
                          </Button>
                          <p className="text-sm font-semibold capitalize text-[var(--cart-dark)]">
                            {new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(displayMonth)}
                          </p>
                          <Button type="button" variant="ghost" size="icon" onClick={() => setDisplayMonth((current) => addMonths(current, 1))} className="h-11 w-11 rounded-full text-[var(--cart-accent)] hover:bg-[var(--cart-surface)]">
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
                                  isSelected ? "bg-[var(--cart-accent)] font-semibold text-white" : "text-[#284a2e] hover:bg-[var(--cart-surface)]",
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
                    <SelectTrigger className="h-11 w-full border-[var(--cart-border)] bg-white">
                      <SelectValue placeholder="Selecione o horário" />
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
                  <p role="alert" className="mt-2 text-sm font-semibold text-red-700">Não atendemos nessa data. Escolha um dia com horário ativo na operação.</p>
                ) : storeClosedBlocksSelectedDate ? (
                  <p role="alert" className="mt-2 text-sm font-semibold text-red-700">A loja está fechada para pedidos de hoje. Escolha uma data futura para continuar.</p>
                ) : !deliveryTimeIsValid ? (
                  <p role="alert" className="mt-2 text-sm font-semibold text-red-700">Informe uma data e horário válidos.</p>
                ) : (
                  <p className="mt-2 text-sm text-[#48654f]">Esse horário é para a {fulfillmentType === "DELIVERY" ? "entrega" : "retirada"} do seu pedido.</p>
                )}
              </section>

              <section className="rounded-2xl border border-[var(--cart-border)] bg-white p-4" aria-labelledby="cart-step-payment">
                <div className="mb-4 flex items-center gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--cart-accent)] text-base font-black text-white">3</span>
                  <div>
                    <h3 id="cart-step-payment" className="text-lg font-black text-[var(--cart-dark)]">Pagamento</h3>
                    <p className="text-sm text-[var(--cart-muted)]">Confira quanto pagar agora e escolha a forma.</p>
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-base font-bold text-[var(--cart-dark)]">Quanto pagar agora</label>
                  <Select
                    value={String(paymentPercentage)}
                    onValueChange={(value) => setPaymentPercentage(Number(value) as 50 | 100)}
                  >
                    <SelectTrigger className="h-11 w-full border-[var(--cart-border)] bg-white">
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
                  <p className="text-sm text-[var(--cart-muted)]">
                    Base: {formatCurrency(paymentPreview.baseAmount)}
                  </p>
                </div>

                <div className="space-y-2">
                  <label className="text-base font-bold text-[var(--cart-dark)]">Forma de pagamento</label>
                  <Select
                    value={paymentMethod}
                    onValueChange={(value) => setPaymentMethod(value as MetodoPagamento)}
                  >
                    <SelectTrigger className="h-11 w-full border-[var(--cart-border)] bg-white">
                      <SelectValue placeholder="Método" />
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
                  <p className="text-sm text-[var(--cart-muted)]">
                    {selectedPaymentMethod?.description || "Escolha a forma de pagamento."}
                  </p>
                </div>
                </div>
              </section>

              <Button
                type="button"
                disabled={checkingOut || !canCheckout || Boolean(cartValidation)}
                onClick={showReview}
                className="min-h-12 w-full rounded-full bg-[var(--cart-accent)] px-5 text-base font-black text-white hover:bg-[var(--cart-accent-hover)]"
              >
                Finalizar pedido
              </Button>

            </div>
          )}
          </div>

        </CartContent>
      </CartRoot>
    </>
  );
}
