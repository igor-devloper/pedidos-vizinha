import {
  getBusinessHoursStatus,
  getBusinessTimeParts,
  getBusinessWeekday,
} from "@/lib/business-hours";
import { getScheduleForWeekday, normalizeOperationSchedule } from "@/lib/site-config";

const WEEKDAY_NAMES = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];

/** Quando a loja volta a abrir, em palavras simples ("amanhã (sábado) às 10h"). */
export function describeNextOpening(now: Date, operationSchedule: unknown) {
  const schedule = normalizeOperationSchedule(operationSchedule);
  const today = getBusinessTimeParts(now);
  const weekday = getBusinessWeekday(now);

  for (let offset = 0; offset <= 7; offset += 1) {
    const day = getScheduleForWeekday(schedule, (weekday + offset) % 7);
    if (!day) continue;
    if (offset === 0 && today.hour * 60 + today.minute >= day.openHour * 60) continue;

    const name = WEEKDAY_NAMES[(weekday + offset) % 7];
    const when = offset === 0 ? "hoje" : offset === 1 ? `amanhã (${name})` : name;
    return `${when} às ${day.openHour}h`;
  }

  return null;
}

export type StoreNotice = { title: string; text: string };

/**
 * Aviso de loja fechada: diz o que está acontecendo, quando abre e que dá para encomendar
 * para outro dia. Devolve null quando a loja está aberta.
 */
export function buildStoreNotice({
  now = new Date(),
  operationSchedule,
  closedByOwner,
}: {
  now?: Date;
  operationSchedule: unknown;
  closedByOwner: boolean;
}): StoreNotice | null {
  if (closedByOwner) {
    return {
      title: "Hoje não estamos recebendo pedidos",
      text: "Mas você já pode encomendar para outro dia. É só escolher a data no pedido.",
    };
  }

  if (getBusinessHoursStatus(now, normalizeOperationSchedule(operationSchedule)).isOpen) {
    return null;
  }

  const next = describeNextOpening(now, operationSchedule);
  return {
    title: "Estamos fechados agora",
    text: `${next ? `Abrimos ${next}. ` : ""}Você já pode encomendar para outro dia.`,
  };
}
