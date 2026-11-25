import { describe, expect, it } from "vitest";
import { registerSchema } from "../src/modules/auth/auth.dto.js";
import {
  FORMATO_SLUG,
  SLUGS_RESERVADOS,
  esSlugValido,
} from "../src/modules/negocios/slug.js";
import {
  altaNegocioSchema,
  slugSchema,
} from "../src/modules/negocios/negocio.dto.js";

const dueno = (cambios: Record<string, unknown> = {}) => ({
  email: "dueno@padelnorte.com",
  password: "Clave1234",
  firstName: "Ana",
  lastName: "Pérez",
  ...cambios,
});

const alta = (
  negocio: Record<string, unknown> = {},
  duenoCambios: Record<string, unknown> = {},
) => ({
  negocio: { nombre: "Pádel Norte", slug: "padel-norte", ...negocio },
  dueno: dueno(duenoCambios),
});

describe("formato del slug (NEG-002)", () => {
  it("expone el formato como expresión regular", () => {
    expect(FORMATO_SLUG.source).toBe("^[a-z0-9]+(?:-[a-z0-9]+)*$");
  });

  it.each(["cancha-norte-2", "principal", "abc", "a1b", "a".repeat(40)])(
    "acepta %s",
    (slug) => {
      expect(esSlugValido(slug)).toBe(true);
      expect(slugSchema.safeParse(slug).success).toBe(true);
    },
  );

  it.each([
    "Cancha Norte",
    "canchá_norte",
    "-norte",
    "norte-",
    "cancha--norte",
    "MAYUS",
    "con_guion_bajo",
    "con espacio",
    "",
  ])("rechaza el formato inválido %j", (slug) => {
    expect(esSlugValido(slug)).toBe(false);
    expect(slugSchema.safeParse(slug).success).toBe(false);
  });

  it("rechaza menos de 3 y más de 40 caracteres", () => {
    expect(esSlugValido("ab")).toBe(false);
    expect(esSlugValido("a".repeat(41))).toBe(false);
    expect(slugSchema.safeParse("ab").success).toBe(false);
    expect(slugSchema.safeParse("a".repeat(41)).success).toBe(false);
  });

  it("rechaza valores que no son cadenas", () => {
    expect(esSlugValido(undefined as unknown as string)).toBe(false);
    expect(slugSchema.safeParse(123).success).toBe(false);
  });
});

describe("slugs reservados (NEG-003)", () => {
  it("incluye como mínimo las rutas propias de la aplicación", () => {
    for (const slug of ["login", "reserva", "mis-reservas", "admin", "api"]) {
      expect(SLUGS_RESERVADOS).toContain(slug);
    }
  });

  it("no reserva el slug principal", () => {
    expect(SLUGS_RESERVADOS).not.toContain("principal");
    expect(esSlugValido("principal")).toBe(true);
  });

  it.each([...SLUGS_RESERVADOS])("rechaza el reservado %s", (slug) => {
    expect(esSlugValido(slug)).toBe(false);
    const resultado = slugSchema.safeParse(slug);
    expect(resultado.success).toBe(false);
  });

  it("el alta rechaza un slug reservado indicando el campo slug", () => {
    const resultado = altaNegocioSchema.safeParse(alta({ slug: "admin" }));
    expect(resultado.success).toBe(false);
    if (!resultado.success) {
      expect(
        resultado.error.issues.some((i) => i.path.join(".") === "negocio.slug"),
      ).toBe(true);
    }
  });
});

describe("altaNegocioSchema", () => {
  it("acepta un alta válida", () => {
    const resultado = altaNegocioSchema.safeParse(alta());
    expect(resultado.success).toBe(true);
  });

  it("normaliza el correo del dueño", () => {
    const resultado = altaNegocioSchema.safeParse(
      alta({}, { email: "Dueno@PadelNorte.com" }),
    );
    expect(resultado.success).toBe(true);
    if (resultado.success) {
      expect(resultado.data.dueno.email).toBe("dueno@padelnorte.com");
    }
  });

  it("rechaza un nombre de negocio vacío", () => {
    expect(altaNegocioSchema.safeParse(alta({ nombre: "  " })).success).toBe(
      false,
    );
  });

  it("rechaza campos más largos que las columnas (evita un 500 de la base)", () => {
    expect(
      altaNegocioSchema.safeParse(alta({ nombre: "n".repeat(151) })).success,
    ).toBe(false);
    expect(
      altaNegocioSchema.safeParse(alta({}, { firstName: "a".repeat(101) })).success,
    ).toBe(false);
    expect(
      altaNegocioSchema.safeParse(alta({}, { lastName: "a".repeat(101) })).success,
    ).toBe(false);
    expect(
      altaNegocioSchema.safeParse(alta({}, { phone: "1".repeat(31) })).success,
    ).toBe(false);
    expect(
      altaNegocioSchema.safeParse(alta({ nombre: "n".repeat(150) })).success,
    ).toBe(true);
  });

  it.each(["corta1A", "sinnumeros", "sinmayuscula1", "SINMINUSCULA"])(
    "rechaza la contraseña débil %s igual que el registro",
    (password) => {
      const registro = registerSchema.safeParse({
        email: "dueno@padelnorte.com",
        firstName: "Ana",
        lastName: "Pérez",
        password,
      });
      const resultado = altaNegocioSchema.safeParse(alta({}, { password }));
      expect(resultado.success).toBe(registro.success);
      if (!registro.success) {
        expect(resultado.success).toBe(false);
        if (!resultado.success) {
          const mensajesAlta = resultado.error.issues
            .filter((i) => i.path.join(".") === "dueno.password")
            .map((i) => i.message);
          const mensajesRegistro = registro.error.issues
            .filter((i) => i.path.join(".") === "password")
            .map((i) => i.message);
          expect(mensajesAlta).toEqual(mensajesRegistro);
        }
      }
    },
  );

  it("acepta una contraseña que cumple las reglas del registro", () => {
    expect(
      altaNegocioSchema.safeParse(alta({}, { password: "Valida123" })).success,
    ).toBe(true);
  });
});
