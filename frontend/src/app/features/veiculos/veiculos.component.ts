// src/app/features/veiculos/veiculos.component.ts
import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';
import { ToastrService } from 'ngx-toastr';
import { Veiculo, Proprietario } from '../../shared/models';

@Component({
  selector: 'app-veiculos', standalone: true, imports: [CommonModule, FormsModule, ReactiveFormsModule],
  template: `
    <div class="page">
      <div class="page-header">
        <div><h1>Veículos</h1><p>{{ total() }} cadastrados</p></div>
        <button class="btn-primary" (click)="newItem()">+ Novo Veículo</button>
      </div>
      <div class="filters-row">
        <input type="text" [(ngModel)]="search" (input)="load()" placeholder="🔍 Placa ou modelo..." class="search-input" />
        <select [(ngModel)]="filtroProprietario" (change)="load()" class="filter-select">
          <option value="">Todos os proprietários</option>
          @for (p of proprietarios(); track p.id_proprietario) {
            <option [value]="p.id_proprietario">{{ p.nome }}</option>
          }
        </select>
      </div>
      @if (showForm()) {
        <div class="form-card">
          <h3>{{ editItem() ? 'Editar' : 'Novo' }} Veículo</h3>
          <form [formGroup]="form" (ngSubmit)="onSubmit()">
            <div class="form-row">
              <div class="field"><label>Placa *</label><input type="text" formControlName="placa" placeholder="ABC-1234" /></div>
              <div class="field"><label>Proprietário *</label>
                <select formControlName="id_proprietario">
                  <option value="">Selecione...</option>
                  @for (p of proprietarios(); track p.id_proprietario) { <option [value]="p.id_proprietario">{{ p.nome }}</option> }
                </select>
              </div>
              <div class="field"><label>Marca</label><input type="text" formControlName="marca" /></div>
              <div class="field"><label>Modelo</label><input type="text" formControlName="modelo" /></div>
              <div class="field"><label>Ano</label><input type="text" formControlName="ano" placeholder="2024" /></div>
              <div class="field"><label>Cor</label><input type="text" formControlName="cor" /></div>
              <div class="field"><label>Combustível</label>
                <select formControlName="tipo_combustivel">
                  <option value="">Selecione...</option>
                  @for (t of tipos; track t) { <option [value]="t">{{ t }}</option> }
                </select>
              </div>
              <div class="field"><label>RENAVAM</label><input type="text" formControlName="renavam" /></div>
              <div class="field"><label>Chassi</label><input type="text" formControlName="numero_chassi" /></div>
              <div class="field"><label>Odômetro</label><input type="number" formControlName="odometro" /></div>
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
          <thead><tr><th>Placa</th><th>Marca/Modelo</th><th>Ano</th><th>Proprietário</th><th>Combustível</th><th>Odômetro</th><th>Ações</th></tr></thead>
          <tbody>
            @for (v of items(); track v.id_veiculo) {
              <tr>
                <td><span class="placa-badge">{{ v.placa }}</span></td>
                <td>{{ v.marca }} {{ v.modelo }}</td>
                <td>{{ v.ano ?? '—' }}</td>
                <td>{{ v.proprietario?.nome ?? '—' }}</td>
                <td>{{ v.tipo_combustivel ?? '—' }}</td>
                <td>{{ v.odometro ? (v.odometro | number) + ' km' : '—' }}</td>
                <td><div class="actions">
                  <button class="action-btn" (click)="edit(v)">✏️</button>
                  <button class="action-btn" (click)="confirmDelete(v)">🗑️</button>
                </div></td>
              </tr>
            }
            @empty { <tr><td colspan="7" class="empty-cell">Nenhum veículo</td></tr> }
          </tbody>
        </table>
      </div>
      @if (deleteTarget()) {
        <div class="modal-overlay" (click)="deleteTarget.set(null)">
          <div class="modal" (click)="$event.stopPropagation()">
            <h3>Confirmar Exclusão</h3><p>Excluir veículo <strong>{{ deleteTarget()?.placa }}</strong>?</p>
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
    *{box-sizing:border-box}.page{padding:28px;font-family:'Inter',sans-serif;color:#e2e8f0}
    .page-header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px}
    .page-header h1{font-size:24px;font-weight:700;color:#f8fafc;margin:0}
    .page-header p{font-size:13px;color:#64748b;margin-top:4px}
    .btn-primary{background:linear-gradient(135deg,#0ea5e9,#6366f1);border:none;border-radius:8px;padding:10px 20px;color:#fff;font-size:13px;font-weight:600;cursor:pointer}
    .btn-primary.sm{padding:8px 16px}
    .filters-row{display:flex;gap:10px;margin-bottom:14px}
    .search-input,.filter-select{background:#0d1427;border:1px solid #1e2d4a;border-radius:8px;padding:8px 12px;color:#e2e8f0;font-size:12px;outline:none}
    .search-input{flex:1;max-width:280px}.filter-select{min-width:220px}
    .search-input:focus,.filter-select:focus{border-color:#0ea5e9}
    .filter-select option{background:#0d1427}
    .form-card{background:#0d1427;border:1px solid #1e2d4a;border-radius:12px;padding:20px;margin-bottom:16px}
    .form-card h3{font-size:14px;font-weight:700;color:#f8fafc;margin:0 0 14px}
    .form-row{display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:12px;margin-bottom:14px}
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
    .data-table tbody td{padding:10px 14px;border-bottom:1px solid #1e2d4a15}
    .data-table tbody tr:hover td{background:#1e2d4a15}
    .placa-badge{background:#1e2d4a;color:#38bdf8;padding:3px 8px;border-radius:5px;font-size:12px;font-weight:700;font-family:monospace}
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
export class VeiculosComponent implements OnInit {
  private api = inject(ApiService); private toastr = inject(ToastrService); private fb = inject(FormBuilder);
  items = signal<Veiculo[]>([]); proprietarios = signal<Proprietario[]>([]); total = signal(0);
  showForm = signal(false); editItem = signal<Veiculo | null>(null); deleteTarget = signal<Veiculo | null>(null); saving = signal(false);
  search = ''; filtroProprietario = '';
  tipos = ['Diesel S10','Diesel Comum','Gasolina Comum','Gasolina Aditivada','Etanol','GNV','Arla 32'];
  form = this.fb.group({ placa:['',Validators.required],id_proprietario:['',Validators.required],marca:[''],modelo:[''],ano:[''],cor:[''],tipo_combustivel:[''],renavam:[''],numero_chassi:[''],odometro:[null] });
  ngOnInit() { this.api.getProprietariosAll().subscribe(r=>this.proprietarios.set(r.data)); this.load(); }
  load() { this.api.getVeiculos({search:this.search,id_proprietario:this.filtroProprietario,per_page:100}).subscribe(r=>{this.items.set(r.data);this.total.set(r.total)}); }
  newItem() { this.editItem.set(null);this.form.reset();this.showForm.set(true); }
  edit(v:Veiculo) { this.editItem.set(v);this.form.patchValue(v as any);this.showForm.set(true); }
  cancelForm() { this.showForm.set(false);this.editItem.set(null);this.form.reset(); }
  onSubmit() {
    if(this.form.invalid){this.form.markAllAsTouched();return;}
    this.saving.set(true);
    const obs = this.editItem() ? this.api.updateVeiculo(this.editItem()!.id_veiculo,this.form.value as any) : this.api.createVeiculo(this.form.value as any);
    obs.subscribe({next:()=>{this.toastr.success('Salvo');this.cancelForm();this.load();this.saving.set(false);},error:()=>{this.toastr.error('Erro');this.saving.set(false);}});
  }
  confirmDelete(v:Veiculo){this.deleteTarget.set(v);}
  executeDelete(){this.api.deleteVeiculo(this.deleteTarget()!.id_veiculo).subscribe({next:()=>{this.toastr.success('Excluído');this.deleteTarget.set(null);this.load();},error:err=>this.toastr.error(err.error?.message??'Erro')});}
}
