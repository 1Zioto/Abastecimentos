import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { ApiService } from '../../core/services/api.service';
import { Abastecimento, DashboardData } from '../../shared/models';

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
        @if (inconsistencias().length > 0) {
          <section class="inconsistency-log">
            <div class="inconsistency-main">
              <span class="inconsistency-icon">⚑</span>
              <div>
                <h3>Log de inconsistências</h3>
                <p>{{ inconsistencias().length }} abastecimento(s) aguardando conferência</p>
              </div>
            </div>
            <button type="button" class="inconsistency-btn" [disabled]="loadingInconsistencias()" (click)="openInconsistenciasModal()">
              {{ loadingInconsistencias() ? 'Carregando...' : 'Acessar log' }}
            </button>
          </section>
        }

        @if (alertaEmAberto(d).length > 0) {
          <section class="aberto-alert">
            <div class="aberto-alert-header">
              <span class="aberto-alert-icon">💸</span>
              <div>
                <h3>Valores em aberto há mais de 30 dias</h3>
                <p>{{ alertaEmAberto(d).length }} cliente(s) · total
                  <strong>{{ totalEmAberto(d) | currency:'BRL':'symbol':'1.2-2' }}</strong>
                </p>
              </div>
              <button type="button" class="aberto-toggle" (click)="showAbertoList.set(!showAbertoList())">
                {{ showAbertoList() ? 'Ocultar' : 'Ver clientes' }}
              </button>
            </div>
            @if (showAbertoList()) {
              <div class="aberto-list">
                @for (c of alertaEmAberto(d); track c.id_proprietario) {
                  <div class="aberto-item">
                    <span class="aberto-nome">{{ c.nome_proprietario }}</span>
                    <span class="aberto-meta">{{ c.total }} abast. · mais antigo há {{ c.dias_mais_antigo }} dias ({{ c.mais_antigo | date:'dd/MM/yyyy' }})</span>
                    <span class="aberto-valor">{{ c.valor | currency:'BRL':'symbol':'1.2-2' }}</span>
                  </div>
                }
              </div>
            }
          </section>
        }

        <section class="kpi-board">
          <div class="kpi-group group-period">
            <div class="kpi-group-title">
              <span>Período</span>
              <small>{{ selectedMesRef() ? mesLabelSelecionado(d) : 'Últimos 12 meses' }}</small>
            </div>
            <div class="kpi-grid kpi-grid-two">
              <article class="kpi-card">
                <div class="kpi-icon icon-buy">🧾</div>
                <div class="kpi-content">
                  <span class="kpi-value">{{ kpiValorComprado(d) | currency:'BRL':'symbol':'1.2-2' }}</span>
                  <span class="kpi-label">Custo Final Comprado</span>
                </div>
              </article>

              <article class="kpi-card">
                <div class="kpi-icon icon-success">💰</div>
                <div class="kpi-content">
                  <span class="kpi-value">{{ kpiValorVendido(d) | currency:'BRL':'symbol':'1.2-2' }}</span>
                  <span class="kpi-label">Valor Total Vendido</span>
                </div>
              </article>

              <article class="kpi-card">
                <div class="kpi-icon icon-buy">🛢️</div>
                <div class="kpi-content">
                  <span class="kpi-value">{{ kpiLitrosComprado(d) | number:'1.2-2' }} L</span>
                  <span class="kpi-label">Quantidade Total Comprada</span>
                </div>
              </article>

              <article class="kpi-card">
                <div class="kpi-icon icon-success">⛽</div>
                <div class="kpi-content">
                  <span class="kpi-value">{{ kpiLitrosVendido(d) | number:'1.2-2' }} L</span>
                  <span class="kpi-label">Quantidade Total Vendida</span>
                </div>
              </article>
            </div>
          </div>

          <div class="kpi-group group-today">
            <div class="kpi-group-title">
              <span>Hoje</span>
              <small>Operação do dia</small>
            </div>
            <div class="kpi-grid kpi-grid-two">
              <article class="kpi-card">
                <div class="kpi-icon icon-success">💰</div>
                <div class="kpi-content">
                  <span class="kpi-value">{{ kpiValorVendidoHoje(d) | currency:'BRL':'symbol':'1.2-2' }}</span>
                  <span class="kpi-label">Valor Vendido Hoje</span>
                </div>
              </article>

              <article class="kpi-card">
                <div class="kpi-icon icon-liters">⛽</div>
                <div class="kpi-content">
                  <span class="kpi-value">{{ kpiLitrosVendidosHoje(d) | number:'1.2-2' }} L</span>
                  <span class="kpi-label">Litros Vendidos Hoje</span>
                </div>
              </article>
            </div>
          </div>

          <div class="kpi-group group-balance">
            <div class="kpi-group-title">
              <span>Baixas e Tanque</span>
              <small>Recebimento e estoque</small>
            </div>
            <div class="kpi-grid kpi-grid-three">
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

              <article class="kpi-card tank-kpi">
                <div class="kpi-icon icon-tank">⛽</div>
                <div class="kpi-content">
                  <span class="kpi-value">{{ kpiCombustivelTanque(d) | number:'1.2-2' }} L</span>
                  <span class="kpi-label">Combustível no Tanque</span>
                  <span class="kpi-detail">
                    Comprado {{ kpiCombustivelComprado(d) | number:'1.2-2' }} L − Abastecido {{ kpiCombustivelVendido(d) | number:'1.2-2' }} L
                  </span>
                </div>
                <div class="mini-tank" [style.--tank-level]="dashboardTankLevel(d) + '%'" aria-hidden="true">
                  <div class="mini-liquid"></div>
                  <div class="mini-line"></div>
                </div>
              </article>
            </div>
          </div>
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
                  <span class="filter-chip">Baixa: {{ selectedStatus() }}</span>
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
              <h3>Baixa: Pendente x Pago</h3>
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
              <h3>Últimos 12 meses — Custo Final x Vendido (R$)</h3>
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
              <span><i class="legend-dot comprado"></i> Comprado com transporte (R$)</span>
              <span><i class="legend-dot vendido"></i> Vendido (R$)</span>
            </div>
          </article>

          <article class="panel donut-panel">
            <div class="panel-header">
              <h3>Últimos 12 meses — Baixa Pendente x Pago (R$)</h3>
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

      @if (showInconsistenciasModal()) {
        <div class="modal-overlay" (click)="closeInconsistenciasModal()">
          <div class="modal inconsistency-modal" (click)="$event.stopPropagation()">
            <div class="modal-head">
              <div>
                <h3>Abastecimentos inconsistentes</h3>
                <p>{{ inconsistencias().length }} registro(s) pendente(s) de conferência</p>
              </div>
              <button type="button" class="modal-close" (click)="closeInconsistenciasModal()">×</button>
            </div>

            @if (inconsistencias().length > 0) {
              <div class="inconsistency-list">
                @for (item of inconsistencias(); track item.id_abastecimento) {
                  <article class="inconsistency-item">
                    <div class="inconsistency-title">
                      <strong>{{ item.veiculo?.placa || item.id_veiculo || '—' }}</strong>
                      <span class="status-flag">Inconsistente</span>
                    </div>
                    <div class="inconsistency-meta">
                      <span>{{ item.data | date:'dd/MM/yyyy' }}</span>
                      <span>{{ item.quantidade_litros | number:'1.2-2' }} L</span>
                      <span>{{ item.valor_total | currency:'BRL':'symbol':'1.2-2' }}</span>
                    </div>
                    <div class="inconsistency-details">
                      <div>
                        <small>Proprietário</small>
                        <strong>{{ item.nome_proprietario || item.proprietario?.nome || '—' }}</strong>
                      </div>
                      <div>
                        <small>Motorista</small>
                        <strong>{{ item.nome_motorista || item.motorista?.nome || '—' }}</strong>
                      </div>
                      <div>
                        <small>Combustível</small>
                        <strong>{{ item.tipo_combustivel || '—' }}</strong>
                      </div>
                      <div>
                        <small>Local</small>
                        <strong>{{ item.local || '—' }}</strong>
                      </div>
                      <div>
                        <small>Odômetro</small>
                        <strong>{{ item.odometro ?? '—' }}</strong>
                      </div>
                    </div>

                    <div class="inconsistency-attachments">
                      @if (resolveImageUrl(item.foto_odometro); as fotoOdometroUrl) {
                        <button type="button" class="attachment-thumb" (click)="openImagePreview(fotoOdometroUrl)">
                          <img [src]="fotoOdometroUrl" alt="Foto do hodômetro">
                          <span>Hodômetro</span>
                        </button>
                      }
                      @if (resolveImageUrl(item.bomba); as bombaUrl) {
                        <button type="button" class="attachment-thumb" (click)="openImagePreview(bombaUrl)">
                          <img [src]="bombaUrl" alt="Imagem da bomba">
                          <span>Bomba</span>
                        </button>
                      }
                      @if (!resolveImageUrl(item.foto_odometro) && !resolveImageUrl(item.bomba)) {
                        <p>Sem imagem anexada.</p>
                      }
                    </div>

                    <div class="inconsistency-actions">
                      <button type="button" class="btn-secondary" (click)="editarAbastecimento(item)">
                        Editar abastecimento
                      </button>
                      <button type="button" class="btn-verified" (click)="marcarVerificado(item)">
                        Verificado
                      </button>
                    </div>
                  </article>
                }
              </div>
            } @else {
              <div class="empty-state table-empty">
                <span class="empty-icon">✓</span>
                <p>Nenhuma inconsistência pendente.</p>
              </div>
            }
          </div>
        </div>
      }

      @if (previewImageUrl()) {
        <div class="image-overlay" (click)="closeImagePreview()">
          <div class="image-modal" (click)="$event.stopPropagation()">
            <img [src]="previewImageUrl()" alt="Imagem ampliada">
            <button type="button" class="btn-close-image" (click)="closeImagePreview()">Fechar</button>
          </div>
        </div>
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
      gap: 10px;
      flex-wrap: wrap;
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

    .aberto-alert {
      background: #FEF2F2;
      border: 1px solid #FECACA;
      border-left: 5px solid #DC2626;
      border-radius: 14px;
      padding: 14px 16px;
      margin-bottom: 18px;
      box-shadow: 0 8px 22px rgba(15, 23, 42, 0.06);
    }
    .aberto-alert-header { display: flex; align-items: center; gap: 14px; }
    .aberto-alert-icon { font-size: 26px; }
    .aberto-alert-header h3 { margin: 0; font-size: 15px; color: #7F1D1D; }
    .aberto-alert-header p { margin: 3px 0 0; font-size: 12px; color: #991B1B; }
    .aberto-alert-header > div { flex: 1; }
    .aberto-toggle {
      background: #DC2626; border: none; color: #fff; border-radius: 8px;
      padding: 8px 14px; font-size: 12px; font-weight: 700; cursor: pointer; white-space: nowrap;
    }
    .aberto-toggle:hover { background: #B91C1C; }
    .aberto-list { margin-top: 12px; display: flex; flex-direction: column; gap: 6px; max-height: 320px; overflow: auto; }
    .aberto-item {
      display: flex; align-items: center; gap: 12px; flex-wrap: wrap;
      background: #fff; border: 1px solid #FECACA; border-radius: 10px; padding: 9px 12px;
    }
    .aberto-nome { font-weight: 700; color: #111827; font-size: 13px; flex: 1; min-width: 140px; }
    .aberto-meta { color: #6B7280; font-size: 11px; }
    .aberto-valor { color: #DC2626; font-weight: 800; font-size: 14px; margin-left: auto; }

    .inconsistency-log {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      background: #FFF7ED;
      border: 1px solid #FDBA74;
      border-left: 5px solid #F97316;
      border-radius: 14px;
      padding: 14px 16px;
      margin-bottom: 18px;
      box-shadow: 0 8px 22px rgba(15, 23, 42, 0.06);
    }

    .inconsistency-main {
      display: flex;
      align-items: center;
      gap: 12px;
      min-width: 0;
    }

    .inconsistency-icon {
      width: 42px;
      height: 42px;
      border-radius: 12px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      background: #FED7AA;
      color: #9A3412;
      font-size: 22px;
      font-weight: 800;
    }

    .inconsistency-log h3 {
      margin: 0;
      font-size: 15px;
      color: #9A3412;
    }

    .inconsistency-log p {
      margin: 3px 0 0;
      font-size: 12px;
      color: #C2410C;
    }

    .inconsistency-btn {
      border: 1px solid #FB923C;
      background: #F97316;
      color: #FFFFFF;
      border-radius: 10px;
      padding: 9px 14px;
      font-size: 12px;
      font-weight: 700;
      cursor: pointer;
      white-space: nowrap;
    }

    .inconsistency-btn:disabled {
      opacity: 0.55;
      cursor: not-allowed;
    }

    .modal-overlay {
      position: fixed;
      inset: 0;
      z-index: 1000;
      background: rgba(15, 23, 42, 0.58);
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }

    .modal {
      background: #FFFFFF;
      border-radius: 14px;
      width: min(760px, 100%);
      max-height: min(82vh, 760px);
      overflow: hidden;
      box-shadow: 0 24px 80px rgba(15, 23, 42, 0.24);
    }

    .modal-head {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 16px;
      padding: 18px 20px;
      border-bottom: 1px solid #E5E7EB;
    }

    .modal-head h3 {
      margin: 0;
      font-size: 18px;
      color: #111827;
    }

    .modal-head p {
      margin: 4px 0 0;
      color: #6B7280;
      font-size: 13px;
    }

    .modal-close {
      border: 0;
      background: #F3F4F6;
      color: #374151;
      width: 32px;
      height: 32px;
      border-radius: 8px;
      font-size: 22px;
      line-height: 1;
      cursor: pointer;
    }

    .inconsistency-list {
      max-height: 62vh;
      overflow: auto;
      padding: 12px;
      display: grid;
      gap: 10px;
    }

    .inconsistency-item {
      border: 1px solid #FED7AA;
      background: #FFF7ED;
      border-radius: 12px;
      padding: 12px;
    }

    .inconsistency-title {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      align-items: center;
    }

    .inconsistency-item strong {
      color: #9A3412;
      font-size: 14px;
    }

    .inconsistency-item span {
      color: #475569;
      font-size: 12px;
    }

    .status-flag {
      background: #FED7AA;
      border: 1px solid #FB923C;
      border-radius: 999px;
      color: #9A3412 !important;
      font-weight: 800;
      padding: 4px 8px;
      white-space: nowrap;
    }

    .inconsistency-meta {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-top: 8px;
    }

    .inconsistency-meta span {
      background: #FFFFFF;
      border: 1px solid #FDBA74;
      border-radius: 999px;
      padding: 4px 8px;
      color: #9A3412;
      font-weight: 700;
    }

    .inconsistency-item p {
      margin: 8px 0 0;
      font-size: 12px;
      color: #92400E;
    }

    .inconsistency-details {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 10px;
      margin-top: 12px;
      padding: 12px;
      background: #FFFFFF;
      border: 1px solid #FED7AA;
      border-radius: 10px;
    }

    .inconsistency-details div {
      min-width: 0;
    }

    .inconsistency-details small {
      display: block;
      color: #92400E;
      font-size: 10px;
      font-weight: 800;
      text-transform: uppercase;
      margin-bottom: 3px;
    }

    .inconsistency-details strong {
      display: block;
      color: #111827;
      font-size: 12px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .inconsistency-attachments {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      margin-top: 12px;
    }

    .attachment-thumb {
      width: 116px;
      border: 0;
      padding: 0;
      background: transparent;
      text-align: left;
      cursor: pointer;
      color: #111827;
    }

    .attachment-thumb img {
      width: 116px;
      height: 82px;
      display: block;
      border-radius: 10px;
      object-fit: cover;
      border: 1px solid #FDBA74;
      background: #FFFFFF;
    }

    .attachment-thumb span {
      display: block;
      margin-top: 5px;
      color: #9A3412;
      font-size: 12px;
      font-weight: 800;
    }

    .attachment-thumb:hover img {
      border-color: #F97316;
      box-shadow: 0 8px 18px rgba(249, 115, 22, 0.22);
    }

    .image-overlay {
      position: fixed;
      inset: 0;
      z-index: 1200;
      background: rgba(2, 6, 23, 0.88);
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }

    .image-modal {
      max-width: min(94vw, 1100px);
      max-height: 92vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 12px;
    }

    .image-modal img {
      max-width: 100%;
      max-height: calc(92vh - 58px);
      object-fit: contain;
      border-radius: 12px;
      background: #020617;
      border: 1px solid #334155;
    }

    .btn-close-image {
      border: 1px solid #CBD5E1;
      background: #FFFFFF;
      color: #111827;
      border-radius: 10px;
      padding: 9px 16px;
      font-size: 13px;
      font-weight: 800;
      cursor: pointer;
    }

    .inconsistency-actions {
      display: flex;
      justify-content: flex-end;
      gap: 10px;
      margin-top: 12px;
      flex-wrap: wrap;
    }

    .btn-secondary,
    .btn-verified {
      border-radius: 10px;
      padding: 9px 12px;
      font-size: 12px;
      font-weight: 800;
      cursor: pointer;
    }

    .btn-secondary {
      border: 1px solid #CBD5E1;
      background: #FFFFFF;
      color: #111827;
    }

    .btn-verified {
      border: 1px solid #16A34A;
      background: #DCFCE7;
      color: #14532D;
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

    .kpi-board {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 16px;
      margin-bottom: 18px;
    }

    .kpi-group {
      background: #F8FAFC;
      border: 1px solid #E5E7EB;
      border-radius: 16px;
      padding: 12px;
      min-width: 0;
    }

    .group-balance {
      grid-column: 1 / -1;
    }

    .kpi-group-title {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 10px;
      margin: 0 2px 10px;
    }

    .kpi-group-title span {
      color: #111827;
      font-size: 13px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.4px;
    }

    .kpi-group-title small {
      color: #64748B;
      font-size: 11px;
      font-weight: 600;
    }

    .kpi-grid {
      display: grid;
      gap: 12px;
    }

    .kpi-grid-two {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .kpi-grid-three {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }

    .kpi-card {
      background: #FFFFFF;
      border: 1px solid #E5E7EB;
      border-radius: 14px;
      padding: 18px;
      display: flex;
      align-items: center;
      gap: 12px;
      box-shadow: 0 4px 20px rgba(15, 23, 42, 0.04);
      transition: transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease;
    }

    .kpi-card:hover {
      transform: translateY(-3px);
      box-shadow: 0 10px 25px rgba(37, 99, 235, 0.08);
      border-color: rgba(37, 99, 235, 0.25);
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
      box-shadow: 0 4px 10px rgba(0, 0, 0, 0.03);
    }

    .icon-primary { background: linear-gradient(135deg, #fef3c7, #fde68a); color: #92400e; }
    .icon-success { background: linear-gradient(135deg, #dcfce7, #bbf7d0); color: #15803d; }
    .icon-info { background: linear-gradient(135deg, #fee2e2, #fecaca); color: #991b1b; }
    .icon-pending { background: linear-gradient(135deg, #dbeafe, #bfdbfe); color: #1d4ed8; }
    .icon-liters { background: linear-gradient(135deg, #e0f2fe, #bae6fd); color: #0369a1; }
    .icon-tank { background: linear-gradient(135deg, #e0f2fe, #bae6fd); color: #0369a1; }
    .icon-buy { background: linear-gradient(135deg, #ffedd5, #fed7aa); color: #c2410c; }

    .tank-kpi {
      align-items: center;
    }

    .tank-kpi .kpi-content {
      flex: 1;
    }

    .mini-tank {
      position: relative;
      width: 74px;
      height: 74px;
      flex: 0 0 74px;
      overflow: hidden;
      border: 7px solid #A7B5AE;
      border-radius: 50%;
      background:
        radial-gradient(circle at 34% 24%, rgba(255, 255, 255, 0.7), transparent 36%),
        linear-gradient(120deg, #DDE5E0, #9CA8A2);
      box-shadow: inset -8px -7px 14px rgba(15, 23, 42, 0.16);
    }

    .mini-liquid {
      position: absolute;
      left: -4%;
      right: -4%;
      bottom: 0;
      height: var(--tank-level);
      background: linear-gradient(180deg, #F8CD63, #C9770D);
      border-top: 2px solid #F8DD85;
      transition: height 0.2s ease;
    }

    .mini-liquid::before {
      content: "";
      position: absolute;
      width: 140px;
      height: 140px;
      background: rgba(255, 255, 255, 0.35);
      top: -132px;
      left: 50%;
      margin-left: -70px;
      border-radius: 43%;
      animation: wave-rot 6s infinite linear;
      pointer-events: none;
      z-index: 1;
    }

    .mini-liquid::after {
      content: "";
      position: absolute;
      width: 144px;
      height: 144px;
      background: rgba(254, 243, 199, 0.15);
      top: -134px;
      left: 50%;
      margin-left: -72px;
      border-radius: 40%;
      animation: wave-rot 10s infinite linear;
      pointer-events: none;
      z-index: 1;
    }

    @keyframes wave-rot {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }

    .mini-line {
      position: absolute;
      left: 0;
      right: 0;
      top: 50%;
      height: 1px;
      background: rgba(68, 85, 78, 0.2);
    }

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

    .kpi-detail {
      color: #64748B;
      font-size: 11px;
      line-height: 1.3;
    }

    .kpi-label {
      font-size: 12px;
      color: #6B7280;
      text-transform: uppercase;
      letter-spacing: 0.4px;
    }

    .charts-grid {
      display: grid;
      grid-template-columns: minmax(0, 2.15fr) minmax(280px, 0.85fr);
      gap: 18px;
      margin-bottom: 20px;
      align-items: stretch;
    }

    .panel {
      background: #FFFFFF;
      border: 1px solid #E5E7EB;
      border-radius: 14px;
      box-shadow: 0 4px 14px rgba(0, 0, 0, 0.05);
      padding: 16px;
      transition: box-shadow 0.2s ease;
      min-width: 0;
    }

    .panel:hover {
      box-shadow: 0 8px 20px rgba(0, 0, 0, 0.07);
    }

    .panel-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 12px;
      gap: 12px;
    }

    .panel-header h3 {
      margin: 0;
      font-size: 16px;
      line-height: 1.25;
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
      height: 320px;
      border-radius: 12px;
      background: #F8FAFC;
      border: 1px solid #E5E7EB;
      padding: 24px 12px 12px;
      overflow: hidden;
    }

    .bar-chart-grid {
      position: absolute;
      inset: 24px 12px 38px;
      background-image: linear-gradient(to top, #E5E7EB 1px, transparent 1px);
      background-size: 100% 25%;
      opacity: 0.65;
      pointer-events: none;
    }

    .bar-groups {
      position: relative;
      z-index: 1;
      height: 100%;
      display: grid;
      grid-template-columns: repeat(12, minmax(0, 1fr));
      gap: 8px;
      align-items: end;
    }

    .bar-group {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: flex-end;
      gap: 8px;
      min-width: 0;
      cursor: pointer;
      border-radius: 8px;
      transition: background 0.2s ease;
      padding: 6px 2px 4px;
    }

    .bar-group:hover {
      background: #EEF2FF;
    }

    .bar-group.active {
      background: #DBEAFE;
    }

    .bars {
      height: 252px;
      width: 100%;
      display: flex;
      align-items: flex-end;
      justify-content: center;
      gap: 5px;
    }

    .bar {
      width: min(42%, 18px);
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

    .bar-comprado { background: linear-gradient(180deg, #3b82f6, #2563eb); }
    .bar-vendido { background: linear-gradient(180deg, #4ade80, #22c55e); }
    .bar-pendente { background: linear-gradient(180deg, #fbbf24, #d97706); }
    .bar-pago { background: linear-gradient(180deg, #4ade80, #16a34a); }

    .bar-value {
      position: absolute;
      top: -28px;
      left: 50%;
      transform: translateX(-50%) translateY(4px);
      background: #111827;
      color: #FFFFFF;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0;
      white-space: nowrap;
      pointer-events: none;
      border-radius: 6px;
      padding: 3px 6px;
      opacity: 0;
      box-shadow: 0 8px 18px rgba(15, 23, 42, 0.18);
      transition: opacity 0.15s ease, transform 0.15s ease;
      z-index: 2;
    }

    .bar:hover .bar-value,
    .bar-group.active .bar-value {
      opacity: 1;
      transform: translateX(-50%) translateY(0);
    }

    .bar-label {
      font-size: 11px;
      line-height: 1;
      color: #6B7280;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 100%;
    }

    .compare-legend {
      display: flex;
      gap: 12px;
      margin-top: 12px;
      color: #6B7280;
      font-size: 12px;
      flex-wrap: wrap;
      align-items: center;
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
      margin-bottom: 10px;
    }

    .active-filters { display:flex; align-items:center; gap:8px; flex-wrap:wrap; margin-bottom:10px; }
    .filter-chip { background:#EEF2FF; color:#1E3A8A; border:1px solid #C7D2FE; padding:4px 8px; border-radius:999px; font-size:11px; font-weight:600; }
    .btn-clear-filters { border:1px solid #E5E7EB; background:#FFFFFF; color:#374151; border-radius:8px; padding:4px 10px; font-size:11px; cursor:pointer; }
    .btn-clear-filters:hover { background:#F9FAFB; }

    .donut-svg { width: min(210px, 100%); height: auto; aspect-ratio: 1; }
    .donut-slice { cursor: pointer; transition: opacity 0.2s ease, transform 0.2s ease; }
    .donut-slice:hover { opacity: 0.9; }
    .donut-slice.selected { opacity: 1; stroke:#111827; stroke-width:2; }
    .donut-center-value { font-size: 17px; font-weight: 700; fill:#111827; }
    .donut-center-sub { font-size: 13px; fill:#9CA3AF; }

    .fuel-legend {
      display: flex;
      flex-direction: column;
      gap: 6px;
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
      font-size: 11px;
      white-space: nowrap;
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
      gap: 12px;
      color: #9CA3AF;
      text-align: center;
      border: 1px dashed #D1D5DB;
      border-radius: 16px;
      background: #F9FAFB;
      transition: border-color 0.2s ease, background-color 0.2s ease;
      padding: 20px;
    }
    .empty-state:hover {
      border-color: #93C5FD;
      background-color: #F8FAFC;
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
      font-size: 32px;
      filter: grayscale(0.2);
      animation: pulse-icon 2.5s infinite ease-in-out;
      line-height: 1;
    }
    @keyframes pulse-icon {
      0%, 100% { transform: scale(1); opacity: 0.8; }
      50% { transform: scale(1.15); opacity: 1; }
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
      .kpi-board { grid-template-columns: 1fr; }
      .kpi-grid-three { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .charts-grid { grid-template-columns: 1fr; }
      .bar-chart-wrap { height: 300px; }
      .bars { height: 234px; }
    }

    @media (max-width: 760px) {
      .dashboard-page { padding: 16px; }
      .dashboard-header { flex-direction: column; }
      .dashboard-actions { width: 100%; justify-content: flex-start; }
      .kpi-grid,
      .kpi-grid-two,
      .kpi-grid-three { grid-template-columns: 1fr; }
      .tank-kpi { grid-column: 1 / -1; }
      .header-filters { width: 100%; }
      .filter-select { flex: 1; min-width: 0; }
      .panel { padding: 14px; }
      .panel-header { align-items: flex-start; }
      .panel-header h3 { font-size: 14px; }
      .bar-chart-wrap {
        height: auto;
        min-height: 280px;
        overflow-x: auto;
        padding: 22px 10px 12px;
      }
      .bar-chart-grid {
        min-width: 680px;
        inset: 22px 10px 38px;
      }
      .bar-groups {
        min-width: 680px;
      }
      .bars { height: 218px; }
      .compare-legend { font-size: 11px; gap: 8px; }
    }
  `]
})
export class DashboardComponent implements OnInit, OnDestroy {
  private api = inject(ApiService);
  private router = inject(Router);
  private readonly onGaragemChanged = () => {
    this.clearChartFilters();
    this.load();
  };

  data = signal<DashboardData | null>(null);
  loading = signal(true);
  inconsistencias = signal<Abastecimento[]>([]);
  loadingInconsistencias = signal(false);
  showInconsistenciasModal = signal(false);
  showAbertoList = signal(false);

  alertaEmAberto(d: DashboardData): any[] {
    return (d as any)?.alerta_em_aberto_30_dias ?? [];
  }

  totalEmAberto(d: DashboardData): number {
    return this.alertaEmAberto(d).reduce((s, c) => s + Number(c?.valor ?? 0), 0);
  }

  previewImageUrl = signal('');
  selectedMesRef = signal<string | null>(null);
  selectedStatus = signal<'Pendente' | 'Pago' | null>(null);
  canInstallApp = signal(false);
  isStandalone = signal(false);
  private installPromptEvent: BeforeInstallPromptEvent | null = null;

  donutGradient = signal('conic-gradient(#CBD5F5 0% 100%)');

  readonly donutColors = ['#F59E0B', '#16A34A'];

  ngOnInit() {
    this.setupInstallPrompt();
    window.addEventListener('garagem:changed', this.onGaragemChanged);
    this.load();
  }

  ngOnDestroy() {
    window.removeEventListener('garagem:changed', this.onGaragemChanged);
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
    this.loadInconsistencias();
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

  loadInconsistencias() {
    this.loadingInconsistencias.set(true);
    this.api.getAbastecimentos({ status: 'Inconsistente', per_page: 50 }).subscribe({
      next: (resp) => {
        this.inconsistencias.set(resp.data ?? []);
        this.loadingInconsistencias.set(false);
      },
      error: () => {
        this.inconsistencias.set([]);
        this.loadingInconsistencias.set(false);
      }
    });
  }

  openInconsistenciasModal() {
    if (!this.inconsistencias().length) return;
    this.showInconsistenciasModal.set(true);
  }

  closeInconsistenciasModal() {
    this.showInconsistenciasModal.set(false);
  }

  openImagePreview(url?: string | null) {
    const imageUrl = this.resolveImageUrl(url);
    if (!imageUrl) return;
    this.previewImageUrl.set(imageUrl);
  }

  closeImagePreview() {
    this.previewImageUrl.set('');
  }

  resolveImageUrl(url?: string | null): string | null {
    return this.api.resolveImageUrl(url);
  }

  editarAbastecimento(item: Abastecimento) {
    if (!item.id_abastecimento) return;
    this.closeInconsistenciasModal();
    this.router.navigate(['/abastecimentos', item.id_abastecimento, 'editar']);
  }

  marcarVerificado(item: Abastecimento) {
    if (!item.id_abastecimento) return;
    this.api.verificarInconsistencia(item.id_abastecimento).subscribe({
      next: () => {
        this.inconsistencias.update(items =>
          items.filter(a => a.id_abastecimento !== item.id_abastecimento)
        );
        if (!this.inconsistencias().length) this.closeInconsistenciasModal();
      },
      error: () => {
        this.loadInconsistencias();
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

  kpiValorComprado(d: DashboardData): number {
    const selectedMes = this.selectedMesRef();
    if (selectedMes) {
      return (d?.comparativo_12_meses ?? [])
        .filter((item) => item.mes_ref === selectedMes)
        .reduce((sum, item) => sum + Number(item.comprado_valor ?? 0), 0);
    }

    const totalApi = Number(d?.totais?.valor_total_comprado ?? 0);
    if (totalApi > 0) return totalApi;

    return (d?.comparativo_12_meses ?? []).reduce((sum, item) => sum + Number(item.comprado_valor ?? 0), 0);
  }

  kpiLitrosComprado(d: DashboardData): number {
    const selectedMes = this.selectedMesRef();
    if (selectedMes) {
      return (d?.comparativo_12_meses ?? [])
        .filter((item) => item.mes_ref === selectedMes)
        .reduce((sum, item) => sum + this.getCompradoLitros(item), 0);
    }

    const totalApi = Number(d?.totais?.combustivel_comprado_litros ?? 0);
    if (totalApi > 0) return totalApi;

    return (d?.comparativo_12_meses ?? []).reduce((sum, item) => sum + this.getCompradoLitros(item), 0);
  }

  kpiLitrosVendido(d: DashboardData): number {
    const selectedMes = this.selectedMesRef();
    if (selectedMes) {
      return (d?.comparativo_12_meses ?? [])
        .filter((item) => item.mes_ref === selectedMes)
        .reduce((sum, item) => sum + this.getVendidoLitros(item), 0);
    }

    const totalApi = Number(d?.totais?.combustivel_vendido_litros ?? d?.totais?.litros ?? 0);
    if (totalApi > 0) return totalApi;

    return (d?.comparativo_12_meses ?? []).reduce((sum, item) => sum + this.getVendidoLitros(item), 0);
  }

  kpiValorVendidoHoje(d: DashboardData): number {
    return Number(d?.totais?.valor_vendido_hoje ?? 0);
  }

  kpiLitrosVendidosHoje(d: DashboardData): number {
    return Number(d?.totais?.litros_vendidos_hoje ?? 0);
  }

  kpiValorPendente(d: DashboardData): number {
    return this.getFilteredTotals(d).pendente;
  }

  kpiValorRecebido(d: DashboardData): number {
    return this.getFilteredTotals(d).recebido;
  }

  kpiCombustivelTanque(d: DashboardData): number {
    return Number(d?.totais?.combustivel_tanque_litros ?? 0);
  }

  kpiCombustivelComprado(d: DashboardData): number {
    return Number(d?.totais?.combustivel_comprado_litros ?? 0);
  }

  kpiCombustivelVendido(d: DashboardData): number {
    return Number(d?.totais?.combustivel_vendido_litros ?? d?.totais?.litros ?? 0);
  }

  dashboardTankLevel(d: DashboardData): number {
    const atual = Math.max(0, this.kpiCombustivelTanque(d));
    const capacidade = Math.max(15000, Math.ceil(Math.max(atual, 1) / 1000) * 1000);
    return Math.max(0, Math.min(100, (atual / capacidade) * 100));
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
        valor_total_comprado: Number(raw?.totais?.valor_total_comprado ?? 0),
        valor_total_vendido: Number(raw?.totais?.valor_total_vendido ?? raw?.totais?.valor ?? 0),
        valor_total_pendente_baixa: Number(raw?.totais?.valor_total_pendente_baixa ?? 0),
        valor_total_recebido: Number(raw?.totais?.valor_total_recebido ?? 0),
        litros_vendidos_hoje: Number(raw?.totais?.litros_vendidos_hoje ?? 0),
        valor_vendido_hoje: Number(raw?.totais?.valor_vendido_hoje ?? 0),
        combustivel_comprado_litros: Number(raw?.totais?.combustivel_comprado_litros ?? 0),
        combustivel_vendido_litros: Number(raw?.totais?.combustivel_vendido_litros ?? raw?.totais?.litros ?? 0),
        combustivel_tanque_litros: Number(raw?.totais?.combustivel_tanque_litros ?? 0),
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
