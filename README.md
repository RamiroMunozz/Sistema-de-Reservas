# Sistema de Reservas para Complejos Deportivos ⚽🎾

Plataforma full-stack para la administración, visualización y reserva de turnos en complejos deportivos (Fútbol 5, Fútbol 7, Pádel, Tenis). Cuenta con validaciones de disponibilidad en tiempo real con sincronización horaria UTC, integración de pasarela de pagos y panel de control operativo para administradores/cancheros.

---

## 🚀 Tecnologías

### Backend

- **Entorno:** Node.js con TypeScript
- **Framework:** Express.js
- **ORM & Base de Datos:** Prisma ORM con PostgreSQL
- **Autenticación:** JWT (JSON Web Tokens) y bcryptjs
- **Pasarela de Pagos:** SDK Oficial de Mercado Pago

### Frontend

- **Framework:** React 18+ con TypeScript
- **Tooling:** Vite
- **Estilos:** Tailwind CSS
- **Iconografía:** Lucide React
- **Cliente HTTP:** Axios (con interceptores para manejo de tokens)
- **Enrutamiento:** React Router DOM v6

---

## ⚡ Módulos y Funcionalidades

### 1. Módulo de Reservas y Disponibilidad (Cliente)

- **Exploración de Canchas:** Filtros por deporte y visualización de atributos (superficie, techado/indoor, precio).
- **Grilla de Horarios Reactiva:** Detección de turnos tomados y bloqueo visual inmediato (`Ocupado`).
- **Sincronización UTC:** Formato de fecha y hora estandarizado para evitar desfases horarios entre cliente y servidor.
- **Modal de Pago Dual:**
  - **Mercado Pago:** Creación de preferencias de pago con redirección al checkout.
  - **Efectivo:** Confirmación de reserva para abonar directamente en las instalaciones del club.

### 2. Panel Administrativo / Canchero (`/admin`)

- **Grilla Diaria de Turnos:** Visualización matricial de todas las canchas por franja horaria para la fecha seleccionada.
- **Control Operativo de Turnos:** Actualización de estados en un clic (`COMPLETED` para partidos jugados o `CANCELLED`).
- **Carga de Turnos Manuales:** Modal para registrar reservas telefónicas o presenciales asociando método de pago (Efectivo o Transferencia).
- **Métricas Financieras del Mes:**
  - Recaudación total acumulada.
  - Cantidad de reservas confirmadas.
  - Cantidad de reservas canceladas.
- **Gestión del Catálogo de Canchas:** Formulario de alta para nuevas canchas con asignación de deporte, superficie, techado y precio por bloque.
- **Historial General de Reservas:** Listado global de reservas con detalles del usuario, horario y acciones de cancelación.

---

## 📁 Estructura del Proyecto

```text
sistema-de-reservas/
├── backend/
│   ├── prisma/
│   │   └── schema.prisma
│   ├── src/
│   │   ├── core/
│   │   │   └── middlewares/
│   │   ├── modules/
│   │   │   ├── auth/
│   │   │   ├── bookings/
│   │   │   │   ├── booking.controller.ts
│   │   │   │   ├── booking.routes.ts
│   │   │   │   └── booking.service.ts
│   │   │   ├── courts/
│   │   │   └── payments/
│   │   └── server.ts
│   ├── package.json
│   └── tsconfig.json
│
└── frontend/
    ├── src/
    │   ├── api/
    │   │   └── axios.ts
    │   ├── components/
    │   │   └── Navbar.tsx
    │   ├── context/
    │   │   └── useAuth.tsx
    │   ├── pages/
    │   │   ├── AdminDashboard.tsx
    │   │   ├── BookingsPage.tsx
    │   │   └── LoginPage.tsx
    │   ├── types/
    │   │   └── index.ts
    │   ├── App.tsx
    │   └── main.tsx
    ├── package.json
    └── tailwind.config.js
```

## CLONAR REPOSITORIO

git clone [https://github.com/tu-usuario/sistema-de-reservas.git](https://github.com/tu-usuario/sistema-de-reservas.git)
cd sistema-de-reservas

## CONFIGURAR Y LEVANTAR EL BACKEND:

cd backend
npm install

## Crear el archivo .env dentro del directorio backend/:

PORT=3000
DATABASE_URL="postgresql://usuario:password@localhost:5432/sports_booking?schema=public"
JWT_SECRET="tu_jwt_secret_seguro"
MP_ACCESS_TOKEN="tu_access_token_de_mercadopago"
FRONTEND_URL="http://localhost:5173"

## Aplicar las migraciones de Prisma e iniciar el servidor:

npx prisma migrate dev
npm run dev

## CONFIGURAR Y LEVANTAR EL FRONTEND:

cd ../frontend
npm install

## Crear el archivo .env dentro del directorio frontend/:

VITE_API_URL="http://localhost:3000/api/v1"

## Iniciar el servidor de desarrollo:

npm run dev
