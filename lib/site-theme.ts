export const STORE_SITE_THEMES = [
  "PADRAO",
  "COPA",
  "NAMORADOS",
  "SAO_JOAO",
] as const;

export type StoreSiteTheme = (typeof STORE_SITE_THEMES)[number];

export function normalizeStoreSiteTheme(value: unknown): StoreSiteTheme {
  if (
    value === "PADRAO" ||
    value === "COPA" ||
    value === "NAMORADOS" ||
    value === "SAO_JOAO"
  ) {
    return value;
  }

  return "PADRAO";
}
