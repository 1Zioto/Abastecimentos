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
          <h1>Abastecimento Vipe</h1>
          <p>Vipe Transportes (Garagem)</p>
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
      background: var(--bg-app);
      position: relative;
      overflow: hidden;
      font-family: 'Inter', sans-serif;
    }

    .login-bg { position: absolute; inset: 0; pointer-events: none; }
    .bg-orb {
      position: absolute;
      border-radius: 50%;
      filter: blur(80px);
      opacity: 0.08;
    }
    .orb1 { width: 500px; height: 500px; background: var(--brand-yellow); top: -100px; right: -100px; }
    .orb2 { width: 400px; height: 400px; background: var(--brand-charcoal); bottom: -100px; left: -100px; }
    .grid-lines {
      position: absolute; inset: 0;
      background-image:
        linear-gradient(rgba(249,203,0,0.06) 1px, transparent 1px),
        linear-gradient(90deg, rgba(249,203,0,0.06) 1px, transparent 1px);
      background-size: 40px 40px;
    }

    .login-card {
      background: var(--bg-panel);
      border: 1px solid var(--border-color);
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
      color: var(--accent);
      letter-spacing: 3px;
      margin: 0;
    }
    .brand p { font-size: 12px; color: var(--text-muted); margin-top: 6px; }

    .login-form { display: flex; flex-direction: column; gap: 18px; }

    .field { display: flex; flex-direction: column; gap: 6px; }
    .field label { font-size: 12px; font-weight: 600; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px; }
    .field input {
      background: var(--bg-app);
      border: 1px solid var(--border-color);
      border-radius: 10px;
      padding: 12px 14px;
      color: var(--text-primary);
      font-size: 14px;
      font-family: 'Inter', sans-serif;
      outline: none;
      transition: border-color 0.2s;
      width: 100%;
      box-sizing: border-box;
    }
    .field input:focus { border-color: var(--accent); box-shadow: 0 0 0 3px rgba(249,203,0,0.18); }
    .field input::placeholder { color: #666; }

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
      background: var(--accent);
      border: none;
      border-radius: 10px;
      padding: 14px;
      color: var(--accent-contrast);
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
    .submit-btn:hover:not(:disabled) { opacity: 0.9; transform: translateY(-1px); box-shadow: 0 8px 20px rgba(249,203,0,0.28); }
    .submit-btn:disabled { opacity: 0.5; cursor: not-allowed; }

    .spinner {
      width: 16px; height: 16px;
      border: 2px solid rgba(0,0,0,0.2);
      border-top-color: #000;
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
          this.toastr.success('Bem-vindo ao Abastecimento Vipe!');
        this.router.navigate(['/dashboard']);
      },
      error: (err) => {
        this.errorMsg.set(err.error?.message ?? 'Credenciais inválidas');
        this.loading.set(false);
      }
    });
  }
}
