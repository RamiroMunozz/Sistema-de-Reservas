import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  ARCHIVOS_CON_BASE,
  archivosConBaseFueraDeLista,
  listarArchivosDePrueba,
  rutasInexistentes,
} from "./clasificacion/archivosConBase.js";

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

  it("detecta una prueba con la marca en una subcarpeta, con ruta relativa y barras normales", () => {
    const raiz = mkdtempSync(path.join(tmpdir(), "control-clasificacion-"));
    try {
      mkdirSync(path.join(raiz, "sub", "hondo"), { recursive: true });
      writeFileSync(path.join(raiz, "sub", "x.test.ts"), `process.env.${marca}`);
      writeFileSync(path.join(raiz, "sub", "hondo", "y.test.ts"), "it('suma', () => {});");
      writeFileSync(path.join(raiz, "sub", "nota.md"), `process.env.${marca}`);
      const archivos = listarArchivosDePrueba(raiz);
      expect(archivos.map((archivo) => archivo.ruta).sort()).toEqual([
        "tests/sub/hondo/y.test.ts",
        "tests/sub/x.test.ts",
      ]);
      expect(archivosConBaseFueraDeLista(archivos, lista)).toEqual(["tests/sub/x.test.ts"]);
    } finally {
      rmSync(raiz, { recursive: true, force: true });
    }
  });

  it("informa las rutas de la lista que no existen", () => {
    const existentes = ["tests/a.test.ts", "tests/b.test.ts"];
    expect(rutasInexistentes(["tests/a.test.ts", "tests/fantasma.test.ts"], existentes)).toEqual([
      "tests/fantasma.test.ts",
    ]);
  });

  it("no informa nada si todas las rutas de la lista existen", () => {
    expect(rutasInexistentes(["tests/a.test.ts"], ["tests/a.test.ts"])).toEqual([]);
  });

  const directorio = path.dirname(fileURLToPath(import.meta.url));
  const archivosReales = listarArchivosDePrueba(directorio);

  it("todas las pruebas reales con la marca de la base están en ARCHIVOS_CON_BASE", () => {
    expect(archivosReales.length).toBeGreaterThan(0);
    expect(archivosConBaseFueraDeLista(archivosReales, ARCHIVOS_CON_BASE)).toEqual([]);
  });

  it("todas las rutas de ARCHIVOS_CON_BASE existen en disco", () => {
    const existentes = archivosReales.map((archivo) => archivo.ruta);
    expect(rutasInexistentes(ARCHIVOS_CON_BASE, existentes)).toEqual([]);
  });
});
