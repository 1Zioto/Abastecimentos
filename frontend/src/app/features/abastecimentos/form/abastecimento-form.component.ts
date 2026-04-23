// src/app/features/abastecimentos/form/abastecimento-form.component.ts
import { Component, OnInit, inject, signal, Input } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { ApiService } from '../../../core/services/api.service';
import { ToastrService } from 'ngx-toastr';
import { Proprietario, Veiculo, Motorista } from '../../../shared/models';

@Component({
  selector: 'app-abastecimento-form',
  standalone: true,
  imports: [ReactiveFormsModule, CommonModule, RouterLink],
  template: `
    <div class="page">
      <div class="page-header">
        <div>
          <a routerLink="/abastecimentos" class="back-link">← Abastecimentos</a>
          <h1>{{ isEdit() ? 'Editar Abastecimento' : 'Novo Abastecimento' }}</h1>
        </div>
      </div>

      <form [formGroup]="form" (ngSubmit)="onSubmit()" class="form-card">
        <div class="form-grid">

          <!-- Data e Hora -->
          <div class="field">
            <label>Data <span class="req">*</span></label>
            <input type="date" formControlName="data" />
          </div>
          <div class="field">
            <label>Data e Hora <span class="req">*</span></label>
            <input type="datetime-local" formControlName="data_hora" />
          </div>

          <!-- Frentista -->
          <div class="field">
            <label>Frentista</label>
            <input type="text" formControlName="frentista" placeholder="Nome do frentista" />
          </div>

          <!-- Proprietário -->
          <div class="field">
            <label>Proprietário <span class="req">*</span></label>
            <select formControlName="id_proprietario" (change)="onProprietarioChange()">
              <option value="">Selecione...</option>
              @for (p of proprietarios(); track p.id_proprietario) {
                <option [value]="p.id_proprietario">{{ p.nome }}</option>
              }
            </select>
          </div>

          <!-- Veículo -->
          <div class="field">
            <label>Veículo <span class="req">*</span></label>
            <select formControlName="id_veiculo" (change)="onVeiculoChange()">
              <option value="">Selecione o proprietário primeiro...</option>
              @for (v of veiculos(); track v.id_veiculo) {
                <option [value]="v.id_veiculo">{{ v.placa }} — {{ v.modelo }}</option>
              }
            </select>
          </div>

          <!-- Motorista -->
          <div class="field">
            <label>Motorista</label>
            <select formControlName="id_motorista" (change)="onMotoristaChange()">
              <option value="">Selecione...</option>
              @for (m of motoristas(); track m.id_motorista) {
                <option [value]="m.id_motorista">{{ m.nome }}</option>
              }
            </select>
          </div>

          <!-- Local -->
          <div class="field">
            <label>Local</label>
            <input type="text" formControlName="local" placeholder="Posto / Endereço" />
          </div>

          <!-- Tipo Combustível -->
          <div class="field">
            <label>Tipo de Combustível <span class="req">*</span></label>
            <select formControlName="tipo_combustivel" (change)="onCombustivelChange()">
              <option value="">Selecione...</option>
              @for (t of tiposCombustivel; track t) {
                <option [value]="t">{{ t }}</option>
              }
            </select>
          </div>

          <!-- Valor por Litro (somente leitura) -->
          <div class="field">
            <label>Valor por Litro <span class="badge-info">Tabela</span></label>
            <input type="number" formControlName="valor_por_litro" readonly class="readonly-field" step="0.001" />
          </div>

          <!-- Quantidade -->
          <div class="field">
            <label>Quantidade (L) <span class="req">*</span></label>
            <input type="number" formControlName="quantidade_litros" placeholder="0.00" step="0.01"
                   (input)="calcTotal()" />
          </div>

          <!-- Valor Total -->
          <div class="field">
            <label>Valor Total</label>
            <input type="number" formControlName="valor_total" readonly class="readonly-field highlight" step="0.01" />
          </div>

          <!-- Odômetro -->
          <div class="field">
            <label>Odômetro (km)</label>
            <input type="number" formControlName="odometro" placeholder="Ex: 125000" />
          </div>

          <!-- Bomba -->
          <div class="field">
            <label>Bomba</label>
            <input type="text" formControlName="bomba" placeholder="Nº da bomba" />
          </div>

          <!-- Status -->
          <div class="field">
            <label>Status</label>
            <select formControlName="status">
              <option value="">Selecione...</option>
              <option value="Confirmado">Confirmado</option>
              <option value="Pendente">Pendente</option>
              <option value="Cancelado">Cancelado</option>
            </select>
          </div>

        </div>

        @if (!isEdit()) {
          <div class="price-preview">
            <span class="price-label">Valor calculado:</span>
            <span class="price-value">
              {{ form.get('valor_total')?.value | currency:'BRL':'symbol':'1.2-2' }}
            </span>
            <span class="price-detail">
              ({{ form.get('quantidade_litros')?.value || 0 }} L × R$ {{ form.get('valor_por_litro')?.value || 0 }}/L)
            </span>
          </div>
        }

        @if (isEdit()) {
          <div class="info-banner">
            ⚠️ O valor por litro não pode ser alterado após o registro. O total será recalculado com o valor original.
          </div>
        }

        <div class="form-actions">
          <a routerLink="/abastecimentos" class="btn-cancel">Cancelar</a>
          <button type="submit" class="btn-primary" [disabled]="saving()">
            @if (saving()) {
              <span class="spinner"></span> Salvando...
            } @else {
              {{ isEdit() ? 'Salvar Alterações' : 'Registrar Abastecimento' }}
            }
          </button>
        </div>
      </form>
    </div>
  `,
  styles: [`
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap');
    * { box-sizing: border-box; }
    .page { padding: 28px; font-family: 'Inter', sans-serif; color: #e2e8f0; }
    .page-header { margin-bottom: 24px; }
    .back-link { font-size: 12px; color: #38bdf8; text-decoration: none; display: block; margin-bottom: 6px; }
    .back-link:hover { text-decoration: underline; }
    .page-header h1 { font-size: 24px; font-weight: 700; color: #f8fafc; margin: 0; }

    .form-card {
      background: #0d1427;
      border: 1px solid #1e2d4a;
      border-radius: 16px;
      padding: 28px;
      max-width: 900px;
    }

    .form-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
      gap: 18px;
      margin-bottom: 24px;
    }

    .field { display: flex; flex-direction: column; gap: 6px; }
    .field label { font-size: 12px; font-weight: 600; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px; display: flex; gap: 6px; align-items: center; }
    .req { color: #f87171; }
    .badge-info { background: #0ea5e920; color: #38bdf8; font-size: 9px; padding: 2px 6px; border-radius: 10px; text-transform: uppercase; letter-spacing: 0.5px; }

    .field input, .field select {
      background: #0a0f1e;
      border: 1px solid #1e2d4a;
      border-radius: 8px;
      padding: 10px 12px;
      color: #e2e8f0;
      font-size: 13px;
      font-family: 'Inter', sans-serif;
      outline: none;
      transition: border-color 0.2s;
    }
    .field input:focus, .field select:focus { border-color: #0ea5e9; }
    .field input::placeholder { color: #334155; }
    .field select option { background: #0d1427; }
    .readonly-field { opacity: 0.7; cursor: not-allowed; }
    .readonly-field.highlight { color: #4ade80; font-weight: 600; border-color: #4ade8040; }

    .price-preview {
      background: #0a0f1e;
      border: 1px solid #4ade8030;
      border-radius: 10px;
      padding: 14px 18px;
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 20px;
    }
    .price-label { font-size: 12px; color: #64748b; text-transform: uppercase; }
    .price-value { font-size: 22px; font-weight: 700; color: #4ade80; }
    .price-detail { font-size: 12px; color: #475569; }

    .info-banner {
      background: #fef9c310;
      border: 1px solid #eab30840;
      color: #fbbf24;
      padding: 12px 16px;
      border-radius: 8px;
      font-size: 12px;
      margin-bottom: 20px;
    }

    .form-actions { display: flex; gap: 12px; justify-content: flex-end; }
    .btn-cancel {
      background: transparent;
      border: 1px solid #1e2d4a;
      color: #64748b;
      padding: 10px 20px;
      border-radius: 8px;
      font-size: 13px;
      text-decoration: none;
      cursor: pointer;
      transition: all 0.2s;
    }
    .btn-cancel:hover { border-color: #94a3b8; color: #94a3b8; }
    .btn-primary {
      background: linear-gradient(135deg, #0ea5e9, #6366f1);
      border: none;
      border-radius: 8px;
      padding: 10px 24px;
      color: #fff;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;
      display: flex; align-items: center; gap: 8px;
    }
    .btn-primary:hover:not(:disabled) { opacity: 0.9; }
    .btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
    .spinner { width:14px;height:14px;border:2px solid rgba(255,255,255,0.3);border-top-color:#fff;border-radius:50%;animation:spin 0.7s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }
  `]
})
export class AbastecimentoFormComponent implements OnInit {
  @Input() id?: string;

  private fb = inject(FormBuilder);
  private api = inject(ApiService);
  private router = inject(Router);
  private toastr = inject(ToastrService);

  saving = signal(false);
  isEdit = signal(false);
  proprietarios = signal<Proprietario[]>([]);
  veiculos = signal<Veiculo[]>([]);
  motoristas = signal<Motorista[]>([]);

  tiposCombustivel = ['Diesel S10','Diesel Comum','Gasolina Comum','Gasolina Aditivada','Etanol','GNV','Arla 32'];

  form = this.fb.group({
    data:              ['', Validators.required],
    data_hora:         ['', Validators.required],
    frentista:         [''],
    id_proprietario:   ['', Validators.required],
    id_veiculo:        ['', Validators.required],
    id_motorista:      [''],
    nome_motorista:    [''],
    nome_proprietario: [''],
    local:             [''],
    tipo_combustivel:  ['', Validators.required],
    valor_por_litro:   [{ value: 0, disabled: true }],
    quantidade_litros: [null as number | null, [Validators.required, Validators.min(0.01)]],
    valor_total:       [{ value: 0, disabled: true }],
    odometro:          [null as number | null],
    bomba:             [''],
    status:            ['Confirmado'],
  });

  ngOnInit() {
    this.loadProprietarios();
    if (this.id) {
      this.isEdit.set(true);
      this.loadAbastecimento(this.id);
    } else {
      const now = new Date();
      const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
      this.form.patchValue({
        data: local.toISOString().slice(0, 10),
        data_hora: local.toISOString().slice(0, 16),
      });
    }
  }

  loadProprietarios() {
    this.api.getProprietariosAll().subscribe(r => this.proprietarios.set(r.data));
  }

  loadAbastecimento(id: string) {
    this.api.getAbastecimento(id).subscribe(a => {
      this.api.getVeiculosByProprietario(a.id_proprietario).subscribe(v => this.veiculos.set(v));
      this.api.getMotoristassByProprietario(a.id_proprietario).subscribe(m => this.motoristas.set(m));
      this.form.patchValue({
        ...a,
        data: a.data?.slice(0, 10),
        data_hora: a.data_hora?.slice(0, 16),
        valor_por_litro: a.valor_por_litro,
        valor_total: a.valor_total,
      } as any);
    });
  }

  onProprietarioChange() {
    const id = this.form.value.id_proprietario;
    if (!id) { this.veiculos.set([]); this.motoristas.set([]); return; }
    const prop = this.proprietarios().find(p => p.id_proprietario === id);
    this.form.patchValue({ nome_proprietario: prop?.nome ?? '' });
    this.api.getVeiculosByProprietario(id).subscribe(v => this.veiculos.set(v));
    this.api.getMotoristassByProprietario(id).subscribe(m => this.motoristas.set(m));
    this.form.patchValue({ id_veiculo: '', id_motorista: '' });
  }

  onVeiculoChange() {
    const id = this.form.value.id_veiculo;
    const v = this.veiculos().find(v => v.id_veiculo === id);
    if (v?.tipo_combustivel) {
      this.form.patchValue({ tipo_combustivel: v.tipo_combustivel });
      this.onCombustivelChange();
    }
  }

  onMotoristaChange() {
    const id = this.form.value.id_motorista;
    const m = this.motoristas().find(m => m.id_motorista === id);
    this.form.patchValue({ nome_motorista: m?.nome ?? '' });
  }

  onCombustivelChange() {
    const tipo = this.form.value.tipo_combustivel;
    if (!tipo || this.isEdit()) return;
    this.api.getValorAtual(tipo).subscribe({
      next: v => {
        if (v) {
          this.form.patchValue({ valor_por_litro: v.valor } as any);
          this.calcTotal();
        }
      },
      error: () => {}
    });
  }

  calcTotal() {
    const qtd = this.form.value.quantidade_litros ?? 0;
    const vl = (this.form.getRawValue() as any).valor_por_litro ?? 0;
    const total = +(qtd * vl).toFixed(2);
    this.form.patchValue({ valor_total: total } as any);
  }

  onSubmit() {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    this.saving.set(true);

    const raw = this.form.getRawValue() as any;
    const payload = { ...raw };

    const obs = this.isEdit()
      ? this.api.updateAbastecimento(this.id!, payload)
      : this.api.createAbastecimento(payload);

    obs.subscribe({
      next: () => {
        this.toastr.success(this.isEdit() ? 'Abastecimento atualizado!' : 'Abastecimento registrado!');
        this.router.navigate(['/abastecimentos']);
      },
      error: err => {
        this.toastr.error(err.error?.message ?? 'Erro ao salvar');
        this.saving.set(false);
      }
    });
  }
}
