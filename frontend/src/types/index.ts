export type Sport = "FUTBOL_5" | "FUTBOL_7" | "PADEL" | "TENIS";
export type Surface = "SINTETICO" | "CEMENTO" | "POLVO_LADRILLO" | "PARQUET";
export type BookingStatus =
  | "PENDING"
  | "CONFIRMED"
  | "CANCELLED"
  | "COMPLETED"
  | "EXPIRED";
export type EstadoSena = "PENDING" | "PAID" | "REFUNDED";
export type RefundReason =
  | "AMOUNT_MISMATCH"
  | "SLOT_TAKEN"
  | "PAID_AFTER_CANCEL"
  | "DUPLICATE_PAYMENT"
  | "OWNER_DISCRETION";

export interface Complex {
  id: string;
  name: string;
  address: string;
  city: string;
  phone: string;
}

export interface Court {
  id: string;
  complexId: string;
  name: string;
  sport: Sport;
  surface: Surface;
  pricePerSlot: string | number;
  isIndoor: boolean;
  isActive: boolean;
  complex?: Complex;
}

export interface TimeSlot {
  startTime: string;
  endTime: string;
  isAvailable: boolean;
}

/** Pago registrado de una reserva, tal como lo ve el administrador (PAG-026). */
export interface BookingPayment {
  id: string;
  mpPaymentId: string;
  amount: number;
  isValid: boolean;
  refundReason: RefundReason | null;
  refundedAt: string | null;
  createdAt: string;
}

export interface Booking {
  id: string;
  userId: string | null;
  courtId: string;
  startTime: string;
  endTime: string;
  totalPrice: string | number;
  status: BookingStatus;
  paymentMethod: string;
  guestFirstName?: string | null;
  guestLastName?: string | null;
  guestPhone?: string | null;
  guestEmail?: string | null;
  expiresAt?: string | null;
  depositAmount?: number | null;
  depositStatus?: EstadoSena | null;
  payments?: BookingPayment[];
  court?: Court;
}

/** Datos del invitado para `POST /public/bookings` (RES-020). */
export interface DatosInvitado {
  guestFirstName: string;
  guestLastName: string;
  guestPhone: string;
  guestEmail?: string;
}

/** Cuerpo de `POST /public/bookings`. */
export interface CrearReservaInvitadoPayload extends DatosInvitado {
  courtId: string;
  startTime: string;
  endTime: string;
}

/** Respuesta de `POST /public/bookings`. */
export interface ReservaInvitadoCreada {
  token: string;
  initPoint: string;
}

/** Estado de navegación hacia `/reserva/<token>` tras crear la reserva (RES-020). */
export interface EstadoNavegacionReserva {
  initPoint: string;
}

/** Vista pública de la reserva por token (RES-028). */
export interface VistaPublicaReserva {
  status: BookingStatus;
  startTime: string;
  endTime: string;
  expiresAt: string | null;
  totalPrice: number;
  depositAmount: number | null;
  depositStatus: EstadoSena | null;
  guestFirstName: string | null;
  refundAtOwnerDiscretion: boolean;
  court: { name: string; sport: string };
}

export interface User {
  id: string;
  email: string;
  name?: string;
  fullName?: string;
  role: "ADMIN" | "USER" | string;
  phone?: string;
}
