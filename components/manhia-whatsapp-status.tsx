"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { MessageCircle } from "lucide-react";

import { cn } from "@/lib/utils";

type Instance = { id: string; name: string; status: string };

const STATUS_UI: Record<string, { label: string; hint: string; className: string }> = {
  connected: { label: "WhatsApp conectado", hint: "O bot está atendendo.", className: "border-emerald-700 bg-emerald-50 text-emerald-950" },
  connecting: { label: "WhatsApp conectando…", hint: "Aguarde um instante.", className: "border-sky-700 bg-sky-50 text-sky-950" },
  reconnecting: { label: "WhatsApp reconectando…", hint: "A conexão caiu e está voltando sozinha.", className: "border-sky-700 bg-sky-50 text-sky-950" },
  standby: { label: "WhatsApp em espera", hint: "Outra cópia do bot está ativa (normal durante um deploy).", className: "border-sky-700 bg-sky-50 text-sky-950" },
  qr: { label: "WhatsApp precisa ler o QR", hint: "Abra o painel do bot e leia o QR com o celular.", className: "border-amber-700 bg-amber-50 text-amber-950" },
  disconnected: { label: "WhatsApp desconectado", hint: "Abra o painel do bot para conectar de novo.", className: "border-red-700 bg-red-50 text-red-950" },
  idle: { label: "WhatsApp parado", hint: "O bot está desligado. Abra o painel do bot para iniciar.", className: "border-slate-600 bg-slate-100 text-slate-900" },
  error: { label: "WhatsApp com erro", hint: "Abra o painel do bot para ver o que houve.", className: "border-red-700 bg-red-50 text-red-950" },
};

/** Resumo do WhatsApp na tela de pedidos, com atalho para controlar o bot e as conversas. */
export function ManhiaWhatsappStatus() {
  const [instances, setInstances] = useState<Instance[] | null>(null);
  const [failed, setFailed] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/manhia/bot/instances", { cache: "no-store" });
      const data = (await response.json().catch(() => null)) as Instance[] | { error?: string } | null;
      if (!response.ok || !Array.isArray(data)) throw new Error("falha");
      setInstances(data);
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    const first = window.setTimeout(() => void refresh(), 0);
    const interval = window.setInterval(() => void refresh(), 15000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(interval);
    };
  }, [refresh]);

  const main = instances?.find((item) => item.status === "connected") ?? instances?.[0];
  const ui = failed
    ? { label: "Não consegui ver o WhatsApp", hint: "Confira se o serviço do bot está no ar.", className: "border-red-700 bg-red-50 text-red-950" }
    : main
      ? (STATUS_UI[main.status] ?? { label: `WhatsApp: ${main.status}`, hint: "", className: "border-slate-600 bg-slate-100 text-slate-900" })
      : instances
        ? { label: "Nenhum WhatsApp cadastrado", hint: "Cadastre um número no painel do bot.", className: "border-slate-600 bg-slate-100 text-slate-900" }
        : { label: "Verificando o WhatsApp…", hint: "", className: "border-slate-600 bg-slate-100 text-slate-900" };

  return (
    <div className={cn("flex flex-col gap-3 rounded-3xl border-2 p-4 sm:flex-row sm:items-center sm:justify-between", ui.className)}>
      <div className="flex items-start gap-3">
        <MessageCircle className="mt-1 h-6 w-6 shrink-0" aria-hidden="true" />
        <div>
          <p className="text-xl font-extrabold">{ui.label}</p>
          {ui.hint ? <p className="text-base">{ui.hint}</p> : null}
        </div>
      </div>
      <Link
        href="/manhia/bot"
        className="inline-flex min-h-12 items-center justify-center rounded-full border-2 border-current bg-white px-5 text-base font-extrabold hover:bg-slate-50"
      >
        Controlar o bot e as conversas
      </Link>
    </div>
  );
}
