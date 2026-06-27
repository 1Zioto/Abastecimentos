// src/app/features/abastecimentos/form/abastecimento-form.component.ts
import { Component, OnInit, inject, signal, Input, computed } from '@angular/core';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { ApiService } from '../../../core/services/api.service';
import { ToastrService } from 'ngx-toastr';
import { Proprietario, Veiculo, Motorista } from '../../../shared/models';
import { AuthService } from '../../../core/services/auth.service';
import { catchError, firstValueFrom, forkJoin, of } from 'rxjs';
import { OcrCheck, OcrVerificationResult, OcrVerifierService } from '../../../core/services/ocr-verifier.service';

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
            <div class="date-row">
              <input #dataInput type="date" formControlName="data" />
              <button type="button" class="btn-date" (click)="openDatePicker(dataInput)">📅</button>
            </div>
          </div>
          <div class="field">
            <label>Data e Hora <span class="req">*</span></label>
            <div class="date-row">
              <input #dataHoraInput type="datetime-local" formControlName="data_hora" />
              <button type="button" class="btn-date" (click)="openDatePicker(dataHoraInput)">📅</button>
            </div>
          </div>

          <!-- Frentista -->
          <div class="field">
            <label>Frentista <span class="req">*</span></label>
            <input type="text" formControlName="frentista" readonly class="readonly-field" />
          </div>

          <!-- Veículo -->
          <div class="field">
            <label>Veículo <span class="req">*</span></label>
            <div class="search-with-add">
              <input
                type="text"
                [value]="veiculoBusca()"
                placeholder="Digite placa/modelo..."
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
                    @if (v.proprietario?.nome) {
                      <small>{{ v.proprietario?.nome }}</small>
                    }
                  </button>
                }
              </div>
            }
          </div>

          <!-- Proprietário -->
          <div class="field">
            <label>Proprietário <span class="req">*</span></label>
            <div class="search-with-add">
              <input
                type="text"
                [value]="proprietarioBusca()"
                placeholder="Preenchido pela placa ou digite..."
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

          <!-- Motorista -->
          <div class="field">
            <label>Motorista <span class="req">*</span></label>
            <div class="search-with-add">
              <input
                type="text"
                [value]="motoristaBusca()"
                [placeholder]="form.value.id_proprietario ? 'Digite nome ou apelido...' : 'Selecione o proprietário primeiro...'"
                [disabled]="!form.value.id_proprietario"
                (input)="onMotoristaBuscaChange($event)"
                (focus)="showMotoristasDropdown.set(true)"
                (blur)="closeMotoristasDropdown()"
              />
            </div>
            @if (showMotoristasDropdown() && filteredMotoristas().length > 0) {
              <div class="autocomplete-list">
                @for (m of filteredMotoristas(); track m.id_motorista) {
                  <button type="button" class="autocomplete-item" (mousedown)="selectMotorista(m)">
                    {{ motoristaLabel(m) }}
                  </button>
                }
              </div>
            }
          </div>

          <!-- Local -->
          <div class="field">
            <label>Local <span class="req">*</span></label>
            <select formControlName="local" (change)="onCombustivelChange()">
              @for (garagem of garagens; track garagem) {
                <option [value]="garagem">{{ garagem }}</option>
              }
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
            <label>Valor por Litro <span class="badge-info">{{ proprietarioSelecionadoUsaPrecoCusto() ? 'Custo' : 'Tabela' }}</span></label>
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
            <label>Odômetro (km) @if (proprietarioSelecionadoExigeOdometro()) { <span class="req">*</span> }</label>
            <input type="number" formControlName="odometro" placeholder="Ex: 125000" />
            @if (ultimoOdometroReferencia() !== null) {
              <small class="upload-hint">Último odômetro do veículo: {{ ultimoOdometroReferencia() }} km. Mínimo: {{ (ultimoOdometroReferencia() ?? 0) + 1 }} km</small>
            }
          </div>

          <div class="field">
            <label>Foto Hodômetro</label>
            <input #fotoOdometroInput class="file-input-hidden" type="file" accept="image/*" (change)="onUploadFotoOdometro($event)" />
            @if (uploadingFotoOdometro() || analyzingFotoOdometro()) {
              <small class="upload-hint">
                {{ uploadingFotoOdometro() ? 'Enviando imagem...' : (canSeeAnalysisFeedback() ? analysisLoadingLabel() : 'Imagem enviada ✓') }}
              </small>
            } @else if (resolveImageUrl(form.value.foto_odometro); as fotoOdometroUrl) {
              <small class="upload-hint">Imagem enviada ✓</small>
              <div class="preview-box">
                <img class="preview-img" [src]="fotoOdometroUrl" alt="Foto hodômetro" />
              </div>
              <button type="button" class="btn-preview" (click)="openImagePreview(fotoOdometroUrl)">
                Expandir
              </button>
            }
            <button type="button" class="btn-preview" (click)="fotoOdometroInput.click()">
              {{ resolveImageUrl(form.value.foto_odometro) ? 'Substituir foto' : 'Anexar foto' }}
            </button>
          </div>

          <!-- Bomba -->
          <div class="field">
            <label>Bomba (Imagem) <span class="req">*</span></label>
            <input #bombaInput class="file-input-hidden" type="file" accept="image/*" (change)="onUploadBomba($event)" />
            @if (uploadingBomba() || analyzingBomba()) {
              <small class="upload-hint">
                {{ uploadingBomba() ? 'Enviando imagem...' : (canSeeAnalysisFeedback() ? analysisLoadingLabel() : 'Imagem enviada ✓') }}
              </small>
            } @else if (resolveImageUrl(form.value.bomba); as bombaUrl) {
              <small class="upload-hint">Imagem enviada ✓</small>
              <div class="preview-box">
                <img class="preview-img" [src]="bombaUrl" alt="Imagem bomba" />
              </div>
              <button type="button" class="btn-preview" (click)="openImagePreview(bombaUrl)">
                Expandir
              </button>
            }
            <button type="button" class="btn-preview" (click)="bombaInput.click()">
              {{ resolveImageUrl(form.value.bomba) ? 'Substituir imagem' : 'Anexar imagem' }}
            </button>
          </div>

          <div class="field field-wide">
            <label>Observação</label>
            <textarea
              formControlName="observacao"
              rows="3"
              placeholder="Observação opcional sobre este abastecimento"
            ></textarea>
          </div>

        </div>

        @if (canSeeAnalysisFeedback() && hasOcrResult()) {
          <div class="ocr-panel">
            <div class="ocr-panel-header">
              <span>{{ analysisPanelTitle() }}</span>
              @if (hasOcrWarnings()) {
                <strong class="ocr-status warning">Atenção</strong>
              } @else {
                <strong class="ocr-status ok">Sem inconsistências</strong>
              }
            </div>
            <div class="ocr-grid">
              @if (ocrFotoOdometro(); as fotoOcr) {
                <div class="ocr-card">
                  <h4>Foto Hodômetro</h4>
                  @for (check of fotoOcr.checks; track check.message) {
                    <p [class.warn]="check.severity === 'warning'">{{ check.message }}</p>
                  }
                </div>
              }
              @if (ocrBomba(); as bombaOcr) {
                <div class="ocr-card">
                  <h4>Bomba (Imagem)</h4>
                  @for (check of bombaOcr.checks; track check.message) {
                    <p [class.warn]="check.severity === 'warning'">{{ check.message }}</p>
                  }
                </div>
              }
            </div>
          </div>
        }

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
          <button type="submit" class="btn-primary" [disabled]="saving() || uploadingBomba()">
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

    .field input, .field select, .field textarea {
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
    .field textarea {
      min-height: 92px;
      resize: vertical;
      line-height: 1.45;
    }
    .field-wide { grid-column: 1 / -1; }
    .field input:focus, .field select:focus, .field textarea:focus { border-color: #0ea5e9; }
    .field input::placeholder, .field textarea::placeholder { color: #334155; }
    .field select option { background: #0d1427; }
    .date-row { display: flex; gap: 8px; align-items: center; }
    .date-row input { flex: 1; min-width: 0; }
    .btn-date {
      height: 40px;
      min-width: 42px;
      padding: 0 10px;
      background: #0a0f1e;
      border: 1px solid #1e2d4a;
      border-radius: 8px;
      color: #94a3b8;
      cursor: pointer;
      font-size: 14px;
    }
    .btn-date:hover { border-color: #38bdf8; color: #38bdf8; }
    .readonly-field { opacity: 0.7; cursor: not-allowed; }
    .readonly-field.highlight { color: #4ade80; font-weight: 600; border-color: #4ade8040; }
    .upload-hint { color: #94a3b8; font-size: 11px; }
    .file-input-hidden { display: none; }
    .ocr-panel {
      background: #f8fafc;
      border: 1px solid #dbe4f0;
      border-radius: 10px;
      padding: 14px;
      margin-bottom: 20px;
      color: #111827;
    }
    .ocr-panel-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
      margin-bottom: 10px;
      font-size: 13px;
      font-weight: 700;
    }
    .ocr-status {
      border-radius: 999px;
      padding: 4px 10px;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0;
    }
    .ocr-status.ok { background: #dcfce7; color: #166534; }
    .ocr-status.warning { background: #fef3c7; color: #92400e; }
    .ocr-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
      gap: 10px;
    }
    .ocr-card {
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      padding: 10px;
      background: #fff;
    }
    .ocr-card h4 {
      margin: 0 0 8px;
      color: #334155;
      font-size: 12px;
    }
    .ocr-card p {
      margin: 6px 0;
      color: #475569;
      font-size: 12px;
      line-height: 1.35;
    }
    .ocr-card p.warn { color: #b45309; font-weight: 600; }
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
    .autocomplete-item small {
      display: block;
      margin-top: 2px;
      color: #94a3b8;
      font-size: 11px;
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
  private readonly aiOrientationKey = 'abastecimento-ai-orientation';
  @Input() id?: string;

  private fb = inject(FormBuilder);
  private api = inject(ApiService);
  private router = inject(Router);
  private toastr = inject(ToastrService);
  private auth = inject(AuthService);
  private ocrVerifier = inject(OcrVerifierService);

  saving = signal(false);
  savingInline = signal(false);
  uploadingFotoOdometro = signal(false);
  uploadingBomba = signal(false);
  analyzingFotoOdometro = signal(false);
  analyzingBomba = signal(false);
  useAiAnalysis = signal(localStorage.getItem('abastecimento-analysis-engine') === 'ai');
  aiOrientation = signal(localStorage.getItem(this.aiOrientationKey) || '');
  ocrFotoOdometro = signal<OcrVerificationResult | null>(null);
  ocrBomba = signal<OcrVerificationResult | null>(null);
  isEdit = signal(false);
  proprietarios = signal<Proprietario[]>([]);
  veiculos = signal<Veiculo[]>([]);
  motoristas = signal<Motorista[]>([]);
  proprietarioBusca = signal('');
  veiculoBusca = signal('');
  motoristaBusca = signal('');
  showProprietariosDropdown = signal(false);
  showVeiculosDropdown = signal(false);
  showMotoristasDropdown = signal(false);
  novoProprietarioModal = signal(false);
  novoVeiculoModal = signal(false);
  previewImageUrl = signal('');
  ultimoOdometroReferencia = signal<number | null>(null);
  hasOcrResult = computed(() => !!this.ocrFotoOdometro() || !!this.ocrBomba());
  hasOcrWarnings = computed(() => this.allOcrChecks().some((check) => check.severity === 'warning'));
  analysisPanelTitle = computed(() => this.useAiAnalysis() ? 'Verificador IA' : 'Verificador OCR');
  analysisLoadingLabel = computed(() => this.useAiAnalysis() ? 'Analisando imagem com IA...' : 'Lendo OCR da imagem...');

  filteredProprietarios = computed(() => {
    const term = this.proprietarioBusca().trim().toLowerCase();
    if (!term) return this.proprietarios().slice(0, 30);
    return this.proprietarios().filter(p => p.nome.toLowerCase().includes(term)).slice(0, 30);
  });

  filteredVeiculos = computed(() => {
    const term = this.veiculoBusca().trim().toLowerCase();
    if (!term) return this.veiculos().slice(0, 30);
    return this.veiculos()
      .filter(v => `${v.placa} ${v.modelo ?? ''} ${v.marca ?? ''} ${v.proprietario?.nome ?? ''}`.toLowerCase().includes(term))
      .slice(0, 30);
  });

  filteredMotoristas = computed(() => {
    const term = this.motoristaBusca().trim().toLowerCase();
    if (!term) return this.motoristas().slice(0, 30);
    return this.motoristas()
      .filter(m => `${m.nome} ${m.apelido ?? ''}`.toLowerCase().includes(term))
      .slice(0, 30);
  });

  private readonly defaultTipoCombustivel = 'OLEO DIESEL S10';
  tiposCombustivel: string[] = [this.defaultTipoCombustivel];
  get garagens() {
    return this.auth.getFiliaisAcesso();
  }
  canSeeAnalysisFeedback() {
    return this.auth.isAdmin();
  }

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
    tipo_combustivel: this.defaultTipoCombustivel,
    numero_chassi: ''
  };

  form = this.fb.group({
    data:              ['', Validators.required],
    data_hora:         ['', Validators.required],
    frentista:         ['', Validators.required],
    id_proprietario:   ['', Validators.required],
    id_veiculo:        ['', Validators.required],
    id_motorista:      ['', Validators.required],
    nome_motorista:    [''],
    nome_proprietario: [''],
    local:             [this.auth.getGaragem() || this.auth.getFiliaisAcesso()[0] || 'Matriz', Validators.required],
    tipo_combustivel:  [this.defaultTipoCombustivel, Validators.required],
    valor_por_litro:   [{ value: 0, disabled: true }],
    quantidade_litros: [null as number | null, [Validators.required, Validators.min(0.01)]],
    valor_total:       [{ value: 0, disabled: true }],
    odometro:          [null as number | null],
    foto_odometro:     [''],
    bomba:             ['', Validators.required],
    status:            ['Pendente', Validators.required],
    observacao:        [''],
  });

  ngOnInit() {
    if (!this.id && !this.auth.canCreateOperationalRecords()) {
      this.toastr.error('Perfil somente visualização: sem permissão para criar abastecimentos');
      this.router.navigate(['/abastecimentos']);
      return;
    }

    this.loadAnalysisConfig();
    this.loadTiposCombustivel();
    this.loadProprietarios();
    this.loadVeiculos();
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
        local: this.auth.getGaragem() || this.auth.getFiliaisAcesso()[0] || 'Matriz',
        tipo_combustivel: this.defaultTipoCombustivel,
        status: 'Pendente',
      });
      this.onCombustivelChange();
    }
  }

  loadProprietarios() {
    this.api.getProprietariosAll().subscribe(r => this.proprietarios.set(r.data));
  }

  loadVeiculos() {
    this.api.getVeiculos({ per_page: 5000 }).subscribe(r => this.veiculos.set(r.data ?? []));
  }

  loadTiposCombustivel() {
    this.api.getValoresCombustivel({
      per_page: 500,
      local: this.form.getRawValue().local || this.auth.getGaragem() || this.auth.getFiliaisAcesso()[0] || 'Matriz',
    }).subscribe({
      next: (r) => {
        const tipos = Array.from(
          new Set(
            (r.data ?? [])
              .map((v: any) => String(v?.tipo_combustivel ?? '').trim())
              .filter(Boolean),
          ),
        );
        this.tiposCombustivel = tipos.length ? tipos : [this.defaultTipoCombustivel];

        const tipoAtual = String(this.form.getRawValue().tipo_combustivel ?? '').trim();
        if (!tipoAtual || !this.tiposCombustivel.includes(tipoAtual)) {
          this.form.patchValue({ tipo_combustivel: this.tiposCombustivel[0] });
          this.onCombustivelChange();
        }

        if (!this.novoVeiculo.tipo_combustivel || !this.tiposCombustivel.includes(String(this.novoVeiculo.tipo_combustivel))) {
          this.novoVeiculo.tipo_combustivel = this.tiposCombustivel[0];
        }
      },
      error: () => {
        this.tiposCombustivel = [this.defaultTipoCombustivel];
      },
    });
  }

  loadAbastecimento(id: string) {
    this.api.getAbastecimento(id).subscribe({
      next: (a) => {
        this.form.patchValue({
          ...a,
          data: a.data?.slice(0, 10),
          data_hora: a.data_hora?.slice(0, 16),
          local: a.local || this.auth.getGaragem() || this.auth.getFiliaisAcesso()[0] || 'Matriz',
          status: a.status || 'Pendente',
          valor_por_litro: a.valor_por_litro,
          valor_total: a.valor_total,
        } as any);
        this.proprietarioBusca.set(a.nome_proprietario ?? '');
        const veiculoTexto = a.veiculo ? `${a.veiculo.placa} — ${a.veiculo.modelo ?? 'Sem modelo'}` : '';
        this.veiculoBusca.set(veiculoTexto);
        this.motoristaBusca.set(a.nome_motorista ?? '');
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
      this.motoristas.set([]);
      this.ultimoOdometroReferencia.set(null);
      this.form.patchValue({ odometro: null });
      this.motoristaBusca.set('');
      this.loadVeiculos();
      return;
    }
    const prop = this.proprietarios().find(p => p.id_proprietario === id);
    this.form.patchValue({ nome_proprietario: prop?.nome ?? '' });
    this.api.getVeiculosByProprietario(id).subscribe(v => this.veiculos.set(v));
    this.api.getMotoristassByProprietario(id).subscribe(m => this.motoristas.set(m));
    this.form.patchValue({ id_veiculo: '', id_motorista: '' });
    this.motoristaBusca.set('');
    this.ultimoOdometroReferencia.set(null);
    this.form.patchValue({ odometro: null });
    this.onCombustivelChange();
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

  motoristaLabel(m: Motorista) {
    return m.apelido ? `${m.nome} (${m.apelido})` : m.nome;
  }

  private normalizarNomeBusca(valor?: string | null) {
    return String(valor ?? '').trim().toUpperCase();
  }

  proprietarioSelecionadoExigeOdometro() {
    const raw = this.form.getRawValue();
    const veiculo = this.veiculos().find(v => v.id_veiculo === raw.id_veiculo);
    const idProprietario = veiculo?.id_proprietario || raw.id_proprietario;
    const proprietario = veiculo?.proprietario || this.proprietarios().find(p => p.id_proprietario === idProprietario);
    const flag = (proprietario as any)?.odometro_obrigatorio;
    return flag === true || flag === 1 || flag === '1' || String(flag).toLowerCase() === 'true';
  }

  proprietarioSelecionadoUsaPrecoCusto() {
    const raw = this.form.getRawValue();
    const veiculo = this.veiculos().find(v => v.id_veiculo === raw.id_veiculo);
    const idProprietario = veiculo?.id_proprietario || raw.id_proprietario;
    const proprietario = veiculo?.proprietario || this.proprietarios().find(p => p.id_proprietario === idProprietario);
    const flag = (proprietario as any)?.preco_custo_automatico;
    return flag === true || flag === 1 || flag === '1' || String(flag).toLowerCase() === 'true';
  }

  private odometroEstaPreenchido(valor: unknown) {
    return valor !== null && valor !== undefined && String(valor).trim() !== '';
  }

  onCombustivelChange() {
    const tipo = this.form.value.tipo_combustivel;
    if (!tipo || this.isEdit()) return;
    const local = this.form.getRawValue().local || this.auth.getGaragem() || this.auth.getFiliaisAcesso()[0] || 'Matriz';

    if (this.proprietarioSelecionadoUsaPrecoCusto()) {
      this.api.getPrecoCustoAutomatico(tipo, local).subscribe({
        next: v => {
          this.form.patchValue({ valor_por_litro: v?.valor ?? 0 } as any);
          this.calcTotal();
        },
        error: (err) => {
          this.form.patchValue({ valor_por_litro: 0 } as any);
          this.calcTotal();
          const msg = err?.error?.errors?.valor_por_litro?.[0]
            ?? `Não foi possível calcular o preço de custo automático para ${tipo} em ${local}.`;
          this.toastr.warning(msg);
        }
      });
      return;
    }

    this.api.getValorAtual(tipo, local).subscribe({
      next: v => {
        if (v) {
          this.form.patchValue({ valor_por_litro: v.valor } as any);
        } else {
          this.form.patchValue({ valor_por_litro: 0 } as any);
          this.toastr.warning(`Nenhum preço cadastrado para ${tipo} em ${local}.`);
        }
        this.calcTotal();
      },
      error: () => {
        this.form.patchValue({ valor_por_litro: 0 } as any);
        this.calcTotal();
      }
    });
  }

  calcTotal() {
    const qtd = this.form.value.quantidade_litros ?? 0;
    const vl = (this.form.getRawValue() as any).valor_por_litro ?? 0;
    const totalComCentavos = Math.round(((qtd * vl) + Number.EPSILON) * 100) / 100;
    const total = Math.floor(totalComCentavos + 0.5);
    this.form.patchValue({ valor_total: total } as any);
  }

  fetchUltimoOdometroVeiculo(idVeiculo: string, fallbackOdometro: number | null = null) {
    this.api.getAbastecimentos({ id_veiculo: idVeiculo, per_page: 500 }).subscribe({
      next: (r) => {
        const odometrosAnteriores = (r.data ?? [])
          .filter((a: any) => !this.isEdit() || a.id_abastecimento !== this.id)
          .map((a: any) => a.odometro)
          .filter((v: any) => v !== null && v !== undefined)
          .map((v: any) => Number(v));
        const ultimoDoAbastecimento = odometrosAnteriores.length ? Math.max(...odometrosAnteriores) : null;
        const candidatos = [ultimoDoAbastecimento, this.isEdit() ? null : fallbackOdometro]
          .filter((v) => v !== null && v !== undefined)
          .map((v) => Number(v));
        const ultimo = candidatos.length ? Math.max(...candidatos) : null;
        this.ultimoOdometroReferencia.set(ultimo);
        if (!this.isEdit() && ultimo !== null) {
          this.form.patchValue({ odometro: ultimo + 1 });
        }
      },
      error: () => {
        const ultimo = this.isEdit() ? null : fallbackOdometro;
        this.ultimoOdometroReferencia.set(ultimo);
        if (!this.isEdit() && ultimo !== null) {
          this.form.patchValue({ odometro: ultimo + 1 });
        }
      },
    });
  }

  onSubmit() {
    if (this.uploadingBomba()) {
      this.toastr.warning('Aguarde o upload da imagem da bomba terminar.');
      return;
    }

    if (!this.resolveImageUrl(this.form.getRawValue().bomba)) {
      this.form.get('bomba')?.markAsTouched();
      this.toastr.error('Anexe a imagem da bomba antes de salvar o abastecimento.');
      return;
    }

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.toastr.warning('Preencha todos os campos obrigatórios.');
      return;
    }
    if (!this.isEdit() && !this.auth.canCreateOperationalRecords()) {
      this.toastr.error('Perfil somente visualização: sem permissão para criar abastecimentos');
      return;
    }

    const proprietarioSelecionado = this.proprietarios().find(p => p.id_proprietario === this.form.value.id_proprietario);
    if ((proprietarioSelecionado?.status ?? '').trim().toLowerCase() === 'bloqueado') {
      const detalhe = proprietarioSelecionado?.observacao ? ` Motivo: ${proprietarioSelecionado.observacao}` : '';
      this.toastr.error(`Proprietário bloqueado. Não é possível registrar abastecimento.${detalhe}`);
      return;
    }

    const odometroInformado = this.form.getRawValue().odometro;
    const ultimoOdometro = this.ultimoOdometroReferencia();
    if (ultimoOdometro !== null && !this.odometroEstaPreenchido(odometroInformado)) {
      this.toastr.error(`Odômetro é obrigatório para esta placa porque já existe abastecimento anterior. Próximo mínimo: ${ultimoOdometro + 1} km.`);
      return;
    }

    if (this.proprietarioSelecionadoExigeOdometro() && !this.odometroEstaPreenchido(odometroInformado)) {
      this.toastr.error('Odômetro é obrigatório para este proprietário.');
      return;
    }

    if (
      odometroInformado !== null &&
      odometroInformado !== undefined &&
      ultimoOdometro !== null &&
      Number(odometroInformado) <= ultimoOdometro
    ) {
      this.toastr.error(`Odômetro inválido. Informe um valor maior que ${ultimoOdometro} km. Próximo mínimo: ${ultimoOdometro + 1} km.`);
      return;
    }

    if (this.canSeeAnalysisFeedback() && this.hasOcrWarnings()) {
      this.toastr.warning(`${this.analysisPanelTitle()} encontrou possíveis inconsistências. Revise os avisos antes de confirmar.`);
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
    this.motoristas.set([]);
    this.loadVeiculos();
    this.veiculoBusca.set('');
    this.motoristaBusca.set('');
  }

  selectProprietario(p: Proprietario) {
    if ((p.status ?? '').trim().toLowerCase() === 'bloqueado') {
      const detalhe = p.observacao ? `\nMotivo: ${p.observacao}` : '';
      this.toastr.error(`Proprietário bloqueado. Não é possível registrar abastecimento.${detalhe}`);
      this.showProprietariosDropdown.set(false);
      return;
    }
    this.proprietarioBusca.set(p.nome);
    this.form.patchValue({ id_proprietario: p.id_proprietario, nome_proprietario: p.nome, id_veiculo: '', id_motorista: '' });
    this.showProprietariosDropdown.set(false);
    this.veiculoBusca.set('');
    this.motoristaBusca.set('');
    this.onProprietarioChange();
  }

  closeProprietariosDropdown() {
    setTimeout(() => this.showProprietariosDropdown.set(false), 120);
  }

  onVeiculoBuscaChange(event: Event) {
    const term = (event.target as HTMLInputElement).value;
    this.veiculoBusca.set(term);
    this.showVeiculosDropdown.set(true);
    this.form.patchValue({ id_veiculo: '', id_proprietario: '', nome_proprietario: '', id_motorista: '', nome_motorista: '' });
    this.proprietarioBusca.set('');
    this.motoristas.set([]);
    this.motoristaBusca.set('');
    this.ultimoOdometroReferencia.set(null);
    this.form.patchValue({ odometro: null });
  }

  selectVeiculo(v: Veiculo) {
    this.veiculoBusca.set(`${v.placa} — ${v.modelo ?? 'Sem modelo'}`);
    const proprietario = v.proprietario || this.proprietarios().find(p => p.id_proprietario === v.id_proprietario);
    this.proprietarioBusca.set(proprietario?.nome ?? '');
    this.form.patchValue({
      id_veiculo: v.id_veiculo,
      id_proprietario: v.id_proprietario,
      nome_proprietario: proprietario?.nome ?? '',
      id_motorista: '',
      nome_motorista: ''
    });
    this.motoristaBusca.set('');
    if ((proprietario?.status ?? '').trim().toLowerCase() === 'bloqueado') {
      const detalhe = proprietario?.observacao ? `\nMotivo: ${proprietario.observacao}` : '';
      this.toastr.error(`Proprietário bloqueado. Não é possível registrar abastecimento.${detalhe}`);
    }
    if (v.id_proprietario) {
      this.api.getMotoristassByProprietario(v.id_proprietario).subscribe(m => this.motoristas.set(m));
    }
    this.showVeiculosDropdown.set(false);
    this.onVeiculoChange();
  }

  closeVeiculosDropdown() {
    setTimeout(() => this.showVeiculosDropdown.set(false), 120);
  }

  onMotoristaBuscaChange(event: Event) {
    const term = (event.target as HTMLInputElement).value;
    this.motoristaBusca.set(term);
    this.showMotoristasDropdown.set(true);
    this.form.patchValue({ id_motorista: '', nome_motorista: '' });
  }

  selectMotorista(m: Motorista) {
    this.motoristaBusca.set(this.motoristaLabel(m));
    this.form.patchValue({ id_motorista: m.id_motorista, nome_motorista: m.nome });
    this.showMotoristasDropdown.set(false);
  }

  closeMotoristasDropdown() {
    setTimeout(() => this.showMotoristasDropdown.set(false), 120);
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
      celular: this.novoProprietario.celular || '',
      local: this.auth.getGaragem() || undefined
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
    this.novoVeiculo = {
      placa: '',
      marca: '',
      modelo: '',
      ano: '',
      tipo_combustivel: this.tiposCombustivel[0] ?? this.defaultTipoCombustivel,
      numero_chassi: ''
    };
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
      id_proprietario: idProprietario,
      local: this.auth.getGaragem() || undefined
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

  async onUploadFotoOdometro(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    await this.refreshAnalysisConfig();
    if (this.shouldRunAnalysisOnCurrentRecord() && !this.useAiAnalysis()) {
      this.runOcrVerification(file, 'odometro');
    }
    this.uploadingFotoOdometro.set(true);
    this.api.uploadToDrive(file).subscribe({
      next: (res) => {
        const url = res?.file?.downloadUrl || res?.file?.webViewLink || '';
        this.form.patchValue({ foto_odometro: url });
        this.uploadingFotoOdometro.set(false);
        if (this.shouldRunAnalysisOnCurrentRecord() && this.useAiAnalysis()) {
          this.runAiVerification(url, 'odometro');
        }
        this.toastr.success('Foto do hodômetro enviada');
      },
      error: (err) => {
        this.toastr.error(err.error?.message ?? 'Erro no upload da foto do hodômetro');
        this.uploadingFotoOdometro.set(false);
      }
    });
  }

  async onUploadBomba(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    await this.refreshAnalysisConfig();
    if (this.shouldRunAnalysisOnCurrentRecord() && !this.useAiAnalysis()) {
      this.runOcrVerification(file, 'bomba');
    }
    this.uploadingBomba.set(true);
    this.api.uploadToDrive(file).subscribe({
      next: (res) => {
        const url = res?.file?.downloadUrl || res?.file?.webViewLink || '';
        this.form.patchValue({ bomba: url });
        this.uploadingBomba.set(false);
        if (this.shouldRunAnalysisOnCurrentRecord() && this.useAiAnalysis()) {
          this.runAiVerification(url, 'bomba');
        }
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
    let normalized = String(url).trim();
    if (!normalized) return null;

    if (normalized.includes('drive.google.com/uc?id=')) {
      const match = normalized.match(/id=([^&]+)/);
      if (match && match[1]) {
        normalized = `https://drive.google.com/thumbnail?id=${match[1]}&sz=w1000`;
      }
    }

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

  private runOcrVerification(file: File, kind: 'odometro' | 'bomba') {
    const raw = this.form.getRawValue() as any;
    const expected = {
      odometro: raw.odometro,
      quantidadeLitros: raw.quantidade_litros,
      valorPorLitro: raw.valor_por_litro,
      valorTotal: raw.valor_total,
    };

    if (kind === 'odometro') {
      this.analyzingFotoOdometro.set(true);
      this.ocrFotoOdometro.set(null);
    } else {
      this.analyzingBomba.set(true);
      this.ocrBomba.set(null);
    }

    this.ocrVerifier.verifyImage(file, kind, expected)
      .then((result) => {
        if (kind === 'odometro') {
          this.ocrFotoOdometro.set(result);
        } else {
          this.ocrBomba.set(result);
        }

        if (result.checks.some((check) => check.severity === 'warning')) {
          this.form.patchValue({ status: 'Inconsistente' });
          if (this.canSeeAnalysisFeedback()) {
            this.toastr.warning('OCR encontrou possível divergência no anexo.');
          }
        }
      })
      .catch(() => {
        if (this.canSeeAnalysisFeedback()) {
          this.toastr.warning('Não foi possível ler OCR desta imagem. Confira o lançamento manualmente.');
        }
      })
      .finally(() => {
        if (kind === 'odometro') {
          this.analyzingFotoOdometro.set(false);
        } else {
          this.analyzingBomba.set(false);
        }
      });
  }

  private shouldRunAnalysisOnCurrentRecord(): boolean {
    return !this.isEdit();
  }

  private runAiVerification(imageUrl: string, kind: 'odometro' | 'bomba') {
    if (!imageUrl) {
      if (this.canSeeAnalysisFeedback()) {
        this.toastr.warning('Imagem enviada sem URL pública para análise por IA.');
      }
      return;
    }

    const raw = this.form.getRawValue() as any;
    const veiculo = this.veiculos().find(v => v.id_veiculo === raw.id_veiculo);
    const expected = {
      odometro: raw.odometro,
      quantidadeLitros: raw.quantidade_litros,
      valorPorLitro: raw.valor_por_litro,
      valorTotal: raw.valor_total,
      placa: veiculo?.placa ?? '',
    };

    if (kind === 'odometro') {
      this.analyzingFotoOdometro.set(true);
      this.ocrFotoOdometro.set(null);
    } else {
      this.analyzingBomba.set(true);
      this.ocrBomba.set(null);
    }

    this.api.analisarComprovante({
      image_url: imageUrl,
      kind,
      expected,
      ai_orientation: this.aiOrientation(),
    }).subscribe({
      next: (result: OcrVerificationResult) => {
        if (kind === 'odometro') {
          this.ocrFotoOdometro.set(result);
        } else {
          this.ocrBomba.set(result);
        }

        if ((result.checks ?? []).some((check) => check.severity === 'warning')) {
          this.form.patchValue({ status: 'Inconsistente' });
          if (this.canSeeAnalysisFeedback()) {
            this.toastr.warning('IA encontrou possível divergência no anexo. O status da imagem foi marcado como Inconsistente.');
          }
        }
      },
      error: (err) => {
        if (this.canSeeAnalysisFeedback()) {
          this.toastr.warning(err.error?.message ?? 'Não foi possível analisar a imagem com IA.');
        }
      },
      complete: () => {
        if (kind === 'odometro') {
          this.analyzingFotoOdometro.set(false);
        } else {
          this.analyzingBomba.set(false);
        }
      },
    });
  }

  private loadAnalysisConfig() {
    this.api.getAbastecimentoAnaliseConfig().subscribe({
      next: res => this.applyAnalysisConfig(res),
      error: () => {}
    });
  }

  private async refreshAnalysisConfig() {
    try {
      const res = await firstValueFrom(this.api.getAbastecimentoAnaliseConfig());
      this.applyAnalysisConfig(res);
    } catch (_) {
      // Sem internet: usa a ultima configuracao salva localmente.
    }
  }

  private applyAnalysisConfig(res: { analysis_engine?: 'ai' | 'ocr'; use_ai_analysis?: boolean; ai_orientation?: string }) {
    const engine = res?.analysis_engine === 'ocr' ? 'ocr' : 'ai';
    const orientation = (res?.ai_orientation || '').trim();
    this.useAiAnalysis.set(engine === 'ai');
    this.aiOrientation.set(orientation);
    localStorage.setItem('abastecimento-analysis-engine', engine);
    if (orientation) {
      localStorage.setItem(this.aiOrientationKey, orientation);
    }
  }

  private allOcrChecks(): OcrCheck[] {
    return [
      ...(this.ocrFotoOdometro()?.checks ?? []),
      ...(this.ocrBomba()?.checks ?? []),
    ];
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
