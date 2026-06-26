// src/app/features/entrada-notas/entrada-notas.component.ts
import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';
import { ToastrService } from 'ngx-toastr';
import { EntradaNota } from '../../shared/models';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-entrada-notas',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule],
  template: `
    <div class="page">
      <div class="page-header">
        <div>
          <h1>Entrada de Notas</h1>
          <p>Registre as notas fiscais de abastecimento</p>
        </div>
        @if (canCreate()) {
          <button class="btn-primary" (click)="newItem()">+ Nova Nota</button>
        }
      </div>

      <!-- Filtros -->
      <div class="filters-card">
        <div class="filters-grid">
          <div class="filter-field">
            <label>Tipo</label>
            <select [(ngModel)]="filtroTipo" (change)="load()">
              <option value="">Todos</option>
              @for (t of tiposCombustivel(); track t) {
                <option [value]="t">{{ t }}</option>
              }
            </select>
          </div>
          <div class="filter-field">
            <label>Número da NF</label>
            <input
              type="text"
              [(ngModel)]="filtroNumeroNota"
              (keydown.enter)="load()"
              placeholder="Ex.: 1673273"
            />
          </div>
          <div class="filter-field">
            <label>Data Início</label>
            <div class="date-row">
              <input #dataInicioInput type="date" [(ngModel)]="filtroDataInicio" (change)="load()" />
              <button type="button" class="btn-date" (click)="openDatePicker(dataInicioInput)">📅</button>
            </div>
          </div>
          <div class="filter-field">
            <label>Data Fim</label>
            <div class="date-row">
              <input #dataFimInput type="date" [(ngModel)]="filtroDataFim" (change)="load()" />
              <button type="button" class="btn-date" (click)="openDatePicker(dataFimInput)">📅</button>
            </div>
          </div>
        </div>
      </div>

      <!-- Formulário -->
      @if (canShowForm()) {
        <div class="form-card">
          <h3>{{ editItem() ? 'Editar Nota' : 'Nova Nota Fiscal' }}</h3>
          <form [formGroup]="form" (ngSubmit)="onSubmit()">
            <div class="form-row">
              <div class="field">
                <label>Data *</label>
                <div class="date-row">
                  <input #dataNotaInput type="date" formControlName="data" />
                  <button type="button" class="btn-date" (click)="openDatePicker(dataNotaInput)">📅</button>
                </div>
              </div>
              <div class="field">
                <label>Hora *</label>
                <input type="time" formControlName="hora" />
              </div>
              <div class="field">
                <label>Número da NF</label>
                <input type="text" formControlName="numero_nota_fiscal" placeholder="000000" />
              </div>
              <div class="field">
                <label>Tipo</label>
                <select formControlName="tipo">
                  <option value="">Selecione...</option>
                  @for (t of tiposCombustivel(); track t) {
                    <option [value]="t">{{ t }}</option>
                  }
                </select>
              </div>
              <div class="field">
                <label>Quantidade (L)</label>
                <input type="number" formControlName="quantidade" placeholder="0.00" step="0.01" />
              </div>
              <div class="field">
                <label>Valor por Litro(compra)</label>
                <input type="number" formControlName="valor_litro" placeholder="0.000" step="0.001" />
              </div>
              <div class="field">
                <label>Valor Total *</label>
                <input type="number" formControlName="valor" placeholder="0.00" step="0.01" class="highlight-field" />
              </div>
              <div class="field">
                <label>Responsável</label>
                <input type="text" formControlName="responsavel" readonly class="readonly-field" />
              </div>
              <div class="field">
                <label>Foto / Anexo (Imagem)</label>
                <input type="file" accept="image/*" (change)="onUploadFotoNota($event)" />
                @if (uploadingFotoNota()) {
                  <small class="upload-hint">Enviando imagem...</small>
                } @else if (resolveImageUrl(form.value.foto_nota); as fotoNotaUrl) {
                  <small class="upload-hint">Imagem enviada ✓</small>
                  <div class="preview-box">
                    <img class="preview-img" [src]="displayImageUrl(fotoNotaUrl)" alt="Anexo da nota" />
                  </div>
                  <button type="button" class="btn-preview" (click)="openImagePreview(fotoNotaUrl)">Expandir</button>
                }
              </div>
            </div>
            <div class="form-actions">
              <button type="button" class="btn-cancel" (click)="cancelForm()">Cancelar</button>
              <button type="submit" class="btn-primary sm" [disabled]="saving()">
                {{ saving() ? 'Salvando...' : 'Salvar Nota' }}
              </button>
            </div>
          </form>
        </div>
      }

      <!-- Totais rápidos -->
      @if (notas().length > 0) {
        <div class="summary-row">
          <div class="summary-item">
            <span class="s-label">Registros</span>
            <span class="s-value">{{ notas().length }}</span>
          </div>
          <div class="summary-item">
            <span class="s-label">Total Litros</span>
            <span class="s-value blue">{{ totalLitros() | number:'1.2-2' }} L</span>
          </div>
          <div class="summary-item">
            <span class="s-label">Valor Fiscal</span>
            <span class="s-value green">{{ totalValor() | currency:'BRL':'symbol':'1.2-2' }}</span>
          </div>
          <div class="summary-item">
            <span class="s-label">Transporte</span>
            <span class="s-value amber">{{ totalTransporte() | currency:'BRL':'symbol':'1.2-2' }}</span>
          </div>
          <div class="summary-item">
            <span class="s-label">Custo Final</span>
            <span class="s-value purple">{{ totalCompraFinal() | currency:'BRL':'symbol':'1.2-2' }}</span>
          </div>
        </div>
      }

      <!-- Tabela -->
      <div class="table-card">
        <div class="table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th>Data/Hora</th>
                <th>Nº NF</th>
                <th>Tipo</th>
                <th class="text-right">Qtd (L)</th>
                <th class="text-right">R$/L</th>
                <th class="text-right">Valor Fiscal</th>
                <th class="text-right">Transporte</th>
                <th class="text-right">Custo Final</th>
                <th>Responsável</th>
                <th>Verificação</th>
                <th>Anexo</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              @for (n of notas(); track n.id_financeiro) {
                <tr>
                  <td>
                    <div class="date-time-cell">
                      <span>{{ notaDataLabel(n) }}</span>
                      <small>{{ notaHoraLabel(n) }}</small>
                    </div>
                  </td>
                  <td><code class="code-badge">{{ n.numero_nota_fiscal ?? '—' }}</code></td>
                  <td><span class="fuel-badge">{{ n.tipo ?? '—' }}</span></td>
                  <td class="text-right">{{ n.quantidade ? (n.quantidade | number:'1.2-2') : '—' }}</td>
                  <td class="text-right">{{ n.valor_litro ? (n.valor_litro | number:'1.3-3') : '—' }}</td>
                  <td class="text-right val-green">
                    {{ n.valor ? (n.valor | currency:'BRL':'symbol':'1.2-2') : '—' }}
                  </td>
                  <td class="text-right val-amber">
                    {{ custoTransporteTotal(n) | currency:'BRL':'symbol':'1.2-2' }}
                  </td>
                  <td class="text-right val-purple">
                    {{ valorCompraFinal(n) | currency:'BRL':'symbol':'1.2-2' }}
                  </td>
                  <td>{{ n.responsavel ?? '—' }}</td>
                  <td>
                    <span class="verify-badge" [class.ok]="n.nota_verificacao_status === 'validada'" [class.warn]="n.nota_verificacao_status === 'suspeita'">
                      {{ notaVerificacaoLabel(n) }}
                    </span>
                    @if (n.nota_verificacao_mensagem) {
                      <small class="verify-message">{{ n.nota_verificacao_mensagem }}</small>
                    }
                  </td>
                  <td>
                    @if (resolveImageUrl(n.foto_nota); as fotoNotaListUrl) {
                      <div class="note-image-cell">
                        <button type="button" class="note-thumb-btn" (click)="openImagePreview(fotoNotaListUrl)" title="Ver foto da nota">
                          <img [src]="displayImageUrl(fotoNotaListUrl)" alt="Foto da nota" />
                        </button>
                        <button type="button" class="link-btn" (click)="openImagePreview(fotoNotaListUrl)">Ver imagem</button>
                      </div>
                    } @else { — }
                  </td>
                  <td>
                    <div class="actions">
                      @if (isAdmin()) {
                        <button class="action-btn" (click)="edit(n)" title="Editar">✏️</button>
                        <button class="action-btn" (click)="confirmDelete(n)" title="Excluir">🗑️</button>
                      } @else {
                        <span style="color:#64748b;font-size:12px;">Somente leitura</span>
                      }
                    </div>
                  </td>
                </tr>
              }
              @empty {
                <tr><td colspan="12" class="empty-cell">Nenhuma nota registrada</td></tr>
              }
            </tbody>
          </table>
        </div>
      </div>

      @if (deleteTarget() && isAdmin()) {
        <div class="modal-overlay" (click)="deleteTarget.set(null)">
          <div class="modal" (click)="$event.stopPropagation()">
            <h3>Confirmar Exclusão</h3>
            <p>Excluir a nota fiscal <strong>{{ deleteTarget()?.numero_nota_fiscal ?? deleteTarget()?.id_financeiro }}</strong>?</p>
            <div class="modal-actions">
              <button class="btn-cancel" (click)="deleteTarget.set(null)">Cancelar</button>
              <button class="btn-danger" (click)="executeDelete()">Excluir</button>
            </div>
          </div>
        </div>
      }

      @if (previewImageUrl()) {
        <div class="image-overlay" (click)="closeImagePreview()">
          <div class="image-modal" (click)="$event.stopPropagation()">
            <img [src]="displayImageUrl(previewImageUrl())" alt="Imagem ampliada" />
            <div class="image-actions">
              <button type="button" class="btn-close-image" (click)="openExternalImage(previewImageUrl())">Abrir em nova aba</button>
              <button type="button" class="btn-close-image" (click)="closeImagePreview()">Fechar</button>
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

    .filters-card { background: #0d1427; border: 1px solid #1e2d4a; border-radius: 12px; padding: 16px; margin-bottom: 14px; }
    .filters-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 12px; }
    .filter-field { display: flex; flex-direction: column; gap: 4px; }
    .filter-field label { font-size: 11px; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; }
    .filter-field input, .filter-field select { background: #0a0f1e; border: 1px solid #1e2d4a; border-radius: 7px; padding: 8px 10px; color: #e2e8f0; font-size: 12px; outline: none; }
    .filter-field input:focus, .filter-field select:focus { border-color: #0ea5e9; }
    .filter-field select option { background: #0d1427; }
    .date-row { display: flex; gap: 8px; align-items: center; }
    .date-row input { flex: 1; min-width: 0; }
    .btn-date { height: 34px; min-width: 40px; padding: 0 10px; background: #0a0f1e; border: 1px solid #1e2d4a; border-radius: 7px; color: #94a3b8; cursor: pointer; font-size: 14px; }
    .btn-date:hover { border-color: #38bdf8; color: #38bdf8; }

    .form-card { background: #0d1427; border: 1px solid #1e2d4a; border-radius: 12px; padding: 20px; margin-bottom: 16px; }
    .form-card h3 { font-size: 14px; font-weight: 700; color: #f8fafc; margin: 0 0 14px; }
    .form-row { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 14px; margin-bottom: 14px; }
    .field { display: flex; flex-direction: column; gap: 5px; }
    .field label { font-size: 11px; font-weight: 600; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px; }
    .field input, .field select { background: #0a0f1e; border: 1px solid #1e2d4a; border-radius: 7px; padding: 8px 10px; color: #e2e8f0; font-size: 12px; outline: none; font-family: 'Inter', sans-serif; }
    .field input:focus, .field select:focus { border-color: #0ea5e9; }
    .field select option { background: #0d1427; }
    .highlight-field { border-color: #4ade8040 !important; color: #4ade80 !important; font-weight: 600; }
    .readonly-field { opacity: 0.8; cursor: not-allowed; }
    .upload-hint { color: #94a3b8; font-size: 11px; }
    .preview-box { margin-top: 6px; border: 1px solid #1e2d4a; border-radius: 10px; padding: 6px; background: #0a0f1e; width: 100%; max-width: 220px; }
    .preview-img { display: block; width: 100%; height: 140px; object-fit: cover; border-radius: 8px; background: #0d1427; }
    .btn-preview { margin-top: 6px; background: #0a0f1e; border: 1px solid #1e2d4a; color: #38bdf8; padding: 6px 10px; border-radius: 8px; font-size: 12px; cursor: pointer; width: fit-content; }
    .btn-preview:hover { border-color: #38bdf8; }
    .form-actions { display: flex; gap: 10px; justify-content: flex-end; }
    .btn-cancel { background: transparent; border: 1px solid #1e2d4a; color: #64748b; padding: 8px 16px; border-radius: 7px; cursor: pointer; font-size: 13px; }

    .summary-row { display: flex; gap: 16px; margin-bottom: 14px; }
    .summary-item { background: #0d1427; border: 1px solid #1e2d4a; border-radius: 10px; padding: 12px 18px; display: flex; flex-direction: column; }
    .s-label { font-size: 10px; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; }
    .s-value { font-size: 18px; font-weight: 700; color: #f8fafc; margin-top: 2px; }
    .s-value.blue { color: #38bdf8; }
    .s-value.green { color: #4ade80; }
    .s-value.amber { color: #f59e0b; }
    .s-value.purple { color: #c084fc; }

    .table-card { background: #0d1427; border: 1px solid #1e2d4a; border-radius: 12px; overflow: hidden; }
    .table-wrap { overflow-x: auto; }
    .data-table { width: 100%; border-collapse: collapse; font-size: 12px; }
    .data-table thead th { padding: 10px 12px; font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; color: #64748b; border-bottom: 1px solid #1e2d4a; background: #080e1c; text-align: left; white-space: nowrap; }
    .data-table tbody td { padding: 10px 12px; border-bottom: 1px solid #1e2d4a15; vertical-align: middle; color: #e2e8f0; }
    .data-table tbody tr:hover td { background: #1e2d4a15; }
    .text-right { text-align: right; }
    .date-time-cell { display: flex; flex-direction: column; gap: 2px; min-width: 86px; }
    .date-time-cell span { color: #f8fafc; font-weight: 600; }
    .date-time-cell small { color: #38bdf8; font-size: 11px; font-weight: 700; }
    .val-green { color: #4ade80; font-weight: 600; }
    .val-amber { color: #f59e0b; font-weight: 600; }
    .val-purple { color: #c084fc; font-weight: 700; }
    .code-badge { background: #0a0f1e; color: #cbd5e1; padding: 2px 7px; border-radius: 4px; font-size: 11px; }
    .fuel-badge { background: #1e2d4a; color: #7dd3fc; padding: 3px 8px; border-radius: 5px; font-size: 11px; font-weight: 600; }
    .verify-badge { display: inline-flex; padding: 3px 8px; border-radius: 999px; background: #1e293b; color: #cbd5e1; font-size: 11px; font-weight: 800; white-space: nowrap; }
    .verify-badge.ok { background: rgba(34, 197, 94, 0.16); color: #4ade80; }
    .verify-badge.warn { background: rgba(245, 158, 11, 0.18); color: #fbbf24; }
    .verify-message { display: block; margin-top: 4px; color: #94a3b8; max-width: 180px; line-height: 1.25; }
    .link-btn { color: #38bdf8; font-size: 11px; text-decoration: none; background: transparent; border: none; cursor: pointer; padding: 0; }
    .link-btn:hover { text-decoration: underline; }
    .note-image-cell { display: flex; align-items: center; gap: 8px; min-width: 118px; }
    .note-thumb-btn { width: 54px; height: 54px; border: 1px solid #1e2d4a; border-radius: 8px; padding: 0; background: #0a0f1e; overflow: hidden; cursor: pointer; }
    .note-thumb-btn:hover { border-color: #38bdf8; }
    .note-thumb-btn img { display: block; width: 100%; height: 100%; object-fit: cover; }
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
    .image-overlay { position: fixed; inset: 0; background: rgba(2, 6, 23, 0.9); display: flex; align-items: center; justify-content: center; z-index: 1100; padding: 20px; }
    .image-modal { max-width: min(92vw, 1100px); max-height: 90vh; display: flex; flex-direction: column; gap: 12px; align-items: center; }
    .image-modal img { width: auto; max-width: 100%; max-height: calc(90vh - 56px); object-fit: contain; border-radius: 12px; border: 1px solid #1e2d4a; background: #0a0f1e; }
    .image-actions { display: flex; gap: 10px; justify-content: center; flex-wrap: wrap; }
    .btn-close-image { background: #0a0f1e; border: 1px solid #1e2d4a; color: #e2e8f0; padding: 8px 14px; border-radius: 8px; cursor: pointer; font-size: 12px; }
  `]
})
export class EntradaNotasComponent implements OnInit, OnDestroy {
  private api = inject(ApiService);
  private toastr = inject(ToastrService);
  private fb = inject(FormBuilder);
  private auth = inject(AuthService);

  notas = signal<EntradaNota[]>([]);
  showForm = signal(false);
  editItem = signal<EntradaNota | null>(null);
  deleteTarget = signal<EntradaNota | null>(null);
  saving = signal(false);
  uploadingFotoNota = signal(false);
  previewImageUrl = signal('');
  private readonly defaultTipoCombustivel = 'OLEO DIESEL S10';
  private readonly custoTransportePorLitro = 0.04;
  private readonly onGaragemChanged = () => {
    this.loadTiposCombustivel();
    this.load();
  };
  tiposCombustivel = signal<string[]>([this.defaultTipoCombustivel]);

  filtroTipo = '';
  filtroNumeroNota = '';
  filtroDataInicio = '';
  filtroDataFim = '';

  form = this.fb.group({
    data:               ['', Validators.required],
    hora:               [this.currentTimeInput(), Validators.required],
    numero_nota_fiscal: [''],
    tipo:               [this.defaultTipoCombustivel],
    quantidade:         [null as number | null],
    valor_litro:        [null as number | null],
    valor:              [null as number | null, [Validators.required, Validators.min(0.01)]],
    responsavel:        [''],
    foto_nota:          [''],
  });

  ngOnInit() {
    this.loadTiposCombustivel();
    this.load();
    window.addEventListener('garagem:changed', this.onGaragemChanged);
  }

  ngOnDestroy() {
    window.removeEventListener('garagem:changed', this.onGaragemChanged);
  }
  isAdmin() { return this.auth.isAdmin(); }
  canCreate() { return this.auth.canCreateOperationalRecords(); }
  canShowForm() { return this.showForm() && (this.isAdmin() || !this.editItem()); }

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
        const lista = tipos.length ? tipos : [this.defaultTipoCombustivel];
        this.tiposCombustivel.set(lista);
        const tipoAtual = String(this.form.getRawValue().tipo ?? '').trim();
        if (!tipoAtual || !lista.includes(tipoAtual)) {
          this.form.patchValue({ tipo: lista[0] });
        }
      },
      error: () => this.tiposCombustivel.set([this.defaultTipoCombustivel]),
    });
  }

  load() {
    this.api.getEntradaNotas({
      tipo: this.filtroTipo,
      numero_nota_fiscal: this.filtroNumeroNota.trim(),
      data_inicio: this.filtroDataInicio,
      data_fim: this.filtroDataFim,
      per_page: 100
    }).subscribe(r => {
      const notas = (r.data ?? [])
        .map(n => this.normalizeNota(n))
        .sort((a, b) => this.notaTimestamp(b) - this.notaTimestamp(a));
      this.notas.set(notas);
    });
  }

  private notaTimestamp(n: EntradaNota): number {
    const raw = n.data_hora || n.data;
    if (!raw) return 0;
    const normalized = String(raw).includes('T') ? String(raw) : String(raw).replace(' ', 'T');
    const parsed = Date.parse(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  private normalizeNota(n: EntradaNota): EntradaNota {
    return {
      ...n,
      valor: this.toNumber(n.valor),
      quantidade: this.toNumber(n.quantidade),
      valor_litro: this.toNumber(n.valor_litro),
      custo_transporte_litro: this.toNumber(n.custo_transporte_litro),
      custo_transporte_total: this.toNumber(n.custo_transporte_total),
      valor_compra_final: this.toNumber(n.valor_compra_final),
    };
  }

  private toNumber(value: unknown): number | undefined {
    if (value === null || value === undefined || value === '') return undefined;
    if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
    const raw = String(value).trim();
    const normalized = raw.includes(',')
      ? raw.replace(/\./g, '').replace(',', '.')
      : raw;
    const numeric = Number(normalized);
    return Number.isFinite(numeric) ? numeric : undefined;
  }

  totalLitros(): number {
    return this.notas().reduce((a, n) => a + (n.quantidade ?? 0), 0);
  }

  totalValor(): number {
    return this.notas().reduce((a, n) => a + (n.valor ?? 0), 0);
  }

  custoTransporteTotal(n: EntradaNota): number {
    const persisted = Number(n.custo_transporte_total ?? 0);
    if (Number.isFinite(persisted) && persisted > 0) return persisted;
    return Math.round((Number(n.quantidade ?? 0) * this.custoTransportePorLitro) * 100) / 100;
  }

  valorCompraFinal(n: EntradaNota): number {
    const persisted = Number(n.valor_compra_final ?? 0);
    if (Number.isFinite(persisted) && persisted > 0) return persisted;
    return Number(n.valor ?? 0) + this.custoTransporteTotal(n);
  }

  notaVerificacaoLabel(n: EntradaNota): string {
    const status = String(n.nota_verificacao_status ?? '').trim().toLowerCase();
    if (status === 'validada') return 'Nota validada';
    if (status === 'suspeita') return 'Suspeita';
    if (status === 'desativada') return 'IA desativada';
    return 'Pendente';
  }

  totalTransporte(): number {
    return this.notas().reduce((a, n) => a + this.custoTransporteTotal(n), 0);
  }

  totalCompraFinal(): number {
    return this.notas().reduce((a, n) => a + this.valorCompraFinal(n), 0);
  }

  newItem() {
    this.editItem.set(null);
    this.form.reset({
      data: new Date().toISOString().slice(0, 10),
      hora: this.currentTimeInput(),
      tipo: this.tiposCombustivel()[0] ?? this.defaultTipoCombustivel,
      responsavel: this.auth.currentUser()?.nome ?? ''
    });
    this.showForm.set(true);
  }

  edit(n: EntradaNota) {
    this.editItem.set(n);
    this.form.patchValue({ ...n, data: n.data?.slice(0, 10), hora: this.notaHoraInput(n) } as any);
    this.form.patchValue({ responsavel: this.auth.currentUser()?.nome ?? n.responsavel ?? '' });
    this.showForm.set(true);
  }

  cancelForm() {
    this.showForm.set(false);
    this.editItem.set(null);
    this.form.reset({
      hora: this.currentTimeInput(),
      tipo: this.tiposCombustivel()[0] ?? this.defaultTipoCombustivel,
      responsavel: this.auth.currentUser()?.nome ?? ''
    });
  }

  onSubmit() {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    if (this.editItem() && !this.isAdmin()) {
      this.toastr.error('Somente administradores podem editar notas');
      return;
    }
    this.saving.set(true);
    const raw = this.form.getRawValue();
    const data = {
      ...(raw as any),
      data_hora: this.combineDateTime(raw.data, raw.hora),
      responsavel: this.auth.currentUser()?.nome ?? raw.responsavel ?? '',
    };
    delete (data as any).hora;
    const obs = this.editItem()
      ? this.api.updateEntradaNota(this.editItem()!.id_financeiro, data)
      : this.api.createEntradaNota(data);
    obs.subscribe({
      next: () => { this.toastr.success('Nota salva com sucesso'); this.cancelForm(); this.load(); this.saving.set(false); },
      error: (err) => {
        const message = this.apiErrorMessage(err, 'Erro ao salvar nota');
        console.error('Erro ao salvar entrada de nota', err);
        this.toastr.error(message);
        this.saving.set(false);
      }
    });
  }

  confirmDelete(n: EntradaNota) { this.deleteTarget.set(n); }

  executeDelete() {
    this.api.deleteEntradaNota(this.deleteTarget()!.id_financeiro).subscribe({
      next: () => { this.toastr.success('Nota excluída'); this.deleteTarget.set(null); this.load(); },
      error: () => this.toastr.error('Erro ao excluir')
    });
  }

  onUploadFotoNota(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    this.uploadingFotoNota.set(true);
    this.api.uploadToDrive(file).subscribe({
      next: (res) => {
        const url = res?.file?.downloadUrl || res?.file?.webViewLink || '';
        this.form.patchValue({ foto_nota: url });
        this.uploadingFotoNota.set(false);
        this.toastr.success('Imagem da nota enviada');
      },
      error: (err) => {
        const message = this.apiErrorMessage(err, 'Erro no upload da imagem');
        console.error('Erro no upload da imagem da nota', err);
        this.toastr.error(message);
        this.uploadingFotoNota.set(false);
      }
    });
  }

  private apiErrorMessage(err: any, fallback: string): string {
    const parts: string[] = [];
    const message = err?.error?.message || err?.message || fallback;
    parts.push(message);
    const errors = err?.error?.errors;
    if (errors && typeof errors === 'object') {
      for (const [field, value] of Object.entries(errors)) {
        if (Array.isArray(value)) {
          parts.push(`${field}: ${value.join(', ')}`);
        } else if (value) {
          parts.push(`${field}: ${value}`);
        }
      }
    }
    return parts.filter(Boolean).join(' | ');
  }

  notaDataLabel(n: EntradaNota): string {
    const date = this.rawDatePart(n.data_hora || n.data);
    if (!date) return '—';
    const [year, month, day] = date.split('-');
    return `${day}/${month}/${year}`;
  }

  notaHoraLabel(n: EntradaNota): string {
    return this.rawTimePart(n.data_hora) ?? '—';
  }

  private notaHoraInput(n: EntradaNota): string {
    return this.rawTimePart(n.data_hora) ?? '00:00';
  }

  private currentTimeInput(): string {
    const now = new Date();
    return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  }

  private combineDateTime(date?: string | null, time?: string | null): string | null {
    const datePart = this.rawDatePart(date);
    if (!datePart) return null;
    const timePart = time && /^\d{2}:\d{2}$/.test(time) ? time : '00:00';
    return `${datePart} ${timePart}:00`;
  }

  private rawDatePart(value?: string | null): string | null {
    const match = String(value ?? '').match(/^(\d{4}-\d{2}-\d{2})/);
    return match?.[1] ?? null;
  }

  private rawTimePart(value?: string | null): string | null {
    const match = String(value ?? '').match(/[T\s](\d{2}:\d{2})/);
    return match?.[1] ?? null;
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

  displayImageUrl(url?: string | null): string {
    const imageUrl = this.resolveImageUrl(url);
    if (!imageUrl) return '';
    const driveId = this.googleDriveFileId(imageUrl);
    if (driveId) {
      return `https://drive.google.com/thumbnail?id=${encodeURIComponent(driveId)}&sz=w1600`;
    }
    return imageUrl;
  }

  private googleDriveFileId(url: string): string | null {
    try {
      const parsed = new URL(url);
      if (!parsed.hostname.includes('drive.google.com')) return null;
      const idParam = parsed.searchParams.get('id');
      if (idParam) return idParam;
      const match = parsed.pathname.match(/\/file\/d\/([^/]+)/);
      return match?.[1] ?? null;
    } catch {
      return null;
    }
  }

  openImagePreview(url?: string | null) {
    const imageUrl = this.resolveImageUrl(url);
    if (!imageUrl) return;
    this.previewImageUrl.set(imageUrl);
  }

  closeImagePreview() {
    this.previewImageUrl.set('');
  }

  openExternalImage(url?: string | null) {
    const imageUrl = this.resolveImageUrl(url);
    if (!imageUrl) return;
    window.open(imageUrl, '_blank', 'noopener,noreferrer');
  }

  openDatePicker(input: HTMLInputElement) {
    try {
      if (typeof input.showPicker === 'function') {
        input.showPicker();
        return;
      }
    } catch {}
    input.focus();
    input.click();
  }
}
