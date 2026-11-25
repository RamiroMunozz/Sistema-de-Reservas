# Spec: negocios

Capacidad nueva del cambio `multi-tenant-negocios`. Se promueve a `openspec/specs/negocios/spec.md` al archivar. Todos los requisitos son nuevos (prefijo `NEG`).

## Propósito

Define el negocio como unidad de aislamiento de la plataforma: su modelo (`nombre`, `slug`, `activo`), el formato del slug y los slugs reservados, la resolución pública por slug con 404 genérico, la consulta pública `GET /negocios/:slug`, el alta de un negocio y su dueño por `SUPER_ADMIN`, la regla de un solo dueño por negocio, la regla general de aislamiento entre negocios y la migración de los datos existentes al negocio `principal`. La marca, la página pública personalizada y la gestión del negocio (editar, suspender, reactivar, cambiar de dueño) quedan fuera de este cambio.

## Requisitos

### NEG-001: Modelo del negocio

El sistema DEBE persistir cada negocio con un identificador, un `nombre`, un `slug` único y un indicador `activo` (por defecto verdadero). Un negocio DEBE tener uno o varios complejos (relación 1:N); cada complejo DEBE pertenecer a exactamente un negocio y NO DEBE existir un complejo sin negocio. Las canchas pertenecen al negocio de su complejo, y cada reserva pertenece al negocio de su cancha (RES-036). Todo dato de negocio pertenece a un negocio.

#### Escenario: Negocio nuevo activo por defecto
- Dado un alta de negocio sin indicar `activo`
- Cuando se persiste
- Entonces el negocio queda con `activo` verdadero

#### Escenario: Complejo sin negocio
- Dado un alta directa en la base de un complejo sin negocio
- Cuando se inserta
- Entonces la base lo rechaza

#### Escenario: Varios complejos en un negocio
- Dado un negocio con dos complejos
- Cuando se consultan los complejos del negocio
- Entonces ambos pertenecen a ese negocio y a ningún otro

### NEG-002: Formato del slug

El sistema DEBE aceptar como `slug` solo cadenas de 3 a 40 caracteres formadas por letras minúsculas sin acentos (`a-z`), dígitos y guiones medios, que no empiecen ni terminen con guion y no contengan guiones consecutivos. DEBE rechazar con 400 y la lista `errors` (campo `slug`) cualquier otro valor, sin crear el negocio.

#### Escenario: Slug válido
- Dado el slug `cancha-norte-2`
- Cuando se crea un negocio con ese slug
- Entonces el slug se acepta

#### Escenario: Mayúsculas o caracteres no permitidos
- Dado el slug `Cancha Norte` o `canchá_norte`
- Cuando se crea un negocio con ese slug
- Entonces responde 400 con `errors` que indica el campo `slug` y no se crea el negocio

#### Escenario: Slug demasiado corto o largo
- Dado un slug de 2 caracteres o de 41 caracteres
- Cuando se crea un negocio con ese slug
- Entonces responde 400 con `errors` que indica el campo `slug`

#### Escenario: Guion al inicio, al final o repetido
- Dado el slug `-norte`, `norte-` o `cancha--norte`
- Cuando se crea un negocio con ese slug
- Entonces responde 400 con `errors` que indica el campo `slug`

### NEG-003: Slugs reservados

El sistema NO DEBE permitir un negocio cuyo `slug` coincida con una ruta propia de la aplicación. La lista de slugs reservados DEBE incluir como mínimo `login`, `reserva`, `mis-reservas`, `admin` y `api`. Un slug reservado DEBE rechazarse con 400 y la lista `errors` (campo `slug`), sin crear el negocio. El slug `principal` NO es reservado.

#### Escenario: Slug reservado
- Dado el slug `admin`
- Cuando un `SUPER_ADMIN` crea un negocio con ese slug
- Entonces responde 400 con `errors` que indica el campo `slug` y no se crea el negocio ni su dueño

#### Escenario: Cada ruta del frontend está reservada
- Dados los slugs `login`, `reserva`, `mis-reservas` y `api`
- Cuando se intenta crear un negocio con cada uno
- Entonces los cuatro se rechazan con 400

### NEG-004: Unicidad del slug

El sistema DEBE garantizar que dos negocios no compartan el mismo `slug`, también en la base de datos. Ante un slug ya usado, el alta DEBE responder 409 sin crear el negocio ni su dueño.

#### Escenario: Slug repetido
- Dado un negocio con slug `principal`
- Cuando un `SUPER_ADMIN` crea otro negocio con slug `principal`
- Entonces responde 409 y no se crea el negocio ni su dueño

#### Escenario: Unicidad en la base
- Dado un negocio con slug `principal`
- Cuando se intenta insertar directamente en la base otro negocio con ese slug
- Entonces la base lo rechaza

### NEG-005: Resolución del negocio por slug y 404 genérico

El sistema DEBE resolver el negocio de las operaciones públicas que lo reciben por slug (consulta del negocio, catálogo de canchas, disponibilidad y creación de la reserva de invitado) buscando el negocio por su `slug`. Si el slug no corresponde a ningún negocio o el negocio tiene `activo` en falso, DEBE responder 404 con el mismo mensaje genérico "Negocio no encontrado" en ambos casos, sin distinguir el motivo y sin ejecutar la operación pedida.

#### Escenario: Slug de un negocio activo
- Dado un negocio activo con slug `principal`
- Cuando se llama a una operación pública con ese slug
- Entonces la operación se procesa dentro de ese negocio

#### Escenario: Slug inexistente
- Dado un slug que no corresponde a ningún negocio
- Cuando se llama a cualquier operación pública por slug
- Entonces responde 404 con "Negocio no encontrado"

#### Escenario: Negocio inactivo
- Dado un negocio con `activo` en falso
- Cuando se llama a cualquier operación pública con su slug
- Entonces responde 404 con el mismo mensaje y el mismo cuerpo que para un slug inexistente

#### Escenario: Reserva de invitado en un negocio inactivo
- Dado un negocio inactivo y una cancha suya
- Cuando un visitante intenta crear una reserva de invitado con el slug de ese negocio
- Entonces responde 404 "Negocio no encontrado" y no se crea la reserva

### NEG-006: Consulta pública del negocio

El sistema DEBE devolver con `GET /api/v1/negocios/:slug` (sin autenticación) el `nombre` y el `slug` del negocio activo, y NO DEBE exponer su identificador interno, `activo`, los datos del dueño ni ninguna reserva. Para un slug inexistente o un negocio inactivo se rige por NEG-005.

#### Escenario: Negocio activo
- Dado un negocio activo `Negocio principal` con slug `principal`
- Cuando se llama a `GET /api/v1/negocios/principal` sin token
- Entonces responde 200 con `nombre` "Negocio principal" y `slug` "principal", y sin datos del dueño

#### Escenario: Sin autenticación
- Dado un cliente sin cabecera `Authorization`
- Cuando llama a `GET /api/v1/negocios/principal`
- Entonces no responde 401

#### Escenario: Slug inexistente
- Dado un slug inexistente
- Cuando se llama a `GET /api/v1/negocios/<slug>`
- Entonces responde 404 "Negocio no encontrado"

### NEG-007: Alta de un negocio y su dueño por SUPER_ADMIN

El sistema DEBE permitir a un `SUPER_ADMIN` crear, en una sola operación, un negocio y la cuenta de su dueño. La operación DEBE recibir el `nombre` del negocio (tras recortar espacios, de 2 a 150 caracteres), su `slug` (NEG-002, NEG-003 y NEG-004) y los datos del dueño (correo, contraseña, `firstName`, `lastName` y `phone` opcional, con las reglas de validación y normalización de AUT-002). DEBE crear el negocio activo y la cuenta del dueño con rol `DUENO` vinculada a ese negocio, almacenando la contraseña según AUT-003, y responder 201 con el negocio y el dueño sin `passwordHash`. La operación DEBE ser atómica: si falla cualquier parte (validación, slug repetido o reservado, correo ya registrado), NO DEBE quedar creado ni el negocio ni el dueño. Un correo ya registrado DEBE responder 409 con el detalle de AUT-001. Solo el alta existe en este cambio: NO DEBE haber operaciones para editar, renombrar, suspender, reactivar o eliminar un negocio, ni para cambiar su dueño.

#### Escenario: Alta correcta
- Dado un `SUPER_ADMIN` autenticado, un slug válido y libre y un correo no registrado
- Cuando crea el negocio con los datos del dueño
- Entonces responde 201 con el negocio activo y el dueño con rol `DUENO` vinculado a ese negocio, sin `passwordHash`, y el dueño puede iniciar sesión

#### Escenario: Correo ya registrado
- Dado un correo ya usado por otra cuenta
- Cuando el `SUPER_ADMIN` crea un negocio con ese correo como dueño
- Entonces responde 409 y no se crea el negocio

#### Escenario: Datos del dueño inválidos
- Dada una contraseña débil o un nombre del negocio vacío
- Cuando se envía el alta
- Entonces responde 400 con la lista `errors` y no se crea el negocio ni el dueño

#### Escenario: Slug repetido o reservado
- Dado un slug ya usado, o reservado
- Cuando se envía el alta
- Entonces responde 409 (repetido) o 400 (reservado) y no se crea el negocio ni el dueño

#### Escenario: Sin rol de plataforma
- Dado un token con rol `DUENO` o `JUGADOR`
- Cuando llama a la operación de alta
- Entonces responde 403 con "No tienes los permisos necesarios para realizar esta acción" y no se crea nada

#### Escenario: Sin token
- Dado un pedido sin token
- Cuando llama a la operación de alta
- Entonces responde 401

#### Escenario: Sin operaciones de edición
- Dado un negocio existente
- Cuando un `SUPER_ADMIN` intenta editarlo, suspenderlo o cambiar su dueño
- Entonces no existe ninguna operación para hacerlo

### NEG-008: Alcance del SUPER_ADMIN

El sistema NO DEBE permitir al `SUPER_ADMIN` leer ni modificar canchas, reservas, pagos ni métricas de ningún negocio: las rutas de administración del negocio (`/api/v1/admin/*`, `/api/v1/bookings/admin/*` y el reembolso de pagos) DEBEN responder 403 a un `SUPER_ADMIN`. Su única operación en este cambio es el alta de NEG-007.

#### Escenario: SUPER_ADMIN en el panel de un negocio
- Dado un token con rol `SUPER_ADMIN`
- Cuando llama a `GET /api/v1/admin/metrics` o a `GET /api/v1/bookings/admin/all`
- Entonces responde 403 con "No tienes los permisos necesarios para realizar esta acción"

#### Escenario: SUPER_ADMIN y reembolso
- Dado un token con rol `SUPER_ADMIN` y un pago existente
- Cuando solicita su reembolso
- Entonces responde 403 y no se llama a Mercado Pago

### NEG-009: Un solo dueño por negocio

El sistema DEBE garantizar, también en la base de datos, que cada negocio tenga a lo sumo una cuenta con rol `DUENO`. Un segundo dueño para el mismo negocio DEBE rechazarse. Las cuentas `JUGADOR` y `SUPER_ADMIN` NO pertenecen a ningún negocio.

#### Escenario: Segundo dueño rechazado por la base
- Dado un negocio con su dueño
- Cuando se intenta insertar directamente en la base otra cuenta `DUENO` vinculada al mismo negocio
- Entonces la base lo rechaza

#### Escenario: Un dueño por cada negocio
- Dados dos negocios
- Cuando cada uno tiene su propia cuenta `DUENO`
- Entonces la base acepta ambas

#### Escenario: Jugador y SUPER_ADMIN sin negocio
- Dada una cuenta `JUGADOR` o `SUPER_ADMIN`
- Cuando se consulta su negocio
- Entonces no tiene ninguno

### NEG-010: Regla general de aislamiento entre negocios

El sistema DEBE filtrar siempre por negocio las operaciones del dueño y las públicas por slug, y NO DEBE confiar en un identificador enviado por el cliente (de complejo, cancha, reserva o pago) sin verificar que pertenece al negocio de la operación. Un recurso de otro negocio DEBE tratarse como inexistente: la respuesta, el mensaje y el código DEBEN ser los mismos que ante un identificador que no existe en esa operación (404 con el mensaje de "no existe" propio de la operación; en la creación de reservas, donde una cancha inexistente responde 400 "La cancha no existe.", ese mismo 400), sin revelar que el recurso existe en otro negocio. Los listados, la agenda, las métricas y los totales DEBEN incluir solo datos del negocio propio. El barrido de reservas vencidas (RES-027) es una operación de plataforma y no se filtra por negocio. La cuenta de jugador es global (RES-010).

#### Escenario: Recurso de otro negocio
- Dados dos negocios A y B y un recurso del negocio B
- Cuando el dueño del negocio A lo pide por su identificador
- Entonces la respuesta es idéntica a la de un identificador inexistente y no se modifica nada

#### Escenario: Listados sin datos ajenos
- Dados dos negocios con reservas
- Cuando el dueño del negocio A consulta un listado, la agenda o las métricas
- Entonces el resultado no contiene datos del negocio B

#### Escenario: Barrido de plataforma
- Dadas reservas `PENDING` vencidas en dos negocios
- Cuando corre el barrido de vencidas
- Entonces pasan a `EXPIRED` las de ambos negocios

### NEG-011: Negocio principal y migración de los datos existentes

El sistema DEBE, al aplicar la migración de este cambio, crear el negocio "Negocio principal" con slug `principal` y `activo` verdadero, asignarle todos los complejos y reservas existentes y vincular a él la cuenta `ADMIN` existente, que pasa a rol `DUENO`; las cuentas `USER` pasan a rol `JUGADOR`. Tras la migración el sistema DEBE comportarse, para ese negocio, igual que antes: las canchas, las reservas, los pagos, la seña de cada complejo y las cuentas de jugador se conservan sin pérdida, la restricción `bookings_sin_solapamiento` sigue vigente y el dueño anterior sigue accediendo a su panel con sus credenciales.

#### Escenario: Datos existentes asignados
- Dada una base con complejos, canchas, reservas y una cuenta `ADMIN` previas a la migración
- Cuando se aplica la migración
- Entonces existe el negocio con slug `principal`, todos los complejos y reservas previos le pertenecen y la cuenta `ADMIN` queda como su `DUENO`

#### Escenario: Cuentas de jugador
- Dadas cuentas con rol `USER` previas a la migración
- Cuando se aplica la migración
- Entonces conservan sus reservas y pasan a rol `JUGADOR`

#### Escenario: Comportamiento preservado
- Dada la migración aplicada y un único negocio `principal`
- Cuando se reserva, se paga, se cancela y se consulta el panel
- Entonces el comportamiento es el previo al cambio

#### Escenario: Sin solapamiento
- Dada la migración aplicada
- Cuando se insertan dos reservas activas solapadas en la misma cancha
- Entonces la base rechaza la segunda (RES-009)

### NEG-012: Datos iniciales de la semilla

La semilla DEBE crear el negocio `principal`, su cuenta de dueño con rol `DUENO` vinculada a él, una cuenta `JUGADOR` y la primera cuenta `SUPER_ADMIN`, además del complejo, las canchas y los horarios de ese negocio.

#### Escenario: Semilla completa
- Dada una base vacía con las migraciones aplicadas
- Cuando se ejecuta la semilla
- Entonces existen el negocio `principal` con su dueño, un jugador y un `SUPER_ADMIN`, y el complejo con sus canchas pertenece al negocio `principal`

## Fuera de alcance

- Editar, renombrar, suspender o reactivar un negocio, gestionar `activo` y cambiar de dueño; interfaz de plataforma (`panel-super-admin`, N.º 9).
- Marca, página pública y personalización por negocio (`pagina-publica-negocio`, N.º 8).
- Credenciales de Mercado Pago por negocio (`mercadopago-por-negocio`, N.º 6) y política de cobro por negocio (`politica-cobro`, N.º 7): siguen globales.
- Prefijo telefónico `549` configurable (deuda conocida).
- Empleados u otros roles por negocio; cobro de la plataforma a los negocios.
- Seguridad a nivel de fila (RLS) de PostgreSQL y claves foráneas compuestas.
