# Hoja de ruta

Cambios SDD en orden de ejecución. Cada uno se desarrolla en `openspec/changes/<cambio>/`. Estados posibles: pendiente, en curso, hecho.

| N.º | Cambio | Estado | Objetivo |
|---|---|---|---|
| 1 | `specs-base` | pendiente | Documentar el comportamiento actual en `openspec/specs/` (autenticación, reservas, canchas, pagos, administración). |
| 2 | `deuda-auditoria` | pendiente | Resolver la deuda de `docs/historial/auditoria-seguridad.md`: `any` en `admin.service.ts:15`, UTC en `AdminDashboard.tsx:815`, log de `userId` en `booking.service.ts`, `\|\| true` del Dockerfile del backend, rotar `JWT_SECRET` y punto A3 (rechazo de pago). |
| 3 | `multi-tenant-negocios` | pendiente | Introducir el negocio como unidad de aislamiento y los roles `SUPER_ADMIN`, dueño y jugador. |
| 4 | `mercadopago-por-negocio` | pendiente | Usar credenciales de Mercado Pago propias de cada negocio. |
| 5 | `politica-cobro` | pendiente | Política de cobro por negocio: total online, seña o pago en el lugar. |
| 6 | `pagina-publica-negocio` | pendiente | Página pública por slug con la marca del negocio. |
| 7 | `panel-super-admin` | pendiente | Panel de la plataforma para gestionar negocios. |
| 8 | `calidad-ci` | pendiente | Pruebas del frontend y flujo de integración continua con GitHub Actions. |
| 9 | `despliegue` | pendiente | Definir y documentar el despliegue en producción. |
| 10 | `documentacion-tesis` | pendiente | Consolidar la documentación como material de la tesis. |

Estado de la fundación (Fase 0): estructura `openspec/`, `docs/`, skills, comandos y agentes de proyecto.
