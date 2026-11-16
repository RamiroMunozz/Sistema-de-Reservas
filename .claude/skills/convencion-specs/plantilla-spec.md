# Spec: <dominio>

## Propósito

<Una o dos frases sobre qué cubre este dominio.>

## Requisitos

### RES-001: <título corto del requisito>

El sistema DEBE <comportamiento verificable>.

#### Escenario: <caso normal>
- Dado <contexto>
- Cuando <acción>
- Entonces <resultado observable>

#### Escenario: <caso de error o borde>
- Dado <contexto>
- Cuando <acción>
- Entonces <resultado observable>

### RES-002: <título>

El sistema NO DEBE <comportamiento prohibido>.

#### Escenario: <nombre>
- Dado <contexto>
- Cuando <acción>
- Entonces <resultado>

## Fuera de alcance

- <Lo que esta spec no cubre.>

## Observaciones

<Solo en specs base: brechas o inconsistencias detectadas. Sin inventar comportamiento.>

## Evidencia

<Solo en specs base: `archivo:línea` que respalda cada requisito.>

---

# Plantilla de delta spec (`openspec/changes/<cambio>/specs/<dominio>/spec.md`)

## AGREGADO

### NEG-001: <título>
El sistema DEBE <...>.
#### Escenario: <nombre>
- Dado / Cuando / Entonces

## MODIFICADO

### RES-003: <título>
<Texto completo nuevo del requisito, con sus escenarios.>
Motivo: <por qué cambia.>

## ELIMINADO

### RES-004
Motivo: <por qué se retira.>
