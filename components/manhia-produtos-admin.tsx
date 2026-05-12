"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, LogOut, Pencil, Plus, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export type ProdutoAdmin = {
  id: string;
  nome: string;
  descricao: string;
  preco: string | number;
  imagemBase64: string;
  ativo: boolean;
  createdAt: string;
};

type ProdutoFormState = {
  nome: string;
  descricao: string;
  preco: string;
  imagemBase64: string;
  ativo: boolean;
};

const EMPTY_FORM: ProdutoFormState = {
  nome: "",
  descricao: "",
  preco: "",
  imagemBase64: "",
  ativo: true,
};

function currency(value: string | number) {
  return Number(value).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

async function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Nao foi possivel ler a imagem."));
    reader.readAsDataURL(file);
  });
}

export function ManhiaProdutosAdmin({
  initialProdutos,
}: {
  initialProdutos: ProdutoAdmin[];
}) {
  const router = useRouter();
  const [produtos, setProdutos] = useState(initialProdutos);
  const [form, setForm] = useState<ProdutoFormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const ativos = useMemo(
    () => produtos.filter((produto) => produto.ativo).length,
    [produtos]
  );

  const resetForm = () => {
    setForm(EMPTY_FORM);
    setEditingId(null);
  };

  const handleImageChange = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    try {
      setUploading(true);
      const dataUrl = await fileToDataUrl(file);
      setForm((current) => ({ ...current, imagemBase64: dataUrl }));
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Falha ao carregar imagem.";
      toast.error(message);
    } finally {
      setUploading(false);
      event.target.value = "";
    }
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    try {
      setSaving(true);

      const response = await fetch(
        editingId ? `/api/manhia/produtos/${editingId}` : "/api/manhia/produtos",
        {
          method: editingId ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            nome: form.nome,
            descricao: form.descricao,
            preco: form.preco,
            imagemBase64: form.imagemBase64,
            ativo: form.ativo,
          }),
        }
      );

      const data = (await response.json().catch(() => null)) as
        | (ProdutoAdmin & { error?: string })
        | null;

      if (!response.ok) {
        throw new Error(data?.error || "Nao foi possivel salvar o produto.");
      }

      const produto = data as ProdutoAdmin;

      setProdutos((current) => {
        if (editingId) {
          return current.map((item) => (item.id === produto.id ? produto : item));
        }

        return [produto, ...current];
      });

      toast.success(
        editingId ? "Produto atualizado com sucesso." : "Produto criado com sucesso."
      );
      resetForm();
      router.refresh();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Nao foi possivel salvar.";
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (produto: ProdutoAdmin) => {
    setEditingId(produto.id);
    setForm({
      nome: produto.nome,
      descricao: produto.descricao,
      preco: Number(produto.preco).toFixed(2),
      imagemBase64: produto.imagemBase64,
      ativo: produto.ativo,
    });
  };

  const handleDelete = async (produtoId: string) => {
    try {
      setDeletingId(produtoId);
      const response = await fetch(`/api/manhia/produtos/${produtoId}`, {
        method: "DELETE",
      });

      const data = (await response.json().catch(() => null)) as
        | { error?: string }
        | null;

      if (!response.ok) {
        throw new Error(data?.error || "Nao foi possivel excluir o produto.");
      }

      setProdutos((current) => current.filter((item) => item.id !== produtoId));
      if (editingId === produtoId) {
        resetForm();
      }
      toast.success("Produto removido.");
      router.refresh();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Nao foi possivel excluir.";
      toast.error(message);
    } finally {
      setDeletingId(null);
    }
  };

  const handleLogout = async () => {
    await fetch("/api/manhia/logout", { method: "POST" });
    router.refresh();
  };

  return (
    <main className="px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <section className="flex flex-col gap-4 rounded-[2rem] border border-pink-200/80 bg-white/95 p-6 shadow-xl shadow-pink-100/50 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-2">
            <Badge className="border border-pink-200 bg-pink-100 text-pink-700">
              Area protegida
            </Badge>
            <h1 className="text-3xl font-semibold text-pink-800">
              Gestão do cardápio
            </h1>
            <p className="max-w-2xl text-sm leading-6 text-slate-500">
              Cadastre os produtos que devem aparecer na rota publica do cardá  pio.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Button
              asChild
              type="button"
              variant="outline"
              className="rounded-full border-pink-200 text-pink-700 hover:bg-pink-50"
            >
              <Link href="/manhia/bot">Painel do bot</Link>
            </Button>
            <div className="rounded-2xl border border-pink-100 bg-pink-50/80 px-4 py-3 text-sm text-slate-700">
              <span className="font-semibold text-pink-700">{produtos.length}</span>{" "}
              produtos cadastrados
            </div>
            <div className="rounded-2xl border border-pink-100 bg-pink-50/80 px-4 py-3 text-sm text-slate-700">
              <span className="font-semibold text-pink-700">{ativos}</span> ativos
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={handleLogout}
              className="rounded-full border-pink-200 text-pink-700 hover:bg-pink-50"
            >
              <LogOut className="mr-2 h-4 w-4" />
              Sair
            </Button>
          </div>
        </section>

        <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
          <Card className="border-pink-200 bg-white/95 shadow-lg shadow-pink-100/40">
            <CardHeader>
              <CardTitle className="text-pink-800">
                {editingId ? "Editar produto" : "Novo produto"}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form className="space-y-4" onSubmit={handleSubmit}>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700">
                    Nome do produto
                  </label>
                  <Input
                    value={form.nome}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, nome: event.target.value }))
                    }
                    placeholder="Ex: Coxinha especial"
                    className="border-pink-100 bg-white focus-visible:ring-pink-400"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700">
                    Descricao
                  </label>
                  <Textarea
                    value={form.descricao}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        descricao: event.target.value,
                      }))
                    }
                    placeholder="Descreva o recheio, o diferencial ou o estilo do produto."
                    className="min-h-28 border-pink-100 bg-white focus-visible:ring-pink-400"
                  />
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-700">
                      Valor
                    </label>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={form.preco}
                      onChange={(event) =>
                        setForm((current) => ({ ...current, preco: event.target.value }))
                      }
                      placeholder="0.90"
                      className="border-pink-100 bg-white focus-visible:ring-pink-400"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-700">
                      Foto do produto
                    </label>
                    <label className="flex h-10 cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed border-pink-200 bg-pink-50 text-sm font-medium text-pink-700 transition hover:bg-pink-100">
                      {uploading ? (
                        <LoaderCircle className="h-4 w-4 animate-spin" />
                      ) : (
                        <Upload className="h-4 w-4" />
                      )}
                      {form.imagemBase64 ? "Trocar imagem" : "Selecionar imagem"}
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={handleImageChange}
                      />
                    </label>
                  </div>
                </div>

                <div className="flex items-start gap-3 rounded-2xl border border-pink-100 bg-pink-50/60 px-4 py-3">
                  <Checkbox
                    id="produto-ativo"
                    checked={form.ativo}
                    onCheckedChange={(checked) =>
                      setForm((current) => ({ ...current, ativo: Boolean(checked) }))
                    }
                    className="mt-0.5 border-pink-300 data-[state=checked]:bg-pink-500"
                  />
                  <label
                    htmlFor="produto-ativo"
                    className="text-sm leading-6 text-slate-600"
                  >
                    Deixar este produto visivel no cardapio publico.
                  </label>
                </div>

                {form.imagemBase64 && (
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-slate-700">Preview</p>
                    <div className="relative aspect-[4/3] overflow-hidden rounded-3xl border border-pink-100 bg-pink-50">
                      <Image
                        src={form.imagemBase64}
                        alt={form.nome || "Preview do produto"}
                        fill
                        unoptimized
                        className="object-cover"
                      />
                    </div>
                  </div>
                )}

                <div className="flex flex-col gap-3 sm:flex-row">
                  <Button
                    type="submit"
                    disabled={saving}
                    className="rounded-full bg-pink-600 text-white hover:bg-pink-700"
                  >
                    {saving ? (
                      <>
                        <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
                        Salvando...
                      </>
                    ) : editingId ? (
                      "Atualizar produto"
                    ) : (
                      <>
                        <Plus className="mr-2 h-4 w-4" />
                        Adicionar produto
                      </>
                    )}
                  </Button>

                  {editingId && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={resetForm}
                      className="rounded-full border-pink-200 text-pink-700 hover:bg-pink-50"
                    >
                      Cancelar edicao
                    </Button>
                  )}
                </div>
              </form>
            </CardContent>
          </Card>

          <section className="space-y-4">
            {produtos.length === 0 ? (
              <Card className="border-pink-200 bg-white/95 shadow-lg shadow-pink-100/40">
                <CardContent className="py-10 text-center text-sm text-slate-500">
                  Nenhum produto cadastrado ainda.
                </CardContent>
              </Card>
            ) : (
              produtos.map((produto) => (
                <Card
                  key={produto.id}
                  className="overflow-hidden border-pink-200 bg-white/95 shadow-lg shadow-pink-100/30"
                >
                  <div className="grid gap-0 md:grid-cols-[220px_1fr]">
                    <div className="relative min-h-56 bg-pink-50">
                      <Image
                        src={produto.imagemBase64}
                        alt={produto.nome}
                        fill
                        unoptimized
                        className="object-cover"
                      />
                    </div>

                    <CardContent className="flex flex-col gap-4 p-5">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <h2 className="text-xl font-semibold text-slate-900">
                              {produto.nome}
                            </h2>
                            <Badge
                              className={
                                produto.ativo
                                  ? "border border-emerald-200 bg-emerald-50 text-emerald-700"
                                  : "border border-slate-200 bg-slate-100 text-slate-600"
                              }
                            >
                              {produto.ativo ? "Ativo" : "Oculto"}
                            </Badge>
                          </div>
                          <p className="text-sm leading-6 text-slate-500">
                            {produto.descricao}
                          </p>
                        </div>

                        <div className="text-left sm:text-right">
                          <p className="text-sm text-slate-400">Valor</p>
                          <p className="text-xl font-semibold text-pink-700">
                            {currency(produto.preco)}
                          </p>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-3">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => handleEdit(produto)}
                          className="rounded-full border-pink-200 text-pink-700 hover:bg-pink-50"
                        >
                          <Pencil className="mr-2 h-4 w-4" />
                          Editar
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          disabled={deletingId === produto.id}
                          onClick={() => handleDelete(produto.id)}
                          className="rounded-full border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          {deletingId === produto.id ? "Excluindo..." : "Excluir"}
                        </Button>
                      </div>
                    </CardContent>
                  </div>
                </Card>
              ))
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
