"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
import { LoaderCircle, Minus, Plus, ShieldCheck } from "lucide-react";
import { MetodoPagamento } from "@prisma/client";
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
import { calculatePaymentAmounts, formatCurrency } from "@/lib/pedidos";
import { BUSINESS_RULES } from "@/lib/site-config";
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
  totalUnidades: number;
  maxTiposSalgado: number;
  permitePagamentoParcial: boolean;
  saboresSugeridos: string[];
};

type ItemState = {
  tipo: string;
  quantidade: number;
};

const PAYMENT_PERCENTAGES = [50, 100] as const;

function getMinDateTimeValue() {
  const minDate = new Date(Date.now() + BUSINESS_RULES.minimumLeadHours * 60 * 60 * 1000);
  minDate.setMinutes(
    Math.ceil(minDate.getMinutes() / BUSINESS_RULES.slotMinutes) * BUSINESS_RULES.slotMinutes,
    0,
    0
  );

  const timezoneOffset = minDate.getTimezoneOffset() * 60_000;
  return new Date(minDate.getTime() - timezoneOffset).toISOString().slice(0, 16);
}

export function PedidoCheckout({
  produto,
  paymentMethods,
}: {
  produto: ProdutoCheckout;
  paymentMethods: PaymentMethodOption[];
}) {
  const [clienteNome, setClienteNome] = useState("");
  const [clienteTelefone, setClienteTelefone] = useState("");
  const [clienteEmail, setClienteEmail] = useState("");
  const [dataEntrega, setDataEntrega] = useState(getMinDateTimeValue());
  const [observacoes, setObservacoes] = useState("");
  const [percentualPagamento, setPercentualPagamento] = useState<50 | 100>(
    produto.permitePagamentoParcial ? 50 : 100
  );
  const [metodoPagamento, setMetodoPagamento] = useState<MetodoPagamento>(
    paymentMethods[0]?.id || MetodoPagamento.PIX
  );
  const [items, setItems] = useState<ItemState[]>(() => {
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
  const remaining = produto.totalUnidades - totalUnidades;
  const activeTypes = useMemo(
    () => items.filter((item) => item.tipo.trim() && item.quantidade > 0).length,
    [items]
  );

  const selectedMethod = paymentMethods.find((method) => method.id === metodoPagamento);
  const paymentPreview = useMemo(
    () => calculatePaymentAmounts(produto.preco, percentualPagamento, metodoPagamento),
    [produto.preco, percentualPagamento, metodoPagamento]
  );

  const canAddType = items.length < produto.maxTiposSalgado;
  const canSubmit =
    clienteNome.trim().length >= 2 &&
    clienteTelefone.trim().length >= 10 &&
    totalUnidades === produto.totalUnidades &&
    activeTypes > 0 &&
    activeTypes <= produto.maxTiposSalgado &&
    !submitting;

  const updateItem = (index: number, patch: Partial<ItemState>) => {
    setItems((current) =>
      current.map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...patch } : item
      )
    );
  };

  const addType = () => {
    if (!canAddType) {
      return;
    }

    setItems((current) => [...current, { tipo: "", quantidade: 0 }]);
  };

  const removeType = (index: number) => {
    setItems((current) => current.filter((_, itemIndex) => itemIndex !== index));
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
          clienteNome,
          clienteTelefone,
          clienteEmail,
          observacoes,
          dataEntrega,
          percentualPagamento,
          metodoPagamento,
          itens: items,
        }),
      });

      const data = (await response.json().catch(() => null)) as
        | { error?: string; redirectUrl?: string }
        | null;

      if (!response.ok || !data?.redirectUrl) {
        throw new Error(data?.error || "Não foi possível iniciar o pagamento.");
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
        <Card className="overflow-hidden border-pink-200 bg-white/95 shadow-lg shadow-pink-100/30">
          <div className="grid gap-0 md:grid-cols-[260px_1fr]">
            <div className="relative min-h-72 bg-pink-50">
              <Image
                src={produto.imagemBase64}
                alt={produto.nome}
                fill
                unoptimized
                className="object-cover"
              />
            </div>

            <CardContent className="space-y-4 p-6">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.22em] text-pink-600">
                  Produto selecionado
                </p>
                <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900">
                  {produto.nome}
                </h1>
                <p className="mt-3 text-sm leading-6 text-slate-600">{produto.descricao}</p>
              </div>

              <div className="grid gap-3 rounded-[1.5rem] bg-[#fff7fb] p-4 text-sm text-slate-700 sm:grid-cols-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-pink-600">
                    Valor base
                  </p>
                  <p className="mt-2 text-lg font-semibold">{formatCurrency(produto.preco)}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-pink-600">
                    Unidades
                  </p>
                  <p className="mt-2 text-lg font-semibold">{produto.totalUnidades}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-pink-600">
                    Tipos
                  </p>
                  <p className="mt-2 text-lg font-semibold">Até {produto.maxTiposSalgado}</p>
                </div>
              </div>
            </CardContent>
          </div>
        </Card>

        <Card className="border-pink-200 bg-white/95 shadow-lg shadow-pink-100/30">
          <CardContent className="space-y-6 p-6">
            <div>
              <h2 className="text-2xl font-semibold text-slate-900">Monte os salgados</h2>
              <p className="mt-2 text-sm text-slate-500">
                A soma precisa fechar em {produto.totalUnidades} unidades e no máximo{" "}
                {produto.maxTiposSalgado} tipos.
              </p>
            </div>

            <div className="space-y-3">
              {items.map((item, index) => (
                <div
                  key={`${index}-${item.tipo}`}
                  className="grid gap-3 rounded-[1.5rem] border border-pink-100 bg-[#fff8fb] p-4 sm:grid-cols-[1fr_120px_auto]"
                >
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-700">
                      Tipo de salgado {index + 1}
                    </label>
                    {produto.saboresSugeridos.length > 0 ? (
                      <Select
                        value={item.tipo}
                        onValueChange={(value) => updateItem(index, { tipo: value })}
                      >
                        <SelectTrigger className="w-full border-pink-100 bg-white">
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
                    <label className="text-sm font-medium text-slate-700">Quantidade</label>
                    <Input
                      type="number"
                      min="0"
                      step="1"
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
                      disabled={items.length === 1}
                      className="w-full rounded-xl border-pink-200 text-pink-700 hover:bg-pink-50"
                    >
                      <Minus className="mr-2 h-4 w-4" />
                      Remover
                    </Button>
                  </div>
                </div>
              ))}

              <Button
                type="button"
                variant="outline"
                disabled={!canAddType}
                onClick={addType}
                className="rounded-full border-pink-200 text-pink-700 hover:bg-pink-50"
              >
                <Plus className="mr-2 h-4 w-4" />
                Adicionar tipo
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="border-pink-200 bg-white/95 shadow-lg shadow-pink-100/30">
          <CardContent className="grid gap-4 p-6 md:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">Nome</label>
              <Input value={clienteNome} onChange={(event) => setClienteNome(event.target.value)} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">Telefone / WhatsApp</label>
              <Input
                value={clienteTelefone}
                onChange={(event) => setClienteTelefone(event.target.value)}
                placeholder="(83) 99999-9999"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">E-mail</label>
              <Input
                type="email"
                value={clienteEmail}
                onChange={(event) => setClienteEmail(event.target.value)}
                placeholder="voce@email.com"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">Entrega</label>
              <Input
                type="datetime-local"
                min={getMinDateTimeValue()}
                step={BUSINESS_RULES.slotMinutes * 60}
                value={dataEntrega}
                onChange={(event) => setDataEntrega(event.target.value)}
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <label className="text-sm font-medium text-slate-700">Observações</label>
              <Textarea
                value={observacoes}
                onChange={(event) => setObservacoes(event.target.value)}
                className="min-h-24"
                placeholder="Ponto de referência, recheios preferidos, observações gerais..."
              />
            </div>
          </CardContent>
        </Card>
      </section>

      <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
        <Card className="border-pink-200 bg-white/95 shadow-lg shadow-pink-100/30">
          <CardContent className="space-y-5 p-6">
            <div>
              <h2 className="text-2xl font-semibold text-slate-900">Pagamento</h2>
              <p className="mt-2 text-sm text-slate-500">
                Escolha quanto pagar agora e selecione a forma de pagamento.
              </p>
            </div>

            <div className="grid gap-4 rounded-[1.5rem] border border-pink-100 bg-[#fff8fb] p-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">Quanto pagar agora</label>
                <Select
                  value={String(percentualPagamento)}
                  onValueChange={(value) => setPercentualPagamento(Number(value) as 50 | 100)}
                >
                  <SelectTrigger className="h-11 w-full border-pink-100 bg-white">
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
                <p className="text-sm text-slate-500">
                  Base do pagamento: {formatCurrency((produto.preco * percentualPagamento) / 100)}
                </p>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">Forma de pagamento</label>
                <Select
                  value={metodoPagamento}
                  onValueChange={(value) => setMetodoPagamento(value as MetodoPagamento)}
                >
                  <SelectTrigger className="h-11 w-full border-pink-100 bg-white">
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
                <p className="text-sm text-slate-500">
                  {selectedMethod?.description || "Escolha a forma de pagamento."}
                </p>
              </div>
            </div>

            <div className="rounded-[1.6rem] bg-[#1f0e17] p-5 text-white">
              <p className="text-xs font-black uppercase tracking-[0.22em] text-[#ff9fc1]">
                Resumo
              </p>
              <div className="mt-4 space-y-2 text-sm text-white/80">
                <div className="flex items-center justify-between gap-3">
                  <span>Produto</span>
                  <span>{formatCurrency(produto.preco)}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span>Percentual agora</span>
                  <span>{percentualPagamento}%</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span>Taxa de serviço</span>
                  <span>{formatCurrency(paymentPreview.feeAmount)}</span>
                </div>
                <div className="flex items-center justify-between gap-3 text-base font-semibold text-white">
                  <span>Total da etapa</span>
                  <span>{formatCurrency(paymentPreview.totalToCharge)}</span>
                </div>
              </div>
            </div>

            <div className="rounded-[1.5rem] border border-pink-100 bg-[#fff8fb] p-4 text-sm text-slate-600">
              <p className="font-semibold text-slate-900">Validação do pedido</p>
              <p className={cn("mt-2", remaining === 0 ? "text-emerald-700" : "text-amber-700")}>
                {remaining === 0
                  ? "Quantidade fechada corretamente."
                  : `Faltam ${remaining} unidades para completar o produto.`}
              </p>
              <p className="mt-1">
                Tipos ativos: {activeTypes} de {produto.maxTiposSalgado}
              </p>
              <p className="mt-1">
                Atendimento: terça a sábado, das 10h às 17h. Domingo, das 9h às 13h. Segunda fechado.
              </p>
              <p className="mt-1">
                Tolerância de {BUSINESS_RULES.toleranceMinutes} minutos.
              </p>
            </div>

            <Button
              type="button"
              disabled={!canSubmit}
              onClick={handleSubmit}
              className="h-12 rounded-full bg-pink-600 text-white hover:bg-pink-700"
            >
              {submitting ? (
                <>
                  <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
                  Redirecionando...
                </>
              ) : (
                "Ir para o pagamento"
              )}
            </Button>

            <div className="flex items-start gap-3 rounded-[1.4rem] border border-emerald-100 bg-emerald-50 p-4 text-sm text-emerald-900">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
              <p>
                Você será redirecionada para concluir o pagamento com{" "}
                <strong>{selectedMethod?.label || "o método selecionado"}</strong>.
              </p>
            </div>
          </CardContent>
        </Card>
      </aside>
    </div>
  );
}
