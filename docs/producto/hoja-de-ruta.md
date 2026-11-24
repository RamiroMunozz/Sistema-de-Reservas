# Hoja de ruta

Cambios SDD en orden de ejecución. Cada uno se desarrolla en `openspec/changes/<cambio>/`. Estados posibles: pendiente, en curso, hecho.

| N.º | Cambio | Estado | Objetivo |
|---|---|---|---|
| 1 | `specs-base` | hecho | Documentar el comportamiento actual en `openspec/specs/` (autenticación, reservas, canchas, pagos, administración). |
| 2 | `deuda-auditoria` | hecho | Resolver la deuda de `docs/historial/auditoria-seguridad.md`: tipado de las métricas sin `any`, `\|\| true` del Dockerfile del backend, rotación de `JWT_SECRET`, 400 ante un UUID mal formado en las rutas de canchas, `PATCH` de cancha sin valores por defecto y rechazo de fechas inexistentes en las métricas. El UTC de `AdminDashboard` y el registro del `userId` ya estaban resueltos; el punto A3 (rechazo de pago) se deriva a `politica-cobro` (fila 7) y `reserva-invitado`. |
| 3 | `reserva-invitado` | hecho | Reservar sin cuenta con nombre, apellido y teléfono celular (`+54 9`, guardado en formato internacional). La reserva queda `PENDING` hasta que se pague la seña por Mercado Pago y, si no se paga en 15 minutos, pasa a `EXPIRED` y libera el turno. El invitado recibe su link privado `/reserva/<código>` antes de pagar y desde ahí consulta, reintenta el pago o cancela. Cada pago aprobado queda en `BookingPayment` con su motivo de reembolso (`AMOUNT_MISMATCH`, `SLOT_TAKEN`, `PAID_AFTER_CANCEL`, `DUPLICATE_PAYMENT`, `OWNER_DISCRETION`). El panel del canchero muestra a los invitados con enlaces `wa.me`, reembolsa por pago contra Mercado Pago (clave de idempotencia por intento) y configura el porcentaje de seña del complejo. Resuelve el punto A3 para las reservas de invitado (DP-09 a DP-14). |
| 4 | `calidad-ci-backend` | hecho | Red de seguridad antes de `multi-tenant-negocios`: pruebas del backend separadas en los proyectos de Vitest `unit` (sin base, `npm run test:unit`) y `db` (base descartable, `npm run test:db`), con una prueba de control que detecta pruebas con base fuera de la lista del proyecto `db`. Integración continua en GitHub Actions (`.github/workflows/ci.yml`, Node 24 según `.nvmrc`) que, en cada push a `desarrollo` o a mano, ejecuta `tsc` y las pruebas del backend con PostgreSQL de servicio, y el lint y el build del frontend. |
| 5 | `multi-tenant-negocios` | pendiente | Introducir el negocio como unidad de aislamiento y los roles `SUPER_ADMIN`, dueño y jugador. |
| 6 | `mercadopago-por-negocio` | pendiente | Usar credenciales de Mercado Pago propias de cada negocio. |
| 7 | `politica-cobro` | pendiente | Política de cobro por negocio: total online, seña o pago en el lugar. Parte de la seña que ya implementa `reserva-invitado`. |
| 8 | `pagina-publica-negocio` | pendiente | Página pública por slug con la marca del negocio. |
| 9 | `panel-super-admin` | pendiente | Panel de la plataforma para gestionar negocios. |
| 10 | `calidad-ci` | pendiente | Pruebas del frontend y su incorporación a la integración continua creada en `calidad-ci-backend`. |
| 11 | `despliegue` | pendiente | Definir y documentar el despliegue en producción. |
| 12 | `documentacion-tesis` | pendiente | Consolidar la documentación como material de la tesis. |

Estado de la fundación (Fase 0): estructura `openspec/`, `docs/`, skills, comandos y agentes de proyecto.
