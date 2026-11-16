# Despliegue

**Pendiente.** El despliegue en producción se define en el cambio `despliegue` (ver [hoja de ruta](../producto/hoja-de-ruta.md)).

Hoy existen solo Dockerfiles (`backend/DockerFile`, `frontend/DockerFile`) y `docker-compose.yml`, orientados a desarrollo local (montan el código como volumen). El `DockerFile` del backend ejecuta `npm run build || true`, deuda registrada en el cambio `deuda-auditoria`.

Temas a resolver:

- Plataforma de alojamiento y base de datos gestionada con soporte para `btree_gist`.
- Gestión de secretos y rotación de `JWT_SECRET`.
- Dominio, HTTPS y URL pública para el webhook de Mercado Pago.
- Resolución de subdominio o ruta para el slug de cada negocio.
- Integración continua (cambio `calidad-ci`).
