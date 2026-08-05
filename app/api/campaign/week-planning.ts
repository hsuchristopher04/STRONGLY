export type WeekPlanInput = {
  startsOn: string;
  required: string[];
  bonus: Array<{ dayIndex: number; titles: string[] }>;
  weekly: string[];
};

export function localDate(timezone: string, date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function weekBounds(dateString: string) {
  const date = new Date(`${dateString}T12:00:00Z`);
  const start = new Date(date);
  start.setUTCDate(date.getUTCDate() - date.getUTCDay());
  const end = new Date(start);
  end.setUTCDate(start.getUTCDate() + 6);
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

export function addDays(dateString: string, days: number) {
  const date = new Date(`${dateString}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function cleanTitles(titles: string[]) {
  return titles.map((title) => title.trim()).filter(Boolean);
}

export function validateWeekPlan(input: WeekPlanInput, today: string) {
  const current = weekBounds(today).start;
  const next = addDays(current, 7);
  if (input.startsOn !== current && input.startsOn !== next) throw new Error("Only the current or following week can be planned");
  const required = cleanTitles(input.required);
  const weekly = cleanTitles(input.weekly);
  if (required.length !== 3 || new Set(required.map((title) => title.toLowerCase())).size !== 3) throw new Error("Choose exactly three unique required daily quests");
  if (weekly.length < 1 || weekly.length > 3) throw new Error("Choose between one and three weekly quests");
  if (required.some((title) => title.length > 120) || weekly.some((title) => title.length > 120)) throw new Error("Quest titles must be 120 characters or fewer");
  const bonus = Array.from({ length: 7 }, (_, dayIndex) => {
    const entries = input.bonus.filter((day) => day.dayIndex === dayIndex).flatMap((day) => cleanTitles(day.titles));
    if (entries.length > 2) throw new Error("Each day can have at most two bonus quests");
    if (entries.some((title) => title.length > 120)) throw new Error("Quest titles must be 120 characters or fewer");
    return { dayIndex, titles: entries };
  });
  return { startsOn: input.startsOn, required, weekly, bonus };
}
