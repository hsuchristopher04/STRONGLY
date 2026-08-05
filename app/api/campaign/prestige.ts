export const DAILY_QUEST_POINTS = 3;
export const STRONG_DAY_POINTS = 10;

export function qualifiesForStrongDay(requiredComplete: number, bonusAssigned: number, bonusComplete: number) {
  return requiredComplete === 3 && bonusComplete === bonusAssigned;
}

export const PRESTIGE_TIERS = [
  { level: 1, threshold: 1_000, title: "Iron Resolve" },
  { level: 2, threshold: 10_000, title: "Unbroken" },
  { level: 3, threshold: 100_000, title: "Mythic" },
  { level: 4, threshold: 1_000_000, title: "Eternal" },
] as const;

export function prestigeStatus(points: number) {
  const safePoints = Math.max(0, points);
  const achieved = [...PRESTIGE_TIERS].reverse().find((tier) => safePoints >= tier.threshold);
  const level = achieved?.level ?? 0;
  const currentThreshold = achieved?.threshold ?? 0;
  const next = PRESTIGE_TIERS.find((tier) => safePoints < tier.threshold);
  const span = next ? next.threshold - currentThreshold : 0;
  const progress = next ? Math.min(100, Math.floor(((safePoints - currentThreshold) / span) * 100)) : 100;
  return {
    points: safePoints,
    level,
    title: achieved?.title ?? "Unprestiged",
    nextThreshold: next?.threshold ?? null,
    nextTitle: next?.title ?? null,
    progress,
    tiers: PRESTIGE_TIERS,
  };
}
