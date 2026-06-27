// src/app/features/proprietarios/proprietarios.component.ts
import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';
import { ToastrService } from 'ngx-toastr';
import { Proprietario } from '../../shared/models';
import { AuthService } from '../../core/services/auth.service';
import { LinkedEntityContext, VinculosEntidadeModalComponent } from '../../shared/components/vinculos-entidade-modal/vinculos-entidade-modal.component';

@Component({
  selector: 'app-proprietarios',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, VinculosEntidadeModalComponent],
  template: `
    <div class="page">
      <div class="page-header">
        <div><h1>Proprietários</h1><p>{{ total() }} cadastrados</p></div>
        @if (canCreate()) {
          <button class="btn-primary" (click)="newItem()">+ Novo Proprietário</button>
        }
      </div>
      <div class="search-bar">
        <input type="text" [(ngModel)]="search" (input)="load()" placeholder="🔍 Buscar por nome..." />
      </div>
      @if (canShowForm()) {
        <div class="form-card">
          <h3>{{ editItem() ? 'Editar' : 'Novo' }} Proprietário</h3>
          <form [formGroup]="form" (ngSubmit)="onSubmit()">
            <div class="form-row">
              <div class="field"><label>Nome *</label><input type="text" formControlName="nome" /></div>
              <div class="field"><label>Status</label>
                <select formControlName="status">
                  <option value="Ativo">Ativo</option>
                  <option value="Inativo">Inativo</option>
                  <option value="Bloqueado">Bloqueado</option>
                </select>
              </div>
              <div class="field"><label>Responsável</label><input type="text" formControlName="responsavel" /></div>
              <div class="field"><label>Celular</label><input type="text" formControlName="celular" /></div>
              <label class="check-field">
                <input type="checkbox" formControlName="odometro_obrigatorio" />
                <span>Odômetro obrigatório no abastecimento</span>
              </label>
              <div class="field wide"><label>Observação</label><textarea formControlName="observacao" rows="2" placeholder="Motivo do bloqueio ou observação"></textarea></div>
            </div>
            @if (isAdmin()) {
              <div class="limit-section">
                <div class="limit-title">
                  <strong>Controle de limite</strong>
                  <span>Configuração administrativa para bloqueio automático</span>
                </div>
                <div class="form-row">
                  <div class="field"><label>Limite financeiro</label><input type="number" step="0.01" min="0" formControlName="limite_financeiro" /></div>
                  <div class="field"><label>Limite de litros</label><input type="number" step="0.01" min="0" formControlName="limite_litros" /></div>
                  <div class="field"><label>Alerta em %</label><input type="number" step="1" min="1" max="100" formControlName="alerta_limite_percentual" /></div>
                  <label class="check-field">
                    <input type="checkbox" formControlName="bloqueio_automatico" />
                    <span>Bloquear automaticamente ao exceder limite</span>
                  </label>
                  <label class="check-field">
                    <input type="checkbox" formControlName="preco_custo_automatico" />
                    <span>Vender sempre a preço de custo (última nota fiscal de entrada)</span>
                  </label>
                </div>
              </div>
            }
            <div class="form-actions">
              <button type="button" class="btn-cancel" (click)="cancelForm()">Cancelar</button>
              <button type="submit" class="btn-primary sm" [disabled]="saving()">{{ saving() ? 'Salvando...' : 'Salvar' }}</button>
            </div>
          </form>
        </div>
      }
      <div class="table-card">
        <table class="data-table">
          <thead><tr><th>Nome</th><th>Status</th><th>Responsável</th><th>Celular</th><th>Odômetro</th>@if (isAdmin()) {<th>Limite financeiro</th><th>Limite litros</th><th>Situação limite</th>}<th>Observação</th><th>Cadastro</th><th>Ações</th></tr></thead>
          <tbody>
            @for (p of items(); track p.id_proprietario) {
              <tr class="click-row" (click)="openLinks(p)">
                <td><strong>{{ p.nome }}</strong></td>
                <td><span class="badge" [class]="getStatusClass(p.status)">{{ p.status ?? '—' }}</span></td>
                <td>{{ p.responsavel ?? '—' }}</td>
                <td>{{ p.celular ?? '—' }}</td>
                <td><span class="badge" [class]="p.odometro_obrigatorio ? 'badge-blue' : 'badge-gray'">{{ p.odometro_obrigatorio ? 'Obrigatório' : 'Opcional' }}</span></td>
                @if (isAdmin()) {
                  <td>
                    <strong>{{ money(p.limite_financeiro) }}</strong>
                    <small>{{ money(p.limites_resumo?.pendente_valor) }} pendente</small>
                  </td>
                  <td>
                    <strong>{{ litros(p.limite_litros) }}</strong>
                    <small>{{ litros(p.limites_resumo?.pendente_litros) }} pendente</small>
                  </td>
                  <td>
                    <span class="badge" [class]="getLimiteClass(p)">{{ limiteLabel(p) }}</span>
                    <small>{{ percentualLimite(p) }}</small>
                  </td>
                }
                <td class="obs-cell">{{ p.observacao ?? '—' }}</td>
                <td>{{ p.data_registro | date:'dd/MM/yyyy' }}</td>
                <td><div class="actions">
                  @if (canEdit()) {
                    <button class="action-btn" (click)="$event.stopPropagation(); edit(p)">✏️</button>
                  }
                  @if (isAdmin()) {
                    <button class="action-btn" title="Copiar link do portal do proprietário" (click)="$event.stopPropagation(); copiarLinkPortal(p)">🔗</button>
                    <button class="action-btn" [title]="p.status === 'Bloqueado' ? 'Desbloquear' : 'Bloquear'" (click)="$event.stopPropagation(); toggleBloqueio(p)">
                      {{ p.status === 'Bloqueado' ? '🔓' : '🔒' }}
                    </button>
                    <button class="action-btn" (click)="$event.stopPropagation(); confirmDelete(p)">🗑️</button>
                  }
                  @if (!canEdit()) {
                    <span style="color:#64748b;font-size:12px;">Somente leitura</span>
                  }
                </div></td>
              </tr>
            }
            @empty { <tr><td [attr.colspan]="isAdmin() ? 11 : 8" class="empty-cell">Nenhum proprietário</td></tr> }
          </tbody>
        </table>
      </div>
      @if (deleteTarget() && isAdmin()) {
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
      <app-vinculos-entidade-modal [context]="linksContext()" (closed)="linksContext.set(null)" />
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
    .field input,.field select,.field textarea{background:#0a0f1e;border:1px solid #1e2d4a;border-radius:7px;padding:8px 10px;color:#e2e8f0;font-size:12px;outline:none;font-family:'Inter',sans-serif}
    .field input:focus,.field select:focus,.field textarea:focus{border-color:#0ea5e9}
    .field select option{background:#0d1427}
    .field.wide{grid-column:1 / -1}
    .limit-section{border-top:1px solid #1e2d4a;padding-top:14px;margin-bottom:14px}
    .limit-title{display:flex;flex-direction:column;gap:3px;margin-bottom:12px}
    .limit-title strong{color:#f8fafc;font-size:13px}
    .limit-title span{color:#94a3b8;font-size:12px}
    .check-field{display:flex;align-items:center;gap:8px;background:#0a0f1e;border:1px solid #1e2d4a;border-radius:7px;padding:9px 10px;color:#cbd5e1;font-size:12px}
    .check-field input{width:16px;height:16px;accent-color:#0ea5e9}
    .form-actions{display:flex;gap:10px;justify-content:flex-end}
    .btn-cancel{background:transparent;border:1px solid #1e2d4a;color:#64748b;padding:8px 16px;border-radius:7px;cursor:pointer;font-size:13px}
    .table-card{background:#0d1427;border:1px solid #1e2d4a;border-radius:12px;overflow:hidden}
    .data-table{width:100%;border-collapse:collapse;font-size:13px}
    .data-table thead th{padding:10px 14px;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:#64748b;border-bottom:1px solid #1e2d4a;background:#080e1c;text-align:left}
    .data-table tbody td{padding:12px 14px;border-bottom:1px solid #1e2d4a15}
    .data-table tbody tr:hover td{background:#1e2d4a15}
    .click-row{cursor:pointer}
    .badge{padding:3px 8px;border-radius:20px;font-size:10px;font-weight:700;text-transform:uppercase}
    .badge-green{background:#dcfce720;color:#4ade80}
    .badge-blue{background:#dbeafe20;color:#60a5fa}
    .badge-gray{background:#1e2d4a;color:#64748b}
    .badge-red{background:#fee2e220;color:#f87171}
    .badge-amber{background:#fef3c720;color:#f59e0b}
    .obs-cell{max-width:260px;color:#94a3b8;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    td small{display:block;margin-top:4px;color:#94a3b8;font-size:11px}
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
  private api = inject(ApiService); private toastr = inject(ToastrService); private fb = inject(FormBuilder); private auth = inject(AuthService);
  items = signal<Proprietario[]>([]); total = signal(0);

  copiarLinkPortal(p: Proprietario) {
    this.api.gerarPortalToken(p.id_proprietario).subscribe({
      next: (r) => {
        const link = `${window.location.origin}/portal/${r.token}`;
        navigator.clipboard?.writeText(link)
          .then(() => this.toastr.success(`Link do portal de ${p.nome} copiado! Envie pelo WhatsApp.`))
          .catch(() => {
            window.prompt('Copie o link do portal:', link);
          });
      },
      error: (err) => this.toastr.error(err?.error?.message ?? 'Erro ao gerar link do portal'),
    });
  }
  showForm = signal(false); editItem = signal<Proprietario | null>(null); deleteTarget = signal<Proprietario | null>(null); saving = signal(false);
  linksContext = signal<LinkedEntityContext | null>(null);
  search = '';
  form = this.fb.group({
    nome:['',Validators.required],
    status:['Ativo'],
    responsavel:[''],
    celular:[''],
    odometro_obrigatorio:[false],
    observacao:[''],
    limite_financeiro:[null as number | null],
    limite_litros:[null as number | null],
    bloqueio_automatico:[false],
    alerta_limite_percentual:[80],
    preco_custo_automatico:[false],
  });
  isAdmin() { return this.auth.isAdmin(); }
  canCreate() { return this.auth.canCreateOperationalRecords(); }
  canEdit() { return this.auth.canCreateOperationalRecords(); }
  canShowForm() { return this.showForm() && (this.canEdit() || !this.editItem()); }
  ngOnInit() { this.load(); }
  load() { this.api.getProprietarios({search:this.search,per_page:100,with_limites:this.isAdmin() ? 1 : undefined}).subscribe(r=>{this.items.set(r.data);this.total.set(r.total)}); }
  newItem() { this.editItem.set(null);this.form.reset({status:'Ativo', odometro_obrigatorio:false, bloqueio_automatico:false, alerta_limite_percentual:80, preco_custo_automatico:false});this.showForm.set(true); }
  edit(p:Proprietario) { this.editItem.set(p);this.form.patchValue({ ...p, odometro_obrigatorio: !!p.odometro_obrigatorio } as any);this.showForm.set(true); }
  openLinks(p: Proprietario) { this.linksContext.set({ type: 'proprietario', entity: p }); }
  cancelForm() { this.showForm.set(false);this.editItem.set(null);this.form.reset(); }
  onSubmit() {
    if(this.form.invalid){this.form.markAllAsTouched();return;}
    if (this.editItem() && !this.canEdit()) {
      this.toastr.error('Você não tem permissão para editar proprietários');
      return;
    }
    this.saving.set(true);
    const payload = { ...this.form.value } as any;
    if (!this.isAdmin()) {
      delete payload.limite_financeiro;
      delete payload.limite_litros;
      delete payload.bloqueio_automatico;
      delete payload.alerta_limite_percentual;
      delete payload.preco_custo_automatico;
    }
    const obs = this.editItem() ? this.api.updateProprietario(this.editItem()!.id_proprietario,payload) : this.api.createProprietario(payload);
    obs.subscribe({next:()=>{this.toastr.success('Salvo');this.cancelForm();this.load();this.saving.set(false);},error:()=>{this.toastr.error('Erro');this.saving.set(false);}});
  }
  confirmDelete(p:Proprietario){this.deleteTarget.set(p);}
  executeDelete(){this.api.deleteProprietario(this.deleteTarget()!.id_proprietario).subscribe({next:()=>{this.toastr.success('Excluído');this.deleteTarget.set(null);this.load();},error:err=>this.toastr.error(err.error?.message??'Erro')});}
  getStatusClass(status?: string) {
    if (status === 'Ativo') return 'badge-green';
    if (status === 'Bloqueado') return 'badge-red';
    return 'badge-gray';
  }
  money(value?: number | string | null) {
    const n = Number(value ?? 0);
    if (!Number.isFinite(n) || n <= 0) return '—';
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n);
  }
  litros(value?: number | string | null) {
    const n = Number(value ?? 0);
    if (!Number.isFinite(n) || n <= 0) return '—';
    return `${new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)} L`;
  }
  limiteLabel(p: Proprietario) {
    const situacao = p.limites_resumo?.situacao;
    if (!p.bloqueio_automatico) return 'Sem bloqueio';
    if (situacao === 'estourado') return 'Estourado';
    if (situacao === 'alerta') return 'Alerta';
    return 'Normal';
  }
  getLimiteClass(p: Proprietario) {
    if (!p.bloqueio_automatico) return 'badge-gray';
    if (p.limites_resumo?.situacao === 'estourado') return 'badge-red';
    if (p.limites_resumo?.situacao === 'alerta') return 'badge-amber';
    return 'badge-green';
  }
  percentualLimite(p: Proprietario) {
    const financeiro = p.limites_resumo?.percentual_financeiro;
    const litros = p.limites_resumo?.percentual_litros;
    const partes = [
      financeiro === null || financeiro === undefined ? '' : `R$ ${financeiro}%`,
      litros === null || litros === undefined ? '' : `L ${litros}%`,
    ].filter(Boolean);
    return partes.join(' / ') || 'Sem limite definido';
  }
  toggleBloqueio(p: Proprietario) {
    if (p.status === 'Bloqueado') {
      const confirmar = confirm(`Desbloquear ${p.nome}?`);
      if (!confirmar) return;
      this.api.desbloquearProprietario(p.id_proprietario).subscribe({
        next: () => { this.toastr.success('Proprietário desbloqueado'); this.load(); },
        error: err => this.toastr.error(err.error?.message ?? 'Erro ao desbloquear')
      });
      return;
    }

    const observacao = prompt(`Informe o motivo para bloquear ${p.nome}:`, p.observacao ?? '');
    if (observacao === null) return;
    this.api.bloquearProprietario(p.id_proprietario, observacao.trim()).subscribe({
      next: () => { this.toastr.success('Proprietário bloqueado'); this.load(); },
      error: err => this.toastr.error(err.error?.message ?? 'Erro ao bloquear')
    });
  }
}
