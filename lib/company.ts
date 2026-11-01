import { randomInt } from "node:crypto";
import { z } from "zod";
export const CompanyInput = z.object({
  name: z.string().trim().min(1).max(160),
  email: z.email().trim().toLowerCase().max(254),
  sector: z.string().trim().min(1).max(160),
}).strict();
export const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
export function accessCode() {
  return Array.from({ length: 10 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join("");
}
export type CompanyRow = { user_id: string; name: string; email: string; sector: string | null; created_at: string; disabled: boolean };
