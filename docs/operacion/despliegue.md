# Despliegue

**Pendiente.** El despliegue en producción se define en el cambio `despliegue` (ver [hoja de ruta](../producto/hoja-de-ruta.md)).

Hoy existen solo Dockerfiles (`backend/DockerFile`, `frontend/DockerFile`) y `docker-compose.yml`, orientados a desarrollo local (montan el código como volumen).

Temas a resolver:

- Plataforma de alojamiento y base de datos gestionada con soporte para `btree_gist`.
- Gestión de secretos en producción. La rotación de `JWT_SECRET` ya está documentada en [variables de entorno](variables-entorno.md#rotación-de-jwt_secret).
- Dominio, HTTPS y URL pública para el webhook de Mercado Pago.
- Resolución de subdominio o ruta para el slug de cada negocio.
- Integración continua (cambio `calidad-ci`).
