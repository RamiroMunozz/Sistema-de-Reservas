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
