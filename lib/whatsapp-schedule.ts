import {
  getBusinessDateKey,
  getBusinessHoursStatus,
  getBusinessTimeParts,
  getBusinessWeekday,
} from "@/lib/business-hours";
import { validateDeliveryDate } from "@/lib/pedidos";
import {
  BUSINESS_RULES,
  DEFAULT_OPERATION_SCHEDULE,
  getScheduleForWeekday,
  normalizeOperationSchedule,
  type BusinessScheduleByWeekday,
} from "@/lib/site-config";

// O Brasil não tem horário de verão desde 2019: o fuso da loja é fixo em UTC-3.
const UTC_OFFSET_HOURS = 3;

const WEEKDAY_NAMES = [
  "domingo",
  "segunda-feira",
  "terça-feira",
  "quarta-feira",
  "quinta-feira",
  "sexta-feira",
  "sábado",
];

const CLOSED_DAY_PHRASES = [
  "aos domingos",
  "às segundas",
  "às terças",
  "às quartas",
  "às quintas",
  "às sextas",
  "aos sábados",
];

export type ScheduleCheck =
  | { ok: true }
  | { ok: false; reason: string; suggestions: string[] };

export type ScheduleInput = {
  now?: Date;
  operationSchedule?: unknown;
  minimumLeadHours?: number;
  /** Chave manual do painel: falsa = loja fechada para pedidos de hoje. */
  storeOpenManually?: boolean;
};

function localDate(year: number, month: number, day: number, hour = 0, minute = 0) {
  return new Date(Date.UTC(year, month - 1, day, hour + UTC_OFFSET_HOURS, minute));
}

function formatHour(hour: number) {
  return `${hour}h`;
}

function capitalize(text: string) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** "27/10" no fuso da loja. */
function formatDayMonth(date: Date) {
  const { day, month } = getBusinessTimeParts(date);
  return `${String(day).padStart(2, "0")}/${String(month).padStart(2, "0")}`;
}

/** Linhas legíveis com o funcionamento da semana (segunda a domingo). */
export function describeWeeklyHours(operationSchedule: unknown = DEFAULT_OPERATION_SCHEDULE) {
  const schedule = normalizeOperationSchedule(operationSchedule);
  return [1, 2, 3, 4, 5, 6, 0].map((weekday) => {
    const day = getScheduleForWeekday(schedule, weekday);
    return {
      weekday,
      name: WEEKDAY_NAMES[weekday],
      open: Boolean(day),
      openHour: day?.openHour ?? null,
      closeHour: day?.closeHour ?? null,
      text: day
        ? `${WEEKDAY_NAMES[weekday]}: das ${formatHour(day.openHour)} às ${formatHour(day.closeHour)}`
        : `${WEEKDAY_NAMES[weekday]}: fechado`,
    };
  });
}

/** Menor horário válido de encomenda, procurando nos próximos dias. */
export function findEarliestSlot(
  now: Date,
  minimumLeadHours: number,
  schedule: BusinessScheduleByWeekday,
  searchDays = 14,
) {
  const earliest = now.getTime() + minimumLeadHours * 3_600_000;
  const slotMs = BUSINESS_RULES.slotMinutes * 60_000;
  const today = getBusinessTimeParts(now);

  for (let offset = 0; offset <= searchDays; offset += 1) {
    const base = localDate(today.year, today.month, today.day + offset);
    const day = getScheduleForWeekday(schedule, getBusinessWeekday(base));
    if (!day) continue;

    const parts = getBusinessTimeParts(base);
    const opens = localDate(parts.year, parts.month, parts.day, day.openHour).getTime();
    const closes = localDate(parts.year, parts.month, parts.day, day.closeHour).getTime();
    const candidate = Math.max(opens, Math.ceil(earliest / slotMs) * slotMs);
    if (candidate <= closes) {
      return new Date(candidate);
    }
  }

  return null;
}

/** Próximos dias com atendimento, a partir do primeiro horário possível. */
export function getNextOpenDays(
  now: Date,
  minimumLeadHours: number,
  schedule: BusinessScheduleByWeekday,
  count = 3,
) {
  const results: string[] = [];
  const seen = new Set<string>();
  let cursor = now;

  for (let guard = 0; guard < 30 && results.length < count; guard += 1) {
    const slot = findEarliestSlot(cursor, minimumLeadHours, schedule);
    if (!slot) break;

    const key = getBusinessDateKey(slot);
    if (!seen.has(key)) {
      seen.add(key);
      const day = getScheduleForWeekday(schedule, getBusinessWeekday(slot))!;
      results.push(
        `${capitalize(WEEKDAY_NAMES[getBusinessWeekday(slot)])} (${formatDayMonth(slot)}), das ${formatHour(day.openHour)} às ${formatHour(day.closeHour)}`,
      );
    }

    // Avança para o dia seguinte ao encontrado.
    const parts = getBusinessTimeParts(slot);
    cursor = new Date(localDate(parts.year, parts.month, parts.day + 1, 0).getTime() - minimumLeadHours * 3_600_000);
  }

  return results;
}

/** Informações da loja prontas para o bot repetir ao cliente. */
export function buildStoreInfo({
  now = new Date(),
  operationSchedule,
  minimumLeadHours = BUSINESS_RULES.minimumLeadHours,
  storeOpenManually = true,
}: ScheduleInput) {
  const schedule = normalizeOperationSchedule(operationSchedule);
  const status = getBusinessHoursStatus(now, schedule);
  const weekday = getBusinessWeekday(now);
  const today = getScheduleForWeekday(schedule, weekday);
  // Loja fechada pelo painel não recebe encomenda para HOJE: as sugestões começam amanhã.
  const parts = getBusinessTimeParts(now);
  const reference = storeOpenManually
    ? now
    : new Date(localDate(parts.year, parts.month, parts.day + 1, 0).getTime() - minimumLeadHours * 3_600_000);
  const earliest = findEarliestSlot(reference, minimumLeadHours, schedule);

  return {
    now: now.toISOString(),
    timeZone: "America/Sao_Paulo (UTC-3)",
    openNow: storeOpenManually && status.isOpen,
    closedByOwner: !storeOpenManually,
    todayHours: today ? `das ${formatHour(today.openHour)} às ${formatHour(today.closeHour)}` : "fechado hoje",
    weeklyHours: describeWeeklyHours(schedule).map((day) => day.text),
    minimumLeadHours,
    slotMinutes: BUSINESS_RULES.slotMinutes,
    earliestOrderTime: earliest ? earliest.toISOString() : null,
    nextOpenDays: getNextOpenDays(reference, minimumLeadHours, schedule, 6),
    acceptsOrdersForFutureDates: true,
  };
}

/** Valida data/hora de entrega ou retirada com as mesmas regras do site. */
export function checkSchedule(scheduledAt: Date, input: ScheduleInput = {}): ScheduleCheck {
  const now = input.now ?? new Date();
  const minimumLeadHours = input.minimumLeadHours ?? BUSINESS_RULES.minimumLeadHours;
  const schedule = normalizeOperationSchedule(input.operationSchedule);

  if (Number.isNaN(scheduledAt.getTime())) {
    return { ok: false, reason: "Não entendi a data e o horário.", suggestions: [] };
  }

  // Sugestões a partir do dia pedido (ou de agora, se o dia pedido já passou).
  const requested = getBusinessTimeParts(scheduledAt);
  const startOfRequestedDay = localDate(requested.year, requested.month, requested.day).getTime();
  const suggestionsFrom = new Date(Math.max(now.getTime(), startOfRequestedDay));
  const suggestions = () => getNextOpenDays(suggestionsFrom, minimumLeadHours, schedule);

  if (input.storeOpenManually === false && getBusinessDateKey(scheduledAt) === getBusinessDateKey(now)) {
    return {
      ok: false,
      reason: "A loja não está recebendo encomendas para hoje.",
      suggestions: suggestions(),
    };
  }

  try {
    validateDeliveryDate(scheduledAt, now, minimumLeadHours, { operationSchedule: schedule });
    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Horário inválido.";
    const weekday = getBusinessWeekday(scheduledAt);
    const day = getScheduleForWeekday(schedule, weekday);
    const earliest = findEarliestSlot(now, minimumLeadHours, schedule);
    const options = suggestions();

    if (!day) {
      return {
        ok: false,
        reason: `Não atendemos ${CLOSED_DAY_PHRASES[weekday]}.`,
        suggestions: options,
      };
    }

    if (scheduledAt.getTime() < now.getTime() + minimumLeadHours * 3_600_000) {
      return {
        ok: false,
        reason: `Precisamos de pelo menos ${minimumLeadHours} horas de antecedência.`,
        suggestions: earliest
          ? [`Primeiro horário possível: ${capitalize(WEEKDAY_NAMES[getBusinessWeekday(earliest)])} (${formatDayMonth(earliest)}) às ${String(getBusinessTimeParts(earliest).hour).padStart(2, "0")}:${String(getBusinessTimeParts(earliest).minute).padStart(2, "0")}`, ...options]
          : options,
      };
    }

    return {
      ok: false,
      reason: `${capitalize(WEEKDAY_NAMES[weekday])}: atendemos das ${formatHour(day.openHour)} às ${formatHour(day.closeHour)}. ${message}`,
      suggestions: [`Escolha um horário entre ${formatHour(day.openHour)} e ${formatHour(day.closeHour)} nesse dia`, ...options],
    };
  }
}
