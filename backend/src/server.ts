import "dotenv/config";
import app from "./app.js";
import { prisma } from "./core/config/prisma.js";
import { validarConfiguracionDeSeguridad } from "./core/config/security.js";

const PORT = Number(process.env.PORT) || 3000;

const VARIABLES_MERCADOPAGO = [
  "MERCADOPAGO_ACCESS_TOKEN",
  "MERCADOPAGO_WEBHOOK_SECRET",
];

const advertirMercadoPagoSinConfigurar = (): void => {
  const faltantes = VARIABLES_MERCADOPAGO.filter(
    (nombre) => !process.env[nombre],
  );

  if (faltantes.length > 0) {
    console.warn(
      `Mercado Pago no está configurado (faltan: ${faltantes.join(", ")}). Los pagos online responderán 503.`,
    );
  }
};

async function bootstrap() {
  try {
    validarConfiguracionDeSeguridad();
    advertirMercadoPagoSinConfigurar();

    // Validar conexión a PostgreSQL
    await prisma.$connect();
    console.log("Conexión con PostgreSQL establecida correctamente.");

    app.listen(PORT, () => {
      console.log(`Servidor corriendo en: http://localhost:${PORT}`);
      console.log(`Health check: http://localhost:${PORT}/health`);
    });
  } catch (error) {
    console.error("Error fatal al iniciar la aplicación:", error);
    await prisma.$disconnect();
    process.exit(1);
  }
}

bootstrap();
