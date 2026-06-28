import { prisma } from "@/lib/db";
import {
  BUSINESS_RULES,
  DEFAULT_OPERATION_SCHEDULE,
  getScheduleForWeekday,
  normalizeOperationSchedule,
  type BusinessScheduleByWeekday,
} from "@/lib/site-config";
import { normalizeStoreSiteTheme } from "@/lib/site-theme";

const BUSINESS_TIME_ZONE = "America/Sao_Paulo";

export function getBusinessTimeParts(input: Date) {
  const formatter = new Intl.DateTimeFormat("sv-SE", {
    timeZone: BUSINESS_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });

  const parts = formatter.formatToParts(input);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value || "";

  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    hour: Number(get("hour")),
    minute: Number(get("minute")),
  };
}

export function getBusinessDateKey(input: Date) {
  const { year, month, day } = getBusinessTimeParts(input);

  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function isSameBusinessDate(a: Date, b: Date) {
  return getBusinessDateKey(a) === getBusinessDateKey(b);
}

export function getBusinessWeekday(input: Date) {
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone: BUSINESS_TIME_ZONE,
    weekday: "short",
  }).format(input);

  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(weekday);
}

function formatHour(hour: number) {
  return `${hour}h`;
}

function getScheduleSummary(schedule: BusinessScheduleByWeekday) {
  const days = [
    "domingo",
    "segunda",
    "terca",
    "quarta",
    "quinta",
    "sexta",
    "sabado",
  ];

  return days
    .map((day, index) => {
      const entry = schedule[index as keyof BusinessScheduleByWeekday];
      if (!entry.isOpen) {
        return `${day} fechado`;
      }

      return `${day} das ${formatHour(entry.openHour)} as ${formatHour(entry.closeHour)}`;
    })
    .join(", ");
}

/**
 * Verifica apenas o horario de funcionamento (sem verificar se a loja esta aberta no DB).
 * Use para logica interna que nao depende do painel.
 */
export function getBusinessHoursStatus(
  now = new Date(),
  operationSchedule: unknown = DEFAULT_OPERATION_SCHEDULE,
) {
  const businessTime = getBusinessTimeParts(now);
  const weekday = getBusinessWeekday(now);
  const normalizedSchedule = normalizeOperationSchedule(operationSchedule);
  const schedule = getScheduleForWeekday(normalizedSchedule, weekday);

  if (!schedule) {
    return {
      isOpen: false,
      message: `Estamos fora do horario de atendimento. Horarios: ${getScheduleSummary(normalizedSchedule)}.`,
    };
  }

  const hour = businessTime.hour;
  const minute = businessTime.minute;
  const totalMinutes = hour * 60 + minute;
  const openMinutes = schedule.openHour * 60;
  const closeMinutes = schedule.closeHour * 60;
  const isOpen = totalMinutes >= openMinutes && totalMinutes <= closeMinutes;

  return {
    isOpen,
    message: isOpen
      ? "Estamos em horario de atendimento."
      : `Agora estamos fora do horario. Hoje atendemos das ${formatHour(schedule.openHour)} as ${formatHour(schedule.closeHour)}.`,
  };
}

/**
 * Retorna as configuracoes da loja do banco de dados (singleton).
 * Cria o registro com os padroes se ainda nao existir.
 */
export async function getStoreSettings() {
  return prisma.storeSettings.upsert({
    where: { id: "singleton" },
    update: {},
    create: {
      id: "singleton",
      isOpen: true,
      minimumLeadHours: BUSINESS_RULES.minimumLeadHours,
      allowMultipleOrdersPerSlot: false,
      operationSchedule: DEFAULT_OPERATION_SCHEDULE,
      siteTheme: "COPA",
    },
  });
}

/**
 * Verifica se a loja esta aberta considerando tanto o horario de funcionamento
 * quanto o toggle manual do painel.
 */
export async function getFullStoreStatus(now = new Date()) {
  const settings = await getStoreSettings();
  const operationSchedule = normalizeOperationSchedule(settings.operationSchedule);
  const hoursStatus = getBusinessHoursStatus(now, operationSchedule);

  if (!settings.isOpen) {
    return {
      isOpen: false,
      minimumLeadHours: settings.minimumLeadHours,
      allowMultipleOrdersPerSlot: settings.allowMultipleOrdersPerSlot,
      operationSchedule,
      siteTheme: normalizeStoreSiteTheme(settings.siteTheme),
      featuredProductId: settings.featuredProductId,
      message: "A loja esta fechada no momento. Volte em breve!",
      closedByOwner: true,
    };
  }

  return {
    isOpen: true,
    minimumLeadHours: settings.minimumLeadHours,
    allowMultipleOrdersPerSlot: settings.allowMultipleOrdersPerSlot,
    operationSchedule,
    siteTheme: normalizeStoreSiteTheme(settings.siteTheme),
    featuredProductId: settings.featuredProductId,
    message: hoursStatus.isOpen
      ? hoursStatus.message
      : "A loja esta aberta para receber encomendas.",
    closedByOwner: false,
  };
}
