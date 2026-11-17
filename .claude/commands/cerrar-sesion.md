---
description: Cierra la sesión de trabajo, actualiza la hoja de ruta, guarda el resumen en memoria y sugiere mensajes de commit.
---

Cerrá la sesión de trabajo del proyecto `sistema-de-reservas`:

0. Actualizá `docs/bitacora.md`: reescribí "Estado actual" y "Próximo paso", y agregá al principio de "Registro de sesiones" una entrada con fecha, objetivo, hecho, decisiones, hallazgos y commits. Si hay más de 10 entradas, resumí las más antiguas en una línea.
1. Si corresponde, actualizá el estado del cambio en `docs/producto/hoja-de-ruta.md` (pendiente, en curso o hecho).
2. Guardá el resumen de la sesión con `mem_session_summary` para el proyecto `sistema-de-reservas`.
3. Listá los cambios sin confirmar con `git status --short`.
4. Sugerí mensajes de commit en español con formato Conventional Commits, agrupados por unidad de trabajo. No agregues atribución de IA ni `Co-Authored-By`.
5. Integración diaria en `main`: si no quedan cambios sin confirmar y pasan las verificaciones (`cd backend && npm test`, `cd backend && npx tsc --noEmit`, y la revisión de Gentle AI cuando corresponda), proponé integrar `desarrollo` en `main`. Con confirmación del usuario, ejecutá `git switch main && git merge --ff-only desarrollo && git push origin main && git switch desarrollo`. Si el fast-forward falla o alguna verificación falla, no integres y reportá el motivo.

No hagas commit ni push salvo pedido explícito o la confirmación del paso 5.
