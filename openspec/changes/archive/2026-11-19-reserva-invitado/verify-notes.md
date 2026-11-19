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

Resuelta: ver la sección "T-0.3: sandbox de Mercado Pago" más abajo (comprobaciones 1 a 3 el 2026-11-18, 4 y 5 el 2026-11-19).

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

## T-8.4 Verificación manual del flujo público (2026-11-19)

Con chrome-devtools en un contexto aislado sin sesión, frontend en `localhost:5173`, backend en `localhost:3000`, túnel de cloudflared y sandbox de Mercado Pago (pagos hechos por el usuario con el comprador de prueba).

| Paso | Resultado observado |
|---|---|
| Crear reserva sin cuenta | Cumple. El modal muestra el formulario de invitado; `POST /public/bookings` responde 201 con `token` e `initPoint`; el checkout cobra la seña de $5.400 (30 % de $18.000); el turno pasa a "Ocupado" en la grilla. |
| Pagar | Cumple (segundo intento). El webhook confirma la reserva `488e4bc1-…`: `CONFIRMED`, pago `189435953093` válido por $5.400. El primer intento (reserva `f087ea1c-…`, pago `189433917433`) no llegó al backend porque `BACKEND_URL` apuntaba a un túnel vencido; esa reserva queda pendiente hasta su vencimiento. |
| Volver | **No cumple como se esperaba.** La página de pago aprobado de Mercado Pago no muestra un enlace de vuelta al sitio (se omite `auto_return` y las `back_urls` apuntan a `localhost`). El invitado pasa del formulario al checkout sin ver nunca `/reserva/<código>`. |
| Página de seguimiento | Cumple. Muestra estado, horario en UTC, precio, seña y su estado; con `PENDING`, la cuenta regresiva y "Pagar la seña". |
| Cancelar | Cumple. El diálogo advierte que la devolución queda a criterio del canchero; la reserva queda `CANCELLED` con `depositPaidAtCancel` verdadero y el pago con `OWNER_DISCRETION`; el turno se libera en la grilla. |
| Reintentar | Cumple con una salvedad. `POST /public/bookings/:token/payment` responde 200 con una preferencia nueva. La anterior se vence, pero con el reloj local unos 53 s adelantado respecto de Mercado Pago (`expiration_date_to` 15:24:54 contra `last_updated` 15:24:01), el link viejo se pudo pagar durante ese lapso; pasado el lapso redirige a `/checkout/v1/payment/redirect/expired`. |
| Token inexistente | Cumple. "Reserva no encontrada" (404 del backend). |
| Vencimiento | Cumple. La reserva `f087ea1c-…` (20:00, vence 15:27:53 UTC) ocupa el turno hasta ese instante; a las 15:28:03 la disponibilidad ya no lo incluye. |

Hallazgos:

- `expirarPreferencia` usa `new Date()` como `expiration_date_to`, así que su efecto depende del reloj del servidor. Fijar un instante en el pasado con margen (por ejemplo, una hora antes) evitaría la ventana.
- El regreso desde Mercado Pago a `/reserva/<código>` no está garantizado. Hace falta decidir cómo recibe el invitado su enlace (mostrarlo antes de redirigir al checkout, `auto_return` con un dominio público, u otra vía).

Repetición tras T-8.5 a T-8.7 (2026-11-19, reserva "Prueba Tres", 19:00):

| Paso | Resultado observado |
|---|---|
| Volver | Cumple. Tras `POST /public/bookings` el navegador va a `/reserva/<token>`, con el recuadro "Guardá este enlace antes de pagar", el enlace completo y "Copiar enlace". "Pagar la seña" lleva al `initPoint` de la creación sin llamar al reintento. `auto_return` no se pudo probar en desarrollo: solo se envía con `https` (se verifica al desplegar). |
| Reintentar tras recargar | Cumple. Sin el estado de navegación, "Pagar la seña" llama a `POST .../payment`; la reserva pasa a la preferencia `…70b9ed0d…` y la anterior (`…9b69eeb9…`) redirige de inmediato a "Lo que querías pagar ya no se encuentra disponible", sin la ventana por el reloj. |

## T-7.7 y comprobación manual del panel (UT-9a y UT-9b, 2026-11-19)

Con chrome-devtools, sesión de `ADMIN` y sandbox de Mercado Pago.

| Comprobación | Resultado observado |
|---|---|
| Reembolso real por la ruta (T-7.7) | Cumple. El pago `189435953093` ($5.400, `OWNER_DISCRETION`, reserva "Prueba Dos" cancelada) muestra "Reembolso a criterio" y el botón "Reembolsar". Al cancelar el diálogo no se envía ningún pedido; al aceptarlo, la ruta responde 200, el panel muestra "Pago 189435953093 reembolsado." y "Seña reembolsada", y la base fija `refunded_at` 15:56:10 UTC. |
| Segundo intento | Cumple. `POST .../refund` sobre el mismo pago responde 409 "Este pago ya fue reembolsado." sin llamar a Mercado Pago. |
| Lista de reservas con invitados (UT-9a) | Cumple. Marca "Invitado", nombre, teléfono, turno UTC, estado de la seña, "Vencida" para las `EXPIRED` y enlace `wa.me`. |
| Teléfono internacional (T-9a.3) | Cumple. "011 15 5555 1234" se rechaza; "11 5555 1234" se guarda como `5491155551234` y el enlace es `https://wa.me/5491155551234?text=…`. |
| Porcentaje de seña (UT-9b) | Cumple. Muestra "Vigente: 30%"; 150 no se envía (validación del campo); 40 se guarda (la base queda en 40) y se restauró a 30. |
| Grilla con un invitado `CONFIRMED` | Cumple. Reserva "Prueba Grilla" (20:00 UTC) pagada en el sandbox con la tarjeta de prueba `APRO` (operación `190529754166`); el webhook la confirma con el pago válido de $5.400 y la grilla muestra nombre, marca "Invitado", `5491155559876`, "Seña pagada $5.400" y WhatsApp. |

Hallazgos:

- "Reembolsado el" mostraba "03:56:10" en lugar de 15:56 porque usaba `toLocaleString`. Se corrigió en `AdminDashboard.tsx` con los métodos UTC de `formatearTurnoUTC` (orquestador).
- Con la sesión de `ADMIN` vencida, el panel recibe 401 y muestra "No hay reservas registradas" y métricas en cero, sin avisar ni redirigir al inicio de sesión. Es comportamiento previo a este cambio; queda como candidato fuera de alcance.
- Las reservas anteriores a T-9a.3 guardaron teléfonos locales (`1155552222`) y su enlace `wa.me` sigue siendo incorrecto; son datos de prueba.

## T-11.1 Verificación completa: comandos (2026-11-19)

| Comando | Resultado observado |
|---|---|
| `npm test` en `backend/` con `DATABASE_URL` y `DATABASE_URL_PRUEBA` en la base descartable | 29 archivos y 463 pruebas pasan, 0 fallas (incluidas las de `integration.test.ts`, porque la base descartable ya tiene semilla). |
| `npx tsc --noEmit` en `backend/` | Sin errores (código 0). |
| `npm run build` en `backend/` | Sin errores (código 0). |
| `npx tsc -b --noEmit` en `frontend/` | Sin errores (código 0). |
| `npm run lint` en `frontend/` | Sin errores (código 0). |
| `npm run build` en `frontend/` | Sin errores (código 0). |
| `rg -n "\bany\b\|as unknown as" backend/src` | Una sola coincidencia, previa al cambio: `core/config/security.ts:47` (`as unknown as JwtPayload`). Ningún código nuevo afectado. |

Verificaciones manuales registradas: T-0.2, T-0.3, T-7.7, T-8.4 y el panel (UT-9a y UT-9b). Queda pendiente auditar que cada escenario de las cuatro delta specs esté cubierto por una prueba o una verificación manual (`sdd-verify`).

## T-0.3: sandbox de Mercado Pago (parcial, 2026-11-18)

Ejecutado por el usuario con un script descartable (fuera del repo) y credenciales de prueba cargadas en `backend/.env`.

| N.º | Comprobación | Resultado observado |
|---|---|---|
| 1 | Una preferencia vencida con `Preference.update` impide pagar | Cumple. El `init_point` redirige a `/checkout/v1/payment/redirect/expired` y no permite pagar. |
| 2 | Sufijo `Z` en `expiration_date_from` y `expiration_date_to` | Cumple. Mercado Pago lo acepta y devuelve la misma hora con `+00:00`. |
| 3 | Reenviar los `items` leídos con `Preference.get` no altera la preferencia | Cumple. Solo cambian `expiration_date_to`, `last_updated`, `api_response`, `modified_by_app` y `modified_source`. |
| 4 | `PaymentRefund.create` sin `amount` reembolsa el total | Cumple (2026-11-19). Pago de prueba `190426013932` de $18.000: el reembolso `3589421590` devolvió $18.000 y el pago quedó `refunded`. |
| 5 | Clave de idempotencia ante un fallo | **Guarda la respuesta fallida** (2026-11-19). Un reembolso con monto mayor al pagado respondió 400 con la clave K; el reintento sin monto con la misma clave K repitió el mismo 400 sin intentar. Con una clave nueva el reembolso salió bien, y repetir esa clave exitosa devolvió el mismo reembolso (`3589421590`) sin reembolsar dos veces: un solo reembolso en el pago. |

Comprobaciones 4 y 5 ejecutadas por el usuario el 2026-11-19 con un script descartable (fuera del repo), con el reloj de Windows ya corregido.

Hallazgos que afectan a UT-7:

- **La clave fija `reembolso-<bookingPaymentId>` no sirve.** Si el primer intento falla, todos los reintentos con esa clave devuelven el error guardado y el pago queda sin poder reembolsarse desde la aplicación. La clave necesita un componente por intento.
- Mercado Pago rechaza con 400 un reembolso mayor al saldo no reembolsado ("Refund requested amount is greater than amount paid and not refunded"), así que un segundo reembolso total del mismo pago no se cobra dos veces aunque cambie la clave.

Hallazgo aparte (no es de T-0.3): el pago `190426013932` de la reserva `4952e2cd-…` está aprobado en Mercado Pago, pero en la base de desarrollo no hay ninguna fila en `booking_payments`. El webhook no lo registró; queda por diagnosticar (versión del backend en ejecución o URL vencida del túnel).

Hallazgos que afectan a UT-3:

- **No enviar `expiration_date_from`.** El reloj de la PC de desarrollo informó 19:44 UTC mientras el encabezado `Date` de `api.mercadopago.com` informó 16:41 GMT (3 horas de diferencia). Con `expiration_date_from` igual a la hora local, Mercado Pago trató la preferencia como "disponible desde" una hora futura y bloqueó el pago de una preferencia vigente. El adaptador debe enviar solo `expiration_date_to`.
- **`expiration_date_to` nunca anterior a `expiration_date_from`.** Si queda anterior, la página de Mercado Pago muestra "La compra estará disponible desde…" en lugar de vencida.
- Las preferencias que genera hoy la aplicación (sin campos de expiración) cargan el checkout con normalidad.
- Pendiente fuera del código: corregir la hora o la zona horaria de Windows en la PC de desarrollo; con el reloj corrido, la grilla marca como "Pasado" turnos que todavía no pasaron.
