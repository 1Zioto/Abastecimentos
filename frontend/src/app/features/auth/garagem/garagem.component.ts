import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';

type Garagem = {
  nome: string;
  descricao: string;
};

@Component({
  selector: 'app-garagem',
  standalone: true,
  imports: [CommonModule],
  template: `
    <main class="garage-page">
      <section class="garage-panel">
        <div class="brand">
          <span class="brand-icon">⛽</span>
          <div>
            <h1>Selecione a garagem</h1>
            <p>Escolha a filial que será usada nesta sessão</p>
          </div>
        </div>

        <div class="garage-grid">
          @for (garagem of garagens; track garagem.nome) {
            <button type="button" class="garage-card" (click)="selecionar(garagem.nome)">
              <span class="garage-name">{{ garagem.nome }}</span>
              <span class="garage-description">{{ garagem.descricao }}</span>
            </button>
          }
        </div>

        <button type="button" class="logout-link" (click)="auth.logout()">Sair</button>
      </section>
    </main>
  `,
  styles: [`
    :host { display: block; min-height: 100vh; }

    .garage-page {
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
      background: #F3F4F6;
      font-family: Inter, Arial, sans-serif;
    }

    .garage-panel {
      width: min(720px, 100%);
      background: #FFFFFF;
      border: 1px solid #E5E7EB;
      border-radius: 8px;
      padding: 28px;
      box-shadow: 0 18px 45px rgba(15, 23, 42, 0.12);
    }

    .brand {
      display: flex;
      align-items: center;
      gap: 14px;
      margin-bottom: 24px;
    }

    .brand-icon {
      width: 48px;
      height: 48px;
      border-radius: 8px;
      display: grid;
      place-items: center;
      background: #F9CB00;
      font-size: 24px;
    }

    h1 {
      margin: 0;
      color: #111827;
      font-size: 24px;
      font-weight: 700;
    }

    p {
      margin: 4px 0 0;
      color: #6B7280;
      font-size: 14px;
    }

    .garage-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 12px;
    }

    .garage-card {
      appearance: none;
      text-align: left;
      border: 1px solid #D1D5DB;
      background: #FFFFFF;
      border-radius: 8px;
      padding: 18px;
      cursor: pointer;
      transition: border-color 0.18s ease, box-shadow 0.18s ease, transform 0.18s ease;
    }

    .garage-card:hover {
      border-color: #F9CB00;
      box-shadow: 0 10px 24px rgba(15, 23, 42, 0.12);
      transform: translateY(-1px);
    }

    .garage-name {
      display: block;
      color: #111827;
      font-size: 18px;
      font-weight: 700;
    }

    .garage-description {
      display: block;
      margin-top: 6px;
      color: #6B7280;
      font-size: 13px;
    }

    .logout-link {
      margin-top: 22px;
      background: transparent;
      border: none;
      color: #6B7280;
      cursor: pointer;
      font-size: 13px;
      padding: 0;
    }

    @media (max-width: 640px) {
      .garage-panel { padding: 22px; }
      .garage-grid { grid-template-columns: 1fr; }
      .brand { align-items: flex-start; }
    }
  `],
})
export class GaragemComponent implements OnInit {
  auth = inject(AuthService);
  private router = inject(Router);

  private todasGaragens: Garagem[] = [
    { nome: 'Matriz', descricao: 'Filial Cariacica' },
    { nome: 'Viana', descricao: 'Filial Viana' },
  ];

  get garagens(): Garagem[] {
    const permitidas = this.auth.getFiliaisAcesso();
    return this.todasGaragens.filter(garagem => permitidas.includes(garagem.nome));
  }

  ngOnInit() {
    if (this.garagens.length === 1) {
      this.selecionar(this.garagens[0].nome);
    }
  }

  selecionar(garagem: string) {
    if (!this.auth.canAccessGaragem(garagem)) return;
    this.auth.setGaragem(garagem);
    this.router.navigate(['/dashboard']);
  }
}
