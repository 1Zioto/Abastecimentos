// src/app/features/abastecimentos/form/abastecimento-form.component.ts
import { Component, OnInit, inject, signal, Input, computed } from '@angular/core';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { ApiService } from '../../../core/services/api.service';
import { ToastrService } from 'ngx-toastr';
import { Proprietario, Veiculo, Motorista } from '../../../shared/models';
import { AuthService } from '../../../core/services/auth.service';
import { catchError, forkJoin, of } from 'rxjs';

@Component({
  selector: 'app-abastecimento-form',
  standalone: true,
  imports: [ReactiveFormsModule, FormsModule, CommonModule, RouterLink],
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
            <input type="text" formControlName="frentista" readonly class="readonly-field" />
          </div>

          <!-- Proprietário -->
          <div class="field">
            <label>Proprietário <span class="req">*</span></label>
            <div class="search-with-add">
              <input
                type="text"
                [value]="proprietarioBusca()"
                placeholder="Digite para buscar proprietário..."
                (input)="onProprietarioBuscaChange($event)"
                (focus)="showProprietariosDropdown.set(true)"
                (blur)="closeProprietariosDropdown()"
              />
              <button type="button" class="btn-plus" (click)="openNovoProprietarioModal()">+</button>
            </div>
            @if (showProprietariosDropdown() && filteredProprietarios().length > 0) {
              <div class="autocomplete-list">
                @for (p of filteredProprietarios(); track p.id_proprietario) {
                  <button type="button" class="autocomplete-item" (mousedown)="selectProprietario(p)">
                    {{ p.nome }}
                  </button>
                }
              </div>
            }
          </div>

          <!-- Veículo -->
          <div class="field">
            <label>Veículo <span class="req">*</span></label>
            <div class="search-with-add">
              <input
                type="text"
                [value]="veiculoBusca()"
                [placeholder]="form.value.id_proprietario ? 'Digite placa/modelo...' : 'Selecione o proprietário primeiro...'"
                [disabled]="!form.value.id_proprietario"
                (input)="onVeiculoBuscaChange($event)"
                (focus)="showVeiculosDropdown.set(true)"
                (blur)="closeVeiculosDropdown()"
              />
              <button type="button" class="btn-plus" (click)="openNovoVeiculoModal()">+</button>
            </div>
            @if (showVeiculosDropdown() && filteredVeiculos().length > 0) {
              <div class="autocomplete-list">
                @for (v of filteredVeiculos(); track v.id_veiculo) {
                  <button type="button" class="autocomplete-item" (mousedown)="selectVeiculo(v)">
                    {{ v.placa }} — {{ v.modelo || 'Sem modelo' }}
                  </button>
                }
              </div>
            }
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
            <select formControlName="local">
              <option value="Garagem">Garagem</option>
              <option value="Garagem Viana">Garagem Viana</option>
            </select>
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
            @if (ultimoOdometroReferencia() !== null) {
              <small class="upload-hint">Último odômetro do veículo: {{ ultimoOdometroReferencia() }} km</small>
            }
          </div>

          <!-- Foto Hodômetro -->
          <div class="field">
            <label>Foto Hodômetro</label>
            <input type="file" accept="image/*" (change)="onUploadFotoOdometro($event)" />
            @if (uploadingFotoOdometro()) {
              <small class="upload-hint">Enviando imagem...</small>
            } @else if (resolveImageUrl(form.value.foto_odometro); as fotoOdometroUrl) {
              <small class="upload-hint">Imagem enviada ✓</small>
              <div class="preview-box">
                <img class="preview-img" [src]="fotoOdometroUrl" alt="Foto hodômetro" />
              </div>
              <button type="button" class="btn-preview" (click)="openImagePreview(fotoOdometroUrl)">
                Expandir
              </button>
            }
          </div>

          <!-- Bomba -->
          <div class="field">
            <label>Bomba (Imagem)</label>
            <input type="file" accept="image/*" (change)="onUploadBomba($event)" />
            @if (uploadingBomba()) {
              <small class="upload-hint">Enviando imagem...</small>
            } @else if (resolveImageUrl(form.value.bomba); as bombaUrl) {
              <small class="upload-hint">Imagem enviada ✓</small>
              <div class="preview-box">
                <img class="preview-img" [src]="bombaUrl" alt="Imagem bomba" />
              </div>
              <button type="button" class="btn-preview" (click)="openImagePreview(bombaUrl)">
                Expandir
              </button>
            }
          </div>

          <!-- Status -->
          <div class="field">
            <label>Status</label>
            <select formControlName="status">
              <option value="Pendente">Pendente</option>
              <option value="Confirmado">Confirmado</option>
              <option value="Pago">Pago</option>
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

      @if (novoProprietarioModal()) {
        <div class="modal-overlay" (click)="novoProprietarioModal.set(false)">
          <div class="modal-card" (click)="$event.stopPropagation()">
            <h3>Novo Proprietário</h3>
            <div class="modal-fields">
              <div class="field">
                <label>Nome <span class="req">*</span></label>
                <input type="text" [(ngModel)]="novoProprietario.nome" />
              </div>
              <div class="field">
                <label>Status</label>
                <input type="text" [(ngModel)]="novoProprietario.status" placeholder="Ativo" />
              </div>
              <div class="field">
                <label>Responsável</label>
                <input type="text" [(ngModel)]="novoProprietario.responsavel" />
              </div>
              <div class="field">
                <label>Celular</label>
                <input type="text" [(ngModel)]="novoProprietario.celular" />
              </div>
            </div>
            <div class="modal-actions">
              <button type="button" class="btn-cancel" (click)="novoProprietarioModal.set(false)">Cancelar</button>
              <button type="button" class="btn-primary" (click)="saveNovoProprietario()" [disabled]="savingInline()">
                {{ savingInline() ? 'Salvando...' : 'Salvar' }}
              </button>
            </div>
          </div>
        </div>
      }

      @if (novoVeiculoModal()) {
        <div class="modal-overlay" (click)="novoVeiculoModal.set(false)">
          <div class="modal-card" (click)="$event.stopPropagation()">
            <h3>Novo Veículo</h3>
            <div class="modal-fields">
              <div class="field">
                <label>Placa <span class="req">*</span></label>
                <input type="text" [(ngModel)]="novoVeiculo.placa" />
              </div>
              <div class="field">
                <label>Marca</label>
                <input type="text" [(ngModel)]="novoVeiculo.marca" />
              </div>
              <div class="field">
                <label>Modelo</label>
                <input type="text" [(ngModel)]="novoVeiculo.modelo" />
              </div>
              <div class="field">
                <label>Ano</label>
                <input type="text" [(ngModel)]="novoVeiculo.ano" />
              </div>
              <div class="field">
                <label>Tipo Combustível</label>
                <select [(ngModel)]="novoVeiculo.tipo_combustivel">
                  <option value="">Selecione...</option>
                  @for (t of tiposCombustivel; track t) {
                    <option [value]="t">{{ t }}</option>
                  }
                </select>
              </div>
              <div class="field">
                <label>Nº Chassi</label>
                <input type="text" [(ngModel)]="novoVeiculo.numero_chassi" />
              </div>
            </div>
            <div class="modal-actions">
              <button type="button" class="btn-cancel" (click)="novoVeiculoModal.set(false)">Cancelar</button>
              <button type="button" class="btn-primary" (click)="saveNovoVeiculo()" [disabled]="savingInline()">
                {{ savingInline() ? 'Salvando...' : 'Salvar' }}
              </button>
            </div>
          </div>
        </div>
      }

      @if (previewImageUrl()) {
        <div class="image-overlay" (click)="closeImagePreview()">
          <div class="image-modal" (click)="$event.stopPropagation()">
            <img [src]="previewImageUrl()" alt="Imagem ampliada" />
            <button type="button" class="btn-close-image" (click)="closeImagePreview()">Fechar</button>
          </div>
        </div>
      }
    </div>
  `,
  styles: [`
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap');
    * { box-sizing: border-box; }
    .page { padding: 28px; font-family: 'Inter', sans-serif; color: #e2e8f0; position: relative; }
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
    .upload-hint { color: #94a3b8; font-size: 11px; }
    .preview-box {
      margin-top: 6px;
      border: 1px solid #1e2d4a;
      border-radius: 10px;
      padding: 6px;
      background: #0a0f1e;
      width: 100%;
      max-width: 220px;
    }
    .preview-img {
      display: block;
      width: 100%;
      height: 140px;
      object-fit: cover;
      border-radius: 8px;
      background: #0d1427;
    }
    .btn-preview {
      margin-top: 6px;
      background: #0a0f1e;
      border: 1px solid #1e2d4a;
      color: #38bdf8;
      padding: 6px 10px;
      border-radius: 8px;
      font-size: 12px;
      cursor: pointer;
      width: fit-content;
    }
    .btn-preview:hover { border-color: #38bdf8; }
    .search-with-add { display: flex; gap: 8px; }
    .search-with-add input { flex: 1; }
    .btn-plus {
      width: 36px;
      border-radius: 8px;
      border: 1px solid #1e2d4a;
      background: #0a0f1e;
      color: #38bdf8;
      cursor: pointer;
      font-size: 18px;
      line-height: 1;
    }
    .btn-plus:hover { border-color: #38bdf8; }
    .autocomplete-list {
      margin-top: 6px;
      background: #0a0f1e;
      border: 1px solid #1e2d4a;
      border-radius: 8px;
      max-height: 180px;
      overflow: auto;
      display: flex;
      flex-direction: column;
    }
    .autocomplete-item {
      text-align: left;
      background: transparent;
      border: 0;
      border-bottom: 1px solid #1e2d4a;
      color: #cbd5e1;
      padding: 10px 12px;
      cursor: pointer;
      font-size: 13px;
    }
    .autocomplete-item:last-child { border-bottom: 0; }
    .autocomplete-item:hover { background: #1e2d4a40; }

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
    .modal-overlay {
      position: fixed;
      inset: 0;
      background: rgba(2, 6, 23, 0.7);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 999;
    }
    .modal-card {
      width: min(720px, 92vw);
      background: #0d1427;
      border: 1px solid #1e2d4a;
      border-radius: 14px;
      padding: 20px;
    }
    .modal-card h3 { margin: 0 0 14px; color: #f8fafc; }
    .modal-fields {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 14px;
      margin-bottom: 16px;
    }
    .modal-actions { display: flex; justify-content: flex-end; gap: 10px; }
    .image-overlay {
      position: fixed;
      inset: 0;
      background: rgba(2, 6, 23, 0.9);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1100;
      padding: 20px;
    }
    .image-modal {
      max-width: min(92vw, 1100px);
      max-height: 90vh;
      display: flex;
      flex-direction: column;
      gap: 12px;
      align-items: center;
    }
    .image-modal img {
      width: auto;
      max-width: 100%;
      max-height: calc(90vh - 56px);
      object-fit: contain;
      border-radius: 12px;
      border: 1px solid #1e2d4a;
      background: #0a0f1e;
    }
    .btn-close-image {
      background: #0a0f1e;
      border: 1px solid #1e2d4a;
      color: #e2e8f0;
      padding: 8px 14px;
      border-radius: 8px;
      cursor: pointer;
      font-size: 12px;
    }
  `]
})
export class AbastecimentoFormComponent implements OnInit {
  @Input() id?: string;

  private fb = inject(FormBuilder);
  private api = inject(ApiService);
  private router = inject(Router);
  private toastr = inject(ToastrService);
  private auth = inject(AuthService);

  saving = signal(false);
  savingInline = signal(false);
  uploadingFotoOdometro = signal(false);
  uploadingBomba = signal(false);
  isEdit = signal(false);
  proprietarios = signal<Proprietario[]>([]);
  veiculos = signal<Veiculo[]>([]);
  motoristas = signal<Motorista[]>([]);
  proprietarioBusca = signal('');
  veiculoBusca = signal('');
  showProprietariosDropdown = signal(false);
  showVeiculosDropdown = signal(false);
  novoProprietarioModal = signal(false);
  novoVeiculoModal = signal(false);
  previewImageUrl = signal('');
  ultimoOdometroReferencia = signal<number | null>(null);

  filteredProprietarios = computed(() => {
    const term = this.proprietarioBusca().trim().toLowerCase();
    if (!term) return this.proprietarios().slice(0, 30);
    return this.proprietarios().filter(p => p.nome.toLowerCase().includes(term)).slice(0, 30);
  });

  filteredVeiculos = computed(() => {
    const term = this.veiculoBusca().trim().toLowerCase();
    if (!term) return this.veiculos().slice(0, 30);
    return this.veiculos()
      .filter(v => `${v.placa} ${v.modelo ?? ''}`.toLowerCase().includes(term))
      .slice(0, 30);
  });

  tiposCombustivel = ['OLEO DIESEL S10','Diesel Comum','Gasolina Comum','Gasolina Aditivada','Etanol','GNV','Arla 32'];

  novoProprietario: Partial<Proprietario> = {
    nome: '',
    status: 'Ativo',
    responsavel: '',
    celular: ''
  };

  novoVeiculo: Partial<Veiculo> = {
    placa: '',
    marca: '',
    modelo: '',
    ano: '',
    tipo_combustivel: 'OLEO DIESEL S10',
    numero_chassi: ''
  };

  form = this.fb.group({
    data:              ['', Validators.required],
    data_hora:         ['', Validators.required],
    frentista:         [''],
    id_proprietario:   ['', Validators.required],
    id_veiculo:        ['', Validators.required],
    id_motorista:      [''],
    nome_motorista:    [''],
    nome_proprietario: [''],
    local:             ['Garagem'],
    tipo_combustivel:  ['OLEO DIESEL S10', Validators.required],
    valor_por_litro:   [{ value: 0, disabled: true }],
    quantidade_litros: [null as number | null, [Validators.required, Validators.min(0.01)]],
    valor_total:       [{ value: 0, disabled: true }],
    odometro:          [null as number | null],
    foto_odometro:     [''],
    bomba:             [''],
    status:            ['Pendente'],
  });

  ngOnInit() {
    this.loadProprietarios();
    const usuarioLogado = this.auth.currentUser()?.nome ?? '';
    this.form.patchValue({ frentista: usuarioLogado });
    if (this.id) {
      if (!this.auth.isAdmin()) {
        this.toastr.error('Somente administradores podem editar registros');
        this.router.navigate(['/abastecimentos']);
        return;
      }
      this.isEdit.set(true);
      this.loadAbastecimento(this.id);
    } else {
      const now = new Date();
      const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
      this.form.patchValue({
        data: local.toISOString().slice(0, 10),
        data_hora: local.toISOString().slice(0, 16),
        local: 'Garagem',
        tipo_combustivel: 'OLEO DIESEL S10',
        status: 'Pendente',
      });
      this.onCombustivelChange();
    }
  }

  loadProprietarios() {
    this.api.getProprietariosAll().subscribe(r => this.proprietarios.set(r.data));
  }

  loadAbastecimento(id: string) {
    this.api.getAbastecimento(id).subscribe({
      next: (a) => {
        this.form.patchValue({
          ...a,
          data: a.data?.slice(0, 10),
          data_hora: a.data_hora?.slice(0, 16),
          local: a.local || 'Garagem',
          status: a.status || 'Pendente',
          valor_por_litro: a.valor_por_litro,
          valor_total: a.valor_total,
        } as any);
        this.proprietarioBusca.set(a.nome_proprietario ?? '');
        const veiculoTexto = a.veiculo ? `${a.veiculo.placa} — ${a.veiculo.modelo ?? 'Sem modelo'}` : '';
        this.veiculoBusca.set(veiculoTexto);
        this.form.patchValue({ frentista: this.auth.currentUser()?.nome ?? '' });

        forkJoin({
          veiculos: this.api.getVeiculosByProprietario(a.id_proprietario).pipe(catchError(() => of([] as Veiculo[]))),
          motoristas: this.api.getMotoristassByProprietario(a.id_proprietario).pipe(catchError(() => of([] as Motorista[]))),
        }).subscribe(({ veiculos, motoristas }) => {
          this.veiculos.set(veiculos);
          this.motoristas.set(motoristas);
          this.fetchUltimoOdometroVeiculo(a.id_veiculo, a.odometro ?? null);
        });
      },
      error: (err) => {
        this.toastr.error(err.error?.message ?? 'Erro ao carregar abastecimento');
      }
    });
  }

  onProprietarioChange() {
    const id = this.form.value.id_proprietario;
    if (!id) {
      this.veiculos.set([]);
      this.motoristas.set([]);
      this.ultimoOdometroReferencia.set(null);
      this.form.patchValue({ odometro: null });
      return;
    }
    const prop = this.proprietarios().find(p => p.id_proprietario === id);
    this.form.patchValue({ nome_proprietario: prop?.nome ?? '' });
    this.api.getVeiculosByProprietario(id).subscribe(v => this.veiculos.set(v));
    this.api.getMotoristassByProprietario(id).subscribe(m => this.motoristas.set(m));
    this.form.patchValue({ id_veiculo: '', id_motorista: '' });
    this.ultimoOdometroReferencia.set(null);
    this.form.patchValue({ odometro: null });
  }

  onVeiculoChange() {
    const id = this.form.value.id_veiculo;
    const v = this.veiculos().find(v => v.id_veiculo === id);
    if (v?.tipo_combustivel) {
      this.form.patchValue({ tipo_combustivel: v.tipo_combustivel });
      this.onCombustivelChange();
    }
    if (id) {
      this.fetchUltimoOdometroVeiculo(id, v?.odometro ?? null);
    } else {
      this.ultimoOdometroReferencia.set(null);
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

  fetchUltimoOdometroVeiculo(idVeiculo: string, fallbackOdometro: number | null = null) {
    this.api.getAbastecimentos({ id_veiculo: idVeiculo, per_page: 1 }).subscribe({
      next: (r) => {
        const ultimoDoAbastecimento = r.data?.[0]?.odometro;
        const candidatos = [ultimoDoAbastecimento, fallbackOdometro]
          .filter((v) => v !== null && v !== undefined)
          .map((v) => Number(v));
        const ultimo = candidatos.length ? Math.max(...candidatos) : null;
        this.ultimoOdometroReferencia.set(ultimo);
        if (!this.isEdit()) {
          this.form.patchValue({ odometro: ultimo });
        }
      },
      error: () => {
        this.ultimoOdometroReferencia.set(fallbackOdometro);
        if (!this.isEdit()) {
          this.form.patchValue({ odometro: fallbackOdometro });
        }
      },
    });
  }

  onSubmit() {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }

    const odometroInformado = this.form.getRawValue().odometro;
    const ultimoOdometro = this.ultimoOdometroReferencia();
    if (
      odometroInformado !== null &&
      odometroInformado !== undefined &&
      ultimoOdometro !== null &&
      Number(odometroInformado) < ultimoOdometro
    ) {
      this.toastr.error(`Odômetro inválido. Informe um valor maior ou igual a ${ultimoOdometro} km.`);
      return;
    }

    this.saving.set(true);

    const raw = this.form.getRawValue() as any;
    const payload = { ...raw, frentista: this.auth.currentUser()?.nome ?? raw.frentista };

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

  onProprietarioBuscaChange(event: Event) {
    const term = (event.target as HTMLInputElement).value;
    this.proprietarioBusca.set(term);
    this.showProprietariosDropdown.set(true);
    this.form.patchValue({ id_proprietario: '', nome_proprietario: '', id_veiculo: '', id_motorista: '' });
    this.veiculos.set([]);
    this.motoristas.set([]);
    this.veiculoBusca.set('');
  }

  selectProprietario(p: Proprietario) {
    this.proprietarioBusca.set(p.nome);
    this.form.patchValue({ id_proprietario: p.id_proprietario, nome_proprietario: p.nome, id_veiculo: '', id_motorista: '' });
    this.showProprietariosDropdown.set(false);
    this.veiculoBusca.set('');
    this.onProprietarioChange();
  }

  closeProprietariosDropdown() {
    setTimeout(() => this.showProprietariosDropdown.set(false), 120);
  }

  onVeiculoBuscaChange(event: Event) {
    const term = (event.target as HTMLInputElement).value;
    this.veiculoBusca.set(term);
    this.showVeiculosDropdown.set(true);
    this.form.patchValue({ id_veiculo: '' });
    this.ultimoOdometroReferencia.set(null);
    this.form.patchValue({ odometro: null });
  }

  selectVeiculo(v: Veiculo) {
    this.veiculoBusca.set(`${v.placa} — ${v.modelo ?? 'Sem modelo'}`);
    this.form.patchValue({ id_veiculo: v.id_veiculo });
    this.showVeiculosDropdown.set(false);
    this.onVeiculoChange();
  }

  closeVeiculosDropdown() {
    setTimeout(() => this.showVeiculosDropdown.set(false), 120);
  }

  openNovoProprietarioModal() {
    this.novoProprietario = { nome: '', status: 'Ativo', responsavel: '', celular: '' };
    this.novoProprietarioModal.set(true);
  }

  saveNovoProprietario() {
    if (!this.novoProprietario.nome?.trim()) {
      this.toastr.warning('Informe o nome do proprietário');
      return;
    }
    this.savingInline.set(true);
    this.api.createProprietario({
      nome: this.novoProprietario.nome.trim(),
      status: this.novoProprietario.status || 'Ativo',
      responsavel: this.novoProprietario.responsavel || '',
      celular: this.novoProprietario.celular || ''
    }).subscribe({
      next: p => {
        this.proprietarios.update(list => [p, ...list]);
        this.selectProprietario(p);
        this.novoProprietarioModal.set(false);
        this.savingInline.set(false);
        this.toastr.success('Proprietário cadastrado');
      },
      error: err => {
        this.toastr.error(err.error?.message ?? 'Erro ao cadastrar proprietário');
        this.savingInline.set(false);
      }
    });
  }

  openNovoVeiculoModal() {
    if (!this.form.value.id_proprietario) {
      this.toastr.warning('Selecione um proprietário primeiro');
      return;
    }
    this.novoVeiculo = { placa: '', marca: '', modelo: '', ano: '', tipo_combustivel: 'OLEO DIESEL S10', numero_chassi: '' };
    this.novoVeiculoModal.set(true);
  }

  saveNovoVeiculo() {
    const idProprietario = this.form.value.id_proprietario;
    if (!idProprietario) {
      this.toastr.warning('Selecione um proprietário');
      return;
    }
    if (!this.novoVeiculo.placa?.trim()) {
      this.toastr.warning('Informe a placa do veículo');
      return;
    }

    this.savingInline.set(true);
    this.api.createVeiculo({
      placa: this.novoVeiculo.placa.trim().toUpperCase(),
      marca: this.novoVeiculo.marca || '',
      modelo: this.novoVeiculo.modelo || '',
      ano: this.novoVeiculo.ano || '',
      tipo_combustivel: this.novoVeiculo.tipo_combustivel || '',
      numero_chassi: this.novoVeiculo.numero_chassi || '',
      id_proprietario: idProprietario
    }).subscribe({
      next: v => {
        this.veiculos.update(list => [v, ...list]);
        this.selectVeiculo(v);
        this.novoVeiculoModal.set(false);
        this.savingInline.set(false);
        this.toastr.success('Veículo cadastrado');
      },
      error: err => {
        this.toastr.error(err.error?.message ?? 'Erro ao cadastrar veículo');
        this.savingInline.set(false);
      }
    });
  }

  onUploadFotoOdometro(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    this.uploadingFotoOdometro.set(true);
    this.api.uploadToDrive(file).subscribe({
      next: (res) => {
        const url = res?.file?.downloadUrl || res?.file?.webViewLink || '';
        this.form.patchValue({ foto_odometro: url });
        this.uploadingFotoOdometro.set(false);
        this.toastr.success('Foto do hodômetro enviada');
      },
      error: (err) => {
        this.toastr.error(err.error?.message ?? 'Erro no upload da foto do hodômetro');
        this.uploadingFotoOdometro.set(false);
      }
    });
  }

  onUploadBomba(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    this.uploadingBomba.set(true);
    this.api.uploadToDrive(file).subscribe({
      next: (res) => {
        const url = res?.file?.downloadUrl || res?.file?.webViewLink || '';
        this.form.patchValue({ bomba: url });
        this.uploadingBomba.set(false);
        this.toastr.success('Imagem da bomba enviada');
      },
      error: (err) => {
        this.toastr.error(err.error?.message ?? 'Erro no upload da imagem da bomba');
        this.uploadingBomba.set(false);
      }
    });
  }

  resolveImageUrl(url?: string | null): string | null {
    if (!url) return null;
    const normalized = String(url).trim();
    if (!normalized) return null;
    if (
      normalized.startsWith('http://') ||
      normalized.startsWith('https://') ||
      normalized.startsWith('data:image/') ||
      normalized.startsWith('blob:')
    ) {
      return normalized;
    }
    return null;
  }

  openImagePreview(url?: string | null) {
    const imageUrl = this.resolveImageUrl(url);
    if (!imageUrl) return;
    this.previewImageUrl.set(imageUrl);
  }

  closeImagePreview() {
    this.previewImageUrl.set('');
  }
}
