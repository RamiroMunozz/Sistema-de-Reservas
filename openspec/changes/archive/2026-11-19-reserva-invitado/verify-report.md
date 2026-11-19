# Informe de verificación: reserva-invitado (T-11.1)

Fecha: 2026-11-19. Rama `desarrollo` con cambios sin commitear. Modo: Strict TDD (backend), solo lectura.
Alcance: cuatro delta specs (`reservas`, `pagos`, `administracion`, `canchas`), `design.md`, `tasks.md` (61/62), `verify-notes.md`.

## 1. Ejecución

| Comando | Resultado |
|---|---|
| `npm test` en `backend/` contra la base descartable | 29 archivos, 463 pruebas, 0 fallas |
| `npx tsc --noEmit` y `npm run build` (backend) | sin errores |
| `npx tsc -b --noEmit`, `npm run lint` y `npm run build` (frontend) | sin errores |
| `rg "\bany\b\|as unknown as" backend/src frontend/src` | una sola coincidencia, previa al cambio: `backend/src/core/config/security.ts:47` |

Nota: `migracionReservaInvitado`, `concurrenciaReservas` y el bloque real de `rutasAdminReservas` usan `skipIf` sin `DATABASE_URL_PRUEBA`. Sin esa variable se omiten en silencio (ver W6).

## 2. Resumen de cobertura

| Dominio | Requisitos | Escenarios | CUBIERTO | PARCIAL | SIN COBERTURA |
|---|---|---|---|---|---|
| reservas | 23 | ~117 | ~104 | 13 | 0 |
| pagos | 15 | ~95 | ~91 | 4 | 0 |
| administracion | 8 | ~46 | ~34 | 12 | 0 |
| canchas | 1 | 5 | 5 | 0 | 0 |

Los escenarios de frontend (RES-020, RES-022, RES-034, ADM-016, ADM-017, ADM-018) solo tienen evidencia manual (`verify-notes.md`), conforme a `tasks.md` (el frontend no tiene pruebas hasta `calidad-ci`). Los escenarios de backend se prueban casi todos con Prisma y Mercado Pago simulados; se aclara cuando hay prueba contra base real.

Abreviaturas de pruebas (todas en `backend/tests/`): RIC = `reservaInvitadoCrear.test.ts`; RPT = `rutasPublicasToken.test.ts`; WH = `webhookPago.test.ts`; MIG = `migracionReservaInvitado.test.ts` (base real); CONC = `concurrenciaReservas.test.ts` (base real); RAR = `rutasAdminReservas.test.ts`; VR = `validacionReservas.test.ts`; EST = `estadoSena.test.ts`; LDP = `linkDePago.test.ts`; REEM = `reembolsoPago.test.ts`; LIM = `limitadorPublico.test.ts`; ADP = `adaptadorMercadoPago.test.ts`; CBL = `cancelacionBajoBloqueo.test.ts`; DISP = `disponibilidad.test.ts`; MET = `metricasAdmin.test.ts`; VENC = `vencimiento.test.ts`; BAR = `barridoVencidas.test.ts`; VN = `verify-notes.md`.

## 3. Matriz requisito, escenario y evidencia

### 3.1 reservas

| Req | Escenario | Estado | Evidencia |
|---|---|---|---|
| RES-023 | Reserva válida | CUBIERTO | RIC "responde 201 con token e initPoint, sin Authorization", "crea la reserva PENDING sin usuario…", "fija expiresAt 15 minutos…"; VN T-8.4 |
| RES-023 | Turno ocupado | CUBIERTO | RIC "responde 409 ante un solapamiento"; MIG "dos solicitudes simultáneas…" (base real) |
| RES-023 | Validación del turno | CUBIERTO | RIC "400 si la cancha está inactiva", "400 si el turno ya pasó" |
| RES-023 | Sin sesión permitida | CUBIERTO | RIC "sin Authorization" |
| RES-024 | Teléfono con formato libre | CUBIERTO | `datosInvitado.test.ts` "quita espacios, guiones…"; RIC "guarda los datos… teléfono normalizado" |
| RES-024 | Faltan datos / Teléfono inválido / Correo omitido | CUBIERTO | `datosInvitado.test.ts`; RIC "400 con errors"; RIC "no envía el correo del pagador" |
| RES-025 | Token devuelto una vez / Tokens distintos | CUBIERTO | `tokenAcceso.test.ts`; RIC "persiste el hash del token y nunca el token en claro" |
| RES-025 | Token no recuperable | PARCIAL en la ruta de cambio de estado | RPT "devuelve solo los campos públicos…"; RAR "no filtra el hash del token…". Ver W1 |
| RES-026 | Turno liberado por vencimiento | CUBIERTO para invitado; incumple para jugador y administrador | RIC "libera las vencidas…" (simulado); VN T-8.4 "Vencimiento". Ver C1 |
| RES-026 | Sin vencimiento / Confirmada / Aún no vencida | CUBIERTO | VENC; `filtrosReserva.test.ts` |
| RES-027 | Liberación sin actividad / Falla de una pasada | CUBIERTO | BAR |
| RES-028 | Token válido / inexistente / formato inválido | CUBIERTO | RPT |
| RES-028 | Vencida no barrida | CUBIERTO | RPT "informa EXPIRED…"; EST `estadoEfectivo` |
| RES-028 | Indicador de devolución | CUBIERTO | RPT; EST `devolucionACriterioDelCanchero` |
| RES-029 | Pendiente / confirmada con seña / sin seña / sin límite / terminal / token inexistente | CUBIERTO | RPT; `cancelacionReserva.test.ts` |
| RES-029 | Invalida el link / Falla de MP / sin preferencia | CUBIERTO | RPT; LDP |
| RES-029 | Cancelada sin pago no se vuelve a pagar | CUBIERTO | RPT `it.each` PAG-021 con CANCELLED; LDP `mensajeReservaNoPagable` |
| RES-029 | Cancelación concurrente | CUBIERTO | MIG "dos cancelaciones simultáneas…" (base real) |
| RES-030 | Exceso / cuentan inválidas / otra IP / cabecera falsificada | CUBIERTO | LIM; `limitadorCreacionRuta.test.ts`; `trustProxy.test.ts` |
| RES-031 | Tope / vencida no cuenta / confirmada no cuenta / mismo teléfono | CUBIERTO | LIM; RIC; MIG "cuatro solicitudes simultáneas…" (base real) |
| RES-032 | Falla de MP / MP sin configurar | CUBIERTO | RIC |
| RES-033 | Alta sin titular / con cuenta | CUBIERTO | MIG `bookings_titular_valido` (base real) |
| RES-034 | Reserva pendiente | CUBIERTO (manual) | VN T-8.4 |
| RES-034 | Cancelación con confirmación / Advertencia con seña pagada | CUBIERTO (manual) | VN T-8.4 |
| RES-034 | Código inexistente | CUBIERTO (manual) | VN T-8.4 |
| RES-034 | Vencimiento en pantalla | PARCIAL | Sin ejecución manual registrada de la cuenta regresiva en cero |
| RES-034 | Cancelación sin seña pagada / Rechazar la advertencia | PARCIAL | Sin registro manual |
| RES-034 | Reserva cancelada / Reservar de nuevo / Reserva vencida | PARCIAL | Solo se vio la transición a CANCELLED al cancelar |
| RES-034 | Retorno desde Mercado Pago | PARCIAL | `auto_return` solo con https, no probado. Ver W5 |
| RES-035 | Solo por vencimiento / admin no fija EXPIRED / no ocupa turno / terminal | CUBIERTO | VR; MIG `bookings_sin_solapamiento` |
| RES-006 | 4 escenarios | CUBIERTO | VR; `integration.test.ts`; RIC |
| RES-007 | Mismo turno / parcial / contiguos / cancelación / pendiente vigente / EXPIRED / concurrencia | CUBIERTO | CONC (base real); MIG |
| RES-007 | Turno liberado por vencimiento | PARCIAL | Vale para invitado; no para jugador ni administrador. Ver C1 |
| RES-009 | 4 escenarios | CUBIERTO | CONC; MIG (base real) |
| RES-011 | 10 escenarios | CUBIERTO | CBL; VR; `cancelacionReserva.test.ts`; MIG |
| RES-012 / CAN-006 | 6 y 5 escenarios | CUBIERTO | DISP; `filtrosReserva.test.ts`; CONC; VN T-8.4 |
| RES-013 | 5 escenarios | CUBIERTO | RAR (base real); DISP |
| RES-014 | 4 escenarios | CUBIERTO | VR; CONC |
| RES-015 | Cancelación / con preferencia / falla de MP / sin preferencia / estado desconocido / inexistente | CUBIERTO | CBL; VR |
| RES-015 | Reserva de invitado devuelve `user` nulo | PARCIAL | El código lo cumple; ninguna prueba lo afirma con un invitado |
| RES-020 | Invitado sin sesión / Datos inválidos | CUBIERTO (manual) | VN T-8.4 y repetición; VN "Teléfono internacional (T-9a.3)" |
| RES-020 | Reserva en efectivo / Conflicto (jugador con sesión) | PARCIAL | Comportamiento previo, sin registro manual en este cambio |
| RES-022 | Reserva de invitado en la grilla | CUBIERTO (manual) | VN "Grilla con un invitado CONFIRMED" |
| RES-022 | Marcar como jugado / Turno manual rechazado | PARCIAL | Sin registro manual |

### 3.2 pagos

| Req | Escenario | Estado | Evidencia |
|---|---|---|---|
| PAG-020 | 4 escenarios | CUBIERTO | RIC; ADP |
| PAG-021 | 10 escenarios | CUBIERTO | RPT; LDP |
| PAG-022 | Defecto / redondeo / 100 % | CUBIERTO | `sena.test.ts`; RIC |
| PAG-022 | Cambio posterior del porcentaje | PARCIAL | Se cumple por diseño; ninguna prueba cambia el porcentaje y relee |
| PAG-023 | 11 escenarios | CUBIERTO | EST; `cancelacionReserva.test.ts` |
| PAG-024 | 9 escenarios | CUBIERTO | REEM |
| PAG-025 | 9 escenarios | CUBIERTO | LDP; `preferenciaPago.test.ts`; CBL; RPT |
| PAG-026 | 4 escenarios | CUBIERTO | WH; MIG; `cancelacionReserva.test.ts` |
| PAG-004 | 3 escenarios | CUBIERTO | `preferenciaPago.test.ts` |
| PAG-005 | 3 escenarios | CUBIERTO | ADP; `preferenciaPago.test.ts` |
| PAG-006 | 5 escenarios | CUBIERTO | ADP; `preferenciaPago.test.ts` |
| PAG-012 | 15 escenarios | CUBIERTO | WH ramas 1 a 10; MIG (base real) |
| PAG-013 | Repetida / completada reenviada / pago nuevo / segundo pago / CASH | CUBIERTO | WH ramas 1, 5 y 7 |
| PAG-013 | Notificaciones simultáneas | PARCIAL | Cubierto por el bloqueo y `mp_payment_id` único (MIG), sin prueba concurrente del mismo pago |
| PAG-014 | Monto distinto / vencida o cancelada / seña / precio completo | CUBIERTO | WH rama 4 |
| PAG-014 | Pendiente con monto incorrecto / Pago correcto posterior a uno incorrecto | PARCIAL | Se prueba cada paso por separado, no la secuencia |
| PAG-015 | 3 escenarios | CUBIERTO | WH rama 9; RAR `refundDue` |
| PAG-016 | 3 escenarios | CUBIERTO | WH |

### 3.3 administracion

| Req | Escenario | Estado | Evidencia |
|---|---|---|---|
| ADM-015 | 5 escenarios | CUBIERTO | `depositPercent.test.ts`; MIG `complexes_porcentaje_sena_valido` |
| ADM-016 | Grilla de invitado / Enlace de contacto / Reserva vencida en el historial | CUBIERTO (manual) | VN UT-9a y "Grilla con un invitado CONFIRMED" |
| ADM-016 | Reserva con cuenta / Reserva pendiente vigente | PARCIAL | Sin registro manual específico |
| ADM-017 | Reembolso confirmado / Confirmación rechazada / A criterio del canchero | CUBIERTO (manual) | VN T-7.7 |
| ADM-017 | Pago sin turno / Monto no coincide / Pagó después de cancelar / Pago duplicado / Varios pagos / Falla del reembolso / Sin pagos a reembolsar | PARCIAL | Backend con pruebas (REEM, RAR); la UI sin ejecución registrada |
| ADM-018 | Cambio exitoso / Valor inválido | CUBIERTO (manual) | VN UT-9b |
| ADM-004 | 5 escenarios | CUBIERTO (indirecto) | MET; `filtrosReserva.test.ts` |
| ADM-004 | Mismo resultado antes y después del barrido | PARCIAL | Solo por el filtro común |
| ADM-005 | 3 escenarios | CUBIERTO | MET |
| ADM-006 | Solo confirmadas / invitado / mezcla / sin pago / pendientes y vencidas | CUBIERTO | MET |
| ADM-006 | Reserva completada / Pagos que no suman | PARCIAL | Sin prueba específica de COMPLETED ni de AMOUNT_MISMATCH y DUPLICATE_PAYMENT |
| ADM-006 | Seña del 100 % | CUBIERTO | MET |
| ADM-008 | 6 escenarios | CUBIERTO | RAR; REEM |

### 3.4 canchas

| Req | Escenario | Estado | Evidencia |
|---|---|---|---|
| CAN-006 | 5 escenarios | CUBIERTO | DISP; `filtrosReserva.test.ts`; VN T-8.4 |

## 4. Hallazgos

### CRÍTICO

**C1. La creación de reservas de jugador y de administrador no libera las `PENDING` vencidas (RES-026, RES-007).**

- `backend/src/modules/bookings/booking.service.ts` (`createBooking` y `createAdminBooking`) abre `conBloqueoDeCancha` pero no llama a `liberarReservasVencidas`. Las reservas de invitado, `cancelBooking`, `updateBookingStatus` y el webhook sí lo llaman. Confirmado por el orquestador.
- RES-026 exige liberar las vencidas antes de validar el solapamiento de cualquier creación de reserva en esa cancha; RES-007, que la `PENDING` vencida pase a `EXPIRED` antes de evaluar el solapamiento.
- Con una `PENDING` vencida sin barrer, la disponibilidad muestra el turno libre (RES-012), pero un jugador o administrador recibe 409 hasta por 60 s, hasta que corre el barrido.
- Causa: `design.md` omitió estas dos rutas en la lista de lugares donde corre `liberarReservasVencidas`.
- Arreglo mínimo: llamar `liberarReservasVencidas(transaccion, courtId)` como primera operación en ambas creaciones, con una prueba del orden "liberar, crear", y completar `design.md`.

### ADVERTENCIAS

**W1. `PATCH /bookings/admin/:id/status` devuelve la fila cruda de `Booking`**, con `accessTokenHash`, `mpPreferenceId` y `depositPaidAtCancel` de reservas de invitado. Contradice RES-025 ("Token no recuperable") y la lista blanca de ADM-008. Riesgo bajo (hash no invertible, ruta solo `ADMIN`). Lo mismo en `cancelBooking` (reserva con cuenta). Sugerido: `armarVistaAdmin` o un `select` explícito.

**W2. Pago aprobado sin monto: spec y diseño se contradicen.** PAG-014 y PAG-026 piden registrarlo como `AMOUNT_MISMATCH`; el diseño y el código no crean fila y solo emiten una advertencia, porque `amount` es obligatorio. Hay que decidir: ajustar la spec (excepción documentada) o permitir `amount` nulo.

**W3. El sondeo de la página de seguimiento puede agotar el límite por IP.** Cada 20 s son 45 consultas en 15 minutos, contra un máximo de 60 que comparten GET, cancelar y reintento. Con dos pestañas o una IP compartida (NAT) se llega a 429.

**W4. Cuenta regresiva y vencimiento en pantalla dependen del reloj del navegador.** Con el reloj adelantado se oculta el botón de pago de una reserva vigente; con el reloj atrasado se ofrece pagar una vencida. Sugerido: desfase calculado con la cabecera `Date`.

**W5. `auto_return` sin verificar.** Depende de `https`; queda para el despliegue.

**W6. Pruebas con base se omiten en silencio** sin `DATABASE_URL_PRUEBA`. Deuda conocida (`calidad-ci`).

**W7. Sin prueba de integración real de la liberación por vencimiento.** Una prueba real "PENDING vencida, luego otro tipo de reserva da 201" habría detectado C1.

**W8. Frontend sin pruebas automáticas; 29 escenarios PARCIAL, 22 de ellos de UI.** Aceptado en `tasks.md`; conviene ejecutarlos o aceptarlos de forma explícita antes de archivar.

### SUGERENCIAS

- **S1.** PAG-024 dice reembolsar "por su `amount`"; el código reembolsa el saldo completo sin `amount`, verificado en T-0.3. Alinear el texto de la spec.
- **S2.** `AdminDashboard.tsx` rotula la reserva "Reembolso pendiente" y "Reembolso a criterio"; ADM-017 pide "Reembolso obligatorio" y "Seña sin reembolsar". `ListaPagos` muestra todos los pagos, no solo los pendientes.
- **S3.** Al cancelar desde "Todas las Reservas" solo se actualiza el estado local; el pago `OWNER_DISCRETION` y el botón "Reembolsar" aparecen al recargar.
- **S4.** Comentario desactualizado en `BookingsPage.tsx` ("redirige a Mercado Pago").
- **S5.** Riesgos multi-tenant esperables (ADR 0002): ADM-015, PAG-024 y ADM-008 operan por id sin comprobar pertenencia a un negocio; el tope por teléfono es global; el prefijo `549` está fijo. Anotar para `multi-tenant-negocios`.
- **S6.** Agregar pruebas: un invitado en `PATCH /admin/:id/status`, COMPLETED y pagos no válidos en ADM-006, y el cambio de `depositPercent` (PAG-022).

### Reglas de AGENTS.md

- `any`: ninguno nuevo; `security.ts:47` es previo.
- UTC: las fechas de turno usan métodos UTC.
- Capas: los controladores no usan Prisma.
- Hooks: sin `setState` síncrono en cuerpos de `useEffect`; lint sin errores.
- Idioma: nombres nuevos en español.

## 5. Tareas

`tasks.md`: 61 de 62 hechas. Solo T-11.1 sigue abierta.

## 6. Veredicto

**T-11.1 todavía no puede cerrarse.** Pruebas, `tsc`, build y lint en verde y sin escenarios SIN COBERTURA, pero falta:

1. Corregir C1 con una prueba (RED, GREEN) y completar `design.md`.
2. Decidir W1 (lista blanca en el cambio de estado) y W2 (pago sin monto: ajustar spec o código).
3. Registrar como aceptados o ejecutar los escenarios PARCIAL de UI y W5 (retorno automático, al desplegar).

Con C1 corregido, W1 y W2 resueltos o aceptados por escrito, y W3 a W8 registrados, T-11.1 puede marcarse y el cambio pasa a `sdd-archive`.

## 7. Resolución (2026-11-19, decisión del usuario)

| Hallazgo | Resolución |
|---|---|
| C1 | Corregido en T-12.1 con TDD: `createBooking` y `createAdminBooking` llaman `liberarReservasVencidas` como primera operación bajo el bloqueo. RED observado (orden sin "liberar"; 409 en la base descartable con una `PENDING` vencida sin barrer); GREEN con `liberarAlCrearReserva.test.ts` y `liberarAlCrearReservaBase.test.ts` (201 y la vencida queda `EXPIRED`). `design.md` actualizado. Cubre también W7. |
| W1 | Corregido en T-12.2 con TDD: `PATCH /bookings/admin/:id/status` responde con `armarVistaAdmin` y `cancelBooking` con `armarVistaJugador`, sin `accessTokenHash` ni `mpPreferenceId` (`respuestasListaBlanca.test.ts`). El frontend no usa esas respuestas. `POST /bookings/admin/create` sigue devolviendo la fila de Prisma (nace sin token): queda como candidato fuera de alcance. |
| W2 | Resuelto en T-12.3 ajustando PAG-014 y PAG-026 a la excepción que ya implementan el diseño y el código: un pago aprobado sin monto deja una advertencia en el log, sin fila ni confirmación. |
| W3, W4 | Aceptados y registrados: el sondeo de 20 s y la cuenta regresiva con el reloj del navegador quedan como mejoras para un cambio posterior. |
| W5 | Aceptado: `auto_return` con `https` se verifica al desplegar (`despliegue`). |
| W6, W8 | Aceptados: deuda conocida de `calidad-ci` (pruebas con base separadas y pruebas del frontend). Los escenarios PARCIAL de UI quedan aceptados con la verificación manual registrada en `verify-notes.md`. |
| S1 a S6 | Registradas como sugerencias; S5 (multi-tenant) va a `multi-tenant-negocios`. |

Comandos tras los ajustes: `npm test` en `backend/` contra la base descartable, 32 archivos y 470 pruebas en verde; `npx tsc --noEmit` y `npm run build` sin errores; `rg "\bany\b\|as unknown as" backend/src` solo con `security.ts:47` (previo). T-11.1 cerrada; el cambio queda listo para `sdd-archive`.
