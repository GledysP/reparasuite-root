import { Component, Inject, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatDividerModule } from '@angular/material/divider';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatSelectModule } from '@angular/material/select';

import { environment } from '../../../../environments/environment';
import { TicketsService } from '../../../core/tickets.service';
import { TicketDetalleDto } from '../../../core/models';

type TipoServicioUI = '' | 'TIENDA' | 'DOMICILIO';

@Component({
  selector: 'app-ticket-dialog',
  standalone: true,
  imports: [
    CommonModule,
    MatDialogModule,
    MatButtonModule,
    MatDividerModule,
    MatFormFieldModule,
    MatInputModule,
    MatIconModule,
    MatSelectModule,
    ReactiveFormsModule,
    MatSnackBarModule
  ],
  templateUrl: './ticket-dialog.component.html',
  styleUrls: ['./ticket-dialog.component.scss']
})
export class TicketDialogComponent {
  private fb = inject(FormBuilder);
  private ticketsService = inject(TicketsService);
  private snack = inject(MatSnackBar);
  private dialogRef = inject(MatDialogRef<TicketDialogComponent>);

  loading = signal(false);

  selectedPhotoFile: File | null = null;
  photoPreviewUrl: string | null = null;

  newForm: FormGroup;

  constructor(@Inject(MAT_DIALOG_DATA) public data: { mode: 'new' | 'view', ticket?: TicketDetalleDto }) {
    this.newForm = this.fb.group({
      // ✅ UI simple: "equipo" (backend sigue recibiendo asunto = equipo)
      equipo: ['', [Validators.required, Validators.minLength(3)]],
      descripcionFalla: ['', [Validators.required, Validators.minLength(10)]],
      tipoServicioSolicitado: ['' as TipoServicioUI],
      direccionSolicitud: [''],
      observaciones: ['']
    });
  }

  get isNew() { return this.data.mode === 'new'; }
  get isView() { return this.data.mode === 'view'; }
  get ticket() { return this.data.ticket; }

  close(res = false) {
    this.dialogRef.close(res);
  }

  onPickPhoto(input: HTMLInputElement): void {
    const f = input.files?.[0] ?? null;
    this.selectedPhotoFile = f;

    if (!f) {
      this.photoPreviewUrl = null;
      return;
    }

    if (!f.type.startsWith('image/')) {
      this.snack.open('Selecciona una imagen válida', 'OK', { duration: 2200 });
      this.selectedPhotoFile = null;
      this.photoPreviewUrl = null;
      input.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      this.photoPreviewUrl = typeof reader.result === 'string' ? reader.result : null;
    };
    reader.readAsDataURL(f);
  }

  removePhoto(): void {
    this.selectedPhotoFile = null;
    this.photoPreviewUrl = null;
  }

  resolveFileUrl(url?: string | null): string {
    if (!url) return '';
    if (/^https?:\/\//i.test(url)) return url;
    const base = (environment.apiBaseUrl || '').replace(/\/$/, '');
    const path = url.startsWith('/') ? url : `/${url}`;
    return `${base}${path}`;
  }

  private buildDescripcionLegacy(): string {
    const v = this.newForm.value;

    const equipo = String(v.equipo ?? '').trim();
    const falla = String(v.descripcionFalla ?? '').trim();
    const tipo = String(v.tipoServicioSolicitado ?? '').trim();
    const direccion = String(v.direccionSolicitud ?? '').trim();
    const obs = String(v.observaciones ?? '').trim();

    const lineas = [
      `Equipo: ${equipo}`,
      `Falla reportada: ${falla}`,
      tipo ? `Tipo sugerido (opcional): ${tipo}` : '',
      direccion ? `Dirección / Ubicación: ${direccion}` : '',
      obs ? `Observaciones: ${obs}` : ''
    ].filter(Boolean);

    return lineas.join('\n');
  }

  async crear() {
    if (this.newForm.invalid) return;

    this.loading.set(true);
    try {
      const v = this.newForm.value;

      const equipo = String(v.equipo ?? '').trim();
      const descripcionFalla = String(v.descripcionFalla ?? '').trim();
      const descripcionLegacy = this.buildDescripcionLegacy();

      const tipoRaw = String(v.tipoServicioSolicitado ?? '').trim().toUpperCase();
      const tipoServicioSugerido: 'TIENDA' | 'DOMICILIO' | null =
        tipoRaw === 'TIENDA' || tipoRaw === 'DOMICILIO' ? tipoRaw : null;

      // ✅ Compatibilidad backend:
      // - asunto = equipo (por ahora)
      // - descripcion = legacy/fallback
      // - campos estructurados = fuente principal
      const payload = {
        asunto: equipo,
        descripcion: descripcionLegacy,
        equipo,
        descripcionFalla,
        tipoServicioSugerido,
        direccion: String(v.direccionSolicitud ?? '').trim() || null
      };

      const creado = await this.ticketsService.crear(payload);

      if (this.selectedPhotoFile && creado?.id) {
        try {
          await this.ticketsService.subirFoto(creado.id, this.selectedPhotoFile);
          this.snack.open('Ticket creado con foto', 'OK', { duration: 2200 });
        } catch (e) {
          console.warn('Ticket creado, pero no se pudo subir foto:', e);
          this.snack.open('Ticket creado. No se pudo subir la foto.', 'OK', { duration: 2600 });
        }
      } else {
        this.snack.open('Ticket creado correctamente', 'OK', { duration: 2000 });
      }

      this.close(true);
    } catch (err) {
      console.error(err);
      this.snack.open('Error al crear ticket', 'OK', { duration: 2500 });
    } finally {
      this.loading.set(false);
    }
  }
}