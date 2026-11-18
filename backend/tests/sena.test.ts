import { Prisma } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { calcularSena } from "../src/modules/public/sena.js";

const sena = (total: string, porcentaje: number): string =>
  calcularSena(new Prisma.Decimal(total), porcentaje).toFixed(2);

describe("calcularSena (PAG-022)", () => {
  it("300.00 al 30 % es 90.00", () => {
    expect(sena("300.00", 30)).toBe("90.00");
  });

  it("1000 al 30 % (porcentaje por defecto) es 300.00", () => {
    expect(sena("1000", 30)).toBe("300.00");
  });

  it("redondea a 2 decimales: 10.05 al 33 % es 3.32", () => {
    expect(sena("10.05", 33)).toBe("3.32");
  });

  it("redondea la mitad hacia arriba: 0.05 al 50 % es 0.03", () => {
    expect(sena("0.05", 50)).toBe("0.03");
  });

  it("redondea hacia abajo por debajo de la mitad: 10.01 al 33 % es 3.30", () => {
    expect(sena("10.01", 33)).toBe("3.30");
  });

  it("al 100 % la seña es el precio total", () => {
    expect(sena("1250.50", 100)).toBe("1250.50");
  });

  it("devuelve un Prisma.Decimal", () => {
    expect(calcularSena(new Prisma.Decimal("300"), 30)).toBeInstanceOf(
      Prisma.Decimal,
    );
  });
});
