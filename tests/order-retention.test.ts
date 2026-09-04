import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import {
  MANHIA_ORDER_HISTORY_QUERY,
  MANHIA_PEDIDO_HISTORY_QUERY,
} from "../lib/order-history";
import { getStatusAuditEvent } from "../lib/order-audit";

const projectRoot = process.cwd();
const read = (path: string) => readFileSync(join(projectRoot, path), "utf8");
const readTypeScriptTree = (relativeDirectory: string): string =>
  readdirSync(join(projectRoot, relativeDirectory), { withFileTypes: true })
    .flatMap((entry) => {
      const relativePath = join(relativeDirectory, entry.name);
      if (entry.isDirectory()) return [readTypeScriptTree(relativePath)];
      return /\.tsx?$/.test(entry.name) ? [read(relativePath)] : [];
    })
    .join("\n");

test("historico da Manhia nao limita nem filtra Order por status", () => {
  assert.equal("take" in MANHIA_ORDER_HISTORY_QUERY, false);
  assert.equal("skip" in MANHIA_ORDER_HISTORY_QUERY, false);
  assert.equal("where" in MANHIA_ORDER_HISTORY_QUERY, false);

  const statuses = ["PENDING", "PAID", "CANCELLED", "READY", "DELIVERED"];
  const visible = statuses.filter(() => !("where" in MANHIA_ORDER_HISTORY_QUERY));
  assert.deepEqual(visible, statuses);
});

for (const status of ["PENDING", "PAID", "CANCELLED"] as const) {
  test(`Order ${status} continua encontravel no historico`, () => {
    const storedOrders = [
      { id: "pending", status: "PENDING" },
      { id: "paid", status: "PAID" },
      { id: "cancelled", status: "CANCELLED" },
    ];
    const result = "where" in MANHIA_ORDER_HISTORY_QUERY ? [] : storedOrders;
    assert.equal(result.some((order) => order.status === status), true);
  });
}

test("historico da Manhia nao limita nem filtra Pedido por status", () => {
  assert.equal("take" in MANHIA_PEDIDO_HISTORY_QUERY, false);
  assert.equal("skip" in MANHIA_PEDIDO_HISTORY_QUERY, false);
  assert.equal("where" in MANHIA_PEDIDO_HISTORY_QUERY, false);
});

test("fluxo operacional nao possui exclusao fisica de Order ou Pedido", () => {
  const source = `${readTypeScriptTree("app")}\n${readTypeScriptTree("lib")}`;
  assert.doesNotMatch(source, /prisma\.order\.delete(?:Many)?\s*\(/);
  assert.doesNotMatch(source, /prisma\.pedido\.delete(?:Many)?\s*\(/);
  assert.doesNotMatch(source, /tx\.order\.delete(?:Many)?\s*\(/);
  assert.doesNotMatch(source, /tx\.pedido\.delete(?:Many)?\s*\(/);
});

test("limpeza pos-pagamento remove CartItem, nunca Order ou OrderItem", () => {
  const paymentSource = read("lib/cart-order-payment.ts");
  assert.match(paymentSource, /prisma\.cartItem\.deleteMany/);
  assert.doesNotMatch(paymentSource, /prisma\.order\.delete(?:Many)?\s*\(/);
  assert.doesNotMatch(paymentSource, /prisma\.orderItem\.delete(?:Many)?\s*\(/);
});

test("edicao substitui itens dentro de transacao e preserva o Order", () => {
  const serviceSource = read("lib/cart-order-service.ts");
  assert.match(serviceSource, /\$transaction\(async \(tx\)/);
  assert.match(serviceSource, /tx\.orderItem\.deleteMany/);
  assert.match(serviceSource, /tx\.order\.update/);
  assert.doesNotMatch(serviceSource, /tx\.order\.delete(?:Many)?\s*\(/);
});

test("atualizacao de status preserva todos os OrderItem", () => {
  const serviceSource = read("lib/cart-order-service.ts");
  const statusUpdate = serviceSource.slice(
    serviceSource.indexOf("export async function updateCartOrderStatus"),
    serviceSource.indexOf("export async function processReadyCartOrderBalanceCharges"),
  );
  assert.match(statusUpdate, /prisma\.order\.update/);
  assert.doesNotMatch(statusUpdate, /orderItem\.delete(?:Many)?\s*\(/);
});

test("status de retencao gera evento e nunca operacao de exclusao", () => {
  assert.equal(getStatusAuditEvent("READY"), "ORDER_READY");
  assert.equal(getStatusAuditEvent("DELIVERED"), "ORDER_DELIVERED");
  assert.equal(getStatusAuditEvent("CANCELLED"), "ORDER_CANCELLED");
  assert.equal(getStatusAuditEvent("PENDING"), "ORDER_STATUS_CHANGED");
  assert.equal(getStatusAuditEvent("PAID"), "ORDER_STATUS_CHANGED");
});

test("edicao administrativa registra data e valor pago sem recriar Order", () => {
  const source = read("lib/cart-order-service.ts");
  assert.match(source, /scheduledAt: normalizedScheduledAt/);
  assert.match(source, /chargedAmount: normalizedPaidAmount/);
  assert.match(source, /previousPaidAmount/);
  assert.match(source, /newScheduledAt/);
  assert.doesNotMatch(source, /export async function editCartOrder[\s\S]*?prisma\.order\.delete\s*\(/);
});

test("schema nao permite que entidades auxiliares apaguem pedidos", () => {
  const schema = read("prisma/schema.prisma");
  assert.match(schema, /order\s+Order\s+@relation\(fields: \[orderId\], references: \[id\], onDelete: Cascade\)/);
  assert.match(schema, /cart\s+Cart\?\s+@relation\(fields: \[cartId\], references: \[id\], onDelete: SetNull\)/);
  assert.match(schema, /produto\s+Produto\s+@relation\(fields: \[produtoId\], references: \[id\], onDelete: Restrict\)/);
  assert.match(schema, /model OrderEvent[\s\S]*@@index\(\[orderId, createdAt\]\)/);
});
