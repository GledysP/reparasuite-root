import { Component, signal, inject, computed, ViewChild, ElementRef, AfterViewChecked } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators, FormControl } from '@angular/forms';
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
import { MatTabsModule } from '@angular/material/tabs';
import { MatSelectModule } from '@angular/material/select';
import { MatTooltipModule } from '@angular/material/tooltip';

import { environment } from '../../../environments/environment';
import { AuthService } from '../../core/auth.service';
import { OtService } from '../../core/ot.service';
import { TicketsService } from '../../core/tickets.service';

import {
  ClienteOtItemDto,
  OtDetalleDto,
  TicketListaItemDto,
  MensajeDto,
  HistorialItemDto,
  CitaDto
} from '../../core/models';

import { TicketDialogComponent } from './ticket-dialog/ticket-dialog.component';

type StepKey = 'RECIBIDA' | 'PRESUPUESTO' | 'APROBADA' | 'EN_CURSO' | 'FINALIZADA';

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
    MatDatepickerModule, MatNativeDateModule,
    MatTabsModule, MatSelectModule, MatTooltipModule
  ],
  templateUrl: './portal.component.html',
  styleUrls: ['./portal.component.scss']
})
export class PortalComponent implements AfterViewChecked {
  @ViewChild('chatScroll') private chatContainer!: ElementRef;

  apiBase = environment.apiBaseUrl;
  private fb = inject(FormBuilder);

  loading = signal(false);
  actionBusy = signal(false);

  ots = signal<ClienteOtItemDto[]>([]);
  tickets = signal<TicketListaItemDto[]>([]);
  selectedOtDetalle = signal<OtDetalleDto | null>(null);

  selectedOtCodigoSignal = signal<string | null>(null);
  aceptoCheck = signal(false);

  msgForm = this.fb.group({
    contenido: ['', [Validators.required, Validators.minLength(1)]]
  });

  citaInicioFecha = signal<Date | null>(null);
  citaInicioHora = signal<string>(''); 
  citaDuracionMinutos = 60;

  pagoFile = signal<File | null>(null);
  gestionTabIndex = signal(0);

  readonly steps: { key: StepKey; label: string; icon: string }[] = [
    { key: 'RECIBIDA', label: 'Recibida', icon: 'inventory_2' },
    { key: 'PRESUPUESTO', label: 'Presupuesto', icon: 'request_quote' },
    { key: 'APROBADA', label: 'Aprobada', icon: 'verified' },
    { key: 'EN_CURSO', label: 'En curso', icon: 'build' },
    { key: 'FINALIZADA', label: 'Finalizada', icon: 'task_alt' }
  ];

  stepIndex = computed(() => {
    const estado = (this.selectedOtDetalle()?.estado || '').toUpperCase();
    const map: Record<string, StepKey> = {
      'RECIBIDA': 'RECIBIDA', 'NUEVA': 'RECIBIDA',
      'PRESUPUESTO': 'PRESUPUESTO', 'ENVIADO': 'PRESUPUESTO',
      'APROBADA': 'APROBADA', 'ACEPTADO': 'APROBADA',
      'EN_CURSO': 'EN_CURSO', 'REPARANDO': 'EN_CURSO',
      'FINALIZADA': 'FINALIZADA', 'TERMINADA': 'FINALIZADA', 'LISTO': 'FINALIZADA'
    };
    const key = map[estado] ?? 'RECIBIDA';
    return Math.max(0, this.steps.findIndex(s => s.key === key));
  });

  nextCita = computed<CitaDto | null>(() => {
    const ot = this.selectedOtDetalle();
    const citas = ot?.citas ?? [];
    if (!citas.length) return null;
    const sorted = [...citas].sort((a, b) => (a.inicio || '').localeCompare(b.inicio || ''));
    return sorted[0] ?? null;
  });

  comprobanteHref = computed<string | null>(() => {
    const ot = this.selectedOtDetalle();
    const url = ot?.pago?.comprobanteUrl ?? null;
    if (!url) return null;
    if (/^https?:\/\//i.test(url)) return url;
    const base = (this.apiBase || '').replace(/\/$/, '');
    const path = url.startsWith('/') ? url : `/${url}`;
    return `${base}${path}`;
  });

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

  ngAfterViewChecked() {
    this.scrollToBottom();
  }

  private scrollToBottom(): void {
    try {
      if (this.chatContainer) {
        this.chatContainer.nativeElement.scrollTop = this.chatContainer.nativeElement.scrollHeight;
      }
    } catch (err) {}
  }

  trackById(_: number, item: any) {
    return item?.id ?? item?.codigo ?? item?.fecha ?? item?.createdAt ?? _;
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
    return (m.remitenteTipo || '').toUpperCase() === 'CLIENTE';
  }

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
      if (!this.selectedOtCodigoSignal() && res.items.length > 0) {
        this.selectedOtCodigoSignal.set(res.items[0].codigo);
      }
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
    this.selectedOtCodigoSignal.set(ot.codigo);
    await this.loadDetalle(ot.codigo);
  }

  async onOtSelectChange(codigo: string) {
    if (!codigo) return;
    this.selectedOtCodigoSignal.set(codigo);
    await this.loadDetalle(codigo);
  }

  async loadDetalle(idOrCodigo: string) {
    this.loading.set(true);
    try {
      const d = await this.otService.obtenerDetalle(idOrCodigo);
      this.selectedOtDetalle.set(d);
      this.aceptoCheck.set(false);
      if (d?.citas?.length) this.gestionTabIndex.set(1);
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

  // --- TICKETS ---
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
    try {
      const detail = await this.ticketsService.obtener(ticketId);
      const ref = this.dialog.open(TicketDialogComponent, {
        width: '720px',
        maxWidth: '92vw',
        data: { mode: 'view', ticket: detail }
      });
      ref.afterClosed().subscribe(async (ok: boolean) => {
        if (ok) await this.loadTickets();
      });
    } catch {
      this.snack.open('No se pudo cargar el ticket', 'OK', { duration: 2500 });
    }
  }

  // --- ACCIONES OT ---
  async aceptar(otId: string) {
    if (!this.aceptoCheck()) return;
    this.actionBusy.set(true);
    try {
      await this.otService.aceptarPresupuesto(otId);
      await this.loadDetalle(otId);
      this.snack.open('Presupuesto aceptado', 'OK', { duration: 1500 });
    } catch {
      this.snack.open('Error al aceptar', 'OK', { duration: 2500 });
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
      this.snack.open('Error al rechazar', 'OK', { duration: 2500 });
    } finally {
      this.actionBusy.set(false);
    }
  }

  async marcarTransferencia(otId: string) {
    this.actionBusy.set(true);
    try {
      await this.otService.marcarTransferencia(otId);
      await this.loadDetalle(otId);
      this.snack.open('Notificado como transferencia', 'OK', { duration: 1500 });
    } catch {
      this.snack.open('Error al marcar', 'OK', { duration: 2500 });
    } finally {
      this.actionBusy.set(false);
    }
  }

  onPagoFileSelected(ev: Event) {
    const input = ev.target as HTMLInputElement;
    this.pagoFile.set(input.files?.[0] ?? null);
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
      this.snack.open('Error al subir', 'OK', { duration: 2500 });
    } finally {
      this.actionBusy.set(false);
    }
  }

  async sendMsgOt(otId: string) {
    if (this.msgForm.invalid) return;
    const contenido = (this.msgForm.value.contenido ?? '').trim();
    if (!contenido) return;

    this.actionBusy.set(true);
    try {
      await this.otService.enviarMensaje(otId, contenido);
      this.msgForm.reset();
      await this.loadDetalle(otId);
    } catch {
      this.snack.open('Error al enviar mensaje', 'OK', { duration: 2500 });
    } finally {
      this.actionBusy.set(false);
    }
  }
}