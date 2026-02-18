export interface ApiListaResponse<T> {
  items: T[];
  total: number;
}

export interface ClienteOtItemDto {
  codigo: string;
  estado: string;
  tipo: string;
  updatedAt: string;
}

export interface HistorialItemDto {
  fecha: string;
  evento: string;
  descripcion: string;
  usuario: { nombre: string };
}

export interface NotaDto {
  id: string;
  contenido: string;
  createdAt: string;
}

export interface FotoDto {
  id: string;
  url: string;
  createdAt: string;
}

export interface PresupuestoDto {
  id: string;
  estado: string;
  importe: number;
  detalle: string;
  aceptacionCheck: boolean;
  sentAt?: string | null;
  respondedAt?: string | null;
}

export interface PagoDto {
  id: string;
  estado: string;
  importe: number;
  comprobanteUrl?: string | null;
}

export interface CitaDto {
  id: string;
  inicio: string;
  fin: string;
  estado: string;
}

export interface MensajeDto {
  id: string;
  remitenteTipo: string;
  remitenteNombre: string;
  contenido: string;
  createdAt: string;
}

export interface ClienteResumenDto {
  id: string;
  nombre: string;
  telefono?: string | null;
  email?: string | null;
}

export interface OtDetalleDto {
  id: string;
  codigo: string;
  estado: string;
  tipo: string;
  prioridad: string;
  descripcion: string;

  cliente: ClienteResumenDto;
  tecnico: any | null;

  fechaPrevista?: string | null;
  direccion?: string | null;
  notasAcceso?: string | null;

  notas: NotaDto[];
  fotos: FotoDto[];
  historial: HistorialItemDto[];

  presupuesto?: PresupuestoDto | null;
  pago?: PagoDto | null;
  citas: CitaDto[];
  mensajes: MensajeDto[];

  createdAt: string;
  updatedAt: string;
}

export interface TicketListaItemDto {
  id: string;
  estado: string;
  asunto: string;
  updatedAt: string;
}

export interface TicketDetalleDto {
  id: string;
  estado: string;
  asunto: string;
  descripcion: string;
  mensajes: MensajeDto[];
  createdAt: string;
  updatedAt: string;
}
