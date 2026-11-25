import { randomUUID } from "node:crypto";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import app from "../src/app.js";
import { prisma } from "../src/core/config/prisma.js";
import { borrarNegocioDePrueba, firmarToken } from "./ayudantes/negociosDePrueba.js";
import { payloadDePrueba } from "./ayudantes/tokens.js";

// Alta de un negocio con su dueño por el SUPER_ADMIN (NEG-002 a NEG-006, NEG-008, NEG-010, NEG-011,
// AUT-015). Solo corre contra la base descartable.
const URL_BASE_DE_PRUEBA = process.env.DATABASE_URL_PRUEBA;
const SECRETO_DE_PRUEBA = "secreto_de_prueba";
const RUTA = "/api/v1/plataforma/negocios";
const CONTRASENA = "Clave1234";

describe.skipIf(!URL_BASE_DE_PRUEBA)("Alta de negocio y dueño por SUPER_ADMIN", () => {
  const sufijo = randomUUID().slice(0, 8);
  const idsNegocios: string[] = [];
  let tokenSuperAdmin: { Authorization: string };
  let tokenDueno: { Authorization: string };
  let tokenJugador: { Authorization: string };

  const cuerpo = (
    slug: string,
    email: string,
    cambios: { nombre?: string } = {},
  ) => ({
    negocio: { nombre: cambios.nombre ?? `Negocio ${slug}`, slug },
    dueno: { email, password: CONTRASENA, firstName: "Ana", lastName: "Pérez" },
  });

  const slugNuevo = (etiqueta: string) => `alta-${etiqueta}-${sufijo}`;
  const correoNuevo = (etiqueta: string) => `${etiqueta}-${sufijo}@alta.test`;

  const firmarComo = (payload: Parameters<typeof firmarToken>[1]) => ({
    Authorization: `Bearer ${firmarToken(SECRETO_DE_PRUEBA, payload)}`,
  });

  beforeAll(() => {
    vi.stubEnv("JWT_SECRET", SECRETO_DE_PRUEBA);
    tokenSuperAdmin = firmarComo({ userId: randomUUID(), role: "SUPER_ADMIN" });
    tokenDueno = firmarComo(payloadDePrueba("DUENO", randomUUID(), randomUUID()));
    tokenJugador = firmarComo(payloadDePrueba("JUGADOR", randomUUID()));
  });

  afterAll(async () => {
    vi.unstubAllEnvs();
    const negocios = await prisma.negocio.findMany({
      where: { slug: { endsWith: sufijo } },
      select: { id: true },
    });
    for (const negocio of [...negocios.map((n) => n.id), ...idsNegocios]) {
      await borrarNegocioDePrueba(negocio);
    }
    await prisma.user.deleteMany({ where: { email: { endsWith: `${sufijo}@alta.test` } } });
  });

  it("el SUPER_ADMIN crea el negocio y su dueño: 201 sin passwordHash", async () => {
    const slug = slugNuevo("ok");
    const email = correoNuevo("ok");

    const respuesta = await request(app).post(RUTA).set(tokenSuperAdmin).send(cuerpo(slug, email));

    expect(respuesta.status).toBe(201);
    expect(respuesta.body.negocio).toMatchObject({ slug, activo: true });
    expect(respuesta.body.dueno).toMatchObject({ email, firstName: "Ana", role: "DUENO" });
    expect(JSON.stringify(respuesta.body)).not.toContain("passwordHash");
    expect(JSON.stringify(respuesta.body)).not.toContain("password");

    const dueno = await prisma.user.findUnique({ where: { email } });
    expect(dueno?.negocioId).toBe(respuesta.body.negocio.id);
    expect(dueno?.role).toBe("DUENO");
  });

  it("el dueño creado inicia sesión con su negocio en el token", async () => {
    const slug = slugNuevo("login");
    const email = correoNuevo("login");
    const alta = await request(app).post(RUTA).set(tokenSuperAdmin).send(cuerpo(slug, email));
    expect(alta.status).toBe(201);

    const sesion = await request(app).post("/api/v1/auth/login").send({ email, password: CONTRASENA });

    expect(sesion.status).toBe(200);
    const payload = JSON.parse(
      Buffer.from(sesion.body.accessToken.split(".")[1], "base64url").toString("utf8"),
    ) as { role: string; negocioId?: string };
    expect(payload.role).toBe("DUENO");
    expect(payload.negocioId).toBe(alta.body.negocio.id);
  });

  it.each(["Cancha Norte", "ab", "-norte", "cancha--norte", "admin", "login", "mis-reservas"])(
    "slug %j: 400 con el campo del slug y no crea negocio ni dueño",
    async (slug) => {
      const email = correoNuevo(`mal-${randomUUID().slice(0, 4)}`);

      const respuesta = await request(app).post(RUTA).set(tokenSuperAdmin).send(cuerpo(slug, email));

      expect(respuesta.status).toBe(400);
      expect(
        (respuesta.body.errors as { field: string }[]).some((e) => e.field === "negocio.slug"),
      ).toBe(true);
      expect(await prisma.user.count({ where: { email } })).toBe(0);
      expect(await prisma.negocio.count({ where: { slug } })).toBe(0);
    },
  );

  it("slug repetido: 409 sin crear el segundo dueño", async () => {
    const slug = slugNuevo("repe");
    const primero = await request(app)
      .post(RUTA)
      .set(tokenSuperAdmin)
      .send(cuerpo(slug, correoNuevo("repe1")));
    expect(primero.status).toBe(201);

    const segundo = await request(app)
      .post(RUTA)
      .set(tokenSuperAdmin)
      .send(cuerpo(slug, correoNuevo("repe2")));

    expect(segundo.status).toBe(409);
    expect(segundo.body.detail).toBe("El slug ya está en uso.");
    expect(await prisma.user.count({ where: { email: correoNuevo("repe2") } })).toBe(0);
  });

  it("email en uso: 409 y no deja un negocio huérfano", async () => {
    const email = correoNuevo("mail");
    const primero = await request(app)
      .post(RUTA)
      .set(tokenSuperAdmin)
      .send(cuerpo(slugNuevo("mail1"), email));
    expect(primero.status).toBe(201);

    const segundo = await request(app)
      .post(RUTA)
      .set(tokenSuperAdmin)
      .send(cuerpo(slugNuevo("mail2"), email));

    expect(segundo.status).toBe(409);
    expect(segundo.body.detail).toBe("El correo electrónico ya se encuentra en uso");
    expect(await prisma.negocio.count({ where: { slug: slugNuevo("mail2") } })).toBe(0);
  });

  it("dos altas simultáneas con el mismo slug: una 201 y la otra 409, un solo negocio", async () => {
    const slug = slugNuevo("carrera");

    const [a, b] = await Promise.all([
      request(app).post(RUTA).set(tokenSuperAdmin).send(cuerpo(slug, correoNuevo("carrera1"))),
      request(app).post(RUTA).set(tokenSuperAdmin).send(cuerpo(slug, correoNuevo("carrera2"))),
    ]);

    expect([a.status, b.status].sort()).toEqual([201, 409]);
    expect(await prisma.negocio.count({ where: { slug } })).toBe(1);
  });

  it("DUENO y JUGADOR reciben 403 y no crean nada", async () => {
    const slug = slugNuevo("rol");

    const dueno = await request(app).post(RUTA).set(tokenDueno).send(cuerpo(slug, correoNuevo("rol1")));
    const jugador = await request(app)
      .post(RUTA)
      .set(tokenJugador)
      .send(cuerpo(slug, correoNuevo("rol2")));

    expect(dueno.status).toBe(403);
    expect(jugador.status).toBe(403);
    expect(await prisma.negocio.count({ where: { slug } })).toBe(0);
  });

  it("sin token responde 401", async () => {
    const respuesta = await request(app)
      .post(RUTA)
      .send(cuerpo(slugNuevo("sintoken"), correoNuevo("sintoken")));

    expect(respuesta.status).toBe(401);
  });

  it("la base rechaza un segundo dueño para el mismo negocio", async () => {
    const alta = await request(app)
      .post(RUTA)
      .set(tokenSuperAdmin)
      .send(cuerpo(slugNuevo("dos"), correoNuevo("dos1")));
    expect(alta.status).toBe(201);

    await expect(
      prisma.user.create({
        data: {
          email: correoNuevo("dos2"),
          passwordHash: "hash",
          firstName: "Otro",
          lastName: "Dueño",
          role: "DUENO",
          negocioId: alta.body.negocio.id as string,
        },
      }),
    ).rejects.toThrow();
  });
});
