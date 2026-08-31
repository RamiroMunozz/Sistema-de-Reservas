import React, { useEffect, useState } from "react";
import api from "../api/axios";
import { isAxiosError } from "axios";
import { Calendar, Clock, MapPin, AlertCircle, XCircle } from "lucide-react";

interface Booking {
  id: string;
  startTime: string;
  endTime: string;
  status: "CONFIRMED" | "CANCELLED" | "PENDING";
  totalPrice: string | number;
  paymentMethod: string;
  court: {
    name: string;
    sport: string;
    complex?: {
      name: string;
    };
  };
}

export const MyBookingsPage: React.FC = () => {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    const loadBookings = async () => {
      try {
        const res = await api.get<Booking[]>("/bookings/my-bookings");
        if (isMounted) {
          setBookings(res.data);
        }
      } catch (err) {
        console.error("Error al cargar reservas:", err);
        if (isMounted) {
          setErrorMessage("No se pudieron cargar tus reservas.");
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    loadBookings();

    return () => {
      isMounted = false;
    };
  }, []);

  const handleCancel = async (bookingId: string) => {
    const confirmCancel = window.confirm(
      "¿Estás seguro de que querés cancelar esta reserva?",
    );
    if (!confirmCancel) return;

    setActionLoading(bookingId);
    setErrorMessage(null);

    try {
      await api.patch(`/bookings/${bookingId}/cancel`);
      setBookings((prev) =>
        prev.map((b) =>
          b.id === bookingId ? { ...b, status: "CANCELLED" } : b,
        ),
      );
    } catch (err: unknown) {
      if (isAxiosError<{ message?: string; detail?: string }>(err)) {
        setErrorMessage(
          err.response?.data?.message ||
            err.response?.data?.detail ||
            "Error al cancelar la reserva.",
        );
      } else {
        setErrorMessage("Ocurrió un error inesperado al cancelar.");
      }
    } finally {
      setActionLoading(null);
    }
  };

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-12 text-center text-slate-400 text-sm">
        Cargando tus reservas...
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white mb-1">Mis Reservas</h1>
        <p className="text-slate-400 text-sm">
          Historial y estado de tus turnos reservados
        </p>
      </div>

      {errorMessage && (
        <div className="mb-6 p-4 rounded-xl flex items-center gap-3 bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {bookings.length === 0 ? (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center text-slate-400 text-sm">
          Aún no tenés turnos reservados.
        </div>
      ) : (
        <div className="space-y-4">
          {bookings.map((booking) => {
            const startDate = new Date(booking.startTime);
            const dateStr = startDate.toLocaleDateString("es-AR", {
              day: "2-digit",
              month: "2-digit",
              year: "numeric",
            });
            const hours = startDate.getUTCHours().toString().padStart(2, "0");
            const timeStr = `${hours}:00 hs`;

            const isCancelled = booking.status === "CANCELLED";

            return (
              <div
                key={booking.id}
                className="bg-slate-900 border border-slate-800 rounded-2xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-lg"
              >
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <h3 className="text-lg font-bold text-white">
                      {booking.court.name}
                    </h3>
                    <span
                      className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${
                        isCancelled
                          ? "bg-red-500/20 text-red-400 border border-red-500/30"
                          : "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                      }`}
                    >
                      {isCancelled ? "Cancelada" : "Confirmada"}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-4 text-xs text-slate-400">
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5 text-slate-500" />
                      {dateStr}
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5 text-slate-500" />
                      {timeStr}
                    </span>
                    <span className="flex items-center gap-1">
                      <MapPin className="w-3.5 h-3.5 text-slate-500" />
                      {booking.court.sport}
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-between md:justify-end gap-6 pt-3 md:pt-0 border-t md:border-t-0 border-slate-800">
                  <div className="text-right">
                    <span className="block text-xs text-slate-500">Total</span>
                    <span className="text-lg font-bold text-emerald-400">
                      ${Number(booking.totalPrice).toLocaleString("es-AR")}
                    </span>
                  </div>

                  {!isCancelled && (
                    <button
                      onClick={() => handleCancel(booking.id)}
                      disabled={actionLoading === booking.id}
                      className="px-3 py-2 bg-red-500/10 hover:bg-red-500 text-red-400 hover:text-white border border-red-500/30 text-xs font-bold rounded-lg transition flex items-center gap-1.5 disabled:opacity-50"
                    >
                      <XCircle className="w-4 h-4" />
                      {actionLoading === booking.id
                        ? "Cancelando..."
                        : "Cancelar"}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
