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
            <span class="logo-text">Abastecimento Vipe</span>
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
      grid-template-columns: 280px 1fr;
      height: 100vh;
      background: #F3F4F6;
      transition: grid-template-columns 0.3s ease;
    }
    .shell.sidebar-collapsed {
      grid-template-columns: 76px 1fr;
    }

    .sidebar {
      background: #FFFFFF;
      border-right: 1px solid var(--border-color);
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
      border-bottom: 1px solid #E5E7EB;
      min-height: 76px;
      background: #FFFFFF;
      gap: 10px;
    }

    .logo {
      display: flex;
      align-items: center;
      gap: 10px;
      overflow: hidden;
      min-width: 0;
      flex: 1;
    }
    .logo-icon {
      width: 40px;
      height: 40px;
      border-radius: 10px;
      background: #FFFFFF;
      border: 1px solid #E5E7EB;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 20px;
      flex-shrink: 0;
    }
    .logo-text {
      font-family: 'Inter', sans-serif;
      font-size: 14px;
      line-height: 1.1;
      font-weight: 700;
      color: #111827;
      letter-spacing: 0;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      min-width: 0;
    }
    .sidebar-collapsed .logo-text { display: none; }

    .collapse-btn {
      background: #FFFFFF;
      border: 1px solid #E5E7EB;
      color: #6B7280;
      width: 32px;
      height: 32px;
      border-radius: 10px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      transition: all 0.2s;
    }
    .collapse-btn:hover { background: #F9FAFB; color: #111827; }

    .sidebar-nav {
      flex: 1;
      padding: 14px 12px;
      overflow-y: auto;
      overflow-x: hidden;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .nav-item {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px 12px;
      border-radius: 12px;
      color: var(--text-muted);
      text-decoration: none;
      transition: all 0.2s;
      white-space: nowrap;
      overflow: hidden;
    }
    .nav-item:hover { background: #F3F4F6; color: #111827; }
    .nav-item.active {
      background: #F5ECCC;
      color: #111827;
      box-shadow: inset 0 0 0 1px #F0E3B6;
    }
    .nav-item.active .nav-icon { color: #D19700; }

    .nav-icon { font-size: 16px; flex-shrink: 0; width: 24px; text-align: center; }
    .nav-label { font-size: 14px; font-weight: 600; color: #1F2937; }
    .sidebar-collapsed .nav-label { display: none; }

    .sidebar-footer {
      padding: 14px 12px;
      border-top: 1px solid #E5E7EB;
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
      width: 40px;
      height: 40px;
      border-radius: 50%;
      background: #F5C400;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 700;
      color: #111827;
      font-size: 16px;
      flex-shrink: 0;
    }
    .user-details { overflow: hidden; }
    .user-name { display: block; font-size: 13px; font-weight: 700; color: #1F2937; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .user-role { display: block; font-size: 11px; color: #6B7280; text-transform: uppercase; letter-spacing: 0.5px; }
    .sidebar-collapsed .user-details { display: none; }

    .logout-btn {
      background: transparent;
      border: none;
      color: #6B7280;
      cursor: pointer;
      font-size: 20px;
      padding: 8px;
      border-radius: 10px;
      transition: all 0.2s;
      flex-shrink: 0;
    }
    .logout-btn:hover { color: #111827; background: #F3F4F6; }

    .main-content {
      background: #F3F4F6;
      overflow-y: auto;
      overflow-x: hidden;
    }
  `]
})
export class ShellComponent {
  auth = inject(AuthService);
  sidebarCollapsed = signal(false);

  navItems: NavItem[] = [
    { label: 'Dashboard',        icon: '📊', route: '/dashboard', adminOnly: true },
    { label: 'Abastecimentos',   icon: '⛽', route: '/abastecimentos' },
    { label: 'Baixa',            icon: '✅', route: '/baixa', adminOnly: true },
    { label: 'Entrada de Notas', icon: '🧾', route: '/entrada-notas' },
    { label: 'Relatórios',       icon: '📈', route: '/relatorios', adminOnly: true },
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
