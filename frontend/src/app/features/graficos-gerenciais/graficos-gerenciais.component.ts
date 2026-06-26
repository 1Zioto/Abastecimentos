import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { GraficosGerenciaisData, GraficosGerenciaisResumo } from '../../shared/models';

interface MetricCard {
  title: string;
  value: string;
  detail: string;
  tone: 'green' | 'blue' | 'amber' | 'red' | 'slate' | 'violet' | 'cyan' | 'orange';
}

@Component({
  selector: 'app-graficos-gerenciais',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="page">
      <header class="page-header">
        <div>
          <span class="eyebrow">Indicadores gerenciais</span>
          <h1>Gráficos</h1>
          <p>Visão financeira e operacional por período.</p>
        </div>

        <form class="filters" (ngSubmit)="load()">
          <label>
            <span>Início</span>
            <input type="date" [(ngModel)]="filters.data_inicio" name="data_inicio">
          </label>
          <label>
            <span>Fim</span>
            <input type="date" [(ngModel)]="filters.data_fim" name="data_fim">
          </label>
          <button type="submit">Atualizar</button>
        </form>
      </header>

      @if (loading()) {
        <section class="state">Carregando indicadores...</section>
      } @else if (error()) {
        <section class="state error">{{ error() }}</section>
      } @else if (data(); as d) {
        <section class="period-strip">
          <div>
            <span>Filial</span>
            <strong>{{ d.periodo.local }}</strong>
          </div>
          <div>
            <span>Período</span>
            <strong>{{ date(d.periodo.data_inicio) }} até {{ date(d.periodo.data_fim) }}</strong>
          </div>
          <div>
            <span>Registros</span>
            <strong>{{ d.totais.abastecimentos_total }} abastecimentos</strong>
          </div>
        </section>

        <section class="metrics-grid">
          @for (card of metricCards(); track card.title) {
            <article class="metric-card" [ngClass]="card.tone">
              <span>{{ card.title }}</span>
              <strong>{{ card.value }}</strong>
              <small>{{ card.detail }}</small>
            </article>
          }
        </section>

        @if (filiaisComparativo().length) {
          <section class="branch-profit-grid">
            @for (filial of filiaisComparativo(); track filial.periodo.local) {
              <article class="branch-profit-card" [class.negative]="filial.totais.margem_bruta < 0">
                <div class="branch-profit-head">
                  <div>
                    <span>Filial</span>
                    <strong>{{ filial.periodo.local }}</strong>
                  </div>
                  <small>{{ filial.totais.abastecimentos_total }} abastecimentos</small>
                </div>
                <div class="branch-profit-main">
                  <span>Margem da filial</span>
                  <strong>{{ money(filial.totais.margem_bruta) }}</strong>
                  <small>{{ money(filial.totais.diferenca_media_litro) }}/L de diferença média</small>
                </div>
                <div class="branch-profit-details">
                  <div>
                    <span>Comprado</span>
                    <strong>{{ money(filial.totais.comprado_valor) }}</strong>
                    <small>{{ litros(filial.totais.comprado_litros) }}</small>
                  </div>
                  <div>
                    <span>Transporte</span>
                    <strong>{{ money(filial.totais.custo_transporte_total || 0) }}</strong>
                    <small>{{ money(0.04) }}/L embutido</small>
                  </div>
                  <div>
                    <span>Vendido</span>
                    <strong>{{ money(filial.totais.vendido_valor) }}</strong>
                    <small>{{ litros(filial.totais.vendido_litros) }}</small>
                  </div>
                  <div>
                    <span>Pendente</span>
                    <strong>{{ money(filial.totais.pendente_baixa_valor) }}</strong>
                    <small>{{ litros(filial.totais.pendente_baixa_litros) }}</small>
                  </div>
                </div>
              </article>
            }
          </section>
        }

        <section class="visual-grid">
          <article class="panel">
            <div class="panel-head">
              <h2>Comprado x Vendido</h2>
              <span>{{ percent(d.totais.vendido_valor, d.totais.comprado_valor) }}</span>
            </div>
            <div class="bar-row">
              <span>Comprado</span>
              <div class="bar"><i [style.width.%]="barPercent(d.totais.comprado_valor, maxMoney(d))"></i></div>
              <strong>{{ money(d.totais.comprado_valor) }}</strong>
            </div>
            <div class="bar-row sold">
              <span>Vendido</span>
              <div class="bar"><i [style.width.%]="barPercent(d.totais.vendido_valor, maxMoney(d))"></i></div>
              <strong>{{ money(d.totais.vendido_valor) }}</strong>
            </div>
          </article>

          <article class="panel">
            <div class="panel-head">
              <h2>Preço Médio</h2>
              <span>{{ money(d.totais.diferenca_media_litro) }}/L</span>
            </div>
            <div class="bar-row purchase">
              <span>Compra</span>
              <div class="bar"><i [style.width.%]="barPercent(d.totais.preco_medio_comprado, maxPrice(d))"></i></div>
              <strong>{{ money(d.totais.preco_medio_comprado) }}</strong>
            </div>
            <div class="bar-row sold">
              <span>Venda</span>
              <div class="bar"><i [style.width.%]="barPercent(d.totais.preco_medio_vendido, maxPrice(d))"></i></div>
              <strong>{{ money(d.totais.preco_medio_vendido) }}</strong>
            </div>
          </article>

          <article class="panel note-panel">
            <div class="panel-head">
              <h2>Última Entrada de Nota</h2>
              <span>{{ d.ultima_entrada_nota?.local || d.periodo.local }}</span>
            </div>
            @if (d.ultima_entrada_nota; as nota) {
              <div class="note-summary">
                <strong>{{ nota.numero_nota_fiscal || 'Sem número' }}</strong>
                <span>{{ dateTime(nota.data_hora || nota.data) }}</span>
                <span>{{ litros(nota.quantidade) }} · {{ money(notaValorCompraFinal(nota)) }}</span>
                <small>{{ nota.tipo || 'Combustível' }} · transporte {{ money(nota.custo_transporte_total || 0) }}</small>
              </div>
            } @else {
              <div class="empty">Sem nota encontrada para a filial.</div>
            }
          </article>
        </section>

        <section class="limits-panel">
          <div class="panel-head">
            <h2>Proprietários em Atenção</h2>
            <span>{{ d.proprietarios_controle.itens.length }} exibidos</span>
          </div>
          @if (d.proprietarios_controle.itens.length) {
            <div class="limits-list">
              @for (item of d.proprietarios_controle.itens; track item.id_proprietario) {
                <div class="limit-item">
                  <div>
                    <strong>{{ item.nome }}</strong>
                    <span>{{ item.local }} · {{ item.status || item.situacao }}</span>
                  </div>
                  <div>
                    <strong>{{ money(item.pendente_valor) }}</strong>
                    <span>{{ litros(item.pendente_litros) }} · {{ number(item.percentual_limite) }}%</span>
                  </div>
                </div>
              }
            </div>
          } @else {
            <div class="empty">Nenhum proprietário bloqueado ou próximo do limite.</div>
          }
        </section>
      }
    </div>
  `,
  styles: [`
    .page {
      padding: 24px;
      display: flex;
      flex-direction: column;
      gap: 18px;
    }

    .page-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      gap: 16px;
    }

    .eyebrow {
      color: #64748b;
      font-size: 11px;
      font-weight: 800;
      letter-spacing: 0.6px;
      text-transform: uppercase;
    }

    h1 {
      margin: 2px 0 4px;
      color: #0f172a;
      font-size: 30px;
      line-height: 1.1;
      letter-spacing: 0;
    }

    p {
      margin: 0;
      color: #64748b;
      font-size: 14px;
    }

    .filters {
      display: flex;
      align-items: end;
      gap: 10px;
      flex-wrap: wrap;
    }

    label {
      display: flex;
      flex-direction: column;
      gap: 5px;
      color: #64748b;
      font-size: 11px;
      font-weight: 800;
      text-transform: uppercase;
    }

    input {
      height: 38px;
      border: 1px solid #cbd5e1;
      border-radius: 8px;
      background: #fff;
      color: #0f172a;
      padding: 0 10px;
      font-size: 13px;
      font-weight: 700;
    }

    button {
      height: 38px;
      border: 0;
      border-radius: 8px;
      background: #0f766e;
      color: #fff;
      padding: 0 16px;
      font-weight: 800;
      cursor: pointer;
    }

    .state {
      min-height: 240px;
      display: flex;
      align-items: center;
      justify-content: center;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      background: #fff;
      color: #64748b;
      font-weight: 800;
    }

    .state.error {
      color: #b91c1c;
      background: #fef2f2;
      border-color: #fecaca;
    }

    .period-strip,
    .metrics-grid,
    .branch-profit-grid,
    .visual-grid {
      display: grid;
      gap: 12px;
    }

    .period-strip {
      grid-template-columns: repeat(3, minmax(0, 1fr));
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      background: #fff;
      padding: 14px;
    }

    .period-strip div {
      display: flex;
      flex-direction: column;
      gap: 4px;
      min-width: 0;
    }

    .period-strip span,
    .metric-card span,
    .metric-card small,
    .bar-row span,
    .limit-item span,
    .note-summary span,
    .note-summary small {
      color: #64748b;
      font-size: 12px;
    }

    .period-strip strong {
      color: #0f172a;
      font-size: 15px;
      overflow-wrap: anywhere;
    }

    .metrics-grid {
      grid-template-columns: repeat(5, minmax(0, 1fr));
    }

    .metric-card {
      min-height: 132px;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      background: #fff;
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 8px;
      position: relative;
      overflow: hidden;
    }

    .metric-card::before {
      content: '';
      position: absolute;
      inset: 0 auto 0 0;
      width: 5px;
      background: #64748b;
    }

    .metric-card strong {
      color: #0f172a;
      font-size: 24px;
      line-height: 1.05;
      letter-spacing: 0;
      overflow-wrap: anywhere;
    }

    .metric-card small {
      margin-top: auto;
      line-height: 1.35;
    }

    .metric-card.green::before { background: #16a34a; }
    .metric-card.blue::before { background: #2563eb; }
    .metric-card.amber::before { background: #d97706; }
    .metric-card.red::before { background: #dc2626; }
    .metric-card.slate::before { background: #475569; }
    .metric-card.violet::before { background: #7c3aed; }
    .metric-card.cyan::before { background: #0891b2; }
    .metric-card.orange::before { background: #ea580c; }

    .branch-profit-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .branch-profit-card {
      border: 1px solid #bbf7d0;
      border-radius: 8px;
      background: linear-gradient(180deg, #f0fdf4 0%, #fff 72%);
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 14px;
    }

    .branch-profit-card.negative {
      border-color: #fecaca;
      background: linear-gradient(180deg, #fef2f2 0%, #fff 72%);
    }

    .branch-profit-head,
    .branch-profit-details {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 12px;
    }

    .branch-profit-details {
      flex-wrap: wrap;
    }

    .branch-profit-head div,
    .branch-profit-main,
    .branch-profit-details div {
      display: flex;
      flex-direction: column;
      gap: 4px;
      min-width: 0;
    }

    .branch-profit-details div {
      flex: 1 1 130px;
    }

    .branch-profit-head span,
    .branch-profit-main span,
    .branch-profit-details span,
    .branch-profit-head small,
    .branch-profit-main small,
    .branch-profit-details small {
      color: #64748b;
      font-size: 12px;
    }

    .branch-profit-head strong {
      color: #0f172a;
      font-size: 18px;
      line-height: 1.1;
    }

    .branch-profit-head small {
      font-weight: 800;
      white-space: nowrap;
    }

    .branch-profit-main strong {
      color: #166534;
      font-size: 30px;
      line-height: 1.05;
      letter-spacing: 0;
    }

    .branch-profit-card.negative .branch-profit-main strong {
      color: #b91c1c;
    }

    .branch-profit-details {
      border-top: 1px solid #e2e8f0;
      padding-top: 12px;
    }

    .branch-profit-details strong {
      color: #0f172a;
      font-size: 14px;
      line-height: 1.15;
    }

    .visual-grid {
      grid-template-columns: 1fr 1fr 1fr;
      align-items: stretch;
    }

    .panel,
    .limits-panel {
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      background: #fff;
      padding: 16px;
    }

    .panel-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      margin-bottom: 14px;
    }

    h2 {
      margin: 0;
      color: #0f172a;
      font-size: 16px;
      line-height: 1.2;
    }

    .panel-head span {
      color: #0f766e;
      font-size: 13px;
      font-weight: 900;
      white-space: nowrap;
    }

    .bar-row {
      display: grid;
      grid-template-columns: 72px minmax(0, 1fr) 96px;
      align-items: center;
      gap: 10px;
      margin-top: 12px;
    }

    .bar {
      height: 12px;
      border-radius: 999px;
      background: #e2e8f0;
      overflow: hidden;
    }

    .bar i {
      display: block;
      min-width: 2px;
      max-width: 100%;
      height: 100%;
      border-radius: inherit;
      background: #0f766e;
    }

    .bar-row.sold .bar i { background: #2563eb; }
    .bar-row.purchase .bar i { background: #d97706; }

    .bar-row strong {
      color: #0f172a;
      font-size: 13px;
      text-align: right;
      white-space: nowrap;
    }

    .note-summary {
      display: flex;
      flex-direction: column;
      gap: 7px;
    }

    .note-summary strong {
      color: #0f172a;
      font-size: 22px;
      line-height: 1.1;
    }

    .empty {
      min-height: 72px;
      display: flex;
      align-items: center;
      color: #64748b;
      font-weight: 700;
    }

    .limits-panel {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .limits-list {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 10px;
    }

    .limit-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 12px;
      background: #f8fafc;
    }

    .limit-item div {
      display: flex;
      flex-direction: column;
      gap: 4px;
      min-width: 0;
    }

    .limit-item div:last-child {
      text-align: right;
      flex-shrink: 0;
    }

    .limit-item strong {
      color: #0f172a;
      font-size: 14px;
      overflow-wrap: anywhere;
    }

    @media (max-width: 1200px) {
      .metrics-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
      .visual-grid { grid-template-columns: 1fr; }
    }

    @media (max-width: 760px) {
      .page { padding: 16px; }
      .page-header { align-items: stretch; flex-direction: column; }
      .filters { align-items: stretch; }
      label, button { flex: 1 1 100%; }
      input, button { width: 100%; }
      .period-strip,
      .metrics-grid,
      .branch-profit-grid,
      .limits-list {
        grid-template-columns: 1fr;
      }
      .metric-card { min-height: 118px; }
      .bar-row { grid-template-columns: 64px minmax(0, 1fr); }
      .bar-row strong { grid-column: 2; text-align: left; }
    }
  `],
})
export class GraficosGerenciaisComponent {
  private api = inject(ApiService);
  private auth = inject(AuthService);

  data = signal<GraficosGerenciaisData | null>(null);
  loading = signal(false);
  error = signal('');
  filiaisComparativo = computed<GraficosGerenciaisResumo[]>(() => this.data()?.por_filial ?? []);

  filters = {
    data_inicio: this.monthStart(),
    data_fim: this.today(),
  };

  metricCards = computed<MetricCard[]>(() => {
    const d = this.data();
    if (!d) return [];
    const t = d.totais;
    return [
      {
        title: 'Margem Bruta',
        value: this.money(t.margem_bruta),
        detail: `${this.money(t.vendido_valor)} vendido - ${this.money(t.comprado_valor)} comprado com transporte`,
        tone: t.margem_bruta >= 0 ? 'green' : 'red',
      },
      {
        title: 'Custo com Transporte',
        value: this.money(t.custo_transporte_total || 0),
        detail: `${this.litros(t.comprado_litros)} comprados x ${this.money(0.04)}/L`,
        tone: 'orange',
      },
      {
        title: 'Litros Pendentes de Baixa',
        value: this.litros(t.pendente_baixa_litros),
        detail: `${this.money(t.pendente_baixa_valor)} pendentes em ${t.pendente_baixa_total} abastecimentos`,
        tone: t.pendente_baixa_total > 0 ? 'amber' : 'green',
      },
      {
        title: 'Ticket Médio por Abastecimento',
        value: this.money(t.ticket_medio),
        detail: `${t.abastecimentos_total} abastecimentos no período`,
        tone: 'blue',
      },
      {
        title: 'Preço Médio Comprado',
        value: `${this.money(t.preco_medio_comprado)}/L`,
        detail: `${this.litros(t.comprado_litros)} comprados, transporte incluso`,
        tone: 'orange',
      },
      {
        title: 'Preço Médio Vendido',
        value: `${this.money(t.preco_medio_vendido)}/L`,
        detail: `${this.litros(t.vendido_litros)} vendidos`,
        tone: 'cyan',
      },
      {
        title: 'Diferença Média Compra x Venda',
        value: `${this.money(t.diferenca_media_litro)}/L`,
        detail: 'Preço médio vendido menos preço médio comprado',
        tone: t.diferenca_media_litro >= 0 ? 'green' : 'red',
      },
      {
        title: 'Abastecimentos com Inconsistência',
        value: this.number(t.inconsistencias),
        detail: 'Itens críticos no período',
        tone: t.inconsistencias > 0 ? 'red' : 'green',
      },
      {
        title: 'Proprietários Bloqueados / Limite',
        value: `${t.proprietarios_bloqueados} / ${t.proprietarios_proximos_limite}`,
        detail: `${t.proprietarios_limite_estourado} com limite estourado`,
        tone: (t.proprietarios_bloqueados + t.proprietarios_proximos_limite + t.proprietarios_limite_estourado) > 0 ? 'amber' : 'green',
      },
      {
        title: 'Estoque Estimado em R$',
        value: this.money(t.estoque_estimado_valor),
        detail: `${this.litros(t.tanque_litros)} no tanque x preço médio comprado`,
        tone: 'violet',
      },
      {
        title: 'Última Entrada de Nota',
        value: this.data()?.ultima_entrada_nota ? this.date(this.data()!.ultima_entrada_nota!.data) : '—',
        detail: this.data()?.ultima_entrada_nota
          ? `${this.litros(this.data()!.ultima_entrada_nota!.quantidade)} · ${this.money(this.notaValorCompraFinal(this.data()!.ultima_entrada_nota!))}`
          : 'Sem nota cadastrada',
        tone: 'slate',
      },
    ];
  });

  ngOnInit() {
    this.load();
  }

  load() {
    this.loading.set(true);
    this.error.set('');
    this.api.getGraficosGerenciais({
      data_inicio: this.filters.data_inicio,
      data_fim: this.filters.data_fim,
      local: this.auth.getGaragem(),
    }).subscribe({
      next: data => {
        this.data.set(data);
        this.loading.set(false);
      },
      error: err => {
        this.error.set(err?.error?.message || 'Erro ao carregar gráficos.');
        this.loading.set(false);
      },
    });
  }

  money(value?: number | null): string {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value || 0));
  }

  notaValorCompraFinal(nota: NonNullable<GraficosGerenciaisResumo['ultima_entrada_nota']>): number {
    const final = Number(nota.valor_compra_final ?? 0);
    if (Number.isFinite(final) && final > 0) return final;
    const valor = Number(nota.valor ?? 0);
    const transporte = Number(nota.custo_transporte_total ?? 0);
    if (Number.isFinite(transporte) && transporte > 0) return valor + transporte;
    return valor + (Number(nota.quantidade ?? 0) * 0.04);
  }

  litros(value?: number | null): string {
    return `${this.number(value)} L`;
  }

  number(value?: number | null): string {
    return new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(Number(value || 0));
  }

  date(value?: string | null): string {
    if (!value) return '—';
    const [date] = value.split('T');
    const [year, month, day] = date.split('-');
    if (!year || !month || !day) return value;
    return `${day}/${month}/${year}`;
  }

  dateTime(value?: string | null): string {
    if (!value) return '—';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return this.date(value);
    return parsed.toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  percent(value: number, total: number): string {
    if (!total) return '0%';
    return `${this.number((value / total) * 100)}%`;
  }

  barPercent(value: number, max: number): number {
    if (!max || max <= 0) return 0;
    return Math.max(0, Math.min(100, (value / max) * 100));
  }

  maxMoney(d: GraficosGerenciaisData): number {
    return Math.max(d.totais.comprado_valor, d.totais.vendido_valor, 1);
  }

  maxPrice(d: GraficosGerenciaisData): number {
    return Math.max(d.totais.preco_medio_comprado, d.totais.preco_medio_vendido, 1);
  }

  private today(): string {
    return this.dateInput(new Date());
  }

  private monthStart(): string {
    const now = new Date();
    return this.dateInput(new Date(now.getFullYear(), now.getMonth(), 1));
  }

  private dateInput(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
}
