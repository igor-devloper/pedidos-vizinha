"use client";

export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="rounded-full bg-pink-600 px-5 py-3 text-sm font-semibold text-white"
    >
      Imprimir agora
    </button>
  );
}
