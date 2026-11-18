import rateLimit from "express-rate-limit";
import { leerEnteroPositivo } from "../config/entorno.js";
import { AppError } from "../errors/AppError.js";

const QUINCE_MINUTOS_EN_MS = 15 * 60 * 1000;

// Los valores se leen una sola vez, al cargar el módulo (decisión 9).
const ventanaMs = leerEnteroPositivo(
  "LIMITE_CREACION_PUBLICA_VENTANA_MS",
  QUINCE_MINUTOS_EN_MS,
);

const crearLimitador = (maximo: number) =>
  rateLimit({
    windowMs: ventanaMs,
    limit: maximo,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    handler: (_req, _res, next) => {
      next(
        new AppError("Demasiadas solicitudes. Intenta de nuevo más tarde.", 429),
      );
    },
  });

/** Cuenta todas las solicitudes de creación, también las rechazadas (RES-030). */
export const limitadorCreacionPublica = crearLimitador(
  leerEnteroPositivo("LIMITE_CREACION_PUBLICA_MAXIMO", 10),
);

/** Límite propio, más permisivo, de las consultas y acciones por token. */
export const limitadorConsultaPublica = crearLimitador(
  leerEnteroPositivo("LIMITE_CONSULTA_PUBLICA_MAXIMO", 60),
);
