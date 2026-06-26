// src/app/features/motoristas/motoristas.component.ts
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';
import { ToastrService } from 'ngx-toastr';
import { Motorista, Proprietario } from '../../shared/models';
import { AuthService } from '../../core/services/auth.service';
import { LinkedEntityContext, VinculosEntidadeModalComponent } from '../../shared/components/vinculos-entidade-modal/vinculos-entidade-modal.component';

@Component({
  selector: 'app-motoristas',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, VinculosEntidadeModalComponent],
  template: `
    <div class="page">
      <div class="page-header">
        <div><h1>Motoristas</h1><p>{{ total() }} cadastrados</p></div>
        @if (canCreate()) {
          <button class="btn-primary" (click)="newItem()">+ Novo Motorista</button>
        }
      </div>
      <div class="filters-row">
        <input type="text" [(ngModel)]="search" (input)="load()" placeholder="🔍 Nome, apelido ou documento..." class="search-input" />
        <div class="autocomplete-field filter-owner">
          <input
            type="text"
            [value]="proprietarioFiltroBusca()"
            placeholder="Digite a empresa responsável..."
            class="search-input"
            (input)="onFiltroProprietarioBuscaChange($event)"
            (focus)="showFiltroProprietarioOptions.set(true)"
            (blur)="closeFiltroProprietarioOptions()"
          />
          @if (proprietarioFiltroBusca()) {
            <button type="button" class="btn-clear-field" (mousedown)="selectFiltroProprietario(null)">×</button>
          }
          @if (showFiltroProprietarioOptions() && proprietariosFiltradosFiltro().length > 0) {
            <div class="autocomplete-list">
              <button type="button" class="autocomplete-item" (mousedown)="selectFiltroProprietario(null)">Todas as empresas responsáveis</button>
              @for (p of proprietariosFiltradosFiltro(); track p.id_proprietario) {
                <button type="button" class="autocomplete-item" (mousedown)="selectFiltroProprietario(p)">
                  {{ p.nome }}
                </button>
              }
            </div>
          }
        </div>
      </div>

      @if (canShowForm()) {
        <div class="form-card">
          <h3>{{ editItem() ? 'Editar' : 'Novo' }} Motorista</h3>
          <form [formGroup]="form" (ngSubmit)="onSubmit()">
            <div class="form-row">
              <div class="field">
                <label>Nome *</label>
                <input type="text" formControlName="nome" placeholder="Nome completo" />
              </div>
              <div class="field">
                <label>Apelido</label>
                <input type="text" formControlName="apelido" placeholder="Ex: Pézão" />
              </div>
              <div class="field">
                <label>Empresa responsável *</label>
                <div class="autocomplete-field">
                  <input
                    type="text"
                    [value]="proprietarioFormBusca()"
                    placeholder="Digite a empresa responsável..."
                    (input)="onFormProprietarioBuscaChange($event)"
                    (focus)="showFormProprietarioOptions.set(true)"
                    (blur)="closeFormProprietarioOptions()"
                  />
                  @if (showFormProprietarioOptions() && proprietariosFiltradosForm().length > 0) {
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
              <th>Apelido</th>
              <th>Documento</th>
              <th>Celular</th>
              <th>Empresa responsável</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            @for (m of items(); track m.id_motorista) {
              <tr class="click-row" (click)="openLinks(m)">
                <td><strong>{{ m.nome }}</strong></td>
                <td>{{ m.apelido || '—' }}</td>
                <td><code class="code-badge">{{ m.documento ?? '—' }}</code></td>
                <td>{{ m.celular ?? '—' }}</td>
                <td>{{ m.proprietario?.nome ?? '—' }}</td>
                <td>
                  <div class="actions">
                    @if (isAdmin()) {
                      <button class="action-btn" (click)="$event.stopPropagation(); edit(m)">✏️</button>
                      <button class="action-btn" (click)="$event.stopPropagation(); confirmDelete(m)">🗑️</button>
                    } @else {
                      <span style="color:#64748b;font-size:12px;">Somente leitura</span>
                    }
                  </div>
                </td>
              </tr>
            }
            @empty {
              <tr><td colspan="6" class="empty-cell">Nenhum motorista cadastrado</td></tr>
            }
          </tbody>
        </table>
      </div>

      @if (deleteTarget() && isAdmin()) {
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
      <app-vinculos-entidade-modal [context]="linksContext()" (closed)="linksContext.set(null)" />
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
    .filter-owner { width: 300px; max-width: 100%; }
    .filter-owner .search-input { width: 100%; max-width: none; }
    .autocomplete-field { position: relative; }
    .autocomplete-field input { width: 100%; padding-right: 34px; }
    .btn-clear-field {
      position: absolute; right: 6px; top: 50%; transform: translateY(-50%);
      width: 22px; height: 22px; border: none; border-radius: 5px; background: #1e2d4a;
      color: #cbd5e1; cursor: pointer; line-height: 1; font-size: 15px;
    }
    .btn-clear-field:hover { background: #334155; color: #fff; }
    .autocomplete-list {
      position: absolute; z-index: 30; top: calc(100% + 4px); left: 0; right: 0;
      max-height: 240px; overflow: auto; background: #0a0f1e; border: 1px solid #1e2d4a;
      border-radius: 8px; box-shadow: 0 16px 40px rgba(2,6,23,0.35); padding: 4px;
    }
    .autocomplete-item {
      width: 100%; border: none; background: transparent; color: #e2e8f0; text-align: left;
      padding: 8px 9px; border-radius: 6px; font-size: 12px; cursor: pointer;
    }
    .autocomplete-item:hover { background: #1e2d4a; }
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
    .click-row { cursor: pointer; }
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
  private auth = inject(AuthService);

  items = signal<Motorista[]>([]);
  proprietarios = signal<Proprietario[]>([]);
  total = signal(0);
  showForm = signal(false);
  editItem = signal<Motorista | null>(null);
  deleteTarget = signal<Motorista | null>(null);
  saving = signal(false);
  linksContext = signal<LinkedEntityContext | null>(null);
  search = '';
  filtroProprietario = '';
  proprietarioFiltroBusca = signal('');
  proprietarioFormBusca = signal('');
  showFiltroProprietarioOptions = signal(false);
  showFormProprietarioOptions = signal(false);

  proprietariosFiltradosFiltro = computed(() => this.filtrarProprietarios(this.proprietarioFiltroBusca()));
  proprietariosFiltradosForm = computed(() => this.filtrarProprietarios(this.proprietarioFormBusca()));

  form = this.fb.group({
    nome:             ['', Validators.required],
    apelido:          [''],
    id_proprietario:  ['', Validators.required],
    documento:        [''],
    celular:          [''],
  });
  isAdmin() { return this.auth.isAdmin(); }
  canCreate() { return this.auth.canCreateOperationalRecords(); }
  canShowForm() { return this.showForm() && (this.isAdmin() || !this.editItem()); }

  ngOnInit() {
    this.api.getProprietariosAll().subscribe(r => this.proprietarios.set(r.data));
    this.load();
  }

  load() {
    this.api.getMotoristas({ search: this.search, id_proprietario: this.filtroProprietario, per_page: 100 })
      .subscribe(r => { this.items.set(r.data); this.total.set(r.total); });
  }

  newItem() { this.editItem.set(null); this.proprietarioFormBusca.set(''); this.form.reset(); this.showForm.set(true); }

  edit(m: Motorista) {
    this.editItem.set(m);
    this.form.patchValue(m as any);
    this.proprietarioFormBusca.set(m.proprietario?.nome ?? this.proprietarios().find(p => p.id_proprietario === m.id_proprietario)?.nome ?? '');
    this.showForm.set(true);
  }

  openLinks(m: Motorista) { this.linksContext.set({ type: 'motorista', entity: m }); }

  cancelForm() { this.showForm.set(false); this.editItem.set(null); this.proprietarioFormBusca.set(''); this.form.reset(); }

  private normalizeText(value: unknown): string {
    return String(value ?? '').trim().toLowerCase();
  }

  private filtrarProprietarios(termRaw: string) {
    const term = this.normalizeText(termRaw);
    const list = this.proprietarios();
    if (!term) return list.slice(0, 40);
    return list.filter(p => this.normalizeText(p.nome).includes(term)).slice(0, 40);
  }

  onFiltroProprietarioBuscaChange(event: Event) {
    const value = (event.target as HTMLInputElement).value;
    this.proprietarioFiltroBusca.set(value);
    this.showFiltroProprietarioOptions.set(true);
    const exact = this.proprietarios().find(p => this.normalizeText(p.nome) === this.normalizeText(value));
    this.filtroProprietario = exact?.id_proprietario ?? '';
    this.load();
  }

  selectFiltroProprietario(p: Proprietario | null) {
    this.filtroProprietario = p?.id_proprietario ?? '';
    this.proprietarioFiltroBusca.set(p?.nome ?? '');
    this.showFiltroProprietarioOptions.set(false);
    this.load();
  }

  closeFiltroProprietarioOptions() {
    setTimeout(() => this.showFiltroProprietarioOptions.set(false), 120);
  }

  onFormProprietarioBuscaChange(event: Event) {
    const value = (event.target as HTMLInputElement).value;
    this.proprietarioFormBusca.set(value);
    this.showFormProprietarioOptions.set(true);
    this.form.patchValue({ id_proprietario: '' });
  }

  selectFormProprietario(p: Proprietario) {
    this.form.patchValue({ id_proprietario: p.id_proprietario });
    this.proprietarioFormBusca.set(p.nome);
    this.showFormProprietarioOptions.set(false);
  }

  closeFormProprietarioOptions() {
    setTimeout(() => this.showFormProprietarioOptions.set(false), 120);
  }

  onSubmit() {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    if (this.editItem() && !this.isAdmin()) {
      this.toastr.error('Somente administradores podem editar motoristas');
      return;
    }
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
