import { z } from "zod";

export const termsSchema = z.object({
  title: z.string().trim().min(3).max(120),
  description: z.string().trim().max(2000).default(""),
  eligibility: z.string().trim().max(1000).default(""),
  prize: z.string().trim().max(200).default(""),
  winnerCount: z.number().int().min(1).max(10000),
  challengePeriodSeconds: z.number().int().min(600).max(30 * 86400),
  operator: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  createdAt: z.string().datetime(),
});
export type Terms = z.infer<typeof termsSchema>;

export const registerDrawSchema = z.object({
  onchainId: z.string().regex(/^\d+$/),
  txHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
  terms: termsSchema,
  publicSignup: z.boolean().default(false),
  showWinnerLabels: z.boolean().default(false),
});

export const entryInputSchema = z.object({
  label: z.string().trim().min(1).max(120),
  contact: z.string().trim().max(200).optional().transform((v) => (v ? v.toLowerCase() : undefined)),
});

export const addEntriesSchema = z.object({ entries: z.array(entryInputSchema).min(1).max(5000) });

export const settingsSchema = z.object({
  publicSignup: z.boolean().optional(),
  showWinnerLabels: z.boolean().optional(),
});

export const lockSchema = z.object({ unlock: z.boolean().default(false) });

export const verifySchema = z.object({
  message: z.string().min(10).max(2000),
  signature: z.string().regex(/^0x[0-9a-fA-F]+$/),
});
