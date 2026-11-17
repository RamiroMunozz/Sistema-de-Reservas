---
description: Cierra la sesión de trabajo, actualiza la hoja de ruta, guarda el resumen en memoria y sugiere mensajes de commit.
---

Cerrá la sesión de trabajo del proyecto `sistema-de-reservas`:

0. Actualizá `docs/bitacora.md`: reescribí "Estado actual" y "Próximo paso", y agregá al principio de "Registro de sesiones" una entrada con fecha, objetivo, hecho, decisiones, hallazgos y commits. Si hay más de 10 entradas, resumí las más antiguas en una línea.
1. Si corresponde, actualizá el estado del cambio en `docs/producto/hoja-de-ruta.md` (pendiente, en curso o hecho).
2. Guardá el resumen de la sesión con `mem_session_summary` para el proyecto `sistema-de-reservas`.
3. Listá los cambios sin confirmar con `git status --short`.
4. Sugerí mensajes de commit en español con formato Conventional Commits, agrupados por unidad de trabajo. No agregues atribución de IA ni `Co-Authored-By`.
5. Integración diaria en `main`. Requisitos: no quedan cambios sin confirmar, la revisión de Gentle AI pendiente está cerrada y pasan estas verificaciones (cada comando por separado, desde `backend/`):
   - `npx tsc --noEmit`.
   - `npm test`. Las pruebas que usan la base borran reservas: corrélas solo si `DATABASE_URL` apunta a una base descartable. Si no hay base descartable, aceptá como única falla conocida la de esas pruebas por falta de PostgreSQL, e informalo.

   Si se cumplen, proponé la integración. Con confirmación del usuario, ejecutá cada paso por separado y verificá su resultado antes del siguiente:
   1. `git fetch origin`. Si `main` local está adelantado respecto de `origin/main` (quedó de un push fallido en una sesión anterior) y `origin/main` es ancestro de `main`, reintentá `git push origin main` antes de seguir. Si diverge, detenete y reportá.
   2. `git switch main`.
   3. `git merge --ff-only desarrollo`.
   4. `git push origin main`.
   5. `git switch desarrollo`.

   Si falla el paso 3, volvé a `desarrollo`. Si falla el paso 4, `main` local quedó adelantado sin publicar: volvé a `desarrollo` y reportá el error sin reintentar ni deshacer. En todos los casos terminá en `desarrollo`.

No hagas commit ni push salvo pedido explícito o la confirmación del paso 5.
