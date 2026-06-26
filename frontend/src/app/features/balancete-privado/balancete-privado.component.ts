import { CommonModule } from "@angular/common";
import { Component, OnInit, computed, signal } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { ApiService } from "../../core/services/api.service";
import { AuthService } from "../../core/services/auth.service";
import {
  BalanceteLocal,
  BalanceteMovimentoFinanceiro,
  BalancetePrivadoData,
  BalanceteSerieDiariaPonto,
} from "../../shared/models";

interface BalanceteFlowRow {
  label: string;
  value: number;
  detail?: string;
  muted?: boolean;
}

interface ChartPoint {
  x: number;
  y: number;
  value: number;
  label: string;
}

interface ChartAxisLabel {
  x: number;
  y?: number;
  label: string;
  value?: number;
}

interface TrendChartData {
  hasData: boolean;
  yMax: number;
  vendasPath: string;
  custosPath: string;
  vendasArea: string;
  custosArea: string;
  vendasPoints: ChartPoint[];
  custosPoints: ChartPoint[];
  yLabels: ChartAxisLabel[];
  xLabels: ChartAxisLabel[];
  totalVendas: number;
  totalCustos: number;
}

@Component({
  selector: "app-balancete-privado",
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="page">
      <header class="page-header">
        <div>
          <span>Privado</span>
          <h1>Balancete Matriz x Filial</h1>
        </div>
        <button
          type="button"
          class="primary-btn"
          (click)="load()"
          [disabled]="loading() || !canAccess()"
        >
          {{ loading() ? "Atualizando..." : "Atualizar" }}
        </button>
      </header>

      @if (!canAccess()) {
        <section class="state error">
          Acesso restrito ao administrador autorizado.
        </section>
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
          <button type="button" class="secondary-btn" (click)="setPeriodoMes()">
            Mês atual
          </button>
          <button
            type="button"
            class="secondary-btn"
            (click)="setPeriodoHoje()"
          >
            Hoje
          </button>
        </section>

        @if (error()) {
          <section class="state error">{{ error() }}</section>
        } @else if (loading()) {
          <section class="state">Carregando balancete...</section>
        } @else if (data(); as balancete) {
          @if (grafico(); as chart) {
            <section class="trend-card">
              <div class="trend-head">
                <div>
                  <span>Comparativo diário</span>
                  <h2>Custos x vendas de combustível</h2>
                  <p>
                    Custos consideram entrada de notas, despesas avulsas e
                    transporte de combustível.
                  </p>
                </div>
                <div class="trend-summary">
                  <div>
                    <span>Custos no período</span>
                    <strong class="negative">{{ money(chart.totalCustos) }}</strong>
                  </div>
                  <div>
                    <span>Vendas no período</span>
                    <strong class="positive">{{ money(chart.totalVendas) }}</strong>
                  </div>
                </div>
                <button
                  type="button"
                  class="collapse-btn"
                  (click)="togglePanel('grafico')"
                >
                  {{ isCollapsed("grafico") ? "Expandir" : "Recolher" }}
                </button>
              </div>

              @if (!isCollapsed("grafico")) {
                @if (chart.hasData) {
                  <div class="trend-chart">
                    <svg viewBox="0 0 760 300" role="img" aria-label="Gráfico diário de custos e vendas">
                      <defs>
                        <linearGradient id="custosArea" x1="0" x2="0" y1="0" y2="1">
                          <stop offset="0%" stop-color="#f97316" stop-opacity="0.28" />
                          <stop offset="100%" stop-color="#f97316" stop-opacity="0.03" />
                        </linearGradient>
                        <linearGradient id="vendasArea" x1="0" x2="0" y1="0" y2="1">
                          <stop offset="0%" stop-color="#059669" stop-opacity="0.22" />
                          <stop offset="100%" stop-color="#059669" stop-opacity="0.03" />
                        </linearGradient>
                      </defs>

                      <line x1="64" y1="24" x2="64" y2="248" class="axis" />
                      <line x1="64" y1="248" x2="732" y2="248" class="axis" />

                      @for (tick of chart.yLabels; track tick.label) {
                        <line
                          x1="64"
                          [attr.y1]="tick.y"
                          x2="732"
                          [attr.y2]="tick.y"
                          class="grid-line"
                        />
                        <text x="52" [attr.y]="tick.y! + 4" class="axis-label" text-anchor="end">
                          {{ compactMoney(tick.value) }}
                        </text>
                      }

                      <path [attr.d]="chart.custosArea" fill="url(#custosArea)" />
                      <path [attr.d]="chart.vendasArea" fill="url(#vendasArea)" />
                      <path [attr.d]="chart.custosPath" class="line custos-line" />
                      <path [attr.d]="chart.vendasPath" class="line vendas-line" />

                      @for (point of chart.custosPoints; track point.label + point.x + 'c') {
                        <circle [attr.cx]="point.x" [attr.cy]="point.y" r="3.2" class="dot custos-dot">
                          <title>{{ point.label }} · Custos {{ money(point.value) }}</title>
                        </circle>
                      }
                      @for (point of chart.vendasPoints; track point.label + point.x + 'v') {
                        <circle [attr.cx]="point.x" [attr.cy]="point.y" r="3.2" class="dot vendas-dot">
                          <title>{{ point.label }} · Vendas {{ money(point.value) }}</title>
                        </circle>
                      }

                      @for (tick of chart.xLabels; track tick.label + tick.x) {
                        <text [attr.x]="tick.x" y="276" class="axis-label" text-anchor="middle">
                          {{ tick.label }}
                        </text>
                      }
                    </svg>
                  </div>

                  <div class="trend-legend">
                    <span><i class="legend-cost"></i>Custos</span>
                    <span><i class="legend-sales"></i>Vendas de combustível</span>
                  </div>
                } @else {
                  <div class="trend-empty">Sem movimentos no período selecionado.</div>
                }
              }
            </section>
          }

          <section class="consolidado">
            <article>
              <span>Compra de combustível</span>
              <strong
                [ngClass]="
                  valueClass(movimento(balancete.consolidado, 'comprado'))
                "
              >
                {{ signedMoney(movimento(balancete.consolidado, "comprado")) }}
              </strong>
            </article>
            <article>
              <span>Transporte de combustível</span>
              <strong class="negative">
                {{ signedMoney(-custoTransporte(balancete.consolidado)) }}
              </strong>
              <small>Incluído no custo final de compra</small>
            </article>
            <article>
              <span>Vendido pendente de pagamento</span>
              <strong
                [ngClass]="
                  valueClass(
                    movimento(balancete.consolidado, 'vendido_pendente')
                  )
                "
              >
                {{
                  signedMoney(
                    movimento(balancete.consolidado, "vendido_pendente")
                  )
                }}
              </strong>
            </article>
            <article>
              <span>Recebido em baixas</span>
              <strong
                [ngClass]="
                  valueClass(movimento(balancete.consolidado, 'recebido'))
                "
              >
                {{ signedMoney(movimento(balancete.consolidado, "recebido")) }}
              </strong>
            </article>
            <article>
              <span>Resultado esperado do período</span>
              <strong
                [ngClass]="
                  valueClass(balancete.consolidado.resultado_competencia)
                "
              >
                {{ signedMoney(balancete.consolidado.resultado_competencia) }}
              </strong>
            </article>
            <article>
              <span>Caixa realizado</span>
              <strong
                [ngClass]="valueClass(balancete.consolidado.resultado_caixa)"
              >
                {{ signedMoney(balancete.consolidado.resultado_caixa) }}
              </strong>
            </article>
            <article>
              <span>Estoque do período</span>
              <strong
                [class.negative]="
                  balancete.consolidado.estoque_periodo_litros < 0
                "
              >
                {{ litros(balancete.consolidado.estoque_periodo_litros) }}
              </strong>
            </article>
          </section>

          <section class="flow-card">
            <div class="flow-head">
              <div>
                <span>Fluxo financeiro</span>
                <h2>Consolidado</h2>
              </div>
              <div class="panel-actions">
                <strong
                  [ngClass]="
                    valueClass(balancete.consolidado.resultado_competencia)
                  "
                >
                  {{ signedMoney(balancete.consolidado.resultado_competencia) }}
                </strong>
                <button
                  type="button"
                  class="collapse-btn"
                  (click)="togglePanel('fluxo-consolidado')"
                >
                  {{
                    isCollapsed("fluxo-consolidado") ? "Expandir" : "Recolher"
                  }}
                </button>
              </div>
            </div>

            @if (!isCollapsed("fluxo-consolidado")) {
              <div class="flow-columns">
                <div class="flow-section">
                  <h3>Entradas e valores a receber</h3>
                  @for (
                    row of fluxoEntradas(balancete.consolidado);
                    track row.label
                  ) {
                    <p class="flow-line" [class.muted]="row.muted">
                      <span>
                        <strong>{{ row.label }}</strong>
                        @if (row.detail) {
                          <small>{{ row.detail }}</small>
                        }
                      </span>
                      <b [ngClass]="row.muted ? '' : valueClass(row.value)">{{
                        signedMoney(row.value)
                      }}</b>
                    </p>
                  }
                </div>
                <div class="flow-section">
                  <h3>Saídas e custos</h3>
                  @for (
                    row of fluxoSaidas(balancete.consolidado);
                    track row.label
                  ) {
                    <p class="flow-line">
                      <span>
                        <strong>{{ row.label }}</strong>
                        @if (row.detail) {
                          <small>{{ row.detail }}</small>
                        }
                      </span>
                      <b [ngClass]="valueClass(row.value)">{{
                        signedMoney(row.value)
                      }}</b>
                    </p>
                  }
                </div>
              </div>

              <div class="flow-section localized-section">
                <h3>Custos localizados</h3>
                @for (
                  row of custosLocalizados(balancete.consolidado);
                  track row.label
                ) {
                  <p class="flow-line">
                    <span>
                      <strong>{{ row.label }}</strong>
                      @if (row.detail) {
                        <small>{{ row.detail }}</small>
                      }
                    </span>
                    <b [ngClass]="valueClass(row.value)">{{
                      signedMoney(row.value)
                    }}</b>
                  </p>
                }
              </div>

              <div class="flow-results">
                <div>
                  <span>Caixa realizado</span>
                  <strong
                    [ngClass]="valueClass(balancete.consolidado.resultado_caixa)"
                  >
                    {{ signedMoney(balancete.consolidado.resultado_caixa) }}
                  </strong>
                  <small
                    >recebido em baixas - compra de combustível - transporte de
                    combustível - despesas</small
                  >
                </div>
                <div>
                  <span>Resultado esperado do período</span>
                  <strong
                    [ngClass]="
                      valueClass(balancete.consolidado.resultado_competencia)
                    "
                  >
                    {{ signedMoney(balancete.consolidado.resultado_competencia) }}
                  </strong>
                  <small
                    >total vendido - compra de combustível - transporte de
                    combustível - despesas</small
                  >
                </div>
              </div>
            }
          </section>

          <section class="branch-grid">
            @for (item of locaisOrdenados(); track item.local) {
              <article class="branch-panel">
                <div class="branch-head">
                  <div>
                    <span>Filial</span>
                    <h2>{{ item.local }}</h2>
                  </div>
                  <div class="panel-actions">
                    <strong [ngClass]="valueClass(item.resultado_competencia)">
                      {{ signedMoney(item.resultado_competencia) }}
                    </strong>
                    <button
                      type="button"
                      class="collapse-btn"
                      (click)="togglePanel(panelId('filial', item.local))"
                    >
                      {{
                        isCollapsed(panelId("filial", item.local))
                          ? "Expandir"
                          : "Recolher"
                      }}
                    </button>
                  </div>
                </div>

                @if (!isCollapsed(panelId("filial", item.local))) {
                  <div class="metrics">
                    <div>
                      <span>Litros comprados</span>
                      <strong>{{ litros(item.compras.litros) }}</strong>
                      <small [ngClass]="valueClass(movimento(item, 'comprado'))">
                        {{ signedMoney(movimento(item, "comprado")) }}
                      </small>
                    </div>
                    <div>
                      <span>Transporte de combustível</span>
                      <strong class="negative">{{
                        signedMoney(-custoTransporte(item))
                      }}</strong>
                      <small>{{ money(0.04) }}/L incluído no custo final</small>
                    </div>
                    <div>
                      <span>Total vendido</span>
                      <strong>{{ litros(item.vendas.litros) }}</strong>
                      <small class="positive">{{
                        signedMoney(item.vendas.valor)
                      }}</small>
                    </div>
                    <div>
                      <span>Vendido pendente de pagamento</span>
                      <strong
                        [ngClass]="
                          valueClass(movimento(item, 'vendido_pendente'))
                        "
                      >
                        {{ signedMoney(movimento(item, "vendido_pendente")) }}
                      </strong>
                      <small
                        >{{
                          item.pendentes.registros || 0
                        }}
                        abastecimento(s)</small
                      >
                    </div>
                    <div>
                      <span>Recebido em baixas</span>
                      <strong [ngClass]="valueClass(movimento(item, 'recebido'))">
                        {{ signedMoney(movimento(item, "recebido")) }}
                      </strong>
                      <small>{{ item.recebidos.registros || 0 }} baixa(s)</small>
                    </div>
                    <div>
                      <span>Despesas</span>
                      <strong [ngClass]="valueClass(movimento(item, 'despesas'))">
                        {{ signedMoney(movimento(item, "despesas")) }}
                      </strong>
                      <small
                        >{{ item.despesas.registros || 0 }} lançamento(s)</small
                      >
                    </div>
                    <div>
                      <span>Saldo de litros</span>
                      <strong
                        [class.negative]="item.estoque_periodo_litros < 0"
                        >{{ litros(item.estoque_periodo_litros) }}</strong
                      >
                      <small>comprado - vendido</small>
                    </div>
                  </div>

                  <div class="result-row">
                    <div>
                      <span>Resultado esperado do período</span>
                      <strong
                        [ngClass]="valueClass(item.resultado_competencia)"
                        >{{ signedMoney(item.resultado_competencia) }}</strong
                      >
                    </div>
                    <div>
                      <span>Caixa realizado</span>
                      <strong [ngClass]="valueClass(item.resultado_caixa)">{{
                        signedMoney(item.resultado_caixa)
                      }}</strong>
                    </div>
                    <div>
                      <span>Valor pendente de pagamento</span>
                      <strong [ngClass]="valueClass(saldoAReceber(item))">{{
                        signedMoney(saldoAReceber(item))
                      }}</strong>
                    </div>
                  </div>

                  <div class="flow-card branch-flow">
                    <div class="flow-head">
                      <div>
                        <span>Fluxo financeiro</span>
                        <h3>Entradas e saídas</h3>
                      </div>
                      <strong [ngClass]="valueClass(item.resultado_competencia)">
                        {{ signedMoney(item.resultado_competencia) }}
                      </strong>
                    </div>

                    <div class="flow-columns">
                      <div class="flow-section">
                        <h3>Entradas e valores a receber</h3>
                        @for (row of fluxoEntradas(item); track row.label) {
                          <p class="flow-line" [class.muted]="row.muted">
                            <span>
                              <strong>{{ row.label }}</strong>
                              @if (row.detail) {
                                <small>{{ row.detail }}</small>
                              }
                            </span>
                            <b
                              [ngClass]="row.muted ? '' : valueClass(row.value)"
                              >{{ signedMoney(row.value) }}</b
                            >
                          </p>
                        }
                      </div>
                      <div class="flow-section">
                        <h3>Saídas e custos</h3>
                        @for (row of fluxoSaidas(item); track row.label) {
                          <p class="flow-line">
                            <span>
                              <strong>{{ row.label }}</strong>
                              @if (row.detail) {
                                <small>{{ row.detail }}</small>
                              }
                            </span>
                            <b [ngClass]="valueClass(row.value)">{{
                              signedMoney(row.value)
                            }}</b>
                          </p>
                        }
                      </div>
                    </div>

                    <div class="flow-section localized-section">
                      <h3>Custos localizados</h3>
                      @for (row of custosLocalizados(item); track row.label) {
                        <p class="flow-line">
                          <span>
                            <strong>{{ row.label }}</strong>
                            @if (row.detail) {
                              <small>{{ row.detail }}</small>
                            }
                          </span>
                          <b [ngClass]="valueClass(row.value)">{{
                            signedMoney(row.value)
                          }}</b>
                        </p>
                      }
                    </div>

                    <div class="flow-results">
                      <div>
                        <span>Caixa realizado</span>
                        <strong [ngClass]="valueClass(item.resultado_caixa)">
                          {{ signedMoney(item.resultado_caixa) }}
                        </strong>
                        <small
                          >recebido em baixas - compra de combustível -
                          transporte de combustível - despesas</small
                        >
                      </div>
                      <div>
                        <span>Resultado esperado do período</span>
                        <strong
                          [ngClass]="valueClass(item.resultado_competencia)"
                        >
                          {{ signedMoney(item.resultado_competencia) }}
                        </strong>
                        <small
                          >total vendido - compra de combustível - transporte de
                          combustível - despesas</small
                        >
                      </div>
                    </div>
                  </div>

                  <div class="lists">
                    <div>
                      <h3>Pendentes de pagamento</h3>
                      @if ((item.top_pendentes ?? []).length) {
                        @for (
                          p of item.top_pendentes;
                          track p.nome_proprietario
                        ) {
                          <p>
                            <span>{{ p.nome_proprietario }}</span
                            ><strong>{{ money(p.valor) }}</strong>
                          </p>
                        }
                      } @else {
                        <p class="empty">Sem pendências</p>
                      }
                    </div>
                    <div>
                      <h3>Despesas</h3>
                      @if ((item.despesas.categorias ?? []).length) {
                        @for (
                          cat of item.despesas.categorias;
                          track cat.categoria
                        ) {
                          <p>
                            <span>{{ cat.categoria }}</span
                            ><strong>{{ money(cat.valor) }}</strong>
                          </p>
                        }
                      } @else {
                        <p class="empty">Sem despesas</p>
                      }
                    </div>
                  </div>
                }
              </article>
            }
          </section>
        }
      }
    </div>
  `,
  styles: [
    `
      .page {
        min-height: 100%;
        padding: 28px;
        background: #f3f4f6;
        color: #111827;
        font-family: "Inter", sans-serif;
      }

      .page-header {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 16px;
        margin-bottom: 16px;
      }

      .page-header span,
      label,
      .branch-head span,
      .metrics span,
      .result-row span {
        color: #64748b;
        font-size: 11px;
        font-weight: 800;
        letter-spacing: 0.04em;
        text-transform: uppercase;
      }

      h1,
      h2,
      h3,
      p {
        margin: 0;
      }

      h1 {
        margin-top: 4px;
        font-size: 28px;
        font-weight: 900;
        letter-spacing: 0;
      }

      h2 {
        margin-top: 4px;
        font-size: 22px;
        font-weight: 900;
      }

      h3 {
        color: #334155;
        font-size: 13px;
        font-weight: 900;
        margin-bottom: 8px;
      }

      .filters,
      .consolidado article,
      .branch-panel,
      .state {
        background: #ffffff;
        border: 1px solid #e5e7eb;
        border-radius: 12px;
      }

      .filters {
        display: flex;
        flex-wrap: wrap;
        align-items: end;
        gap: 12px;
        padding: 16px;
        margin-bottom: 14px;
      }

      label {
        display: grid;
        gap: 6px;
      }

      input {
        height: 40px;
        width: 170px;
        border: 1px solid #cbd5e1;
        border-radius: 8px;
        padding: 0 10px;
        color: #111827;
        font: inherit;
        font-weight: 700;
      }

      .primary-btn,
      .secondary-btn {
        height: 40px;
        border-radius: 8px;
        border: 1px solid #cbd5e1;
        padding: 0 14px;
        background: #ffffff;
        color: #111827;
        font-weight: 900;
        cursor: pointer;
      }

      .primary-btn {
        background: #0284c7;
        border-color: #0284c7;
        color: #ffffff;
      }

      .primary-btn:disabled {
        opacity: 0.6;
        cursor: progress;
      }

      .panel-actions {
        display: flex;
        align-items: center;
        justify-content: flex-end;
        gap: 10px;
        flex-wrap: wrap;
      }

      .panel-actions > strong {
        font-size: 21px;
        font-weight: 900;
        line-height: 1.1;
        white-space: nowrap;
      }

      .collapse-btn {
        height: 34px;
        border: 1px solid #cbd5e1;
        border-radius: 8px;
        padding: 0 10px;
        background: #ffffff;
        color: #334155;
        font: inherit;
        font-size: 12px;
        font-weight: 900;
        cursor: pointer;
      }

      .collapse-btn:hover {
        background: #f8fafc;
        border-color: #94a3b8;
      }

      .trend-card {
        margin-bottom: 14px;
        padding: 20px;
        background: #ffffff;
        border: 1px solid #e5e7eb;
        border-radius: 12px;
        box-shadow: 0 12px 30px rgba(15, 23, 42, 0.04);
      }

      .trend-head {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 20px;
        margin-bottom: 16px;
      }

      .trend-head span,
      .trend-summary span {
        color: #64748b;
        font-size: 11px;
        font-weight: 800;
        letter-spacing: 0.04em;
        text-transform: uppercase;
      }

      .trend-head h2 {
        margin-top: 4px;
        font-size: 22px;
      }

      .trend-head p {
        margin-top: 4px;
        color: #64748b;
        font-size: 13px;
        font-weight: 700;
      }

      .trend-summary {
        display: grid;
        grid-template-columns: repeat(2, minmax(180px, 1fr));
        gap: 10px;
      }

      .trend-summary div {
        padding: 12px;
        background: #f8fafc;
        border: 1px solid #e2e8f0;
        border-radius: 10px;
      }

      .trend-summary strong {
        display: block;
        margin-top: 6px;
        font-size: 21px;
        font-weight: 900;
        white-space: nowrap;
      }

      .trend-chart {
        min-height: 300px;
        overflow: hidden;
        border: 1px solid #e2e8f0;
        border-radius: 10px;
        background: linear-gradient(180deg, #ffffff 0%, #f8fafc 100%);
      }

      .trend-chart svg {
        display: block;
        width: 100%;
        height: auto;
        min-height: 300px;
      }

      .axis {
        stroke: #94a3b8;
        stroke-width: 1.2;
      }

      .grid-line {
        stroke: #e2e8f0;
        stroke-width: 1;
      }

      .axis-label {
        fill: #64748b;
        font-size: 11px;
        font-weight: 800;
      }

      .line {
        fill: none;
        stroke-linecap: round;
        stroke-linejoin: round;
        stroke-width: 3.2;
      }

      .custos-line {
        stroke: #f97316;
      }

      .vendas-line {
        stroke: #059669;
      }

      .dot {
        stroke: #ffffff;
        stroke-width: 1.6;
      }

      .custos-dot {
        fill: #f97316;
      }

      .vendas-dot {
        fill: #059669;
      }

      .trend-legend {
        display: flex;
        flex-wrap: wrap;
        gap: 18px;
        margin-top: 12px;
        color: #334155;
        font-size: 13px;
        font-weight: 900;
      }

      .trend-legend span {
        display: inline-flex;
        align-items: center;
        gap: 7px;
      }

      .trend-legend i {
        width: 12px;
        height: 12px;
        border-radius: 999px;
      }

      .legend-cost {
        background: #f97316;
      }

      .legend-sales {
        background: #059669;
      }

      .trend-empty {
        padding: 36px;
        background: #f8fafc;
        border: 1px dashed #cbd5e1;
        border-radius: 10px;
        color: #64748b;
        text-align: center;
        font-weight: 800;
      }

      .consolidado {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
        gap: 12px;
        margin-bottom: 14px;
      }

      .consolidado article {
        position: relative;
        display: flex;
        min-height: 128px;
        flex-direction: column;
        justify-content: space-between;
        gap: 10px;
        overflow: hidden;
        padding: 18px;
        box-shadow: 0 10px 22px rgba(15, 23, 42, 0.04);
      }

      .consolidado article::before {
        position: absolute;
        inset: 0 auto 0 0;
        width: 4px;
        background: #94a3b8;
        content: "";
      }

      .consolidado article:nth-child(1)::before,
      .consolidado article:nth-child(2)::before,
      .consolidado article:nth-child(5)::before,
      .consolidado article:nth-child(6)::before {
        background: #dc2626;
      }

      .consolidado article:nth-child(3)::before,
      .consolidado article:nth-child(4)::before {
        background: #059669;
      }

      .consolidado article:nth-child(7)::before {
        background: #2563eb;
      }

      .consolidado span,
      .consolidado strong,
      .consolidado small {
        display: block;
      }

      .consolidado span {
        max-width: 20ch;
        color: #334155;
        font-size: 15px;
        font-weight: 800;
        line-height: 1.3;
      }

      .consolidado strong {
        font-size: clamp(21px, 1.55vw, 26px);
        font-weight: 900;
        line-height: 1.08;
        white-space: nowrap;
      }

      .consolidado small {
        color: #64748b;
        font-size: 12px;
        font-weight: 700;
        line-height: 1.35;
      }

      .branch-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 14px;
        align-items: start;
      }

      .branch-panel {
        padding: 18px;
      }

      .branch-head {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 16px;
        padding-bottom: 14px;
        border-bottom: 1px solid #e5e7eb;
      }

      .branch-head .panel-actions > strong {
        font-size: 22px;
        font-weight: 900;
        color: #047857;
        white-space: nowrap;
      }

      .metrics {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 10px;
        margin-top: 14px;
      }

      .metrics div,
      .result-row div {
        background: #f8fafc;
        border: 1px solid #e2e8f0;
        border-radius: 10px;
        padding: 12px;
        min-width: 0;
      }

      .metrics strong,
      .metrics small {
        display: block;
        margin-top: 5px;
      }

      .metrics strong {
        font-size: 18px;
        font-weight: 900;
      }

      .metrics small {
        color: #64748b;
        font-size: 12px;
        font-weight: 700;
      }

      .result-row {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 10px;
        margin-top: 10px;
      }

      .result-row strong {
        display: block;
        margin-top: 6px;
        font-size: 20px;
        font-weight: 900;
        color: #047857;
      }

      .lists {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 14px;
        margin-top: 16px;
      }

      .lists > div {
        border-top: 1px solid #e5e7eb;
        padding-top: 12px;
        max-height: 320px;
        overflow-y: auto;
        padding-right: 6px;
      }

      .lists p {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 12px;
        padding: 7px 0;
        border-bottom: 1px solid #f1f5f9;
        color: #475569;
        font-size: 13px;
        font-weight: 700;
      }

      .lists p span {
        min-width: 0;
        overflow: visible;
        overflow-wrap: anywhere;
        white-space: normal;
      }

      .lists p strong {
        color: #111827;
        white-space: nowrap;
      }

      .flow-card {
        margin-bottom: 14px;
        padding: 20px;
        background: #ffffff;
        border: 1px solid #e5e7eb;
        border-radius: 12px;
        box-shadow: 0 12px 30px rgba(15, 23, 42, 0.04);
      }

      .branch-flow {
        margin: 14px 0 0;
        padding: 14px;
        border-color: #e2e8f0;
      }

      .flow-head {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 16px;
        padding-bottom: 12px;
        border-bottom: 1px solid #e5e7eb;
      }

      .flow-head span,
      .flow-results span {
        color: #64748b;
        font-size: 11px;
        font-weight: 800;
        letter-spacing: 0.04em;
        text-transform: uppercase;
      }

      .flow-head h2,
      .flow-head h3 {
        margin-top: 4px;
        margin-bottom: 0;
      }

      .flow-head > strong,
      .flow-head .panel-actions > strong {
        font-size: 21px;
        font-weight: 900;
        white-space: nowrap;
      }

      .flow-columns {
        display: grid;
        grid-template-columns: repeat(2, minmax(280px, 1fr));
        gap: 12px;
        margin-top: 14px;
      }

      .localized-section {
        margin-top: 12px;
      }

      .flow-section {
        min-width: 0;
        padding: 12px;
        background: #f8fafc;
        border: 1px solid #e2e8f0;
        border-radius: 10px;
      }

      .flow-section h3 {
        color: #475569;
        font-size: 11px;
        letter-spacing: 0.04em;
        text-transform: uppercase;
      }

      .flow-line {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 16px;
        padding: 10px 0;
        border-bottom: 1px solid #e2e8f0;
        color: #334155;
      }

      .flow-line:last-child {
        border-bottom: 0;
        padding-bottom: 0;
      }

      .flow-line > span {
        flex: 1 1 160px;
        min-width: 0;
      }

      .flow-line > span strong,
      .flow-line > span small {
        display: block;
        min-width: 0;
        overflow: visible;
        overflow-wrap: anywhere;
        white-space: normal;
      }

      .flow-line > span strong {
        color: #111827;
        font-size: 13px;
        font-weight: 800;
      }

      .flow-line > span small {
        margin-top: 2px;
        color: #64748b;
        font-size: 12px;
        font-weight: 700;
      }

      .flow-line b {
        flex: 0 0 min(42%, 170px);
        text-align: right;
        white-space: nowrap;
        font-size: 14px;
        font-weight: 900;
      }

      .flow-line.muted b {
        color: #64748b;
      }

      .flow-results {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 12px;
        margin-top: 12px;
      }

      .flow-results div {
        padding: 12px;
        background: #f8fafc;
        border: 1px solid #e2e8f0;
        border-radius: 10px;
      }

      .flow-results strong,
      .flow-results small {
        display: block;
      }

      .flow-results strong {
        margin-top: 6px;
        font-size: clamp(18px, 1.6vw, 23px);
        font-weight: 900;
        line-height: 1.1;
        overflow-wrap: anywhere;
      }

      .flow-results small {
        margin-top: 3px;
        color: #64748b;
        font-size: 12px;
        font-weight: 700;
      }

      .empty {
        color: #94a3b8 !important;
      }

      .negative {
        color: #b91c1c !important;
      }

      .positive {
        color: #047857 !important;
      }

      .state {
        padding: 28px;
        color: #64748b;
        text-align: center;
        font-weight: 700;
      }

      .state.error {
        color: #b91c1c;
        background: #fef2f2;
        border-color: #fecaca;
      }

      @media (max-width: 1100px) {
        .consolidado,
        .branch-grid {
          grid-template-columns: 1fr;
        }

        .flow-columns {
          grid-template-columns: 1fr;
        }
      }

      @media (max-width: 720px) {
        .page {
          padding: 16px;
        }

        .page-header,
        .filters {
          flex-direction: column;
          align-items: stretch;
        }

        input,
        .primary-btn,
        .secondary-btn {
          width: 100%;
        }

        .metrics,
        .result-row,
        .lists,
        .flow-results {
          grid-template-columns: 1fr;
        }

        .flow-head {
          flex-direction: column;
        }

        .panel-actions {
          justify-content: flex-start;
        }

        .trend-head,
        .trend-summary {
          grid-template-columns: 1fr;
        }

        .trend-head {
          flex-direction: column;
        }

        .flow-line {
          flex-direction: column;
          gap: 4px;
        }

        .flow-line b {
          flex-basis: auto;
          text-align: left;
          white-space: normal;
        }

        .consolidado strong {
          white-space: normal;
        }
      }
    `,
  ],
})
export class BalancetePrivadoComponent implements OnInit {
  loading = signal(false);
  error = signal("");
  data = signal<BalancetePrivadoData | null>(null);
  collapsedPanels = signal<Record<string, boolean>>({});

  dataInicio = "";
  dataFim = "";

  locaisOrdenados = computed(() => {
    const locais = this.data()?.locais ?? [];
    return [...locais].sort((a, b) => this.localOrder(a) - this.localOrder(b));
  });
  grafico = computed(() =>
    this.buildTrendChart(this.data()?.serie_diaria ?? []),
  );

  constructor(
    private api: ApiService,
    private auth: AuthService,
  ) {}

  ngOnInit(): void {
    this.setPeriodoMes(false);
    if (this.canAccess()) {
      this.load();
    }
  }

  canAccess(): boolean {
    const user = this.auth.currentUser();
    const ident = `${user?.login ?? ""} ${user?.nome ?? ""}`.toLowerCase();
    return (
      user?.tipo === "admin" &&
      (ident.includes("douglas") || user?.login === "admin")
    );
  }

  isCollapsed(id: string): boolean {
    return !!this.collapsedPanels()[id];
  }

  togglePanel(id: string): void {
    this.collapsedPanels.update((current) => ({
      ...current,
      [id]: !current[id],
    }));
  }

  panelId(prefix: string, value: string | number | null | undefined): string {
    const normalized = String(value ?? "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");
    return `${prefix}-${normalized || "geral"}`;
  }

  load(): void {
    if (!this.canAccess()) return;
    this.loading.set(true);
    this.error.set("");
    this.api
      .getBalancetePrivado({
        data_inicio: this.dataInicio,
        data_fim: this.dataFim,
      })
      .subscribe({
        next: (resp) => {
          this.data.set(resp);
          this.loading.set(false);
        },
        error: (err) => {
          this.data.set(null);
          this.error.set(err?.error?.message || "Erro ao carregar balancete.");
          this.loading.set(false);
        },
      });
  }

  setPeriodoMes(load = true): void {
    const now = new Date();
    this.dataInicio = this.toIsoDate(
      new Date(now.getFullYear(), now.getMonth(), 1),
    );
    this.dataFim = this.toIsoDate(now);
    if (load) this.load();
  }

  setPeriodoHoje(): void {
    const today = this.toIsoDate(new Date());
    this.dataInicio = today;
    this.dataFim = today;
    this.load();
  }

  money(value: number | null | undefined): string {
    return Number(value ?? 0).toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  signedMoney(value: number | null | undefined): string {
    const n = Number(value ?? 0);
    return `${n > 0 ? "+" : ""}${this.money(n)}`;
  }

  compactMoney(value: number | null | undefined): string {
    const n = Number(value ?? 0);
    if (Math.abs(n) >= 1000000) {
      return `${(n / 1000000).toLocaleString("pt-BR", {
        maximumFractionDigits: 1,
      })} mi`;
    }
    if (Math.abs(n) >= 1000) {
      return `${(n / 1000).toLocaleString("pt-BR", {
        maximumFractionDigits: 0,
      })} mil`;
    }
    return n.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
  }

  valueClass(value: number | null | undefined): "positive" | "negative" | "" {
    const n = Number(value ?? 0);
    if (n > 0) return "positive";
    if (n < 0) return "negative";
    return "";
  }

  movimento(
    item: Partial<BalanceteLocal>,
    campo: keyof BalanceteMovimentoFinanceiro,
  ): number {
    const valor = item.movimento_financeiro?.[campo];
    if (valor !== undefined && valor !== null) return Number(valor);

    switch (campo) {
      case "comprado":
        return -Number(item.compras?.valor ?? 0);
      case "vendido_pendente":
        return Number(item.pendentes?.valor ?? 0);
      case "recebido":
        return Number(item.recebidos?.valor ?? 0);
      case "despesas":
        return -Number(item.despesas?.valor ?? 0);
      case "saldo_competencia":
        return Number(item.resultado_competencia ?? 0);
      case "saldo_caixa":
        return Number(item.resultado_caixa ?? 0);
    }
  }

  saldoAReceber(item: Partial<BalanceteLocal>): number {
    return Number(item.saldo_a_receber ?? item.pendentes?.valor ?? 0);
  }

  custoTransporte(item: Partial<BalanceteLocal>): number {
    return Number(item.compras?.custo_transporte ?? 0);
  }

  compraSemTransporte(item: Partial<BalanceteLocal>): number {
    const compra = Number(item.compras?.valor ?? 0);
    const transporte = this.custoTransporte(item);
    return Math.max(0, compra - transporte);
  }

  fluxoEntradas(item: Partial<BalanceteLocal>): BalanceteFlowRow[] {
    return [
      {
        label: "Recebido em baixas",
        value: Number(item.recebidos?.valor ?? 0),
        detail: `${Number(item.recebidos?.registros ?? 0)} baixa(s)`,
      },
      {
        label: "Vendido pendente de pagamento",
        value: Number(item.pendentes?.valor ?? 0),
        detail: `${Number(item.pendentes?.registros ?? 0)} abastecimento(s) a receber`,
      },
      {
        label: "Total vendido",
        value: Number(item.vendas?.valor ?? 0),
        detail: `${this.litros(item.vendas?.litros)} no período`,
        muted: true,
      },
    ];
  }

  fluxoSaidas(item: Partial<BalanceteLocal>): BalanceteFlowRow[] {
    return [
      {
        label: "Compra de combustível",
        value: -this.compraSemTransporte(item),
        detail: `${this.litros(item.compras?.litros)} em notas, sem transporte`,
      },
      {
        label: "Transporte de combustível",
        value: -this.custoTransporte(item),
        detail: `${this.money(0.04)}/L incluído no custo final`,
      },
      {
        label: "Despesas avulsas",
        value: -Number(item.despesas?.valor ?? 0),
        detail: `${Number(item.despesas?.registros ?? 0)} lançamento(s)`,
      },
    ];
  }

  custosLocalizados(item: Partial<BalanceteLocal>): BalanceteFlowRow[] {
    const categorias = item.despesas?.categorias ?? [];
    return [
      {
        label: "Custo final de compra",
        value: -Number(item.compras?.valor ?? 0),
        detail: "combustível + transporte de combustível",
      },
      ...categorias.map((cat) => ({
        label: cat.categoria || "Sem categoria",
        value: -Number(cat.valor ?? 0),
        detail: "despesa avulsa",
      })),
    ];
  }

  private buildTrendChart(serie: BalanceteSerieDiariaPonto[]): TrendChartData {
    const width = 760;
    const height = 300;
    const left = 64;
    const right = 28;
    const top = 24;
    const bottom = 52;
    const plotWidth = width - left - right;
    const plotHeight = height - top - bottom;
    const baseline = top + plotHeight;
    const totalCustos = serie.reduce((sum, item) => sum + Number(item.custos ?? 0), 0);
    const totalVendas = serie.reduce((sum, item) => sum + Number(item.vendas ?? 0), 0);
    const maxValue = Math.max(
      1,
      ...serie.flatMap((item) => [Number(item.custos ?? 0), Number(item.vendas ?? 0)]),
    );
    const yMax = this.roundChartMax(maxValue);
    const hasData = serie.some(
      (item) => Number(item.custos ?? 0) > 0 || Number(item.vendas ?? 0) > 0,
    );

    const toX = (index: number) => {
      if (serie.length <= 1) return left + plotWidth / 2;
      return left + (plotWidth * index) / (serie.length - 1);
    };
    const toY = (value: number) =>
      baseline - (Math.max(0, value) / yMax) * plotHeight;

    const custosPoints = serie.map((item, index) => ({
      x: toX(index),
      y: toY(Number(item.custos ?? 0)),
      value: Number(item.custos ?? 0),
      label: item.label || this.dateLabel(item.data),
    }));
    const vendasPoints = serie.map((item, index) => ({
      x: toX(index),
      y: toY(Number(item.vendas ?? 0)),
      value: Number(item.vendas ?? 0),
      label: item.label || this.dateLabel(item.data),
    }));

    const yLabels = [0, 0.25, 0.5, 0.75, 1].map((factor) => {
      const value = yMax * factor;
      return {
        x: left,
        y: toY(value),
        label: this.compactMoney(value),
        value,
      };
    });

    const xLabels = this.pickXAxisLabels(serie).map((item) => ({
      x: toX(item.index),
      label: item.label,
    }));

    return {
      hasData,
      yMax,
      custosPoints,
      vendasPoints,
      custosPath: this.linePath(custosPoints),
      vendasPath: this.linePath(vendasPoints),
      custosArea: this.areaPath(custosPoints, baseline),
      vendasArea: this.areaPath(vendasPoints, baseline),
      yLabels,
      xLabels,
      totalCustos,
      totalVendas,
    };
  }

  private pickXAxisLabels(
    serie: BalanceteSerieDiariaPonto[],
  ): Array<{ index: number; label: string }> {
    if (serie.length <= 8) {
      return serie.map((item, index) => ({
        index,
        label: item.label || this.dateLabel(item.data),
      }));
    }
    const selected = new Map<number, string>();
    const count = Math.min(6, serie.length);
    for (let i = 0; i < count; i++) {
      const index = Math.round((i * (serie.length - 1)) / (count - 1));
      selected.set(
        index,
        serie[index].label || this.dateLabel(serie[index].data),
      );
    }
    return [...selected.entries()].map(([index, label]) => ({ index, label }));
  }

  private linePath(points: ChartPoint[]): string {
    if (!points.length) return "";
    return points
      .map(
        (point, index) =>
          `${index === 0 ? "M" : "L"} ${point.x.toFixed(2)} ${point.y.toFixed(
            2,
          )}`,
      )
      .join(" ");
  }

  private areaPath(points: ChartPoint[], baseline: number): string {
    if (!points.length) return "";
    const line = this.linePath(points);
    const first = points[0];
    const last = points[points.length - 1];
    return `${line} L ${last.x.toFixed(2)} ${baseline.toFixed(2)} L ${first.x.toFixed(2)} ${baseline.toFixed(2)} Z`;
  }

  private roundChartMax(value: number): number {
    if (value <= 0) return 1;
    const magnitude = Math.pow(10, Math.floor(Math.log10(value)));
    return Math.ceil(value / magnitude) * magnitude;
  }

  private dateLabel(value: string): string {
    if (!value) return "";
    const [year, month, day] = value.slice(0, 10).split("-");
    if (!year || !month || !day) return value;
    return `${day}/${month}`;
  }

  litros(value: number | null | undefined): string {
    return `${Number(value ?? 0).toLocaleString("pt-BR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })} L`;
  }

  private toIsoDate(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  private localOrder(item: BalanceteLocal): number {
    if (item.local === "Matriz") return 0;
    if (item.local === "Viana") return 1;
    return 2;
  }
}
