import { Component, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { Router } from '@angular/router';

import { MatToolbarModule } from '@angular/material/toolbar';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatCardModule } from '@angular/material/card';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatDividerModule } from '@angular/material/divider';
import { MatChipsModule } from '@angular/material/chips';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatCheckboxModule } from '@angular/material/checkbox';

import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';

import { environment } from '../../../environments/environment';
import { AuthService } from '../../core/auth.service';
import { OtService } from '../../core/ot.service';
import { TicketsService } from '../../core/tickets.service';

import {
  ClienteOtItemDto,
  OtDetalleDto,
  TicketListaItemDto,
  MensajeDto
} from '../../core/models';

import { TicketDialogComponent } from './ticket-dialog/ticket-dialog.component';

@Component({
  selector: 'app-portal',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,

    MatToolbarModule, MatButtonModule, MatIconModule,
    MatCardModule, MatProgressBarModule, MatDividerModule,
    MatChipsModule, MatFormFieldModule, MatInputModule,
    MatSnackBarModule, MatDialogModule, MatCheckboxModule,

    MatDatepickerModule, MatNativeDateModule
  ],
  templateUrl: './portal.component.html',
  styleUrls: ['./portal.component.scss']
})
export class PortalComponent {
  apiBase = environment.apiBaseUrl;

  private fb = inject(FormBuilder);

  loading = signal(false);
  actionBusy = signal(false);

  ots = signal<ClienteOtItemDto[]>([]);
  tickets = signal<TicketListaItemDto[]>([]);
  selectedOtDetalle = signal<OtDetalleDto | null>(null);

  // Presupuesto aceptación
  aceptoCheck = signal(false);

  // Mensajes OT
  msgForm = this.fb.group({
    contenido: ['', [Validators.required, Validators.minLength(1)]]
  });

  // Citas (datepicker + time)
  citaInicioFecha = signal<Date | null>(null);
  citaInicioHora = signal<string>(''); // "HH:mm"
  citaFinFecha = signal<Date | null>(null);
  citaFinHora = signal<string>('');    // "HH:mm"

  // Pago comprobante
  pagoFile = signal<File | null>(null);

  constructor(
    private auth: AuthService,
    private otService: OtService,
    private ticketsService: TicketsService,
    private snack: MatSnackBar,
    private router: Router,
    private dialog: MatDialog
  ) {
    this.refreshAll();
  }

  // -----------------------
  // Helpers UI
  // -----------------------
  trackById(_: number, item: any) {
    return item?.id ?? item?.codigo ?? item?.fecha ?? _;
  }

  selectedOtCodigo(): string | null {
    return this.selectedOtDetalle()?.codigo ?? null;
  }

  refreshDetalle() {
    const ot = this.selectedOtDetalle();
    if (!ot) return;
    this.loadDetalle(ot.codigo);
  }

  isClienteMsg(m: MensajeDto): boolean {
    // Ajusta a tu backend: si remitenteTipo viene como "CLIENTE"
    return (m.remitenteTipo || '').toUpperCase() === 'CLIENTE';
  }

  // -----------------------
  // Carga datos
  // -----------------------
  async refreshAll() {
    await Promise.all([this.loadOts(), this.loadTickets()]);
  }

  async loadOts() {
    const clienteId = this.auth.getClienteId();
    if (!clienteId) return;

    this.loading.set(true);
    try {
      const res = await this.otService.listarMisOts(clienteId, 0, 50);
      this.ots.set(res.items);

      if (!this.selectedOtDetalle() && res.items.length > 0) {
        await this.loadDetalle(res.items[0].codigo);
      }
    } catch {
      this.snack.open('No se pudieron cargar las órdenes', 'OK', { duration: 2500 });
    } finally {
      this.loading.set(false);
    }
  }

  async selectOt(ot: ClienteOtItemDto) {
    await this.loadDetalle(ot.codigo);
  }

  async loadDetalle(idOrCodigo: string) {
    this.loading.set(true);
    try {
      const d = await this.otService.obtenerDetalle(idOrCodigo);
      this.selectedOtDetalle.set(d);
      this.aceptoCheck.set(false);

      // reset cita fields (opcional, para no confundir)
      this.citaInicioFecha.set(null);
      this.citaInicioHora.set('');
      this.citaFinFecha.set(null);
      this.citaFinHora.set('');

    } catch {
      this.snack.open('No se pudo cargar el detalle de la OT', 'OK', { duration: 2500 });
    } finally {
      this.loading.set(false);
    }
  }

  logout() {
    this.auth.logout();
    this.router.navigateByUrl('/login');
  }

  // -----------------------
  // Tickets (solo solicitud inicial)
  // -----------------------
  async loadTickets() {
    this.loading.set(true);
    try {
      const res = await this.ticketsService.listar(0, 50);
      this.tickets.set(res.items);
    } catch {
      this.snack.open('No se pudieron cargar los tickets', 'OK', { duration: 2500 });
    } finally {
      this.loading.set(false);
    }
  }

  openNewTicket() {
    const ref = this.dialog.open(TicketDialogComponent, {
      width: '640px',
      maxWidth: '92vw',
      data: { mode: 'new' }
    });
    ref.afterClosed().subscribe(async (ok: boolean) => {
      if (ok) await this.loadTickets();
    });
  }

  async openTicket(ticketId: string) {
    const detail = await this.ticketsService.obtener(ticketId);
    const ref = this.dialog.open(TicketDialogComponent, {
      width: '720px',
      maxWidth: '92vw',
      data: { mode: 'view', ticket: detail }
    });
    ref.afterClosed().subscribe(async (ok: boolean) => {
      if (ok) await this.loadTickets();
    });
  }

  // -----------------------
  // Presupuesto
  // -----------------------
  async aceptar(otId: string) {
    if (!this.aceptoCheck()) return;
    this.actionBusy.set(true);
    try {
      await this.otService.aceptarPresupuesto(otId);
      await this.loadDetalle(otId);
      this.snack.open('Presupuesto aceptado', 'OK', { duration: 1500 });
    } catch {
      this.snack.open('No se pudo aceptar el presupuesto', 'OK', { duration: 2500 });
    } finally {
      this.actionBusy.set(false);
    }
  }

  async rechazar(otId: string) {
    this.actionBusy.set(true);
    try {
      await this.otService.rechazarPresupuesto(otId);
      await this.loadDetalle(otId);
      this.snack.open('Presupuesto rechazado', 'OK', { duration: 1500 });
    } catch {
      this.snack.open('No se pudo rechazar el presupuesto', 'OK', { duration: 2500 });
    } finally {
      this.actionBusy.set(false);
    }
  }

  // -----------------------
  // Pago
  // -----------------------
  async marcarTransferencia(otId: string) {
    this.actionBusy.set(true);
    try {
      await this.otService.marcarTransferencia(otId);
      await this.loadDetalle(otId);
      this.snack.open('Marcado como transferencia', 'OK', { duration: 1500 });
    } catch {
      this.snack.open('No se pudo marcar transferencia', 'OK', { duration: 2500 });
    } finally {
      this.actionBusy.set(false);
    }
  }

  onPagoFileSelected(ev: Event) {
    const input = ev.target as HTMLInputElement;
    this.pagoFile.set(input.files?.[0] ?? null);
    input.value = '';
  }

  async uploadComprobante(otId: string) {
    const f = this.pagoFile();
    if (!f) return;
    this.actionBusy.set(true);
    try {
      await this.otService.subirComprobantePago(otId, f);
      this.pagoFile.set(null);
      await this.loadDetalle(otId);
      this.snack.open('Comprobante subido', 'OK', { duration: 1500 });
    } catch {
      this.snack.open('Error al subir comprobante', 'OK', { duration: 2500 });
    } finally {
      this.actionBusy.set(false);
    }
  }

  // -----------------------
  // Citas (datepicker + time)
  // -----------------------
  async reservarCita(otId: string) {
    const inicio = this.combineDateTimeToIso(this.citaInicioFecha(), this.citaInicioHora());
    const fin = this.combineDateTimeToIso(this.citaFinFecha(), this.citaFinHora());

    if (!inicio || !fin) {
      this.snack.open('Selecciona fecha y hora de inicio/fin', 'OK', { duration: 2000 });
      return;
    }

    this.actionBusy.set(true);
    try {
      await this.otService.reservarCita(otId, inicio, fin);
      await this.loadDetalle(otId);
      this.snack.open('Cita reservada', 'OK', { duration: 1500 });
    } catch {
      this.snack.open('No se pudo reservar la cita', 'OK', { duration: 2500 });
    } finally {
      this.actionBusy.set(false);
    }
  }

  async reprogramarPrimera(ot: OtDetalleDto) {
    const first = ot.citas[0]; // ✅ tu modelo dice citas: CitaDto[]
    if (!first) {
      this.snack.open('No hay citas para reprogramar', 'OK', { duration: 2000 });
      return;
    }

    const inicio = this.combineDateTimeToIso(this.citaInicioFecha(), this.citaInicioHora());
    const fin = this.combineDateTimeToIso(this.citaFinFecha(), this.citaFinHora());

    if (!inicio || !fin) {
      this.snack.open('Selecciona fecha y hora de inicio/fin', 'OK', { duration: 2000 });
      return;
    }

    this.actionBusy.set(true);
    try {
      await this.otService.reprogramarCita(first.id, inicio, fin);
      await this.loadDetalle(ot.id);
      this.snack.open('Cita reprogramada', 'OK', { duration: 1500 });
    } catch {
      this.snack.open('No se pudo reprogramar', 'OK', { duration: 2500 });
    } finally {
      this.actionBusy.set(false);
    }
  }

  private combineDateTimeToIso(date: Date | null, time: string): string | null {
    if (!date || !time) return null;
    const [hh, mm] = time.split(':').map(Number);
    const d = new Date(date);
    d.setHours(hh || 0, mm || 0, 0, 0);
    return d.toISOString();
  }

  // -----------------------
  // Chat OT (principal)
  // -----------------------
  async sendMsgOt(otId: string) {
    if (this.msgForm.invalid) return;

    const contenido = (this.msgForm.value.contenido ?? '').trim();
    if (!contenido) return;

    this.actionBusy.set(true);
    try {
      await this.otService.enviarMensaje(otId, contenido);
      this.msgForm.reset();
      await this.loadDetalle(otId);
      this.snack.open('Mensaje enviado', 'OK', { duration: 1200 });
    } catch {
      this.snack.open('No se pudo enviar el mensaje', 'OK', { duration: 2500 });
    } finally {
      this.actionBusy.set(false);
    }
  }
}
