// utils/timeUtils.ts (or top of your file)
export function formatMinutesToHM(minutes: number): string {
  if (!minutes || isNaN(minutes)) return "0:00";
  const hrs = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hrs}:${String(mins).padStart(2, "0")}`;
}

export function formatMinutesToDecimal(minutes: number): string {
  if (!minutes || isNaN(minutes)) return "0.00";
  return (minutes / 60).toFixed(2);
}
