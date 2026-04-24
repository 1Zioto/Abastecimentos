import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/services/api.service';
import { DashboardData } from '../../shared/models';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <div class="dashboard-page">
      <header class="dashboard-header">
        <div>
          <h1>Dashboard</h1>
          <p>Visão geral dos últimos 12 meses</p>
        </div>
        <div class="dashboard-actions">
          @if (canInstallApp()) {
            <button type="button" class="install-app-btn" (click)="installApp()">
              <span class="install-icon">⬇</span>
              Instalar aplicativo
            </button>
          } @else if (isStandalone()) {
            <span class="installed-badge">Aplicativo instalado</span>
          }
        </div>
      </header>

      @if (loading()) {
        <div class="loading-state">
          <div class="loading-spinner"></div>
          <span>Carregando dados do dashboard...</span>
        </div>
      }

      @if (data(); as d) {
        <section class="kpi-grid">
          <article class="kpi-card">
            <div class="kpi-icon icon-success">💰</div>
            <div class="kpi-content">
              <span class="kpi-value">{{ kpiValorVendido(d) | currency:'BRL':'symbol':'1.2-2' }}</span>
              <span class="kpi-label">Valor Total Vendido</span>
            </div>
          </article>

          <article class="kpi-card">
            <div class="kpi-icon icon-pending">⏳</div>
            <div class="kpi-content">
              <span class="kpi-value">{{ kpiValorPendente(d) | currency:'BRL':'symbol':'1.2-2' }}</span>
              <span class="kpi-label">Valor Pendente de Baixa</span>
            </div>
          </article>

          <article class="kpi-card">
            <div class="kpi-icon icon-primary">💰</div>
            <div class="kpi-content">
              <span class="kpi-value">{{ kpiValorRecebido(d) | currency:'BRL':'symbol':'1.2-2' }}</span>
              <span class="kpi-label">Valor Total Recebido</span>
            </div>
          </article>
        </section>

        <section class="charts-grid">
          <article class="panel line-panel">
            <div class="panel-header">
              <h3>Últimos 12 meses — Comprado x Vendido (L)</h3>
            </div>
            @if (selectedMesRef() || selectedStatus()) {
              <div class="active-filters">
                @if (selectedMesRef()) {
                  <span class="filter-chip">Mês: {{ mesLabelSelecionado(d) }}</span>
                }
                @if (selectedStatus()) {
                  <span class="filter-chip">Status: {{ selectedStatus() }}</span>
                }
                <button class="btn-clear-filters" (click)="clearChartFilters()">Limpar filtros</button>
              </div>
            }
            <div class="bar-chart-wrap">
              <div class="bar-chart-grid"></div>
              <div class="bar-groups">
                @for (item of d.comparativo_12_meses; track item.mes_ref) {
                  <div class="bar-group" [class.active]="selectedMesRef() === item.mes_ref" (click)="toggleMesFilter(item.mes_ref)">
                    <div class="bars">
                      <div class="bar bar-comprado" [style.height.%]="barHeight(getCompradoLitros(item))" [title]="'Comprado: ' + (getCompradoLitros(item) | number:'1.0-2') + ' L'">
                        <span class="bar-value">{{ getCompradoLitros(item) | number:'1.0-0' }}</span>
                      </div>
                      <div class="bar bar-vendido" [style.height.%]="barHeight(getVendidoLitros(item))" [title]="'Vendido: ' + (getVendidoLitros(item) | number:'1.0-2') + ' L'">
                        <span class="bar-value">{{ getVendidoLitros(item) | number:'1.0-0' }}</span>
                      </div>
                    </div>
                    <span class="bar-label">{{ item.label }}</span>
                  </div>
                }
              </div>
            </div>
            <div class="compare-legend">
              <span><i class="legend-dot comprado"></i> Comprado (Entrada de Notas)</span>
              <span><i class="legend-dot vendido"></i> Vendido (Registros de Abastecimento)</span>
            </div>
          </article>

          <article class="panel donut-panel">
            <div class="panel-header">
              <h3>Pendente x Pago</h3>
            </div>
            <div class="donut-layout">
              <svg viewBox="0 0 220 220" class="donut-svg">
                <g transform="translate(110,110)">
                  @for (slice of donutSlices(d); track slice.status) {
                    <path
                      class="donut-slice"
                      [attr.d]="slice.path"
                      [attr.fill]="slice.color"
                      [class.selected]="selectedStatus() === slice.status"
                      (click)="toggleStatusFilter(slice.status); $event.stopPropagation()"
                    ></path>
                  }
                  <circle cx="0" cy="0" r="46" fill="#FFFFFF"></circle>
                  <text x="0" y="-2" text-anchor="middle" class="donut-center-value">{{ totalStatusLitros(d) | number:'1.0-0' }} L</text>
                  <text x="0" y="18" text-anchor="middle" class="donut-center-sub">Total</text>
                </g>
              </svg>
            </div>
            <div class="fuel-legend">
              @for (item of statusResumoFiltrado(d); track item.status; let i = $index) {
                <div class="legend-item legend-clickable" (click)="toggleStatusFilter(item.status)">
                  <span class="legend-dot" [style.background]="donutColors[i % donutColors.length]"></span>
                  <span class="legend-label">{{ item.status }}</span>
                  <span class="legend-value">{{ (item.litros_total ?? 0) | number:'1.0-2' }} L</span>
                </div>
              }
            </div>
            @if (!hasStatusData(d)) {
              <p class="chart-helper">Sem dados no período selecionado.</p>
            }
          </article>
        </section>

        <section class="charts-grid">
          <article class="panel line-panel">
            <div class="panel-header">
              <h3>Últimos 12 meses — Comprado x Vendido (R$)</h3>
            </div>
            <div class="bar-chart-wrap">
              <div class="bar-chart-grid"></div>
              <div class="bar-groups">
                @for (item of d.comparativo_12_meses; track item.mes_ref) {
                  <div class="bar-group" [class.active]="selectedMesRef() === item.mes_ref" (click)="toggleMesFilter(item.mes_ref)">
                    <div class="bars">
                      <div class="bar bar-comprado" [style.height.%]="barHeightValor(getCompradoValor(item))" [title]="'Comprado: ' + (getCompradoValor(item) | currency:'BRL':'symbol':'1.2-2')">
                        <span class="bar-value">{{ getCompradoValor(item) | number:'1.0-0' }}</span>
                      </div>
                      <div class="bar bar-vendido" [style.height.%]="barHeightValor(getVendidoValor(item))" [title]="'Vendido: ' + (getVendidoValor(item) | currency:'BRL':'symbol':'1.2-2')">
                        <span class="bar-value">{{ getVendidoValor(item) | number:'1.0-0' }}</span>
                      </div>
                    </div>
                    <span class="bar-label">{{ item.label }}</span>
                  </div>
                }
              </div>
            </div>
            <div class="compare-legend">
              <span><i class="legend-dot comprado"></i> Comprado (R$)</span>
              <span><i class="legend-dot vendido"></i> Vendido (R$)</span>
            </div>
          </article>

          <article class="panel donut-panel">
            <div class="panel-header">
              <h3>Últimos 12 meses — Pendente x Pago (R$)</h3>
            </div>
            <div class="donut-layout">
              <svg viewBox="0 0 220 220" class="donut-svg">
                <g transform="translate(110,110)">
                  @for (slice of donutSlicesValor(d); track slice.status) {
                    <path
                      class="donut-slice"
                      [attr.d]="slice.path"
                      [attr.fill]="slice.color"
                      [class.selected]="selectedStatus() === slice.status"
                      (click)="toggleStatusFilter(slice.status); $event.stopPropagation()"
                    ></path>
                  }
                  <circle cx="0" cy="0" r="46" fill="#FFFFFF"></circle>
                  <text x="0" y="-2" text-anchor="middle" class="donut-center-value">{{ totalStatusValor(d) | currency:'BRL':'symbol':'1.0-0' }}</text>
                  <text x="0" y="18" text-anchor="middle" class="donut-center-sub">Total</text>
                </g>
              </svg>
            </div>
            <div class="fuel-legend">
              @for (item of statusResumoFiltrado(d); track item.status; let i = $index) {
                <div class="legend-item legend-clickable" (click)="toggleStatusFilter(item.status)">
                  <span class="legend-dot" [style.background]="donutColors[i % donutColors.length]"></span>
                  <span class="legend-label">{{ item.status }}</span>
                  <span class="legend-value">{{ (item.valor_total ?? 0) | currency:'BRL':'symbol':'1.2-2' }}</span>
                </div>
              }
            </div>
            @if (!hasStatusValorData(d)) {
              <p class="chart-helper">Sem dados no período selecionado.</p>
            }
            <div class="compare-legend">
              <span><i class="legend-dot pendente"></i> Pendente (R$)</span>
              <span><i class="legend-dot pago"></i> Pago (R$)</span>
            </div>
          </article>
        </section>

        <section class="panel table-panel">
          <div class="panel-header">
            <h3>Top Proprietários no Período</h3>
            <a routerLink="/relatorios" class="panel-link">Ver relatórios →</a>
          </div>

          @if (d.top_proprietarios.length > 0) {
            <div class="table-wrap">
              <table class="ranking-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Proprietário</th>
                    <th class="align-right">Abastecimentos</th>
                    <th class="align-right">Valor total</th>
                  </tr>
                </thead>
                <tbody>
                  @for (item of d.top_proprietarios; track item.id_proprietario; let i = $index) {
                    <tr>
                      <td><span class="rank-badge">{{ i + 1 }}</span></td>
                      <td>{{ item.nome_proprietario || '—' }}</td>
                      <td class="align-right">{{ item.total }}</td>
                      <td class="align-right total-value">{{ item.valor | currency:'BRL':'symbol':'1.2-2' }}</td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          } @else {
            <div class="empty-state table-empty">
              <span class="empty-icon">📄</span>
              <p>Sem dados</p>
            </div>
          }
        </section>
      }
    </div>
  `,
  styles: [`
    :host { display: block; }

    .dashboard-page {
      min-height: 100%;
      background: #F3F4F6;
      padding: 28px;
      color: #111827;
      font-family: 'Inter', sans-serif;
    }

    .dashboard-header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      margin-bottom: 24px;
      gap: 12px;
    }

    .dashboard-actions {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      min-height: 40px;
    }

    .install-app-btn {
      border: 1px solid #FDE68A;
      background: #FEF3C7;
      color: #92400E;
      border-radius: 12px;
      padding: 10px 14px;
      font-size: 13px;
      font-weight: 700;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 8px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
      transition: transform 0.2s ease, background 0.2s ease;
      white-space: nowrap;
    }

    .install-app-btn:hover {
      background: #FDE68A;
      transform: translateY(-1px);
    }

    .install-icon {
      width: 20px;
      height: 20px;
      border-radius: 999px;
      background: #FFFFFF;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      line-height: 1;
    }

    .installed-badge {
      border: 1px solid #BBF7D0;
      background: #DCFCE7;
      color: #166534;
      border-radius: 999px;
      padding: 8px 12px;
      font-size: 12px;
      font-weight: 700;
      white-space: nowrap;
    }

    .dashboard-header h1 {
      margin: 0;
      font-size: 30px;
      line-height: 1.2;
      font-weight: 700;
      color: #111827;
    }

    .dashboard-header p {
      margin: 6px 0 0;
      color: #6B7280;
      font-size: 14px;
    }

    .header-filters {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }

    .filter-select {
      border: 1px solid #E5E7EB;
      background: #FFFFFF;
      color: #111827;
      border-radius: 12px;
      padding: 10px 12px;
      min-width: 130px;
      font-size: 13px;
      outline: none;
      transition: all 0.2s ease;
    }

    .filter-select:focus {
      border-color: #2563EB;
      box-shadow: 0 0 0 3px #DBEAFE;
    }

    .kpi-grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 16px;
      margin-bottom: 18px;
    }

    .kpi-card {
      background: #FFFFFF;
      border: 1px solid #E5E7EB;
      border-radius: 14px;
      padding: 18px;
      display: flex;
      align-items: center;
      gap: 12px;
      box-shadow: 0 4px 14px rgba(0, 0, 0, 0.05);
      transition: transform 0.2s ease, box-shadow 0.2s ease;
    }

    .kpi-card:hover {
      transform: translateY(-2px);
      box-shadow: 0 8px 18px rgba(0, 0, 0, 0.08);
    }

    .kpi-icon {
      width: 42px;
      height: 42px;
      border-radius: 12px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 20px;
      background: #F1F5F9;
    }

    .icon-primary { background: #FEF3C7; }
    .icon-success { background: #DCFCE7; }
    .icon-info { background: #FEE2E2; }
    .icon-pending { background: #DBEAFE; }
    .kpi-content {
      display: flex;
      flex-direction: column;
      gap: 3px;
      min-width: 0;
    }

    .kpi-value {
      font-size: 21px;
      line-height: 1.1;
      font-weight: 700;
      color: #111827;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .kpi-label {
      font-size: 12px;
      color: #6B7280;
      text-transform: uppercase;
      letter-spacing: 0.4px;
    }

    .charts-grid {
      display: grid;
      grid-template-columns: 2fr 1fr;
      gap: 16px;
      margin-bottom: 18px;
    }

    .panel {
      background: #FFFFFF;
      border: 1px solid #E5E7EB;
      border-radius: 14px;
      box-shadow: 0 4px 14px rgba(0, 0, 0, 0.05);
      padding: 18px;
      transition: box-shadow 0.2s ease;
    }

    .panel:hover {
      box-shadow: 0 8px 20px rgba(0, 0, 0, 0.07);
    }

    .panel-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 14px;
    }

    .panel-header h3 {
      margin: 0;
      font-size: 23px;
      font-weight: 600;
      color: #111827;
    }

    .panel-link {
      font-size: 12px;
      color: #A16207;
      background: #FEF3C7;
      border: 1px solid #FDE68A;
      border-radius: 10px;
      text-decoration: none;
      transition: all 0.2s ease;
      padding: 8px 12px;
      font-weight: 600;
    }

    .panel-link:hover {
      background: #FDE68A;
      color: #92400E;
    }

    .bar-chart-wrap {
      position: relative;
      height: 270px;
      border-radius: 12px;
      background: #F8FAFC;
      border: 1px solid #E5E7EB;
      padding: 12px 10px 8px;
      overflow: hidden;
    }

    .bar-chart-grid {
      position: absolute;
      inset: 12px 10px 26px;
      background-image: linear-gradient(to top, #E5E7EB 1px, transparent 1px);
      background-size: 100% 25%;
      opacity: 0.7;
      pointer-events: none;
    }

    .bar-groups {
      position: relative;
      z-index: 1;
      height: 100%;
      display: grid;
      grid-template-columns: repeat(12, minmax(0, 1fr));
      gap: 6px;
      align-items: end;
    }

    .bar-group {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: flex-end;
      gap: 6px;
      min-width: 0;
      cursor: pointer;
      border-radius: 8px;
      transition: background 0.2s ease;
    }

    .bar-group:hover {
      background: #EEF2FF;
    }

    .bar-group.active {
      background: #DBEAFE;
    }

    .bars {
      height: 220px;
      width: 100%;
      display: flex;
      align-items: flex-end;
      justify-content: center;
      gap: 4px;
    }

    .bar {
      width: 42%;
      min-height: 2px;
      border-radius: 6px 6px 2px 2px;
      transition: transform 0.2s ease, opacity 0.2s ease;
      position: relative;
      display: flex;
      align-items: flex-start;
      justify-content: center;
    }

    .bar:hover {
      transform: translateY(-2px);
      opacity: 0.9;
    }

    .bar-comprado { background: #2563EB; }
    .bar-vendido { background: #22C55E; }
    .bar-pendente { background: #F59E0B; }
    .bar-pago { background: #16A34A; }

    .bar-value {
      position: absolute;
      top: -30px;
      left: 50%;
      transform: translateX(-50%) rotate(-90deg) translateX(50%);
      transform-origin: center;
      color: #111827;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.2px;
      white-space: nowrap;
      pointer-events: none;
      text-shadow: none;
    }

    .bar-label {
      font-size: 13px;
      color: #6B7280;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 100%;
    }

    .compare-legend {
      display: flex;
      gap: 18px;
      margin-top: 10px;
      color: #6B7280;
      font-size: 15px;
      flex-wrap: wrap;
    }

    .compare-legend .legend-dot {
      display: inline-block;
      width: 10px;
      height: 10px;
      border-radius: 50%;
      margin-right: 6px;
      vertical-align: middle;
    }

    .compare-legend .legend-dot.comprado { background: #2563EB; }
    .compare-legend .legend-dot.vendido { background: #22C55E; }
    .compare-legend .legend-dot.pendente { background: #F59E0B; }
    .compare-legend .legend-dot.pago { background: #16A34A; }

    .legend-dot.comprado { background: #F59E0B; }
    .legend-dot.vendido { background: #22C55E; }

    .donut-layout {
      display: flex;
      justify-content: center;
      margin-bottom: 12px;
    }

    .active-filters { display:flex; align-items:center; gap:8px; flex-wrap:wrap; margin-bottom:10px; }
    .filter-chip { background:#EEF2FF; color:#1E3A8A; border:1px solid #C7D2FE; padding:4px 8px; border-radius:999px; font-size:11px; font-weight:600; }
    .btn-clear-filters { border:1px solid #E5E7EB; background:#FFFFFF; color:#374151; border-radius:8px; padding:4px 10px; font-size:11px; cursor:pointer; }
    .btn-clear-filters:hover { background:#F9FAFB; }

    .donut-svg { width: 210px; height: 210px; }
    .donut-slice { cursor: pointer; transition: opacity 0.2s ease, transform 0.2s ease; }
    .donut-slice:hover { opacity: 0.9; }
    .donut-slice.selected { opacity: 1; stroke:#111827; stroke-width:2; }
    .donut-center-value { font-size: 17px; font-weight: 700; fill:#111827; }
    .donut-center-sub { font-size: 13px; fill:#9CA3AF; }

    .fuel-legend {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .chart-helper {
      color: #9CA3AF;
      font-size: 12px;
      text-align: center;
      margin-top: 8px;
    }

    .legend-item {
      display: grid;
      grid-template-columns: 14px 1fr auto;
      align-items: center;
      gap: 8px;
      font-size: 15px;
      color: #6B7280;
    }
    .legend-clickable { cursor:pointer; border-radius:8px; padding:4px 6px; transition: background 0.2s ease; }
    .legend-clickable:hover { background:#F3F4F6; }

    .legend-dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
    }

    .legend-label {
      color: #111827;
      font-weight: 500;
    }

    .legend-value {
      color: #6B7280;
      font-weight: 600;
    }

    .table-wrap { overflow: auto; }

    .ranking-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 13px;
    }

    .ranking-table th {
      text-align: left;
      color: #6B7280;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.4px;
      border-bottom: 1px solid #E5E7EB;
      padding: 10px 8px;
    }

    .ranking-table td {
      border-bottom: 1px solid #F3F4F6;
      padding: 10px 8px;
      color: #111827;
    }

    .ranking-table tbody tr {
      transition: background-color 0.2s ease;
    }

    .ranking-table tbody tr:hover {
      background: #F3F4F6;
    }

    .align-right { text-align: right; }

    .rank-badge {
      width: 22px;
      height: 22px;
      border-radius: 999px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      background: #F1F5F9;
      color: #6B7280;
      font-size: 11px;
      font-weight: 700;
    }

    .total-value {
      color: #16A34A;
      font-weight: 600;
    }

    .empty-state {
      min-height: 200px;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-direction: column;
      gap: 8px;
      color: #9CA3AF;
      text-align: center;
      border: 1px dashed #E5E7EB;
      border-radius: 12px;
      background: #FAFAFA;
    }
    .empty-state small {
      color: #9CA3AF;
      font-size: 12px;
      max-width: 220px;
    }

    .table-empty {
      min-height: 130px;
      margin-top: 6px;
    }

    .empty-icon {
      font-size: 26px;
      line-height: 1;
    }

    .loading-state {
      min-height: 220px;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
      color: #6B7280;
      font-size: 14px;
    }

    .loading-spinner {
      width: 22px;
      height: 22px;
      border-radius: 50%;
      border: 3px solid #DBEAFE;
      border-top-color: #2563EB;
      animation: spin 0.8s linear infinite;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    @media (max-width: 1160px) {
      .kpi-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .charts-grid { grid-template-columns: 1fr; }
    }

    @media (max-width: 760px) {
      .dashboard-page { padding: 16px; }
      .dashboard-header { flex-direction: column; }
      .dashboard-actions { width: 100%; justify-content: flex-start; }
      .kpi-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .header-filters { width: 100%; }
      .filter-select { flex: 1; min-width: 0; }
    }
  `]
})
export class DashboardComponent implements OnInit {
  private api = inject(ApiService);

  data = signal<DashboardData | null>(null);
  loading = signal(true);
  selectedMesRef = signal<string | null>(null);
  selectedStatus = signal<'Pendente' | 'Pago' | null>(null);
  canInstallApp = signal(false);
  isStandalone = signal(false);
  private installPromptEvent: BeforeInstallPromptEvent | null = null;

  donutGradient = signal('conic-gradient(#CBD5F5 0% 100%)');

  readonly donutColors = ['#F59E0B', '#16A34A'];

  ngOnInit() {
    this.setupInstallPrompt();
    this.load();
  }

  setupInstallPrompt() {
    this.isStandalone.set(this.isRunningStandalone());
    window.addEventListener('beforeinstallprompt', (event) => {
      event.preventDefault();
      this.installPromptEvent = event as BeforeInstallPromptEvent;
      this.canInstallApp.set(!this.isRunningStandalone());
    });

    window.addEventListener('appinstalled', () => {
      this.installPromptEvent = null;
      this.canInstallApp.set(false);
      this.isStandalone.set(true);
    });
  }

  async installApp() {
    if (!this.installPromptEvent) return;
    await this.installPromptEvent.prompt();
    const choice = await this.installPromptEvent.userChoice;
    this.installPromptEvent = null;
    this.canInstallApp.set(choice.outcome !== 'accepted' && !this.isRunningStandalone());
    this.isStandalone.set(this.isRunningStandalone());
  }

  load() {
    this.loading.set(true);
    this.api.getDashboard().subscribe({
      next: (d) => {
        const normalized = this.normalizeDashboard(d as DashboardData & any);
        this.data.set(normalized);
        this.refreshCharts(normalized);
        this.loading.set(false);
      },
      error: () => {
        this.data.set(null);
        this.loading.set(false);
      }
    });
  }

  refreshCharts(d: DashboardData) {
    this.refreshDonutChart(d);
  }

  refreshDonutChart(d: DashboardData) {
    const items = (d?.status_resumo ?? []).filter((item) => (item?.total || 0) > 0);
    if (!items.length) {
      this.donutGradient.set('conic-gradient(#CBD5F5 0% 100%)');
      return;
    }

    const total = items.reduce((sum, item) => sum + (item.total || 0), 0);
    let start = 0;
    const parts = items.map((item, index) => {
      const pct = ((item.total || 0) / total) * 100;
      const end = start + pct;
      const color = this.donutColors[index % this.donutColors.length];
      const part = `${color} ${start.toFixed(2)}% ${end.toFixed(2)}%`;
      start = end;
      return part;
    });

    this.donutGradient.set(`conic-gradient(${parts.join(', ')})`);
  }

  barHeight(value: number): number {
    const current = this.data();
    if (!current?.comparativo_12_meses?.length) return 0;
    const selectedStatus = this.selectedStatus();
    const comparativo = current.comparativo_12_meses.filter((item) => {
      const mes = this.selectedMesRef();
      return !mes || item.mes_ref === mes;
    });
    const max = Math.max(
      1,
      ...comparativo.map((item) =>
        Math.max(
          item.comprado_litros || 0,
          selectedStatus === 'Pago'
            ? (item.vendido_litros_pago ?? item.vendido_litros ?? 0)
            : selectedStatus === 'Pendente'
              ? (item.vendido_litros_pendente ?? item.vendido_litros ?? 0)
              : (item.vendido_litros ?? 0)
        )
      )
    );
    return Math.max(2, Math.round(((value || 0) / max) * 84));
  }

  barHeightValor(value: number): number {
    const current = this.data();
    if (!current?.comparativo_12_meses?.length) return 0;
    const mes = this.selectedMesRef();
    const status = this.selectedStatus();
    const comparativo = current.comparativo_12_meses.filter((item) => !mes || item.mes_ref === mes);
    const max = Math.max(
      1,
      ...comparativo.map((item) =>
        Math.max(
          Number(item.comprado_valor ?? 0),
          status === 'Pago'
            ? Number(item.vendido_valor_pago ?? item.vendido_valor ?? 0)
            : status === 'Pendente'
              ? Number(item.vendido_valor_pendente ?? item.vendido_valor ?? 0)
              : Number(item.vendido_valor ?? 0),
          Number(item.vendido_valor_pendente ?? 0),
          Number(item.vendido_valor_pago ?? 0)
        )
      )
    );
    return Math.max(2, Math.round(((value || 0) / max) * 84));
  }

  toggleMesFilter(mesRef: string): void {
    this.selectedMesRef.set(this.selectedMesRef() === mesRef ? null : mesRef);
  }

  toggleStatusFilter(status: string): void {
    const normalized = this.normalizeStatus(status);
    if (!normalized) return;
    this.selectedStatus.set(this.selectedStatus() === normalized ? null : normalized);
  }

  clearChartFilters(): void {
    this.selectedMesRef.set(null);
    this.selectedStatus.set(null);
  }

  mesLabelSelecionado(d: DashboardData): string {
    const selected = this.selectedMesRef();
    if (!selected) return '';
    const found = (d?.comparativo_12_meses ?? []).find((item) => item.mes_ref === selected);
    return found?.label || selected;
  }

  getCompradoLitros(item: DashboardData['comparativo_12_meses'][number]): number {
    return Number(item?.comprado_litros ?? 0);
  }

  getVendidoLitros(item: DashboardData['comparativo_12_meses'][number]): number {
    const status = this.selectedStatus();
    if (status === 'Pago') return Number(item?.vendido_litros_pago ?? item?.vendido_litros ?? 0);
    if (status === 'Pendente') return Number(item?.vendido_litros_pendente ?? item?.vendido_litros ?? 0);
    return Number(item?.vendido_litros ?? 0);
  }

  getCompradoValor(item: DashboardData['comparativo_12_meses'][number]): number {
    return Number(item?.comprado_valor ?? 0);
  }

  getVendidoValor(item: DashboardData['comparativo_12_meses'][number]): number {
    const status = this.selectedStatus();
    if (status === 'Pago') return Number(item?.vendido_valor_pago ?? item?.vendido_valor ?? 0);
    if (status === 'Pendente') return Number(item?.vendido_valor_pendente ?? item?.vendido_valor ?? 0);
    return Number(item?.vendido_valor ?? 0);
  }

  getPendenteValor(item: DashboardData['comparativo_12_meses'][number]): number {
    return Number(item?.vendido_valor_pendente ?? 0);
  }

  getPagoValor(item: DashboardData['comparativo_12_meses'][number]): number {
    return Number(item?.vendido_valor_pago ?? 0);
  }

  statusResumoFiltrado(d: DashboardData): DashboardData['status_resumo'] {
    const base = this.buildStatusResumoByMes(d);
    const selectedStatus = this.selectedStatus();
    if (!selectedStatus) return base;
    return base.filter((item) => this.normalizeStatus(item.status) === selectedStatus);
  }

  totalStatusLitros(d: DashboardData): number {
    return this.statusResumoFiltrado(d).reduce((sum, item) => sum + Number(item?.litros_total ?? 0), 0);
  }

  totalStatusValor(d: DashboardData): number {
    return this.statusResumoFiltrado(d).reduce((sum, item) => sum + Number(item?.valor_total ?? 0), 0);
  }

  donutSlices(d: DashboardData): Array<{ status: string; color: string; path: string }> {
    const items = this.statusResumoFiltrado(d).filter((item) => Number(item?.litros_total ?? 0) > 0);
    if (!items.length) return [];

    const total = items.reduce((sum, item) => sum + Number(item.litros_total ?? 0), 0);
    let accumulated = 0;
    return items.map((item, index) => {
      const value = Number(item.litros_total ?? 0);
      const startAngle = (accumulated / total) * 360 - 90;
      accumulated += value;
      const endAngle = (accumulated / total) * 360 - 90;
      return {
        status: item.status,
        color: this.donutColors[index % this.donutColors.length],
        path: this.createDonutArcPath(startAngle, endAngle, 92, 46),
      };
    });
  }

  donutSlicesValor(d: DashboardData): Array<{ status: string; color: string; path: string }> {
    const items = this.statusResumoFiltrado(d).filter((item) => Number(item?.valor_total ?? 0) > 0);
    if (!items.length) return [];

    const total = items.reduce((sum, item) => sum + Number(item.valor_total ?? 0), 0);
    let accumulated = 0;
    return items.map((item, index) => {
      const value = Number(item.valor_total ?? 0);
      const startAngle = (accumulated / total) * 360 - 90;
      accumulated += value;
      const endAngle = (accumulated / total) * 360 - 90;
      return {
        status: item.status,
        color: this.donutColors[index % this.donutColors.length],
        path: this.createDonutArcPath(startAngle, endAngle, 92, 46),
      };
    });
  }

  kpiValorVendido(d: DashboardData): number {
    return this.getFilteredTotals(d).vendido;
  }

  kpiValorPendente(d: DashboardData): number {
    return this.getFilteredTotals(d).pendente;
  }

  kpiValorRecebido(d: DashboardData): number {
    return this.getFilteredTotals(d).recebido;
  }

  totalStatus(d: DashboardData): number {
    return this.statusResumoFiltrado(d).reduce((sum, item) => sum + (item.total || 0), 0);
  }

  hasStatusData(d: DashboardData): boolean {
    return this.statusResumoFiltrado(d).some((item) => (item.total || 0) > 0 || (item.litros_total || 0) > 0);
  }

  hasStatusValorData(d: DashboardData): boolean {
    return this.statusResumoFiltrado(d).some((item) => (item.valor_total || 0) > 0);
  }

  normalizeDashboard(raw: DashboardData & any): DashboardData {
    const comparativoRaw = Array.isArray(raw?.comparativo_12_meses)
      ? raw.comparativo_12_meses
      : (Array.isArray(raw?.comparativo12Meses) ? raw.comparativo12Meses : []);

    const comparativo = comparativoRaw.length
      ? comparativoRaw
      : this.buildFallbackComparativo12Meses();

    const statusResumo = Array.isArray(raw?.status_resumo)
      ? raw.status_resumo
      : (Array.isArray(raw?.statusResumo) ? raw.statusResumo : this.toLegacyStatusResumo(raw));

    const statusResumoFinal = statusResumo.length
      ? statusResumo
      : this.toLegacyStatusResumo(raw);

    return {
      totais: {
        abastecimentos: Number(raw?.totais?.abastecimentos ?? 0),
        litros: Number(raw?.totais?.litros ?? 0),
        valor: Number(raw?.totais?.valor ?? 0),
        pendente_baixa: Number(raw?.totais?.pendente_baixa ?? 0),
        valor_total_vendido: Number(raw?.totais?.valor_total_vendido ?? raw?.totais?.valor ?? 0),
        valor_total_pendente_baixa: Number(raw?.totais?.valor_total_pendente_baixa ?? 0),
        valor_total_recebido: Number(raw?.totais?.valor_total_recebido ?? 0),
      },
      comparativo_12_meses: comparativo.map((item: any) => ({
        mes_ref: String(item?.mes_ref ?? ''),
        label: String(item?.label ?? ''),
        comprado_litros: Number(item?.comprado_litros ?? 0),
        comprado_valor: Number(item?.comprado_valor ?? 0),
        vendido_litros: Number(item?.vendido_litros ?? 0),
        vendido_valor: Number(item?.vendido_valor ?? 0),
        vendido_litros_pago: Number(item?.vendido_litros_pago ?? 0),
        vendido_valor_pago: Number(item?.vendido_valor_pago ?? 0),
        vendido_litros_pendente: Number(item?.vendido_litros_pendente ?? 0),
        vendido_valor_pendente: Number(item?.vendido_valor_pendente ?? 0),
      })),
      status_resumo: statusResumoFinal.map((item: any) => ({
        status: String(item?.status ?? 'Pendente'),
        total: Number(item?.total ?? 0),
        valor_total: Number(item?.valor_total ?? 0),
        litros_total: Number(item?.litros_total ?? 0),
      })),
      top_proprietarios: Array.isArray(raw?.top_proprietarios) ? raw.top_proprietarios : [],
    };
  }

  toLegacyStatusResumo(raw: any): { status: string; total: number; valor_total: number; litros_total: number }[] {
    const pendentes = Number(raw?.totais?.pendente_baixa ?? 0);
    const total = Number(raw?.totais?.abastecimentos ?? 0);
    const pagos = Math.max(0, total - pendentes);
    const valorPendente = Number(raw?.totais?.valor_total_pendente_baixa ?? 0);
    const valorVendido = Number(raw?.totais?.valor_total_vendido ?? raw?.totais?.valor ?? 0);
    const valorPago = Math.max(0, valorVendido - valorPendente);
    const litrosTotal = Number(raw?.totais?.litros ?? 0);
    return [
      { status: 'Pendente', total: pendentes, valor_total: valorPendente, litros_total: litrosTotal },
      { status: 'Pago', total: pagos, valor_total: valorPago, litros_total: 0 },
    ];
  }

  buildFallbackComparativo12Meses(): Array<{ mes_ref: string; label: string; comprado_litros: number; vendido_litros: number }> {
    const now = new Date();
    const data: Array<{ mes_ref: string; label: string; comprado_litros: number; vendido_litros: number }> = [];
    for (let offset = 11; offset >= 0; offset--) {
      const ref = new Date(now.getFullYear(), now.getMonth() - offset, 1);
      const month = String(ref.getMonth() + 1).padStart(2, '0');
      const year = String(ref.getFullYear());
      data.push({
        mes_ref: `${year}-${month}`,
        label: `${month}/${year.slice(2)}`,
        comprado_litros: 0,
        vendido_litros: 0,
      });
    }
    return data;
  }

  private getFilteredTotals(d: DashboardData): { vendido: number; pendente: number; recebido: number } {
    const comparativo = (d?.comparativo_12_meses ?? []).filter((item) => {
      const selectedMes = this.selectedMesRef();
      return !selectedMes || item.mes_ref === selectedMes;
    });

    const vendidoTotal = comparativo.reduce((sum, item) => sum + Number(item.vendido_valor ?? 0), 0);
    const pendenteTotal = comparativo.reduce((sum, item) => sum + Number(item.vendido_valor_pendente ?? 0), 0);
    const recebidoTotal = comparativo.reduce((sum, item) => sum + Number(item.vendido_valor_pago ?? 0), 0);

    let vendido = vendidoTotal;
    let pendente = pendenteTotal;
    let recebido = recebidoTotal;

    if (!comparativo.length || (vendido <= 0 && pendente <= 0 && recebido <= 0)) {
      vendido = Number(d?.totais?.valor_total_vendido ?? d?.totais?.valor ?? 0);
      pendente = Number(d?.totais?.valor_total_pendente_baixa ?? 0);
      recebido = Number(d?.totais?.valor_total_recebido ?? 0);
    }

    if (vendido > 0 && pendente <= 0 && recebido <= 0) {
      pendente = vendido;
      recebido = 0;
    }

    const selectedStatus = this.selectedStatus();
    if (selectedStatus === 'Pendente') {
      vendido = pendente;
      recebido = 0;
    } else if (selectedStatus === 'Pago') {
      vendido = recebido;
      pendente = 0;
    }

    return { vendido, pendente, recebido };
  }

  private buildStatusResumoByMes(d: DashboardData): DashboardData['status_resumo'] {
    const selectedMes = this.selectedMesRef();
    if (!selectedMes) {
      const base = (d?.status_resumo ?? []).map((item) => ({
        status: item.status,
        total: Number(item.total ?? 0),
        valor_total: Number(item.valor_total ?? 0),
        litros_total: Number(item.litros_total ?? 0),
      }));
      if (base.length) {
        const totalLitros = base.reduce((sum, item) => sum + Number(item.litros_total ?? 0), 0);
        if (totalLitros > 0) return base;
      }

      const pendente = Number(d?.totais?.valor_total_pendente_baixa ?? 0);
      const recebido = Number(d?.totais?.valor_total_recebido ?? 0);
      const vendido = Number(d?.totais?.valor_total_vendido ?? d?.totais?.valor ?? 0);
      const litros = Number(d?.totais?.litros ?? 0);
      const pendenteFinal = pendente > 0 ? pendente : (recebido <= 0 ? vendido : 0);
      const recebidoFinal = recebido > 0 ? recebido : Math.max(0, vendido - pendenteFinal);

      return [
        { status: 'Pendente', total: Number(d?.totais?.pendente_baixa ?? 0), valor_total: pendenteFinal, litros_total: litros },
        { status: 'Pago', total: 0, valor_total: recebidoFinal, litros_total: 0 },
      ];
    }

    const month = (d?.comparativo_12_meses ?? []).find((item) => item.mes_ref === selectedMes);
    return [
      {
        status: 'Pendente',
        total: 0,
        valor_total: Number(month?.vendido_valor_pendente ?? 0),
        litros_total: Number(month?.vendido_litros_pendente ?? 0),
      },
      {
        status: 'Pago',
        total: 0,
        valor_total: Number(month?.vendido_valor_pago ?? 0),
        litros_total: Number(month?.vendido_litros_pago ?? 0),
      },
    ];
  }

  private normalizeStatus(status: string | undefined | null): 'Pendente' | 'Pago' | null {
    if (!status) return null;
    const normalized = String(status).trim().toLowerCase();
    if (normalized === 'pendente') return 'Pendente';
    if (normalized === 'pago') return 'Pago';
    return null;
  }

  private isRunningStandalone(): boolean {
    return window.matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone === true;
  }

  private createDonutArcPath(startDeg: number, endDeg: number, outerR: number, innerR: number): string {
    const startOuter = this.polarToCartesian(0, 0, outerR, endDeg);
    const endOuter = this.polarToCartesian(0, 0, outerR, startDeg);
    const startInner = this.polarToCartesian(0, 0, innerR, startDeg);
    const endInner = this.polarToCartesian(0, 0, innerR, endDeg);
    const largeArc = endDeg - startDeg <= 180 ? 0 : 1;
    return [
      `M ${startOuter.x} ${startOuter.y}`,
      `A ${outerR} ${outerR} 0 ${largeArc} 0 ${endOuter.x} ${endOuter.y}`,
      `L ${startInner.x} ${startInner.y}`,
      `A ${innerR} ${innerR} 0 ${largeArc} 1 ${endInner.x} ${endInner.y}`,
      'Z',
    ].join(' ');
  }

  private polarToCartesian(cx: number, cy: number, radius: number, angleDeg: number): { x: number; y: number } {
    const angleRad = (angleDeg * Math.PI) / 180;
    return {
      x: cx + radius * Math.cos(angleRad),
      y: cy + radius * Math.sin(angleRad),
    };
  }

}
