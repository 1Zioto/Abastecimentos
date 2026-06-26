// src/app/layout/shell/shell.component.ts
import { Component, signal, inject } from '@angular/core';
import { Router, RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../core/services/auth.service';

interface NavItem {
  label: string;
  icon: string;
  route: string;
  group: NavGroup;
  adminOnly?: boolean;
  privateOnly?: boolean;
}

type NavGroup = 'Principal' | 'Financeiro' | 'Cadastros' | 'Controle' | 'Sistema';

interface VisibleNavGroup {
  label: NavGroup;
  items: NavItem[];
}

@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, CommonModule],
  template: `
    <div class="shell" [class.sidebar-collapsed]="sidebarCollapsed()">
      <header class="mobile-topbar">
        <div class="mobile-brand">
          <span class="logo-icon">⛽</span>
          <span>Abastecimento Vipe</span>
        </div>
        <select class="branch-select mobile-branch" [value]="filialAtual()" (change)="trocarFilial($any($event.target).value)">
          @for (filial of filiaisAcesso(); track filial) {
            <option [value]="filial">{{ filial }}</option>
          }
        </select>
        <button class="logout-btn" (click)="auth.logout()" title="Sair">⏻</button>
      </header>

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
          @for (group of visibleNavGroups(); track group.label) {
            <section class="nav-group" [class.group-collapsed]="isNavGroupCollapsed(group)">
              <button
                type="button"
                class="nav-group-toggle"
                (click)="toggleNavGroup(group.label)"
                [attr.aria-expanded]="!isNavGroupCollapsed(group)"
              >
                <span class="nav-group-label">{{ group.label }}</span>
                <span class="nav-group-meta">
                  <span class="nav-group-count">{{ group.items.length }}</span>
                  <span class="nav-group-chevron">{{ isNavGroupCollapsed(group) ? '▾' : '▴' }}</span>
                </span>
              </button>
              <div class="nav-group-items">
                @for (item of group.items; track item.route) {
                  <a [routerLink]="item.route" routerLinkActive="active" class="nav-item">
                    <span class="nav-icon">{{ item.icon }}</span>
                    <span class="nav-label">{{ item.label }}</span>
                  </a>
                }
              </div>
            </section>
          }
        </nav>

        <div class="sidebar-footer">
          <div class="user-info">
            <div class="user-avatar">{{ userInitial() }}</div>
          <div class="user-details">
              <span class="user-name">{{ auth.currentUser()?.nome }}</span>
              <span class="user-role">{{ auth.currentUser()?.tipo }}</span>
              <button type="button" class="garage-switch" (click)="trocarGaragem()">{{ auth.getGaragem() }}</button>
            </div>
          </div>
          <button class="logout-btn" (click)="auth.logout()" title="Sair">⏻</button>
        </div>
      </aside>

      <!-- Main content -->
      <main class="main-content">
        <div class="content-topbar">
          <div class="topbar-title">
            <span class="topbar-label">Filial atual</span>
            <strong>{{ filialAtual() }}</strong>
          </div>
          <label class="branch-control">
            <span>Trocar filial</span>
            <select class="branch-select" [value]="filialAtual()" (change)="trocarFilial($any($event.target).value)">
              @for (filial of filiaisAcesso(); track filial) {
                <option [value]="filial">{{ filial }}</option>
              }
            </select>
          </label>
        </div>
        @if (routeReady()) {
          <router-outlet />
        } @else {
          <div class="branch-refresh-state">
            <div class="loading-spinner"></div>
            <span>Atualizando filial...</span>
          </div>
        }
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
      gap: 14px;
    }

    .nav-group {
      display: flex;
      flex-direction: column;
      gap: 5px;
    }

    .nav-group-toggle {
      width: 100%;
      border: 0;
      background: transparent;
      padding: 2px 10px 4px 12px;
      color: #94A3B8;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      cursor: pointer;
      border-radius: 8px;
      transition: background 0.2s, color 0.2s;
    }

    .nav-group-toggle:hover {
      background: #F8FAFC;
      color: #64748B;
    }

    .nav-group-label {
      color: #94A3B8;
      font-size: 10px;
      font-weight: 800;
      letter-spacing: 0.7px;
      line-height: 1;
      text-transform: uppercase;
    }

    .nav-group-meta {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      color: #CBD5E1;
      font-size: 11px;
      font-weight: 800;
      line-height: 1;
    }

    .nav-group-count {
      min-width: 18px;
      height: 18px;
      border-radius: 999px;
      background: #F1F5F9;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 0 5px;
    }

    .nav-group-chevron {
      font-size: 12px;
      color: #94A3B8;
    }

    .nav-group-items {
      display: flex;
      flex-direction: column;
      gap: 5px;
    }

    .nav-group.group-collapsed .nav-group-items {
      display: none;
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
    .sidebar-collapsed .nav-group { gap: 4px; }
    .sidebar-collapsed .nav-group-toggle { display: none; }
    .sidebar-collapsed .nav-group-items { display: flex !important; }
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
    .garage-switch {
      margin-top: 4px;
      padding: 0;
      border: none;
      background: transparent;
      color: #B45309;
      font-size: 12px;
      font-weight: 700;
      cursor: pointer;
    }
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

    .content-topbar {
      position: sticky;
      top: 0;
      z-index: 90;
      height: 64px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      padding: 12px 20px;
      background: rgba(255, 255, 255, 0.96);
      border-bottom: 1px solid #E5E7EB;
      backdrop-filter: blur(10px);
    }

    .topbar-title {
      display: flex;
      flex-direction: column;
      gap: 2px;
      min-width: 0;
    }

    .topbar-label,
    .branch-control span {
      color: #64748B;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.5px;
      text-transform: uppercase;
    }

    .topbar-title strong {
      color: #111827;
      font-size: 18px;
      line-height: 1.1;
    }

    .branch-control {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .branch-select {
      min-width: 150px;
      height: 38px;
      border: 1px solid #D1D5DB;
      border-radius: 8px;
      background: #FFFFFF;
      color: #111827;
      padding: 0 34px 0 12px;
      font-size: 13px;
      font-weight: 700;
      outline: none;
      cursor: pointer;
    }

    .branch-select:focus {
      border-color: #2563EB;
      box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.12);
    }

    .mobile-topbar {
      display: none;
    }

    .branch-refresh-state {
      min-height: calc(100vh - 64px);
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
      color: #64748B;
      font-size: 14px;
      font-weight: 700;
    }

    .loading-spinner {
      width: 20px;
      height: 20px;
      border-radius: 50%;
      border: 3px solid #E5E7EB;
      border-top-color: #2563EB;
      animation: spin 0.8s linear infinite;
    }

    @keyframes spin { to { transform: rotate(360deg); } }

    @media (max-width: 768px) {
      :host { min-height: 100vh; }

      .shell,
      .shell.sidebar-collapsed {
        display: block;
        height: 100vh;
        background: #F3F4F6;
      }

      .mobile-topbar {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        height: 64px;
        z-index: 150;
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 10px 14px;
        background: #FFFFFF;
        border-bottom: 1px solid #E5E7EB;
        box-shadow: 0 8px 24px rgba(15, 23, 42, 0.06);
      }

      .mobile-brand {
        display: flex;
        align-items: center;
        gap: 10px;
        min-width: 0;
        color: #111827;
        font-weight: 800;
        font-size: 15px;
      }

      .mobile-brand span:last-child {
        max-width: 140px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .mobile-brand .logo-icon {
        width: 36px;
        height: 36px;
        font-size: 18px;
      }

      .mobile-branch {
        min-width: 118px;
        max-width: 132px;
        height: 36px;
        padding-left: 10px;
        padding-right: 24px;
        font-size: 12px;
      }

      .sidebar {
        position: fixed;
        left: 0;
        right: 0;
        bottom: 0;
        height: 76px;
        z-index: 160;
        border-right: none;
        border-top: 1px solid #E5E7EB;
        box-shadow: 0 -10px 28px rgba(15, 23, 42, 0.08);
      }

      .sidebar-header,
      .sidebar-footer {
        display: none;
      }

      .sidebar-nav {
        height: 100%;
        padding: 8px 10px;
        flex-direction: row;
        overflow-x: auto;
        overflow-y: hidden;
        gap: 8px;
      }

      .nav-group {
        display: contents;
      }

      .nav-group-toggle {
        display: none;
      }

      .nav-group-items,
      .nav-group.group-collapsed .nav-group-items {
        display: contents;
      }

      .nav-item {
        min-width: 72px;
        height: 58px;
        flex-direction: column;
        justify-content: center;
        gap: 4px;
        padding: 7px 8px;
        border-radius: 14px;
      }

      .nav-icon {
        width: auto;
        font-size: 18px;
      }

      .nav-label {
        display: block;
        max-width: 70px;
        font-size: 10px;
        line-height: 1.05;
        text-align: center;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .main-content {
        height: 100vh;
        padding-top: 64px;
        padding-bottom: 76px;
      }

      .content-topbar {
        display: none;
      }
    }
  `]
})
export class ShellComponent {
  auth = inject(AuthService);
  private router = inject(Router);
  sidebarCollapsed = signal(false);
  routeReady = signal(true);
  collapsedNavGroups = signal<Record<NavGroup, boolean>>({
    Principal: false,
    Financeiro: true,
    Cadastros: true,
    Controle: true,
    Sistema: true,
  });

  navGroups: NavGroup[] = ['Principal', 'Financeiro', 'Cadastros', 'Controle', 'Sistema'];

  navItems: NavItem[] = [
    { label: 'Dashboard',        icon: '📊', route: '/dashboard', group: 'Principal', adminOnly: true },
    { label: 'Gráficos',         icon: '📉', route: '/graficos', group: 'Principal', adminOnly: true },
    { label: 'Abastecimentos',   icon: '⛽', route: '/abastecimentos', group: 'Principal' },
    { label: 'Lançar no Sofit',   icon: '↗', route: '/lancar-sofit', group: 'Principal' },
    { label: 'Entrada de Notas', icon: '🧾', route: '/entrada-notas', group: 'Principal' },
    { label: 'Baixa',            icon: '✅', route: '/baixa', group: 'Financeiro', adminOnly: true },
    { label: 'Baixa por Comprovante', icon: '📲', route: '/nova-baixa-comprovante', group: 'Financeiro', adminOnly: true },
    { label: 'Despesas',         icon: '💸', route: '/despesas-avulsas', group: 'Financeiro', adminOnly: true },
    { label: 'Relatórios',       icon: '📈', route: '/relatorios', group: 'Financeiro', adminOnly: true },
    { label: 'Balancete',        icon: '▦', route: '/balancete-privado', group: 'Financeiro', adminOnly: true, privateOnly: true },
    { label: 'Proprietários',    icon: '🏢', route: '/proprietarios', group: 'Cadastros' },
    { label: 'Veículos',         icon: '🚗', route: '/veiculos', group: 'Cadastros' },
    { label: 'Transferir Veículo', icon: '⇄', route: '/transferencia-veiculo', group: 'Cadastros', adminOnly: true },
    { label: 'Motoristas',       icon: '👤', route: '/motoristas', group: 'Cadastros' },
    { label: 'Combustível',      icon: '💲', route: '/valores-combustivel', group: 'Cadastros', adminOnly: true },
    { label: 'Usuários',         icon: '🔐', route: '/usuarios', group: 'Cadastros', adminOnly: true },
    { label: 'Auditoria',        icon: '🔎', route: '/auditoria-abastecimentos', group: 'Controle', adminOnly: true },
    { label: 'Encerrantes',      icon: '⏱', route: '/encerrantes-bomba', group: 'Controle', adminOnly: true },
    { label: 'Histórico',        icon: '🕘', route: '/historico-alteracoes', group: 'Sistema', adminOnly: true },
    { label: 'Erros do App',     icon: '⚠', route: '/app-erros', group: 'Sistema', adminOnly: true },
    { label: 'Configurações',    icon: '⚙', route: '/configuracoes', group: 'Sistema', adminOnly: true },
  ];

  visibleNavItems() {
    return this.navItems.filter(i => {
      if (i.adminOnly && !this.auth.isAdmin()) return false;
      if (i.privateOnly && !this.canAccessPrivateScreens()) return false;
      return true;
    });
  }

  visibleNavGroups(): VisibleNavGroup[] {
    const items = this.visibleNavItems();
    return this.navGroups
      .map(label => ({ label, items: items.filter(item => item.group === label) }))
      .filter(group => group.items.length > 0);
  }

  isNavGroupCollapsed(group: VisibleNavGroup): boolean {
    if (this.sidebarCollapsed()) return false;
    if (this.groupHasActiveRoute(group)) return false;
    return this.collapsedNavGroups()[group.label] ?? false;
  }

  toggleNavGroup(group: NavGroup) {
    this.collapsedNavGroups.update(current => ({
      ...current,
      [group]: !current[group],
    }));
  }

  private groupHasActiveRoute(group: VisibleNavGroup): boolean {
    const currentUrl = this.router.url.split('?')[0].split('#')[0];
    return group.items.some(item =>
      currentUrl === item.route || currentUrl.startsWith(`${item.route}/`)
    );
  }

  canAccessPrivateScreens(): boolean {
    const user = this.auth.currentUser();
    const ident = `${user?.login ?? ''} ${user?.nome ?? ''}`.toLowerCase();
    return user?.tipo === 'admin' && (ident.includes('douglas') || user?.login === 'admin');
  }

  userInitial(): string {
    return (this.auth.currentUser()?.nome?.charAt(0) ?? 'U').toUpperCase();
  }

  toggleSidebar() {
    this.sidebarCollapsed.update(v => !v);
  }

  filiaisAcesso(): string[] {
    return this.auth.getFiliaisAcesso();
  }

  filialAtual(): string {
    const atual = this.auth.getGaragem();
    if (this.auth.canAccessGaragem(atual)) {
      return atual!;
    }
    return this.filiaisAcesso()[0] ?? 'Matriz';
  }

  trocarFilial(filial: string) {
    if (!this.auth.canAccessGaragem(filial) || filial === this.auth.getGaragem()) return;
    this.auth.setGaragem(filial);
    this.routeReady.set(false);
    window.setTimeout(() => this.routeReady.set(true), 0);
  }

  trocarGaragem() {
    this.router.navigate(['/garagem']);
  }
}
