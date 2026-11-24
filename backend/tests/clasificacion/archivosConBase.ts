// Fuente única de la clasificación de pruebas: la usan `vitest.config.ts` y la prueba de control.
// Pruebas que usan la base de datos real (proyecto "db"). Toda prueba nueva va al
// proyecto "unit" salvo que use la base; en ese caso se agrega a esta lista.
export const ARCHIVOS_CON_BASE: readonly string[] = [
  "tests/concurrenciaReservas.test.ts",
  "tests/integration.test.ts",
  "tests/liberarAlCrearReservaBase.test.ts",
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
