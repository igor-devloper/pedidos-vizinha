// Datas em horário de Recife/São Paulo (UTC-3, sem horário de verão). O modelo nunca faz conta
// de calendário: ele diz "sábado", "amanhã" ou "2026-10-17" e o código resolve.

import { stripAccents } from "./name-matching.js";

const TIME_ZONE = "America/Sao_Paulo";
const UTC_OFFSET_HOURS = 3;

export type LocalDate = { year: number; month: number; day: number };

const WEEKDAYS: Record<string, number> = {
  domingo: 0,
  segunda: 1,
  terca: 2,
  quarta: 3,
  quinta: 4,
  sexta: 5,
  sabado: 6,
};

export const WEEKDAY_LABELS = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];

export function localParts(now: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  return { year: get("year"), month: get("month"), day: get("day"), hour: get("hour"), minute: get("minute") };
}

export function weekdayOf({ year, month, day }: LocalDate) {
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

export function addDays({ year, month, day }: LocalDate, amount: number): LocalDate {
  const date = new Date(Date.UTC(year, month - 1, day + amount));
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() };
}

export function formatLocalDate({ year, month, day }: LocalDate) {
  return `${String(day).padStart(2, "0")}/${String(month).padStart(2, "0")}/${year}`;
}

export function describeLocalDate(date: LocalDate) {
  return `${WEEKDAY_LABELS[weekdayOf(date)]}, ${formatLocalDate(date)}`;
}

export type DateArgs = {
  data?: string;
  dia_da_semana?: string;
  dia_relativo?: string;
};

export function resolveDate(now: Date, args: DateArgs): { ok: true; date: LocalDate } | { ok: false; erro: string } {
  const today = localParts(now);
  const todayDate: LocalDate = { year: today.year, month: today.month, day: today.day };

  if (args.data) {
    const iso = String(args.data).trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
    const br = String(args.data).trim().match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?$/);
    const date: LocalDate | null = iso
      ? { year: Number(iso[1]), month: Number(iso[2]), day: Number(iso[3]) }
      : br
        ? { year: br[3] ? Number(br[3]) : today.year, month: Number(br[2]), day: Number(br[1]) }
        : null;
    if (!date || date.month < 1 || date.month > 12 || date.day < 1 || date.day > 31) {
      return { ok: false, erro: `Data inválida: "${args.data}". Use AAAA-MM-DD.` };
    }
    // "dia 10" sem ano já passado neste ano → próximo ano.
    if (br && !br[3] && Date.UTC(date.year, date.month - 1, date.day) < Date.UTC(today.year, today.month - 1, today.day)) {
      date.year += 1;
    }
    return { ok: true, date };
  }

  if (args.dia_relativo) {
    const word = stripAccents(args.dia_relativo).toLowerCase().trim();
    if (word === "hoje") return { ok: true, date: todayDate };
    if (word === "amanha") return { ok: true, date: addDays(todayDate, 1) };
    if (word === "depois de amanha") return { ok: true, date: addDays(todayDate, 2) };
    return { ok: false, erro: `Dia relativo desconhecido: "${args.dia_relativo}". Use hoje, amanha ou depois de amanha.` };
  }

  if (args.dia_da_semana) {
    const word = stripAccents(args.dia_da_semana).toLowerCase().replace(/-?feira/, "").trim();
    const weekday = WEEKDAYS[word];
    if (weekday === undefined) {
      return { ok: false, erro: `Dia da semana desconhecido: "${args.dia_da_semana}".` };
    }
    // Próxima ocorrência, contando hoje (a regra de antecedência recusa se já passou da hora).
    for (let offset = 0; offset < 7; offset += 1) {
      const candidate = addDays(todayDate, offset);
      if (weekdayOf(candidate) === weekday) return { ok: true, date: candidate };
    }
  }

  return { ok: false, erro: "Informe a data (data, dia_da_semana ou dia_relativo)." };
}

export function parseTime(value: string | undefined) {
  if (!value) return null;
  const match = String(value).trim().toLowerCase().match(/^(\d{1,2})(?:\s*(?::|h)\s*(\d{2})?)?\s*(?:h|hs|horas)?$/);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2] ?? 0);
  if (hour > 23 || minute > 59) return null;
  return { hour, minute };
}

/** Data e hora locais → instante UTC (string ISO). */
export function toInstant(date: LocalDate, time: { hour: number; minute: number }) {
  return new Date(Date.UTC(date.year, date.month - 1, date.day, time.hour + UTC_OFFSET_HOURS, time.minute));
}

/** Janela do período do dia, para "sábado à tarde" etc. */
export const PERIOD_WINDOWS: Record<string, { from: number; to: number }> = {
  manha: { from: 6, to: 12 },
  tarde: { from: 13, to: 18 },
  noite: { from: 18, to: 24 },
};
