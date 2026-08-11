export function canEditDailyQuest(input: {
  completedOn: string;
  today: string;
  masterMode: boolean;
  weekStatus: string;
  startsOn: string;
  endsOn: string;
  kind: "required" | "bonus";
  dayIndex: number | null;
}) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.completedOn) || input.weekStatus !== "active") return false;
  if (input.completedOn < input.startsOn || input.completedOn > input.endsOn || input.completedOn > input.today) return false;
  if (input.completedOn !== input.today && !input.masterMode) return false;
  const scheduledDayIndex = new Date(`${input.completedOn}T12:00:00Z`).getUTCDay();
  return input.kind !== "bonus" || input.dayIndex === scheduledDayIndex;
}
