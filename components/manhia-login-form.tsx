"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LockKeyhole } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export function ManhiaLoginForm({ isConfigured }: { isConfigured: boolean }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!isConfigured) {
      toast.error(
        "Defina MANHIA_ACCESS_PASSWORD no ambiente para liberar o painel."
      );
      return;
    }

    try {
      setLoading(true);

      const response = await fetch("/api/manhia/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });

      const data = (await response.json().catch(() => null)) as
        | { error?: string }
        | null;

      if (!response.ok) {
        throw new Error(data?.error || "Não foi possível entrar.");
      }

      router.refresh();
      toast.success("Acesso liberado.");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Não foi possível entrar.";
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-md">
        <Card className="border-2 border-[#c25bb4] bg-white shadow-xl">
          <CardHeader className="space-y-2">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-pink-100 text-[#6b0f5c]">
              <LockKeyhole className="h-6 w-6" aria-hidden="true" />
            </div>
            <h1 className="text-3xl font-extrabold text-[#4a0a3f]">Painel da Vizinha</h1>
            <p className="text-lg leading-relaxed text-slate-800">
              Área protegida para cuidar dos pedidos, do cardápio e do WhatsApp.
            </p>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={handleSubmit}>
              <div className="space-y-2">
                <label htmlFor="manhia-senha" className="block text-lg font-bold text-slate-900">
                  Senha de acesso
                </label>
                <Input
                  id="manhia-senha"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="h-14 border-2 border-[#c25bb4] bg-white text-lg"
                />
              </div>

              {!isConfigured && (
                <p role="alert" className="rounded-xl border-2 border-amber-700 bg-amber-50 px-3 py-2 text-base font-semibold text-amber-950">
                  O painel ainda não tem senha configurada no ambiente.
                </p>
              )}

              <Button
                type="submit"
                disabled={loading || !password}
                className="h-14 w-full rounded-full bg-[#8a0f78] text-lg font-extrabold text-white hover:bg-[#6b0f5c]"
              >
                {loading ? "Entrando..." : "Entrar no painel"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
