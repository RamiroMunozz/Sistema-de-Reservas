# Decisiones de producto

Registro fechado. Cada decisión indica su estado de implementación. Las decisiones de arquitectura viven en los [ADR](../arquitectura/adr/README.md).

## 2026-11-16

| N.º | Decisión | Estado |
|---|---|---|
| DP-01 | El proyecto es a la vez tesis de la Tecnicatura Universitaria en Programación y un producto vendible a negocios reales. | Vigente |
| DP-02 | Multi-tenant: una instalación; cada negocio queda aislado (sus canchas, clientes y credenciales propias de Mercado Pago). | Objetivo; el código actual es single-tenant |
| DP-03 | El modelo de cobro de la plataforma (suscripción u otro) se decide más adelante. | Pendiente |
| DP-04 | Acceso de jugadores por enlace propio del negocio (`tuapp.com/<slug>`) con la marca del negocio. La cuenta de jugador es global. | Objetivo |
| DP-05 | Roles objetivo: `SUPER_ADMIN` (plataforma), dueño (una cuenta por negocio) y jugador. Sin empleados por ahora. | Objetivo; hoy existen `USER` y `ADMIN` |
| DP-06 | Cobro de reservas configurable por negocio: total online, seña (%) por Mercado Pago o pago en el lugar. | Objetivo |
| DP-07 | Estrategia: evolucionar el código actual con cambios SDD; no reescribir. | Vigente |
| DP-08 | SDD con artefactos híbridos (`openspec/` + Engram), ritmo interactivo, estrategia de PR `ask-on-risk` y presupuesto de revisión de aproximadamente 400 líneas por PR. | Vigente |
