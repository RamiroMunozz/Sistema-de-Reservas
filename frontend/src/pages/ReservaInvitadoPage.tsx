import React, { useEffect, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { isAxiosError } from "axios";
import {
  AlertCircle,
  CalendarDays,
  Check,
  Clock,
  Copy,
  CreditCard,
  RefreshCw,
  XCircle,
} from "lucide-react";
import api from "../api/axios";
import { mensajeDeError } from "../utils/mensajeDeError";
import type {
  BookingStatus,
  EstadoNavegacionReserva,
  EstadoSena,
  VistaPublicaReserva,
} from "../types/index";

// El estado de navegación llega como `unknown`: se valida antes de usarlo.
const esEstadoNavegacionReserva = (
  valor: unknown,
): valor is EstadoNavegacionReserva =>
  typeof valor === "object" &&
  valor !== null &&
  "initPoint" in valor &&
  typeof valor.initPoint === "string" &&
  valor.initPoint !== "";

// Cada cuánto se vuelve a consultar mientras la reserva está pendiente (el límite
// de consultas por token es de 60 cada 15 minutos).
const INTERVALO_DE_CONSULTA_MS = 20_000;

const ETIQUETAS_ESTADO: Record<BookingStatus, string> = {
  PENDING: "Pendiente de pago",
  CONFIRMED: "Confirmada",
  CANCELLED: "Cancelada",
  COMPLETED: "Jugada",
  EXPIRED: "Vencida",
};

const ESTILOS_ESTADO: Record<BookingStatus, string> = {
  PENDING: "bg-amber-500/20 text-amber-400 border border-amber-500/30",
  CONFIRMED: "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30",
  CANCELLED: "bg-red-500/20 text-red-400 border border-red-500/30",
  COMPLETED: "bg-slate-500/20 text-slate-300 border border-slate-500/30",
  EXPIRED: "bg-slate-500/20 text-slate-400 border border-slate-500/30",
};

const ETIQUETAS_SENA: Record<EstadoSena, string> = {
  PENDING: "Pendiente de pago",
  PAID: "Pagada",
  REFUNDED: "Reembolsada",
};

const dosDigitos = (numero: number): string => numero.toString().padStart(2, "0");

// Fecha y hora siempre en UTC: el navegador no debe correr el horario del turno.
const formatearFecha = (iso: string): string => {
  const fecha = new Date(iso);

  return `${dosDigitos(fecha.getUTCDate())}/${dosDigitos(fecha.getUTCMonth() + 1)}/${fecha.getUTCFullYear()}`;
};

const formatearHora = (iso: string): string => {
  const fecha = new Date(iso);

  return `${dosDigitos(fecha.getUTCHours())}:${dosDigitos(fecha.getUTCMinutes())}`;
};

const formatearCuentaRegresiva = (milisegundos: number): string => {
  const segundos = Math.max(0, Math.floor(milisegundos / 1000));

  return `${dosDigitos(Math.floor(segundos / 60))}:${dosDigitos(segundos % 60)}`;
};

const formatearMonto = (monto: number): string =>
  `$${monto.toLocaleString("es-AR")}`;

export const ReservaInvitadoPage: React.FC = () => {
  const { codigo = "" } = useParams<{ codigo: string }>();
  const location = useLocation();
  const estadoNavegacion: unknown = location.state;
  // Solo existe justo después de crear la reserva; al recargar se pierde.
  const initPointInicial = esEstadoNavegacionReserva(estadoNavegacion)
    ? estadoNavegacion.initPoint
    : null;
  const [enlaceCopiado, setEnlaceCopiado] = useState(false);
  const [vista, setVista] = useState<VistaPublicaReserva | null>(null);
  const [cargando, setCargando] = useState(true);
  const [noEncontrada, setNoEncontrada] = useState(false);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [errorAccion, setErrorAccion] = useState<string | null>(null);
  const [accionEnCurso, setAccionEnCurso] = useState(false);
  // Contador que dispara una nueva consulta desde el efecto de carga.
  const [recarga, setRecarga] = useState(0);
  // Instante de referencia de la cuenta regresiva; lo renueva un intervalo.
  const [ahora, setAhora] = useState<number>(() => Date.now());

  useEffect(() => {
    let montado = true;

    const consultar = async () => {
      try {
        const res = await api.get<VistaPublicaReserva>(
          `/public/bookings/${encodeURIComponent(codigo)}`,
        );

        if (!montado) return;
        setVista(res.data);
        setAhora(Date.now());
        setNoEncontrada(false);
        setErrorCarga(null);
      } catch (err: unknown) {
        if (!montado) return;

        if (isAxiosError(err) && err.response?.status === 404) {
          setNoEncontrada(true);
        } else {
          setErrorCarga(
            mensajeDeError(err, "No se pudo consultar la reserva. Intentá de nuevo."),
          );
        }
      } finally {
        if (montado) {
          setCargando(false);
        }
      }
    };

    consultar();

    return () => {
      montado = false;
    };
  }, [codigo, recarga]);

  const expiraEn =
    vista?.status === "PENDING" && vista.expiresAt
      ? new Date(vista.expiresAt).getTime()
      : null;
  const estaPendiente = vista?.status === "PENDING";

  // Cuenta regresiva: el intervalo renueva `ahora` cada segundo hasta que vence.
  useEffect(() => {
    if (expiraEn === null) return;

    const intervalo = setInterval(() => setAhora(Date.now()), 1000);

    return () => clearInterval(intervalo);
  }, [expiraEn]);

  // Mientras está pendiente se vuelve a consultar, para ver la confirmación del pago.
  useEffect(() => {
    if (!estaPendiente) return;

    const intervalo = setInterval(
      () => setRecarga((anterior) => anterior + 1),
      INTERVALO_DE_CONSULTA_MS,
    );

    return () => clearInterval(intervalo);
  }, [estaPendiente]);

  const vencidaEnPantalla = expiraEn !== null && ahora >= expiraEn;
  const estado: BookingStatus | null = vista
    ? vencidaEnPantalla
      ? "EXPIRED"
      : vista.status
    : null;

  const manejarCancelacion = async () => {
    if (!vista) return;

    const advertencia = vista.refundAtOwnerDiscretion
      ? "\n\nAtención: la devolución de la seña queda a criterio del canchero o dueño y no es automática."
      : "";

    if (!window.confirm(`¿Querés cancelar la reserva?${advertencia}`)) return;

    setAccionEnCurso(true);
    setErrorAccion(null);

    try {
      const res = await api.patch<VistaPublicaReserva>(
        `/public/bookings/${encodeURIComponent(codigo)}/cancel`,
      );

      setVista(res.data);
      setAhora(Date.now());
    } catch (err: unknown) {
      setErrorAccion(mensajeDeError(err, "No se pudo cancelar la reserva."));
    } finally {
      setAccionEnCurso(false);
    }
  };

  const manejarCopiarEnlace = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setEnlaceCopiado(true);
    } catch {
      setErrorAccion("No se pudo copiar el enlace. Copialo desde el recuadro.");
    }
  };

  const manejarPago = async () => {
    // Recién creada la reserva ya se tiene el link de pago: no se pide otro.
    if (initPointInicial) {
      window.location.href = initPointInicial;
      return;
    }

    setAccionEnCurso(true);
    setErrorAccion(null);

    try {
      const res = await api.post<{ initPoint: string }>(
        `/public/bookings/${encodeURIComponent(codigo)}/payment`,
      );

      if (res.data.initPoint) {
        window.location.href = res.data.initPoint;
        return;
      }

      setErrorAccion("No se pudo obtener el link de pago de Mercado Pago.");
    } catch (err: unknown) {
      setErrorAccion(mensajeDeError(err, "No se pudo generar el link de pago."));
    }

    setAccionEnCurso(false);
  };

  if (cargando) {
    return (
      <div className="max-w-xl mx-auto px-4 py-12 text-center text-slate-400 text-sm">
        Cargando tu reserva...
      </div>
    );
  }

  if (noEncontrada) {
    return (
      <div className="max-w-xl mx-auto px-4 py-12">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center">
          <AlertCircle className="w-8 h-8 text-slate-500 mx-auto mb-3" />
          <h1 className="text-xl font-bold text-white mb-2">
            Reserva no encontrada
          </h1>
          <p className="text-sm text-slate-400 mb-6">
            El enlace no corresponde a ninguna reserva. Revisá que esté completo.
          </p>
          <Link
            to="/"
            className="inline-block px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-xl text-sm transition"
          >
            Ver turnos disponibles
          </Link>
        </div>
      </div>
    );
  }

  if (!vista || !estado) {
    return (
      <div className="max-w-xl mx-auto px-4 py-12">
        <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-xl flex items-center gap-2 text-red-400 text-sm">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{errorCarga ?? "No se pudo consultar la reserva."}</span>
        </div>
        <button
          onClick={() => {
            setCargando(true);
            setRecarga((anterior) => anterior + 1);
          }}
          className="mt-4 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-sm transition"
        >
          Reintentar
        </button>
      </div>
    );
  }

  const esPendienteVigente = estado === "PENDING" && !vencidaEnPantalla;
  const puedeCancelar =
    !vencidaEnPantalla && (estado === "PENDING" || estado === "CONFIRMED");

  return (
    <div className="max-w-xl mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-white mb-1">Tu reserva</h1>
        <p className="text-slate-400 text-sm">
          {vista.guestFirstName ? `Hola ${vista.guestFirstName}. ` : ""}
          Guardá este enlace: es la única forma de volver a ver tu reserva.
        </p>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-lg space-y-4">
        <div className="flex justify-between items-start">
          <div>
            <h2 className="text-lg font-bold text-white">{vista.court.name}</h2>
            <p className="text-xs text-slate-400">{vista.court.sport}</p>
          </div>
          <span
            className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${ESTILOS_ESTADO[estado]}`}
          >
            {ETIQUETAS_ESTADO[estado]}
          </span>
        </div>

        <div className="flex flex-wrap gap-4 text-sm text-slate-200 py-3 border-y border-slate-800">
          <span className="flex items-center gap-2">
            <CalendarDays className="w-4 h-4 text-emerald-400" />
            {formatearFecha(vista.startTime)}
          </span>
          <span className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-emerald-400" />
            {formatearHora(vista.startTime)} a {formatearHora(vista.endTime)} hs
          </span>
        </div>

        <dl className="space-y-2 text-sm">
          <div className="flex justify-between">
            <dt className="text-slate-400">Precio del turno</dt>
            <dd className="text-slate-200">{formatearMonto(vista.totalPrice)}</dd>
          </div>
          {vista.depositAmount !== null && (
            <div className="flex justify-between">
              <dt className="text-slate-400">Seña</dt>
              <dd className="text-slate-200">
                {formatearMonto(vista.depositAmount)}
                {vista.depositStatus && (
                  <span className="text-slate-400">
                    {" "}
                    ({ETIQUETAS_SENA[vista.depositStatus]})
                  </span>
                )}
              </dd>
            </div>
          )}
        </dl>

        {esPendienteVigente && initPointInicial && (
          <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-4 space-y-2">
            <p className="text-sm font-semibold text-emerald-300">
              Guardá este enlace antes de pagar
            </p>
            <p className="text-xs text-slate-300">
              Es la única forma de volver a ver o cancelar tu reserva.
            </p>
            <p className="text-xs text-slate-200 font-mono break-all bg-slate-950 border border-slate-800 rounded-lg p-2 select-all">
              {window.location.href}
            </p>
            <button
              onClick={manejarCopiarEnlace}
              className="w-full py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-2 border border-slate-700"
            >
              {enlaceCopiado ? (
                <Check className="w-3 h-3" />
              ) : (
                <Copy className="w-3 h-3" />
              )}
              {enlaceCopiado ? "Enlace copiado" : "Copiar enlace"}
            </button>
          </div>
        )}

        {esPendienteVigente && expiraEn !== null && (
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 text-sm text-amber-300 flex justify-between items-center">
            <span>Tiempo restante para pagar la seña</span>
            <span className="font-mono font-bold">
              {formatearCuentaRegresiva(expiraEn - ahora)}
            </span>
          </div>
        )}

        {estado === "EXPIRED" && (
          <p className="text-sm text-slate-400">
            La reserva venció porque no se pagó la seña a tiempo. El turno quedó
            libre.
          </p>
        )}

        {estado === "CANCELLED" && (
          <div className="space-y-3">
            {vista.refundAtOwnerDiscretion && (
              <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl text-xs text-amber-300">
                La devolución de la seña queda a criterio del canchero o dueño
                y no es automática.
              </div>
            )}
            <p className="text-sm text-slate-400">
              Una reserva cancelada no se puede pagar: para reservar tenés que
              hacer una reserva nueva.
            </p>
          </div>
        )}

        {errorAccion && (
          <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl flex items-center gap-2 text-red-400 text-xs">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{errorAccion}</span>
          </div>
        )}

        <div className="space-y-3">
          {esPendienteVigente && (
            <button
              onClick={manejarPago}
              disabled={accionEnCurso}
              className="w-full py-3 bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold rounded-xl transition text-sm flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <CreditCard className="w-4 h-4" />
              {accionEnCurso ? "Generando link..." : "Pagar la seña"}
            </button>
          )}

          {puedeCancelar && (
            <button
              onClick={manejarCancelacion}
              disabled={accionEnCurso}
              className="w-full py-3 bg-slate-800 hover:bg-slate-700 text-white font-bold rounded-xl transition text-sm flex items-center justify-center gap-2 border border-slate-700 disabled:opacity-50"
            >
              <XCircle className="w-4 h-4" />
              Cancelar reserva
            </button>
          )}

          {estado === "CANCELLED" && (
            <Link
              to="/"
              className="w-full py-3 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-xl transition text-sm flex items-center justify-center"
            >
              Reservar de nuevo
            </Link>
          )}

          <button
            onClick={() => setRecarga((anterior) => anterior + 1)}
            className="w-full py-2 text-xs text-slate-400 hover:text-white flex items-center justify-center gap-2"
          >
            <RefreshCw className="w-3 h-3" />
            Actualizar estado
          </button>
        </div>
      </div>
    </div>
  );
};
