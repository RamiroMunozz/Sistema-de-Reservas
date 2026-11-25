import { z } from "zod";
import { contrasenaSchema } from "../auth/auth.dto.js";
import {
  LONGITUD_MAXIMA_SLUG,
  LONGITUD_MINIMA_SLUG,
  SLUGS_RESERVADOS,
  FORMATO_SLUG,
} from "./slug.js";

export const slugSchema = z
  .string()
  .min(
    LONGITUD_MINIMA_SLUG,
    `El slug debe tener al menos ${LONGITUD_MINIMA_SLUG} caracteres`,
  )
  .max(
    LONGITUD_MAXIMA_SLUG,
    `El slug debe tener como máximo ${LONGITUD_MAXIMA_SLUG} caracteres`,
  )
  .regex(
    FORMATO_SLUG,
    "El slug solo admite minúsculas sin acentos, números y guiones medios, sin guiones al inicio, al final ni consecutivos",
  )
  .refine((slug) => !SLUGS_RESERVADOS.includes(slug), {
    message: "El slug está reservado",
  });

export const altaNegocioSchema = z.object({
  negocio: z.object({
    nombre: z
      .string()
      .trim()
      .min(2, "El nombre debe tener al menos 2 caracteres")
      .max(150, "El nombre debe tener como máximo 150 caracteres"),
    slug: slugSchema,
  }),
  dueno: z.object({
    email: z
      .string()
      .email("Formato de correo electrónico inválido")
      .toLowerCase()
      .trim(),
    password: contrasenaSchema,
    firstName: z
      .string()
      .min(2, "El nombre debe tener al menos 2 caracteres")
      .max(100, "El nombre debe tener como máximo 100 caracteres")
      .trim(),
    lastName: z
      .string()
      .min(2, "El apellido debe tener al menos 2 caracteres")
      .max(100, "El apellido debe tener como máximo 100 caracteres")
      .trim(),
    phone: z.string().max(30, "El teléfono debe tener como máximo 30 caracteres").optional(),
  }),
});

export type AltaNegocioDTO = z.infer<typeof altaNegocioSchema>;
