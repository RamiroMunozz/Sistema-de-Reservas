# Delta spec: autenticacion (cambio `multi-tenant-negocios`)

Introduce los roles `SUPER_ADMIN`, `DUENO` y `JUGADOR` (renombres `USER` → `JUGADOR` y `ADMIN` → `DUENO`). Al archivar el cambio, esta delta se fusiona en `openspec/specs/autenticacion/spec.md`.

Regla de nomenclatura para el resto de la spec: en los requisitos y escenarios de `autenticacion` no modificados abajo, `USER` se lee `JUGADOR` y `ADMIN` se lee `DUENO` (ver AUT-015).

## AGREGADO

### AUT-015: Roles del sistema y vínculo con el negocio

El sistema DEBE reconocer exactamente tres roles: `SUPER_ADMIN` (plataforma), `DUENO` (dueño de un negocio) y `JUGADOR` (cuenta global de jugador). Los valores anteriores `USER` y `ADMIN` DEJAN de existir: `USER` pasa a `JUGADOR` y `ADMIN` pasa a `DUENO`, en la base, en los tokens emitidos, en las respuestas y en las rutas protegidas. Una cuenta `DUENO` DEBE estar vinculada a exactamente un negocio (NEG-009); `JUGADOR` y `SUPER_ADMIN` no tienen negocio. Toda operación del dueño DEBE actuar sobre el negocio de su cuenta, sin aceptar un negocio enviado por el cliente. Las menciones de `USER` y `ADMIN` que permanezcan en las demás specs vigentes se leen como `JUGADOR` y `DUENO`.

Motivo: ADR 0002 y decisión D3 del cambio.

#### Escenario: Roles disponibles
- Dado el sistema tras el cambio
- Cuando se consultan los roles de las cuentas existentes
- Entonces solo hay cuentas con rol `SUPER_ADMIN`, `DUENO` o `JUGADOR`

#### Escenario: Dueño con su negocio
- Dada una cuenta `DUENO`
- Cuando opera sobre el panel
- Entonces actúa solo sobre el negocio al que está vinculada, sin importar valores de negocio enviados en la petición

#### Escenario: Renombre de los roles previos
- Dadas cuentas con rol `USER` y `ADMIN` previas al cambio
- Cuando se aplica la migración
- Entonces las primeras quedan como `JUGADOR` y las segundas como `DUENO` (NEG-011)

## MODIFICADO

### AUT-001: Registro de usuario

El sistema DEBE permitir registrar un usuario con `POST /api/v1/auth/register` y cuerpo `{ email, password, firstName, lastName, phone? }`, y DEBE responder 201 con `{ user: { id, email, firstName, lastName, role, createdAt }, accessToken }`. El usuario creado recibe siempre el rol `JUGADOR`: el registro NO DEBE crear cuentas `DUENO` ni `SUPER_ADMIN`, y el cuerpo NO DEBE poder fijar el rol ni el negocio.

Motivo: el rol por defecto pasa de `USER` a `JUGADOR` (AUT-015).
(Previously: el usuario creado recibía el rol por defecto `USER`.)

#### Escenario: Registro exitoso

- Dado un correo que no está registrado y datos válidos
- Cuando se envía el registro
- Entonces responde 201 con el usuario (sin `passwordHash`) y un `accessToken`, y el rol es `JUGADOR`

#### Escenario: Correo ya registrado

- Dado un usuario existente con el mismo correo
- Cuando se envía el registro con ese correo
- Entonces responde 409 con detalle "El correo electrónico ya se encuentra en uso" y no se crea otro usuario

#### Escenario: Intento de fijar el rol

- Dado un cuerpo de registro válido con un campo `role` igual a `DUENO` o `SUPER_ADMIN`
- Cuando se envía el registro
- Entonces el usuario creado tiene rol `JUGADOR` y ningún negocio

### AUT-006: Contenido y vigencia del token de acceso

El sistema DEBE emitir el `accessToken` como JWT firmado con HS256 con el secreto de `JWT_SECRET`, con una carga que contiene como mínimo `userId` y `role` (uno de `SUPER_ADMIN`, `DUENO` o `JUGADOR`) y vigencia de 15 minutos. No se emite refresh token.

Motivo: la carga usa los roles nuevos (AUT-015). La forma en que se conoce el negocio del dueño en cada solicitud la define el diseño.
(Previously: la carga era `{ userId, role }` con `role` igual a `USER` o `ADMIN`.)

#### Escenario: Token emitido

- Dado un registro o inicio de sesión exitoso
- Cuando se decodifica el `accessToken`
- Entonces el encabezado indica `HS256` y la carga contiene `userId` y `role`

#### Escenario: Rol del token

- Dados un jugador, un dueño y un `SUPER_ADMIN` que inician sesión
- Cuando se decodifican sus `accessToken`
- Entonces sus `role` son `JUGADOR`, `DUENO` y `SUPER_ADMIN` respectivamente

### AUT-009: Control de acceso por rol

El sistema DEBE permitir el acceso a las rutas restringidas solo a los roles permitidos, y DEBE responder 403 con "No tienes los permisos necesarios para realizar esta acción" a un usuario autenticado con otro rol. Si no hay usuario en la petición, DEBE responder 401 con "Usuario no autenticado". Todas las rutas bajo `/api/v1/admin` exigen el rol `DUENO`. Las operaciones de plataforma (alta de negocio, NEG-007) exigen el rol `SUPER_ADMIN`. Un token cuyo rol sea un valor anterior (`USER` o `ADMIN`) NO DEBE conceder acceso a ninguna ruta restringida por rol.

Motivo: control de acceso con los roles nuevos (AUT-015).
(Previously: los roles eran `USER` y `ADMIN`, y las rutas de `/api/v1/admin` exigían `ADMIN`.)

#### Escenario: Usuario sin rol suficiente

- Dado un token con rol `JUGADOR`
- Cuando llama a una ruta de `/api/v1/admin`
- Entonces responde 403

#### Escenario: Dueño

- Dado un token con rol `DUENO`
- Cuando llama a `GET /api/v1/admin/metrics` con fechas válidas
- Entonces responde 200

#### Escenario: SUPER_ADMIN en rutas de dueño

- Dado un token con rol `SUPER_ADMIN`
- Cuando llama a una ruta de `/api/v1/admin`
- Entonces responde 403

#### Escenario: Dueño en rutas de plataforma

- Dado un token con rol `DUENO`
- Cuando llama a la operación de alta de negocio
- Entonces responde 403

#### Escenario: Sin token en ruta de administración

- Dado un pedido sin token
- Cuando llama a una ruta de `/api/v1/admin`
- Entonces responde 401

#### Escenario: Token con rol anterior

- Dado un token válido con rol `ADMIN` emitido antes del cambio
- Cuando llama a una ruta de `/api/v1/admin`
- Entonces responde 403 y el usuario debe iniciar sesión de nuevo para obtener un token con el rol `DUENO`

### AUT-012: Sesión en el cliente

El frontend DEBE guardar el `accessToken` y el `user` en `localStorage` (`token` y `user`) al iniciar sesión, restaurarlos al cargar la aplicación y borrarlos al cerrar sesión. Si la restauración falla, o el rol guardado no es uno de los vigentes (`SUPER_ADMIN`, `DUENO` o `JUGADOR`), DEBE limpiar ambas claves y quedar sin sesión. El estado `isAuthenticated` depende únicamente de la presencia del token.

Motivo: una sesión guardada antes del cambio con rol `USER` o `ADMIN` no es válida (AUT-015).
(Previously: solo se limpiaba la sesión si la restauración fallaba.)

#### Escenario: Inicio de sesión

- Dado un usuario en `/login` con credenciales válidas
- Cuando envía el formulario
- Entonces se guardan token y usuario, y navega a `/`

#### Escenario: Credenciales inválidas

- Dado un usuario en `/login`
- Cuando el servidor responde con error
- Entonces el formulario muestra `detail` de la respuesta o, si falta, "Error al iniciar sesión. Verifique sus credenciales."

#### Escenario: Fallo de red

- Dado un error que no es de Axios
- Cuando falla el inicio de sesión
- Entonces muestra "Ocurrió un error inesperado al conectar con el servidor."

#### Escenario: Sesión guardada con un rol anterior

- Dado un `localStorage` con un `user` cuyo `role` es `ADMIN` o `USER`
- Cuando se carga la aplicación
- Entonces se limpian `token` y `user` y no hay sesión

### AUT-014: Rutas protegidas en el frontend

El frontend DEBE redirigir a `/login` (conservando la ubicación de origen) a quien no tenga sesión en las rutas envueltas por `ProtectedRoute`, y DEBE redirigir a `/` a quien no tenga el rol requerido. `/mis-reservas` exige sesión y `/admin` exige el rol `DUENO`. La comparación del rol no distingue mayúsculas.

Motivo: el rol de `/admin` pasa de `ADMIN` a `DUENO` (AUT-015).
(Previously: `/admin` exigía el rol `ADMIN`.)

#### Escenario: Sin sesión

- Dado un visitante sin sesión
- Cuando abre `/mis-reservas`
- Entonces es redirigido a `/login`

#### Escenario: Rol insuficiente

- Dado un usuario con rol `JUGADOR` o `SUPER_ADMIN`
- Cuando abre `/admin`
- Entonces es redirigido a `/`

#### Escenario: Dueño

- Dado un usuario con rol `DUENO`
- Cuando abre `/admin`
- Entonces ve el panel de su negocio

## ELIMINADO

(Sin requisitos eliminados.)
