import { z } from "zod";

const email = z.string().trim().toLowerCase().email().max(320);

export const loginSchema = z.object({
  email,
  password: z.string().min(1).max(200),
});

export const registerSchema = z.object({
  name: z.string().trim().min(2).max(120),
  organizationName: z.string().trim().min(2).max(160),
  email,
  password: z
    .string()
    .min(12, "Lozinka mora imati najmanje 12 karaktera.")
    .max(200)
    .regex(/[a-z]/, "Lozinka mora sadržati malo slovo.")
    .regex(/[A-Z]/, "Lozinka mora sadržati veliko slovo.")
    .regex(/[0-9]/, "Lozinka mora sadržati broj."),
});

