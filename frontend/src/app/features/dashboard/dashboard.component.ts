// src/app/features/dashboard/dashboard.component.ts
import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ApiService } from '../../core/services/api.service';
import { DashboardData } from '../../shared/models';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <div class="page">
      <div class="page-header">
        <div>
          <h1>Dashboard</h1>
          <p>Visão geral do sistema de abastecimento</p>
        </div>
        <div class="header-controls">
          <select (change)="onMesChange($event)" class="select-ctrl">
            @for (m of meses; track m.value) {
              <option [value]="m.value" [selected]="m.value === mesSelecionado()">{{ m.label }}</option>
            }
          </select>
          <select (change)="onAnoChange($event)" class="select-ctrl">
            @for (a of anos; track a) {
              <option [value]="a" [selected]="a === anoSelecionado()">{{ a }}</option>
            }
          </select>
        </div>
      </div>

      @if (loading()) {
        <div class="loading-state">
          <div class="spinner-lg"></div>
          <span>Carregando dados...</span>
        </div>
      }

      @if (data(); as d) {
        <!-- KPI Cards -->
        <div class="kpi-grid">
          <div class="kpi-card accent-blue">
            <div class="kpi-icon">⛽</div>
            <div class="kpi-info">
              <span class="kpi-value">{{ d.totais.abastecimentos | number }}</span>
              <span class="kpi-label">Abastecimentos</span>
            </div>
          </div>
          <div class="kpi-card accent-green">
            <div class="kpi-icon">🧪</div>
            <div class="kpi-info">
              <span class="kpi-value">{{ d.totais.litros | number:'1.0-0' }} L</span>
              <span class="kpi-label">Total em Litros</span>
            </div>
          </div>
          <div class="kpi-card accent-purple">
            <div class="kpi-icon">💰</div>
            <div class="kpi-info">
              <span class="kpi-value">{{ d.totais.valor | currency:'BRL':'symbol':'1.2-2' }}</span>
              <span class="kpi-label">Valor Total</span>
            </div>
          </div>
          <div class="kpi-card accent-orange">
            <div class="kpi-icon">⏳</div>
            <div class="kpi-info">
              <span class="kpi-value">{{ d.totais.pendente_baixa }}</span>
              <span class="kpi-label">Pendentes Baixa</span>
            </div>
          </div>
          <div class="kpi-card accent-cyan">
            <div class="kpi-icon">🚗</div>
            <div class="kpi-info">
              <span class="kpi-value">{{ d.totais.veiculos }}</span>
              <span class="kpi-label">Veículos</span>
            </div>
          </div>
          <div class="kpi-card accent-indigo">
            <div class="kpi-icon">🏢</div>
            <div class="kpi-info">
              <span class="kpi-value">{{ d.totais.proprietarios }}</span>
              <span class="kpi-label">Proprietários</span>
            </div>
          </div>
        </div>

        <!-- Charts Row -->
        <div class="charts-row">
          <!-- Bar chart por dia -->
          <div class="chart-card wide">
            <div class="chart-header">
              <h3>Abastecimentos — Últimos 30 dias</h3>
            </div>
            <div class="bar-chart">
              @for (item of d.por_dia; track item.dia) {
                <div class="bar-col" [title]="item.dia + ': R$ ' + (item.valor | number:'1.2-2')">
                  <div class="bar-fill"
                       [style.height.%]="getBarHeight(item.valor, d.por_dia)">
                  </div>
                  <span class="bar-label">{{ item.dia | slice:8:10 }}/{{ item.dia | slice:5:7 }}</span>
                </div>
              }
            </div>
          </div>

          <!-- Por combustível -->
          <div class="chart-card">
            <div class="chart-header">
              <h3>Por Combustível</h3>
            </div>
            <div class="fuel-list">
              @for (item of d.por_combustivel; track item.tipo_combustivel) {
                <div class="fuel-item">
                  <div class="fuel-name">{{ item.tipo_combustivel | uppercase }}</div>
                  <div class="fuel-bar-wrap">
                    <div class="fuel-bar"
                         [style.width.%]="getFuelPct(item.litros, d.por_combustivel)">
                    </div>
                  </div>
                  <div class="fuel-stats">
                    <span>{{ item.litros | number:'1.0-0' }} L</span>
                    <span class="fuel-valor">{{ item.valor | currency:'BRL':'symbol':'1.2-2' }}</span>
                  </div>
                </div>
              }
              @empty {
                <div class="empty-state">Sem dados no período</div>
              }
            </div>
          </div>
        </div>

        <!-- Top Proprietários -->
        <div class="card">
          <div class="chart-header">
            <h3>Top Proprietários no Período</h3>
            <a routerLink="/relatorios" class="link-btn">Ver relatórios →</a>
          </div>
          <div class="table-wrap">
            <table class="data-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Proprietário</th>
                  <th class="text-right">Abastecimentos</th>
                  <th class="text-right">Valor Total</th>
                </tr>
              </thead>
              <tbody>
                @for (item of d.top_proprietarios; track item.id_proprietario; let i = $index) {
                  <tr>
                    <td><span class="rank">{{ i + 1 }}</span></td>
                    <td>{{ item.nome_proprietario || '—' }}</td>
                    <td class="text-right">{{ item.total }}</td>
                    <td class="text-right val">{{ item.valor | currency:'BRL':'symbol':'1.2-2' }}</td>
                  </tr>
                }
                @empty {
                  <tr><td colspan="4" class="empty-cell">Sem dados no período</td></tr>
                }
              </tbody>
            </table>
          </div>
        </div>
      }
    </div>
  `,
  styles: [`
    @import url('https://fonts.googleapis.com/css2?family=Rajdhani:wght@600;700&family=Inter:wght@400;500;600&display=swap');

    * { box-sizing: border-box; }
    .page { padding: 28px; font-family: 'Inter', sans-serif; color: #e2e8f0; min-height: 100vh; }

    .page-header {
      display: flex; align-items: flex-start; justify-content: space-between;
      margin-bottom: 28px;
    }
    .page-header h1 {
      font-family: 'Rajdhani', sans-serif;
      font-size: 28px; font-weight: 700; color: #f8fafc; margin: 0;
    }
    .page-header p { font-size: 13px; color: #64748b; margin-top: 4px; }

    .header-controls { display: flex; gap: 8px; }
    .select-ctrl {
      background: #0d1427; border: 1px solid #1e2d4a; color: #94a3b8;
      padding: 8px 12px; border-radius: 8px; font-size: 13px; cursor: pointer;
      outline: none;
    }
    .select-ctrl:focus { border-color: #0ea5e9; }

    .loading-state {
      display: flex; align-items: center; gap: 12px; justify-content: center;
      padding: 60px; color: #64748b;
    }
    .spinner-lg {
      width: 28px; height: 28px;
      border: 3px solid #1e2d4a; border-top-color: #0ea5e9;
      border-radius: 50%; animation: spin 0.8s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }

    .kpi-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
      gap: 16px;
      margin-bottom: 24px;
    }
    .kpi-card {
      background: #0d1427;
      border: 1px solid #1e2d4a;
      border-radius: 14px;
      padding: 18px;
      display: flex;
      align-items: center;
      gap: 14px;
      transition: transform 0.2s;
    }
    .kpi-card:hover { transform: translateY(-2px); }
    .kpi-icon { font-size: 28px; }
    .kpi-info { display: flex; flex-direction: column; }
    .kpi-value { font-size: 22px; font-weight: 700; line-height: 1.1; }
    .kpi-label { font-size: 11px; color: #64748b; margin-top: 3px; text-transform: uppercase; letter-spacing: 0.5px; }

    .accent-blue  { border-left: 3px solid #38bdf8; } .accent-blue .kpi-value { color: #38bdf8; }
    .accent-green { border-left: 3px solid #4ade80; } .accent-green .kpi-value { color: #4ade80; }
    .accent-purple{ border-left: 3px solid #a78bfa; } .accent-purple .kpi-value { color: #a78bfa; }
    .accent-orange{ border-left: 3px solid #fb923c; } .accent-orange .kpi-value { color: #fb923c; }
    .accent-cyan  { border-left: 3px solid #22d3ee; } .accent-cyan .kpi-value { color: #22d3ee; }
    .accent-indigo{ border-left: 3px solid #818cf8; } .accent-indigo .kpi-value { color: #818cf8; }

    .charts-row {
      display: grid;
      grid-template-columns: 2fr 1fr;
      gap: 16px;
      margin-bottom: 20px;
    }
    .chart-card, .card {
      background: #0d1427;
      border: 1px solid #1e2d4a;
      border-radius: 14px;
      padding: 20px;
    }
    .chart-header {
      display: flex; align-items: center; justify-content: space-between;
      margin-bottom: 18px;
    }
    .chart-header h3 { font-size: 14px; font-weight: 600; color: #94a3b8; margin: 0; }
    .link-btn { font-size: 12px; color: #38bdf8; text-decoration: none; }
    .link-btn:hover { text-decoration: underline; }

    .bar-chart {
      display: flex;
      align-items: flex-end;
      gap: 3px;
      height: 140px;
      overflow-x: auto;
    }
    .bar-col {
      display: flex;
      flex-direction: column;
      align-items: center;
      min-width: 24px;
      flex: 1;
      height: 100%;
      justify-content: flex-end;
      gap: 4px;
    }
    .bar-fill {
      width: 100%;
      background: linear-gradient(to top, #0ea5e9, #6366f1);
      border-radius: 3px 3px 0 0;
      min-height: 4px;
      transition: height 0.4s ease;
    }
    .bar-label { font-size: 9px; color: #475569; white-space: nowrap; }

    .fuel-list { display: flex; flex-direction: column; gap: 14px; }
    .fuel-item { display: flex; flex-direction: column; gap: 6px; }
    .fuel-name { font-size: 12px; font-weight: 600; color: #94a3b8; }
    .fuel-bar-wrap { background: #0a0f1e; border-radius: 4px; height: 6px; overflow: hidden; }
    .fuel-bar { height: 100%; background: linear-gradient(90deg, #0ea5e9, #6366f1); border-radius: 4px; transition: width 0.5s ease; }
    .fuel-stats { display: flex; justify-content: space-between; font-size: 11px; color: #64748b; }
    .fuel-valor { color: #4ade80; font-weight: 600; }

    .table-wrap { overflow-x: auto; }
    .data-table { width: 100%; border-collapse: collapse; font-size: 13px; }
    .data-table thead th {
      padding: 8px 12px; text-align: left; font-size: 11px; text-transform: uppercase;
      letter-spacing: 0.5px; color: #64748b; border-bottom: 1px solid #1e2d4a;
    }
    .data-table tbody td { padding: 10px 12px; border-bottom: 1px solid #1e2d4a10; }
    .data-table tbody tr:hover td { background: #1e2d4a20; }
    .text-right { text-align: right; }
    .rank {
      display: inline-flex; align-items: center; justify-content: center;
      width: 22px; height: 22px; background: #1e2d4a; border-radius: 50%;
      font-size: 11px; font-weight: 700; color: #64748b;
    }
    .val { color: #4ade80; font-weight: 600; }
    .empty-cell, .empty-state { text-align: center; padding: 20px; color: #475569; font-size: 13px; }
  `]
})
export class DashboardComponent implements OnInit {
  private api = inject(ApiService);

  data = signal<DashboardData | null>(null);
  loading = signal(true);
  mesSelecionado = signal(new Date().getMonth() + 1);
  anoSelecionado = signal(new Date().getFullYear());

  meses = [
    {value:1,label:'Janeiro'},{value:2,label:'Fevereiro'},{value:3,label:'Março'},
    {value:4,label:'Abril'},{value:5,label:'Maio'},{value:6,label:'Junho'},
    {value:7,label:'Julho'},{value:8,label:'Agosto'},{value:9,label:'Setembro'},
    {value:10,label:'Outubro'},{value:11,label:'Novembro'},{value:12,label:'Dezembro'},
  ];

  anos = Array.from({length:5}, (_,i) => new Date().getFullYear() - i);

  ngOnInit() { this.load(); }

  load() {
    this.loading.set(true);
    this.api.getDashboard(this.mesSelecionado(), this.anoSelecionado()).subscribe({
      next: d => { this.data.set(d); this.loading.set(false); },
      error: () => this.loading.set(false)
    });
  }

  onMesChange(e: Event) {
    this.mesSelecionado.set(+(e.target as HTMLSelectElement).value);
    this.load();
  }

  onAnoChange(e: Event) {
    this.anoSelecionado.set(+(e.target as HTMLSelectElement).value);
    this.load();
  }

  getBarHeight(val: number, items: any[]): number {
    const max = Math.max(...items.map(i => i.valor), 1);
    return Math.max((val / max) * 100, 5);
  }

  getFuelPct(litros: number, items: any[]): number {
    const max = Math.max(...items.map(i => i.litros), 1);
    return Math.max((litros / max) * 100, 3);
  }
}
