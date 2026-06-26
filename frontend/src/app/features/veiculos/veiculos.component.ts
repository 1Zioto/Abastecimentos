// src/app/features/veiculos/veiculos.component.ts
import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';
import { ToastrService } from 'ngx-toastr';
import { Veiculo, Proprietario } from '../../shared/models';
import { AuthService } from '../../core/services/auth.service';
import { LinkedEntityContext, VinculosEntidadeModalComponent } from '../../shared/components/vinculos-entidade-modal/vinculos-entidade-modal.component';

@Component({
  selector: 'app-veiculos', standalone: true, imports: [CommonModule, FormsModule, ReactiveFormsModule, VinculosEntidadeModalComponent],
  template: `
    <div class="page">
      <div class="page-header">
        <div><h1>Veículos</h1><p>{{ total() }} cadastrados</p></div>
        @if (canCreate()) {
          <button class="btn-primary" (click)="newItem()">+ Novo Veículo</button>
        }
      </div>
      <div class="filters-row">
        <div class="filter-field">
          <label>Placa / modelo</label>
          <input type="text" [(ngModel)]="search" (input)="load()" placeholder="Digite placa, marca ou modelo..." class="search-input" />
        </div>
        <div class="filter-field owner-filter">
          <label>Proprietário</label>
          <div class="autocomplete-field">
            <input
              type="text"
              [(ngModel)]="proprietarioFiltroBusca"
              placeholder="Digite o proprietário..."
              class="search-input"
              (input)="onFiltroProprietarioBuscaChange()"
              (focus)="showFiltroProprietarioOptions = true"
              (blur)="closeFiltroProprietarioOptions()"
            />
            @if (proprietarioFiltroBusca) {
              <button type="button" class="btn-clear-field" (mousedown)="selectFiltroProprietario(null)">×</button>
            }
            @if (showFiltroProprietarioOptions && proprietariosFiltradosFiltro().length > 0) {
              <div class="autocomplete-list">
                <button type="button" class="autocomplete-item" (mousedown)="selectFiltroProprietario(null)">Todos os proprietários</button>
                @for (p of proprietariosFiltradosFiltro(); track p.id_proprietario) {
                  <button type="button" class="autocomplete-item" (mousedown)="selectFiltroProprietario(p)">
                    {{ p.nome }}
                  </button>
                }
              </div>
            }
          </div>
        </div>
      </div>
      @if (canShowForm()) {
        <div class="form-card">
          <h3>{{ editItem() ? 'Editar' : 'Novo' }} Veículo</h3>
          <form [formGroup]="form" (ngSubmit)="onSubmit()">
            <div class="form-row">
              <div class="field"><label>Placa *</label><input type="text" formControlName="placa" placeholder="ABC-1234" /></div>
              <div class="field"><label>Proprietário *</label>
                <div class="autocomplete-field">
                  <input
                    type="text"
                    [value]="proprietarioFormBusca"
                    (input)="onFormProprietarioBuscaChange($event)"
                    (focus)="showFormProprietarioOptions = true"
                    (blur)="closeFormProprietarioOptions()"
                    placeholder="Digite o proprietário..."
                  />
                  @if (showFormProprietarioOptions && proprietariosFiltradosForm().length > 0) {
                    <div class="autocomplete-list">
                      @for (p of proprietariosFiltradosForm(); track p.id_proprietario) {
                        <button type="button" class="autocomplete-item" (mousedown)="selectFormProprietario(p)">
                          {{ p.nome }}
                        </button>
                      }
                    </div>
                  }
                </div>
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
              <tr class="click-row" (click)="openLinks(v)">
                <td><span class="placa-badge">{{ v.placa }}</span></td>
                <td>{{ v.marca }} {{ v.modelo }}</td>
                <td>{{ v.ano ?? '—' }}</td>
                <td>{{ v.proprietario?.nome ?? '—' }}</td>
                <td>{{ v.tipo_combustivel ?? '—' }}</td>
                <td>{{ v.odometro ? (v.odometro | number) + ' km' : '—' }}</td>
                <td><div class="actions">
                  @if (isAdmin()) {
                    <button class="action-btn" (click)="$event.stopPropagation(); edit(v)">✏️</button>
                    <button class="action-btn" (click)="$event.stopPropagation(); confirmDelete(v)">🗑️</button>
                  } @else {
                    <span style="color:#64748b;font-size:12px;">Somente leitura</span>
                  }
                </div></td>
              </tr>
            }
            @empty { <tr><td colspan="7" class="empty-cell">Nenhum veículo</td></tr> }
          </tbody>
        </table>
      </div>
      @if (deleteTarget() && isAdmin()) {
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
      <app-vinculos-entidade-modal [context]="linksContext()" (closed)="linksContext.set(null)" />
    </div>
  `,
  styles: [`
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap');
    *{box-sizing:border-box}.page{padding:28px;font-family:'Inter',sans-serif;color:#e2e8f0}
    .page-header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px}
    .page-header h1{font-size:24px;font-weight:700;color:#111827;margin:0}
    .page-header p{font-size:13px;color:#64748b;margin-top:4px}
    .btn-primary{background:linear-gradient(135deg,#0ea5e9,#6366f1);border:none;border-radius:8px;padding:10px 20px;color:#fff;font-size:13px;font-weight:600;cursor:pointer}
    .btn-primary.sm{padding:8px 16px}
    .filters-row{display:flex;gap:12px;margin-bottom:14px;align-items:flex-end;flex-wrap:wrap}
    .filter-field{display:flex;flex-direction:column;gap:5px;min-width:220px}
    .filter-field label{font-size:11px;font-weight:700;color:#52637a;text-transform:uppercase;letter-spacing:0.5px}
    .owner-filter{min-width:280px}
    .search-input,.filter-select{background:#0d1427;border:1px solid #1e2d4a;border-radius:8px;padding:8px 12px;color:#e2e8f0;font-size:12px;outline:none}
    .search-input{width:100%}.filter-select{width:100%;min-width:220px}
    .search-input:focus,.filter-select:focus{border-color:#0ea5e9}
    .filter-select option{background:#0d1427}
    .autocomplete-field{position:relative}
    .autocomplete-field input{width:100%;padding-right:34px}
    .btn-clear-field{position:absolute;right:6px;top:50%;transform:translateY(-50%);width:22px;height:22px;border:none;border-radius:5px;background:#1e2d4a;color:#cbd5e1;cursor:pointer;line-height:1;font-size:15px}
    .btn-clear-field:hover{background:#334155;color:#fff}
    .autocomplete-list{position:absolute;z-index:30;top:calc(100% + 4px);left:0;right:0;max-height:240px;overflow:auto;background:#0a0f1e;border:1px solid #1e2d4a;border-radius:8px;box-shadow:0 16px 40px rgba(2,6,23,0.35);padding:4px}
    .autocomplete-item{width:100%;border:none;background:transparent;color:#e2e8f0;text-align:left;padding:8px 9px;border-radius:6px;font-size:12px;cursor:pointer}
    .autocomplete-item:hover{background:#1e2d4a}
    .form-card{background:#0d1427;border:1px solid #1e2d4a;border-radius:12px;padding:20px;margin-bottom:16px}
    .form-card h3{font-size:14px;font-weight:700;color:#f8fafc;margin:0 0 14px}
    .form-row{display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:12px;margin-bottom:14px}
    .field{display:flex;flex-direction:column;gap:5px}
    .field label{font-size:11px;font-weight:600;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px}
    .field input,.field select{background:#0a0f1e;border:1px solid #1e2d4a;border-radius:7px;padding:8px 10px;color:#e2e8f0;font-size:12px;outline:none}
    .field .owner-search{margin-bottom:6px}
    .field input:focus,.field select:focus{border-color:#0ea5e9}
    .field select option{background:#0d1427}
    .form-actions{display:flex;gap:10px;justify-content:flex-end}
    .btn-cancel{background:transparent;border:1px solid #1e2d4a;color:#64748b;padding:8px 16px;border-radius:7px;cursor:pointer;font-size:13px}
    .table-card{background:#0d1427;border:1px solid #1e2d4a;border-radius:12px;overflow:hidden}
    .data-table{width:100%;border-collapse:collapse;font-size:13px}
    .data-table thead th{padding:10px 14px;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:#64748b;border-bottom:1px solid #1e2d4a;background:#080e1c;text-align:left}
    .data-table tbody td{padding:10px 14px;border-bottom:1px solid #1e2d4a15}
    .data-table tbody tr:hover td{background:#1e2d4a15}
    .click-row{cursor:pointer}
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
export class VeiculosComponent implements OnInit, OnDestroy {
  private api = inject(ApiService); private toastr = inject(ToastrService); private fb = inject(FormBuilder); private auth = inject(AuthService);
  items = signal<Veiculo[]>([]); proprietarios = signal<Proprietario[]>([]); total = signal(0);
  showForm = signal(false); editItem = signal<Veiculo | null>(null); deleteTarget = signal<Veiculo | null>(null); saving = signal(false);
  linksContext = signal<LinkedEntityContext | null>(null);
  search = ''; filtroProprietario = '';
  proprietarioFiltroBusca = '';
  proprietarioFormBusca = '';
  showFiltroProprietarioOptions = false;
  showFormProprietarioOptions = false;
  private readonly defaultTipoCombustivel = 'OLEO DIESEL S10';
  tipos: string[] = [this.defaultTipoCombustivel];
  form = this.fb.group({ placa:['',Validators.required],id_proprietario:['',Validators.required],marca:[''],modelo:[''],ano:[''],cor:[''],tipo_combustivel:[this.defaultTipoCombustivel],renavam:[''],numero_chassi:[''],odometro:[null] });
  private readonly onGaragemChanged = () => {
    this.loadTiposCombustivel();
    this.api.getProprietariosAll().subscribe(r=>this.proprietarios.set(r.data));
    this.load();
  };
  isAdmin() { return this.auth.isAdmin(); }
  canCreate() { return this.auth.canCreateOperationalRecords(); }
  canShowForm() { return this.showForm() && (this.isAdmin() || !this.editItem()); }
  ngOnInit() {
    window.addEventListener('garagem:changed', this.onGaragemChanged);
    this.loadTiposCombustivel();
    this.api.getProprietariosAll().subscribe(r=>this.proprietarios.set(r.data));
    this.load();
  }
  ngOnDestroy() {
    window.removeEventListener('garagem:changed', this.onGaragemChanged);
  }
  loadTiposCombustivel() {
    this.api.getValoresCombustivel({
      per_page: 500,
      local: this.auth.getGaragem() || this.auth.getFiliaisAcesso()[0] || 'Matriz',
    }).subscribe({
      next: (r) => {
        const tipos = Array.from(
          new Set(
            (r.data ?? [])
              .map((v: any) => String(v?.tipo_combustivel ?? '').trim())
              .filter(Boolean),
          ),
        );
        this.tipos = tipos.length ? tipos : [this.defaultTipoCombustivel];
        const tipoAtual = String(this.form.getRawValue().tipo_combustivel ?? '').trim();
        if (!tipoAtual || !this.tipos.includes(tipoAtual)) {
          this.form.patchValue({ tipo_combustivel: this.tipos[0] });
        }
      },
      error: () => {
        this.tipos = [this.defaultTipoCombustivel];
      }
    });
  }
  load() { this.api.getVeiculos({search:this.search,id_proprietario:this.filtroProprietario,per_page:100}).subscribe(r=>{this.items.set(r.data);this.total.set(r.total)}); }
  private normalizeText(value: unknown) {
    return String(value ?? '').trim().toLowerCase();
  }
  proprietariosFiltradosFiltro() {
    const termo = this.normalizeText(this.proprietarioFiltroBusca);
    if (!termo) return this.proprietarios();
    return this.proprietarios().filter(p =>
      this.normalizeText(p.nome).includes(termo) ||
      this.normalizeText(p.celular).includes(termo)
    );
  }
  proprietariosFiltradosForm() {
    const termo = this.normalizeText(this.proprietarioFormBusca);
    if (!termo) return this.proprietarios();
    return this.proprietarios().filter(p =>
      this.normalizeText(p.nome).includes(termo) ||
      this.normalizeText(p.celular).includes(termo)
    );
  }
  onFiltroProprietarioBuscaChange() {
    this.showFiltroProprietarioOptions = true;
    const exact = this.proprietarios().find(p => this.normalizeText(p.nome) === this.normalizeText(this.proprietarioFiltroBusca));
    this.filtroProprietario = exact?.id_proprietario ?? '';
    this.load();
  }
  selectFiltroProprietario(p: Proprietario | null) {
    this.filtroProprietario = p?.id_proprietario ?? '';
    this.proprietarioFiltroBusca = p?.nome ?? '';
    this.showFiltroProprietarioOptions = false;
    this.load();
  }
  closeFiltroProprietarioOptions() { setTimeout(() => this.showFiltroProprietarioOptions = false, 120); }
  onFormProprietarioBuscaChange(event: Event) {
    this.proprietarioFormBusca = (event.target as HTMLInputElement).value;
    this.showFormProprietarioOptions = true;
    this.form.patchValue({ id_proprietario: '' });
  }
  selectFormProprietario(p: Proprietario) {
    this.proprietarioFormBusca = p.nome;
    this.form.patchValue({ id_proprietario: p.id_proprietario });
    this.showFormProprietarioOptions = false;
  }
  closeFormProprietarioOptions() { setTimeout(() => this.showFormProprietarioOptions = false, 120); }
  newItem() { this.editItem.set(null);this.proprietarioFormBusca='';this.form.reset({ tipo_combustivel: this.tipos[0] ?? this.defaultTipoCombustivel });this.showForm.set(true); }
  edit(v:Veiculo) { this.editItem.set(v);this.proprietarioFormBusca=v.proprietario?.nome ?? this.proprietarios().find(p => p.id_proprietario === v.id_proprietario)?.nome ?? '';this.form.patchValue(v as any);this.showForm.set(true); }
  openLinks(v: Veiculo) { this.linksContext.set({ type: 'veiculo', entity: v }); }
  cancelForm() { this.showForm.set(false);this.editItem.set(null);this.proprietarioFormBusca='';this.form.reset({ tipo_combustivel: this.tipos[0] ?? this.defaultTipoCombustivel }); }
  onSubmit() {
    if(this.form.invalid){this.form.markAllAsTouched();return;}
    if (this.editItem() && !this.isAdmin()) {
      this.toastr.error('Somente administradores podem editar veículos');
      return;
    }
    this.saving.set(true);
    const obs = this.editItem() ? this.api.updateVeiculo(this.editItem()!.id_veiculo,this.form.value as any) : this.api.createVeiculo(this.form.value as any);
    obs.subscribe({next:()=>{this.toastr.success('Salvo');this.cancelForm();this.load();this.saving.set(false);},error:()=>{this.toastr.error('Erro');this.saving.set(false);}});
  }
  confirmDelete(v:Veiculo){this.deleteTarget.set(v);}
  executeDelete(){this.api.deleteVeiculo(this.deleteTarget()!.id_veiculo).subscribe({next:()=>{this.toastr.success('Excluído');this.deleteTarget.set(null);this.load();},error:err=>this.toastr.error(err.error?.message??'Erro')});}
}
