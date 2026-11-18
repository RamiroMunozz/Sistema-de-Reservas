import { createHash, randomBytes } from "node:crypto";

const BYTES_DEL_TOKEN = 32;

/** Formato de un token: 32 bytes en base64url, es decir, 43 caracteres. */
export const TOKEN_VALIDO = /^[A-Za-z0-9_-]{43}$/;

/** Token de acceso privado de una reserva de invitado (RES-025). */
export const generarToken = (): string =>
  randomBytes(BYTES_DEL_TOKEN).toString("base64url");

/** Solo el hash SHA-256 en hexadecimal se persiste; el token en claro no. */
export const hashearToken = (token: string): string =>
  createHash("sha256").update(token).digest("hex");
