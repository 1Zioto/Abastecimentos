import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';
import { EncerranteBomba } from '../../shared/models';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-encerrantes-bomba',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="page">
      <header class="page-header">
        <div>
          <h1>Encerrantes da bomba</h1>
          <p>Registros semanais informados pelos operadores em {{ localSelecionado() }}</p>
        </div>
        <div class="header-actions">
          <button type="button" class="secondary-btn" (click)="load()" [disabled]="loading()">
            {{ loading() ? 'Atualizando...' : 'Atualizar' }}
          </button>
          <button type="button" class="primary-btn" (click)="openForm()">
            + Novo encerrante
          </button>
        </div>
      </header>

      <section class="filters">
        <label>
          Filial
          <select [ngModel]="localSelecionado()" (ngModelChange)="onLocalChange($event)">
            @for (filial of filiaisDisponiveis; track filial) {
              <option [value]="filial">{{ filial }}</option>
            }
          </select>
        </label>
        <label>
          Data início
          <input type="date" [(ngModel)]="dataInicio" />
        </label>
        <label>
          Data fim
          <input type="date" [(ngModel)]="dataFim" />
        </label>
        <button type="button" class="filter-btn" (click)="load()">Aplicar filtros</button>
        <button type="button" class="clear-btn" (click)="clearFilters()">Limpar</button>
      </section>

      <section class="summary-grid">
        <article class="summary-card">
          <span>Registros</span>
          <strong>{{ totalRegistros() }}</strong>
        </article>
        <article class="summary-card">
          <span>Combustível no tanque</span>
          <strong>{{ totalTanque() | number:'1.2-2' }} L</strong>
        </article>
        <article class="summary-card">
          <span>Litros na bomba</span>
          <strong>{{ totalBomba() | number:'1.2-2' }} L</strong>
        </article>
      </section>

      @if (loading()) {
        <div class="state">Carregando encerrantes...</div>
      } @else if (error()) {
        <div class="state error">{{ error() }}</div>
      } @else {
        <section class="table-card">
          @if (items().length === 0) {
            <div class="empty">Nenhum encerrante encontrado para os filtros atuais.</div>
          } @else {
            <div class="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Data</th>
                    <th>Filial</th>
                    <th>Combustível no tanque</th>
                    <th>Litros na bomba</th>
                    <th>Operador</th>
                    <th>Registrado em</th>
                    <th>Foto</th>
                  </tr>
                </thead>
                <tbody>
                  @for (item of items(); track item.id_encerrante) {
                    <tr>
                      <td>{{ item.data | date:'dd/MM/yyyy' }}</td>
                      <td><span class="branch">{{ item.local || '-' }}</span></td>
                      <td class="num">{{ item.quantidade_tanque | number:'1.2-2' }} L</td>
                      <td class="num">{{ item.litros_bomba | number:'1.2-2' }} L</td>
                      <td>{{ item.usuario_nome || '-' }}</td>
                      <td>{{ item.created_at | date:'dd/MM/yyyy HH:mm' }}</td>
                      <td>
                        @if (item.foto) {
                          <button type="button" class="photo-btn" (click)="openPhoto(item.foto)">
                            Ver foto
                          </button>
                        } @else {
                          <span class="muted">Sem foto</span>
                        }
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          }
        </section>
      }

      @if (previewUrl()) {
        <div class="modal-overlay" (click)="closePhoto()">
          <div class="image-modal" (click)="$event.stopPropagation()">
            <button type="button" class="close" (click)="closePhoto()">×</button>
            <img [src]="previewUrl()" alt="Foto do encerrante da bomba" />
            <a [href]="previewUrl()" target="_blank" rel="noopener">Abrir em nova aba</a>
          </div>
        </div>
      }

      @if (showForm()) {
        <div class="modal-overlay" (click)="closeForm()">
          <div class="form-modal" (click)="$event.stopPropagation()">
            <div class="modal-head">
              <div>
                <h2>Novo encerrante</h2>
                <p>Registro manual do encerrante da bomba</p>
              </div>
              <button type="button" class="close small" (click)="closeForm()">×</button>
            </div>

            <div class="form-grid">
              <label>
                Filial
                <select [(ngModel)]="form.local">
                  @for (filial of filiaisDisponiveis; track filial) {
                    <option [value]="filial">{{ filial }}</option>
                  }
                </select>
              </label>
              <label>
                Data
                <input type="date" [(ngModel)]="form.data" />
              </label>
              <label>
                Combustível no tanque (L)
                <input type="text" inputmode="decimal" [(ngModel)]="form.quantidade_tanque" />
              </label>
              <label>
                Litros registrados na bomba
                <input type="text" inputmode="decimal" [(ngModel)]="form.litros_bomba" />
              </label>
              <label class="wide">
                Foto
                <input type="file" accept="image/*" (change)="onPhotoSelected($event)" />
              </label>
            </div>

            @if (form.foto) {
              <button type="button" class="photo-preview" (click)="openPhoto(form.foto)">
                Foto anexada. Clique para visualizar.
              </button>
            }

            @if (formError()) {
              <div class="form-error">{{ formError() }}</div>
            }

            <div class="modal-actions">
              <button type="button" class="clear-btn" (click)="closeForm()" [disabled]="saving()">Cancelar</button>
              <button type="button" class="primary-btn" (click)="saveForm()" [disabled]="saving() || uploading()">
                {{ uploading() ? 'Enviando foto...' : saving() ? 'Salvando...' : 'Salvar encerrante' }}
              </button>
            </div>
          </div>
        </div>
      }
    </div>
  `,
  styles: [`
    .page {
      min-height: 100%;
      padding: 28px;
      background: #F3F4F6;
      color: #111827;
      font-family: 'Inter', sans-serif;
    }

    .page-header {
      display: flex;
      justify-content: space-between;
      gap: 16px;
      align-items: flex-start;
      margin-bottom: 18px;
    }

    .header-actions {
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
      justify-content: flex-end;
    }

    h1 {
      margin: 0;
      font-size: 28px;
      font-weight: 800;
    }

    p {
      margin: 6px 0 0;
      color: #64748B;
      font-size: 14px;
    }

    .primary-btn,
    .secondary-btn,
    .filter-btn,
    .clear-btn,
    .photo-btn {
      height: 40px;
      border-radius: 8px;
      border: 1px solid #CBD5E1;
      padding: 0 14px;
      font-weight: 800;
      cursor: pointer;
      background: #FFFFFF;
      color: #111827;
    }

    .primary-btn,
    .filter-btn {
      background: #0284C7;
      border-color: #0284C7;
      color: #FFFFFF;
    }

    .secondary-btn {
      background: #FFFFFF;
    }

    .primary-btn:disabled {
      opacity: 0.6;
      cursor: progress;
    }

    .filters {
      display: flex;
      align-items: flex-end;
      flex-wrap: wrap;
      gap: 12px;
      background: #FFFFFF;
      border: 1px solid #E5E7EB;
      border-radius: 12px;
      padding: 16px;
      margin-bottom: 16px;
    }

    label {
      display: grid;
      gap: 6px;
      color: #475569;
      font-size: 12px;
      font-weight: 800;
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }

    input,
    select {
      width: 170px;
      height: 40px;
      border: 1px solid #CBD5E1;
      border-radius: 8px;
      padding: 0 10px;
      color: #111827;
      font: inherit;
      background: #FFFFFF;
    }

    .summary-grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 12px;
      margin-bottom: 16px;
    }

    .summary-card {
      background: #FFFFFF;
      border: 1px solid #E5E7EB;
      border-radius: 12px;
      padding: 16px;
    }

    .summary-card span {
      display: block;
      color: #64748B;
      font-size: 13px;
      margin-bottom: 8px;
    }

    .summary-card strong {
      font-size: 24px;
      font-weight: 800;
    }

    .table-card,
    .state {
      background: #FFFFFF;
      border: 1px solid #E5E7EB;
      border-radius: 12px;
      overflow: hidden;
    }

    .state,
    .empty {
      padding: 28px;
      color: #64748B;
      text-align: center;
    }

    .state.error {
      color: #B91C1C;
      background: #FEF2F2;
      border-color: #FECACA;
    }

    .table-wrap {
      overflow-x: auto;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      min-width: 920px;
    }

    th {
      background: #F8FAFC;
      color: #475569;
      font-size: 12px;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      text-align: left;
      padding: 12px 14px;
      border-bottom: 1px solid #E5E7EB;
    }

    td {
      padding: 14px;
      border-bottom: 1px solid #EEF2F7;
      vertical-align: middle;
    }

    tr:last-child td {
      border-bottom: 0;
    }

    .num {
      font-weight: 800;
      white-space: nowrap;
    }

    .branch {
      display: inline-flex;
      border-radius: 999px;
      padding: 5px 10px;
      background: #E0F2FE;
      color: #0369A1;
      font-weight: 800;
      font-size: 12px;
    }

    .muted {
      color: #94A3B8;
      font-size: 13px;
    }

    .modal-overlay {
      position: fixed;
      inset: 0;
      z-index: 1000;
      background: rgba(15, 23, 42, 0.78);
      display: grid;
      place-items: center;
      padding: 22px;
    }

    .image-modal {
      position: relative;
      width: min(920px, 96vw);
      max-height: 92vh;
      display: grid;
      gap: 12px;
      justify-items: center;
    }

    .form-modal {
      width: min(620px, 96vw);
      max-height: 92vh;
      overflow: auto;
      background: #FFFFFF;
      border-radius: 14px;
      padding: 18px;
      box-shadow: 0 24px 70px rgba(15, 23, 42, 0.28);
    }

    .modal-head {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 14px;
      margin-bottom: 16px;
    }

    .modal-head h2 {
      margin: 0;
      font-size: 22px;
      font-weight: 800;
    }

    .form-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 12px;
    }

    .form-grid .wide {
      grid-column: 1 / -1;
    }

    .form-grid input {
      width: 100%;
    }

    .photo-preview {
      width: 100%;
      margin-top: 12px;
      min-height: 42px;
      border: 1px solid #BAE6FD;
      border-radius: 8px;
      background: #E0F2FE;
      color: #0369A1;
      font-weight: 800;
      cursor: pointer;
    }

    .form-error {
      margin-top: 12px;
      border-radius: 8px;
      background: #FEF2F2;
      border: 1px solid #FECACA;
      color: #B91C1C;
      padding: 10px 12px;
      font-weight: 700;
    }

    .modal-actions {
      display: flex;
      justify-content: flex-end;
      gap: 10px;
      margin-top: 18px;
    }

    .image-modal img {
      max-width: 100%;
      max-height: 82vh;
      object-fit: contain;
      border-radius: 10px;
      background: #FFFFFF;
    }

    .image-modal a {
      color: #FFFFFF;
      font-weight: 800;
    }

    .close {
      position: absolute;
      top: -14px;
      right: -14px;
      width: 38px;
      height: 38px;
      border: 0;
      border-radius: 999px;
      background: #FFFFFF;
      color: #111827;
      font-size: 26px;
      line-height: 1;
      cursor: pointer;
    }

    .close.small {
      position: static;
      width: 34px;
      height: 34px;
      font-size: 24px;
      border: 1px solid #E5E7EB;
      flex: 0 0 auto;
    }

    @media (max-width: 760px) {
      .page {
        padding: 16px;
      }

      .page-header,
      .filters {
        align-items: stretch;
        flex-direction: column;
      }

      .header-actions,
      .modal-actions {
        width: 100%;
        flex-direction: column;
      }

      input,
      .primary-btn,
      .secondary-btn,
      .filter-btn,
      .clear-btn {
        width: 100%;
      }

      .form-grid {
        grid-template-columns: 1fr;
      }

      .summary-grid {
        grid-template-columns: 1fr;
      }
    }
  `]
})
export class EncerrantesBombaComponent implements OnInit, OnDestroy {
  loading = signal(false);
  saving = signal(false);
  uploading = signal(false);
  error = signal('');
  formError = signal('');
  items = signal<EncerranteBomba[]>([]);
  previewUrl = signal('');
  showForm = signal(false);

  dataInicio = '';
  dataFim = '';
  localSelecionado = signal('Matriz');
  filiaisDisponiveis: string[] = ['Matriz', 'Viana'];
  form = this.emptyForm();
  private onGaragemChanged = () => {
    this.localSelecionado.set(this.localAtual());
    this.load();
  };

  constructor(private api: ApiService, private auth: AuthService) {}

  ngOnInit() {
    this.filiaisDisponiveis = this.auth.getFiliaisAcesso().length ? this.auth.getFiliaisAcesso() : ['Matriz', 'Viana'];
    this.localSelecionado.set(this.localAtual());
    window.addEventListener('garagem:changed', this.onGaragemChanged);
    this.load();
  }

  ngOnDestroy() {
    window.removeEventListener('garagem:changed', this.onGaragemChanged);
  }

  load() {
    this.loading.set(true);
    this.error.set('');
    this.api.getEncerrantesBomba({
      local: this.localSelecionado(),
      data_inicio: this.dataInicio,
      data_fim: this.dataFim,
      per_page: 200,
    }).subscribe({
      next: (resp) => {
        this.items.set(resp.data ?? []);
        this.loading.set(false);
      },
      error: (err) => {
        this.items.set([]);
        this.error.set(err?.error?.message || 'Erro ao carregar encerrantes.');
        this.loading.set(false);
      },
    });
  }

  clearFilters() {
    this.dataInicio = '';
    this.dataFim = '';
    this.load();
  }

  openForm() {
    this.form = this.emptyForm();
    this.formError.set('');
    this.showForm.set(true);
  }

  closeForm() {
    if (this.saving() || this.uploading()) return;
    this.showForm.set(false);
    this.formError.set('');
  }

  onPhotoSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    this.uploading.set(true);
    this.formError.set('');
    this.api.uploadToDrive(file).subscribe({
      next: (resp) => {
        const uploaded = resp?.file ?? {};
        const url = uploaded.downloadUrl || uploaded.webViewLink || uploaded.webContentLink;
        if (!url) {
          this.formError.set('Upload concluído, mas a URL da foto não retornou.');
        } else {
          this.form.foto = String(url);
        }
        this.uploading.set(false);
      },
      error: (err) => {
        this.formError.set(err?.error?.message || 'Erro ao enviar a foto.');
        this.uploading.set(false);
      },
    });
  }

  saveForm() {
    const payload = {
      data: this.form.data,
      local: this.form.local || this.localSelecionado(),
      quantidade_tanque: this.parseLitrosEncerrante(this.form.quantidade_tanque),
      litros_bomba: this.parseLitrosEncerrante(this.form.litros_bomba),
      foto: this.form.foto,
    };
    if (!payload.data || !Number.isFinite(payload.quantidade_tanque) || !Number.isFinite(payload.litros_bomba) || !payload.foto) {
      this.formError.set('Preencha data, tanque, litros da bomba e foto.');
      return;
    }
    this.saving.set(true);
    this.formError.set('');
    this.api.createEncerranteBomba(payload).subscribe({
      next: () => {
        this.saving.set(false);
        this.showForm.set(false);
        this.load();
      },
      error: (err) => {
        this.formError.set(err?.error?.message || 'Erro ao salvar encerrante.');
        this.saving.set(false);
      },
    });
  }

  totalRegistros(): number {
    return this.items().length;
  }

  totalTanque(): number {
    return this.items().reduce((sum, item) => sum + Number(item.quantidade_tanque ?? 0), 0);
  }

  totalBomba(): number {
    return this.items().reduce((sum, item) => sum + Number(item.litros_bomba ?? 0), 0);
  }

  openPhoto(url: string) {
    this.previewUrl.set(url);
  }

  closePhoto() {
    this.previewUrl.set('');
  }

  private emptyForm() {
    return {
      data: new Date().toISOString().slice(0, 10),
      local: this.localSelecionado(),
      quantidade_tanque: '',
      litros_bomba: '',
      foto: '',
    };
  }

  onLocalChange(local: string) {
    this.localSelecionado.set(local);
    if (!this.filiaisDisponiveis.includes(this.localSelecionado())) {
      this.localSelecionado.set(this.localAtual());
    }
    this.load();
  }

  private localAtual(): string {
    return this.auth.getGaragem() || this.auth.getFiliaisAcesso()[0] || 'Matriz';
  }

  private parseLitrosEncerrante(value: unknown): number {
    const raw = String(value ?? '').trim().replace(/[^0-9,.]/g, '');
    if (!raw) return NaN;
    const lastComma = raw.lastIndexOf(',');
    const lastDot = raw.lastIndexOf('.');
    const lastSeparator = Math.max(lastComma, lastDot);

    if (lastSeparator >= 0) {
      const before = raw.slice(0, lastSeparator);
      const after = raw.slice(lastSeparator + 1);
      const otherSeparators = /[,.]/.test(before);

      if (after.length === 3) {
        if (otherSeparators) {
          const integerPart = before.replace(/[,.]/g, '');
          return Number(`${integerPart}.${after}`);
        }
        return Number(`${before}${after}`);
      }

      return Number(`${before.replace(/[,.]/g, '')}.${after}`);
    }

    return Number(raw);
  }
}
