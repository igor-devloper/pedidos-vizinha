import { createSiteApi } from "./agent/site-api.js";
import { logger } from "./logger.js";
import { summarizeWeekly } from "./store-hours-format.js";

const site = createSiteApi();

export type StoreHours = {
  /** Aberta agora (horário do painel E chave "loja aberta" do painel). */
  openNow: boolean;
  /** Horário da semana em uma frase, direto da configuração de operação do painel. */
  summary: string;
};

/**
 * Horário de funcionamento REAL: vem do site (configurações de operação do painel), nunca de um
 * texto fixo. Se o site não responder, devolve null e quem chamou não afirma nenhum horário.
 */
export async function getStoreHours(): Promise<StoreHours | null> {
  try {
    const info = await site.storeInfo();
    return { openNow: info.openNow, summary: summarizeWeekly(info.weekly) };
  } catch (error) {
    logger.warn({ error }, "Could not load store hours from the site");
    return null;
  }
}
