import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

// Fuente única de la clasificación de pruebas: la usan `vitest.config.ts` y la prueba de control.
// Pruebas que usan la base de datos real (proyecto "db"). Toda prueba nueva va al
// proyecto "unit" salvo que use la base; en ese caso se agrega a esta lista.
export const ARCHIVOS_CON_BASE: readonly string[] = [
  "tests/concurrenciaReservas.test.ts",
  "tests/integration.test.ts",
  "tests/liberarAlCrearReservaBase.test.ts",
  "tests/migracionNegocios.test.ts",
  "tests/migracionReservaInvitado.test.ts",
  "tests/rutasAdminReservas.test.ts",
  "tests/secretosJwt.test.ts",
];

// Marca que delata una prueba protegida por la base descartable.
const MARCA_BASE = "DATABASE_URL_PRUEBA";

export interface ArchivoDePrueba {
  ruta: string;
  contenido: string;
}

// Devuelve las rutas de los archivos que mencionan la base descartable y no están en la lista.
export function archivosConBaseFueraDeLista(
  archivos: readonly ArchivoDePrueba[],
  lista: readonly string[],
): string[] {
  return archivos
    .filter((archivo) => archivo.contenido.includes(MARCA_BASE) && !lista.includes(archivo.ruta))
    .map((archivo) => archivo.ruta);
}

// Lee de forma recursiva las pruebas `*.test.ts` de `dirBase` y devuelve su ruta relativa con el
// prefijo indicado (por defecto "tests") y barras normales, el mismo formato que `ARCHIVOS_CON_BASE`.
export function listarArchivosDePrueba(dirBase: string, prefijo = "tests"): ArchivoDePrueba[] {
  const resultado: ArchivoDePrueba[] = [];
  for (const entrada of readdirSync(dirBase, { withFileTypes: true })) {
    const rutaCompleta = path.join(dirBase, entrada.name);
    const rutaRelativa = `${prefijo}/${entrada.name}`;
    if (entrada.isDirectory()) {
      resultado.push(...listarArchivosDePrueba(rutaCompleta, rutaRelativa));
    } else if (entrada.isFile() && entrada.name.endsWith(".test.ts")) {
      resultado.push({ ruta: rutaRelativa, contenido: readFileSync(rutaCompleta, "utf8") });
    }
  }
  return resultado;
}

// Devuelve las rutas de la lista que no existen entre las rutas existentes.
export function rutasInexistentes(lista: readonly string[], existentes: readonly string[]): string[] {
  return lista.filter((ruta) => !existentes.includes(ruta));
}
