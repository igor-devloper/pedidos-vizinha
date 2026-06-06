const WHATSAPP_SENTENCE_BREAK = /([.!?])\s+(?=(?:[A-ZÀ-Ý0-9_*]|https?:\/\/|www\.))/g;

export const WHATSAPP_SECTION_DIVIDER = "━━━━━━━━━━━━━━━━━━";

type WhatsAppBlock =
  | string
  | null
  | undefined
  | false
  | Array<string | null | undefined | false>;

type PromoHighlight = {
  nome: string;
  preco: string | number;
};

function cleanupLines(text: string) {
  return text
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function addBreathingRoom(text: string) {
  if (!text.includes("\n") && text.length > 120) {
    return text.replace(WHATSAPP_SENTENCE_BREAK, "$1\n\n");
  }

  return text;
}

export function formatWhatsAppMessage(blocks: WhatsAppBlock[]) {
  return blocks
    .flatMap((block) => {
      if (!block) {
        return [];
      }

      const value = Array.isArray(block) ? block.filter(Boolean).join("\n") : block;
      const normalized = cleanupLines(addBreathingRoom(value));
      return normalized ? [normalized] : [];
    })
    .join("\n\n");
}

export function formatWhatsAppText(text: string) {
  return cleanupLines(addBreathingRoom(text));
}

export function formatWhatsAppList(items: Array<string | null | undefined | false>, bullet = "•") {
  return items.filter(Boolean).map((item) => `${bullet} ${item}`);
}

export function buildPixInstructionsBlock(pixKey: string) {
  return formatWhatsAppMessage([
    "💳 *Pagamento via Pix*",
    [`🔑 *Chave Pix:* ${pixKey}`, "⚠️ A encomenda só é confirmada com pagamento mínimo de *50%*."],
  ]);
}

export function buildSiteOrderInstructionsMessage(cardapioUrl: string) {
  return formatWhatsAppMessage([
    "🛍️ *Como fazer sua encomenda*",
    [
      `📲 Monte e finalize seu pedido pelo site:`,
      cardapioUrl,
      "✅ Lá você escolhe os salgados, informa o horário e conclui tudo com mais praticidade.",
      "💬 Depois da confirmação, o resumo chega aqui no WhatsApp.",
    ],
  ]);
}

export function buildPaymentProofGuidanceMessage(cardapioUrl: string) {
  return formatWhatsAppMessage([
    "💰 *Pagamento em análise*",
    [
      "Recebi sua mensagem sobre pagamento.",
      "Se esse pagamento é de um pedido feito no site, a confirmação chega aqui no WhatsApp assim que a validação for concluída.",
    ],
    [`🛒 Se ainda faltou criar a encomenda, faça direto no site:`, cardapioUrl],
  ]);
}

export function buildWelcomeMessage(cardapioUrl: string) {
  return formatWhatsAppMessage([
    "👋 *Oi! Seja bem-vinda(o) à Vizinha Salgateria.*",
    [
      "Eu posso te ajudar com cardápio, dúvidas e status do seu atendimento.",
      `📲 Se quiser montar sua encomenda agora, use o site:`,
      cardapioUrl,
    ],
    [
      "✨ *Me responda com uma opção:*",
      "*1* - Quero fazer uma encomenda",
      "*2* - Quero ver o cardápio",
      "*3* - Quero tirar uma dúvida",
    ],
  ]);
}

export function buildCatalogOverviewMessage(cardapioUrl: string, promoHighlights: PromoHighlight[]) {
  const formattedPromos = formatWhatsAppList(
    promoHighlights.map((item) => `*${item.nome}* por *R$ ${item.preco}*`),
    "-"
  );

  return formatWhatsAppMessage([
    "🍽️ *Cardápio da Vizinha*",
    [`📲 Veja o cardápio completo aqui:`, cardapioUrl],
    formattedPromos.length > 0 ? ["🔥 *Promoções em destaque:*", ...formattedPromos] : null,
    "✅ Quando decidir, faça a encomenda direto pelo site para montar tudo certinho.",
  ]);
}

export function buildCustomerOrderRejectedMessage(
  code: string,
  cardapioUrl: string,
  ownerReason?: string | null
) {
  return formatWhatsAppMessage([
    "❌ *Pedido não aprovado*",
    [`Seu pedido *#${code}* não foi aceito pela Vizinha.`, ownerReason ? `📝 *Motivo:* ${ownerReason}` : null],
    [`🛍️ Se quiser tentar de novo, monte uma nova encomenda no site:`, cardapioUrl],
  ]);
}

export function buildCustomerAwaitingPaymentMessage(code: string, pixKey: string) {
  return formatWhatsAppMessage([
    "✅ *Pedido aprovado pela Vizinha*",
    [`🛍️ *Pedido #${code}*`, "Para confirmar de vez, falta o pagamento mínimo de *50%* do valor."],
    buildPixInstructionsBlock(pixKey),
    [
      "📩 Quando pagar, me avise por aqui para eu pedir a validação.",
      "⏰ A tolerância de atraso é de 15 minutos para ambas as partes.",
    ],
  ]);
}

export function buildCustomerOrderConfirmedMessage(
  code: string,
  horarioEntrega: string,
  paymentStatus: "FULL" | "HALF" | string
) {
  const paymentText = paymentStatus === "FULL" ? "Pagamento total confirmado." : "Pagamento de 50% confirmado.";

  return formatWhatsAppMessage([
    "✅ *Pedido confirmado!*",
    [
      `🛍️ *Pedido #${code}*`,
      `💳 ${paymentText}`,
      `📅 *Horário combinado:* ${horarioEntrega}`,
    ],
    "⏰ A tolerância de atraso é de 15 minutos para ambas as partes.",
  ]);
}

export function buildOwnerCommandHelpMessage() {
  return formatWhatsAppMessage([
    "🤖 *Comando não reconhecido*",
    [
      "Use um destes formatos:",
      "• APROVAR CODIGO",
      "• PAGO METADE CODIGO",
      "• PAGO TOTAL CODIGO",
      "• RECUSAR CODIGO motivo",
    ],
  ]);
}

export function buildOwnerOrderNotFoundMessage(code: string) {
  return formatWhatsAppMessage(["⚠️ *Encomenda não encontrada*", `Não encontrei a encomenda *#${code}*.`]);
}

export function buildOwnerRejectReasonMessage(code: string) {
  return formatWhatsAppMessage([
    "📝 *Faltou o motivo da recusa*",
    `Me diga o motivo no formato: *RECUSAR ${code} motivo*`,
  ]);
}

export function buildOwnerApprovedAckMessage(code: string) {
  return formatWhatsAppMessage([
    "✅ *Cliente avisado*",
    `A encomenda *#${code}* foi aceita e o cliente já recebeu as orientações de pagamento.`,
  ]);
}

export function buildOwnerPaidAckMessage(code: string) {
  return formatWhatsAppMessage([
    "✅ *Confirmação enviada*",
    `A encomenda *#${code}* foi confirmada para o cliente.`,
  ]);
}

export function buildOwnerRejectedAckMessage(code: string) {
  return formatWhatsAppMessage([
    "✅ *Recusa registrada*",
    `A recusa da encomenda *#${code}* foi registrada e enviada ao cliente.`,
  ]);
}

export function buildPendingApprovalMessage(code: string) {
  return formatWhatsAppMessage([
    "🕐 *Pedido em análise*",
    [
      `Seu pedido *#${code}* já foi enviado para análise da Vizinha.`,
      "Assim que ela aceitar ou recusar, eu te aviso por aqui.",
    ],
  ]);
}

export function buildOwnerPaymentReportedMessage(code: string, customerLabel: string) {
  return formatWhatsAppMessage([
    "💰 *Cliente avisou sobre pagamento*",
    [`🛍️ *Encomenda #${code}*`, `👤 *Cliente:* ${customerLabel}`],
    [
      "Se estiver tudo certo, responda:",
      `• PAGO METADE ${code}`,
      `• PAGO TOTAL ${code}`,
    ],
  ]);
}

export function buildPaymentReportedAckMessage(code: string) {
  return formatWhatsAppMessage([
    "✅ *Pagamento informado*",
    `Avisei a Vizinha sobre o pagamento da encomenda *#${code}*. Assim que ela validar, eu confirmo por aqui.`,
  ]);
}

export function buildAwaitingPaymentReminderMessage(code: string, pixKey: string) {
  return formatWhatsAppMessage([
    "💳 *Pagamento pendente*",
    [`A encomenda *#${code}* já foi aceita e está aguardando pagamento.`],
    buildPixInstructionsBlock(pixKey),
    "📩 Quando pagar, me avise por aqui e, se puder, envie o comprovante.",
  ]);
}

export function buildSupportPromptMessage() {
  return formatWhatsAppMessage([
    "💬 *Pode me perguntar por aqui*",
    "Eu posso te ajudar com sabores, valores, disponibilidade, horário e confirmar se seu atendimento já está em andamento.",
  ]);
}

export function buildAwaitingAnalysisMessage() {
  return formatWhatsAppMessage([
    "🕐 *Seu pedido está em análise*",
    "Assim que eu tiver a resposta da Vizinha, te aviso por aqui.",
  ]);
}

export function buildConfirmedFollowUpMessage(cardapioUrl: string) {
  return formatWhatsAppMessage([
    "✅ *Seu pedido já está confirmado*",
    [`Se quiser fazer outro, monte a nova encomenda pelo site:`, cardapioUrl],
  ]);
}

export function buildFallbackHelpMessage(cardapioUrl: string) {
  return formatWhatsAppMessage([
    "💡 *Posso te ajudar com isso, sim*",
    [`🛍️ Se quiser montar sua encomenda, use o site:`, cardapioUrl],
    "Se for uma dúvida sobre sabores, horário ou pagamento, pode me mandar por aqui.",
  ]);
}
