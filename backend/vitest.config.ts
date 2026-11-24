import { configDefaults, defineConfig } from "vitest/config";

import { ARCHIVOS_CON_BASE } from "./tests/clasificacion/archivosConBase.ts";

// La lista de pruebas con base (proyecto "db") vive en `tests/clasificacion/archivosConBase.ts`.
// Toda prueba nueva va al proyecto "unit" salvo que use la base; en ese caso se agrega a esa lista.

export default defineConfig({
  test: {
    // Opciones comunes: los proyectos las heredan con `extends: true`.
    // No declarar `include` ni `exclude` aquí: al heredar, los arreglos se concatenan.
    globals: true,
    environment: "node",
    testTimeout: 10000,
    // Los archivos que usan la base descartable comparten datos: correrlos en serie evita interferencias.
    fileParallelism: false,
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          include: ["tests/**/*.test.ts"],
          exclude: [...configDefaults.exclude, ...ARCHIVOS_CON_BASE],
        },
      },
      {
        extends: true,
        test: {
          name: "db",
          include: ARCHIVOS_CON_BASE,
        },
      },
    ],
  },
});
