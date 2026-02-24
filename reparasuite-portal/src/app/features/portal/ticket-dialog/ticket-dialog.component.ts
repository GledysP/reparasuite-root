import { Component, Inject, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators, FormControl } from '@angular/forms';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

import { TicketsService, TicketCrearPayload } from '../../../core/tickets.service';
import { TicketDetalleDto } from '../../../core/models';

@Component({
  selector: 'app-ticket-dialog',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule, MatDialogModule,
    MatButtonModule, MatIconModule, MatFormFieldModule, 
    MatInputModule, MatSelectModule, MatSnackBarModule,
    MatProgressSpinnerModule
  ],
  templateUrl: './ticket-dialog.component.html',
  styleUrls: ['./ticket-dialog.component.scss']
})
export class TicketDialogComponent {
  // Mejores prácticas: Formulario nonNullable para evitar errores de tipado
  private fb = inject(FormBuilder).nonNullable;
  private ticketsService = inject(TicketsService);
  private snack = inject(MatSnackBar);
  
  loading = signal(false);
  selectedFile = signal<File | null>(null);

  form = this.fb.group({
    equipo: ['', [Validators.required]],
    tipoServicioSugerido: ['' as 'TIENDA' | 'DOMICILIO' | ''],
    descripcionFalla: ['', [Validators.required]],
    direccion: [''],
    observaciones: ['']
  });

  constructor(
    public dialogRef: MatDialogRef<TicketDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: { mode: 'new' | 'view', ticket?: TicketDetalleDto }
  ) {}

  onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files?.length) {
      this.selectedFile.set(input.files[0]);
    }
  }

  async crear() {
    if (this.form.invalid) return;
    this.loading.set(true);

    const raw = this.form.getRawValue();
    
    // Mapeamos los campos al payload manteniendo la compatibilidad legacy
    const payload: TicketCrearPayload = {
      asunto: `Soporte: ${raw.equipo}`,
      equipo: raw.equipo,
      descripcionFalla: raw.descripcionFalla,
      tipoServicioSugerido: raw.tipoServicioSugerido || null,
      direccion: raw.direccion || null,
      descripcion: raw.observaciones || raw.descripcionFalla
    };

    try {
      const ticket = await this.ticketsService.crear(payload);
      
      // Si hay foto seleccionada, se sube usando el ID del ticket creado
      if (this.selectedFile() && ticket.id) {
        await this.ticketsService.subirFoto(ticket.id, this.selectedFile()!);
      }

      this.snack.open('¡Solicitud enviada correctamente!', 'Cerrar', { duration: 3000 });
      this.dialogRef.close(true);
    } catch (err) {
      this.snack.open('No se pudo enviar la solicitud. Intente más tarde.', 'Error');
    } finally {
      this.loading.set(false);
    }
  }
}