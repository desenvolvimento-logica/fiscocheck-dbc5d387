import { z } from "zod";

export const strongPasswordSchema = z
  .string()
  .min(12, "A senha precisa ter pelo menos 12 caracteres")
  .regex(/[A-Z]/, "Inclua pelo menos 1 letra maiúscula")
  .regex(/[a-z]/, "Inclua pelo menos 1 letra minúscula")
  .regex(/[0-9]/, "Inclua pelo menos 1 número")
  .regex(/[^A-Za-z0-9]/, "Inclua pelo menos 1 caractere especial");

export function passwordRulesText() {
  return "Mínimo 12 caracteres, 1 maiúscula, 1 minúscula, 1 número e 1 caractere especial.";
}
