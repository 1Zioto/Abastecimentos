// src/app/layout/shell/shell.component.ts
import { Component, signal, inject } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../core/services/auth.service';

interface NavItem {
  label: string;
  icon: string;
  route: string;
  adminOnly?: boolean;
}

@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, CommonModule],
  template: `
    <div class="shell" [class.sidebar-collapsed]="sidebarCollapsed()">
      <!-- Sidebar -->
      <aside class="sidebar">
        <div class="sidebar-header">
          <div class="logo">
            <span class="logo-icon">⛽</span>
            <span class="logo-text">FuelTrack</span>
          </div>
          <button class="collapse-btn" (click)="toggleSidebar()">
            <span>{{ sidebarCollapsed() ? '→' : '←' }}</span>
          </button>
        </div>

        <nav class="sidebar-nav">
          @for (item of visibleNavItems(); track item.route) {
            <a [routerLink]="item.route" routerLinkActive="active" class="nav-item">
              <span class="nav-icon">{{ item.icon }}</span>
              <span class="nav-label">{{ item.label }}</span>
            </a>
          }
        </nav>

        <div class="sidebar-footer">
          <div class="user-info">
            <div class="user-avatar">{{ userInitial() }}</div>
            <div class="user-details">
              <span class="user-name">{{ auth.currentUser()?.nome }}</span>
              <span class="user-role">{{ auth.currentUser()?.tipo }}</span>
            </div>
          </div>
          <button class="logout-btn" (click)="auth.logout()" title="Sair">⏻</button>
        </div>
      </aside>

      <!-- Main content -->
      <main class="main-content">
        <router-outlet />
      </main>
    </div>
  `,
  styles: [`
    :host { display: block; height: 100vh; }

    .shell {
      display: grid;
      grid-template-columns: 240px 1fr;
      height: 100vh;
      background: #0a0f1e;
      transition: grid-template-columns 0.3s ease;
    }
    .shell.sidebar-collapsed {
      grid-template-columns: 64px 1fr;
    }

    .sidebar {
      background: #0d1427;
      border-right: 1px solid #1e2d4a;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      position: relative;
      z-index: 100;
    }

    .sidebar-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 20px 16px;
      border-bottom: 1px solid #1e2d4a;
      min-height: 68px;
    }

    .logo {
      display: flex;
      align-items: center;
      gap: 10px;
      overflow: hidden;
    }
    .logo-icon { font-size: 22px; flex-shrink: 0; }
    .logo-text {
      font-family: 'Rajdhani', sans-serif;
      font-size: 20px;
      font-weight: 700;
      color: #38bdf8;
      letter-spacing: 2px;
      white-space: nowrap;
    }
    .sidebar-collapsed .logo-text { display: none; }

    .collapse-btn {
      background: #1e2d4a;
      border: none;
      color: #64748b;
      width: 28px;
      height: 28px;
      border-radius: 6px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      transition: all 0.2s;
    }
    .collapse-btn:hover { background: #2a3f60; color: #94a3b8; }

    .sidebar-nav {
      flex: 1;
      padding: 12px 8px;
      overflow-y: auto;
      overflow-x: hidden;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .nav-item {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 10px 12px;
      border-radius: 8px;
      color: #64748b;
      text-decoration: none;
      transition: all 0.2s;
      white-space: nowrap;
      overflow: hidden;
    }
    .nav-item:hover { background: #1e2d4a; color: #94a3b8; }
    .nav-item.active { background: #0ea5e920; color: #38bdf8; }
    .nav-item.active .nav-icon { color: #38bdf8; }

    .nav-icon { font-size: 18px; flex-shrink: 0; width: 24px; text-align: center; }
    .nav-label { font-size: 13px; font-weight: 500; }
    .sidebar-collapsed .nav-label { display: none; }

    .sidebar-footer {
      padding: 12px 8px;
      border-top: 1px solid #1e2d4a;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
    }

    .user-info {
      display: flex;
      align-items: center;
      gap: 10px;
      overflow: hidden;
    }
    .user-avatar {
      width: 34px;
      height: 34px;
      border-radius: 50%;
      background: linear-gradient(135deg, #0ea5e9, #6366f1);
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 700;
      color: #fff;
      font-size: 14px;
      flex-shrink: 0;
    }
    .user-details { overflow: hidden; }
    .user-name { display: block; font-size: 12px; font-weight: 600; color: #e2e8f0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .user-role { display: block; font-size: 10px; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; }
    .sidebar-collapsed .user-details { display: none; }

    .logout-btn {
      background: transparent;
      border: none;
      color: #64748b;
      cursor: pointer;
      font-size: 18px;
      padding: 6px;
      border-radius: 6px;
      transition: all 0.2s;
      flex-shrink: 0;
    }
    .logout-btn:hover { color: #f87171; background: #fee2e220; }

    .main-content {
      background: #0f172a;
      overflow-y: auto;
      overflow-x: hidden;
    }
  `]
})
export class ShellComponent {
  auth = inject(AuthService);
  sidebarCollapsed = signal(false);

  navItems: NavItem[] = [
    { label: 'Dashboard',        icon: '📊', route: '/dashboard' },
    { label: 'Abastecimentos',   icon: '⛽', route: '/abastecimentos' },
    { label: 'Baixa',            icon: '✅', route: '/baixa' },
    { label: 'Entrada de Notas', icon: '🧾', route: '/entrada-notas' },
    { label: 'Relatórios',       icon: '📈', route: '/relatorios' },
    { label: 'Combustível',      icon: '💲', route: '/valores-combustivel' },
    { label: 'Proprietários',    icon: '🏢', route: '/proprietarios' },
    { label: 'Veículos',         icon: '🚗', route: '/veiculos' },
    { label: 'Motoristas',       icon: '👤', route: '/motoristas' },
    { label: 'Usuários',         icon: '🔐', route: '/usuarios', adminOnly: true },
  ];

  visibleNavItems() {
    return this.navItems.filter(i => !i.adminOnly || this.auth.isAdmin());
  }

  userInitial(): string {
    return (this.auth.currentUser()?.nome?.charAt(0) ?? 'U').toUpperCase();
  }

  toggleSidebar() {
    this.sidebarCollapsed.update(v => !v);
  }
}
