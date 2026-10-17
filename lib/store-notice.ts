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

export type StoreStatusView = {
  open: boolean;
  /** Primeira linha, curta: "Estamos abertos agora · até as 17h". */
  title: string;
  /** Segunda linha, opcional: quando abre e que dá para encomendar. */
  detail: string | null;
};

/** Texto do cartão de status da loja (topo da página). */
export function buildStoreStatusView({
  now = new Date(),
  operationSchedule,
  closedByOwner,
}: {
  now?: Date;
  operationSchedule: unknown;
  closedByOwner: boolean;
}): StoreStatusView {
  const schedule = normalizeOperationSchedule(operationSchedule);

  if (closedByOwner) {
    return {
      open: false,
      title: "Hoje não estamos recebendo pedidos",
      detail: "Você já pode encomendar para outro dia.",
    };
  }

  if (getBusinessHoursStatus(now, schedule).isOpen) {
    const today = getScheduleForWeekday(schedule, getBusinessWeekday(now));
    return {
      open: true,
      title: today ? `Estamos abertos agora · até as ${today.closeHour}h` : "Estamos abertos agora",
      detail: null,
    };
  }

  const next = describeNextOpening(now, operationSchedule);
  return {
    open: false,
    title: "Estamos fechados agora",
    detail: `${next ? `Abrimos ${next}. ` : ""}Você já pode encomendar.`,
  };
}

export type OpeningHoursRow = { label: string; hours: string; open: boolean };

const SHORT_NAMES = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

/**
 * Horário agrupado para exibir em tabela, começando na terça (como a loja costuma falar):
 * "Terça a sábado · 10h às 17h", "Domingo · 9h às 13h", "Segunda · Fechado".
 */
export function groupOpeningHours(operationSchedule: unknown): OpeningHoursRow[] {
  const schedule = normalizeOperationSchedule(operationSchedule);
  const order = [2, 3, 4, 5, 6, 0, 1];
  const rows: Array<{ days: number[]; hours: string; open: boolean }> = [];

  for (const weekday of order) {
    const day = getScheduleForWeekday(schedule, weekday);
    const hours = day ? `${day.openHour}h às ${day.closeHour}h` : "Fechado";
    const last = rows.at(-1);
    if (last && last.hours === hours) last.days.push(weekday);
    else rows.push({ days: [weekday], hours, open: Boolean(day) });
  }

  return rows.map(({ days, hours, open }) => ({
    label:
      days.length === 1
        ? SHORT_NAMES[days[0]]
        : days.length === 2
          ? `${SHORT_NAMES[days[0]]} e ${SHORT_NAMES[days[1]].toLowerCase()}`
          : `${SHORT_NAMES[days[0]]} a ${SHORT_NAMES[days[days.length - 1]].toLowerCase()}`,
    hours,
    open,
  }));
}
