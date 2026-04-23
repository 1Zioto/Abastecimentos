// src/app/features/auth/login/login.component.ts
import { Component, signal, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../../core/services/auth.service';
import { ToastrService } from 'ngx-toastr';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [ReactiveFormsModule, CommonModule],
  template: `
    <div class="login-page">
      <div class="login-bg">
        <div class="bg-orb orb1"></div>
        <div class="bg-orb orb2"></div>
        <div class="grid-lines"></div>
      </div>

      <div class="login-card">
        <div class="brand">
          <span class="brand-icon">⛽</span>
          <h1>FuelTrack</h1>
          <p>Sistema de Gestão de Abastecimento</p>
        </div>

        <form [formGroup]="form" (ngSubmit)="onSubmit()" class="login-form">
          <div class="field">
            <label>Login</label>
            <input type="text" formControlName="login" placeholder="Seu login" autocomplete="username" />
            @if (form.get('login')?.touched && form.get('login')?.invalid) {
              <span class="error">Login obrigatório</span>
            }
          </div>

          <div class="field">
            <label>Senha</label>
            <div class="input-wrapper">
              <input [type]="showPassword() ? 'text' : 'password'"
                     formControlName="password" placeholder="Sua senha"
                     autocomplete="current-password" />
              <button type="button" class="eye-btn" (click)="showPassword.set(!showPassword())">
                {{ showPassword() ? '🙈' : '👁️' }}
              </button>
            </div>
            @if (form.get('password')?.touched && form.get('password')?.invalid) {
              <span class="error">Senha obrigatória</span>
            }
          </div>

          @if (errorMsg()) {
            <div class="error-banner">{{ errorMsg() }}</div>
          }

          <button type="submit" class="submit-btn" [disabled]="loading()">
            @if (loading()) {
              <span class="spinner"></span> Entrando...
            } @else {
              Entrar no Sistema
            }
          </button>
        </form>
      </div>
    </div>
  `,
  styles: [`
    @import url('https://fonts.googleapis.com/css2?family=Rajdhani:wght@600;700&family=Inter:wght@400;500;600&display=swap');

    .login-page {
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #050b18;
      position: relative;
      overflow: hidden;
      font-family: 'Inter', sans-serif;
    }

    .login-bg { position: absolute; inset: 0; pointer-events: none; }
    .bg-orb {
      position: absolute;
      border-radius: 50%;
      filter: blur(80px);
      opacity: 0.15;
    }
    .orb1 { width: 500px; height: 500px; background: #0ea5e9; top: -100px; right: -100px; }
    .orb2 { width: 400px; height: 400px; background: #6366f1; bottom: -100px; left: -100px; }
    .grid-lines {
      position: absolute; inset: 0;
      background-image:
        linear-gradient(rgba(56,189,248,0.04) 1px, transparent 1px),
        linear-gradient(90deg, rgba(56,189,248,0.04) 1px, transparent 1px);
      background-size: 40px 40px;
    }

    .login-card {
      background: #0d1427;
      border: 1px solid #1e2d4a;
      border-radius: 20px;
      padding: 40px 36px;
      width: 100%;
      max-width: 400px;
      position: relative;
      z-index: 10;
      box-shadow: 0 25px 60px rgba(0,0,0,0.5);
    }

    .brand { text-align: center; margin-bottom: 32px; }
    .brand-icon { font-size: 48px; display: block; margin-bottom: 12px; }
    .brand h1 {
      font-family: 'Rajdhani', sans-serif;
      font-size: 32px;
      font-weight: 700;
      color: #38bdf8;
      letter-spacing: 3px;
      margin: 0;
    }
    .brand p { font-size: 12px; color: #64748b; margin-top: 6px; }

    .login-form { display: flex; flex-direction: column; gap: 18px; }

    .field { display: flex; flex-direction: column; gap: 6px; }
    .field label { font-size: 12px; font-weight: 600; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px; }
    .field input {
      background: #0a0f1e;
      border: 1px solid #1e2d4a;
      border-radius: 10px;
      padding: 12px 14px;
      color: #e2e8f0;
      font-size: 14px;
      font-family: 'Inter', sans-serif;
      outline: none;
      transition: border-color 0.2s;
      width: 100%;
      box-sizing: border-box;
    }
    .field input:focus { border-color: #0ea5e9; box-shadow: 0 0 0 3px rgba(14,165,233,0.1); }
    .field input::placeholder { color: #334155; }

    .input-wrapper { position: relative; }
    .input-wrapper input { padding-right: 44px; }
    .eye-btn {
      position: absolute; right: 12px; top: 50%; transform: translateY(-50%);
      background: transparent; border: none; cursor: pointer; font-size: 16px;
    }

    .error { font-size: 11px; color: #f87171; }
    .error-banner {
      background: #fee2e210;
      border: 1px solid #f8717140;
      color: #f87171;
      padding: 10px 14px;
      border-radius: 8px;
      font-size: 13px;
    }

    .submit-btn {
      background: linear-gradient(135deg, #0ea5e9, #6366f1);
      border: none;
      border-radius: 10px;
      padding: 14px;
      color: #fff;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      font-family: 'Inter', sans-serif;
      margin-top: 6px;
    }
    .submit-btn:hover:not(:disabled) { opacity: 0.9; transform: translateY(-1px); box-shadow: 0 8px 20px rgba(14,165,233,0.3); }
    .submit-btn:disabled { opacity: 0.5; cursor: not-allowed; }

    .spinner {
      width: 16px; height: 16px;
      border: 2px solid rgba(255,255,255,0.3);
      border-top-color: #fff;
      border-radius: 50%;
      animation: spin 0.7s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
  `]
})
export class LoginComponent {
  private fb = inject(FormBuilder);
  private auth = inject(AuthService);
  private router = inject(Router);
  private toastr = inject(ToastrService);

  loading = signal(false);
  showPassword = signal(false);
  errorMsg = signal('');

  form = this.fb.group({
    login: ['', Validators.required],
    password: ['', Validators.required],
  });

  onSubmit() {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    this.loading.set(true);
    this.errorMsg.set('');

    const { login, password } = this.form.value;
    this.auth.login(login!, password!).subscribe({
      next: () => {
        this.toastr.success('Bem-vindo ao FuelTrack!');
        this.router.navigate(['/dashboard']);
      },
      error: (err) => {
        this.errorMsg.set(err.error?.message ?? 'Credenciais inválidas');
        this.loading.set(false);
      }
    });
  }
}
