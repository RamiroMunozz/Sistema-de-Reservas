import { Request, Response, NextFunction } from "express";
import { AuthService } from "./auth.service.js";
import { registerSchema, loginSchema } from "./auth.dto.js";

export class AuthController {
  constructor(private readonly authService = new AuthService()) {}

  register = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const validatedData = registerSchema.parse(req.body);
      const result = await this.authService.register(validatedData);
      res.status(201).json(result);
    } catch (error) {
      next(error);
    }
  };

  login = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const validatedData = loginSchema.parse(req.body);
      const result = await this.authService.login(validatedData);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };
}
