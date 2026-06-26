// src/app/features/nova-baixa-comprovante/nova-baixa-comprovante.component.ts
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { ApiService } from '../../core/services/api.service';
import { ToastrService } from 'ngx-toastr';
import { Proprietario } from '../../shared/models';

interface ComprovanteUI {
  id: string;
  arquivo_url: string;
  arquivo_tipo: 'image' | 'pdf';
  valor_extraido: number | null;
  data_pagamento_extraida: string | null;
  remetente_extraido: string | null;
  proprietario_id: string | null;
  proprietario_nome: string | null;
  status: string;
  confianca_ia: number | null;
  dados_ia: any;
  grupo_chave: string;
}

interface GrupoState {
  proprietario_id: string | null;
  proprietario_nome: string | null;
  pendentes: any[];
  carregandoPendentes: boolean;
  selecionados: Set<string>;
  busca: string;
  mostrarOpcoes: boolean;
  salvarAlias: boolean;
  confirmando: boolean;
  confirmado: boolean;
  formaPagamento: string;
  dataBaixa: string;
  observacao: string;
}

interface GrupoUI extends GrupoState {
  chave: string;
  remetente_extraido: string | null;
  comprovantes: ComprovanteUI[];
}

type Etapa = 'upload' | 'processando' | 'revisando';

function criarGrupoState(proprietarioId: string | null, proprietarioNome: string | null, busca: string): GrupoState {
  return {
    proprietario_id: proprietarioId,
    proprietario_nome: proprietarioNome,
    pendentes: [],
    carregandoPendentes: false,
    selecionados: new Set(),
    busca,
    mostrarOpcoes: false,
    salvarAlias: true,
    confirmando: false,
    confirmado: false,
    formaPagamento: 'PIX',
    dataBaixa: new Date().toISOString().slice(0, 10),
    observacao: '',
  };
}

@Component({
  selector: 'app-nova-baixa-comprovante',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="page">
      <div class="page-header">
        <div>
          <button class="btn-back" (click)="voltar()">← Baixas</button>
          <h1>Nova Baixa por Comprovante</h1>
          <p>Envie comprovantes de pagamento — a IA identifica o valor, data e responsável automaticamente</p>
        </div>
        @if (etapa() === 'revisando') {
          <div class="summary-chips">
            <span class="chip chip-blue">{{ comprovantes().length }} comprovante(s)</span>
            @if (totalExtraido() > 0) {
              <span class="chip chip-green">Total: {{ totalExtraido() | currency:'BRL':'symbol':'1.2-2' }}</span>
            }
            <button class="btn-outline" (click)="reiniciar()">+ Novos comprovantes</button>
          </div>
        }
      </div>

      <!-- ETAPA: UPLOAD -->
      @if (etapa() === 'upload' || etapa() === 'processando') {
        <div class="upload-card">
          <div
            class="drop-zone"
            [class.drag-over]="isDragOver()"
            [class.disabled]="etapa() === 'processando'"
            (dragover)="onDragOver($event)"
            (dragleave)="onDragLeave()"
            (drop)="onDrop($event)"
            (click)="etapa() !== 'processando' && fileInput.click()"
          >
            <input #fileInput type="file" accept="image/*,application/pdf" multiple hidden (change)="onFileSelecionado($event)" />
            @if (etapa() === 'processando') {
              <div class="drop-processing">
                <div class="spinner-lg"></div>
                <strong>Processando {{ processandoAtual() + 1 }} de {{ arquivos().length }}</strong>
                <span>Aguarde — a IA está analisando o comprovante...</span>
              </div>
            } @else {
              <div class="drop-idle">
                <span class="drop-icon">📎</span>
                <strong>Arraste comprovantes aqui</strong>
                <span>ou clique para selecionar · Imagem ou PDF</span>
              </div>
            }
          </div>

          @if (arquivos().length > 0) {
            <div class="file-list">
              <div class="file-list-header">
                <span>{{ arquivos().length }} arquivo(s)</span>
                @if (etapa() !== 'processando') {
                  <button class="btn-sm" (click)="limparArquivos()">Limpar</button>
                }
              </div>
              @for (f of arquivos(); track f.name; let i = $index) {
                <div class="file-item" [class.file-done]="i < processandoAtual()">
                  <span class="file-icon">{{ f.type.includes('pdf') ? '📄' : '🖼️' }}</span>
                  <span class="file-name">{{ f.name }}</span>
                  <span class="file-size">{{ formatarTamanho(f.size) }}</span>
                  @if (i < processandoAtual()) {
                    <span class="file-status ok">✓</span>
                  } @else if (i === processandoAtual() && etapa() === 'processando') {
                    <span class="file-status spin"><span class="spinner-xs"></span></span>
                  } @else {
                    <span class="file-status">○</span>
                  }
                </div>
              }
            </div>
            @if (etapa() !== 'processando') {
              <button class="btn-primary btn-full" (click)="processarComprovantes()">
                Analisar {{ arquivos().length }} comprovante(s) com IA
              </button>
            }
          }
        </div>
      }

      <!-- ETAPA: REVISANDO -->
      @if (etapa() === 'revisando') {
        @for (grupo of listaGrupos(); track grupo.chave) {
          <div class="grupo-card" [class.grupo-confirmado]="grupo.confirmado">
            <div class="grupo-header">
              <div class="grupo-comprovantes">
                @for (c of grupo.comprovantes; track c.id) {
                  <button class="comp-thumb" type="button" (click)="abrirPreview(c)">
                    @if (c.arquivo_tipo === 'image') {
                      <img [src]="c.arquivo_url" alt="comprovante" loading="lazy" />
                    } @else {
                      @if (pdfThumb(c.arquivo_url); as thumb) {
                        <img [src]="thumb" alt="PDF" loading="lazy" />
                      } @else {
                        <span class="pdf-icon">📄</span>
                      }
                      <span class="pdf-chip">PDF</span>
                    }
                  </button>
                }
              </div>

              <div class="grupo-info">
                @if (grupo.proprietario_id) {
                  <div class="prop-nome">{{ grupo.proprietario_nome }}</div>
                } @else {
                  <div class="prop-desconhecido">
                    <span class="badge-warn">Proprietário não identificado</span>
                    @if (grupo.remetente_extraido) {
                      <span class="remetente-hint">IA leu: "{{ grupo.remetente_extraido }}"</span>
                    }
                    <div class="autocomplete-field">
                      <input
                        type="text"
                        [value]="grupo.busca"
                        placeholder="Pesquisar proprietário cadastrado..."
                        (input)="onBusca(grupo.chave, $event)"
                        (focus)="setOpcoes(grupo.chave, true)"
                        (blur)="setOpcoes(grupo.chave, false)"
                      />
                      @if (grupo.mostrarOpcoes) {
                        @let opcoes = filtrarProprietarios(grupo.busca);
                        @if (opcoes.length > 0) {
                          <div class="autocomplete-list">
                            @for (p of opcoes; track p.id_proprietario) {
                              <button type="button" class="autocomplete-item" (mousedown)="atribuirProprietario(grupo.chave, p)">
                                {{ p.nome }}
                              </button>
                            }
                          </div>
                        }
                      }
                    </div>
                    <label class="checkbox-row">
                      <input type="checkbox" [checked]="grupo.salvarAlias" (change)="patch(grupo.chave, {salvarAlias: $any($event.target).checked})" />
                      Lembrar este nome para futuros comprovantes
                    </label>
                  </div>
                }

                <div class="grupo-meta">
                  @if (valorGrupo(grupo) > 0) {
                    <span class="meta-tag val-green">{{ valorGrupo(grupo) | currency:'BRL':'symbol':'1.2-2' }}</span>
                  }
                  @if (dataGrupo(grupo)) {
                    <span class="meta-tag">{{ dataGrupo(grupo) | date:'dd/MM/yyyy' }}</span>
                  }
                  @if (grupo.comprovantes[0]?.confianca_ia != null) {
                    <span class="meta-tag" [class.low-conf]="(grupo.comprovantes[0].confianca_ia ?? 0) < 0.7">
                      IA {{ ((grupo.comprovantes[0].confianca_ia ?? 0) * 100) | number:'1.0-0' }}%
                    </span>
                  }
                  @if (grupo.confirmado) {
                    <span class="badge-ok">Baixa aplicada ✓</span>
                  }
                </div>
              </div>
            </div>

            <!-- Pendentes -->
            @if (grupo.proprietario_id && !grupo.confirmado) {
              <div class="pendentes-section">
                <div class="pend-header">
                  <h4>Abastecimentos pendentes
                    @if (!grupo.carregandoPendentes) {
                      <span class="badge-count">{{ grupo.pendentes.length }}</span>
                    }
                  </h4>
                  <div class="row-btns">
                    <button class="btn-sm" (click)="selecionarTodos(grupo.chave, grupo)">Todos</button>
                    <button class="btn-sm" (click)="limparSelecao(grupo.chave)">Limpar</button>
                  </div>
                </div>

                @if (grupo.carregandoPendentes) {
                  <div class="loading-row"><div class="spinner-sm"></div> Carregando...</div>
                } @else if (grupo.pendentes.length === 0) {
                  <div class="empty-pend">Nenhum abastecimento pendente para este proprietário.</div>
                } @else {
                  <div class="pendente-list">
                    @for (a of grupo.pendentes; track a.id_abastecimento) {
                      <div class="pendente-item" [class.selected]="grupo.selecionados.has(a.id_abastecimento)"
                           (click)="togglePendente(grupo.chave, grupo, a.id_abastecimento)">
                        <span class="pend-check">{{ grupo.selecionados.has(a.id_abastecimento) ? '☑' : '☐' }}</span>
                        <div class="pend-info">
                          <div class="pend-top">
                            <span class="placa-badge">{{ a.veiculo?.placa ?? '—' }}</span>
                            <span class="pend-date">{{ a.data | date:'dd/MM/yy' }}</span>
                          </div>
                          <div class="pend-bottom">
                            <span>{{ a.nome_motorista ?? '—' }}</span>
                            <span class="val-green">{{ a.valor_total | currency:'BRL':'symbol':'1.2-2' }}</span>
                          </div>
                        </div>
                      </div>
                    }
                  </div>

                  <div class="selecao-info">
                    {{ grupo.selecionados.size }} selecionado(s) ·
                    <strong class="val-green">{{ totalSelecionado(grupo) | currency:'BRL':'symbol':'1.2-2' }}</strong>
                  </div>

                  <div class="baixa-form">
                    <div class="field-s">
                      <label>Forma pgto</label>
                      <select [value]="grupo.formaPagamento" (change)="patch(grupo.chave, {formaPagamento: $any($event.target).value})">
                        <option value="PIX">PIX</option>
                        <option value="Transferência">Transferência</option>
                        <option value="TED">TED</option>
                        <option value="DOC">DOC</option>
                        <option value="Dinheiro">Dinheiro</option>
                        <option value="Cheque">Cheque</option>
                        <option value="Boleto">Boleto</option>
                      </select>
                    </div>
                    <div class="field-s">
                      <label>Data baixa</label>
                      <input type="date" [value]="grupo.dataBaixa" (change)="patch(grupo.chave, {dataBaixa: $any($event.target).value})" />
                    </div>
                    <div class="field-s field-grow">
                      <label>Observação</label>
                      <input type="text" [value]="grupo.observacao" (input)="patch(grupo.chave, {observacao: $any($event.target).value})" placeholder="Opcional..." />
                    </div>
                  </div>

                  <button
                    class="btn-confirm"
                    [disabled]="grupo.selecionados.size === 0 || grupo.confirmando"
                    (click)="confirmarBaixa(grupo)"
                  >
                    @if (grupo.confirmando) {
                      <span class="spinner"></span> Aplicando baixa...
                    } @else {
                      Confirmar Baixa ({{ grupo.selecionados.size }}) · {{ totalSelecionado(grupo) | currency:'BRL':'symbol':'1.2-2' }}
                    }
                  </button>
                }
              </div>
            }
          </div>
        }

        @if (listaGrupos().length === 0) {
          <div class="empty-state">Nenhum comprovante processado.</div>
        }
      }

      <!-- Preview lightbox -->
      @if (previewUrl()) {
        <div class="overlay" (click)="fecharPreview()">
          <div class="preview-modal" (click)="$event.stopPropagation()">
            <div class="preview-header">
              <span>{{ previewNome() }}</span>
              <button class="btn-close-preview" (click)="fecharPreview()">Fechar</button>
            </div>
            @if (previewTipo() === 'image') {
              <img [src]="previewUrl()" alt="Comprovante" />
            } @else {
              @if (previewSafeUrl(); as safeUrl) {
                <iframe [src]="safeUrl" title="PDF"></iframe>
              }
            }
            <a class="btn-ext" [href]="previewUrl()" target="_blank" rel="noopener">Abrir em nova aba</a>
          </div>
        </div>
      }
    </div>
  `,
  styles: [`
    * { box-sizing: border-box; }
    .page { padding: 28px; font-family: 'Inter', sans-serif; color: #e2e8f0; max-width: 1060px; }
    .page-header { margin-bottom: 20px; display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
    .btn-back { background: none; border: none; color: #64748b; cursor: pointer; font-size: 12px; padding: 0 0 4px; display: block; }
    .btn-back:hover { color: #38bdf8; }
    .page-header h1 { font-size: 22px; font-weight: 700; color: #f8fafc; margin: 0; }
    .page-header p { font-size: 12px; color: #64748b; margin-top: 4px; }
    .summary-chips { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
    .chip { padding: 5px 12px; border-radius: 20px; font-size: 12px; font-weight: 700; }
    .chip-blue { background: #0ea5e920; color: #38bdf8; border: 1px solid #0ea5e930; }
    .chip-green { background: #4ade8020; color: #4ade80; border: 1px solid #4ade8030; }
    .btn-outline { background: transparent; border: 1px solid #1e2d4a; color: #94a3b8; padding: 5px 12px; border-radius: 8px; font-size: 12px; cursor: pointer; }
    .btn-outline:hover { border-color: #38bdf8; color: #38bdf8; }

    .upload-card { background: #0d1427; border: 1px solid #1e2d4a; border-radius: 14px; padding: 20px; margin-bottom: 20px; }
    .drop-zone { border: 2px dashed #1e2d4a; border-radius: 12px; padding: 40px 24px; text-align: center; cursor: pointer; transition: all 0.2s; min-height: 150px; display: flex; align-items: center; justify-content: center; }
    .drop-zone:hover:not(.disabled) { border-color: #38bdf8; background: #0ea5e908; }
    .drop-zone.drag-over { border-color: #38bdf8; background: #0ea5e912; }
    .drop-zone.disabled { cursor: default; }
    .drop-idle { display: flex; flex-direction: column; gap: 6px; align-items: center; }
    .drop-icon { font-size: 36px; }
    .drop-idle strong { color: #f8fafc; font-size: 15px; }
    .drop-idle span { color: #64748b; font-size: 12px; }
    .drop-processing { display: flex; flex-direction: column; gap: 8px; align-items: center; color: #94a3b8; }
    .drop-processing strong { color: #f8fafc; font-size: 14px; }
    .drop-processing span { font-size: 12px; }

    .file-list { margin-top: 14px; }
    .file-list-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; font-size: 12px; color: #94a3b8; }
    .file-item { display: flex; align-items: center; gap: 8px; padding: 7px 10px; border: 1px solid #1e2d4a; border-radius: 8px; margin-bottom: 5px; font-size: 12px; }
    .file-item.file-done { border-color: #4ade8030; background: #4ade8008; }
    .file-icon { font-size: 15px; }
    .file-name { flex: 1; color: #e2e8f0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .file-size { color: #64748b; white-space: nowrap; }
    .file-status { width: 20px; text-align: center; color: #334155; }
    .file-status.ok { color: #4ade80; font-weight: 700; }
    .file-status.spin { display: flex; justify-content: center; }
    .btn-full { width: 100%; margin-top: 14px; }
    .btn-sm { background: transparent; border: 1px solid #1e2d4a; color: #64748b; padding: 4px 10px; border-radius: 5px; font-size: 11px; cursor: pointer; }
    .btn-sm:hover { border-color: #94a3b8; color: #94a3b8; }
    .btn-primary { background: linear-gradient(135deg,#0ea5e9,#6366f1); border: none; border-radius: 8px; padding: 11px 18px; color: #fff; font-size: 13px; font-weight: 600; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; gap: 8px; }
    .btn-primary:disabled { opacity: 0.45; cursor: not-allowed; }

    .grupo-card { background: #0d1427; border: 1px solid #1e2d4a; border-radius: 14px; margin-bottom: 16px; overflow: hidden; }
    .grupo-card.grupo-confirmado { border-color: #4ade8050; }
    .grupo-header { display: flex; gap: 16px; padding: 16px; align-items: flex-start; }
    .grupo-comprovantes { display: flex; gap: 8px; flex-shrink: 0; }
    .comp-thumb { width: 76px; height: 76px; border: 1px solid #1e2d4a; border-radius: 8px; background: #080e1c; cursor: pointer; overflow: hidden; position: relative; padding: 0; }
    .comp-thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .comp-thumb:hover { border-color: #38bdf8; }
    .pdf-icon { display: flex; align-items: center; justify-content: center; width: 100%; height: 100%; font-size: 26px; }
    .pdf-chip { position: absolute; bottom: 3px; right: 3px; background: #0f172a; border: 1px solid #334155; color: #f8fafc; border-radius: 999px; padding: 1px 5px; font-size: 8px; font-weight: 800; }
    .grupo-info { flex: 1; min-width: 0; }
    .prop-nome { font-size: 16px; font-weight: 700; color: #f8fafc; margin-bottom: 8px; }
    .prop-desconhecido { margin-bottom: 8px; }
    .badge-warn { display: inline-block; background: #78350f30; border: 1px solid #d9770640; color: #fbbf24; padding: 3px 10px; border-radius: 999px; font-size: 11px; font-weight: 700; margin-bottom: 6px; }
    .badge-ok { display: inline-block; background: #4ade8020; border: 1px solid #4ade8040; color: #4ade80; padding: 3px 10px; border-radius: 999px; font-size: 11px; font-weight: 700; }
    .remetente-hint { display: block; color: #64748b; font-size: 11px; margin-bottom: 8px; font-style: italic; }

    .autocomplete-field { position: relative; max-width: 380px; margin-bottom: 8px; }
    .autocomplete-field input { width: 100%; background: #0a0f1e; border: 1px solid #1e2d4a; border-radius: 7px; padding: 8px 10px; color: #e2e8f0; font-size: 12px; outline: none; }
    .autocomplete-field input:focus { border-color: #38bdf8; }
    .autocomplete-list { position: absolute; z-index: 30; top: calc(100% + 3px); left: 0; right: 0; max-height: 200px; overflow: auto; background: #0a0f1e; border: 1px solid #1e2d4a; border-radius: 8px; box-shadow: 0 16px 40px rgba(2,6,23,0.4); padding: 4px; }
    .autocomplete-item { width: 100%; border: none; background: transparent; color: #e2e8f0; text-align: left; padding: 8px 9px; border-radius: 6px; font-size: 12px; cursor: pointer; }
    .autocomplete-item:hover { background: #1e2d4a; }

    .checkbox-row { display: flex; align-items: center; gap: 6px; font-size: 11px; color: #94a3b8; cursor: pointer; user-select: none; }
    .checkbox-row input { accent-color: #38bdf8; }

    .grupo-meta { display: flex; flex-wrap: wrap; gap: 7px; align-items: center; margin-top: 8px; }
    .meta-tag { background: #0a0f1e; border: 1px solid #1e2d4a; border-radius: 6px; padding: 3px 9px; font-size: 11px; color: #94a3b8; }
    .meta-tag.val-green { color: #4ade80; border-color: #4ade8030; background: #4ade8008; }
    .meta-tag.low-conf { color: #f59e0b; border-color: #f59e0b30; }
    .val-green { color: #4ade80; }

    .pendentes-section { border-top: 1px solid #1e2d4a; padding: 14px 16px; }
    .pend-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
    .pend-header h4 { margin: 0; color: #f8fafc; font-size: 13px; display: flex; gap: 8px; align-items: center; }
    .badge-count { background: #0ea5e920; color: #38bdf8; padding: 2px 8px; border-radius: 10px; font-size: 11px; }
    .row-btns { display: flex; gap: 6px; }
    .loading-row { display: flex; align-items: center; gap: 8px; color: #64748b; font-size: 12px; padding: 6px 0; }
    .empty-pend { color: #64748b; font-size: 12px; padding: 6px 0; }

    .pendente-list { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 6px; max-height: 260px; overflow: auto; margin-bottom: 10px; }
    .pendente-item { border: 1px solid #1e2d4a; border-radius: 8px; padding: 8px 10px; cursor: pointer; transition: all 0.15s; display: flex; gap: 8px; }
    .pendente-item:hover { border-color: #0ea5e9; }
    .pendente-item.selected { border-color: #4ade80; background: #4ade8010; }
    .pend-check { font-size: 16px; color: #64748b; line-height: 1; padding-top: 1px; }
    .pendente-item.selected .pend-check { color: #4ade80; }
    .pend-info { flex: 1; min-width: 0; }
    .pend-top { display: flex; justify-content: space-between; margin-bottom: 3px; }
    .placa-badge { background: #1e2d4a; color: #38bdf8; padding: 2px 6px; border-radius: 4px; font-size: 10px; font-weight: 700; font-family: monospace; }
    .pend-date { font-size: 10px; color: #64748b; }
    .pend-bottom { display: flex; justify-content: space-between; font-size: 11px; color: #94a3b8; }

    .selecao-info { font-size: 11px; color: #94a3b8; margin-bottom: 10px; }
    .baixa-form { display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 12px; }
    .field-s { display: flex; flex-direction: column; gap: 4px; }
    .field-grow { flex: 1; min-width: 180px; }
    .field-s label { font-size: 10px; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: 0.4px; }
    .field-s select, .field-s input { background: #0a0f1e; border: 1px solid #1e2d4a; border-radius: 7px; padding: 7px 10px; color: #e2e8f0; font-size: 12px; outline: none; }
    .btn-confirm { background: linear-gradient(135deg,#4ade80,#22c55e); border: none; border-radius: 8px; padding: 10px 18px; color: #0a0f1e; font-size: 13px; font-weight: 700; cursor: pointer; display: inline-flex; align-items: center; gap: 8px; }
    .btn-confirm:disabled { opacity: 0.45; cursor: not-allowed; }

    .overlay { position: fixed; inset: 0; background: rgba(2,6,23,0.88); display: flex; align-items: center; justify-content: center; z-index: 1100; padding: 20px; }
    .preview-modal { width: min(94vw, 960px); max-height: 92vh; background: #0a0f1e; border: 1px solid #1e2d4a; border-radius: 14px; padding: 14px; display: flex; flex-direction: column; gap: 10px; }
    .preview-header { display: flex; justify-content: space-between; align-items: center; }
    .preview-header span { color: #94a3b8; font-size: 12px; }
    .preview-modal img { width: 100%; max-height: 76vh; object-fit: contain; border-radius: 8px; }
    .preview-modal iframe { width: 100%; height: 76vh; border: 0; border-radius: 8px; background: #fff; }
    .btn-close-preview { background: transparent; border: 1px solid #1e2d4a; color: #94a3b8; padding: 6px 14px; border-radius: 8px; cursor: pointer; font-size: 12px; }
    .btn-ext { align-self: flex-end; color: #38bdf8; text-decoration: none; font-size: 12px; border: 1px solid #1e2d4a; border-radius: 8px; padding: 6px 12px; background: #0f172a; }
    .empty-state { text-align: center; padding: 40px; color: #64748b; }

    .spinner-lg { width: 28px; height: 28px; border: 3px solid #1e2d4a; border-top-color: #0ea5e9; border-radius: 50%; animation: spin .8s linear infinite; }
    .spinner-sm { width: 16px; height: 16px; border: 2px solid #1e2d4a; border-top-color: #0ea5e9; border-radius: 50%; animation: spin .8s linear infinite; }
    .spinner-xs { display: inline-block; width: 12px; height: 12px; border: 2px solid rgba(255,255,255,.3); border-top-color: #38bdf8; border-radius: 50%; animation: spin .7s linear infinite; }
    .spinner { width: 13px; height: 13px; border: 2px solid rgba(255,255,255,.3); border-top-color: #fff; border-radius: 50%; animation: spin .7s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }
    @media (max-width: 640px) {
      .page { padding: 14px; }
      .grupo-header { flex-direction: column; }
      .pendente-list { grid-template-columns: 1fr; }
      .baixa-form { flex-direction: column; }
    }
  `]
})
export class NovaBaixaComprovanteComponent implements OnInit {
  private api = inject(ApiService);
  private toastr = inject(ToastrService);
  private router = inject(Router);
  private sanitizer = inject(DomSanitizer);

  etapa = signal<Etapa>('upload');
  arquivos = signal<File[]>([]);
  processandoAtual = signal(0);
  comprovantes = signal<ComprovanteUI[]>([]);
  proprietarios = signal<Proprietario[]>([]);
  isDragOver = signal(false);
  previewUrl = signal('');
  previewTipo = signal<'image' | 'pdf'>('image');
  previewNome = signal('');

  // Mutable group state keyed by group chave
  gruposState = signal<Record<string, GrupoState>>({});

  previewSafeUrl = computed<SafeResourceUrl | null>(() => {
    const url = this.previewUrl();
    return url ? this.sanitizer.bypassSecurityTrustResourceUrl(url) : null;
  });

  totalExtraido = computed(() =>
    this.comprovantes().reduce((s, c) => s + (c.valor_extraido ?? 0), 0)
  );

  // Derived groups (chave is based on original remetente, not proprietario_id)
  private gruposBase = computed<GrupoUI[]>(() => {
    const comps = this.comprovantes();
    const estado = this.gruposState();
    const mapaGrupos = new Map<string, GrupoUI>();

    for (const c of comps) {
      const chave = c.grupo_chave;
      if (!mapaGrupos.has(chave)) {
        const s = estado[chave] ?? criarGrupoState(c.proprietario_id, c.proprietario_nome, c.remetente_extraido ?? '');
        mapaGrupos.set(chave, {
          chave,
          remetente_extraido: c.remetente_extraido,
          comprovantes: [],
          ...s,
        });
      }
      mapaGrupos.get(chave)!.comprovantes.push(c);
    }

    return Array.from(mapaGrupos.values());
  });

  listaGrupos = this.gruposBase;

  ngOnInit() {
    this.api.getProprietariosAll().subscribe(r => {
      this.proprietarios.set(r.data ?? []);
      this.carregarExistentes();
    });
  }

  private carregarExistentes() {
    this.api.listarComprovantes({ per_page: 100 }).subscribe({
      next: (res) => {
        const lista: any[] = res.data ?? [];
        const ativos = lista.filter(r => r.status !== 'aplicado');
        if (!ativos.length) return;

        const processados: ComprovanteUI[] = ativos.map(r => {
          const chave = r.remetente_extraido
            ? `rem:${(r.remetente_extraido as string).toLowerCase().trim()}`
            : `id:${r.id}`;
          return {
            id: r.id,
            arquivo_url: r.arquivo_url,
            arquivo_tipo: r.arquivo_tipo ?? 'image',
            valor_extraido: r.valor_extraido ?? null,
            data_pagamento_extraida: r.data_pagamento_extraida ?? null,
            remetente_extraido: r.remetente_extraido ?? null,
            proprietario_id: r.proprietario_id ?? null,
            proprietario_nome: r.proprietario_nome ?? null,
            status: r.status,
            confianca_ia: r.confianca_ia ?? null,
            dados_ia: r.dados_ia,
            grupo_chave: chave,
          };
        });

        const estadoInicial: Record<string, GrupoState> = {};
        for (const comp of processados) {
          if (!estadoInicial[comp.grupo_chave]) {
            estadoInicial[comp.grupo_chave] = criarGrupoState(
              comp.proprietario_id, comp.proprietario_nome, comp.remetente_extraido ?? ''
            );
          }
        }

        this.comprovantes.set(processados);
        this.gruposState.set(estadoInicial);
        this.etapa.set('revisando');

        for (const [chave, s] of Object.entries(estadoInicial)) {
          if (s.proprietario_id) this.carregarPendentes(chave, s.proprietario_id);
        }
      },
      error: () => {},
    });
  }

  // ── Upload ──────────────────────────────────

  onDragOver(e: DragEvent) { e.preventDefault(); this.isDragOver.set(true); }
  onDragLeave() { this.isDragOver.set(false); }

  onDrop(e: DragEvent) {
    e.preventDefault();
    this.isDragOver.set(false);
    this.adicionarArquivos(Array.from(e.dataTransfer?.files ?? []));
  }

  onFileSelecionado(e: Event) {
    const input = e.target as HTMLInputElement;
    this.adicionarArquivos(Array.from(input.files ?? []));
    input.value = '';
  }

  private adicionarArquivos(files: File[]) {
    const validos = files.filter(f => f.type.startsWith('image/') || f.type === 'application/pdf');
    if (validos.length < files.length) this.toastr.warning('Apenas imagens e PDFs são aceitos.');
    this.arquivos.update(a => [...a, ...validos]);
  }

  limparArquivos() { this.arquivos.set([]); }

  async processarComprovantes() {
    const files = this.arquivos();
    if (!files.length) return;

    this.etapa.set('processando');
    const processados: ComprovanteUI[] = [];
    const estadoInicial: Record<string, GrupoState> = {};

    for (let i = 0; i < files.length; i++) {
      this.processandoAtual.set(i);
      try {
        const r = await this.api.uploadComprovantePagamento(files[i]).toPromise();
        const chave = r.remetente_extraido
          ? `rem:${r.remetente_extraido.toLowerCase().trim()}`
          : `id:${r.id}`;

        const comp: ComprovanteUI = {
          id: r.id,
          arquivo_url: r.arquivo_url,
          arquivo_tipo: r.arquivo_tipo ?? 'image',
          valor_extraido: r.valor_extraido ?? null,
          data_pagamento_extraida: r.data_pagamento_extraida ?? null,
          remetente_extraido: r.remetente_extraido ?? null,
          proprietario_id: r.proprietario_id ?? null,
          proprietario_nome: r.proprietario_nome ?? null,
          status: r.status,
          confianca_ia: r.confianca_ia ?? null,
          dados_ia: r.dados_ia,
          grupo_chave: chave,
        };

        processados.push(comp);

        if (!estadoInicial[chave]) {
          estadoInicial[chave] = criarGrupoState(comp.proprietario_id, comp.proprietario_nome, comp.remetente_extraido ?? '');
        }
      } catch (err: any) {
        this.toastr.error(`Erro em ${files[i].name}: ${err?.error?.message ?? 'erro desconhecido'}`);
      }
    }

    // Merge with existing (deduplicate by id)
    this.comprovantes.update(existing => {
      const existingIds = new Set(existing.map(c => c.id));
      return [...existing, ...processados.filter(c => !existingIds.has(c.id))];
    });
    this.gruposState.update(s => ({ ...s, ...estadoInicial }));
    this.etapa.set('revisando');

    // Load pendentes for groups with known owner
    for (const [chave, s] of Object.entries(estadoInicial)) {
      if (s.proprietario_id) this.carregarPendentes(chave, s.proprietario_id);
    }
  }

  private carregarPendentes(chave: string, proprietarioId: string) {
    this.patch(chave, { carregandoPendentes: true });
    this.api.getAbastecimentosPendenteBaixa({ id_proprietario: proprietarioId, limit: 120 })
      .subscribe({
        next: pendentes => this.patch(chave, { pendentes, carregandoPendentes: false }),
        error: () => this.patch(chave, { carregandoPendentes: false }),
      });
  }

  // ── Group state helpers ──────────────────────

  patch(chave: string, partial: Partial<GrupoState>) {
    this.gruposState.update(s => ({
      ...s,
      [chave]: { ...(s[chave] ?? criarGrupoState(null, null, '')), ...partial }
    }));
  }

  onBusca(chave: string, e: Event) {
    this.patch(chave, { busca: (e.target as HTMLInputElement).value, mostrarOpcoes: true });
  }

  setOpcoes(chave: string, val: boolean) {
    setTimeout(() => this.patch(chave, { mostrarOpcoes: val }), 120);
  }

  atribuirProprietario(chave: string, p: Proprietario) {
    this.patch(chave, {
      proprietario_id: p.id_proprietario,
      proprietario_nome: p.nome,
      busca: p.nome,
      mostrarOpcoes: false,
    });

    // Update comprovantes in this group on backend
    const salvar = (this.gruposState()[chave]?.salvarAlias) ?? true;
    this.comprovantes()
      .filter(c => c.grupo_chave === chave)
      .forEach(c => {
        this.api.atualizarProprietarioComprovante(c.id, {
          proprietario_id: p.id_proprietario,
          salvar_alias: salvar,
        }).subscribe();
      });

    this.carregarPendentes(chave, p.id_proprietario);
  }

  filtrarProprietarios(busca: string): Proprietario[] {
    const t = busca.toLowerCase().trim();
    const all = this.proprietarios();
    if (!t) return all.slice(0, 30);
    return all.filter(p => p.nome.toLowerCase().includes(t)).slice(0, 30);
  }

  selecionarTodos(chave: string, grupo: GrupoUI) {
    this.patch(chave, { selecionados: new Set(grupo.pendentes.map((a: any) => a.id_abastecimento)) });
  }

  limparSelecao(chave: string) {
    this.patch(chave, { selecionados: new Set<string>() });
  }

  togglePendente(chave: string, grupo: GrupoUI, id: string) {
    const s = new Set(grupo.selecionados);
    s.has(id) ? s.delete(id) : s.add(id);
    this.patch(chave, { selecionados: s });
  }

  valorGrupo(grupo: GrupoUI): number {
    return grupo.comprovantes.reduce((s, c) => s + (c.valor_extraido ?? 0), 0);
  }

  dataGrupo(grupo: GrupoUI): string | null {
    return grupo.comprovantes.find(c => c.data_pagamento_extraida)?.data_pagamento_extraida ?? null;
  }

  totalSelecionado(grupo: GrupoUI): number {
    return grupo.pendentes
      .filter((a: any) => grupo.selecionados.has(a.id_abastecimento))
      .reduce((s: number, a: any) => s + this.toNum(a.valor_total), 0);
  }

  async confirmarBaixa(grupo: GrupoUI) {
    if (!grupo.selecionados.size || !grupo.proprietario_id) return;
    this.patch(grupo.chave, { confirmando: true });

    const payload = {
      ids_abastecimentos: Array.from(grupo.selecionados),
      forma_pagamento: grupo.formaPagamento,
      data_baixa: grupo.dataBaixa,
      tipo_despesa: 'Combustível',
      observacao: grupo.observacao || null,
    };

    try {
      await this.api.confirmarBaixaComprovante(grupo.comprovantes[0].id, payload).toPromise();
      this.patch(grupo.chave, { confirmando: false, confirmado: true });
      this.toastr.success(`Baixa aplicada — ${grupo.proprietario_nome}`);
    } catch (err: any) {
      this.patch(grupo.chave, { confirmando: false });
      this.toastr.error(err?.error?.message ?? 'Erro ao confirmar baixa');
    }
  }

  // ── Preview ──────────────────────────────────

  abrirPreview(c: ComprovanteUI) {
    this.previewUrl.set(c.arquivo_url);
    this.previewTipo.set(c.arquivo_tipo === 'pdf' ? 'pdf' : 'image');
    this.previewNome.set(c.remetente_extraido ?? 'Comprovante');
  }

  fecharPreview() { this.previewUrl.set(''); }

  pdfThumb(url: string): string | null {
    try {
      const u = new URL(url);
      if (!u.hostname.endsWith('res.cloudinary.com')) return null;
      const m = '/image/upload/';
      const i = u.pathname.indexOf(m);
      if (i < 0) return null;
      const prefix = u.pathname.slice(0, i + m.length);
      const asset = u.pathname.slice(i + m.length).replace(/\.pdf$/i, '.jpg');
      u.pathname = `${prefix}pg_1/c_fill,h_80,w_80/f_jpg/q_auto/${asset}`;
      return u.toString();
    } catch { return null; }
  }

  // ── Misc ──────────────────────────────────────

  voltar() { this.router.navigate(['/baixa']); }

  reiniciar() {
    this.arquivos.set([]);
    this.processandoAtual.set(0);
    this.etapa.set('upload');
  }

  formatarTamanho(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  private toNum(v: unknown): number {
    const n = parseFloat(String(v ?? '0').replace(',', '.'));
    return isFinite(n) ? n : 0;
  }
}
