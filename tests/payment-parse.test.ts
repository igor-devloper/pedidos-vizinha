import assert from "node:assert/strict";
import test from "node:test";

import { extractPayment } from "../services/whatsapp-bot/src/agent/payment-parse.js";

test("entende as frases reais dos clientes", () => {
  assert.deepEqual(extractPayment("Vou pagar 50 no crédito"), { percentual: 50, forma: "cartao_credito" });
  assert.deepEqual(extractPayment("50%"), { percentual: 50 });
  assert.deepEqual(extractPayment("50% no crédito"), { percentual: 50, forma: "cartao_credito" });
  assert.deepEqual(extractPayment("cartão de crédito"), { forma: "cartao_credito" });
  assert.deepEqual(extractPayment("no debito mesmo"), { forma: "cartao_debito" });
  assert.deepEqual(extractPayment("pix 100%"), { percentual: 100, forma: "pix" });
  assert.deepEqual(extractPayment("vou pagar tudo no pix"), { percentual: 100, forma: "pix" });
  assert.deepEqual(extractPayment("metade agora"), { percentual: 50 });
  assert.deepEqual(extractPayment("Pagamento total"), { percentual: 100 });
});

test("não adivinha quando é ambíguo", () => {
  assert.deepEqual(extractPayment("cartão"), {});
  assert.deepEqual(extractPayment("pix ou crédito"), {});
  assert.deepEqual(extractPayment("50 ou 100?"), {});
  assert.deepEqual(extractPayment("ok"), {});
  assert.deepEqual(extractPayment("150"), {});
});
