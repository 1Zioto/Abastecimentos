import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';
import { ToastrService } from 'ngx-toastr';

interface AuditoriaItem {
  id: number;
  tabela: string;
  registro_id: string;
  acao: string;
  campo?: string | null;
  valor_anterior?: string | null;
  valor_novo?: string | null;
  usuario_id?: string | null;
  usuario_nome?: string | null;
  created_at: string;
}

@Component({
  selector: 'app-historico-alteracoes',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="page">
      <div class="page-header">
        <div>
          <h1>Histórico de alterações</h1>
          <p>Modificações, exclusões e restaurações registradas no servidor</p>
        </div>
        <button class="btn-primary" (click)="load()">Atualizar</button>
      </div>

      <section class="filters">
        <label>
          <span>Ação</span>
          <select [(ngModel)]="filters.acao" (change)="load()">
            <option value="">Todas</option>
            <option value="update">Modificações</option>
            <option value="delete">Exclusões</option>
            <option value="restore">Restaurações</option>
          </select>
        </label>
        <label>
          <span>Tela / tabela</span>
          <select [(ngModel)]="filters.tabela" (change)="load()">
            <option value="">Todas</option>
            @for (table of tabelas; track table.value) {
              <option [value]="table.value">{{ table.label }}</option>
            }
          </select>
        </label>
        <label>
          <span>ID do registro</span>
          <input type="text" [(ngModel)]="filters.registro_id" placeholder="Ex: placa, uuid, id..." (keyup.enter)="load()" />
        </label>
        <label>
          <span>Itens por página</span>
          <select [(ngModel)]="filters.per_page" (change)="load()">
            <option [ngValue]="25">25</option>
            <option [ngValue]="50">50</option>
            <option [ngValue]="100">100</option>
          </select>
        </label>
      </section>

      <section class="summary">
        <div>
          <span>Total encontrado</span>
          <strong>{{ total() }}</strong>
        </div>
        <div>
          <span>Página</span>
          <strong>{{ page() }} / {{ lastPage() }}</strong>
        </div>
      </section>

      <div class="table-card">
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Data/hora</th>
                <th>Ação</th>
                <th>Tabela</th>
                <th>Registro</th>
                <th>Campo</th>
                <th>Antes</th>
                <th>Depois</th>
                <th>Usuário</th>
              </tr>
            </thead>
            <tbody>
              @for (item of items(); track item.id) {
                <tr [class.delete-row]="item.acao === 'delete'" [class.restore-row]="item.acao === 'restore'">
                  <td class="nowrap">{{ item.created_at | date:'dd/MM/yyyy HH:mm:ss' }}</td>
                  <td><span class="badge" [class]="badgeClass(item.acao)">{{ acaoLabel(item.acao) }}</span></td>
                  <td>{{ tabelaLabel(item.tabela) }}</td>
                  <td><code>{{ item.registro_id }}</code></td>
                  <td>{{ item.campo || 'Registro' }}</td>
                  <td><pre>{{ prettyValue(item.valor_anterior) }}</pre></td>
                  <td><pre>{{ prettyValue(item.valor_novo) }}</pre></td>
                  <td>{{ item.usuario_nome || 'Sistema' }}</td>
                </tr>
              }
              @empty {
                <tr><td colspan="8" class="empty">Nenhum histórico encontrado</td></tr>
              }
            </tbody>
          </table>
        </div>
      </div>

      <div class="pager">
        <button class="btn-secondary" [disabled]="page() <= 1 || loading()" (click)="go(page() - 1)">Anterior</button>
        <button class="btn-secondary" [disabled]="page() >= lastPage() || loading()" (click)="go(page() + 1)">Próxima</button>
      </div>
    </div>
  `,
  styles: [`
    * { box-sizing: border-box; }
    .page { padding: 28px; color: #111827; }
    .page-header { display:flex; justify-content:space-between; align-items:flex-start; gap:16px; margin-bottom:18px; }
    h1 { margin:0; font-size:26px; line-height:1.1; }
    p { margin:6px 0 0; color:#64748b; font-size:13px; }
    .btn-primary, .btn-secondary { border:0; border-radius:8px; padding:10px 16px; font-weight:700; cursor:pointer; }
    .btn-primary { color:#fff; background:linear-gradient(135deg,#0ea5e9,#6366f1); }
    .btn-secondary { color:#111827; background:#fff; border:1px solid #d6dee8; }
    .btn-secondary:disabled { opacity:.45; cursor:not-allowed; }
    .filters { display:grid; grid-template-columns: repeat(4, minmax(160px, 1fr)); gap:12px; background:#fff; border:1px solid #d6dee8; border-radius:10px; padding:16px; margin-bottom:14px; }
    label { display:flex; flex-direction:column; gap:6px; }
    label span { color:#52657f; font-size:11px; font-weight:800; text-transform:uppercase; letter-spacing:.4px; }
    input, select { height:38px; border:1px solid #cbd5e1; border-radius:8px; padding:0 10px; background:#fff; color:#111827; outline:none; font-size:13px; }
    input:focus, select:focus { border-color:#0ea5e9; box-shadow:0 0 0 3px rgba(14,165,233,.12); }
    .summary { display:flex; gap:12px; margin-bottom:14px; }
    .summary div { min-width:160px; background:#fff; border:1px solid #d6dee8; border-radius:10px; padding:12px 14px; }
    .summary span { display:block; color:#64748b; font-size:11px; font-weight:800; text-transform:uppercase; }
    .summary strong { display:block; margin-top:4px; font-size:22px; }
    .table-card { background:#fff; border:1px solid #d6dee8; border-radius:10px; overflow:hidden; }
    .table-wrap { overflow:auto; max-height: calc(100vh - 300px); }
    table { width:100%; border-collapse:collapse; font-size:12px; min-width:1120px; }
    th { position:sticky; top:0; z-index:1; background:#f8fafc; color:#52657f; text-align:left; text-transform:uppercase; letter-spacing:.4px; font-size:11px; padding:10px 12px; border-bottom:1px solid #d6dee8; }
    td { vertical-align:top; padding:10px 12px; border-bottom:1px solid #eef2f7; }
    tr:hover td { background:#f8fafc; }
    .delete-row td { background:#fff7ed; }
    .restore-row td { background:#f0fdf4; }
    code { color:#075985; background:#e0f2fe; border-radius:5px; padding:2px 6px; font-size:11px; }
    pre { max-width:280px; max-height:96px; overflow:auto; white-space:pre-wrap; word-break:break-word; margin:0; color:#334155; font-family:Consolas, monospace; font-size:11px; line-height:1.35; }
    .nowrap { white-space:nowrap; }
    .badge { display:inline-flex; align-items:center; border-radius:999px; padding:4px 9px; font-size:10px; font-weight:900; text-transform:uppercase; }
    .badge-update { background:#dbeafe; color:#1d4ed8; }
    .badge-delete { background:#fed7aa; color:#c2410c; }
    .badge-restore { background:#dcfce7; color:#15803d; }
    .empty { text-align:center; padding:36px; color:#64748b; }
    .pager { display:flex; justify-content:flex-end; gap:10px; padding:14px 0; }
    @media (max-width: 900px) {
      .page { padding:18px; }
      .page-header { flex-direction:column; }
      .filters { grid-template-columns:1fr; }
      .summary { flex-direction:column; }
      .table-wrap { max-height:none; }
    }
  `]
})
export class HistoricoAlteracoesComponent implements OnInit {
  private api = inject(ApiService);
  private toastr = inject(ToastrService);

  items = signal<AuditoriaItem[]>([]);
  loading = signal(false);
  page = signal(1);
  lastPage = signal(1);
  total = signal(0);

  filters = {
    acao: '',
    tabela: '',
    registro_id: '',
    per_page: 50,
  };

  tabelas = [
    { value: 'abastecimentos', label: 'Abastecimentos' },
    { value: 'proprietarios', label: 'Proprietários' },
    { value: 'veiculos', label: 'Veículos' },
    { value: 'motoristas', label: 'Motoristas' },
    { value: 'usuarios', label: 'Usuários' },
    { value: 'baixa_abastecimento', label: 'Baixas' },
    { value: 'entrada_notas', label: 'Entrada de notas' },
  ];

  ngOnInit() {
    this.load();
  }

  load(page = 1) {
    this.loading.set(true);
    this.api.getAuditoria({ ...this.filters, page }).subscribe({
      next: (res) => {
        this.items.set((res.data ?? []) as AuditoriaItem[]);
        this.page.set(res.current_page ?? page);
        this.lastPage.set(res.last_page ?? 1);
        this.total.set(res.total ?? 0);
      },
      error: (err) => this.toastr.error(err.error?.message ?? 'Erro ao carregar histórico'),
      complete: () => this.loading.set(false),
    });
  }

  go(page: number) {
    if (page < 1 || page > this.lastPage()) return;
    this.load(page);
  }

  acaoLabel(acao: string) {
    return ({ update: 'Modificação', delete: 'Exclusão', restore: 'Restauração' } as Record<string, string>)[acao] ?? acao;
  }

  badgeClass(acao: string) {
    return `badge-${acao}`;
  }

  tabelaLabel(tabela: string) {
    return this.tabelas.find(t => t.value === tabela)?.label ?? tabela;
  }

  prettyValue(value?: string | null) {
    if (value === null || value === undefined || value === '') return '—';
    try {
      return JSON.stringify(JSON.parse(value), null, 2);
    } catch {
      return value;
    }
  }
}
