import type { NextFunction, Request, Response } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NotFoundError } from "../src/core/errors/AppError.js";

const { buscarNegocio } = vi.hoisted(() => ({ buscarNegocio: vi.fn() }));

vi.mock("../src/core/config/prisma.js", () => ({
  prisma: { negocio: { findFirst: buscarNegocio } },
}));

const { resolverNegocio, resolverNegocioFijo } = await import(
  "../src/core/middlewares/negocio.js"
);

const ID_NEGOCIO = "5c0a1f0e-7d1b-4a3e-9b52-0c2f6a1d8e47";

const solicitud = (slug: string): Request => ({ params: { slug } }) as unknown as Request;

const ejecutar = async (
  middleware: (req: Request, res: Response, next: NextFunction) => unknown,
  req: Request,
): Promise<unknown[]> => {
  const llamadas: unknown[] = [];
  await middleware(req, {} as Response, (error?: unknown) => {
    llamadas.push(error);
  });
  return llamadas;
};

describe("resolutor de negocio por slug (NEG-005, NEG-006)", () => {
  beforeEach(() => {
    buscarNegocio.mockReset();
  });

  it("fija req.idNegocio y req.negocio con un negocio activo", async () => {
    buscarNegocio.mockResolvedValue({ id: ID_NEGOCIO, nombre: "Pádel Norte", slug: "padel-norte" });
    const req = solicitud("padel-norte");

    const llamadas = await ejecutar(resolverNegocio, req);

    expect(llamadas).toEqual([undefined]);
    expect(buscarNegocio.mock.calls[0]?.[0].where).toEqual({ slug: "padel-norte", activo: true });
    expect(req.idNegocio).toBe(ID_NEGOCIO);
    expect(req.negocio).toEqual({ id: ID_NEGOCIO, nombre: "Pádel Norte", slug: "padel-norte" });
  });

  it.each(["Mal_Formado", "ab", "-norte", "cancha--norte", "admin", "x".repeat(41)])(
    "un slug mal formado o reservado (%s) responde 404 sin consultar la base",
    async (slug) => {
      const llamadas = await ejecutar(resolverNegocio, solicitud(slug));

      expect(buscarNegocio).not.toHaveBeenCalled();
      expect(llamadas[0]).toBeInstanceOf(NotFoundError);
      expect((llamadas[0] as NotFoundError).message).toBe("Negocio no encontrado.");
    },
  );

  it("un negocio inexistente o inactivo responde el mismo 404", async () => {
    buscarNegocio.mockResolvedValue(null);

    const llamadas = await ejecutar(resolverNegocio, solicitud("no-existe"));

    expect(llamadas[0]).toBeInstanceOf(NotFoundError);
    expect((llamadas[0] as NotFoundError).message).toBe("Negocio no encontrado.");
  });

  it("resolverNegocioFijo usa el slug indicado y no el de la ruta", async () => {
    buscarNegocio.mockResolvedValue({ id: ID_NEGOCIO, nombre: "Negocio principal", slug: "principal" });
    const req = solicitud("otro-slug");

    await ejecutar(resolverNegocioFijo("principal"), req);

    expect(buscarNegocio.mock.calls[0]?.[0].where).toEqual({ slug: "principal", activo: true });
    expect(req.idNegocio).toBe(ID_NEGOCIO);
  });
});
