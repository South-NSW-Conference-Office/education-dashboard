/** Money helpers. Storage is integer minor units (cents); the frontend works in whole dollars. */
export const toMinor = (dollars: number | null | undefined): number => Math.round((Number(dollars) || 0) * 100);
export const toDollars = (minor: number | null | undefined): number => Math.round((Number(minor) || 0) / 100);
export const pct = (part: number, whole: number): number | null => (whole ? (part / Math.abs(whole)) * 100 : null);
