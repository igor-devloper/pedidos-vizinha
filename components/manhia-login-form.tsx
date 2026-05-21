"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LockKeyhole } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
    <main className="px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-md">
        <Card className="border-pink-200 bg-white/95 shadow-xl shadow-pink-100/50">
          <CardHeader className="space-y-2">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-pink-100 text-pink-700">
              <LockKeyhole className="h-5 w-5" />
            </div>
            <CardTitle className="text-2xl text-pink-800">
              Painel do cardápio
            </CardTitle>
            <p className="text-sm leading-6 text-slate-500">
              Área protegida para a Manhia cadastrar produtos, imagens, valores e
              descrições.
            </p>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={handleSubmit}>
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">
                  Senha de acesso
                </label>
                <Input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Digite a senha"
                  className="border-pink-100 bg-white focus-visible:ring-pink-400"
                />
              </div>

              {!isConfigured && (
                <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                  O painel ainda não tem senha configurada no ambiente.
                </p>
              )}

              <Button
                type="submit"
                disabled={loading || !password}
                className="w-full rounded-full bg-pink-600 text-white hover:bg-pink-700"
              >
                {loading ? "Entrando..." : "Entrar no painel"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
