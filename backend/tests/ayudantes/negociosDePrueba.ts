import { randomUUID } from "node:crypto";
import jwt from "jsonwebtoken";
import type { JwtPayload } from "../../src/core/config/security.js";
import { prisma } from "../../src/core/config/prisma.js";

// Ayudante de las pruebas con base (proyecto `db`): no termina en `.test.ts`, así que no es una prueba.

export interface NegocioDePrueba {
  id: string;
  slug: string;
}

/** Crea un negocio con slug único, distinto de `principal`. */
export const crearNegocioDePrueba = async (): Promise<NegocioDePrueba> => {
  const id = randomUUID();
  const slug = `prueba-${id.slice(0, 8)}`;
  await prisma.negocio.create({ data: { id, nombre: `Negocio ${slug}`, slug } });
  return { id, slug };
};

/** Firma un token de acceso con el secreto indicado (el de la prueba, nunca el de `.env`). */
export const firmarToken = (secreto: string, payload: JwtPayload): string =>
  jwt.sign(payload, secreto);

/** Borra un negocio y todo lo que le pertenece, en orden de dependencia. */
export const borrarNegocioDePrueba = async (idNegocio: string): Promise<void> => {
  await prisma.bookingPayment.deleteMany({ where: { booking: { negocioId: idNegocio } } });
  await prisma.booking.deleteMany({ where: { negocioId: idNegocio } });
  await prisma.court.deleteMany({ where: { complex: { negocioId: idNegocio } } });
  await prisma.complex.deleteMany({ where: { negocioId: idNegocio } });
  await prisma.user.deleteMany({ where: { negocioId: idNegocio } });
  await prisma.negocio.deleteMany({ where: { id: idNegocio } });
};
