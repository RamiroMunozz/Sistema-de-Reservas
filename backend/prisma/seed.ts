import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Iniciando la carga de datos iniciales (Seed)...");

  // 1. Limpieza de datos en cascada
  await prisma.booking.deleteMany();
  await prisma.courtSchedule.deleteMany();
  await prisma.court.deleteMany();
  await prisma.complex.deleteMany();
  await prisma.user.deleteMany();

  // 2. Usuarios base (Admin y Cliente)
  const adminPasswordHash = await bcrypt.hash("AdminPass123", 12);
  const userPasswordHash = await bcrypt.hash("UserPass123", 12);

  await prisma.user.createMany({
    data: [
      {
        email: "admin@sportsbooking.com",
        passwordHash: adminPasswordHash,
        firstName: "Admin",
        lastName: "General",
        role: "ADMIN",
      },
      {
        email: "jugador@example.com",
        passwordHash: userPasswordHash,
        firstName: "Lucas",
        lastName: "Gómez",
        phone: "+5492604998877",
        role: "USER",
      },
    ],
  });

  // 3. Complejo deportivo
  const complex = await prisma.complex.create({
    data: {
      name: "Complejo Deportivo Central",
      address: "Av. Libertador 1250",
      phone: "+5492604112233",
    },
  });

  // 4. Canchas
  const court1 = await prisma.court.create({
    data: {
      complexId: complex.id,
      name: "Cancha 1 - Fútbol 5 Techada",
      sport: "FUTBOL_5",
      surface: "SINTETICO",
      pricePerSlot: 28000.0,
      isIndoor: true,
      isActive: true,
    },
  });

  const court2 = await prisma.court.create({
    data: {
      complexId: complex.id,
      name: "Cancha 2 - Fútbol 7 Descubierta",
      sport: "FUTBOL_7",
      surface: "SINTETICO",
      pricePerSlot: 38000.0,
      isIndoor: false,
      isActive: true,
    },
  });

  const court3 = await prisma.court.create({
    data: {
      complexId: complex.id,
      name: "Cancha 3 - Pádel Panorámica",
      sport: "PADEL",
      surface: "CEMENTO",
      pricePerSlot: 18000.0,
      isIndoor: true,
      isActive: true,
    },
  });

  // 5. Horarios de atención (Lunes a Domingo de 08:00 a 23:00)
  const openTime = new Date("1970-01-01T08:00:00Z");
  const closeTime = new Date("1970-01-01T23:00:00Z");

  const courts = [court1, court2, court3];

  for (const court of courts) {
    for (let day = 0; day <= 6; day++) {
      await prisma.courtSchedule.create({
        data: {
          courtId: court.id,
          dayOfWeek: day,
          openTime,
          closeTime,
          slotDurationMinutes: 60,
        },
      });
    }
  }

  console.log("✅ Base de datos poblada con éxito.");
}

main()
  .catch((e) => {
    console.error("❌ Error ejecutando el seed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
