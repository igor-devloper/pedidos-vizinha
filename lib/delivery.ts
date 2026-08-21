export const DELIVERY_FEES = [
  { label: "Ponta de Matos a Jardim Manguinhos", neighborhoods: ["Ponta de Matos", "Jardim Manguinhos", "J. Manguinhos", "Vila São João", "Vila Sao Joao", "Centro", "Manguinhos", "Camalaú", "Camalau"], fee: 5 },
  { label: "Camboinha I, II e III", neighborhoods: ["Camboinha", "Camboinha I", "Camboinha II", "Camboinha III"], fee: 8 },
  { label: "Poço (Recanto e Praia)", neighborhoods: ["Poço", "Poco", "Recanto do Poço", "Praia do Poço"], fee: 10 },
  { label: "Ponta de Campina", neighborhoods: ["Ponta de Campina"], fee: 15 },
  { label: "Portal do Poço", neighborhoods: ["Portal do Poço", "Portal do Poco"], fee: 15 },
  { label: "Intermares", neighborhoods: ["Intermares"], fee: 15 },
  { label: "Jacaré", neighborhoods: ["Jacaré", "Jacare"], fee: 15 },
] as const;

export type FulfillmentType = "PICKUP" | "DELIVERY";

export function normalizeLocation(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

export function getDeliveryFee(neighborhood: string) {
  const normalized = normalizeLocation(neighborhood);
  const match = DELIVERY_FEES.find((area) =>
    area.neighborhoods.some((name) => normalized.includes(normalizeLocation(name))),
  );
  return match ? { fee: match.fee, label: match.label, agreed: true } : { fee: 0, label: "A combinar", agreed: false };
}
