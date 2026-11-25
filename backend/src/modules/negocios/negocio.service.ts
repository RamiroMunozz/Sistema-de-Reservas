import { Prisma } from "@prisma/client";
import { prisma } from "../../core/config/prisma.js";
import { hashPassword } from "../../core/config/security.js";
import { ConflictError } from "../../core/errors/AppError.js";
import type { AltaNegocioDTO } from "./negocio.dto.js";

const MENSAJE_SLUG_EN_USO = "El slug ya está en uso.";
// Mismo mensaje que el registro (AUT-015).
const MENSAJE_CORREO_EN_USO = "El correo electrónico ya se encuentra en uso";

// Indica si un P2002 corresponde al campo dado (Prisma informa el destino como arreglo o como nombre).
const violaUnicidadDe = (
  error: Prisma.PrismaClientKnownRequestError,
  campo: string,
): boolean => {
  const destino = error.meta?.target;
  if (Array.isArray(destino)) return destino.some((d) => String(d).includes(campo));
  return typeof destino === "string" && destino.includes(campo);
};

export interface NegocioPublico {
  id: string;
  nombre: string;
  slug: string;
}

export class NegocioService {
  // Solo un negocio activo es visible por slug (NEG-006).
  async resolverPorSlug(slug: string): Promise<NegocioPublico | null> {
    return prisma.negocio.findFirst({
      where: { slug, activo: true },
      select: { id: true, nombre: true, slug: true },
    });
  }

  // Crea el negocio y su dueño en una sola transacción: si una parte falla no queda nada (NEG-008).
  async crearConDueno(dto: AltaNegocioDTO) {
    const passwordHash = await hashPassword(dto.dueno.password);

    try {
      return await prisma.$transaction(async (tx) => {
        const negocio = await tx.negocio.create({
          data: { nombre: dto.negocio.nombre, slug: dto.negocio.slug },
          select: { id: true, nombre: true, slug: true, activo: true },
        });

        const dueno = await tx.user.create({
          data: {
            email: dto.dueno.email,
            passwordHash,
            firstName: dto.dueno.firstName,
            lastName: dto.dueno.lastName,
            phone: dto.dueno.phone,
            role: "DUENO",
            negocioId: negocio.id,
          },
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            role: true,
          },
        });

        return { negocio, dueno };
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        if (violaUnicidadDe(error, "slug")) {
          throw new ConflictError(MENSAJE_SLUG_EN_USO);
        }
        if (violaUnicidadDe(error, "email")) {
          throw new ConflictError(MENSAJE_CORREO_EN_USO);
        }
      }
      throw error;
    }
  }
}
