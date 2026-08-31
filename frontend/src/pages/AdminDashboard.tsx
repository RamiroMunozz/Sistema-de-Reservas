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
  startTime: string;
  endTime: string;
  status: "CONFIRMED" | "CANCELLED" | "PENDING";
  totalPrice: string | number;
  paymentMethod: string;
  court: {
    name: string;
    sport: string;
  };
  user?: {
    name?: string;
    email?: string;
  };
}

export const AdminDashboard: React.FC = () => {
  const [activeTab, setActiveTab] = useState<"courts" | "bookings">("courts");

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

  // Reservas del complejo
  const [allBookings, setAllBookings] = useState<AdminBooking[]>([]);
  const [loadingBookings, setLoadingBookings] = useState(false);

  // Estados generales
  const [formLoading, setFormLoading] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  // Cargar métricas y canchas existentes
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
          if (courtsRes.data.length > 0 && courtsRes.data[0].complexId) {
            setComplexId(courtsRes.data[0].complexId);
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

  // Cargar todas las reservas cuando se active la pestaña correspondiente
  useEffect(() => {
    let isMounted = true;

    if (activeTab === "bookings") {
      const loadAllBookings = async () => {
        try {
          const res = await api.get<AdminBooking[]>("/bookings");
          if (isMounted) {
            setAllBookings(res.data);
          }
        } catch (err) {
          console.error("Error al obtener reservas del sistema:", err);
        } finally {
          if (isMounted) {
            setLoadingBookings(false);
          }
        }
      };

      loadAllBookings();
    }

    return () => {
      isMounted = false;
    };
  }, [activeTab]);

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
      // Actualizar conteo de métricas localmente
      setMetrics((prev) =>
        prev
          ? {
              ...prev,
              confirmedCount: Math.max(0, prev.confirmedCount - 1),
              cancelledCount: prev.cancelledCount + 1,
            }
          : null,
      );
    } catch (err) {
      console.error("Error al cancelar reserva:", err);
      alert("No se pudo cancelar el turno.");
    }
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
              Métricas financieras, gestión del catálogo y control de turnos
            </p>
          </div>
        </div>

        {/* Pestañas de Navegación */}
        <div className="flex bg-slate-900 border border-slate-800 p-1 rounded-xl">
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
            onClick={() => {
              setLoadingBookings(true);
              setActiveTab("bookings");
            }}
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

      {/* Tarjetas de Métricas Financieras */}
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

      {/* Contenido según Pestaña Activa */}
      {activeTab === "courts" ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Formulario Alta de Cancha */}
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
                    <option value="FUTBOL_5">Fútbol 5</option>
                    <option value="FUTBOL_7">Fútbol 7</option>
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

          {/* Listado de Canchas Existentes */}
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
      ) : (
        /* Vista de Todas las Reservas */
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
                          {b.court.name}
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
                          {b.court.sport}
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
    </div>
  );
};
