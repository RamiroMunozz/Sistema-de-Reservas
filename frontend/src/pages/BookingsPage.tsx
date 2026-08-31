import React, { useState, useEffect } from "react";
import api from "../api/axios";
import { isAxiosError } from "axios";
import {
  Calendar as CalendarIcon,
  Clock,
  AlertCircle,
  CreditCard,
  Banknote,
  X,
} from "lucide-react";
import type { Court, Sport } from "../types/index.js";

interface SlotItem {
  time: string;
  isAvailable: boolean;
  courtId: string;
  price: number | string;
  courtName: string;
}

export const BookingsPage: React.FC = () => {
  const [courts, setCourts] = useState<Court[]>([]);
  const [selectedSport, setSelectedSport] = useState<Sport | "ALL">("ALL");
  const [selectedDate, setSelectedDate] = useState<string>(
    new Date().toISOString().split("T")[0],
  );
  const [loading, setLoading] = useState(true);

  // Mapa de horarios ocupados por ID de cancha: { [courtId: string]: string[] }
  const [occupiedSlotsByCourt, setOccupiedSlotsByCourt] = useState<
    Record<string, string[]>
  >({});

  // Estado del Modal de Pago
  const [selectedSlot, setSelectedSlot] = useState<SlotItem | null>(null);
  const [bookingLoading, setBookingLoading] = useState(false);
  const [bookingError, setBookingError] = useState<string | null>(null);

  // Trigger para refrescar disponibilidad tras reservar
  const [refreshKey, setRefreshKey] = useState(0);

  // Carga de canchas y disponibilidad sincronizada en un solo efecto
  useEffect(() => {
    let isMounted = true;

    const loadData = async () => {
      try {
        setLoading(true);

        // 1. Obtener canchas si aún no se cargaron
        const courtsRes = await api.get<Court[]>("/courts");
        const loadedCourts = courtsRes.data;

        if (!isMounted) return;
        setCourts(loadedCourts);

        // 2. Obtener disponibilidad para la fecha seleccionada
        if (loadedCourts.length > 0 && selectedDate) {
          const availabilityMap: Record<string, string[]> = {};

          await Promise.all(
            loadedCourts.map(async (court) => {
              try {
                const res = await api.get<string[]>(
                  `/bookings/availability?courtId=${court.id}&date=${selectedDate}`,
                );
                availabilityMap[court.id] = res.data;
              } catch {
                availabilityMap[court.id] = [];
              }
            }),
          );

          if (isMounted) {
            setOccupiedSlotsByCourt(availabilityMap);
          }
        }
      } catch (err) {
        console.error("Error al cargar datos y disponibilidad:", err);
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    loadData();

    return () => {
      isMounted = false;
    };
  }, [selectedDate, refreshKey]);

  const timeSlots = [
    "08:00",
    "09:00",
    "10:00",
    "11:00",
    "12:00",
    "13:00",
    "14:00",
    "15:00",
    "16:00",
    "17:00",
    "18:00",
    "19:00",
    "20:00",
    "21:00",
    "22:00",
  ];

  const filteredCourts =
    selectedSport === "ALL"
      ? courts
      : courts.filter((c) => c.sport === selectedSport);

  const isSlotOccupied = (courtId: string, time: string): boolean => {
    const occupiedList = occupiedSlotsByCourt[courtId];
    return Array.isArray(occupiedList) && occupiedList.includes(time);
  };

  const handleOpenBookingModal = (court: Court, time: string) => {
    if (isSlotOccupied(court.id, time)) return;

    setSelectedSlot({
      courtId: court.id,
      courtName: court.name,
      price: Number(court.pricePerSlot),
      time,
      isAvailable: true,
    });
    setBookingError(null);
  };

  const handleConfirmCashBooking = async () => {
    if (!selectedSlot) return;
    setBookingLoading(true);
    setBookingError(null);

    try {
      const startTime = `${selectedDate}T${selectedSlot.time}:00.000Z`;
      const endHour = (parseInt(selectedSlot.time.split(":")[0], 10) + 1)
        .toString()
        .padStart(2, "0");
      const endTime = `${selectedDate}T${endHour}:00:00.000Z`;

      await api.post("/bookings", {
        courtId: selectedSlot.courtId,
        startTime,
        endTime,
        paymentMethod: "CASH",
      });

      alert("¡Turno reservado con éxito! Se abona en efectivo en el complejo.");
      setSelectedSlot(null);
      setRefreshKey((prev) => prev + 1); // Dispara la actualización inmediata del efecto
    } catch (err: unknown) {
      if (isAxiosError<{ detail?: string; message?: string }>(err)) {
        setBookingError(
          err.response?.data?.detail ||
            err.response?.data?.message ||
            "No se pudo completar la reserva.",
        );
      } else {
        setBookingError("Ocurrió un error inesperado.");
      }
    } finally {
      setBookingLoading(false);
    }
  };

  const handlePayWithMercadoPago = async () => {
    if (!selectedSlot) return;
    setBookingLoading(true);
    setBookingError(null);

    try {
      const startTime = `${selectedDate}T${selectedSlot.time}:00.000Z`;
      const endHour = (parseInt(selectedSlot.time.split(":")[0], 10) + 1)
        .toString()
        .padStart(2, "0");
      const endTime = `${selectedDate}T${endHour}:00:00.000Z`;

      const bookingRes = await api.post<{ id: string }>("/bookings", {
        courtId: selectedSlot.courtId,
        startTime,
        endTime,
        paymentMethod: "TRANSFER",
      });

      const bookingId = bookingRes.data.id;

      const mpRes = await api.post<{ initPoint: string }>(
        "/payments/create-preference",
        { bookingId },
      );

      if (mpRes.data.initPoint) {
        window.location.href = mpRes.data.initPoint;
      } else {
        setBookingError("No se pudo obtener el link de pago de Mercado Pago.");
      }
    } catch (err: unknown) {
      if (isAxiosError<{ detail?: string; message?: string }>(err)) {
        setBookingError(
          err.response?.data?.detail ||
            err.response?.data?.message ||
            "Error al iniciar el pago con Mercado Pago.",
        );
      } else {
        setBookingError("Ocurrió un error inesperado al procesar el pago.");
      }
    } finally {
      setBookingLoading(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white mb-2">
          Turnos Disponibles
        </h1>
        <p className="text-slate-400 text-sm">
          Seleccioná fecha, deporte y el horario que prefieras para jugar
        </p>
      </div>

      {/* Barra de Filtros */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 mb-8 flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3 w-full md:w-auto">
          <CalendarIcon className="w-5 h-5 text-emerald-400" />
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
          />
        </div>

        <div className="flex flex-wrap gap-2 w-full md:w-auto">
          {(["ALL", "FUTBOL_5", "FUTBOL_7", "PADEL", "TENIS"] as const).map(
            (sport) => (
              <button
                key={sport}
                onClick={() => setSelectedSport(sport)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                  selectedSport === sport
                    ? "bg-emerald-500 text-slate-950"
                    : "bg-slate-950 border border-slate-800 text-slate-400 hover:text-white"
                }`}
              >
                {sport === "ALL"
                  ? "Todos los Deportes"
                  : sport.replace("_", " ")}
              </button>
            ),
          )}
        </div>
      </div>

      {/* Grilla de Canchas */}
      {loading ? (
        <div className="text-center py-12 text-slate-400 text-sm">
          Cargando canchas y disponibilidad...
        </div>
      ) : filteredCourts.length === 0 ? (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center text-slate-400 text-sm">
          No se encontraron canchas disponibles para este filtro.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredCourts.map((court) => (
            <div
              key={court.id}
              className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg flex flex-col justify-between"
            >
              <div>
                <div className="flex justify-between items-start mb-2">
                  <h3 className="text-lg font-bold text-white">{court.name}</h3>
                  <span className="text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded-full">
                    {court.sport}
                  </span>
                </div>

                <p className="text-xs text-slate-400 mb-4">
                  Superficie:{" "}
                  <span className="text-slate-200">{court.surface}</span>
                  {court.isIndoor && " • Techada"}
                </p>

                <div className="flex items-center justify-between py-2 border-y border-slate-800 mb-4">
                  <span className="text-xs text-slate-400">
                    Precio por Turno:
                  </span>
                  <span className="text-sm font-bold text-emerald-400">
                    ${Number(court.pricePerSlot).toLocaleString("es-AR")}
                  </span>
                </div>

                <span className="text-xs font-semibold text-slate-400 block mb-2">
                  Horarios:
                </span>

                <div className="grid grid-cols-3 gap-2">
                  {timeSlots.map((time) => {
                    const occupied = isSlotOccupied(court.id, time);

                    return (
                      <button
                        key={time}
                        disabled={occupied}
                        onClick={() => handleOpenBookingModal(court, time)}
                        className={`py-2 rounded-lg text-xs font-bold transition flex flex-col items-center justify-center gap-0.5 border ${
                          occupied
                            ? "bg-slate-950/60 border-slate-800 text-slate-600 cursor-not-allowed opacity-50 line-through"
                            : "bg-emerald-500/10 hover:bg-emerald-500 text-emerald-400 hover:text-slate-950 border-emerald-500/30"
                        }`}
                      >
                        <div className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          <span>{time}</span>
                        </div>
                        {occupied && (
                          <span className="text-[9px] text-rose-500 font-semibold no-underline">
                            Ocupado
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal de Confirmación y Selección de Pago */}
      {selectedSlot && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl relative">
            <button
              onClick={() => setSelectedSlot(null)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-xl font-bold text-white mb-1">
              Confirmar Reserva
            </h3>
            <p className="text-xs text-slate-400 mb-4">
              {selectedSlot.courtName} • {selectedDate} a las{" "}
              {selectedSlot.time} hs
            </p>

            <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 mb-6 flex justify-between items-center">
              <span className="text-xs text-slate-400">
                Monto total a abonar:
              </span>
              <span className="text-lg font-bold text-emerald-400">
                ${Number(selectedSlot.price).toLocaleString("es-AR")}
              </span>
            </div>

            {bookingError && (
              <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-xl flex items-center gap-2 text-red-400 text-xs">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{bookingError}</span>
              </div>
            )}

            <div className="space-y-3">
              <button
                onClick={handlePayWithMercadoPago}
                disabled={bookingLoading}
                className="w-full py-3 bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold rounded-xl transition text-sm flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <CreditCard className="w-4 h-4" />
                {bookingLoading
                  ? "Generando link..."
                  : "Pagar con Mercado Pago"}
              </button>

              <button
                onClick={handleConfirmCashBooking}
                disabled={bookingLoading}
                className="w-full py-3 bg-slate-800 hover:bg-slate-700 text-white font-bold rounded-xl transition text-sm flex items-center justify-center gap-2 border border-slate-700 disabled:opacity-50"
              >
                <Banknote className="w-4 h-4" />
                {bookingLoading
                  ? "Guardando..."
                  : "Abonar en Efectivo en el Club"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
