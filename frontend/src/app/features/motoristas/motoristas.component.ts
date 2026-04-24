// src/app/features/motoristas/motoristas.component.ts
import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';
import { ToastrService } from 'ngx-toastr';
import { Motorista, Proprietario } from '../../shared/models';

@Component({
  selector: 'app-motoristas',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule],
  template: `
    <div class="page">
      <div class="page-header">
        <div><h1>Motoristas</h1><p>{{ total() }} cadastrados</p></div>
        <button class="btn-primary" (click)="newItem()">+ Novo Motorista</button>
      </div>
      <div class="filters-row">
        <input type="text" [(ngModel)]="search" (input)="load()" placeholder="🔍 Nome ou documento..." class="search-input" />
        <select [(ngModel)]="filtroProprietario" (change)="load()" class="filter-select">
          <option value="">Todos os proprietários</option>
          @for (p of proprietarios(); track p.id_proprietario) {
            <option [value]="p.id_proprietario">{{ p.nome }}</option>
          }
        </select>
      </div>

      @if (showForm()) {
        <div class="form-card">
          <h3>{{ editItem() ? 'Editar' : 'Novo' }} Motorista</h3>
          <form [formGroup]="form" (ngSubmit)="onSubmit()">
            <div class="form-row">
              <div class="field">
                <label>Nome *</label>
                <input type="text" formControlName="nome" placeholder="Nome completo" />
              </div>
              <div class="field">
                <label>Proprietário *</label>
                <select formControlName="id_proprietario">
                  <option value="">Selecione...</option>
                  @for (p of proprietarios(); track p.id_proprietario) {
                    <option [value]="p.id_proprietario">{{ p.nome }}</option>
                  }
                </select>
              </div>
              <div class="field">
                <label>Documento (CPF/CNH)</label>
                <input type="text" formControlName="documento" placeholder="000.000.000-00" />
              </div>
              <div class="field">
                <label>Celular</label>
                <input type="text" formControlName="celular" placeholder="(27) 99999-9999" />
              </div>
            </div>
            <div class="form-actions">
              <button type="button" class="btn-cancel" (click)="cancelForm()">Cancelar</button>
              <button type="submit" class="btn-primary sm" [disabled]="saving()">
                {{ saving() ? 'Salvando...' : 'Salvar' }}
              </button>
            </div>
          </form>
        </div>
      }

      <div class="table-card">
        <table class="data-table">
          <thead>
            <tr>
              <th>Nome</th>
              <th>Documento</th>
              <th>Celular</th>
              <th>Proprietário</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            @for (m of items(); track m.id_motorista) {
              <tr>
                <td><strong>{{ m.nome }}</strong></td>
                <td><code class="code-badge">{{ m.documento ?? '—' }}</code></td>
                <td>{{ m.celular ?? '—' }}</td>
                <td>{{ m.proprietario?.nome ?? '—' }}</td>
                <td>
                  <div class="actions">
                    <button class="action-btn" (click)="edit(m)">✏️</button>
                    <button class="action-btn" (click)="confirmDelete(m)">🗑️</button>
                  </div>
                </td>
              </tr>
            }
            @empty {
              <tr><td colspan="5" class="empty-cell">Nenhum motorista cadastrado</td></tr>
            }
          </tbody>
        </table>
      </div>

      @if (deleteTarget()) {
        <div class="modal-overlay" (click)="deleteTarget.set(null)">
          <div class="modal" (click)="$event.stopPropagation()">
            <h3>Confirmar Exclusão</h3>
            <p>Excluir o motorista <strong>{{ deleteTarget()?.nome }}</strong>?</p>
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
    .page-header h1 { font-size: 24px; font-weight: 700; color: #111827; margin: 0; }
    .page-header p { font-size: 13px; color: #64748b; margin-top: 4px; }
    .btn-primary { background: linear-gradient(135deg, #0ea5e9, #6366f1); border: none; border-radius: 8px; padding: 10px 20px; color: #fff; font-size: 13px; font-weight: 600; cursor: pointer; }
    .btn-primary.sm { padding: 8px 16px; }
    .filters-row { display: flex; gap: 10px; margin-bottom: 14px; }
    .search-input, .filter-select { background: #0d1427; border: 1px solid #1e2d4a; border-radius: 8px; padding: 8px 12px; color: #e2e8f0; font-size: 12px; outline: none; }
    .search-input { flex: 1; max-width: 280px; }
    .filter-select { min-width: 220px; }
    .search-input:focus, .filter-select:focus { border-color: #0ea5e9; }
    .filter-select option { background: #0d1427; }
    .form-card { background: #0d1427; border: 1px solid #1e2d4a; border-radius: 12px; padding: 20px; margin-bottom: 16px; }
    .form-card h3 { font-size: 14px; font-weight: 700; color: #f8fafc; margin: 0 0 14px; }
    .form-row { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 14px; margin-bottom: 14px; }
    .field { display: flex; flex-direction: column; gap: 5px; }
    .field label { font-size: 11px; font-weight: 600; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px; }
    .field input, .field select { background: #0a0f1e; border: 1px solid #1e2d4a; border-radius: 7px; padding: 8px 10px; color: #e2e8f0; font-size: 12px; outline: none; font-family: 'Inter', sans-serif; }
    .field input:focus, .field select:focus { border-color: #0ea5e9; }
    .field select option { background: #0d1427; }
    .form-actions { display: flex; gap: 10px; justify-content: flex-end; }
    .btn-cancel { background: transparent; border: 1px solid #1e2d4a; color: #64748b; padding: 8px 16px; border-radius: 7px; cursor: pointer; font-size: 13px; }
    .table-card { background: #0d1427; border: 1px solid #1e2d4a; border-radius: 12px; overflow: hidden; }
    .data-table { width: 100%; border-collapse: collapse; font-size: 13px; }
    .data-table thead th { padding: 10px 14px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: #64748b; border-bottom: 1px solid #1e2d4a; background: #080e1c; text-align: left; }
    .data-table tbody td { padding: 12px 14px; border-bottom: 1px solid #1e2d4a15; }
    .data-table tbody tr:hover td { background: #1e2d4a15; }
    .code-badge { background: #0a0f1e; color: #a78bfa; padding: 2px 8px; border-radius: 4px; font-size: 12px; }
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
export class MotoristasComponent implements OnInit {
  private api = inject(ApiService);
  private toastr = inject(ToastrService);
  private fb = inject(FormBuilder);

  items = signal<Motorista[]>([]);
  proprietarios = signal<Proprietario[]>([]);
  total = signal(0);
  showForm = signal(false);
  editItem = signal<Motorista | null>(null);
  deleteTarget = signal<Motorista | null>(null);
  saving = signal(false);
  search = '';
  filtroProprietario = '';

  form = this.fb.group({
    nome:             ['', Validators.required],
    id_proprietario:  ['', Validators.required],
    documento:        [''],
    celular:          [''],
  });

  ngOnInit() {
    this.api.getProprietariosAll().subscribe(r => this.proprietarios.set(r.data));
    this.load();
  }

  load() {
    this.api.getMotoristas({ search: this.search, id_proprietario: this.filtroProprietario, per_page: 100 })
      .subscribe(r => { this.items.set(r.data); this.total.set(r.total); });
  }

  newItem() { this.editItem.set(null); this.form.reset(); this.showForm.set(true); }

  edit(m: Motorista) { this.editItem.set(m); this.form.patchValue(m as any); this.showForm.set(true); }

  cancelForm() { this.showForm.set(false); this.editItem.set(null); this.form.reset(); }

  onSubmit() {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    this.saving.set(true);
    const obs = this.editItem()
      ? this.api.updateMotorista(this.editItem()!.id_motorista, this.form.value as any)
      : this.api.createMotorista(this.form.value as any);
    obs.subscribe({
      next: () => { this.toastr.success('Salvo com sucesso'); this.cancelForm(); this.load(); this.saving.set(false); },
      error: () => { this.toastr.error('Erro ao salvar'); this.saving.set(false); }
    });
  }

  confirmDelete(m: Motorista) { this.deleteTarget.set(m); }

  executeDelete() {
    this.api.deleteMotorista(this.deleteTarget()!.id_motorista).subscribe({
      next: () => { this.toastr.success('Excluído'); this.deleteTarget.set(null); this.load(); },
      error: err => this.toastr.error(err.error?.message ?? 'Erro ao excluir')
    });
  }
}
