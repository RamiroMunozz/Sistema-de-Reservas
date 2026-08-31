# Sistema-de-Reservas

sports-booking-api/
├── docker/
│ └── init.sql # Scripts de inicialización (extensión btree_gist)
├── src/
│ ├── core/ # Elementos compartidos transversales
│ │ ├── config/ # Variables de entorno validadas
│ │ ├── errors/ # Clases de error (AppError, ConflictError, etc.)
│ │ └── middlewares/ # Auth, ErrorHandler (RFC 7807), Logger
│ │
│ ├── modules/
│ │ ├── auth/ # Módulo de Autenticación
│ │ ├── courts/ # Módulo de Canchas y Disponibilidad
│ │ └── bookings/ # Módulo de Reservas Transaccionales
│ │ ├── domain/ # Entidades puras, Value Objects, Repositorios (Interfaces)
│ │ ├── application/ # Casos de uso (CreateBookingUseCase), DTOs
│ │ └── infrastructure/ # Controladores HTTP, Repositorios en Postgres (Prisma/TypeORM)
│ │
│ ├── app.ts # Configuración del servidor Express
│ └── server.ts # Punto de entrada (Bootstrap y conexión a BD)
│
├── .dockerignore
├── .env.example
├── .gitignore
├── docker-compose.yml
├── package.json
└── tsconfig.json
