import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const { buscarUsuario, crearUsuario } = vi.hoisted(() => ({
  buscarUsuario: vi.fn(),
  crearUsuario: vi.fn(),
}));

vi.mock("../src/core/config/prisma.js", () => ({
  prisma: { user: { findUnique: buscarUsuario, create: crearUsuario } },
}));

const { AuthService } = await import("../src/modules/auth/auth.service.js");
const { hashPassword, verifyAccessToken } = await import(
  "../src/core/config/security.js"
);

const SECRETO_DE_PRUEBA = "secreto_de_prueba";
const CONTRASENA = "ClaveSegura123";

describe("AuthService con roles de negocio (AUT-001, AUT-006)", () => {
  const servicio = new AuthService();

  beforeAll(() => {
    vi.stubEnv("JWT_SECRET", SECRETO_DE_PRUEBA);
  });

  afterAll(() => {
    vi.unstubAllEnvs();
  });

  beforeEach(() => {
    buscarUsuario.mockReset();
    crearUsuario.mockReset();
  });

  it("register crea la cuenta con rol JUGADOR y firma un token sin negocio", async () => {
    const id = randomUUID();
    buscarUsuario.mockResolvedValue(null);
    crearUsuario.mockImplementation(async ({ data }: { data: { role?: string } }) => ({
      id,
      email: "nuevo@example.com",
      firstName: "Nuevo",
      lastName: "Jugador",
      role: data.role ?? "JUGADOR",
      createdAt: new Date(),
    }));

    const { accessToken } = await servicio.register({
      email: "nuevo@example.com",
      password: CONTRASENA,
      firstName: "Nuevo",
      lastName: "Jugador",
    });

    const datos = crearUsuario.mock.calls[0][0].data;
    expect(datos.role).toBe("JUGADOR");
    expect(datos).not.toHaveProperty("negocioId");
    expect(verifyAccessToken(accessToken)).toEqual({ userId: id, role: "JUGADOR" });
  });

  it("login de un dueño firma el negocioId en el token", async () => {
    const id = randomUUID();
    const negocioId = randomUUID();
    buscarUsuario.mockResolvedValue({
      id,
      email: "dueno@example.com",
      firstName: "Dueño",
      lastName: "Uno",
      role: "DUENO",
      negocioId,
      passwordHash: await hashPassword(CONTRASENA),
    });

    const { accessToken } = await servicio.login({
      email: "dueno@example.com",
      password: CONTRASENA,
    });

    expect(verifyAccessToken(accessToken)).toEqual({
      userId: id,
      role: "DUENO",
      negocioId,
    });
  });

  it("login de un jugador firma un token sin negocioId", async () => {
    const id = randomUUID();
    buscarUsuario.mockResolvedValue({
      id,
      email: "jugador@example.com",
      firstName: "Jugador",
      lastName: "Uno",
      role: "JUGADOR",
      negocioId: null,
      passwordHash: await hashPassword(CONTRASENA),
    });

    const { accessToken } = await servicio.login({
      email: "jugador@example.com",
      password: CONTRASENA,
    });

    expect(verifyAccessToken(accessToken)).toEqual({ userId: id, role: "JUGADOR" });
  });

  it("login de un SUPER_ADMIN firma un token sin negocioId", async () => {
    const id = randomUUID();
    buscarUsuario.mockResolvedValue({
      id,
      email: "plataforma@example.com",
      firstName: "Plataforma",
      lastName: "Admin",
      role: "SUPER_ADMIN",
      negocioId: null,
      passwordHash: await hashPassword(CONTRASENA),
    });

    const { accessToken } = await servicio.login({
      email: "plataforma@example.com",
      password: CONTRASENA,
    });

    expect(verifyAccessToken(accessToken)).toEqual({ userId: id, role: "SUPER_ADMIN" });
  });
});
