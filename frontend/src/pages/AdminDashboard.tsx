import React, { useState, useEffect } from "react";
import api from "../api/axios";
import { isAxiosError } from "axios";
import {
  DollarSign,
  CalendarCheck,
  Ban,
  PlusCircle,
  AlertCircle,
  Shield,
  CheckCircle,
  Calendar,
  Clock,
  MapPin,
  XCircle,
  Layers,
  LayoutGrid,
  Plus,
  RefreshCw,
  User,
  CheckCircle2,
  X,
  ShieldAlert,
} from "lucide-react";
import type { Sport, Surface, Court } from "../types/index.js";

interface MetricsSummary {
  totalBookings: number;
  confirmedCount: number;
  cancelledCount: number;
  totalRevenueARS: number;
}

interface AdminBooking {
  id: string;
  courtId: string;
  startTime: string;
  endTime: string;
  status: "CONFIRMED" | "CANCELLED" | "COMPLETED" | "PENDING";
  totalPrice: string | number;
  paymentMethod: "CASH" | "TRANSFER" | string;
  court: {
    id?: string;
    name: string;
    sport: string;
  };
  user?: {
    id?: string;
    firstName?: string;
    lastName?: string;
    name?: string;
    email: string;
    phone?: string;
  };
}

export const AdminDashboard: React.FC = () => {
  const [activeTab, setActiveTab] = useState<"grid" | "courts" | "bookings">(
    "grid",
  );

  // Métricas
  const [metrics, setMetrics] = useState<MetricsSummary | null>(null);
  const [loadingMetrics, setLoadingMetrics] = useState(true);

  // Canchas
  const [courts, setCourts] = useState<Court[]>([]);
  const [complexId, setComplexId] = useState("");
  const [name, setName] = useState("");
  const [sport, setSport] = useState<Sport>("FUTBOL_5");
  const [surface, setSurface] = useState<Surface>("SINTETICO");
  const [pricePerSlot, setPricePerSlot] = useState(25000);
  const [isIndoor, setIsIndoor] = useState(false);

  // Grilla Diaria de Turnos
  const [selectedDate, setSelectedDate] = useState<string>(
    new Date().toISOString().split("T")[0],
  );
  const [dailyBookings, setDailyBookings] = useState<AdminBooking[]>([]);
  const [loadingDaily, setLoadingDaily] = useState(true);
  const [refreshGridKey, setRefreshGridKey] = useState(0);

  // Modal Cargar Turno Manual
  const [isManualModalOpen, setIsManualModalOpen] = useState(false);
  const [manualCourtId, setManualCourtId] = useState("");
  const [manualTime, setManualTime] = useState("18:00");
  const [manualPayment, setManualPayment] = useState<"CASH" | "TRANSFER">(
    "CASH",
  );
  const [manualLoading, setManualLoading] = useState(false);
  const [manualError, setManualError] = useState<string | null>(null);

  // Historial de Todas las Reservas
  const [allBookings, setAllBookings] = useState<AdminBooking[]>([]);
  const [loadingBookings, setLoadingBookings] = useState(true);

  // Estados generales
  const [formLoading, setFormLoading] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

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

  // 1. Cargar métricas y canchas existentes al montar
  useEffect(() => {
    let isMounted = true;

    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const lastDay = new Date(year, now.getMonth() + 1, 0).getDate();

    const startDate = `${year}-${month}-01`;
    const endDate = `${year}-${month}-${lastDay}`;

    Promise.all([
      api.get(`/admin/metrics?startDate=${startDate}&endDate=${endDate}`),
      api.get<Court[]>("/courts"),
    ])
      .then(([metricsRes, courtsRes]) => {
        if (isMounted) {
          setMetrics(metricsRes.data.summary);
          setCourts(courtsRes.data);
          if (courtsRes.data.length > 0) {
            setManualCourtId(courtsRes.data[0].id);
            if (courtsRes.data[0].complexId) {
              setComplexId(courtsRes.data[0].complexId);
            }
          }
        }
      })
      .catch((err: unknown) => {
        if (isMounted) {
          console.error("Error al cargar datos de admin:", err);
        }
      })
      .finally(() => {
        if (isMounted) {
          setLoadingMetrics(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  // 2. Cargar grilla diaria
  useEffect(() => {
    let isMounted = true;

    if (activeTab === "grid" && selectedDate) {
      api
        .get<AdminBooking[]>(`/bookings/admin/daily?date=${selectedDate}`)
        .then((res) => {
          if (isMounted) {
            setDailyBookings(res.data);
          }
        })
        .catch((err: unknown) => {
          if (isMounted) {
            console.error("Error al cargar turnos del día:", err);
          }
        })
        .finally(() => {
          if (isMounted) {
            setLoadingDaily(false);
          }
        });
    }

    return () => {
      isMounted = false;
    };
  }, [activeTab, selectedDate, refreshGridKey]);

  // 3. Cargar historial completo de reservas
  useEffect(() => {
    let isMounted = true;

    if (activeTab === "bookings") {
      api
        .get<AdminBooking[]>("/bookings")
        .then((res) => {
          if (isMounted) {
            setAllBookings(res.data);
          }
        })
        .catch((err: unknown) => {
          if (isMounted) {
            console.error("Error al obtener reservas:", err);
          }
        })
        .finally(() => {
          if (isMounted) {
            setLoadingBookings(false);
          }
        });
    }

    return () => {
      isMounted = false;
    };
  }, [activeTab]);

  // Cambiar estado en la grilla diaria
  const handleDailyStatusChange = async (
    bookingId: string,
    status: "CONFIRMED" | "COMPLETED" | "CANCELLED",
  ) => {
    try {
      await api.patch(`/bookings/admin/${bookingId}/status`, { status });
      setLoadingDaily(true);
      setRefreshGridKey((prev) => prev + 1);
    } catch (err: unknown) {
      console.error("Error al actualizar estado:", err);
      alert("No se pudo actualizar el estado de la reserva.");
    }
  };

  // Crear turno manual
  const handleCreateManualBooking = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualCourtId) return;

    setManualLoading(true);
    setManualError(null);

    try {
      const startTime = `${selectedDate}T${manualTime}:00.000Z`;
      const endHour = (parseInt(manualTime.split(":")[0], 10) + 1)
        .toString()
        .padStart(2, "0");
      const endTime = `${selectedDate}T${endHour}:00:00.000Z`;

      await api.post("/bookings/admin/create", {
        courtId: manualCourtId,
        startTime,
        endTime,
        paymentMethod: manualPayment,
      });

      setIsManualModalOpen(false);
      setLoadingDaily(true);
      setRefreshGridKey((prev) => prev + 1);
    } catch (err: unknown) {
      if (isAxiosError<{ message?: string }>(err)) {
        setManualError(
          err.response?.data?.message ||
            "Error al registrar la reserva manual.",
        );
      } else {
        setManualError("Error inesperado al registrar la reserva manual.");
      }
    } finally {
      setManualLoading(false);
    }
  };

  // Crear cancha
  const handleCreateCourt = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormLoading(true);
    setFeedback(null);

    try {
      const payload: Record<string, unknown> = {
        name,
        sport,
        surface,
        pricePerSlot: Number(pricePerSlot),
        isIndoor,
        isActive: true,
      };

      if (complexId) {
        payload.complexId = complexId;
      }

      const res = await api.post<Court>("/admin/courts", payload);

      setFeedback({
        type: "success",
        message: "¡Cancha creada correctamente en el sistema!",
      });
      setCourts((prev) => [...prev, res.data]);
      setName("");
      setPricePerSlot(25000);
      setIsIndoor(false);
    } catch (err: unknown) {
      if (isAxiosError<{ detail?: string; message?: string }>(err)) {
        setFeedback({
          type: "error",
          message:
            err.response?.data?.detail ||
            err.response?.data?.message ||
            "Error al crear la cancha.",
        });
      } else {
        setFeedback({
          type: "error",
          message: "Ocurrió un error inesperado.",
        });
      }
    } finally {
      setFormLoading(false);
    }
  };

  // Cancelar reserva desde historial general
  const handleCancelBooking = async (bookingId: string) => {
    const confirmCancel = window.confirm(
      "¿Seguro que deseás cancelar este turno como administrador?",
    );
    if (!confirmCancel) return;

    try {
      await api.patch(`/bookings/${bookingId}/cancel`);
      setAllBookings((prev) =>
        prev.map((b) =>
          b.id === bookingId ? { ...b, status: "CANCELLED" } : b,
        ),
      );
      setMetrics((prev) =>
        prev
          ? {
              ...prev,
              confirmedCount: Math.max(0, prev.confirmedCount - 1),
              cancelledCount: prev.cancelledCount + 1,
            }
          : null,
      );
    } catch (err: unknown) {
      console.error("Error al cancelar reserva:", err);
      alert("No se pudo cancelar el turno.");
    }
  };

  const getBookingForSlot = (courtId: string, time: string) => {
    if (!Array.isArray(dailyBookings)) return undefined;

    return dailyBookings.find((b) => {
      // Validar que el objeto exista y tenga startTime
      if (!b || !b.startTime || b.status === "CANCELLED") return false;

      // Coincidencia de cancha
      const matchedCourtId = b.courtId || b.court?.id;
      if (matchedCourtId !== courtId) return false;

      try {
        const d = new Date(b.startTime);
        if (isNaN(d.getTime())) return false;

        const hours = String(d.getUTCHours()).padStart(2, "0");
        const minutes = String(d.getUTCMinutes()).padStart(2, "0");
        return `${hours}:${minutes}` === time;
      } catch {
        return false;
      }
    });
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      {/* Encabezado Principal */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8 pb-6 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <Shield className="w-8 h-8 text-emerald-400" />
          <div>
            <h1 className="text-3xl font-bold text-white mb-1">
              Panel Administrativo
            </h1>
            <p className="text-slate-400 text-sm">
              Control de turnos diarios, gestión de canchas y métricas
            </p>
          </div>
        </div>

        {/* Pestañas */}
        <div className="flex bg-slate-900 border border-slate-800 p-1 rounded-xl">
          <button
            onClick={() => setActiveTab("grid")}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition flex items-center gap-2 ${
              activeTab === "grid"
                ? "bg-emerald-500 text-slate-950"
                : "text-slate-400 hover:text-white"
            }`}
          >
            <LayoutGrid className="w-4 h-4" />
            Grilla del Día
          </button>
          <button
            onClick={() => setActiveTab("courts")}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition flex items-center gap-2 ${
              activeTab === "courts"
                ? "bg-emerald-500 text-slate-950"
                : "text-slate-400 hover:text-white"
            }`}
          >
            <Layers className="w-4 h-4" />
            Canchas
          </button>
          <button
            onClick={() => setActiveTab("bookings")}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition flex items-center gap-2 ${
              activeTab === "bookings"
                ? "bg-emerald-500 text-slate-950"
                : "text-slate-400 hover:text-white"
            }`}
          >
            <Calendar className="w-4 h-4" />
            Todas las Reservas
          </button>
        </div>
      </div>

      {/* Tarjetas de Métricas */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
        <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl flex items-center gap-4 shadow-lg">
          <div className="p-3.5 bg-emerald-500/20 text-emerald-400 rounded-xl border border-emerald-500/30">
            <DollarSign className="w-6 h-6" />
          </div>
          <div>
            <span className="text-xs text-slate-400 font-semibold block uppercase">
              Recaudación del Mes
            </span>
            <span className="text-2xl font-bold text-white">
              $
              {loadingMetrics
                ? "..."
                : (metrics?.totalRevenueARS || 0).toLocaleString("es-AR")}
            </span>
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl flex items-center gap-4 shadow-lg">
          <div className="p-3.5 bg-blue-500/20 text-blue-400 rounded-xl border border-blue-500/30">
            <CalendarCheck className="w-6 h-6" />
          </div>
          <div>
            <span className="text-xs text-slate-400 font-semibold block uppercase">
              Reservas Confirmadas
            </span>
            <span className="text-2xl font-bold text-white">
              {loadingMetrics ? "..." : metrics?.confirmedCount || 0}
            </span>
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl flex items-center gap-4 shadow-lg">
          <div className="p-3.5 bg-red-500/20 text-red-400 rounded-xl border border-red-500/30">
            <Ban className="w-6 h-6" />
          </div>
          <div>
            <span className="text-xs text-slate-400 font-semibold block uppercase">
              Reservas Canceladas
            </span>
            <span className="text-2xl font-bold text-white">
              {loadingMetrics ? "..." : metrics?.cancelledCount || 0}
            </span>
          </div>
        </div>
      </div>

      {/* Alertas de Feedback */}
      {feedback && (
        <div
          className={`mb-6 p-4 rounded-xl flex items-center gap-3 border text-sm ${
            feedback.type === "success"
              ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
              : "bg-red-500/10 border-red-500/30 text-red-400"
          }`}
        >
          {feedback.type === "success" ? (
            <CheckCircle className="w-5 h-5 flex-shrink-0" />
          ) : (
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
          )}
          <span>{feedback.message}</span>
        </div>
      )}

      {/* 1. PESTAÑA: GRILLA DIARIA (PANEL CANCHERO) */}
      {activeTab === "grid" && (
        <div className="space-y-6">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Calendar className="w-5 h-5 text-emerald-400" />
              <span className="text-sm font-semibold text-slate-300">
                Fecha de la grilla:
              </span>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => {
                  setLoadingDaily(true);
                  setSelectedDate(e.target.value);
                }}
                className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div className="flex items-center gap-3 w-full md:w-auto">
              <button
                onClick={() => setIsManualModalOpen(true)}
                className="w-full md:w-auto px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-xl text-sm flex items-center justify-center gap-2 transition shadow-lg shadow-emerald-500/20"
              >
                <Plus className="w-4 h-4" />
                Cargar Turno Manual
              </button>
              <button
                onClick={() => {
                  setLoadingDaily(true);
                  setRefreshGridKey((prev) => prev + 1);
                }}
                className="p-2 bg-slate-950 border border-slate-800 text-slate-300 hover:text-white rounded-xl transition"
                title="Refrescar"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
            </div>
          </div>

          {loadingDaily ? (
            <div className="text-center py-16 text-slate-400 text-sm">
              Cargando grilla del día...
            </div>
          ) : (
            <div className="overflow-x-auto bg-slate-900 border border-slate-800 rounded-2xl shadow-lg">
              <table className="w-full text-left border-collapse min-w-[700px]">
                <thead>
                  <tr className="border-b border-slate-800">
                    <th className="py-3 px-4 text-xs font-bold text-slate-400 uppercase tracking-wider w-24">
                      Horario
                    </th>
                    {courts.map((c) => (
                      <th
                        key={c.id}
                        className="py-3 px-4 text-sm font-bold text-white"
                      >
                        {c.name}
                        <span className="block text-[10px] text-emerald-400 font-normal">
                          {c.sport}
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {timeSlots.map((time) => (
                    <tr key={time} className="hover:bg-slate-950/40 transition">
                      <td className="py-3 px-4 text-xs font-semibold text-slate-400">
                        <div className="flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5 text-slate-500" />
                          {time} hs
                        </div>
                      </td>
                      {courts.map((court) => {
                        const booking = getBookingForSlot(court.id, time);

                        return (
                          <td key={court.id} className="py-2.5 px-3">
                            {booking ? (
                              <div
                                className={`p-2.5 rounded-xl border text-xs flex flex-col justify-between gap-1.5 transition ${
                                  booking.status === "COMPLETED"
                                    ? "bg-slate-950/80 border-slate-800 text-slate-500"
                                    : "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
                                }`}
                              >
                                <div className="flex justify-between items-start">
                                  <div className="flex items-center gap-1.5 font-bold">
                                    <User className="w-3.5 h-3.5 flex-shrink-0" />
                                    <span className="truncate max-w-[110px]">
                                      {booking.user
                                        ? `${booking.user.firstName || ""} ${booking.user.lastName || ""}`.trim() ||
                                          booking.user.name ||
                                          booking.user.email.split("@")[0]
                                        : "Cliente"}
                                    </span>
                                  </div>
                                  <span
                                    className={`text-[9px] px-1.5 py-0.5 rounded font-bold uppercase ${
                                      booking.paymentMethod === "TRANSFER"
                                        ? "bg-sky-500/20 text-sky-400"
                                        : "bg-amber-500/20 text-amber-400"
                                    }`}
                                  >
                                    {booking.paymentMethod === "TRANSFER"
                                      ? "MP"
                                      : "Efectivo"}
                                  </span>
                                </div>

                                <div className="flex items-center justify-between pt-1 border-t border-slate-800/60 text-[10px]">
                                  <span>
                                    $
                                    {Number(booking.totalPrice).toLocaleString(
                                      "es-AR",
                                    )}
                                  </span>

                                  <div className="flex items-center gap-1">
                                    {booking.status !== "COMPLETED" && (
                                      <button
                                        onClick={() =>
                                          handleDailyStatusChange(
                                            booking.id,
                                            "COMPLETED",
                                          )
                                        }
                                        className="p-1 hover:bg-emerald-500/30 text-emerald-400 rounded transition"
                                        title="Marcar como jugado"
                                      >
                                        <CheckCircle2 className="w-3.5 h-3.5" />
                                      </button>
                                    )}
                                    <button
                                      onClick={() =>
                                        handleDailyStatusChange(
                                          booking.id,
                                          "CANCELLED",
                                        )
                                      }
                                      className="p-1 hover:bg-rose-500/30 text-rose-400 rounded transition"
                                      title="Cancelar turno"
                                    >
                                      <XCircle className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                </div>
                              </div>
                            ) : (
                              <div className="h-10 rounded-lg border border-dashed border-slate-800 flex items-center justify-center text-[10px] text-slate-600 font-medium">
                                Libre
                              </div>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* 2. PESTAÑA: CANCHAS */}
      {activeTab === "courts" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-1 bg-slate-900 border border-slate-800 p-6 rounded-2xl shadow-lg h-fit">
            <h2 className="text-lg font-bold text-white mb-1 flex items-center gap-2">
              <PlusCircle className="w-5 h-5 text-emerald-400" />
              Nueva Cancha
            </h2>
            <p className="text-slate-400 text-xs mb-6">
              Agregá un nuevo espacio al catálogo
            </p>

            <form onSubmit={handleCreateCourt} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase mb-2">
                  Nombre de Cancha
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ej: Cancha 4 - Césped Sintético"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg py-2.5 px-3 text-white text-sm focus:outline-none focus:border-emerald-500 transition"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase mb-2">
                    Deporte
                  </label>
                  <select
                    value={sport}
                    onChange={(e) => setSport(e.target.value as Sport)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg py-2.5 px-2 text-white text-xs focus:outline-none focus:border-emerald-500 transition cursor-pointer"
                  >
                    <option value="FUTBOL_5">Fútbol</option>
                    <option value="PADEL">Pádel</option>
                    <option value="TENIS">Tenis</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase mb-2">
                    Superficie
                  </label>
                  <select
                    value={surface}
                    onChange={(e) => setSurface(e.target.value as Surface)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg py-2.5 px-2 text-white text-xs focus:outline-none focus:border-emerald-500 transition cursor-pointer"
                  >
                    <option value="SINTETICO">Sintético</option>
                    <option value="CEMENTO">Cemento</option>
                    <option value="POLVO_LADRILLO">Polvo Ladrillo</option>
                    <option value="PARQUET">Parquet</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase mb-2">
                  Precio por Turno ($)
                </label>
                <input
                  type="number"
                  required
                  min={1000}
                  step={500}
                  value={pricePerSlot}
                  onChange={(e) => setPricePerSlot(Number(e.target.value))}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg py-2.5 px-3 text-white text-sm focus:outline-none focus:border-emerald-500 transition"
                />
              </div>

              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="isIndoor"
                  checked={isIndoor}
                  onChange={(e) => setIsIndoor(e.target.checked)}
                  className="w-4 h-4 rounded text-emerald-500 focus:ring-0 bg-slate-950 border-slate-800 cursor-pointer"
                />
                <label
                  htmlFor="isIndoor"
                  className="text-xs text-slate-300 cursor-pointer"
                >
                  Cancha Techada (Indoor)
                </label>
              </div>

              <button
                type="submit"
                disabled={formLoading}
                className="w-full bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-bold py-2.5 rounded-lg text-sm transition mt-4 disabled:opacity-50"
              >
                {formLoading ? "Guardando..." : "Registrar Cancha"}
              </button>
            </form>
          </div>

          <div className="lg:col-span-2">
            <h2 className="text-lg font-bold text-white mb-4">
              Canchas Activas ({courts.length})
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {courts.map((court) => (
                <div
                  key={court.id}
                  className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex justify-between items-center shadow"
                >
                  <div>
                    <h3 className="font-bold text-white text-sm">
                      {court.name}
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {court.sport} • {court.surface}
                    </p>
                  </div>
                  <span className="text-emerald-400 font-bold text-sm">
                    ${Number(court.pricePerSlot).toLocaleString("es-AR")}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 3. PESTAÑA: TODAS LAS RESERVAS */}
      {activeTab === "bookings" && (
        <div>
          {loadingBookings ? (
            <div className="py-12 text-center text-slate-400 text-sm">
              Cargando reservas del complejo...
            </div>
          ) : allBookings.length === 0 ? (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center text-slate-400 text-sm">
              No hay reservas registradas en el sistema.
            </div>
          ) : (
            <div className="space-y-3">
              {allBookings.map((b) => {
                const startDate = new Date(b.startTime);
                const dateStr = startDate.toLocaleDateString("es-AR");
                const hours = startDate
                  .getUTCHours()
                  .toString()
                  .padStart(2, "0");
                const isCancelled = b.status === "CANCELLED";

                return (
                  <div
                    key={b.id}
                    className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-3 shadow"
                  >
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-bold text-white">
                          {b.court?.name || "Cancha"}
                        </span>
                        <span
                          className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                            isCancelled
                              ? "bg-red-500/20 text-red-400 border border-red-500/30"
                              : "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                          }`}
                        >
                          {b.status}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-slate-400">
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3.5 h-3.5 text-slate-500" />
                          {dateStr}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5 text-slate-500" />
                          {hours}:00 hs
                        </span>
                        <span className="flex items-center gap-1">
                          <MapPin className="w-3.5 h-3.5 text-slate-500" />
                          {b.court?.sport || "Deporte"}
                        </span>
                        {b.user?.email && (
                          <span className="text-slate-500">
                            ({b.user.name || b.user.email})
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center justify-between md:justify-end gap-4">
                      <span className="font-bold text-emerald-400 text-sm">
                        ${Number(b.totalPrice).toLocaleString("es-AR")}
                      </span>

                      {!isCancelled && (
                        <button
                          onClick={() => handleCancelBooking(b.id)}
                          className="px-2.5 py-1.5 bg-red-500/10 hover:bg-red-500 text-red-400 hover:text-white border border-red-500/30 text-xs font-semibold rounded-lg transition flex items-center gap-1"
                        >
                          <XCircle className="w-3.5 h-3.5" />
                          Cancelar
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Modal Cargar Turno Manual */}
      {isManualModalOpen && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl relative">
            <button
              onClick={() => setIsManualModalOpen(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-xl font-bold text-white mb-1">
              Registrar Turno Manual
            </h3>
            <p className="text-xs text-slate-400 mb-4">
              Cargá una reserva telefónica o presencial en el club
            </p>

            {manualError && (
              <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-xl flex items-center gap-2 text-red-400 text-xs">
                <ShieldAlert className="w-4 h-4 flex-shrink-0" />
                <span>{manualError}</span>
              </div>
            )}

            <form onSubmit={handleCreateManualBooking} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">
                  Cancha
                </label>
                <select
                  value={manualCourtId}
                  onChange={(e) => setManualCourtId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
                >
                  {courts.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.sport}) - $
                      {Number(c.pricePerSlot).toLocaleString("es-AR")}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">
                  Horario
                </label>
                <select
                  value={manualTime}
                  onChange={(e) => setManualTime(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
                >
                  {timeSlots.map((t) => (
                    <option key={t} value={t}>
                      {t} hs
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">
                  Método de Pago
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setManualPayment("CASH")}
                    className={`py-2 rounded-xl text-xs font-bold border transition ${
                      manualPayment === "CASH"
                        ? "bg-emerald-500/20 border-emerald-500 text-emerald-400"
                        : "bg-slate-950 border-slate-800 text-slate-400"
                    }`}
                  >
                    Efectivo
                  </button>
                  <button
                    type="button"
                    onClick={() => setManualPayment("TRANSFER")}
                    className={`py-2 rounded-xl text-xs font-bold border transition ${
                      manualPayment === "TRANSFER"
                        ? "bg-sky-500/20 border-sky-500 text-sky-400"
                        : "bg-slate-950 border-slate-800 text-slate-400"
                    }`}
                  >
                    Transferencia / MP
                  </button>
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsManualModalOpen(false)}
                  className="w-1/2 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold rounded-xl text-sm transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={manualLoading}
                  className="w-1/2 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-xl text-sm transition disabled:opacity-50"
                >
                  {manualLoading ? "Guardando..." : "Confirmar Turno"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
