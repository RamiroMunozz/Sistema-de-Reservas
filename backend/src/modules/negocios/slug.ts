export const FORMATO_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const LONGITUD_MINIMA_SLUG = 3;
export const LONGITUD_MAXIMA_SLUG = 40;

// Rutas propias de la aplicación: un negocio no puede usarlas como slug (NEG-003).
export const SLUGS_RESERVADOS: readonly string[] = [
  "admin",
  "login",
  "reserva",
  "mis-reservas",
  "registro",
  "api",
  "assets",
  "plataforma",
  "negocios",
  "public",
  "health",
  "super-admin",
];

export function tieneFormatoSlug(slug: unknown): slug is string {
  return (
    typeof slug === "string" &&
    slug.length >= LONGITUD_MINIMA_SLUG &&
    slug.length <= LONGITUD_MAXIMA_SLUG &&
    FORMATO_SLUG.test(slug)
  );
}

export function esSlugValido(slug: unknown): slug is string {
  return tieneFormatoSlug(slug) && !SLUGS_RESERVADOS.includes(slug);
}
