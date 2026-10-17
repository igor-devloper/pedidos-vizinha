export type WeeklyEntry = {
  weekday: number;
  open: boolean;
  openHour: number | null;
  closeHour: number | null;
};

const NAMES = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

/**
 * Horário da semana em uma frase, a partir do que está configurado no painel
 * ("Terça a quinta: 10h às 17h; Sexta a segunda: fechado"). Começa na terça, como a loja costuma falar.
 */
export function summarizeWeekly(weekly: WeeklyEntry[]) {
  const byDay = new Map(weekly.map((entry) => [entry.weekday, entry]));
  const groups: Array<{ days: number[]; hours: string }> = [];

  for (const weekday of [2, 3, 4, 5, 6, 0, 1]) {
    const entry = byDay.get(weekday);
    const hours = entry?.open && entry.openHour !== null && entry.closeHour !== null ? `${entry.openHour}h às ${entry.closeHour}h` : "fechado";
    const last = groups.at(-1);
    if (last && last.hours === hours) last.days.push(weekday);
    else groups.push({ days: [weekday], hours });
  }

  return groups
    .map(({ days, hours }) => {
      const first = NAMES[days[0]];
      const label =
        days.length === 1 ? first : days.length === 2 ? `${first} e ${NAMES[days[1]].toLowerCase()}` : `${first} a ${NAMES[days[days.length - 1]].toLowerCase()}`;
      return `${label}: ${hours}`;
    })
    .join("; ");
}
