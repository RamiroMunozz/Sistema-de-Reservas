import { describe, expect, it } from "vitest";
import {
  crearReservaInvitadoSchema,
  normalizarTelefono,
} from "../src/modules/public/public.dto.js";

const ID_CANCHA = "5b0c3e5e-3f4a-4a8e-9a37-0f5b8f1b2c3d";

const cuerpo = (cambios: Record<string, unknown> = {}) => ({
  courtId: ID_CANCHA,
  startTime: "2031-03-10T18:00:00.000Z",
  endTime: "2031-03-10T19:00:00.000Z",
  guestFirstName: "Ana",
  guestLastName: "Pérez",
  guestPhone: "5491155551234",
  ...cambios,
});

describe("normalizarTelefono (RES-024)", () => {
  it("quita espacios, guiones, paréntesis y el + inicial", () => {
    expect(normalizarTelefono("+54 9 11 5555-1234")).toBe("5491155551234");
    expect(normalizarTelefono("(011) 5555-1234")).toBe("01155551234");
  });

  it("deja intacto un teléfono que ya son solo dígitos", () => {
    expect(normalizarTelefono("5491155551234")).toBe("5491155551234");
  });
});

describe("crearReservaInvitadoSchema (RES-023, RES-024)", () => {
  it("acepta un cuerpo válido y normaliza el teléfono", () => {
    const resultado = crearReservaInvitadoSchema.parse(
      cuerpo({ guestPhone: "+54 9 11 5555-1234" }),
    );

    expect(resultado.guestPhone).toBe("5491155551234");
    expect(resultado.guestEmail).toBeUndefined();
  });

  it("recorta los espacios del nombre y del apellido", () => {
    const resultado = crearReservaInvitadoSchema.parse(
      cuerpo({ guestFirstName: "  Ana  ", guestLastName: " Pérez " }),
    );

    expect(resultado.guestFirstName).toBe("Ana");
    expect(resultado.guestLastName).toBe("Pérez");
  });

  it("rechaza un nombre formado solo por espacios", () => {
    const resultado = crearReservaInvitadoSchema.safeParse(
      cuerpo({ guestFirstName: "   " }),
    );

    expect(resultado.success).toBe(false);
    expect(resultado.error?.issues[0].path).toEqual(["guestFirstName"]);
  });

  it("rechaza un cuerpo sin apellido", () => {
    const { guestLastName: _omitido, ...sinApellido } = cuerpo();
    const resultado = crearReservaInvitadoSchema.safeParse(sinApellido);

    expect(resultado.success).toBe(false);
    expect(resultado.error?.issues[0].path).toEqual(["guestLastName"]);
  });

  it("acepta 100 caracteres y rechaza 101 en el nombre", () => {
    expect(
      crearReservaInvitadoSchema.safeParse(
        cuerpo({ guestFirstName: "a".repeat(100) }),
      ).success,
    ).toBe(true);
    expect(
      crearReservaInvitadoSchema.safeParse(
        cuerpo({ guestFirstName: "a".repeat(101) }),
      ).success,
    ).toBe(false);
  });

  it("rechaza un teléfono con letras", () => {
    const resultado = crearReservaInvitadoSchema.safeParse(
      cuerpo({ guestPhone: "abc" }),
    );

    expect(resultado.success).toBe(false);
    expect(resultado.error?.issues[0].path).toEqual(["guestPhone"]);
  });

  it("rechaza un teléfono de 5 dígitos y uno de 16, y acepta 8 y 15", () => {
    const valido = (telefono: string) =>
      crearReservaInvitadoSchema.safeParse(cuerpo({ guestPhone: telefono }))
        .success;

    expect(valido("12345")).toBe(false);
    expect(valido("1".repeat(16))).toBe(false);
    expect(valido("1".repeat(8))).toBe(true);
    expect(valido("1".repeat(15))).toBe(true);
  });

  it("acepta un correo válido y rechaza uno inválido", () => {
    expect(
      crearReservaInvitadoSchema.parse(cuerpo({ guestEmail: "ana@example.com" }))
        .guestEmail,
    ).toBe("ana@example.com");

    const resultado = crearReservaInvitadoSchema.safeParse(
      cuerpo({ guestEmail: "no-es-un-correo" }),
    );

    expect(resultado.success).toBe(false);
    expect(resultado.error?.issues[0].path).toEqual(["guestEmail"]);
  });

  it("rechaza un courtId que no es UUID y fechas que no son ISO", () => {
    expect(
      crearReservaInvitadoSchema.safeParse(cuerpo({ courtId: "123" })).success,
    ).toBe(false);
    expect(
      crearReservaInvitadoSchema.safeParse(cuerpo({ startTime: "mañana" }))
        .success,
    ).toBe(false);
  });
});
