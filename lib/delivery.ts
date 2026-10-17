/**
 * Área de entrega: do Centro de Cabedelo até Camboinha. Fora dela só há retirada.
 * Para ampliar ou reduzir a área, edite esta lista (bairros e taxa); o site, o bot e a página
 * inicial leem daqui.
 */
export const DELIVERY_CITY = "Cabedelo";
export const DELIVERY_AREA_DESCRIPTION = "do Centro de Cabedelo até Camboinha";
export const OUT_OF_AREA_MESSAGE = `Entregamos apenas ${DELIVERY_AREA_DESCRIPTION}. Para outros bairros, escolha retirada.`;

export const DELIVERY_FEES = [
  { label: "Ponta de Matos a Jardim Manguinhos", neighborhoods: ["Ponta de Matos", "Jardim Manguinhos", "J. Manguinhos", "Vila São João", "Vila Sao Joao", "Centro", "Manguinhos", "Camalaú", "Camalau"], fee: 5 },
  { label: "Camboinha I, II e III", neighborhoods: ["Camboinha", "Camboinha I", "Camboinha II", "Camboinha III"], fee: 8 },
] as const;

/** Nomes que existem em várias cidades (ex.: "Centro"): só valem se o endereço for em Cabedelo. */
const NEEDS_CITY = new Set(["centro"]);

export type FulfillmentType = "PICKUP" | "DELIVERY";

export function normalizeLocation(value: string) {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export type DeliveryQuote = {
  fee: number;
  label: string;
  /** Dentro da área de entrega (taxa definida). */
  agreed: boolean;
  covered: boolean;
  /** Bairro com nome genérico ("Centro") e sem a cidade: precisa confirmar que é em Cabedelo. */
  needsCity: boolean;
};

/**
 * Taxa de entrega e se o endereço está na área atendida. `city` é a cidade do endereço (ex.: do Google Maps);
 * se vier junto do bairro no mesmo texto ("Centro, Cabedelo"), também vale.
 */
export function getDeliveryFee(neighborhood: string, city?: string): DeliveryQuote {
  const target = normalizeLocation(neighborhood);
  const cityText = normalizeLocation(city ?? "");
  const outside = { fee: 0, label: "Fora da área de entrega", agreed: false, covered: false, needsCity: false };

  if (!target) return outside;
  // Cidade informada e diferente de Cabedelo: fora da área, qualquer que seja o bairro.
  if (cityText && !cityText.includes(normalizeLocation(DELIVERY_CITY))) return outside;

  for (const area of DELIVERY_FEES) {
    for (const name of area.neighborhoods) {
      const normalizedName = normalizeLocation(name);
      if (!new RegExp(`(^|[^a-z0-9])${escapeRegExp(normalizedName)}([^a-z0-9]|$)`).test(target)) continue;

      const hasCity = cityText.includes("cabedelo") || target.includes("cabedelo");
      if (NEEDS_CITY.has(normalizedName) && !hasCity) {
        return { ...outside, needsCity: true };
      }
      return { fee: area.fee, label: area.label, agreed: true, covered: true, needsCity: false };
    }
  }

  return outside;
}
