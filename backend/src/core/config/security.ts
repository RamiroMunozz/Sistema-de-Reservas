import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { z } from "zod";

const SALT_ROUNDS = 12;
const ALGORITMO_JWT = "HS256";

export type Rol = "JUGADOR" | "DUENO" | "SUPER_ADMIN";

// Solo el token del DUENO lleva el negocio (claim firmado, decisión 1 del diseño).
export type JwtPayload =
  | { userId: string; role: "JUGADOR" }
  | { userId: string; role: "SUPER_ADMIN" }
  | { userId: string; role: "DUENO"; negocioId: string };

const payloadJwtSchema = z.discriminatedUnion("role", [
  z.object({ userId: z.uuid(), role: z.literal("JUGADOR") }),
  z.object({ userId: z.uuid(), role: z.literal("SUPER_ADMIN") }),
  z.object({
    userId: z.uuid(),
    role: z.literal("DUENO"),
    negocioId: z.uuid(),
  }),
]);

const obtenerSecretoJwt = (): string => {
  const secreto = process.env.JWT_SECRET;

  if (!secreto) {
    throw new Error("JWT_SECRET no está definido.");
  }

  return secreto;
};

export const validarConfiguracionDeSeguridad = (): void => {
  obtenerSecretoJwt();
};

export const hashPassword = async (password: string): Promise<string> => {
  return bcrypt.hash(password, SALT_ROUNDS);
};

export const comparePassword = async (
  password: string,
  hash: string,
): Promise<boolean> => {
  return bcrypt.compare(password, hash);
};

export const generateAccessToken = (payload: JwtPayload): string => {
  return jwt.sign(payload, obtenerSecretoJwt(), {
    algorithm: ALGORITMO_JWT,
    expiresIn: "15m",
  });
};

// Lanza si el token es inválido o si su payload no cumple el esquema (roles viejos, DUENO sin negocio).
export const verifyAccessToken = (token: string): JwtPayload => {
  return payloadJwtSchema.parse(
    jwt.verify(token, obtenerSecretoJwt(), { algorithms: [ALGORITMO_JWT] }),
  );
};

// Lanza si un DUENO no tiene negocio (la restricción users_negocio_segun_rol lo impide en la base).
export const armarPayloadJwt = (usuario: {
  id: string;
  role: Rol;
  negocioId: string | null;
}): JwtPayload => {
  if (usuario.role === "DUENO") {
    if (!usuario.negocioId) {
      throw new Error("Un usuario DUENO debe tener un negocio asignado.");
    }
    return { userId: usuario.id, role: "DUENO", negocioId: usuario.negocioId };
  }

  return { userId: usuario.id, role: usuario.role };
};
