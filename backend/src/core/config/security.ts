import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";

const SALT_ROUNDS = 12;
const ALGORITMO_JWT = "HS256";

export interface JwtPayload {
  userId: string;
  role: "USER" | "ADMIN";
}

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

export const verifyAccessToken = (token: string): JwtPayload => {
  return jwt.verify(token, obtenerSecretoJwt(), {
    algorithms: [ALGORITMO_JWT],
  }) as unknown as JwtPayload;
};
