import { isAxiosError } from "axios";

interface ErrorDeApi {
  detail?: string;
  message?: string;
  errors?: { field: string; message: string }[];
}

/**
 * Arma el mensaje a mostrar con el `detail` o `message` del servidor; ante un
 * 400 de validación agrega los mensajes de cada campo.
 */
export const mensajeDeError = (error: unknown, porDefecto: string): string => {
  if (!isAxiosError<ErrorDeApi>(error)) {
    return porDefecto;
  }

  const datos = error.response?.data;
  const principal = datos?.detail || datos?.message;

  if (!principal) {
    return porDefecto;
  }

  const campos = datos?.errors?.map((e) => e.message) ?? [];

  return campos.length > 0 ? `${principal} ${campos.join(". ")}.` : principal;
};
