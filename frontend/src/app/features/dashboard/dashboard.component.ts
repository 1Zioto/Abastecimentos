import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/services/api.service';
import { DashboardData } from '../../shared/models';

type LinePoint = { x: number; y: number };

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <div class="dashboard-page">
      <header class="dashboard-header">
        <div>
          <h1>Dashboard</h1>
          <p>Visão geral do sistema de abastecimento</p>
        </div>
        <div class="header-filters">
          <select (change)="onMesChange($event)" class="filter-select" aria-label="Selecionar mês">
            @for (m of meses; track m.value) {
              <option [value]="m.value" [selected]="m.value === mesSelecionado()">{{ m.label }}</option>
            }
          </select>
          <select (change)="onAnoChange($event)" class="filter-select" aria-label="Selecionar ano">
            @for (a of anos; track a) {
              <option [value]="a" [selected]="a === anoSelecionado()">{{ a }}</option>
            }
          </select>
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
            <div class="kpi-icon icon-info">⛽</div>
            <div class="kpi-content">
              <span class="kpi-value">{{ d.totais.abastecimentos | number }}</span>
              <span class="kpi-label">Abastecimentos</span>
            </div>
          </article>

          <article class="kpi-card">
            <div class="kpi-icon icon-success">🧪</div>
            <div class="kpi-content">
              <span class="kpi-value">{{ d.totais.litros | number:'1.0-0' }} L</span>
              <span class="kpi-label">Total em litros</span>
            </div>
          </article>

          <article class="kpi-card">
            <div class="kpi-icon icon-primary">💰</div>
            <div class="kpi-content">
              <span class="kpi-value">{{ d.totais.valor | currency:'BRL':'symbol':'1.2-2' }}</span>
              <span class="kpi-label">Valor total</span>
            </div>
          </article>

          <article class="kpi-card">
            <div class="kpi-icon icon-pending">⏳</div>
            <div class="kpi-content">
              <span class="kpi-value">{{ d.totais.pendente_baixa | number }}</span>
              <span class="kpi-label">Pendentes</span>
            </div>
          </article>

          <article class="kpi-card">
            <div class="kpi-icon icon-vehicle">🚗</div>
            <div class="kpi-content">
              <span class="kpi-value">{{ d.totais.veiculos | number }}</span>
              <span class="kpi-label">Veículos</span>
            </div>
          </article>

          <article class="kpi-card">
            <div class="kpi-icon icon-owner">🏢</div>
            <div class="kpi-content">
              <span class="kpi-value">{{ d.totais.proprietarios | number }}</span>
              <span class="kpi-label">Proprietários</span>
            </div>
          </article>
        </section>

        <section class="charts-grid">
          <article class="panel line-panel">
            <div class="panel-header">
              <h3>Abastecimentos — Últimos 30 dias</h3>
            </div>
            <div class="line-chart-wrap">
              <svg class="line-svg" viewBox="0 0 100 40" preserveAspectRatio="none" aria-label="Gráfico de linha">
                <line x1="0" y1="10" x2="100" y2="10" class="grid-line"></line>
                <line x1="0" y1="20" x2="100" y2="20" class="grid-line"></line>
                <line x1="0" y1="30" x2="100" y2="30" class="grid-line"></line>
                <polyline [attr.points]="linePointsString()" class="line-area" />
                <polyline [attr.points]="linePointsString()" class="line-path" />
                @for (point of linePoints(); track $index) {
                  <circle [attr.cx]="point.x" [attr.cy]="point.y" r="0.9" class="line-dot"></circle>
                }
              </svg>
              <div class="line-labels">
                <span>{{ firstDayLabel() }}</span>
                <span>{{ lastDayLabel() }}</span>
              </div>
            </div>
          </article>

          <article class="panel donut-panel">
            <div class="panel-header">
              <h3>Consumo por combustível</h3>
            </div>
            <div class="donut-layout">
              <div class="donut-chart" [style.background]="donutGradient()">
                <div class="donut-center">
                  <span class="donut-total">{{ d.totais.litros | number:'1.0-0' }} L</span>
                  <span class="donut-sub">Total</span>
                </div>
              </div>
            </div>
            <div class="fuel-legend">
              @for (item of d.por_combustivel; track item.tipo_combustivel; let i = $index) {
                <div class="legend-item">
                  <span class="legend-dot" [style.background]="donutColors[i % donutColors.length]"></span>
                  <span class="legend-label">{{ item.tipo_combustivel | uppercase }}</span>
                  <span class="legend-value">{{ item.litros | number:'1.0-0' }} L</span>
                </div>
              }
            </div>
            @if (!hasFuelData(d)) {
              <p class="chart-helper">Sem dados no período selecionado.</p>
            }
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
      grid-template-columns: repeat(5, minmax(0, 1fr));
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
    .icon-vehicle { background: #EDE9FE; }
    .icon-owner { background: #E0F2FE; }

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
      font-size: 15px;
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

    .line-chart-wrap {
      height: 270px;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
    }

    .line-svg {
      width: 100%;
      height: 240px;
      overflow: visible;
      border-radius: 12px;
      background: linear-gradient(to bottom, #FFF7D6 0%, #FFFFFF 70%);
    }

    .grid-line {
      stroke: #F3F4F6;
      stroke-width: 0.25;
    }

    .line-path {
      fill: none;
      stroke: #EAB308;
      stroke-width: 0.8;
      stroke-linecap: round;
      stroke-linejoin: round;
    }

    .line-area {
      fill: none;
      stroke: #EAB308;
      stroke-opacity: 0.08;
      stroke-width: 6;
      stroke-linecap: round;
      stroke-linejoin: round;
    }

    .line-dot {
      fill: #EAB308;
      stroke: #FFFFFF;
      stroke-width: 0.3;
    }

    .line-labels {
      display: flex;
      justify-content: space-between;
      color: #9CA3AF;
      font-size: 11px;
      margin-top: 4px;
    }

    .donut-layout {
      display: flex;
      justify-content: center;
      margin-bottom: 12px;
    }

    .donut-chart {
      width: 190px;
      height: 190px;
      border-radius: 50%;
      position: relative;
      transition: transform 0.2s ease;
    }

    .donut-chart:hover {
      transform: scale(1.02);
    }

    .donut-center {
      position: absolute;
      inset: 26px;
      border-radius: 50%;
      background: #FFFFFF;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      border: 1px solid #E5E7EB;
    }

    .donut-total {
      font-size: 16px;
      font-weight: 700;
      color: #111827;
      line-height: 1.1;
    }

    .donut-sub {
      font-size: 11px;
      color: #9CA3AF;
      margin-top: 3px;
    }

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
      font-size: 12px;
      color: #6B7280;
    }

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
      .kpi-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
      .charts-grid { grid-template-columns: 1fr; }
    }

    @media (max-width: 760px) {
      .dashboard-page { padding: 16px; }
      .dashboard-header { flex-direction: column; }
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
  mesSelecionado = signal(new Date().getMonth() + 1);
  anoSelecionado = signal(new Date().getFullYear());

  linePoints = signal<LinePoint[]>([]);
  linePointsString = signal('');
  donutGradient = signal('conic-gradient(#CBD5F5 0% 100%)');
  firstDayLabel = signal('');
  lastDayLabel = signal('');

  readonly donutColors = ['#2563EB', '#22C55E', '#F59E0B', '#0EA5E9', '#CBD5F5'];

  meses = [
    { value: 1, label: 'Janeiro' }, { value: 2, label: 'Fevereiro' }, { value: 3, label: 'Março' },
    { value: 4, label: 'Abril' }, { value: 5, label: 'Maio' }, { value: 6, label: 'Junho' },
    { value: 7, label: 'Julho' }, { value: 8, label: 'Agosto' }, { value: 9, label: 'Setembro' },
    { value: 10, label: 'Outubro' }, { value: 11, label: 'Novembro' }, { value: 12, label: 'Dezembro' }
  ];

  anos = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i);

  ngOnInit() {
    this.load();
  }

  load() {
    this.loading.set(true);
    this.api.getDashboard(this.mesSelecionado(), this.anoSelecionado()).subscribe({
      next: (d) => {
        this.data.set(d);
        this.refreshCharts(d);
        this.loading.set(false);
      },
      error: () => {
        this.data.set(null);
        this.loading.set(false);
      }
    });
  }

  refreshCharts(d: DashboardData) {
    this.refreshLineChart(d);
    this.refreshDonutChart(d);
  }

  refreshLineChart(d: DashboardData) {
    if (!d.por_dia.length) {
      const fallbackCount: number = 30;
      const fallbackPoints = Array.from({ length: fallbackCount }, (_, index) => {
        const x = fallbackCount === 1 ? 50 : (index / (fallbackCount - 1)) * 100;
        return { x, y: 36 };
      });

      const now = new Date();
      const first = new Date(now);
      first.setDate(now.getDate() - 29);

      this.linePoints.set(fallbackPoints);
      this.linePointsString.set(fallbackPoints.map((p) => `${p.x},${p.y}`).join(' '));
      this.firstDayLabel.set(`${String(first.getDate()).padStart(2, '0')}/${String(first.getMonth() + 1).padStart(2, '0')}`);
      this.lastDayLabel.set(`${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}`);
      return;
    }

    const values = d.por_dia.map((item) => item.total || 0);
    const maxValue = Math.max(...values, 1);
    const points = values.map((value, index) => {
      const x = values.length === 1 ? 50 : (index / (values.length - 1)) * 100;
      const y = 36 - (value / maxValue) * 28;
      return { x, y };
    });

    this.linePoints.set(points);
    this.linePointsString.set(points.map((p) => `${p.x},${p.y}`).join(' '));
    this.firstDayLabel.set(this.formatDiaLabel(d.por_dia[0].dia));
    this.lastDayLabel.set(this.formatDiaLabel(d.por_dia[d.por_dia.length - 1].dia));
  }

  refreshDonutChart(d: DashboardData) {
    const items = d.por_combustivel.filter((item) => (item.litros || 0) > 0);
    if (!items.length) {
      this.donutGradient.set('conic-gradient(#CBD5F5 0% 100%)');
      return;
    }

    const total = items.reduce((sum, item) => sum + (item.litros || 0), 0);
    let start = 0;
    const parts = items.map((item, index) => {
      const pct = ((item.litros || 0) / total) * 100;
      const end = start + pct;
      const color = this.donutColors[index % this.donutColors.length];
      const part = `${color} ${start.toFixed(2)}% ${end.toFixed(2)}%`;
      start = end;
      return part;
    });

    this.donutGradient.set(`conic-gradient(${parts.join(', ')})`);
  }

  formatDiaLabel(dia: string): string {
    if (!dia || dia.length < 10) return '';
    return `${dia.slice(8, 10)}/${dia.slice(5, 7)}`;
  }

  hasDailyData(d: DashboardData): boolean {
    return d.por_dia.length > 0;
  }

  hasFuelData(d: DashboardData): boolean {
    return d.por_combustivel.length > 0 && d.por_combustivel.some((item) => (item.litros || 0) > 0);
  }

  onMesChange(event: Event) {
    this.mesSelecionado.set(+(event.target as HTMLSelectElement).value);
    this.load();
  }

  onAnoChange(event: Event) {
    this.anoSelecionado.set(+(event.target as HTMLSelectElement).value);
    this.load();
  }
}
