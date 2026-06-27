// src/app/features/baixa/baixa.component.ts
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { forkJoin } from 'rxjs';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { ToastrService } from 'ngx-toastr';
import { Abastecimento, Proprietario, Veiculo, Motorista } from '../../shared/models';
import { ExcelExportService } from '../../core/services/excel-export.service';
import { PdfThumbnailService } from '../../core/services/pdf-thumbnail.service';

type AnexoTipo = 'image' | 'pdf' | 'file';

interface AnexoBaixaView {
  url: string;
  tipo: AnexoTipo;
}

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

      <div class="stats-row">
        <div class="stat-card">
          <span>Total em Litros</span>
          <strong>{{ totalLitros() | number:'1.2-2' }} L</strong>
        </div>
        <div class="stat-card">
          <span>Valor Total Baixado</span>
          <strong>{{ totalValor() | currency:'BRL':'symbol':'1.2-2' }}</strong>
        </div>
        <div class="stat-card">
          <span>Total de Registros</span>
          <strong>{{ sortedBaixas().length }}</strong>
        </div>
      </div>

      <div class="card">
        <div class="card-title">
          <h3>Registros de Baixa</h3>
          <div class="card-title-btns">
            <button class="btn-excel" (click)="exportExcel()">📊 Excel</button>
            <button class="btn-sm" (click)="loadBaixas()">Atualizar</button>
          </div>
        </div>

        <div class="filters-card">
          <div class="filters-grid">
            <div class="filter-field">
              <label>Empresa</label>
              <input type="text" [value]="histEmpresa()" placeholder="Nome do proprietário..."
                     (input)="histEmpresa.set($any($event.target).value)" />
            </div>
            <div class="filter-field">
              <label>Placa</label>
              <input type="text" [value]="histPlaca()" placeholder="ABC1D23"
                     (input)="histPlaca.set($any($event.target).value)" />
            </div>
            <div class="filter-field">
              <label>Forma Pgto</label>
              <select [value]="histFormaPgto()" (change)="histFormaPgto.set($any($event.target).value)">
                <option value="">Todas</option>
                @for (f of formasPagamentoDisponiveis(); track f) {
                  <option [value]="f">{{ f }}</option>
                }
              </select>
            </div>
            <div class="filter-field">
              <label>Recebedor</label>
              <select [value]="histRecebedor()" (change)="histRecebedor.set($any($event.target).value)">
                <option value="">Todos</option>
                @for (r of recebedoresDisponiveis(); track r) {
                  <option [value]="r">{{ r }}</option>
                }
              </select>
            </div>
            <div class="filter-field">
              <label>Data Início</label>
              <input type="date" [value]="histDataInicio()" (change)="histDataInicio.set($any($event.target).value)" />
            </div>
            <div class="filter-field">
              <label>Data Fim</label>
              <input type="date" [value]="histDataFim()" (change)="histDataFim.set($any($event.target).value)" />
            </div>
            <div class="filter-field">
              <label>Valor (exato)</label>
              <input type="text" [value]="histValor()" inputmode="decimal" placeholder="Ex.: 1500 ou 1500,50"
                     (input)="histValor.set($any($event.target).value)" />
            </div>
          </div>
          @if (temFiltrosHistorico()) {
            <button class="btn-clear" (click)="limparFiltrosHistorico()">
              Limpar Filtros · {{ sortedBaixas().length }} resultado(s)
            </button>
          }
        </div>

        @if (loadingBaixas()) {
          <div class="loading-state"><div class="spinner-lg"></div> Carregando baixas...</div>
        } @else {
          <div class="table-wrap">
            <table class="data-table">
              <thead>
                <tr>
                  <th class="sortable" (click)="sortBy('data_hora')">Data/Hora <span>{{ sortIcon('data_hora') }}</span></th>
                  <th class="sortable" (click)="sortBy('empresa')">Empresa <span>{{ sortIcon('empresa') }}</span></th>
                  <th class="sortable" (click)="sortBy('placa')">Placa <span>{{ sortIcon('placa') }}</span></th>
                  <th class="sortable" (click)="sortBy('motorista')">Motorista <span>{{ sortIcon('motorista') }}</span></th>
                  <th class="sortable" (click)="sortBy('forma_pagamento')">Forma Pgto <span>{{ sortIcon('forma_pagamento') }}</span></th>
                  <th class="sortable" (click)="sortBy('data_pagamento')">Data Pgto <span>{{ sortIcon('data_pagamento') }}</span></th>
                  <th class="text-right sortable" (click)="sortBy('valor')">Valor <span>{{ sortIcon('valor') }}</span></th>
                  <th>Comprovantes</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                @for (b of sortedBaixas(); track baixaGroupId(b)) {
                  <tr
                    class="clickable-row"
                    [class.active-row]="selectedBaixa() && baixaGroupId(selectedBaixa()) === baixaGroupId(b)"
                    title="Clique para ver os detalhes da baixa"
                    (click)="openBaixaDetails(b)"
                  >
                    <td>{{ b.data_hora | date:'dd/MM/yyyy HH:mm' }}</td>
                    <td>{{ baixaEmpresa(b) }}</td>
                    <td>{{ baixaPlacas(b) }}</td>
                    <td>{{ baixaMotoristas(b) }}</td>
                    <td>{{ b.forma_pagamento || '—' }}</td>
                    <td>{{ b.data_pagamento ? (b.data_pagamento | date:'dd/MM/yyyy') : '—' }}</td>
                    <td class="text-right val-green">
                      {{ baixaTotal(b) | currency:'BRL':'symbol':'1.2-2' }}
                      @if (baixaItems(b).length > 1) {
                        <small class="row-count">{{ baixaItems(b).length }} abastecimentos</small>
                      }
                    </td>
                    <td>
                      @if (getAnexos(baixaAnexo(b)).length > 0) {
                        <div class="anexo-gallery">
                          @for (anexo of getAnexos(baixaAnexo(b)); track anexo.url; let idx = $index) {
                            <button class="anexo-thumb" type="button" (click)="$event.stopPropagation(); openAnexoPreview(anexo.url, idx)">
                              <span class="anexo-thumb-media">
                                @if (anexo.tipo === 'image') {
                                  <img [src]="anexo.url" [alt]="anexoLabel(idx, anexo.url)" loading="lazy" />
                                } @else if (anexo.tipo === 'pdf') {
                                  @if (anexoThumbUrl(anexo.url); as thumbUrl) {
                                    <img [src]="thumbUrl" [alt]="anexoLabel(idx, anexo.url)" loading="lazy" />
                                  } @else {
                                    <span class="anexo-file-icon">📎</span>
                                  }
                                  <span class="anexo-type-chip">PDF</span>
                                } @else {
                                  <span class="anexo-file-icon">📎</span>
                                  <span class="anexo-type-chip">Arquivo</span>
                                }
                              </span>
                              <span class="anexo-thumb-label">{{ anexoLabel(idx, anexo.url) }}</span>
                            </button>
                          }
                        </div>
                      } @else {
                        <span class="muted">Sem anexo</span>
                      }
                    </td>
                    <td>
                      <div class="row-acoes">
                        @if (isAdmin()) {
                          <button
                            class="btn-edit-sm"
                            type="button"
                            (click)="$event.stopPropagation(); abrirEdicaoBaixa(b, $event)"
                          >Editar</button>
                        }
                        <button
                          class="btn-danger-sm"
                          type="button"
                          [disabled]="deletingBaixaId() === baixaGroupId(b)"
                          (click)="$event.stopPropagation(); deleteBaixaGroup(b)"
                        >
                          {{ deletingBaixaId() === baixaGroupId(b) ? 'Excluindo...' : 'Excluir' }}
                        </button>
                      </div>
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

      @if (editandoBaixa(); as eb) {
        <div class="modal-overlay" (click)="editandoBaixa.set(null)">
          <div class="modal-shell baixa-detail-modal" (click)="$event.stopPropagation()">
            <div class="modal-header baixa-detail-header">
              <div>
                <h2>Editar baixa</h2>
                <p>{{ baixaItems(eb).length }} abastecimento(s) neste pagamento</p>
              </div>
              <button class="btn-close" type="button" (click)="editandoBaixa.set(null)">✕</button>
            </div>

            <div class="detail-summary-grid">
              <div class="detail-summary-card">
                <span>Empresa</span>
                <strong>{{ baixaEmpresa(eb) }}</strong>
              </div>
              <div class="detail-summary-card">
                <span>Total baixado</span>
                <strong>{{ editTotalGeral() | currency:'BRL':'symbol':'1.2-2' }}</strong>
              </div>
              <div class="detail-summary-card">
                <span>Litros</span>
                <strong>{{ editLitrosGeral() | number:'1.2-2' }} L</strong>
              </div>
              <div class="detail-summary-card edit-field-card">
                <span>Pagamento</span>
                <select [(ngModel)]="editForm.forma_pagamento">
                  <option value="">—</option>
                  <option value="PIX">PIX</option>
                  <option value="dinheiro">Dinheiro</option>
                  <option value="transferência">Transferência</option>
                  <option value="depósito">Depósito</option>
                  <option value="cheque">Cheque</option>
                  <option value="outro">Outro</option>
                </select>
              </div>
            </div>

            <div class="detail-meta-grid">
              <div class="edit-field-card">
                <span>Data da baixa</span>
                <input type="date" [(ngModel)]="editForm.data_baixa" />
              </div>
              <div class="edit-field-card">
                <span>Data do pagamento</span>
                <input type="date" [(ngModel)]="editForm.data_pagamento" />
              </div>
              <div class="edit-field-card">
                <span>Usuário</span>
                <input type="text" [(ngModel)]="editForm.usuario" placeholder="Usuário" />
              </div>
              <div class="edit-field-card">
                <span>Recebedor</span>
                <select [(ngModel)]="editForm.recebedor">
                  <option value="">—</option>
                  <option value="VIPE TRANSPORTES MULTIMODAIS LTDA">VIPE TRANSPORTES MULTIMODAIS LTDA</option>
                  <option value="Augusto">Augusto</option>
                </select>
              </div>
            </div>

            <div class="detail-section">
              <h3>Abastecimentos baixados</h3>
              <div class="detail-table-wrap">
                <table class="data-table detail-table">
                  <thead>
                    <tr>
                      <th>Data/Hora</th>
                      <th>Placa</th>
                      <th>Motorista</th>
                      <th>Combustível</th>
                      <th class="text-right">Litros</th>
                      <th class="text-right">Valor/L</th>
                      <th class="text-right">Valor total</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (item of baixaItems(eb); track item.id_baixa) {
                      @if (rowOf(item.abastecimento?.id_abastecimento); as row) {
                        <tr class="edit-row">
                          <td>
                            <input type="datetime-local" class="cell-input"
                                   [ngModel]="row.data_hora"
                                   (ngModelChange)="setRowField(item.abastecimento?.id_abastecimento, 'data_hora', $event)" />
                          </td>
                          <td>
                            <select class="cell-input"
                                    [ngModel]="row.id_veiculo"
                                    (ngModelChange)="setRowField(item.abastecimento?.id_abastecimento, 'id_veiculo', $event)">
                              <option [ngValue]="''">{{ row.placa_label || '—' }}</option>
                              @for (v of veiculos(); track v.id_veiculo) {
                                <option [ngValue]="v.id_veiculo">{{ v.placa }}</option>
                              }
                            </select>
                          </td>
                          <td>
                            <select class="cell-input"
                                    [ngModel]="row.id_motorista"
                                    (ngModelChange)="setRowField(item.abastecimento?.id_abastecimento, 'id_motorista', $event)">
                              <option [ngValue]="''">{{ row.motorista_label || '—' }}</option>
                              @for (m of motoristas(); track m.id_motorista) {
                                <option [ngValue]="m.id_motorista">{{ m.nome }}</option>
                              }
                            </select>
                          </td>
                          <td>
                            <input type="text" class="cell-input"
                                   [ngModel]="row.tipo_combustivel"
                                   (ngModelChange)="setRowField(item.abastecimento?.id_abastecimento, 'tipo_combustivel', $event)" />
                          </td>
                          <td class="text-right">
                            <input type="number" step="0.01" class="cell-input cell-num"
                                   [ngModel]="row.quantidade_litros"
                                   (ngModelChange)="setRowField(item.abastecimento?.id_abastecimento, 'quantidade_litros', $event)" />
                          </td>
                          <td class="text-right cell-readonly" title="Valor por litro é fixo pelo sistema">
                            {{ row.valor_por_litro | currency:'BRL':'symbol':'1.2-2' }}
                          </td>
                          <td class="text-right val-green">
                            {{ editRowTotal(item.abastecimento?.id_abastecimento) | currency:'BRL':'symbol':'1.2-2' }}
                          </td>
                        </tr>
                      }
                    }
                  </tbody>
                </table>
              </div>
            </div>

            <div class="detail-bottom-grid">
              <div class="detail-section">
                <h3>Dados registrados</h3>
                <div class="detail-list edit-list">
                  <div class="edit-field-card">
                    <span>Tipo</span>
                    <input type="text" [(ngModel)]="editForm.tipo_despesa" placeholder="Tipo" />
                  </div>
                  <div class="edit-field-card">
                    <span>Descrição</span>
                    <input type="text" [(ngModel)]="editForm.descricao" placeholder="Descrição" />
                  </div>
                  <div class="edit-field-card">
                    <span>Observação</span>
                    <textarea rows="2" [(ngModel)]="editForm.observacao" placeholder="Observação"></textarea>
                  </div>
                  <div><span>ID da baixa</span><strong class="mono">{{ eb.id_baixa }}</strong></div>
                </div>
              </div>

              <div class="detail-section">
                <h3>Comprovantes</h3>
                @if (getAnexos(baixaAnexo(eb)).length > 0) {
                  <div class="detail-anexo-grid">
                    @for (anexo of getAnexos(baixaAnexo(eb)); track anexo.url; let idx = $index) {
                      <div class="anexo-edit-wrap">
                        <button class="anexo-thumb detail-anexo-thumb" type="button" (click)="openAnexoPreview(anexo.url, idx)">
                          <span class="anexo-thumb-media">
                            @if (anexo.tipo === 'image') {
                              <img [src]="anexo.url" [alt]="anexoLabel(idx, anexo.url)" loading="lazy" />
                            } @else if (anexo.tipo === 'pdf') {
                              @if (anexoThumbUrl(anexo.url); as thumbUrl) {
                                <img [src]="thumbUrl" [alt]="anexoLabel(idx, anexo.url)" loading="lazy" />
                              } @else {
                                <span class="anexo-file-icon">📎</span>
                              }
                              <span class="anexo-type-chip">PDF</span>
                            } @else {
                              <span class="anexo-file-icon">📎</span>
                              <span class="anexo-type-chip">Arquivo</span>
                            }
                          </span>
                          <span class="anexo-thumb-label">{{ anexoLabel(idx, anexo.url) }}</span>
                        </button>
                        <button class="anexo-del" type="button" title="Remover este comprovante da baixa"
                                [disabled]="removendoComprovanteUrl() === anexo.url"
                                (click)="removerComprovanteBaixa(eb, anexo.url)">✕</button>
                      </div>
                    }
                  </div>
                } @else {
                  <span class="muted">Sem comprovante anexado</span>
                }
              </div>
            </div>

            <div class="modal-actions">
              <button class="btn-outline" (click)="editandoBaixa.set(null)">Cancelar</button>
              <button class="btn-primary" [disabled]="editandoBusy()" (click)="salvarEdicaoBaixa()">
                {{ editandoBusy() ? 'Salvando...' : 'Salvar alterações' }}
              </button>
            </div>
          </div>
        </div>
      }

      @if (showNovaBaixaModal()) {
        <div class="modal-overlay" (click)="closeNovaBaixa()">
          <div class="modal-shell" (click)="$event.stopPropagation()">
            <div class="modal-header">
              <h2>Nova Baixa</h2>
              <button class="btn-close" (click)="closeNovaBaixa()">✕</button>
            </div>

            <div class="acerto-summary">
              <div>
                <span>Valor do acerto</span>
                <strong>{{ totalSelecionado() | currency:'BRL':'symbol':'1.2-2' }}</strong>
              </div>
              <small>{{ selected().size }} selecionado(s)</small>
            </div>

            <div class="filters-card">
              <div class="filters-grid">
                <div class="filter-field">
                  <label>Empresa</label>
                  <div class="autocomplete-field">
                    <input
                      type="text"
                      [value]="empresaBusca()"
                      placeholder="Digite a empresa..."
                      (input)="onEmpresaBuscaChange($event)"
                      (focus)="showEmpresaOptions.set(true)"
                      (blur)="closeEmpresaOptions()"
                    />
                    @if (empresaBusca()) {
                      <button type="button" class="btn-clear-field" (mousedown)="clearEmpresa()">×</button>
                    }
                    @if (showEmpresaOptions() && filteredEmpresas().length > 0) {
                      <div class="autocomplete-list">
                        @for (p of filteredEmpresas(); track p.id_proprietario) {
                          <button type="button" class="autocomplete-item" (mousedown)="selectEmpresa(p)">
                            {{ p.nome }}
                          </button>
                        }
                      </div>
                    }
                  </div>
                </div>
                <div class="filter-field">
                  <label>Placa</label>
                  <div class="autocomplete-field">
                    <input
                      type="text"
                      [value]="placaBusca()"
                      placeholder="Digite a placa..."
                      (input)="onPlacaBuscaChange($event)"
                      (focus)="showPlacaOptions.set(true)"
                      (blur)="closePlacaOptions()"
                    />
                    @if (placaBusca()) {
                      <button type="button" class="btn-clear-field" (mousedown)="clearPlaca()">×</button>
                    }
                    @if (showPlacaOptions() && filteredPlacas().length > 0) {
                      <div class="autocomplete-list">
                        @for (placa of filteredPlacas(); track placa) {
                          <button type="button" class="autocomplete-item placa-option" (mousedown)="selectPlaca(placa)">
                            {{ placa }}
                          </button>
                        }
                      </div>
                    }
                  </div>
                </div>
                <div class="filter-field">
                  <label>Data Início</label>
                  <div class="date-row">
                    <input #dataInicioInput type="date" [(ngModel)]="filters.data_inicio" (change)="loadPendentes()" />
                    <button type="button" class="btn-date" (click)="openDatePicker(dataInicioInput)">📅</button>
                  </div>
                </div>
                <div class="filter-field">
                  <label>Data Fim</label>
                  <div class="date-row">
                    <input #dataFimInput type="date" [(ngModel)]="filters.data_fim" (change)="loadPendentes()" />
                    <button type="button" class="btn-date" (click)="openDatePicker(dataFimInput)">📅</button>
                  </div>
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
                      <div class="empty-state">{{ filters.id_proprietario ? 'Sem abastecimentos pendentes para o filtro.' : 'Selecione uma empresa para carregar os abastecimentos pendentes.' }}</div>
                    }
                  </div>

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
                    <label>Recebedor</label>
                    <select formControlName="recebedor">
                      <option value="VIPE TRANSPORTES MULTIMODAIS LTDA">VIPE TRANSPORTES MULTIMODAIS LTDA</option>
                      <option value="Augusto">Augusto</option>
                    </select>
                  </div>
                  <div class="field">
                    <label>Observação</label>
                    <textarea formControlName="observacao" rows="2" placeholder="Observações"></textarea>
                  </div>
                  <div class="field anexos-panel">
                    <div class="anexos-header">
                      <div>
                        <strong>Comprovantes da baixa</strong>
                        <span>{{ formAnexos().length }}/4 anexos</span>
                      </div>
                      <label class="btn-add-anexo" [class.disabled]="uploadingAnexo() || formAnexos().length >= 4">
                        + Adicionar comprovantes
                        <input type="file" accept="image/*,application/pdf" multiple (change)="onUploadAnexo($event)" [disabled]="uploadingAnexo() || formAnexos().length >= 4" />
                      </label>
                    </div>
                    @if (uploadingAnexo()) {
                      <small class="upload-hint">Enviando anexo...</small>
                    } @else {
                      <small class="upload-hint">Selecione imagens ou PDFs. O limite é de 4 comprovantes por baixa.</small>
                    }
                    @if (formAnexos().length > 0) {
                      <div class="preview-grid">
                        @for (anexoFormUrl of formAnexos(); track anexoFormUrl; let idx = $index) {
                          <div class="preview-card">
                            <button type="button" class="preview-media-btn" (click)="openAnexoPreview(anexoFormUrl, idx)">
                              @if (anexoKind(anexoFormUrl) === 'image') {
                                <img class="preview-img" [src]="anexoFormUrl" [alt]="anexoLabel(idx, anexoFormUrl)" />
                              } @else if (anexoKind(anexoFormUrl) === 'pdf') {
                                @if (anexoThumbUrl(anexoFormUrl); as thumbUrl) {
                                  <img class="preview-img" [src]="thumbUrl" [alt]="anexoLabel(idx, anexoFormUrl)" />
                                } @else {
                                  <span class="preview-file-icon">📎</span>
                                }
                                <span class="anexo-type-chip">PDF</span>
                              } @else {
                                <span class="preview-file-icon">📎</span>
                                <span class="anexo-type-chip">Arquivo</span>
                              }
                            </button>
                            <strong class="preview-name">{{ anexoLabel(idx, anexoFormUrl) }}</strong>
                            <div class="preview-actions">
                              <button type="button" class="btn-preview" (click)="openAnexoPreview(anexoFormUrl, idx)">Expandir</button>
                              <button type="button" class="btn-remove-preview" (click)="removeAnexo(idx)">Remover</button>
                            </div>
                          </div>
                        }
                      </div>
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

      @if (selectedBaixa(); as baixaDetalhe) {
        <div class="modal-overlay" (click)="closeBaixaDetails()">
          <div class="modal-shell baixa-detail-modal" (click)="$event.stopPropagation()">
            <div class="modal-header baixa-detail-header">
              <div>
                <h2>Detalhes da baixa</h2>
                <p>{{ baixaDetailItems().length }} abastecimento(s) neste pagamento</p>
              </div>
              <button class="btn-close" type="button" (click)="closeBaixaDetails()">✕</button>
            </div>

            <div class="detail-summary-grid">
              <div class="detail-summary-card">
                <span>Empresa</span>
                <strong>{{ baixaEmpresa(baixaDetalhe) }}</strong>
              </div>
              <div class="detail-summary-card">
                <span>Total baixado</span>
                <strong>{{ baixaDetailTotal() | currency:'BRL':'symbol':'1.2-2' }}</strong>
              </div>
              <div class="detail-summary-card">
                <span>Litros</span>
                <strong>{{ baixaDetailLitros() | number:'1.2-2' }} L</strong>
              </div>
              <div class="detail-summary-card">
                <span>Pagamento</span>
                <strong>{{ baixaDetalhe.forma_pagamento || '—' }}</strong>
              </div>
            </div>

            <div class="detail-meta-grid">
              <div>
                <span>Data da baixa</span>
                <strong>{{ baixaDetalhe.data_hora | date:'dd/MM/yyyy HH:mm' }}</strong>
              </div>
              <div>
                <span>Data do pagamento</span>
                <strong>{{ baixaDetalhe.data_pagamento ? (baixaDetalhe.data_pagamento | date:'dd/MM/yyyy') : '—' }}</strong>
              </div>
              <div>
                <span>Usuário</span>
                <strong>{{ baixaDetalhe.usuario || '—' }}</strong>
              </div>
              <div>
                <span>Recebedor</span>
                <strong>{{ baixaDetalhe.abastecimento?.recebedor || '—' }}</strong>
              </div>
            </div>

            <div class="detail-section">
              <h3>Abastecimentos baixados</h3>
              <div class="detail-table-wrap">
                <table class="data-table detail-table">
                  <thead>
                    <tr>
                      <th>Data/Hora</th>
                      <th>Placa</th>
                      <th>Motorista</th>
                      <th>Combustível</th>
                      <th class="text-right">Litros</th>
                      <th class="text-right">Valor/L</th>
                      <th class="text-right">Valor total</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (item of baixaDetailItems(); track item.id_baixa) {
                      <tr>
                        <td>{{ item.abastecimento?.data_hora ? (item.abastecimento?.data_hora | date:'dd/MM/yyyy HH:mm') : '—' }}</td>
                        <td><span class="placa-badge">{{ item.abastecimento?.veiculo?.placa || item.abastecimento?.id_veiculo || '—' }}</span></td>
                        <td>{{ item.abastecimento?.nome_motorista || item.abastecimento?.motorista?.nome || '—' }}</td>
                        <td>{{ item.abastecimento?.tipo_combustivel || '—' }}</td>
                        <td class="text-right">{{ item.abastecimento?.quantidade_litros | number:'1.2-2' }}</td>
                        <td class="text-right">{{ item.abastecimento?.valor_por_litro | currency:'BRL':'symbol':'1.2-2' }}</td>
                        <td class="text-right val-green">{{ item.abastecimento?.valor_total | currency:'BRL':'symbol':'1.2-2' }}</td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            </div>

            <div class="detail-bottom-grid">
              <div class="detail-section">
                <h3>Dados registrados</h3>
                <div class="detail-list">
                  <div><span>Tipo</span><strong>{{ baixaDetalhe.abastecimento?.tipo_despesa || 'Combustível' }}</strong></div>
                  <div><span>Descrição</span><strong>{{ baixaDetalhe.abastecimento?.descricao || '—' }}</strong></div>
                  <div><span>Observação</span><strong>{{ baixaDetalhe.abastecimento?.observacao || '—' }}</strong></div>
                  <div><span>ID da baixa</span><strong class="mono">{{ baixaDetalhe.id_baixa }}</strong></div>
                </div>
              </div>

              <div class="detail-section">
                <h3>Comprovantes</h3>
                @if (getAnexos(baixaAnexo(baixaDetalhe)).length > 0) {
                  <div class="detail-anexo-grid">
                    @for (anexo of getAnexos(baixaAnexo(baixaDetalhe)); track anexo.url; let idx = $index) {
                      <button class="anexo-thumb detail-anexo-thumb" type="button" (click)="openAnexoPreview(anexo.url, idx)">
                        <span class="anexo-thumb-media">
                          @if (anexo.tipo === 'image') {
                            <img [src]="anexo.url" [alt]="anexoLabel(idx, anexo.url)" loading="lazy" />
                          } @else if (anexo.tipo === 'pdf') {
                            @if (anexoThumbUrl(anexo.url); as thumbUrl) {
                              <img [src]="thumbUrl" [alt]="anexoLabel(idx, anexo.url)" loading="lazy" />
                            } @else {
                              <span class="anexo-file-icon">📎</span>
                            }
                            <span class="anexo-type-chip">PDF</span>
                          } @else {
                            <span class="anexo-file-icon">📎</span>
                            <span class="anexo-type-chip">Arquivo</span>
                          }
                        </span>
                        <span class="anexo-thumb-label">{{ anexoLabel(idx, anexo.url) }}</span>
                      </button>
                    }
                  </div>
                } @else {
                  <span class="muted">Sem comprovante anexado</span>
                }
              </div>
            </div>
          </div>
        </div>
      }

      @if (previewImageUrl()) {
        <div class="image-overlay" (click)="closeImagePreview()">
          <div class="image-modal attachment-modal" (click)="$event.stopPropagation()">
            <div class="attachment-modal-header">
              <div>
                <strong>{{ previewTitle() }}</strong>
                <span>{{ previewKindLabel() }}</span>
              </div>
              <button type="button" class="btn-close-image" (click)="closeImagePreview()">Fechar</button>
            </div>
            <div class="attachment-viewer">
              @if (previewKind() === 'image') {
                <img [src]="previewImageUrl()" [alt]="previewTitle()" />
              } @else {
                @if (previewSafeResourceUrl(); as safeUrl) {
                  <iframe [src]="safeUrl" [title]="previewTitle()"></iframe>
                }
              }
            </div>
            <a class="btn-open-external" [href]="previewImageUrl()" target="_blank" rel="noopener noreferrer">Abrir em nova guia</a>
          </div>
        </div>
      }
    </div>
  `,
  styles: [`
    * { box-sizing:border-box; }
    .page { padding:28px; font-family:'Inter',sans-serif; color:#e2e8f0; }
    .page-header { margin-bottom:20px; display:flex; align-items:flex-start; justify-content:space-between; gap:12px; }
    .page-header h1 { font-size:24px; font-weight:700; color:#f8fafc; margin:0; }
    .page-header p { font-size:13px; color:#64748b; margin-top:4px; }

    .stats-row { display:flex; gap:16px; margin-bottom:20px; }
    .stat-card {
      background:#0d1427; border:1px solid #1e2d4a; border-radius:12px;
      padding:16px; flex:1; display:flex; flex-direction:column;
    }
    .stat-card span { font-size:11px; color:#64748b; text-transform:uppercase; letter-spacing:0.5px; }
    .stat-card strong { font-size:18px; color:#f8fafc; margin-top:4px; }

    .card { background:#0d1427; border:1px solid #1e2d4a; border-radius:12px; padding:16px; }
    .card-title { display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; }
    .card-title h3 { margin:0; font-size:14px; color:#f8fafc; }
    .card-title-btns { display:flex; gap:8px; align-items:center; }
    .btn-excel { background:transparent; border:1px solid #16a34a60; border-radius:6px; padding:5px 12px; color:#4ade80; font-size:11px; font-weight:600; cursor:pointer; }
    .btn-excel:hover { border-color:#4ade80; }

    .table-wrap { overflow:auto; }
    .data-table { width:100%; border-collapse:collapse; font-size:12px; }
    .data-table thead th {
      padding:10px 12px; text-align:left; font-size:10px; text-transform:uppercase;
      letter-spacing:0.5px; color:#64748b; border-bottom:1px solid #1e2d4a;
      white-space:nowrap; background:#080e1c;
    }
    .data-table thead th.sortable { cursor:pointer; user-select:none; transition:color 0.15s; }
    .data-table thead th.sortable:hover { color:#38bdf8; }
    .data-table thead th.sortable span { display:inline-block; min-width:12px; color:#38bdf8; }
    .data-table tbody td { padding:10px 12px; border-bottom:1px solid #1e2d4a20; }
    .data-table tbody tr:hover td { background:#1e2d4a15; }
    .clickable-row { cursor:pointer; }
    .clickable-row:hover td { background:#0ea5e912 !important; }
    .active-row td { background:#0ea5e918; }
    .text-right { text-align:right; }
    .val-green { color:#4ade80; font-weight:600; }
    .row-count { display:block; margin-top:3px; color:#94a3b8; font-size:10px; font-weight:600; white-space:nowrap; }
    .anexo-gallery { display:flex; flex-wrap:wrap; gap:8px; min-width:220px; max-width:360px; }
    .anexo-thumb {
      width:86px;
      border:1px solid #1e2d4a;
      border-radius:8px;
      background:#0a0f1e;
      color:#cbd5e1;
      padding:5px;
      cursor:pointer;
      text-align:left;
      transition:border-color 0.15s, transform 0.15s, background 0.15s;
    }
    .anexo-thumb:hover { border-color:#38bdf8; background:#0f172a; transform:translateY(-1px); }
    .anexo-thumb-media {
      position:relative;
      display:block;
      width:100%;
      height:58px;
      border-radius:6px;
      overflow:hidden;
      background:#111827;
      border:1px solid #1e2d4a;
    }
    .anexo-thumb-media img,
    .anexo-thumb-media iframe {
      display:block;
      width:100%;
      height:100%;
      border:0;
      object-fit:cover;
      background:#f8fafc;
      pointer-events:none;
    }
    .anexo-thumb-label {
      display:block;
      margin-top:5px;
      color:#e2e8f0;
      font-size:10px;
      font-weight:700;
      line-height:1.15;
      white-space:normal;
    }
    .anexo-type-chip {
      position:absolute;
      right:4px;
      bottom:4px;
      z-index:2;
      background:#0f172a;
      border:1px solid #334155;
      color:#f8fafc;
      border-radius:999px;
      padding:2px 5px;
      font-size:9px;
      font-weight:800;
      letter-spacing:0.2px;
    }
    .anexo-file-icon,
    .preview-file-icon {
      display:grid;
      place-items:center;
      width:100%;
      height:100%;
      color:#94a3b8;
      font-size:24px;
    }
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
    .row-acoes { display:flex; gap:6px; align-items:center; }
    .btn-edit-sm { background:#0d1b33; border:1px solid #1e3a5f; color:#7dd3fc; border-radius:6px; padding:4px 10px; font-size:11px; cursor:pointer; }
    .btn-edit-sm:hover { border-color:#38bdf8; color:#38bdf8; }
    .modal-edit { max-width:520px; }
    .edit-body { padding:6px 4px 0; }
    .edit-hint { color:#94a3b8; font-size:12px; margin:0 0 12px; }
    .edit-grid { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
    .edit-grid label { display:flex; flex-direction:column; gap:5px; font-size:12px; color:#94a3b8; }
    .edit-grid .edit-full { grid-column:1 / -1; }
    .edit-grid input, .edit-grid select, .edit-grid textarea { background:#0a0f1e; border:1px solid #1e2d4a; border-radius:7px; padding:8px 10px; color:#e2e8f0; font-size:13px; }
    .edit-note { margin:12px 0 0; font-size:11px; color:#64748b; }
    .edit-field-card select, .edit-field-card input, .edit-field-card textarea {
      width:100%; background:#0a0f1e; border:1px solid #2a3b5f; border-radius:7px;
      padding:7px 9px; color:#e2e8f0; font-size:13px; font-weight:600;
    }
    .edit-field-card { outline:1px dashed #1e3a5f33; outline-offset:3px; border-radius:8px; }
    .edit-field-card textarea { resize:vertical; }
    .edit-list { gap:12px; }
    .anexo-edit-wrap { position:relative; display:inline-block; }
    .anexo-del {
      position:absolute; top:-7px; right:-7px; width:22px; height:22px; border-radius:50%;
      border:1px solid #7f1d1d; background:#dc2626; color:#fff; font-size:12px; font-weight:700;
      line-height:1; cursor:pointer; display:flex; align-items:center; justify-content:center; padding:0; z-index:3;
    }
    .anexo-del:hover { background:#ef4444; }
    .anexo-del:disabled { opacity:0.5; cursor:wait; }
    .cell-input { width:100%; min-width:84px; background:#0a0f1e; border:1px solid #2a3b5f; border-radius:6px; padding:5px 7px; color:#e2e8f0; font-size:12px; }
    .cell-input.cell-num { text-align:right; }
    .edit-row td { vertical-align:middle; }
    .cell-readonly { color:#64748b; font-size:12px; }
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
    .baixa-detail-modal { width:min(1180px,94vw); }
    .baixa-detail-header p { margin:4px 0 0; color:#94a3b8; font-size:12px; }
    .detail-summary-grid {
      display:grid;
      grid-template-columns:repeat(4,minmax(0,1fr));
      gap:10px;
      margin-bottom:12px;
    }
    .detail-summary-card {
      border:1px solid #1e2d4a;
      border-radius:12px;
      padding:12px;
      background:#0d1427;
      min-width:0;
    }
    .detail-summary-card span,
    .detail-meta-grid span,
    .detail-list span {
      display:block;
      color:#94a3b8;
      font-size:10px;
      font-weight:800;
      letter-spacing:0.4px;
      text-transform:uppercase;
      margin-bottom:4px;
    }
    .detail-summary-card strong {
      display:block;
      color:#f8fafc;
      font-size:18px;
      line-height:1.2;
      overflow:hidden;
      text-overflow:ellipsis;
      white-space:nowrap;
    }
    .detail-summary-card:nth-child(2) strong,
    .detail-summary-card:nth-child(3) strong { color:#4ade80; }
    .detail-meta-grid {
      display:grid;
      grid-template-columns:repeat(4,minmax(0,1fr));
      gap:10px;
      margin-bottom:12px;
    }
    .detail-meta-grid > div {
      border:1px solid #1e2d4a;
      border-radius:10px;
      padding:10px 12px;
      background:#0a0f1e;
      min-width:0;
    }
    .detail-meta-grid strong,
    .detail-list strong {
      display:block;
      color:#e2e8f0;
      font-size:12px;
      line-height:1.35;
      overflow-wrap:anywhere;
    }
    .detail-section {
      border:1px solid #1e2d4a;
      border-radius:12px;
      background:#0d1427;
      padding:14px;
      min-width:0;
    }
    .detail-section h3 {
      margin:0 0 10px;
      color:#f8fafc;
      font-size:14px;
    }
    .detail-table-wrap { overflow:auto; }
    .detail-table tbody td { background:#0a0f1e; }
    .detail-bottom-grid {
      display:grid;
      grid-template-columns:minmax(0,1.15fr) minmax(280px,0.85fr);
      gap:12px;
      margin-top:12px;
    }
    .detail-list {
      display:grid;
      grid-template-columns:repeat(2,minmax(0,1fr));
      gap:10px;
    }
    .detail-list > div {
      border:1px solid #1e2d4a;
      border-radius:9px;
      padding:10px;
      background:#0a0f1e;
      min-width:0;
    }
    .mono { font-family:Consolas, 'Courier New', monospace; font-size:11px !important; }
    .detail-anexo-grid { display:flex; flex-wrap:wrap; gap:8px; }
    .detail-anexo-thumb { width:112px; }
    .detail-anexo-thumb .anexo-thumb-media { height:76px; }
    .acerto-summary { background:#4ade8015; border:1px solid #4ade8030; border-radius:12px; padding:14px 16px; margin-bottom:12px; display:flex; justify-content:space-between; align-items:center; gap:12px; }
    .acerto-summary span { display:block; color:#94a3b8; font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:0.5px; }
    .acerto-summary strong { display:block; color:#4ade80; font-size:22px; line-height:1.2; margin-top:2px; }
    .acerto-summary small { color:#cbd5e1; font-size:12px; white-space:nowrap; }

    .filters-card { background:#0d1427; border:1px solid #1e2d4a; border-radius:12px; padding:12px; margin-bottom:12px; }
    .btn-clear { margin-top:10px; background:transparent; border:1px solid #1e2d4a; color:#64748b; padding:6px 14px; border-radius:6px; font-size:12px; cursor:pointer; }
    .btn-clear:hover { border-color:#94a3b8; color:#94a3b8; }
    .filters-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(180px,1fr)); gap:10px; }
    .filter-field { display:flex; flex-direction:column; gap:4px; }
    .filter-field label { font-size:11px; font-weight:600; color:#64748b; text-transform:uppercase; letter-spacing:0.5px; }
    .filter-field input, .filter-field select { background:#0a0f1e; border:1px solid #1e2d4a; border-radius:7px; padding:8px 10px; color:#e2e8f0; font-size:12px; outline:none; }
    .autocomplete-field { position:relative; }
    .autocomplete-field input { width:100%; padding-right:34px; }
    .btn-clear-field {
      position:absolute; right:6px; top:50%; transform:translateY(-50%);
      width:22px; height:22px; border:none; border-radius:5px; background:#1e2d4a;
      color:#cbd5e1; cursor:pointer; line-height:1; font-size:15px;
    }
    .btn-clear-field:hover { background:#334155; color:#fff; }
    .autocomplete-list {
      position:absolute; z-index:30; top:calc(100% + 4px); left:0; right:0;
      max-height:220px; overflow:auto; background:#0a0f1e; border:1px solid #1e2d4a;
      border-radius:8px; box-shadow:0 16px 40px rgba(2,6,23,0.35); padding:4px;
    }
    .autocomplete-item {
      width:100%; border:none; background:transparent; color:#e2e8f0; text-align:left;
      padding:8px 9px; border-radius:6px; font-size:12px; cursor:pointer;
    }
    .autocomplete-item:hover { background:#1e2d4a; }
    .placa-option { font-family:monospace; font-weight:700; color:#38bdf8; }

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
    .date-row input { flex:1; min-width:0; }
    .btn-date { height:34px; min-width:40px; padding:0 10px; background:#0a0f1e; border:1px solid #1e2d4a; border-radius:7px; color:#94a3b8; cursor:pointer; font-size:14px; }
    .btn-date:hover { border-color:#38bdf8; color:#38bdf8; }

    .upload-hint { color:#94a3b8; font-size:11px; }
    .anexos-panel { border:1px solid #1e2d4a; border-radius:12px; padding:12px; background:#0a0f1e; }
    .anexos-header { display:flex; align-items:center; justify-content:space-between; gap:10px; flex-wrap:wrap; }
    .anexos-header strong { display:block; color:#f8fafc; font-size:13px; }
    .anexos-header span { display:block; color:#94a3b8; font-size:11px; margin-top:2px; }
    .btn-add-anexo {
      display:inline-flex; align-items:center; justify-content:center; gap:6px;
      background:#e0f2fe; border:1px solid #38bdf8; color:#0f172a;
      border-radius:8px; padding:8px 12px; font-size:12px; font-weight:700;
      cursor:pointer; white-space:nowrap;
    }
    .btn-add-anexo input { display:none; }
    .btn-add-anexo.disabled { opacity:0.55; cursor:not-allowed; }
    .preview-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:8px; margin-top:8px; }
    .preview-card { border:1px solid #1e2d4a; border-radius:10px; padding:6px; background:#0a0f1e; min-width:0; }
    .preview-media-btn {
      position:relative;
      display:block;
      width:100%;
      height:96px;
      padding:0;
      border:0;
      border-radius:8px;
      overflow:hidden;
      background:#0d1427;
      cursor:pointer;
    }
    .preview-img,
    .preview-frame {
      display:block;
      width:100%;
      height:100%;
      object-fit:cover;
      border:0;
      background:#f8fafc;
      pointer-events:none;
    }
    .preview-name {
      display:block;
      margin-top:6px;
      color:#e2e8f0;
      font-size:11px;
      line-height:1.2;
    }
    .preview-actions { display:flex; gap:4px; margin-top:6px; flex-wrap:wrap; }
    .btn-preview { background:#0a0f1e; border:1px solid #1e2d4a; color:#38bdf8; padding:5px 8px; border-radius:8px; font-size:11px; cursor:pointer; width:fit-content; }
    .btn-preview:hover { border-color:#38bdf8; }
    .btn-remove-preview { background:#3f1d22; border:1px solid #7f1d1d; color:#fecaca; padding:5px 8px; border-radius:8px; font-size:11px; cursor:pointer; }

    .image-overlay { position:fixed; inset:0; background:rgba(2,6,23,0.9); display:flex; align-items:center; justify-content:center; z-index:1100; padding:20px; }
    .image-modal { width:min(94vw,1120px); max-height:92vh; display:flex; flex-direction:column; gap:12px; align-items:stretch; }
    .attachment-modal {
      background:#0a0f1e;
      border:1px solid #1e2d4a;
      border-radius:14px;
      padding:14px;
      box-shadow:0 28px 80px rgba(0,0,0,0.45);
    }
    .attachment-modal-header { display:flex; align-items:center; justify-content:space-between; gap:12px; }
    .attachment-modal-header strong { display:block; color:#f8fafc; font-size:15px; }
    .attachment-modal-header span { display:block; color:#94a3b8; font-size:12px; margin-top:2px; }
    .attachment-viewer {
      width:100%;
      height:min(78vh,760px);
      border:1px solid #1e2d4a;
      border-radius:12px;
      overflow:hidden;
      background:#020617;
      display:grid;
      place-items:center;
    }
    .attachment-viewer img { width:auto; max-width:100%; max-height:100%; object-fit:contain; }
    .attachment-viewer iframe { width:100%; height:100%; border:0; background:#fff; }
    .btn-close-image { background:#0a0f1e; border:1px solid #1e2d4a; color:#e2e8f0; padding:8px 14px; border-radius:8px; cursor:pointer; font-size:12px; }
    .btn-close-image:hover { border-color:#38bdf8; color:#38bdf8; }
    .btn-open-external {
      align-self:flex-end;
      color:#38bdf8;
      text-decoration:none;
      font-size:12px;
      font-weight:700;
      border:1px solid #1e2d4a;
      border-radius:8px;
      padding:7px 12px;
      background:#0f172a;
    }
    .btn-open-external:hover { border-color:#38bdf8; }

    @media (max-width: 900px) {
      .detail-summary-grid,
      .detail-meta-grid,
      .detail-bottom-grid,
      .detail-list { grid-template-columns:1fr; }
      .baixa-detail-modal { width:96vw; }
    }
  `]
})
export class BaixaComponent implements OnInit {
  private api = inject(ApiService);
  private auth = inject(AuthService);
  private toastr = inject(ToastrService);
  private fb = inject(FormBuilder);
  private sanitizer = inject(DomSanitizer);
  private excel = inject(ExcelExportService);
  private pdfThumbnails = inject(PdfThumbnailService);

  isAdmin(): boolean {
    return this.auth.isAdmin();
  }

  // Edição de baixa (admin)
  editandoBaixa = signal<any | null>(null);
  editandoBusy = signal(false);
  editForm: { forma_pagamento: string; data_pagamento: string; data_baixa: string; usuario: string; tipo_despesa: string; recebedor: string; descricao: string; observacao: string } = {
    forma_pagamento: '', data_pagamento: '', data_baixa: '', usuario: '', tipo_despesa: '', recebedor: '', descricao: '', observacao: ''
  };
  removendoComprovanteUrl = signal<string | null>(null);

  exportExcel() {
    const grupos = this.sortedBaixas();
    const rows: Record<string, any>[] = [];
    for (const g of grupos) {
      for (const item of this.baixaItems(g)) {
        const a = item?.abastecimento ?? {};
        rows.push({
          'Data Baixa': item?.data_hora ? String(item.data_hora).slice(0, 10).split('-').reverse().join('/') : '',
          'Empresa': a.nome_proprietario || a.proprietario?.nome || '',
          'Placa': a.veiculo?.placa ?? '',
          'Motorista': a.nome_motorista || a.motorista?.nome || '',
          'Data Abastecimento': a.data_hora ? String(a.data_hora).slice(0, 10).split('-').reverse().join('/') : '',
          'Qtd (L)': Number(a.quantidade_litros ?? 0),
          'Total (R$)': Number(a.valor_total ?? 0),
          'Forma Pgto': item?.forma_pagamento ?? '',
          'Data Pgto': item?.data_pagamento ? String(item.data_pagamento).slice(0, 10).split('-').reverse().join('/') : '',
          'Recebedor': a.recebedor ?? '',
          'Tipo': a.tipo_despesa ?? '',
          'Descrição': a.descricao ?? '',
          'Observação': a.observacao ?? '',
          'Usuário': item?.usuario ?? '',
        });
      }
    }
    if (!rows.length) {
      this.toastr.warning('Nada para exportar com os filtros atuais.');
      return;
    }
    this.excel.export(`baixas_${new Date().toISOString().slice(0, 10)}`, rows, 'Baixas');
    this.toastr.success(`${rows.length} linha(s) exportada(s).`);
  }

  baixas = signal<any[]>([]);
  sortColumn = signal<string>('data_hora');
  sortDirection = signal<'asc' | 'desc'>('desc');
  loadingBaixas = signal(true);
  showNovaBaixaModal = signal(false);
  selectedBaixa = signal<any | null>(null);

  pendentes = signal<Abastecimento[]>([]);
  proprietarios = signal<Proprietario[]>([]);
  veiculos = signal<Veiculo[]>([]);
  motoristas = signal<Motorista[]>([]);
  // Edição inline das linhas de abastecimento (id_abastecimento -> campos)
  editAbastRows = signal<Record<string, {
    data_hora: string;
    tipo_combustivel: string;
    quantidade_litros: number;
    id_veiculo: string;
    id_motorista: string;
    placa_label?: string;
    motorista_label?: string;
    valor_por_litro: number;
  }>>({});
  selected = signal<Set<string>>(new Set());
  loadingPendentes = signal(false);
  saving = signal(false);
  deletingBaixaId = signal<string | null>(null);
  uploadingAnexo = signal(false);
  previewImageUrl = signal('');
  previewKind = signal<AnexoTipo>('image');
  previewTitle = signal('');
  private previewObjectUrl = '';
  empresaBusca = signal('');
  placaBusca = signal('');
  showEmpresaOptions = signal(false);
  showPlacaOptions = signal(false);

  // Filtros do histórico de baixas
  histEmpresa = signal('');
  histPlaca = signal('');
  histFormaPgto = signal('');
  histRecebedor = signal('');
  histDataInicio = signal('');
  histDataFim = signal('');
  histValor = signal('');

  temFiltrosHistorico = computed(() => !!(
    this.histEmpresa().trim() || this.histPlaca().trim() || this.histFormaPgto() ||
    this.histDataInicio() || this.histDataFim() || this.histValor().trim() ||
    this.histRecebedor().trim()
  ));

  formasPagamentoDisponiveis = computed(() =>
    Array.from(new Set(
      this.baixas().map(b => String(b?.forma_pagamento ?? '').trim()).filter(Boolean)
    )).sort((a, b) => a.localeCompare(b, 'pt-BR'))
  );

  recebedoresDisponiveis = computed(() => ['VIPE TRANSPORTES MULTIMODAIS LTDA', 'Augusto']);

  filteredBaixaGroups = computed(() => {
    const empresa = this.normalizeText(this.histEmpresa());
    const placa = this.normalizePlate(this.histPlaca());
    const forma = this.normalizeText(this.histFormaPgto());
    const recebedor = this.normalizeText(this.histRecebedor());
    const di = this.histDataInicio();
    const df = this.histDataFim();
    const valor = this.parseValorFiltro(this.histValor());

    return this.baixaGroups().filter(g => {
      const items = this.baixaItems(g);
      if (empresa) {
        const empresas = items.map(i => this.normalizeText(
          i?.abastecimento?.nome_proprietario || i?.abastecimento?.proprietario?.nome
        ));
        if (!empresas.some(e => e.includes(empresa))) return false;
      }
      if (placa) {
        const placas = items.map(i => this.normalizePlate(i?.abastecimento?.veiculo?.placa));
        if (!placas.some(p => p.includes(placa))) return false;
      }
      if (forma && this.normalizeText(g?.forma_pagamento) !== forma) return false;
      if (recebedor) {
        const recebedores = items.map(i => this.normalizeText(i?.abastecimento?.recebedor || i?.recebedor));
        if (!recebedores.some(r => r.includes(recebedor))) return false;
      }
      const dataISO = g?.data_hora ? String(g.data_hora).slice(0, 10) : '';
      if (di && (!dataISO || dataISO < di)) return false;
      if (df && (!dataISO || dataISO > df)) return false;
      if (valor != null && Math.abs(this.baixaTotal(g) - valor) >= 0.005) return false;
      return true;
    });
  });

  totalLitros = computed(() =>
    this.sortedBaixas().reduce((acc, g) =>
      acc + this.baixaItems(g).reduce((sum, i) => sum + this.toNumber(i?.abastecimento?.quantidade_litros), 0)
    , 0)
  );

  totalValor = computed(() =>
    this.sortedBaixas().reduce((acc, g) => acc + this.baixaTotal(g), 0)
  );

  previewSafeResourceUrl = computed<SafeResourceUrl | null>(() => {
    const url = this.previewImageUrl();
    return url ? this.sanitizer.bypassSecurityTrustResourceUrl(url) : null;
  });

  totalSelecionado = computed(() =>
    this.pendentes()
      .filter((a) => this.selected().has(a.id_abastecimento))
      .reduce((acc, a) => acc + this.toNumber(a.valor_total), 0)
  );

  baixaGroups = computed(() => {
    const groups = new Map<string, any[]>();
    for (const baixa of this.baixas()) {
      const key = this.baixaBatchKey(baixa);
      const items = groups.get(key) ?? [];
      items.push(baixa);
      groups.set(key, items);
    }

    return Array.from(groups.entries()).map(([key, items]) => {
      const ordered = this.sortBaixaItems(items);
      return {
        ...ordered[0],
        __group_id: key,
        __items: ordered,
      };
    });
  });

  sortedBaixas = computed(() => {
    const column = this.sortColumn();
    const direction = this.sortDirection() === 'asc' ? 1 : -1;
    return [...this.filteredBaixaGroups()].sort((a, b) => {
      const left = this.sortValue(a, column);
      const right = this.sortValue(b, column);
      if (typeof left === 'number' && typeof right === 'number') {
        return (left - right) * direction;
      }
      return String(left).localeCompare(String(right), 'pt-BR', { sensitivity: 'base' }) * direction;
    });
  });

  baixaDetailItems = computed(() => {
    const selected = this.selectedBaixa();
    if (!selected) return [];
    if (Array.isArray(selected.__items)) return this.sortBaixaItems(selected.__items);
    const key = this.baixaBatchKey(selected);
    return this.baixas()
      .filter((baixa) => this.baixaBatchKey(baixa) === key)
      .sort((a, b) => this.baixaItemTime(a) - this.baixaItemTime(b));
  });

  baixaDetailTotal = computed(() =>
    this.baixaDetailItems().reduce((total, baixa) => total + this.toNumber(baixa?.abastecimento?.valor_total), 0)
  );

  baixaDetailLitros = computed(() =>
    this.baixaDetailItems().reduce((total, baixa) => total + this.toNumber(baixa?.abastecimento?.quantidade_litros), 0)
  );

  filters: any = { id_proprietario: '', placa: '', data_inicio: '', data_fim: '' };

  filteredEmpresas = computed(() => {
    const term = this.normalizeText(this.empresaBusca());
    const list = this.proprietarios();
    if (!term) return list.slice(0, 40);
    return list
      .filter((p) => this.normalizeText(p.nome).includes(term))
      .slice(0, 40);
  });

  filteredPlacas = computed(() => {
    const term = this.normalizePlate(this.placaBusca());
    const placas = new Set<string>();
    for (const v of this.veiculos()) {
      if (v.placa) placas.add(this.normalizePlate(v.placa));
    }
    for (const a of this.pendentes()) {
      const placa = a.veiculo?.placa;
      if (placa) placas.add(this.normalizePlate(placa));
    }
    const list = Array.from(placas).filter(Boolean).sort();
    if (!term) return list.slice(0, 40);
    return list.filter((placa) => placa.includes(term)).slice(0, 40);
  });

  form = this.fb.group({
    data_baixa: [new Date().toISOString().slice(0, 10)],
    tipo_despesa: ['Combustível'],
    descricao: [''],
    forma_pagamento: [''],
    data_pagamento: [''],
    recebedor: ['VIPE TRANSPORTES MULTIMODAIS LTDA'],
    recebedor_outros: [''],
    observacao: [''],
    anexo: [''],
    anexos: [[] as string[]],
  });

  ngOnInit() {
    this.api.getProprietariosAll().subscribe(r => this.proprietarios.set(r.data));
    this.api.getVeiculos({ per_page: 5000 }).subscribe(r => this.veiculos.set(r.data));
    this.api.getMotoristas({ per_page: 5000 }).subscribe(r => this.motoristas.set(r.data));
    this.loadBaixas();
  }

  loadBaixas() {
    this.loadingBaixas.set(true);
    this.api.getBaixasAll().subscribe({
      next: (baixas) => {
        this.baixas.set(baixas);
        this.loadingBaixas.set(false);
      },
      error: () => {
        this.loadingBaixas.set(false);
      }
    });
  }

  sortBy(column: string) {
    if (this.sortColumn() === column) {
      this.sortDirection.set(this.sortDirection() === 'asc' ? 'desc' : 'asc');
      return;
    }
    this.sortColumn.set(column);
    this.sortDirection.set(column.includes('data') ? 'desc' : 'asc');
  }

  sortIcon(column: string): string {
    if (this.sortColumn() !== column) return '';
    return this.sortDirection() === 'asc' ? '↑' : '↓';
  }

  private sortValue(baixa: any, column: string): string | number {
    switch (column) {
      case 'data_hora':
        return baixa?.data_hora ? new Date(baixa.data_hora).getTime() : 0;
      case 'empresa':
        return this.baixaEmpresa(baixa);
      case 'placa':
        return this.baixaPlacas(baixa);
      case 'motorista':
        return this.baixaMotoristas(baixa);
      case 'forma_pagamento':
        return baixa?.forma_pagamento || '';
      case 'data_pagamento':
        return baixa?.data_pagamento ? new Date(baixa.data_pagamento).getTime() : 0;
      case 'valor':
        return this.baixaTotal(baixa);
      default:
        return '';
    }
  }

  openNovaBaixa() {
    this.showNovaBaixaModal.set(true);
    this.syncBuscaFromFilters();
    this.pendentes.set([]);
    this.selected.set(new Set());
  }

  closeNovaBaixa() {
    this.showNovaBaixaModal.set(false);
    this.selected.set(new Set());
  }

  openBaixaDetails(baixa: any) {
    this.selectedBaixa.set(baixa);
  }

  closeBaixaDetails() {
    this.selectedBaixa.set(null);
  }

  baixaEmpresa(baixa: any): string {
    return baixa?.abastecimento?.nome_proprietario
      || baixa?.abastecimento?.proprietario?.nome
      || '—';
  }

  baixaItems(baixa: any): any[] {
    if (!baixa) return [];
    return Array.isArray(baixa.__items) ? baixa.__items : [baixa];
  }

  baixaGroupId(baixa: any): string {
    return baixa?.__group_id || this.baixaBatchKey(baixa);
  }

  baixaPlacas(baixa: any): string {
    return this.uniqueBaixaTexts(
      this.baixaItems(baixa).map((item) => item?.abastecimento?.veiculo?.placa)
    );
  }

  baixaMotoristas(baixa: any): string {
    return this.uniqueBaixaTexts(
      this.baixaItems(baixa).map((item) => item?.abastecimento?.nome_motorista || item?.abastecimento?.motorista?.nome)
    );
  }

  baixaTotal(baixa: any): number {
    return this.baixaItems(baixa).reduce(
      (total, item) => total + this.toNumber(item?.abastecimento?.valor_total),
      0
    );
  }

  baixaAnexo(baixa: any): string | string[] | null {
    const item = this.baixaItems(baixa).find((candidate) => this.getAnexos(candidate?.abastecimento?.anexo).length > 0);
    return item?.abastecimento?.anexo ?? null;
  }

  private baixaBatchKey(baixa: any): string {
    const abastecimento = baixa?.abastecimento ?? {};
    const explicitBatch = String(baixa?.nota_entrada ?? '').trim();
    if (explicitBatch) {
      return `batch:${explicitBatch}`;
    }

    return [
      this.minuteKey(baixa?.data_hora),
      this.minuteKey(abastecimento?.data_baixa),
      baixa?.usuario,
      baixa?.forma_pagamento,
      this.minuteKey(baixa?.data_pagamento),
      this.baixaEmpresa(baixa),
      abastecimento?.anexo,
      abastecimento?.observacao,
      abastecimento?.descricao,
      abastecimento?.recebedor,
    ].map((value) => String(value ?? '').trim()).join('|');
  }

  loadPendentes() {
    if (!this.filters.id_proprietario) {
      this.pendentes.set([]);
      this.selected.set(new Set());
      this.loadingPendentes.set(false);
      return;
    }
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

  private normalizeText(value: unknown): string {
    return String(value ?? '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  }

  private parseValorFiltro(raw: string): number | null {
    let texto = raw.trim().replace(/R\$\s?/g, '');
    if (!texto) return null;
    if (texto.includes(',')) {
      texto = texto.replace(/\./g, '').replace(',', '.');
    }
    const n = Number(texto);
    return Number.isFinite(n) ? n : null;
  }

  limparFiltrosHistorico() {
    this.histEmpresa.set('');
    this.histPlaca.set('');
    this.histFormaPgto.set('');
    this.histRecebedor.set('');
    this.histDataInicio.set('');
    this.histDataFim.set('');
    this.histValor.set('');
  }

  private normalizePlate(value: unknown): string {
    return String(value ?? '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  }

  private uniqueBaixaTexts(values: unknown[]): string {
    const unique = Array.from(new Set(
      values
        .map((value) => String(value ?? '').trim())
        .filter(Boolean)
    ));
    if (unique.length === 0) return '—';
    if (unique.length <= 2) return unique.join(', ');
    return `${unique.length} itens`;
  }

  private minuteKey(value: unknown): string {
    const raw = String(value ?? '').trim();
    if (!raw) return '';
    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) return raw.slice(0, 16);
    parsed.setSeconds(0, 0);
    return parsed.toISOString().slice(0, 16);
  }

  private baixaItemTime(baixa: any): number {
    const raw = baixa?.abastecimento?.data_hora || baixa?.data_hora || baixa?.abastecimento?.data || '';
    const parsed = new Date(raw);
    return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime();
  }

  private sortBaixaItems(items: any[]): any[] {
    return [...items].sort((a, b) => this.baixaItemTime(a) - this.baixaItemTime(b));
  }

  private syncBuscaFromFilters() {
    const empresa = this.proprietarios().find((p) => p.id_proprietario === this.filters.id_proprietario);
    this.empresaBusca.set(empresa?.nome ?? '');
    this.placaBusca.set(this.filters.placa ?? '');
  }

  onEmpresaBuscaChange(event: Event) {
    const value = (event.target as HTMLInputElement).value;
    this.empresaBusca.set(value);
    this.showEmpresaOptions.set(true);

    const exact = this.proprietarios().find((p) => this.normalizeText(p.nome) === this.normalizeText(value));
    this.filters.id_proprietario = exact?.id_proprietario ?? '';
    this.selected.set(new Set());
    this.loadPendentes();
  }

  selectEmpresa(proprietario: Proprietario) {
    this.filters.id_proprietario = proprietario.id_proprietario;
    this.empresaBusca.set(proprietario.nome);
    this.showEmpresaOptions.set(false);
    this.selected.set(new Set());
    this.loadPendentes();
  }

  clearEmpresa() {
    this.filters.id_proprietario = '';
    this.empresaBusca.set('');
    this.showEmpresaOptions.set(false);
    this.pendentes.set([]);
    this.selected.set(new Set());
  }

  closeEmpresaOptions() {
    setTimeout(() => this.showEmpresaOptions.set(false), 120);
  }

  onPlacaBuscaChange(event: Event) {
    const value = (event.target as HTMLInputElement).value.toUpperCase();
    this.placaBusca.set(value);
    this.filters.placa = value.trim();
    this.showPlacaOptions.set(true);
    this.loadPendentes();
  }

  selectPlaca(placa: string) {
    this.placaBusca.set(placa);
    this.filters.placa = placa;
    this.showPlacaOptions.set(false);
    this.loadPendentes();
  }

  clearPlaca() {
    this.placaBusca.set('');
    this.filters.placa = '';
    this.showPlacaOptions.set(false);
    this.loadPendentes();
  }

  closePlacaOptions() {
    setTimeout(() => this.showPlacaOptions.set(false), 120);
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
      normalized.startsWith('data:application/pdf') ||
      normalized.startsWith('blob:')
    ) {
      return normalized;
    }
    return null;
  }

  safeResourceUrl(url?: string | null): SafeResourceUrl | null {
    const resolved = this.resolveImageUrl(url);
    return resolved ? this.sanitizer.bypassSecurityTrustResourceUrl(resolved) : null;
  }

  anexoThumbUrl(url?: string | null): string | null {
    const resolved = this.resolveImageUrl(url);
    if (!resolved) return null;
    if (this.anexoKind(resolved) === 'image') return resolved;
    if (this.anexoKind(resolved) !== 'pdf') return null;
    if (resolved.includes('/duei0rf3b/')) return this.pdfThumbnails.get(resolved);
    return this.cloudinaryPdfPreviewUrl(resolved);
  }

  anexoKind(url?: string | null): AnexoTipo {
    const resolved = this.resolveImageUrl(url);
    if (!resolved) return 'file';
    if (resolved.startsWith('data:image/')) return 'image';
    if (resolved.startsWith('data:application/pdf')) return 'pdf';

    const path = this.urlPath(resolved);
    if (/\.(png|jpe?g|webp|gif|bmp|svg)$/i.test(path)) return 'image';
    if (/\.pdf$/i.test(path)) return 'pdf';
    return 'file';
  }

  getAnexos(value?: string | string[] | null): AnexoBaixaView[] {
    return this.getAnexoUrls(value).map((url) => ({
      url,
      tipo: this.anexoKind(url),
    }));
  }

  anexoLabel(index: number, url?: string | null): string {
    const kind = this.anexoKind(url);
    const suffix = kind === 'pdf' ? 'PDF' : kind === 'image' ? 'imagem' : 'arquivo';
    return `Comprovante ${index + 1} (${suffix})`;
  }

  previewKindLabel(): string {
    const kind = this.previewKind();
    if (kind === 'pdf') return 'Documento PDF';
    if (kind === 'image') return 'Imagem';
    return 'Arquivo';
  }

  private urlPath(url: string): string {
    try {
      return new URL(url).pathname.toLowerCase();
    } catch {
      return url.split('?')[0].split('#')[0].toLowerCase();
    }
  }

  private cloudinaryPdfPreviewUrl(url: string): string | null {
    try {
      const parsed = new URL(url);
      if (!parsed.hostname.endsWith('res.cloudinary.com')) return null;

      const uploadMarker = '/image/upload/';
      const markerIndex = parsed.pathname.indexOf(uploadMarker);
      if (markerIndex === -1) return null;

      const prefix = parsed.pathname.slice(0, markerIndex + uploadMarker.length);
      const assetPath = parsed.pathname
        .slice(markerIndex + uploadMarker.length)
        .replace(/\.pdf$/i, '.jpg');

      parsed.pathname = `${prefix}pg_1/c_fill,h_220,w_320/f_jpg/q_auto/${assetPath}`;
      return parsed.toString();
    } catch {
      return null;
    }
  }

  getAnexoUrls(value?: string | string[] | null): string[] {
    if (Array.isArray(value)) {
      return value.map((url) => this.resolveImageUrl(url)).filter((url): url is string => !!url).slice(0, 4);
    }
    const raw = String(value ?? '').trim();
    if (!raw) return [];
    if (raw.startsWith('[')) {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          return parsed.map((url) => this.resolveImageUrl(url)).filter((url): url is string => !!url).slice(0, 4);
        }
      } catch {}
    }
    const single = this.resolveImageUrl(raw);
    return single ? [single] : [];
  }

  formAnexos(): string[] {
    return this.getAnexoUrls(this.form.value.anexos as string[] | undefined);
  }

  private setFormAnexos(anexos: string[]) {
    const normalized = anexos.map((url) => this.resolveImageUrl(url)).filter((url): url is string => !!url).slice(0, 4);
    this.form.patchValue({
      anexos: normalized,
      anexo: normalized[0] ?? '',
    });
  }

  onSubmit() {
    if (this.selected().size === 0) {
      this.toastr.warning('Selecione ao menos um abastecimento');
      return;
    }
    if (!this.filters.id_proprietario) {
      this.toastr.warning('Selecione a empresa antes de registrar a baixa');
      return;
    }

    this.saving.set(true);
    const payload = {
      ...this.form.value,
      recebedor: this.form.value.recebedor,
      ids: Array.from(this.selected()),
      anexos: this.formAnexos(),
      anexo: this.formAnexos()[0] ?? '',
    };

    this.api.createBaixaLote(payload).subscribe({
      next: (r: any) => {
        this.toastr.success(r.message ?? 'Baixas registradas com sucesso!');
        this.selected.set(new Set());
        this.form.patchValue({
          data_baixa: new Date().toISOString().slice(0, 10),
          tipo_despesa: 'Combustível',
          recebedor: 'VIPE TRANSPORTES MULTIMODAIS LTDA',
          recebedor_outros: '',
          observacao: '',
          anexo: '',
          anexos: [],
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
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    if (files.length === 0) return;
    const current = this.formAnexos();
    const slots = Math.max(0, 4 - current.length);
    const selectedFiles = files.slice(0, slots);
    if (selectedFiles.length === 0) {
      this.toastr.warning('Limite de 4 comprovantes atingido');
      input.value = '';
      return;
    }
    this.uploadingAnexo.set(true);
    const uploaded = [...current];
    const uploadNext = (index: number) => {
      if (index >= selectedFiles.length) {
        this.setFormAnexos(uploaded);
        this.uploadingAnexo.set(false);
        input.value = '';
        this.toastr.success(`${selectedFiles.length} comprovante(s) enviado(s)`);
        return;
      }
      this.api.uploadToDrive(selectedFiles[index]).subscribe({
        next: (res) => {
          const url = res?.file?.downloadUrl || res?.file?.webViewLink || '';
          if (url) uploaded.push(url);
          uploadNext(index + 1);
        },
        error: (err) => {
          this.toastr.error(err.error?.message ?? 'Erro no upload do anexo');
          this.uploadingAnexo.set(false);
          input.value = '';
        }
      });
    };
    uploadNext(0);
  }

  removeAnexo(index: number) {
    const anexos = this.formAnexos();
    anexos.splice(index, 1);
    this.setFormAnexos(anexos);
  }

  openImagePreview(url?: string | null) {
    this.openAnexoPreview(url);
  }

  openAnexoPreview(url?: string | null, index = 0) {
    const imageUrl = this.resolveImageUrl(url);
    if (!imageUrl) return;
    const kind = this.anexoKind(imageUrl);
    this.previewKind.set(kind);
    this.previewTitle.set(this.anexoLabel(index, imageUrl));

    if (!this.isCloudinaryUrl(imageUrl)) {
      this.previewImageUrl.set(imageUrl);
      return;
    }

    this.api.downloadCloudinaryMedia(imageUrl).subscribe({
      next: (blob) => {
        this.revokePreviewObjectUrl();
        this.previewObjectUrl = URL.createObjectURL(blob);
        this.previewImageUrl.set(this.previewObjectUrl);
      },
      error: (err) => {
        this.toastr.error(err?.error?.message ?? 'Não foi possível abrir o arquivo.');
      },
    });
  }

  closeImagePreview() {
    this.previewImageUrl.set('');
    this.previewTitle.set('');
    this.previewKind.set('image');
    this.revokePreviewObjectUrl();
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

  deleteBaixa(idBaixa: string) {
    const baixa = this.baixas().find((item) => item.id_baixa === idBaixa);
    this.deleteBaixaGroup(baixa ?? { id_baixa: idBaixa });
  }

  abrirEdicaoBaixa(baixa: any, event?: Event) {
    event?.stopPropagation();
    const item = this.baixaItems(baixa)[0] ?? baixa;
    const abast = item?.abastecimento ?? {};
    this.editForm = {
      forma_pagamento: item?.forma_pagamento ?? baixa?.forma_pagamento ?? '',
      data_pagamento: this.toDateInput(item?.data_pagamento ?? baixa?.data_pagamento),
      data_baixa: this.toDateInput(abast?.data_baixa ?? item?.data_hora ?? baixa?.data_hora),
      usuario: item?.usuario ?? baixa?.usuario ?? '',
      tipo_despesa: abast?.tipo_despesa ?? 'Combustível',
      recebedor: abast?.recebedor ?? '',
      descricao: abast?.descricao ?? '',
      observacao: abast?.observacao ?? '',
    };

    // Estado editável de cada abastecimento da baixa.
    const rows: Record<string, any> = {};
    for (const it of this.baixaItems(baixa)) {
      const a = it?.abastecimento ?? {};
      const id = String(a?.id_abastecimento ?? '').trim();
      if (!id) continue;
      rows[id] = {
        data_hora: this.toDateTimeInput(a?.data_hora),
        tipo_combustivel: a?.tipo_combustivel ?? '',
        quantidade_litros: this.toNumber(a?.quantidade_litros),
        id_veiculo: this.resolveVeiculoId(a),
        id_motorista: this.resolveMotoristaId(a),
        placa_label: a?.veiculo?.placa ?? a?.placa ?? a?.placa1 ?? '',
        motorista_label: a?.motorista?.nome ?? a?.nome_motorista ?? '',
        valor_por_litro: this.toNumber(a?.valor_por_litro),
      };
    }
    this.editAbastRows.set(rows);
    this.editandoBaixa.set(baixa);
  }

  private toDateInput(value: any): string {
    if (!value) return '';
    const s = String(value);
    return s.length >= 10 ? s.slice(0, 10) : s;
  }

  private toDateTimeInput(value: any): string {
    if (!value) return '';
    const s = String(value);
    // "2026-06-10T14:56:00..." -> "2026-06-10T14:56"
    return s.length >= 16 ? s.slice(0, 16) : (s.length >= 10 ? s.slice(0, 10) + 'T00:00' : s);
  }

  private resolveVeiculoId(abastecimento: any): string {
    const direto = String(abastecimento?.id_veiculo ?? abastecimento?.veiculo?.id_veiculo ?? '').trim();
    if (direto) return direto;

    const placa = this.normalizePlate(
      abastecimento?.veiculo?.placa ?? abastecimento?.placa ?? abastecimento?.placa1
    );
    if (!placa) return '';

    return this.veiculos().find(v => this.normalizePlate(v.placa) === placa)?.id_veiculo ?? '';
  }

  private resolveMotoristaId(abastecimento: any): string {
    const direto = String(abastecimento?.id_motorista ?? abastecimento?.motorista?.id_motorista ?? '').trim();
    if (direto) return direto;

    const nome = this.normalizeText(abastecimento?.motorista?.nome ?? abastecimento?.nome_motorista);
    if (!nome) return '';

    return this.motoristas().find(m => this.normalizeText(m.nome) === nome)?.id_motorista ?? '';
  }

  // Total/Litros calculados ao vivo a partir das linhas editáveis.
  editRowTotal(id?: string | null): number {
    const r = id ? this.editAbastRows()[id] : undefined;
    if (!r) return 0;
    return this.toNumber(r.quantidade_litros) * this.toNumber(r.valor_por_litro);
  }
  editTotalGeral(): number {
    return Object.keys(this.editAbastRows()).reduce((s, id) => s + this.editRowTotal(id), 0);
  }
  editLitrosGeral(): number {
    return Object.values(this.editAbastRows()).reduce((s: number, r: any) => s + this.toNumber(r?.quantidade_litros), 0);
  }
  setRowField(id: string | null | undefined, campo: string, valor: any) {
    if (!id) return;
    this.editAbastRows.update(rows => ({ ...rows, [id]: { ...rows[id], [campo]: valor } }));
  }
  rowOf(id?: string | null) {
    return id ? this.editAbastRows()[id] : undefined;
  }

  baixaLitros(baixa: any): number {
    return this.baixaItems(baixa).reduce(
      (total, item) => total + this.toNumber(item?.abastecimento?.quantidade_litros),
      0
    );
  }

  removerComprovanteBaixa(baixa: any, url: string) {
    if (!url) return;
    const ok = confirm(
      'Remover este comprovante da baixa? Ele voltará para a tela "Baixa por Comprovante". '
      + 'Se for o único comprovante, a baixa será revertida e os abastecimentos voltarão para Pendente.'
    );
    if (!ok) return;

    const idBaixa = String(this.baixaItems(baixa)[0]?.id_baixa ?? '').trim();
    if (!idBaixa) { this.toastr.error('Baixa sem identificador.'); return; }

    this.removendoComprovanteUrl.set(url);
    this.api.removerComprovanteBaixa(idBaixa, url).subscribe({
      next: (res: any) => {
        this.removendoComprovanteUrl.set(null);
        this.toastr.success(res?.message ?? 'Comprovante removido.');
        this.editandoBaixa.set(null);
        this.loadBaixas();
        this.loadPendentes();
      },
      error: (err) => {
        this.removendoComprovanteUrl.set(null);
        this.toastr.error(err.error?.message ?? 'Erro ao remover comprovante');
      }
    });
  }

  salvarEdicaoBaixa() {
    const baixa = this.editandoBaixa();
    if (!baixa) return;
    const ids = this.baixaItems(baixa)
      .map((item) => String(item?.id_baixa ?? '').trim())
      .filter(Boolean);
    if (ids.length === 0) { this.toastr.error('Baixa sem identificador.'); return; }

    const payload: any = {
      forma_pagamento: this.editForm.forma_pagamento || null,
      data_pagamento: this.editForm.data_pagamento || null,
      data_hora: this.editForm.data_baixa || null,
      data_baixa: this.editForm.data_baixa || null,
      usuario: this.editForm.usuario || null,
      tipo_despesa: this.editForm.tipo_despesa || null,
      recebedor: this.editForm.recebedor || null,
      descricao: this.editForm.descricao || null,
      observacao: this.editForm.observacao || null,
    };

    // Atualizações dos abastecimentos (campos permitidos pelo backend;
    // valor_por_litro é protegido e o valor_total é recalculado por lá).
    const rows = this.editAbastRows();
    const chamadasAbast = Object.keys(rows).map((id) => {
      const r = rows[id];
      const data: any = {
        tipo_combustivel: r.tipo_combustivel || undefined,
        quantidade_litros: this.toNumber(r.quantidade_litros) || undefined,
      };
      if (r.data_hora) {
        data.data_hora = r.data_hora;
        data.data = String(r.data_hora).slice(0, 10);
      }
      if (r.id_veiculo) data.id_veiculo = r.id_veiculo;
      if (r.id_motorista) data.id_motorista = r.id_motorista;
      return this.api.updateAbastecimento(id, data);
    });

    this.editandoBusy.set(true);
    const chamadas = [...ids.map((id) => this.api.updateBaixa(id, payload)), ...chamadasAbast];
    forkJoin(chamadas).subscribe({
      next: () => {
        this.toastr.success('Baixa atualizada.');
        this.editandoBaixa.set(null);
        this.editandoBusy.set(false);
        this.loadBaixas();
        this.loadPendentes();
      },
      error: (err) => {
        this.editandoBusy.set(false);
        console.error('Erro ao atualizar baixa:', err);
        const msg = this.apiErrorMessage(err, 'Erro ao atualizar baixa');
        this.toastr.error(msg, 'Erro', { timeOut: 6000 });
      }
    });
  }

  private apiErrorMessage(err: any, fallback: string): string {
    if (!err) return fallback;
    if (typeof err.error === 'string' && err.error.includes('<!DOCTYPE html>')) return 'Erro interno do servidor (HTML).';
    if (err.error?.errors) {
      const firstKey = Object.keys(err.error.errors)[0];
      const messages = err.error.errors[firstKey];
      return Array.isArray(messages) ? messages[0] : String(messages);
    }
    return err.error?.message || err.message || fallback;
  }

  deleteBaixaGroup(baixa: any) {
    const ids = this.baixaItems(baixa)
      .map((item) => String(item?.id_baixa ?? '').trim())
      .filter(Boolean);
    if (ids.length === 0) return;

    const ok = confirm(
      ids.length > 1
        ? `Deseja realmente excluir esta baixa completa? ${ids.length} abastecimentos voltarão para pendente de baixa.`
        : 'Deseja realmente excluir esta baixa? O abastecimento voltará para pendente de baixa.'
    );
    if (!ok) return;

    const groupId = this.baixaGroupId(baixa);
    this.deletingBaixaId.set(groupId);
    forkJoin(ids.map((id) => this.api.deleteBaixa(id))).subscribe({
      next: () => {
        this.toastr.success(
          ids.length > 1
            ? 'Baixa excluída e abastecimentos voltaram para pendente de baixa'
            : 'Baixa excluída e abastecimento voltou para pendente de baixa'
        );
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
