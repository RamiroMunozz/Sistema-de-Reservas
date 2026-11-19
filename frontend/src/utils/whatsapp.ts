/** Datos mínimos para armar el mensaje de contacto con un invitado (ADM-016). */
export interface DatosContactoWhatsApp {
  telefono: string;
  nombreInvitado: string;
  nombreCancha: string;
  /** Inicio del turno en ISO 8601 UTC. */
  inicio: string;
}

/** Deja solo los dígitos del teléfono (quita espacios, guiones, paréntesis y el `+`). */
export const normalizarTelefono = (telefono: string): string =>
  telefono.replace(/\D/g, "");

const dosDigitos = (valor: number): string => String(valor).padStart(2, "0");

/** Fecha y hora del turno en UTC, con métodos UTC nativos: `dd/mm/aaaa a las HH:MM hs`. */
export const formatearTurnoUTC = (inicio: string): string => {
  const fecha = new Date(inicio);
  const dia = `${dosDigitos(fecha.getUTCDate())}/${dosDigitos(fecha.getUTCMonth() + 1)}/${fecha.getUTCFullYear()}`;
  const hora = `${dosDigitos(fecha.getUTCHours())}:${dosDigitos(fecha.getUTCMinutes())}`;
  return `${dia} a las ${hora} hs`;
};

/**
 * Arma `https://wa.me/<dígitos>?text=<mensaje codificado>`. No usa la API de
 * WhatsApp Business (DP-13). Devuelve `null` si el teléfono no tiene dígitos.
 */
export const armarEnlaceWhatsApp = ({
  telefono,
  nombreInvitado,
  nombreCancha,
  inicio,
}: DatosContactoWhatsApp): string | null => {
  const digitos = normalizarTelefono(telefono);
  if (!digitos) return null;

  const mensaje = `Hola ${nombreInvitado}, te escribimos por tu reserva en ${nombreCancha} el ${formatearTurnoUTC(inicio)}.`;
  return `https://wa.me/${digitos}?text=${encodeURIComponent(mensaje)}`;
};
