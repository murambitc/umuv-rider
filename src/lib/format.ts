// umuv-rider/src/lib/format.ts

/**
 * Strips Google Plus Codes (e.g. "9WVG+CWC", "8FVC9G8F+6W") from the START
 * of an address string, leaving the human-readable remainder intact.
 *
 * A Plus Code is ONLY matched when:
 *   - it appears as the first token, AND
 *   - it contains a literal '+' separator.
 *
 * This is intentionally conservative so legitimate addresses such as
 * "Plot 5423, Gaborone" or "C.F.G. Motors, Gaborone" are never mangled.
 *
 * Examples:
 *   "9WVG+CWC, Gaborone, Botswana"   -> "Gaborone, Botswana"
 *   "9WVG+CWC Gaborone"              -> "Gaborone"
 *   "8FVC9G8F+6W"                    -> ""        (no remainder)
 *   "Plot 5423, Gaborone"            -> unchanged
 *   "C.F.G. Motors, Gaborone"        -> unchanged
 *   "Gaborone CBD, Plot 1234"        -> unchanged
 */
export function cleanAddress(raw: string | null | undefined): string {
  if (!raw) return '';
  const trimmed = raw.trim();

  // Full Plus Code: 4–8 chars + '+' + 2–3 chars, optionally followed by a
  // local descriptor after whitespace or comma. Only strip if it's the
  // LEADING token of the string.
  const leadingPlusCode =
    /^[23456789CFGHJMPQRVWX]{4,8}\+[23456789CFGHJMPQRVWX]{2,3}(?=[\s,]|$)/i;

  if (!leadingPlusCode.test(trimmed)) {
    return trimmed;
  }

  // Remove the Plus Code itself, then any leading comma / whitespace.
  const remainder = trimmed
    .replace(leadingPlusCode, '')
    .replace(/^[\s,]+/, '')
    .trim();

  // If the address was ONLY a Plus Code, return the original so the caller
  // can fall back to "12.345, 25.678" coordinates instead of showing nothing.
  return remainder || trimmed;
}