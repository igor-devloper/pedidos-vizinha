const WHATSAPP_SENTENCE_BREAK =
  /([.!?])\s+(?=(?:[A-Z0-9_*]|https?:\/\/|www\.))/g;

export const WHATSAPP_SECTION_DIVIDER = "\u2501".repeat(18);

type WhatsAppBlock =
  | string
  | null
  | undefined
  | false
  | Array<string | null | undefined | false>;

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

function normalizeBlock(block: string) {
  return cleanupLines(addBreathingRoom(block));
}

export function formatWhatsAppMessage(blocks: WhatsAppBlock[]) {
  return blocks
    .flatMap((block) => {
      if (!block) return [];

      const value = Array.isArray(block)
        ? block.filter(Boolean).join("\n")
        : block;
      const normalized = normalizeBlock(value);
      return normalized ? [normalized] : [];
    })
    .join("\n\n");
}

export function formatWhatsAppList(
  items: Array<string | null | undefined | false>,
  bullet = "\u2022",
) {
  return items.filter(Boolean).map((item) => `${bullet} ${item}`);
}

export function formatWhatsAppText(text: string) {
  return normalizeBlock(text);
}
