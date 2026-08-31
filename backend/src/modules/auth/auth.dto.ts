import { z } from "zod";

export const registerSchema = z.object({
  email: z
    .string()
    .email("Formato de correo electrónico inválido")
    .toLowerCase()
    .trim(),
  password: z
    .string()
    .min(8, "La contraseña debe tener al menos 8 caracteres")
    .regex(/[A-Z]/, "La contraseña debe tener al menos una letra mayúscula")
    .regex(/[0-9]/, "La contraseña debe tener al menos un número"),
  firstName: z
    .string()
    .min(2, "El nombre debe tener al menos 2 caracteres")
    .trim(),
  lastName: z
    .string()
    .min(2, "El apellido debe tener al menos 2 caracteres")
    .trim(),
  phone: z.string().optional(),
});

export const loginSchema = z.object({
  email: z
    .string()
    .email("Formato de correo electrónico inválido")
    .toLowerCase()
    .trim(),
  password: z.string().min(1, "La contraseña es requerida"),
});

export type RegisterDTO = z.infer<typeof registerSchema>;
export type LoginDTO = z.infer<typeof loginSchema>;
