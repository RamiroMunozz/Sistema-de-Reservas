# Visión del producto

## Contexto

El proyecto cumple dos propósitos: es el trabajo final de la Tecnicatura Universitaria en Programación y, al mismo tiempo, un producto pensado para venderse a negocios reales que alquilan canchas deportivas.

## Problema

Los complejos deportivos suelen gestionar turnos por teléfono o mensajería, sin una vista única de la disponibilidad. Esto produce reservas superpuestas, turnos abandonados sin cobrar y poca visibilidad de la recaudación.

## Usuarios

| Usuario | Necesidad |
|---|---|
| Jugador | Ver la disponibilidad real, reservar y pagar sin llamar al negocio. |
| Dueño del negocio | Administrar canchas y horarios, ver la grilla diaria, cargar turnos manuales y conocer sus métricas. |
| Super admin (plataforma) | Dar de alta negocios y supervisar la plataforma. |

## Propuesta de valor

- Disponibilidad en tiempo real con garantía de que no hay dos reservas activas sobre el mismo turno (ver [ADR 0003](../arquitectura/adr/0003-prevencion-solapamiento-reservas.md)).
- Cobro integrado con Mercado Pago.
- Cada negocio opera de forma aislada y con su propia marca.

## Alcance

### Estado actual

Instalación de un solo negocio (single-tenant). Existen:

- Registro e inicio de sesión con JWT; roles `USER` y `ADMIN` (`backend/prisma/schema.prisma`).
- Catálogo de canchas, horarios por cancha y consulta de disponibilidad.
- Reservas con pago en efectivo, transferencia o Mercado Pago.
- Panel de administración con grilla diaria, carga manual de turnos, métricas y alta de canchas.

### Objetivo

- Multi-tenant: una instalación, varios negocios aislados, cada uno con sus canchas, clientes y credenciales de Mercado Pago.
- Acceso del jugador por enlace propio del negocio (`/<slug>`), con la marca del negocio y cuenta de jugador global.
- Roles: `SUPER_ADMIN`, dueño (una cuenta por negocio) y jugador. Sin empleados por ahora.
- Política de cobro configurable por negocio: total online, seña (porcentaje) por Mercado Pago o pago en el lugar.
- Modelo de cobro de la plataforma (suscripción u otro): **pendiente de decisión**.

Las decisiones están registradas en [decisiones.md](decisiones.md) y su orden de ejecución en [hoja-de-ruta.md](hoja-de-ruta.md).
