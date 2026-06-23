"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import { MetodoPagamento } from "@prisma/client";
import { LoaderCircle, Minus, Plus, ShoppingCart, Trash2, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { calculatePaymentAmounts, formatCurrency } from "@/lib/pedidos";
import { SUPPORTED_PAYMENT_METHODS } from "@/lib/site-config";

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

let notifyCartChanged: (() => void) | null = null;

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

  const addToCart = async () => {
    try {
      setLoading(true);
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
      toast.error(error instanceof Error ? error.message : "Erro no carrinho.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mt-auto flex flex-col gap-3">
      <div className="flex h-11 items-center justify-between rounded-full border border-[#d6e7a2] bg-white px-2">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => setQuantity((current) => Math.max(1, current - 1))}
          className="h-8 w-8 rounded-full text-[#1b5e20]"
        >
          <Minus className="h-4 w-4" />
        </Button>
        <span className="min-w-10 text-center text-sm font-black text-[#0b3d18]">{quantity}</span>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => setQuantity((current) => current + 1)}
          className="h-8 w-8 rounded-full text-[#1b5e20]"
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      <Button
        type="button"
        disabled={loading}
        onClick={() => void addToCart()}
        className="rounded-full bg-[#1b7f31] text-white hover:bg-[#156326]"
      >
        {loading ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : <ShoppingCart className="mr-2 h-4 w-4" />}
        Adicionar
      </Button>
    </div>
  );
}

export function FloatingCart() {
  const [cart, setCart] = useState<CartData>(EMPTY_CART);
  const [open, setOpen] = useState(false);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [checkingOut, setCheckingOut] = useState(false);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [paymentPercentage, setPaymentPercentage] = useState<50 | 100>(50);
  const [paymentMethod, setPaymentMethod] = useState<MetodoPagamento>(MetodoPagamento.PIX);
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
      toast.error(error instanceof Error ? error.message : "Erro ao atualizar carrinho.");
    } finally {
      setLoadingId(null);
    }
  };

  const removeItem = async (item: CartItem) => {
    try {
      setLoadingId(item.id);
      const response = await fetch(`/api/cart/item/${item.id}`, { method: "DELETE" });

      if (!response.ok) throw new Error("Nao foi possivel remover.");
      updateCart((await response.json()) as CartData);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao remover item.");
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

  const canCheckout = useMemo(() => cart.items.length > 0 && !checkingOut, [cart.items.length, checkingOut]);
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

  useEffect(() => {
    if (!allowsPartialPayment && paymentPercentage === 50) {
      setPaymentPercentage(100);
    }
  }, [allowsPartialPayment, paymentPercentage]);

  const checkout = async () => {
    if (cartValidation) {
      toast.error(cartValidation);
      return;
    }

    try {
      setCheckingOut(true);
      await Promise.allSettled(Array.from(selectedItemsSavePromises.current));
      const response = await fetch("/api/checkout/cart", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerName,
          customerPhone,
          customerEmail,
          paymentPercentage,
          paymentMethod,
        }),
      });
      const data = (await response.json().catch(() => null)) as
        | { error?: string; redirectUrl?: string }
        | null;

      if (!response.ok || !data?.redirectUrl) {
        throw new Error(data?.error || "Nao foi possivel finalizar.");
      }

      window.location.assign(data.redirectUrl);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao finalizar pedido.");
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
        toast.error(error instanceof Error ? error.message : "Erro ao atualizar tipos.");
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

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[86vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Carrinho</DialogTitle>
          </DialogHeader>

          {cart.items.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-[#d6e7a2] p-8 text-center text-sm text-slate-500">
              Seu carrinho esta vazio.
            </div>
          ) : (
            <div className="space-y-4">
              {cart.items.map((item) => (
                <div
                  key={item.id}
                  className="grid gap-3 rounded-2xl border border-[#e4edc9] bg-[#fbfff0] p-3 sm:grid-cols-[72px_1fr_auto]"
                >
                  <div className="relative h-20 overflow-hidden rounded-xl bg-white sm:h-16">
                    <Image src={item.image} alt={item.name} fill unoptimized className="object-cover" />
                  </div>
                  <div>
                    <p className="font-bold text-[#0b3d18]">{item.name}</p>
                    <p className="text-sm text-slate-500">{item.type}</p>
                    <p className="mt-1 text-sm font-semibold text-[#1b5e20]">
                      {formatCurrency(item.subtotal)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 sm:justify-end">
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      disabled={loadingId === item.id}
                      onClick={() => void setItemQuantity(item, item.quantity - 1)}
                      className="h-9 w-9 rounded-full"
                    >
                      <Minus className="h-4 w-4" />
                    </Button>
                    <span className="w-8 text-center text-sm font-black">{item.quantity}</span>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      disabled={loadingId === item.id}
                      onClick={() => void setItemQuantity(item, item.quantity + 1)}
                      className="h-9 w-9 rounded-full"
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      disabled={loadingId === item.id}
                      onClick={() => void removeItem(item)}
                      className="h-9 w-9 rounded-full border-red-200 text-red-600 hover:bg-red-50"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="space-y-3 sm:col-span-3">
                    <div className="flex flex-col gap-3 rounded-[1.5rem] border border-[#dfeab9] bg-white p-3 sm:p-4">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-bold text-[#0b3d18]">Tipos do pedido</p>
                        <p className="text-xs text-slate-500">
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
                        <p className="text-xs text-slate-500">
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
                          className="h-9 rounded-xl border-[#d6e7a2] text-[#1b5e20]"
                        >
                          <Plus className="mr-2 h-4 w-4" />
                          Tipo
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}

              <div className="grid gap-3 rounded-2xl border border-[#d6e7a2] bg-white p-4 sm:grid-cols-3">
                <Input value={customerName} onChange={(event) => setCustomerName(event.target.value)} placeholder="Nome" />
                <Input value={customerPhone} onChange={(event) => setCustomerPhone(event.target.value)} placeholder="WhatsApp" />
                <Input value={customerEmail} onChange={(event) => setCustomerEmail(event.target.value)} placeholder="E-mail" />
              </div>

              <div className="grid gap-3 rounded-2xl border border-[#d6e7a2] bg-[#fbfff0] p-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-sm font-bold text-[#0b3d18]">Quanto pagar agora</label>
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
                  <p className="text-xs text-slate-500">
                    Base: {formatCurrency(paymentPreview.baseAmount)}
                  </p>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-bold text-[#0b3d18]">Forma de pagamento</label>
                  <Select
                    value={paymentMethod}
                    onValueChange={(value) => setPaymentMethod(value as MetodoPagamento)}
                  >
                    <SelectTrigger className="h-11 w-full border-[#d6e7a2] bg-white">
                      <SelectValue placeholder="Metodo" />
                    </SelectTrigger>
                    <SelectContent>
                      {SUPPORTED_PAYMENT_METHODS.map((method) => (
                        <SelectItem key={method.id} value={method.id}>
                          {method.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-slate-500">
                    {selectedPaymentMethod?.description || "Escolha a forma de pagamento."}
                  </p>
                </div>
              </div>

              <div className="flex flex-col gap-3 border-t border-[#e4edc9] pt-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm text-slate-500">Total do pedido</p>
                  <p className="text-2xl font-black text-[#0b3d18]">
                    {formatCurrency(cart.totalAmount)}
                  </p>
                  <p className="text-sm text-slate-500">
                    Cobrado agora: {formatCurrency(paymentPreview.totalToCharge)}
                  </p>
                  {cartValidation ? (
                    <p className="mt-1 max-w-sm text-xs font-medium text-amber-700">{cartValidation}</p>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void clearCart()}
                    className="rounded-full border-[#d6e7a2] text-[#1b5e20]"
                  >
                    <X className="mr-2 h-4 w-4" />
                    Limpar
                  </Button>
                  <Button
                    type="button"
                    disabled={!canCheckout || Boolean(cartValidation)}
                    onClick={() => void checkout()}
                    className="rounded-full bg-[#1b7f31] text-white hover:bg-[#156326]"
                  >
                    {checkingOut ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Finalizar Pedido
                  </Button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
