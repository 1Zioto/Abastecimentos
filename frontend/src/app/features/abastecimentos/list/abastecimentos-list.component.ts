// src/app/features/abastecimentos/list/abastecimentos-list.component.ts
import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../../core/services/api.service';
import { ToastrService } from 'ngx-toastr';
import { Abastecimento, Proprietario } from '../../../shared/models';

@Component({
  selector: 'app-abastecimentos-list',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule],
  template: `
    <div class="page">
      <div class="page-header">
        <div>
          <h1>Abastecimentos</h1>
          <p>{{ pagination().total }} registros encontrados</p>
        </div>
        <a routerLink="/abastecimentos/novo" class="btn-primary">+ Novo Abastecimento</a>
      </div>

      <!-- Filtros -->
      <div class="filters-card">
        <div class="filters-grid">
          <div class="filter-field">
            <label>Proprietário</label>
            <select [(ngModel)]="filters.id_proprietario" (change)="load()">
              <option value="">Todos</option>
              @for (p of proprietarios(); track p.id_proprietario) {
                <option [value]="p.id_proprietario">{{ p.nome }}</option>
              }
            </select>
          </div>
          <div class="filter-field">
            <label>Placa</label>
            <input type="text" [(ngModel)]="filters.placa" placeholder="ABC-1234" (input)="load()" />
          </div>
          <div class="filter-field">
            <label>Data Início</label>
            <input type="date" [(ngModel)]="filters.data_inicio" (change)="load()" />
          </div>
          <div class="filter-field">
            <label>Data Fim</label>
            <input type="date" [(ngModel)]="filters.data_fim" (change)="load()" />
          </div>
          <div class="filter-field">
            <label>Status</label>
            <select [(ngModel)]="filters.status" (change)="load()">
              <option value="">Todos</option>
              <option value="Confirmado">Confirmado</option>
              <option value="Pendente">Pendente</option>
              <option value="Cancelado">Cancelado</option>
            </select>
          </div>
          <div class="filter-field">
            <label>Combustível</label>
            <select [(ngModel)]="filters.tipo_combustivel" (change)="load()">
              <option value="">Todos</option>
              @for (t of tiposCombustivel; track t) {
                <option [value]="t">{{ t }}</option>
              }
            </select>
          </div>
        </div>
        <button class="btn-clear" (click)="clearFilters()">Limpar Filtros</button>
      </div>

      <!-- Tabela -->
      <div class="table-card">
        @if (loading()) {
          <div class="loading-state"><div class="spinner-lg"></div> Carregando...</div>
        } @else {
          <div class="table-wrap">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Data/Hora</th>
                  <th>Placa</th>
                  <th>Proprietário</th>
                  <th>Motorista</th>
                  <th>Combustível</th>
                  <th class="text-right">Qtd (L)</th>
                  <th class="text-right">R$/L</th>
                  <th class="text-right">Total</th>
                  <th>Status</th>
                  <th>Baixa</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                @for (a of abastecimentos(); track a.id_abastecimento) {
                  <tr>
                    <td class="dt-cell">
                      <span class="dt-date">{{ a.data | date:'dd/MM/yyyy' }}</span>
                      <span class="dt-time">{{ a.data_hora | date:'HH:mm' }}</span>
                    </td>
                    <td><span class="placa-badge">{{ a.veiculo?.placa ?? '—' }}</span></td>
                    <td>{{ a.nome_proprietario ?? '—' }}</td>
                    <td>{{ a.nome_motorista ?? '—' }}</td>
                    <td>{{ a.tipo_combustivel }}</td>
                    <td class="text-right">{{ a.quantidade_litros | number:'1.2-2' }}</td>
                    <td class="text-right">{{ a.valor_por_litro | number:'1.3-3' }}</td>
                    <td class="text-right val-green">{{ a.valor_total | currency:'BRL':'symbol':'1.2-2' }}</td>
                    <td>
                      <span class="badge" [class]="getStatusClass(a.status)">{{ a.status ?? '—' }}</span>
                    </td>
                    <td>
                      <span class="badge" [class]="a.baixa_abastecimento ? 'badge-green' : 'badge-orange'">
                        {{ a.baixa_abastecimento ? 'Baixado' : 'Pendente' }}
                      </span>
                    </td>
                    <td>
                      <div class="actions">
                        <a [routerLink]="['/abastecimentos', a.id_abastecimento, 'editar']"
                           class="action-btn edit" title="Editar">✏️</a>
                        <button class="action-btn print" title="Comprovante"
                                (click)="printComprovante(a.id_abastecimento)">🖨️</button>
                        <button class="action-btn del" title="Excluir"
                                (click)="confirmDelete(a)">🗑️</button>
                      </div>
                    </td>
                  </tr>
                }
                @empty {
                  <tr><td colspan="11" class="empty-cell">Nenhum abastecimento encontrado</td></tr>
                }
              </tbody>
            </table>
          </div>

          <!-- Paginação -->
          <div class="pagination">
            <span class="page-info">
              Exibindo {{ pagination().from }}–{{ pagination().to }} de {{ pagination().total }}
            </span>
            <div class="page-btns">
              <button [disabled]="pagination().current_page === 1"
                      (click)="goToPage(pagination().current_page - 1)">‹</button>
              @for (p of pages(); track p) {
                <button [class.active]="p === pagination().current_page"
                        (click)="goToPage(p)">{{ p }}</button>
              }
              <button [disabled]="pagination().current_page === pagination().last_page"
                      (click)="goToPage(pagination().current_page + 1)">›</button>
            </div>
          </div>
        }
      </div>

      <!-- Confirm Delete Modal -->
      @if (deleteTarget()) {
        <div class="modal-overlay" (click)="deleteTarget.set(null)">
          <div class="modal" (click)="$event.stopPropagation()">
            <h3>Confirmar Exclusão</h3>
            <p>Tem certeza que deseja excluir o abastecimento de
              <strong>{{ deleteTarget()?.nome_proprietario }}</strong>
              em <strong>{{ deleteTarget()?.data | date:'dd/MM/yyyy' }}</strong>?
            </p>
            <p class="warning-text">⚠️ Baixas vinculadas também serão removidas.</p>
            <div class="modal-actions">
              <button class="btn-cancel" (click)="deleteTarget.set(null)">Cancelar</button>
              <button class="btn-danger" (click)="executeDelete()" [disabled]="deleting()">
                {{ deleting() ? 'Excluindo...' : 'Excluir' }}
              </button>
            </div>
          </div>
        </div>
      }
    </div>
  `,
  styles: [`
    @import url('https://fonts.googleapis.com/css2?family=Rajdhani:wght@700&family=Inter:wght@400;500;600&display=swap');
    * { box-sizing: border-box; }
    .page { padding: 28px; font-family: 'Inter', sans-serif; color: #e2e8f0; }
    .page-header { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:20px; }
    .page-header h1 { font-size:24px; font-weight:700; color:#f8fafc; margin:0; }
    .page-header p { font-size:12px; color:#64748b; margin-top:4px; }

    .btn-primary { background:linear-gradient(135deg,#0ea5e9,#6366f1); border:none; border-radius:8px; padding:10px 20px; color:#fff; font-size:13px; font-weight:600; cursor:pointer; text-decoration:none; transition:all 0.2s; }
    .btn-primary:hover { opacity:0.9; }

    .filters-card { background:#0d1427; border:1px solid #1e2d4a; border-radius:12px; padding:18px; margin-bottom:16px; }
    .filters-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(180px,1fr)); gap:12px; margin-bottom:12px; }
    .filter-field { display:flex; flex-direction:column; gap:4px; }
    .filter-field label { font-size:11px; font-weight:600; color:#64748b; text-transform:uppercase; letter-spacing:0.5px; }
    .filter-field input, .filter-field select {
      background:#0a0f1e; border:1px solid #1e2d4a; border-radius:7px;
      padding:8px 10px; color:#e2e8f0; font-size:12px; outline:none;
    }
    .filter-field input:focus, .filter-field select:focus { border-color:#0ea5e9; }
    .filter-field select option { background:#0d1427; }
    .btn-clear { background:transparent; border:1px solid #1e2d4a; color:#64748b; padding:6px 14px; border-radius:6px; font-size:12px; cursor:pointer; }
    .btn-clear:hover { border-color:#94a3b8; color:#94a3b8; }

    .table-card { background:#0d1427; border:1px solid #1e2d4a; border-radius:12px; overflow:hidden; }
    .loading-state { display:flex; align-items:center; gap:10px; padding:40px; justify-content:center; color:#64748b; }
    .spinner-lg { width:24px;height:24px;border:3px solid #1e2d4a;border-top-color:#0ea5e9;border-radius:50%;animation:spin 0.8s linear infinite; }
    @keyframes spin { to{transform:rotate(360deg);} }

    .table-wrap { overflow-x:auto; }
    .data-table { width:100%; border-collapse:collapse; font-size:12px; }
    .data-table thead th { padding:10px 12px; text-align:left; font-size:10px; text-transform:uppercase; letter-spacing:0.5px; color:#64748b; border-bottom:1px solid #1e2d4a; white-space:nowrap; background:#080e1c; }
    .data-table tbody td { padding:10px 12px; border-bottom:1px solid #1e2d4a20; vertical-align:middle; }
    .data-table tbody tr:hover td { background:#1e2d4a15; }
    .text-right { text-align:right; }

    .dt-cell { display:flex; flex-direction:column; }
    .dt-date { font-weight:600; color:#e2e8f0; }
    .dt-time { font-size:11px; color:#64748b; }

    .placa-badge { background:#1e2d4a; color:#38bdf8; padding:3px 8px; border-radius:5px; font-size:11px; font-weight:700; font-family:monospace; }
    .val-green { color:#4ade80; font-weight:600; }

    .badge { padding:3px 8px; border-radius:20px; font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:0.3px; }
    .badge-blue { background:#dbeafe20; color:#60a5fa; }
    .badge-yellow { background:#fef9c320; color:#fbbf24; }
    .badge-red { background:#fee2e220; color:#f87171; }
    .badge-green { background:#dcfce720; color:#4ade80; }
    .badge-orange { background:#ffedd520; color:#fb923c; }

    .actions { display:flex; gap:6px; }
    .action-btn { background:transparent; border:none; cursor:pointer; font-size:14px; padding:4px 6px; border-radius:5px; transition:background 0.2s; text-decoration:none; }
    .action-btn:hover { background:#1e2d4a; }

    .empty-cell { text-align:center; padding:32px; color:#475569; }

    .pagination { display:flex; align-items:center; justify-content:space-between; padding:14px 16px; border-top:1px solid #1e2d4a; }
    .page-info { font-size:12px; color:#64748b; }
    .page-btns { display:flex; gap:4px; }
    .page-btns button { background:#0a0f1e; border:1px solid #1e2d4a; color:#64748b; padding:4px 10px; border-radius:5px; cursor:pointer; font-size:12px; transition:all 0.2s; }
    .page-btns button:hover:not(:disabled) { border-color:#0ea5e9; color:#38bdf8; }
    .page-btns button.active { background:#0ea5e920; border-color:#0ea5e9; color:#38bdf8; }
    .page-btns button:disabled { opacity:0.4; cursor:not-allowed; }

    .modal-overlay { position:fixed; inset:0; background:rgba(0,0,0,0.7); display:flex; align-items:center; justify-content:center; z-index:1000; }
    .modal { background:#0d1427; border:1px solid #1e2d4a; border-radius:14px; padding:28px; max-width:420px; width:90%; }
    .modal h3 { font-size:16px; font-weight:700; color:#f8fafc; margin:0 0 12px; }
    .modal p { font-size:13px; color:#94a3b8; margin-bottom:10px; }
    .warning-text { color:#fbbf24 !important; }
    .modal-actions { display:flex; gap:10px; justify-content:flex-end; margin-top:20px; }
    .btn-cancel { background:transparent; border:1px solid #1e2d4a; color:#64748b; padding:8px 16px; border-radius:7px; cursor:pointer; font-size:13px; }
    .btn-danger { background:#dc2626; border:none; color:#fff; padding:8px 16px; border-radius:7px; cursor:pointer; font-size:13px; font-weight:600; }
    .btn-danger:disabled { opacity:0.5; }
  `]
})
export class AbastecimentosListComponent implements OnInit {
  private api = inject(ApiService);
  private toastr = inject(ToastrService);

  abastecimentos = signal<Abastecimento[]>([]);
  proprietarios = signal<Proprietario[]>([]);
  loading = signal(true);
  deleting = signal(false);
  deleteTarget = signal<Abastecimento | null>(null);
  pagination = signal({ current_page: 1, last_page: 1, per_page: 20, total: 0, from: 0, to: 0 });

  tiposCombustivel = ['Diesel S10','Diesel Comum','Gasolina Comum','Gasolina Aditivada','Etanol','GNV','Arla 32'];

  filters: any = {
    id_proprietario: '', placa: '', data_inicio: '', data_fim: '', status: '', tipo_combustivel: '', page: 1
  };

  ngOnInit() {
    this.api.getProprietariosAll().subscribe(r => this.proprietarios.set(r.data));
    this.load();
  }

  load() {
    this.loading.set(true);
    this.api.getAbastecimentos({ ...this.filters, per_page: 20 }).subscribe({
      next: r => {
        this.abastecimentos.set(r.data);
        this.pagination.set({ current_page: r.current_page, last_page: r.last_page, per_page: r.per_page, total: r.total, from: r.from ?? 0, to: r.to ?? 0 });
        this.loading.set(false);
      },
      error: () => this.loading.set(false)
    });
  }

  clearFilters() {
    this.filters = { id_proprietario:'',placa:'',data_inicio:'',data_fim:'',status:'',tipo_combustivel:'',page:1 };
    this.load();
  }

  goToPage(p: number) {
    this.filters.page = p;
    this.load();
  }

  pages(): number[] {
    const { current_page, last_page } = this.pagination();
    const start = Math.max(1, current_page - 2);
    const end = Math.min(last_page, current_page + 2);
    return Array.from({ length: end - start + 1 }, (_, i) => start + i);
  }

  getStatusClass(status?: string): string {
    if (status === 'Confirmado') return 'badge badge-blue';
    if (status === 'Cancelado') return 'badge badge-red';
    return 'badge badge-yellow';
  }

  printComprovante(id: string) {
    window.open(this.api.getComprovantePdfUrl(id) + `?token=${localStorage.getItem('ft_token')}`, '_blank');
  }

  confirmDelete(a: Abastecimento) { this.deleteTarget.set(a); }

  executeDelete() {
    const target = this.deleteTarget();
    if (!target) return;
    this.deleting.set(true);
    this.api.deleteAbastecimento(target.id_abastecimento).subscribe({
      next: () => {
        this.toastr.success('Abastecimento excluído');
        this.deleteTarget.set(null);
        this.deleting.set(false);
        this.load();
      },
      error: err => {
        this.toastr.error(err.error?.message ?? 'Erro ao excluir');
        this.deleting.set(false);
      }
    });
  }
}
