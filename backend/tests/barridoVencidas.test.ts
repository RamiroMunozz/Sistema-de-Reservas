import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BookingStatus } from "@prisma/client";

const { buscarVarias, actualizarVarias, conBloqueo } = vi.hoisted(() => ({
  buscarVarias: vi.fn(),
  actualizarVarias: vi.fn(),
  conBloqueo: vi.fn(),
}));

vi.mock("../src/core/config/prisma.js", () => ({
  prisma: { booking: { findMany: buscarVarias } },
}));

vi.mock("../src/modules/bookings/bloqueoCancha.js", () => ({
  conBloqueoDeCancha: conBloqueo,
}));

const { ejecutarBarridoDeVencidas, iniciarBarridoDeVencidas } = await import(
  "../src/modules/bookings/barridoVencidas.js"
);

const AHORA = new Date("2031-03-10T12:00:00.000Z");
const INTERVALO = 60_000;

describe("barrido de reservas vencidas (RES-027)", () => {
  let registrarError: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(AHORA);
    buscarVarias.mockReset().mockResolvedValue([]);
    actualizarVarias.mockReset().mockResolvedValue({ count: 1 });
    // El bloqueo simulado ejecuta la operación con una transacción falsa.
    conBloqueo.mockReset().mockImplementation(
      async (_idCancha: string, operacion: (tx: unknown) => Promise<unknown>) =>
        operacion({ booking: { updateMany: actualizarVarias } }),
    );
    registrarError = vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
    registrarError.mockRestore();
  });

  describe("ejecutarBarridoDeVencidas", () => {
    it("busca las canchas con PENDING vencidas, una sola vez por cancha", async () => {
      await ejecutarBarridoDeVencidas();

      expect(buscarVarias).toHaveBeenCalledWith({
        where: { status: BookingStatus.PENDING, expiresAt: { lte: AHORA } },
        distinct: ["courtId"],
        select: { courtId: true },
      });
    });

    it("toma el bloqueo de cada cancha y libera las vencidas dentro de él", async () => {
      buscarVarias.mockResolvedValue([{ courtId: "cancha-1" }, { courtId: "cancha-2" }]);

      await ejecutarBarridoDeVencidas();

      expect(conBloqueo.mock.calls.map((llamada) => llamada[0])).toEqual([
        "cancha-1",
        "cancha-2",
      ]);
      expect(actualizarVarias).toHaveBeenCalledTimes(2);
      expect(actualizarVarias.mock.calls[1]?.[0].where.courtId).toBe("cancha-2");
    });

    it("no toma ningún bloqueo si no hay vencidas", async () => {
      await ejecutarBarridoDeVencidas();

      expect(conBloqueo).not.toHaveBeenCalled();
    });

    it("registra el error de una cancha y sigue con las demás", async () => {
      buscarVarias.mockResolvedValue([
        { courtId: "cancha-1" },
        { courtId: "cancha-2" },
        { courtId: "cancha-3" },
      ]);
      conBloqueo.mockImplementationOnce(async () => {
        throw new Error("falla de la base");
      });

      await expect(ejecutarBarridoDeVencidas()).resolves.toBeUndefined();

      expect(conBloqueo).toHaveBeenCalledTimes(3);
      expect(registrarError).toHaveBeenCalledTimes(1);
      expect(String(registrarError.mock.calls[0]?.[0])).toContain("cancha-1");
    });
  });

  describe("iniciarBarridoDeVencidas", () => {
    it("ejecuta una pasada por intervalo", async () => {
      const temporizador = iniciarBarridoDeVencidas(INTERVALO);

      expect(buscarVarias).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(INTERVALO);
      expect(buscarVarias).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(INTERVALO);
      expect(buscarVarias).toHaveBeenCalledTimes(2);

      clearInterval(temporizador);
    });

    it("usa un intervalo de 60 segundos por defecto", async () => {
      const temporizador = iniciarBarridoDeVencidas();

      await vi.advanceTimersByTimeAsync(INTERVALO - 1);
      expect(buscarVarias).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1);
      expect(buscarVarias).toHaveBeenCalledTimes(1);

      clearInterval(temporizador);
    });

    it("el temporizador no mantiene vivo el proceso (unref)", () => {
      const temporizador = iniciarBarridoDeVencidas(INTERVALO);

      expect(temporizador.hasRef()).toBe(false);

      clearInterval(temporizador);
    });

    it("no superpone pasadas: espera a que termine la anterior", async () => {
      let terminarPasada: (valor: { courtId: string }[]) => void = () => undefined;
      buscarVarias.mockReturnValueOnce(
        new Promise<{ courtId: string }[]>((resolver) => {
          terminarPasada = resolver;
        }),
      );
      const temporizador = iniciarBarridoDeVencidas(INTERVALO);

      await vi.advanceTimersByTimeAsync(INTERVALO * 3);
      expect(buscarVarias).toHaveBeenCalledTimes(1);

      terminarPasada([]);
      await vi.advanceTimersByTimeAsync(INTERVALO);
      expect(buscarVarias).toHaveBeenCalledTimes(2);

      clearInterval(temporizador);
    });

    it("captura el error de una pasada, lo registra y sigue con la siguiente", async () => {
      buscarVarias.mockRejectedValueOnce(new Error("base caída"));
      const temporizador = iniciarBarridoDeVencidas(INTERVALO);

      await vi.advanceTimersByTimeAsync(INTERVALO);
      expect(registrarError).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(INTERVALO);
      expect(buscarVarias).toHaveBeenCalledTimes(2);

      clearInterval(temporizador);
    });
  });
});
