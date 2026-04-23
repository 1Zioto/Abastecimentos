// src/app/features/entrada-notas/entrada-notas.component.ts
import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';
import { ToastrService } from 'ngx-toastr';
import { EntradaNota } from '../../shared/models';

@Component({
  selector: 'app-entrada-notas',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule],
  template: `
    <div class="page">
      <div class="page-header">
        <div>
          <h1>Entrada de Notas</h1>
          <p>Registre as notas fiscais de abastecimento</p>
        </div>
        <button class="btn-primary" (click)="newItem()">+ Nova Nota</button>
      </div>

      <!-- Filtros -->
      <div class="filters-card">
        <div class="filters-grid">
          <div class="filter-field">
            <label>Tipo</label>
            <select [(ngModel)]="filtroTipo" (change)="load()">
              <option value="">Todos</option>
              <option value="Diesel">Diesel</option>
              <option value="Gasolina">Gasolina</option>
              <option value="Etanol">Etanol</option>
              <option value="GNV">GNV</option>
              <option value="Arla 32">Arla 32</option>
            </select>
          </div>
          <div class="filter-field">
            <label>Data Início</label>
            <input type="date" [(ngModel)]="filtroDataInicio" (change)="load()" />
          </div>
          <div class="filter-field">
            <label>Data Fim</label>
            <input type="date" [(ngModel)]="filtroDataFim" (change)="load()" />
          </div>
        </div>
      </div>

      <!-- Formulário -->
      @if (showForm()) {
        <div class="form-card">
          <h3>{{ editItem() ? 'Editar Nota' : 'Nova Nota Fiscal' }}</h3>
          <form [formGroup]="form" (ngSubmit)="onSubmit()">
            <div class="form-row">
              <div class="field">
                <label>Data *</label>
                <input type="date" formControlName="data" />
              </div>
              <div class="field">
                <label>Número da NF</label>
                <input type="text" formControlName="numero_nota_fiscal" placeholder="000000" />
              </div>
              <div class="field">
                <label>Tipo</label>
                <select formControlName="tipo">
                  <option value="">Selecione...</option>
                  <option value="Diesel S10">Diesel S10</option>
                  <option value="Diesel Comum">Diesel Comum</option>
                  <option value="Gasolina Comum">Gasolina Comum</option>
                  <option value="Gasolina Aditivada">Gasolina Aditivada</option>
                  <option value="Etanol">Etanol</option>
                  <option value="GNV">GNV</option>
                  <option value="Arla 32">Arla 32</option>
                </select>
              </div>
              <div class="field">
                <label>Quantidade (L)</label>
                <input type="number" formControlName="quantidade" placeholder="0.00" step="0.01" (input)="calcValor()" />
              </div>
              <div class="field">
                <label>Valor por Litro</label>
                <input type="number" formControlName="valor_litro" placeholder="0.000" step="0.001" (input)="calcValor()" />
              </div>
              <div class="field">
                <label>Valor Total</label>
                <input type="number" formControlName="valor" placeholder="0.00" step="0.01" class="highlight-field" />
              </div>
              <div class="field">
                <label>Responsável</label>
                <input type="text" formControlName="responsavel" placeholder="Nome" />
              </div>
              <div class="field">
                <label>Foto / Anexo (URL)</label>
                <input type="text" formControlName="foto_nota" placeholder="https://..." />
              </div>
            </div>
            <div class="form-actions">
              <button type="button" class="btn-cancel" (click)="cancelForm()">Cancelar</button>
              <button type="submit" class="btn-primary sm" [disabled]="saving()">
                {{ saving() ? 'Salvando...' : 'Salvar Nota' }}
              </button>
            </div>
          </form>
        </div>
      }

      <!-- Totais rápidos -->
      @if (notas().length > 0) {
        <div class="summary-row">
          <div class="summary-item">
            <span class="s-label">Registros</span>
            <span class="s-value">{{ notas().length }}</span>
          </div>
          <div class="summary-item">
            <span class="s-label">Total Litros</span>
            <span class="s-value blue">{{ totalLitros() | number:'1.2-2' }} L</span>
          </div>
          <div class="summary-item">
            <span class="s-label">Valor Total</span>
            <span class="s-value green">{{ totalValor() | currency:'BRL':'symbol':'1.2-2' }}</span>
          </div>
        </div>
      }

      <!-- Tabela -->
      <div class="table-card">
        <div class="table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th>Data</th>
                <th>Nº NF</th>
                <th>Tipo</th>
                <th class="text-right">Qtd (L)</th>
                <th class="text-right">R$/L</th>
                <th class="text-right">Valor Total</th>
                <th>Responsável</th>
                <th>Anexo</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              @for (n of notas(); track n.id_financeiro) {
                <tr>
                  <td>{{ n.data | date:'dd/MM/yyyy' }}</td>
                  <td><code class="code-badge">{{ n.numero_nota_fiscal ?? '—' }}</code></td>
                  <td><span class="fuel-badge">{{ n.tipo ?? '—' }}</span></td>
                  <td class="text-right">{{ n.quantidade ? (n.quantidade | number:'1.2-2') : '—' }}</td>
                  <td class="text-right">{{ n.valor_litro ? (n.valor_litro | number:'1.3-3') : '—' }}</td>
                  <td class="text-right val-green">
                    {{ n.valor ? (n.valor | currency:'BRL':'symbol':'1.2-2') : '—' }}
                  </td>
                  <td>{{ n.responsavel ?? '—' }}</td>
                  <td>
                    @if (n.foto_nota) {
                      <a [href]="n.foto_nota" target="_blank" class="link-btn">📎 Ver</a>
                    } @else { — }
                  </td>
                  <td>
                    <div class="actions">
                      <button class="action-btn" (click)="edit(n)" title="Editar">✏️</button>
                      <button class="action-btn" (click)="confirmDelete(n)" title="Excluir">🗑️</button>
                    </div>
                  </td>
                </tr>
              }
              @empty {
                <tr><td colspan="9" class="empty-cell">Nenhuma nota registrada</td></tr>
              }
            </tbody>
          </table>
        </div>
      </div>

      @if (deleteTarget()) {
        <div class="modal-overlay" (click)="deleteTarget.set(null)">
          <div class="modal" (click)="$event.stopPropagation()">
            <h3>Confirmar Exclusão</h3>
            <p>Excluir a nota fiscal <strong>{{ deleteTarget()?.numero_nota_fiscal ?? deleteTarget()?.id_financeiro }}</strong>?</p>
            <div class="modal-actions">
              <button class="btn-cancel" (click)="deleteTarget.set(null)">Cancelar</button>
              <button class="btn-danger" (click)="executeDelete()">Excluir</button>
            </div>
          </div>
        </div>
      }
    </div>
  `,
  styles: [`
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap');
    * { box-sizing: border-box; }
    .page { padding: 28px; font-family: 'Inter', sans-serif; color: #e2e8f0; }
    .page-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 16px; }
    .page-header h1 { font-size: 24px; font-weight: 700; color: #f8fafc; margin: 0; }
    .page-header p { font-size: 13px; color: #64748b; margin-top: 4px; }
    .btn-primary { background: linear-gradient(135deg, #0ea5e9, #6366f1); border: none; border-radius: 8px; padding: 10px 20px; color: #fff; font-size: 13px; font-weight: 600; cursor: pointer; }
    .btn-primary.sm { padding: 8px 16px; }

    .filters-card { background: #0d1427; border: 1px solid #1e2d4a; border-radius: 12px; padding: 16px; margin-bottom: 14px; }
    .filters-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 12px; }
    .filter-field { display: flex; flex-direction: column; gap: 4px; }
    .filter-field label { font-size: 11px; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; }
    .filter-field input, .filter-field select { background: #0a0f1e; border: 1px solid #1e2d4a; border-radius: 7px; padding: 8px 10px; color: #e2e8f0; font-size: 12px; outline: none; }
    .filter-field input:focus, .filter-field select:focus { border-color: #0ea5e9; }
    .filter-field select option { background: #0d1427; }

    .form-card { background: #0d1427; border: 1px solid #1e2d4a; border-radius: 12px; padding: 20px; margin-bottom: 16px; }
    .form-card h3 { font-size: 14px; font-weight: 700; color: #f8fafc; margin: 0 0 14px; }
    .form-row { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 14px; margin-bottom: 14px; }
    .field { display: flex; flex-direction: column; gap: 5px; }
    .field label { font-size: 11px; font-weight: 600; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px; }
    .field input, .field select { background: #0a0f1e; border: 1px solid #1e2d4a; border-radius: 7px; padding: 8px 10px; color: #e2e8f0; font-size: 12px; outline: none; font-family: 'Inter', sans-serif; }
    .field input:focus, .field select:focus { border-color: #0ea5e9; }
    .field select option { background: #0d1427; }
    .highlight-field { border-color: #4ade8040 !important; color: #4ade80 !important; font-weight: 600; }
    .form-actions { display: flex; gap: 10px; justify-content: flex-end; }
    .btn-cancel { background: transparent; border: 1px solid #1e2d4a; color: #64748b; padding: 8px 16px; border-radius: 7px; cursor: pointer; font-size: 13px; }

    .summary-row { display: flex; gap: 16px; margin-bottom: 14px; }
    .summary-item { background: #0d1427; border: 1px solid #1e2d4a; border-radius: 10px; padding: 12px 18px; display: flex; flex-direction: column; }
    .s-label { font-size: 10px; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; }
    .s-value { font-size: 18px; font-weight: 700; color: #f8fafc; margin-top: 2px; }
    .s-value.blue { color: #38bdf8; }
    .s-value.green { color: #4ade80; }

    .table-card { background: #0d1427; border: 1px solid #1e2d4a; border-radius: 12px; overflow: hidden; }
    .table-wrap { overflow-x: auto; }
    .data-table { width: 100%; border-collapse: collapse; font-size: 12px; }
    .data-table thead th { padding: 10px 12px; font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; color: #64748b; border-bottom: 1px solid #1e2d4a; background: #080e1c; text-align: left; white-space: nowrap; }
    .data-table tbody td { padding: 10px 12px; border-bottom: 1px solid #1e2d4a15; vertical-align: middle; }
    .data-table tbody tr:hover td { background: #1e2d4a15; }
    .text-right { text-align: right; }
    .val-green { color: #4ade80; font-weight: 600; }
    .code-badge { background: #0a0f1e; color: #94a3b8; padding: 2px 7px; border-radius: 4px; font-size: 11px; }
    .fuel-badge { background: #1e2d4a; color: #38bdf8; padding: 3px 8px; border-radius: 5px; font-size: 11px; font-weight: 600; }
    .link-btn { color: #38bdf8; font-size: 11px; text-decoration: none; }
    .link-btn:hover { text-decoration: underline; }
    .actions { display: flex; gap: 6px; }
    .action-btn { background: transparent; border: none; cursor: pointer; font-size: 14px; padding: 4px 6px; border-radius: 5px; }
    .action-btn:hover { background: #1e2d4a; }
    .empty-cell { text-align: center; padding: 32px; color: #475569; }
    .modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.7); display: flex; align-items: center; justify-content: center; z-index: 1000; }
    .modal { background: #0d1427; border: 1px solid #1e2d4a; border-radius: 14px; padding: 28px; max-width: 380px; width: 90%; }
    .modal h3 { font-size: 16px; font-weight: 700; color: #f8fafc; margin: 0 0 10px; }
    .modal p { font-size: 13px; color: #94a3b8; margin-bottom: 16px; }
    .modal-actions { display: flex; gap: 10px; justify-content: flex-end; }
    .btn-danger { background: #dc2626; border: none; color: #fff; padding: 8px 16px; border-radius: 7px; cursor: pointer; font-size: 13px; font-weight: 600; }
  `]
})
export class EntradaNotasComponent implements OnInit {
  private api = inject(ApiService);
  private toastr = inject(ToastrService);
  private fb = inject(FormBuilder);

  notas = signal<EntradaNota[]>([]);
  showForm = signal(false);
  editItem = signal<EntradaNota | null>(null);
  deleteTarget = signal<EntradaNota | null>(null);
  saving = signal(false);

  filtroTipo = '';
  filtroDataInicio = '';
  filtroDataFim = '';

  form = this.fb.group({
    data:               ['', Validators.required],
    numero_nota_fiscal: [''],
    tipo:               [''],
    quantidade:         [null as number | null],
    valor_litro:        [null as number | null],
    valor:              [null as number | null],
    responsavel:        [''],
    foto_nota:          [''],
  });

  ngOnInit() { this.load(); }

  load() {
    this.api.getEntradaNotas({
      tipo: this.filtroTipo,
      data_inicio: this.filtroDataInicio,
      data_fim: this.filtroDataFim,
      per_page: 100
    }).subscribe(r => this.notas.set(r.data));
  }

  calcValor() {
    const qtd = this.form.value.quantidade ?? 0;
    const vl  = this.form.value.valor_litro ?? 0;
    if (qtd && vl) {
      this.form.patchValue({ valor: +(qtd * vl).toFixed(2) });
    }
  }

  totalLitros(): number {
    return this.notas().reduce((a, n) => a + (n.quantidade ?? 0), 0);
  }

  totalValor(): number {
    return this.notas().reduce((a, n) => a + (n.valor ?? 0), 0);
  }

  newItem() {
    this.editItem.set(null);
    this.form.reset({ data: new Date().toISOString().slice(0, 10) });
    this.showForm.set(true);
  }

  edit(n: EntradaNota) {
    this.editItem.set(n);
    this.form.patchValue({ ...n, data: n.data?.slice(0, 10) } as any);
    this.showForm.set(true);
  }

  cancelForm() { this.showForm.set(false); this.editItem.set(null); this.form.reset(); }

  onSubmit() {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    this.saving.set(true);
    const data = this.form.value as any;
    const obs = this.editItem()
      ? this.api.updateEntradaNota(this.editItem()!.id_financeiro, data)
      : this.api.createEntradaNota(data);
    obs.subscribe({
      next: () => { this.toastr.success('Nota salva com sucesso'); this.cancelForm(); this.load(); this.saving.set(false); },
      error: () => { this.toastr.error('Erro ao salvar nota'); this.saving.set(false); }
    });
  }

  confirmDelete(n: EntradaNota) { this.deleteTarget.set(n); }

  executeDelete() {
    this.api.deleteEntradaNota(this.deleteTarget()!.id_financeiro).subscribe({
      next: () => { this.toastr.success('Nota excluída'); this.deleteTarget.set(null); this.load(); },
      error: () => this.toastr.error('Erro ao excluir')
    });
  }
}
