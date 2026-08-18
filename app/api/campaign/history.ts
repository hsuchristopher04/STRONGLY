export function weeklyRank(strongDays: number) {
  if (strongDays >= 7) return "Strong Week";
  if (strongDays >= 5) return "Consistent";
  if (strongDays >= 3) return "Building";
  return "Foundation";
}
