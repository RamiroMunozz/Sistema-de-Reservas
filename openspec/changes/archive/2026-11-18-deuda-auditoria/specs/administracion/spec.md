# Delta spec: administracion (cambio `deuda-auditoria`)

Resuelve la observación 9 de `administracion`. La observación 8 (tipado `any` y conversión forzada en `getMetrics`) no tiene comportamiento observable: es una cuestión de diseño y calidad, y por eso no genera requisito. Al archivar el cambio, esta delta se fusiona en `openspec/specs/administracion/spec.md`.

## MODIFICADO

### ADM-003: Validación de las fechas de métricas

El sistema DEBE aceptar `startDate` y `endDate` solo con el formato `YYYY-MM-DD` (cuatro dígitos, guion, dos dígitos, guion, dos dígitos) y con una fecha de calendario que exista (incluido el 29 de febrero solo en años bisiestos). DEBE responder 400 con el `detail` "Los datos enviados no cumplen con el formato requerido." y la lista `errors` con el campo inválido (`startDate` o `endDate`) si el valor no cumple el formato o corresponde a una fecha que no existe. Para el formato incorrecto el mensaje del campo es "Formato YYYY-MM-DD". NO DEBE desbordar una fecha inexistente al mes siguiente ni dejar que llegue a la consulta de la base de datos (no debe haber respuesta 500). La validación NO verifica que `startDate` sea anterior o igual a `endDate`.

Motivo: una fecha con formato válido pero inexistente (`2026-02-31`) se desbordaba en silencio al mes siguiente y las métricas usaban otro rango sin avisar, y una con mes o día fuera de rango (`2026-13-01`) producía `Invalid Date` (observación 9).

#### Escenario: Formato inválido
- Dado un `ADMIN` autenticado
- Cuando envía `startDate=01/08/2026&endDate=2026-08-31`
- Entonces responde 400 con `errors` que contiene `field` `startDate` y `message` "Formato YYYY-MM-DD"

#### Escenario: Día inexistente del mes
- Dado un `ADMIN` autenticado
- Cuando envía `startDate=2026-02-31&endDate=2026-03-31`
- Entonces responde 400 con `errors` que contiene el campo `startDate`, y no se consulta la base de datos

#### Escenario: Mes inexistente
- Dado un `ADMIN` autenticado
- Cuando envía `startDate=2026-08-01&endDate=2026-13-01`
- Entonces responde 400 con `errors` que contiene el campo `endDate`, y no se consulta la base de datos

#### Escenario: Día mayor que 31
- Dado un `ADMIN` autenticado
- Cuando envía `startDate=2026-02-32&endDate=2026-03-31`
- Entonces responde 400 con `errors` que contiene el campo `startDate`

#### Escenario: 29 de febrero en año no bisiesto
- Dado un `ADMIN` autenticado
- Cuando envía `startDate=2026-02-29&endDate=2026-03-31`
- Entonces responde 400 con `errors` que contiene el campo `startDate`

#### Escenario: 29 de febrero en año bisiesto
- Dado un `ADMIN` autenticado
- Cuando envía `startDate=2028-02-29&endDate=2028-03-31`
- Entonces la validación lo acepta y responde 200 con `period.from` "2028-02-29"

#### Escenario: Período válido con fechas límite del mes
- Dado un `ADMIN` autenticado
- Cuando envía `startDate=2026-08-01&endDate=2026-08-31`
- Entonces responde 200 con `period`, `summary` y `details` (ADM-002)

#### Escenario: Rango invertido
- Dado un `ADMIN` autenticado
- Cuando envía `startDate=2026-08-31&endDate=2026-08-01`
- Entonces la validación lo acepta y el período, que no puede contener reservas, produce un resumen con todos los contadores en cero
