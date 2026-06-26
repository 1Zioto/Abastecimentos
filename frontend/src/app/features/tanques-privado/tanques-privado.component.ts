import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { forkJoin } from 'rxjs';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { DashboardData, TanqueHistoricoData, TanqueHistoricoLocal } from '../../shared/models';

type TankLocal = 'Matriz' | 'Viana';

interface TankView {
  local: TankLocal;
  atual: number;
  comprado: number;
  abastecido: number;
  capacidade: number;
}

@Component({
  selector: 'app-tanques-privado',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="page">
      <header class="page-header">
        <div>
          <span>Privado</span>
          <h1>Tanques Matriz x Viana</h1>
          <p>Leitura visual baseada no card Combustível no Tanque.</p>
        </div>
        <button type="button" class="primary-btn" (click)="load()" [disabled]="loading() || !canAccess()">
          {{ loading() ? 'Atualizando...' : 'Atualizar' }}
        </button>
      </header>

      @if (!canAccess()) {
        <section class="state error">Acesso restrito ao administrador autorizado.</section>
      } @else if (error()) {
        <section class="state error">{{ error() }}</section>
      } @else if (loading()) {
        <section class="state">Carregando tanques...</section>
      } @else {
        <section class="filters">
          <label>
            Data início
            <input type="date" [(ngModel)]="dataInicio" />
          </label>
          <label>
            Data fim
            <input type="date" [(ngModel)]="dataFim" />
          </label>
          <button type="button" class="secondary-btn" (click)="setPeriodoMes()">Mês atual</button>
          <button type="button" class="secondary-btn" (click)="setPeriodo30Dias()">Últimos 30 dias</button>
        </section>

        <section class="summary">
          <article>
            <span>Total no tanque</span>
            <strong>{{ litros(totalAtual()) }}</strong>
          </article>
          <article>
            <span>Comprado</span>
            <strong>{{ litros(totalComprado()) }}</strong>
          </article>
          <article>
            <span>Abastecido</span>
            <strong>{{ litros(totalAbastecido()) }}</strong>
          </article>
          <article>
            <span>Espaço livre</span>
            <strong>{{ litros(totalEspacoLivre()) }}</strong>
          </article>
        </section>

        <section class="tank-grid">
          @for (tank of tanks(); track tank.local) {
            <article class="tank-panel">
              <div class="tank-head">
                <div>
                  <span>Filial</span>
                  <h2>{{ tank.local }}</h2>
                </div>
                <strong>{{ litros(tank.atual) }}</strong>
              </div>

              <div class="tank-layout">
                <div class="tank-illustration" [style.--level.%]="levelPercent(tank)">
                  <div class="tank-circle">
                    <div class="liquid"></div>
                    <div class="center-line"></div>
                  </div>
                </div>

                <div class="ruler-wrap">
                  <div class="cm-scale">
                    @for (mark of cmMarks; track mark.cm) {
                      <div class="cm-mark" [style.bottom.%]="mark.pct">
                        <span>{{ mark.cm }} cm</span>
                      </div>
                    }
                  </div>
                  <div class="ruler">
                    <div class="ruler-fill" [style.height.%]="levelPercent(tank)"></div>
                    <div class="ruler-current" [style.bottom.%]="levelPercent(tank)">
                      <span>{{ litros(tank.atual, 0) }}</span>
                    </div>
                  </div>
                  <div class="liter-scale">
                    @for (litro of literMarks(tank); track litro.value) {
                      <div class="liter-mark" [style.bottom.%]="litro.pct">
                        <span>{{ litros(litro.value, 0) }}</span>
                      </div>
                    }
                  </div>
                </div>

                <div class="details">
                  <div class="detail-card highlight">
                    <span>Volume atual</span>
                    <strong>{{ litros(tank.atual) }}</strong>
                  </div>
                  <div class="detail-card">
                    <span>Capacidade adotada</span>
                    <strong>{{ litros(tank.capacidade) }}</strong>
                  </div>
                  <div class="detail-card">
                    <span>Comprado</span>
                    <strong>{{ litros(tank.comprado) }}</strong>
                  </div>
                  <div class="detail-card">
                    <span>Abastecido</span>
                    <strong>{{ litros(tank.abastecido) }}</strong>
                  </div>
                  <div class="detail-card">
                    <span>Espaço livre</span>
                    <strong>{{ litros(espacoLivre(tank)) }}</strong>
                  </div>
                  <div class="detail-card">
                    <span>Altura estimada</span>
                    <strong>{{ alturaCm(tank) }} cm</strong>
                  </div>
                </div>
              </div>
            </article>
          }
        </section>

        @if (historico(); as hist) {
          <section class="history-section">
            <div class="section-head">
              <div>
                <span>Histórico</span>
                <h2>Combustível no Tanque</h2>
              </div>
              <p>{{ formatDate(hist.periodo.data_inicio) }} até {{ formatDate(hist.periodo.data_fim) }}</p>
            </div>

            <div class="history-grid">
              @for (item of historicosOrdenados(); track item.local) {
                <article class="history-panel">
                  <div class="history-head">
                    <div>
                      <span>{{ item.local }}</span>
                      <strong>{{ litros(item.saldo_final_litros) }}</strong>
                    </div>
                    <div>
                      <small>Saldo inicial</small>
                      <b>{{ litros(item.saldo_inicial_litros) }}</b>
                    </div>
                  </div>

                  <div class="history-chart">
                    <svg viewBox="0 0 100 52" preserveAspectRatio="none" aria-hidden="true">
                      <polygon [attr.points]="historyArea(item)"></polygon>
                      <polyline [attr.points]="historyPolyline(item)"></polyline>
                    </svg>
                  </div>

                  <div class="history-metrics">
                    <div>
                      <span>Entradas</span>
                      <strong>{{ litros(item.entrada_periodo_litros) }}</strong>
                    </div>
                    <div>
                      <span>Saídas</span>
                      <strong>{{ litros(item.saida_periodo_litros) }}</strong>
                    </div>
                    <div>
                      <span>Variação</span>
                      <strong [class.negative]="variacao(item) < 0">{{ litros(variacao(item)) }}</strong>
                    </div>
                  </div>

                  <div class="history-table">
                    <div class="history-row header">
                      <span>Data</span>
                      <span>Entrada</span>
                      <span>Saída</span>
                      <span>Saldo</span>
                    </div>
                    @for (ponto of pontosRecentes(item); track ponto.data) {
                      <div class="history-row" [class.has-move]="ponto.entrada_litros || ponto.saida_litros">
                        <span>{{ formatDate(ponto.data) }}</span>
                        <span class="positive">{{ litros(ponto.entrada_litros, 0) }}</span>
                        <span class="negative">{{ litros(ponto.saida_litros, 0) }}</span>
                        <strong>{{ litros(ponto.saldo_litros, 0) }}</strong>
                      </div>
                    }
                  </div>
                </article>
              }
            </div>
          </section>
        }
      }
    </div>
  `,
  styles: [`
    .page {
      min-height: 100%;
      padding: 28px;
      background: #F4F6F3;
      color: #0F172A;
      font-family: 'Inter', sans-serif;
    }

    .page-header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 16px;
      margin-bottom: 16px;
    }

    .page-header span,
    .summary span,
    .tank-head span,
    .detail-card span,
    .section-head span,
    label,
    .history-head span,
    .history-head small,
    .history-metrics span {
      color: #4B6265;
      font-size: 11px;
      font-weight: 900;
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }

    h1, h2, p {
      margin: 0;
    }

    h1 {
      margin-top: 4px;
      font-size: 30px;
      font-weight: 900;
      letter-spacing: 0;
    }

    h2 {
      margin-top: 4px;
      font-size: 24px;
      font-weight: 900;
    }

    .page-header p {
      margin-top: 8px;
      color: #64748B;
      font-weight: 700;
    }

    .primary-btn {
      height: 42px;
      border: 1px solid #0F766E;
      border-radius: 8px;
      padding: 0 16px;
      background: #0F766E;
      color: #FFFFFF;
      font-weight: 900;
      cursor: pointer;
    }

    .primary-btn:disabled {
      opacity: 0.65;
      cursor: progress;
    }

    .filters {
      display: flex;
      flex-wrap: wrap;
      align-items: end;
      gap: 12px;
      padding: 14px;
      margin-bottom: 16px;
      border: 1px solid #D7DFD9;
      border-radius: 12px;
      background: #FFFFFF;
    }

    label {
      display: grid;
      gap: 6px;
    }

    input {
      height: 40px;
      width: 168px;
      border: 1px solid #CBD5E1;
      border-radius: 8px;
      padding: 0 10px;
      color: #0F172A;
      font: inherit;
      font-weight: 800;
      background: #FFFFFF;
    }

    .secondary-btn {
      height: 40px;
      border: 1px solid #CBD5E1;
      border-radius: 8px;
      padding: 0 14px;
      background: #FFFFFF;
      color: #0F172A;
      font-weight: 900;
      cursor: pointer;
    }

    .summary {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 12px;
      margin-bottom: 16px;
    }

    .summary article,
    .tank-panel,
    .state {
      background: #FFFFFF;
      border: 1px solid #D7DFD9;
      border-radius: 12px;
    }

    .summary article {
      padding: 16px;
    }

    .summary strong {
      display: block;
      margin-top: 8px;
      font-size: 24px;
      font-weight: 900;
    }

    .tank-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 16px;
      align-items: start;
    }

    .tank-panel {
      overflow: hidden;
    }

    .tank-head {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 16px;
      padding: 18px 20px;
      border-bottom: 1px solid #E2E8E2;
      background: #FCFEFB;
    }

    .tank-head > strong {
      color: #9A5C05;
      font-size: 26px;
      font-weight: 900;
      white-space: nowrap;
    }

    .tank-layout {
      display: grid;
      grid-template-columns: minmax(260px, 1fr) 188px 230px;
      gap: 18px;
      align-items: center;
      padding: 20px;
    }

    .tank-illustration {
      min-height: 380px;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .tank-circle {
      position: relative;
      width: min(360px, 100%);
      aspect-ratio: 1;
      overflow: hidden;
      border: 14px solid #A7B5AE;
      border-radius: 50%;
      background:
        radial-gradient(circle at 35% 25%, rgba(255,255,255,0.62), transparent 34%),
        linear-gradient(110deg, #D9E0DC, #9CA8A2);
      box-shadow: inset -26px -22px 42px rgba(15, 23, 42, 0.20), 0 22px 54px rgba(15, 23, 42, 0.10);
    }

    .liquid {
      position: absolute;
      left: -3%;
      right: -3%;
      bottom: 0;
      height: var(--level);
      background: linear-gradient(180deg, #F8CD63, #C9770D);
      border-top: 5px solid #F8DD85;
      transition: height 0.3s ease;
    }

    .center-line {
      position: absolute;
      left: 0;
      right: 0;
      top: 50%;
      height: 1px;
      background: rgba(68, 85, 78, 0.22);
    }

    .ruler-wrap {
      position: relative;
      height: 430px;
      display: grid;
      grid-template-columns: 54px 56px 88px;
      align-items: end;
      gap: 8px;
    }

    .cm-scale,
    .liter-scale {
      position: relative;
      height: 100%;
    }

    .cm-mark,
    .liter-mark {
      position: absolute;
      left: 0;
      right: 0;
      height: 1px;
      color: #475569;
      font-size: 12px;
      font-weight: 700;
    }

    .cm-mark::after,
    .liter-mark::before {
      content: '';
      position: absolute;
      top: 0;
      height: 1px;
      background: #334155;
    }

    .cm-mark::after {
      right: 0;
      width: 28px;
    }

    .cm-mark span {
      position: absolute;
      right: 32px;
      top: -8px;
      white-space: nowrap;
    }

    .liter-mark::before {
      left: 0;
      width: 10px;
      background: #B45309;
    }

    .liter-mark span {
      position: absolute;
      left: 12px;
      top: -12px;
      min-width: 70px;
      padding: 1px 6px;
      border: 1px solid #F4C183;
      border-radius: 6px;
      background: #FFF7EA;
      color: #9A5C05;
      font-size: 16px;
      font-weight: 900;
      line-height: 1.1;
      white-space: nowrap;
      box-shadow: 0 1px 2px rgba(154, 92, 5, 0.08);
    }

    .ruler {
      position: relative;
      height: 100%;
      width: 56px;
      overflow: hidden;
      border: 1px solid #C2CBC6;
      border-radius: 10px;
      background: linear-gradient(90deg, #EEF2EF, #FFFFFF 45%, #E1E7E3);
      box-shadow: inset -9px 0 18px rgba(15, 23, 42, 0.10);
    }

    .ruler-fill {
      position: absolute;
      left: 0;
      right: 0;
      bottom: 0;
      background: linear-gradient(180deg, #F8D36B, #C9780B);
      transition: height 0.3s ease;
    }

    .ruler-current {
      position: absolute;
      left: -18px;
      right: -18px;
      height: 5px;
      border-radius: 8px;
      background: #26363B;
      transform: translateY(2px);
      box-shadow: 0 2px 8px rgba(15, 23, 42, 0.16);
      z-index: 3;
    }

    .ruler-current span {
      position: absolute;
      left: 75px;
      top: -17px;
      padding: 2px 8px;
      border: 1px solid #F4C183;
      border-radius: 6px;
      background: #FFF7EA;
      color: #9A5C05;
      font-size: 18px;
      font-weight: 900;
      white-space: nowrap;
    }

    .details {
      display: grid;
      gap: 10px;
    }

    .detail-card {
      min-height: 76px;
      padding: 14px;
      border: 1px solid #D7DFD9;
      border-radius: 10px;
      background: #FFFFFF;
    }

    .detail-card.highlight {
      border-color: #F4C183;
      background: #FFF8EA;
    }

    .detail-card strong {
      display: block;
      margin-top: 8px;
      color: #061522;
      font-size: 25px;
      font-weight: 900;
    }

    .detail-card.highlight strong {
      color: #9A5C05;
      font-size: 31px;
    }

    .state {
      padding: 28px;
      color: #64748B;
      text-align: center;
      font-weight: 700;
    }

    .state.error {
      color: #B91C1C;
      background: #FEF2F2;
      border-color: #FECACA;
    }

    .history-section {
      margin-top: 16px;
      border: 1px solid #D7DFD9;
      border-radius: 12px;
      background: #FFFFFF;
      overflow: hidden;
    }

    .section-head {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 16px;
      padding: 18px 20px;
      border-bottom: 1px solid #E2E8E2;
      background: #FCFEFB;
    }

    .section-head h2 {
      font-size: 24px;
    }

    .section-head p {
      color: #64748B;
      font-weight: 800;
      white-space: nowrap;
    }

    .history-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 16px;
      padding: 16px;
    }

    .history-panel {
      min-width: 0;
      border: 1px solid #E2E8E2;
      border-radius: 12px;
      background: #FFFFFF;
      overflow: hidden;
    }

    .history-head {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 16px;
      padding: 16px;
      background: #F8FAF7;
      border-bottom: 1px solid #E2E8E2;
    }

    .history-head strong {
      display: block;
      margin-top: 4px;
      color: #9A5C05;
      font-size: 28px;
      font-weight: 900;
    }

    .history-head b {
      display: block;
      margin-top: 5px;
      color: #0F172A;
      font-size: 18px;
      font-weight: 900;
      text-align: right;
    }

    .history-chart {
      height: 210px;
      padding: 18px 18px 4px;
      background:
        linear-gradient(#F1F5F9 1px, transparent 1px) 0 0 / 100% 25%,
        linear-gradient(180deg, #FFFFFF, #FBFDF9);
    }

    .history-chart svg {
      width: 100%;
      height: 100%;
      overflow: visible;
    }

    .history-chart polygon {
      fill: rgba(15, 118, 110, 0.13);
    }

    .history-chart polyline {
      fill: none;
      stroke: #0F766E;
      stroke-width: 2.5;
      stroke-linecap: round;
      stroke-linejoin: round;
      vector-effect: non-scaling-stroke;
    }

    .history-metrics {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 10px;
      padding: 12px 16px;
    }

    .history-metrics div {
      padding: 11px;
      border: 1px solid #E2E8E2;
      border-radius: 10px;
      background: #FFFFFF;
    }

    .history-metrics strong {
      display: block;
      margin-top: 5px;
      font-size: 17px;
      font-weight: 900;
    }

    .history-table {
      max-height: 360px;
      overflow: auto;
      border-top: 1px solid #E2E8E2;
    }

    .history-row {
      display: grid;
      grid-template-columns: 1fr 1fr 1fr 1.1fr;
      gap: 8px;
      align-items: center;
      min-height: 38px;
      padding: 8px 14px;
      border-bottom: 1px solid #EEF2EF;
      color: #475569;
      font-size: 13px;
      font-weight: 750;
    }

    .history-row.header {
      position: sticky;
      top: 0;
      z-index: 1;
      min-height: 34px;
      background: #F8FAF7;
      color: #4B6265;
      font-size: 11px;
      font-weight: 900;
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }

    .history-row.has-move {
      color: #0F172A;
      background: #FFFBEB;
    }

    .history-row strong {
      color: #0F172A;
      font-weight: 900;
      text-align: right;
    }

    .positive {
      color: #047857;
    }

    .negative {
      color: #B91C1C;
    }

    @media (max-width: 1440px) {
      .tank-grid {
        grid-template-columns: 1fr;
      }

      .history-grid {
        grid-template-columns: 1fr;
      }
    }

    @media (max-width: 900px) {
      .page {
        padding: 16px;
      }

      .page-header {
        flex-direction: column;
      }

      .primary-btn {
        width: 100%;
      }

      .filters {
        align-items: stretch;
      }

      input,
      .secondary-btn {
        width: 100%;
      }

      .summary {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }

      .tank-layout {
        grid-template-columns: 1fr;
      }

      .tank-illustration {
        min-height: 260px;
      }

      .tank-circle {
        width: min(290px, 100%);
      }

      .ruler-wrap {
        justify-self: center;
      }

      .section-head {
        flex-direction: column;
      }

      .section-head p {
        white-space: normal;
      }
    }

    @media (max-width: 560px) {
      .summary {
        grid-template-columns: 1fr;
      }

      .tank-head {
        flex-direction: column;
      }

      .ruler-wrap {
        grid-template-columns: 46px 56px 82px;
      }

      .liter-mark span,
      .ruler-current span {
        font-size: 14px;
      }

      .history-metrics {
        grid-template-columns: 1fr;
      }

      .history-row {
        grid-template-columns: 0.9fr 1fr 1fr 1.1fr;
        font-size: 12px;
      }
    }
  `],
})
export class TanquesPrivadoComponent implements OnInit {
  loading = signal(false);
  error = signal('');
  tanks = signal<TankView[]>([]);
  historico = signal<TanqueHistoricoData | null>(null);

  dataInicio = this.toIsoDate(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  dataFim = this.toIsoDate(new Date());

  readonly capacidadePadraoLitros = 15000;
  readonly alturaReguaCm = 186;
  readonly cmMarks = [
    { cm: 186, pct: 100 },
    { cm: 180, pct: this.cmPct(180) },
    { cm: 160, pct: this.cmPct(160) },
    { cm: 140, pct: this.cmPct(140) },
    { cm: 120, pct: this.cmPct(120) },
    { cm: 100, pct: this.cmPct(100) },
    { cm: 80, pct: this.cmPct(80) },
    { cm: 60, pct: this.cmPct(60) },
    { cm: 40, pct: this.cmPct(40) },
    { cm: 20, pct: this.cmPct(20) },
  ];

  totalAtual = computed(() => this.tanks().reduce((sum, tank) => sum + tank.atual, 0));
  totalComprado = computed(() => this.tanks().reduce((sum, tank) => sum + tank.comprado, 0));
  totalAbastecido = computed(() => this.tanks().reduce((sum, tank) => sum + tank.abastecido, 0));
  totalEspacoLivre = computed(() => this.tanks().reduce((sum, tank) => sum + this.espacoLivre(tank), 0));
  historicosOrdenados = computed(() => {
    const hist = this.historico();
    if (!hist) return [];
    return (['Matriz', 'Viana'] as TankLocal[])
      .map(local => hist.locais.find(item => item.local === local))
      .filter((item): item is TanqueHistoricoLocal => !!item);
  });

  constructor(private api: ApiService, private auth: AuthService) {}

  ngOnInit(): void {
    if (this.canAccess()) {
      this.load();
    }
  }

  canAccess(): boolean {
    const user = this.auth.currentUser();
    const ident = `${user?.login ?? ''} ${user?.nome ?? ''}`.toLowerCase();
    return user?.tipo === 'admin' && (ident.includes('douglas') || user?.login === 'admin');
  }

  load(): void {
    if (!this.canAccess()) return;
    this.loading.set(true);
    this.error.set('');

    forkJoin({
      matriz: this.api.getDashboard({ local: 'Matriz' }),
      viana: this.api.getDashboard({ local: 'Viana' }),
      historico: this.api.getTanqueHistoricoPrivado({
        data_inicio: this.dataInicio,
        data_fim: this.dataFim,
      }),
    }).subscribe({
      next: ({ matriz, viana, historico }) => {
        this.tanks.set([
          this.toTank('Matriz', matriz),
          this.toTank('Viana', viana),
        ]);
        this.historico.set(historico);
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set(err?.error?.message || 'Erro ao carregar combustível no tanque.');
        this.loading.set(false);
      },
    });
  }

  setPeriodoMes(): void {
    const hoje = new Date();
    this.dataInicio = this.toIsoDate(new Date(hoje.getFullYear(), hoje.getMonth(), 1));
    this.dataFim = this.toIsoDate(hoje);
    this.load();
  }

  setPeriodo30Dias(): void {
    const fim = new Date();
    const inicio = new Date();
    inicio.setDate(fim.getDate() - 29);
    this.dataInicio = this.toIsoDate(inicio);
    this.dataFim = this.toIsoDate(fim);
    this.load();
  }

  levelPercent(tank: TankView): number {
    if (!tank.capacidade) return 0;
    return Math.max(0, Math.min(100, (tank.atual / tank.capacidade) * 100));
  }

  alturaCm(tank: TankView): number {
    return Math.round((this.levelPercent(tank) / 100) * this.alturaReguaCm);
  }

  espacoLivre(tank: TankView): number {
    return Math.max(0, tank.capacidade - tank.atual);
  }

  literMarks(tank: TankView): Array<{ value: number; pct: number }> {
    const capacity = tank.capacidade || this.capacidadePadraoLitros;
    const step = capacity <= 12000 ? 1000 : 1500;
    const marks: Array<{ value: number; pct: number }> = [];
    for (let value = step; value < capacity; value += step) {
      marks.push({ value, pct: (value / capacity) * 100 });
    }
    marks.push({ value: capacity, pct: 100 });
    return marks.reverse();
  }

  litros(value: number | null | undefined, decimals = 2): string {
    return `${Number(value ?? 0).toLocaleString('pt-BR', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    })} L`;
  }

  formatDate(value: string | null | undefined): string {
    const parts = String(value ?? '').slice(0, 10).split('-');
    if (parts.length !== 3) return '-';
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }

  variacao(item: TanqueHistoricoLocal): number {
    return Number(item.saldo_final_litros ?? 0) - Number(item.saldo_inicial_litros ?? 0);
  }

  pontosRecentes(item: TanqueHistoricoLocal) {
    return [...(item.pontos ?? [])].reverse();
  }

  historyPolyline(item: TanqueHistoricoLocal): string {
    const pontos = item.pontos ?? [];
    if (!pontos.length) return '';
    const values = pontos.map(p => Number(p.saldo_litros ?? 0));
    const min = Math.min(...values);
    const max = Math.max(...values);
    const gap = Math.max(1, (max - min) * 0.12);
    const minScale = min - gap;
    const maxScale = max + gap;
    const range = Math.max(1, maxScale - minScale);

    return pontos.map((p, index) => {
      const x = pontos.length === 1 ? 50 : (index / (pontos.length - 1)) * 100;
      const y = 48 - ((Number(p.saldo_litros ?? 0) - minScale) / range) * 42;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    }).join(' ');
  }

  historyArea(item: TanqueHistoricoLocal): string {
    const line = this.historyPolyline(item);
    if (!line) return '';
    return `0,52 ${line} 100,52`;
  }

  private toTank(local: TankLocal, data: DashboardData): TankView {
    const comprado = Number(data?.totais?.combustivel_comprado_litros ?? 0);
    const abastecido = Number(data?.totais?.combustivel_vendido_litros ?? data?.totais?.litros ?? 0);
    const atual = Number(data?.totais?.combustivel_tanque_litros ?? comprado - abastecido);
    const capacidade = Math.max(this.capacidadePadraoLitros, Math.ceil(Math.max(atual, 1) / 1000) * 1000);

    return {
      local,
      atual,
      comprado,
      abastecido,
      capacidade,
    };
  }

  private cmPct(cm: number): number {
    return Math.max(0, Math.min(100, (cm / this.alturaReguaCm) * 100));
  }

  private toIsoDate(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
}
