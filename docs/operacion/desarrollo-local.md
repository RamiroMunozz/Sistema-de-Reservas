# Desarrollo local

Describe el estado actual. Fuentes: `README.md`, `docker-compose.yml`, `backend/package.json` y `frontend/package.json`.

## Requisitos

- Node.js y npm.
- PostgreSQL (el `docker-compose.yml` incluye uno: `postgres:15-alpine`).
- El usuario de la base debe poder crear la extensión `btree_gist` (la requiere la migración `reservas_sin_solapamiento`).

Versión exacta de Node: Pendiente (el repositorio no la fija).

## Base de datos

Opción con Docker, solo la base:

```bash
docker compose up -d postgres
```

El servicio expone el puerto `5432` con la base `sistema_reservas`. Las credenciales de desarrollo están en `docker-compose.yml`.

## Backend

```bash
cd backend
npm install
# crear backend/.env (ver variables-entorno.md)
npx prisma migrate dev
npm run dev
```

- `npm run dev` ejecuta `tsx watch src/server.ts`.
- El puerto por defecto es `3000` (`backend/src/server.ts`); la verificación de salud está en `/health`.
- Datos de ejemplo: `backend/package.json` declara `prisma.seed` (`tsx prisma/seed.ts`), que se ejecuta con `npx prisma db seed`.
- Compilar: `npm run build`; arrancar el compilado: `npm start`.

## Frontend

```bash
cd frontend
npm install
# crear frontend/.env con VITE_API_URL
npm run dev
```

- Puerto de desarrollo: `5173` según `docker-compose.yml` y `FRONTEND_URL` por defecto; Vite lo usa por defecto.
- Calidad: `npm run lint` y `npm run build` (`tsc -b && vite build`).

## Todo con Docker Compose

Copie `.env.example` como `.env` en la raíz y defina `JWT_SECRET`; sin él Compose falla. Luego `docker compose up`. Servicios: base (`5432`), backend (`3000`) y frontend (`5173`).

## Pruebas del backend

```bash
cd backend
npm test
```

Los tests de concurrencia se omiten salvo que `DATABASE_URL_PRUEBA` esté definida. Apuntan a una base descartable con las migraciones aplicadas y borran datos. Ver el skill `testing-backend`.
