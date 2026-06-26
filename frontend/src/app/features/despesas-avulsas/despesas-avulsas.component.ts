import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { DespesaAvulsa } from '../../shared/models';
import { ToastrService } from 'ngx-toastr';

@Component({
  selector: 'app-despesas-avulsas',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule],
  template: `
    <div class="page">
      <header class="page-header">
        <div>
          <h1>Despesas Avulsas</h1>
          <p>Registre despesas administrativas fora do fluxo de abastecimento.</p>
        </div>
        <button type="button" class="btn-primary" (click)="newItem()">+ Nova despesa</button>
      </header>

      <section class="filters-card">
        <label>
          Categoria
          <select [(ngModel)]="filtroCategoria" (change)="load()">
            <option value="">Todas</option>
            @for (categoria of categorias; track categoria) {
              <option [value]="categoria">{{ categoria }}</option>
            }
          </select>
        </label>
        <label>
          Data início
          <input type="date" [(ngModel)]="filtroDataInicio" (change)="load()" />
        </label>
        <label>
          Data fim
          <input type="date" [(ngModel)]="filtroDataFim" (change)="load()" />
        </label>
        <label>
          Busca
          <input type="search" [(ngModel)]="filtroBusca" placeholder="Descrição ou observação" (keyup.enter)="load()" />
        </label>
        <button type="button" class="btn-secondary" (click)="clearFilters()">Limpar</button>
      </section>

      <section class="summary-row">
        <article>
          <span>Registros</span>
          <strong>{{ despesas().length }}</strong>
        </article>
        <article>
          <span>Total</span>
          <strong class="money">{{ totalValor() | currency:'BRL':'symbol':'1.2-2' }}</strong>
        </article>
      </section>

      <section class="table-card">
        @if (loading()) {
          <div class="state">Carregando despesas...</div>
        } @else if (despesas().length === 0) {
          <div class="state">Nenhuma despesa avulsa encontrada</div>
        } @else {
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Data/hora</th>
                  <th>Filial</th>
                  <th>Descrição</th>
                  <th>Categoria</th>
                  <th>Pagamento</th>
                  <th class="text-right">Valor</th>
                  <th>Responsável</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                @for (despesa of despesas(); track despesa.id_despesa) {
                  <tr>
                    <td>{{ (despesa.data_hora || despesa.data) | date:'dd/MM/yyyy HH:mm' }}</td>
                    <td><span class="branch">{{ despesa.local || 'Matriz' }}</span></td>
                    <td>
                      <strong>{{ despesa.descricao }}</strong>
                      @if (despesa.observacao) {
                        <small>{{ despesa.observacao }}</small>
                      }
                    </td>
                    <td>{{ despesa.categoria || '-' }}</td>
                    <td>{{ despesa.forma_pagamento || '-' }}</td>
                    <td class="text-right money">{{ despesa.valor | currency:'BRL':'symbol':'1.2-2' }}</td>
                    <td>{{ despesa.responsavel || '-' }}</td>
                    <td>
                      <div class="actions">
                        <button type="button" class="icon-btn" (click)="edit(despesa)" title="Editar">✏️</button>
                        <button type="button" class="icon-btn" (click)="confirmDelete(despesa)" title="Excluir">🗑️</button>
                      </div>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }
      </section>

      @if (deleteTarget()) {
        <div class="modal-overlay" (click)="deleteTarget.set(null)">
          <div class="modal" (click)="$event.stopPropagation()">
            <h3>Confirmar exclusão</h3>
            <p>Excluir a despesa <strong>{{ deleteTarget()?.descricao }}</strong>?</p>
            <div class="modal-actions">
              <button type="button" class="btn-cancel" (click)="deleteTarget.set(null)">Cancelar</button>
              <button type="button" class="btn-danger" (click)="executeDelete()">Excluir</button>
            </div>
          </div>
        </div>
      }

      @if (showForm()) {
        <div class="modal-overlay" (click)="cancelForm()">
          <div class="modal form-modal" (click)="$event.stopPropagation()">
            <div class="modal-header">
              <div>
                <h3>{{ editItem() ? 'Editar despesa' : 'Nova despesa avulsa' }}</h3>
                <p>Informe os dados da despesa administrativa.</p>
              </div>
              <button type="button" class="btn-close" (click)="cancelForm()">×</button>
            </div>

            <form [formGroup]="form" (ngSubmit)="onSubmit()">
              <div class="form-grid">
                <label>
                  Filial
                  <select formControlName="local">
                    @for (filial of filiaisDisponiveis; track filial) {
                      <option [value]="filial">{{ filial }}</option>
                    }
                  </select>
                </label>
                <label>
                  Data
                  <input type="date" formControlName="data" />
                </label>
                <label>
                  Hora
                  <input type="time" formControlName="hora" />
                </label>
                <label>
                  Categoria
                  <div class="category-row">
                    <input
                      type="text"
                      formControlName="categoria"
                      list="categorias-despesas"
                      placeholder="Ex: Pagamento do frentista"
                    />
                    <button type="button" class="btn-small" (click)="addCategoriaFromForm()">Adicionar</button>
                  </div>
                  <datalist id="categorias-despesas">
                    @for (categoria of categorias; track categoria) {
                      <option [value]="categoria"></option>
                    }
                  </datalist>
                </label>
                <label class="wide">
                  Descrição
                  <input type="text" formControlName="descricao" placeholder="Ex: manutenção, compra, taxa..." />
                </label>
                <label>
                  Valor
                  <input type="number" formControlName="valor" step="0.01" placeholder="0,00" />
                </label>
                <label>
                  Forma de pagamento
                  <select formControlName="forma_pagamento">
                    <option value="">Não informado</option>
                    <option value="Dinheiro">Dinheiro</option>
                    <option value="Pix">Pix</option>
                    <option value="Cartão">Cartão</option>
                    <option value="Boleto">Boleto</option>
                    <option value="Transferência">Transferência</option>
                  </select>
                </label>
                <label class="wide">
                  Observação
                  <textarea formControlName="observacao" rows="3" placeholder="Detalhes opcionais"></textarea>
                </label>
              </div>
              <div class="form-actions">
                <button type="button" class="btn-cancel" (click)="cancelForm()">Cancelar</button>
                <button type="submit" class="btn-primary" [disabled]="saving()">
                  {{ saving() ? 'Salvando...' : 'Salvar despesa' }}
                </button>
              </div>
            </form>
          </div>
        </div>
      }
    </div>
  `,
  styles: [`
    * { box-sizing: border-box; }
    .page { padding: 28px; color: #111827; font-family: Inter, Arial, sans-serif; }
    .page-header { display:flex; justify-content:space-between; gap:16px; align-items:flex-start; margin-bottom:16px; }
    h1 { margin:0; font-size:24px; font-weight:800; }
    h2 { margin:0 0 14px; color:#111827; font-size:16px; }
    p { margin:6px 0 0; color:#64748b; font-size:13px; }
    .btn-primary, .btn-secondary, .btn-cancel, .btn-danger { border-radius:8px; padding:9px 16px; border:1px solid transparent; font-weight:700; cursor:pointer; }
    .btn-primary { color:#fff; background:linear-gradient(135deg,#0ea5e9,#6366f1); border:0; }
    .btn-primary:disabled { opacity:.6; cursor:progress; }
    .btn-secondary, .btn-cancel { background:#fff; color:#334155; border-color:#cbd5e1; }
    .btn-danger { background:#dc2626; color:#fff; border:0; }
    .filters-card { display:grid; grid-template-columns:repeat(auto-fit,minmax(160px,1fr)); gap:12px; align-items:end; background:#fff; border:1px solid #dbe4f0; border-radius:10px; padding:14px; margin-bottom:14px; }
    label { display:flex; flex-direction:column; gap:6px; font-size:11px; color:#52657f; font-weight:800; text-transform:uppercase; letter-spacing:.4px; }
    input, select, textarea { border:1px solid #cbd5e1; border-radius:8px; padding:9px 10px; color:#111827; background:#fff; font:inherit; outline:none; }
    input:focus, select:focus, textarea:focus { border-color:#0ea5e9; box-shadow:0 0 0 3px rgba(14,165,233,.12); }
    .category-row { display:flex; gap:8px; align-items:center; }
    .category-row input { flex:1; min-width:0; }
    .btn-small { border:1px solid #cbd5e1; background:#f8fafc; color:#334155; border-radius:8px; padding:9px 10px; font-weight:800; cursor:pointer; white-space:nowrap; }
    .btn-small:hover { border-color:#0ea5e9; color:#0369a1; }
    .form-card { background:#fff; border:1px solid #dbe4f0; border-radius:12px; padding:18px; margin-bottom:14px; }
    .form-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(190px,1fr)); gap:12px; }
    .form-card label { color:#52657f; }
    .form-card input, .form-card select, .form-card textarea { background:#fff; border-color:#cbd5e1; color:#111827; }
    .form-card option { background:#fff; }
    .wide { grid-column:1 / -1; }
    .form-actions, .modal-actions { display:flex; justify-content:flex-end; gap:10px; margin-top:14px; }
    .summary-row { display:flex; gap:12px; margin-bottom:14px; flex-wrap:wrap; }
    .summary-row article { min-width:170px; background:#fff; border:1px solid #dbe4f0; border-radius:10px; padding:12px 14px; }
    .summary-row span { display:block; color:#64748b; font-size:11px; font-weight:800; text-transform:uppercase; }
    .summary-row strong { display:block; margin-top:4px; font-size:22px; }
    .table-card { background:#fff; border:1px solid #dbe4f0; border-radius:10px; overflow:hidden; }
    .table-wrap { overflow:auto; }
    table { width:100%; min-width:980px; border-collapse:collapse; font-size:13px; }
    th { background:#f8fafc; color:#52657f; text-align:left; text-transform:uppercase; letter-spacing:.4px; font-size:11px; padding:10px 12px; border-bottom:1px solid #dbe4f0; }
    td { padding:11px 12px; border-bottom:1px solid #eef2f7; vertical-align:middle; }
    td small { display:block; margin-top:3px; color:#64748b; max-width:420px; }
    tr:hover td { background:#f8fafc; }
    .text-right { text-align:right; }
    .money { color:#16a34a; font-weight:800; }
    .branch { display:inline-flex; padding:3px 9px; border-radius:999px; background:#e0f2fe; color:#0369a1; font-size:12px; font-weight:800; }
    .actions { display:flex; gap:6px; }
    .icon-btn { background:transparent; border:0; cursor:pointer; padding:5px 7px; border-radius:6px; }
    .icon-btn:hover { background:#e2e8f0; }
    .state { padding:28px; color:#64748b; text-align:center; }
    .modal-overlay { position:fixed; inset:0; background:rgba(15,23,42,.72); display:flex; align-items:center; justify-content:center; z-index:1000; padding:20px; }
    .modal { background:#fff; border-radius:12px; padding:22px; width:min(420px,96vw); box-shadow:0 22px 60px rgba(15,23,42,.25); }
    .modal h3 { margin:0; font-size:18px; }
    .form-modal { width:min(760px,96vw); max-height:88vh; overflow:auto; border:1px solid #dbe4f0; }
    .modal-header { display:flex; align-items:flex-start; justify-content:space-between; gap:16px; margin-bottom:16px; }
    .modal-header h3 { color:#111827; font-size:20px; }
    .modal-header p { margin-top:4px; }
    .btn-close { width:34px; height:34px; border-radius:8px; border:1px solid #cbd5e1; background:#fff; color:#334155; cursor:pointer; font-size:20px; line-height:1; }
    .form-modal label { color:#52657f; }
    .form-modal input, .form-modal select, .form-modal textarea { background:#fff; color:#111827; border-color:#cbd5e1; }
    @media (max-width: 760px) {
      .page { padding:18px; }
      .page-header { flex-direction:column; }
      .btn-primary, .btn-secondary, .btn-cancel, .btn-danger { width:100%; }
      .form-actions, .modal-actions { flex-direction:column; }
    }
  `],
})
export class DespesasAvulsasComponent implements OnInit, OnDestroy {
  private api = inject(ApiService);
  private auth = inject(AuthService);
  private fb = inject(FormBuilder);
  private toastr = inject(ToastrService);

  despesas = signal<DespesaAvulsa[]>([]);
  loading = signal(false);
  saving = signal(false);
  showForm = signal(false);
  editItem = signal<DespesaAvulsa | null>(null);
  deleteTarget = signal<DespesaAvulsa | null>(null);

  private readonly categoriasStorageKey = 'despesas_avulsas_categorias';
  private readonly categoriasPadrao = ['Manutenção', 'Material', 'Taxas', 'Alimentação', 'Transporte', 'Pagamento do frentista', 'Outros'];
  categorias = [...this.categoriasPadrao];
  filiaisDisponiveis = ['Matriz', 'Viana'];
  filtroCategoria = '';
  filtroDataInicio = '';
  filtroDataFim = '';
  filtroBusca = '';

  private readonly onGaragemChanged = () => {
    this.form.patchValue({ local: this.localAtual() });
    this.load();
  };

  form = this.fb.group({
    local: [this.localAtual(), Validators.required],
    data: [new Date().toISOString().slice(0, 10), Validators.required],
    hora: [this.currentTime()],
    descricao: ['', Validators.required],
    categoria: [''],
    valor: [null as number | null, [Validators.required, Validators.min(0.01)]],
    forma_pagamento: [''],
    observacao: [''],
  });

  ngOnInit() {
    this.loadCategoriasSalvas();
    this.filiaisDisponiveis = this.auth.getFiliaisAcesso().length ? this.auth.getFiliaisAcesso() : ['Matriz', 'Viana'];
    this.form.patchValue({ local: this.localAtual() });
    window.addEventListener('garagem:changed', this.onGaragemChanged);
    this.load();
  }

  ngOnDestroy() {
    window.removeEventListener('garagem:changed', this.onGaragemChanged);
  }

  load() {
    this.loading.set(true);
    this.api.getDespesasAvulsas({
      categoria: this.filtroCategoria,
      data_inicio: this.filtroDataInicio,
      data_fim: this.filtroDataFim,
      q: this.filtroBusca,
      per_page: 200,
    }).subscribe({
      next: (res) => {
        const despesas = (res.data ?? []).map(d => this.normalizeDespesa(d)).sort((a, b) => this.timestamp(b) - this.timestamp(a));
        this.mergeCategorias(despesas.map(d => d.categoria));
        this.despesas.set(despesas);
      },
      error: (err) => this.toastr.error(err.error?.message ?? 'Erro ao carregar despesas'),
      complete: () => this.loading.set(false),
    });
  }

  clearFilters() {
    this.filtroCategoria = '';
    this.filtroDataInicio = '';
    this.filtroDataFim = '';
    this.filtroBusca = '';
    this.load();
  }

  newItem() {
    this.editItem.set(null);
    this.form.reset({
      local: this.localAtual(),
      data: new Date().toISOString().slice(0, 10),
      hora: this.currentTime(),
      descricao: '',
      categoria: '',
      valor: null,
      forma_pagamento: '',
      observacao: '',
    });
    this.showForm.set(true);
  }

  edit(despesa: DespesaAvulsa) {
    this.editItem.set(despesa);
    const dataHora = this.parseDate(despesa.data_hora || despesa.data);
    this.form.patchValue({
      local: despesa.local || this.localAtual(),
      data: this.datePart(dataHora, despesa.data),
      hora: this.timePart(dataHora),
      descricao: despesa.descricao,
      categoria: despesa.categoria || '',
      valor: despesa.valor,
      forma_pagamento: despesa.forma_pagamento || '',
      observacao: despesa.observacao || '',
    });
    this.showForm.set(true);
  }

  cancelForm() {
    this.showForm.set(false);
    this.editItem.set(null);
  }

  addCategoriaFromForm() {
    const categoria = this.normalizeCategoria(this.form.get('categoria')?.value);
    if (!categoria) {
      this.toastr.warning('Digite o nome da categoria.');
      return;
    }
    this.addCategoria(categoria);
    this.form.patchValue({ categoria });
    this.toastr.success('Categoria adicionada.');
  }

  onSubmit() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.toastr.warning('Preencha descrição, data e valor.');
      return;
    }
    this.saving.set(true);
    const raw = this.form.getRawValue();
    const categoria = this.normalizeCategoria(raw.categoria);
    if (categoria) {
      this.addCategoria(categoria);
    }
    const dataHora = `${raw.data} ${raw.hora || '00:00'}:00`;
    const payload: Partial<DespesaAvulsa> = {
      local: raw.local || this.localAtual(),
      data: raw.data || new Date().toISOString().slice(0, 10),
      data_hora: dataHora,
      descricao: raw.descricao || '',
      categoria: categoria || undefined,
      valor: Number(raw.valor || 0),
      forma_pagamento: raw.forma_pagamento || undefined,
      observacao: raw.observacao || undefined,
    };

    const obs = this.editItem()
      ? this.api.updateDespesaAvulsa(this.editItem()!.id_despesa, payload)
      : this.api.createDespesaAvulsa(payload);

    obs.subscribe({
      next: () => {
        this.toastr.success(this.editItem() ? 'Despesa atualizada' : 'Despesa cadastrada');
        this.cancelForm();
        this.load();
      },
      error: (err) => this.toastr.error(err.error?.message ?? 'Erro ao salvar despesa'),
      complete: () => this.saving.set(false),
    });
  }

  confirmDelete(despesa: DespesaAvulsa) {
    this.deleteTarget.set(despesa);
  }

  executeDelete() {
    const target = this.deleteTarget();
    if (!target) return;
    this.api.deleteDespesaAvulsa(target.id_despesa).subscribe({
      next: () => {
        this.toastr.success('Despesa excluída');
        this.deleteTarget.set(null);
        this.load();
      },
      error: (err) => this.toastr.error(err.error?.message ?? 'Erro ao excluir despesa'),
    });
  }

  totalValor(): number {
    return this.despesas().reduce((sum, item) => sum + Number(item.valor || 0), 0);
  }

  private normalizeDespesa(d: DespesaAvulsa): DespesaAvulsa {
    return { ...d, valor: Number(d.valor || 0) };
  }

  private loadCategoriasSalvas() {
    try {
      const raw = localStorage.getItem(this.categoriasStorageKey);
      const saved = raw ? JSON.parse(raw) : [];
      this.mergeCategorias(Array.isArray(saved) ? saved : []);
    } catch {
      this.categorias = [...this.categoriasPadrao];
    }
  }

  private saveCategorias() {
    localStorage.setItem(this.categoriasStorageKey, JSON.stringify(this.categorias));
  }

  private normalizeCategoria(value: unknown): string {
    return String(value ?? '').trim().replace(/\s+/g, ' ');
  }

  private mergeCategorias(values: unknown[]) {
    let changed = false;
    for (const raw of values) {
      const categoria = this.normalizeCategoria(raw);
      if (!categoria) continue;
      if (!this.categorias.some(c => c.toLowerCase() === categoria.toLowerCase())) {
        this.categorias.push(categoria);
        changed = true;
      }
    }
    this.categorias.sort((a, b) => a.localeCompare(b, 'pt-BR'));
    if (changed) this.saveCategorias();
  }

  private addCategoria(categoria: string) {
    this.mergeCategorias([categoria]);
  }

  private timestamp(d: DespesaAvulsa): number {
    const raw = d.data_hora || d.data;
    const parsed = Date.parse(String(raw || '').replace(' ', 'T'));
    return Number.isFinite(parsed) ? parsed : 0;
  }

  private localAtual(): string {
    return this.auth.getGaragem() || this.auth.getFiliaisAcesso()[0] || 'Matriz';
  }

  private currentTime(): string {
    return new Date().toTimeString().slice(0, 5);
  }

  private parseDate(raw?: string | null): Date | null {
    if (!raw) return null;
    const parsed = new Date(String(raw).replace(' ', 'T'));
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  private datePart(date: Date | null, fallback?: string): string {
    return date ? date.toISOString().slice(0, 10) : String(fallback || '').slice(0, 10);
  }

  private timePart(date: Date | null): string {
    return date ? `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}` : this.currentTime();
  }
}
