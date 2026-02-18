import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

import { environment } from '../../environments/environment';
import { ApiListaResponse, TicketDetalleDto, TicketListaItemDto } from './models';

@Injectable({ providedIn: 'root' })
export class TicketsService {
  private base = environment.apiBaseUrl;
  constructor(private http: HttpClient) {}

  listar(page = 0, size = 20) {
    const url = `${this.base}/api/v1/tickets?page=${page}&size=${size}`;
    return firstValueFrom(this.http.get<ApiListaResponse<TicketListaItemDto>>(url));
  }

  obtener(id: string) {
    const url = `${this.base}/api/v1/tickets/${id}`;
    return firstValueFrom(this.http.get<TicketDetalleDto>(url));
  }

  crear(asunto: string, descripcion: string) {
    const url = `${this.base}/api/v1/tickets`;
    return firstValueFrom(this.http.post<TicketDetalleDto>(url, { asunto, descripcion }));
  }

  anadirMensaje(id: string, contenido: string) {
    const url = `${this.base}/api/v1/tickets/${id}/mensajes`;
    return firstValueFrom(this.http.post(url, { contenido }, { responseType: 'text' as const }));
  }
}
