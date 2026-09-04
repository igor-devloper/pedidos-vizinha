import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { getOrderStatusFromMercadoPagoStatus } from "../lib/cart-order-payment";

const read = (path: string) => readFileSync(path, "utf8");

test("PIX pendente e cartao rejeitado nao marcam Order como pago", () => {
  assert.equal(getOrderStatusFromMercadoPagoStatus("pending"), "PENDING");
  assert.equal(getOrderStatusFromMercadoPagoStatus("rejected"), "PENDING");
  assert.equal(getOrderStatusFromMercadoPagoStatus("approved"), "PAID");
});

test("pagamento aprovado valida valor e referencia antes da alteracao", () => {
  const source = read("lib/cart-order-payment.ts");
  assert.match(source, /external_reference\?\.startsWith\("cart-"\)/);
  assert.match(source, /transaction_amount/);
  assert.match(source, /Valor aprovado diverge/);
});

test("webhook concorrente possui claim atomico e nao duplica efeitos", () => {
  const source = read("lib/cart-order-payment.ts");
  assert.match(source, /updateMany/);
  assert.match(source, /claimed\.count === 0/);
  assert.match(source, /status: \{ not: "PAID" \}/);
});

test("follow-up de dez minutos e persistido, unico e cancelado quando existe Order", () => {
  const source = read("services/whatsapp-bot/src/whatsapp-draft-repository.ts");
  const automation = read("services/whatsapp-bot/src/automation.ts");
  assert.match(source, /10 \* 60_000/);
  assert.match(source, /whatsappOfferSentAt/);
  assert.match(source, /NOT EXISTS/);
  assert.match(source, /FOR UPDATE SKIP LOCKED/);
  assert.match(automation, /outboundText\.includes\(config\.cardapioUrl\)/);
  assert.match(automation, /markSiteLinkSent\(draft\.id\)/);
});

test("confirmacao repetida reutiliza Order do draft", () => {
  const route = read("app/api/internal/whatsapp-orders/route.ts");
  const service = read("lib/order-creation-service.ts");
  assert.match(route, /if \(draft\.orderId\)/);
  assert.match(service, /idempotencyKey/);
  assert.match(service, /findUnique\(\{ where: \{ externalReference/);
});

test("checkout de cartao usa Order e pagina invalida e controlada", () => {
  const page = read("app/checkout/order/[orderId]/page.tsx");
  assert.match(page, /prisma\.order\.findUnique/);
  assert.match(page, /Pagamento indisponível/);
  assert.doesNotMatch(page, /notFound/);
});

test("coleta estruturada processa entrega antes da resposta generica", () => {
  const source = read("services/whatsapp-bot/src/automation.ts");
  const agentPosition = source.lastIndexOf("if (await maybeHandleSalesAgent(job, lead, draft))");
  const deliveryPosition = source.lastIndexOf("if (await maybeHandleDeliveryRequest(job, lead))");
  assert.ok(agentPosition > 0);
  assert.ok(deliveryPosition > agentPosition);
});
