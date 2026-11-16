---
description: Retoma el contexto del proyecto (memoria, estado SDD, git y hoja de ruta) y propone el siguiente paso.
---

Retoma el contexto del proyecto `sistema-de-reservas`. Hacé lo siguiente, sin modificar archivos:

1. Memoria: ejecutá `mem_context` y `mem_search` con el proyecto `sistema-de-reservas` para las consultas `sdd-init`, `producto/decisiones` y `sdd/*`.
2. Estado SDD: ejecutá `gentle-ai sdd-status --cwd . --json`.
3. Git: ejecutá `git status` y `git log --oneline -15`.
4. Cambios en curso: listá `openspec/changes` excluyendo `archive`.
5. Hoja de ruta: leé `docs/producto/hoja-de-ruta.md`.

Respondé en español y de forma breve:

- Resumen del estado actual (rama, cambios sin confirmar, cambio SDD activo).
- Próximo paso recomendado según la hoja de ruta.

Para continuar con el flujo SDD usá los comandos globales `/gentle-sdd-*`; no los dupliques aquí.
