import { BookingStatus, RefundReason } from "@prisma/client";
import { describe, expect, it } from "vitest";
import {
  derivarEstadoSena,
  derivarReembolsoPendiente,
  devolucionACriterioDelCanchero,
  estadoEfectivo,
  pagoValidoVigente,
} from "../src/modules/bookings/estadoSena.js";

const AHORA = new Date("2031-03-10T15:00:00.000Z");
const ANTES = new Date("2031-03-10T14:59:59.000Z");
const DESPUES = new Date("2031-03-10T15:15:00.000Z");

type PagoDePrueba = Parameters<typeof pagoValidoVigente>[0][number];

const pago = (cambios: Partial<PagoDePrueba> = {}): PagoDePrueba => ({
  isValid: true,
  refundReason: null,
  refundedAt: null,
  amount: 300,
  ...cambios,
});

const reembolsado = new Date("2031-03-10T16:00:00.000Z");

describe("estadoEfectivo (RES-028)", () => {
  it("informa EXPIRED para una PENDING con expiresAt en el pasado", () => {
    expect(
      estadoEfectivo({ status: BookingStatus.PENDING, expiresAt: ANTES }, AHORA),
    ).toBe(BookingStatus.EXPIRED);
  });

  it("informa EXPIRED cuando expiresAt es exactamente ahora", () => {
    expect(
      estadoEfectivo({ status: BookingStatus.PENDING, expiresAt: AHORA }, AHORA),
    ).toBe(BookingStatus.EXPIRED);
  });

  it("deja PENDING una reserva vigente", () => {
    expect(
      estadoEfectivo({ status: BookingStatus.PENDING, expiresAt: DESPUES }, AHORA),
    ).toBe(BookingStatus.PENDING);
  });

  it("deja PENDING una reserva sin vencimiento", () => {
    expect(
      estadoEfectivo({ status: BookingStatus.PENDING, expiresAt: null }, AHORA),
    ).toBe(BookingStatus.PENDING);
  });

  it("no altera los demás estados aunque expiresAt haya pasado", () => {
    for (const status of [
      BookingStatus.CONFIRMED,
      BookingStatus.CANCELLED,
      BookingStatus.COMPLETED,
      BookingStatus.EXPIRED,
    ]) {
      expect(estadoEfectivo({ status, expiresAt: ANTES }, AHORA)).toBe(status);
    }
  });
});

describe("pagoValidoVigente", () => {
  it("devuelve el pago válido sin reembolso", () => {
    const vigente = pago();
    expect(pagoValidoVigente([pago({ isValid: false }), vigente])).toBe(vigente);
  });

  it("ignora un pago válido ya reembolsado", () => {
    expect(pagoValidoVigente([pago({ refundedAt: reembolsado })])).toBeNull();
  });

  it("devuelve null sin pagos o con pagos no válidos", () => {
    expect(pagoValidoVigente([])).toBeNull();
    expect(
      pagoValidoVigente([
        pago({ isValid: false, refundReason: RefundReason.AMOUNT_MISMATCH }),
      ]),
    ).toBeNull();
  });
});

describe("derivarEstadoSena (PAG-023)", () => {
  it("es nulo sin depositAmount (reserva con cuenta)", () => {
    expect(derivarEstadoSena({ depositAmount: null }, [pago()])).toBeNull();
  });

  it("es PENDING sin pagos", () => {
    expect(derivarEstadoSena({ depositAmount: 300 }, [])).toBe("PENDING");
  });

  it("es PAID con un pago válido sin reembolso", () => {
    expect(derivarEstadoSena({ depositAmount: 300 }, [pago()])).toBe("PAID");
  });

  it("es REFUNDED cuando el único pago válido fue reembolsado", () => {
    expect(
      derivarEstadoSena({ depositAmount: 300 }, [pago({ refundedAt: reembolsado })]),
    ).toBe("REFUNDED");
  });

  it("es PENDING con un pago AMOUNT_MISMATCH: no cuenta como seña pagada", () => {
    expect(
      derivarEstadoSena({ depositAmount: 300 }, [
        pago({ isValid: false, refundReason: RefundReason.AMOUNT_MISMATCH }),
      ]),
    ).toBe("PENDING");
  });

  it("es PAID si hay un pago válido vigente aunque otro haya sido reembolsado", () => {
    expect(
      derivarEstadoSena({ depositAmount: 300 }, [
        pago({ refundedAt: reembolsado }),
        pago(),
      ]),
    ).toBe("PAID");
  });
});

describe("derivarReembolsoPendiente (PAG-023)", () => {
  it("es null sin pagos con motivo", () => {
    expect(derivarReembolsoPendiente([])).toBeNull();
    expect(derivarReembolsoPendiente([pago()])).toBeNull();
  });

  it("es REQUIRED con un motivo obligatorio sin reembolsar", () => {
    expect(
      derivarReembolsoPendiente([
        pago({ isValid: false, refundReason: RefundReason.SLOT_TAKEN }),
      ]),
    ).toBe("REQUIRED");
  });

  it("es AT_DISCRETION si todos son OWNER_DISCRETION", () => {
    expect(
      derivarReembolsoPendiente([
        pago({ refundReason: RefundReason.OWNER_DISCRETION }),
      ]),
    ).toBe("AT_DISCRETION");
  });

  it("es REQUIRED con una mezcla de motivos obligatorios y a criterio", () => {
    expect(
      derivarReembolsoPendiente([
        pago({ refundReason: RefundReason.OWNER_DISCRETION }),
        pago({ isValid: false, refundReason: RefundReason.DUPLICATE_PAYMENT }),
      ]),
    ).toBe("REQUIRED");
  });

  it("ignora los pagos ya reembolsados", () => {
    expect(
      derivarReembolsoPendiente([
        pago({
          isValid: false,
          refundReason: RefundReason.PAID_AFTER_CANCEL,
          refundedAt: reembolsado,
        }),
      ]),
    ).toBeNull();
  });
});

describe("devolucionACriterioDelCanchero (RES-028)", () => {
  const reserva = (
    status: BookingStatus,
    expiresAt: Date | null = null,
  ) => ({ status, expiresAt, depositAmount: 300 });

  it("es true con una reserva CONFIRMED y la seña pagada", () => {
    expect(
      devolucionACriterioDelCanchero(reserva(BookingStatus.CONFIRMED), [pago()], AHORA),
    ).toBe(true);
  });

  it("es true con una PENDING vigente y la seña pagada", () => {
    expect(
      devolucionACriterioDelCanchero(
        reserva(BookingStatus.PENDING, DESPUES),
        [pago()],
        AHORA,
      ),
    ).toBe(true);
  });

  it("es false con una PENDING sin pago", () => {
    expect(
      devolucionACriterioDelCanchero(
        reserva(BookingStatus.PENDING, DESPUES),
        [],
        AHORA,
      ),
    ).toBe(false);
  });

  it("es false si el estado efectivo es EXPIRED, CANCELLED o COMPLETED", () => {
    expect(
      devolucionACriterioDelCanchero(
        reserva(BookingStatus.PENDING, ANTES),
        [pago()],
        AHORA,
      ),
    ).toBe(false);
    expect(
      devolucionACriterioDelCanchero(reserva(BookingStatus.CANCELLED), [pago()], AHORA),
    ).toBe(false);
    expect(
      devolucionACriterioDelCanchero(reserva(BookingStatus.COMPLETED), [pago()], AHORA),
    ).toBe(false);
  });

  it("es false con la seña reembolsada o con un pago AMOUNT_MISMATCH", () => {
    expect(
      devolucionACriterioDelCanchero(
        reserva(BookingStatus.CONFIRMED),
        [pago({ refundedAt: reembolsado })],
        AHORA,
      ),
    ).toBe(false);
    expect(
      devolucionACriterioDelCanchero(
        reserva(BookingStatus.PENDING, DESPUES),
        [pago({ isValid: false, refundReason: RefundReason.AMOUNT_MISMATCH })],
        AHORA,
      ),
    ).toBe(false);
  });

  it("es false sin depositAmount", () => {
    expect(
      devolucionACriterioDelCanchero(
        { status: BookingStatus.CONFIRMED, expiresAt: null, depositAmount: null },
        [pago()],
        AHORA,
      ),
    ).toBe(false);
  });
});
