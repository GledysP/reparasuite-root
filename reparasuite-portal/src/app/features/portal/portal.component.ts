import {
  Component,
  signal,
  inject,
  computed,
  ViewChild,
  ElementRef,
  AfterViewChecked,
  ChangeDetectionStrategy
} from '@angular/core';

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
import { MatTabsModule } from '@angular/material/tabs';
import { MatSelectModule } from '@angular/material/select';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatExpansionModule } from '@angular/material/expansion';

import { environment } from '../../../environments/environment';
import { AuthService } from '../../core/auth.service';
import { OtService } from '../../core/ot.service';
import { TicketsService } from '../../core/tickets.service';

import {
  ClienteOtItemDto,
  OtDetalleDto,
  TicketListaItemDto,
  MensajeDto,
  CitaDto
} from '../../core/models';

import { TicketDialogComponent } from './ticket-dialog/ticket-dialog.component';

type StepKey = 'RECIBIDA' | 'PRESUPUESTO' | 'APROBADA' | 'EN_CURSO' | 'FINALIZADA';

@Component({
  selector: 'app-portal',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatToolbarModule, MatButtonModule, MatIconModule,
    MatCardModule, MatProgressBarModule, MatDividerModule,
    MatChipsModule, MatFormFieldModule, MatInputModule,
    MatSnackBarModule, MatDialogModule, MatCheckboxModule,
    MatDatepickerModule, MatNativeDateModule,
    MatTabsModule, MatSelectModule, MatExpansionModule, MatTooltipModule
  ],
  templateUrl: './portal.component.html',
  styleUrls: ['./portal.component.scss']
})
export class PortalComponent implements AfterViewChecked {
  @ViewChild('chatScroll') private chatContainer?: ElementRef<HTMLDivElement>;
  @ViewChild('gestionSection') private gestionSection?: ElementRef<HTMLElement>;
  @ViewChild('chatSection') private chatSection?: ElementRef<HTMLElement>;

  apiBase = environment.apiBaseUrl;

  private readonly fb = inject(FormBuilder);
  private readonly _snackBar = inject(MatSnackBar);

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
      RECIBIDA: 'RECIBIDA',
      NUEVA: 'RECIBIDA',
      PRESUPUESTO: 'PRESUPUESTO',
      ENVIADO: 'PRESUPUESTO',
      APROBADA: 'APROBADA',
      ACEPTADO: 'APROBADA',
      EN_CURSO: 'EN_CURSO',
      REPARANDO: 'EN_CURSO',
      FINALIZADA: 'FINALIZADA',
      TERMINADA: 'FINALIZADA',
      LISTO: 'FINALIZADA'
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
    const url = (ot as any)?.pago?.comprobanteUrl ?? null;
    if (!url) return null;

    if (/^https?:\/\//i.test(url)) return url;

    const base = (this.apiBase || '').replace(/\/$/, '');
    const path = url.startsWith('/') ? url : `/${url}`;
    return `${base}${path}`;
  });

  // ---------- QUICK ACTIONS / ACTIVIDAD ----------
  lastIncomingMessage = computed<MensajeDto | null>(() => {
    const ot = this.selectedOtDetalle();
    const mensajes = ot?.mensajes ?? [];
    const incoming = [...mensajes].reverse().find((m) => !this.isClienteMsg(m));
    return incoming ?? null;
  });

  quickUnreadCount = computed<number>(() => {
    const ot = this.selectedOtDetalle();
    const mensajes = ot?.mensajes ?? [];
    if (!mensajes.length) return 0;

    const incoming = mensajes.filter((m) => !this.isClienteMsg(m));
    if (!incoming.length) return 0;

    // Si backend expone flags de lectura, usarlos
    const msgsWithReadInfo = incoming.filter((m) => this.readFlagForClient(m) !== undefined);
    if (msgsWithReadInfo.length > 0) {
      return msgsWithReadInfo.filter((m) => this.readFlagForClient(m) === false).length;
    }

    // Fallback heurístico: mensajes del taller posteriores al último mensaje del cliente
    let lastClientMsgIndex = -1;
    mensajes.forEach((m, index) => {
      if (this.isClienteMsg(m)) lastClientMsgIndex = index;
    });

    return mensajes.slice(lastClientMsgIndex + 1).filter((m) => !this.isClienteMsg(m)).length;
  });

  showPagoQuickAction = computed<boolean>(() => {
    const ot = this.selectedOtDetalle();
    if (!ot) return false;
    return !!ot.presupuesto || !!(ot as any)?.pago;
  });

  isPagoPendienteQuick = computed<boolean>(() => {
    const ot = this.selectedOtDetalle();
    if (!ot) return false;

    const estadoPago = String((ot as any)?.pago?.estado || '').toUpperCase();
    const estadosPendientes = [
      'PENDIENTE',
      'ENVIADO',
      'POR_PAGAR',
      'PAGO_PENDIENTE',
      'TRANSFERENCIA_PENDIENTE',
      'PENDIENTE_CONFIRMACION'
    ];

    if (estadoPago && estadosPendientes.includes(estadoPago)) return true;

    const estadoPres = String(ot.presupuesto?.estado || '').toUpperCase();
    const estadosPresupuestoRelevantes = ['ENVIADO', 'APROBADA', 'ACEPTADO'];
    const pagoConfirmado = ['CONFIRMADO', 'VALIDADO', 'PAGADO', 'COMPLETADO'].includes(estadoPago);

    return !!ot.presupuesto && estadosPresupuestoRelevantes.includes(estadoPres) && !pagoConfirmado;
  });

  quickPagoLabel = computed<string>(() => {
    const ot = this.selectedOtDetalle();
    if (!ot) return 'Sin datos';

    const estadoPago = String((ot as any)?.pago?.estado || '').toUpperCase();
    if (estadoPago) return this.prettifyEstado(estadoPago);

    if (this.isPagoPendienteQuick()) return 'Pendiente';
    return 'Disponible';
  });

  quickPagoMeta = computed<string>(() => {
    const ot = this.selectedOtDetalle();
    if (!ot) return 'Revisa métodos de pago';

    const comprobante = (ot as any)?.pago?.comprobanteUrl;
    if (comprobante) return 'Comprobante cargado';

    if (this.isPagoPendienteQuick()) return 'Confirmar transferencia / subir comprobante';
    return 'Ver instrucciones y estado';
  });

  constructor(
    private readonly auth: AuthService,
    private readonly otService: OtService,
    private readonly ticketsService: TicketsService,
    private readonly snack: MatSnackBar,
    private readonly router: Router,
    private readonly dialog: MatDialog
  ) {
    this.refreshAll();
  }

  ngAfterViewChecked(): void {
    this.scrollToBottom();
  }

  private scrollToBottom(): void {
    try {
      const el = this.chatContainer?.nativeElement;
      if (!el) return;
      el.scrollTop = el.scrollHeight;
    } catch {
      // noop
    }
  }

  private readFlagForClient(m: MensajeDto): boolean | undefined {
    const msg = m as any;

    const candidates = [
      msg?.leidoCliente,
      msg?.leidoPorCliente,
      msg?.readByClient,
      msg?.isReadByClient,
      msg?.leido
    ];

    const found = candidates.find((v: any) => typeof v === 'boolean');
    return typeof found === 'boolean' ? found : undefined;
  }

  private prettifyEstado(raw: string): string {
    return raw
      .toLowerCase()
      .split('_')
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  }

  private smoothScrollTo(ref?: ElementRef<HTMLElement>, center = false): void {
    const el = ref?.nativeElement;
    if (!el) return;

    try {
      el.scrollIntoView({
        behavior: 'smooth',
        block: center ? 'center' : 'start',
        inline: 'nearest'
      });
    } catch {
      el.scrollIntoView();
    }
  }

  openGestionTab(index: number): void {
    this.gestionTabIndex.set(index);
    setTimeout(() => this.smoothScrollTo(this.gestionSection), 30);
  }

  goToChat(): void {
    setTimeout(() => this.smoothScrollTo(this.chatSection, false), 20);
  }

  trackById(index: number, item: any): any {
    return item?.id ?? item?.codigo ?? item?.fecha ?? item?.createdAt ?? index;
  }

  selectedOtCodigo(): string | null {
    return this.selectedOtDetalle()?.codigo ?? null;
  }

  refreshDetalle(): void {
    const ot = this.selectedOtDetalle();
    if (!ot) return;
    this.loadDetalle(ot.codigo);
  }

  isClienteMsg(m: MensajeDto): boolean {
    return (m.remitenteTipo || '').toUpperCase() === 'CLIENTE';
  }

  async refreshAll(): Promise<void> {
    await Promise.all([this.loadOts(), this.loadTickets()]);
  }

  async loadOts(): Promise<void> {
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

  async selectOt(ot: ClienteOtItemDto): Promise<void> {
    this.selectedOtCodigoSignal.set(ot.codigo);
    await this.loadDetalle(ot.codigo);
  }

  async onOtSelectChange(codigo: string): Promise<void> {
    if (!codigo) return;
    this.selectedOtCodigoSignal.set(codigo);
    await this.loadDetalle(codigo);
  }

  async loadDetalle(idOrCodigo: string): Promise<void> {
    this.loading.set(true);
    try {
      const d = await this.otService.obtenerDetalle(idOrCodigo);
      this.selectedOtDetalle.set(d);
      this.aceptoCheck.set(false);

      if (d?.citas?.length) {
        this.gestionTabIndex.set(1);
      }
    } catch {
      this.snack.open('No se pudo cargar el detalle de la OT', 'OK', { duration: 2500 });
    } finally {
      this.loading.set(false);
    }
  }

  logout(): void {
    this.auth.logout();
    this.router.navigateByUrl('/login');
  }

  // --- TICKETS ---
  async loadTickets(): Promise<void> {
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

  openNewTicket(): void {
    const ref = this.dialog.open(TicketDialogComponent, {
      width: '640px',
      maxWidth: '92vw',
      data: { mode: 'new' }
    });

    ref.afterClosed().subscribe(async (ok: boolean) => {
      if (ok) await this.loadTickets();
    });
  }

  async openTicket(ticketId: string): Promise<void> {
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
  async aceptar(otId: string): Promise<void> {
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

  async rechazar(otId: string): Promise<void> {
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

  async marcarTransferencia(otId: string): Promise<void> {
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

  onPagoFileSelected(ev: Event): void {
    const input = ev.target as HTMLInputElement;
    this.pagoFile.set(input.files?.[0] ?? null);
  }

  copyToClipboard(text: string): void {
    navigator.clipboard.writeText(text)
      .then(() => {
        this._snackBar.open('Copiado al portapapeles', 'Cerrar', { duration: 2000 });
      })
      .catch(() => {
        this._snackBar.open('No se pudo copiar', 'Cerrar', { duration: 2000 });
      });
  }

  async uploadComprobante(otId: string): Promise<void> {
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

  async sendMsgOt(otId: string): Promise<void> {
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