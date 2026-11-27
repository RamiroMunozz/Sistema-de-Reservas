# Exploración: mercadopago-por-negocio (N.º 6)

## 1. Qué se pide
DP-15: cada negocio conecta su propia cuenta de Mercado Pago con OAuth ("Conectar con Mercado Pago", modo marketplace). No se envía `marketplace_fee`. Todavía no hay negocios contratados: el objetivo es dejar el sistema listo para ofrecer.

## 2. Documentación de Mercado Pago
**Verificado** (mercadopago.com.ar/developers y lectura del SDK instalado):
- **Autorización.** URL `https://auth.mercadopago.com/authorization?client_id=APP_ID&response_type=code&platform_id=mp&state=RANDOM_ID&redirect_uri=...`.
  - La `redirect_uri` debe coincidir exacto con la registrada y ser estática; los datos extra van en `state`.
  - `state` debe ser único por intento y sin datos sensibles.
  - El `code` vale 10 minutos.
  - Fuente: /developers/es/docs/security/oauth/creation.
- **PKCE.** Es opcional. Al activarlo en la app, `code_challenge` y `code_challenge_method` pasan a ser obligatorios, y el intercambio lleva `code_verifier`. El SDK 3.6.0 no lo soporta: `getAuthorizationURL` acepta solo `client_id`, `state` y `redirect_uri`, y `OAuth.create` no declara `code_verifier`.
- **Intercambio.** `POST https://api.mercadopago.com/oauth/token` con `client_id`, `client_secret`, `code`, `grant_type=authorization_code`, `redirect_uri` y `test_token` ("true" genera credenciales de prueba).
- **Respuesta.** La doc no la detalla. Los tipos del SDK (`OAuthResponse`) declaran `access_token`, `refresh_token`, `public_key`, `user_id`, `expires_in`, `live_mode` y `scope`.
- **Duración y renovación.**
  - El access token dura 180 días.
  - La renovación es `grant_type=refresh_token` en el mismo endpoint. Devuelve un access token y un refresh token nuevos, y el refresh token rota: hay que guardar el nuevo.
  - Requiere el scope `offline_access`.
  - La doc no dice cuánto dura el refresh token.
  - Fuente: /developers/es/docs/security/oauth/renewal.
- **Revocación.** Si el vendedor revoca la autorización, se borran todos sus tokens. También se invalidan por cambio de clave, reset por fraude o borrado de la app. Fuente: /developers/es/docs/security/oauth/management.
- **Preferencias y reembolsos.** Se usa el access token del vendedor obtenido por OAuth. `marketplace_fee` es la comisión, que es opcional. Fuente: /developers/es/docs/checkout-pro-preferences/how-tos/integrate-marketplace.
- **Webhook.**
  - El secreto es único por aplicación, no por vendedor. Se genera en "Tus integraciones > Webhooks", no caduca y se puede restablecer.
  - La cabecera es `ts=...,v1=...`; se valida con `x-signature`, `x-request-id` y el `data.id` de la URL.
  - El cuerpo de ejemplo incluye `user_id`.
  - La `notification_url` de la preferencia tiene prioridad sobre la de la app.
  - Mercado Pago reintenta cada 15 minutos si no recibe 200 o 201 en 22 segundos.
  - Para distinguir vendedores, la doc sugiere un parámetro en la URL (`?cliente=...`).
  - El tópico `mp-connect` avisa cuando un vendedor autoriza o desautoriza la app; su payload no está descrito.
- **Cuentas de prueba.** Hasta 15 por app. La doc no aclara si una cuenta de prueba puede autorizar vía OAuth.
- **Versión del SDK.** `mercadopago` 3.6.0, con `OAuth.create`, `OAuth.refresh` y `OAuth.getAuthorizationURL`.

**No verificado, a confirmar al implementar:**
1. el código de error de un token revocado (se asume 401 o 403);
2. el payload de `mp-connect`;
3. si `expires_in` viene siempre;
4. si OAuth funciona con cuentas de prueba;
5. el comportamiento de `notification_url` en modo marketplace.

## 3. Mapa de uso de las credenciales globales
| Dónde | Qué usa | Cómo llega al negocio |
|---|---|---|
| `backend/src/core/integraciones/mercadoPago.ts:53-56` `crearClienteMercadoPago` | `MERCADOPAGO_ACCESS_TOKEN` | Toma un `accessToken`. Hoy no recibe negocio. |
| `crearPreferencia` (:58) | `MERCADOPAGO_WEBHOOK_SECRET` (:62), `BACKEND_URL`, access token | Desde `payment.service.createPaymentPreference` (con `booking.negocioId`) y desde `reservaInvitado.service`, en `crear` y `reintentarPago`. |
| `expirarPreferencia` (:114), por `invalidarLinkDePago` en `backend/src/modules/bookings/linkDePago.ts` | access token | `invalidarLinkDePago` solo recibe el id de preferencia. Hay que pasarle el negocio. |
| `obtenerPago` (:130) | access token | Webhook (`processWebhook`, `releerMonto`) y reembolso. |
| `reembolsarPago` (:137) | access token | `payment.service.reembolsarPago(idNegocio, idPago)` ya recibe el negocio. |
| `payment.service.validarFirma` (:175) | `MERCADOPAGO_WEBHOOK_SECRET` | La ruta del webhook es pública y global. |
| `reservaInvitado.service.ts:35-38,64,172` | verifica las variables antes de escribir | Ya conoce el negocio. |
| `backend/src/server.ts:9-24` | aviso al arrancar | Global (PAG-008). |

Tres puntos que cambian el diseño:
- **`processWebhook` consulta el pago antes de conocer la reserva.** Con un token por negocio, hay que saber el negocio antes de llamar a `obtenerPago`.
- **`createPaymentPreference` busca la reserva solo por `id` y valida la titularidad por `userId`.** Conviene usar `booking.negocioId`.
- **El reembolso debe usar el token del negocio que cobró.**

Specs afectadas: PAG-001, 005, 006, 007, 008, 009, 019 a 021, 024 y 025. En `negocios` se agrega un requisito de conexión, y en `administracion` se agrega la sección del panel del dueño.

Pruebas con mocks de Mercado Pago: `adaptadorMercadoPago`, `preferenciaPago`, `reembolsoPago`, `webhookPago`, `reservaInvitadoCrear`, `linkDePago`, `cancelacionBajoBloqueo`, `rutasPublicasToken`, `aislamientoReservasPagos` y otras.

## 4. Modelo de datos
Hoy `Negocio` tiene `id`, `nombre`, `slug`, `activo` y `createdAt`, sin campos de Mercado Pago.

**Qué guardar por negocio:** `mpUserId`, `accessToken` y `refreshToken` cifrados, el vencimiento, el estado de conexión, `conectadoEn` y `ultimoError`. Opcionales: `publicKey` y `liveMode`.

**Dónde guardarlo:**
- (a) Columnas en `negocios`: el SELECT de negocio las trae por defecto, con riesgo de fuga en cualquier `include`.
- (b) **Recomendada:** tabla `ConexionMercadoPago` 1:1 con `Negocio` (`negocioId` único), que se lee solo desde el adaptador.

**Cifrado en reposo:**
- AES-256-GCM con `node:crypto`, clave de 32 bytes en `MERCADOPAGO_CLAVE_CIFRADO`, IV por registro y versión de clave para poder rotarla.
- La API nunca devuelve tokens: solo `{ conectado, mpUserId, conectadoEn, estado }`.
- La clave se agrega a `validarConfiguracionDeSeguridad` (`backend/src/core/config/security.ts`).
- Cuidar que logs y pruebas no impriman tokens.

**Migración de `principal`:**
- Las variables globales pasan a ser `MERCADOPAGO_CLIENT_ID`, `MERCADOPAGO_CLIENT_SECRET` y `MERCADOPAGO_WEBHOOK_SECRET`, que son las de la app de la plataforma. `MERCADOPAGO_ACCESS_TOKEN` se retira.
- La cuenta actual es de prueba y `principal` no tiene clientes reales. Opción recomendada: no migrar el token; `principal` se conecta como cualquier negocio.
- Las reservas `PENDING` con un link de la cuenta global tienen una ventana de 15 minutos al desplegar; se asume aceptable.
- Migración Prisma estándar: tabla nueva, sin tocar las restricciones manuales.

## 5. Flujos
**Conectar:**
1. `POST /api/v1/negocio/mercadopago/conectar` (`soloDueno`) devuelve la URL de autorización.
2. El `state` es aleatorio y de un solo uso, guardado en el servidor con el negocio y un TTL de unos 10 minutos.
3. La `redirect_uri` es fija: `<BACKEND_URL>/api/v1/mercadopago/callback`.
4. El callback público valida el `state`, canjea el `code`, cifra y guarda los tokens, y redirige al panel con el resultado.
5. Un `state` inválido, vencido o reutilizado da 400 sin guardar nada.

**Desconectar:**
- Borra los tokens y deja el estado `DESCONECTADO`.
- Los reembolsos pendientes quedan sin poder hacerse desde el sistema.
- No hay un endpoint de revocación documentado.

**Renovar:**
- Los tokens duran 180 días, y la renovación rota el refresh token.
- Se serializa con un bloqueo por negocio (`pg_advisory_xact_lock`).

**Negocio sin conexión:**
- Crear una preferencia o reservar con seña da 503 con un mensaje claro, nunca 500. Se reescribe PAG-007.
- La verificación ocurre antes de escribir la reserva.
- Con el token revocado (401 o 403 de Mercado Pago), la conexión se marca `REVOCADA` y se responde 503.

**Webhook sin token:**
- Responde 200 y deja una advertencia de revisión manual, porque un 4xx o un 5xx genera reintentos cada 15 minutos.
- El pago se reconcilia cuando el dueño reconecta.

## 6. Comparación de enfoques
**A. Renovación**
- Proactiva (job): el token está siempre vigente, pero suma piezas y puede fallar en silencio.
- **Bajo demanda (recomendada):** renueva si faltan menos de unos 7 días, o ante un 401, bajo bloqueo. No necesita un job nuevo.

**B. Webhook**
- Una URL por negocio (`/webhook/:slug`): no agrega seguridad, porque el secreto es el mismo para toda la app.
- **Una URL con `?negocio=<id>` en la `notification_url` (recomendada):** el parámetro solo elige qué token consultar. Después se verifica:
  - que el `collector_id` del pago coincida con el `mpUserId` guardado;
  - que el `external_reference` sea una reserva de ese `negocioId`.

  Si no coincide, se ignora con 200.

**C. Credenciales de la plataforma:** `client_id`, `client_secret` y `MERCADOPAGO_WEBHOOK_SECRET` en el `.env`. Por negocio, solo los tokens.

**D. Código:** `core/integraciones/mercadoPago.ts` recibe un cliente o un `negocioId`, y un servicio nuevo, `conexionMercadoPago.service`, obtiene el token. Es el único punto de contacto con el SDK.

## 7. Advertencias abiertas del cambio anterior
- **W7** (dueño de un negocio inactivo): encaja en parte. Un negocio inactivo no debería poder conectar ni renovar. El arreglo general (`authenticate`) excede este cambio.
- **S3, W6 y S6:** no encajan (son de `canchas` y de las respuestas públicas).

## 8. Otros hechos
- La `redirect_uri` debe registrarse exacta, y la URL del túnel de cloudflared cambia en cada arranque. En desarrollo hay que volver a registrarla o usar un dominio fijo.
- `auto_return` solo funciona con https (PAG-006 sin cambios).
- Se conserva no enviar `expiration_date_from` (reloj local adelantado unas 3 horas) y el margen de una hora al vencer.
- Se conserva la clave de idempotencia por intento en el reembolso.
- Frontend: la sección "Mercado Pago" (conectar, estado y desconectar) va en `frontend/src/pages/AdminDashboard.tsx`.

## 9. Riesgos
1. La prueba de punta a punta de OAuth necesita una app real en el panel de Mercado Pago y un vendedor de prueba. Es un bloqueo potencial.
2. Carrera en la renovación: se puede perder la cadena del refresh token. Se mitiga con el bloqueo.
3. Falsificación de `?negocio=`: se mitiga con la validación posterior (6B).
4. Fuga de tokens por logs, respuestas o pruebas.
5. PKCE sin soporte en el SDK.
6. Tamaño: propuesta de unidades.
   1. Esquema y cifrado.
   2. Adaptador y servicio de conexión.
   3. Rutas OAuth del dueño.
   4. Preferencias, vencimiento y reembolso.
   5. Webhook.
   6. Panel.
   7. Documentación y retiro de variables.
7. El webhook responde 200 aunque no pueda procesar; hay que registrar el caso.

## 10. Recomendación
- Tabla `ConexionMercadoPago` con cifrado AES-256-GCM.
- Renovación bajo demanda con bloqueo.
- `state` de un solo uso con TTL.
- `redirect_uri` fija.
- `notification_url` con `?negocio=<id>`, validada con `collector_id` y con el `negocioId` de la reserva.
- Variables globales reducidas a las de la app.
- `principal` se reconecta como un negocio más.

## Huecos de decisión de producto
1. Negocio sin conexión: ¿se bloquea la reserva de invitado con seña (503) o se permite sin pago online?
2. ¿Entra W7 como tarea mínima?
3. Desconexión con reservas `PENDING` o pagos por reembolsar: ¿se bloquea, se avisa o se permite?
4. `principal`: ¿se reconecta a mano o se siembra desde el `.env`?
5. ¿Se activa PKCE?
6. ¿Dominio estable para el callback en desarrollo?
7. ¿Una conexión por negocio, aunque el negocio tenga varios complejos?
