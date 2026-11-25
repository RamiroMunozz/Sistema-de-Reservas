import { describe, expect, it } from "vitest";
import { verificarSemillaPermitida } from "../prisma/guardaSemilla.js";

// La semilla borra todos los datos: no debe poder correr con NODE_ENV=production (T-5.4b).
describe("guarda de la semilla contra producción", () => {
  it("lanza un error claro con NODE_ENV=production", () => {
    expect(() => verificarSemillaPermitida("production")).toThrow(/producción/);
  });

  it.each(["development", "test", undefined, ""])(
    "no lanza con NODE_ENV=%j",
    (entorno) => {
      expect(() => verificarSemillaPermitida(entorno)).not.toThrow();
    },
  );
});
