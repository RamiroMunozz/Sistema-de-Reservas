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

Instalación multi-tenant: una sola instalación sirve a varios negocios aislados (cambio `multi-tenant-negocios`). Existen:

- Registro e inicio de sesión con JWT; roles `JUGADOR`, `DUENO` (con `negocioId` en el token) y `SUPER_ADMIN` (`backend/prisma/schema.prisma`).
- Negocios con enlace propio (`/<slug>`), alta de negocio y dueño por `SUPER_ADMIN` y aislamiento de los datos entre negocios.
- Catálogo de canchas, horarios por cancha y consulta de disponibilidad.
- Reservas con pago en efectivo, transferencia o Mercado Pago.
- Panel de administración con grilla diaria, carga manual de turnos, métricas y alta de canchas.

### Objetivo

- Credenciales de Mercado Pago propias de cada negocio (`mercadopago-por-negocio`).
- Marca del negocio en la página pública por slug (`pagina-publica-negocio`); el enlace `/<slug>` y la cuenta de jugador global ya existen.
- Gestión de negocios por `SUPER_ADMIN` (`panel-super-admin`). Sin empleados por ahora.
- Política de cobro configurable por negocio: total online, seña (porcentaje) por Mercado Pago o pago en el lugar.
- Modelo de cobro de la plataforma (suscripción u otro): **pendiente de decisión**.

Las decisiones están registradas en [decisiones.md](decisiones.md) y su orden de ejecución en [hoja-de-ruta.md](hoja-de-ruta.md).
