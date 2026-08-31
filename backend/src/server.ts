import "dotenv/config";
import app from "./app.js";
import { prisma } from "./core/config/prisma.js";

const PORT = Number(process.env.PORT) || 3000;

async function bootstrap() {
  try {
    // Validar conexión a PostgreSQL
    await prisma.$connect();
    console.log("✅ Conexión con PostgreSQL establecida correctamente.");

    app.listen(PORT, () => {
      console.log(`🚀 Servidor corriendo en: http://localhost:${PORT}`);
      console.log(`📡 Health check: http://localhost:${PORT}/health`);
    });
  } catch (error) {
    console.error("❌ Error fatal al iniciar la aplicación:", error);
    await prisma.$disconnect();
    process.exit(1);
  }
}

bootstrap();
