# 0002. Arquitectura multi-tenant

- Estado: Aceptada
- Fecha: 2026-11-16

## Contexto

El producto debe venderse a varios negocios. Antes del cambio `multi-tenant-negocios` el código era single-tenant: no existía el concepto de negocio y los roles eran solo `USER` y `ADMIN`.

## Decisión

- Una sola instalación sirve a todos los negocios.
- Cada negocio queda aislado: sus complejos, canchas, reservas y credenciales de Mercado Pago le pertenecen únicamente a él.
- Todo dato de negocio pertenece a un negocio; los servicios siempre filtran por negocio y nunca confían en identificadores enviados por el cliente sin verificar su pertenencia.
- Los jugadores acceden por un enlace propio del negocio (`/<slug>`); la cuenta de jugador es global.
- Roles: `SUPER_ADMIN`, dueño (una cuenta por negocio) y jugador (en el esquema, `SUPER_ADMIN`, `DUENO` y `JUGADOR`).

## Consecuencias

- Cambia el esquema de datos, la autenticación y todos los servicios: se ejecuta de forma incremental en el cambio `multi-tenant-negocios`.
- Las credenciales de Mercado Pago por negocio se resuelven en el cambio `mercadopago-por-negocio`.
- Riesgo principal: fuga de datos entre negocios. Se mitiga con revisión específica (agente `revisor-multitenant`) y pruebas de aislamiento.

## Estado actual

Implementado en el cambio `multi-tenant-negocios` (N.º 5 de la hoja de ruta), pendiente de verificación final y archivo. El código ya no es single-tenant: el modelo `Negocio` existe y los datos de negocio le pertenecen. Las credenciales de Mercado Pago por negocio siguen pendientes (`mercadopago-por-negocio`).

## Detalle de implementación

Las decisiones están en `openspec/changes/multi-tenant-negocios/design.md`. Resumen de lo implementado:

- **Aislamiento (enfoque B).** Una columna `negocio_id` en `complexes`, `bookings` y `users` (esta última solo para el dueño). Las canchas y los pagos pertenecen al negocio por su complejo o su reserva. Una sola base y un solo esquema.
- **Claim en el JWT.** El token lleva `userId`, `role` y, para el dueño, `negocioId`. El payload se valida con Zod al verificarlo: un token con un rol desconocido (por ejemplo `USER` o `ADMIN`) se rechaza. El dueño opera siempre sobre el negocio de su token, nunca sobre uno enviado por el cliente.
- **Pertenencia, "ajeno ≡ inexistente".** Los servicios buscan el recurso por su id y por el negocio en el mismo `where` (`backend/src/modules/negocios/pertenencia.ts`). Un recurso de otro negocio responde exactamente igual que uno inexistente (404), para no revelar su existencia.
- **Garantías en la base** (SQL manual, que Prisma no modela):
  - Trigger `bookings_negocio_coherente`: la reserva debe pertenecer al negocio del complejo de su cancha.
  - Restricción `EXCLUDE` `users_un_dueno_por_negocio`: a lo sumo un dueño por negocio.
  - `CHECK` `users_negocio_segun_rol`: solo el rol `DUENO` tiene `negocio_id`.
- **Rutas por slug.** Las rutas públicas son `/api/v1/negocios/:slug/...` (catálogo, disponibilidad y reserva de invitado). El resolutor fija el negocio activo del slug y un slug inexistente o inactivo responde 404. Las rutas públicas viejas sin slug se retiraron. El frontend usa `/:slug` y la raíz `/` redirige a `/principal`.
- **`SUPER_ADMIN` limitado.** No tiene `negocioId` ni opera sobre datos de un negocio: solo da de alta un negocio y su dueño con `POST /api/v1/plataforma/negocios`.
- **Tope por teléfono por negocio.** El tope de reservas `PENDING` por teléfono de invitado se cuenta dentro de cada negocio.
- **Migración de datos.** Las migraciones `20261125120000_negocios` y `20261125120100_roles_negocio` crean el negocio principal (slug `principal`), le asignan los datos existentes y renombran los roles (`USER` → `JUGADOR`, `ADMIN` → `DUENO`, alta de `SUPER_ADMIN`). Los tokens vigentes dejan de ser válidos: se acepta un nuevo inicio de sesión.
- **Semilla.** Tiene una guarda: con `NODE_ENV=production` se aborta, porque borra todas las tablas.

## Alternativas consideradas

- Una instalación por negocio: descartada por el costo de operar múltiples despliegues.
- Claves foráneas compuestas (`negocio_id` también en `courts`, enfoque C del diseño): fuera del alcance del cambio; se eligió la columna con trigger de coherencia (enfoque B).
