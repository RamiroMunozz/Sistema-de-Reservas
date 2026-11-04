import { z } from "zod";

const fechaHoraSchema = (campo: string) =>
  z.string().datetime({
    message: `${campo} debe ser una fecha ISO válida (ej: 2026-08-30T18:00:00.000Z)`,
  });

const uuidSchema = (campo: string) =>
  z.string().uuid(`${campo} debe ser un UUID válido`);

const esFechaExistente = (fecha: string) => {
  const instante = new Date(`${fecha}T00:00:00.000Z`);

  return (
    !Number.isNaN(instante.getTime()) &&
    instante.toISOString().startsWith(fecha)
  );
};

const fechaSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "La fecha debe tener el formato YYYY-MM-DD")
  .refine(esFechaExistente, "La fecha no existe");

const medioDePagoSchema = z.enum(["CASH", "TRANSFER"]);

export const createBookingSchema = z.object({
  courtId: uuidSchema("El courtId"),
  startTime: fechaHoraSchema("startTime"),
  endTime: fechaHoraSchema("endTime"),
  paymentMethod: medioDePagoSchema.default("CASH"),
});

export const crearReservaAdminSchema = createBookingSchema.extend({
  paymentMethod: medioDePagoSchema,
});

export const idReservaSchema = z.object({
  id: uuidSchema("El ID de la reserva"),
});

export const actualizarEstadoSchema = z.object({
  status: z.enum(["PENDING", "CONFIRMED", "CANCELLED", "COMPLETED"]),
});

export const consultaDisponibilidadSchema = z.object({
  courtId: uuidSchema("El courtId"),
  date: fechaSchema,
});

export const consultaDiariaSchema = z.object({
  date: fechaSchema,
});

export type CreateBookingDTO = z.infer<typeof createBookingSchema>;
export type CrearReservaAdminDTO = z.infer<typeof crearReservaAdminSchema>;
