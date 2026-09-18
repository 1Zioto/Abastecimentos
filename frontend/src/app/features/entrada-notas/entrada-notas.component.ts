// src/app/features/entrada-notas/entrada-notas.component.ts
import { Component, OnDestroy, OnInit, inject, signal, computed } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { fromEvent } from 'rxjs';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';
import { ToastrService } from 'ngx-toastr';
import { EntradaNota } from '../../shared/models';
import { EntradaNotasFiltersComponent, EntradaNotasFilters } from './components/entrada-notas-filters/entrada-notas-filters.component';
import { EntradaNotasSummaryComponent } from './components/entrada-notas-summary/entrada-notas-summary.component';

import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-entrada-notas',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, EntradaNotasFiltersComponent, EntradaNotasSummaryComponent],
  templateUrl: './entrada-notas.component.html',
  styleUrl: './entrada-notas.component.css'
})
export class EntradaNotasComponent implements OnInit, OnDestroy {
  private api = inject(ApiService);
  private toastr = inject(ToastrService);
  private fb = inject(FormBuilder);
  private auth = inject(AuthService);

  notas = signal<EntradaNota[]>([]);

  // ── Paginação ───────────────────────────────────────────────
  /** Valor enviado quando o usuário escolhe "Todas". */
  private readonly TODAS = 1000;
  opcoesPorPagina = [25, 50, 100, 200, 0];
  perPage = signal(50);
  page = signal(1);
  total = signal(0);
  lastPage = signal(1);
  carregando = signal(false);

  showForm = signal(false);
  editItem = signal<EntradaNota | null>(null);
  deleteTarget = signal<EntradaNota | null>(null);
  saving = signal(false);
  uploadingFotoNota = signal(false);
  previewImageUrl = signal('');
  private readonly defaultTipoCombustivel = 'OLEO DIESEL S10';
  private readonly custoTransportePorLitro = 0.04;
  private fretePorTipoCombustivel: Record<string, number> = {};
  private readonly onGaragemChanged = () => {
    this.loadTiposCombustivel();
    this.loadFornecedores();
    this.load();
  };
  tiposCombustivel = signal<string[]>([this.defaultTipoCombustivel]);
  fornecedoresDisponiveis = signal<string[]>([]);
  confirmandoFornecedor = signal<string | null>(null);

  filtroTipo = '';
  filtroNumeroNota = '';
  filtroDataInicio = '';
  filtroDataFim = '';
  filtroFornecedor = '';

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
    fornecedor:         [''],
  });


  onFilterChange(filters: EntradaNotasFilters) {
    this.filtroTipo = filters.tipo;
    this.filtroNumeroNota = filters.numero_nota_fiscal;
    this.filtroDataInicio = filters.data_inicio;
    this.filtroDataFim = filters.data_fim;
    this.filtroFornecedor = filters.fornecedor;
    this.page.set(1); // filtro novo, volta para a primeira página
    this.load();
  }

  ngOnInit() {
    this.loadTiposCombustivel();
    this.loadFornecedores();
    this.load();
    fromEvent(window, 'garagem:changed').pipe(takeUntilDestroyed()).subscribe(this.onGaragemChanged);
  }

  ngOnDestroy() {
    // window.removeEventListener('garagem:changed', this.onGaragemChanged); // Agora gerenciado pelo takeUntilDestroyed
  }
  isAdmin() { return this.auth.isAdmin(); }
  canCreate() { return this.auth.canCreateOperationalRecords(); }
  // O formulário aparece sempre que showForm estiver ativo. A restrição de
  // edição a admin já é garantida pelo botão (lápis só aparece para admin) e
  // pelo onSubmit (bloqueia salvar para não-admin). O gate duplo anterior em
  // isAdmin() podia impedir o form de abrir ao editar quando o estado de admin
  // ainda não estava resolvido, fazendo o lápis "não funcionar".
  canShowForm() { return this.showForm(); }

  loadTiposCombustivel() {
    this.api.getValoresCombustivel({
      per_page: 50,
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
        this.fretePorTipoCombustivel = {};
        for (const v of r.data ?? []) {
          const t = String(v?.tipo_combustivel ?? '').trim();
          if (t && !(t in this.fretePorTipoCombustivel) && v?.valor_frete !== undefined && v?.valor_frete !== null) {
            this.fretePorTipoCombustivel[t] = Number(v.valor_frete);
          }
        }
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

  loadFornecedores() {
    this.api.getFornecedoresEntradaNotas().subscribe({
      next: (r) => this.fornecedoresDisponiveis.set((r?.data ?? []).filter(Boolean)),
      error: () => this.fornecedoresDisponiveis.set([]),
    });
  }

  load() {
    this.carregando.set(true);
    // per_page = 0 significa "Todas": pede um lote grande de uma vez.
    const porPagina = this.perPage() === 0 ? this.TODAS : this.perPage();

    this.api.getEntradaNotas({
      tipo: this.filtroTipo,
      numero_nota_fiscal: this.filtroNumeroNota.trim(),
      data_inicio: this.filtroDataInicio,
      data_fim: this.filtroDataFim,
      fornecedor: this.filtroFornecedor.trim(),
      per_page: porPagina,
      page: this.page(),
    }).subscribe({
      next: (r: any) => {
        const notas = (r.data ?? [])
          .map((n: EntradaNota) => this.normalizeNota(n))
          .sort((a: EntradaNota, b: EntradaNota) => this.notaTimestamp(b) - this.notaTimestamp(a));
        this.notas.set(notas);
        this.total.set(r?.total ?? notas.length);
        this.lastPage.set(r?.last_page ?? 1);
        this.page.set(r?.current_page ?? this.page());
        this.carregando.set(false);
      },
      error: () => this.carregando.set(false),
    });
  }

  /** Troca a quantidade por página e volta para a primeira. */
  mudarPerPage(valor: any) {
    this.perPage.set(Number(valor) || 0);
    this.page.set(1);
    this.load();
  }

  irPara(p: number) {
    if (p < 1 || p > this.lastPage() || p === this.page()) return;
    this.page.set(p);
    this.load();
    // Volta ao topo da listagem ao trocar de página.
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  inicioIntervalo(): number {
    if (this.total() === 0) return 0;
    const porPagina = this.perPage() === 0 ? this.total() : this.perPage();
    return (this.page() - 1) * porPagina + 1;
  }

  fimIntervalo(): number {
    return Math.min(this.inicioIntervalo() + this.notas().length - 1, this.total());
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
    const tipo = String(n.tipo ?? '').trim();
    const freteTabela = tipo in this.fretePorTipoCombustivel ? this.fretePorTipoCombustivel[tipo] : undefined;
    const custoLitro = Number(n.custo_transporte_litro ?? freteTabela ?? this.custoTransportePorLitro);
    return Math.round((Number(n.quantidade ?? 0) * custoLitro) * 100) / 100;
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

  fornecedorDivergente(n: EntradaNota): boolean {
    return String(n.fornecedor_ia_status ?? '').trim().toLowerCase() === 'divergente' && !n.fornecedor_confirmado;
  }

  fornecedorIaLabel(n: EntradaNota): string {
    if (n.fornecedor_confirmado) return 'Fornecedor verificado';
    const status = String(n.fornecedor_ia_status ?? '').trim().toLowerCase();
    if (status === 'coerente') return 'Fornecedor coerente';
    if (status === 'divergente') return 'Fornecedor divergente';
    if (status === 'pendente') return 'Verificação pendente';
    return '';
  }

  confirmarFornecedor(n: EntradaNota) {
    this.confirmandoFornecedor.set(n.id_financeiro);
    this.api.confirmarFornecedorEntradaNota(n.id_financeiro).subscribe({
      next: (atualizado) => {
        this.notas.update(notas => notas.map(item => item.id_financeiro === n.id_financeiro ? this.normalizeNota({ ...item, ...atualizado }) : item));
        this.toastr.success('Fornecedor marcado como verificado');
        this.confirmandoFornecedor.set(null);
      },
      error: (err) => {
        this.toastr.error(this.apiErrorMessage(err, 'Erro ao confirmar fornecedor'));
        this.confirmandoFornecedor.set(null);
      }
    });
  }

  baixarNota(n: EntradaNota) {
    if (!window.confirm(`Deseja marcar a nota fiscal ${n.numero_nota_fiscal || n.id_financeiro} como paga?`)) {
      return;
    }
    this.api.baixarEntradaNota(n.id_financeiro).subscribe({
      next: (atualizado) => {
        this.notas.update(notas => notas.map(item => item.id_financeiro === n.id_financeiro ? this.normalizeNota({ ...item, ...atualizado }) : item));
        this.toastr.success('Nota de entrada marcada como paga');
      },
      error: (err) => {
        this.toastr.error(this.apiErrorMessage(err, 'Erro ao marcar nota como paga'));
      }
    });
  }

  totalTransporte(): number {
    return this.notas().reduce((a, n) => a + this.custoTransporteTotal(n), 0);
  }

  totalCompraFinal(): number {
    return this.notas().reduce((a, n) => a + this.valorCompraFinal(n), 0);
  }

  fornecedoresResumo = computed(() => {
    const resumo = new Map<string, { nome: string; notas: number; litros: number; valor: number }>();
    for (const n of this.notas()) {
      if (n.paga) continue;
      const nome = n.fornecedor || 'Sem fornecedor';
      const atual = resumo.get(nome) || { nome, notas: 0, litros: 0, valor: 0 };
      atual.notas++;
      atual.litros += (n.quantidade ?? 0);
      atual.valor += (n.valor ?? 0);
      resumo.set(nome, atual);
    }
    return Array.from(resumo.values()).sort((a, b) => b.valor - a.valor);
  });

  newItem() {
    try {
      this.editItem.set(null);
      this.form.reset({
        data: new Date().toISOString().slice(0, 10),
        hora: this.currentTimeInput(),
        tipo: this.tiposCombustivel()[0] ?? this.defaultTipoCombustivel,
        responsavel: this.auth.currentUser()?.nome ?? ''
      });
      this.showForm.set(true);
    } catch (err: any) {
      console.error('Erro ao abrir nova nota', err);
      this.toastr.error('Erro ao abrir formulário: ' + (err?.message || err));
    }
  }

  edit(n: EntradaNota) {
    try {
      this.editItem.set(n);
      this.form.patchValue({
        ...n,
        data: this.rawDatePart(n.data || n.data_hora) ?? new Date().toISOString().slice(0, 10),
        hora: this.notaHoraInput(n),
        quantidade: this.toNumber(n.quantidade) ?? null,
        valor_litro: this.toNumber(n.valor_litro) ?? null,
        valor: this.toNumber(n.valor) ?? null,
        responsavel: this.auth.currentUser()?.nome ?? n.responsavel ?? '',
      } as any);
      this.showForm.set(true);
    } catch (err: any) {
      console.error('Erro ao abrir edição de nota', err);
      this.toastr.error('Erro ao abrir edição: ' + (err?.message || err));
    }
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
    if (this.uploadingFotoNota()) {
      this.toastr.warning('Aguarde o envio da imagem antes de salvar.');
      return;
    }
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.toastr.warning('Preencha os campos obrigatórios antes de salvar.');
      return;
    }
    // Validação: anexo de imagem é obrigatório
    const fotoNota = (this.form.getRawValue().foto_nota ?? '').trim();
    if (!fotoNota) {
      this.toastr.warning('É obrigatório anexar uma imagem/foto da nota fiscal.');
      return;
    }
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
    this.api.uploadToDrive(file, 'entrada-notas').subscribe({
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
    const s = String(value ?? '');
    // ISO (AAAA-MM-DD) em qualquer posição
    let m = s.match(/(\d{4})-(\d{2})-(\d{2})/);
    if (m) return `${m[1]}-${m[2]}-${m[3]}`;
    // Formato BR (DD/MM/AAAA)
    m = s.match(/(\d{2})\/(\d{2})\/(\d{4})/);
    if (m) return `${m[3]}-${m[2]}-${m[1]}`;
    return null;
  }

  private rawTimePart(value?: string | null): string | null {
    const match = String(value ?? '').match(/[T\s](\d{2}:\d{2})/);
    return match?.[1] ?? null;
  }

  resolveImageUrl(url?: string | null): string | null {
    return this.api.resolveImageUrl(url);
  }

  displayImageUrl(url?: string | null): string {
    const imageUrl = this.resolveImageUrl(url);
    if (!imageUrl) return '';
    // Usar sempre o proxy do backend para evitar que o Google Drive
    // peça autenticação da conta Google do usuário.
    // O resolveImageUrl já converte URLs do Drive para /api/drive-image?id=...
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
