# 0001. Adopción de SDD

- Estado: Aceptada
- Fecha: 2026-11-16

## Contexto

El proyecto avanzó con ODD (Organic Driven Development) y una auditoría que dejó deuda técnica. Ahora debe crecer hacia un producto multi-negocio y servir como material de tesis, por lo que necesita contratos explícitos, trazabilidad y cambios revisables.

## Decisión

Adoptar SDD (Spec-Driven Development):

- Las especificaciones vigentes viven en `openspec/specs/<dominio>/spec.md`.
- Cada cambio se desarrolla en `openspec/changes/<cambio>/` (propuesta, delta specs, diseño, tareas) y se archiva al cerrarse.
- Los artefactos se guardan en modo híbrido: archivos en `openspec/` y memoria en Engram.
- Ritmo interactivo, estrategia de PR `ask-on-risk` y presupuesto de revisión de aproximadamente 400 líneas por PR.
- Todo cambio usa SDD; ODD se abandona.
- Se evoluciona el código actual; no se reescribe.

## Consecuencias

- Las specs base deben escribirse primero (cambio `specs-base`), documentando el comportamiento observado.
- Los artefactos SDD y la documentación alimentan directamente los capítulos de la tesis.
- Más ceremonia por cambio, a cambio de decisiones trazables.

## Alternativas consideradas

- Continuar solo con ODD: sin contratos duraderos, difícil de sostener con varios cambios estructurales.
- Reescribir desde cero: descartada por costo y porque el código actual tiene garantías ya verificadas (seguridad, concurrencia).
