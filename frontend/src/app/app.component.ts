// src/app/app.component.ts
import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, CommonModule],
  template: `
    @if (!online()) {
      <div class="offline-banner">
        Sem internet. Você está no modo offline.
      </div>
    }
    <router-outlet />
  `,
  styles: [`
    .offline-banner {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      z-index: 2000;
      background: #3C3D3E;
      color: #ECEDEC;
      text-align: center;
      padding: 8px 12px;
      font-size: 12px;
      font-weight: 600;
      letter-spacing: 0.2px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.2);
    }
  `]
})
export class AppComponent {
  online = signal(navigator.onLine);

  constructor() {
    window.addEventListener('online', () => this.online.set(true));
    window.addEventListener('offline', () => this.online.set(false));
  }
}
