# Hoja de ruta

Cambios SDD en orden de ejecución. Cada uno se desarrolla en `openspec/changes/<cambio>/`. Estados posibles: pendiente, en curso, hecho.

| N.º | Cambio | Estado | Objetivo |
|---|---|---|---|
| 1 | `specs-base` | hecho | Documentar el comportamiento actual en `openspec/specs/` (autenticación, reservas, canchas, pagos, administración). |
| 2 | `deuda-auditoria` | hecho | Resolver la deuda de `docs/historial/auditoria-seguridad.md`: tipado de las métricas sin `any`, `\|\| true` del Dockerfile del backend, rotación de `JWT_SECRET`, 400 ante un UUID mal formado en las rutas de canchas, `PATCH` de cancha sin valores por defecto y rechazo de fechas inexistentes en las métricas. El UTC de `AdminDashboard` y el registro del `userId` ya estaban resueltos; el punto A3 (rechazo de pago) se deriva a `politica-cobro` (fila 6) y `reserva-invitado`. |
| 3 | `reserva-invitado` | en curso | Reservar sin cuenta con nombre, apellido y teléfono. La reserva queda `PENDING` hasta que se pague la seña por Mercado Pago y se libera sola a los 15 minutos. Incluye el link privado `/reserva/<código>`, el panel del canchero con enlaces `wa.me` y el reembolso manual de la seña. Resuelve el punto A3 para las reservas de invitado (DP-09 a DP-14). |
| 4 | `multi-tenant-negocios` | pendiente | Introducir el negocio como unidad de aislamiento y los roles `SUPER_ADMIN`, dueño y jugador. |
| 5 | `mercadopago-por-negocio` | pendiente | Usar credenciales de Mercado Pago propias de cada negocio. |
| 6 | `politica-cobro` | pendiente | Política de cobro por negocio: total online, seña o pago en el lugar. Parte de la seña que ya implementa `reserva-invitado`. |
| 7 | `pagina-publica-negocio` | pendiente | Página pública por slug con la marca del negocio. |
| 8 | `panel-super-admin` | pendiente | Panel de la plataforma para gestionar negocios. |
| 9 | `calidad-ci` | pendiente | Pruebas del frontend y flujo de integración continua con GitHub Actions. Separar las pruebas del backend que usan la base (script `test:unit` sin base y otro con base descartable) para que la integración diaria tenga un control determinista. |
| 10 | `despliegue` | pendiente | Definir y documentar el despliegue en producción. |
| 11 | `documentacion-tesis` | pendiente | Consolidar la documentación como material de la tesis. |

Estado de la fundación (Fase 0): estructura `openspec/`, `docs/`, skills, comandos y agentes de proyecto.
