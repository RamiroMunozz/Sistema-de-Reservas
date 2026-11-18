import { describe, expect, it } from "vitest";
import {
  TOKEN_VALIDO,
  generarToken,
  hashearToken,
} from "../src/modules/public/tokenAcceso.js";

describe("generarToken (RES-025)", () => {
  it("devuelve 43 caracteres base64url", () => {
    const token = generarToken();

    expect(token).toHaveLength(43);
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it("no repite el valor entre llamadas", () => {
    expect(generarToken()).not.toBe(generarToken());
  });
});

describe("hashearToken (RES-025)", () => {
  it("devuelve el SHA-256 en hexadecimal (64 caracteres)", () => {
    const hash = hashearToken("token-de-prueba");

    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("coincide con el SHA-256 conocido de una entrada fija", () => {
    // sha256("abc")
    expect(hashearToken("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });

  it("es determinista y distingue entradas distintas", () => {
    expect(hashearToken("uno")).toBe(hashearToken("uno"));
    expect(hashearToken("uno")).not.toBe(hashearToken("dos"));
  });

  it("no devuelve el token en claro", () => {
    const token = generarToken();

    expect(hashearToken(token)).not.toContain(token);
  });
});

describe("TOKEN_VALIDO", () => {
  it("acepta un token generado", () => {
    expect(TOKEN_VALIDO.test(generarToken())).toBe(true);
  });

  it("rechaza longitudes distintas de 43", () => {
    expect(TOKEN_VALIDO.test("a".repeat(42))).toBe(false);
    expect(TOKEN_VALIDO.test("a".repeat(44))).toBe(false);
    expect(TOKEN_VALIDO.test("")).toBe(false);
  });

  it("rechaza caracteres fuera del alfabeto base64url", () => {
    expect(TOKEN_VALIDO.test(`${"a".repeat(42)}+`)).toBe(false);
    expect(TOKEN_VALIDO.test(`${"a".repeat(42)}/`)).toBe(false);
    expect(TOKEN_VALIDO.test(`${"a".repeat(42)}=`)).toBe(false);
    expect(TOKEN_VALIDO.test(`${"a".repeat(42)}\n`)).toBe(false);
  });
});
