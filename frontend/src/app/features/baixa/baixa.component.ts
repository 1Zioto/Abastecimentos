// src/app/features/baixa/baixa.component.ts
import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';
import { ToastrService } from 'ngx-toastr';
import { Abastecimento, Proprietario } from '../../shared/models';

@Component({
  selector: 'app-baixa',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule],
  template: `
    <div class="page">
      <div class="page-header">
        <div>
          <h1>Baixa de Abastecimentos</h1>
          <p>Selecione os abastecimentos e registre a baixa financeira</p>
        </div>
      </div>

      <!-- Filtros -->
      <div class="filters-card">
        <div class="filters-grid">
          <div class="filter-field">
            <label>Proprietário</label>
            <select [(ngModel)]="filters.id_proprietario" (change)="loadPendentes()">
              <option value="">Todos</option>
              @for (p of proprietarios(); track p.id_proprietario) {
                <option [value]="p.id_proprietario">{{ p.nome }}</option>
              }
            </select>
          </div>
          <div class="filter-field">
            <label>Placa</label>
            <input type="text" [(ngModel)]="filters.placa" placeholder="ABC-1234" (input)="loadPendentes()" />
          </div>
          <div class="filter-field">
            <label>Data Início</label>
            <input type="date" [(ngModel)]="filters.data_inicio" (change)="loadPendentes()" />
          </div>
          <div class="filter-field">
            <label>Data Fim</label>
            <input type="date" [(ngModel)]="filters.data_fim" (change)="loadPendentes()" />
          </div>
        </div>
      </div>

      <div class="content-grid">
        <!-- Lista de pendentes -->
        <div class="list-card">
          <div class="list-header">
            <h3>Pendentes de Baixa <span class="badge-count">{{ pendentes().length }}</span></h3>
            <div class="select-controls">
              <button class="btn-sm" (click)="selectAll()">Selecionar Todos</button>
              <button class="btn-sm" (click)="clearSelection()">Limpar</button>
            </div>
          </div>

          @if (loadingPendentes()) {
            <div class="loading-state"><div class="spinner-lg"></div></div>
          } @else {
            <div class="pendente-list">
              @for (a of pendentes(); track a.id_abastecimento) {
                <div class="pendente-item" [class.selected]="isSelected(a.id_abastecimento)"
                     (click)="toggleSelect(a.id_abastecimento)">
                  <div class="pendente-check">
                    {{ isSelected(a.id_abastecimento) ? '☑' : '☐' }}
                  </div>
                  <div class="pendente-info">
                    <div class="pendente-top">
                      <span class="placa-badge">{{ a.veiculo?.placa ?? '—' }}</span>
                      <span class="pendente-date">{{ a.data | date:'dd/MM/yyyy' }}</span>
                    </div>
                    <div class="pendente-bottom">
                      <span>{{ a.nome_proprietario ?? '—' }}</span>
                      <span>{{ a.nome_motorista ?? '—' }}</span>
                    </div>
                    <div class="pendente-vals">
                      <span>{{ a.quantidade_litros | number:'1.2-2' }} L</span>
                      <span class="val-green">{{ a.valor_total | currency:'BRL':'symbol':'1.2-2' }}</span>
                    </div>
                  </div>
                </div>
              }
              @empty {
                <div class="empty-state">✅ Sem abastecimentos pendentes</div>
              }
            </div>

            <!-- Total selecionado -->
            @if (selected().size > 0) {
              <div class="selection-summary">
                <span>{{ selected().size }} selecionado(s)</span>
                <span class="summary-val">Total: {{ totalSelecionado() | currency:'BRL':'symbol':'1.2-2' }}</span>
              </div>
            }
          }
        </div>

        <!-- Formulário de baixa -->
        <div class="form-card">
          <h3>Dados da Baixa</h3>

          <form [formGroup]="form" (ngSubmit)="onSubmit()">
            <div class="field">
              <label>Data da Baixa</label>
              <input type="date" formControlName="data_baixa" />
            </div>
            <div class="field">
              <label>Tipo de Despesa</label>
              <select formControlName="tipo_despesa">
                <option value="">Selecione...</option>
                <option value="Combustível">Combustível</option>
                <option value="Manutenção">Manutenção</option>
                <option value="Outros">Outros</option>
              </select>
            </div>
            <div class="field">
              <label>Descrição</label>
              <textarea formControlName="descricao" rows="2" placeholder="Descrição opcional"></textarea>
            </div>
            <div class="field">
              <label>Forma de Pagamento</label>
              <select formControlName="forma_pagamento">
                <option value="">Selecione...</option>
                <option value="Dinheiro">Dinheiro</option>
                <option value="PIX">PIX</option>
                <option value="Cartão Crédito">Cartão Crédito</option>
                <option value="Cartão Débito">Cartão Débito</option>
                <option value="Transferência">Transferência</option>
                <option value="Boleto">Boleto</option>
              </select>
            </div>
            <div class="field">
              <label>Data Pagamento</label>
              <input type="date" formControlName="data_pagamento" />
            </div>
            <div class="field">
              <label>Status</label>
              <select formControlName="status1">
                <option value="">Selecione...</option>
                <option value="Pago">Pago</option>
                <option value="A Pagar">A Pagar</option>
                <option value="Aprovado">Aprovado</option>
              </select>
            </div>
            <div class="field">
              <label>Placa (conferência)</label>
              <input type="text" formControlName="placa1" placeholder="Placa de referência" />
            </div>
            <div class="field">
              <label>Recebedor</label>
              <input type="text" formControlName="recebedor" placeholder="Nome do recebedor" />
            </div>
            <div class="field">
              <label>Observação</label>
              <textarea formControlName="observacao" rows="2" placeholder="Observações"></textarea>
            </div>
            <div class="field">
              <label>Anexo (URL)</label>
              <input type="text" formControlName="anexo" placeholder="Link do documento" />
            </div>

            <button type="submit" class="btn-primary" [disabled]="saving() || selected().size === 0">
              @if (saving()) {
                <span class="spinner"></span> Registrando...
              } @else {
                ✅ Registrar Baixa ({{ selected().size }})
              }
            </button>
          </form>
        </div>
      </div>
    </div>
  `,
  styles: [`
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap');
    * { box-sizing:border-box; }
    .page { padding:28px; font-family:'Inter',sans-serif; color:#e2e8f0; }
    .page-header { margin-bottom:20px; }
    .page-header h1 { font-size:24px; font-weight:700; color:#f8fafc; margin:0; }
    .page-header p { font-size:13px; color:#64748b; margin-top:4px; }

    .filters-card { background:#0d1427; border:1px solid #1e2d4a; border-radius:12px; padding:16px; margin-bottom:16px; }
    .filters-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(180px,1fr)); gap:12px; }
    .filter-field { display:flex; flex-direction:column; gap:4px; }
    .filter-field label { font-size:11px; font-weight:600; color:#64748b; text-transform:uppercase; letter-spacing:0.5px; }
    .filter-field input, .filter-field select { background:#0a0f1e; border:1px solid #1e2d4a; border-radius:7px; padding:8px 10px; color:#e2e8f0; font-size:12px; outline:none; }
    .filter-field input:focus, .filter-field select:focus { border-color:#0ea5e9; }
    .filter-field select option { background:#0d1427; }

    .content-grid { display:grid; grid-template-columns:1fr 380px; gap:16px; }

    .list-card, .form-card { background:#0d1427; border:1px solid #1e2d4a; border-radius:12px; padding:20px; }
    .list-header { display:flex; justify-content:space-between; align-items:center; margin-bottom:14px; }
    .list-header h3 { font-size:14px; font-weight:700; color:#f8fafc; margin:0; display:flex; gap:8px; align-items:center; }
    .badge-count { background:#0ea5e920; color:#38bdf8; padding:2px 8px; border-radius:10px; font-size:11px; }
    .select-controls { display:flex; gap:6px; }
    .btn-sm { background:transparent; border:1px solid #1e2d4a; color:#64748b; padding:4px 10px; border-radius:5px; font-size:11px; cursor:pointer; }
    .btn-sm:hover { border-color:#94a3b8; color:#94a3b8; }

    .loading-state { display:flex;justify-content:center;padding:30px; }
    .spinner-lg { width:24px;height:24px;border:3px solid #1e2d4a;border-top-color:#0ea5e9;border-radius:50%;animation:spin 0.8s linear infinite; }
    @keyframes spin { to{transform:rotate(360deg);} }

    .pendente-list { display:flex; flex-direction:column; gap:6px; max-height:500px; overflow-y:auto; }

    .pendente-item {
      border:1px solid #1e2d4a;
      border-radius:8px;
      padding:10px 12px;
      cursor:pointer;
      transition:all 0.15s;
      display:flex;
      gap:10px;
      align-items:flex-start;
    }
    .pendente-item:hover { border-color:#0ea5e9; background:#0ea5e910; }
    .pendente-item.selected { border-color:#4ade80; background:#4ade8010; }

    .pendente-check { font-size:18px; color:#64748b; padding-top:1px; }
    .pendente-item.selected .pendente-check { color:#4ade80; }

    .pendente-info { flex:1; }
    .pendente-top { display:flex; justify-content:space-between; margin-bottom:4px; }
    .placa-badge { background:#1e2d4a; color:#38bdf8; padding:2px 7px; border-radius:4px; font-size:11px; font-weight:700; font-family:monospace; }
    .pendente-date { font-size:11px; color:#64748b; }
    .pendente-bottom { display:flex; gap:12px; font-size:11px; color:#94a3b8; margin-bottom:4px; }
    .pendente-vals { display:flex; gap:12px; font-size:11px; color:#64748b; }
    .val-green { color:#4ade80; font-weight:600; }

    .selection-summary { background:#4ade8015; border:1px solid #4ade8030; border-radius:8px; padding:10px 14px; margin-top:10px; display:flex; justify-content:space-between; font-size:13px; }
    .summary-val { color:#4ade80; font-weight:700; }
    .empty-state { text-align:center; padding:30px; color:#475569; }

    .form-card h3 { font-size:14px; font-weight:700; color:#f8fafc; margin:0 0 16px; }
    .field { display:flex; flex-direction:column; gap:5px; margin-bottom:12px; }
    .field label { font-size:11px; font-weight:600; color:#94a3b8; text-transform:uppercase; letter-spacing:0.5px; }
    .field input, .field select, .field textarea {
      background:#0a0f1e; border:1px solid #1e2d4a; border-radius:7px;
      padding:8px 10px; color:#e2e8f0; font-size:12px; outline:none; font-family:'Inter',sans-serif;
    }
    .field input:focus, .field select:focus, .field textarea:focus { border-color:#0ea5e9; }
    .field select option { background:#0d1427; }
    .field textarea { resize:vertical; }

    .btn-primary { width:100%; background:linear-gradient(135deg,#0ea5e9,#6366f1); border:none; border-radius:8px; padding:12px; color:#fff; font-size:13px; font-weight:600; cursor:pointer; transition:all 0.2s; display:flex; align-items:center; justify-content:center; gap:8px; margin-top:6px; }
    .btn-primary:hover:not(:disabled) { opacity:0.9; }
    .btn-primary:disabled { opacity:0.4; cursor:not-allowed; }
    .spinner { width:14px;height:14px;border:2px solid rgba(255,255,255,0.3);border-top-color:#fff;border-radius:50%;animation:spin 0.7s linear infinite; }
  `]
})
export class BaixaComponent implements OnInit {
  private api = inject(ApiService);
  private toastr = inject(ToastrService);
  private fb = inject(FormBuilder);

  pendentes = signal<Abastecimento[]>([]);
  proprietarios = signal<Proprietario[]>([]);
  selected = signal<Set<string>>(new Set());
  loadingPendentes = signal(true);
  saving = signal(false);

  filters: any = { id_proprietario: '', placa: '', data_inicio: '', data_fim: '' };

  form = this.fb.group({
    data_baixa:       [new Date().toISOString().slice(0,10)],
    tipo_despesa:     [''],
    descricao:        [''],
    forma_pagamento:  [''],
    data_pagamento:   [''],
    status1:          [''],
    placa1:           [''],
    recebedor:        [''],
    observacao:       [''],
    anexo:            [''],
  });

  ngOnInit() {
    this.api.getProprietariosAll().subscribe(r => this.proprietarios.set(r.data));
    this.loadPendentes();
  }

  loadPendentes() {
    this.loadingPendentes.set(true);
    this.api.getAbastecimentosPendenteBaixa(this.filters).subscribe({
      next: r => { this.pendentes.set(r); this.loadingPendentes.set(false); },
      error: () => this.loadingPendentes.set(false)
    });
  }

  isSelected(id: string): boolean { return this.selected().has(id); }

  toggleSelect(id: string) {
    const s = new Set(this.selected());
    s.has(id) ? s.delete(id) : s.add(id);
    this.selected.set(s);
  }

  selectAll() {
    this.selected.set(new Set(this.pendentes().map(a => a.id_abastecimento)));
  }

  clearSelection() { this.selected.set(new Set()); }

  totalSelecionado(): number {
    return this.pendentes()
      .filter(a => this.selected().has(a.id_abastecimento))
      .reduce((acc, a) => acc + (a.valor_total ?? 0), 0);
  }

  onSubmit() {
    if (this.selected().size === 0) { this.toastr.warning('Selecione ao menos um abastecimento'); return; }
    this.saving.set(true);

    const payload = {
      ...this.form.value,
      ids: Array.from(this.selected()),
    };

    this.api.createBaixaLote(payload).subscribe({
      next: (r: any) => {
        this.toastr.success(r.message ?? 'Baixas registradas com sucesso!');
        this.selected.set(new Set());
        this.form.patchValue({ data_baixa: new Date().toISOString().slice(0,10) });
        this.saving.set(false);
        this.loadPendentes();
      },
      error: err => {
        this.toastr.error(err.error?.message ?? 'Erro ao registrar baixas');
        this.saving.set(false);
      }
    });
  }
}
