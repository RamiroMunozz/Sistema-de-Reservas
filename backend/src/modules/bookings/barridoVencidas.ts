import { BookingStatus } from "@prisma/client";
import { prisma } from "../../core/config/prisma.js";
import { conBloqueoDeCancha } from "./bloqueoCancha.js";
import { liberarReservasVencidas } from "./vencimiento.js";

const INTERVALO_POR_DEFECTO_MS = 60_000;

/**
 * Libera las reservas PENDING vencidas de todas las canchas. Toma el bloqueo de
 * cada cancha, igual que las demás escrituras, y el error de una cancha se
 * registra sin cortar las restantes. Es idempotente: puede correr en varias
 * instancias del servidor.
 */
export const ejecutarBarridoDeVencidas = async (): Promise<void> => {
  const canchas = await prisma.booking.findMany({
    where: { status: BookingStatus.PENDING, expiresAt: { lte: new Date() } },
    distinct: ["courtId"],
    select: { courtId: true },
  });

  for (const { courtId } of canchas) {
    try {
      await conBloqueoDeCancha(courtId, (transaccion) =>
        liberarReservasVencidas(transaccion, courtId),
      );
    } catch (error) {
      console.error(
        `No se pudieron liberar las reservas vencidas de la cancha ${courtId}:`,
        error,
      );
    }
  }
};

/**
 * Programa el barrido periódico (RES-027). El temporizador no mantiene vivo el
 * proceso, las pasadas no se superponen y cada pasada captura sus errores.
 * Se llama desde server.ts después de listen, nunca desde app.ts.
 */
export const iniciarBarridoDeVencidas = (
  intervaloMs: number = INTERVALO_POR_DEFECTO_MS,
): NodeJS.Timeout => {
  let enEjecucion = false;

  const temporizador = setInterval(async () => {
    if (enEjecucion) return;
    enEjecucion = true;
    try {
      await ejecutarBarridoDeVencidas();
    } catch (error) {
      console.error("Falló la pasada del barrido de reservas vencidas:", error);
    } finally {
      enEjecucion = false;
    }
  }, intervaloMs);

  temporizador.unref();
  return temporizador;
};
