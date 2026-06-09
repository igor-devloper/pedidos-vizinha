import { BUSINESS_RULES } from "@/lib/site-config";

const BUSINESS_TIME_ZONE = "America/Sao_Paulo";

function getBusinessTimeParts(input: Date) {
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

function getBusinessWeekday(input: Date) {
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone: BUSINESS_TIME_ZONE,
    weekday: "short",
  }).format(input);

  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(weekday);
}

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
