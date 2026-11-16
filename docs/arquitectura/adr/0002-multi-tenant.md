# 0002. Arquitectura multi-tenant

- Estado: Aceptada
- Fecha: 2026-11-16

## Contexto

El producto debe venderse a varios negocios. El código actual es single-tenant: no existe el concepto de negocio y los roles son solo `USER` y `ADMIN` (`backend/prisma/schema.prisma`).

## Decisión

- Una sola instalación sirve a todos los negocios.
- Cada negocio queda aislado: sus complejos, canchas, reservas y credenciales de Mercado Pago le pertenecen únicamente a él.
- Todo dato de negocio pertenece a un negocio; los servicios siempre filtran por negocio y nunca confían en identificadores enviados por el cliente sin verificar su pertenencia.
- Los jugadores acceden por un enlace propio del negocio (`/<slug>`); la cuenta de jugador es global.
- Roles: `SUPER_ADMIN`, dueño (una cuenta por negocio) y jugador.

## Consecuencias

- Cambia el esquema de datos, la autenticación y todos los servicios: se ejecuta de forma incremental en el cambio `multi-tenant-negocios`.
- Las credenciales de Mercado Pago por negocio se resuelven en el cambio `mercadopago-por-negocio`.
- Riesgo principal: fuga de datos entre negocios. Se mitiga con revisión específica (agente `revisor-multitenant`) y pruebas de aislamiento.

## Detalle de implementación

Pendiente. Estrategia de aislamiento (columna `negocioId` frente a otras opciones), migración de datos existentes y resolución del negocio por slug se deciden en el diseño del cambio `multi-tenant-negocios`.

## Alternativas consideradas

- Una instalación por negocio: descartada por el costo de operar múltiples despliegues. Se evaluará con más detalle en el diseño del cambio.
