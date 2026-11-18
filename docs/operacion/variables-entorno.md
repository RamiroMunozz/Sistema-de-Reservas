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
| `BACKEND_URL` | Solo para cobrar | URL pública del backend; se usa para `notification_url` del webhook. En desarrollo requiere un túnel público (Mercado Pago no puede llamar a `localhost`). |
| `MERCADOPAGO_ACCESS_TOKEN` | Solo para cobrar | Credencial de Mercado Pago. En el objetivo será por negocio. En desarrollo, el access token de prueba (ver "Credenciales de prueba de Mercado Pago"). |
| `MERCADOPAGO_WEBHOOK_SECRET` | Solo para cobrar | Clave para validar la firma del webhook. Sin ella el webhook responde 401. Es la clave secreta que Mercado Pago muestra al configurar las notificaciones. |
| `NODE_ENV` | No | Lo lee `backend/src/core/config/prisma.ts`. |
| `DATABASE_URL_PRUEBA` | Solo para pruebas de base | Base descartable, **distinta** de `DATABASE_URL`. `npm test` borra reservas: nunca debe apuntar a la base de desarrollo ni a una con datos reales. Sin ella, las pruebas que usan la base se omiten. Ver "Base descartable para pruebas". |
| `TRUST_PROXY` | No | Saltos de proxy de confianza para obtener la IP real del cliente (límite por IP de la API pública). Sin definir vale `false`; un número indica la cantidad de saltos. Nunca se acepta `true`. Mal configurada anula el límite por IP. |
| `LIMITE_CREACION_PUBLICA_MAXIMO` | No | Máximo de solicitudes a `POST /api/v1/public/bookings` por IP y ventana. Por defecto `10`. Cuenta todas las solicitudes. |
| `LIMITE_CREACION_PUBLICA_VENTANA_MS` | No | Ventana, en milisegundos, de los limitadores públicos. Por defecto `900000` (15 minutos). |
| `LIMITE_CONSULTA_PUBLICA_MAXIMO` | No | Máximo de solicitudes por IP y ventana a las rutas públicas por token (consulta, cancelación y reintento de pago). Por defecto `60`. |
| `TOPE_PENDIENTES_POR_TELEFONO` | No | Máximo de reservas `PENDING` vigentes por teléfono de invitado; el exceso responde 429. Por defecto `2`. |

## Frontend (`frontend/.env`)

| Variable | Obligatoria | Uso |
|---|---|---|
| `VITE_API_URL` | Sí | URL base de la API, por ejemplo `http://localhost:3000/api/v1`. |

## Docker Compose (`.env` en la raíz)

`docker-compose.yml` toma `JWT_SECRET` (obligatoria), `BACKEND_URL`, `FRONTEND_URL`, `MERCADOPAGO_ACCESS_TOKEN` y `MERCADOPAGO_WEBHOOK_SECRET` del entorno. La conexión a la base y `VITE_API_URL` están fijadas en el propio archivo.

## Base descartable para pruebas

`npm test` borra reservas, por eso las pruebas que usan la base corren solo si `DATABASE_URL_PRUEBA` está definida y deben apuntar a una base **distinta** de la de desarrollo.

- Contenedor local de Docker: `reservas_prueba`, en el puerto `5434`.
- URL: `postgresql://prueba:prueba@localhost:5434/reservas_prueba` (credenciales locales de la base descartable, no secretas).
- Las pruebas y las migraciones contra esa base se ejecutan con `DATABASE_URL` y `DATABASE_URL_PRUEBA` definidas en línea con esa URL, para que no se use `backend/.env`:

```bash
cd backend
DATABASE_URL="postgresql://prueba:prueba@localhost:5434/reservas_prueba" DATABASE_URL_PRUEBA="postgresql://prueba:prueba@localhost:5434/reservas_prueba" npx prisma migrate deploy

DATABASE_URL="postgresql://prueba:prueba@localhost:5434/reservas_prueba" DATABASE_URL_PRUEBA="postgresql://prueba:prueba@localhost:5434/reservas_prueba" npm test
```

Aquí `DATABASE_URL` y `DATABASE_URL_PRUEBA` coinciden solo porque ambas apuntan a la base descartable. Con la base de desarrollo, `DATABASE_URL_PRUEBA` nunca debe tener su valor.

## Credenciales de prueba de Mercado Pago

Todas se obtienen en `developers.mercadopago.com`. Nunca se versionan ni se copian en la documentación.

| Variable | Dónde se obtiene |
|---|---|
| `MERCADOPAGO_ACCESS_TOKEN` | Tus integraciones, aplicación, Credenciales de prueba: access token de prueba. |
| `MERCADOPAGO_WEBHOOK_SECRET` | Tus integraciones, aplicación, Webhooks, Configurar notificaciones: clave secreta del webhook. |
| `BACKEND_URL` | Un túnel público hacia el backend local; la ruta de notificación es `POST /api/v1/payments/webhook`. |

## Rotación de `JWT_SECRET`

1. Generar un secreto largo y aleatorio, por ejemplo con `node -e "console.log(require('node:crypto').randomBytes(64).toString('hex'))"`.
2. Reemplazar el valor a mano en `backend/.env` (ejecución local) y en el `.env` de la raíz (Docker Compose).
3. Reiniciar el backend o el contenedor.
4. Impacto: todos los tokens emitidos se invalidan y las sesiones activas deben volver a iniciar sesión (los tokens duran 15 minutos y no se renuevan). Conviene hacerlo en un horario de baja actividad.
5. El valor anterior sigue en el historial de git: rotar lo vuelve inútil, pero no lo borra. No se vuelve nunca a un secreto anterior; ante un problema se genera otro nuevo.
