export type Sport = "FUTBOL_5" | "FUTBOL_7" | "PADEL" | "TENIS";
export type Surface = "SINTETICO" | "CEMENTO" | "POLVO_LADRILLO" | "PARQUET";
export type BookingStatus = "CONFIRMED" | "CANCELLED";

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

export interface Booking {
  id: string;
  userId: string;
  courtId: string;
  startTime: string;
  endTime: string;
  totalPrice: string | number;
  status: BookingStatus;
  paymentMethod: string;
  court?: Court;
}

export interface User {
  id: string;
  email: string;
  name?: string;
  fullName?: string;
  role: "ADMIN" | "USER" | string;
  phone?: string;
}
