import { describe, expect, it } from "vitest";
import { leerTrustProxy } from "../src/core/config/trustProxy.js";

describe("leerTrustProxy (RES-030)", () => {
  it("devuelve false cuando la variable no está definida", () => {
    expect(leerTrustProxy(undefined)).toBe(false);
  });

  it("devuelve false con una cadena vacía", () => {
    expect(leerTrustProxy("")).toBe(false);
  });

  it("devuelve el número de saltos indicado", () => {
    expect(leerTrustProxy("1")).toBe(1);
    expect(leerTrustProxy("2")).toBe(2);
  });

  it("nunca devuelve true", () => {
    expect(leerTrustProxy("true")).toBe(false);
    expect(leerTrustProxy("TRUE")).toBe(false);
  });

  it("devuelve false ante valores que no son un entero no negativo", () => {
    expect(leerTrustProxy("abc")).toBe(false);
    expect(leerTrustProxy("-1")).toBe(false);
    expect(leerTrustProxy("1.5")).toBe(false);
    expect(leerTrustProxy("1 2")).toBe(false);
  });
});
