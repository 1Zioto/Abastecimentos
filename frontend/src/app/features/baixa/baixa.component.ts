// src/app/features/baixa/baixa.component.ts
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';
import { ToastrService } from 'ngx-toastr';
import { Abastecimento, Proprietario } from '../../shared/models';

@Component({
  selector: 'app-baixa',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule],
  template: `
    <div class="page">
      <div class="page-header">
        <div>
          <h1>Baixas</h1>
          <p>Histórico de baixas realizadas</p>
        </div>
        <button class="btn-primary" (click)="openNovaBaixa()">+ Nova Baixa</button>
      </div>

      <div class="card">
        <div class="card-title">
          <h3>Registros de Baixa</h3>
          <button class="btn-sm" (click)="loadBaixas()">Atualizar</button>
        </div>

        @if (loadingBaixas()) {
          <div class="loading-state"><div class="spinner-lg"></div> Carregando baixas...</div>
        } @else {
          <div class="table-wrap">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Data/Hora</th>
                  <th>Empresa</th>
                  <th>Placa</th>
                  <th>Motorista</th>
                  <th>Forma Pgto</th>
                  <th>Data Pgto</th>
                  <th class="text-right">Valor</th>
                  <th>Anexo</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                @for (b of baixas(); track b.id_baixa) {
                  <tr>
                    <td>{{ b.data_hora | date:'dd/MM/yyyy HH:mm' }}</td>
                    <td>{{ b.abastecimento?.nome_proprietario || b.abastecimento?.proprietario?.nome || '—' }}</td>
                    <td>{{ b.abastecimento?.veiculo?.placa || '—' }}</td>
                    <td>{{ b.abastecimento?.nome_motorista || b.abastecimento?.motorista?.nome || '—' }}</td>
                    <td>{{ b.forma_pagamento || '—' }}</td>
                    <td>{{ b.data_pagamento ? (b.data_pagamento | date:'dd/MM/yyyy') : '—' }}</td>
                    <td class="text-right val-green">{{ b.abastecimento?.valor_total | currency:'BRL':'symbol':'1.2-2' }}</td>
                    <td>
                      @if (resolveImageUrl(b.abastecimento?.anexo); as anexoUrl) {
                        <button class="btn-link" (click)="openImagePreview(anexoUrl)">Ver imagem</button>
                      } @else {
                        <span class="muted">Sem anexo</span>
                      }
                    </td>
                    <td>
                      <button
                        class="btn-danger-sm"
                        type="button"
                        [disabled]="deletingBaixaId() === b.id_baixa"
                        (click)="deleteBaixa(b.id_baixa)"
                      >
                        {{ deletingBaixaId() === b.id_baixa ? 'Excluindo...' : 'Excluir' }}
                      </button>
                    </td>
                  </tr>
                } @empty {
                  <tr>
                    <td colspan="9" class="empty-cell">Nenhuma baixa registrada</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }
      </div>

      @if (showNovaBaixaModal()) {
        <div class="modal-overlay" (click)="closeNovaBaixa()">
          <div class="modal-shell" (click)="$event.stopPropagation()">
            <div class="modal-header">
              <h2>Nova Baixa</h2>
              <button class="btn-close" (click)="closeNovaBaixa()">✕</button>
            </div>

            <div class="filters-card">
              <div class="filters-grid">
                <div class="filter-field">
                  <label>Empresa</label>
                  <select [(ngModel)]="filters.id_proprietario" (change)="loadPendentes()">
                    <option value="">Todas</option>
                    @for (p of proprietarios(); track p.id_proprietario) {
                      <option [value]="p.id_proprietario">{{ p.nome }}</option>
                    }
                  </select>
                </div>
                <div class="filter-field">
                  <label>Placa</label>
                  <input type="text" [(ngModel)]="filters.placa" placeholder="ABC-1234" (input)="loadPendentes()" />
                </div>
                <div class="filter-field">
                  <label>Data Início</label>
                  <input type="date" [(ngModel)]="filters.data_inicio" (change)="loadPendentes()" />
                </div>
                <div class="filter-field">
                  <label>Data Fim</label>
                  <input type="date" [(ngModel)]="filters.data_fim" (change)="loadPendentes()" />
                </div>
              </div>
            </div>

            <div class="content-grid">
              <div class="list-card">
                <div class="list-header">
                  <h3>Pendentes <span class="badge-count">{{ pendentes().length }}</span></h3>
                  <div class="select-controls">
                    <button class="btn-sm" (click)="selectAll()">Selecionar Todos</button>
                    <button class="btn-sm" (click)="clearSelection()">Limpar</button>
                  </div>
                </div>

                @if (loadingPendentes()) {
                  <div class="loading-state"><div class="spinner-lg"></div></div>
                } @else {
                  <div class="pendente-list">
                    @for (a of pendentes(); track a.id_abastecimento) {
                      <div class="pendente-item" [class.selected]="isSelected(a.id_abastecimento)"
                           (click)="toggleSelect(a.id_abastecimento)">
                        <div class="pendente-check">
                          {{ isSelected(a.id_abastecimento) ? '☑' : '☐' }}
                        </div>
                        <div class="pendente-info">
                          <div class="pendente-top">
                            <span class="placa-badge">{{ a.veiculo?.placa ?? '—' }}</span>
                            <span class="pendente-date">{{ a.data | date:'dd/MM/yyyy' }}</span>
                          </div>
                          <div class="pendente-bottom">
                            <span>{{ a.nome_proprietario ?? '—' }}</span>
                            <span>{{ a.nome_motorista ?? '—' }}</span>
                          </div>
                          <div class="pendente-vals">
                            <span>{{ a.quantidade_litros | number:'1.2-2' }} L</span>
                            <span class="val-green">{{ a.valor_total | currency:'BRL':'symbol':'1.2-2' }}</span>
                          </div>
                        </div>
                      </div>
                    } @empty {
                      <div class="empty-state">Sem abastecimentos pendentes para o filtro.</div>
                    }
                  </div>

                  @if (selected().size > 0) {
                    <div class="selection-summary">
                      <span>{{ selected().size }} selecionado(s)</span>
                      <span class="summary-val">Total: {{ totalSelecionado() | currency:'BRL':'symbol':'1.2-2' }}</span>
                    </div>
                  }
                }
              </div>

              <div class="form-card">
                <h3>Dados da Baixa</h3>

                <form [formGroup]="form" (ngSubmit)="onSubmit()">
                  <div class="field">
                    <label>Data da Baixa</label>
                    <div class="date-row">
                      <input #dataBaixaInput type="date" formControlName="data_baixa" />
                      <button type="button" class="btn-date" (click)="openDatePicker(dataBaixaInput)">📅</button>
                    </div>
                  </div>
                  <div class="field">
                    <label>Tipo de Baixa</label>
                    <select formControlName="tipo_despesa">
                      <option value="Combustível">Combustível</option>
                      <option value="Manutenção">Manutenção</option>
                      <option value="Outros">Outros</option>
                    </select>
                  </div>
                  <div class="field">
                    <label>Descrição</label>
                    <textarea formControlName="descricao" rows="2" placeholder="Descrição opcional"></textarea>
                  </div>
                  <div class="field">
                    <label>Forma de Pagamento</label>
                    <select formControlName="forma_pagamento">
                      <option value="">Selecione...</option>
                      <option value="Dinheiro">Dinheiro</option>
                      <option value="PIX">PIX</option>
                      <option value="Cartão Crédito">Cartão Crédito</option>
                      <option value="Cartão Débito">Cartão Débito</option>
                      <option value="Cheque">Cheque</option>
                      <option value="Transferência">Transferência</option>
                      <option value="Boleto">Boleto</option>
                    </select>
                  </div>
                  <div class="field">
                    <label>Data Pagamento</label>
                    <div class="date-row">
                      <input #dataPagamentoInput type="date" formControlName="data_pagamento" />
                      <button type="button" class="btn-date" (click)="openDatePicker(dataPagamentoInput)">📅</button>
                    </div>
                  </div>
                  <div class="field">
                    <label>Status</label>
                    <input type="text" formControlName="status" readonly class="readonly-field" />
                  </div>
                  <div class="field">
                    <label>Recebedor</label>
                    <select formControlName="recebedor">
                      <option value="Vipe Transportes">Vipe Transportes</option>
                      <option value="Augusto">Augusto</option>
                      <option value="Outros">Outros</option>
                    </select>
                  </div>
                  @if (form.value.recebedor === 'Outros') {
                    <div class="field">
                      <label>Recebedor (Outros)</label>
                      <input type="text" formControlName="recebedor_outros" placeholder="Digite o nome" />
                    </div>
                  }
                  <div class="field">
                    <label>Observação</label>
                    <textarea formControlName="observacao" rows="2" placeholder="Observações"></textarea>
                  </div>
                  <div class="field">
                    <label>Anexo (Imagem)</label>
                    <input type="file" accept="image/*" (change)="onUploadAnexo($event)" />
                    @if (uploadingAnexo()) {
                      <small class="upload-hint">Enviando imagem...</small>
                    } @else if (resolveImageUrl(form.value.anexo); as anexoFormUrl) {
                      <small class="upload-hint">Imagem enviada ✓</small>
                      <div class="preview-box">
                        <img class="preview-img" [src]="anexoFormUrl" alt="Anexo" />
                      </div>
                      <button type="button" class="btn-preview" (click)="openImagePreview(anexoFormUrl)">Expandir</button>
                    }
                  </div>

                  <button type="submit" class="btn-primary" [disabled]="saving() || selected().size === 0">
                    @if (saving()) {
                      <span class="spinner"></span> Registrando...
                    } @else {
                      ✅ Registrar Baixa ({{ selected().size }})
                    }
                  </button>
                </form>
              </div>
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
    * { box-sizing:border-box; }
    .page { padding:28px; font-family:'Inter',sans-serif; color:#e2e8f0; }
    .page-header { margin-bottom:20px; display:flex; align-items:flex-start; justify-content:space-between; gap:12px; }
    .page-header h1 { font-size:24px; font-weight:700; color:#f8fafc; margin:0; }
    .page-header p { font-size:13px; color:#64748b; margin-top:4px; }

    .card { background:#0d1427; border:1px solid #1e2d4a; border-radius:12px; padding:16px; }
    .card-title { display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; }
    .card-title h3 { margin:0; font-size:14px; color:#f8fafc; }

    .table-wrap { overflow:auto; }
    .data-table { width:100%; border-collapse:collapse; font-size:12px; }
    .data-table thead th {
      padding:10px 12px; text-align:left; font-size:10px; text-transform:uppercase;
      letter-spacing:0.5px; color:#64748b; border-bottom:1px solid #1e2d4a;
      white-space:nowrap; background:#080e1c;
    }
    .data-table tbody td { padding:10px 12px; border-bottom:1px solid #1e2d4a20; }
    .data-table tbody tr:hover td { background:#1e2d4a15; }
    .text-right { text-align:right; }
    .val-green { color:#4ade80; font-weight:600; }
    .btn-link { background:none; border:none; color:#38bdf8; cursor:pointer; font-size:12px; }
    .btn-link:hover { text-decoration:underline; }
    .btn-danger-sm {
      background:#3f1d22;
      border:1px solid #7f1d1d;
      color:#fecaca;
      border-radius:6px;
      padding:4px 10px;
      font-size:11px;
      cursor:pointer;
    }
    .btn-danger-sm:hover { background:#4c1d24; border-color:#991b1b; }
    .btn-danger-sm:disabled { opacity:0.55; cursor:not-allowed; }
    .muted { color:#64748b; font-size:11px; }
    .empty-cell { text-align:center; padding:24px; color:#64748b; }

    .btn-primary {
      background:linear-gradient(135deg,#0ea5e9,#6366f1);
      border:none; border-radius:8px; padding:10px 16px; color:#fff; font-size:13px; font-weight:600;
      cursor:pointer; display:inline-flex; align-items:center; justify-content:center; gap:8px;
    }
    .btn-primary:disabled { opacity:0.45; cursor:not-allowed; }
    .btn-sm { background:transparent; border:1px solid #1e2d4a; color:#64748b; padding:4px 10px; border-radius:5px; font-size:11px; cursor:pointer; }
    .btn-sm:hover { border-color:#94a3b8; color:#94a3b8; }

    .loading-state { display:flex; align-items:center; justify-content:center; gap:10px; padding:24px; color:#64748b; }
    .spinner-lg { width:24px;height:24px;border:3px solid #1e2d4a;border-top-color:#0ea5e9;border-radius:50%;animation:spin 0.8s linear infinite; }
    .spinner { width:14px;height:14px;border:2px solid rgba(255,255,255,0.3);border-top-color:#fff;border-radius:50%;animation:spin 0.7s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }

    .modal-overlay { position:fixed; inset:0; background:rgba(2,6,23,0.75); display:flex; align-items:center; justify-content:center; z-index:1000; padding:18px; }
    .modal-shell { width:min(1400px,96vw); max-height:94vh; overflow:auto; background:#0b1222; border:1px solid #1e2d4a; border-radius:14px; padding:16px; }
    .modal-header { display:flex; align-items:center; justify-content:space-between; margin-bottom:12px; }
    .modal-header h2 { margin:0; font-size:18px; color:#f8fafc; }
    .btn-close { background:transparent; border:1px solid #1e2d4a; color:#94a3b8; border-radius:8px; width:34px; height:34px; cursor:pointer; }

    .filters-card { background:#0d1427; border:1px solid #1e2d4a; border-radius:12px; padding:12px; margin-bottom:12px; }
    .filters-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(180px,1fr)); gap:10px; }
    .filter-field { display:flex; flex-direction:column; gap:4px; }
    .filter-field label { font-size:11px; font-weight:600; color:#64748b; text-transform:uppercase; letter-spacing:0.5px; }
    .filter-field input, .filter-field select { background:#0a0f1e; border:1px solid #1e2d4a; border-radius:7px; padding:8px 10px; color:#e2e8f0; font-size:12px; outline:none; }

    .content-grid { display:grid; grid-template-columns:1fr 380px; gap:12px; }
    .list-card, .form-card { background:#0d1427; border:1px solid #1e2d4a; border-radius:12px; padding:14px; }
    .list-header { display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; }
    .list-header h3 { margin:0; font-size:14px; color:#f8fafc; display:flex; gap:8px; align-items:center; }
    .badge-count { background:#0ea5e920; color:#38bdf8; padding:2px 8px; border-radius:10px; font-size:11px; }
    .select-controls { display:flex; gap:6px; }

    .pendente-list { display:flex; flex-direction:column; gap:6px; max-height:500px; overflow:auto; }
    .pendente-item { border:1px solid #1e2d4a; border-radius:8px; padding:10px 12px; cursor:pointer; transition:all 0.15s; display:flex; gap:10px; align-items:flex-start; }
    .pendente-item:hover { border-color:#0ea5e9; background:#0ea5e910; }
    .pendente-item.selected { border-color:#4ade80; background:#4ade8010; }
    .pendente-check { font-size:18px; color:#64748b; padding-top:1px; }
    .pendente-item.selected .pendente-check { color:#4ade80; }
    .pendente-info { flex:1; }
    .pendente-top { display:flex; justify-content:space-between; margin-bottom:4px; }
    .placa-badge { background:#1e2d4a; color:#38bdf8; padding:2px 7px; border-radius:4px; font-size:11px; font-weight:700; font-family:monospace; }
    .pendente-date { font-size:11px; color:#64748b; }
    .pendente-bottom { display:flex; gap:12px; font-size:11px; color:#94a3b8; margin-bottom:4px; }
    .pendente-vals { display:flex; gap:12px; font-size:11px; color:#64748b; }
    .selection-summary { background:#4ade8015; border:1px solid #4ade8030; border-radius:8px; padding:10px 14px; margin-top:10px; display:flex; justify-content:space-between; font-size:13px; }
    .summary-val { color:#4ade80; font-weight:700; }
    .empty-state { text-align:center; padding:20px; color:#64748b; }

    .form-card h3 { margin:0 0 12px; color:#f8fafc; font-size:14px; }
    .field { display:flex; flex-direction:column; gap:5px; margin-bottom:10px; }
    .field label { font-size:11px; font-weight:600; color:#94a3b8; text-transform:uppercase; letter-spacing:0.5px; }
    .field input, .field select, .field textarea {
      background:#0a0f1e; border:1px solid #1e2d4a; border-radius:7px;
      padding:8px 10px; color:#e2e8f0; font-size:12px; outline:none; font-family:'Inter',sans-serif;
    }
    .readonly-field { opacity:0.8; cursor:not-allowed; }
    .date-row { display:flex; gap:8px; align-items:center; }
    .date-row input { flex:1; }
    .btn-date { height:34px; min-width:40px; padding:0 10px; background:#0a0f1e; border:1px solid #1e2d4a; border-radius:7px; color:#94a3b8; cursor:pointer; font-size:14px; }
    .btn-date:hover { border-color:#38bdf8; color:#38bdf8; }

    .upload-hint { color:#94a3b8; font-size:11px; }
    .preview-box { margin-top:6px; border:1px solid #1e2d4a; border-radius:10px; padding:6px; background:#0a0f1e; width:100%; max-width:220px; }
    .preview-img { display:block; width:100%; height:140px; object-fit:cover; border-radius:8px; background:#0d1427; }
    .btn-preview { margin-top:6px; background:#0a0f1e; border:1px solid #1e2d4a; color:#38bdf8; padding:6px 10px; border-radius:8px; font-size:12px; cursor:pointer; width:fit-content; }
    .btn-preview:hover { border-color:#38bdf8; }

    .image-overlay { position:fixed; inset:0; background:rgba(2,6,23,0.9); display:flex; align-items:center; justify-content:center; z-index:1100; padding:20px; }
    .image-modal { max-width:min(92vw,1100px); max-height:90vh; display:flex; flex-direction:column; gap:12px; align-items:center; }
    .image-modal img { width:auto; max-width:100%; max-height:calc(90vh - 56px); object-fit:contain; border-radius:12px; border:1px solid #1e2d4a; background:#0a0f1e; }
    .btn-close-image { background:#0a0f1e; border:1px solid #1e2d4a; color:#e2e8f0; padding:8px 14px; border-radius:8px; cursor:pointer; font-size:12px; }
  `]
})
export class BaixaComponent implements OnInit {
  private api = inject(ApiService);
  private toastr = inject(ToastrService);
  private fb = inject(FormBuilder);

  baixas = signal<any[]>([]);
  loadingBaixas = signal(true);
  showNovaBaixaModal = signal(false);

  pendentes = signal<Abastecimento[]>([]);
  proprietarios = signal<Proprietario[]>([]);
  selected = signal<Set<string>>(new Set());
  loadingPendentes = signal(false);
  saving = signal(false);
  deletingBaixaId = signal<string | null>(null);
  uploadingAnexo = signal(false);
  previewImageUrl = signal('');

  totalSelecionado = computed(() =>
    this.pendentes()
      .filter((a) => this.selected().has(a.id_abastecimento))
      .reduce((acc, a) => acc + this.toNumber(a.valor_total), 0)
  );

  filters: any = { id_proprietario: '', placa: '', data_inicio: '', data_fim: '' };

  form = this.fb.group({
    data_baixa: [new Date().toISOString().slice(0, 10)],
    tipo_despesa: ['Combustível'],
    descricao: [''],
    forma_pagamento: [''],
    data_pagamento: [''],
    status: ['Pago'],
    recebedor: ['Vipe Transportes'],
    recebedor_outros: [''],
    observacao: [''],
    anexo: [''],
  });

  ngOnInit() {
    this.api.getProprietariosAll().subscribe(r => this.proprietarios.set(r.data));
    this.loadBaixas();
  }

  loadBaixas() {
    this.loadingBaixas.set(true);
    this.api.getBaixas({ per_page: 100 }).subscribe({
      next: (r) => {
        this.baixas.set(r.data);
        this.loadingBaixas.set(false);
      },
      error: () => {
        this.loadingBaixas.set(false);
      }
    });
  }

  openNovaBaixa() {
    this.showNovaBaixaModal.set(true);
    this.loadPendentes();
  }

  closeNovaBaixa() {
    this.showNovaBaixaModal.set(false);
    this.selected.set(new Set());
  }

  loadPendentes() {
    this.loadingPendentes.set(true);
    this.api.getAbastecimentosPendenteBaixa({ ...this.filters, limit: 120 }).subscribe({
      next: r => {
        this.pendentes.set(r);
        this.loadingPendentes.set(false);
      },
      error: () => {
        this.loadingPendentes.set(false);
        this.toastr.error('Erro ao carregar pendentes');
      }
    });
  }

  isSelected(id: string): boolean { return this.selected().has(id); }

  toggleSelect(id: string) {
    const s = new Set(this.selected());
    s.has(id) ? s.delete(id) : s.add(id);
    this.selected.set(s);
  }

  selectAll() {
    this.selected.set(new Set(this.pendentes().map(a => a.id_abastecimento)));
  }

  clearSelection() { this.selected.set(new Set()); }

  private toNumber(value: unknown): number {
    if (value === null || value === undefined) return 0;
    if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
    const normalized = String(value).replace(',', '.').trim();
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
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

  onSubmit() {
    if (this.selected().size === 0) {
      this.toastr.warning('Selecione ao menos um abastecimento');
      return;
    }

    this.saving.set(true);
    const payload = {
      ...this.form.value,
      recebedor: this.form.value.recebedor === 'Outros'
        ? (this.form.value.recebedor_outros || '').trim()
        : this.form.value.recebedor,
      ids: Array.from(this.selected()),
    };

    this.api.createBaixaLote(payload).subscribe({
      next: (r: any) => {
        this.toastr.success(r.message ?? 'Baixas registradas com sucesso!');
        this.selected.set(new Set());
        this.form.patchValue({
          data_baixa: new Date().toISOString().slice(0, 10),
          tipo_despesa: 'Combustível',
          status: 'Pago',
          recebedor: 'Vipe Transportes',
          recebedor_outros: '',
          observacao: '',
          anexo: '',
        });
        this.saving.set(false);
        this.loadPendentes();
        this.loadBaixas();
      },
      error: err => {
        this.toastr.error(err.error?.message ?? 'Erro ao registrar baixas');
        this.saving.set(false);
      }
    });
  }

  onUploadAnexo(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    this.uploadingAnexo.set(true);
    this.api.uploadToDrive(file).subscribe({
      next: (res) => {
        const url = res?.file?.downloadUrl || res?.file?.webViewLink || '';
        this.form.patchValue({ anexo: url });
        this.uploadingAnexo.set(false);
        this.toastr.success('Imagem de anexo enviada');
      },
      error: (err) => {
        this.toastr.error(err.error?.message ?? 'Erro no upload do anexo');
        this.uploadingAnexo.set(false);
      }
    });
  }

  openImagePreview(url?: string | null) {
    const imageUrl = this.resolveImageUrl(url);
    if (!imageUrl) return;
    this.previewImageUrl.set(imageUrl);
  }

  closeImagePreview() {
    this.previewImageUrl.set('');
  }

  openDatePicker(input: HTMLInputElement) {
    try {
      if (typeof input.showPicker === 'function') {
        input.showPicker();
        return;
      }
    } catch {}
    input.focus();
  }

  deleteBaixa(idBaixa: string) {
    const ok = confirm('Deseja realmente excluir esta baixa? O abastecimento voltará para Pendente.');
    if (!ok) return;

    this.deletingBaixaId.set(idBaixa);
    this.api.deleteBaixa(idBaixa).subscribe({
      next: () => {
        this.toastr.success('Baixa excluída e status revertido para Pendente');
        this.loadBaixas();
        this.loadPendentes();
        this.deletingBaixaId.set(null);
      },
      error: (err) => {
        this.toastr.error(err.error?.message ?? 'Erro ao excluir baixa');
        this.deletingBaixaId.set(null);
      }
    });
  }
}
