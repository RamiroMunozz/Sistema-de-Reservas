export class AppError extends Error {
  public readonly statusCode: number;
  public readonly isOperational: boolean;

  constructor(message: string, statusCode = 400, isOperational = true) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class ConflictError extends AppError {
  constructor(message = "El recurso ya se encuentra registrado") {
    super(message, 409);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Credenciales inválidas") {
    super(message, 401);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "No tienes permisos para realizar esta acción") {
    super(message, 403);
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Recurso no encontrado") {
    super(message, 404);
  }
}

export class UnprocessableEntityError extends AppError {
  constructor(
    message = "La solicitud no puede ser procesada debido a reglas de negocio",
  ) {
    super(message, 422);
  }
}
