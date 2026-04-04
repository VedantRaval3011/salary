/**
 * OT-granted staff: some days use HR-approved OT Hours only; regular workdays also
 * credit punch-out after shift end (17:30 or custom end).
 */

export function isGrantedStaffSheetOtAuthoritative(
  statusUpper: string,
  dayNameLower: string
): boolean {
  const s = statusUpper.trim();
  const d = dayNameLower.trim().toLowerCase();

  if (s === "H") return true;
  if (s.includes("WO-I")) return true;

  const isSat = d === "sa" || d === "sat" || d === "saturday";
  if (isSat && !s.includes("ADJ-P")) {
    if (s.includes("WO") || s.includes("ADJ-M")) return true;
  }

  return false;
}
