import { z } from "zod";

export const uuidSchema = (campo: string) =>
  z.string().uuid(`${campo} debe ser un UUID válido`);

export const esFechaExistente = (fecha: string) => {
  const instante = new Date(`${fecha}T00:00:00.000Z`);

  return (
    !Number.isNaN(instante.getTime()) &&
    instante.toISOString().startsWith(fecha)
  );
};

export const fechaHoraSchema = (campo: string) =>
  z.string().datetime({
    message: `${campo} debe ser una fecha ISO válida (ej: 2026-08-30T18:00:00.000Z)`,
  });
