import {
  Component,
  signal,
  inject,
  computed,
  ViewChild,
  ElementRef,
  AfterViewChecked,
  OnInit,
  OnDestroy
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { Router } from '@angular/router';

import { BreakpointObserver } from '@angular/cdk/layout';

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
  TicketDetalleDto,
  MensajeDto,
  CitaDto
} from '../../core/models';

import { TicketDialogComponent } from './ticket-dialog/ticket-dialog.component';

type StepKey = 'RECIBIDA' | 'PRESUPUESTO' | 'APROBADA' | 'EN_CURSO' | 'FINALIZADA';

type LoadOpts = {
  silent?: boolean;
  quiet?: boolean;
  preserveSelection?: boolean;
  autoLoadDetalle?: boolean;
  forceScroll?: boolean;
  animate?: boolean;
  autoNavTabs?: boolean;
};

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
    MatTabsModule, MatSelectModule, MatExpansionModule, MatTooltipModule
  ],
  templateUrl: './portal.component.html',
  styleUrls: ['./portal.component.scss']
})
export class PortalComponent implements OnInit, OnDestroy, AfterViewChecked {
  @ViewChild('chatScroll') private chatContainer!: ElementRef<HTMLDivElement>;
  @ViewChild('chatCardRef') private chatCardRef?: ElementRef<HTMLElement>;
  @ViewChild('gestionCardTop') private gestionCardRef?: ElementRef<HTMLElement>;
  @ViewChild('chatInput') private chatInput?: ElementRef<HTMLInputElement>;

  apiBase = environment.apiBaseUrl;

  private fb = inject(FormBuilder);
  private snackBar = inject(MatSnackBar);
  private bp = inject(BreakpointObserver);

  loading = signal(false);
  actionBusy = signal(false);

  ots = signal<ClienteOtItemDto[]>([]);
  tickets = signal<TicketListaItemDto[]>([]);
  selectedOtDetalle = signal<OtDetalleDto | null>(null);

  selectedOtCodigoSignal = signal<string | null>(null);
  aceptoCheck = signal(false);

  pagoFile = signal<File | null>(null);
  gestionTabIndex = signal(0);

  detailFade = signal(false);

  // Estado bonito post-creación
  pendingTicket = signal<TicketDetalleDto | null>(null);
  private pendingBeforeOtCodes: Set<string> | null = null;

  msgForm = this.fb.group({
    contenido: ['', [Validators.required, Validators.minLength(1)]]
  });

  citaInicioFecha = signal<Date | null>(null);
  citaInicioHora = signal<string>('');
  citaDuracionMinutos = 60;

  readonly steps: { key: StepKey; label: string; icon: string }[] = [
    { key: 'RECIBIDA', label: 'Recibida', icon: 'inventory_2' },
    { key: 'PRESUPUESTO', label: 'Presupuesto', icon: 'request_quote' },
    { key: 'APROBADA', label: 'Aprobada', icon: 'verified' },
    { key: 'EN_CURSO', label: 'En curso', icon: 'build' },
    { key: 'FINALIZADA', label: 'Finalizada', icon: 'task_alt' }
  ];

  private readonly stepRank: Record<StepKey, number> = {
    RECIBIDA: 0,
    PRESUPUESTO: 1,
    APROBADA: 2,
    EN_CURSO: 3,
    FINALIZADA: 4
  };

  constructor(
    private auth: AuthService,
    private otService: OtService,
    private ticketsService: TicketsService,
    private router: Router,
    private dialog: MatDialog
  ) {
    this.refreshAll();
  }

  ngOnInit(): void {
    this.pollHandle = setInterval(() => {
      this.silentRefreshTick();
    }, 30_000);
  }

  ngOnDestroy(): void {
    if (this.pollHandle) clearInterval(this.pollHandle);
    this.pollHandle = null;
    this.stopFastAwait();
  }

  // =========================================================
  // Estados / normalización
  // =========================================================
  private normalizeStatus(value?: string | null): string {
    return (value ?? '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
      .toUpperCase()
      .replace(/[\s-]+/g, '_');
  }

  private stepFromOtEstado(estadoRaw?: string | null): StepKey {
    const e = this.normalizeStatus(estadoRaw);

    if (['NUEVA', 'RECIBIDA', 'RECIBIDO', 'CREADA', 'REGISTRADA'].includes(e)) return 'RECIBIDA';

    if (['PRESUPUESTO', 'ENVIADO', 'COTIZACION', 'COTIZACION_ENVIADA'].includes(e) || e.includes('PRESUP')) {
      return 'PRESUPUESTO';
    }

    if (['APROBADA', 'ACEPTADO', 'APROBADO', 'ACEPTADA'].includes(e) || e.includes('APROB') || e.includes('ACEPT')) {
      return 'APROBADA';
    }

    if (['EN_CURSO', 'REPARANDO', 'EN_REPARACION', 'REPARACION', 'EN_PROCESO'].includes(e) || e.includes('CURSO') || e.includes('REPAR')) {
      return 'EN_CURSO';
    }

    if (['FINALIZADA', 'LISTO', 'TERMINADA', 'FINALIZADO', 'ENTREGADA', 'ENTREGADO'].includes(e) || e.includes('FINAL') || e.includes('TERMIN') || e.includes('LIST')) {
      return 'FINALIZADA';
    }

    return 'RECIBIDA';
  }

  private resolveBusinessStep(ot: OtDetalleDto | null): StepKey {
    if (!ot) return 'RECIBIDA';

    const otKey = this.stepFromOtEstado(ot.estado);
    const pres = this.normalizeStatus(ot.presupuesto?.estado);

    // Regla crítica
    if (['ENVIADO', 'PENDIENTE'].includes(pres)) return 'PRESUPUESTO';

    if (['APROBADA', 'ACEPTADO', 'APROBADO', 'ACEPTADA'].includes(pres)) {
      return this.stepRank[otKey] >= this.stepRank['APROBADA'] ? otKey : 'APROBADA';
    }

    return otKey;
  }

  stepKey = computed<StepKey>(() => this.resolveBusinessStep(this.selectedOtDetalle()));
  stepIndex = computed(() => this.stepRank[this.stepKey()]);
  currentStepLabel = computed(() => this.steps[this.stepIndex()]?.label ?? 'Recibida');

  nextCita = computed<CitaDto | null>(() => {
    const ot = this.selectedOtDetalle();
    const citas = ot?.citas ?? [];
    if (!citas.length) return null;
    const sorted = [...citas].sort((a, b) => (a.inicio || '').localeCompare(b.inicio || ''));
    return sorted[0] ?? null;
  });

  quickUnreadCount = computed<number>(() => {
    const msgs = this.selectedOtDetalle()?.mensajes ?? [];
    return msgs.filter(m => !this.isClienteMsg(m)).length;
  });

  quickPresupuestoValue = computed<string>(() => {
    const p = this.selectedOtDetalle()?.presupuesto;
    if (!p) return 'Sin presupuesto';

    const amount = typeof p.importe === 'number'
      ? `€ ${p.importe.toFixed(2).replace('.', ',')}`
      : 'Presupuesto';

    const estado = this.normalizeStatus(p.estado);
    if (['APROBADA', 'ACEPTADO', 'APROBADO', 'ACEPTADA'].includes(estado)) return amount;
    if (estado === 'ENVIADO') return amount;
    if (estado === 'PENDIENTE') return 'Pendiente';
    return p.estado || amount;
  });

  quickHasPendingPago = computed<boolean>(() => {
    const ot = this.selectedOtDetalle() as any;
    if (!ot) return false;

    const presupuestoEstado = this.normalizeStatus(ot.presupuesto?.estado);
    const pagoEstado = this.normalizeStatus(ot.pago?.estado);

    const presupuestoListo = ['APROBADA', 'ACEPTADO', 'APROBADO', 'ACEPTADA'].includes(presupuestoEstado);
    const pagoPendiente = !['CONFIRMADO', 'VALIDADO', 'PAGADO', 'COMPLETADO'].includes(pagoEstado);

    return presupuestoListo && pagoPendiente;
  });

  quickPagoValue = computed<string>(() => {
    const ot = this.selectedOtDetalle() as any;
    if (!ot) return 'Sin datos';
    const pagoEstado = this.normalizeStatus(ot.pago?.estado);
    if (pagoEstado) {
      if (['CONFIRMADO', 'VALIDADO', 'PAGADO', 'COMPLETADO'].includes(pagoEstado)) return 'Confirmado';
      return ot.pago?.estado || 'Pago';
    }
    return this.quickHasPendingPago() ? 'Pendiente' : 'Sin acción';
  });

  // =========================================================
  // Polling automático
  // =========================================================
  private pollHandle: ReturnType<typeof setInterval> | null = null;
  private silentInFlight = false;

  private fastAwaitHandle: ReturnType<typeof setInterval> | null = null;
  private fastAwaitUntil = 0;

  private stopFastAwait() {
    if (this.fastAwaitHandle) clearInterval(this.fastAwaitHandle);
    this.fastAwaitHandle = null;
    this.fastAwaitUntil = 0;
  }

  private startFastAwait() {
    this.stopFastAwait();
    this.fastAwaitUntil = Date.now() + 60_000;
    this.fastAwaitHandle = setInterval(() => {
      this.fastAwaitTick();
    }, 3000);

    this.fastAwaitTick();
  }

  private async fastAwaitTick(): Promise<void> {
    if (!this.pendingTicket() || !this.pendingBeforeOtCodes) {
      this.stopFastAwait();
      return;
    }

    if (Date.now() > this.fastAwaitUntil) {
      this.stopFastAwait();
      return;
    }

    await this.tryDetectAndOpenNewOt({ silent: true, quiet: true });
  }

  private async silentRefreshTick(): Promise<void> {
    if (this.silentInFlight) return;
    if (this.loading() || this.actionBusy()) return;

    const codigo = this.selectedOtCodigoSignal() ?? this.selectedOtDetalle()?.codigo ?? null;
    const hasPending = !!this.pendingTicket();

    if (!codigo && !this.ots().length && !hasPending) return;

    this.silentInFlight = true;
    try {
      await this.loadOts({ silent: true, quiet: true, preserveSelection: true, autoLoadDetalle: false });

      if (hasPending) {
        const opened = await this.tryDetectAndOpenNewOt({ silent: true, quiet: true });
        if (opened) return;
      }

      const codigoFinal = this.selectedOtCodigoSignal() ?? codigo;
      if (codigoFinal) {
        await this.loadDetalle(codigoFinal, {
          silent: true,
          quiet: true,
          forceScroll: false,
          animate: false,
          autoNavTabs: false
        });
      }
    } finally {
      this.silentInFlight = false;
    }
  }

  private findNewOtCodigo(before: Set<string>, after: ClienteOtItemDto[]): string | null {
    const created = after.find(o => o?.codigo && !before.has(o.codigo));
    return created?.codigo ?? null;
  }

  private async tryDetectAndOpenNewOt(opts: { silent: boolean; quiet: boolean }): Promise<boolean> {
    if (!this.pendingTicket() || !this.pendingBeforeOtCodes) return false;

    await this.loadOts({ silent: opts.silent, quiet: opts.quiet, preserveSelection: true, autoLoadDetalle: false });

    const newCodigo = this.findNewOtCodigo(this.pendingBeforeOtCodes, this.ots());
    if (!newCodigo) return false;

    this.selectedOtCodigoSignal.set(newCodigo);
    await this.loadDetalle(newCodigo, {
      silent: true,
      quiet: true,
      forceScroll: true,
      animate: true,
      autoNavTabs: true
    });

    this.pendingTicket.set(null);
    this.pendingBeforeOtCodes = null;
    this.stopFastAwait();

    this.snackBar.open('✓ Orden disponible. Abriendo detalle…', undefined, {
      duration: 1600,
      panelClass: ['rs-snack-pro'],
      verticalPosition: 'bottom',
      horizontalPosition: 'center'
    });

    return true;
  }

  // =========================================================
  // Scroll chat inteligente
  // =========================================================
  private scrollRequested = false;
  private scrollForce = false;

  ngAfterViewChecked() {
    if (!this.scrollRequested) return;

    if (this.scrollForce || this.isChatNearBottom(90)) {
      this.scrollToBottom();
    }

    this.scrollRequested = false;
    this.scrollForce = false;
  }

  private requestScroll(force = false) {
    this.scrollForce = force;
    this.scrollRequested = true;
  }

  private isChatNearBottom(thresholdPx = 80): boolean {
    try {
      const el = this.chatContainer?.nativeElement;
      if (!el) return true;
      const dist = el.scrollHeight - el.scrollTop - el.clientHeight;
      return dist < thresholdPx;
    } catch {
      return true;
    }
  }

  private scrollToBottom(): void {
    try {
      const el = this.chatContainer?.nativeElement;
      if (!el) return;
      el.scrollTop = el.scrollHeight;
    } catch {}
  }

  private triggerFadeIn(): void {
    this.detailFade.set(false);
    queueMicrotask(() => {
      this.detailFade.set(true);
      setTimeout(() => this.detailFade.set(false), 260);
    });
  }

  // =========================================================
  // Actions
  // =========================================================
  openHowItWorks(): void {
    this.snackBar.open(
      'Cómo funciona: crea tu solicitud, el taller la revisa y cuando la acepte la orden aparecerá aquí automáticamente.',
      'Cerrar',
      { duration: 5000, panelClass: ['rs-snack-pro'] }
    );
  }

  trackById(index: number, item: any) {
    return item?.id ?? item?.codigo ?? item?.fecha ?? item?.createdAt ?? index;
  }

  selectedOtCodigo(): string | null {
    return this.selectedOtDetalle()?.codigo ?? null;
  }

  isClienteMsg(m: MensajeDto): boolean {
    return this.normalizeStatus(m.remitenteTipo) === 'CLIENTE';
  }

  goToGestionTab(index: number) {
    this.gestionTabIndex.set(index);
    queueMicrotask(() => {
      this.gestionCardRef?.nativeElement?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  focusMessages() {
    queueMicrotask(() => {
      this.chatCardRef?.nativeElement?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      this.requestScroll(true);
      setTimeout(() => this.chatInput?.nativeElement?.focus(), 220);
    });
  }

  async refreshAll() {
    await Promise.all([
      this.loadOts({ preserveSelection: true, autoLoadDetalle: true }),
      this.loadTickets()
    ]);
  }

  async loadOts(opts: LoadOpts = {}) {
    const clienteId = this.auth.getClienteId();
    if (!clienteId) return;

    const showSpinner = !opts.silent;
    if (showSpinner) this.loading.set(true);

    try {
      const res = await this.otService.listarMisOts(clienteId, 0, 50);
      this.ots.set(res.items);

      const wanted = opts.preserveSelection
        ? (this.selectedOtCodigoSignal() ?? this.selectedOtDetalle()?.codigo ?? null)
        : (this.selectedOtCodigoSignal() ?? null);

      const exists = !!wanted && res.items.some(o => o.codigo === wanted);
      const nextCodigo = exists ? wanted : (res.items[0]?.codigo ?? null);

      this.selectedOtCodigoSignal.set(nextCodigo);

      if (opts.autoLoadDetalle !== false) {
        const shouldLoad = !this.selectedOtDetalle() || (nextCodigo && this.selectedOtDetalle()?.codigo !== nextCodigo);
        if (shouldLoad && nextCodigo) {
          await this.loadDetalle(nextCodigo, {
            silent: true,
            quiet: opts.quiet,
            forceScroll: true,
            animate: true,
            autoNavTabs: true
          });
        }
      }
    } catch {
      if (!opts.quiet) {
        this.snackBar.open('No se pudieron cargar las órdenes', 'Cerrar', {
          duration: 2500,
          panelClass: ['rs-snack-pro']
        });
      }
    } finally {
      if (showSpinner) this.loading.set(false);
    }
  }

  async loadDetalle(idOrCodigo: string, opts: LoadOpts = {}) {
    const showSpinner = !opts.silent;
    if (showSpinner) this.loading.set(true);

    try {
      const prevCodigo = this.selectedOtDetalle()?.codigo ?? null;

      const d = await this.otService.obtenerDetalle(idOrCodigo);
      this.selectedOtDetalle.set(d);

      if (d?.codigo) this.selectedOtCodigoSignal.set(d.codigo);

      const sameOt = !!prevCodigo && !!d?.codigo && prevCodigo === d.codigo;

      if (!opts.silent && !sameOt) this.aceptoCheck.set(false);

      if (opts.autoNavTabs !== false && !opts.silent && !sameOt) {
        if (d?.citas?.length) this.gestionTabIndex.set(1);
      }

      this.requestScroll(!!opts.forceScroll);
      if (opts.animate) this.triggerFadeIn();
    } catch {
      if (!opts.quiet) {
        this.snackBar.open('No se pudo cargar el detalle de la OT', 'Cerrar', {
          duration: 2500,
          panelClass: ['rs-snack-pro']
        });
      }
    } finally {
      if (showSpinner) this.loading.set(false);
    }
  }

  async loadTickets(opts: LoadOpts = {}) {
    const showSpinner = !opts.silent;
    if (showSpinner) this.loading.set(true);

    try {
      const res = await this.ticketsService.listar(0, 50);
      this.tickets.set(res.items);
    } catch {
      if (!opts.quiet) {
        this.snackBar.open('No se pudieron cargar los tickets', 'Cerrar', {
          duration: 2500,
          panelClass: ['rs-snack-pro']
        });
      }
    } finally {
      if (showSpinner) this.loading.set(false);
    }
  }

  private ticketDialogConfig(data: any) {
    const isMobile = this.bp.isMatched('(max-width: 640px)');

    return isMobile
      ? {
          data,
          panelClass: ['rs-ticket-dialog', 'rs-ticket-dialog--mobile'],
          autoFocus: false,
          restoreFocus: true,
          width: '100vw',
          maxWidth: '100vw',
          height: '100dvh',
          maxHeight: '100dvh',
          position: { top: '0', left: '0' }
        }
      : {
          data,
          panelClass: ['rs-ticket-dialog'],
          autoFocus: false,
          restoreFocus: true,
          width: '620px',
          maxWidth: '92vw'
        };
  }

  openNewTicket() {
    const beforeCodes = new Set(this.ots().map(o => o.codigo));

    const ref = this.dialog.open(TicketDialogComponent, this.ticketDialogConfig({ mode: 'new' }));
    ref.afterClosed().subscribe(async (ticket?: TicketDetalleDto) => {
      if (!ticket) return;

      this.pendingTicket.set(ticket);
      this.pendingBeforeOtCodes = beforeCodes;

      this.snackBar.open('✓ Solicitud enviada correctamente', undefined, {
        duration: 1800,
        panelClass: ['rs-snack-pro'],
        verticalPosition: 'bottom',
        horizontalPosition: 'center'
      });

      await Promise.all([
        this.loadTickets({ silent: true, quiet: true }),
        this.loadOts({ silent: true, quiet: true, preserveSelection: true, autoLoadDetalle: false })
      ]);

      const opened = await this.tryDetectAndOpenNewOt({ silent: true, quiet: true });
      if (!opened) {
        this.startFastAwait();
      }
    });
  }

  async openTicket(ticketId: string) {
    try {
      const detail = await this.ticketsService.obtener(ticketId);
      this.dialog.open(
        TicketDialogComponent,
        this.ticketDialogConfig({ mode: 'view', ticket: detail })
      );
    } catch {
      this.snackBar.open('No se pudo cargar el ticket', 'Cerrar', {
        duration: 2500,
        panelClass: ['rs-snack-pro']
      });
    }
  }

  async selectOt(ot: ClienteOtItemDto) {
    this.selectedOtCodigoSignal.set(ot.codigo);
    await this.loadDetalle(ot.codigo, { forceScroll: true, animate: true, autoNavTabs: true });
  }

  async onOtSelectChange(codigo: string) {
    if (!codigo) return;
    this.selectedOtCodigoSignal.set(codigo);
    await this.loadDetalle(codigo, { forceScroll: true, animate: true, autoNavTabs: true });
  }

  logout() {
    this.auth.logout();
    this.router.navigateByUrl('/login');
  }

  onPagoFileSelected(ev: Event) {
    const input = ev.target as HTMLInputElement;
    this.pagoFile.set(input.files?.[0] ?? null);
  }

  copyToClipboard(text: string) {
    navigator.clipboard.writeText(text).then(() => {
      this.snackBar.open('✓ Copiado al portapapeles', undefined, {
        duration: 1400,
        panelClass: ['rs-snack-pro']
      });
    });
  }

  async aceptar(otId: string) {
    if (!this.aceptoCheck()) return;
    this.actionBusy.set(true);
    try {
      await this.otService.aceptarPresupuesto(otId);
      await this.loadDetalle(otId, { forceScroll: false, animate: false });
      this.snackBar.open('✓ Presupuesto aceptado', undefined, {
        duration: 1400,
        panelClass: ['rs-snack-pro']
      });
    } catch {
      this.snackBar.open('Error al aceptar', 'Cerrar', {
        duration: 2500,
        panelClass: ['rs-snack-pro']
      });
    } finally {
      this.actionBusy.set(false);
    }
  }

  async rechazar(otId: string) {
    this.actionBusy.set(true);
    try {
      await this.otService.rechazarPresupuesto(otId);
      await this.loadDetalle(otId, { forceScroll: false, animate: false });
      this.snackBar.open('✓ Presupuesto rechazado', undefined, {
        duration: 1400,
        panelClass: ['rs-snack-pro']
      });
    } catch {
      this.snackBar.open('Error al rechazar', 'Cerrar', {
        duration: 2500,
        panelClass: ['rs-snack-pro']
      });
    } finally {
      this.actionBusy.set(false);
    }
  }

  async marcarTransferencia(otId: string) {
    this.actionBusy.set(true);
    try {
      await this.otService.marcarTransferencia(otId);
      await this.loadDetalle(otId, { forceScroll: false, animate: false });
      this.snackBar.open('✓ Transferencia confirmada', undefined, {
        duration: 1400,
        panelClass: ['rs-snack-pro']
      });
    } catch {
      this.snackBar.open('Error al marcar', 'Cerrar', {
        duration: 2500,
        panelClass: ['rs-snack-pro']
      });
    } finally {
      this.actionBusy.set(false);
    }
  }

  async uploadComprobante(otId: string) {
    const f = this.pagoFile();
    if (!f) return;
    this.actionBusy.set(true);
    try {
      await this.otService.subirComprobantePago(otId, f);
      this.pagoFile.set(null);
      await this.loadDetalle(otId, { forceScroll: false, animate: false });
      this.snackBar.open('✓ Comprobante subido', undefined, {
        duration: 1400,
        panelClass: ['rs-snack-pro']
      });
    } catch {
      this.snackBar.open('Error al subir', 'Cerrar', {
        duration: 2500,
        panelClass: ['rs-snack-pro']
      });
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
      await this.loadDetalle(otId, { forceScroll: true, animate: false, autoNavTabs: false });
      setTimeout(() => this.chatInput?.nativeElement?.focus(), 120);
    } catch {
      this.snackBar.open('Error al enviar mensaje', 'Cerrar', {
        duration: 2500,
        panelClass: ['rs-snack-pro']
      });
    } finally {
      this.actionBusy.set(false);
    }
  }
}