// src/app/features/nova-baixa-comprovante/nova-baixa-comprovante.component.ts
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { PdfThumbnailService } from '../../core/services/pdf-thumbnail.service';
import { ToastrService } from 'ngx-toastr';
import { Proprietario } from '../../shared/models';

interface ComprovanteUI {
  id: string;
  arquivo_url: string;
  arquivo_tipo: 'image' | 'pdf';
  valor_extraido: number | null;
  valor_pago_texto?: string | null;
  valores_comprovantes?: number[] | null;
  data_pagamento_extraida: string | null;
  remetente_extraido: string | null;
  identificador_transacao?: string | null;
  proprietario_id: string | null;
  proprietario_nome: string | null;
  status: string;
  confianca_ia: number | null;
  dados_ia: any;
}

interface TerceiroProprietario {
  id_proprietario: string;
  nome: string;
}

interface GrupoState {
  proprietario_id: string | null;
  proprietario_nome: string | null;
  pendentes: any[];
  carregandoPendentes: boolean;
  filtroDataInicio: string;
  filtroDataFim: string;
  selecionados: Set<string>;
  busca: string;
  mostrarOpcoes: boolean;
  terceiros: TerceiroProprietario[];
  buscaTerceiro: string;
  mostrarOpcoesTerceiro: boolean;
  editandoProprietario: boolean;
  salvarAlias: boolean;
  confirmando: boolean;
  confirmado: boolean;
  formaPagamento: string;
  dataPagamento: string;
  dataBaixa: string;
  recebedor: string;
  descricao: string;
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
    filtroDataInicio: '',
    filtroDataFim: '',
    selecionados: new Set(),
    busca,
    mostrarOpcoes: false,
    terceiros: [],
    buscaTerceiro: '',
    mostrarOpcoesTerceiro: false,
    editandoProprietario: false,
    salvarAlias: true,
    confirmando: false,
    confirmado: false,
    formaPagamento: 'PIX',
    dataPagamento: '',
    dataBaixa: new Date().toISOString().slice(0, 10),
    recebedor: 'VIPE TRANSPORTES MULTIMODAIS LTDA',
    descricao: '',
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
        @if (etapa() !== 'processando') {
          <div class="summary-chips">
            @if (etapa() === 'revisando') {
              <span class="chip chip-blue">{{ comprovantes().length }} comprovante(s)</span>
              @if (totalExtraido() > 0) {
                <span class="chip chip-green">Total: {{ totalExtraido() | currency:'BRL':'symbol':'1.2-2' }}</span>
              }
              <button class="btn-outline" (click)="reiniciar()">+ Novos comprovantes</button>
            }
            <button class="btn-outline" (click)="atualizarLista()" title="Buscar comprovantes recebidos (inclui os enviados via API)">↻ Atualizar</button>
            @if (isAdmin()) {
              <label class="toggle-aplicados" title="Mostrar comprovantes já aplicados para poder reverter a baixa">
                <input type="checkbox" [checked]="mostrarAplicados()" (change)="toggleAplicados($event)" />
                Mostrar aplicados
              </label>
            }
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
                  <div class="comp-thumb-wrap">
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
                    @if (!grupo.confirmado) {
                      <button class="comp-del" type="button" title="Excluir comprovante"
                              (click)="pedirExclusao(c)">✕</button>
                    } @else if (isAdmin()) {
                      <button class="comp-del" type="button" title="Excluir comprovante (reverte a baixa)"
                              (click)="pedirExclusao(c)">✕</button>
                    }
                    @if (valorComprovante(c) > 0) {
                      <span class="comp-valor">{{ valorComprovante(c) | currency:'BRL':'symbol':'1.2-2' }}</span>
                    } @else {
                      <span class="comp-valor comp-valor-warn" title="A IA não conseguiu identificar o valor deste comprovante">sem valor</span>
                    }
                  </div>
                }
              </div>

              <div class="grupo-info">
                @if (grupo.proprietario_id && !grupo.editandoProprietario) {
                  <div class="prop-nome-row">
                    <div class="prop-nome">{{ grupo.proprietario_nome }}</div>
                    @if (!grupo.confirmado) {
                      <button class="btn-sm" type="button" title="Trocar proprietário vinculado"
                              (click)="iniciarTrocaProprietario(grupo)">✎ Trocar</button>
                    }
                  </div>
                } @else {
                  <div class="prop-desconhecido">
                    @if (grupo.editandoProprietario) {
                      <span class="badge-edit">Trocando proprietário — atual: {{ grupo.proprietario_nome || '—' }}</span>
                    } @else {
                      <span class="badge-warn">Proprietário não identificado</span>
                    }
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
                              <button type="button" class="autocomplete-item" (mousedown)="atribuirProprietario(grupo, p)">
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
                    @if (grupo.editandoProprietario) {
                      <button class="btn-sm" type="button" (click)="cancelarTrocaProprietario(grupo.chave)">Cancelar troca</button>
                    }
                  </div>
                }

                <div class="grupo-meta">
                  @if (valorGrupo(grupo) > 0) {
                    <span class="meta-tag val-green meta-total">
                      Total comprovantes: {{ valorGrupo(grupo) | currency:'BRL':'symbol':'1.2-2' }}
                      @if (grupo.comprovantes.length > 1) {
                        <span class="meta-count">({{ grupo.comprovantes.length }})</span>
                      }
                    </span>
                  } @else {
                    <span class="meta-tag meta-total meta-total-warn" title="A IA não conseguiu ler o valor de nenhum comprovante deste grupo — informe o valor manualmente ou clique em Verificar novamente">
                      Total comprovantes: sem valor
                    </span>
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
                <div class="row-btns recheck-row">
                  <button class="btn-sm" type="button" (click)="verificarGrupoNovamente(grupo)">Verificar novamente</button>
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
                    @if (valorGrupo(grupo) > 0) {
                      <button class="btn-sm btn-por-valor" type="button" title="Tenta selecionar abastecimentos cuja soma seja igual ao valor do(s) comprovante(s)"
                              (click)="selecionarPorValor(grupo)">💰 Pelo valor</button>
                    }
                    <button class="btn-sm" (click)="selecionarTodos(grupo.chave, grupo)">Todos</button>
                    <button class="btn-sm" (click)="limparSelecao(grupo.chave)">Limpar</button>
                  </div>
                </div>

                <div class="filtro-data-row">
                  <div class="field-s">
                    <label>Data de</label>
                    <input type="date" [value]="grupo.filtroDataInicio" [max]="grupo.filtroDataFim || null" (change)="onFiltroDataPendentes(grupo, 'filtroDataInicio', $event)" />
                  </div>
                  <div class="field-s">
                    <label>Data até</label>
                    <input type="date" [value]="grupo.filtroDataFim" [min]="grupo.filtroDataInicio || null" (change)="onFiltroDataPendentes(grupo, 'filtroDataFim', $event)" />
                  </div>
                  @if (grupo.filtroDataInicio || grupo.filtroDataFim) {
                    <button class="btn-sm btn-limpar-filtro" type="button" (click)="limparFiltroDataPendentes(grupo)">✕ Limpar filtro</button>
                  }
                </div>

                <!-- Pagar terceiros: inclui abastecimentos de outro(s) proprietário(s) -->
                <div class="terceiros-box">
                  <label class="terceiros-label">💳 Pagar terceiros <small>(quando este pagamento cobre abastecimentos de outro proprietário)</small></label>
                  @if (grupo.terceiros.length > 0) {
                    <div class="terceiros-chips">
                      @for (t of grupo.terceiros; track t.id_proprietario) {
                        <span class="terceiro-chip">{{ t.nome }}
                          <button type="button" title="Remover" (click)="removerTerceiro(grupo, t.id_proprietario)">✕</button>
                        </span>
                      }
                    </div>
                  }
                  <div class="autocomplete-field">
                    <input
                      type="text"
                      [value]="grupo.buscaTerceiro"
                      placeholder="Adicionar proprietário cujos abastecimentos serão pagos..."
                      (input)="onBuscaTerceiro(grupo.chave, $event)"
                      (focus)="setOpcoesTerceiro(grupo.chave, true)"
                      (blur)="setOpcoesTerceiro(grupo.chave, false)"
                    />
                    @if (grupo.mostrarOpcoesTerceiro) {
                      @let opcoesT = filtrarProprietariosTerceiro(grupo);
                      @if (opcoesT.length > 0) {
                        <div class="autocomplete-list">
                          @for (p of opcoesT; track p.id_proprietario) {
                            <button type="button" class="autocomplete-item" (mousedown)="adicionarTerceiro(grupo, p)">
                              {{ p.nome }}
                            </button>
                          }
                        </div>
                      }
                    }
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
                          @if (grupo.terceiros.length > 0) {
                            <div class="pend-prop">👤 {{ a.nome_proprietario || a.proprietario?.nome || '—' }}</div>
                          }
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
                      <label>Data do pagamento</label>
                      <input type="date" [value]="grupo.dataPagamento || dataGrupo(grupo) || grupo.dataBaixa" (change)="patch(grupo.chave, {dataPagamento: $any($event.target).value})" />
                    </div>
                    <div class="field-s">
                      <label>Data da baixa</label>
                      <input type="date" [value]="grupo.dataBaixa" (change)="patch(grupo.chave, {dataBaixa: $any($event.target).value})" />
                    </div>
                    <div class="field-s">
                      <label>Recebedor</label>
                      <select [value]="grupo.recebedor || 'VIPE TRANSPORTES MULTIMODAIS LTDA'" (change)="patch(grupo.chave, {recebedor: $any($event.target).value})">
                        <option value="VIPE TRANSPORTES MULTIMODAIS LTDA">VIPE TRANSPORTES MULTIMODAIS LTDA</option>
                        <option value="Augusto">Augusto</option>
                      </select>
                    </div>
                    <div class="field-s field-grow">
                      <label>Descrição</label>
                      <input type="text" [value]="grupo.descricao" (input)="patch(grupo.chave, {descricao: $any($event.target).value})" placeholder="Opcional..." />
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

      <!-- Confirmar exclusão de comprovante -->
      @if (excluindo(); as alvo) {
        <div class="overlay" (click)="excluindo.set(null)">
          <div class="confirm-modal" (click)="$event.stopPropagation()">
            <h3>{{ alvo.status === 'aplicado' ? 'Remover comprovante da baixa' : 'Excluir comprovante' }}</h3>
            <p>
              {{ alvo.status === 'aplicado' ? 'Remover da baixa este comprovante' : 'Excluir este comprovante' }}
              @if (alvo.remetente_extraido) { de "<strong>{{ alvo.remetente_extraido }}</strong>" }
              @if (alvo.valor_extraido) { no valor de <strong>{{ alvo.valor_extraido | currency:'BRL':'symbol':'1.2-2' }}</strong> }?
            </p>
            @if (alvo.status === 'aplicado') {
              <p class="warn-line">⚠️ Este comprovante já foi aplicado. A ação vai <strong>reverter a baixa</strong>: os abastecimentos vinculados voltam para <strong>Pendente</strong> e o comprovante <strong>volta para a lista de pendentes</strong> aqui, pronto para um novo lançamento. O arquivo não é apagado.</p>
            } @else {
              <p class="warn-line">O arquivo será removido e não aparecerá mais nesta tela.</p>
            }
            <div class="modal-actions">
              <button class="btn-outline" (click)="excluindo.set(null)">Cancelar</button>
              <button class="btn-danger" [disabled]="excluindoBusy()" (click)="confirmarExclusao()">
                {{ excluindoBusy() ? 'Processando...' : (alvo.status === 'aplicado' ? 'Remover da baixa' : 'Excluir') }}
              </button>
            </div>
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
    .toggle-aplicados { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; color: #94a3b8; cursor: pointer; user-select: none; }
    .toggle-aplicados input { accent-color: #f59e0b; cursor: pointer; }
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
    .prop-nome-row { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
    .prop-nome-row .prop-nome { margin-bottom: 0; }
    .prop-nome { font-size: 16px; font-weight: 700; color: #f8fafc; margin-bottom: 8px; }
    .badge-edit { display: inline-block; background: #0ea5e915; border: 1px solid #0ea5e940; color: #38bdf8; padding: 3px 10px; border-radius: 999px; font-size: 11px; font-weight: 700; margin-bottom: 6px; }
    .comp-thumb-wrap { position: relative; display: flex; flex-direction: column; align-items: center; gap: 4px; }
    .comp-del { position: absolute; top: -6px; right: -6px; width: 20px; height: 20px; border-radius: 50%; border: 1px solid #7f1d1d; background: #dc2626; color: #fff; font-size: 11px; font-weight: 700; line-height: 1; cursor: pointer; display: flex; align-items: center; justify-content: center; padding: 0; z-index: 2; }
    .comp-del:hover { background: #ef4444; }
    .comp-valor { font-size: 10px; color: #4ade80; max-width: 76px; text-align: center; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .comp-valor-warn { color: #f59e0b; font-weight: 700; }
    .confirm-modal { background: #0d1427; border: 1px solid #1e2d4a; border-radius: 14px; padding: 24px; max-width: 420px; width: 92%; }
    .confirm-modal h3 { margin: 0 0 10px; color: #f8fafc; font-size: 16px; }
    .confirm-modal p { color: #94a3b8; font-size: 13px; margin: 0 0 8px; }
    .confirm-modal .warn-line { color: #fbbf24; font-size: 12px; }
    .modal-actions { display: flex; gap: 10px; justify-content: flex-end; margin-top: 16px; }
    .btn-danger { background: #dc2626; border: none; color: #fff; padding: 8px 16px; border-radius: 7px; cursor: pointer; font-size: 13px; font-weight: 600; }
    .btn-danger:disabled { opacity: 0.5; cursor: wait; }
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
    .meta-tag.meta-total { font-weight: 700; }
    .meta-tag.meta-total-warn { color: #f59e0b; border-color: #f59e0b40; background: #f59e0b08; }
    .meta-count { opacity: .7; font-weight: 600; margin-left: 2px; }
    .val-green { color: #4ade80; }

    .pendentes-section { border-top: 1px solid #1e2d4a; padding: 14px 16px; }
    .pend-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
    .pend-header h4 { margin: 0; color: #f8fafc; font-size: 13px; display: flex; gap: 8px; align-items: center; }
    .badge-count { background: #0ea5e920; color: #38bdf8; padding: 2px 8px; border-radius: 10px; font-size: 11px; }
    .row-btns { display: flex; gap: 6px; }
    .btn-por-valor { border-color: #4ade8040; color: #4ade80; }
    .btn-por-valor:hover { border-color: #4ade80; color: #4ade80; }
    .recheck-row { margin-top: 8px; }
    .filtro-data-row { display: flex; gap: 10px; align-items: flex-end; margin-bottom: 10px; }
    .filtro-data-row .field-s input { width: 140px; }
    .btn-limpar-filtro { height: 33px; }
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
    .pend-prop { font-size: 10px; color: #c4b5fd; margin-top: 2px; }

    .terceiros-box { border: 1px dashed #5b21b655; background: #2e106510; border-radius: 8px; padding: 10px; margin-bottom: 12px; }
    .terceiros-label { display: block; font-size: 12px; font-weight: 700; color: #c4b5fd; margin-bottom: 8px; }
    .terceiros-label small { font-weight: 400; color: #94a3b8; }
    .terceiros-chips { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 8px; }
    .terceiro-chip { display: inline-flex; align-items: center; gap: 6px; background: #4c1d9530; border: 1px solid #7c3aed55; color: #ddd6fe; border-radius: 999px; padding: 3px 10px; font-size: 11px; font-weight: 600; }
    .terceiro-chip button { background: none; border: none; color: #f5f3ff; cursor: pointer; font-size: 11px; padding: 0; line-height: 1; }
    .terceiro-chip button:hover { color: #fff; }

    .selecao-info { font-size: 11px; color: #94a3b8; margin-bottom: 10px; }
    .baixa-form { display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 12px; }
    .field-s { display: flex; flex-direction: column; gap: 4px; }
    .field-grow { flex: 1; min-width: 180px; }
    .field-s label { font-size: 10px; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: 0.4px; }
    .field-s select, .field-s input { background: #0a0f1e; border: 1px solid #1e2d4a; border-radius: 7px; padding: 7px 10px; color: #e2e8f0; font-size: 12px; outline: none; }
    .field-s input[type="date"] { color-scheme: dark; }
    .field-s input[type="date"]::-webkit-calendar-picker-indicator { cursor: pointer; opacity: 0.8; }
    .field-s input[type="date"]::-webkit-calendar-picker-indicator:hover { opacity: 1; }
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
  private auth = inject(AuthService);
  private toastr = inject(ToastrService);
  private router = inject(Router);
  private sanitizer = inject(DomSanitizer);
  private pdfThumbnails = inject(PdfThumbnailService);

  isAdmin(): boolean {
    return this.auth.isAdmin();
  }

  etapa = signal<Etapa>('upload');
  arquivos = signal<File[]>([]);
  processandoAtual = signal(0);
  comprovantes = signal<ComprovanteUI[]>([]);
  proprietarios = signal<Proprietario[]>([]);
  isDragOver = signal(false);
  previewUrl = signal('');
  previewTipo = signal<'image' | 'pdf'>('image');
  previewNome = signal('');
  private previewObjectUrl = '';
  excluindo = signal<ComprovanteUI | null>(null);
  excluindoBusy = signal(false);
  mostrarAplicados = signal(false);

  // Mutable group state keyed by group chave
  gruposState = signal<Record<string, GrupoState>>({});

  previewSafeUrl = computed<SafeResourceUrl | null>(() => {
    const url = this.previewUrl();
    return url ? this.sanitizer.bypassSecurityTrustResourceUrl(url) : null;
  });

  totalExtraido = computed(() =>
    this.comprovantes().reduce((s, c) => s + (c.valor_extraido ?? 0), 0)
  );

  // Chave de agrupamento: prioriza o proprietário já resolvido/atribuído
  // (para que comprovantes confirmados manualmente se juntem aos
  // identificados automaticamente pela IA para o mesmo proprietário),
  // depois cai para o remetente extraído pela IA e, por fim, para o id.
  private chaveGrupo(c: { proprietario_id: string | null; remetente_extraido: string | null; id: string }): string {
    if (c.proprietario_id) return `prop:${c.proprietario_id}`;
    if (c.remetente_extraido) return `rem:${c.remetente_extraido.toLowerCase().trim()}`;
    return `id:${c.id}`;
  }

  // Derived groups (chave prioriza proprietario_id; veja chaveGrupo)
  private gruposBase = computed<GrupoUI[]>(() => {
    const comps = this.comprovantes();
    const estado = this.gruposState();
    const mapaGrupos = new Map<string, GrupoUI>();

    for (const c of comps) {
      const chave = this.chaveGrupo(c);
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

  atualizarLista() {
    this.carregarExistentes(true);
  }

  toggleAplicados(e: Event) {
    this.mostrarAplicados.set((e.target as HTMLInputElement).checked);
    this.carregarExistentes(true);
  }

  private carregarExistentes(notificar = false) {
    this.api.listarComprovantes({ per_page: 100 }).subscribe({
      next: (res) => {
        const lista: any[] = res.data ?? [];
        const incluirAplicados = this.isAdmin() && this.mostrarAplicados();
        const ativos = incluirAplicados ? lista : lista.filter(r => r.status !== 'aplicado');
        if (!ativos.length) {
          if (notificar) {
            this.comprovantes.set([]);
            this.etapa.set('upload');
            this.toastr.info('Nenhum comprovante pendente no servidor.');
          }
          return;
        }

        const processados: ComprovanteUI[] = ativos.map(r => ({
          id: r.id,
          arquivo_url: r.arquivo_url,
          arquivo_tipo: r.arquivo_tipo ?? 'image',
          valor_extraido: r.valor_extraido ?? null,
          data_pagamento_extraida: r.data_pagamento_extraida ?? null,
          remetente_extraido: r.remetente_extraido ?? null,
          valor_pago_texto: r.valor_pago_texto ?? null,
          valores_comprovantes: r.valores_comprovantes ?? null,
          identificador_transacao: r.identificador_transacao ?? null,
          proprietario_id: r.proprietario_id ?? null,
          proprietario_nome: r.proprietario_nome ?? null,
          status: r.status,
          confianca_ia: r.confianca_ia ?? null,
          dados_ia: r.dados_ia,
        }));

        const estadoInicial: Record<string, GrupoState> = {};
        for (const comp of processados) {
          const chave = this.chaveGrupo(comp);
          if (!estadoInicial[chave]) {
            estadoInicial[chave] = criarGrupoState(
              comp.proprietario_id, comp.proprietario_nome, comp.remetente_extraido ?? ''
            );
          }
          if (comp.data_pagamento_extraida && (!estadoInicial[chave].dataPagamento || comp.data_pagamento_extraida > estadoInicial[chave].dataPagamento)) {
            estadoInicial[chave].dataPagamento = comp.data_pagamento_extraida;
          }
          // Comprovantes já aplicados aparecem como grupo confirmado (somente
          // leitura), permitindo ao admin excluir/reverter.
          if (comp.status === 'aplicado') {
            estadoInicial[chave].confirmado = true;
          }
        }

        this.comprovantes.set(processados);
        // Mantém o estado de grupos já em edição; só adiciona os novos
        this.gruposState.update(s => {
          const merged: Record<string, GrupoState> = {};
          for (const [chave, est] of Object.entries(estadoInicial)) {
            merged[chave] = s[chave] ?? est;
          }
          return merged;
        });
        this.etapa.set('revisando');

        const estadoAtual = this.gruposState();
        for (const chave of Object.keys(estadoInicial)) {
          const est = estadoAtual[chave];
          if (est?.proprietario_id && !est?.confirmado) this.carregarPendentes(chave, est.proprietario_id);
        }
        if (notificar) {
          this.toastr.success(`${processados.length} comprovante(s) pendente(s) carregado(s).`);
        }
      },
      error: () => {
        if (notificar) this.toastr.error('Erro ao atualizar a lista de comprovantes.');
      },
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
    let loteResposta: any = null;

    try {
      this.processandoAtual.set(0);
      loteResposta = await this.api.uploadComprovantesPagamento(files).toPromise();
      const recebidos: any[] = loteResposta?.comprovantes ?? [];
      loteResposta?.erros?.forEach((erro: any) => this.toastr.error(`Erro em comprovante: ${erro.message ?? 'erro desconhecido'}`));

      for (let i = 0; i < recebidos.length; i++) {
        this.processandoAtual.set(i);
        const r = recebidos[i];

        const comp: ComprovanteUI = {
          id: r.id,
          arquivo_url: r.arquivo_url,
          arquivo_tipo: r.arquivo_tipo ?? 'image',
          valor_extraido: r.valor_extraido ?? null,
          valor_pago_texto: r.valor_pago_texto ?? null,
          valores_comprovantes: r.valores_comprovantes ?? null,
          data_pagamento_extraida: r.data_pagamento_extraida ?? null,
          remetente_extraido: r.remetente_extraido ?? null,
          identificador_transacao: r.identificador_transacao ?? null,
          proprietario_id: r.proprietario_id ?? null,
          proprietario_nome: r.proprietario_nome ?? null,
          status: r.status,
          confianca_ia: r.confianca_ia ?? null,
          dados_ia: r.dados_ia,
        };

        processados.push(comp);

        const chave = this.chaveGrupo(comp);
        if (!estadoInicial[chave]) {
          estadoInicial[chave] = criarGrupoState(comp.proprietario_id, comp.proprietario_nome, comp.remetente_extraido ?? '');
          estadoInicial[chave].dataPagamento = comp.data_pagamento_extraida ?? '';
        }
      }
    } catch (err: any) {
      this.toastr.error(err?.error?.message ?? 'Erro ao processar lote de comprovantes');
    }

    // Merge with existing (deduplicate by id)
    this.comprovantes.update(existing => {
      const existingIds = new Set(existing.map(c => c.id));
      return [...existing, ...processados.filter(c => !existingIds.has(c.id))];
    });
    this.gruposState.update(s => ({ ...s, ...estadoInicial }));
    this.etapa.set('revisando');

    // Feedback de resultado
    const nNovos = processados.length;
    const nDuplicados: number = loteResposta?.total_duplicados ?? 0;
    if (nNovos > 0) {
      this.toastr.success(`${nNovos} comprovante(s) processado(s) pela IA.`);
    }
    if (nDuplicados > 0) {
      this.toastr.info(
        `${nDuplicados} comprovante(s) já enviado(s) anteriormente — exibindo versão existente.`,
        undefined, { timeOut: 6000 }
      );
    }

    // À prova de falhas: recarrega sempre a lista direto do servidor após o
    // upload. Garante que TODO comprovante salvo (novo OU duplicado, com ou
    // sem proprietário identificado) apareça na tela de revisão, mesmo que a
    // resposta do lote não o traga no array `comprovantes`.
    this.carregarExistentes();
  }

  private async carregarPendentes(chave: string, proprietarioId: string) {
    this.patch(chave, { carregandoPendentes: true });

    const estado = this.gruposState()[chave];
    const baseFiltros: any = { limit: 120 };
    if (estado?.filtroDataInicio) baseFiltros.data_inicio = estado.filtroDataInicio;
    if (estado?.filtroDataFim) baseFiltros.data_fim = estado.filtroDataFim;

    // Carrega os pendentes do proprietário do comprovante + os dos terceiros
    // adicionados (quando alguém pagou a conta de outro proprietário).
    const ids = [proprietarioId, ...((estado?.terceiros ?? []).map(t => t.id_proprietario))]
      .filter((v, i, arr) => v && arr.indexOf(v) === i);

    try {
      const listas = await Promise.all(
        ids.map(id => this.api.getAbastecimentosPendenteBaixa({ ...baseFiltros, id_proprietario: id }).toPromise())
      );
      const mapa = new Map<string, any>();
      for (const lista of listas) {
        for (const a of (lista ?? [])) mapa.set(a.id_abastecimento, a);
      }
      this.patch(chave, { pendentes: Array.from(mapa.values()), carregandoPendentes: false, selecionados: new Set<string>() });
    } catch {
      this.patch(chave, { carregandoPendentes: false });
    }
  }

  onFiltroDataPendentes(grupo: GrupoUI, campo: 'filtroDataInicio' | 'filtroDataFim', e: Event) {
    const valor = (e.target as HTMLInputElement).value;
    this.patch(grupo.chave, { [campo]: valor } as Partial<GrupoState>);
    if (grupo.proprietario_id) this.carregarPendentes(grupo.chave, grupo.proprietario_id);
  }

  limparFiltroDataPendentes(grupo: GrupoUI) {
    this.patch(grupo.chave, { filtroDataInicio: '', filtroDataFim: '' });
    if (grupo.proprietario_id) this.carregarPendentes(grupo.chave, grupo.proprietario_id);
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

  iniciarTrocaProprietario(grupo: GrupoUI) {
    this.patch(grupo.chave, {
      editandoProprietario: true,
      busca: grupo.proprietario_nome ?? '',
      mostrarOpcoes: false,
    });
  }

  cancelarTrocaProprietario(chave: string) {
    this.patch(chave, { editandoProprietario: false, mostrarOpcoes: false });
  }

  atribuirProprietario(grupo: GrupoUI, p: Proprietario) {
    // Nova chave é baseada no proprietário escolhido — se já houver outro
    // grupo (ex.: identificado pela IA) com o mesmo proprietário, eles se
    // juntam automaticamente nesta mesma chave.
    const novaChave = `prop:${p.id_proprietario}`;
    const salvar = grupo.salvarAlias ?? true;

    this.patch(novaChave, {
      proprietario_id: p.id_proprietario,
      proprietario_nome: p.nome,
      busca: p.nome,
      mostrarOpcoes: false,
      editandoProprietario: false,
      selecionados: new Set<string>(),
    });

    // Reflete o novo vínculo nos comprovantes em memória
    const ids = new Set(grupo.comprovantes.map(c => c.id));
    this.comprovantes.update(lista => lista.map(c =>
      ids.has(c.id)
        ? { ...c, proprietario_id: p.id_proprietario, proprietario_nome: p.nome }
        : c
    ));

    // Update comprovantes in this group on backend
    grupo.comprovantes.forEach(c => {
      this.api.atualizarProprietarioComprovante(c.id, {
        proprietario_id: p.id_proprietario,
        salvar_alias: salvar,
      }).subscribe();
    });

    this.carregarPendentes(novaChave, p.id_proprietario);
  }

  filtrarProprietarios(busca: string): Proprietario[] {
    const t = this.semAcento(busca);
    const all = this.proprietarios();
    if (!t) return all.slice(0, 30);
    return all.filter(p => this.semAcento(p.nome).includes(t)).slice(0, 30);
  }

  // ── Pagar terceiros (abastecimentos de outro proprietário) ──────
  onBuscaTerceiro(chave: string, e: Event) {
    this.patch(chave, { buscaTerceiro: (e.target as HTMLInputElement).value, mostrarOpcoesTerceiro: true });
  }
  setOpcoesTerceiro(chave: string, val: boolean) {
    setTimeout(() => this.patch(chave, { mostrarOpcoesTerceiro: val }), 120);
  }
  filtrarProprietariosTerceiro(grupo: GrupoUI): Proprietario[] {
    const t = this.semAcento(grupo.buscaTerceiro);
    const excluir = new Set<string | null>([grupo.proprietario_id, ...grupo.terceiros.map(x => x.id_proprietario)]);
    let all = this.proprietarios().filter(p => !excluir.has(p.id_proprietario));
    if (t) all = all.filter(p => this.semAcento(p.nome).includes(t));
    return all.slice(0, 30);
  }
  adicionarTerceiro(grupo: GrupoUI, p: Proprietario) {
    const ja = grupo.terceiros.some(x => x.id_proprietario === p.id_proprietario);
    const terceiros = ja ? grupo.terceiros : [...grupo.terceiros, { id_proprietario: p.id_proprietario, nome: p.nome }];
    this.patch(grupo.chave, { terceiros, buscaTerceiro: '', mostrarOpcoesTerceiro: false });
    if (grupo.proprietario_id) this.carregarPendentes(grupo.chave, grupo.proprietario_id);
  }
  removerTerceiro(grupo: GrupoUI, id: string) {
    const terceiros = grupo.terceiros.filter(x => x.id_proprietario !== id);
    this.patch(grupo.chave, { terceiros });
    if (grupo.proprietario_id) this.carregarPendentes(grupo.chave, grupo.proprietario_id);
  }

  private semAcento(v: unknown): string {
    return String(v ?? '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
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

  /** Tenta selecionar automaticamente os abastecimentos pendentes cuja soma bate com o valor do(s) comprovante(s). */
  selecionarPorValor(grupo: GrupoUI) {
    const alvo = this.valorGrupo(grupo);
    if (!alvo || alvo <= 0) {
      this.toastr.warning('Não foi possível identificar o valor do(s) comprovante(s) para sugerir uma combinação.');
      return;
    }

    const alvoCent = Math.round(alvo * 100);
    const itens = grupo.pendentes
      .map((a: any) => ({ id: a.id_abastecimento as string, cent: Math.round(this.toNum(a.valor_total) * 100) }))
      .filter(i => i.cent > 0);

    const combinacao = this.encontrarCombinacao(itens, alvoCent);
    if (!combinacao || combinacao.length === 0) {
      this.toastr.warning('Não encontrei uma combinação de abastecimentos cuja soma bata com o valor do comprovante.');
      return;
    }

    this.patch(grupo.chave, { selecionados: new Set(combinacao) });
    this.toastr.success(`Selecionados ${combinacao.length} abastecimento(s) somando ${alvo.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}.`);
  }

  /** Busca por combinação (subset-sum) com tolerância de 1 centavo, priorizando os itens de maior valor. */
  private encontrarCombinacao(itens: { id: string; cent: number }[], alvoCent: number): string[] | null {
    const tolerancia = 1;
    const ordenados = [...itens].sort((a, b) => b.cent - a.cent);
    const n = ordenados.length;
    if (n === 0 || alvoCent <= 0) return null;

    const sufixo = new Array(n + 1).fill(0);
    for (let i = n - 1; i >= 0; i--) sufixo[i] = sufixo[i + 1] + ordenados[i].cent;

    let melhor: number[] | null = null;
    let tentativas = 0;
    const MAX_TENTATIVAS = 200000;

    const buscar = (idx: number, restante: number, escolhidos: number[]): boolean => {
      if (Math.abs(restante) <= tolerancia) {
        melhor = [...escolhidos];
        return true;
      }
      if (idx >= n || restante < -tolerancia) return false;
      if (sufixo[idx] < restante - tolerancia) return false;
      if (++tentativas > MAX_TENTATIVAS) return false;

      escolhidos.push(idx);
      if (buscar(idx + 1, restante - ordenados[idx].cent, escolhidos)) return true;
      escolhidos.pop();

      return buscar(idx + 1, restante, escolhidos);
    };

    buscar(0, alvoCent, []);
    const resultado = melhor as number[] | null;
    return resultado ? resultado.map((i: number) => ordenados[i].id) : null;
  }

  valorGrupo(grupo: GrupoUI): number {
    return grupo.comprovantes.reduce((s, c) => s + this.valorComprovante(c), 0);
  }

  /** Melhor valor disponível para um comprovante: valor_extraido > soma de valores_comprovantes > parse do texto. */
  valorComprovante(c: ComprovanteUI): number {
    if (c.valor_extraido && c.valor_extraido > 0) return c.valor_extraido;

    if (c.valores_comprovantes && c.valores_comprovantes.length) {
      const soma = c.valores_comprovantes.reduce((s, v) => s + (Number(v) || 0), 0);
      if (soma > 0) return soma;
    }

    if (c.valor_pago_texto) {
      const n = this.parseValorTexto(c.valor_pago_texto);
      if (n > 0) return n;
    }

    return 0;
  }

  private parseValorTexto(texto: string): number {
    const limpo = String(texto).replace(/[^\d.,-]/g, '');
    if (!limpo) return 0;

    const ultimaVirgula = limpo.lastIndexOf(',');
    const ultimoPonto = limpo.lastIndexOf('.');
    let normalizado = limpo;

    if (ultimaVirgula !== -1 && ultimoPonto !== -1) {
      normalizado = ultimaVirgula > ultimoPonto
        ? limpo.replace(/\./g, '').replace(',', '.')
        : limpo.replace(/,/g, '');
    } else if (ultimaVirgula !== -1) {
      normalizado = limpo.replace(/\./g, '').replace(',', '.');
    }

    const n = parseFloat(normalizado);
    return isFinite(n) ? n : 0;
  }

  dataGrupo(grupo: GrupoUI): string | null {
    const datas = grupo.comprovantes
      .map(c => c.data_pagamento_extraida)
      .filter((v): v is string => !!v)
      .sort();
    return datas.length ? datas[datas.length - 1] : null;
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
      comprovante_ids: grupo.comprovantes.map(c => c.id),
      ids_abastecimentos: Array.from(grupo.selecionados),
      proprietarios_terceiros: grupo.terceiros.map(t => t.id_proprietario),
      forma_pagamento: grupo.formaPagamento,
      data_pagamento: grupo.dataPagamento || this.dataGrupo(grupo) || grupo.dataBaixa,
      data_baixa: grupo.dataBaixa,
      tipo_despesa: 'Combustível',
      descricao: grupo.descricao || null,
      recebedor: grupo.recebedor || null,
      observacao: grupo.observacao || null,
    };

    try {
      await this.api.confirmarBaixaComprovanteGrupo(payload).toPromise();
      this.patch(grupo.chave, { confirmando: false, confirmado: true });
      this.toastr.success(`Baixa aplicada — ${grupo.proprietario_nome}`);
    } catch (err: any) {
      this.patch(grupo.chave, { confirmando: false });
      this.toastr.error(err?.error?.message ?? 'Erro ao confirmar baixa');
    }
  }

  async verificarGrupoNovamente(grupo: GrupoUI) {
    this.toastr.info('Reprocessando comprovante(s)...');
    const atualizados: ComprovanteUI[] = [];
    for (const comp of grupo.comprovantes) {
      try {
        const r = await this.api.verificarComprovantePagamento(comp.id).toPromise();
        atualizados.push({
          ...comp,
          valor_extraido: r.valor_extraido ?? null,
          valor_pago_texto: r.valor_pago_texto ?? null,
          valores_comprovantes: r.valores_comprovantes ?? null,
          data_pagamento_extraida: r.data_pagamento_extraida ?? null,
          remetente_extraido: r.remetente_extraido ?? null,
          identificador_transacao: r.identificador_transacao ?? null,
          proprietario_id: r.proprietario_id ?? null,
          proprietario_nome: r.proprietario_nome ?? null,
          status: r.status,
          confianca_ia: r.confianca_ia ?? null,
          dados_ia: r.dados_ia,
        });
      } catch (err: any) {
        this.toastr.error(err?.error?.message ?? 'Erro ao verificar comprovante');
      }
    }
    if (!atualizados.length) return;

    this.comprovantes.update(lista => lista.map(item => {
      const novo = atualizados.find(a => a.id === item.id);
      return novo ?? item;
    }));

    const primeiro = atualizados[0];
    if (primeiro.proprietario_id) {
      this.patch(grupo.chave, {
        proprietario_id: primeiro.proprietario_id,
        proprietario_nome: primeiro.proprietario_nome,
        dataPagamento: this.dataGrupo({ ...grupo, comprovantes: atualizados }) ?? grupo.dataPagamento,
      });
      this.carregarPendentes(grupo.chave, primeiro.proprietario_id);
    }
    this.toastr.success('Verificação concluída.');
  }

  // ── Exclusão de comprovante ──────────────────

  pedirExclusao(c: ComprovanteUI) {
    this.excluindo.set(c);
  }

  confirmarExclusao() {
    const alvo = this.excluindo();
    if (!alvo) return;
    const eraAplicado = alvo.status === 'aplicado';
    this.excluindoBusy.set(true);
    this.api.cancelarComprovante(alvo.id).subscribe({
      next: (res: any) => {
        this.comprovantes.update(lista => lista.filter(c => c.id !== alvo.id));
        this.excluindo.set(null);
        this.excluindoBusy.set(false);
        this.toastr.success(res?.message ?? 'Comprovante removido.');
        // Reverter uma baixa aplicada devolve os comprovantes do lote para a
        // lista de pendentes e os abastecimentos para pendente: recarrega sempre
        // do servidor para refletir o estado real.
        if (eraAplicado || res?.comprovante_reaberto) this.carregarExistentes();
      },
      error: (err) => {
        this.excluindoBusy.set(false);
        this.toastr.error(err?.error?.message ?? 'Erro ao excluir comprovante');
      },
    });
  }

  // ── Preview ──────────────────────────────────

  abrirPreview(c: ComprovanteUI) {
    this.previewTipo.set(c.arquivo_tipo === 'pdf' ? 'pdf' : 'image');
    this.previewNome.set(c.remetente_extraido ?? 'Comprovante');
    if (!this.isCloudinaryUrl(c.arquivo_url)) {
      this.previewUrl.set(c.arquivo_url);
      return;
    }

    this.api.downloadCloudinaryMedia(c.arquivo_url).subscribe({
      next: (blob) => {
        this.revokePreviewObjectUrl();
        this.previewObjectUrl = URL.createObjectURL(blob);
        this.previewUrl.set(this.previewObjectUrl);
      },
      error: (err) => {
        this.toastr.error(err?.error?.message ?? 'Não foi possível abrir o comprovante.');
      },
    });
  }

  fecharPreview() {
    this.previewUrl.set('');
    this.revokePreviewObjectUrl();
  }

  pdfThumb(url: string): string | null {
    try {
      const u = new URL(url);
      if (!u.hostname.endsWith('res.cloudinary.com')) return null;
      if (u.pathname.startsWith('/duei0rf3b/')) return this.pdfThumbnails.get(url);
      const m = '/image/upload/';
      const i = u.pathname.indexOf(m);
      if (i < 0) return null;
      const prefix = u.pathname.slice(0, i + m.length);
      const asset = u.pathname.slice(i + m.length).replace(/\.pdf$/i, '.jpg');
      u.pathname = `${prefix}pg_1/c_fill,h_80,w_80/f_jpg/q_auto/${asset}`;
      return u.toString();
    } catch { return null; }
  }

  private isCloudinaryUrl(url: string): boolean {
    try {
      return new URL(url).hostname === 'res.cloudinary.com';
    } catch {
      return false;
    }
  }

  private revokePreviewObjectUrl() {
    if (!this.previewObjectUrl) return;
    URL.revokeObjectURL(this.previewObjectUrl);
    this.previewObjectUrl = '';
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
