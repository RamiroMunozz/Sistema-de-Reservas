import { ConflictError } from "./AppError.js";

const RESTRICCION_SIN_SOLAPAMIENTO = "bookings_sin_solapamiento";

export const esReservaSolapada = (error: unknown): boolean =>
  error instanceof Error &&
  error.message.includes(RESTRICCION_SIN_SOLAPAMIENTO);

export const convertirReservaSolapada = (error: unknown): unknown =>
  esReservaSolapada(error)
    ? new ConflictError("El turno seleccionado ya fue reservado.")
    : error;
