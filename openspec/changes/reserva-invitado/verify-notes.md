# Notas de verificación: reserva-invitado

Resultados observados de las verificaciones de entorno (UT-0). Todo se ejecutó contra la base descartable `reservas_prueba` (contenedor Docker, puerto 5434), nunca contra la base de desarrollo.

## T-0.1 Línea base de pruebas (2026-11-18)

Base descartable con las 3 migraciones existentes aplicadas con `migrate deploy` y con `DATABASE_URL` y `DATABASE_URL_PRUEBA` apuntando a ella.

- `npm test`: 1 archivo falla, 8 pasan; 130 pruebas pasan, 6 omitidas, 0 fallan; la suite `integration.test.ts` falla en `beforeAll`.
  - Causa: `courtsRes.body[0].id` es `undefined` porque la base descartable no tiene canchas sembradas (no hay `seed`). Sus 6 pruebas quedan omitidas.
  - Con la base sin sembrar, la falla es no determinista: `integration.test.ts` inicia sesión con `jugador@example.com` y `admin@sportsbooking.com` (usuarios del `seed`, ausentes en la base descartable) y toma la primera cancha de `GET /courts`. Si `concurrenciaReservas.test.ts` (en paralelo) ya creó una cancha, el `beforeAll` pasa y fallan 4 pruebas con 401; si no, falla el `beforeAll` y se omiten sus 6 pruebas. Ambos modos son ambientales (base sin sembrar).
  - Esa es la única falla de la línea base con base disponible. No son las 6 fallas de "Docker apagado" del registro anterior: con la base disponible, las pruebas de `rutasAdminReservas.test.ts` y `secretosJwt.test.ts` pasan, y `concurrenciaReservas.test.ts` corre.
- `npx tsc --noEmit`: sin errores.
- `npm run build`: sin errores.

## T-0.2 Plan de dos migraciones y restricciones manuales

1. **`ADD VALUE` y uso del literal en la misma transacción: confirmado que falla.**
   `BEGIN; ALTER TYPE ... ADD VALUE 'C'; ALTER TABLE ... ADD CONSTRAINT ... CHECK (s <> 'C'); COMMIT;` produce `ERROR: unsafe use of new value "C" of enum type "EstadoX"` con la pista "New enum values must be committed before they can be used". En cambio, `ADD VALUE` seguido de una sentencia que no usa el literal sí se confirma, y el uso del literal después del `COMMIT` funciona. Justifica las dos migraciones.
2. **`'OWNER_DISCRETION'` en el `CHECK` de la migración A: confirmado válido.** Dentro de una misma transacción, `CREATE TYPE` con ese valor, `CREATE TABLE` y el `ADD CONSTRAINT ... CHECK` con el literal se confirman sin error.
3. **Sin `DROP` de las restricciones manuales tras aplicar A y B: confirmado.**
   - `npx prisma migrate dev` no se puede ejecutar en este entorno (rechaza la terminal no interactiva). Se usó su equivalente de comparación: `prisma migrate diff --from-schema-datasource ... --to-schema-datamodel ... --script` contra la base con A y B aplicadas, y `--from-migrations` con una base sombra. Ambas devuelven "This is an empty migration."
   - La comparación previa a A (base con las 3 migraciones originales contra el esquema nuevo) tampoco proponía ningún `DROP`.
   - En la base quedan las seis restricciones: `bookings_sin_solapamiento` (ahora con `status <> ALL (ARRAY['CANCELLED', 'EXPIRED'])`), `bookings_horario_valido`, `bookings_titular_valido`, `complexes_porcentaje_sena_valido`, `booking_payments_motivo_coherente` y `booking_payments_un_pago_valido`.

Conclusión: el plan de dos migraciones del diseño (decisión 1) se confirma sin cambios.

Nota de proceso: `prisma migrate dev --create-only` exige terminal interactiva, así que la migración A se generó con `prisma migrate diff ... --script` (mismo SQL que habría generado `migrate dev`) y se completó a mano; la migración B se escribió a mano.

## T-0.3 Sandbox de Mercado Pago

Bloqueada: faltan credenciales de prueba de Mercado Pago. No se intentó.

## T-1.8 Reversa de la decisión 1 (UT-1)

Probada en una base descartable aparte (`reversa_prueba`, ya eliminada): migraciones A y B aplicadas, datos de ejemplo (una reserva `EXPIRED`, una reserva de invitado con un pago) y la reversa ejecutada en una transacción. Resultado: `COMMIT` sin errores; la exportación de `booking_payments` copió 1 fila; la comparación contra el esquema anterior (`git show HEAD:backend/prisma/schema.prisma`) solo muestra el valor `EXPIRED` que queda en el enum (PostgreSQL no permite quitarlo, inocuo). Las restricciones `bookings_horario_valido` y `bookings_sin_solapamiento` (con `status <> 'CANCELLED'`) quedan en su lugar.

```sql
BEGIN;
-- 1. Exportar los pagos (contienen pagos reales) antes de borrar la tabla.
\copy (SELECT * FROM booking_payments) TO 'booking_payments_respaldo.csv' CSV HEADER
-- 2. Las vencidas pasan a canceladas y se vuelve a la restricción anterior en una sola sentencia.
UPDATE "bookings" SET "status" = 'CANCELLED' WHERE "status" = 'EXPIRED';
ALTER TABLE "bookings"
  DROP CONSTRAINT "bookings_sin_solapamiento",
  ADD CONSTRAINT "bookings_sin_solapamiento"
  EXCLUDE USING gist ("court_id" WITH =, tstzrange("start_time", "end_time") WITH &&)
  WHERE ("status" <> 'CANCELLED');
-- 3. Tablas, tipos y restricciones nuevas.
DROP TABLE "booking_payments";
DROP TYPE "RefundReason";
ALTER TABLE "bookings" DROP CONSTRAINT "bookings_titular_valido";
ALTER TABLE "complexes" DROP CONSTRAINT "complexes_porcentaje_sena_valido";
-- 4. Reservas de invitado: se cancelan y se asignan a un usuario (<ID_USUARIO>) antes de volver a NOT NULL.
UPDATE "bookings" SET "status" = 'CANCELLED', "user_id" = '<ID_USUARIO>' WHERE "user_id" IS NULL;
DROP INDEX "bookings_access_token_hash_key", "bookings_status_expires_at_idx", "bookings_guest_phone_status_idx";
ALTER TABLE "bookings"
  DROP COLUMN "access_token_hash", DROP COLUMN "deposit_amount", DROP COLUMN "deposit_paid_at_cancel",
  DROP COLUMN "expires_at", DROP COLUMN "guest_email", DROP COLUMN "guest_first_name",
  DROP COLUMN "guest_last_name", DROP COLUMN "guest_phone", DROP COLUMN "mp_preference_id",
  ALTER COLUMN "user_id" SET NOT NULL;
ALTER TABLE "complexes" DROP COLUMN "deposit_percent";
DELETE FROM "_prisma_migrations" WHERE "migration_name" IN
  ('20261119120000_reserva_invitado', '20261119120100_sin_solapamiento_excluye_vencidas');
COMMIT;
```

## T-0.3: sandbox de Mercado Pago (parcial, 2026-11-18)

Ejecutado por el usuario con un script descartable (fuera del repo) y credenciales de prueba cargadas en `backend/.env`.

| N.º | Comprobación | Resultado observado |
|---|---|---|
| 1 | Una preferencia vencida con `Preference.update` impide pagar | Cumple. El `init_point` redirige a `/checkout/v1/payment/redirect/expired` y no permite pagar. |
| 2 | Sufijo `Z` en `expiration_date_from` y `expiration_date_to` | Cumple. Mercado Pago lo acepta y devuelve la misma hora con `+00:00`. |
| 3 | Reenviar los `items` leídos con `Preference.get` no altera la preferencia | Cumple. Solo cambian `expiration_date_to`, `last_updated`, `api_response`, `modified_by_app` y `modified_source`. |
| 4 | `PaymentRefund.create` sin `amount` reembolsa el total | Pendiente: requiere un pago aprobado de prueba. |
| 5 | Clave de idempotencia ante un fallo | Pendiente: requiere un pago aprobado de prueba. |

Hallazgos que afectan a UT-3:

- **No enviar `expiration_date_from`.** El reloj de la PC de desarrollo informó 19:44 UTC mientras el encabezado `Date` de `api.mercadopago.com` informó 16:41 GMT (3 horas de diferencia). Con `expiration_date_from` igual a la hora local, Mercado Pago trató la preferencia como "disponible desde" una hora futura y bloqueó el pago de una preferencia vigente. El adaptador debe enviar solo `expiration_date_to`.
- **`expiration_date_to` nunca anterior a `expiration_date_from`.** Si queda anterior, la página de Mercado Pago muestra "La compra estará disponible desde…" en lugar de vencida.
- Las preferencias que genera hoy la aplicación (sin campos de expiración) cargan el checkout con normalidad.
- Pendiente fuera del código: corregir la hora o la zona horaria de Windows en la PC de desarrollo; con el reloj corrido, la grilla marca como "Pasado" turnos que todavía no pasaron.
