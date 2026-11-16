---
name: convencion-specs
description: Formato obligatorio de las especificaciones de openspec (specs vigentes y delta specs). Usar al escribir, revisar o modificar cualquier archivo en openspec/specs/ u openspec/changes/<cambio>/specs/.
---

# Convención de specs

Todo en español neutro y profesional. Los identificadores del código se conservan (`firstName`, `lastName`, etc.). Se describe comportamiento observable, no implementación.

## Ubicación

- Specs vigentes: `openspec/specs/<dominio>/spec.md`.
- Dominios: `autenticacion`, `reservas`, `canchas`, `pagos`, `administracion` (más adelante: `negocios`).
- Delta specs de un cambio: `openspec/changes/<cambio>/specs/<dominio>/spec.md`.

Plantilla: [plantilla-spec.md](plantilla-spec.md).

## Estructura de una spec vigente

1. `# Spec: <dominio>`
2. `## Propósito`: una o dos frases.
3. `## Requisitos`: cada uno con ID estable, redactado con palabras clave RFC 2119 en español y al menos un escenario.
4. `## Fuera de alcance`: lo que la spec no cubre.
5. `## Observaciones` (solo specs base): brechas o inconsistencias detectadas, sin inventar comportamiento.
6. `## Evidencia` (solo specs base): referencias `archivo:línea`.

## Palabras clave (RFC 2119)

- **DEBE** / **NO DEBE**: obligatorio / prohibido.
- **DEBERÍA**: recomendado, con excepciones justificadas.
- **PUEDE**: opcional.

## IDs estables

Formato `<PREFIJO>-NNN` con prefijo por dominio: `AUT`, `RES`, `CAN`, `PAG`, `ADM`, `NEG`. Los IDs no se reutilizan ni se renumeran; un requisito eliminado conserva su ID como retirado.

## Escenarios

Cada requisito tiene escenarios en formato:

```
#### Escenario: <nombre>
- Dado <contexto>
- Cuando <acción>
- Entonces <resultado observable>
```

Se cubren el caso normal y al menos un caso de error o borde.

## Delta specs

Describen solo lo que cambia, en tres secciones:

- `## AGREGADO`: requisitos nuevos completos.
- `## MODIFICADO`: el requisito completo con su ID y texto nuevo, más una línea `Motivo:`.
- `## ELIMINADO`: ID y motivo.

Al archivar el cambio, los deltas se fusionan en `openspec/specs/`.

## Reglas de calidad

- Un requisito expresa una sola regla verificable.
- Sin comportamiento especulativo: si no está implementado ni decidido, no es requisito.
- Los requisitos objetivo (aún no implementados) se marcan `[OBJETIVO]` y viven en deltas de cambios, no en specs base.
