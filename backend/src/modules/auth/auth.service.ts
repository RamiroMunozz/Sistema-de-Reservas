import { prisma } from "../../core/config/prisma.js";
import {
  hashPassword,
  comparePassword,
  generateAccessToken,
} from "../../core/config/security.js";
import {
  ConflictError,
  UnauthorizedError,
} from "../../core/errors/AppError.js";
import { RegisterDTO, LoginDTO } from "./auth.dto.js";

export class AuthService {
  async register(dto: RegisterDTO) {
    const existingUser = await prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (existingUser) {
      throw new ConflictError("El correo electrónico ya se encuentra en uso");
    }

    const passwordHash = await hashPassword(dto.password);

    const user = await prisma.user.create({
      data: {
        email: dto.email,
        passwordHash,
        firstName: dto.firstName,
        lastName: dto.lastName,
        phone: dto.phone,
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        createdAt: true,
      },
    });

    const accessToken = generateAccessToken({
      userId: user.id,
      role: user.role,
    });

    return { user, accessToken };
  }

  async login(dto: LoginDTO) {
    const user = await prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (!user) {
      throw new UnauthorizedError("Credenciales inválidas");
    }

    const isValidPassword = await comparePassword(
      dto.password,
      user.passwordHash,
    );

    if (!isValidPassword) {
      throw new UnauthorizedError("Credenciales inválidas");
    }

    const accessToken = generateAccessToken({
      userId: user.id,
      role: user.role,
    });

    return {
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
      },
      accessToken,
    };
  }
}
