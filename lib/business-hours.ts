import { prisma } from "@/lib/db";
import { BUSINESS_RULES } from "@/lib/site-config";

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

export function getBusinessWeekday(input: Date) {
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone: BUSINESS_TIME_ZONE,
    weekday: "short",
  }).format(input);

  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(weekday);
}

/**
 * Verifica apenas o horário de funcionamento (sem verificar se a loja está aberta no DB).
 * Use para lógica interna que não depende do painel.
 */
export function getBusinessHoursStatus(now = new Date()) {
  const businessTime = getBusinessTimeParts(now);
  const weekday = getBusinessWeekday(now);
  const schedule =
    BUSINESS_RULES.scheduleByWeekday[
      weekday as keyof typeof BUSINESS_RULES.scheduleByWeekday
    ];

  if (!schedule) {
    return {
      isOpen: false,
      message:
        "Estamos fora do horario de atendimento. Funcionamos de terça a sabádo, das 10h as 17h, e domingo, das 9h as 13h.",
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
      : weekday === 0
        ? "Agora estamos fora do horario. Aos domingos atendemos das 9h as 13h."
        : "Agora estamos fora do horario. De terça a sabádo atendemos das 10h as 17h.",
  };
}

/**
 * Retorna as configurações da loja do banco de dados (singleton).
 * Cria o registro com os padrões se ainda não existir.
 */
export async function getStoreSettings() {
  return prisma.storeSettings.upsert({
    where: { id: "singleton" },
    update: {},
    create: {
      id: "singleton",
      isOpen: true,
      minimumLeadHours: BUSINESS_RULES.minimumLeadHours,
    },
  });
}

/**
 * Verifica se a loja está aberta considerando tanto o horário de funcionamento
 * quanto o toggle manual do painel.
 */
export async function getFullStoreStatus(now = new Date()) {
  const [hoursStatus, settings] = await Promise.all([
    getBusinessHoursStatus(now),
    getStoreSettings(),
  ]);

  if (!settings.isOpen) {
    return {
      isOpen: false,
      minimumLeadHours: settings.minimumLeadHours,
      message: "A loja está fechada no momento. Volte em breve!",
      closedByOwner: true,
    };
  }

  return {
    isOpen: hoursStatus.isOpen,
    minimumLeadHours: settings.minimumLeadHours,
    message: hoursStatus.message,
    closedByOwner: false,
  };
}