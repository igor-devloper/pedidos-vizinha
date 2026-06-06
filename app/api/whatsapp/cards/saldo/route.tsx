import { ImageResponse } from "next/og";

export const runtime = "nodejs";

function readParam(value: string | null, fallback: string) {
  return value?.trim() || fallback;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const cliente = readParam(searchParams.get("cliente"), "Cliente");
  const codigo = readParam(searchParams.get("codigo"), "0000");
  const valor = readParam(searchParams.get("valor"), "R$ 0,00");
  const metodo = readParam(searchParams.get("metodo"), "Pix");

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          background: "#101214",
          color: "#f4f4f5",
          fontFamily: "sans-serif",
          padding: "36px",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            width: "100%",
            borderRadius: "30px",
            border: "1px solid rgba(255,255,255,0.12)",
            background: "linear-gradient(180deg, #191c20 0%, #101214 100%)",
            padding: "34px",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <div style={{ display: "flex", fontSize: 34, fontWeight: 800 }}>
              Olá, {cliente}! 👋
            </div>
            <div style={{ display: "flex", fontSize: 24, color: "#d4d4d8" }}>
              Identificamos a cobrança final do seu pedido em aberto.
            </div>
          </div>

          <div
            style={{
              display: "flex",
              marginTop: "26px",
              borderRadius: "22px",
              background: "#161a1f",
              border: "1px solid rgba(255,255,255,0.08)",
              padding: "22px 24px",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              <div style={{ display: "flex", fontSize: 18, color: "#a1a1aa", textTransform: "uppercase" }}>
                Cobrança do pedido #{codigo}
              </div>
              <div style={{ display: "flex", fontSize: 30, fontWeight: 700 }}>
                Saldo para pagamento
              </div>
            </div>
            <div
              style={{
                display: "flex",
                background: "#0f766e",
                color: "white",
                borderRadius: "18px",
                padding: "12px 18px",
                fontSize: 22,
                fontWeight: 700,
              }}
            >
              {metodo}
            </div>
          </div>

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              marginTop: "26px",
              borderTop: "1px dashed rgba(255,255,255,0.14)",
              borderBottom: "1px dashed rgba(255,255,255,0.14)",
              padding: "24px 0",
              gap: "16px",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 24, color: "#d4d4d8" }}>
              <span>Total</span>
              <span style={{ fontWeight: 800, color: "#ffffff" }}>{valor}</span>
            </div>
            <div style={{ display: "flex", fontSize: 20, color: "#a1a1aa" }}>
              Copie o Pix ou abra o link enviado logo abaixo para concluir o pagamento.
            </div>
          </div>

          <div
            style={{
              display: "flex",
              marginTop: "26px",
              borderRadius: "20px",
              background: "#052e2b",
              color: "#4ade80",
              padding: "18px 22px",
              fontSize: 24,
              fontWeight: 700,
            }}
          >
            Cobrança pronta para pagamento
          </div>
        </div>
      </div>
    ),
    {
      width: 900,
      height: 900,
    }
  );
}
