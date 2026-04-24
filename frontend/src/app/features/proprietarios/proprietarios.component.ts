// src/app/features/proprietarios/proprietarios.component.ts
import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';
import { ToastrService } from 'ngx-toastr';
import { Proprietario } from '../../shared/models';

@Component({
  selector: 'app-proprietarios',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule],
  template: `
    <div class="page">
      <div class="page-header">
        <div><h1>Proprietários</h1><p>{{ total() }} cadastrados</p></div>
        <button class="btn-primary" (click)="newItem()">+ Novo Proprietário</button>
      </div>
      <div class="search-bar">
        <input type="text" [(ngModel)]="search" (input)="load()" placeholder="🔍 Buscar por nome..." />
      </div>
      @if (showForm()) {
        <div class="form-card">
          <h3>{{ editItem() ? 'Editar' : 'Novo' }} Proprietário</h3>
          <form [formGroup]="form" (ngSubmit)="onSubmit()">
            <div class="form-row">
              <div class="field"><label>Nome *</label><input type="text" formControlName="nome" /></div>
              <div class="field"><label>Status</label>
                <select formControlName="status">
                  <option value="Ativo">Ativo</option><option value="Inativo">Inativo</option>
                </select>
              </div>
              <div class="field"><label>Responsável</label><input type="text" formControlName="responsavel" /></div>
              <div class="field"><label>Celular</label><input type="text" formControlName="celular" /></div>
            </div>
            <div class="form-actions">
              <button type="button" class="btn-cancel" (click)="cancelForm()">Cancelar</button>
              <button type="submit" class="btn-primary sm" [disabled]="saving()">{{ saving() ? 'Salvando...' : 'Salvar' }}</button>
            </div>
          </form>
        </div>
      }
      <div class="table-card">
        <table class="data-table">
          <thead><tr><th>Nome</th><th>Status</th><th>Responsável</th><th>Celular</th><th>Cadastro</th><th>Ações</th></tr></thead>
          <tbody>
            @for (p of items(); track p.id_proprietario) {
              <tr>
                <td><strong>{{ p.nome }}</strong></td>
                <td><span class="badge" [class]="p.status === 'Ativo' ? 'badge-green' : 'badge-gray'">{{ p.status ?? '—' }}</span></td>
                <td>{{ p.responsavel ?? '—' }}</td>
                <td>{{ p.celular ?? '—' }}</td>
                <td>{{ p.data_registro | date:'dd/MM/yyyy' }}</td>
                <td><div class="actions">
                  <button class="action-btn" (click)="edit(p)">✏️</button>
                  <button class="action-btn" (click)="confirmDelete(p)">🗑️</button>
                </div></td>
              </tr>
            }
            @empty { <tr><td colspan="6" class="empty-cell">Nenhum proprietário</td></tr> }
          </tbody>
        </table>
      </div>
      @if (deleteTarget()) {
        <div class="modal-overlay" (click)="deleteTarget.set(null)">
          <div class="modal" (click)="$event.stopPropagation()">
            <h3>Confirmar Exclusão</h3>
            <p>Excluir <strong>{{ deleteTarget()?.nome }}</strong>?</p>
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
    *{box-sizing:border-box}
    .page{padding:28px;font-family:'Inter',sans-serif;color:#e2e8f0}
    .page-header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px}
    .page-header h1{font-size:24px;font-weight:700;color:#111827;margin:0}
    .page-header p{font-size:13px;color:#64748b;margin-top:4px}
    .btn-primary{background:linear-gradient(135deg,#0ea5e9,#6366f1);border:none;border-radius:8px;padding:10px 20px;color:#fff;font-size:13px;font-weight:600;cursor:pointer}
    .btn-primary.sm{padding:8px 16px}
    .search-bar{margin-bottom:14px}
    .search-bar input{background:#0d1427;border:1px solid #1e2d4a;border-radius:8px;padding:10px 14px;color:#e2e8f0;font-size:13px;width:100%;max-width:360px;outline:none}
    .search-bar input:focus{border-color:#0ea5e9}
    .form-card{background:#0d1427;border:1px solid #1e2d4a;border-radius:12px;padding:20px;margin-bottom:16px}
    .form-card h3{font-size:14px;font-weight:700;color:#f8fafc;margin:0 0 14px}
    .form-row{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:14px;margin-bottom:14px}
    .field{display:flex;flex-direction:column;gap:5px}
    .field label{font-size:11px;font-weight:600;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px}
    .field input,.field select{background:#0a0f1e;border:1px solid #1e2d4a;border-radius:7px;padding:8px 10px;color:#e2e8f0;font-size:12px;outline:none}
    .field input:focus,.field select:focus{border-color:#0ea5e9}
    .field select option{background:#0d1427}
    .form-actions{display:flex;gap:10px;justify-content:flex-end}
    .btn-cancel{background:transparent;border:1px solid #1e2d4a;color:#64748b;padding:8px 16px;border-radius:7px;cursor:pointer;font-size:13px}
    .table-card{background:#0d1427;border:1px solid #1e2d4a;border-radius:12px;overflow:hidden}
    .data-table{width:100%;border-collapse:collapse;font-size:13px}
    .data-table thead th{padding:10px 14px;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:#64748b;border-bottom:1px solid #1e2d4a;background:#080e1c;text-align:left}
    .data-table tbody td{padding:12px 14px;border-bottom:1px solid #1e2d4a15}
    .data-table tbody tr:hover td{background:#1e2d4a15}
    .badge{padding:3px 8px;border-radius:20px;font-size:10px;font-weight:700;text-transform:uppercase}
    .badge-green{background:#dcfce720;color:#4ade80}
    .badge-gray{background:#1e2d4a;color:#64748b}
    .actions{display:flex;gap:6px}
    .action-btn{background:transparent;border:none;cursor:pointer;font-size:14px;padding:4px 6px;border-radius:5px}
    .action-btn:hover{background:#1e2d4a}
    .empty-cell{text-align:center;padding:32px;color:#475569}
    .modal-overlay{position:fixed;inset:0;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;z-index:1000}
    .modal{background:#0d1427;border:1px solid #1e2d4a;border-radius:14px;padding:28px;max-width:380px;width:90%}
    .modal h3{font-size:16px;font-weight:700;color:#f8fafc;margin:0 0 10px}
    .modal p{font-size:13px;color:#94a3b8;margin-bottom:16px}
    .modal-actions{display:flex;gap:10px;justify-content:flex-end}
    .btn-danger{background:#dc2626;border:none;color:#fff;padding:8px 16px;border-radius:7px;cursor:pointer;font-size:13px;font-weight:600}
  `]
})
export class ProprietariosComponent implements OnInit {
  private api = inject(ApiService); private toastr = inject(ToastrService); private fb = inject(FormBuilder);
  items = signal<Proprietario[]>([]); total = signal(0);
  showForm = signal(false); editItem = signal<Proprietario | null>(null); deleteTarget = signal<Proprietario | null>(null); saving = signal(false);
  search = '';
  form = this.fb.group({ nome:['',Validators.required],status:['Ativo'],responsavel:[''],celular:[''] });
  ngOnInit() { this.load(); }
  load() { this.api.getProprietarios({search:this.search,per_page:100}).subscribe(r=>{this.items.set(r.data);this.total.set(r.total)}); }
  newItem() { this.editItem.set(null);this.form.reset({status:'Ativo'});this.showForm.set(true); }
  edit(p:Proprietario) { this.editItem.set(p);this.form.patchValue(p as any);this.showForm.set(true); }
  cancelForm() { this.showForm.set(false);this.editItem.set(null);this.form.reset(); }
  onSubmit() {
    if(this.form.invalid){this.form.markAllAsTouched();return;}
    this.saving.set(true);
    const obs = this.editItem() ? this.api.updateProprietario(this.editItem()!.id_proprietario,this.form.value as any) : this.api.createProprietario(this.form.value as any);
    obs.subscribe({next:()=>{this.toastr.success('Salvo');this.cancelForm();this.load();this.saving.set(false);},error:()=>{this.toastr.error('Erro');this.saving.set(false);}});
  }
  confirmDelete(p:Proprietario){this.deleteTarget.set(p);}
  executeDelete(){this.api.deleteProprietario(this.deleteTarget()!.id_proprietario).subscribe({next:()=>{this.toastr.success('Excluído');this.deleteTarget.set(null);this.load();},error:err=>this.toastr.error(err.error?.message??'Erro')});}
}
