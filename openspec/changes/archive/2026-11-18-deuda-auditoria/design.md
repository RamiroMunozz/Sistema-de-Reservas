# Diseño: deuda-auditoria

Copia en Engram: `sdd/deuda-auditoria/design`. Entradas: `proposal.md`, `exploration.md` y las delta specs `specs/canchas/spec.md` (CAN-015, CAN-010) y `specs/administracion/spec.md` (ADM-003). Verificado contra el código de `desarrollo` (2026-11-18): Zod 4.4.3, Prisma 5.22, Vitest 4.

## Enfoque técnico

Siete correcciones acotadas, sin cambios de esquema ni de base de datos:

- La validación de entrada se mantiene en los controladores mediante esquemas Zod definidos en los `*.dto.ts`, igual que `cancel` con `idReservaSchema`. Los servicios no cambian, salvo el tipado de `getMetrics`.
- Los dos auxiliares de validación que hoy son privados de `booking.dto.ts` (`uuidSchema` y `esFechaExistente`) pasan a un módulo compartido en `backend/src/core/validacion/`, para que `courts` y `admin` los reutilicen sin depender de `bookings`.
- El 400 lo produce el `errorHandler` existente a partir del `ZodError`; no se agrega ningún mapeo de errores (D2 de la propuesta).
- Las pruebas son HTTP (supertest contra `app`) con `prisma` simulado mediante `vi.mock("../src/core/config/prisma.js")`, igual que `backend/tests/validacionReservas.test.ts`. Ninguna requiere PostgreSQL.

## Decisiones de arquitectura

### Decisión 1: tipado de `getMetrics` por inferencia de Prisma y suma con `Prisma.Decimal`

**Elección:**

- Se eliminan la interfaz `BookingMetricItem` (`admin.service.ts:9-24`) y la conversión `as unknown as BookingMetricItem[]` (`:79`). Se usa directamente el resultado de `prisma.booking.findMany({ where, include: { court: { select: { name: true, sport: true } } } })`, cuyo tipo infiere Prisma (`totalPrice: Prisma.Decimal`, `status: BookingStatus`, `court: { name: string; sport: Sport }`).
- La recaudación se acumula con `Prisma.Decimal` y se convierte a `number` una sola vez al final:

```ts
import { Prisma } from "@prisma/client";

const totalRevenue = confirmedBookings
  .reduce((acc, b) => acc.plus(b.totalPrice), new Prisma.Decimal(0))
  .toNumber();
```

- El detalle conserva `price: b.totalPrice.toNumber()`, equivalente al `Number(b.totalPrice)` actual.

**Alternativas consideradas:**

- `Prisma.BookingGetPayload<{ include: { court: { select: { name: true; sport: true } } } }>` como tipo nombrado. Se descarta porque repite el `include` en dos lugares; la inferencia ya deriva el tipo de la consulta y `tsc` detecta cualquier cambio del `select`. Solo se justificaría si el tipo se exportara, y no se exporta.
- Reemplazar `any` por `Prisma.Decimal` en la interfaz y conservar la conversión. Se descarta porque la conversión forzada es parte de la deuda: oculta cualquier divergencia entre la interfaz y la consulta.
- Mantener la suma con `Number()`. Se descarta porque acumula error de coma flotante (por ejemplo, `0.10 + 0.20` da `0.30000000000000004`) sobre una columna `Decimal(10, 2)`.

**Justificación:** la forma JSON de la respuesta no cambia (`totalRevenueARS` y `price` siguen siendo `number`). Con importes enteros, el caso real en ARS, el resultado es idéntico al actual; solo desaparecen los artefactos de coma flotante con centavos. Esa diferencia es la que permite una prueba RED genuina (ver Estrategia de pruebas).

### Decisión 2: módulo compartido `backend/src/core/validacion/esquemas.ts`

**Elección:** se crea `backend/src/core/validacion/esquemas.ts`, que exporta `uuidSchema(campo)` y `esFechaExistente(fecha)`, movidos sin cambios desde `booking.dto.ts:8-18`. `booking.dto.ts` los importa y conserva sus esquemas (`fechaSchema`, `idReservaSchema`, etc.) y mensajes.

**Alternativas consideradas:**

- Exportar `esFechaExistente` y `uuidSchema` desde `booking.dto.ts`. Se descarta porque `admin` y `courts` pasarían a depender del módulo `bookings` solo por un auxiliar genérico. El único acoplamiento entre módulos que existe hoy es `payments → bookings/bloqueoCancha`, que es dominio, no utilería.
- Duplicar las funciones en cada módulo. Se descarta por D4 de la propuesta: se reutiliza, no se duplica.
- Mover también `fechaSchema`. Se descarta porque los mensajes de formato difieren por spec: reservas usa "La fecha debe tener el formato YYYY-MM-DD" y métricas usa "Formato YYYY-MM-DD" (ADM-003). Compartir el predicado y no el esquema conserva ambos contratos sin parametrizar mensajes.

**Justificación:** `backend/src/core/` ya aloja lo transversal (configuración, errores, middlewares). Un directorio `validacion/` sigue esa convención y deja la dependencia en la dirección `módulo → core`.

### Decisión 3: `idCanchaSchema` en `court.dto.ts`, usado por `courts` y `admin`

**Elección:**

```ts
// backend/src/modules/courts/court.dto.ts
import { uuidSchema } from "../../core/validacion/esquemas.js";

export const idCanchaSchema = z.object({
  id: uuidSchema("El ID de la cancha"),
});
```

- `court.controller.ts`, en `getById` y `getAvailability`, reemplaza `String(req.params.id)` por `const { id } = idCanchaSchema.parse(req.params);`. En `getAvailability`, el `id` se valida antes que la consulta (`date`).
- `admin.controller.ts`, en `updateCourt`, hace lo mismo antes de parsear el cuerpo, importando `idCanchaSchema` de `../courts/court.dto.js`.
- El `ZodError` llega al `errorHandler` por `next(error)` y produce el 400 de CAN-003: `detail` "Los datos enviados no cumplen con el formato requerido." y `errors: [{ field: "id", message: "El ID de la cancha debe ser un UUID válido" }]`.
- En `PATCH /admin/courts/:id`, `authenticate` y `requireRole(["ADMIN"])` corren como `router.use` antes del controlador (`admin.routes.ts:10-11`), así que un `USER` recibe 403 antes de validar el `id` (CAN-015).

**Alternativas consideradas:**

- Definir el esquema también en `admin.dto.ts`. Se descarta porque duplica la definición del identificador de cancha; el dueño del concepto "cancha" es el módulo `courts`.
- Un middleware genérico `validarParametros(schema)` en las rutas. Se descarta porque el proyecto valida en el controlador (`booking.controller.ts:58,101`) y un patrón nuevo para tres rutas no se justifica.
- Ponerlo en `core/validacion/`. Se descarta porque es un esquema de dominio, no un auxiliar genérico.

**Justificación:** sigue exactamente el patrón de `idReservaSchema`. La dependencia `admin → courts/court.dto` es coherente, porque `admin` administra canchas, y se limita a un esquema de entrada.

### Decisión 4: esquema base de cancha sin valores por defecto

**Elección:**

```ts
// backend/src/modules/admin/admin.dto.ts
const canchaBaseSchema = z.object({
  complexId: z.string().uuid("El complexId debe ser un UUID válido"),
  name: z.string().min(3, "El nombre debe tener al menos 3 caracteres"),
  sport: z.enum(["FUTBOL_5", "FUTBOL_7", "PADEL", "TENIS"]),
  surface: z.enum(["SINTETICO", "CEMENTO", "POLVO_LADRILLO", "PARQUET"]),
  pricePerSlot: z.number().positive("El precio debe ser un número positivo"),
  isIndoor: z.boolean(),
  isActive: z.boolean(),
});

export const createCourtSchema = canchaBaseSchema.extend({
  isIndoor: z.boolean().default(false),
  isActive: z.boolean().default(true),
});

export const updateCourtSchema = canchaBaseSchema.partial();
```

**Alternativas consideradas:**

- `createCourtSchema.partial()` (situación actual). En Zod 4, `.partial()` envuelve cada campo en `optional` pero conserva el `.default()` interno, así que una clave ausente produce el valor por defecto. Esa es la causa de la observación 8.
- Construir el esquema de modificación desenvolviendo los campos con `.unwrap()` o `removeDefault`. Se descarta porque es frágil frente a versiones de Zod y menos legible.
- Duplicar los siete campos en dos objetos. Se descarta por mantenimiento: las reglas de validación de CAN-009 deben ser las mismas en el alta y en la modificación (CAN-010).

**Justificación:** las reglas viven una sola vez en `canchaBaseSchema`, los valores por defecto solo en el alta y la modificación es un parcial puro: las claves omitidas no aparecen en la salida, así que `prisma.court.update({ data: dto })` (`admin.service.ts:58-61`) solo modifica los campos enviados. `CreateCourtDTO` conserva `isIndoor: boolean` e `isActive: boolean` como obligatorios en la salida; `UpdateCourtDTO` queda con todos los campos opcionales. `admin.service.ts` no cambia para este ítem.

### Decisión 5: fechas de métricas con el predicado compartido

**Elección:**

```ts
const fechaMetricaSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Formato YYYY-MM-DD")
  .refine(esFechaExistente, "La fecha no existe");

export const metricsQuerySchema = z.object({
  startDate: fechaMetricaSchema,
  endDate: fechaMetricaSchema,
});
```

**Alternativas consideradas:** reutilizar `fechaSchema` de reservas, que cambiaría el mensaje de formato que fija ADM-003; o validar en el servicio, lo que violaría la separación de capas y llegaría tarde.

**Justificación:** conserva el mensaje "Formato YYYY-MM-DD" y agrega la verificación de existencia. Nota de Zod 4: los checks no abortan por defecto, así que una entrada como `01/08/2026` produce dos issues sobre el mismo campo (formato y "La fecha no existe"), igual que `fechaSchema` en reservas hoy. ADM-003 exige que `errors` *contenga* el issue de formato, de modo que las pruebas usan `toContainEqual` y no la igualdad exacta. No se agrega `abort`, para mantener la coherencia con reservas.

### Decisión 6: Dockerfile y documentación operativa

**Elección:**

- `backend/DockerFile:8` pasa de `RUN npm run build || true` a `RUN npm run build`. El `CMD ["npm", "run", "dev"]` del runner queda fuera de alcance (A7).
- La rotación de `JWT_SECRET` se documenta como una sección nueva, "Rotación de `JWT_SECRET`", en `docs/operacion/variables-entorno.md`, porque ahí ya está documentada la variable (fila de `JWT_SECRET` y sección de Docker Compose, que la toma del `.env` de la raíz).
- `docs/operacion/despliegue.md` se actualiza en dos puntos: la línea 5 deja de mencionar `|| true` como deuda, y el tema "Gestión de secretos y rotación de `JWT_SECRET`" enlaza al procedimiento y conserva como pendiente solo la gestión de secretos en producción.

Contenido mínimo del procedimiento (sin valores reales ni comandos que lean `.env`):

1. Generar un secreto largo y aleatorio, por ejemplo con `node -e "console.log(require('node:crypto').randomBytes(64).toString('hex'))"`.
2. Reemplazar el valor en `backend/.env` (ejecución local) y en el `.env` de la raíz (Docker Compose), editándolos a mano.
3. Reiniciar el backend o el contenedor.
4. Impacto: todos los tokens emitidos se invalidan; las sesiones activas deben volver a iniciar sesión (tokens de 15 minutos, sin renovación). Hacerlo en un horario de baja actividad.
5. El valor anterior sigue en el historial de git; rotar lo vuelve inútil, pero no lo borra. No se vuelve nunca a un secreto anterior: ante un problema se genera otro nuevo.

**Alternativas consideradas:** colocar el procedimiento en `despliegue.md`, que se descarta porque ese documento está marcado como "Pendiente" y se rehace en el cambio `despliegue`; o crear un archivo propio, que se descarta porque el procedimiento tiene unas 20 líneas.

### Decisión 7: hoja de ruta

Se actualiza la fila 2 de `docs/producto/hoja-de-ruta.md` con el alcance real: tipado de métricas, `|| true`, rotación de `JWT_SECRET`, 400 con UUID mal formado en canchas, `PATCH` sin valores por defecto y fechas de métricas inexistentes. Se indica que el UTC de `AdminDashboard` y el registro del `userId` ya estaban resueltos, y que A3 se deriva a `politica-cobro` (fila 6) y a `reserva-invitado`.

## Flujo de datos

```
GET /courts/:id[/availability]          PATCH /admin/courts/:id
        │                                        │
        │                          authenticate → requireRole(ADMIN)  (403 antes)
        ▼                                        ▼
 CourtController                          AdminController.updateCourt
   idCanchaSchema.parse(req.params) ◄──────── idCanchaSchema.parse(req.params)
        │ ZodError ──► next ──► errorHandler ──► 400 { errors: [{ field: "id" }] }
        ▼ id válido                              ▼ updateCourtSchema.parse(body)  (sin defaults)
 CourtService (sin cambios)               AdminService.updateCourt → prisma.court.update({ data: solo campos enviados })

GET /admin/metrics?startDate&endDate
   metricsQuerySchema (regex + esFechaExistente) ── inválida ──► 400, sin consultar la base
        ▼
   AdminService.getMetrics → findMany (tipo inferido) → suma Decimal → toNumber()

core/validacion/esquemas.ts ──► bookings/booking.dto.ts, courts/court.dto.ts, admin/admin.dto.ts
```

## Cambios por archivo

| Archivo | Acción | Descripción | Líneas (±) |
|---|---|---|---|
| `backend/src/core/validacion/esquemas.ts` | Crear | `uuidSchema` y `esFechaExistente`, movidos desde `booking.dto.ts`. | ~16 |
| `backend/src/modules/bookings/booking.dto.ts` | Modificar | Quitar las dos definiciones locales e importarlas del módulo compartido. | ~14 |
| `backend/src/modules/courts/court.dto.ts` | Modificar | Agregar `idCanchaSchema`. | ~6 |
| `backend/src/modules/courts/court.controller.ts` | Modificar | `getById` y `getAvailability` validan `req.params` con `idCanchaSchema`. | ~6 |
| `backend/src/modules/admin/admin.controller.ts` | Modificar | `updateCourt` valida el `id` con `idCanchaSchema`. | ~4 |
| `backend/src/modules/admin/admin.dto.ts` | Modificar | `canchaBaseSchema`, `createCourtSchema` con valores por defecto, `updateCourtSchema` parcial sin valores por defecto, `fechaMetricaSchema`. | ~22 |
| `backend/src/modules/admin/admin.service.ts` | Modificar | Quitar la interfaz con `any` y la conversión; suma con `Prisma.Decimal`. | ~28 |
| `backend/DockerFile` | Modificar | Quitar `|| true`. | 2 |
| `docs/operacion/variables-entorno.md` | Modificar | Sección "Rotación de `JWT_SECRET`". | ~20 |
| `docs/operacion/despliegue.md` | Modificar | Quitar la mención a `|| true` y enlazar el procedimiento. | ~4 |
| `docs/producto/hoja-de-ruta.md` | Modificar | Texto de la fila 2. | 2 |
| `backend/tests/metricasAdmin.test.ts` | Crear | ADM-002 y ADM-003 (ítems 1 y 6). | ~110 |
| `backend/tests/validacionCanchas.test.ts` | Crear | CAN-015 y CAN-010 (ítems 4 y 5). | ~140 |

**Total estimado:** unas 125 líneas de código y documentación, más unas 250 de pruebas, es decir, unas 375 líneas (adiciones más eliminaciones). Queda bajo el presupuesto de 400, pero con poco margen; la estimación de la propuesta (250 a 300) subestimaba las pruebas. Para mantener el margen, las pruebas deben usar `it.each` en los casos repetitivos (fechas inválidas y las tres rutas con `id` mal formado).

## Interfaces y contratos

```ts
// backend/src/core/validacion/esquemas.ts
export const uuidSchema: (campo: string) => z.ZodString;
export const esFechaExistente: (fecha: string) => boolean;

// backend/src/modules/courts/court.dto.ts
export const idCanchaSchema: z.ZodObject<{ id: z.ZodString }>;

// backend/src/modules/admin/admin.dto.ts (tipos de salida)
type CreateCourtDTO = { complexId: string; name: string; sport: Sport; surface: Surface;
                        pricePerSlot: number; isIndoor: boolean; isActive: boolean };
type UpdateCourtDTO = Partial<CreateCourtDTO>; // sin valores por defecto: las claves omitidas no existen
```

Respuesta 400 (sin cambios, la produce `errorHandler`):

```json
{ "status": 400, "detail": "Los datos enviados no cumplen con el formato requerido.",
  "errors": [{ "field": "id", "message": "El ID de la cancha debe ser un UUID válido" }] }
```

La respuesta de `GET /admin/metrics` mantiene su forma (`period`, `summary` y `details`, con importes `number`).

## Estrategia de pruebas

TDD estricto en el backend (`cd backend && npm test`; tipos con `npx tsc --noEmit`). Patrón: `vi.hoisted` para las funciones simuladas, `vi.mock("../src/core/config/prisma.js", ...)`, `await import("../src/app.js")` después del mock, `vi.stubEnv("JWT_SECRET", ...)` y un token firmado con `jwt.sign` y rol `ADMIN` o `USER`.

| Prueba | Archivo | RED esperado (antes del cambio) |
|---|---|---|
| Ítem 1, ADM-002: `findMany` simulado con reservas `CONFIRMED`, `CANCELLED` y `PENDING`, con `totalPrice` como `new Prisma.Decimal("0.10")` y `"0.20"`. Verifica `summary` (contadores y `totalRevenueARS` igual a `0.3`) y `details` (`court`, `sport`, `status`, `price` numérico). | `backend/tests/metricasAdmin.test.ts` | `totalRevenueARS` da `0.30000000000000004` con la suma por `Number`. El resto del detalle actúa como prueba de caracterización: pasa antes y después. El quite del `any` y de la conversión se verifica con `tsc --noEmit` y con una búsqueda de `any` y `as unknown as` en `backend/src`. |
| Ítem 6, ADM-003: `it.each` con `2026-02-31`, `2026-13-01` (en `endDate`), `2026-02-32` y `2026-02-29`, que responden 400 con el campo esperado y sin llamar a `findMany`. Formato `01/08/2026`, que responde 400 y `errors` contiene `{ field: "startDate", message: "Formato YYYY-MM-DD" }`. `2028-02-29` y `2026-08-01..31` responden 200; un rango invertido responde 200 con contadores en cero. | `backend/tests/metricasAdmin.test.ts` | `2026-02-31` y `2026-02-29` responden 200 (desborde); `2026-13-01` y `2026-02-32` llegan a `findMany`. |
| Ítem 4, CAN-015: `it.each` sobre `GET /courts/abc`, `GET /courts/abc/availability?date=2026-12-01` y `PATCH /admin/courts/abc` (con `ADMIN`) responde 400, `errors` contiene el campo `id` y `court.findUnique` no se llama. `PATCH` con `USER` y `id` `abc` responde 403. Un UUID inexistente en `GET /courts/:id` responde 404 (regresión). | `backend/tests/validacionCanchas.test.ts` | Hoy el `id` mal formado llega a `findUnique`; el simulado devuelve `undefined`, así que se observa 404 y una llamada a `findUnique`, no 400. La aserción "no se consulta la base" falla. |
| Ítem 5, CAN-010: cancha simulada con `isActive: false` e `isIndoor: true`; `PATCH { name }` hace que `court.update` reciba `data` igual a `{ name: "Cancha Central" }`. Un cuerpo `{}` produce `data` igual a `{}`. `{ isActive: true, isIndoor: true }` y `{ isIndoor: false }` se envían tal cual. `{ pricePerSlot: 0 }` responde 400 con el campo `pricePerSlot`. | `backend/tests/validacionCanchas.test.ts` | `data` contiene `isIndoor: false` e `isActive: true` agregados por el `.default()`. |
| Regresión de reservas tras mover los auxiliares. | `backend/tests/validacionReservas.test.ts` (sin cambios) | Debe seguir en verde: es la red de seguridad del REFACTOR de la Decisión 2. |

El simulado de `prisma` de cada archivo nuevo expone solo lo que usan las rutas: `booking.findMany` en métricas, y `court.findUnique` y `court.update` en canchas. `getAvailability` con un `id` válido no forma parte de las pruebas. No hay pruebas E2E ni de integración con base de datos. El Dockerfile y la documentación no tienen pruebas automatizadas: el Dockerfile se verifica con `npx tsc -p .` limpio y, cuando haya Docker, con `docker build`.

Orden sugerido para TDD: primero la Decisión 2 (mover los auxiliares, con `validacionReservas` en verde) y después los ítems 6, 4, 5 y 1. Los ítems 2, 3 y 7 no tienen código probado.

## Matriz de amenazas

No aplica: el cambio no toca enrutamiento de procesos, comandos de shell, subprocesos, automatización de VCS o PR, clasificación de ejecutables ni integración de procesos. Las rutas HTTP solo endurecen la validación de entrada. El cambio en el Dockerfile hace el build más estricto y no agrega comandos.

## Migración y despliegue

No requiere migración: no hay cambios en `schema.prisma` ni en la base. La rotación de `JWT_SECRET` es una acción manual posterior que ejecuta el usuario. Para revertir, se hace `git revert` del commit de cada unidad.

## Preguntas abiertas

- Ninguna bloqueante.
- A validar en la implementación: que la suma con `Prisma.Decimal` y `toNumber()` se acepte como "sin cambio de comportamiento observable". Solo difiere del comportamiento actual en los artefactos de coma flotante con centavos. Si se prefiere una paridad estricta, se conserva `Number()` y el ítem 1 queda cubierto solo por caracterización y `tsc`, sin RED.
