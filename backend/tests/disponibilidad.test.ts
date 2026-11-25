import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { filtroOcupaTurno } from "../src/modules/bookings/filtrosReserva.js";

const { buscarCancha, buscarReservas } = vi.hoisted(() => ({
  buscarCancha: vi.fn(),
  buscarReservas: vi.fn(),
}));

vi.mock("../src/core/config/prisma.js", () => ({
  prisma: {
    court: { findFirst: buscarCancha },
    booking: { findMany: buscarReservas },
  },
}));

const { CourtService } = await import("../src/modules/courts/court.service.js");
const { BookingService } = await import("../src/modules/bookings/booking.service.js");

const AHORA = new Date("2031-03-10T12:00:00.000Z");
const ID_NEGOCIO = "5c0a1f0e-7d1b-4a3e-9b52-0c2f6a1d8e47";
const FECHA = "2031-03-12";
const ID_CANCHA = "11111111-1111-4111-8111-111111111111";

const canchaConHorario = {
  id: ID_CANCHA,
  name: "Cancha 1",
  isActive: true,
  pricePerSlot: 1000,
  schedules: [
    {
      openTime: new Date("1970-01-01T10:00:00.000Z"),
      closeTime: new Date("1970-01-01T12:00:00.000Z"),
      slotDurationMinutes: 60,
    },
  ],
};

describe("Lectura de turnos ocupados con filtros compartidos (RES-007, RES-012, RES-013, CAN-006)", () => {
  beforeAll(() => {
    vi.useFakeTimers();
    vi.setSystemTime(AHORA);
  });

  afterAll(() => {
    vi.useRealTimers();
  });

  beforeEach(() => {
    buscarCancha.mockReset().mockResolvedValue(canchaConHorario);
    buscarReservas.mockReset().mockResolvedValue([]);
  });

  describe("disponibilidad de una cancha", () => {
    it("busca la cancha por id y por el negocio en el mismo where", async () => {
      await new CourtService().getCourtAvailability(ID_NEGOCIO, ID_CANCHA, FECHA);

      expect(buscarCancha.mock.calls[0]?.[0].where).toEqual({
        id: ID_CANCHA,
        complex: { negocioId: ID_NEGOCIO },
      });
    });

    it("consulta las reservas con filtroOcupaTurno, que ignora EXPIRED y las PENDING vencidas", async () => {
      await new CourtService().getCourtAvailability(ID_NEGOCIO, ID_CANCHA, FECHA);

      const donde = buscarReservas.mock.calls[0]?.[0].where;
      expect(donde).toMatchObject({ courtId: ID_CANCHA, ...filtroOcupaTurno(AHORA) });
      expect(donde.status).toEqual({ notIn: ["CANCELLED", "EXPIRED"] });
    });

    it("libera el turno cuando la base no devuelve la reserva vencida", async () => {
      const respuesta = await new CourtService().getCourtAvailability(ID_NEGOCIO, ID_CANCHA, FECHA);

      expect(respuesta.slots.every((turno) => turno.isAvailable)).toBe(true);
    });

    it("sigue marcando ocupado un turno con una reserva vigente", async () => {
      buscarReservas.mockResolvedValue([
        {
          startTime: new Date(`${FECHA}T10:00:00.000Z`),
          endTime: new Date(`${FECHA}T11:00:00.000Z`),
        },
      ]);

      const respuesta = await new CourtService().getCourtAvailability(ID_NEGOCIO, ID_CANCHA, FECHA);

      expect(respuesta.slots.map((turno) => turno.isAvailable)).toEqual([false, true]);
    });
  });

  describe("turnos ocupados y agenda del administrador", () => {
    it("getOccupiedSlots usa filtroOcupaTurno", async () => {
      await new BookingService().getOccupiedSlots(ID_CANCHA, FECHA, null);

      expect(buscarReservas.mock.calls[0]?.[0].where).toMatchObject({
        courtId: ID_CANCHA,
        ...filtroOcupaTurno(AHORA),
      });
    });

    it("getOccupiedSlots filtra por negocioId cuando recibe el negocio", async () => {
      await new BookingService().getOccupiedSlots(ID_CANCHA, FECHA, ID_NEGOCIO);

      expect(buscarReservas.mock.calls[0]?.[0].where).toMatchObject({
        courtId: ID_CANCHA,
        negocioId: ID_NEGOCIO,
      });
    });

    it("getOccupiedSlots no agrega negocioId cuando el negocio es null", async () => {
      await new BookingService().getOccupiedSlots(ID_CANCHA, FECHA, null);

      expect(buscarReservas.mock.calls[0]?.[0].where).not.toHaveProperty("negocioId");
    });

    it("la agenda del día no muestra como ocupadas las vencidas (usa filtroOcupaTurno)", async () => {
      await new BookingService().getDailyBookingsForAdmin(ID_NEGOCIO, FECHA);

      const donde = buscarReservas.mock.calls[0]?.[0].where;
      expect(donde).toMatchObject({ negocioId: ID_NEGOCIO, ...filtroOcupaTurno(AHORA) });
      expect(donde.startTime).toEqual({
        gte: new Date(`${FECHA}T00:00:00.000Z`),
        lte: new Date(`${FECHA}T23:59:59.999Z`),
      });
    });
  });
});
