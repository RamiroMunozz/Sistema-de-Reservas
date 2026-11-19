# Informe de archivo: reserva-invitado

**Fecha de archivo**: 2026-11-19
**Modo de almacenamiento**: hybrid (openspec + Engram, proyecto `sistema-de-reservas`)
**Carpeta archivada**: `openspec/changes/archive/2026-11-19-reserva-invitado/`
**Estado de Git**: sin commits ni staging por parte del agente. Los cambios del repositorio siguen sin commitear al cierre; el usuario commitea. Este informe no registra hashes finales.

Este archivo es aditivo: fue creado después de la copia mecánica de la carpeta del cambio y no forma parte del snapshot de origen.

## Estado del cambio al cierre

Fuente de mayor rango: `tasks.md` archivado y la decisión del usuario registrada en `verify-report.md` §7 (2026-11-19).

- Tareas: 65 de 65 marcadas como hechas en `tasks.md`; 0 pendientes. Las casillas no se modificaron al archivar.
- Pruebas del backend: 470 de 470 en verde, 32 archivos, contra la base descartable (cifra de `apply-progress` y de `verify-report` §7, posterior al último snapshot).
- `npx tsc --noEmit` y `npm run build`: sin errores (`verify-report` §7).
- Verificación (`sdd-verify`): el veredicto de `verify-report` §6 ("T-11.1 todavía no puede cerrarse") es un snapshot anterior. Su resolución está en §7: C1 corregido en T-12.1, W1 en T-12.2, W2 en T-12.3 (ajuste de PAG-014 y PAG-026, ya fusionado), W3 a W8 aceptados. Se reporta el estado final, no el veredicto intermedio.
- Trabajo aceptado y no corregido en este cambio (decisión registrada en `verify-report` §7):
  - W3 y W4: sondeo de 20 s y cuenta regresiva con el reloj del navegador, para un cambio posterior.
  - W5: retorno automático `auto_return` con `https`, a verificar al desplegar (`despliegue`).
  - W6 y W8: deuda de `calidad-ci` (pruebas con base separada y pruebas automáticas del frontend). Los escenarios PARCIAL de UI quedan con verificación manual en `verify-notes.md`.
  - S1 a S6: sugerencias registradas; S5 (multi-tenant) pasa a `multi-tenant-negocios`.
  - Fuera de alcance conocido: `POST /bookings/admin/create` sigue devolviendo la fila completa de Prisma (`verify-report` §7, W1).

## Requisitos fusionados en `openspec/specs/`

| Dominio | Agregados | Modificados | Eliminados | Requisitos antes → después |
|---|---|---|---|---|
| reservas | 13 (RES-023 a RES-035) | 10 (RES-006, 007, 009, 011, 012, 013, 014, 015, 020, 022) | 0 | 22 → 35 |
| pagos | 7 (PAG-020 a PAG-026) | 8 (PAG-004, 005, 006, 012, 013, 014, 015, 016) | 0 | 19 → 26 |
| administracion | 4 (ADM-015 a ADM-018) | 4 (ADM-004, 005, 006, 008) | 0 | 14 → 18 |
| canchas | 0 | 1 (CAN-006) | 0 | 15 → 15 |

Las secciones `## Propósito`, `## Fuera de alcance`, `## Observaciones` y `## Evidencia` de cada spec no cambiaron. Las specs de `autenticacion` no se tocaron.

## Cómo se resolvió la fusión

1. La herramienta nativa `gentle-ai sdd-archive-compose` (3.7.0) falló con el formato del proyecto: "canonical spec has no `### Requirement:` headings to compose against". Es el hallazgo ya registrado en la bitácora. No se reportó nada a GitHub.
2. Se aplicó un puente de formato, autorizado en la solicitud de archivo, sobre copias de trabajo en el directorio de scratch (fuera del repositorio):
   - Títulos: `### RES-0xx:` (y PAG, ADM, CAN) pasan a `### Requirement: RES-0xx:` solo en las copias de trabajo.
   - Secciones: `## AGREGADO` → `## ADDED Requirements`; `## MODIFICADO` → `## MODIFIED Requirements`.
   - La sección `## ELIMINADO` con el texto `Ninguno.` se omitió en la copia de la delta (no hay requisitos eliminados).
   - Se ejecutó `gentle-ai sdd-archive-compose --canonical ... --delta ... --output ...` por dominio: exit 0 en los cuatro.
   - Se revirtieron los títulos en la salida.
3. Caso de título: en `pagos`, el requisito PAG-015 se llama "Turno ya ocupado al reconfirmar" en la spec vigente y "Turno ya ocupado al reactivar" en la delta. La delta no declara `RENAMED`, así que el compositor no lo acepta por nombre. Para la composición se alineó el título con la spec vigente y, tras la fusión, se restauró el título de la delta. El resultado final usa "reactivar". Es un cambio de título no declarado en la delta; queda registrado aquí para revisión.
4. Verificación de contenido, por requisito: se comparó un hash de cada bloque de requisito (`###` hasta el siguiente encabezado) entre la spec vigente original y la resultante, y el texto fuera de los requisitos. Resultado: solo cambiaron los IDs de la lista MODIFICADO y se agregaron los de AGREGADO; el texto fuera de los requisitos quedó idéntico en los cuatro dominios.
5. Instalación atómica: la salida del puente se copió mecánicamente a `openspec/specs/<dominio>/spec.md.compose-tmp` y luego se movió con `mv` a `spec.md`. No quedaron archivos temporales.

Observaciones para el usuario (no corregidas, fuera del alcance de la fusión):
- Las specs vigentes conservan la marca `[OBJETIVO]` en los títulos de los requisitos nuevos (24 líneas en total: reservas 13, pagos 7, administracion 4, según `rg -c`). `convencion-specs` indica que los requisitos objetivo no viven en specs base. Decisión pendiente: quitar la marca en un cambio posterior.
- Los bloques MODIFICADO conservan las líneas `Motivo:` y `(Previously: ...)` de la delta.
- La mecánica de archivo usó `mv` en lugar de `git mv`, para no dejar cambios en staging (instrucción del usuario).

## Salida verbatim de `diff -r`

Fusión de specs (origen: copia final del puente en scratch; destino: `openspec/specs/<dominio>/spec.md`):

```
== reservas readback:
(sin salida) rc=0
== pagos readback:
(sin salida) rc=0
== administracion readback:
(sin salida) rc=0
== canchas readback:
(sin salida) rc=0
== autenticacion (no tocada, contra copia previa):
(sin salida) rc=0
```

Archivo de la carpeta del cambio (origen: snapshot tomado con `cp -R` antes del `mv`; destino: `openspec/changes/archive/2026-11-19-reserva-invitado/`):

```
(sin salida) diff_rc=0
```

El origen `openspec/changes/reserva-invitado/` quedó ausente tras el `mv`, verificado antes del `diff -r`.

## Trazabilidad: observaciones de Engram leídas

| Artefacto | Clave / ID | Uso en este archivo |
|---|---|---|
| proposal | `sdd/reserva-invitado/proposal` (#17) | Alcance y entregas originales (snapshot del 2026-11-17) |
| spec | `sdd/reserva-invitado/spec` (#29, rev. 7) | Snapshot; la fuente final son las delta specs archivadas |
| design | `sdd/reserva-invitado/design` (#31, rev. 4) | Snapshot; la fuente final es `design.md` archivado (actualizado en T-12.1) |
| tasks | `sdd/reserva-invitado/tasks` (#33, rev. 12) | Snapshot anterior a UT-12; la fuente final es `tasks.md` archivado (65/65) |
| apply-progress | `sdd/reserva-invitado/apply-progress` (#34, rev. 16) | Estado final de pruebas y decisiones de UT-12 |
| verify-report | `sdd/reserva-invitado/verify-report` (#42) | Snapshot de la verificación; la resolución está en `verify-report.md` §7 |

Contradicciones registradas (rango: archivo final y decisión del usuario > apply-progress y tasks > snapshots de verify-report, tasks y spec):
- #42 y `verify-report.md` §6 dicen que T-11.1 no cierra. §7 y #34 dicen que está cerrada. Se reporta el cierre de §7.
- #33 lista como pendientes T-7.7, T-8.4, T-10.5 y T-11.1. `tasks.md` archivado las tiene hechas. Se reporta 65/65.
- #34 indica que UT-6 a UT-12 no estaban commiteadas. Estado de Git al cierre: sin commitear, por decisión del usuario.

## Pendientes y estado de cierre

- Tareas sin completar: ninguna en `tasks.md` archivado.
- Riesgos aceptados: W3 a W8 según `verify-report` §7 (ver arriba).
- Verificaciones no ejecutadas por el agente de archivo: ninguna nueva. Las pruebas, `tsc` y el build se toman de los registros previos citados.
- Commits: pendientes de decisión del usuario. Sin push ni PR.

## Archivos tocados

- `openspec/specs/reservas/spec.md`, `openspec/specs/pagos/spec.md`, `openspec/specs/administracion/spec.md`, `openspec/specs/canchas/spec.md` (fusión).
- `openspec/changes/reserva-invitado/` movida a `openspec/changes/archive/2026-11-19-reserva-invitado/`.
- `openspec/changes/archive/2026-11-19-reserva-invitado/archive-report.md` (nuevo, aditivo).
- No se tocaron `docs/bitacora.md`, la hoja de ruta, código ni Git.
