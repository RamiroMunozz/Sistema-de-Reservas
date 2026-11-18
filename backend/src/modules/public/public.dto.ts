import { z } from "zod";
import { fechaHoraSchema, uuidSchema } from "../../core/validacion/esquemas.js";

const LARGO_MAXIMO_DE_NOMBRE = 100;
const SEPARADORES_DE_TELEFONO = /[\s\-()]/g;
const TELEFONO_INTERNACIONAL = /^\d{8,15}$/;

/** Quita espacios, guiones, paréntesis y un `+` inicial (RES-024). */
export const normalizarTelefono = (telefono: string): string =>
  telefono.replace(SEPARADORES_DE_TELEFONO, "").replace(/^\+/, "");

const nombreSchema = (campo: string) =>
  z
    .string(`${campo} es obligatorio`)
    .trim()
    .min(1, `${campo} es obligatorio`)
    .max(
      LARGO_MAXIMO_DE_NOMBRE,
      `${campo} no puede superar los ${LARGO_MAXIMO_DE_NOMBRE} caracteres`,
    );

const telefonoSchema = z
  .string("guestPhone es obligatorio")
  .transform(normalizarTelefono)
  .pipe(
    z
      .string()
      .regex(
        TELEFONO_INTERNACIONAL,
        "guestPhone debe tener entre 8 y 15 dígitos",
      ),
  );

export const crearReservaInvitadoSchema = z.object({
  courtId: uuidSchema("El courtId"),
  startTime: fechaHoraSchema("startTime"),
  endTime: fechaHoraSchema("endTime"),
  guestFirstName: nombreSchema("guestFirstName"),
  guestLastName: nombreSchema("guestLastName"),
  guestPhone: telefonoSchema,
  guestEmail: z.email("guestEmail debe ser un correo válido").optional(),
});

export type CrearReservaInvitadoDTO = z.infer<typeof crearReservaInvitadoSchema>;
