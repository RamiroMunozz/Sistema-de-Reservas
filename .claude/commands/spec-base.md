---
description: Documenta el comportamiento actual de un dominio en openspec/specs/<dominio>/spec.md.
argument-hint: <dominio>
---

Primero validá el argumento: si `$ARGUMENTS` no es exactamente uno de `autenticacion`, `reservas`, `canchas`, `pagos` o `administracion`, no delegues nada; respondé que el dominio no es válido, listá los valores permitidos y terminá.

Delegá en el agente `documentador-specs` la escritura de `openspec/specs/$ARGUMENTS/spec.md`.

Instrucciones para el agente:

- Documentar el comportamiento ACTUAL a partir del código y las pruebas del dominio `$ARGUMENTS` (autenticacion, reservas, canchas, pagos o administracion).
- Seguir el skill `convencion-specs` (usar su plantilla).
- Incluir una sección "Evidencia" con referencias `archivo:línea`.
- Registrar brechas e inconsistencias en "Observaciones"; no inventar comportamiento.

Al terminar, mostrá un resumen: cantidad de requisitos, observaciones y archivos creados. No hagas commit.
