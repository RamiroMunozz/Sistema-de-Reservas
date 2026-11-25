# Informe de archivo: multi-tenant-negocios

**Fecha de archivo**: 2026-11-25
**Modo de almacenamiento**: hybrid (openspec + Engram, proyecto `sistema-de-reservas`)
**Carpeta archivada**: `openspec/changes/archive/2026-11-25-multi-tenant-negocios/`
**Estado de Git**: sin commits ni staging por parte del agente (se usó `mv`, no `git mv`). Los cambios siguen sin commitear al cierre; el usuario commitea.

Este archivo es aditivo: fue creado después de la copia mecánica de la carpeta del cambio y no forma parte del snapshot de origen.

## Estado del cambio al cierre

Fuentes en orden de rango: launch del orquestador (estado final), `tasks.md` archivado y, por último, `verify-report.md` (snapshot del 2026-11-25).

- Tareas: 64 de 64 marcadas como hechas en `tasks.md`; 0 pendientes. Las casillas no se modificaron al archivar.
- Verificación: `verify-report.md` con veredicto "PASA CON ADVERTENCIAS", 0 críticos. Es un snapshot de verificación.
- Advertencia W1 (longitud del nombre del negocio): resuelta. Decisión del usuario (2026-11-25): NEG-007 se alineó al código ("tras recortar espacios, de 2 a 150 caracteres"), coincidente con `VarChar(150)`. Verificado en `openspec/specs/negocios/spec.md`.
- CI: en verde sobre `d1cedc8` según el estado final del orquestador. `verify-report` (§2 y W4) decía "pendiente" en su momento; se reporta el estado final.
- Pruebas: 650 de 650 en 45 archivos contra `reservas_prueba` (corrida del orquestador, 2026-11-25, citada en `verify-report` §1). `npx tsc --noEmit` sin errores y frontend `lint` y `build` correctos (mismo origen).
- Migraciones M1 (`20261125120000_negocios`) y M2 (`20261125120100_roles_negocio`) aplicadas también a la base de desarrollo el 2026-11-25 (launch del orquestador).

### Advertencias abiertas al cierre (de `verify-report` §6, sin evidencia posterior de corrección)

- W2: sin tabla de evidencia TDD en `apply-progress`; la evidencia RED/GREEN está por tarea en `tasks.md`.
- W3: la numeración NEG de `tasks.md` y de comentarios de `migracionNegocios.test.ts` no coincide con la de las specs finales.
- W5: tres escenarios sin prueba automatizada directa (barrido con dos negocios de NEG-010, contenido de la semilla de NEG-012, INSERT directo con slug repetido de NEG-004).
- W6: el jugador recibe la fila completa de la reserva (incluye `negocioId`, `accessTokenHash`, `mpPreferenceId`, `depositPaidAtCancel`) en `createBooking` y `getUserBookings`. Pendiente de decisión: vista con lista blanca.
- W7: el dueño de un negocio inactivo sigue operando con su token (`core/middlewares/negocio.ts`). Queda para el próximo cambio (N.º 9).

Sugerencias abiertas: S1 (`resolverNegocioFijo` sin uso), S3 (`update` de cancha y seña filtra solo por `id`), S4 (campo de error `negocio.slug` a aclarar en la spec), S5 (`cancelBooking` distingue 404 de 403, anterior al cambio), S6 (`GET /negocios/:slug/courts/:id` devuelve el complejo completo).

Nota de la propia verificación: "CI en verde" y los criterios de éxito de `proposal.md` quedan sin marcar en el archivo; no se modificaron.

## Requisitos fusionados en `openspec/specs/`

| Dominio | Acción | Agregados | Modificados | Eliminados | Requisitos antes → después |
|---|---|---|---|---|---|
| negocios | Creado (dominio nuevo, copia completa de la delta) | 12 (NEG-001 a NEG-012) | 0 | 0 | 0 → 12 |
| reservas | Fusionado | 1 (RES-036) | 12 (RES-001, 004, 005, 010, 012, 013, 015, 016, 017, 021, 023, 031) | 0 | 35 → 36 |
| pagos | Fusionado | 0 | 1 (PAG-024) | 0 | 26 → 26 |
| canchas | Fusionado | 0 | 8 (CAN-001, 004, 007, 008, 009, 010, 011, 013) | 0 | 15 → 15 |
| autenticacion | Fusionado | 1 (AUT-015) | 5 (AUT-001, 006, 009, 012, 014) | 0 | 14 → 15 |
| administracion | Fusionado | 1 (ADM-019) | 5 (ADM-001, 002, 008, 009, 015) | 0 | 18 → 19 |

Las secciones `## Propósito`, `## Fuera de alcance`, `## Observaciones` y `## Evidencia` no cambiaron por la fusión. Los únicos cambios de texto fuera de requisitos son los cuatro Propósitos indicados abajo.

Títulos de requisitos modificados que cambiaron respecto de la spec vigente (la delta no declara `RENAMED`; el título nuevo lo adopta la delta, según su bloque `MODIFICADO`):
- ADM-008: "Listado completo de reservas del dueño".
- CAN-009: "Alta de cancha por un dueño".
- CAN-010: "Modificación de cancha por un dueño".
- RES-005: "Validación compartida entre jugador, dueño e invitado".
- RES-013: "Agenda diaria del dueño".
- RES-015: "Cambio de estado por el dueño".
- RES-016: "Creación de reserva por el dueño".

Las líneas `Motivo:` y `(Previously: ...)` de los bloques `MODIFICADO` se conservaron en las specs vigentes, como en el archivo previo (`reserva-invitado`). Son notas de historial de la delta.

### Propósitos editados a mano (S2 de `verify-report`)

- `openspec/specs/reservas/spec.md`: "comportamiento actual (single-tenant)" → "comportamiento vigente (multi-tenant)".
- `openspec/specs/pagos/spec.md`: idem.
- `openspec/specs/canchas/spec.md`: "tal como está implementado hoy (single-tenant)" → "tal como está implementado hoy (multi-tenant)".
- `openspec/specs/autenticacion/spec.md`: "comportamiento actual (single-tenant)" → "comportamiento vigente (multi-tenant)".

Pendiente fuera de esta instrucción: `openspec/specs/administracion/spec.md` conserva en su Propósito "Estado actual: single-tenant." (línea 5). No se tocó porque la instrucción de archivo acotaba los cuatro dominios indicados.

## Cómo se resolvió la fusión

1. `gentle-ai sdd-archive-compose` (3.7.0) falló sin escribir nada sobre la spec vigente de `pagos`: "canonical spec has no `### Requirement:` headings to compose against". Mismo bloqueo que en `reserva-invitado`.
2. Se aplicó el puente de formato autorizado en la solicitud, solo sobre copias en el directorio de scratch (fuera del repositorio):
   - Canónica: cada `### ID:` pasa a `### Requirement: ID:`. En los requisitos modificados con título distinto, el encabezado de la delta sustituye al vigente, para que la composición encuentre el nombre.
   - Delta: `## AGREGADO` → `## ADDED Requirements`; `## MODIFICADO` → `## MODIFIED Requirements`; `## ELIMINADO` (texto "Sin requisitos eliminados.") se omitió; los encabezados `### ID:` de esas secciones reciben `### Requirement:`.
   - `gentle-ai sdd-archive-compose --canonical ... --delta ... --output ...`: exit 0 en los cinco dominios.
   - La salida se revirtió de `### Requirement: ` a `### ` (`awk`, solo en las copias de scratch).
3. Instalación: cada resultado se copió con `cp` a `openspec/specs/<dominio>/spec.md.compose-tmp` y se movió con `mv` a `spec.md`.
4. Verificación posterior a la fusión (ver salidas abajo): los bloques de cada requisito de la delta son idénticos en la spec resultante; los bloques distintos de los modificados no cambiaron; el texto fuera de los bloques de requisito quedó idéntico; no quedó ningún `### Requirement:`.

## Salida verbatim de `diff -r` y verificaciones

Fusión por dominio (origen: resultado del puente en scratch; destino: `openspec/specs/<dominio>/spec.md`):

```
== autenticacion readback:  (sin salida, rc=0)
== administracion readback: (sin salida, rc=0)
== canchas readback:        (sin salida, rc=0)
== pagos readback:          (sin salida, rc=0)
== reservas readback:       (sin salida, rc=0)
```

Dominio nuevo `negocios` (origen: `openspec/changes/multi-tenant-negocios/specs/negocios/spec.md`; destino temporal y luego `openspec/specs/negocios/spec.md`):

```
diff -r negocios temp: (sin salida)
diff -r negocios installed: (sin salida)
```

Carpeta del cambio (origen: snapshot tomado con `cp -R` antes del `mv`; destino: `openspec/changes/archive/2026-11-25-multi-tenant-negocios/`):

```
(sin salida) diff_rc=0
```

El origen `openspec/changes/multi-tenant-negocios/` quedó ausente tras el `mv`, verificado antes del `diff -r`. La carpeta archivada contiene 11 archivos: `proposal.md`, `exploration.md`, `design.md`, `tasks.md`, `verify-report.md` y `specs/{administracion,autenticacion,canchas,negocios,pagos,reservas}/spec.md`.

Búsqueda de referencias `USER`/`ADMIN` tras la fusión (`rg -n "\b(USER|ADMIN)\b" openspec/specs`): el criterio esperado en el launch era "solo en Observaciones/Evidencia". No se cumple del todo. Las referencias restantes son contenido de la propia delta y no un fallo de la fusión, por lo que no se alteraron:
- Notas `(Previously: ...)` y `Motivo:` en bloques modificados: `reservas` 450, 497, 522; `pagos` 640; `autenticacion` 13, 14, 97, 154, 216, 257, 258; `administracion` 14, 275, 276, 373; `canchas` 191, 270.
- Normativa de AUT-015 (rechazo de roles anteriores y regla de lectura): `autenticacion` 151, 280.
- Escenarios de la propia delta sobre tokens y sesiones anteriores: `autenticacion` 188, 239, 295.
- Migración de NEG-011 (cuentas `ADMIN` y `USER` previas): `negocios` 218, 221, 223, 226.
- Observaciones históricas: `administracion` 539 y 553 (las líneas 553 y 539 pertenecen a `## Observaciones`).

## Trazabilidad: fuentes leídas

No se leyeron observaciones de Engram por ID en esta sesión de archivo; las fuentes fueron los locators de archivo del cambio y el estado final del launch.

| Fuente | Ubicación | Uso |
|---|---|---|
| Launch del orquestador | sesión de archivo | Estado final: 64/64, W1 resuelta, CI en verde sobre `d1cedc8`, migraciones aplicadas el 2026-11-25 |
| `tasks.md` | `openspec/changes/archive/2026-11-25-multi-tenant-negocios/tasks.md` | 64 de 64 `[x]`, 0 `[ ]` |
| `verify-report.md` | idem | Snapshot 2026-11-25: PASA CON ADVERTENCIAS, 0 críticos; W2 a W7 y S1 a S6 |
| Delta specs | `specs/*/spec.md` del cambio | Fuente de la fusión |
| Engram `sdd/multi-tenant-negocios/verify-report` | Engram | Resumen citado en `verify-report` (no leído por ID en esta sesión) |

Contradicciones registradas: `verify-report` §2 y W4 dicen que la CI estaba pendiente; el estado final del launch dice que está en verde sobre `d1cedc8`. Se reporta el estado final. Las cifras de pruebas (650 de 650) provienen de la corrida del orquestador citada en `verify-report` §1.

## Pendientes y estado de cierre

- Tareas sin completar: ninguna en `tasks.md` archivado.
- Advertencias y sugerencias abiertas: ver la sección de estado al cierre.
- Pendientes de specs: `openspec/specs/administracion/spec.md` conserva "Estado actual: single-tenant." en su Propósito; las referencias `USER`/`ADMIN` listadas arriba.
- Commits: pendientes de decisión del usuario. Sin push ni PR. Sugerido: `docs(negocios): archivar multi-tenant-negocios y fusionar las specs vigentes`.

## Archivos tocados

- `openspec/specs/negocios/spec.md` (nuevo).
- `openspec/specs/{reservas,pagos,canchas,autenticacion,administracion}/spec.md` (fusión; Propósito de cuatro de ellos).
- `openspec/changes/multi-tenant-negocios/` movida a `openspec/changes/archive/2026-11-25-multi-tenant-negocios/`.
- `openspec/changes/archive/2026-11-25-multi-tenant-negocios/archive-report.md` (nuevo, aditivo).
- `docs/producto/hoja-de-ruta.md` (N.º 5 a "hecho").
- No se tocaron `docs/bitacora.md`, código, Git (sin commits ni staging).
