import { stripAccents } from "./name-matching.js";

// Mesma regra de lib/delivery.ts do site (fonte da lista de bairros: /api/internal/store-info).
// O site revalida na hora do resumo e do pedido, então esta cópia só serve para o bot recusar cedo.

export type DeliveryAreaFee = { area: string; fee: number; neighborhoods: string[] };

export type DeliveryCheck = { covered: boolean; fee: number; needsCity: boolean };

const CITY = "cabedelo";
/** Nomes que existem em várias cidades: só valem se o endereço for em Cabedelo. */
const NEEDS_CITY = new Set(["centro"]);

const normalize = (value: string) => stripAccents(value).toLowerCase().trim();
const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function checkDeliveryArea(fees: DeliveryAreaFee[], neighborhood: string, city?: string): DeliveryCheck {
  const target = normalize(neighborhood);
  const cityText = normalize(city ?? "");
  const outside = { covered: false, fee: 0, needsCity: false };

  if (!target) return outside;
  if (cityText && !cityText.includes(CITY)) return outside;

  for (const area of fees) {
    for (const name of area.neighborhoods) {
      const normalizedName = normalize(name);
      if (!new RegExp(`(^|[^a-z0-9])${escapeRegExp(normalizedName)}([^a-z0-9]|$)`).test(target)) continue;

      const hasCity = cityText.includes(CITY) || target.includes(CITY);
      if (NEEDS_CITY.has(normalizedName) && !hasCity) return { ...outside, needsCity: true };
      return { covered: true, fee: area.fee, needsCity: false };
    }
  }

  return outside;
}

/**
 * Área de entrega própria do bot (espelho de lib/delivery.ts do site, conferido por teste). Vale quando o site
 * ainda é uma versão antiga e manda a lista de bairros de antes: a regra "só do Centro de Cabedelo até Camboinha"
 * não pode depender do deploy do site.
 */
export const LOCAL_DELIVERY_FEES: DeliveryAreaFee[] = [
  {
    area: "Ponta de Matos a Jardim Manguinhos",
    fee: 5,
    neighborhoods: ["Ponta de Matos", "Jardim Manguinhos", "J. Manguinhos", "Vila São João", "Vila Sao Joao", "Centro", "Manguinhos", "Camalaú", "Camalau"],
  },
  { area: "Camboinha I, II e III", fee: 8, neighborhoods: ["Camboinha", "Camboinha I", "Camboinha II", "Camboinha III"] },
];

/** Lista de bairros a usar: a do site quando ele já é a versão nova (informa `deliveryArea`), senão a do bot. */
export function deliveryFeesFrom(info: { deliveryArea?: string; deliveryFees: DeliveryAreaFee[] }): DeliveryAreaFee[] {
  return info.deliveryArea ? info.deliveryFees : LOCAL_DELIVERY_FEES;
}
