// src/app/features/relatorios/relatorios.component.ts
import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';
import { ToastrService } from 'ngx-toastr';
import { Proprietario, Veiculo, Abastecimento } from '../../shared/models';

@Component({
  selector: 'app-relatorios',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="page">
      <div class="page-header">
        <div>
          <h1>Relatórios</h1>
          <p>Relatório de abastecimentos por proprietário</p>
        </div>
      </div>

      <!-- Filtros -->
      <div class="filters-card">
        <div class="filters-grid">
          <div class="filter-field required">
            <label>Proprietário <span class="req">*</span></label>
            <select [(ngModel)]="filters.id_proprietario" (change)="onProprietarioChange()">
              <option value="">Selecione o proprietário...</option>
              @for (p of proprietarios(); track p.id_proprietario) {
                <option [value]="p.id_proprietario">{{ p.nome }}</option>
              }
            </select>
          </div>
          <div class="filter-field">
            <label>Veículo</label>
            <select [(ngModel)]="filters.id_veiculo">
              <option value="">Todos</option>
              @for (v of veiculos(); track v.id_veiculo) {
                <option [value]="v.id_veiculo">{{ v.placa }} — {{ v.modelo }}</option>
              }
            </select>
          </div>
          <div class="filter-field">
            <label>Data Início</label>
            <input type="date" [(ngModel)]="filters.data_inicio" />
          </div>
          <div class="filter-field">
            <label>Data Fim</label>
            <input type="date" [(ngModel)]="filters.data_fim" />
          </div>
          <div class="filter-field">
            <label>Status</label>
            <select [(ngModel)]="filters.status">
              <option value="">Todos</option>
              <option value="Confirmado">Confirmado</option>
              <option value="Pendente">Pendente</option>
              <option value="Cancelado">Cancelado</option>
            </select>
          </div>
        </div>
        <div class="filter-actions">
          <button class="btn-search" (click)="load()" [disabled]="!filters.id_proprietario">
            🔍 Gerar Relatório
          </button>
          @if (relatorio()) {
            <button class="btn-pdf" (click)="exportPdf()">
              📄 Exportar PDF
            </button>
          }
        </div>
      </div>

      <!-- Resultado -->
      @if (loading()) {
        <div class="loading-state"><div class="spinner-lg"></div> Gerando relatório...</div>
      }

      @if (relatorio(); as r) {
        <!-- Cabeçalho do relatório -->
        <div class="report-header">
          <div class="report-title">
            <span class="report-label">Proprietário</span>
            <span class="report-name">{{ r.proprietario.nome }}</span>
          </div>
          <div class="totals-row">
            <div class="total-item">
              <span class="total-label">Registros</span>
              <span class="total-value">{{ r.totais.registros }}</span>
            </div>
            <div class="total-item">
              <span class="total-label">Total Litros</span>
              <span class="total-value blue">{{ r.totais.quantidade_litros | number:'1.2-2' }} L</span>
            </div>
            <div class="total-item">
              <span class="total-label">Valor Total</span>
              <span class="total-value green">{{ r.totais.valor_total | currency:'BRL':'symbol':'1.2-2' }}</span>
            </div>
          </div>
        </div>

        <!-- Tabela -->
        <div class="table-card">
          <div class="table-wrap">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Data e Hora</th>
                  <th>Veículo</th>
                  <th>Motorista</th>
                  <th>Combustível</th>
                  <th class="text-right">Qtd (L)</th>
                  <th class="text-right">R$/L</th>
                  <th class="text-right">Total (R$)</th>
                  <th class="text-center">Status</th>
                  <th class="text-center">Baixa</th>
                </tr>
              </thead>
              <tbody>
                @for (a of r.abastecimentos; track a.id_abastecimento) {
                  <tr>
                    <td>{{ a.data_hora | date:'dd/MM/yyyy HH:mm' }}</td>
                    <td>
                      @if (a.veiculo) {
                        <div class="veiculo-cell">
                          <span class="placa-badge">{{ a.veiculo.placa }}</span>
                          <span class="veiculo-model">{{ a.veiculo.modelo }}</span>
                        </div>
                      } @else { — }
                    </td>
                    <td>{{ a.nome_motorista ?? '—' }}</td>
                    <td>{{ a.tipo_combustivel }}</td>
                    <td class="text-right">{{ a.quantidade_litros | number:'1.2-2' }}</td>
                    <td class="text-right">{{ a.valor_por_litro | number:'1.3-3' }}</td>
                    <td class="text-right val-green">{{ a.valor_total | currency:'BRL':'symbol':'1.2-2' }}</td>
                    <td class="text-center">
                      <span class="badge" [class]="getStatusClass(a.status)">{{ a.status ?? '—' }}</span>
                    </td>
                    <td class="text-center">
                      <span class="badge" [class]="a.baixa_abastecimento ? 'badge-green' : 'badge-orange'">
                        {{ a.baixa_abastecimento ? 'Baixado' : 'Pendente' }}
                      </span>
                    </td>
                  </tr>
                }
                @empty {
                  <tr><td colspan="9" class="empty-cell">Nenhum registro encontrado</td></tr>
                }
              </tbody>
              <tfoot>
                <tr class="totals-footer">
                  <td colspan="4"><strong>TOTAIS</strong></td>
                  <td class="text-right"><strong>{{ r.totais.quantidade_litros | number:'1.2-2' }} L</strong></td>
                  <td></td>
                  <td class="text-right val-green"><strong>{{ r.totais.valor_total | currency:'BRL':'symbol':'1.2-2' }}</strong></td>
                  <td colspan="2"></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      }
    </div>
  `,
  styles: [`
    @import url('https://fonts.googleapis.com/css2?family=Rajdhani:wght@700&family=Inter:wght@400;500;600&display=swap');
    * { box-sizing:border-box; }
    .page { padding:28px; font-family:'Inter',sans-serif; color:#e2e8f0; }
    .page-header { margin-bottom:20px; }
    .page-header h1 { font-size:24px; font-weight:700; color:#f8fafc; margin:0; }
    .page-header p { font-size:13px; color:#64748b; margin-top:4px; }

    .filters-card { background:#0d1427; border:1px solid #1e2d4a; border-radius:12px; padding:18px; margin-bottom:16px; }
    .filters-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(190px,1fr)); gap:12px; margin-bottom:14px; }
    .filter-field { display:flex; flex-direction:column; gap:4px; }
    .filter-field label { font-size:11px; font-weight:600; color:#64748b; text-transform:uppercase; letter-spacing:0.5px; display:flex; gap:4px; align-items:center; }
    .req { color:#f87171; }
    .filter-field input, .filter-field select { background:#0a0f1e; border:1px solid #1e2d4a; border-radius:7px; padding:8px 10px; color:#e2e8f0; font-size:12px; outline:none; }
    .filter-field input:focus, .filter-field select:focus { border-color:#0ea5e9; }
    .filter-field select option { background:#0d1427; }

    .filter-actions { display:flex; gap:10px; }
    .btn-search { background:linear-gradient(135deg,#0ea5e9,#6366f1); border:none; border-radius:8px; padding:10px 20px; color:#fff; font-size:13px; font-weight:600; cursor:pointer; }
    .btn-search:disabled { opacity:0.4; cursor:not-allowed; }
    .btn-pdf { background:#0f172a; border:1px solid #1e2d4a; border-radius:8px; padding:10px 16px; color:#e2e8f0; font-size:13px; cursor:pointer; }
    .btn-pdf:hover { border-color:#94a3b8; }

    .loading-state { display:flex;align-items:center;gap:10px;padding:40px;justify-content:center;color:#64748b; }
    .spinner-lg { width:24px;height:24px;border:3px solid #1e2d4a;border-top-color:#0ea5e9;border-radius:50%;animation:spin 0.8s linear infinite; }
    @keyframes spin { to{transform:rotate(360deg);} }

    .report-header { background:#0d1427; border:1px solid #1e2d4a; border-radius:12px; padding:18px; margin-bottom:14px; display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:16px; }
    .report-title { display:flex; flex-direction:column; }
    .report-label { font-size:10px; color:#64748b; text-transform:uppercase; letter-spacing:0.5px; }
    .report-name { font-size:20px; font-weight:700; color:#f8fafc; margin-top:2px; }
    .totals-row { display:flex; gap:20px; }
    .total-item { display:flex; flex-direction:column; }
    .total-label { font-size:10px; color:#64748b; text-transform:uppercase; letter-spacing:0.5px; }
    .total-value { font-size:18px; font-weight:700; color:#f8fafc; }
    .total-value.blue { color:#38bdf8; }
    .total-value.green { color:#4ade80; }

    .table-card { background:#0d1427; border:1px solid #1e2d4a; border-radius:12px; overflow:hidden; }
    .table-wrap { overflow-x:auto; }
    .data-table { width:100%; border-collapse:collapse; font-size:12px; }
    .data-table thead th { padding:10px 12px; text-align:left; font-size:10px; text-transform:uppercase; letter-spacing:0.5px; color:#64748b; border-bottom:1px solid #1e2d4a; background:#080e1c; }
    .data-table tbody td { padding:10px 12px; border-bottom:1px solid #1e2d4a15; }
    .data-table tbody tr:hover td { background:#1e2d4a15; }
    .data-table tfoot td { padding:10px 12px; border-top:1px solid #1e2d4a; }
    .totals-footer { background:#0a0f1e; }
    .text-right { text-align:right; }
    .text-center { text-align:center; }
    .val-green { color:#4ade80; font-weight:600; }

    .veiculo-cell { display:flex; flex-direction:column; gap:2px; }
    .placa-badge { background:#1e2d4a; color:#38bdf8; padding:2px 6px; border-radius:4px; font-size:10px; font-weight:700; font-family:monospace; width:fit-content; }
    .veiculo-model { font-size:10px; color:#64748b; }

    .badge { padding:3px 8px; border-radius:20px; font-size:10px; font-weight:700; text-transform:uppercase; }
    .badge-green { background:#dcfce720; color:#4ade80; }
    .badge-orange { background:#ffedd520; color:#fb923c; }
    .badge-blue { background:#dbeafe20; color:#60a5fa; }
    .badge-yellow { background:#fef9c320; color:#fbbf24; }
    .badge-red { background:#fee2e220; color:#f87171; }
    .empty-cell { text-align:center; padding:32px; color:#475569; }
  `]
})
export class RelatoriosComponent implements OnInit {
  private api = inject(ApiService);
  private toastr = inject(ToastrService);

  proprietarios = signal<Proprietario[]>([]);
  veiculos = signal<Veiculo[]>([]);
  relatorio = signal<any | null>(null);
  loading = signal(false);

  filters: any = { id_proprietario:'', id_veiculo:'', data_inicio:'', data_fim:'', status:'' };

  ngOnInit() {
    this.api.getProprietariosAll().subscribe(r => this.proprietarios.set(r.data));
  }

  onProprietarioChange() {
    const id = this.filters.id_proprietario;
    this.veiculos.set([]);
    this.filters.id_veiculo = '';
    if (id) {
      this.api.getVeiculosByProprietario(id).subscribe(v => this.veiculos.set(v));
    }
  }

  load() {
    if (!this.filters.id_proprietario) { this.toastr.warning('Selecione um proprietário'); return; }
    this.loading.set(true);
    this.api.getRelatorioProprietario(this.filters).subscribe({
      next: r => { this.relatorio.set(r); this.loading.set(false); },
      error: () => { this.toastr.error('Erro ao gerar relatório'); this.loading.set(false); }
    });
  }

  exportPdf() {
    const token = localStorage.getItem('ft_token');
    const url = this.api.getRelatorioProprietarioPdfUrl(this.filters) + `&token=${token}`;
    window.open(url, '_blank');
  }

  getStatusClass(status?: string): string {
    if (status === 'Confirmado') return 'badge badge-blue';
    if (status === 'Cancelado') return 'badge badge-red';
    return 'badge badge-yellow';
  }
}
