"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { MetodoPagamento } from "@prisma/client";
import { CardPayment, initMercadoPago } from "@mercadopago/sdk-react";
import { Check, CheckCircle2, Clock3, Copy, LoaderCircle, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/pedidos";

const mercadoPagoPublicKey = process.env.NEXT_PUBLIC_MERCADO_PAGO_PUBLIC_KEY?.trim() || "";

if (mercadoPagoPublicKey) {
  initMercadoPago(mercadoPagoPublicKey, { locale: "pt-BR" });
}

export type CartCheckoutSession = {
  orderId: string;
  externalReference: string;
  paymentMethod: MetodoPagamento;
  chargedAmount: number;
};

type PaymentStatus = "PENDING" | "PAID" | "CANCELLED";

type PixPaymentData = {
  qrCode: string | null;
  qrCodeBase64: string | null;
  expirationDate: string | null;
};

type PayResponse = {
  error?: string;
  status?: PaymentStatus;
  paymentStatus?: string;
  statusDetail?: string | null;
  message?: string | null;
  pix?: PixPaymentData;
};

type CardFormData = {
  token: string;
  issuer_id: string;
  payment_method_id: string;
  installments: number;
  payer: {
    email?: string;
    identification?: { type: string; number: string };
  };
};

type CardBrickError = {
  type?: string;
  cause?: string;
  message?: string;
};

function getCardBrickErrorMessage(error: CardBrickError, amount: number) {
  const detail = `${error.cause || ""} ${error.message || ""}`.toLowerCase();

  if (amount < 0.5 || detail.includes("amount")) {
    return "O valor deste teste e muito baixo para pagamento com cartão. Teste com um pedido de pelo menos R$ 0,50.";
  }

  if (
    detail.includes("public_key") ||
    detail.includes("credential") ||
    detail.includes("unauthorized")
  ) {
    return "Não foi possível validar a chave pública do Mercado Pago. Confira se Public Key e Access Token pertencem a mesma integração e ao mesmo ambiente.";
  }

  return "Não foi possível carregar o formulário do cartão. Atualize a página e tente novamente.";
}

export function CartTransparentPayment({
  session,
  customerEmail,
  onPaid,
}: {
  session: CartCheckoutSession;
  customerEmail: string;
  onPaid: () => void;
}) {
  const [status, setStatus] = useState<PaymentStatus>("PENDING");
  const [pix, setPix] = useState<PixPaymentData | null>(null);
  const [loadingPix, setLoadingPix] = useState(session.paymentMethod === MetodoPagamento.PIX);
  const [cardReady, setCardReady] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const pixStarted = useRef(false);
  const paidNotified = useRef(false);

  const applyResponse = useCallback((data: PayResponse) => {
    if (data.status) setStatus(data.status);
    if (data.pix) setPix(data.pix);
    if (data.message) setMessage(data.message);
  }, []);

  const createPixPayment = useCallback(async () => {
    try {
      setLoadingPix(true);
      setMessage(null);
      const response = await fetch(`/api/checkout/cart/${session.orderId}/pay`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = (await response.json().catch(() => null)) as PayResponse | null;

      if (!response.ok || !data) {
        throw new Error(data?.error || "Não foi possível gerar o Pix. Tente novamente.");
      }

      applyResponse(data);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível gerar o Pix. Tente novamente.");
    } finally {
      setLoadingPix(false);
    }
  }, [applyResponse, session.orderId]);

  useEffect(() => {
    if (session.paymentMethod !== MetodoPagamento.PIX || pixStarted.current) return;
    pixStarted.current = true;
    void createPixPayment();
  }, [createPixPayment, session.paymentMethod]);

  useEffect(() => {
    if (status !== "PENDING") return;

    const poll = async () => {
      try {
        const response = await fetch(`/api/checkout/cart/${session.orderId}/pay`, {
          cache: "no-store",
        });
        const data = (await response.json().catch(() => null)) as
          | { status?: PaymentStatus; pixExpirationDate?: string | null }
          | null;

        if (!response.ok || !data?.status) return;
        setStatus(data.status);

        if (
          data.status === "PENDING" &&
          data.pixExpirationDate &&
          new Date(data.pixExpirationDate).getTime() <= Date.now()
        ) {
          setMessage("Este Pix expirou. Gere um novo código para continuar.");
        }
      } catch {
        // O polling e silencioso; uma falha pontual de rede sera tentada novamente.
      }
    };

    const interval = window.setInterval(() => void poll(), 5000);
    return () => window.clearInterval(interval);
  }, [session.orderId, status]);

  useEffect(() => {
    if (status === "PAID" && !paidNotified.current) {
      paidNotified.current = true;
      onPaid();
    }
  }, [onPaid, status]);

  const payCard = async (formData: CardFormData) => {
    setMessage(null);
    const response = await fetch(`/api/checkout/cart/${session.orderId}/pay`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token: formData.token,
        payment_method_id: formData.payment_method_id,
        issuer_id: formData.issuer_id,
        installments: formData.installments,
        payer: {
          email: formData.payer.email || customerEmail,
          identification: formData.payer.identification,
        },
      }),
    });
    const data = (await response.json().catch(() => null)) as PayResponse | null;

    if (!response.ok || !data) {
      const errorMessage = data?.error || "Não foi possível enviar o pagamento. Tente novamente.";
      setMessage(errorMessage);
      throw new Error(errorMessage);
    }

    applyResponse(data);
  };

  const copyPix = async () => {
    if (!pix?.qrCode) return;

    try {
      await navigator.clipboard.writeText(pix.qrCode);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      setMessage("Não foi possível copiar automaticamente. Selecione o código abaixo e copie.");
    }
  };

  if (status === "PAID") {
    return (
      <div className="mx-auto max-w-xl rounded-3xl border border-emerald-200 bg-white p-6 text-center shadow-sm sm:p-8">
        <CheckCircle2 className="mx-auto h-16 w-16 text-emerald-600" />
        <h2 className="mt-4 text-2xl font-black text-[#0b3d18]">Pagamento aprovado!</h2>
        <p className="mt-2 text-base leading-7 text-[#405348]">
          Seu pedido foi confirmado. A equipe já recebeu as informações.
        </p>
      </div>
    );
  }

  const isPix = session.paymentMethod === MetodoPagamento.PIX;
  const pixExpired = Boolean(
    pix?.expirationDate && new Date(pix.expirationDate).getTime() <= Date.now(),
  );

  return (
    <div className="mx-auto w-full max-w-2xl space-y-5">
      <div className="rounded-2xl border border-[#b8ca7e] bg-white p-4 sm:p-6">
        <p className="text-sm font-bold uppercase tracking-[0.12em] text-[#52705a]">Pedido criado</p>
        <div className="mt-2 flex items-end justify-between gap-4">
          <div>
            <h2 className="text-2xl font-black text-[#0b3d18]">{isPix ? "Pague com Pix" : "Pague com cartão"}</h2>
            <p className="mt-1 text-base text-[#405348]">Valor: <strong>{formatCurrency(session.chargedAmount)}</strong></p>
          </div>
          <Clock3 className="h-9 w-9 shrink-0 text-amber-600" />
        </div>
      </div>

      {message ? (
        <div role="alert" className="rounded-2xl border border-red-300 bg-red-50 p-4 text-base font-bold text-red-800">
          {message}
        </div>
      ) : null}

      {isPix ? (
        <div className="rounded-3xl border border-[#b8ca7e] bg-white p-5 text-center sm:p-7">
          {loadingPix ? (
            <div className="py-12">
              <LoaderCircle className="mx-auto h-12 w-12 animate-spin text-[#176c2a]" />
              <p className="mt-4 text-lg font-bold text-[#0b3d18]">Gerando seu Pix...</p>
            </div>
          ) : pix?.qrCode && pix.qrCodeBase64 && !pixExpired ? (
            <>
              <p className="text-lg font-black text-[#0b3d18]">Abra o app do seu banco e leia o QR Code</p>
              <div className="mx-auto mt-4 w-fit rounded-2xl border border-[#d6e7a2] bg-white p-3">
                <Image
                  src={pix.qrCodeBase64.startsWith("data:") ? pix.qrCodeBase64 : `data:image/png;base64,${pix.qrCodeBase64}`}
                  alt="QR Code para pagamento Pix"
                  width={280}
                  height={280}
                  unoptimized
                  className="h-auto w-[min(70vw,280px)]"
                />
              </div>
              <p className="mt-5 text-base font-bold text-[#0b3d18]">Ou use o Pix copia e cola</p>
              <textarea
                readOnly
                value={pix.qrCode}
                aria-label="Código Pix copia e cola"
                className="mt-2 min-h-24 w-full resize-none rounded-xl border border-[#9fb66a] bg-[#fbfff0] p-3 text-sm text-[#17251a]"
                onFocus={(event) => event.currentTarget.select()}
              />
              <Button type="button" onClick={() => void copyPix()} className="mt-3 min-h-12 w-full rounded-full bg-[#176c2a] text-base font-black text-white">
                {copied ? <Check className="mr-2 h-5 w-5" /> : <Copy className="mr-2 h-5 w-5" />}
                {copied ? "Código copiado!" : "Copiar código Pix"}
              </Button>
              <div className="mt-5 rounded-xl bg-amber-50 p-4 text-left text-base text-amber-900">
                <strong>Aguardando o pagamento.</strong> Esta tela atualiza sozinha quando o Pix for confirmado.
              </div>
            </>
          ) : (
            <div className="py-6">
              <p className="text-lg font-bold text-red-800">O código Pix não está disponível.</p>
              <Button type="button" onClick={() => void createPixPayment()} className="mt-4 min-h-12 rounded-full bg-[#176c2a] px-6 text-base font-black text-white">
                <RefreshCw className="mr-2 h-5 w-5" />
                Gerar novo Pix
              </Button>
            </div>
          )}
        </div>
      ) : session.chargedAmount < 0.5 ? (
        <div role="alert" className="rounded-2xl border border-amber-300 bg-amber-50 p-5 text-base font-bold text-amber-900">
          O valor deste teste e muito baixo para pagamento com cartão. Teste com um pedido de pelo menos R$ 0,50.
        </div>
      ) : !mercadoPagoPublicKey ? (
        <div role="alert" className="rounded-2xl border border-red-300 bg-red-50 p-5 text-base font-bold text-red-800">
          Pagamento com cartão indisponível: configure NEXT_PUBLIC_MERCADO_PAGO_PUBLIC_KEY.
        </div>
      ) : (
        <div className="rounded-3xl border border-[#b8ca7e] bg-white p-3 sm:p-6">
          {!cardReady ? (
            <div className="flex items-center justify-center gap-3 py-4 text-base font-bold text-[#405348]">
              <LoaderCircle className="h-5 w-5 animate-spin" /> Carregando pagamento seguro...
            </div>
          ) : null}
          <CardPayment
            initialization={{ amount: session.chargedAmount, payer: { email: customerEmail } }}
            customization={{
              paymentMethods: {
                minInstallments: 1,
                maxInstallments: 1,
                types: {
                  included: [session.paymentMethod === MetodoPagamento.CARTAO_DEBITO ? "debit_card" : "credit_card"],
                },
              },
              visual: {
                style: {
                  theme: "default",
                  customVariables: {
                    baseColor: "#176c2a",
                    buttonTextColor: "#ffffff",
                    borderRadiusMedium: "12px",
                    fontSizeMedium: "16px",
                  },
                },
              },
            }}
            locale="pt-BR"
            onReady={() => setCardReady(true)}
            onError={(error) => {
              console.error("Mercado Pago Card Payment Brick failed", {
                type: error.type,
                cause: error.cause,
                message: error.message,
                paymentMethod: session.paymentMethod,
                chargedAmount: session.chargedAmount,
              });
              setCardReady(true);
              setMessage(getCardBrickErrorMessage(error, session.chargedAmount));
            }}
            onSubmit={(formData) => payCard(formData as CardFormData)}
          />
          <p className="px-2 pb-2 text-center text-sm text-[#405348]">
            Os dados do cartão sao protegidos pelo Mercado Pago. Nosso servidor recebe somente um token seguro.
          </p>
        </div>
      )}
    </div>
  );
}
