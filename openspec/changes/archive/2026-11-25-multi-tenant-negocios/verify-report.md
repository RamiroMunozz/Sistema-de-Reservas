# Informe de verificación: `multi-tenant-negocios` (T-8.6)

Fecha: 2026-11-25. Rama `desarrollo`. Alcance: `git diff 0e40d53` más el working tree (93 archivos; 10 commits y 63 entradas sin commitear). Modo: TDD estricto, artefactos híbridos. Generado por `sdd-verify` y guardado por el orquestador. Resumen en Engram: `sdd/multi-tenant-negocios/verify-report`.

## Veredicto: PASA CON ADVERTENCIAS

0 CRITICAL, 7 WARNING y 6 SUGGESTION. Ningún hallazgo impide archivar. Los pendientes son de trazabilidad, de cobertura automatizada y deuda ya registrada para N.º 9.

## 1. Comprobaciones ejecutadas

| Comprobación | Resultado |
|---|---|
| `cd backend && npx tsc --noEmit` | Sin errores (exit 0) |
| `cd backend && npm run test:unit` con `DATABASE_URL` inalcanzable (puerto 1) | 34 de 34 archivos y 508 de 508 pruebas |
| `cd frontend && npm run lint` | Sin errores |
| `npm test` completo contra `reservas_prueba` | 45 archivos y 650 de 650 (corrida del orquestador del 2026-11-25) |
| Frontend `npm run build` | Correcto (corrida del orquestador) |
| T-2.10 y T-7.6, pruebas manuales con chrome-devtools | Evidencia registrada en `tasks.md` |
| Barrido estático con `rg` | Sin `any`, `as unknown as`, `@ts-ignore` ni `eslint-disable` en `backend/src`, `prisma/seed.ts`, `prisma/guardaSemilla.ts` ni `frontend/src`. Sin `prisma` en controladores, rutas ni `app.ts`. Sin `getHours` ni `toLocale*` de fecha en el backend |
| CI en `desarrollo` | **Pendiente, no es fallo.** UT-5 a UT-8 todavía no se publicaron. La última corrida en verde es sobre `26b09d3`, anterior al cambio |

## 2. Estado de las tareas

- `tasks.md` registra como hechas todas las tareas de UT-0 a UT-8, salvo T-8.6 (esta verificación más la CI).
- Las casillas de "Criterios de éxito" de `proposal.md` siguen sin marcar.

## 3. Cumplimiento del TDD estricto

| Verificación | Resultado | Detalle |
|---|---|---|
| Evidencia TDD reportada | Parcial (W2) | No hay tabla de evidencia del ciclo TDD. La evidencia RED/GREEN está por tarea en `tasks.md`, con comandos y conteos |
| Toda tarea de comportamiento tiene prueba | Cumple | Existen los archivos de prueba citados: `slugNegocio`, `altaNegocio`, `guardaSemilla`, `negociosPorSlug`, `resolutorNegocio`, `limitadorCreacionPorSlug`, `aislamientoAdmin`, `aislamientoReservasPagos`, `complejosAdmin`, `payloadJwt`, `authRoles` y `migracionNegocios` |
| GREEN confirmado | Cumple | `unit`: 508 de 508. `db`: 650 de 650 en la corrida completa |
| RED observado | Casi siempre real | Algunos RED se obtuvieron por mutación (T-1.7, T-1.10, T-4.2). Los 2 casos de `complexId` en `validacionCanchas` (T-3.1) no se observaron por separado. T-3.4 y las tareas de frontend T-7.x no admiten RED. Todo está declarado en `tasks.md` |
| Triangulación | Cumple | Por ejemplo, 40 casos en `slugNegocio`, 11 en `negociosPorSlug` y 14 en `aislamientoAdmin` |
| Fallos intermitentes | Registrado | Una corrida completa de `test:unit` dio 2 fallos que no se repitieron. Posiblemente sea un tiempo de espera bajo carga |

- **Capas de prueba:** las pruebas son `unit` (Vitest y supertest con Prisma simulado) y `db` (base real). El frontend no tiene pruebas hasta el N.º 10, por convención del proyecto.
- **Revisión de aserciones:** sin tautologías ni pruebas que no llamen a código de producción. El `toEqual([])` de `negociosPorSlug.test.ts:195` está acompañado por un caso no vacío en la línea 185.
- **Cobertura:** no se midió; no hay herramienta configurada.

## 4. Requisitos y escenarios

En la columna "Cobertura": **P** significa prueba automatizada, **M** evidencia manual registrada en `tasks.md` e **I** inspección del código.

### negocios

| Requisito | Cobertura |
|---|---|
| NEG-001 Modelo | P `migracionNegocios`; "varios complejos", I sobre `schema.prisma` |
| NEG-002 Formato del slug | P `slugNegocio` (40 casos) y `altaNegocio` (7 slugs inválidos o reservados: 400 y no se crea nada). Ver S4 |
| NEG-003 Slugs reservados | P `slugNegocio` y `altaNegocio`. I: `SLUGS_RESERVADOS` incluye las rutas del frontend y `api` |
| NEG-004 Unicidad | P `altaNegocio`: 409 y carrera de dos altas simultáneas. Sin INSERT directo (W5) |
| NEG-005 Resolución y 404 genérico | P `negociosPorSlug`, `resolutorNegocio` y `limitadorCreacionPorSlug`. Respuestas idénticas; el slug mal formado no consulta la base |
| NEG-006 Consulta pública | P `negociosPorSlug`. I: solo devuelve `nombre` y `slug` |
| NEG-007 Alta por `SUPER_ADMIN` | P `altaNegocio` (15 casos) y `slugNegocio`. **Se aparta de la spec: ver W1** |
| NEG-008 Alcance del `SUPER_ADMIN` | P `payloadJwt`: 403 en administración, `bookings/admin` y reembolso |
| NEG-009 Un dueño por negocio | P `migracionNegocios` |
| NEG-010 Aislamiento | P `aislamientoAdmin` (14 casos) y `aislamientoReservasPagos` (8). El barrido de vencidas sin filtro de negocio queda cubierto por I (W5) |
| NEG-011 Migración a `principal` | P `migracionNegocios`, `concurrenciaReservas` y `migracionReservaInvitado`. M: ensayos T-1.5 y T-2.5 y prueba T-7.6 |
| NEG-012 Semilla | M en las corridas `db` y T-5.4b; P parcial con `guardaSemilla` (W5) |

### autenticacion

| Requisito | Cobertura |
|---|---|
| AUT-015 Roles y negocio | P `migracionNegocios` y `payloadJwt` |
| AUT-001 Registro | P `authRoles` (crea `JUGADOR`) |
| AUT-006 Token | P `payloadJwt` (23 casos). I `security.ts`: unión discriminada de Zod, `z.uuid()` y `HS256` |
| AUT-009 Control por rol | P `payloadJwt` y `complejosAdmin` |
| AUT-012 y AUT-014 Frontend | M T-2.10. I: `requiredRole="DUENO"` |

### administracion

| Requisito | Cobertura |
|---|---|
| ADM-019 Panel limitado | P `aislamientoAdmin` y `complejosAdmin`; M T-7.6 (selector de complejo) |
| ADM-001 Protección | P `payloadJwt` y `complejosAdmin` |
| ADM-002 Métricas | P `aislamientoAdmin` y `metricasAdmin` |
| ADM-008 Listado | P `aislamientoAdmin` y `rutasAdminReservas` |
| ADM-009 Acceso al panel | M T-2.10 y T-7.6 |
| ADM-015 Seña | P `aislamientoAdmin` y `depositPercent` |

### canchas

| Requisito | Cobertura |
|---|---|
| CAN-001, CAN-004, CAN-007, CAN-008 y CAN-013 | P `negociosPorSlug` y `disponibilidad`; I `court.service.ts`; M T-7.6 |
| CAN-009 y CAN-010 | P `aislamientoAdmin` y `validacionCanchas` |
| CAN-011 | P `payloadJwt` |

### reservas

| Requisito | Cobertura |
|---|---|
| RES-036 y RES-001 | P `migracionNegocios`, `validacionReservas` y `reservaInvitadoCrear` |
| RES-004 y RES-005 | P `validacionReservas`; I `booking.service.ts:55-96` |
| RES-010 y RES-021 | P `aislamientoReservasPagos`; M T-7.6 |
| RES-012 | P `negociosPorSlug` y `disponibilidad` |
| RES-013 y RES-015 | P `aislamientoAdmin` y `aislamientoReservasPagos`; I: se mantiene `conBloqueoDeCancha` |
| RES-016 | P `aislamientoReservasPagos` |
| RES-017 | P `payloadJwt` |
| RES-023, RES-030 y RES-031 | P `negociosPorSlug`, `limitadorPublico` y `limitadorCreacionPorSlug` |

### pagos

| Requisito | Cobertura |
|---|---|
| PAG-024 Reembolso | P `aislamientoReservasPagos` (404 sin llamar a Mercado Pago), `reembolsoPago` y `payloadJwt` |

### Criterios de éxito de la propuesta

Los 10 criterios se cumplen. "CI en verde" sigue pendiente porque falta publicar los cambios.

## 5. Revisión dirigida

- **Fugas entre negocios: ninguna crítica.**
  - El negocio del dueño sale solo del claim firmado: `asignarNegocioDelDueno` y el payload validado con Zod. Ningún controlador lee `negocioId` del cliente.
  - Al buscar un recurso, el negocio va en el mismo `where` (`pertenencia.ts`). Un recurso ajeno y uno inexistente devuelven la misma excepción.
  - `validarTurnoReservable` siempre exige un negocio activo.
  - El `SUPER_ADMIN` recibe 403 en las rutas del dueño.
  - La base tiene defensa en profundidad: el trigger `bookings_negocio_coherente` y las restricciones `users_un_dueno_por_negocio` y `users_negocio_segun_rol`.
- **Capas:** los controladores no usan Prisma.
- **`any`:** no hay ninguno. Se cerró la deuda de `security.ts:47`.
- **UTC:** `getUTCHours` y `getUTCMinutes` en el backend, y métodos UTC en el frontend.
- **Frontend:** no hay `setState` síncrono en el cuerpo de un `useEffect`, y el lint pasa sin errores.

## 6. Hallazgos

### CRITICAL

Ninguno.

### WARNING

- **W1.** El nombre del negocio admite hasta 150 caracteres, pero NEG-007 dice 100. Está en `negocio.dto.ts:29-33` (`.max(150)`) y en `schema.prisma:85` (`VarChar(150)`). Además, el código usa `min(2)` donde la spec dice "no vacío". Lo introdujo la corrección M1 de T-5.5. Hay que alinear la delta spec o el código.
  - **Resuelto (2026-11-25, decisión del usuario):** se alinea la spec al código. NEG-007 pasa a decir "tras recortar espacios, de 2 a 150 caracteres", que coincide con `VarChar(150)`.
- **W2.** No hay tabla de evidencia del ciclo TDD en el apply-progress. La evidencia está por tarea en `tasks.md`.
- **W3.** La numeración NEG de `tasks.md` y de los comentarios de `migracionNegocios.test.ts:107,130,142,148` no coincide con la de las specs finales (aislamiento es NEG-010 y migración es NEG-011).
- **W4.** La CI de UT-5 a UT-8 sigue pendiente porque falta publicar los cambios.
- **W5.** Tres escenarios no tienen prueba automatizada directa: el barrido con dos negocios (NEG-010), el contenido de la semilla (NEG-012) y un INSERT directo con slug repetido (NEG-004).
- **W6.** El jugador recibe la fila completa de la reserva, con `negocioId`, `accessTokenHash`, `mpPreferenceId` y `depositPaidAtCancel`. Pasa en `booking.service.ts:112-126` (`createBooking`) y en `:130-140` (`getUserBookings`). No cruza negocios y es mayormente anterior al cambio. Pendiente de decisión: una vista con lista blanca.
- **W7.** El dueño de un negocio inactivo sigue operando con su token, porque `core/middlewares/negocio.ts:9-20` no vuelve a validar `activo`. Queda para N.º 9.

### SUGGESTION

- **S1.** `resolverNegocioFijo` queda exportado sin uso (`core/middlewares/negocio.ts:71`).
- **S2.** Los Propósitos de `openspec/specs/{reservas,pagos,canchas,autenticacion}/spec.md` dicen "single-tenant": hay que editarlos a mano al archivar. Antes de archivar, repetir `rg -n "\b(USER|ADMIN)\b" openspec/specs`. Puede hacer falta el puente de formato de `sdd-archive-compose`.
- **S3.** El `update` de cancha y de seña (`admin.service.ts:39` y `:72`) filtra solo por `id`. La pertenencia se verifica justo antes, así que hoy no es explotable. Conviene agregar el negocio al `where` como defensa en profundidad.
- **S4.** El campo de error del alta es `negocio.slug` y NEG-002 dice `slug`. Es coherente con el contrato anidado; aclararlo en la spec.
- **S5.** `cancelBooking` distingue 404 de 403 entre usuarios. Es anterior al cambio y no cruza negocios.
- **S6.** `GET /negocios/:slug/courts/:id` devuelve el complejo completo. Se puede acotar con un `select`.

## 7. Limitaciones

- `sdd-verify` no repitió `npm test` con la base ni el build del frontend; tomó la evidencia del orquestador.
- No se midió la cobertura.
- Las pruebas manuales se aceptan tal como están registradas.

## 8. Recomendación

Pasar a `sdd-archive`. Antes:

1. Decidir W1.
2. Editar los Propósitos (S2).
3. Publicar y esperar la CI en verde para cerrar T-8.6.
