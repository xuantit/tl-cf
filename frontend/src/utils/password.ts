/** 0-4 heuristic: ≥8 chars, ≥12 chars, has a digit, has a special char. */
export function passwordStrength(pw: string): number {
  let score = 0
  if (pw.length >= 8) score++
  if (pw.length >= 12) score++
  if (/\d/.test(pw)) score++
  if (/[^A-Za-z0-9]/.test(pw)) score++
  return score
}
