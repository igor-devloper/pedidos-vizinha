import Link from "next/link";

export default function FinalPage() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-pink-50 via-pink-50 to-white px-4 py-8">
      <div className="mx-auto flex max-w-lg flex-col items-center gap-4 text-center">
        <div className="mb-2 flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100">
          <span className="text-3xl">🎉</span>
        </div>
        <h1 className="text-2xl font-bold text-pink-700">Pedido recebido!</h1>
        <p className="text-sm text-slate-600">
          Seu pagamento e comprovante foram enviados com sucesso. Assim que a
          Vizinha Salgateria confirmar tudo, você receberá a confirmação da sua
          encomenda pelo e-mail informado.
        </p>
        <div className="mt-2 flex flex-col gap-2">
          <Link
            href="/"
            className="inline-flex items-center justify-center rounded-full bg-pink-600 px-6 py-3 text-sm font-semibold text-white hover:bg-pink-700"
          >
            Fazer outra encomenda
          </Link>
        </div>
      </div>
    </main>
  );
}
