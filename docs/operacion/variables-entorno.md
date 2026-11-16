# Variables de entorno

Fuentes: `README.md`, `docker-compose.yml` y el uso de `process.env` en `backend/src`. No se registran valores secretos.

Nota: `.env.example` no pudo leerse al redactar este documento; compare esta lista con ese archivo. Estado: Pendiente de verificación.

## Backend (`backend/.env`)

| Variable | Obligatoria | Uso |
|---|---|---|
| `DATABASE_URL` | Sí | Cadena de conexión de PostgreSQL para Prisma. |
| `JWT_SECRET` | Sí | Firma de tokens JWT. El backend no arranca sin ella (`backend/src/core/config/security.ts`). Debe ser un valor largo y aleatorio. |
| `PORT` | No | Puerto del servidor; por defecto `3000`. |
| `FRONTEND_URL` | No | Origen permitido por CORS y destino de redirecciones; por defecto `http://localhost:5173`. |
| `BACKEND_URL` | Solo para cobrar | URL pública del backend; se usa para `notification_url` del webhook. En desarrollo requiere un túnel público. |
| `MERCADOPAGO_ACCESS_TOKEN` | Solo para cobrar | Credencial de Mercado Pago. En el objetivo será por negocio. |
| `MERCADOPAGO_WEBHOOK_SECRET` | Solo para cobrar | Clave para validar la firma del webhook. Sin ella el webhook responde 401. |
| `NODE_ENV` | No | Lo lee `backend/src/core/config/prisma.ts`. |
| `DATABASE_URL_PRUEBA` | Solo para pruebas de concurrencia | Base descartable. El README indica que debe tener el mismo valor que `DATABASE_URL`. |

## Frontend (`frontend/.env`)

| Variable | Obligatoria | Uso |
|---|---|---|
| `VITE_API_URL` | Sí | URL base de la API, por ejemplo `http://localhost:3000/api/v1`. |

## Docker Compose (`.env` en la raíz)

`docker-compose.yml` toma `JWT_SECRET` (obligatoria), `BACKEND_URL`, `FRONTEND_URL`, `MERCADOPAGO_ACCESS_TOKEN` y `MERCADOPAGO_WEBHOOK_SECRET` del entorno. La conexión a la base y `VITE_API_URL` están fijadas en el propio archivo.
