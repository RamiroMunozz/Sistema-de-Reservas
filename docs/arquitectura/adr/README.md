# Registros de decisiones de arquitectura (ADR)

Cada decisión de arquitectura relevante se registra en un archivo numerado `NNNN-titulo-en-kebab-case.md`. Un ADR aceptado no se reescribe: si la decisión cambia, se crea uno nuevo que lo reemplaza y se actualiza el estado del anterior.

## Formato

```markdown
# NNNN. Título

- Estado: Propuesta | Aceptada | Reemplazada por NNNN | Descartada
- Fecha: AAAA-MM-DD

## Contexto
Situación y fuerzas que obligan a decidir.

## Decisión
Qué se decide, en forma afirmativa.

## Consecuencias
Resultados positivos, negativos y trabajo derivado.

## Alternativas consideradas
Opciones descartadas y motivo.
```

## Índice

| N.º | Título | Estado |
|---|---|---|
| [0001](0001-adopcion-sdd.md) | Adopción de SDD | Aceptada |
| [0002](0002-multi-tenant.md) | Arquitectura multi-tenant | Aceptada |
| [0003](0003-prevencion-solapamiento-reservas.md) | Prevención de solapamiento de reservas | Aceptada |
