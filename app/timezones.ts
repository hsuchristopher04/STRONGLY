export function isValidTimeZone(value: string) {
  if (!value || value.length > 100) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format(new Date(0));
    return true;
  } catch {
    return false;
  }
}

export function supportedTimeZones() {
  const supportedValuesOf = (Intl as typeof Intl & { supportedValuesOf?: (key: "timeZone") => string[] }).supportedValuesOf;
  const zones = supportedValuesOf ? supportedValuesOf("timeZone") : [
    "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles", "Europe/London",
  ];
  return Array.from(new Set(["UTC", ...zones])).sort((a, b) => a.localeCompare(b));
}
