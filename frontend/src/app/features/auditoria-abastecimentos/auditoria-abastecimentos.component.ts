import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { AbastecimentoAuditoriaItem, AbastecimentoSuspeita } from '../../shared/models';

@Component({
  selector: 'app-auditoria-abastecimentos',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <div class="page">
      <header class="page-header">
        <div>
          <span>Somente administrador</span>
          <h1>Auditoria de Abastecimentos</h1>
          <p>Registros com indícios de duplicidade, KM incorreto, preço divergente, imagem inconsistente ou vínculos quebrados.</p>
        </div>
        <button type="button" class="primary-btn" (click)="load()" [disabled]="loading()">
          {{ loading() ? 'Verificando...' : 'Atualizar' }}
        </button>
      </header>

      <section class="filters">
        <label>
          Filial
          <select [(ngModel)]="filters.local">
            @for (filial of filiais(); track filial) {
              <option [value]="filial">{{ filial }}</option>
            }
          </select>
        </label>
        <label>
          Data início
          <input type="date" [(ngModel)]="filters.data_inicio" />
        </label>
        <label>
          Data fim
          <input type="date" [(ngModel)]="filters.data_fim" />
        </label>
        <label>
          Tipo
          <select [(ngModel)]="filters.tipo">
            <option value="">Todos</option>
            <option value="duplicado">Duplicado</option>
            <option value="km_menor">KM menor</option>
            <option value="valor_filial">Valor por filial</option>
            <option value="imagem_incompativel">Imagem incompatível</option>
            <option value="sem_foto">Sem foto</option>
            <option value="vinculo_divergente">Vínculo divergente</option>
          </select>
        </label>
        <label>
          Placa
          <input type="text" [(ngModel)]="filters.placa" placeholder="ABC1234" />
        </label>
        <label>
          Limite
          <input type="number" min="1" max="2000" [(ngModel)]="filters.limit" />
        </label>
        <label class="check-filter">
          <input type="checkbox" [(ngModel)]="filters.incluir_auditados" />
          <span>Mostrar auditados</span>
        </label>
        <button type="button" class="secondary-btn" (click)="setMesAtual()">Mês atual</button>
        <button type="button" class="secondary-btn" (click)="load()">Aplicar</button>
      </section>

      <section class="summary">
        <article>
          <span>Total suspeito</span>
          <strong>{{ total() }}</strong>
        </article>
        @for (tipo of tiposResumo(); track tipo.key) {
          <article>
            <span>{{ tipoLabel(tipo.key) }}</span>
            <strong>{{ tipo.value }}</strong>
          </article>
        }
      </section>

      @if (loading()) {
        <section class="state">Verificando abastecimentos...</section>
      } @else if (items().length === 0) {
        <section class="state success">Nenhuma suspeita encontrada para o filtro atual.</section>
      } @else {
        <section class="table-card">
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Data/hora</th>
                  <th>Filial</th>
                  <th>Placa</th>
                  <th>Proprietário</th>
                  <th>Motorista</th>
                  <th>Litros</th>
                  <th>Valor/L</th>
                  <th>Status imagem</th>
                  <th>Suspeitas</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                @for (item of items(); track item.abastecimento.id_abastecimento) {
                  <tr [class.row-auditado]="item.abastecimento.auditoria_auditado_em">
                    <td class="nowrap">{{ item.abastecimento.data_hora | date:'dd/MM/yyyy HH:mm' }}</td>
                    <td>{{ item.abastecimento.local || '—' }}</td>
                    <td><strong>{{ item.abastecimento.veiculo?.placa || item.abastecimento.placa1 || '—' }}</strong></td>
                    <td>{{ item.abastecimento.proprietario?.nome || item.abastecimento.nome_proprietario || '—' }}</td>
                    <td>{{ item.abastecimento.motorista?.nome || item.abastecimento.nome_motorista || '—' }}</td>
                    <td>{{ litros(item.abastecimento.quantidade_litros) }}</td>
                    <td>{{ money(item.abastecimento.valor_por_litro) }}</td>
                    <td><span class="badge" [class]="statusClass(item.abastecimento.status)">{{ item.abastecimento.status || '—' }}</span></td>
                    <td>
                      <div class="suspeitas">
                        @for (suspeita of item.suspeitas; track suspeita.tipo + suspeita.mensagem) {
                          <details>
                            <summary><span class="badge" [class]="suspeitaClass(suspeita)">{{ tipoLabel(suspeita.tipo) }}</span></summary>
                            <p>{{ suspeita.mensagem }}</p>
                            @if (suspeita.meta) {
                              <pre>{{ formatMeta(suspeita.meta) }}</pre>
                            }
                          </details>
                        }
                      </div>
                    </td>
                    <td>
                      <div class="action-stack">
                        <a class="link-btn" [routerLink]="['/abastecimentos', item.abastecimento.id_abastecimento, 'editar']">Abrir</a>
                        @if (item.abastecimento.auditoria_auditado_em) {
                          <span class="auditado-chip">
                            Auditado
                            <small>{{ item.abastecimento.auditoria_auditado_por || '—' }}</small>
                          </span>
                        } @else {
                          <button
                            type="button"
                            class="audit-btn"
                            [disabled]="isAuditing(item.abastecimento.id_abastecimento)"
                            (click)="marcarAuditado(item)"
                          >
                            {{ isAuditing(item.abastecimento.id_abastecimento) ? 'Marcando...' : 'Marcar auditado' }}
                          </button>
                        }
                      </div>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </section>
      }
    </div>
  `,
  styles: [`
    * { box-sizing: border-box; }
    .page { min-height:100%; padding:28px; color:#111827; background:#f3f4f6; font-family:Inter, sans-serif; }
    .page-header { display:flex; justify-content:space-between; align-items:flex-start; gap:16px; margin-bottom:16px; }
    .page-header span, label, .summary span { color:#64748b; font-size:11px; font-weight:800; letter-spacing:.04em; text-transform:uppercase; }
    h1 { margin:4px 0 0; font-size:28px; line-height:1.1; font-weight:900; letter-spacing:0; }
    p { margin:6px 0 0; color:#64748b; font-size:13px; max-width:760px; }
    .primary-btn, .secondary-btn, .link-btn { border-radius:8px; font-weight:800; cursor:pointer; text-decoration:none; }
    .primary-btn { border:1px solid #0f766e; background:#0f766e; color:#fff; padding:10px 16px; }
    .secondary-btn { height:40px; border:1px solid #cbd5e1; background:#fff; color:#111827; padding:0 14px; align-self:end; }
    button:disabled { opacity:.55; cursor:not-allowed; }
    .filters { display:grid; grid-template-columns: repeat(8, minmax(130px, 1fr)); gap:12px; background:#fff; border:1px solid #d6dee8; border-radius:10px; padding:16px; margin-bottom:14px; }
    label { display:grid; gap:6px; }
    .check-filter { align-self:end; height:40px; display:flex; flex-direction:row; align-items:center; gap:8px; }
    .check-filter span { color:#111827; font-size:12px; font-weight:800; letter-spacing:0; text-transform:none; }
    input, select { height:40px; border:1px solid #cbd5e1; border-radius:8px; padding:0 10px; background:#fff; color:#111827; outline:none; font-size:13px; }
    .check-filter input { width:16px; height:16px; padding:0; }
    .summary { display:grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap:12px; margin-bottom:14px; }
    .summary article, .state, .table-card { background:#fff; border:1px solid #d6dee8; border-radius:10px; }
    .summary article { padding:12px 14px; }
    .summary strong { display:block; margin-top:4px; font-size:24px; font-weight:900; }
    .state { padding:28px; text-align:center; color:#64748b; font-weight:800; }
    .state.success { color:#047857; }
    .table-card { overflow:hidden; }
    .table-wrap { overflow:auto; max-height: calc(100vh - 330px); }
    table { width:100%; border-collapse:collapse; min-width:1260px; font-size:12px; }
    th { position:sticky; top:0; z-index:1; background:#f8fafc; color:#52657f; text-align:left; text-transform:uppercase; letter-spacing:.04em; font-size:11px; padding:10px 12px; border-bottom:1px solid #d6dee8; }
    td { vertical-align:top; padding:10px 12px; border-bottom:1px solid #eef2f7; }
    tr:hover td { background:#f8fafc; }
    tr.row-auditado td { background:#f8fafc; color:#64748b; }
    .nowrap { white-space:nowrap; }
    .badge { display:inline-flex; align-items:center; border-radius:999px; padding:4px 9px; font-size:10px; font-weight:900; text-transform:uppercase; white-space:nowrap; }
    .badge-green { background:#dcfce7; color:#047857; }
    .badge-red { background:#fee2e2; color:#b91c1c; }
    .badge-amber { background:#fef3c7; color:#b45309; }
    .badge-blue { background:#dbeafe; color:#1d4ed8; }
    .badge-gray { background:#e5e7eb; color:#475569; }
    .suspeitas { display:grid; gap:6px; min-width:240px; }
    details { border:1px solid #e5e7eb; border-radius:8px; padding:6px; background:#fff; }
    summary { cursor:pointer; list-style:none; }
    details p { color:#334155; margin:8px 2px 0; font-size:12px; }
    pre { margin:8px 2px 0; color:#475569; white-space:pre-wrap; word-break:break-word; font-family:Consolas, monospace; font-size:11px; }
    .link-btn { display:inline-flex; align-items:center; height:32px; padding:0 12px; border:1px solid #0f766e; color:#0f766e; background:#ecfdf5; }
    .action-stack { display:flex; flex-direction:column; align-items:flex-start; gap:8px; min-width:132px; }
    .audit-btn {
      height:32px;
      border:1px solid #1d4ed8;
      border-radius:8px;
      background:#dbeafe;
      color:#1d4ed8;
      font-size:11px;
      font-weight:900;
      padding:0 10px;
      cursor:pointer;
      white-space:nowrap;
    }
    .audit-btn:disabled { opacity:.6; cursor:wait; }
    .auditado-chip {
      display:flex;
      flex-direction:column;
      gap:2px;
      border-radius:8px;
      background:#dcfce7;
      color:#047857;
      padding:6px 9px;
      font-size:10px;
      font-weight:900;
      text-transform:uppercase;
    }
    .auditado-chip small { color:#166534; font-size:10px; font-weight:700; text-transform:none; }
    @media (max-width: 1100px) {
      .page { padding:18px; }
      .page-header { flex-direction:column; }
      .filters { grid-template-columns:1fr 1fr; }
      .table-wrap { max-height:none; }
    }
    @media (max-width: 640px) {
      .filters { grid-template-columns:1fr; }
      .summary { grid-template-columns:1fr; }
    }
  `],
})
export class AuditoriaAbastecimentosComponent implements OnInit {
  private api = inject(ApiService);
  private auth = inject(AuthService);
  private toastr = inject(ToastrService);

  loading = signal(false);
  items = signal<AbastecimentoAuditoriaItem[]>([]);
  total = signal(0);
  porTipo = signal<Record<string, number>>({});
  auditing = signal<Record<string, boolean>>({});

  filters = {
    local: this.auth.getGaragem(),
    data_inicio: '',
    data_fim: '',
    tipo: '',
    placa: '',
    limit: 1000,
    incluir_auditados: false,
  };

  ngOnInit() {
    this.setMesAtual(false);
    this.load();
  }

  filiais() {
    return this.auth.getFiliaisAcesso();
  }

  setMesAtual(reload = true) {
    const hoje = new Date();
    const primeiro = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
    this.filters.data_inicio = this.dateInput(primeiro);
    this.filters.data_fim = this.dateInput(hoje);
    if (reload) this.load();
  }

  load() {
    this.loading.set(true);
    this.api.getAuditoriaAbastecimentosSuspeitos(this.filters).subscribe({
      next: (res) => {
        this.items.set(res.data ?? []);
        this.total.set(res.resumo?.total ?? 0);
        this.porTipo.set(res.resumo?.por_tipo ?? {});
        this.loading.set(false);
      },
      error: (err) => {
        this.toastr.error(err.error?.message ?? 'Erro ao carregar auditoria');
        this.loading.set(false);
      },
    });
  }

  isAuditing(id?: string | null): boolean {
    return !!id && !!this.auditing()[id];
  }

  marcarAuditado(item: AbastecimentoAuditoriaItem) {
    const id = item.abastecimento.id_abastecimento;
    if (!id || this.isAuditing(id)) return;

    this.auditing.update((current) => ({ ...current, [id]: true }));
    this.api.marcarAbastecimentoAuditado(id).subscribe({
      next: () => {
        this.toastr.success('Item marcado como auditado');
        this.load();
      },
      error: (err) => {
        this.toastr.error(err.error?.message ?? 'Erro ao marcar item auditado');
        this.auditing.update((current) => {
          const next = { ...current };
          delete next[id];
          return next;
        });
      },
      complete: () => {
        this.auditing.update((current) => {
          const next = { ...current };
          delete next[id];
          return next;
        });
      },
    });
  }

  tiposResumo() {
    return Object.entries(this.porTipo())
      .sort((a, b) => b[1] - a[1])
      .map(([key, value]) => ({ key, value }));
  }

  tipoLabel(tipo?: string | null) {
    return ({
      duplicado: 'Duplicado',
      km_menor: 'KM menor',
      valor_filial: 'Valor filial',
      imagem_incompativel: 'Imagem',
      sem_foto: 'Sem foto',
      vinculo_divergente: 'Vínculo',
    } as Record<string, string>)[tipo ?? ''] ?? (tipo || '—');
  }

  suspeitaClass(suspeita: AbastecimentoSuspeita) {
    if (suspeita.severidade === 'alta') return 'badge-red';
    if (suspeita.severidade === 'media') return 'badge-amber';
    return 'badge-blue';
  }

  statusClass(status?: string | null) {
    const normal = (status || '').toLowerCase();
    if (normal === 'inconsistente') return 'badge-red';
    if (normal === 'confirmado' || normal === 'verificado') return 'badge-green';
    if (normal === 'pendente') return 'badge-amber';
    return 'badge-gray';
  }

  money(value?: number | string | null) {
    const n = Number(value ?? 0);
    if (!Number.isFinite(n)) return '—';
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n);
  }

  litros(value?: number | string | null) {
    const n = Number(value ?? 0);
    if (!Number.isFinite(n)) return '—';
    return `${new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)} L`;
  }

  formatMeta(meta: Record<string, any>) {
    return JSON.stringify(meta, null, 2);
  }

  private dateInput(date: Date) {
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }
}
