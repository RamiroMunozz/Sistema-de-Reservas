# Decisiones de producto

Registro fechado. Cada decisión indica su estado de implementación. Las decisiones de arquitectura viven en los [ADR](../arquitectura/adr/README.md).

## 2026-11-16

| N.º | Decisión | Estado |
|---|---|---|
| DP-01 | El proyecto es a la vez tesis de la Tecnicatura Universitaria en Programación y un producto vendible a negocios reales. | Vigente |
| DP-02 | Multi-tenant: una instalación; cada negocio queda aislado (sus canchas, clientes y credenciales propias de Mercado Pago). | Vigente; implementado en `multi-tenant-negocios` (credenciales de Mercado Pago por negocio pendientes) |
| DP-03 | El modelo de cobro de la plataforma (suscripción u otro) se decide más adelante. | Pendiente |
| DP-04 | Acceso de jugadores por enlace propio del negocio (`tuapp.com/<slug>`) con la marca del negocio. La cuenta de jugador es global. | Vigente; enlace y cuenta global implementados (la marca del negocio queda pendiente) |
| DP-05 | Roles objetivo: `SUPER_ADMIN` (plataforma), dueño (una cuenta por negocio) y jugador. Sin empleados por ahora. | Vigente; en el esquema `SUPER_ADMIN`, `DUENO` y `JUGADOR` |
| DP-06 | Cobro de reservas configurable por negocio: total online, seña (%) por Mercado Pago o pago en el lugar. | Objetivo |
| DP-07 | Estrategia: evolucionar el código actual con cambios SDD; no reescribir. | Vigente |
| DP-08 | SDD con artefactos híbridos (`openspec/` + Engram), ritmo interactivo, estrategia de PR `ask-on-risk` y presupuesto de revisión de aproximadamente 400 líneas por PR. | Vigente |

## 2026-11-17

| N.º | Decisión | Estado |
|---|---|---|
| DP-04 (enmienda) | La cuenta de jugador deja de ser obligatoria. Se puede reservar como invitado o con una cuenta, que sigue siendo global y opcional y sirve para tener el historial de reservas. Vincular las reservas de invitado a una cuenta por teléfono queda para más adelante. | Objetivo |
| DP-09 | Reserva de invitado: se piden nombre, apellido y teléfono de WhatsApp; el email es opcional. La reserva queda `PENDING` y se confirma cuando se aprueba la seña por Mercado Pago. | Objetivo |
| DP-10 | Si la seña no se paga, la reserva `PENDING` libera el turno a los 15 minutos. | Objetivo |
| DP-11 | La seña es un porcentaje del precio del turno, configurable por el canchero. Si el invitado cancela, el canchero decide desde el panel si se la devuelve. | Objetivo |
| DP-12 | El invitado consulta y cancela su reserva desde un link privado (`/reserva/<código>`). | Objetivo |
| DP-13 | La integración con WhatsApp usa enlaces `wa.me` con mensajes armados, sin la API de WhatsApp Business. | Objetivo |
| DP-14 | La reserva de invitado se implementa antes del multi-tenant, sobre el negocio único actual y su cuenta de Mercado Pago. Cuando llegue el multi-tenant, pasa a usar las credenciales de cada negocio. | Objetivo |
