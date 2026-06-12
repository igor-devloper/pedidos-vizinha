export const STORE_SITE_THEMES = ["COPA", "NAMORADOS"] as const;

export type StoreSiteTheme = (typeof STORE_SITE_THEMES)[number];

export function normalizeStoreSiteTheme(value: unknown): StoreSiteTheme {
  return value === "NAMORADOS" ? "NAMORADOS" : "COPA";
}
