"use client";

import { useCallback, useEffect, useState } from "react";
import { LoaderCircle, MessageCircle, PauseCircle, PlayCircle } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type Conversation = {
  instanceId: string;
  remoteJid: string;
  lastAt: string;
  lastKind: "in" | "out";
  lastContent: string;
  pausedUntil: string | null;
  pauseReason: string | null;
  customerName: string | null;
  phone: string | null;
  draftStatus: string | null;
  draftStage: string | null;
  itemCount: number;
};

type LogEntry = {
  id: string;
  kind: "in" | "out" | "tool" | "event";
  content: string;
  meta: unknown;
  createdAt: string;
};

function formatTime(value: string) {
  // Os horários do banco chegam em UTC sem fuso explícito.
  let iso = value.replace(" ", "T");
  if (/[+-]\d{2}$/.test(iso)) iso += ":00";
  if (!/[zZ]|[+-]\d{2}:?\d{2}$/.test(iso)) iso += "Z";
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function conversationTitle(conversation: Conversation) {
  return conversation.customerName || conversation.phone || conversation.remoteJid.split("@")[0];
}

const STAGE_LABELS: Record<string, string> = {
  COLLECTING: "montando o pedido",
  AWAITING_CONFIRMATION: "aguardando confirmação",
  ORDER_CREATED: "pedido criado",
  HANDOFF: "com a Vizinha",
};

export function ManhiaConversationsPanel({ botConfigured }: { botConfigured: boolean }) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(false);
  const [actingKey, setActingKey] = useState<string | null>(null);
  const [openConversation, setOpenConversation] = useState<Conversation | null>(null);
  const [log, setLog] = useState<LogEntry[] | null>(null);

  const refresh = useCallback(async (quiet = true) => {
    try {
      setLoading(true);
      const response = await fetch("/api/manhia/bot/conversations", { cache: "no-store" });
      const data = (await response.json().catch(() => null)) as
        | { conversations?: Conversation[]; error?: string }
        | null;
      if (!response.ok || !data?.conversations) {
        throw new Error(data?.error || "Falha ao carregar as conversas.");
      }
      setConversations(data.conversations);
    } catch (error) {
      if (!quiet) toast.error(error instanceof Error ? error.message : "Falha ao carregar as conversas.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!botConfigured) return;
    const first = window.setTimeout(() => void refresh(false), 0);
    const interval = window.setInterval(() => void refresh(true), 10000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(interval);
    };
  }, [botConfigured, refresh]);

  const loadLog = useCallback(async (conversation: Conversation) => {
    try {
      const query = new URLSearchParams({ instanceId: conversation.instanceId, jid: conversation.remoteJid });
      const response = await fetch(`/api/manhia/bot/conversations/log?${query.toString()}`, { cache: "no-store" });
      const data = (await response.json().catch(() => null)) as { messages?: LogEntry[]; error?: string } | null;
      if (!response.ok || !data?.messages) throw new Error(data?.error || "Falha ao carregar a conversa.");
      setLog(data.messages);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao carregar a conversa.");
    }
  }, []);

  useEffect(() => {
    if (!openConversation) return;
    const first = window.setTimeout(() => void loadLog(openConversation), 0);
    const interval = window.setInterval(() => void loadLog(openConversation), 5000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(interval);
    };
  }, [openConversation, loadLog]);

  const togglePause = async (conversation: Conversation) => {
    const key = `${conversation.instanceId}:${conversation.remoteJid}`;
    const paused = Boolean(conversation.pausedUntil);
    try {
      setActingKey(key);
      const response = await fetch(`/api/manhia/bot/conversations/${paused ? "resume" : "pause"}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instanceId: conversation.instanceId, jid: conversation.remoteJid }),
      });
      const data = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) throw new Error(data?.error || "Falha ao executar a ação.");
      toast.success(paused ? "Bot retomado nesta conversa." : "Bot pausado nesta conversa.");
      await refresh(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao executar a ação.");
    } finally {
      setActingKey(null);
    }
  };

  return (
    <Card className="border-pink-200 bg-white/95 shadow-lg shadow-pink-100/40">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-pink-800">
          <MessageCircle className="h-5 w-5" />
          Conversas do WhatsApp
          {loading && <LoaderCircle className="h-4 w-4 animate-spin text-pink-400" />}
        </CardTitle>
        <p className="text-base text-slate-600">
          Quando você responde pelo celular, o bot fica quieto naquela conversa. Aqui você também pode pausar ou
          retomar o bot e ver o que o assistente fez em cada atendimento.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {conversations.length === 0 ? (
          <p className="text-base text-slate-600">Nenhuma conversa registrada ainda.</p>
        ) : (
          conversations.map((conversation) => {
            const key = `${conversation.instanceId}:${conversation.remoteJid}`;
            const paused = Boolean(conversation.pausedUntil);
            return (
              <div key={key} className="rounded-2xl border border-pink-100 bg-pink-50/40 p-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-lg font-semibold text-slate-900">{conversationTitle(conversation)}</h3>
                      <Badge
                        className={
                          paused
                            ? "border border-amber-300 bg-amber-50 text-amber-800"
                            : "border border-emerald-300 bg-emerald-50 text-emerald-800"
                        }
                      >
                        {paused ? `Bot pausado até ${formatTime(conversation.pausedUntil as string)}` : "Bot ativo"}
                      </Badge>
                      {conversation.itemCount > 0 && (
                        <Badge className="border border-sky-300 bg-sky-50 text-sky-800">
                          Pedido: {conversation.itemCount} {conversation.itemCount === 1 ? "item" : "itens"}
                          {conversation.draftStage && STAGE_LABELS[conversation.draftStage]
                            ? ` · ${STAGE_LABELS[conversation.draftStage]}`
                            : ""}
                        </Badge>
                      )}
                    </div>
                    {paused && conversation.pauseReason && (
                      <p className="text-sm text-amber-800">Motivo: {conversation.pauseReason}</p>
                    )}
                    <p className="line-clamp-2 break-words text-base text-slate-700">
                      <span className="font-medium">{conversation.lastKind === "in" ? "Cliente: " : "Bot: "}</span>
                      {conversation.lastContent}
                    </p>
                    <p className="text-sm text-slate-700">{formatTime(conversation.lastAt)}</p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        setLog(null);
                        setOpenConversation(conversation);
                      }}
                      className="min-h-11 rounded-full border-pink-200 text-pink-700 hover:bg-pink-50"
                    >
                      Ver conversa
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={actingKey === key}
                      onClick={() => void togglePause(conversation)}
                      className={
                        paused
                          ? "min-h-11 rounded-full border-emerald-300 text-emerald-800 hover:bg-emerald-50"
                          : "min-h-11 rounded-full border-amber-300 text-amber-800 hover:bg-amber-50"
                      }
                    >
                      {paused ? <PlayCircle className="mr-2 h-4 w-4" /> : <PauseCircle className="mr-2 h-4 w-4" />}
                      {paused ? "Retomar bot" : "Pausar bot"}
                    </Button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </CardContent>

      <Dialog
        open={Boolean(openConversation)}
        onOpenChange={(open) => {
          if (!open) {
            setOpenConversation(null);
            setLog(null);
          }
        }}
      >
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{openConversation ? conversationTitle(openConversation) : "Conversa"}</DialogTitle>
            <DialogDescription>
              Mensagens, chamadas de ferramenta do assistente e avisos do sistema, para depuração.
            </DialogDescription>
          </DialogHeader>

          {!log ? (
            <div className="flex items-center gap-2 text-slate-600">
              <LoaderCircle className="h-4 w-4 animate-spin" /> Carregando...
            </div>
          ) : log.length === 0 ? (
            <p className="text-slate-600">Sem mensagens registradas.</p>
          ) : (
            <ol className="space-y-2">
              {log.map((entry) => {
                if (entry.kind === "tool") {
                  const meta = entry.meta as { args?: unknown; result?: { ok?: boolean } } | null;
                  const failed = meta?.result?.ok === false;
                  return (
                    <li key={entry.id} className="rounded-lg border border-slate-200 bg-slate-50 p-2 text-sm text-slate-700">
                      <details>
                        <summary className="cursor-pointer font-mono">
                          {failed ? "⚠️" : "🔧"} {entry.content} <span className="text-slate-700">{formatTime(entry.createdAt)}</span>
                        </summary>
                        <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-words text-xs">
                          {JSON.stringify(entry.meta, null, 2)}
                        </pre>
                      </details>
                    </li>
                  );
                }
                if (entry.kind === "event") {
                  return (
                    <li key={entry.id} className="text-center text-sm text-slate-700">
                      {entry.content} · {formatTime(entry.createdAt)}
                    </li>
                  );
                }
                const mine = entry.kind === "out";
                return (
                  <li key={entry.id} className={mine ? "flex justify-end" : "flex justify-start"}>
                    <div
                      className={`max-w-[85%] whitespace-pre-wrap break-words rounded-2xl px-3 py-2 text-base ${
                        mine ? "bg-pink-100 text-slate-900" : "bg-white text-slate-900 ring-1 ring-slate-200"
                      }`}
                    >
                      {entry.content}
                      <div className="mt-1 text-xs text-slate-700">{formatTime(entry.createdAt)}</div>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
