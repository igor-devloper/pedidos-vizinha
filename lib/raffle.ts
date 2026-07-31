import { randomBytes } from "crypto";

export const RAFFLE_TITLE = "Sorteio de Dia dos Pais";

export function createRaffleCode() {
  return `PAI-${randomBytes(4).toString("hex").toUpperCase()}`;
}

export const rafflePurchaseMessage =
  "Ao concluir o pagamento, este código confirma sua participação no Sorteio de Dia dos Pais.";

export const RAFFLE_POST_URL = "https://www.instagram.com/p/Dbbrj0nTOCS/";
export const RAFFLE_START_AT = new Date("2026-07-30T00:00:00-03:00");

export function buildRaffleWhatsappMessage({
  customerName,
  code,
}: {
  customerName?: string | null;
  code: string;
}) {
  const firstName = customerName?.trim().split(/\s+/)[0] || "cliente";

  return [
    `💙🎉 *${firstName}, agora você está concorrendo!* 🎉💙`,
    "",
    "Seu pagamento foi confirmado e sua participação no nosso *Sorteio Especial de Dia dos Pais* está garantida! 🥳",
    "",
    "🎟️ *SEU NÚMERO DA SORTE*",
    `✨ *${code}* ✨`,
    "",
    "🎁 *Serão 2 ganhadores:*",
    "🍰 1º número sorteado: 1 bolo de 1 kg da @doceamorepb",
    "🥟 2º número sorteado: 1 cento de salgados da @vizinhasalgateria",
    "",
    "📋 *Para validar sua participação:*",
    "✅ Siga @vizinhasalgateria e @doceamorepb",
    "❤️ Curta a publicação oficial do sorteio",
    "💬 Marque 2 amigos nos comentários",
    "🛒 Faça sua compra pelo site da Vizinha",
    "",
    "📅 *Sorteio: 08/08, às 20h*",
    "O resultado será divulgado nos stories dos dois perfis.",
    "",
    "⚠️ Serão dois ganhadores diferentes. Se a pessoa sorteada não cumprir as regras, haverá um novo sorteio para o respectivo prêmio. Os prêmios são pessoais, não podem ser convertidos em dinheiro, e a retirada ou entrega será combinada com cada ganhador.",
    "",
    "📲 *Confira a publicação e cumpra todas as regras:*",
    RAFFLE_POST_URL,
    "",
    "Quanto mais compras pelo site, mais números da sorte e mais chances de ganhar! 🍀",
    "",
    "Boa sorte! 💙✨",
  ].join("\n");
}
