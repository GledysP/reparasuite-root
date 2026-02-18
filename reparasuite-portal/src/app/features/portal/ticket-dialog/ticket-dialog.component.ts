import { Component, Inject, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatDividerModule } from '@angular/material/divider';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';

import { TicketsService } from '../../../core/tickets.service';
import { TicketDetalleDto } from '../../../core/models';

type DataNew = { mode: 'new' };
type DataView = { mode: 'view'; ticket: TicketDetalleDto };
type Data = DataNew | DataView;

@Component({
  selector: 'app-ticket-dialog',
  standalone: true,
  imports: [
    CommonModule,
    MatDialogModule, MatButtonModule, MatDividerModule,
    MatFormFieldModule, MatInputModule,
    ReactiveFormsModule,
    MatSnackBarModule
  ],
  templateUrl: './ticket-dialog.component.html',
  styleUrls: ['./ticket-dialog.component.scss']
})
export class TicketDialogComponent {
  private fb = inject(FormBuilder);
  busy = signal(false);

  newForm = this.fb.group({
    asunto: ['', [Validators.required, Validators.minLength(2)]],
    descripcion: ['', [Validators.required, Validators.minLength(5)]]
  });

  constructor(
    @Inject(MAT_DIALOG_DATA) public data: Data,
    private dialogRef: MatDialogRef<TicketDialogComponent>,
    private tickets: TicketsService,
    private snack: MatSnackBar
  ) {}

  get isNew(): boolean { return this.data.mode === 'new'; }
  get isView(): boolean { return this.data.mode === 'view'; }

  get ticket(): TicketDetalleDto {
    if (this.data.mode !== 'view') throw new Error('Ticket no disponible en modo new');
    return this.data.ticket;
  }

  close(ok: boolean) { this.dialogRef.close(ok); }

  async create() {
    if (this.newForm.invalid) return;

    this.busy.set(true);
    try {
      await this.tickets.crear(this.newForm.value.asunto!, this.newForm.value.descripcion!);
      this.snack.open('Ticket creado', 'OK', { duration: 1500 });
      this.close(true);
    } catch {
      this.snack.open('No se pudo crear el ticket', 'OK', { duration: 2500 });
    } finally {
      this.busy.set(false);
    }
  }
}
