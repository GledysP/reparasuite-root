import { Component, inject } from '@angular/core';
import { FormBuilder, Validators, ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';

import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

import { AuthService } from '../../core/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [
    ReactiveFormsModule, CommonModule,
    MatCardModule, MatFormFieldModule, MatInputModule, MatButtonModule, MatIconModule
  ],
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.scss']
})
export class LoginComponent {
  private fb = inject(FormBuilder);

  loading = false;
  error = '';

  form = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required]]
  });

  constructor(private auth: AuthService, private router: Router) {}

  async onSubmit() {
    this.error = '';
    this.loading = true;
    try {
      await this.auth.login(this.form.value.email!, this.form.value.password!);
      this.router.navigateByUrl('/app');
    } catch {
      this.error = 'Credenciales inválidas';
    } finally {
      this.loading = false;
    }
  }
}
