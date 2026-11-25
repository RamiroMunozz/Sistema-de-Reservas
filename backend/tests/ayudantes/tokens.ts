import type { JwtPayload } from "../../src/core/config/security.js";

// Ayudante de las pruebas HTTP: arma el payload firmado según el rol, sin tocar la base.
// No termina en `.test.ts`, así que no es una prueba. Sirve a los proyectos `unit` y `db`.

export type RolDePrueba = "JUGADOR" | "DUENO";

// Negocio fijo de los tokens de dueño de las pruebas que simulan Prisma: ningún servicio lo
// consulta todavía, así que basta con un UUID válido.
export const ID_NEGOCIO_DE_PRUEBA = "5c0a1f0e-7d1b-4a3e-9b52-0c2f6a1d8e47";

export const payloadDePrueba = (
  rol: RolDePrueba,
  userId: string,
  negocioId: string = ID_NEGOCIO_DE_PRUEBA,
): JwtPayload =>
  rol === "DUENO" ? { userId, role: "DUENO", negocioId } : { userId, role: "JUGADOR" };
