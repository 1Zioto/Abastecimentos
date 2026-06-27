// src/app/features/abastecimentos/list/abastecimentos-list.component.ts
import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../../core/services/api.service';
import { ToastrService } from 'ngx-toastr';
import { Abastecimento, Proprietario } from '../../../shared/models';
import { AuthService } from '../../../core/services/auth.service';
import { ExcelExportService } from '../../../core/services/excel-export.service';

type AbastecimentoSortField =
  | 'data_hora'
  | 'placa'
  | 'proprietario'
  | 'motorista'
  | 'tipo_combustivel'
  | 'quantidade_litros'
  | 'valor_por_litro'
  | 'valor_total'
  | 'verificado_por'
  | 'baixa';
type SortDirection = 'asc' | 'desc';

@Component({
  selector: 'app-abastecimentos-list',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule],
  template: `
    <div class="page">
      <div class="page-header">
        <div>
          <h1>Abastecimentos</h1>
          <p>{{ pagination().total }} registros encontrados</p>
        </div>
        <div class="header-btns">
          <button class="btn-excel" (click)="exportExcel()" [disabled]="exporting()">
            {{ exporting() ? 'Gerando...' : '📊 Excel' }}
          </button>
          @if (canCreate()) {
            <a routerLink="/abastecimentos/novo" class="btn-primary">+ Novo Abastecimento</a>
          }
        </div>
      </div>

      <!-- Filtros -->
      <div class="filters-card">
        <div class="filters-grid">
          <div class="filter-field">
            <label>Proprietário</label>
            <div class="autocomplete-field">
              <input
                type="text"
                [value]="proprietarioBusca()"
                placeholder="Digite o proprietário..."
                (input)="onProprietarioBuscaChange($event)"
                (focus)="showProprietariosDropdown.set(true)"
                (blur)="closeProprietariosDropdown()"
              />
              @if (proprietarioBusca()) {
                <button type="button" class="btn-clear-field" (mousedown)="clearProprietario()">×</button>
              }
              @if (showProprietariosDropdown() && filteredProprietarios().length > 0) {
                <div class="autocomplete-list">
                  <button type="button" class="autocomplete-item" (mousedown)="selectProprietario(null)">Todos</button>
                  @for (p of filteredProprietarios(); track p.id_proprietario) {
                    <button type="button" class="autocomplete-item" (mousedown)="selectProprietario(p)">
                      {{ p.nome }}
                    </button>
                  }
                </div>
              }
            </div>
          </div>
          <div class="filter-field">
            <label>Placa</label>
            <input type="text" [(ngModel)]="filters.placa" placeholder="ABC-1234" (input)="load()" />
          </div>
          <div class="filter-field">
            <label>Data Início</label>
            <div class="date-row">
              <input #dataInicioInput type="date" [(ngModel)]="filters.data_inicio" (change)="load()" />
              <button type="button" class="btn-date" (click)="openDatePicker(dataInicioInput)">📅</button>
            </div>
          </div>
          <div class="filter-field">
            <label>Data Fim</label>
            <div class="date-row">
              <input #dataFimInput type="date" [(ngModel)]="filters.data_fim" (change)="load()" />
              <button type="button" class="btn-date" (click)="openDatePicker(dataFimInput)">📅</button>
            </div>
          </div>
          <div class="filter-field">
            <label>Combustível</label>
            <select [(ngModel)]="filters.tipo_combustivel" (change)="load()">
              <option value="">Todos</option>
              @for (t of tiposCombustivel; track t) {
                <option [value]="t">{{ t }}</option>
              }
            </select>
          </div>
          <div class="filter-field">
            <label>Status</label>
            <select [(ngModel)]="filters.baixa" (change)="load()">
              <option value="">Todos</option>
              <option value="baixado">Baixado</option>
              <option value="pendente">Pendente</option>
            </select>
          </div>
          <div class="filter-field">
            <label>Valor Total (exato)</label>
            <input
              type="text"
              [(ngModel)]="filters.valor_total"
              placeholder="Ex.: 1500 ou 1500,50"
              inputmode="decimal"
              (input)="load()"
            />
          </div>
        </div>
        <button class="btn-clear" (click)="clearFilters()">Limpar Filtros</button>
      </div>

      <!-- Tabela -->
      <div class="table-card">
        @if (loading()) {
          <div class="loading-state"><div class="spinner-lg"></div> Carregando...</div>
        } @else {
          <!-- Paginação (topo) -->
          <div class="pagination pagination-top">
            <span class="page-info">
              Exibindo {{ pagination().from }}–{{ pagination().to }} de {{ pagination().total }}
            </span>
            <div class="page-btns">
              <button [disabled]="pagination().current_page === 1"
                      (click)="goToPage(pagination().current_page - 1)">‹</button>
              @for (p of pages(); track p) {
                <button [class.active]="p === pagination().current_page"
                        (click)="goToPage(p)">{{ p }}</button>
              }
              <button [disabled]="pagination().current_page === pagination().last_page"
                      (click)="goToPage(pagination().current_page + 1)">›</button>
            </div>
          </div>

          <div class="table-wrap">
            <table class="data-table">
              <thead>
                <tr>
                  <th>
                    <button type="button" class="sort-head" [class.active]="isSorted('data_hora')" (click)="sortBy('data_hora')">
                      Data/Hora <span class="sort-icon">{{ sortIcon('data_hora') }}</span>
                    </button>
                  </th>
                  <th>
                    <button type="button" class="sort-head" [class.active]="isSorted('placa')" (click)="sortBy('placa')">
                      Placa <span class="sort-icon">{{ sortIcon('placa') }}</span>
                    </button>
                  </th>
                  <th>
                    <button type="button" class="sort-head" [class.active]="isSorted('proprietario')" (click)="sortBy('proprietario')">
                      Proprietário <span class="sort-icon">{{ sortIcon('proprietario') }}</span>
                    </button>
                  </th>
                  <th>
                    <button type="button" class="sort-head" [class.active]="isSorted('motorista')" (click)="sortBy('motorista')">
                      Motorista <span class="sort-icon">{{ sortIcon('motorista') }}</span>
                    </button>
                  </th>
                  <th>
                    <button type="button" class="sort-head" [class.active]="isSorted('tipo_combustivel')" (click)="sortBy('tipo_combustivel')">
                      Combustível <span class="sort-icon">{{ sortIcon('tipo_combustivel') }}</span>
                    </button>
                  </th>
                  <th class="text-right">
                    <button type="button" class="sort-head sort-right" [class.active]="isSorted('quantidade_litros')" (click)="sortBy('quantidade_litros')">
                      Qtd (L) <span class="sort-icon">{{ sortIcon('quantidade_litros') }}</span>
                    </button>
                  </th>
                  <th class="text-right">
                    <button type="button" class="sort-head sort-right" [class.active]="isSorted('valor_por_litro')" (click)="sortBy('valor_por_litro')">
                      R$/L <span class="sort-icon">{{ sortIcon('valor_por_litro') }}</span>
                    </button>
                  </th>
                  <th class="text-right">
                    <button type="button" class="sort-head sort-right" [class.active]="isSorted('valor_total')" (click)="sortBy('valor_total')">
                      Total <span class="sort-icon">{{ sortIcon('valor_total') }}</span>
                    </button>
                  </th>
                  <th>
                    <button type="button" class="sort-head" [class.active]="isSorted('verificado_por')" (click)="sortBy('verificado_por')">
                      Verificado por <span class="sort-icon">{{ sortIcon('verificado_por') }}</span>
                    </button>
                  </th>
                  <th>
                    <button type="button" class="sort-head" [class.active]="isSorted('baixa')" (click)="sortBy('baixa')">
                      Baixa <span class="sort-icon">{{ sortIcon('baixa') }}</span>
                    </button>
                  </th>
                  <th>Hodômetro</th>
                  <th>Bomba</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                @for (a of abastecimentos(); track a.id_abastecimento) {
                  <tr class="clickable-row" [class.row-inconsistent]="getDisplayStatus(a) === 'Inconsistente'" (click)="openDetails(a)">
                    <td class="dt-cell">
                      <span class="dt-date">{{ a.data | date:'dd/MM/yyyy' }}</span>
                      <span class="dt-time">{{ a.data_hora | date:'HH:mm' }}</span>
                    </td>
                    <td><span class="placa-badge">{{ a.veiculo?.placa ?? '—' }}</span></td>
                    <td>{{ a.nome_proprietario || a.proprietario?.nome || '—' }}</td>
                    <td>{{ a.nome_motorista || a.motorista?.nome || '—' }}</td>
                    <td>{{ a.tipo_combustivel }}</td>
                    <td class="text-right">{{ a.quantidade_litros | number:'1.2-2' }}</td>
                    <td class="text-right">{{ a.valor_por_litro | number:'1.3-3' }}</td>
                    <td class="text-right val-green">{{ a.valor_total | currency:'BRL':'symbol':'1.2-2' }}</td>
                    <td>
                      @if (a.imagem_verificada_por) {
                        <span class="verified-by">
                          <strong>{{ a.imagem_verificada_por }}</strong>
                          @if (a.imagem_verificada_em) {
                            <small>{{ a.imagem_verificada_em | date:'dd/MM HH:mm' }}</small>
                          }
                        </span>
                      } @else {
                        <span class="muted">—</span>
                      }
                    </td>
                    <td>
                      <span class="badge" [class]="a.baixa_abastecimento ? 'badge-green' : 'badge-orange'">
                        {{ a.baixa_abastecimento ? 'Baixado' : 'Pendente' }}
                      </span>
                    </td>
                    <td>
                      @if (resolveImageUrl(a.foto_odometro); as fotoOdometroUrl) {
                        <div class="thumb-wrap">
                          <img class="thumb" [src]="fotoOdometroUrl" alt="Hodômetro" />
                          <button type="button" class="thumb-view" title="Visualizar foto do hodômetro" (click)="openImagePreview(fotoOdometroUrl, $event)">👁</button>
                        </div>
                      } @else {
                        <span class="muted">Sem foto</span>
                      }
                    </td>
                    <td>
                      @if (resolveImageUrl(a.bomba); as bombaUrl) {
                        <div class="thumb-wrap">
                          <img class="thumb" [src]="bombaUrl" alt="Bomba" />
                          <button type="button" class="thumb-view" title="Visualizar foto da bomba" (click)="openImagePreview(bombaUrl, $event)">👁</button>
                        </div>
                      } @else {
                        <span class="muted">Sem foto</span>
                      }
                    </td>
                    <td>
                      <div class="actions">
                        @if (isAdmin()) {
                          <a [routerLink]="['/abastecimentos', a.id_abastecimento, 'editar']"
                             class="action-btn edit" title="Editar" (click)="$event.stopPropagation()">✏️</a>
                        }
                        <button class="action-btn print" title="Comprovante"
                                (click)="printComprovante(a, $event)">🖨️</button>
                        <button class="action-btn whatsapp" title="Enviar pelo WhatsApp"
                                (click)="compartilharWhatsapp(a, $event)">
                          <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor" aria-hidden="true">
                            <path d="M.057 24l1.687-6.163a11.867 11.867 0 01-1.587-5.946C.16 5.335 5.495 0 12.05 0a11.817 11.817 0 018.413 3.488 11.824 11.824 0 013.48 8.414c-.003 6.557-5.338 11.892-11.893 11.892a11.9 11.9 0 01-5.688-1.448L.057 24zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884a9.86 9.86 0 001.59 5.317l-.999 3.648 3.908-1.024zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.612-.916-2.207-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z"/>
                          </svg>
                        </button>
                        @if (canResolveInconsistency() && isInconsistent(a)) {
                          <button class="action-btn verify" title="Marcar consistente"
                                  (click)="verificarInconsistencia(a, $event)">OK</button>
                        }
                        @if (isAdmin()) {
                          <button class="action-btn del" title="Excluir"
                                  (click)="confirmDelete(a, $event)">🗑️</button>
                        }
                      </div>
                    </td>
                  </tr>
                }
                @empty {
                  <tr><td colspan="13" class="empty-cell">Nenhum abastecimento encontrado</td></tr>
                }
              </tbody>
            </table>
          </div>

          <!-- Paginação -->
          <div class="pagination">
            <span class="page-info">
              Exibindo {{ pagination().from }}–{{ pagination().to }} de {{ pagination().total }}
            </span>
            <div class="page-btns">
              <button [disabled]="pagination().current_page === 1"
                      (click)="goToPage(pagination().current_page - 1)">‹</button>
              @for (p of pages(); track p) {
                <button [class.active]="p === pagination().current_page"
                        (click)="goToPage(p)">{{ p }}</button>
              }
              <button [disabled]="pagination().current_page === pagination().last_page"
                      (click)="goToPage(pagination().current_page + 1)">›</button>
            </div>
          </div>
        }
      </div>

      <!-- Confirm Delete Modal -->
      @if (deleteTarget()) {
        <div class="modal-overlay" (click)="deleteTarget.set(null)">
          <div class="modal" (click)="$event.stopPropagation()">
            <h3>Confirmar Exclusão</h3>
            <p>Tem certeza que deseja excluir o abastecimento de
              <strong>{{ deleteTarget()?.nome_proprietario }}</strong>
              em <strong>{{ deleteTarget()?.data | date:'dd/MM/yyyy' }}</strong>?
            </p>
            <p class="warning-text">⚠️ Baixas vinculadas também serão removidas.</p>
            <div class="modal-actions">
              <button class="btn-cancel" (click)="deleteTarget.set(null)">Cancelar</button>
              <button class="btn-danger" (click)="executeDelete()" [disabled]="deleting()">
                {{ deleting() ? 'Excluindo...' : 'Excluir' }}
              </button>
            </div>
          </div>
        </div>
      }

      @if (detailTarget(); as detail) {
        <div class="modal-overlay" (click)="closeDetails()">
          <div class="details-modal" (click)="$event.stopPropagation()">
            <div class="details-header">
              <div>
                <h3>{{ detail.veiculo?.placa ?? 'Abastecimento' }}</h3>
                <p>{{ detail.data_hora | date:'dd/MM/yyyy HH:mm' }}</p>
              </div>
              <button type="button" class="btn-icon-close" (click)="closeDetails()">×</button>
            </div>

            <div class="details-grid">
              <div><span>Proprietário</span><strong>{{ detail.nome_proprietario || detail.proprietario?.nome || '—' }}</strong></div>
              <div><span>Motorista</span><strong>{{ detail.nome_motorista || detail.motorista?.nome || '—' }}</strong></div>
              <div><span>Combustível</span><strong>{{ detail.tipo_combustivel || '—' }}</strong></div>
              <div>
                <span>Verificado por</span>
                <strong>{{ detail.imagem_verificada_por || '—' }}</strong>
                @if (detail.imagem_verificada_em) {
                  <small class="detail-helper">{{ detail.imagem_verificada_em | date:'dd/MM/yyyy HH:mm' }}</small>
                }
              </div>
              <div><span>Quantidade</span><strong>{{ detail.quantidade_litros | number:'1.2-2' }} L</strong></div>
              <div><span>Valor por litro</span><strong>{{ detail.valor_por_litro | number:'1.3-3' }}</strong></div>
              <div><span>Valor total</span><strong class="val-green">{{ detail.valor_total | currency:'BRL':'symbol':'1.2-2' }}</strong></div>
              <div><span>Hodômetro</span><strong>{{ detail.odometro || '—' }}</strong></div>
              <div><span>Local</span><strong>{{ detail.local || '—' }}</strong></div>
              <div><span>Baixa</span><strong>{{ detail.baixa_abastecimento ? 'Baixado' : 'Pendente' }}</strong></div>
            </div>

            @if (detail.observacao) {
              <div class="details-note">
                <span>Observação</span>
                <p>{{ detail.observacao }}</p>
              </div>
            }

            <div class="details-images">
              @if (resolveImageUrl(detail.foto_odometro); as odometroUrl) {
                <button type="button" (click)="openImagePreview(odometroUrl, $event)">
                  <img [src]="odometroUrl" alt="Hodômetro" />
                  <span>Hodômetro</span>
                </button>
              }
              @if (resolveImageUrl(detail.bomba); as bombaUrl) {
                <button type="button" (click)="openImagePreview(bombaUrl, $event)">
                  <img [src]="bombaUrl" alt="Bomba" />
                  <span>Bomba</span>
                </button>
              }
            </div>

            <div class="details-actions">
              <button type="button" class="btn-secondary" (click)="printComprovante(detail, $event)">Comprovante</button>
              <button type="button" class="btn-whatsapp" (click)="compartilharWhatsapp(detail, $event)">
                <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor" aria-hidden="true">
                  <path d="M.057 24l1.687-6.163a11.867 11.867 0 01-1.587-5.946C.16 5.335 5.495 0 12.05 0a11.817 11.817 0 018.413 3.488 11.824 11.824 0 013.48 8.414c-.003 6.557-5.338 11.892-11.893 11.892a11.9 11.9 0 01-5.688-1.448L.057 24zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884a9.86 9.86 0 001.59 5.317l-.999 3.648 3.908-1.024zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.612-.916-2.207-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z"/>
                </svg>
                WhatsApp
              </button>
              @if (canResolveInconsistency() && isInconsistent(detail)) {
                <button type="button" class="btn-secondary" (click)="verificarInconsistencia(detail, $event)">Marcar consistente</button>
              }
              @if (isAdmin()) {
                <a class="btn-edit" [routerLink]="['/abastecimentos', detail.id_abastecimento, 'editar']">Editar</a>
                <button type="button" class="btn-danger" (click)="confirmDelete(detail, $event)">Excluir</button>
              }
            </div>
          </div>
        </div>
      }
    </div>

      @if (previewImageUrl()) {
        <div class="image-overlay" (click)="closeImagePreview()">
          <div class="image-modal" (click)="$event.stopPropagation()">
            <img [src]="previewImageUrl()" alt="Imagem ampliada" />
            <button type="button" class="btn-close-image" (click)="closeImagePreview()">Fechar</button>
          </div>
        </div>
      }
  `,
  styles: [`
    * { box-sizing: border-box; }
    .page { padding: 28px; font-family: 'Inter', sans-serif; color: #e2e8f0; }
    .page-header { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:20px; }
    .page-header h1 { font-size:24px; font-weight:700; color:#f8fafc; margin:0; }
    .page-header p { font-size:12px; color:#64748b; margin-top:4px; }

    .btn-primary { background:linear-gradient(135deg,#0ea5e9,#6366f1); border:none; border-radius:8px; padding:10px 20px; color:#fff; font-size:13px; font-weight:600; cursor:pointer; text-decoration:none; transition:all 0.2s; }
    .btn-primary:hover { opacity:0.9; }
    .header-btns { display:flex; gap:10px; align-items:center; }
    .btn-excel { background:#0d1427; border:1px solid #16a34a60; border-radius:8px; padding:10px 16px; color:#4ade80; font-size:13px; font-weight:600; cursor:pointer; }
    .btn-excel:hover { border-color:#4ade80; }
    .btn-excel:disabled { opacity:0.5; cursor:wait; }

    .filters-card { background:#0d1427; border:1px solid #1e2d4a; border-radius:12px; padding:18px; margin-bottom:16px; }
    .filters-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(180px,1fr)); gap:12px; margin-bottom:12px; }
    .filter-field { display:flex; flex-direction:column; gap:4px; }
    .filter-field label { font-size:11px; font-weight:600; color:#64748b; text-transform:uppercase; letter-spacing:0.5px; }
    .filter-field input, .filter-field select {
      background:#0a0f1e; border:1px solid #1e2d4a; border-radius:7px;
      padding:8px 10px; color:#e2e8f0; font-size:12px; outline:none;
    }
    .filter-field input:focus, .filter-field select:focus { border-color:#0ea5e9; }
    .filter-field select option { background:#0d1427; }
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
      max-height:240px; overflow:auto; background:#0a0f1e; border:1px solid #1e2d4a;
      border-radius:8px; box-shadow:0 16px 40px rgba(2,6,23,0.35); padding:4px;
    }
    .autocomplete-item {
      width:100%; border:none; background:transparent; color:#e2e8f0; text-align:left;
      padding:8px 9px; border-radius:6px; font-size:12px; cursor:pointer;
    }
    .autocomplete-item:hover { background:#1e2d4a; }
    .date-row { display:flex; gap:8px; align-items:center; }
    .date-row input { flex:1; min-width:0; }
    .btn-date { height:34px; min-width:40px; padding:0 10px; background:#0a0f1e; border:1px solid #1e2d4a; border-radius:7px; color:#94a3b8; cursor:pointer; font-size:14px; }
    .btn-date:hover { border-color:#38bdf8; color:#38bdf8; }
    .btn-clear { background:transparent; border:1px solid #1e2d4a; color:#64748b; padding:6px 14px; border-radius:6px; font-size:12px; cursor:pointer; }
    .btn-clear:hover { border-color:#94a3b8; color:#94a3b8; }

    .table-card { background:#0d1427; border:1px solid #1e2d4a; border-radius:12px; overflow:hidden; }
    .loading-state { display:flex; align-items:center; gap:10px; padding:40px; justify-content:center; color:#64748b; }
    .spinner-lg { width:24px;height:24px;border:3px solid #1e2d4a;border-top-color:#0ea5e9;border-radius:50%;animation:spin 0.8s linear infinite; }
    @keyframes spin { to{transform:rotate(360deg);} }

    .table-wrap { overflow-x:auto; }
    .data-table { width:100%; border-collapse:collapse; font-size:12px; }
    .data-table thead th { padding:10px 12px; text-align:left; font-size:10px; text-transform:uppercase; letter-spacing:0.5px; color:#64748b; border-bottom:1px solid #1e2d4a; white-space:nowrap; background:#080e1c; }
    .sort-head {
      width: 100%;
      border: 0;
      background: transparent;
      color: inherit;
      padding: 0;
      display: inline-flex;
      align-items: center;
      gap: 5px;
      font: inherit;
      letter-spacing: inherit;
      text-transform: inherit;
      cursor: pointer;
    }
    .sort-head.sort-right { justify-content: flex-end; }
    .sort-head:hover,
    .sort-head.active { color:#38bdf8; }
    .sort-icon { display:inline-block; min-width:10px; color:#475569; font-size:9px; }
    .sort-head.active .sort-icon { color:#38bdf8; }
    .data-table tbody td { padding:10px 12px; border-bottom:1px solid #1e2d4a20; vertical-align:middle; }
    .data-table tbody tr:hover td { background:#1e2d4a15; }
    .clickable-row { cursor:pointer; }
    .text-right { text-align:right; }

    .dt-cell { display:flex; flex-direction:column; }
    .dt-date { font-weight:600; color:#e2e8f0; }
    .dt-time { font-size:11px; color:#64748b; }

    .placa-badge { background:#1e2d4a; color:#38bdf8; padding:3px 8px; border-radius:5px; font-size:11px; font-weight:700; font-family:monospace; }
    .val-green { color:#4ade80; font-weight:600; }

    .badge { padding:3px 8px; border-radius:20px; font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:0.3px; }
    .badge-blue { background:#dbeafe20; color:#60a5fa; }
    .badge-yellow { background:#fef9c320; color:#fbbf24; }
    .badge-red { background:#fee2e220; color:#f87171; }
    .badge-green { background:#dcfce720; color:#4ade80; }
    .badge-orange { background:#ffedd520; color:#fb923c; }
    .row-inconsistent { background:#ffedd50f; box-shadow:inset 4px 0 0 #fb923c; }
    .row-inconsistent:hover { background:#ffedd51f; }
    .verified-by { display:flex; flex-direction:column; gap:2px; min-width:110px; }
    .verified-by strong { color:#e2e8f0; font-size:12px; font-weight:700; }
    .verified-by small,
    .detail-helper { color:#64748b; font-size:11px; font-weight:500; margin-top:3px; display:block; }

    .data-table th:last-child,
    .data-table td:last-child {
      width: 86px;
      min-width: 86px;
      max-width: 86px;
    }
    .actions {
      width: 64px;
      display:grid;
      grid-template-columns: repeat(2, 1fr);
      gap:5px;
      align-items:center;
      justify-items:center;
    }
    .thumb-wrap { position:relative; width:58px; height:58px; }
    .thumb {
      width: 58px;
      height: 58px;
      object-fit: cover;
      border-radius: 8px;
      border: 1px solid #1e2d4a;
      background: #0a0f1e;
    }
    .thumb-view {
      position:absolute;
      right:4px;
      bottom:4px;
      width:26px;
      height:26px;
      border-radius:8px;
      border:1px solid rgba(255,255,255,0.35);
      background:rgba(2,6,23,0.74);
      color:#fff;
      display:flex;
      align-items:center;
      justify-content:center;
      cursor:pointer;
      font-size:13px;
      line-height:1;
      box-shadow:0 4px 12px rgba(0,0,0,0.4);
      backdrop-filter: blur(4px);
    }
    .thumb-view:hover { background:rgba(14,165,233,0.82); border-color:#7dd3fc; }
    .muted { color: #64748b; font-size: 11px; }
    .action-btn { background:transparent; border:none; cursor:pointer; font-size:14px; padding:4px; border-radius:5px; transition:background 0.2s; text-decoration:none; min-width:28px; min-height:28px; display:inline-flex; align-items:center; justify-content:center; }
    .action-btn:hover { background:#1e2d4a; }
    .action-btn.verify {
      border:1px solid #fb923c;
      color:#111827;
      background:#fdba74;
      font-size:11px;
      font-weight:800;
      white-space:nowrap;
      grid-column:1 / -1;
      width:100%;
      min-height:30px;
      padding:5px 6px;
    }
    .action-btn.verify:hover { background:#fb923c; color:#111827; }
    .action-btn.analyze {
      border:1px solid #0284c7;
      color:#111827;
      background:#7dd3fc;
      font-size:11px;
      font-weight:700;
      white-space:nowrap;
      grid-column:1 / -1;
      width:100%;
      min-height:30px;
      padding:5px 6px;
    }
    .action-btn.analyze:hover { background:#38bdf8; }
    .action-btn:disabled { opacity:0.55; cursor:wait; }
    .action-btn.whatsapp { color:#25D366; }
    .action-btn.whatsapp:hover { background:#25D36622; color:#25D366; }
    .btn-whatsapp { display:inline-flex; align-items:center; gap:6px; background:#25D366; border:none; border-radius:8px; padding:8px 16px; color:#fff; font-size:13px; font-weight:600; cursor:pointer; transition:opacity 0.2s; }
    .btn-whatsapp:hover { opacity:0.9; }

    .empty-cell { text-align:center; padding:32px; color:#475569; }

    .pagination { display:flex; align-items:center; justify-content:space-between; padding:14px 16px; border-top:1px solid #1e2d4a; flex-wrap:wrap; gap:10px; }
    .pagination-top { border-top:none; border-bottom:1px solid #1e2d4a; }
    .page-info { font-size:12px; color:#64748b; }
    .page-btns { display:flex; gap:4px; }
    .page-btns button { background:#0a0f1e; border:1px solid #1e2d4a; color:#64748b; padding:4px 10px; border-radius:5px; cursor:pointer; font-size:12px; transition:all 0.2s; }
    .page-btns button:hover:not(:disabled) { border-color:#0ea5e9; color:#38bdf8; }
    .page-btns button.active { background:#0ea5e920; border-color:#0ea5e9; color:#38bdf8; }
    .page-btns button:disabled { opacity:0.4; cursor:not-allowed; }

    .modal-overlay { position:fixed; inset:0; background:rgba(0,0,0,0.7); display:flex; align-items:center; justify-content:center; z-index:1000; }
    .modal { background:#0d1427; border:1px solid #1e2d4a; border-radius:14px; padding:28px; max-width:420px; width:90%; }
    .modal h3 { font-size:16px; font-weight:700; color:#f8fafc; margin:0 0 12px; }
    .modal p { font-size:13px; color:#94a3b8; margin-bottom:10px; }
    .warning-text { color: #b91c1c !important; font-weight: 600; background: #fef2f2; border: 1px solid #fca5a5; padding: 8px 12px; border-radius: 8px; margin-top: 10px; display: block; }
    .modal-actions { display:flex; gap:10px; justify-content:flex-end; margin-top:20px; }
    .btn-cancel { background:transparent; border:1px solid #1e2d4a; color:#64748b; padding:8px 16px; border-radius:7px; cursor:pointer; font-size:13px; }
    .btn-danger { background:#dc2626; border:none; color:#fff; padding:8px 16px; border-radius:7px; cursor:pointer; font-size:13px; font-weight:600; }
    .btn-danger:disabled { opacity:0.5; }
    .details-modal { background:#fff; border:1px solid #dbe4f0; border-radius:14px; padding:22px; max-width:760px; width:min(94vw,760px); max-height:88vh; overflow:auto; box-shadow:0 24px 70px rgba(15,23,42,0.22); }
    .details-header { display:flex; justify-content:space-between; align-items:flex-start; gap:16px; margin-bottom:16px; }
    .details-header h3 { margin:0; color:#111827; font-size:22px; }
    .details-header p { margin:4px 0 0; color:#64748b; font-size:12px; }
    .btn-icon-close { width:34px; height:34px; border-radius:8px; border:1px solid #cbd5e1; background:#fff; color:#334155; cursor:pointer; font-size:20px; transition: all 0.2s ease; }
    .btn-icon-close:hover { background: #f1f5f9; border-color: #94a3b8; color: #0f172a; }
    .details-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(170px,1fr)); gap:10px; }
    .details-grid div, .details-note { background:#f8fafc; border:1px solid #dbe4f0; border-radius:10px; padding:10px 12px; }
    .details-grid span, .details-note span { display:block; color:#64748b; font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:0.5px; margin-bottom:3px; }
    .details-grid strong { color:#111827; font-size:13px; }
    .details-note { margin-top:10px; }
    .details-note p { margin:0; color:#334155; font-size:13px; }
    .details-images { display:flex; gap:10px; flex-wrap:wrap; margin-top:14px; }
    .details-images button { width:132px; border:1px solid #dbe4f0; background:#fff; color:#334155; border-radius:10px; padding:8px; cursor:pointer; text-align:left; transition: all 0.2s ease; }
    .details-images button:hover { border-color: #38bdf8; background: #f0f9ff; }
    .details-images img { width:100%; height:92px; object-fit:cover; border-radius:8px; display:block; margin-bottom:6px; }
    .details-images span { font-size:12px; color:#64748b; }
    .details-actions { display:flex; justify-content:flex-end; gap:10px; flex-wrap:wrap; margin-top:18px; }
    .btn-secondary, .btn-edit { background:#fff; border:1px solid #cbd5e1; color:#334155; padding:8px 14px; border-radius:8px; cursor:pointer; font-size:13px; text-decoration:none; transition: all 0.2s ease; }
    .btn-secondary:hover { border-color: #38bdf8; color: #38bdf8; }
    .btn-edit { border-color:#0ea5e9; color:#0369a1; }
    .btn-edit:hover { background: #e0f2fe; }
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
export class AbastecimentosListComponent implements OnInit, OnDestroy {
  private api = inject(ApiService);
  private toastr = inject(ToastrService);
  private auth = inject(AuthService);
  private excel = inject(ExcelExportService);

  exporting = signal(false);

  exportExcel() {
    this.exporting.set(true);
    this.api.getAbastecimentos({ ...this.filters, page: 1, per_page: 5000 }).subscribe({
      next: (r) => {
        const rows = (r.data ?? []).map((a: any) => ({
          'Data': a.data ? String(a.data).slice(0, 10).split('-').reverse().join('/') : '',
          'Hora': a.data_hora ? String(a.data_hora).slice(11, 16) : '',
          'Placa': a.veiculo?.placa ?? '',
          'Proprietário': a.nome_proprietario || a.proprietario?.nome || '',
          'Motorista': a.nome_motorista || a.motorista?.nome || '',
          'Combustível': a.tipo_combustivel ?? '',
          'Qtd (L)': Number(a.quantidade_litros ?? 0),
          'R$/L': Number(a.valor_por_litro ?? 0),
          'Total (R$)': Number(a.valor_total ?? 0),
          'Hodômetro': a.odometro ?? '',
          'Baixa': a.baixa_abastecimento ? 'Baixado' : 'Pendente',
          'Local': a.local ?? '',
          'Observação': a.observacao ?? '',
        }));
        if (!rows.length) {
          this.toastr.warning('Nada para exportar com os filtros atuais.');
        } else {
          this.excel.export(`abastecimentos_${new Date().toISOString().slice(0, 10)}`, rows, 'Abastecimentos');
          this.toastr.success(`${rows.length} registro(s) exportado(s).`);
        }
        this.exporting.set(false);
      },
      error: () => {
        this.toastr.error('Erro ao exportar.');
        this.exporting.set(false);
      },
    });
  }

  abastecimentos = signal<Abastecimento[]>([]);
  proprietarios = signal<Proprietario[]>([]);
  loading = signal(true);
  deleting = signal(false);
  deleteTarget = signal<Abastecimento | null>(null);
  detailTarget = signal<Abastecimento | null>(null);
  previewImageUrl = signal('');
  proprietarioBusca = signal('');
  showProprietariosDropdown = signal(false);
  pagination = signal({ current_page: 1, last_page: 1, per_page: 20, total: 0, from: 0, to: 0 });

  private readonly defaultTipoCombustivel = 'OLEO DIESEL S10';
  tiposCombustivel: string[] = [this.defaultTipoCombustivel];

  filters: any = {
    id_proprietario: '',
    placa: '',
    data_inicio: '',
    data_fim: '',
    tipo_combustivel: '',
    baixa: '',
    valor_total: '',
    page: 1,
    sort_by: 'data_hora' as AbastecimentoSortField,
    sort_dir: 'desc' as SortDirection,
  };
  private readonly onGaragemChanged = () => {
    this.loadTiposCombustivel();
    this.loadProprietarios();
    this.load();
  };

  filteredProprietarios = computed(() => {
    const term = this.normalizeText(this.proprietarioBusca());
    if (!term) return this.proprietarios().slice(0, 40);
    return this.proprietarios()
      .filter((p) => this.normalizeText(p.nome).includes(term))
      .slice(0, 40);
  });

  ngOnInit() {
    window.addEventListener('garagem:changed', this.onGaragemChanged);
    this.loadTiposCombustivel();
    this.loadProprietarios();
    this.load();
  }

  ngOnDestroy() {
    window.removeEventListener('garagem:changed', this.onGaragemChanged);
  }

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
        this.tiposCombustivel = tipos.length ? tipos : [this.defaultTipoCombustivel];
        if (this.filters.tipo_combustivel && !this.tiposCombustivel.includes(this.filters.tipo_combustivel)) {
          this.filters.tipo_combustivel = '';
        }
      },
      error: () => {
        this.tiposCombustivel = [this.defaultTipoCombustivel];
      }
    });
  }

  loadProprietarios() {
    this.api.getProprietariosAll().subscribe(r => this.proprietarios.set(r.data));
  }

  load() {
    this.loading.set(true);
    this.api.getAbastecimentos({ ...this.filters, per_page: 200 }).subscribe({
      next: r => {
        this.abastecimentos.set(r.data);
        this.pagination.set({ current_page: r.current_page, last_page: r.last_page, per_page: r.per_page, total: r.total, from: r.from ?? 0, to: r.to ?? 0 });
        this.loading.set(false);
      },
      error: () => this.loading.set(false)
    });
  }

  clearFilters() {
    const sort_by = this.filters.sort_by;
    const sort_dir = this.filters.sort_dir;
    this.filters = { id_proprietario:'',placa:'',data_inicio:'',data_fim:'',tipo_combustivel:'',baixa:'',valor_total:'',page:1,sort_by,sort_dir };
    this.proprietarioBusca.set('');
    this.load();
  }

  sortBy(field: AbastecimentoSortField) {
    if (this.filters.sort_by === field) {
      this.filters.sort_dir = this.filters.sort_dir === 'asc' ? 'desc' : 'asc';
    } else {
      this.filters.sort_by = field;
      this.filters.sort_dir = field === 'data_hora' ? 'desc' : 'asc';
    }
    this.filters.page = 1;
    this.load();
  }

  isSorted(field: AbastecimentoSortField): boolean {
    return this.filters.sort_by === field;
  }

  sortIcon(field: AbastecimentoSortField): string {
    if (!this.isSorted(field)) return '↕';
    return this.filters.sort_dir === 'asc' ? '▲' : '▼';
  }

  private normalizeText(value: unknown): string {
    return String(value ?? '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  }

  onProprietarioBuscaChange(event: Event) {
    const value = (event.target as HTMLInputElement).value;
    this.proprietarioBusca.set(value);
    this.showProprietariosDropdown.set(true);
    const exact = this.proprietarios().find((p) => this.normalizeText(p.nome) === this.normalizeText(value));
    this.filters.id_proprietario = exact?.id_proprietario ?? '';
    this.filters.page = 1;
    this.load();
  }

  selectProprietario(proprietario: Proprietario | null) {
    this.filters.id_proprietario = proprietario?.id_proprietario ?? '';
    this.filters.page = 1;
    this.proprietarioBusca.set(proprietario?.nome ?? '');
    this.showProprietariosDropdown.set(false);
    this.load();
  }

  clearProprietario() {
    this.selectProprietario(null);
  }

  closeProprietariosDropdown() {
    setTimeout(() => this.showProprietariosDropdown.set(false), 120);
  }

  goToPage(p: number) {
    this.filters.page = p;
    this.load();
  }

  pages(): number[] {
    const { current_page, last_page } = this.pagination();
    const start = Math.max(1, current_page - 2);
    const end = Math.min(last_page, current_page + 2);
    return Array.from({ length: end - start + 1 }, (_, i) => start + i);
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

  getStatusClass(status?: string): string {
    const normalized = this.normalizeStatus(status);
    if (normalized === 'Confirmado') return 'badge badge-blue';
    if (normalized === 'Cancelado') return 'badge badge-red';
    if (normalized === 'Inconsistente') return 'badge badge-orange';
    return 'badge badge-yellow';
  }

  normalizeStatus(status?: string | null): string {
    const normalized = String(status ?? '').trim();
    if (normalized.toLowerCase() === 'inconsistente') return 'Inconsistente';
    if (normalized.toLowerCase() === 'confirmado') return 'Confirmado';
    if (normalized.toLowerCase() === 'cancelado') return 'Cancelado';
    if (normalized.toLowerCase() === 'pendente') return 'Pendente';
    return normalized || '—';
  }

  isInconsistent(a: Abastecimento): boolean {
    return this.normalizeStatus(a.status) === 'Inconsistente';
  }

  getDisplayStatus(a: Abastecimento): string {
    const status = this.normalizeStatus(a.status);
    if (status === 'Inconsistente') return status;
    return status;
  }

  resolveImageUrl(url?: string | null): string | null {
    return this.api.resolveImageUrl(url);
  }

  openDetails(a: Abastecimento) {
    this.detailTarget.set(a);
  }

  closeDetails() {
    this.detailTarget.set(null);
  }

  openImagePreview(url?: string | null, event?: Event) {
    event?.stopPropagation();
    const imageUrl = this.resolveImageUrl(url);
    if (!imageUrl) return;
    this.previewImageUrl.set(imageUrl);
  }

  closeImagePreview() {
    this.previewImageUrl.set('');
  }

  printComprovante(a: Abastecimento, event?: Event) {
    event?.stopPropagation();
    const id = a.id_abastecimento;
    if (!id) {
      this.toastr.error('Abastecimento sem ID para exportar.');
      return;
    }

    this.api.getComprovantePdf(id).subscribe({
      next: (response) => {
        const blob = response.body;
        if (!blob || blob.size === 0) {
          this.toastr.error('PDF retornou vazio.');
          return;
        }
        const filename = this.filenameFromDisposition(response.headers.get('content-disposition'))
          || `comprovante_${id}.pdf`;
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
      },
      error: async (err) => {
        const msg = await this.errorMessageFromBlob(err?.error);
        this.toastr.error(msg || 'Não foi possível exportar o comprovante em PDF.');
      },
    });
  }

  // ── Compartilhar pelo WhatsApp (mesma mensagem do APK) ──────────
  compartilharWhatsapp(a: Abastecimento, event?: Event) {
    event?.stopPropagation();

    const telefone = this.telefoneWhatsapp(this.resolverCelular(a));
    const dataHora = this.dataHoraWhatsapp(a.data_hora ?? a.data);
    const motorista = a.nome_motorista || a.motorista?.nome || '-';
    const placa = a.veiculo?.placa || a.placa1 || '-';
    const odometro = (a.odometro === null || a.odometro === undefined)
      ? '-'
      : new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 }).format(a.odometro);
    const litros = this.numeroWhatsapp(a.quantidade_litros);
    const valorBase = (a.valor_total !== null && a.valor_total !== undefined)
      ? a.valor_total
      : Math.floor(((a.valor_por_litro || 0) * (a.quantidade_litros || 0)) + 0.000001);
    const valorTotal = this.numeroWhatsapp(valorBase);

    const msg = [
      'Prezado',
      'Segue os dados do abastecimento.',
      `Data/Hora: ${dataHora}`,
      `Motorista: ${motorista}`,
      `Placa: ${placa}`,
      `KM do Veiculo: ${odometro}`,
      `Quantidade abastecida: ${litros} Litros`,
      `*Valor Total:${valorTotal}*`,
    ].join('\n');

    if (!telefone) {
      this.toastr.warning('Proprietário sem telefone cadastrado. Abrindo sem destinatário.');
    }

    const url = telefone
      ? `https://wa.me/${telefone}?text=${encodeURIComponent(msg)}`
      : `https://wa.me/?text=${encodeURIComponent(msg)}`;
    window.open(url, '_blank');
  }

  private resolverCelular(a: Abastecimento): string | null {
    const direto = a.proprietario?.celular;
    if (direto) return direto;

    const lista = this.proprietarios();
    let p = a.id_proprietario
      ? lista.find(x => x.id_proprietario === a.id_proprietario)
      : undefined;
    if (!p) {
      const nome = (a.nome_proprietario || a.proprietario?.nome || '').trim().toLowerCase();
      if (nome) p = lista.find(x => (x.nome || '').trim().toLowerCase() === nome);
    }
    return p?.celular ?? null;
  }

  private telefoneWhatsapp(raw?: string | null): string | null {
    const digits = (raw ?? '').replace(/\D/g, '');
    if (!digits) return null;
    if (digits.startsWith('55')) return digits;
    if (digits.length === 10 || digits.length === 11) return `55${digits}`;
    return digits;
  }

  private dataHoraWhatsapp(iso?: string | null): string {
    if (!iso) return '-';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    const two = (n: number) => String(n).padStart(2, '0');
    return `${two(d.getDate())}/${two(d.getMonth() + 1)}/${d.getFullYear()} ${two(d.getHours())}:${two(d.getMinutes())}:${two(d.getSeconds())}`;
  }

  private numeroWhatsapp(value?: number | null): string {
    if (value === null || value === undefined) return '0';
    const rounded = Math.round(value);
    if (Math.abs(value - rounded) < 0.001) return String(rounded);
    return new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
  }

  private filenameFromDisposition(disposition: string | null): string | null {
    if (!disposition) return null;
    const utf = /filename\*=UTF-8''([^;]+)/i.exec(disposition);
    if (utf?.[1]) return decodeURIComponent(utf[1].replace(/"/g, ''));
    const simple = /filename="?([^"]+)"?/i.exec(disposition);
    return simple?.[1] ?? null;
  }

  private async errorMessageFromBlob(error: unknown): Promise<string> {
    if (!(error instanceof Blob)) return '';
    try {
      const text = await error.text();
      const parsed = JSON.parse(text);
      return parsed?.message || parsed?.error || '';
    } catch {
      return '';
    }
  }

  confirmDelete(a: Abastecimento, event?: Event) {
    event?.stopPropagation();
    this.detailTarget.set(null);
    this.deleteTarget.set(a);
  }

  verificarInconsistencia(a: Abastecimento, event?: Event) {
    event?.stopPropagation();
    if (!this.canResolveInconsistency()) {
      this.toastr.error('Sem permissão para marcar como consistente');
      return;
    }
    this.api.verificarInconsistencia(a.id_abastecimento).subscribe({
      next: () => {
        this.toastr.success('Abastecimento marcado como consistente');
        this.detailTarget.set(null);
        this.load();
      },
      error: err => this.toastr.error(err.error?.message ?? 'Erro ao marcar consistente'),
    });
  }

  executeDelete() {
    if (!this.isAdmin()) {
      this.toastr.error('Somente administradores podem excluir abastecimentos');
      return;
    }

    const target = this.deleteTarget();
    if (!target) return;
    this.deleting.set(true);
    this.api.deleteAbastecimento(target.id_abastecimento).subscribe({
      next: () => {
        this.toastr.success('Abastecimento excluído');
        this.deleteTarget.set(null);
        this.detailTarget.set(null);
        this.deleting.set(false);
        this.load();
      },
      error: err => {
        this.toastr.error(err.error?.message ?? 'Erro ao excluir');
        this.deleting.set(false);
      }
    });
  }

  isAdmin(): boolean {
    return this.auth.isAdmin();
  }

  canCreate(): boolean {
    return this.auth.canCreateOperationalRecords();
  }

  canResolveInconsistency(): boolean {
    return this.auth.isAdmin() || this.auth.canCreateOperationalRecords();
  }
}
