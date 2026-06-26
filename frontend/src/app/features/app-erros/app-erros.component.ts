import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';
import { ToastrService } from 'ngx-toastr';

interface AppErroItem {
  id: number;
  level: string;
  tipo?: string | null;
  origem?: string | null;
  tela?: string | null;
  mensagem: string;
  detalhe?: string | null;
  stack_trace?: string | null;
  contexto?: string | null;
  app_version?: string | null;
  platform?: string | null;
  os_version?: string | null;
  usuario_nome?: string | null;
  usuario_id?: string | null;
  created_at: string;
}

@Component({
  selector: 'app-erros',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="page">
      <div class="page-header">
        <div>
          <h1>Erros do App</h1>
          <p>Falhas enviadas automaticamente pelo APK e pela sincronização</p>
        </div>
        <div class="actions">
          <button class="btn-secondary" (click)="load()">Atualizar</button>
          <button class="btn-danger" (click)="clear()" [disabled]="loading()">Limpar</button>
        </div>
      </div>

      <section class="filters">
        <label>
          <span>Nível</span>
          <select [(ngModel)]="filters.level" (change)="load()">
            <option value="">Todos</option>
            <option value="error">Erro</option>
            <option value="warn">Aviso</option>
            <option value="info">Info</option>
          </select>
        </label>
        <label>
          <span>Tipo</span>
          <select [(ngModel)]="filters.tipo" (change)="load()">
            <option value="">Todos</option>
            <option value="sync">Sincronização</option>
            <option value="soft_crash">Tela fechando / crash</option>
            <option value="abastecimento_save">Cadastro de abastecimento</option>
            <option value="auth_logout">Sessão/login</option>
          </select>
        </label>
        <label>
          <span>Usuário</span>
          <input type="text" [(ngModel)]="filters.usuario" placeholder="Nome ou ID" (keyup.enter)="load()" />
        </label>
        <label>
          <span>Itens</span>
          <select [(ngModel)]="filters.per_page" (change)="load()">
            <option [ngValue]="25">25</option>
            <option [ngValue]="50">50</option>
            <option [ngValue]="100">100</option>
          </select>
        </label>
      </section>

      <section class="summary">
        <div>
          <span>Total</span>
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
                <th>Nível</th>
                <th>Tipo</th>
                <th>Tela</th>
                <th>Mensagem</th>
                <th>Detalhe</th>
                <th>Usuário</th>
                <th>Versão</th>
              </tr>
            </thead>
            <tbody>
              @for (item of items(); track item.id) {
                <tr>
                  <td class="nowrap">{{ item.created_at | date:'dd/MM/yyyy HH:mm:ss' }}</td>
                  <td><span class="badge" [class]="badgeClass(item.level)">{{ levelLabel(item.level) }}</span></td>
                  <td>{{ tipoLabel(item.tipo) }}</td>
                  <td>{{ item.tela || item.origem || '—' }}</td>
                  <td><pre>{{ item.mensagem }}</pre></td>
                  <td>
                    <details>
                      <summary>Ver</summary>
                      <pre>{{ detailText(item) }}</pre>
                    </details>
                  </td>
                  <td>{{ item.usuario_nome || item.usuario_id || '—' }}</td>
                  <td>{{ item.app_version || '—' }}</td>
                </tr>
              }
              @empty {
                <tr><td colspan="8" class="empty">Nenhum erro registrado</td></tr>
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
    .actions { display:flex; gap:10px; }
    .btn-secondary, .btn-danger { border-radius:8px; padding:10px 16px; font-weight:700; cursor:pointer; }
    .btn-secondary { color:#111827; background:#fff; border:1px solid #d6dee8; }
    .btn-danger { color:#fff; background:#dc2626; border:1px solid #b91c1c; }
    button:disabled { opacity:.45; cursor:not-allowed; }
    .filters { display:grid; grid-template-columns: repeat(4, minmax(160px, 1fr)); gap:12px; background:#fff; border:1px solid #d6dee8; border-radius:10px; padding:16px; margin-bottom:14px; }
    label { display:flex; flex-direction:column; gap:6px; }
    label span { color:#52657f; font-size:11px; font-weight:800; text-transform:uppercase; letter-spacing:.4px; }
    input, select { height:38px; border:1px solid #cbd5e1; border-radius:8px; padding:0 10px; background:#fff; color:#111827; outline:none; font-size:13px; }
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
    .nowrap { white-space:nowrap; }
    .badge { display:inline-flex; align-items:center; border-radius:999px; padding:4px 9px; font-size:10px; font-weight:900; text-transform:uppercase; }
    .badge-error { background:#fee2e2; color:#b91c1c; }
    .badge-warn { background:#fef3c7; color:#b45309; }
    .badge-info { background:#dbeafe; color:#1d4ed8; }
    pre { max-width:360px; max-height:120px; overflow:auto; white-space:pre-wrap; word-break:break-word; margin:0; color:#334155; font-family:Consolas, monospace; font-size:11px; line-height:1.35; }
    summary { cursor:pointer; color:#075985; font-weight:700; }
    .empty { text-align:center; padding:36px; color:#64748b; }
    .pager { display:flex; justify-content:flex-end; gap:10px; padding:14px 0; }
    @media (max-width: 900px) {
      .page { padding:18px; }
      .page-header, .actions, .summary { flex-direction:column; }
      .filters { grid-template-columns:1fr; }
      .table-wrap { max-height:none; }
    }
  `]
})
export class AppErrosComponent implements OnInit {
  private api = inject(ApiService);
  private toastr = inject(ToastrService);

  items = signal<AppErroItem[]>([]);
  loading = signal(false);
  page = signal(1);
  lastPage = signal(1);
  total = signal(0);

  filters = {
    level: '',
    tipo: '',
    usuario: '',
    per_page: 50,
  };

  ngOnInit() {
    this.load();
  }

  load(page = 1) {
    this.loading.set(true);
    this.api.getAppErros({ ...this.filters, page }).subscribe({
      next: (res) => {
        this.items.set((res.data ?? []) as AppErroItem[]);
        this.page.set(res.current_page ?? page);
        this.lastPage.set(res.last_page ?? 1);
        this.total.set(res.total ?? 0);
      },
      error: (err) => this.toastr.error(err.error?.message ?? 'Erro ao carregar erros do app'),
      complete: () => this.loading.set(false),
    });
  }

  clear() {
    if (!confirm('Limpar todos os erros do app?')) return;
    this.api.clearAppErros().subscribe({
      next: () => {
        this.toastr.success('Erros limpos.');
        this.load();
      },
      error: (err) => this.toastr.error(err.error?.message ?? 'Erro ao limpar erros'),
    });
  }

  go(page: number) {
    if (page < 1 || page > this.lastPage()) return;
    this.load(page);
  }

  levelLabel(level?: string | null) {
    return ({ error: 'Erro', warn: 'Aviso', info: 'Info' } as Record<string, string>)[level ?? ''] ?? (level || '—');
  }

  badgeClass(level?: string | null) {
    return `badge-${level || 'info'}`;
  }

  tipoLabel(tipo?: string | null) {
    return ({
      sync: 'Sincronização',
      soft_crash: 'Tela fechando',
      abastecimento_save: 'Abastecimento',
      auth_logout: 'Sessão/login',
    } as Record<string, string>)[tipo ?? ''] ?? (tipo || '—');
  }

  detailText(item: AppErroItem) {
    const parts = [
      item.detalhe ? `Detalhe:\n${item.detalhe}` : '',
      item.contexto ? `Contexto:\n${this.pretty(item.contexto)}` : '',
      item.stack_trace ? `Stack:\n${item.stack_trace}` : '',
      item.platform || item.os_version ? `Dispositivo:\n${item.platform || ''} ${item.os_version || ''}` : '',
    ].filter(Boolean);
    return parts.join('\n\n') || 'Sem detalhe';
  }

  pretty(value: string) {
    try {
      return JSON.stringify(JSON.parse(value), null, 2);
    } catch {
      return value;
    }
  }
}
