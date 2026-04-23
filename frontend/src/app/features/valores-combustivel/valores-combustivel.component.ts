// src/app/features/valores-combustivel/valores-combustivel.component.ts
import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';
import { ToastrService } from 'ngx-toastr';
import { ValorCombustivel } from '../../shared/models';

@Component({
  selector: 'app-valores-combustivel',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule],
  template: `
    <div class="page">
      <div class="page-header">
        <div>
          <h1>Tabela de Preços</h1>
          <p>Gerencie os preços dos combustíveis. O preço vigente é usado nos novos abastecimentos.</p>
        </div>
        <button class="btn-primary" (click)="showForm.set(true)">+ Novo Preço</button>
      </div>

      <div class="info-banner">
        ⚠️ <strong>Importante:</strong> Uma vez registrado o abastecimento, o valor por litro fica gravado e não é alterado mesmo que o preço seja atualizado aqui.
      </div>

      <!-- Form -->
      @if (showForm()) {
        <div class="form-card">
          <h3>{{ editItem() ? 'Editar Preço' : 'Novo Preço' }}</h3>
          <form [formGroup]="form" (ngSubmit)="onSubmit()">
            <div class="form-row">
              <div class="field">
                <label>Tipo de Combustível <span class="req">*</span></label>
                <select formControlName="tipo_combustivel">
                  <option value="">Selecione...</option>
                  @for (t of tipos; track t) { <option [value]="t">{{ t }}</option> }
                </select>
              </div>
              <div class="field">
                <label>Valor (R$/L) <span class="req">*</span></label>
                <input type="number" formControlName="valor" placeholder="0.000" step="0.001" />
              </div>
              <div class="field">
                <label>Responsável</label>
                <input type="text" formControlName="responsavel" placeholder="Nome do responsável" />
              </div>
            </div>
            <div class="form-actions">
              <button type="button" class="btn-cancel" (click)="cancelForm()">Cancelar</button>
              <button type="submit" class="btn-primary" [disabled]="saving()">
                {{ saving() ? 'Salvando...' : 'Salvar' }}
              </button>
            </div>
          </form>
        </div>
      }

      <!-- Tabela -->
      <div class="table-card">
        <div class="table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th>Combustível</th>
                <th class="text-right">Valor (R$/L)</th>
                <th>Data/Hora</th>
                <th>Responsável</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              @for (v of valores(); track v.id_valor) {
                <tr>
                  <td><span class="fuel-badge">{{ v.tipo_combustivel }}</span></td>
                  <td class="text-right val-green">R$ {{ v.valor | number:'1.3-3' }}</td>
                  <td>{{ v.data | date:'dd/MM/yyyy HH:mm' }}</td>
                  <td>{{ v.responsavel ?? '—' }}</td>
                  <td>
                    <div class="actions">
                      <button class="action-btn" (click)="edit(v)">✏️</button>
                      <button class="action-btn" (click)="confirmDelete(v)">🗑️</button>
                    </div>
                  </td>
                </tr>
              }
              @empty {
                <tr><td colspan="5" class="empty-cell">Nenhum preço cadastrado</td></tr>
              }
            </tbody>
          </table>
        </div>
      </div>

      @if (deleteTarget()) {
        <div class="modal-overlay" (click)="deleteTarget.set(null)">
          <div class="modal" (click)="$event.stopPropagation()">
            <h3>Confirmar Exclusão</h3>
            <p>Excluir preço do combustível <strong>{{ deleteTarget()?.tipo_combustivel }}</strong>?</p>
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
    * { box-sizing:border-box; }
    .page { padding:28px; font-family:'Inter',sans-serif; color:#e2e8f0; }
    .page-header { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:16px; }
    .page-header h1 { font-size:24px; font-weight:700; color:#f8fafc; margin:0; }
    .page-header p { font-size:13px; color:#64748b; margin-top:4px; }
    .btn-primary { background:linear-gradient(135deg,#0ea5e9,#6366f1); border:none; border-radius:8px; padding:10px 20px; color:#fff; font-size:13px; font-weight:600; cursor:pointer; white-space:nowrap; }
    .info-banner { background:#fef9c310; border:1px solid #eab30840; color:#fbbf24; padding:12px 16px; border-radius:8px; font-size:12px; margin-bottom:16px; }
    .form-card { background:#0d1427; border:1px solid #1e2d4a; border-radius:12px; padding:20px; margin-bottom:16px; }
    .form-card h3 { font-size:14px; font-weight:700; color:#f8fafc; margin:0 0 14px; }
    .form-row { display:grid; grid-template-columns:repeat(auto-fill,minmax(200px,1fr)); gap:14px; margin-bottom:14px; }
    .field { display:flex; flex-direction:column; gap:5px; }
    .field label { font-size:11px; font-weight:600; color:#94a3b8; text-transform:uppercase; letter-spacing:0.5px; }
    .req { color:#f87171; }
    .field input, .field select { background:#0a0f1e; border:1px solid #1e2d4a; border-radius:7px; padding:8px 10px; color:#e2e8f0; font-size:12px; outline:none; }
    .field input:focus, .field select:focus { border-color:#0ea5e9; }
    .field select option { background:#0d1427; }
    .form-actions { display:flex; gap:10px; justify-content:flex-end; }
    .btn-cancel { background:transparent; border:1px solid #1e2d4a; color:#64748b; padding:8px 16px; border-radius:7px; cursor:pointer; font-size:13px; }
    .table-card { background:#0d1427; border:1px solid #1e2d4a; border-radius:12px; overflow:hidden; }
    .table-wrap { overflow-x:auto; }
    .data-table { width:100%; border-collapse:collapse; font-size:13px; }
    .data-table thead th { padding:10px 14px; font-size:11px; text-transform:uppercase; letter-spacing:0.5px; color:#64748b; border-bottom:1px solid #1e2d4a; background:#080e1c; text-align:left; }
    .data-table tbody td { padding:12px 14px; border-bottom:1px solid #1e2d4a15; }
    .data-table tbody tr:hover td { background:#1e2d4a15; }
    .text-right { text-align:right; }
    .fuel-badge { background:#1e2d4a; color:#38bdf8; padding:3px 10px; border-radius:5px; font-size:12px; font-weight:600; }
    .val-green { color:#4ade80; font-weight:700; font-size:14px; }
    .actions { display:flex; gap:6px; }
    .action-btn { background:transparent; border:none; cursor:pointer; font-size:14px; padding:4px 6px; border-radius:5px; }
    .action-btn:hover { background:#1e2d4a; }
    .empty-cell { text-align:center; padding:32px; color:#475569; }
    .modal-overlay { position:fixed; inset:0; background:rgba(0,0,0,0.7); display:flex; align-items:center; justify-content:center; z-index:1000; }
    .modal { background:#0d1427; border:1px solid #1e2d4a; border-radius:14px; padding:28px; max-width:380px; width:90%; }
    .modal h3 { font-size:16px; font-weight:700; color:#f8fafc; margin:0 0 10px; }
    .modal p { font-size:13px; color:#94a3b8; margin-bottom:16px; }
    .modal-actions { display:flex; gap:10px; justify-content:flex-end; }
    .btn-danger { background:#dc2626; border:none; color:#fff; padding:8px 16px; border-radius:7px; cursor:pointer; font-size:13px; font-weight:600; }
  `]
})
export class ValoresCombustivelComponent implements OnInit {
  private api = inject(ApiService);
  private toastr = inject(ToastrService);
  private fb = inject(FormBuilder);

  valores = signal<ValorCombustivel[]>([]);
  showForm = signal(false);
  editItem = signal<ValorCombustivel | null>(null);
  deleteTarget = signal<ValorCombustivel | null>(null);
  saving = signal(false);

  tipos = ['Diesel S10','Diesel Comum','Gasolina Comum','Gasolina Aditivada','Etanol','GNV','Arla 32'];

  form = this.fb.group({
    tipo_combustivel: ['', Validators.required],
    valor: [null as number | null, [Validators.required, Validators.min(0.001)]],
    responsavel: [''],
  });

  ngOnInit() { this.load(); }

  load() {
    this.api.getValoresCombustivel({ per_page: 100 }).subscribe(r => this.valores.set(r.data));
  }

  edit(v: ValorCombustivel) {
    this.editItem.set(v);
    this.form.patchValue(v as any);
    this.showForm.set(true);
  }

  cancelForm() { this.showForm.set(false); this.editItem.set(null); this.form.reset(); }

  onSubmit() {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    this.saving.set(true);
    const data = this.form.value as any;
    const obs = this.editItem()
      ? this.api.updateValorCombustivel(this.editItem()!.id_valor, data)
      : this.api.createValorCombustivel(data);
    obs.subscribe({
      next: () => { this.toastr.success('Salvo com sucesso'); this.cancelForm(); this.load(); this.saving.set(false); },
      error: () => { this.toastr.error('Erro ao salvar'); this.saving.set(false); }
    });
  }

  confirmDelete(v: ValorCombustivel) { this.deleteTarget.set(v); }

  executeDelete() {
    this.api.deleteValorCombustivel(this.deleteTarget()!.id_valor).subscribe({
      next: () => { this.toastr.success('Excluído'); this.deleteTarget.set(null); this.load(); },
      error: () => this.toastr.error('Erro ao excluir')
    });
  }
}
