import { getBusinessTimeParts } from "@/lib/business-hours";

/**
 * Convenção do carrinho do site: o horário escolhido pelo cliente (ex.: 17:00 em Recife) é gravado em
 * `Order.scheduledAt` como "relógio local fixo em UTC" (17:00Z), sem somar as 3h do fuso. Painel,
 * impressão e mensagens leem esse campo pelos campos UTC. Todo pedido, de qualquer origem, deve seguir
 * essa mesma regra, senão o horário aparece 3h adiantado.
 */

/** Instante real (17:00 em Recife = 20:00Z) → como o pedido é gravado (17:00Z). */
export function businessInstantToFixedUtcLocal(instant: Date) {
  const { year, month, day, hour, minute } = getBusinessTimeParts(instant);
  return new Date(Date.UTC(year, month - 1, day, hour, minute));
}

/** Como o pedido está gravado (17:00Z) → instante real (20:00Z), para aplicar regras de horário. */
export function fixedUtcLocalToBusinessInstant(stored: Date) {
  return new Date(Date.UTC(
    stored.getUTCFullYear(),
    stored.getUTCMonth(),
    stored.getUTCDate(),
    stored.getUTCHours() + 3,
    stored.getUTCMinutes(),
  ));
}
