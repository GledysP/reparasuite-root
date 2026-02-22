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

import { TicketsService } from '../../../core/tickets.service';
import { TicketDetalleDto } from '../../../core/models';

@Component({
  selector: 'app-ticket-dialog',
  standalone: true,
  imports: [
    CommonModule, MatDialogModule, MatButtonModule, MatDividerModule,
    MatFormFieldModule, MatInputModule, MatIconModule,
    ReactiveFormsModule, MatSnackBarModule
  ],
  templateUrl: './ticket-dialog.component.html',
  styleUrls: ['./ticket-dialog.component.scss']
})
export class TicketDialogComponent {
  // Inyectamos los servicios
  private fb = inject(FormBuilder);
  private ticketsService = inject(TicketsService);
  private snack = inject(MatSnackBar);
  private dialogRef = inject(MatDialogRef<TicketDialogComponent>);

  loading = signal(false);
  
  // Declaramos el formulario sin inicializarlo aquí para evitar el error TS2729
  newForm: FormGroup;

  constructor(@Inject(MAT_DIALOG_DATA) public data: { mode: 'new' | 'view', ticket?: TicketDetalleDto }) {
    // Inicializamos el formulario dentro del constructor
    this.newForm = this.fb.group({
      asunto: ['', [Validators.required, Validators.minLength(3)]],
      descripcion: ['', [Validators.required, Validators.minLength(10)]]
    });
  }

  get isNew() { return this.data.mode === 'new'; }
  get isView() { return this.data.mode === 'view'; }
  get ticket() { return this.data.ticket; }

  close(res = false) {
    this.dialogRef.close(res);
  }

  async crear() {
    if (this.newForm.invalid) return;
    this.loading.set(true);
    try {
      const val = this.newForm.value;
      await this.ticketsService.crear(val.asunto!, val.descripcion!);
      this.snack.open('Ticket creado correctamente', 'OK', { duration: 2000 });
      this.close(true);
    } catch (err) {
      this.snack.open('Error al crear ticket', 'OK');
    } finally {
      this.loading.set(false);
    }
  }
}