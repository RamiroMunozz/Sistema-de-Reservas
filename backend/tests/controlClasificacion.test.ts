import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ARCHIVOS_CON_BASE, archivosConBaseFueraDeLista } from "./clasificacion/archivosConBase.js";

describe("Control de la clasificación de pruebas con base", () => {
  const lista = ["tests/conBase.test.ts"] as const;
  // Se arma por partes para que este archivo no contenga la marca literal y no se detecte a sí mismo.
  const marca = "DATABASE_URL_" + "PRUEBA";

  it("informa un archivo con la marca de la base que no está en la lista", () => {
    const resultado = archivosConBaseFueraDeLista(
      [
        {
          ruta: "tests/nueva.test.ts",
          contenido: `describe.skipIf(!process.env.${marca})('x', () => {});`,
        },
      ],
      lista,
    );
    expect(resultado).toEqual(["tests/nueva.test.ts"]);
  });

  it("no informa un archivo con la marca que sí está en la lista", () => {
    const resultado = archivosConBaseFueraDeLista(
      [{ ruta: "tests/conBase.test.ts", contenido: `process.env.${marca}` }],
      lista,
    );
    expect(resultado).toEqual([]);
  });

  it("no informa un archivo sin la marca de la base", () => {
    const resultado = archivosConBaseFueraDeLista(
      [{ ruta: "tests/pura.test.ts", contenido: "it('suma', () => {});" }],
      lista,
    );
    expect(resultado).toEqual([]);
  });

  it("todas las pruebas reales con la marca de la base están en ARCHIVOS_CON_BASE", () => {
    const directorio = path.dirname(fileURLToPath(import.meta.url));
    const archivos = readdirSync(directorio)
      .filter((nombre) => nombre.endsWith(".test.ts"))
      .map((nombre) => ({
        ruta: `tests/${nombre}`,
        contenido: readFileSync(path.join(directorio, nombre), "utf8"),
      }));
    expect(archivos.length).toBeGreaterThan(0);
    expect(archivosConBaseFueraDeLista(archivos, ARCHIVOS_CON_BASE)).toEqual([]);
  });
});
