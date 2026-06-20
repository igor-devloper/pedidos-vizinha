"use client";

import { useState } from "react";

export function PrintButton({ pedidoId }: { pedidoId?: string }) {
  const [printing, setPrinting] = useState(false);

  const handlePrint = async () => {
    if (!pedidoId) {
      window.print();
      return;
    }

    try {
      setPrinting(true);
      const response = await fetch(`/api/manhia/pedidos/${pedidoId}/imprimir`, {
        method: "POST",
      });

      if (!response.ok) {
        window.print();
      }
    } finally {
      setPrinting(false);
    }
  };

  return (
    <button
      type="button"
      onClick={() => void handlePrint()}
      disabled={printing}
      className="rounded-full bg-pink-600 px-5 py-3 text-sm font-semibold text-white"
    >
      {printing ? "Enviando..." : "Imprimir agora"}
    </button>
  );
}
