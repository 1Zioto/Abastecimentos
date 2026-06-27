import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { ExtratoBancario, ConciliacaoBancariaResumo, ConciliacaoSugestaoGrupo, ConciliacaoBaixaItem } from '../../shared/models';
import { ToastrService } from 'ngx-toastr';

interface ImportItem {
  data: string;
  descricao?: string;
  valor: number;
  tipo: 'credito' | 'debito';
  documento?: string;
}

@Component({
  selector: 'app-conciliacao-bancaria',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="page">
      <header class="page-header">
        <div>
          <h1>Conciliação Bancária</h1>
          <p>Importe o extrato bancário e concilie com as baixas registradas pelos proprietários.</p>
        </div>
        <button type="button" class="btn-primary" (click)="openImportModal()">+ Importar extrato</button>
      </header>

      <section class="filters-card">
        <label>
          Status
          <select [(ngModel)]="filtroStatus" (change)="load()">
            <option value="todos">Todos</option>
            <option value="pendente">Pendentes</option>
            <option value="conciliado">Conciliados</option>
            <option value="ignorado">Ignorados</option>
          </select>
        </label>
        <label>
          Tipo
          <select [(ngModel)]="filtroTipo" (change)="load()">
            <option value="todos">Todos</option>
            <option value="credito">Crédito</option>
            <option value="debito">Débito</option>
          </select>
        </label>
        <label>
          Filial
          <select [(ngModel)]="filtroLocal" (change)="load()">
            <option value="Todas">Todas</option>
            @for (filial of filiaisDisponiveis; track filial) {
              <option [value]="filial">{{ filial }}</option>
            }
          </select>
        </label>
        <label>
          Data início
          <input type="date" [(ngModel)]="filtroDataInicio" (change)="load()" />
        </label>
        <label>
          Data fim
          <input type="date" [(ngModel)]="filtroDataFim" (change)="load()" />
        </label>
        <label>
          Busca
          <input type="search" [(ngModel)]="filtroBusca" placeholder="Descrição ou documento" (keyup.enter)="load()" />
        </label>
        <button type="button" class="btn-secondary" (click)="clearFilters()">Limpar</button>
      </section>

      <section class="summary-row">
        <article>
          <span>Total</span>
          <strong>{{ resumo()?.total ?? 0 }}</strong>
        </article>
        <article>
          <span>Pendentes</span>
          <strong>{{ resumo()?.pendentes ?? 0 }}</strong>
        </article>
        <article>
          <span>Conciliados</span>
          <strong>{{ resumo()?.conciliados ?? 0 }}</strong>
        </article>
        <article>
          <span>Ignorados</span>
          <strong>{{ resumo()?.ignorados ?? 0 }}</strong>
        </article>
        <article>
          <span>Créditos pendentes</span>
          <strong class="money">{{ (resumo()?.valor_pendente_credito ?? 0) | currency:'BRL':'symbol':'1.2-2' }}</strong>
        </article>
      </section>

      <section class="table-card">
        @if (loading()) {
          <div class="state">Carregando lançamentos...</div>
        } @else if (extratos().length === 0) {
          <div class="state">Nenhum lançamento encontrado</div>
        } @else {
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Descrição</th>
                  <th>Documento</th>
                  <th>Banco</th>
                  <th>Filial</th>
                  <th>Tipo</th>
                  <th class="text-right">Valor</th>
                  <th>Status</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                @for (extrato of extratos(); track extrato.id) {
                  <tr>
                    <td>{{ extrato.data | date:'dd/MM/yyyy' }}</td>
                    <td>{{ extrato.descricao || '-' }}</td>
                    <td>{{ extrato.documento || '-' }}</td>
                    <td>{{ extrato.banco || '-' }}</td>
                    <td><span class="branch">{{ extrato.local || '-' }}</span></td>
                    <td>
                      <span class="tipo" [class.debito]="extrato.tipo === 'debito'">{{ extrato.tipo === 'debito' ? 'Débito' : 'Crédito' }}</span>
                    </td>
                    <td class="text-right money" [class.debito]="extrato.tipo === 'debito'">{{ extrato.valor | currency:'BRL':'symbol':'1.2-2' }}</td>
                    <td><span class="status" [class]="extrato.status">{{ statusLabel(extrato.status) }}</span></td>
                    <td>
                      <div class="actions">
                        @if (extrato.status === 'pendente') {
                          <button type="button" class="btn-small" (click)="abrirConciliacao(extrato)">Conciliar</button>
                          <button type="button" class="icon-btn" (click)="ignorar(extrato)" title="Ignorar">🚫</button>
                          <button type="button" class="icon-btn" (click)="confirmDelete(extrato)" title="Excluir">🗑️</button>
                        } @else if (extrato.status === 'conciliado') {
                          <button type="button" class="btn-small" (click)="abrirDetalhes(extrato)">Detalhes</button>
                        } @else {
                          <button type="button" class="btn-small" (click)="ignorar(extrato)">Reabrir</button>
                          <button type="button" class="icon-btn" (click)="confirmDelete(extrato)" title="Excluir">🗑️</button>
                        }
                      </div>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }
      </section>

      @if (deleteTarget()) {
        <div class="modal-overlay" (click)="deleteTarget.set(null)">
          <div class="modal" (click)="$event.stopPropagation()">
            <h3>Confirmar exclusão</h3>
            <p>Excluir o lançamento de {{ deleteTarget()?.data | date:'dd/MM/yyyy' }} ({{ deleteTarget()?.valor | currency:'BRL':'symbol':'1.2-2' }})?</p>
            <div class="modal-actions">
              <button type="button" class="btn-cancel" (click)="deleteTarget.set(null)">Cancelar</button>
              <button type="button" class="btn-danger" (click)="executeDelete()">Excluir</button>
            </div>
          </div>
        </div>
      }

      @if (showImportModal()) {
        <div class="modal-overlay" (click)="closeImportModal()">
          <div class="modal import-modal" (click)="$event.stopPropagation()">
            <div class="modal-header">
              <div>
                <h3>Importar extrato bancário</h3>
                <p>Selecione um arquivo CSV ou OFX exportado do internet banking.</p>
              </div>
              <button type="button" class="btn-close" (click)="closeImportModal()">×</button>
            </div>

            <div class="import-body">
              <label class="file-label">
                Arquivo (.ofx, .csv, .txt)
                <input type="file" accept=".ofx,.csv,.txt" (change)="onFileSelected($event)" />
              </label>

              @if (importFileName()) {
                <p class="file-info">Arquivo: <strong>{{ importFileName() }}</strong> — {{ previewItens().length }} lançamento(s) detectado(s)</p>
              }

              @if (importTipo() === 'csv') {
                <div class="csv-config">
                  <label>
                    Delimitador
                    <select [(ngModel)]="csvDelimiter" (ngModelChange)="reparseCsv()">
                      <option value=",">Vírgula (,)</option>
                      <option value=";">Ponto e vírgula (;)</option>
                      <option value="\t">Tabulação</option>
                    </select>
                  </label>
                  <label class="checkbox-label">
                    <input type="checkbox" [(ngModel)]="csvHasHeader" (ngModelChange)="reparseCsv()" />
                    Primeira linha é cabeçalho
                  </label>
                  <label>
                    Formato da data
                    <select [(ngModel)]="csvDateFormat" (ngModelChange)="refreshCsvPreview()">
                      <option value="DD/MM/YYYY">DD/MM/AAAA</option>
                      <option value="YYYY-MM-DD">AAAA-MM-DD</option>
                      <option value="MM/DD/YYYY">MM/DD/AAAA</option>
                    </select>
                  </label>
                </div>

                <div class="csv-mapping">
                  <label>
                    Coluna Data *
                    <select [(ngModel)]="csvMapping.data" (ngModelChange)="refreshCsvPreview()">
                      <option [ngValue]="-1">-- selecione --</option>
                      @for (col of csvHeaders(); track $index) {
                        <option [ngValue]="$index">{{ col }}</option>
                      }
                    </select>
                  </label>
                  <label>
                    Coluna Descrição
                    <select [(ngModel)]="csvMapping.descricao" (ngModelChange)="refreshCsvPreview()">
                      <option [ngValue]="-1">-- nenhuma --</option>
                      @for (col of csvHeaders(); track $index) {
                        <option [ngValue]="$index">{{ col }}</option>
                      }
                    </select>
                  </label>
                  <label>
                    Coluna Valor *
                    <select [(ngModel)]="csvMapping.valor" (ngModelChange)="refreshCsvPreview()">
                      <option [ngValue]="-1">-- selecione --</option>
                      @for (col of csvHeaders(); track $index) {
                        <option [ngValue]="$index">{{ col }}</option>
                      }
                    </select>
                  </label>
                  <label>
                    Coluna Tipo (créd./déb.)
                    <select [(ngModel)]="csvMapping.tipo" (ngModelChange)="refreshCsvPreview()">
                      <option [ngValue]="-1">-- automático pelo sinal --</option>
                      @for (col of csvHeaders(); track $index) {
                        <option [ngValue]="$index">{{ col }}</option>
                      }
                    </select>
                  </label>
                  <label>
                    Coluna Documento
                    <select [(ngModel)]="csvMapping.documento" (ngModelChange)="refreshCsvPreview()">
                      <option [ngValue]="-1">-- nenhuma --</option>
                      @for (col of csvHeaders(); track $index) {
                        <option [ngValue]="$index">{{ col }}</option>
                      }
                    </select>
                  </label>
                </div>
              }

              <div class="import-extra">
                <label>
                  Banco
                  <input type="text" [(ngModel)]="importBanco" placeholder="Ex: Banco do Brasil" />
                </label>
                <label>
                  Filial
                  <select [(ngModel)]="importLocal">
                    @for (filial of filiaisDisponiveis; track filial) {
                      <option [value]="filial">{{ filial }}</option>
                    }
                  </select>
                </label>
              </div>

              @if (previewItens().length > 0) {
                <div class="preview-wrap">
                  <table class="preview-table">
                    <thead>
                      <tr>
                        <th>Data</th>
                        <th>Descrição</th>
                        <th>Documento</th>
                        <th>Tipo</th>
                        <th class="text-right">Valor</th>
                      </tr>
                    </thead>
                    <tbody>
                      @for (item of previewItens().slice(0, 8); track $index) {
                        <tr>
                          <td>{{ item.data | date:'dd/MM/yyyy' }}</td>
                          <td>{{ item.descricao || '-' }}</td>
                          <td>{{ item.documento || '-' }}</td>
                          <td>{{ item.tipo === 'debito' ? 'Débito' : 'Crédito' }}</td>
                          <td class="text-right">{{ item.valor | number:'1.2-2' }}</td>
                        </tr>
                      }
                    </tbody>
                  </table>
                  @if (previewItens().length > 8) {
                    <p class="more-rows">... e mais {{ previewItens().length - 8 }} lançamento(s)</p>
                  }
                </div>
              }
            </div>

            <div class="modal-actions">
              <button type="button" class="btn-cancel" (click)="closeImportModal()">Cancelar</button>
              <button type="button" class="btn-primary" [disabled]="previewItens().length === 0 || importing()" (click)="confirmImport()">
                {{ importing() ? 'Importando...' : 'Importar ' + previewItens().length + ' lançamento(s)' }}
              </button>
            </div>
          </div>
        </div>
      }

      @if (conciliarTarget()) {
        <div class="modal-overlay" (click)="fecharConciliacao()">
          <div class="modal conciliacao-modal" (click)="$event.stopPropagation()">
            <div class="modal-header">
              <div>
                <h3>Conciliar lançamento</h3>
                <p>
                  {{ conciliarTarget()?.data | date:'dd/MM/yyyy' }} — {{ conciliarTarget()?.descricao || 'Sem descrição' }}
                  — <strong class="money">{{ conciliarTarget()?.valor | currency:'BRL':'symbol':'1.2-2' }}</strong>
                </p>
              </div>
              <button type="button" class="btn-close" (click)="fecharConciliacao()">×</button>
            </div>

            <div class="conciliacao-body">
              <section class="sugestoes-section">
                <div class="section-head">
                  <h4>Sugestões de baixas</h4>
                  <label class="inline-label">
                    Janela (dias)
                    <input type="number" [(ngModel)]="diasJanela" min="1" max="60" (change)="loadSugestoes()" />
                  </label>
                </div>
                @if (loadingSugestoes()) {
                  <div class="state">Buscando sugestões...</div>
                } @else if (sugestoes().length === 0) {
                  <div class="state">Nenhuma sugestão encontrada para esse período. Use a busca manual abaixo.</div>
                } @else {
                  @for (grupo of sugestoes(); track grupo.id_proprietario + grupo.data_pagamento) {
                    <div class="grupo-card">
                      <div class="grupo-head">
                        <label class="checkbox-label">
                          <input type="checkbox" [checked]="isGrupoSelecionado(grupo)" (change)="toggleGrupo(grupo)" />
                          <strong>{{ grupo.nome_proprietario || 'Sem proprietário' }}</strong>
                        </label>
                        <span class="grupo-data">Pagamento: {{ grupo.data_pagamento | date:'dd/MM/yyyy' }}</span>
                        <span class="grupo-total money">{{ grupo.valor_total | currency:'BRL':'symbol':'1.2-2' }}</span>
                        <span class="grupo-diff" [class.ok]="abs(grupo.diferenca) <= 0.01" [class.warn]="abs(grupo.diferenca) > 0.01">
                          Diferença: {{ grupo.diferenca | currency:'BRL':'symbol':'1.2-2' }}
                        </span>
                      </div>
                      <div class="grupo-itens">
                        @for (item of grupo.baixas; track item.id_baixa) {
                          <label class="item-row">
                            <input type="checkbox" [checked]="isSelecionada(item.id_baixa)" (change)="toggleBaixa(item)" />
                            <span class="item-placa">{{ item.placa1 || '-' }}</span>
                            <span class="item-data">{{ item.data_abastecimento | date:'dd/MM/yyyy' }}</span>
                            <span class="item-forma">{{ item.forma_pagamento || '-' }}</span>
                            <span class="item-valor money">{{ item.valor | currency:'BRL':'symbol':'1.2-2' }}</span>
                          </label>
                        }
                      </div>
                    </div>
                  }
                }
              </section>

              <section class="busca-section">
                <h4>Busca manual</h4>
                <div class="busca-filtros">
                  <label>
                    Proprietário
                    <input type="text" [(ngModel)]="buscaNome" placeholder="Nome do proprietário" />
                  </label>
                  <label>
                    Data início
                    <input type="date" [(ngModel)]="buscaDataInicio" />
                  </label>
                  <label>
                    Data fim
                    <input type="date" [(ngModel)]="buscaDataFim" />
                  </label>
                  <label>
                    Valor aproximado
                    <input type="number" step="0.01" [(ngModel)]="buscaValor" placeholder="0,00" />
                  </label>
                  <button type="button" class="btn-secondary" (click)="buscarManual()">Buscar</button>
                </div>
                @if (buscaManualResultados().length > 0) {
                  <div class="grupo-itens">
                    @for (item of buscaManualResultados(); track item.id_baixa) {
                      <label class="item-row">
                        <input type="checkbox" [checked]="isSelecionada(item.id_baixa)" (change)="toggleBaixa(item)" />
                        <span class="item-placa">{{ item.nome_proprietario || '-' }} · {{ item.placa1 || '-' }}</span>
                        <span class="item-data">{{ item.data_pagamento | date:'dd/MM/yyyy' }}</span>
                        <span class="item-forma">{{ item.forma_pagamento || '-' }}</span>
                        <span class="item-valor money">{{ item.valor | currency:'BRL':'symbol':'1.2-2' }}</span>
                      </label>
                    }
                  </div>
                }
              </section>
            </div>

            <div class="conciliacao-footer">
              <div class="totais">
                <span>Selecionado: <strong class="money">{{ totalSelecionado() | currency:'BRL':'symbol':'1.2-2' }}</strong></span>
                <span class="grupo-diff" [class.ok]="abs(diferencaSelecionada()) <= 0.01" [class.warn]="abs(diferencaSelecionada()) > 0.01">
                  Diferença: {{ diferencaSelecionada() | currency:'BRL':'symbol':'1.2-2' }}
                </span>
              </div>
              <div class="modal-actions">
                <button type="button" class="btn-cancel" (click)="fecharConciliacao()">Cancelar</button>
                <button type="button" class="btn-primary" [disabled]="selecionadasItens().length === 0 || conciliando()" (click)="confirmarConciliacao()">
                  {{ conciliando() ? 'Conciliando...' : 'Confirmar conciliação' }}
                </button>
              </div>
            </div>
          </div>
        </div>
      }

      @if (detalhesTarget()) {
        <div class="modal-overlay" (click)="fecharDetalhes()">
          <div class="modal detalhes-modal" (click)="$event.stopPropagation()">
            <div class="modal-header">
              <div>
                <h3>Detalhes da conciliação</h3>
                <p>
                  {{ detalhesTarget()?.data | date:'dd/MM/yyyy' }} — {{ detalhesTarget()?.descricao || 'Sem descrição' }}
                  — <strong class="money">{{ detalhesTarget()?.valor | currency:'BRL':'symbol':'1.2-2' }}</strong>
                </p>
                @if (detalhesTarget()?.conciliado_por) {
                  <p class="muted">Conciliado por {{ detalhesTarget()?.conciliado_por }} em {{ detalhesTarget()?.conciliado_em | date:'dd/MM/yyyy HH:mm' }}</p>
                }
              </div>
              <button type="button" class="btn-close" (click)="fecharDetalhes()">×</button>
            </div>

            @if (loadingDetalhes()) {
              <div class="state">Carregando...</div>
            } @else {
              <div class="grupo-itens">
                @for (item of detalhesBaixas(); track item.id_baixa) {
                  <div class="item-row static">
                    <span class="item-placa">{{ item.nome_proprietario || '-' }} · {{ item.placa1 || '-' }}</span>
                    <span class="item-data">{{ item.data_abastecimento | date:'dd/MM/yyyy' }}</span>
                    <span class="item-forma">{{ item.forma_pagamento || '-' }}</span>
                    <span class="item-valor money">{{ item.valor | currency:'BRL':'symbol':'1.2-2' }}</span>
                  </div>
                }
              </div>
              <p class="total-detalhes">Total: <strong class="money">{{ totalDetalhes() | currency:'BRL':'symbol':'1.2-2' }}</strong></p>
            }

            <div class="modal-actions">
              <button type="button" class="btn-cancel" (click)="fecharDetalhes()">Fechar</button>
              <button type="button" class="btn-danger" (click)="desconciliar()">Desconciliar</button>
            </div>
          </div>
        </div>
      }
    </div>
  `,
  styles: [`
    * { box-sizing: border-box; }
    .page { padding: 28px; color: #111827; font-family: Inter, Arial, sans-serif; }
    .page-header { display:flex; justify-content:space-between; gap:16px; align-items:flex-start; margin-bottom:16px; }
    h1 { margin:0; font-size:24px; font-weight:800; }
    h2 { margin:0 0 14px; color:#111827; font-size:16px; }
    h3 { margin:0; font-size:18px; }
    p { margin:6px 0 0; color:#64748b; font-size:13px; }
    .btn-primary, .btn-secondary, .btn-cancel, .btn-danger { border-radius:8px; padding:9px 16px; border:1px solid transparent; font-weight:700; cursor:pointer; }
    .btn-primary { color:#fff; background:linear-gradient(135deg,#0ea5e9,#6366f1); border:0; }
    .btn-primary:disabled { opacity:.6; cursor:progress; }
    .btn-secondary, .btn-cancel { background:#fff; color:#334155; border-color:#cbd5e1; }
    .btn-danger { background:#dc2626; color:#fff; border:0; }
    .filters-card { display:grid; grid-template-columns:repeat(auto-fit,minmax(140px,1fr)); gap:12px; align-items:end; background:#fff; border:1px solid #dbe4f0; border-radius:10px; padding:14px; margin-bottom:14px; }
    label { display:flex; flex-direction:column; gap:6px; font-size:11px; color:#52657f; font-weight:800; text-transform:uppercase; letter-spacing:.4px; }
    input, select, textarea { border:1px solid #cbd5e1; border-radius:8px; padding:9px 10px; color:#111827; background:#fff; font:inherit; outline:none; }
    input:focus, select:focus, textarea:focus { border-color:#0ea5e9; box-shadow:0 0 0 3px rgba(14,165,233,.12); }
    .summary-row { display:flex; gap:12px; margin-bottom:14px; flex-wrap:wrap; }
    .summary-row article { min-width:150px; background:#fff; border:1px solid #dbe4f0; border-radius:10px; padding:12px 14px; flex:1; }
    .summary-row span { display:block; color:#64748b; font-size:11px; font-weight:800; text-transform:uppercase; }
    .summary-row strong { display:block; margin-top:4px; font-size:22px; }
    .table-card { background:#fff; border:1px solid #dbe4f0; border-radius:10px; overflow:hidden; }
    .table-wrap { overflow:auto; }
    table { width:100%; min-width:980px; border-collapse:collapse; font-size:13px; }
    th { background:#f8fafc; color:#52657f; text-align:left; text-transform:uppercase; letter-spacing:.4px; font-size:11px; padding:10px 12px; border-bottom:1px solid #dbe4f0; }
    td { padding:11px 12px; border-bottom:1px solid #eef2f7; vertical-align:middle; }
    tr:hover td { background:#f8fafc; }
    .text-right { text-align:right; }
    .money { color:#16a34a; font-weight:800; }
    .money.debito { color:#dc2626; }
    .branch { display:inline-flex; padding:3px 9px; border-radius:999px; background:#e0f2fe; color:#0369a1; font-size:12px; font-weight:800; }
    .tipo { display:inline-flex; padding:3px 9px; border-radius:999px; background:#dcfce7; color:#15803d; font-size:12px; font-weight:800; }
    .tipo.debito { background:#fee2e2; color:#b91c1c; }
    .status { display:inline-flex; padding:3px 9px; border-radius:999px; font-size:12px; font-weight:800; }
    .status.pendente { background:#fef9c3; color:#a16207; }
    .status.conciliado { background:#dcfce7; color:#15803d; }
    .status.ignorado { background:#e2e8f0; color:#475569; }
    .actions { display:flex; gap:6px; flex-wrap:wrap; }
    .icon-btn { background:transparent; border:0; cursor:pointer; padding:5px 7px; border-radius:6px; }
    .icon-btn:hover { background:#e2e8f0; }
    .btn-small { border:1px solid #cbd5e1; background:#f8fafc; color:#334155; border-radius:8px; padding:7px 10px; font-weight:800; cursor:pointer; white-space:nowrap; font-size:12px; }
    .btn-small:hover { border-color:#0ea5e9; color:#0369a1; }
    .state { padding:28px; color:#64748b; text-align:center; }
    .modal-overlay { position:fixed; inset:0; background:rgba(15,23,42,.72); display:flex; align-items:center; justify-content:center; z-index:1000; padding:20px; }
    .modal { background:#fff; border-radius:12px; padding:22px; width:min(420px,96vw); box-shadow:0 22px 60px rgba(15,23,42,.25); }
    .modal-actions { display:flex; justify-content:flex-end; gap:10px; margin-top:14px; }
    .modal-header { display:flex; align-items:flex-start; justify-content:space-between; gap:16px; margin-bottom:16px; }
    .modal-header h3 { font-size:20px; }
    .btn-close { width:34px; height:34px; border-radius:8px; border:1px solid #cbd5e1; background:#fff; color:#334155; cursor:pointer; font-size:20px; line-height:1; }
    .import-modal { width:min(820px,96vw); max-height:90vh; overflow:auto; border:1px solid #dbe4f0; }
    .import-body { display:flex; flex-direction:column; gap:14px; }
    .file-label { font-size:11px; }
    .file-label input[type="file"] { border:1px dashed #cbd5e1; border-radius:8px; padding:10px; background:#f8fafc; cursor:pointer; }
    .file-info { background:#f0f9ff; border:1px solid #bae6fd; border-radius:8px; padding:8px 12px; font-size:13px; color:#0369a1; margin:0; }
    .csv-config, .csv-mapping, .import-extra { display:grid; grid-template-columns:repeat(auto-fit,minmax(150px,1fr)); gap:12px; }
    .checkbox-label { flex-direction:row !important; align-items:center; gap:8px; text-transform:none; font-weight:600; }
    .checkbox-label input { width:auto; }
    .preview-wrap { border:1px solid #dbe4f0; border-radius:8px; overflow:auto; max-height:260px; }
    .preview-table { width:100%; min-width:560px; border-collapse:collapse; font-size:12px; }
    .preview-table th { background:#f8fafc; color:#52657f; text-align:left; text-transform:uppercase; font-size:10px; padding:8px 10px; border-bottom:1px solid #dbe4f0; position:sticky; top:0; }
    .preview-table td { padding:8px 10px; border-bottom:1px solid #eef2f7; }
    .more-rows { padding:8px 10px; margin:0; color:#64748b; font-size:12px; text-align:center; }
    .conciliacao-modal, .detalhes-modal { width:min(900px,96vw); max-height:90vh; overflow:auto; border:1px solid #dbe4f0; }
    .conciliacao-body { display:flex; flex-direction:column; gap:18px; }
    .sugestoes-section h4, .busca-section h4 { margin:0 0 10px; font-size:14px; color:#111827; }
    .section-head { display:flex; justify-content:space-between; align-items:center; gap:12px; margin-bottom:10px; }
    .inline-label { flex-direction:row !important; align-items:center; gap:8px; text-transform:none; font-weight:600; }
    .inline-label input { width:70px; }
    .grupo-card { border:1px solid #dbe4f0; border-radius:10px; padding:12px; margin-bottom:10px; background:#f8fafc; }
    .grupo-head { display:flex; flex-wrap:wrap; gap:12px; align-items:center; margin-bottom:8px; }
    .grupo-data, .grupo-total { font-size:12px; color:#52657f; }
    .grupo-diff { font-size:12px; font-weight:800; padding:3px 9px; border-radius:999px; }
    .grupo-diff.ok { background:#dcfce7; color:#15803d; }
    .grupo-diff.warn { background:#fef9c3; color:#a16207; }
    .grupo-itens { display:flex; flex-direction:column; gap:6px; }
    .item-row { display:flex; gap:12px; align-items:center; background:#fff; border:1px solid #e2e8f0; border-radius:8px; padding:8px 10px; font-size:12px; cursor:pointer; }
    .item-row.static { cursor:default; }
    .item-row input { width:auto; }
    .item-placa { flex:1; font-weight:700; }
    .item-data, .item-forma { color:#64748b; min-width:80px; }
    .item-valor { min-width:100px; text-align:right; }
    .busca-filtros { display:grid; grid-template-columns:repeat(auto-fit,minmax(140px,1fr)); gap:10px; align-items:end; margin-bottom:10px; }
    .conciliacao-footer { border-top:1px solid #eef2f7; margin-top:14px; padding-top:14px; }
    .totais { display:flex; justify-content:space-between; align-items:center; gap:12px; flex-wrap:wrap; font-size:13px; }
    .muted { color:#94a3b8; font-size:12px; }
    .total-detalhes { text-align:right; font-size:14px; margin-top:10px; }
    @media (max-width: 760px) {
      .page { padding:18px; }
      .page-header { flex-direction:column; }
      .btn-primary, .btn-secondary, .btn-cancel, .btn-danger { width:100%; }
    }
  `],
})
export class ConciliacaoBancariaComponent implements OnInit, OnDestroy {
  private api = inject(ApiService);
  private auth = inject(AuthService);
  private toastr = inject(ToastrService);

  extratos = signal<ExtratoBancario[]>([]);
  resumo = signal<ConciliacaoBancariaResumo | null>(null);
  loading = signal(false);
  deleteTarget = signal<ExtratoBancario | null>(null);

  // Importação de extrato
  showImportModal = signal(false);
  importFileName = signal('');
  importTipo = signal<'ofx' | 'csv' | ''>('');
  importing = signal(false);
  previewItens = signal<ImportItem[]>([]);
  ofxItens = signal<ImportItem[]>([]);
  csvHeaders = signal<string[]>([]);
  csvRawRows = signal<string[][]>([]);
  importBanco = '';
  importLocal = '';
  csvHasHeader = true;
  csvDelimiter = ',';
  csvDateFormat: 'DD/MM/YYYY' | 'YYYY-MM-DD' | 'MM/DD/YYYY' = 'DD/MM/YYYY';
  csvMapping = { data: -1, descricao: -1, valor: -1, tipo: -1, documento: -1 };
  private csvFullText = '';

  // Conciliação
  conciliarTarget = signal<ExtratoBancario | null>(null);
  sugestoes = signal<ConciliacaoSugestaoGrupo[]>([]);
  loadingSugestoes = signal(false);
  selecionadasItens = signal<ConciliacaoBaixaItem[]>([]);
  buscaManualResultados = signal<ConciliacaoBaixaItem[]>([]);
  buscaNome = '';
  buscaDataInicio = '';
  buscaDataFim = '';
  buscaValor: number | null = null;
  diasJanela = 10;
  conciliando = signal(false);

  // Detalhes
  detalhesTarget = signal<ExtratoBancario | null>(null);
  detalhesBaixas = signal<ConciliacaoBaixaItem[]>([]);
  loadingDetalhes = signal(false);

  filiaisDisponiveis = ['Matriz', 'Viana'];
  filtroStatus = 'pendente';
  filtroTipo = 'todos';
  filtroLocal = 'Todas';
  filtroDataInicio = '';
  filtroDataFim = '';
  filtroBusca = '';

  private readonly onGaragemChanged = () => this.load();

  ngOnInit() {
    this.filiaisDisponiveis = this.auth.getFiliaisAcesso().length ? this.auth.getFiliaisAcesso() : ['Matriz', 'Viana'];
    window.addEventListener('garagem:changed', this.onGaragemChanged);
    this.load();
  }

  ngOnDestroy() {
    window.removeEventListener('garagem:changed', this.onGaragemChanged);
  }

  load() {
    this.loading.set(true);
    this.api.listarExtratosBancarios({
      status: this.filtroStatus,
      tipo: this.filtroTipo,
      local: this.filtroLocal,
      data_inicio: this.filtroDataInicio,
      data_fim: this.filtroDataFim,
      q: this.filtroBusca,
    }).subscribe({
      next: (res) => {
        this.extratos.set(res.data ?? []);
        this.resumo.set(res.resumo ?? null);
      },
      error: (err) => this.toastr.error(err.error?.message ?? 'Erro ao carregar extratos'),
      complete: () => this.loading.set(false),
    });
  }

  clearFilters() {
    this.filtroStatus = 'todos';
    this.filtroTipo = 'todos';
    this.filtroLocal = 'Todas';
    this.filtroDataInicio = '';
    this.filtroDataFim = '';
    this.filtroBusca = '';
    this.load();
  }

  statusLabel(status: string): string {
    switch (status) {
      case 'pendente': return 'Pendente';
      case 'conciliado': return 'Conciliado';
      case 'ignorado': return 'Ignorado';
      default: return status;
    }
  }

  ignorar(extrato: ExtratoBancario) {
    this.api.ignorarExtratoBancario(extrato.id).subscribe({
      next: (res) => {
        this.toastr.success(res.message);
        this.load();
      },
      error: (err) => this.toastr.error(err.error?.message ?? 'Erro ao atualizar lançamento'),
    });
  }

  confirmDelete(extrato: ExtratoBancario) {
    this.deleteTarget.set(extrato);
  }

  executeDelete() {
    const target = this.deleteTarget();
    if (!target) return;
    this.api.excluirExtratoBancario(target.id).subscribe({
      next: () => {
        this.toastr.success('Lançamento removido.');
        this.deleteTarget.set(null);
        this.load();
      },
      error: (err) => this.toastr.error(err.error?.message ?? 'Erro ao excluir lançamento'),
    });
  }

  private localAtual(): string {
    return this.auth.getGaragem() || this.auth.getFiliaisAcesso()[0] || 'Matriz';
  }

  // ---------- Importação de extrato ----------

  openImportModal() {
    this.importFileName.set('');
    this.importTipo.set('');
    this.csvHeaders.set([]);
    this.csvRawRows.set([]);
    this.csvMapping = { data: -1, descricao: -1, valor: -1, tipo: -1, documento: -1 };
    this.csvHasHeader = true;
    this.csvDelimiter = ',';
    this.csvDateFormat = 'DD/MM/YYYY';
    this.ofxItens.set([]);
    this.previewItens.set([]);
    this.csvFullText = '';
    this.importLocal = this.localAtual();
    this.showImportModal.set(true);
  }

  closeImportModal() {
    this.showImportModal.set(false);
  }

  onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    this.importFileName.set(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      const content = String(reader.result || '');
      const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
      if (ext === 'ofx') {
        this.importTipo.set('ofx');
        const itens = this.parseOfx(content);
        this.ofxItens.set(itens);
        this.previewItens.set(itens);
      } else {
        this.importTipo.set('csv');
        this.csvFullText = content;
        const primeiraLinha = content.split(/\r?\n/)[0] ?? '';
        this.csvDelimiter = (primeiraLinha.split(';').length > primeiraLinha.split(',').length) ? ';' : ',';
        this.parseCsvContent();
      }
    };
    reader.readAsText(file);
  }

  private parseOfx(content: string): ImportItem[] {
    const itens: ImportItem[] = [];
    const blocks = content.match(/<STMTTRN>([\s\S]*?)<\/STMTTRN>/gi) ?? [];
    for (const block of blocks) {
      const get = (tag: string) => {
        const m = block.match(new RegExp(`<${tag}>([^<\\r\\n]*)`, 'i'));
        return m ? m[1].trim() : '';
      };
      const dtposted = get('DTPOSTED');
      const trnamt = get('TRNAMT');
      const memo = get('MEMO') || get('NAME');
      const fitid = get('FITID') || get('CHECKNUM');
      if (!dtposted || !trnamt) continue;
      const ano = dtposted.slice(0, 4);
      const mes = dtposted.slice(4, 6);
      const dia = dtposted.slice(6, 8);
      const valorBruto = parseFloat(trnamt.replace(',', '.'));
      if (!ano || !mes || !dia || Number.isNaN(valorBruto)) continue;
      itens.push({
        data: `${ano}-${mes}-${dia}`,
        descricao: memo || undefined,
        valor: Math.round(Math.abs(valorBruto) * 100) / 100,
        tipo: valorBruto < 0 ? 'debito' : 'credito',
        documento: fitid || undefined,
      });
    }
    return itens;
  }

  reparseCsv() {
    this.parseCsvContent();
  }

  private parseCsvContent() {
    const delim = this.csvDelimiter === '\\t' ? '\t' : this.csvDelimiter;
    const lines = this.csvFullText.split(/\r?\n/).filter(l => l.trim() !== '');
    const rows = lines.map(l => this.splitCsvLine(l, delim));
    if (rows.length === 0) {
      this.csvHeaders.set([]);
      this.csvRawRows.set([]);
      this.previewItens.set([]);
      return;
    }
    if (this.csvHasHeader) {
      this.csvHeaders.set(rows[0].map((h, i) => h || `Coluna ${i + 1}`));
      this.csvRawRows.set(rows.slice(1));
    } else {
      this.csvHeaders.set(rows[0].map((_, i) => `Coluna ${i + 1}`));
      this.csvRawRows.set(rows);
    }
    this.autoDetectCsvMapping();
    this.refreshCsvPreview();
  }

  private splitCsvLine(line: string, delimiter: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === delimiter && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current.trim());
    return result.map(v => v.replace(/^"|"$/g, ''));
  }

  private autoDetectCsvMapping() {
    const headers = this.csvHeaders().map(h => h.toLowerCase());
    const find = (...keywords: string[]) => headers.findIndex(h => keywords.some(k => h.includes(k)));
    if (this.csvMapping.data === -1) this.csvMapping.data = find('data', 'date', 'dia');
    if (this.csvMapping.descricao === -1) this.csvMapping.descricao = find('histor', 'descri', 'memo', 'lançamento', 'lancamento');
    if (this.csvMapping.valor === -1) this.csvMapping.valor = find('valor', 'amount', 'montante');
    if (this.csvMapping.documento === -1) this.csvMapping.documento = find('documento', 'doc', 'identificador');
  }

  refreshCsvPreview() {
    this.previewItens.set(this.buildCsvPreview());
  }

  private buildCsvPreview(): ImportItem[] {
    const { data: dataIdx, descricao: descIdx, valor: valorIdx, tipo: tipoIdx, documento: docIdx } = this.csvMapping;
    if (dataIdx < 0 || valorIdx < 0) return [];
    const itens: ImportItem[] = [];
    for (const row of this.csvRawRows()) {
      const dataRaw = row[dataIdx]?.trim();
      const valorRaw = row[valorIdx]?.trim();
      if (!dataRaw || !valorRaw) continue;
      const data = this.parseDataBR(dataRaw, this.csvDateFormat);
      const valorBruto = this.parseValorBR(valorRaw);
      if (!data || valorBruto === null) continue;
      let tipo: 'credito' | 'debito' = valorBruto < 0 ? 'debito' : 'credito';
      if (tipoIdx >= 0) {
        const tipoRaw = (row[tipoIdx] || '').toLowerCase();
        if (tipoRaw.includes('deb') || tipoRaw.includes('saí') || tipoRaw.includes('sai')) tipo = 'debito';
        else if (tipoRaw.includes('cred') || tipoRaw.includes('ent')) tipo = 'credito';
      }
      itens.push({
        data,
        descricao: descIdx >= 0 ? (row[descIdx] || undefined) : undefined,
        valor: Math.round(Math.abs(valorBruto) * 100) / 100,
        tipo,
        documento: docIdx >= 0 ? (row[docIdx] || undefined) : undefined,
      });
    }
    return itens;
  }

  private parseDataBR(value: string, format: string): string | null {
    const cleaned = value.trim();
    const parts = cleaned.split(/[\/\-.]/).map(Number);
    if (parts.length !== 3 || parts.some(p => Number.isNaN(p))) return null;
    let d: number, m: number, y: number;
    if (format === 'YYYY-MM-DD') {
      [y, m, d] = parts;
    } else if (format === 'MM/DD/YYYY') {
      [m, d, y] = parts;
    } else {
      [d, m, y] = parts;
    }
    if (y < 100) y += 2000;
    if (!d || !m || !y) return null;
    return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }

  private parseValorBR(value: string): number | null {
    let cleaned = value.replace(/[^\d,.\-]/g, '');
    if (cleaned === '') return null;
    const lastComma = cleaned.lastIndexOf(',');
    const lastDot = cleaned.lastIndexOf('.');
    if (lastComma > lastDot) {
      cleaned = cleaned.replace(/\./g, '').replace(',', '.');
    } else if (lastDot > lastComma) {
      cleaned = cleaned.replace(/,/g, '');
    }
    const num = parseFloat(cleaned);
    return Number.isNaN(num) ? null : num;
  }

  confirmImport() {
    const itens = this.previewItens();
    if (itens.length === 0) return;
    this.importing.set(true);
    this.api.importarExtratoBancario({
      itens,
      arquivo_origem: this.importFileName(),
      banco: this.importBanco,
      local: this.importLocal,
    }).subscribe({
      next: (res) => {
        this.toastr.success(res.message);
        this.closeImportModal();
        this.load();
      },
      error: (err) => this.toastr.error(err.error?.message ?? 'Erro ao importar extrato'),
      complete: () => this.importing.set(false),
    });
  }

  // ---------- Conciliação ----------

  abs(value: number): number {
    return Math.abs(value);
  }

  abrirConciliacao(extrato: ExtratoBancario) {
    this.conciliarTarget.set(extrato);
    this.sugestoes.set([]);
    this.selecionadasItens.set([]);
    this.buscaManualResultados.set([]);
    this.buscaNome = '';
    this.buscaDataInicio = '';
    this.buscaDataFim = '';
    this.buscaValor = null;
    this.loadSugestoes();
  }

  fecharConciliacao() {
    this.conciliarTarget.set(null);
    this.sugestoes.set([]);
    this.selecionadasItens.set([]);
  }

  loadSugestoes() {
    const extrato = this.conciliarTarget();
    if (!extrato) return;
    this.loadingSugestoes.set(true);
    this.api.sugestoesExtratoBancario(extrato.id, this.diasJanela).subscribe({
      next: (res) => this.sugestoes.set(res.data ?? []),
      error: (err) => this.toastr.error(err.error?.message ?? 'Erro ao buscar sugestões'),
      complete: () => this.loadingSugestoes.set(false),
    });
  }

  buscarManual() {
    this.api.baixasDisponiveisConciliacao({
      q: this.buscaNome,
      data_inicio: this.buscaDataInicio,
      data_fim: this.buscaDataFim,
      valor: this.buscaValor,
    }).subscribe({
      next: (res) => this.buscaManualResultados.set(res.data ?? []),
      error: (err) => this.toastr.error(err.error?.message ?? 'Erro na busca'),
    });
  }

  isSelecionada(idBaixa: string): boolean {
    return this.selecionadasItens().some(i => i.id_baixa === idBaixa);
  }

  isGrupoSelecionado(grupo: ConciliacaoSugestaoGrupo): boolean {
    const atual = this.selecionadasItens();
    return grupo.baixas.length > 0 && grupo.baixas.every(b => atual.some(i => i.id_baixa === b.id_baixa));
  }

  toggleBaixa(item: ConciliacaoBaixaItem) {
    const atual = this.selecionadasItens();
    if (atual.some(i => i.id_baixa === item.id_baixa)) {
      this.selecionadasItens.set(atual.filter(i => i.id_baixa !== item.id_baixa));
    } else {
      this.selecionadasItens.set([...atual, item]);
    }
  }

  toggleGrupo(grupo: ConciliacaoSugestaoGrupo) {
    const atual = this.selecionadasItens();
    const idsGrupo = new Set(grupo.baixas.map(b => b.id_baixa));
    const todosSelecionados = grupo.baixas.every(b => atual.some(i => i.id_baixa === b.id_baixa));
    if (todosSelecionados) {
      this.selecionadasItens.set(atual.filter(i => !idsGrupo.has(i.id_baixa)));
    } else {
      const novos = grupo.baixas.filter(b => !atual.some(i => i.id_baixa === b.id_baixa));
      this.selecionadasItens.set([...atual, ...novos]);
    }
  }

  totalSelecionado(): number {
    return this.selecionadasItens().reduce((sum, i) => sum + Number(i.valor || 0), 0);
  }

  diferencaSelecionada(): number {
    const extrato = this.conciliarTarget();
    if (!extrato) return 0;
    return Math.round((this.totalSelecionado() - Number(extrato.valor)) * 100) / 100;
  }

  confirmarConciliacao() {
    const extrato = this.conciliarTarget();
    const itens = this.selecionadasItens();
    if (!extrato || itens.length === 0) return;
    this.conciliando.set(true);
    this.api.conciliarExtratoBancario(extrato.id, itens.map(i => i.id_baixa)).subscribe({
      next: (res) => {
        this.toastr.success(res.message);
        if (res.aviso) this.toastr.warning(res.aviso);
        this.fecharConciliacao();
        this.load();
      },
      error: (err) => this.toastr.error(err.error?.message ?? 'Erro ao conciliar'),
      complete: () => this.conciliando.set(false),
    });
  }

  // ---------- Detalhes ----------

  abrirDetalhes(extrato: ExtratoBancario) {
    this.detalhesTarget.set(extrato);
    this.detalhesBaixas.set([]);
    this.loadingDetalhes.set(true);
    this.api.detalhesExtratoBancario(extrato.id).subscribe({
      next: (res) => this.detalhesBaixas.set(res.baixas ?? []),
      error: (err) => this.toastr.error(err.error?.message ?? 'Erro ao carregar detalhes'),
      complete: () => this.loadingDetalhes.set(false),
    });
  }

  fecharDetalhes() {
    this.detalhesTarget.set(null);
    this.detalhesBaixas.set([]);
  }

  totalDetalhes(): number {
    return this.detalhesBaixas().reduce((sum, i) => sum + Number(i.valor || 0), 0);
  }

  desconciliar() {
    const extrato = this.detalhesTarget();
    if (!extrato) return;
    this.api.desconciliarExtratoBancario(extrato.id).subscribe({
      next: (res) => {
        this.toastr.success(res.message);
        this.fecharDetalhes();
        this.load();
      },
      error: (err) => this.toastr.error(err.error?.message ?? 'Erro ao desconciliar'),
    });
  }
}
