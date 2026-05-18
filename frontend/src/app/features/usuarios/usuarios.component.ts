// src/app/features/usuarios/usuarios.component.ts
import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';
import { ToastrService } from 'ngx-toastr';
import { Usuario } from '../../shared/models';

@Component({
  selector: 'app-usuarios',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule],
  template: `
    <div class="page">
      <div class="page-header">
        <div>
          <h1>Usuários</h1>
          <p>Gerencie os usuários do sistema</p>
        </div>
        <button class="btn-primary" (click)="newUser()">+ Novo Usuário</button>
      </div>

      @if (showForm()) {
        <div class="form-card">
          <h3>{{ editItem() ? 'Editar Usuário' : 'Novo Usuário' }}</h3>
          <form [formGroup]="form" (ngSubmit)="onSubmit()">
            <div class="form-row">
              <div class="field">
                <label>Nome <span class="req">*</span></label>
                <input type="text" formControlName="nome" placeholder="Nome completo" />
              </div>
              <div class="field">
                <label>Login <span class="req">*</span></label>
                <input type="text" formControlName="login" placeholder="login" />
              </div>
              <div class="field">
                <label>Senha {{ editItem() ? '(deixe em branco para manter)' : '' }} <span class="req">*</span></label>
                <input
                  type="password"
                  formControlName="password"
                  placeholder="••••••••"
                  autocomplete="new-password"
                  [readonly]="editItem() && !passwordEditing()"
                  (focus)="enablePasswordEditing()"
                />
              </div>
              <div class="field">
                <label>Tipo <span class="req">*</span></label>
                <select formControlName="tipo">
                  <option value="admin">Admin</option>
                  <option value="operador">Operador</option>
                  <option value="visualizador">Visualizador</option>
                </select>
              </div>
            </div>
            <div class="field branches-field">
              <label>Filiais liberadas <span class="req">*</span></label>
              <div class="branch-options">
                @for (filial of filiaisDisponiveis; track filial) {
                  <label class="branch-option">
                    <input
                      type="checkbox"
                      [checked]="filiaisSelecionadas().includes(filial)"
                      (change)="toggleFilial(filial, $any($event.target).checked)"
                    />
                    <span>{{ filial }}</span>
                  </label>
                }
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
        <div class="table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th>Nome</th>
                <th>Login</th>
                <th>Tipo</th>
                <th>Filiais</th>
                <th>Último Acesso</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              @for (u of usuarios(); track u.id_user) {
                <tr>
                  <td>{{ u.nome }}</td>
                  <td><code class="code-badge">{{ u.login }}</code></td>
                  <td><span class="tipo-badge tipo-{{ u.tipo }}">{{ u.tipo }}</span></td>
                  <td>
                    <div class="branch-tags">
                      @for (filial of filiaisDoUsuario(u); track filial) {
                        <span class="branch-tag">{{ filial }}</span>
                      }
                    </div>
                  </td>
                  <td>{{ u.ultimo_acesso ? (u.ultimo_acesso | date:'dd/MM/yyyy HH:mm') : '—' }}</td>
                  <td>
                    <div class="actions">
                      <button class="action-btn" (click)="edit(u)">✏️</button>
                      <button class="action-btn" (click)="confirmDelete(u)">🗑️</button>
                    </div>
                  </td>
                </tr>
              }
              @empty {
                <tr><td colspan="6" class="empty-cell">Nenhum usuário</td></tr>
              }
            </tbody>
          </table>
        </div>
      </div>

      @if (deleteTarget()) {
        <div class="modal-overlay" (click)="deleteTarget.set(null)">
          <div class="modal" (click)="$event.stopPropagation()">
            <h3>Confirmar Exclusão</h3>
            <p>Excluir o usuário <strong>{{ deleteTarget()?.nome }}</strong>?</p>
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
    .page-header { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:20px; }
    .page-header h1 { font-size:24px; font-weight:700; color:#111827; margin:0; }
    .page-header p { font-size:13px; color:#64748b; margin-top:4px; }
    .btn-primary { background:linear-gradient(135deg,#0ea5e9,#6366f1); border:none; border-radius:8px; padding:10px 20px; color:#fff; font-size:13px; font-weight:600; cursor:pointer; }
    .btn-primary.sm { padding:8px 16px; }
    .form-card { background:#0d1427; border:1px solid #1e2d4a; border-radius:12px; padding:20px; margin-bottom:16px; }
    .form-card h3 { font-size:14px; font-weight:700; color:#f8fafc; margin:0 0 14px; }
    .form-row { display:grid; grid-template-columns:repeat(auto-fill,minmax(200px,1fr)); gap:14px; margin-bottom:14px; }
    .field { display:flex; flex-direction:column; gap:5px; }
    .field label { font-size:11px; font-weight:600; color:#94a3b8; text-transform:uppercase; letter-spacing:0.5px; }
    .req { color:#f87171; }
    .field input, .field select { background:#0a0f1e; border:1px solid #1e2d4a; border-radius:7px; padding:8px 10px; color:#e2e8f0; font-size:12px; outline:none; }
    .field input:focus, .field select:focus { border-color:#0ea5e9; }
    .field select option { background:#0d1427; }
    .branches-field { margin-bottom:14px; }
    .branch-options { display:flex; flex-wrap:wrap; gap:10px; }
    .branch-option { display:flex; align-items:center; gap:8px; min-height:36px; padding:8px 12px; border:1px solid #1e2d4a; border-radius:8px; background:#0a0f1e; color:#e2e8f0; font-size:13px; font-weight:600; cursor:pointer; text-transform:none; letter-spacing:0; }
    .branch-option input { width:16px; height:16px; accent-color:#0ea5e9; }
    .form-actions { display:flex; gap:10px; justify-content:flex-end; }
    .btn-cancel { background:transparent; border:1px solid #1e2d4a; color:#64748b; padding:8px 16px; border-radius:7px; cursor:pointer; font-size:13px; }
    .table-card { background:#0d1427; border:1px solid #1e2d4a; border-radius:12px; overflow:hidden; }
    .table-wrap { overflow-x:auto; }
    .data-table { width:100%; border-collapse:collapse; font-size:13px; }
    .data-table thead th { padding:10px 14px; font-size:11px; text-transform:uppercase; letter-spacing:0.5px; color:#64748b; border-bottom:1px solid #1e2d4a; background:#080e1c; text-align:left; }
    .data-table tbody td { padding:12px 14px; border-bottom:1px solid #1e2d4a15; }
    .data-table tbody tr:hover td { background:#1e2d4a15; }
    .code-badge { background:#0a0f1e; color:#38bdf8; padding:2px 8px; border-radius:4px; font-size:12px; }
    .tipo-badge { padding:3px 10px; border-radius:20px; font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:0.5px; }
    .tipo-admin { background:#fee2e220; color:#f87171; }
    .tipo-operador { background:#dbeafe20; color:#60a5fa; }
    .tipo-visualizador { background:#dcfce720; color:#4ade80; }
    .branch-tags { display:flex; flex-wrap:wrap; gap:6px; }
    .branch-tag { background:#e0f2fe; color:#0369a1; border:1px solid #bae6fd; padding:3px 8px; border-radius:999px; font-size:11px; font-weight:700; }
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
export class UsuariosComponent implements OnInit {
  private api = inject(ApiService);
  private toastr = inject(ToastrService);
  private fb = inject(FormBuilder);

  usuarios = signal<Usuario[]>([]);
  showForm = signal(false);
  editItem = signal<Usuario | null>(null);
  deleteTarget = signal<Usuario | null>(null);
  saving = signal(false);
  passwordEditing = signal(false);
  filiaisDisponiveis = ['Matriz', 'Viana'];
  filiaisSelecionadas = signal<string[]>([...this.filiaisDisponiveis]);

  form = this.fb.group({
    nome:     ['', Validators.required],
    login:    ['', Validators.required],
    password: [''],
    tipo:     ['operador', Validators.required],
  });

  ngOnInit() { this.load(); }

  load() {
    this.api.getUsuarios({ per_page: 100 }).subscribe(r => this.usuarios.set(r.data));
  }

  newUser() {
    this.editItem.set(null);
    this.passwordEditing.set(true);
    this.form.reset({ tipo: 'operador' });
    this.filiaisSelecionadas.set([...this.filiaisDisponiveis]);
    this.form.get('password')?.setValidators(Validators.required);
    this.form.get('password')?.updateValueAndValidity();
    this.showForm.set(true);
  }

  edit(u: Usuario) {
    this.editItem.set(u);
    this.passwordEditing.set(false);
    this.form.patchValue({ ...u, password: '' } as any);
    this.form.get('password')?.markAsPristine();
    this.filiaisSelecionadas.set(this.filiaisDoUsuario(u));
    this.form.get('password')?.clearValidators();
    this.form.get('password')?.updateValueAndValidity();
    this.showForm.set(true);
  }

  cancelForm() { this.showForm.set(false); this.editItem.set(null); this.passwordEditing.set(false); this.form.reset(); this.filiaisSelecionadas.set([...this.filiaisDisponiveis]); }

  enablePasswordEditing() {
    if (!this.editItem() || this.passwordEditing()) return;
    this.passwordEditing.set(true);
    this.form.patchValue({ password: '' });
    this.form.get('password')?.markAsPristine();
  }

  filiaisDoUsuario(usuario: Usuario): string[] {
    const filiais = Array.isArray(usuario.filiais_acesso) ? usuario.filiais_acesso : [];
    const validas = filiais.filter(filial => this.filiaisDisponiveis.includes(filial));
    return validas.length ? validas : [...this.filiaisDisponiveis];
  }

  toggleFilial(filial: string, checked: boolean) {
    const atuais = this.filiaisSelecionadas();
    if (checked) {
      this.filiaisSelecionadas.set([...new Set([...atuais, filial])]);
      return;
    }
    this.filiaisSelecionadas.set(atuais.filter(item => item !== filial));
  }

  onSubmit() {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    if (!this.filiaisSelecionadas().length) {
      this.toastr.error('Selecione ao menos uma filial');
      return;
    }
    this.saving.set(true);
    const data = { ...(this.form.value as any), filiais_acesso: this.filiaisSelecionadas() };
    if (this.editItem()) {
      const passwordControl = this.form.get('password');
      if (!this.passwordEditing() || !passwordControl?.dirty || !String(data.password ?? '').trim()) {
        delete data.password;
      }
    }
    const obs = this.editItem()
      ? this.api.updateUsuario(this.editItem()!.id_user, data)
      : this.api.createUsuario(data);
    obs.subscribe({
      next: () => { this.toastr.success('Salvo'); this.cancelForm(); this.load(); this.saving.set(false); },
      error: err => { this.toastr.error(err.error?.message ?? 'Erro'); this.saving.set(false); }
    });
  }

  confirmDelete(u: Usuario) { this.deleteTarget.set(u); }

  executeDelete() {
    this.api.deleteUsuario(this.deleteTarget()!.id_user).subscribe({
      next: () => { this.toastr.success('Excluído'); this.deleteTarget.set(null); this.load(); },
      error: err => this.toastr.error(err.error?.message ?? 'Erro')
    });
  }
}
