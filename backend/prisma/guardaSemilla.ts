// La semilla borra todas las tablas antes de cargar datos de desarrollo: nunca debe correr en producción.
export function verificarSemillaPermitida(entorno: string | undefined): void {
  if (entorno === "production") {
    throw new Error(
      "La semilla borra todos los datos y no puede ejecutarse en producción (NODE_ENV=production).",
    );
  }
}
