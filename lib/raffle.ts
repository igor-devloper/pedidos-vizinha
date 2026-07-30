import { randomBytes } from "crypto";

export const RAFFLE_TITLE = "Sorteio de Dia dos Pais";

export function createRaffleCode() {
  return `PAI-${randomBytes(4).toString("hex").toUpperCase()}`;
}

export const rafflePurchaseMessage =
  "Ao concluir o pagamento, este código confirma sua participação no Sorteio de Dia dos Pais.";
