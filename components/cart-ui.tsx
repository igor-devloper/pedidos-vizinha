"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { LoaderCircle, Minus, Plus, ShoppingCart, Trash2, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { formatCurrency } from "@/lib/pedidos";

type CartItem = {
  id: string;
  productId: string;
  name: string;
  type: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
  image: string;
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
    notifyCartChanged?.();
  };

  const setItemQuantity = async (item: CartItem, quantity: number) => {
    try {
      setLoadingId(item.id);
      const response = await fetch(`/api/cart/item/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quantity: Math.max(1, quantity) }),
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

  const checkout = async () => {
    try {
      setCheckingOut(true);
      const response = await fetch("/api/checkout/cart", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerName, customerPhone, customerEmail }),
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
                </div>
              ))}

              <div className="grid gap-3 rounded-2xl border border-[#d6e7a2] bg-white p-4 sm:grid-cols-3">
                <Input value={customerName} onChange={(event) => setCustomerName(event.target.value)} placeholder="Nome" />
                <Input value={customerPhone} onChange={(event) => setCustomerPhone(event.target.value)} placeholder="WhatsApp" />
                <Input value={customerEmail} onChange={(event) => setCustomerEmail(event.target.value)} placeholder="E-mail" />
              </div>

              <div className="flex flex-col gap-3 border-t border-[#e4edc9] pt-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm text-slate-500">Total geral</p>
                  <p className="text-2xl font-black text-[#0b3d18]">
                    {formatCurrency(cart.totalAmount)}
                  </p>
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
                    disabled={!canCheckout}
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
