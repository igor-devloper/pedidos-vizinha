export const STORE_SITE_THEMES = ["COPA", "NAMORADOS", "SAO_JOAO"] as const;

export type StoreSiteTheme = (typeof STORE_SITE_THEMES)[number];

export function normalizeStoreSiteTheme(value: unknown): StoreSiteTheme {
  if (value === "NAMORADOS" || value === "SAO_JOAO") {
    return value;
  }

  return "COPA";
}
