// src/app/features/relatorio-faturamento/relatorio-faturamento.component.ts
import { Component, OnInit, ElementRef, ViewChild, AfterViewInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';
import { ToastrService } from 'ngx-toastr';

interface ResumoMensalItem {
  mes: string;
  total_abastecimentos: number;
  litros: number;
  valor_total: number;
  preco_medio: number;
  ticket_medio: number;
  valor_recebido: number;
  valor_pendente: number;
}

interface FilialResumoItem {
  mes: string;
  local: string;
  total_abastecimentos: number;
  litros: number;
  valor_total: number;
  preco_medio: number;
  valor_recebido: number;
  valor_pendente: number;
}

interface SegmentoResumoItem {
  mes: string;
  segmento: string;
  total_abastecimentos: number;
  litros: number;
  valor_total: number;
  preco_medio: number;
  valor_recebido: number;
  valor_pendente: number;
}

interface TopProprietarioItem {
  proprietario: string;
  total_abastecimentos: number;
  litros: number;
  valor_total: number;
  valor_recebido: number;
  valor_pendente: number;
}

@Component({
  selector: 'app-relatorio-faturamento',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="page">
      <!-- Cabeçalho -->
      <div class="page-header">
        <div class="header-left">
          <h1>Relatório de Faturamento Mensal</h1>
          <p>Visão gerencial consolidada e detalhada de vendas, volume em litros e fluxo de recebimentos</p>
        </div>
        <div class="header-actions">
          <button class="btn-action btn-pdf" [disabled]="loading()" (click)="exportarPdf()">
            📄 Baixar PDF com Gráficos
          </button>
          <button class="btn-action btn-excel" [disabled]="loading()" (click)="exportarExcel()">
            📊 Baixar Excel
          </button>
        </div>
      </div>

      <!-- Filtros e Controles -->
      <div class="filters-card">
        <div class="filters-grid">
          <!-- Filial -->
          <div class="filter-field">
            <label>Filial / Ponto</label>
            <select [(ngModel)]="filters.local" (change)="load()">
              <option value="todas">Todas as Filiais</option>
              <option value="Matriz">Matriz</option>
              <option value="Viana">Viana</option>
            </select>
          </div>

          <!-- Segmento -->
          <div class="filter-field">
            <label>Segmento de Frota</label>
            <select [(ngModel)]="filters.segmento" (change)="load()">
              <option value="">Todos os Clientes</option>
              <option value="frota">Frota Própria (VIPE)</option>
              <option value="terceiros">Terceiros / Parceiros</option>
            </select>
          </div>

          <!-- Data Início -->
          <div class="filter-field">
            <label>Data Início</label>
            <input type="date" [(ngModel)]="filters.data_inicio" (change)="load()" />
          </div>

          <!-- Data Fim -->
          <div class="filter-field">
            <label>Data Fim</label>
            <input type="date" [(ngModel)]="filters.data_fim" (change)="load()" />
          </div>
        </div>

        <!-- Atalhos de Período -->
        <div class="filter-shortcuts">
          <span class="shortcuts-label">Atalhos:</span>
          <button type="button" class="btn-pill" (click)="setPeriodo('ano')">Ano 2026</button>
          <button type="button" class="btn-pill" (click)="setPeriodo('ultimos_3_meses')">Últimos 3 Meses</button>
          <button type="button" class="btn-pill" (click)="setPeriodo('mes_atual')">Mês Atual</button>
          <button type="button" class="btn-pill" (click)="setPeriodo('todos')">Todo Histórico</button>
        </div>
      </div>

      <!-- Estado de Carregamento -->
      @if (loading()) {
        <div class="loading-state">
          <div class="spinner"></div>
          <span>Processando faturamento operacional e renderizando gráficos...</span>
        </div>
      }

      @if (!loading() && totais(); as t) {
        <!-- Cartões de KPIs Principais -->
        <div class="kpi-grid">
          <div class="kpi-card">
            <span class="kpi-title">Faturamento Total</span>
            <span class="kpi-value text-blue">{{ t.valor_total | currency:'BRL':'symbol':'1.2-2' }}</span>
            <span class="kpi-sub">{{ t.total_abastecimentos | number:'1.0-0' }} abastecimentos registrados</span>
          </div>

          <div class="kpi-card">
            <span class="kpi-title">Volume Total Faturado</span>
            <span class="kpi-value">{{ t.litros | number:'1.2-2' }} L</span>
            <span class="kpi-sub">Diesel S10</span>
          </div>

          <div class="kpi-card">
            <span class="kpi-title">Preço Médio / Litro</span>
            <span class="kpi-value text-amber">R$ {{ (t.preco_medio || (t.valor_total / t.litros)) | number:'1.3-3' }}</span>
            <span class="kpi-sub">Ticket Médio: {{ (t.ticket_medio || (t.valor_total / t.total_abastecimentos)) | currency:'BRL':'symbol':'1.2-2' }}</span>
          </div>

          <div class="kpi-card">
            <span class="kpi-title">Recebido / Baixado</span>
            <span class="kpi-value text-green">{{ t.valor_recebido | currency:'BRL':'symbol':'1.2-2' }}</span>
            <span class="kpi-sub text-green font-bold">{{ pctRecebido(t.valor_recebido, t.valor_total) | number:'1.1-1' }}% do total</span>
          </div>

          <div class="kpi-card">
            <span class="kpi-title">Pendente a Receber</span>
            <span class="kpi-value text-orange">{{ t.valor_pendente | currency:'BRL':'symbol':'1.2-2' }}</span>
            <span class="kpi-sub text-orange font-bold">{{ pctRecebido(t.valor_pendente, t.valor_total) | number:'1.1-1' }}% pendente</span>
          </div>
        </div>

        <!-- PAINEL DE GRÁFICOS VISUAIS -->
        <div class="charts-grid">
          <!-- Gráfico 1: Faturamento Mensal por Filial (Barras) -->
          <div class="chart-card chart-large">
            <div class="chart-head">
              <div>
                <h3>Evolução do Faturamento por Filial</h3>
                <span class="chart-desc">Comparativo de vendas mensais (em Mil R$) entre Matriz e Viana</span>
              </div>
              <div class="chart-legend">
                <span class="leg-item"><i class="leg-dot bg-navy"></i> Matriz</span>
                <span class="leg-item"><i class="leg-dot bg-cyan"></i> Viana</span>
              </div>
            </div>
            <div class="canvas-wrap">
              <canvas #chartFiliais></canvas>
            </div>
          </div>

          <!-- Gráfico 2: Donut Segmentos -->
          <div class="chart-card">
            <div class="chart-head">
              <div>
                <h3>Distribuição por Segmento</h3>
                <span class="chart-desc">Frota Própria vs Terceiros</span>
              </div>
            </div>
            <div class="canvas-wrap donut-wrap">
              <canvas #chartSegmento></canvas>
            </div>
          </div>

          <!-- Gráfico 3: Donut Baixas -->
          <div class="chart-card">
            <div class="chart-head">
              <div>
                <h3>Status Financeiro</h3>
                <span class="chart-desc">Recebido vs Pendente</span>
              </div>
            </div>
            <div class="canvas-wrap donut-wrap">
              <canvas #chartBaixas></canvas>
            </div>
          </div>
        </div>

        <!-- Barra de Navegação por Abas -->
        <div class="tabs-bar">
          <button class="tab-btn" [class.active]="tabAtiva() === 'resumo'" (click)="tabAtiva.set('resumo')">
            📅 Resumo Mensal
          </button>
          <button class="tab-btn" [class.active]="tabAtiva() === 'filial'" (click)="tabAtiva.set('filial')">
            🏢 Por Filial (Matriz vs Viana)
          </button>
          <button class="tab-btn" [class.active]="tabAtiva() === 'segmento'" (click)="tabAtiva.set('segmento')">
            🚛 Frota Própria vs Terceiros
          </button>
          <button class="tab-btn" [class.active]="tabAtiva() === 'proprietarios'" (click)="tabAtiva.set('proprietarios')">
            👥 Top Proprietários / Clientes
          </button>
          <button class="tab-btn" [class.active]="tabAtiva() === 'detalhado'" (click)="abrirAbaDetalhado()">
            📋 Base Detalhada (Analítica)
          </button>
        </div>

        <!-- CONTEÚDO DA ABA 1: RESUMO MENSAL -->
        @if (tabAtiva() === 'resumo') {
          <div class="table-card">
            <div class="table-header-title">
              <h3>Faturamento Consolidado Mês a Mês</h3>
              <span class="badge-count">{{ resumoMensal().length }} meses</span>
            </div>
            <div class="table-responsive">
              <table class="data-table">
                <thead>
                  <tr>
                    <th>Mês</th>
                    <th class="text-right">Abastecimentos</th>
                    <th class="text-right">Volume (Litros)</th>
                    <th class="text-right">Faturamento Total</th>
                    <th class="text-right">Preço Médio/L</th>
                    <th class="text-right">Ticket Médio</th>
                    <th class="text-right">Recebido (R$)</th>
                    <th class="text-right">Pendente (R$)</th>
                    <th class="text-center">% Recebido</th>
                  </tr>
                </thead>
                <tbody>
                  @for (r of resumoMensal(); track r.mes) {
                    <tr>
                      <td class="font-bold text-white">{{ formatMes(r.mes) }}</td>
                      <td class="text-right">{{ r.total_abastecimentos | number:'1.0-0' }}</td>
                      <td class="text-right text-blue">{{ r.litros | number:'1.2-2' }} L</td>
                      <td class="text-right font-bold text-green">{{ r.valor_total | currency:'BRL':'symbol':'1.2-2' }}</td>
                      <td class="text-right">R$ {{ r.preco_medio | number:'1.3-3' }}</td>
                      <td class="text-right">{{ r.ticket_medio | currency:'BRL':'symbol':'1.2-2' }}</td>
                      <td class="text-right text-emerald">{{ r.valor_recebido | currency:'BRL':'symbol':'1.2-2' }}</td>
                      <td class="text-right text-amber">{{ r.valor_pendente | currency:'BRL':'symbol':'1.2-2' }}</td>
                      <td class="text-center">
                        <div class="progress-wrap">
                          <div class="progress-bar" [style.width.%]="pctRecebido(r.valor_recebido, r.valor_total)"></div>
                          <span class="progress-text">{{ pctRecebido(r.valor_recebido, r.valor_total) | number:'1.1-1' }}%</span>
                        </div>
                      </td>
                    </tr>
                  }
                </tbody>
                <tfoot>
                  <tr class="totals-row">
                    <td>TOTAL CONSOLIDADO</td>
                    <td class="text-right">{{ t.total_abastecimentos | number:'1.0-0' }}</td>
                    <td class="text-right">{{ t.litros | number:'1.2-2' }} L</td>
                    <td class="text-right text-green">{{ t.valor_total | currency:'BRL':'symbol':'1.2-2' }}</td>
                    <td class="text-right">R$ {{ (t.valor_total / t.litros) | number:'1.3-3' }}</td>
                    <td class="text-right">{{ (t.valor_total / t.total_abastecimentos) | currency:'BRL':'symbol':'1.2-2' }}</td>
                    <td class="text-right text-emerald">{{ t.valor_recebido | currency:'BRL':'symbol':'1.2-2' }}</td>
                    <td class="text-right text-amber">{{ t.valor_pendente | currency:'BRL':'symbol':'1.2-2' }}</td>
                    <td class="text-center">{{ pctRecebido(t.valor_recebido, t.valor_total) | number:'1.1-1' }}%</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        }

        <!-- CONTEÚDO DA ABA 2: POR FILIAL -->
        @if (tabAtiva() === 'filial') {
          <div class="table-card">
            <div class="table-header-title">
              <h3>Faturamento Separado por Filial (Matriz vs Viana)</h3>
            </div>
            <div class="table-responsive">
              <table class="data-table">
                <thead>
                  <tr>
                    <th>Mês</th>
                    <th>Filial / Ponto</th>
                    <th class="text-right">Abastecimentos</th>
                    <th class="text-right">Volume (Litros)</th>
                    <th class="text-right">Faturamento (R$)</th>
                    <th class="text-right">Preço Médio/L</th>
                    <th class="text-right">Recebido (R$)</th>
                    <th class="text-right">Pendente (R$)</th>
                  </tr>
                </thead>
                <tbody>
                  @for (f of porFilial(); track f.mes + f.local) {
                    <tr>
                      <td class="font-bold">{{ formatMes(f.mes) }}</td>
                      <td>
                        <span class="badge" [class.badge-blue]="f.local === 'Viana'" [class.badge-navy]="f.local === 'Matriz'">
                          {{ f.local }}
                        </span>
                      </td>
                      <td class="text-right">{{ f.total_abastecimentos | number:'1.0-0' }}</td>
                      <td class="text-right">{{ f.litros | number:'1.2-2' }} L</td>
                      <td class="text-right font-bold text-green">{{ f.valor_total | currency:'BRL':'symbol':'1.2-2' }}</td>
                      <td class="text-right">R$ {{ f.preco_medio | number:'1.3-3' }}</td>
                      <td class="text-right text-emerald">{{ f.valor_recebido | currency:'BRL':'symbol':'1.2-2' }}</td>
                      <td class="text-right text-amber">{{ f.valor_pendente | currency:'BRL':'symbol':'1.2-2' }}</td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          </div>
        }

        <!-- CONTEÚDO DA ABA 3: SEGMENTO -->
        @if (tabAtiva() === 'segmento') {
          <div class="table-card">
            <div class="table-header-title">
              <h3>Faturamento por Segmento: Frota Própria (Consumo VIPE) vs Terceiros</h3>
            </div>
            <div class="table-responsive">
              <table class="data-table">
                <thead>
                  <tr>
                    <th>Mês</th>
                    <th>Segmento</th>
                    <th class="text-right">Abastecimentos</th>
                    <th class="text-right">Volume (Litros)</th>
                    <th class="text-right">Faturamento (R$)</th>
                    <th class="text-right">Preço Médio/L</th>
                    <th class="text-right">Recebido (R$)</th>
                    <th class="text-right">Pendente (R$)</th>
                  </tr>
                </thead>
                <tbody>
                  @for (s of porSegmento(); track s.mes + s.segmento) {
                    <tr>
                      <td class="font-bold">{{ formatMes(s.mes) }}</td>
                      <td>
                        <span class="badge" [class.badge-purple]="s.segmento.includes('VIPE')" [class.badge-cyan]="!s.segmento.includes('VIPE')">
                          {{ s.segmento }}
                        </span>
                      </td>
                      <td class="text-right">{{ s.total_abastecimentos | number:'1.0-0' }}</td>
                      <td class="text-right">{{ s.litros | number:'1.2-2' }} L</td>
                      <td class="text-right font-bold text-green">{{ s.valor_total | currency:'BRL':'symbol':'1.2-2' }}</td>
                      <td class="text-right">R$ {{ s.preco_medio | number:'1.3-3' }}</td>
                      <td class="text-right text-emerald">{{ s.valor_recebido | currency:'BRL':'symbol':'1.2-2' }}</td>
                      <td class="text-right text-amber">{{ s.valor_pendente | currency:'BRL':'symbol':'1.2-2' }}</td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          </div>
        }

        <!-- CONTEÚDO DA ABA 4: TOP PROPRIETÁRIOS -->
        @if (tabAtiva() === 'proprietarios') {
          <div class="table-card">
            <div class="table-header-title">
              <h3>Ranking dos Maiores Faturamentos por Cliente / Proprietário</h3>
            </div>
            <div class="table-responsive">
              <table class="data-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Proprietário / Razão Social</th>
                    <th class="text-right">Abastecimentos</th>
                    <th class="text-right">Volume (Litros)</th>
                    <th class="text-right">Faturamento Total</th>
                    <th class="text-right">Part. %</th>
                    <th class="text-right">Recebido (R$)</th>
                    <th class="text-right">Pendente (R$)</th>
                  </tr>
                </thead>
                <tbody>
                  @for (p of topProprietarios(); track p.proprietario; let idx = $index) {
                    <tr>
                      <td class="text-muted font-bold">{{ idx + 1 }}º</td>
                      <td class="font-bold text-white">{{ p.proprietario }}</td>
                      <td class="text-right">{{ p.total_abastecimentos | number:'1.0-0' }}</td>
                      <td class="text-right">{{ p.litros | number:'1.2-2' }} L</td>
                      <td class="text-right font-bold text-green">{{ p.valor_total | currency:'BRL':'symbol':'1.2-2' }}</td>
                      <td class="text-right font-bold text-blue">{{ pctRecebido(p.valor_total, t.valor_total) | number:'1.1-1' }}%</td>
                      <td class="text-right text-emerald">{{ p.valor_recebido | currency:'BRL':'symbol':'1.2-2' }}</td>
                      <td class="text-right text-amber">{{ p.valor_pendente | currency:'BRL':'symbol':'1.2-2' }}</td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          </div>
        }

        <!-- CONTEÚDO DA ABA 5: DETALHAMENTO ANALÍTICO (50 por página) -->
        @if (tabAtiva() === 'detalhado') {
          <div class="table-card">
            <div class="table-header-title">
              <h3>Lançamentos Analíticos de Abastecimento</h3>
              <div class="pagination-info">
                <span>Página {{ paginaAtual() }} de {{ totalPaginas() }} ({{ totalRegistrosDetalhados() }} registros)</span>
              </div>
            </div>

            @if (carregandoDetalhado()) {
              <div class="loading-state">
                <div class="spinner"></div>
                <span>Carregando registros...</span>
              </div>
            } @else {
              <div class="table-responsive">
                <table class="data-table">
                  <thead>
                    <tr>
                      <th>Data e Hora</th>
                      <th>Filial</th>
                      <th>Proprietário</th>
                      <th>Veículo</th>
                      <th>Motorista</th>
                      <th>Combustível</th>
                      <th class="text-right">Volume (L)</th>
                      <th class="text-right">R$/L</th>
                      <th class="text-right">Total (R$)</th>
                      <th class="text-center">Status Baixa</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (item of itensDetalhados(); track item.id_abastecimento) {
                      <tr>
                        <td>{{ item.data_hora | date:'dd/MM/yyyy HH:mm' }}</td>
                        <td><span class="badge badge-navy">{{ item.local }}</span></td>
                        <td class="font-bold">{{ item.nome_proprietario || item.proprietario?.nome || '—' }}</td>
                        <td>
                          <span class="badge-placa">{{ item.veiculo?.placa || item.placa1 || '—' }}</span>
                        </td>
                        <td>{{ item.nome_motorista || item.motorista?.nome || '—' }}</td>
                        <td>{{ item.tipo_combustivel }}</td>
                        <td class="text-right font-bold">{{ item.quantidade_litros | number:'1.2-2' }}</td>
                        <td class="text-right">R$ {{ item.valor_por_litro | number:'1.3-3' }}</td>
                        <td class="text-right font-bold text-green">{{ item.valor_total | currency:'BRL':'symbol':'1.2-2' }}</td>
                        <td class="text-center">
                          <span class="badge" [class.badge-green]="item.baixa_abastecimento" [class.badge-orange]="!item.baixa_abastecimento">
                            {{ item.baixa_abastecimento ? 'Baixado' : 'Pendente' }}
                          </span>
                        </td>
                      </tr>
                    } @empty {
                      <tr><td colspan="10" class="empty-text">Nenhum abastecimento encontrado para este filtro.</td></tr>
                    }
                  </tbody>
                </table>
              </div>

              <!-- Paginação de 50 registros por página -->
              <div class="pagination-bar">
                <button class="btn-page" [disabled]="paginaAtual() <= 1" (click)="mudarPagina(paginaAtual() - 1)">
                  ← Anterior
                </button>
                <span class="page-indicator">Página {{ paginaAtual() }} / {{ totalPaginas() }}</span>
                <button class="btn-page" [disabled]="paginaAtual() >= totalPaginas()" (click)="mudarPagina(paginaAtual() + 1)">
                  Próxima →
                </button>
              </div>
            }
          </div>
        }
      }
    </div>
  `,
  styles: [`
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
    * { box-sizing: border-box; }
    .page { padding: 24px; font-family: 'Inter', sans-serif; color: #E2E8F0; }

    .page-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 16px;
      margin-bottom: 20px;
    }
    .page-header h1 { font-size: 24px; font-weight: 800; color: #F8FAFC; margin: 0; }
    .page-header p { font-size: 13px; color: #94A3B8; margin-top: 4px; }

    .header-actions { display: flex; gap: 10px; }
    .btn-action {
      height: 38px;
      padding: 0 16px;
      border-radius: 8px;
      font-size: 13px;
      font-weight: 700;
      border: none;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      transition: all 0.2s;
    }
    .btn-pdf { background: #DC2626; color: #FFFFFF; }
    .btn-pdf:hover:not(:disabled) { background: #B91C1C; }
    .btn-excel { background: #059669; color: #FFFFFF; }
    .btn-excel:hover:not(:disabled) { background: #047857; }
    .btn-action:disabled { opacity: 0.5; cursor: not-allowed; }

    /* Filtros */
    .filters-card {
      background: #0D1427;
      border: 1px solid #1E2D4A;
      border-radius: 12px;
      padding: 16px;
      margin-bottom: 20px;
    }
    .filters-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 14px;
      margin-bottom: 12px;
    }
    .filter-field { display: flex; flex-direction: column; gap: 4px; }
    .filter-field label { font-size: 11px; font-weight: 700; color: #64748B; text-transform: uppercase; letter-spacing: 0.5px; }
    .filter-field input, .filter-field select {
      background: #0A0F1E;
      border: 1px solid #1E2D4A;
      border-radius: 8px;
      padding: 8px 12px;
      color: #F8FAFC;
      font-size: 13px;
      font-family: inherit;
      outline: none;
    }
    .filter-field input:focus, .filter-field select:focus { border-color: #38BDF8; }

    .filter-shortcuts {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
      padding-top: 10px;
      border-top: 1px solid #1E2D4A;
    }
    .shortcuts-label { font-size: 11px; color: #64748B; font-weight: 700; text-transform: uppercase; }
    .btn-pill {
      background: #0A0F1E;
      border: 1px solid #1E2D4A;
      border-radius: 20px;
      padding: 4px 12px;
      color: #CBD5E1;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.15s;
    }
    .btn-pill:hover { border-color: #38BDF8; color: #38BDF8; background: #0F172A; }

    /* KPIs */
    .kpi-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 14px;
      margin-bottom: 20px;
    }
    .kpi-card {
      background: #0D1427;
      border: 1px solid #1E2D4A;
      border-radius: 12px;
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .kpi-title { font-size: 11px; font-weight: 700; color: #64748B; text-transform: uppercase; letter-spacing: 0.5px; }
    .kpi-value { font-size: 20px; font-weight: 800; color: #F8FAFC; }
    .kpi-sub { font-size: 11px; color: #94A3B8; }
    .text-blue { color: #38BDF8; }
    .text-green { color: #4ADE80; }
    .text-emerald { color: #10B981; }
    .text-orange { color: #FB923C; }
    .text-amber { color: #FBBF24; }
    .font-bold { font-weight: 700; }

    /* Painel de Gráficos */
    .charts-grid {
      display: grid;
      grid-template-columns: repeat(12, 1fr);
      gap: 16px;
      margin-bottom: 24px;
    }
    .chart-card {
      grid-column: span 3;
      background: #0D1427;
      border: 1px solid #1E2D4A;
      border-radius: 12px;
      padding: 18px;
      display: flex;
      flex-direction: column;
    }
    .chart-large {
      grid-column: span 6;
    }
    @media (max-width: 1100px) {
      .chart-large { grid-column: span 12; }
      .chart-card:not(.chart-large) { grid-column: span 6; }
    }
    @media (max-width: 700px) {
      .chart-card { grid-column: span 12 !important; }
    }
    .chart-head {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 14px;
      flex-wrap: wrap;
      gap: 8px;
    }
    .chart-head h3 { font-size: 14px; font-weight: 700; color: #F8FAFC; margin: 0; }
    .chart-desc { font-size: 11px; color: #64748B; display: block; margin-top: 2px; }
    .chart-legend { display: flex; gap: 12px; }
    .leg-item { display: flex; align-items: center; gap: 5px; font-size: 11px; font-weight: 600; color: #94A3B8; }
    .leg-dot { width: 10px; height: 10px; border-radius: 2px; display: inline-block; }
    .bg-navy { background: #3B82F6; }
    .bg-cyan { background: #06B6D4; }

    .canvas-wrap {
      width: 100%;
      height: 220px;
      display: flex;
      align-items: center;
      justify-content: center;
      position: relative;
    }
    .donut-wrap {
      height: 220px;
    }
    .canvas-wrap canvas {
      width: 100% !important;
      height: 100% !important;
      display: block;
    }

    /* Tabs */
    .tabs-bar {
      display: flex;
      gap: 8px;
      overflow-x: auto;
      margin-bottom: 16px;
      padding-bottom: 4px;
    }
    .tab-btn {
      background: #0D1427;
      border: 1px solid #1E2D4A;
      border-radius: 8px;
      padding: 10px 16px;
      color: #94A3B8;
      font-size: 13px;
      font-weight: 700;
      cursor: pointer;
      white-space: nowrap;
      transition: all 0.2s;
    }
    .tab-btn:hover { background: #162038; color: #F8FAFC; }
    .tab-btn.active {
      background: #1E293B;
      color: #38BDF8;
      border-color: #38BDF8;
      box-shadow: 0 0 12px rgba(56, 189, 248, 0.15);
    }

    /* Tabelas */
    .table-card {
      background: #0D1427;
      border: 1px solid #1E2D4A;
      border-radius: 12px;
      overflow: hidden;
    }
    .table-header-title {
      padding: 16px 20px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 1px solid #1E2D4A;
    }
    .table-header-title h3 { font-size: 15px; font-weight: 700; color: #F8FAFC; margin: 0; }
    .badge-count {
      background: #0A0F1E;
      border: 1px solid #1E2D4A;
      padding: 4px 10px;
      border-radius: 20px;
      font-size: 11px;
      color: #94A3B8;
      font-weight: 700;
    }
    .table-responsive { overflow-x: auto; }
    .data-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 12.5px;
    }
    .data-table thead th {
      background: #080E1C;
      color: #64748B;
      padding: 12px 16px;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      font-weight: 700;
      border-bottom: 1px solid #1E2D4A;
      text-align: left;
    }
    .data-table tbody td {
      padding: 12px 16px;
      border-bottom: 1px solid #1E2D4A40;
      color: #CBD5E1;
    }
    .data-table tbody tr:hover td { background: #111B32; }
    .totals-row td {
      background: #080E1C;
      font-weight: 800;
      color: #F8FAFC;
      border-top: 2px solid #1E2D4A;
      padding: 14px 16px;
    }
    .text-right { text-align: right; }
    .text-center { text-align: center; }

    /* Badges */
    .badge {
      display: inline-block;
      padding: 3px 8px;
      border-radius: 6px;
      font-size: 11px;
      font-weight: 700;
    }
    .badge-blue { background: rgba(56, 189, 248, 0.15); color: #38BDF8; }
    .badge-navy { background: rgba(148, 163, 184, 0.15); color: #E2E8F0; }
    .badge-green { background: rgba(74, 222, 128, 0.15); color: #4ADE80; }
    .badge-orange { background: rgba(251, 146, 60, 0.15); color: #FB923C; }
    .badge-purple { background: rgba(168, 85, 247, 0.15); color: #C084FC; }
    .badge-cyan { background: rgba(6, 182, 212, 0.15); color: #22D3EE; }
    .badge-placa {
      background: #1E2D4A;
      color: #38BDF8;
      padding: 2px 6px;
      border-radius: 4px;
      font-family: monospace;
      font-size: 11px;
      font-weight: 700;
    }

    /* Barra de Progresso */
    .progress-wrap {
      background: #0A0F1E;
      border-radius: 10px;
      height: 18px;
      width: 90px;
      margin: 0 auto;
      position: relative;
      overflow: hidden;
      border: 1px solid #1E2D4A;
    }
    .progress-bar {
      background: linear-gradient(90deg, #10B981, #059669);
      height: 100%;
      border-radius: 10px;
    }
    .progress-text {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      font-size: 10px;
      font-weight: 800;
      color: #F8FAFC;
    }

    /* Paginação */
    .pagination-bar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 12px 20px;
      border-top: 1px solid #1E2D4A;
      background: #080E1C;
    }
    .btn-page {
      background: #0D1427;
      border: 1px solid #1E2D4A;
      border-radius: 6px;
      padding: 6px 14px;
      color: #E2E8F0;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
    }
    .btn-page:hover:not(:disabled) { border-color: #38BDF8; color: #38BDF8; }
    .btn-page:disabled { opacity: 0.4; cursor: not-allowed; }
    .page-indicator { font-size: 12px; color: #94A3B8; font-weight: 600; }

    /* Spinner */
    .loading-state {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 12px;
      padding: 40px;
      color: #94A3B8;
      font-size: 14px;
    }
    .spinner {
      width: 24px;
      height: 24px;
      border-radius: 50%;
      border: 3px solid #1E2D4A;
      border-top-color: #38BDF8;
      animation: spin 0.8s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    .empty-text { text-align: center; padding: 24px; color: #64748B; font-style: italic; }
  `]
})
export class RelatorioFaturamentoComponent implements OnInit, AfterViewInit {
  private api = inject(ApiService);
  private toastr = inject(ToastrService);

  @ViewChild('chartFiliais') chartFiliaisRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('chartSegmento') chartSegmentoRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('chartBaixas') chartBaixasRef!: ElementRef<HTMLCanvasElement>;

  loading = signal(false);
  tabAtiva = signal<'resumo' | 'filial' | 'segmento' | 'proprietarios' | 'detalhado'>('resumo');

  // Filtros
  filters = {
    local: 'todas',
    data_inicio: '',
    data_fim: '',
    segmento: '',
  };

  // Dados agregados
  resumoMensal = signal<ResumoMensalItem[]>([]);
  porFilial = signal<FilialResumoItem[]>([]);
  porSegmento = signal<SegmentoResumoItem[]>([]);
  topProprietarios = signal<TopProprietarioItem[]>([]);
  totais = signal<any | null>(null);

  // Detalhamento analítico paginado
  carregandoDetalhado = signal(false);
  itensDetalhados = signal<any[]>([]);
  paginaAtual = signal(1);
  totalPaginas = signal(1);
  totalRegistrosDetalhados = signal(0);

  ngOnInit() {
    this.load();
  }

  ngAfterViewInit() {
    // Redraw on window resize
    window.addEventListener('resize', () => {
      this.renderCharts();
    });
  }

  setPeriodo(tipo: 'ano' | 'ultimos_3_meses' | 'mes_atual' | 'todos') {
    const hoje = new Date();
    const ano = hoje.getFullYear();
    const mes = String(hoje.getMonth() + 1).padStart(2, '0');
    const dia = String(hoje.getDate()).padStart(2, '0');

    if (tipo === 'ano') {
      this.filters.data_inicio = `${ano}-01-01`;
      this.filters.data_fim = `${ano}-12-31`;
    } else if (tipo === 'ultimos_3_meses') {
      const d3 = new Date(hoje);
      d3.setMonth(d3.getMonth() - 3);
      this.filters.data_inicio = d3.toISOString().slice(0, 10);
      this.filters.data_fim = `${ano}-${mes}-${dia}`;
    } else if (tipo === 'mes_atual') {
      this.filters.data_inicio = `${ano}-${mes}-01`;
      this.filters.data_fim = `${ano}-${mes}-${dia}`;
    } else {
      this.filters.data_inicio = '';
      this.filters.data_fim = '';
    }
    this.load();
  }

  load() {
    this.loading.set(true);
    this.api.getRelatorioFaturamentoMensal(this.filters).subscribe({
      next: (res) => {
        this.resumoMensal.set(res.resumo_mensal || []);
        this.porFilial.set(res.por_filial || []);
        this.porSegmento.set(res.por_segmento || []);
        this.topProprietarios.set(res.top_proprietarios || []);
        this.totais.set(res.totais || null);
        this.loading.set(false);

        // Render charts after DOM updates
        setTimeout(() => this.renderCharts(), 50);
      },
      error: (err) => {
        console.error('Erro ao carregar relatório de faturamento:', err);
        this.toastr.error('Erro ao buscar dados do faturamento.');
        this.loading.set(false);
      }
    });

    if (this.tabAtiva() === 'detalhado') {
      this.carregarDetalhes(1);
    }
  }

  // ---------------------------------------------------------------------------
  // RENDERIZAÇÃO DOS GRÁFICOS NO CANVAS (HIGH-DPI)
  // ---------------------------------------------------------------------------
  renderCharts() {
    this.renderChartFiliais();
    this.renderChartSegmento();
    this.renderChartBaixas();
  }

  private setupCanvas(canvas: HTMLCanvasElement): CanvasRenderingContext2D | null {
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const width = rect.width || canvas.parentElement?.clientWidth || 300;
    const height = rect.height || 220;
    const dpr = Math.max(window.devicePixelRatio || 1, 2);

    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.scale(dpr, dpr);
    }
    return ctx;
  }

  private renderChartFiliais() {
    if (!this.chartFiliaisRef?.nativeElement) return;
    const canvas = this.chartFiliaisRef.nativeElement;
    const ctx = this.setupCanvas(canvas);
    if (!ctx) return;

    const width = parseFloat(canvas.style.width);
    const height = parseFloat(canvas.style.height);
    ctx.clearRect(0, 0, width, height);

    // Meses em ordem cronológica (inverte o array desc para asc)
    const meses = [...this.resumoMensal()].reverse();
    if (!meses.length) return;

    // Mapeia valores por filial e mês
    const filialMap = new Map<string, number>();
    this.porFilial().forEach(f => {
      filialMap.set(`${f.mes}_${f.local}`, Number(f.valor_total || 0));
    });

    const maxVal = Math.max(...meses.map(m => {
      const vMatriz = filialMap.get(`${m.mes}_Matriz`) || 0;
      const vViana = filialMap.get(`${m.mes}_Viana`) || 0;
      return Math.max(vMatriz, vViana);
    }), 1000);

    const padding = { top: 24, right: 20, bottom: 32, left: 55 };
    const chartW = width - padding.left - padding.right;
    const chartH = height - padding.top - padding.bottom;

    // Grid e Eixo Y
    const steps = 4;
    ctx.strokeStyle = '#1E2D4A';
    ctx.lineWidth = 1;
    ctx.fillStyle = '#64748B';
    ctx.font = '10px Inter, sans-serif';
    ctx.textAlign = 'right';

    for (let i = 0; i <= steps; i++) {
      const yVal = (maxVal / steps) * i;
      const yPos = padding.top + chartH - (i / steps) * chartH;

      ctx.beginPath();
      ctx.moveTo(padding.left, yPos);
      ctx.lineTo(width - padding.right, yPos);
      ctx.stroke();

      const label = `R$ ${(yVal / 1000).toFixed(0)}k`;
      ctx.fillText(label, padding.left - 8, yPos + 3);
    }

    // Barras agrupadas
    const groupW = chartW / meses.length;
    const barW = Math.min(groupW * 0.35, 24);

    meses.forEach((m, idx) => {
      const groupX = padding.left + (idx * groupW) + (groupW / 2);
      const vMatriz = filialMap.get(`${m.mes}_Matriz`) || 0;
      const vViana = filialMap.get(`${m.mes}_Viana`) || 0;

      const hMatriz = (vMatriz / maxVal) * chartH;
      const hViana = (vViana / maxVal) * chartH;

      const yMatriz = padding.top + chartH - hMatriz;
      const yViana = padding.top + chartH - hViana;

      // Barra Matriz (Blue 500)
      ctx.fillStyle = '#3B82F6';
      this.drawRoundedRect(ctx, groupX - barW - 2, yMatriz, barW, hMatriz, 3);

      // Barra Viana (Cyan 500)
      ctx.fillStyle = '#06B6D4';
      this.drawRoundedRect(ctx, groupX + 2, yViana, barW, hViana, 3);

      // Label do mês no Eixo X
      ctx.fillStyle = '#94A3B8';
      ctx.font = '10px Inter, sans-serif';
      ctx.textAlign = 'center';
      const mesAbrev = this.formatMes(m.mes).split('/')[0].slice(0, 3);
      ctx.fillText(mesAbrev, groupX, height - 10);
    });
  }

  private renderChartSegmento() {
    if (!this.chartSegmentoRef?.nativeElement) return;
    const canvas = this.chartSegmentoRef.nativeElement;
    const ctx = this.setupCanvas(canvas);
    if (!ctx) return;

    const width = parseFloat(canvas.style.width);
    const height = parseFloat(canvas.style.height);
    ctx.clearRect(0, 0, width, height);

    let totFrota = 0;
    let totTerceiros = 0;
    this.porSegmento().forEach(s => {
      if (s.segmento.includes('VIPE')) {
        totFrota += Number(s.valor_total || 0);
      } else {
        totTerceiros += Number(s.valor_total || 0);
      }
    });

    const total = totFrota + totTerceiros;
    if (total <= 0) return;

    const slices = [
      { label: 'Frota Própria (VIPE)', val: totFrota, color: '#3B82F6' },
      { label: 'Terceiros / Parceiros', val: totTerceiros, color: '#06B6D4' }
    ];

    this.drawDonut(ctx, width, height, slices, total, 'Segmentos');
  }

  private renderChartBaixas() {
    if (!this.chartBaixasRef?.nativeElement) return;
    const canvas = this.chartBaixasRef.nativeElement;
    const ctx = this.setupCanvas(canvas);
    if (!ctx) return;

    const width = parseFloat(canvas.style.width);
    const height = parseFloat(canvas.style.height);
    ctx.clearRect(0, 0, width, height);

    const t = this.totais();
    if (!t) return;

    const rec = Number(t.valor_recebido || 0);
    const pend = Number(t.valor_pendente || 0);
    const total = rec + pend;
    if (total <= 0) return;

    const slices = [
      { label: 'Recebido / Baixado', val: rec, color: '#10B981' },
      { label: 'Pendente', val: pend, color: '#F59E0B' }
    ];

    this.drawDonut(ctx, width, height, slices, total, 'Status Baixa');
  }

  private drawDonut(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    slices: { label: string; val: number; color: string }[],
    total: number,
    centerTitle: string
  ) {
    const cx = width / 2;
    const cy = (height / 2) - 15;
    const radius = Math.min(cx, cy) - 16;
    const innerRadius = radius * 0.62;

    let startAngle = -Math.PI / 2;

    slices.forEach(s => {
      const sliceAngle = (s.val / total) * (Math.PI * 2);
      ctx.beginPath();
      ctx.arc(cx, cy, radius, startAngle, startAngle + sliceAngle);
      ctx.arc(cx, cy, innerRadius, startAngle + sliceAngle, startAngle, true);
      ctx.closePath();
      ctx.fillStyle = s.color;
      ctx.fill();
      startAngle += sliceAngle;
    });

    // Centro do Donut
    ctx.fillStyle = '#F8FAFC';
    ctx.font = 'bold 13px Inter, sans-serif';
    ctx.textAlign = 'center';
    const mainPct = ((slices[0].val / total) * 100).toFixed(1);
    ctx.fillText(`${mainPct}%`, cx, cy + 1);

    ctx.fillStyle = '#64748B';
    ctx.font = '9px Inter, sans-serif';
    ctx.fillText(centerTitle, cx, cy + 14);

    // Legenda inferior
    const legY = height - 12;
    ctx.font = '10px Inter, sans-serif';
    const itemW = width / slices.length;

    slices.forEach((s, i) => {
      const itemX = (i * itemW) + (itemW / 2);
      const pct = ((s.val / total) * 100).toFixed(1);

      ctx.fillStyle = s.color;
      ctx.fillRect(itemX - 35, legY - 7, 7, 7);

      ctx.fillStyle = '#CBD5E1';
      ctx.textAlign = 'left';
      ctx.fillText(`${pct}% ${s.label.split(' ')[0]}`, itemX - 24, legY);
    });
  }

  private drawRoundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
    if (h <= 0) return;
    r = Math.min(r, h / 2, w / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h);
    ctx.lineTo(x, y + h);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
    ctx.fill();
  }

  abrirAbaDetalhado() {
    this.tabAtiva.set('detalhado');
    if (this.itensDetalhados().length === 0) {
      this.carregarDetalhes(1);
    }
  }

  carregarDetalhes(pagina: number) {
    this.carregandoDetalhado.set(true);
    const query = {
      ...this.filters,
      page: pagina,
    };
    this.api.getRelatorioFaturamentoDetalhado(query).subscribe({
      next: (res) => {
        this.itensDetalhados.set(res.data || []);
        this.paginaAtual.set(res.current_page || 1);
        this.totalPaginas.set(res.last_page || 1);
        this.totalRegistrosDetalhados.set(res.total || 0);
        this.carregandoDetalhado.set(false);
      },
      error: () => {
        this.toastr.error('Erro ao carregar detalhes analíticos.');
        this.carregandoDetalhado.set(false);
      }
    });
  }

  mudarPagina(p: number) {
    if (p >= 1 && p <= this.totalPaginas()) {
      this.carregarDetalhes(p);
    }
  }

  pctRecebido(rec: number | null, total: number | null): number {
    const r = Number(rec || 0);
    const t = Number(total || 0);
    if (t <= 0) return 0;
    return (r / t) * 100;
  }

  formatMes(mesStr: string): string {
    if (!mesStr) return '';
    const nomes: Record<string, string> = {
      '01': 'Janeiro', '02': 'Fevereiro', '03': 'Março', '04': 'Abril',
      '05': 'Maio', '06': 'Junho', '07': 'Julho', '08': 'Agosto',
      '09': 'Setembro', '10': 'Outubro', '11': 'Novembro', '12': 'Dezembro'
    };
    const parts = mesStr.split('-');
    if (parts.length === 2) {
      const nome = nomes[parts[1]] || parts[1];
      return `${nome}/${parts[0]}`;
    }
    return mesStr;
  }

  // ---------------------------------------------------------------------------
  // EXPORTAÇÃO EXCEL (XLSX) MULTI-ABAS
  // ---------------------------------------------------------------------------
  async exportarExcel() {
    const t = this.totais();
    if (!t) {
      this.toastr.warning('Nenhum dado para exportar.');
      return;
    }

    try {
      const XLSX = await import('xlsx');
      const wb = XLSX.utils.book_new();

      // Aba 1: Resumo Mensal
      const rowsResumo = this.resumoMensal().map(r => ({
        'Mês': this.formatMes(r.mes),
        'Abastecimentos': Number(r.total_abastecimentos),
        'Volume (L)': Number(r.litros),
        'Faturamento Total (R$)': Number(r.valor_total),
        'Preço Médio/L (R$)': Number(r.preco_medio),
        'Ticket Médio (R$)': Number(r.ticket_medio),
        'Valor Recebido (R$)': Number(r.valor_recebido),
        'Valor Pendente (R$)': Number(r.valor_pendente),
        '% Recebido': Number(this.pctRecebido(r.valor_recebido, r.valor_total).toFixed(1)) + '%'
      }));
      const wsResumo = XLSX.utils.json_to_sheet(rowsResumo);
      XLSX.utils.book_append_sheet(wb, wsResumo, 'Resumo Mensal');

      // Aba 2: Por Filial
      const rowsFilial = this.porFilial().map(f => ({
        'Mês': this.formatMes(f.mes),
        'Filial / Local': f.local,
        'Abastecimentos': Number(f.total_abastecimentos),
        'Volume (L)': Number(f.litros),
        'Faturamento Total (R$)': Number(f.valor_total),
        'Preço Médio/L (R$)': Number(f.preco_medio),
        'Valor Recebido (R$)': Number(f.valor_recebido),
        'Valor Pendente (R$)': Number(f.valor_pendente)
      }));
      const wsFilial = XLSX.utils.json_to_sheet(rowsFilial);
      XLSX.utils.book_append_sheet(wb, wsFilial, 'Por Filial');

      // Aba 3: Segmento
      const rowsSegmento = this.porSegmento().map(s => ({
        'Mês': this.formatMes(s.mes),
        'Segmento': s.segmento,
        'Abastecimentos': Number(s.total_abastecimentos),
        'Volume (L)': Number(s.litros),
        'Faturamento Total (R$)': Number(s.valor_total),
        'Preço Médio/L (R$)': Number(s.preco_medio),
        'Valor Recebido (R$)': Number(s.valor_recebido),
        'Valor Pendente (R$)': Number(s.valor_pendente)
      }));
      const wsSegmento = XLSX.utils.json_to_sheet(rowsSegmento);
      XLSX.utils.book_append_sheet(wb, wsSegmento, 'Frota vs Terceiros');

      // Aba 4: Top Proprietários
      const rowsProp = this.topProprietarios().map((p, idx) => ({
        'Posição': `${idx + 1}º`,
        'Proprietário': p.proprietario,
        'Abastecimentos': Number(p.total_abastecimentos),
        'Volume (L)': Number(p.litros),
        'Faturamento Total (R$)': Number(p.valor_total),
        'Participação %': Number(this.pctRecebido(p.valor_total, t.valor_total).toFixed(1)) + '%',
        'Recebido (R$)': Number(p.valor_recebido),
        'Pendente (R$)': Number(p.valor_pendente)
      }));
      const wsProp = XLSX.utils.json_to_sheet(rowsProp);
      XLSX.utils.book_append_sheet(wb, wsProp, 'Top Proprietarios');

      const dataHoje = new Date().toISOString().slice(0, 10);
      XLSX.writeFile(wb, `Relatorio_Faturamento_Mensal_${dataHoje}.xlsx`);
      this.toastr.success('Planilha Excel gerada com sucesso!');
    } catch (err) {
      console.error('Erro ao exportar Excel:', err);
      this.toastr.error('Falha ao gerar planilha Excel.');
    }
  }

  // ---------------------------------------------------------------------------
  // EXPORTAÇÃO PDF EXECUTIVO (JSPDF COM GRÁFICOS DO CANVAS)
  // ---------------------------------------------------------------------------
  async exportarPdf() {
    const t = this.totais();
    if (!t) {
      this.toastr.warning('Nenhum dado para exportar.');
      return;
    }

    try {
      const { default: jsPDF } = await import('jspdf');
      const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
      const left = 36;
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      let y = 38;

      // Cabeçalho
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(18);
      doc.setTextColor(27, 54, 93); // Navy
      doc.text('RELATÓRIO EXECUTIVO DE FATURAMENTO MENSAL', left, y);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(100, 116, 139);
      const dataHora = new Date().toLocaleString('pt-BR');
      doc.text(`Emissão: ${dataHora} | Filial: ${this.filters.local === 'todas' ? 'Todas' : this.filters.local} | Sistema VIPE`, pageWidth - 260, y - 4);
      y += 16;

      doc.setDrawColor(27, 54, 93);
      doc.setLineWidth(1.5);
      doc.line(left, y, pageWidth - left, y);
      y += 14;

      // KPIs Box
      doc.setFillColor(248, 250, 252);
      doc.setDrawColor(203, 213, 225);
      doc.setLineWidth(0.8);
      doc.roundedRect(left, y, pageWidth - (left * 2), 44, 6, 6, 'FD');

      const colW = (pageWidth - (left * 2)) / 5;
      const kpis = [
        { label: 'FATURAMENTO TOTAL', val: `R$ ${Number(t.valor_total).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` },
        { label: 'VOLUME TOTAL', val: `${Number(t.litros).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} L` },
        { label: 'ABASTECIMENTOS', val: Number(t.total_abastecimentos).toLocaleString('pt-BR') },
        { label: 'RECEBIDO / BAIXADO', val: `R$ ${Number(t.valor_recebido).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` },
        { label: 'PENDENTE', val: `R$ ${Number(t.valor_pendente).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` }
      ];

      kpis.forEach((k, idx) => {
        const xPos = left + (idx * colW) + (colW / 2);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7.5);
        doc.setTextColor(100, 116, 139);
        doc.text(k.label, xPos, y + 15, { align: 'center' });

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10.5);
        doc.setTextColor(27, 54, 93);
        doc.text(k.val, xPos, y + 32, { align: 'center' });
      });
      y += 56;

      // Título Tabela 1
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(27, 54, 93);
      doc.text('1. Demonstrativo Consolidado Mês a Mês', left, y);
      y += 10;

      // Cabeçalho da Tabela
      const tableW = pageWidth - (left * 2);
      doc.setFillColor(27, 54, 93);
      doc.rect(left, y, tableW, 20, 'F');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(255, 255, 255);

      const tCols = [
        { title: 'Mês', x: left + 10, align: 'left' },
        { title: 'Abastecimentos', x: left + 130, align: 'right' },
        { title: 'Volume (L)', x: left + 220, align: 'right' },
        { title: 'Faturamento Total (R$)', x: left + 340, align: 'right' },
        { title: 'Preço Médio/L', x: left + 420, align: 'right' },
        { title: 'Recebido (R$)', x: left + 530, align: 'right' },
        { title: 'Pendente (R$)', x: left + 640, align: 'right' },
        { title: '% Recebido', x: left + tableW - 14, align: 'right' },
      ];

      tCols.forEach(c => {
        doc.text(c.title, c.x, y + 13, { align: c.align as any });
      });
      y += 20;

      // Linhas da Tabela
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);

      this.resumoMensal().forEach((r, idx) => {
        if (idx % 2 === 0) {
          doc.setFillColor(248, 250, 252);
          doc.rect(left, y, tableW, 16, 'F');
        }

        doc.setTextColor(15, 23, 42);
        doc.text(this.formatMes(r.mes), left + 10, y + 11);
        doc.text(Number(r.total_abastecimentos).toLocaleString('pt-BR'), left + 130, y + 11, { align: 'right' });
        doc.text(`${Number(r.litros).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} L`, left + 220, y + 11, { align: 'right' });
        doc.text(`R$ ${Number(r.valor_total).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, left + 340, y + 11, { align: 'right' });
        doc.text(`R$ ${Number(r.preco_medio).toFixed(3).replace('.', ',')}`, left + 420, y + 11, { align: 'right' });
        doc.text(`R$ ${Number(r.valor_recebido).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, left + 530, y + 11, { align: 'right' });
        doc.text(`R$ ${Number(r.valor_pendente).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, left + 640, y + 11, { align: 'right' });
        doc.text(`${this.pctRecebido(r.valor_recebido, r.valor_total).toFixed(1)}%`, left + tableW - 14, y + 11, { align: 'right' });

        y += 16;
      });

      // Linha de Total
      doc.setFillColor(226, 232, 240);
      doc.rect(left, y, tableW, 18, 'F');
      doc.setFont('helvetica', 'bold');
      doc.text('TOTAL CONSOLIDADO', left + 10, y + 12);
      doc.text(Number(t.total_abastecimentos).toLocaleString('pt-BR'), left + 130, y + 12, { align: 'right' });
      doc.text(`${Number(t.litros).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} L`, left + 220, y + 12, { align: 'right' });
      doc.text(`R$ ${Number(t.valor_total).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, left + 340, y + 12, { align: 'right' });
      doc.text(`R$ ${(Number(t.valor_total) / Number(t.litros)).toFixed(3).replace('.', ',')}`, left + 420, y + 12, { align: 'right' });
      doc.text(`R$ ${Number(t.valor_recebido).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, left + 530, y + 12, { align: 'right' });
      doc.text(`R$ ${Number(t.valor_pendente).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, left + 640, y + 12, { align: 'right' });
      doc.text(`${this.pctRecebido(t.valor_recebido, t.valor_total).toFixed(1)}%`, left + tableW - 14, y + 12, { align: 'right' });
      y += 28;

      // -----------------------------------------------------------------------
      // INSERÇÃO DOS GRÁFICOS NO PDF (PÁGINA 1)
      // -----------------------------------------------------------------------
      const canvasFiliais = this.chartFiliaisRef?.nativeElement;
      const canvasSegmento = this.chartSegmentoRef?.nativeElement;
      const canvasBaixas = this.chartBaixasRef?.nativeElement;

      if (canvasFiliais && canvasSegmento && canvasBaixas) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11);
        doc.setTextColor(27, 54, 93);
        doc.text('Gráficos Gerenciais de Apoio', left, y);
        y += 8;

        const imgFiliais = canvasFiliais.toDataURL('image/png');
        const imgSegmento = canvasSegmento.toDataURL('image/png');
        const imgBaixas = canvasBaixas.toDataURL('image/png');

        // Layout: Gráfico Barras (420 pt de largura) + 2 Donuts lado a lado (165 pt cada)
        doc.addImage(imgFiliais, 'PNG', left, y, 410, 165);
        doc.addImage(imgSegmento, 'PNG', left + 420, y, 165, 165);
        doc.addImage(imgBaixas, 'PNG', left + 595, y, 165, 165);
      }

      // Página 2: Quebra por Filial e Segmento
      doc.addPage('a4', 'landscape');
      y = 40;

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(13);
      doc.setTextColor(27, 54, 93);
      doc.text('2. Demonstrativo por Filial (Matriz vs Viana)', left, y);
      y += 14;

      doc.setFillColor(44, 62, 80);
      doc.rect(left, y, tableW, 18, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(255, 255, 255);

      const fCols = [
        { title: 'Mês', x: left + 10, align: 'left' },
        { title: 'Filial', x: left + 110, align: 'left' },
        { title: 'Abastecimentos', x: left + 220, align: 'right' },
        { title: 'Volume (L)', x: left + 320, align: 'right' },
        { title: 'Faturamento Total (R$)', x: left + 460, align: 'right' },
        { title: 'Preço Médio/L', x: left + 550, align: 'right' },
        { title: 'Recebido (R$)', x: left + 660, align: 'right' },
        { title: 'Pendente (R$)', x: left + tableW - 14, align: 'right' },
      ];
      fCols.forEach(c => doc.text(c.title, c.x, y + 12, { align: c.align as any }));
      y += 18;

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      this.porFilial().forEach((f, idx) => {
        if (idx % 2 === 0) {
          doc.setFillColor(248, 250, 252);
          doc.rect(left, y, tableW, 15, 'F');
        }
        doc.setTextColor(15, 23, 42);
        doc.text(this.formatMes(f.mes), left + 10, y + 10);
        doc.text(f.local, left + 110, y + 10);
        doc.text(Number(f.total_abastecimentos).toLocaleString('pt-BR'), left + 220, y + 10, { align: 'right' });
        doc.text(`${Number(f.litros).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} L`, left + 320, y + 10, { align: 'right' });
        doc.text(`R$ ${Number(f.valor_total).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, left + 460, y + 10, { align: 'right' });
        doc.text(`R$ ${Number(f.preco_medio).toFixed(3).replace('.', ',')}`, left + 550, y + 10, { align: 'right' });
        doc.text(`R$ ${Number(f.valor_recebido).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, left + 660, y + 10, { align: 'right' });
        doc.text(`R$ ${Number(f.valor_pendente).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, left + tableW - 14, y + 10, { align: 'right' });
        y += 15;
      });
      y += 24;

      // Tabela de Segmentos na Página 2
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(13);
      doc.setTextColor(27, 54, 93);
      doc.text('3. Faturamento por Segmento (Frota Própria vs Terceiros)', left, y);
      y += 14;

      doc.setFillColor(30, 41, 59);
      doc.rect(left, y, tableW, 18, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(255, 255, 255);

      const sCols = [
        { title: 'Mês', x: left + 10, align: 'left' },
        { title: 'Segmento', x: left + 110, align: 'left' },
        { title: 'Abastecimentos', x: left + 230, align: 'right' },
        { title: 'Volume (L)', x: left + 330, align: 'right' },
        { title: 'Faturamento Total (R$)', x: left + 460, align: 'right' },
        { title: 'Preço Médio/L', x: left + 550, align: 'right' },
        { title: 'Recebido (R$)', x: left + 660, align: 'right' },
        { title: 'Pendente (R$)', x: left + tableW - 14, align: 'right' },
      ];
      sCols.forEach(c => doc.text(c.title, c.x, y + 12, { align: c.align as any }));
      y += 18;

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      this.porSegmento().forEach((s, idx) => {
        if (idx % 2 === 0) {
          doc.setFillColor(248, 250, 252);
          doc.rect(left, y, tableW, 15, 'F');
        }
        doc.setTextColor(15, 23, 42);
        doc.text(this.formatMes(s.mes), left + 10, y + 10);
        doc.text(s.segmento, left + 110, y + 10);
        doc.text(Number(s.total_abastecimentos).toLocaleString('pt-BR'), left + 230, y + 10, { align: 'right' });
        doc.text(`${Number(s.litros).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} L`, left + 330, y + 10, { align: 'right' });
        doc.text(`R$ ${Number(s.valor_total).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, left + 460, y + 10, { align: 'right' });
        doc.text(`R$ ${Number(s.preco_medio).toFixed(3).replace('.', ',')}`, left + 550, y + 10, { align: 'right' });
        doc.text(`R$ ${Number(s.valor_recebido).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, left + 660, y + 10, { align: 'right' });
        doc.text(`R$ ${Number(s.valor_pendente).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, left + tableW - 14, y + 10, { align: 'right' });
        y += 15;
      });

      // Página 3: Ranking Top 15 Proprietários
      doc.addPage('a4', 'landscape');
      y = 40;

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(13);
      doc.setTextColor(27, 54, 93);
      doc.text('4. Ranking dos Maiores Proprietários / Clientes (Top 15)', left, y);
      y += 14;

      doc.setFillColor(27, 54, 93);
      doc.rect(left, y, tableW, 18, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(255, 255, 255);

      const pCols = [
        { title: '#', x: left + 10, align: 'left' },
        { title: 'Proprietário / Razão Social', x: left + 40, align: 'left' },
        { title: 'Abastecimentos', x: left + 260, align: 'right' },
        { title: 'Volume Total (L)', x: left + 370, align: 'right' },
        { title: 'Faturamento Total (R$)', x: left + 490, align: 'right' },
        { title: 'Part. %', x: left + 560, align: 'right' },
        { title: 'Recebido (R$)', x: left + 660, align: 'right' },
        { title: 'Pendente (R$)', x: left + tableW - 14, align: 'right' },
      ];
      pCols.forEach(c => doc.text(c.title, c.x, y + 12, { align: c.align as any }));
      y += 18;

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      this.topProprietarios().slice(0, 15).forEach((p, idx) => {
        if (idx % 2 === 0) {
          doc.setFillColor(248, 250, 252);
          doc.rect(left, y, tableW, 16, 'F');
        }
        doc.setTextColor(15, 23, 42);
        doc.text(`${idx + 1}º`, left + 10, y + 11);
        doc.text(p.proprietario, left + 40, y + 11);
        doc.text(Number(p.total_abastecimentos).toLocaleString('pt-BR'), left + 260, y + 11, { align: 'right' });
        doc.text(`${Number(p.litros).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} L`, left + 370, y + 11, { align: 'right' });
        doc.text(`R$ ${Number(p.valor_total).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, left + 490, y + 11, { align: 'right' });
        doc.text(`${this.pctRecebido(p.valor_total, t.valor_total).toFixed(1)}%`, left + 560, y + 11, { align: 'right' });
        doc.text(`R$ ${Number(p.valor_recebido).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, left + 660, y + 11, { align: 'right' });
        doc.text(`R$ ${Number(p.valor_pendente).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, left + tableW - 14, y + 11, { align: 'right' });
        y += 16;
      });

      // Rodapé em todas as páginas
      const totalPages = (doc as any).internal.getNumberOfPages();
      for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(148, 163, 184);
        doc.setDrawColor(203, 213, 225);
        doc.setLineWidth(0.5);
        doc.line(left, pageHeight - 28, pageWidth - left, pageHeight - 28);
        doc.text(`Documento Gerencial Confidencial — Sistema de Gestão de Abastecimento VIPE`, left, pageHeight - 16);
        doc.text(`Página ${i} de ${totalPages}`, pageWidth - left, pageHeight - 16, { align: 'right' });
      }

      const dataHoje = new Date().toISOString().slice(0, 10);
      doc.save(`Relatorio_Faturamento_Mensal_${dataHoje}.pdf`);
      this.toastr.success('Relatório PDF com gráficos gerado com sucesso!');
    } catch (err) {
      console.error('Erro ao exportar PDF:', err);
      this.toastr.error('Falha ao gerar relatório PDF.');
    }
  }
}
