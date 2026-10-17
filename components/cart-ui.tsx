"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { MetodoPagamento } from "@prisma/client";
import { ArrowLeft, ArrowRight, LoaderCircle, MessageCircle, Minus, Plus, ShoppingCart, Trash2, X } from "lucide-react";

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
import { getWhatsAppOrderUrl } from "@/lib/whatsapp-link";
import type { CartAudience } from "@/lib/cart";
import { getAllowedSalgadoTypes, validateCartItemQuantities } from "@/lib/cart-quantity";

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

function formatShortDay(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(`${value}T12:00:00`));
}

/** Próximos dias com atendimento e horário livre, para escolher com um toque. */
function getUpcomingOpenDays(minDate: Date, operationSchedule: BusinessScheduleByWeekday, count: number) {
  const days: string[] = [];
  for (let offset = 0; offset < 30 && days.length < count; offset += 1) {
    const date = new Date(minDate.getFullYear(), minDate.getMonth(), minDate.getDate() + offset);
    const key = formatDateInputValue(date);
    if (getTimeSlots(key, minDate, operationSchedule).length > 0) days.push(key);
  }
  return days;
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
    // Contraste de pelo menos 7:1 para texto e 3:1 para bordas de campos e botões.
    "--cart-accent": isDefaultTheme ? "#8a0f78" : "#146b2e",
    "--cart-accent-hover": isDefaultTheme ? "#6b0f5c" : "#0f5223",
    "--cart-dark": isDefaultTheme ? "#4a0a3f" : "#0b3d18",
    "--cart-muted": isDefaultTheme ? "#5a3a54" : "#30443a",
    "--cart-border": isDefaultTheme ? "#c25bb4" : "#7f9f4a",
    "--cart-surface": isDefaultTheme ? "#fff0fc" : "#f7fde3",
    "--cart-badge": isDefaultTheme ? "#bff2ec" : "#f4d330",
  } as CSSProperties;
}

export function AddToCartControls({
  productId,
  productName,
  siteTheme,
  minimumQuantity,
  usesMinimumQuantity = false,
  audience = "VIZINHA",
}: {
  productId: string;
  productName: string;
  siteTheme: StoreSiteTheme;
  minimumQuantity?: number | null;
  usesMinimumQuantity?: boolean;
  audience?: CartAudience;
}) {
  const requiredMinimum = usesMinimumQuantity ? Math.max(1, minimumQuantity || 1) : 1;
  const step = usesMinimumQuantity ? 10 : 1;
  const [quantity, setQuantity] = useState(String(requiredMinimum));
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [addedMessage, setAddedMessage] = useState<string | null>(null);
  const inputId = `quantidade-${productId}`;
  const hintId = `dica-${productId}`;

  const currentQuantity = Math.floor(Number(quantity)) || 0;
  const changeBy = (delta: number) => {
    setErrorMessage(null);
    setAddedMessage(null);
    setQuantity(String(Math.max(requiredMinimum, (currentQuantity || requiredMinimum) + delta)));
  };

  const addToCart = async () => {
    try {
      setErrorMessage(null);
      setAddedMessage(null);
      const parsedQuantity = Math.floor(Number(quantity));
      if (!Number.isInteger(parsedQuantity) || parsedQuantity < requiredMinimum) {
        setErrorMessage(
          usesMinimumQuantity
            ? `O pedido mínimo é de ${requiredMinimum} salgados. Aumente a quantidade para continuar.`
            : "Digite uma quantidade a partir de 1.",
        );
        return;
      }
      setLoading(true);
      const response = await fetch("/api/cart/add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          usesMinimumQuantity
            ? { productId, requestedUnits: parsedQuantity, audience }
            : { productId, quantity: parsedQuantity, audience },
        ),
      });
      const data = (await response.json().catch(() => null)) as { error?: string } | null;

      if (!response.ok) {
        throw new Error(data?.error || "Não foi possível adicionar ao pedido.");
      }

      setAddedMessage(
        `Adicionado ao pedido ✓ ${usesMinimumQuantity ? `${parsedQuantity} salgados de ${productName}` : `${parsedQuantity} × ${productName}`}. Você pode escolher mais produtos ou tocar em “Ver meu pedido”.`,
      );
      notifyCartChanged?.();
    } catch (error) {
      setErrorMessage(getSimpleCartError(error, "Não foi possível adicionar ao pedido."));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={getCartThemeStyle(siteTheme)} className="mt-auto flex flex-col gap-3">
      <div className="space-y-2">
        <label htmlFor={inputId} className="block text-lg font-bold text-[var(--cart-dark)]">
          {usesMinimumQuantity ? "Quantos salgados você quer?" : "Quantas unidades você quer?"}
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="icon"
            disabled={currentQuantity <= requiredMinimum}
            onClick={() => changeBy(-step)}
            className="h-14 w-14 shrink-0 rounded-full border-2 border-[var(--cart-accent)] text-[var(--cart-accent)]"
            aria-label={`Diminuir a quantidade de ${productName}`}
          >
            <Minus className="h-6 w-6" aria-hidden="true" />
          </Button>
          <Input
            id={inputId}
            type="number"
            inputMode="numeric"
            min={requiredMinimum}
            step="1"
            value={quantity}
            aria-describedby={hintId}
            onChange={(event) => {
              setQuantity(event.target.value);
              setErrorMessage(null);
              setAddedMessage(null);
            }}
            className="h-14 min-w-[6rem] flex-1 rounded-full border-2 border-[var(--cart-border)] bg-white px-3 text-center text-2xl font-extrabold text-[var(--cart-dark)]"
          />
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => changeBy(step)}
            className="h-14 w-14 shrink-0 rounded-full border-2 border-[var(--cart-accent)] text-[var(--cart-accent)]"
            aria-label={`Aumentar a quantidade de ${productName}`}
          >
            <Plus className="h-6 w-6" aria-hidden="true" />
          </Button>
        </div>

        {usesMinimumQuantity ? (
          <div className="flex flex-wrap gap-2" role="group" aria-label="Somar de uma vez">
            {[50, 100].map((amount) => (
              <Button
                key={amount}
                type="button"
                variant="outline"
                onClick={() => changeBy(amount)}
                className="h-12 rounded-full border-2 border-[var(--cart-border)] px-5 text-base font-bold text-[var(--cart-dark)]"
              >
                + {amount}
              </Button>
            ))}
          </div>
        ) : null}

        <p id={hintId} className="text-base text-[var(--cart-muted)]">
          {usesMinimumQuantity
            ? `Mínimo de ${requiredMinimum} salgados. Os botões − e + mudam de 10 em 10; você também pode digitar o número.`
            : "Use os botões − e + ou digite o número."}
        </p>
      </div>

      <Button
        type="button"
        disabled={loading}
        onClick={() => void addToCart()}
        className="h-auto min-h-14 w-full whitespace-normal rounded-full bg-[var(--cart-accent)] py-3 text-lg font-extrabold text-white hover:bg-[var(--cart-accent-hover)]"
      >
        {loading ? <LoaderCircle className="mr-2 h-5 w-5 animate-spin" aria-hidden="true" /> : <ShoppingCart className="mr-2 h-5 w-5" aria-hidden="true" />}
        {loading ? "Adicionando..." : "Adicionar ao pedido"}
      </Button>

      <div aria-live="polite" className="min-h-0">
        {addedMessage ? (
          <p role="status" className="rounded-2xl border-2 border-[#0b6b3a] bg-[#e8f7ee] p-3 text-base font-semibold text-[#07391f]">
            {addedMessage}
          </p>
        ) : null}
        {errorMessage ? (
          <p role="alert" className="rounded-2xl border-2 border-[#b91c1c] bg-[#fdeaea] p-3 text-base font-semibold text-[#7f1111]">
            {errorMessage}
          </p>
        ) : null}
      </div>
    </div>
  );
}

export function FloatingCart({
  businessStatus,
  siteTheme,
  audience = "VIZINHA",
  whatsappUrl = getWhatsAppOrderUrl(),
}: {
  businessStatus: CartBusinessStatusData;
  siteTheme: StoreSiteTheme;
  audience?: CartAudience;
  whatsappUrl?: string;
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
  const [wizardStep, setWizardStep] = useState<1 | 2 | 3 | 4>(1);
  const [touched, setTouched] = useState(false);
  const stepHeadingRef = useRef<HTMLHeadingElement>(null);
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
  };

  const goToStep = (step: 1 | 2 | 3 | 4) => {
    setCheckoutStep("FORM");
    setWizardStep(step);
    setTouched(false);
    setActionError(null);
  };

  // A cada passo: volta ao topo e leva o foco ao título, para leitores de tela anunciarem a mudança.
  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => {
      cartScrollRef.current?.scrollTo({ top: 0 });
      stepHeadingRef.current?.focus({ preventScroll: true });
    }, 60);
    return () => window.clearTimeout(timer);
  }, [wizardStep, checkoutStep, open]);

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

  /** Muda a quantidade de um sabor da lista, respeitando o total de salgados e o limite de sabores. */
  const setFlavorQuantity = (item: CartItem, sabor: string, value: number) => {
    const maxTypes = item.usesMinimumQuantity
      ? getAllowedSalgadoTypes(item.requestedUnits, item.maxTiposSalgado, item.minimumQuantity)
      : item.maxTiposSalgado * item.quantity;
    const others = item.selectedItems.filter((entry) => entry.tipo !== sabor && entry.quantidade > 0);
    const othersTotal = others.reduce((sum, entry) => sum + entry.quantidade, 0);
    const wasSelected = item.selectedItems.some((entry) => entry.tipo === sabor && entry.quantidade > 0);
    const wanted = Math.max(0, Math.floor(Number.isFinite(value) ? value : 0));
    const next = Math.min(wanted, Math.max(0, item.requestedUnits - othersTotal));

    if (next > 0 && !wasSelected && others.length >= maxTypes) {
      setItemError({
        id: item.id,
        message: `Você já escolheu o máximo de ${maxTypes} sabores. Tire um sabor para poder escolher outro.`,
      });
      return;
    }

    setItemError(null);
    const ordered = item.saboresSugeridos.flatMap((name) => {
      if (name === sabor) return next > 0 ? [{ tipo: name, quantidade: next }] : [];
      const found = others.find((entry) => entry.tipo === name);
      return found ? [found] : [];
    });
    const outsideList = others.filter((entry) => !item.saboresSugeridos.includes(entry.tipo));
    updateSelectedItems(item, [...ordered, ...outsideList]);
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

  const nameValid = customerName.trim().length >= 2;
  const phoneValid = customerPhone.replace(/\D/g, "").length >= 10;
  const emailValid = /^\S+@\S+\.\S+$/.test(customerEmail.trim());
  const deliveryAddressMissing = fulfillmentType === "DELIVERY" && (!deliveryPlace.placeId || !deliveryPlace.neighborhood);
  const deliveryReferenceMissing = fulfillmentType === "DELIVERY" && deliveryReference.trim().length < 3;
  const stepErrors: Array<string | null> = [
    cartValidation ? getSimpleCartError(new Error(cartValidation), cartValidation) : null,
    !nameValid
      ? "Falta o seu nome."
      : !phoneValid
        ? "Falta o seu WhatsApp, com DDD."
        : !emailValid
          ? "Falta um e-mail válido. Usamos só para o pagamento."
          : null,
    deliveryAddressMissing
      ? "Falta escolher o endereço na lista de sugestões."
      : deliveryReferenceMissing
        ? "Falta o ponto de referência para o entregador."
        : selectedDateHasNoSchedule
          ? "Não atendemos nesse dia. Escolha outro dia."
          : storeClosedBlocksSelectedDate
            ? "Hoje a loja não está recebendo pedidos. Escolha outro dia."
            : !deliveryTimeIsValid
              ? "Falta escolher o horário."
              : null,
    null,
  ];
  const stepTitles = ["Meu pedido", "Seus dados", fulfillmentType === "DELIVERY" ? "Entrega e horário" : "Retirada e horário", "Pagamento"];
  const inReview = checkoutStep === "REVIEW" && !checkoutSession;
  const currentStepError = stepErrors[wizardStep - 1];
  const upcomingDays = getUpcomingOpenDays(minDeliveryDate, businessStatus.operationSchedule, 7)
    .filter((day) => businessStatus.isOpen || day !== getBusinessDateInputValue())
    .slice(0, 5);
  const bigButton = "h-auto min-h-14 min-w-0 whitespace-normal rounded-full px-4 py-3 text-lg font-extrabold sm:px-6";
  const radioCard = (selected: boolean) =>
    cn(
      "flex cursor-pointer items-start gap-3 rounded-2xl border-2 bg-white p-4 text-lg",
      selected ? "border-[var(--cart-accent)] bg-[var(--cart-surface)]" : "border-[var(--cart-border)]"
    );

  const continueStep = () => {
    if (currentStepError) {
      setTouched(true);
      setActionError(currentStepError);
      return;
    }
    setActionError(null);
    setTouched(false);
    if (wizardStep === 4) showReview();
    else goToStep((wizardStep + 1) as 1 | 2 | 3 | 4);
  };
  const goBack = () => {
    if (inReview) goToStep(4);
    else if (wizardStep > 1) goToStep((wizardStep - 1) as 1 | 2 | 3 | 4);
    else setOpen(false);
  };

  return (
    <>
      {!open ? (
        <div
          style={cartThemeStyle}
          className="fixed inset-x-0 bottom-0 z-40 border-t-2 border-[var(--cart-border)] bg-white px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 shadow-[0_-8px_30px_rgba(0,0,0,0.14)]"
        >
          <div className="mx-auto flex max-w-3xl flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
            {cart.itemCount > 0 ? (
              <>
                <p className="flex-1 text-lg font-extrabold text-[var(--cart-dark)]" aria-live="polite">
                  Meu pedido: {cart.itemCount} {cart.itemCount === 1 ? "item" : "itens"} · {formatCurrency(cart.totalAmount)}
                </p>
                <Button
                  type="button"
                  onClick={() => setOpen(true)}
                  className={cn(bigButton, "w-full bg-[var(--cart-accent)] text-white hover:bg-[var(--cart-accent-hover)] sm:w-auto")}
                >
                  <ShoppingCart className="mr-2 h-5 w-5" aria-hidden="true" />
                  Ver meu pedido
                </Button>
                <a
                  href={whatsappUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex min-h-12 items-center justify-center text-base font-bold text-[#07391f] underline underline-offset-4"
                >
                  Prefiro pedir pelo WhatsApp
                </a>
              </>
            ) : (
              <a
                href={whatsappUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex h-14 w-full items-center justify-center gap-2 rounded-full bg-[#0b6b3a] px-6 text-lg font-extrabold text-white hover:bg-[#095a30]"
              >
                <MessageCircle className="h-6 w-6" aria-hidden="true" />
                Pedir pelo WhatsApp
              </a>
            )}
          </div>
        </div>
      ) : null}

      <CartRoot
        modal={false}
        open={open}
        onOpenChange={(nextOpen) => {
          setOpen(nextOpen);
          if (!nextOpen && !checkoutSession) setCheckoutStep("FORM");
          if (!nextOpen && checkoutPaid) {
            setCheckoutSession(null);
            setCheckoutPaid(false);
            setWizardStep(1);
          }
        }}
      >
        <CartContent
          style={cartThemeStyle}
          className={cn(
            "grid grid-cols-[minmax(0,1fr)] grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden bg-white p-0",
            isDesktop
              ? "h-[min(90vh,56rem)] w-[94vw] max-w-none rounded-2xl sm:w-[94vw] sm:max-w-none md:w-[92vw] md:max-w-4xl lg:w-[80vw] lg:max-w-4xl [&>[data-slot=dialog-close]]:hidden"
              : "max-h-[94vh] rounded-t-3xl border-x-0 border-b-0 [&>[data-slot=drawer-header]]:pt-2"
          )}
        >
          <DialogHeader className={cn("gap-2 border-b-2 border-[var(--cart-border)] bg-white px-4 py-3 text-left sm:px-6", !isDesktop && "pt-6")}>
            <div className="flex items-start justify-between gap-3">
              <div>
                {isDesktop ? (
                  <DialogTitle className="text-2xl font-extrabold text-[var(--cart-dark)]">
                    {checkoutSession ? "Pagamento" : inReview ? "Confira e pague" : "Meu pedido"}
                  </DialogTitle>
                ) : (
                  <DrawerTitle className="text-2xl font-extrabold text-[var(--cart-dark)]">
                    {checkoutSession ? "Pagamento" : inReview ? "Confira e pague" : "Meu pedido"}
                  </DrawerTitle>
                )}
                {!checkoutSession && cart.items.length > 0 ? (
                  <p className="mt-1 text-lg font-bold text-[var(--cart-muted)]">
                    {inReview ? "Último passo" : `Passo ${wizardStep} de 4: ${stepTitles[wizardStep - 1]}`}
                  </p>
                ) : null}
              </div>
              {isDesktop ? (
                <DialogClose asChild>
                  <Button type="button" variant="outline" className="h-12 shrink-0 rounded-full border-2 border-[var(--cart-border)] px-4 text-[var(--cart-dark)]">
                    <X className="mr-1 h-5 w-5" aria-hidden="true" /> Fechar
                  </Button>
                </DialogClose>
              ) : (
                <DrawerClose asChild>
                  <Button type="button" variant="outline" className="h-12 shrink-0 rounded-full border-2 border-[var(--cart-border)] px-4 text-[var(--cart-dark)]">
                    <X className="mr-1 h-5 w-5" aria-hidden="true" /> Fechar
                  </Button>
                </DrawerClose>
              )}
            </div>
            {!checkoutSession && cart.items.length > 0 ? (
              <div className="flex gap-2" role="img" aria-label={inReview ? "Último passo" : `Passo ${wizardStep} de 4`}>
                {[1, 2, 3, 4].map((n) => (
                  <span key={n} className={cn("h-2 flex-1 rounded-full", inReview || n <= wizardStep ? "bg-[var(--cart-accent)]" : "bg-[var(--cart-border)]")} />
                ))}
              </div>
            ) : null}
          </DialogHeader>

          <div ref={cartScrollRef} className="min-h-0 overflow-y-auto overscroll-contain bg-[var(--cart-surface)] px-4 py-5 sm:px-6">
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
              <div className="rounded-2xl border-2 border-dashed border-[var(--cart-border)] bg-white p-8 text-center">
                <p className="text-xl font-bold text-[var(--cart-dark)]">Seu pedido está vazio.</p>
                <p className="mt-2 text-lg text-[var(--cart-muted)]">Escolha um salgado no cardápio e toque em “Adicionar ao pedido”.</p>
                <Button type="button" onClick={() => setOpen(false)} className={cn(bigButton, "mt-4 bg-[var(--cart-accent)] text-white")}>
                  Ver os salgados
                </Button>
              </div>
            ) : inReview ? (
              <div className="mx-auto max-w-2xl space-y-4">
                <h2 ref={stepHeadingRef} tabIndex={-1} className="text-2xl font-extrabold text-[var(--cart-dark)] outline-none">
                  Confira tudo antes de pagar
                </h2>
                <div className="rounded-2xl border-2 border-[var(--cart-border)] bg-white p-5">
                  <h3 className="text-xl font-extrabold text-[var(--cart-dark)]">O que você pediu</h3>
                  <ul className="mt-4 space-y-3">
                    {cart.items.map((item) => (
                      <li key={item.id} className="border-b border-[var(--cart-border)] pb-3 last:border-0 last:pb-0">
                        <div className="flex justify-between gap-4 text-lg font-bold text-[var(--cart-dark)]">
                          <span>{item.usesMinimumQuantity ? `${item.requestedUnits} salgados de ${item.name}` : `${item.quantity} × ${item.name}`}</span>
                          <span>{formatCurrency(item.subtotal)}</span>
                        </div>
                        <p className="mt-1 text-base text-[var(--cart-muted)]">
                          {item.selectedItems.filter((entry) => entry.quantidade > 0).map((entry) => `${entry.quantidade} ${entry.tipo}`).join(" · ")}
                        </p>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="rounded-2xl border-2 border-[var(--cart-border)] bg-white p-5 text-lg text-[var(--cart-muted)]">
                  <h3 className="text-xl font-extrabold text-[var(--cart-dark)]">Seus dados</h3>
                  <p className="mt-3"><strong className="text-[var(--cart-dark)]">Nome:</strong> {customerName}</p>
                  <p><strong className="text-[var(--cart-dark)]">WhatsApp:</strong> {customerPhone}</p>
                  <p><strong className="text-[var(--cart-dark)]">Como vai receber:</strong> {fulfillmentType === "DELIVERY" ? "Entrega" : "Retirada"}</p>
                  {fulfillmentType === "DELIVERY" ? (
                    <>
                      <p><strong className="text-[var(--cart-dark)]">Endereço:</strong> {deliveryAddress}</p>
                      <p><strong className="text-[var(--cart-dark)]">Referência:</strong> {deliveryReference}</p>
                    </>
                  ) : null}
                  <p><strong className="text-[var(--cart-dark)]">Dia e hora:</strong> {formatDateLabel(deliveryDate)} às {deliveryTime}</p>
                </div>

                <div className="rounded-2xl border-2 border-[var(--cart-accent)] bg-white p-5">
                  <h3 className="text-xl font-extrabold text-[var(--cart-dark)]">Valores</h3>
                  <div className="mt-4 space-y-2 text-lg text-[var(--cart-muted)]">
                    <div className="flex justify-between gap-4"><span>Produtos</span><span>{formatCurrency(cart.totalAmount)}</span></div>
                    <div className="flex justify-between gap-4"><span>Entrega</span><span>{fulfillmentType === "DELIVERY" ? (deliveryFee.agreed ? formatCurrency(deliveryFee.fee) : "A combinar") : "Grátis"}</span></div>
                    <div className="flex justify-between gap-4 border-t border-[var(--cart-border)] pt-2 font-bold text-[var(--cart-dark)]"><span>Total do pedido</span><span>{formatCurrency(orderTotal)}</span></div>
                    <div className="flex justify-between gap-4"><span>Pagando agora ({paymentPercentage}%)</span><span>{formatCurrency(paymentPreview.baseAmount)}</span></div>
                    {paymentPreview.feeAmount > 0 ? <div className="flex justify-between gap-4"><span>Taxa da forma de pagamento</span><span>{formatCurrency(paymentPreview.feeAmount)}</span></div> : null}
                    <div className="mt-3 flex justify-between gap-4 rounded-xl bg-[var(--cart-surface)] p-3 text-xl font-extrabold text-[var(--cart-dark)]"><span>Você paga agora</span><span>{formatCurrency(paymentPreview.totalToCharge)}</span></div>
                    {paymentPercentage === 50 ? <p className="pt-1 text-base">O restante, {formatCurrency(orderTotal - paymentPreview.baseAmount)}, você paga depois.</p> : null}
                  </div>
                </div>
              </div>
            ) : wizardStep === 1 ? (
              <div className="mx-auto max-w-3xl space-y-5">
                <h2 ref={stepHeadingRef} tabIndex={-1} className="text-2xl font-extrabold text-[var(--cart-dark)] outline-none">
                  Confira o que você escolheu
                </h2>
                <ul className="space-y-5">
                  {cart.items.map((item) => {
                    const selectedTotal = item.selectedItems.reduce((sum, entry) => sum + Number(entry.quantidade || 0), 0);
                    const missing = Math.max(0, item.requestedUnits - selectedTotal);
                    const maxTypes = item.usesMinimumQuantity
                      ? getAllowedSalgadoTypes(item.requestedUnits, item.maxTiposSalgado, item.minimumQuantity)
                      : item.maxTiposSalgado * item.quantity;
                    const chosenCount = item.selectedItems.filter((entry) => entry.quantidade > 0).length;
                    const draftUnits = Math.floor(Number(quantityDrafts[item.id] ?? item.requestedUnits)) || item.requestedUnits;
                    const busy = loadingId === item.id;
                    return (
                      <li key={item.id} className="rounded-3xl border-2 border-[var(--cart-border)] bg-white p-4 sm:p-5">
                        <div className="flex gap-4">
                          <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-slate-100">
                            <Image src={item.image} alt={`Foto de ${item.name}`} fill unoptimized className="object-cover" />
                          </div>
                          <div className="min-w-0">
                            <h3 className="text-xl font-extrabold leading-snug text-[var(--cart-dark)]">{item.name}</h3>
                            <p className="text-lg font-bold text-[var(--cart-accent)]">{formatCurrency(item.subtotal)}</p>
                          </div>
                        </div>

                        <div className="mt-4 space-y-2">
                          <label htmlFor={`qtd-${item.id}`} className="block text-lg font-bold text-[var(--cart-dark)]">
                            {item.usesMinimumQuantity ? "Quantidade de salgados" : "Quantidade"}
                          </label>
                          <div className="flex flex-wrap items-center gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              disabled={busy || (item.usesMinimumQuantity ? draftUnits - 10 < item.minimumQuantity : item.quantity <= 1)}
                              onClick={() => void setItemQuantity(item, item.usesMinimumQuantity ? Math.max(item.minimumQuantity, draftUnits - 10) : item.quantity - 1)}
                              className="h-14 w-14 shrink-0 rounded-full border-2 border-[var(--cart-accent)] text-[var(--cart-accent)]"
                              aria-label={`Diminuir a quantidade de ${item.name}`}
                            >
                              <Minus className="h-6 w-6" aria-hidden="true" />
                            </Button>
                            {item.usesMinimumQuantity ? (
                              <Input
                                id={`qtd-${item.id}`}
                                type="number"
                                inputMode="numeric"
                                min={item.minimumQuantity}
                                step="1"
                                value={quantityDrafts[item.id] ?? String(item.requestedUnits)}
                                onChange={(event) => { setQuantityDrafts((current) => ({ ...current, [item.id]: event.target.value })); setItemError(null); }}
                                onBlur={() => commitRequestedUnits(item)}
                                onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }}
                                className="h-14 min-w-[6rem] flex-1 rounded-full border-2 border-[var(--cart-border)] text-center text-2xl font-extrabold"
                              />
                            ) : (
                              <output id={`qtd-${item.id}`} className="flex h-14 min-w-[6rem] flex-1 items-center justify-center rounded-full border-2 border-[var(--cart-border)] text-2xl font-extrabold text-[var(--cart-dark)]">
                                {item.quantity}
                              </output>
                            )}
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              disabled={busy}
                              onClick={() => void setItemQuantity(item, item.usesMinimumQuantity ? draftUnits + 10 : item.quantity + 1)}
                              className="h-14 w-14 shrink-0 rounded-full border-2 border-[var(--cart-accent)] text-[var(--cart-accent)]"
                              aria-label={`Aumentar a quantidade de ${item.name}`}
                            >
                              <Plus className="h-6 w-6" aria-hidden="true" />
                            </Button>
                          </div>
                          {item.usesMinimumQuantity ? (
                            <div className="flex flex-wrap gap-2" role="group" aria-label="Somar de uma vez">
                              {[50, 100].map((amount) => (
                                <Button key={amount} type="button" variant="outline" disabled={busy} onClick={() => void setItemQuantity(item, draftUnits + amount)} className="h-12 rounded-full border-2 border-[var(--cart-border)] px-5 font-bold text-[var(--cart-dark)]">
                                  + {amount}
                                </Button>
                              ))}
                            </div>
                          ) : null}
                        </div>

                        {itemError?.id === item.id ? (
                          <p role="alert" className="mt-3 rounded-2xl border-2 border-[#b91c1c] bg-[#fdeaea] p-3 text-base font-semibold text-[#7f1111]">{itemError.message}</p>
                        ) : null}

                        {item.precisaSelecaoDeTipos ? (
                          <fieldset className="mt-5 space-y-3 rounded-2xl bg-[var(--cart-surface)] p-3 sm:p-4">
                            <legend className="px-1 text-xl font-extrabold text-[var(--cart-dark)]">
                              {item.category === "COMBO" ? "O que vem no combo" : "Escolha os sabores"}
                            </legend>

                            {item.category === "COMBO" ? (
                              <ul className="space-y-1 text-lg text-[var(--cart-dark)]">
                                {item.selectedItems.map((entry) => (
                                  <li key={entry.tipo}>{entry.quantidade} {entry.tipo}</li>
                                ))}
                              </ul>
                            ) : (
                              <>
                                <div aria-live="polite" className="rounded-2xl border-2 border-[var(--cart-border)] bg-white p-3 text-lg">
                                  <p className={cn("font-extrabold", missing === 0 && selectedTotal === item.requestedUnits ? "text-[#07391f]" : "text-[var(--cart-dark)]")}>
                                    Você escolheu {selectedTotal} de {item.requestedUnits} salgados.{" "}
                                    {selectedTotal > item.requestedUnits
                                      ? `Passou ${selectedTotal - item.requestedUnits}: tire alguns.`
                                      : missing > 0
                                        ? `Faltam ${missing}.`
                                        : "Tudo certo ✓"}
                                  </p>
                                  <p className="text-[var(--cart-muted)]">
                                    Sabores escolhidos: {chosenCount} de {maxTypes} (é o máximo para essa quantidade).
                                  </p>
                                  {chosenCount >= maxTypes ? (
                                    <p className="mt-1 font-semibold text-[var(--cart-dark)]">
                                      Você já escolheu o máximo de sabores. Para escolher outro, tire um sabor ou peça mais salgados.
                                    </p>
                                  ) : null}
                                </div>

                                {item.saboresSugeridos.length > 0 ? (
                                  <ul className="space-y-2">
                                    {item.saboresSugeridos.map((sabor) => {
                                      const current = item.selectedItems.find((entry) => entry.tipo === sabor)?.quantidade ?? 0;
                                      const blockedByLimit = current === 0 && chosenCount >= maxTypes;
                                      const rowId = `sabor-${item.id}-${sabor.replace(/\W+/g, "-")}`;
                                      return (
                                        <li key={sabor} className="rounded-2xl border-2 border-[var(--cart-border)] bg-white p-3">
                                          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                            <label htmlFor={rowId} className="text-lg font-bold text-[var(--cart-dark)]">{sabor}</label>
                                            <div className="flex flex-wrap items-center gap-2">
                                              <Button type="button" variant="outline" size="icon" disabled={current === 0} onClick={() => setFlavorQuantity(item, sabor, current - 1)} className="h-12 w-12 rounded-full border-2 border-[var(--cart-accent)] text-[var(--cart-accent)]" aria-label={`Tirar um ${sabor}`}>
                                                <Minus className="h-5 w-5" aria-hidden="true" />
                                              </Button>
                                              <Input id={rowId} type="number" inputMode="numeric" min="0" step="1" value={current} onChange={(event) => setFlavorQuantity(item, sabor, Math.floor(Number(event.target.value || 0)))} className="h-12 w-20 rounded-full border-2 border-[var(--cart-border)] px-1 text-center text-xl font-extrabold" />
                                              <Button type="button" variant="outline" size="icon" disabled={blockedByLimit || missing === 0} onClick={() => setFlavorQuantity(item, sabor, current + 1)} className="h-12 w-12 rounded-full border-2 border-[var(--cart-accent)] text-[var(--cart-accent)]" aria-label={`Colocar mais um ${sabor}`}>
                                                <Plus className="h-5 w-5" aria-hidden="true" />
                                              </Button>
                                              <Button type="button" variant="outline" disabled={blockedByLimit || missing === 0} onClick={() => setFlavorQuantity(item, sabor, current + Math.min(10, missing))} className="h-12 rounded-full border-2 border-[var(--cart-border)] px-4 font-bold text-[var(--cart-dark)]" aria-label={`Colocar mais 10 de ${sabor}`}>
                                                + 10
                                              </Button>
                                            </div>
                                          </div>
                                          {blockedByLimit ? <p className="mt-2 text-base text-[var(--cart-muted)]">Limite de sabores atingido.</p> : null}
                                          {missing > 0 && !blockedByLimit ? (
                                            <button type="button" onClick={() => setFlavorQuantity(item, sabor, current + missing)} className="mt-2 min-h-12 text-base font-bold text-[var(--cart-accent)] underline underline-offset-4">
                                              Colocar os {missing} que faltam em {sabor}
                                            </button>
                                          ) : null}
                                        </li>
                                      );
                                    })}
                                  </ul>
                                ) : (
                                  <div className="space-y-3">
                                    {(item.selectedItems.length > 0 ? item.selectedItems : [{ tipo: "", quantidade: 0 }]).map((entry, index) => (
                                      <div key={`${item.id}-${index}`} className="grid gap-3 rounded-2xl border-2 border-[var(--cart-border)] bg-white p-3 sm:grid-cols-[1fr_8rem_auto]">
                                        <div className="space-y-1">
                                          <label htmlFor={`livre-${item.id}-${index}`} className="text-base font-bold text-[var(--cart-dark)]">Sabor {index + 1}</label>
                                          <Input id={`livre-${item.id}-${index}`} value={entry.tipo} onChange={(event) => patchSelectedItem(item, index, { tipo: event.target.value })} placeholder="Ex.: coxinha" />
                                        </div>
                                        <div className="space-y-1">
                                          <label htmlFor={`livre-q-${item.id}-${index}`} className="text-base font-bold text-[var(--cart-dark)]">Quantos</label>
                                          <Input id={`livre-q-${item.id}-${index}`} type="number" inputMode="numeric" min="0" step="1" value={entry.quantidade} onChange={(event) => patchSelectedItem(item, index, { quantidade: Math.max(0, Math.floor(Number(event.target.value || 0))) })} />
                                        </div>
                                        <div className="flex items-end">
                                          <Button type="button" variant="outline" disabled={item.selectedItems.length <= 1} onClick={() => removeSelectedItem(item, index)} className="w-full border-2 border-[var(--cart-border)] text-[var(--cart-accent)] sm:w-auto">
                                            Tirar
                                          </Button>
                                        </div>
                                      </div>
                                    ))}
                                    <Button type="button" variant="outline" disabled={item.selectedItems.length >= maxTypes} onClick={() => updateSelectedItems(item, [...item.selectedItems, { tipo: "", quantidade: 0 }])} className="border-2 border-[var(--cart-border)] font-bold text-[var(--cart-accent)]">
                                      <Plus className="mr-2 h-5 w-5" aria-hidden="true" /> Adicionar outro sabor
                                    </Button>
                                  </div>
                                )}
                              </>
                            )}
                          </fieldset>
                        ) : null}

                        <div className="mt-4 flex justify-end">
                          <Button type="button" variant="outline" disabled={busy} onClick={() => void removeItem(item)} className="h-12 rounded-full border-2 border-[#b91c1c] px-5 font-bold text-[#7f1111] hover:bg-[#fdeaea]">
                            <Trash2 className="mr-2 h-5 w-5" aria-hidden="true" /> Tirar este item do pedido
                          </Button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
                <a href={whatsappUrl} target="_blank" rel="noopener noreferrer" className="flex min-h-12 items-center justify-center text-base font-bold text-[#07391f] underline underline-offset-4">
                  Prefiro pedir pelo WhatsApp
                </a>
              </div>
            ) : wizardStep === 2 ? (
              <div className="mx-auto max-w-2xl space-y-5">
                <h2 ref={stepHeadingRef} tabIndex={-1} className="text-2xl font-extrabold text-[var(--cart-dark)] outline-none">
                  Quem está fazendo o pedido?
                </h2>
                <div className="space-y-5 rounded-2xl border-2 border-[var(--cart-border)] bg-white p-4 sm:p-5">
                  <div className="space-y-2">
                    <label htmlFor="cart-customer-name" className="block text-lg font-bold text-[var(--cart-dark)]">Seu nome</label>
                    <Input id="cart-customer-name" autoComplete="name" value={customerName} onChange={(event) => { setCustomerName(event.target.value); setActionError(null); }} aria-invalid={!nameValid && (touched || customerName.length > 0)} aria-describedby="erro-nome" className="h-14 text-lg" />
                    {!nameValid && (touched || customerName.length > 0) ? <p id="erro-nome" role="alert" className="text-base font-bold text-[#7f1111]">Falta o seu nome.</p> : null}
                  </div>
                  <div className="space-y-2">
                    <label htmlFor="cart-customer-phone" className="block text-lg font-bold text-[var(--cart-dark)]">Seu WhatsApp (com DDD)</label>
                    <Input id="cart-customer-phone" type="tel" inputMode="tel" autoComplete="tel" value={customerPhone} onChange={(event) => { setCustomerPhone(formatWhatsAppInput(event.target.value)); setActionError(null); }} aria-invalid={!phoneValid && (touched || customerPhone.length > 0)} aria-describedby="dica-whats erro-whats" className="h-14 text-lg" />
                    <p id="dica-whats" className="text-base text-[var(--cart-muted)]">Exemplo: (83) 99999-9999. Falamos com você por aqui para confirmar o pedido.</p>
                    {!phoneValid && (touched || customerPhone.length > 0) ? <p id="erro-whats" role="alert" className="text-base font-bold text-[#7f1111]">Falta o número completo, com DDD.</p> : null}
                  </div>
                  <div className="space-y-2">
                    <label htmlFor="cart-customer-email" className="block text-lg font-bold text-[var(--cart-dark)]">Seu e-mail</label>
                    <Input id="cart-customer-email" type="email" inputMode="email" autoComplete="email" value={customerEmail} onChange={(event) => { setCustomerEmail(event.target.value); setActionError(null); }} aria-invalid={!emailValid && (touched || customerEmail.length > 0)} aria-describedby="dica-email erro-email" className="h-14 text-lg" />
                    <p id="dica-email" className="text-base text-[var(--cart-muted)]">Usamos só para o pagamento. Exemplo: maria@email.com</p>
                    {!emailValid && (touched || customerEmail.length > 0) ? <p id="erro-email" role="alert" className="text-base font-bold text-[#7f1111]">Falta um e-mail válido, com @.</p> : null}
                  </div>
                </div>
              </div>
            ) : wizardStep === 3 ? (
              <div className="mx-auto max-w-2xl space-y-5">
                <h2 ref={stepHeadingRef} tabIndex={-1} className="text-2xl font-extrabold text-[var(--cart-dark)] outline-none">
                  Como e quando você quer receber?
                </h2>

                <fieldset className="space-y-3">
                  <legend className="mb-1 text-lg font-bold text-[var(--cart-dark)]">Como você quer receber?</legend>
                  <label className={radioCard(fulfillmentType === "PICKUP")}>
                    <input type="radio" name="recebimento" checked={fulfillmentType === "PICKUP"} onChange={() => { setFulfillmentType("PICKUP"); setActionError(null); }} className="mt-1 h-6 w-6 shrink-0 accent-[var(--cart-accent)]" />
                    <span><strong className="block">Vou buscar</strong><span className="text-base text-[var(--cart-muted)]">Retirada na Vizinha, sem custo.</span></span>
                  </label>
                  <label className={radioCard(fulfillmentType === "DELIVERY")}>
                    <input type="radio" name="recebimento" checked={fulfillmentType === "DELIVERY"} onChange={() => { setFulfillmentType("DELIVERY"); setActionError(null); }} className="mt-1 h-6 w-6 shrink-0 accent-[var(--cart-accent)]" />
                    <span><strong className="block">Quero que entreguem</strong><span className="text-base text-[var(--cart-muted)]">A taxa depende do bairro.</span></span>
                  </label>
                </fieldset>

                {fulfillmentType === "DELIVERY" ? (
                  <div className="space-y-4 rounded-2xl border-2 border-[var(--cart-border)] bg-white p-4 sm:p-5">
                    <div className="space-y-2">
                      <label htmlFor="cart-delivery-address" className="block text-lg font-bold text-[var(--cart-dark)]">Endereço de entrega</label>
                      <Input ref={addressInputRef} id="cart-delivery-address" autoComplete="off" defaultValue={deliveryAddress} onInput={() => { if (deliveryPlace.placeId) { setDeliveryPlace({ placeId: "", neighborhood: "", city: "", latitude: 0, longitude: 0 }); setDeliveryAddress(""); } }} aria-describedby="dica-endereco" className="h-14 text-lg" />
                      <p id="dica-endereco" className="text-base text-[var(--cart-muted)]">Digite a rua e o número e toque em uma das sugestões que aparecem.</p>
                      {deliveryPlace.placeId ? (
                        <p className="text-base font-bold text-[#07391f]">Bairro {deliveryPlace.neighborhood}: entrega {deliveryFee.agreed ? formatCurrency(deliveryFee.fee) : "com taxa a combinar"}.</p>
                      ) : touched && deliveryAddressMissing ? (
                        <p role="alert" className="text-base font-bold text-[#7f1111]">Falta escolher o endereço em uma das sugestões.</p>
                      ) : null}
                    </div>
                    <div className="space-y-2">
                      <label htmlFor="cart-delivery-reference" className="block text-lg font-bold text-[var(--cart-dark)]">Ponto de referência</label>
                      <Input id="cart-delivery-reference" value={deliveryReference} onChange={(event) => setDeliveryReference(event.target.value)} aria-describedby="dica-referencia" className="h-14 text-lg" />
                      <p id="dica-referencia" className="text-base text-[var(--cart-muted)]">Exemplo: perto da praça, portão azul.</p>
                      {touched && deliveryReferenceMissing ? <p role="alert" className="text-base font-bold text-[#7f1111]">Falta o ponto de referência.</p> : null}
                    </div>
                  </div>
                ) : null}

                <fieldset className="space-y-3 rounded-2xl border-2 border-[var(--cart-border)] bg-white p-4 sm:p-5">
                  <legend className="px-1 text-lg font-bold text-[var(--cart-dark)]">Qual dia?</legend>
                  <p className="text-base text-[var(--cart-muted)]">
                    Precisamos de pelo menos {effectiveMinimumLeadHours} {effectiveMinimumLeadHours === 1 ? "hora" : "horas"} de antecedência.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {upcomingDays.map((day) => (
                      <Button key={day} type="button" variant="outline" aria-pressed={deliveryDate === day} onClick={() => selectDeliveryDate(day)} className={cn("h-12 rounded-full border-2 px-4 text-base font-bold capitalize", deliveryDate === day ? "border-[var(--cart-accent)] bg-[var(--cart-accent)] text-white hover:bg-[var(--cart-accent-hover)] hover:text-white" : "border-[var(--cart-border)] text-[var(--cart-dark)]")}>
                        {formatShortDay(day)}
                      </Button>
                    ))}
                  </div>
                  <div className="space-y-2">
                    <label htmlFor="cart-delivery-date" className="block text-base font-bold text-[var(--cart-dark)]">Ou escolha outro dia</label>
                    <Input id="cart-delivery-date" type="date" min={minDeliveryDateKey} value={deliveryDate} onChange={(event) => selectDeliveryDate(event.target.value)} className="h-14 text-lg" />
                  </div>
                  <p className="text-lg font-bold capitalize text-[var(--cart-dark)]">
                    Dia escolhido: {formatDateLabel(deliveryDate)}
                  </p>
                  <p className="text-base text-[var(--cart-muted)] capitalize">
                    Funcionamento em {selectedWeekday}: {selectedSchedule ? `das ${selectedSchedule.openHour}h às ${selectedSchedule.closeHour}h` : "fechado"}.
                  </p>
                </fieldset>

                <div className="space-y-2 rounded-2xl border-2 border-[var(--cart-border)] bg-white p-4 sm:p-5">
                  <label htmlFor="cart-delivery-time" className="block text-lg font-bold text-[var(--cart-dark)]">
                    Que horas você quer {fulfillmentType === "DELIVERY" ? "receber" : "retirar"}?
                  </label>
                  <Select value={deliveryTime} onValueChange={(value) => { setDeliveryTime(value); setActionError(null); }}>
                    <SelectTrigger id="cart-delivery-time" className="h-14 w-full border-2 border-[var(--cart-border)] bg-white text-lg">
                      <SelectValue placeholder="Escolha o horário" />
                    </SelectTrigger>
                    <SelectContent>
                      {timeSlots.map((time) => (
                        <SelectItem key={time} value={time}>{time}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {selectedDateHasNoSchedule ? (
                    <p role="alert" className="text-base font-bold text-[#7f1111]">Não atendemos nesse dia. Escolha um dos dias acima.</p>
                  ) : storeClosedBlocksSelectedDate ? (
                    <p role="alert" className="text-base font-bold text-[#7f1111]">Hoje a loja não está recebendo pedidos. Escolha outro dia.</p>
                  ) : !deliveryTimeIsValid ? (
                    <p role="alert" className="text-base font-bold text-[#7f1111]">Falta escolher o horário.</p>
                  ) : (
                    <p className="text-base text-[var(--cart-muted)]">Há 15 minutos de tolerância de atraso para os dois lados.</p>
                  )}
                </div>
              </div>
            ) : (
              <div className="mx-auto max-w-2xl space-y-5">
                <h2 ref={stepHeadingRef} tabIndex={-1} className="text-2xl font-extrabold text-[var(--cart-dark)] outline-none">
                  Como você quer pagar?
                </h2>

                <fieldset className="space-y-3">
                  <legend className="mb-1 text-lg font-bold text-[var(--cart-dark)]">Quanto pagar agora?</legend>
                  {(allowsPartialPayment ? PAYMENT_PERCENTAGES : ([100] as const)).map((value) => {
                    const preview = calculatePaymentAmounts(orderTotal, value, paymentMethod);
                    return (
                      <label key={value} className={radioCard(paymentPercentage === value)}>
                        <input type="radio" name="percentual" checked={paymentPercentage === value} onChange={() => setPaymentPercentage(value)} className="mt-1 h-6 w-6 shrink-0 accent-[var(--cart-accent)]" />
                        <span>
                          <strong className="block">{value === 100 ? "Pagar tudo agora" : "Pagar metade agora (50%)"}</strong>
                          <span className="text-base text-[var(--cart-muted)]">{formatCurrency(preview.baseAmount)}{value === 50 ? ", e o restante depois" : ""}</span>
                        </span>
                      </label>
                    );
                  })}
                  {!allowsPartialPayment ? <p className="text-base text-[var(--cart-muted)]">Algum item do pedido só pode ser pago por inteiro.</p> : null}
                </fieldset>

                <fieldset className="space-y-3">
                  <legend className="mb-1 text-lg font-bold text-[var(--cart-dark)]">Forma de pagamento</legend>
                  {SUPPORTED_PAYMENT_METHODS.filter((method) => method.id === MetodoPagamento.PIX || method.id === MetodoPagamento.CARTAO_CREDITO || method.id === MetodoPagamento.CARTAO_DEBITO).map((method) => (
                    <label key={method.id} className={radioCard(paymentMethod === method.id)}>
                      <input type="radio" name="forma" checked={paymentMethod === method.id} onChange={() => setPaymentMethod(method.id)} className="mt-1 h-6 w-6 shrink-0 accent-[var(--cart-accent)]" />
                      <span><strong className="block">{method.label}</strong><span className="text-base text-[var(--cart-muted)]">{method.description}</span></span>
                    </label>
                  ))}
                </fieldset>

                <p className="rounded-2xl border-2 border-[var(--cart-accent)] bg-white p-4 text-xl font-extrabold text-[var(--cart-dark)]" aria-live="polite">
                  Você paga agora: {formatCurrency(paymentPreview.totalToCharge)}
                  {paymentPreview.feeAmount > 0 ? <span className="block text-base font-medium text-[var(--cart-muted)]">Já inclui a taxa da forma de pagamento ({formatCurrency(paymentPreview.feeAmount)}).</span> : null}
                </p>
              </div>
            )}
          </div>

          {!checkoutSession && cart.items.length > 0 ? (
            <div className="border-t-2 border-[var(--cart-border)] bg-white px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 sm:px-6">
              {actionError ? (
                <p role="alert" className="mb-3 rounded-2xl border-2 border-[#b91c1c] bg-[#fdeaea] p-3 text-base font-bold text-[#7f1111]">{actionError}</p>
              ) : null}
              <div className="mx-auto flex max-w-2xl gap-2 sm:gap-3">
                <Button type="button" variant="outline" disabled={checkingOut} onClick={goBack} className={cn(bigButton, "flex-1 border-2 border-[var(--cart-accent)] text-[var(--cart-accent)] sm:flex-none")}>
                  <ArrowLeft className="mr-2 h-5 w-5" aria-hidden="true" />
                  {wizardStep === 1 && !inReview ? "Escolher mais" : "Voltar"}
                </Button>
                {inReview ? (
                  <Button type="button" disabled={checkingOut} onClick={() => void checkout()} className={cn(bigButton, "flex-[2] bg-[var(--cart-accent)] text-white hover:bg-[var(--cart-accent-hover)]")}>
                    {checkingOut ? <LoaderCircle className="mr-2 h-5 w-5 animate-spin" aria-hidden="true" /> : null}
                    {checkingOut ? "Preparando o pagamento..." : `Pagar ${formatCurrency(paymentPreview.totalToCharge)}`}
                  </Button>
                ) : (
                  <Button type="button" disabled={checkingOut} onClick={continueStep} className={cn(bigButton, "flex-[2] bg-[var(--cart-accent)] text-white hover:bg-[var(--cart-accent-hover)]")}>
                    {wizardStep === 4 ? "Revisar o pedido" : "Continuar"}
                    <ArrowRight className="ml-2 h-5 w-5" aria-hidden="true" />
                  </Button>
                )}
              </div>
            </div>
          ) : (
            <div />
          )}
        </CartContent>
      </CartRoot>
    </>
  );
}
