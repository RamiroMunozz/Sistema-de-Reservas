# Spec: autenticacion

## Propósito

Describe el comportamiento vigente (multi-tenant) de la identidad de los usuarios: registro, inicio de sesión con token JWT, verificación del token en rutas protegidas, control de acceso por rol (`JUGADOR` y `DUENO`), límite de intentos y manejo de la sesión en el frontend. Las reglas de cada recurso protegido se documentan en la spec de su dominio.

## Requisitos

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

### AUT-002: Validación de los datos de registro

El sistema DEBE rechazar con 400 los registros que incumplan estas reglas: `email` con formato válido; `password` de al menos 8 caracteres, con al menos una mayúscula y al menos un número; `firstName` y `lastName` de al menos 2 caracteres. El sistema DEBE normalizar `email` a minúsculas y sin espacios en los extremos, y recortar los espacios de `firstName` y `lastName`. `phone` es opcional y no tiene otra validación.

#### Escenario: Contraseña débil

- Dado un cuerpo con `password: "abcdefgh"`
- Cuando se envía el registro
- Entonces responde 400 con la lista `errors` (campo y mensaje) y no se consulta ni crea el usuario

#### Escenario: Correo normalizado

- Dado un cuerpo con `email: "  Juan@Example.COM "` y el resto válido
- Cuando se envía el registro
- Entonces el correo se busca y se guarda como `juan@example.com`

### AUT-003: Almacenamiento seguro de la contraseña

El sistema DEBE guardar la contraseña únicamente como hash bcrypt (12 rondas) en `passwordHash`, y NO DEBE devolver el hash en las respuestas de registro ni de inicio de sesión.

#### Escenario: Respuesta sin hash

- Dado un registro o inicio de sesión exitoso
- Cuando se recibe la respuesta
- Entonces el objeto `user` no contiene `passwordHash`

### AUT-004: Inicio de sesión

El sistema DEBE permitir iniciar sesión con `POST /api/v1/auth/login` y cuerpo `{ email, password }`, y DEBE responder 200 con `{ user: { id, email, firstName, lastName, role }, accessToken }`. El `email` se normaliza igual que en el registro y `password` solo debe ser no vacía.

#### Escenario: Credenciales correctas

- Dado un usuario registrado
- Cuando envía su correo y su contraseña correcta
- Entonces responde 200 con el usuario y un `accessToken`

#### Escenario: Cuerpo inválido

- Dado un cuerpo con correo mal formado o `password` vacía
- Cuando se envía el inicio de sesión
- Entonces responde 400 con la lista `errors`

### AUT-005: Mensaje uniforme ante credenciales inválidas

El sistema DEBE responder 401 con detalle "Credenciales inválidas" tanto si el correo no existe como si la contraseña es incorrecta, sin distinguir el motivo.

#### Escenario: Correo inexistente

- Dado un correo que no está registrado
- Cuando se intenta iniciar sesión
- Entonces responde 401 "Credenciales inválidas"

#### Escenario: Contraseña incorrecta

- Dado un usuario registrado
- Cuando envía una contraseña incorrecta
- Entonces responde 401 "Credenciales inválidas"

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

### AUT-007: Secreto JWT obligatorio

El sistema NO DEBE emitir ni aceptar tokens si `JWT_SECRET` no está definido ni usar secretos por defecto, y DEBE fallar con "JWT_SECRET no está definido." al emitir tokens y en la validación de arranque, que `server.ts` ejecuta antes de iniciar.

#### Escenario: Sin secreto

- Dado `JWT_SECRET` vacío
- Cuando se intenta emitir un token o ejecutar la validación de arranque
- Entonces falla con "JWT_SECRET no está definido."

#### Escenario: Token con secreto por defecto

- Dado `JWT_SECRET` vacío y un token firmado con `default_secret` o `clave_secreta_por_defecto_desarrollo`
- Cuando se llama a una ruta protegida
- Entonces responde 401

### AUT-008: Verificación del token en rutas protegidas

El sistema DEBE exigir el encabezado `Authorization: Bearer <token>` en las rutas protegidas y DEBE responder 401 si falta o no usa el esquema `Bearer` (mensaje "Token no proporcionado o inválido."), o si el token es inválido o está vencido (mensaje "Token inválido o expirado."). Cuando es válido, DEBE exponer `{ userId, role }` como `req.user`. Solo se acepta el algoritmo HS256.

#### Escenario: Token válido

- Dado un token emitido por la aplicación
- Cuando se llama a `GET /api/v1/bookings/my-bookings`
- Entonces responde 200

#### Escenario: Sin token

- Dado un pedido sin encabezado `Authorization`
- Cuando se llama a una ruta protegida
- Entonces responde 401

#### Escenario: Token con otro algoritmo o sin firma

- Dado un token firmado con HS512 o con algoritmo `none`
- Cuando se llama a una ruta protegida
- Entonces responde 401

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

### AUT-010: Límite de intentos fallidos de autenticación

El sistema DEBE limitar `POST /auth/register` y `POST /auth/login` a 10 intentos fallidos por ventana de 15 minutos y responder 429 con "Demasiados intentos. Probá de nuevo más tarde." al superarlos. Las respuestas exitosas NO DEBEN contar para el límite.

#### Escenario: Límite superado

- Dado 10 intentos de login fallidos (401) en la ventana
- Cuando se envía un intento más
- Entonces responde 429 con ese detalle

### AUT-011: Formato de los errores

El sistema DEBE responder los errores de validación (400) y los de negocio (401, 403, 409, 429) con `{ type, title, status, detail, instance }`; los de validación incluyen además `errors: [{ field, message }]`.

#### Escenario: Error de negocio

- Dado un login con credenciales inválidas
- Cuando se recibe la respuesta
- Entonces el cuerpo incluye `status: 401` y `detail: "Credenciales inválidas"`

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

### AUT-013: Envío del token en las peticiones

El frontend DEBE agregar `Authorization: Bearer <token>` a cada petición de la instancia `api` cuando encuentra un token en `localStorage`.

#### Escenario: Petición con sesión

- Dado un token en `localStorage`
- Cuando se hace una petición con la instancia `api`
- Entonces incluye el encabezado `Authorization`

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

## Fuera de alcance

- Reglas de titularidad de reservas y pagos (ver `reservas` y `pagos`).
- Multi-tenant, rol `SUPER_ADMIN` y cuenta global de jugador (objetivo, ADR 0002).
- Refresh de token, recuperación de contraseña y verificación de correo (no implementados).

## Observaciones

1. No existe página de registro en el frontend: `AUT-001` solo es accesible por API.
2. No hay endpoint de cierre de sesión ni revocación de tokens; el cierre es solo local (`logout` borra `localStorage`).
3. El frontend no maneja 401: con el token vencido (15 min) la sesión local sigue marcada como autenticada hasta que una petición falle, y no hay refresh.
4. Inconsistencia de formato: `authenticate` responde `{ message }` en 401, mientras el resto usa `{ detail }`. `LoginPage` solo lee `detail`.
5. `authenticate` confía en el rol del token sin consultar la base; un cambio de rol o la baja del usuario no surten efecto hasta que el token vence.
6. `requireRole` recibe `string[]` sin tipado del rol, y `ProtectedRoute` compara roles ignorando mayúsculas, mientras el backend lo hace de forma exacta.
7. El interceptor de `axios.ts` busca el token en varias claves (`token`, `accessToken`, `auth`, `user`) más allá de la usada por `AuthContext`; comportamiento heredado.
8. `phone` no tiene validación de formato ni longitud, y la contraseña no tiene longitud máxima.
9. El límite de intentos usa el almacenamiento en memoria por defecto de `express-rate-limit` y cuenta por IP; no hay prueba que lo verifique para `register`.
10. Cobertura: hay pruebas de login (límite 429), JWT y roles, pero ninguna del registro, de la validación de `registerSchema` ni del frontend (sin tests). La suite `integration.test.ts` depende de PostgreSQL con usuarios sembrados.
11. `AuthContext` define `loading: false` fijo, por lo que la rama de carga de `ProtectedRoute` no se usa.

## Evidencia

- AUT-001: `backend/src/modules/auth/auth.service.ts:14-49`, `backend/src/modules/auth/auth.controller.ts:8-20`, `backend/src/modules/auth/auth.routes.ts:8`, `backend/prisma/schema.prisma:15-18`.
- AUT-002: `backend/src/modules/auth/auth.dto.ts:3-23`, `backend/src/core/middlewares/errorHandler.ts:12-25`.
- AUT-003: `backend/src/core/config/security.ts:4,26-28`, `backend/src/modules/auth/auth.service.ts:23,33-40,74-82`.
- AUT-004: `backend/src/modules/auth/auth.service.ts:51-84`, `backend/src/modules/auth/auth.dto.ts:25-32`, `backend/src/modules/auth/auth.controller.ts:22-34`, `backend/tests/integration.test.ts:12-22`.
- AUT-005: `backend/src/modules/auth/auth.service.ts:56-67`, `backend/tests/validacionReservas.test.ts:471-476`.
- AUT-006: `backend/src/core/config/security.ts:5,37-42`, `backend/tests/secretosJwt.test.ts:101-108`.
- AUT-007: `backend/src/core/config/security.ts:12-24`, `backend/src/server.ts:27`, `backend/tests/secretosJwt.test.ts:23-62`.
- AUT-008: `backend/src/core/middlewares/auth.ts:9-26`, `backend/src/core/config/security.ts:44-48`, `backend/src/core/types/express.d.ts:5-7`, `backend/tests/secretosJwt.test.ts:66-99`, `backend/tests/rutasAdminReservas.test.ts:75-132`.
- AUT-009: `backend/src/core/middlewares/role.middleware.ts:4-20`, `backend/src/modules/admin/admin.routes.ts:10-11`, `backend/tests/integration.test.ts:49-67`, `backend/tests/rutasAdminReservas.test.ts:30-69`.
- AUT-010: `backend/src/core/middlewares/limitadorAutenticacion.ts:7-16`, `backend/src/modules/auth/auth.routes.ts:8-9`, `backend/tests/validacionReservas.test.ts:465-487`.
- AUT-011: `backend/src/core/middlewares/errorHandler.ts:12-37`, `backend/src/core/errors/AppError.ts:1-29`, `backend/tests/integration.test.ts:55-57`.
- AUT-012: `frontend/src/context/AuthContext.tsx:5-58`, `frontend/src/pages/LoginPage.tsx:17-39`.
- AUT-013: `frontend/src/api/axios.ts:7-31`.
- AUT-014: `frontend/src/components/ProtectedRoute.tsx:10-34`, `frontend/src/App.tsx:21-36`.
- Observaciones: 1 `frontend/src/App.tsx:19-37`; 2 `frontend/src/context/AuthContext.tsx:39-43`; 3 `frontend/src/api/axios.ts:7-31`; 4 `backend/src/core/middlewares/auth.ts:12-14,25`, `frontend/src/pages/LoginPage.tsx:28-32`; 5 `backend/src/core/middlewares/auth.ts:21`; 6 `backend/src/core/middlewares/role.middleware.ts:4`, `frontend/src/components/ProtectedRoute.tsx:29`; 7 `frontend/src/api/axios.ts:9-23`; 8 `backend/src/modules/auth/auth.dto.ts:22`; 9 `backend/src/core/middlewares/limitadorAutenticacion.ts:7-12`; 11 `frontend/src/context/AuthContext.tsx:51`.
