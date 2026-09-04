import { instanceManager } from "./instance-manager.js";
import { logger } from "./logger.js";
import { claimDueWhatsappOffers, patchDraft } from "./whatsapp-draft-repository.js";

const OFFER = "Oi 😊 Vi que o pedido ainda não apareceu por aqui. Se você teve dificuldade no site, não tem problema: eu posso montar sua encomenda por aqui mesmo. Quer fazer pelo WhatsApp?";

export async function processDueWhatsappOffers() {
  const drafts = await claimDueWhatsappOffers();
  for (const draft of drafts) {
    try {
      await instanceManager.sendText(draft.instanceId, draft.remoteJid, OFFER);
      await patchDraft(draft.id, { stage: "AWAITING_WHATSAPP_CHOICE", lastBotMessageAt: new Date() });
    } catch (error) {
      logger.error({ error, draftId: draft.id }, "Failed to send persisted WhatsApp offer");
      await patchDraft(draft.id, { whatsappOfferSentAt: null });
    }
  }
}

export function startWhatsappFollowupWorker() {
  void processDueWhatsappOffers();
  const timer = setInterval(() => void processDueWhatsappOffers(), 30_000);
  timer.unref();
}
