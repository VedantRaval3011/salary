// src/utils/normalizeEmpCode.ts
export interface NormalizedEmpCode {
  strict: string;  // letters+digits only, uppercased
  noZeros: string; // also remove leading zeros (safe variant)
}

export const normalizeEmpCode = (raw?: string | null): NormalizedEmpCode => {
  const base = (raw ?? "").toString().toUpperCase().trim();
  const strict = base.replace(/[^A-Z0-9]/g, "");     // keep only A-Z0-9
  // Remove leading zeros after any non-digit prefix has been stripped already
  // e.g. "000123" -> "123", "EMP00123" stays "EMP00123"
  const noZeros = strict.replace(/^0+/, "");
  return { strict, noZeros };
};
