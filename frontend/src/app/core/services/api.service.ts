// src/app/core/services/api.service.ts
import { Injectable } from '@angular/core';
import { HttpClient, HttpParams, HttpResponse } from '@angular/common/http';
import { EMPTY, Observable, from, firstValueFrom } from 'rxjs';
import { catchError, expand, map, reduce, shareReplay, switchMap, tap } from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import { AuthService } from './auth.service';
import {
  Abastecimento, BaixaAbastecimento, EntradaNota,
  ValorCombustivel, Proprietario, Veiculo, Motorista,
  Usuario, DashboardData, PaginatedResponse, EncerranteBomba, DespesaAvulsa,
  BalancetePrivadoData, TanqueHistoricoData, AbastecimentoAuditoriaData,
  GraficosGerenciaisData, ExtratoBancario, ConciliacaoBancariaResumo,
  ConciliacaoSugestaoGrupo, ConciliacaoBaixaItem, VariacaoEntradasSaidasData
} from '../../shared/models';

@Injectable({ providedIn: 'root' })
export class ApiService {
  private base = environment.apiUrl;

  // DECISÃO OPERACIONAL APROVADA — NÃO ALTERAR SEM AUTORIZAÇÃO EXPLÍCITA.
  // O limite de 50 e o TTL de 24 horas foram escolhidos conscientemente para
  // reduzir transferência/custos. O responsável aceita o risco de as listas de
  // referência ficarem temporariamente desatualizadas. Escritas abaixo devem
  // continuar invalidando o cache imediatamente. Consulte /AGENTS.md.
  private readonly referencePageSize = 50;
  private readonly referenceCacheTtlMs = 24 * 60 * 60 * 1000;

  // Cache em memória (por sessão) das listas de referência "buscar tudo"
  // (proprietários/veículos/motoristas): essas listas são pedidas do zero
  // em quase toda tela e raramente mudam — reaproveitar entre navegações
  // evita refazer a mesma requisição pesada repetidamente.
  private proprietariosAllCache$: Observable<PaginatedResponse<Proprietario>> | null = null;
  private veiculosAllCache$: Observable<PaginatedResponse<Veiculo>> | null = null;
  private motoristasAllCache$: Observable<PaginatedResponse<Motorista>> | null = null;
  private referenceCacheExpiresAt = new Map<string, number>();

  constructor(private http: HttpClient, private auth: AuthService) {}

  private url(path: string) { return `${this.base}/${path}`; }

  private toParams(filters: Record<string, any>): HttpParams {
    let p = new HttpParams();
    Object.entries(filters).forEach(([k, v]) => {
      if (v !== null && v !== undefined && v !== '') p = p.set(k, v);
    });
    return p;
  }

  private withGaragem(filters: Record<string, any> = {}): Record<string, any> {
    const { local, ...rest } = filters;
    const localFiltrado =
      local !== null && local !== undefined && local !== ''
        ? local
        : this.auth.getGaragem();
    return { ...rest, local: localFiltrado };
  }

  private cacheIsFresh(key: string): boolean {
    return (this.referenceCacheExpiresAt.get(key) ?? 0) > Date.now();
  }

  private markCacheFresh(key: string): void {
    this.referenceCacheExpiresAt.set(key, Date.now() + this.referenceCacheTtlMs);
  }

  private expireCache(key: string): void {
    this.referenceCacheExpiresAt.delete(key);
  }

  clearReferenceCaches(): void {
    this.proprietariosAllCache$ = null;
    this.veiculosAllCache$ = null;
    this.motoristasAllCache$ = null;
    this.referenceCacheExpiresAt.clear();
  }

  /**
   * Carrega a coleção completa sem violar a decisão de 50 registros por página.
   * As telas de seleção precisam de todos os itens; limitar a primeira página
   * faria proprietários, veículos e motoristas desaparecerem dos seletores.
   */
  private fetchAllReferencePages<T>(
    requestPage: (page: number) => Observable<PaginatedResponse<T>>,
  ): Observable<PaginatedResponse<T>> {
    return requestPage(1).pipe(
      expand(response => response.current_page < response.last_page
        ? requestPage(response.current_page + 1)
        : EMPTY),
      reduce(
        (state, response) => ({
          data: [...state.data, ...response.data],
          total: response.total,
        }),
        { data: [] as T[], total: 0 },
      ),
      map(state => ({
        data: state.data,
        current_page: 1,
        last_page: 1,
        per_page: this.referencePageSize,
        total: state.total,
        from: state.data.length ? 1 : 0,
        to: state.data.length,
      })),
    );
  }

  // Portal público do proprietário
  getPortalProprietario(token: string): Observable<any> {
    return this.http.get(this.url(`portal/${token}`));
  }
  gerarPortalToken(id: string, regenerar = false): Observable<any> {
    return this.http.post(this.url(`proprietarios/${id}/portal-token`), { regenerar });
  }

  // Dashboard
  getDashboard(filters: any = {}): Observable<DashboardData> {
    return this.http.get<DashboardData>(this.url('dashboard'), {
      params: this.toParams(this.withGaragem(filters)),
    });
  }

  getGraficosGerenciais(filters: any = {}): Observable<GraficosGerenciaisData> {
    return this.http.get<GraficosGerenciaisData>(this.url('graficos-gerenciais'), {
      params: this.toParams(this.withGaragem(filters)),
    });
  }

  getVariacaoEntradasSaidas(filters: any = {}): Observable<VariacaoEntradasSaidasData> {
    return this.http.get<VariacaoEntradasSaidasData>(this.url('variacao-entradas-saidas'), {
      params: this.toParams(this.withGaragem(filters)),
    });
  }

  getPingoOpcoes(local: string): Observable<{ proprietarios: string[]; motoristas: string[]; placas: string[] }> {
    return this.http.get<{ proprietarios: string[]; motoristas: string[]; placas: string[] }>(this.url('pingo/opcoes'), {
      params: this.toParams({ local }),
    });
  }

  perguntarAoPingo(data: Record<string, any>): Observable<{ resposta: string; resumo: any; contexto?: { filial: string; entidade_ativa?: { tipo: string; nome: string } | null; capacidades_usadas?: string[] } }> {
    return this.http.post<{ resposta: string; resumo: any; contexto?: { filial: string; entidade_ativa?: { tipo: string; nome: string } | null; capacidades_usadas?: string[] } }>(this.url('pingo/perguntar'), data);
  }

  // Proprietários
  getProprietarios(filters: any = {}): Observable<PaginatedResponse<Proprietario>> {
    return this.http.get<PaginatedResponse<Proprietario>>(this.url('proprietarios'), { params: this.toParams(this.withGaragem(filters)) });
  }
  getProprietariosAll(): Observable<PaginatedResponse<Proprietario>> {
    if (!this.proprietariosAllCache$ || !this.cacheIsFresh('proprietarios')) {
      this.proprietariosAllCache$ = this.fetchAllReferencePages(page =>
        this.getProprietarios({ page, per_page: this.referencePageSize })
      ).pipe(
        tap(() => this.markCacheFresh('proprietarios')),
        shareReplay({ bufferSize: 1, refCount: false }),
      );
    }
    return this.proprietariosAllCache$;
  }
  createProprietario(data: Partial<Proprietario>): Observable<Proprietario> {
    return this.http.post<Proprietario>(this.url('proprietarios'), { ...data, local: data.local || this.auth.getGaragem() })
      .pipe(tap(() => { this.proprietariosAllCache$ = null; this.expireCache('proprietarios'); }));
  }
  updateProprietario(id: string, data: Partial<Proprietario>): Observable<Proprietario> {
    return this.http.put<Proprietario>(this.url(`proprietarios/${id}`), data)
      .pipe(tap(() => { this.proprietariosAllCache$ = null; this.expireCache('proprietarios'); }));
  }
  bloquearProprietario(id: string, observacao: string): Observable<Proprietario> {
    return this.http.post<Proprietario>(this.url(`proprietarios/${id}/bloquear`), { observacao })
      .pipe(tap(() => { this.proprietariosAllCache$ = null; this.expireCache('proprietarios'); }));
  }
  desbloquearProprietario(id: string): Observable<Proprietario> {
    return this.http.post<Proprietario>(this.url(`proprietarios/${id}/desbloquear`), {})
      .pipe(tap(() => { this.proprietariosAllCache$ = null; this.expireCache('proprietarios'); }));
  }
  deleteProprietario(id: string): Observable<any> {
    return this.http.delete(this.url(`proprietarios/${id}`))
      .pipe(tap(() => { this.proprietariosAllCache$ = null; this.expireCache('proprietarios'); }));
  }

  // Veículos
  getVeiculos(filters: any = {}): Observable<PaginatedResponse<Veiculo>> {
    return this.http.get<PaginatedResponse<Veiculo>>(this.url('veiculos'), { params: this.toParams(this.withGaragem(filters)) });
  }
  getVeiculosAll(): Observable<PaginatedResponse<Veiculo>> {
    if (!this.veiculosAllCache$ || !this.cacheIsFresh('veiculos')) {
      this.veiculosAllCache$ = this.fetchAllReferencePages(page =>
        this.getVeiculos({ page, per_page: this.referencePageSize })
      ).pipe(
        tap(() => this.markCacheFresh('veiculos')),
        shareReplay({ bufferSize: 1, refCount: false }),
      );
    }
    return this.veiculosAllCache$;
  }
  getVeiculosByProprietario(id: string): Observable<Veiculo[]> {
    return this.http.get<Veiculo[]>(this.url(`veiculos/proprietario/${id}`));
  }
  createVeiculo(data: Partial<Veiculo>): Observable<Veiculo> {
    return this.http.post<Veiculo>(this.url('veiculos'), { ...data, local: data.local || this.auth.getGaragem() })
      .pipe(tap(() => this.veiculosAllCache$ = null));
  }
  updateVeiculo(id: string, data: Partial<Veiculo>): Observable<Veiculo> {
    return this.http.put<Veiculo>(this.url(`veiculos/${id}`), data)
      .pipe(tap(() => this.veiculosAllCache$ = null));
  }
  transferirVeiculo(id: string, data: { id_proprietario: string; data_transferencia?: string; observacao?: string }): Observable<{ message: string; veiculo: Veiculo }> {
    return this.http.post<{ message: string; veiculo: Veiculo }>(this.url(`veiculos/${id}/transferir`), data)
      .pipe(tap(() => this.veiculosAllCache$ = null));
  }
  deleteVeiculo(id: string): Observable<any> {
    return this.http.delete(this.url(`veiculos/${id}`))
      .pipe(tap(() => this.veiculosAllCache$ = null));
  }

  // Motoristas
  getMotoristas(filters: any = {}): Observable<PaginatedResponse<Motorista>> {
    return this.http.get<PaginatedResponse<Motorista>>(this.url('motoristas'), { params: this.toParams(this.withGaragem(filters)) });
  }
  getMotoristasAll(): Observable<PaginatedResponse<Motorista>> {
    if (!this.motoristasAllCache$ || !this.cacheIsFresh('motoristas')) {
      this.motoristasAllCache$ = this.fetchAllReferencePages(page =>
        this.getMotoristas({ page, per_page: this.referencePageSize })
      ).pipe(
        tap(() => this.markCacheFresh('motoristas')),
        shareReplay({ bufferSize: 1, refCount: false }),
      );
    }
    return this.motoristasAllCache$;
  }
  getMotoristassByProprietario(id: string): Observable<Motorista[]> {
    return this.http.get<Motorista[]>(this.url(`motoristas/proprietario/${id}`));
  }
  createMotorista(data: Partial<Motorista>): Observable<Motorista> {
    return this.http.post<Motorista>(this.url('motoristas'), { ...data, local: data.local || this.auth.getGaragem() })
      .pipe(tap(() => this.motoristasAllCache$ = null));
  }
  updateMotorista(id: string, data: Partial<Motorista>): Observable<Motorista> {
    return this.http.put<Motorista>(this.url(`motoristas/${id}`), data)
      .pipe(tap(() => this.motoristasAllCache$ = null));
  }
  deleteMotorista(id: string): Observable<any> {
    return this.http.delete(this.url(`motoristas/${id}`))
      .pipe(tap(() => this.motoristasAllCache$ = null));
  }

  // Abastecimentos
  getAbastecimentos(filters: any = {}): Observable<PaginatedResponse<Abastecimento>> {
    return this.http.get<PaginatedResponse<Abastecimento>>(this.url('abastecimentos'), { params: this.toParams(this.withGaragem(filters)) });
  }
  getAbastecimentosAll(filters: any = {}): Observable<Abastecimento[]> {
    const requestPage = (page: number) => this.getAbastecimentos({ ...filters, page, per_page: 50 });
    return requestPage(1).pipe(
      expand(response => response.current_page < response.last_page
        ? requestPage(response.current_page + 1)
        : EMPTY),
      reduce((items, response) => [...items, ...response.data], [] as Abastecimento[]),
    );
  }
  getAbastecimento(id: string): Observable<Abastecimento> {
    return this.http.get<Abastecimento>(this.url(`abastecimentos/${id}`));
  }
  createAbastecimento(data: Partial<Abastecimento>): Observable<Abastecimento> {
    return this.http.post<Abastecimento>(this.url('abastecimentos'), {
      ...data,
      local: data.local || this.auth.getGaragem(),
    });
  }
  updateAbastecimento(id: string, data: Partial<Abastecimento>): Observable<Abastecimento> {
    return this.http.put<Abastecimento>(this.url(`abastecimentos/${id}`), data);
  }
  analisarComprovante(data: any): Observable<any> {
    return this.http.post(this.url('abastecimentos/analisar-comprovante'), data);
  }
  verificarInconsistencia(id: string): Observable<Abastecimento> {
    return this.http.post<Abastecimento>(this.url(`abastecimentos/${id}/verificar-inconsistencia`), {});
  }
  // ── Integração Atua ────────────────────────────────────────────────
  getAtuaLancamentos(filters: any = {}): Observable<any> {
    return this.http.get(this.url('atua/lancamentos'), { params: this.toParams(filters) });
  }
  getAtuaOpcoes(): Observable<{ placas: string[]; motoristas: string[] }> {
    return this.http.get<{ placas: string[]; motoristas: string[] }>(this.url('atua/opcoes'));
  }
  reenviarAtua(idAbastecimento: string): Observable<any> {
    return this.http.post(this.url(`atua/reenviar/${idAbastecimento}`), {});
  }

  lancarSofit(id: string, data: { trip_id?: string | null; odometro?: number | null; motorista_sofit?: string | null; data_hora?: string | null } = {}): Observable<any> {
    return this.http.post(this.url(`abastecimentos/${id}/lancar-sofit`), data);
  }
  deleteAbastecimento(id: string): Observable<any> {
    return this.http.delete(this.url(`abastecimentos/${id}`));
  }
  getAbastecimentosPendenteBaixa(filters: any = {}): Observable<Abastecimento[]> {
    return this.http.get<Abastecimento[]>(this.url('abastecimentos/filter/baixa-pendente'), { params: this.toParams(this.withGaragem(filters)) });
  }
  getComprovantePdfUrl(id: string): string {
    return this.url(`abastecimentos/${id}/comprovante?pdf=1`);
  }
  getComprovantePdf(id: string): Observable<HttpResponse<Blob>> {
    return this.http.get(this.url(`abastecimentos/${id}/comprovante`), {
      params: this.toParams({ pdf: 1 }),
      observe: 'response',
      responseType: 'blob',
    });
  }

  // Baixas
  getBaixas(filters: any = {}): Observable<PaginatedResponse<BaixaAbastecimento>> {
    return this.http.get<PaginatedResponse<BaixaAbastecimento>>(this.url('baixas'), { params: this.toParams(this.withGaragem(filters)) });
  }
  getBaixasAll(filters: any = {}): Observable<BaixaAbastecimento[]> {
    // Páginas maiores = menos round-trips sequenciais ao backend (cada um
    // soma latência de rede + query). Não muda os dados carregados, só
    // reduz quantas requisições são feitas para buscar a tabela inteira.
    const pageSize = 50;
    const requestPage = (page: number) => this.getBaixas({
      ...filters,
      page,
      per_page: pageSize,
    });

    return requestPage(1).pipe(
      expand(response => response.current_page < response.last_page
        ? requestPage(response.current_page + 1)
        : EMPTY),
      reduce((items, response) => [...items, ...response.data], [] as BaixaAbastecimento[]),
    );
  }
  createBaixa(data: any): Observable<BaixaAbastecimento> {
    return this.http.post<BaixaAbastecimento>(this.url('baixas'), data);
  }
  createBaixaLote(data: any): Observable<any> {
    return this.http.post(this.url('baixas/lote'), data);
  }
  creditoProprietario(id: string): Observable<{ proprietario_id: string; saldo: number; movimentos: any[] }> {
    return this.http.get<{ proprietario_id: string; saldo: number; movimentos: any[] }>(this.url(`proprietarios/${id}/credito`));
  }
  deleteBaixa(id: string): Observable<any> {
    return this.http.delete(this.url(`baixas/${id}`));
  }
  updateBaixa(id: string, data: any): Observable<any> {
    return this.http.put(this.url(`baixas/${id}`), data);
  }
  removerComprovanteBaixa(id: string, url: string): Observable<any> {
    return this.http.post(this.url(`baixas/${id}/remover-comprovante`), { url });
  }

  // Entrada de Notas
  getEntradaNotas(filters: any = {}): Observable<PaginatedResponse<EntradaNota>> {
    return this.http.get<PaginatedResponse<EntradaNota>>(this.url('entrada-notas'), { params: this.toParams(this.withGaragem(filters)) });
  }
  createEntradaNota(data: Partial<EntradaNota>): Observable<EntradaNota> {
    return this.http.post<EntradaNota>(this.url('entrada-notas'), { ...data, local: data.local || this.auth.getGaragem() });
  }
  updateEntradaNota(id: string, data: Partial<EntradaNota>): Observable<EntradaNota> {
    return this.http.put<EntradaNota>(this.url(`entrada-notas/${id}`), data);
  }
  deleteEntradaNota(id: string): Observable<any> {
    return this.http.delete(this.url(`entrada-notas/${id}`));
  }
  getFornecedoresEntradaNotas(local?: string): Observable<{ data: string[] }> {
    return this.http.get<{ data: string[] }>(this.url('entrada-notas/fornecedores'), {
      params: this.toParams({ local: local || this.auth.getGaragem() })
    });
  }
  confirmarFornecedorEntradaNota(id: string): Observable<EntradaNota> {
    return this.http.post<{ ok: boolean; entrada_nota: EntradaNota }>(this.url(`entrada-notas/${id}/confirmar-fornecedor`), {})
      .pipe(map(res => res.entrada_nota));
  }

  baixarEntradaNota(id: string): Observable<EntradaNota> {
    return this.http.post<{ ok: boolean; entrada_nota: EntradaNota }>(this.url(`entrada-notas/${id}/baixar`), {})
      .pipe(map(res => res.entrada_nota));
  }

  // Valores Combustível
  getValoresCombustivel(filters: any = {}): Observable<PaginatedResponse<ValorCombustivel>> {
    return this.http.get<PaginatedResponse<ValorCombustivel>>(this.url('valores-combustivel'), { params: this.toParams(this.withGaragem(filters)) });
  }
  getValorAtual(tipo: string, local?: string): Observable<ValorCombustivel> {
    return this.http.get<ValorCombustivel>(this.url(`valores-combustivel/atual/${tipo}`), {
      params: this.toParams({ local: local || this.auth.getGaragem() })
    });
  }
  getPrecoCustoAutomatico(tipo: string, local?: string): Observable<{ tipo_combustivel: string; local: string; valor: number }> {
    return this.http.get<{ tipo_combustivel: string; local: string; valor: number }>(this.url(`abastecimentos/preco-custo-automatico/${tipo}`), {
      params: this.toParams({ local: local || this.auth.getGaragem() })
    });
  }
  createValorCombustivel(data: Partial<ValorCombustivel>): Observable<ValorCombustivel> {
    return this.http.post<ValorCombustivel>(this.url('valores-combustivel'), { ...data, local: data.local || this.auth.getGaragem() });
  }
  updateValorCombustivel(id: string, data: Partial<ValorCombustivel>): Observable<ValorCombustivel> {
    return this.http.put<ValorCombustivel>(this.url(`valores-combustivel/${id}`), data);
  }
  deleteValorCombustivel(id: string): Observable<any> {
    return this.http.delete(this.url(`valores-combustivel/${id}`));
  }

  // Configurações
  getEncerranteBombaConfig(): Observable<{ hora_obrigatoria: string }> {
    return this.http.get<{ hora_obrigatoria: string }>(this.url('configuracoes/encerrante-bomba'));
  }
  updateEncerranteBombaConfig(data: { hora_obrigatoria: string }): Observable<{ hora_obrigatoria: string }> {
    return this.http.put<{ hora_obrigatoria: string }>(this.url('configuracoes/encerrante-bomba'), data);
  }
  getAbastecimentoAnaliseConfig(): Observable<{ analysis_engine: 'ai' | 'ocr'; use_ai_analysis: boolean; ai_orientation: string; nota_fiscal_ai_prompt: string }> {
    return this.http.get<{ analysis_engine: 'ai' | 'ocr'; use_ai_analysis: boolean; ai_orientation: string; nota_fiscal_ai_prompt: string }>(
      this.url('configuracoes/abastecimento-analise')
    );
  }
  updateAbastecimentoAnaliseConfig(data: { analysis_engine: 'ai' | 'ocr'; ai_orientation?: string; nota_fiscal_ai_prompt?: string }): Observable<{ analysis_engine: 'ai' | 'ocr'; use_ai_analysis: boolean; ai_orientation: string; nota_fiscal_ai_prompt: string }> {
    return this.http.put<{ analysis_engine: 'ai' | 'ocr'; use_ai_analysis: boolean; ai_orientation: string; nota_fiscal_ai_prompt: string }>(
      this.url('configuracoes/abastecimento-analise'),
      data,
    );
  }
  getCentavosConfig(): Observable<{ configurar_centavos: boolean; data_inicio: string }> {
    return this.http.get<{ configurar_centavos: boolean; data_inicio: string }>(this.url('configuracoes/centavos'));
  }
  updateCentavosConfig(data: { configurar_centavos: boolean }): Observable<{ configurar_centavos: boolean; data_inicio: string }> {
    return this.http.put<{ configurar_centavos: boolean; data_inicio: string }>(this.url('configuracoes/centavos'), data);
  }
  getEncerrantesBomba(filters: any = {}): Observable<PaginatedResponse<EncerranteBomba>> {
    return this.http.get<PaginatedResponse<EncerranteBomba>>(this.url('encerrantes-bomba'), {
      params: this.toParams(this.withGaragem(filters)),
    });
  }
  createEncerranteBomba(data: Partial<EncerranteBomba>): Observable<EncerranteBomba> {
    return this.http.post<EncerranteBomba>(this.url('encerrantes-bomba'), {
      ...data,
      local: data.local || this.auth.getGaragem(),
    });
  }
  getAnalisePrivadaEncerranteBomba(filters: any = {}): Observable<any> {
    return this.http.get(this.url('encerrantes-bomba/analise-privada'), {
      params: this.toParams(this.withGaragem(filters)),
    });
  }

  getBalancetePrivado(filters: any = {}): Observable<BalancetePrivadoData> {
    return this.http.get<BalancetePrivadoData>(this.url('balancete-privado'), {
      params: this.toParams(this.withGaragem(filters)),
    });
  }

  getTanqueHistoricoPrivado(filters: any = {}): Observable<TanqueHistoricoData> {
    return this.http.get<TanqueHistoricoData>(this.url('tanques-privado/historico'), {
      params: this.toParams(filters),
    });
  }

  // Despesas avulsas
  getDespesasAvulsas(filters: any = {}): Observable<PaginatedResponse<DespesaAvulsa>> {
    return this.http.get<PaginatedResponse<DespesaAvulsa>>(this.url('despesas-avulsas'), {
      params: this.toParams(this.withGaragem(filters)),
    });
  }
  createDespesaAvulsa(data: Partial<DespesaAvulsa>): Observable<DespesaAvulsa> {
    return this.http.post<DespesaAvulsa>(this.url('despesas-avulsas'), { ...data, local: data.local || this.auth.getGaragem() });
  }
  updateDespesaAvulsa(id: string, data: Partial<DespesaAvulsa>): Observable<DespesaAvulsa> {
    return this.http.put<DespesaAvulsa>(this.url(`despesas-avulsas/${id}`), data);
  }
  deleteDespesaAvulsa(id: string): Observable<any> {
    return this.http.delete(this.url(`despesas-avulsas/${id}`));
  }

  // Usuários
  getUsuarios(filters: any = {}): Observable<PaginatedResponse<Usuario>> {
    return this.http.get<PaginatedResponse<Usuario>>(this.url('usuarios'), { params: this.toParams({ ...filters, _ts: Date.now() }) });
  }
  createUsuario(data: any): Observable<Usuario> {
    return this.http.post<Usuario>(this.url('usuarios'), data);
  }
  updateUsuario(id: string, data: any): Observable<Usuario> {
    return this.http.put<Usuario>(this.url(`usuarios/${id}`), data);
  }
  deleteUsuario(id: string): Observable<any> {
    return this.http.delete(this.url(`usuarios/${id}`));
  }

  // Auditoria
  getAuditoria(filters: any = {}): Observable<PaginatedResponse<any>> {
    return this.http.get<PaginatedResponse<any>>(this.url('auditoria'), {
      params: this.toParams(filters),
    });
  }

  getAuditoriaAbastecimentosSuspeitos(filters: any = {}): Observable<AbastecimentoAuditoriaData> {
    return this.http.get<AbastecimentoAuditoriaData>(this.url('auditoria/abastecimentos-suspeitos'), {
      params: this.toParams(this.withGaragem(filters)),
    });
  }

  marcarAbastecimentoAuditado(id: string): Observable<any> {
    return this.http.post(this.url(`auditoria/abastecimentos-suspeitos/${id}/auditar`), {});
  }

  compararConferenciaVipe(payload: any): Observable<any> {
    return this.http.post(this.url('conferencia-vipe/comparar'), payload);
  }

  listarImportacoesConferenciaVipe(): Observable<any> {
    return this.http.get(this.url('conferencia-vipe/importacoes'));
  }

  obterImportacaoConferenciaVipe(id: string, mes = ''): Observable<any> {
    return this.http.get(this.url(`conferencia-vipe/importacoes/${id}`), {
      params: this.toParams({ mes }),
    });
  }

  reprocessarImportacaoConferenciaVipe(id: string): Observable<any> {
    return this.http.post(this.url(`conferencia-vipe/importacoes/${id}/reprocessar`), {});
  }

  checarItemConferenciaVipe(id: string, checado: boolean, observacao = ''): Observable<any> {
    return this.http.patch(this.url(`conferencia-vipe/itens/${id}/checagem`), {
      checado,
      observacao,
    });
  }

  getAppErros(filters: any = {}): Observable<PaginatedResponse<any>> {
    return this.http.get<PaginatedResponse<any>>(this.url('app-erros'), {
      params: this.toParams(filters),
    });
  }
  clearAppErros(): Observable<any> {
    return this.http.delete(this.url('app-erros'));
  }

  // Relatórios
  getRelatorioProprietario(filters: any): Observable<any> {
    return this.http.get(this.url('relatorios/proprietario'), { params: this.toParams(this.withGaragem(filters)) });
  }
  getRelatorioProprietarioPdf(filters: any): Observable<HttpResponse<Blob>> {
    return this.http.get(this.url('relatorios/proprietario/pdf'), {
      params: this.toParams(this.withGaragem(filters)),
      observe: 'response',
      responseType: 'blob',
    });
  }
  getRelatorioProprietarioPdfUrl(filters: any): string {
    const p = new URLSearchParams(this.withGaragem(filters)).toString();
    return `${this.url('relatorios/proprietario/pdf')}?${p}`;
  }

  getRelatorioFaturamentoMensal(filters: any): Observable<any> {
    const f = { ...filters };
    if (f.local === 'todas') {
      f.local = '';
    }
    return this.http.get(this.url('relatorios/faturamento-mensal'), { params: this.toParams(f) });
  }

  getRelatorioFaturamentoDetalhado(filters: any): Observable<any> {
    const f = { ...filters };
    if (f.local === 'todas') {
      f.local = '';
    }
    return this.http.get(this.url('relatorios/faturamento-mensal/detalhado'), { params: this.toParams(f) });
  }

  async compressImage(file: File, maxSide: number = 1024, quality: number = 0.6): Promise<File> {
    if (!file.type.startsWith('image/') || file.type === 'image/gif') {
      return file;
    }
    return new Promise((resolve) => {
      const img = new Image();
      const objUrl = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(objUrl);
        let width = img.width;
        let height = img.height;
        const max = Math.max(width, height);
        if (max > maxSide) {
          const scale = maxSide / max;
          width = Math.round(width * scale);
          height = Math.round(height * scale);
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(file);
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob((blob) => {
          if (!blob) {
            resolve(file);
            return;
          }
          resolve(new File([blob], file.name, { type: 'image/jpeg', lastModified: Date.now() }));
        }, 'image/jpeg', quality);
      };
      img.onerror = () => {
        URL.revokeObjectURL(objUrl);
        resolve(file);
      };
      img.src = objUrl;
    });
  }

  // Uploads
  uploadToDrive(file: File, destino?: string): Observable<any> {
    const skipCompress = destino === 'entrada-notas';
    return from(skipCompress ? Promise.resolve(file) : this.compressImage(file)).pipe(
      switchMap(compressedFile => from(this.uploadDireto(compressedFile)).pipe(
        // O PUT direto no Google depende de o servidor de upload devolver os
        // cabeçalhos CORS para a nossa origem. App e bot não passam por essa
        // restrição, mas o navegador sim — se falhar, cai no upload via API,
        // que é mais caro em banda porém sempre funciona.
        catchError(err => {
          console.warn('[upload] direto para o Drive falhou, usando o proxy da API', err);
          const fd = new FormData();
          fd.append('file', compressedFile);
          if (destino) fd.append('destino', destino);
          return this.http.post(this.url('uploads/drive'), fd);
        })
      ))
    );
  }

  /** Envia os bytes direto para o Google Drive, sem passar pela nossa API. */
  private async uploadDireto(file: File): Promise<any> {
    const sessao: any = await firstValueFrom(this.http.post(this.url('uploads/drive/sessao'), {
      filename: file.name || 'comprovante.jpg',
      mimeType: file.type || 'image/jpeg',
      size: file.size,
    }));

    const uploadUrl = sessao?.uploadUrl;
    if (!uploadUrl) throw new Error('Servidor não devolveu a sessão de upload.');

    const resposta = await fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': file.type || 'image/jpeg' },
      body: file,
    });
    if (!resposta.ok) throw new Error(`Google Drive respondeu ${resposta.status}`);

    const enviado = await resposta.json();
    if (!enviado?.id) throw new Error('Google Drive não devolveu o id do arquivo.');

    return firstValueFrom(this.http.post(this.url('uploads/drive/finalizar'), { fileId: enviado.id }));
  }
  // Nova Baixa por Comprovante
  uploadComprovantePagamento(file: File): Observable<any> {
    return from(this.compressImage(file)).pipe(
      switchMap(compressedFile => from(this.uploadDireto(compressedFile))),
      switchMap(upload => {
        const arquivoUrl = upload?.file?.downloadUrl || upload?.url;
        if (!arquivoUrl) throw new Error('Upload concluído sem URL do comprovante.');
        return this.http.post(this.url('comprovantes-pagamento'), { arquivo_url: arquivoUrl });
      })
    );
  }

  uploadComprovantesPagamento(files: File[]): Observable<any> {
    const promises = files.map(f => this.compressImage(f));
    return from(Promise.all(promises)).pipe(
      switchMap(compressedFiles => from(Promise.all(
        compressedFiles.map(file => this.uploadDireto(file))
      ))),
      switchMap(uploads => {
        const arquivoUrls = uploads
          .map(upload => upload?.file?.downloadUrl || upload?.url)
          .filter((url): url is string => !!url);
        if (arquivoUrls.length !== uploads.length) {
          throw new Error('Um ou mais uploads terminaram sem URL.');
        }
        return this.http.post(this.url('comprovantes-pagamento/lote'), {
          arquivo_urls: arquivoUrls,
        });
      })
    );
  }

  listarComprovantes(filters: any = {}): Observable<any> {
    return this.http.get(this.url('comprovantes-pagamento'), { params: this.toParams(filters) });
  }

  atualizarProprietarioComprovante(id: string, data: { proprietario_id: string; salvar_alias?: boolean }): Observable<any> {
    return this.http.patch(this.url(`comprovantes-pagamento/${id}`), data);
  }

  verificarComprovantePagamento(id: string): Observable<any> {
    return this.http.post(this.url(`comprovantes-pagamento/${id}/verificar`), {});
  }

  desvincularComprovantePagamento(id: string): Observable<any> {
    return this.http.post(this.url(`comprovantes-pagamento/${id}/desvincular`), {});
  }

  isolarComprovantePagamento(id: string): Observable<any> {
    return this.http.post(this.url(`comprovantes-pagamento/${id}/isolar`), {});
  }

  atualizarFormaPagamentoComprovante(id: string, formaPagamento: string): Observable<any> {
    return this.http.patch(this.url(`comprovantes-pagamento/${id}/forma-pagamento`), { forma_pagamento: formaPagamento });
  }

  confirmarBaixaComprovanteGrupo(data: any): Observable<any> {
    return this.http.post(this.url('comprovantes-pagamento/confirmar-grupo'), data);
  }

  cancelarComprovante(id: string): Observable<any> {
    return this.http.delete(this.url(`comprovantes-pagamento/${id}`));
  }

  // Alias proprietários
  listarAliasProprietarios(filters: any = {}): Observable<any> {
    return this.http.get(this.url('alias-proprietarios'), { params: this.toParams(filters) });
  }

  salvarAliasProprietario(data: { nome_alias: string; proprietario_id: string }): Observable<any> {
    return this.http.post(this.url('alias-proprietarios'), data);
  }

  deletarAliasProprietario(id: string): Observable<any> {
    return this.http.delete(this.url(`alias-proprietarios/${id}`));
  }

  // Conciliação bancária
  listarExtratosBancarios(filters: any = {}): Observable<{ data: ExtratoBancario[]; resumo?: ConciliacaoBancariaResumo }> {
    return this.http.get<{ data: ExtratoBancario[]; resumo?: ConciliacaoBancariaResumo }>(this.url('conciliacao-bancaria/extratos'), { params: this.toParams(filters) });
  }
  importarExtratoBancario(payload: any): Observable<{ message: string; importados: number; duplicados: number }> {
    return this.http.post<{ message: string; importados: number; duplicados: number }>(this.url('conciliacao-bancaria/extratos/importar'), payload);
  }
  ignorarExtratoBancario(id: string): Observable<{ message: string; status: string }> {
    return this.http.post<{ message: string; status: string }>(this.url(`conciliacao-bancaria/extratos/${id}/ignorar`), {});
  }
  sugestoesExtratoBancario(id: string, dias = 10): Observable<{ data: ConciliacaoSugestaoGrupo[] }> {
    return this.http.get<{ data: ConciliacaoSugestaoGrupo[] }>(this.url(`conciliacao-bancaria/extratos/${id}/sugestoes`), { params: this.toParams({ dias }) });
  }
  detalhesExtratoBancario(id: string): Observable<{ extrato: ExtratoBancario; baixas: ConciliacaoBaixaItem[] }> {
    return this.http.get<{ extrato: ExtratoBancario; baixas: ConciliacaoBaixaItem[] }>(this.url(`conciliacao-bancaria/extratos/${id}/detalhes`));
  }
  conciliarExtratoBancario(id: string, ids_baixa: string[]): Observable<{ message: string; soma_baixas: number; diferenca: number; aviso: string | null }> {
    return this.http.post<{ message: string; soma_baixas: number; diferenca: number; aviso: string | null }>(this.url(`conciliacao-bancaria/extratos/${id}/conciliar`), { ids_baixa });
  }
  desconciliarExtratoBancario(id: string): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(this.url(`conciliacao-bancaria/extratos/${id}/desconciliar`), {});
  }
  excluirExtratoBancario(id: string): Observable<any> {
    return this.http.delete(this.url(`conciliacao-bancaria/extratos/${id}`));
  }
  baixasDisponiveisConciliacao(filters: any = {}): Observable<{ data: ConciliacaoBaixaItem[] }> {
    return this.http.get<{ data: ConciliacaoBaixaItem[] }>(this.url('conciliacao-bancaria/baixas-disponiveis'), { params: this.toParams(filters) });
  }

  // API Keys (admin)
  listarApiKeys(): Observable<any> {
    return this.http.get(this.url('api-keys'));
  }

  criarApiKey(nome: string): Observable<any> {
    return this.http.post(this.url('api-keys'), { nome });
  }

  revogarApiKey(id: string): Observable<any> {
    return this.http.delete(this.url(`api-keys/${id}`));
  }

  resolveImageUrl(url?: string | null): string | null {
    let normalized = String(url).trim();
    if (!normalized || normalized === 'null' || normalized === 'undefined') return null;

    if (normalized.includes('drive.google.com/')) {
      const match = normalized.match(/(?:id=|file\/d\/)([^&/?]+)/);
      if (match && match[1]) {
        return `${this.base}/drive-image?id=${match[1]}`;
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
    return `${this.base}/${normalized}`;
  }

  private driveFileId(url?: string | null): string | null {
    const normalized = String(url).trim();
    if (!normalized || normalized === 'null' || normalized === 'undefined') return null;
    if (!normalized.includes('drive.google.com/')) return null;
    const match = normalized.match(/(?:id=|file\/d\/)([^&/?]+)/);
    return match && match[1] ? match[1] : null;
  }

  // Miniaturas saem direto do CDN do Google, sem passar pelo nosso backend.
  // Os arquivos já sobem para o Drive com permissão `anyone/reader`, então o
  // proxy /drive-thumb não acrescentava restrição de acesso nenhuma: só
  // colocava cada byte de imagem para dentro e para fora da Vercel. Servir a
  // miniatura (~9 KB) no lugar do arquivo cheio (~150 KB) e tirá-la da nossa
  // rede zera o consumo de banda das listagens.
  // Só use isto em <img src>: as URLs do Google não mandam CORS, então não
  // servem para fetch()/canvas — para esses casos use resolveImageUrl.
  resolveImageThumbUrl(url?: string | null, size: number = 160): string | null {
    const id = this.driveFileId(url);
    if (id) {
      return `https://drive.google.com/thumbnail?id=${id}&sz=w${size}`;
    }
    return this.resolveImageUrl(url);
  }

  // Versão ampliada para o modal de preview — também direto do Google.
  resolveImageFullUrl(url?: string | null): string | null {
    return this.resolveImageThumbUrl(url, 1600);
  }

  // Notificações críticas (somente admin — monitora todas as filiais do admin)
  listarNotificacoesCriticas(filters: Record<string, any> = {}): Observable<any> {
    return this.http.get(this.url('notificacoes-criticas'), { params: this.toParams(filters) });
  }

  resumoNotificacoesCriticas(params: { after_id?: number; check_tanques?: number } = {}): Observable<any> {
    return this.http.get(this.url('notificacoes-criticas/resumo'), { params: this.toParams(params) });
  }

  marcarNotificacaoCriticaVista(id: number, dispositivo = 'Web Admin'): Observable<any> {
    return this.http.post(this.url(`notificacoes-criticas/${id}/marcar-vista`), { dispositivo }).pipe(
      tap(() => window.dispatchEvent(new CustomEvent('notificacoes-criticas:updated')))
    );
  }

  marcarNotificacoesCriticasVistasLote(payload: { ids?: number[]; todas?: boolean; dispositivo?: string }): Observable<any> {
    return this.http.post(this.url('notificacoes-criticas/marcar-vistas'), {
      dispositivo: 'Web Admin',
      ...payload,
    }).pipe(
      tap(() => window.dispatchEvent(new CustomEvent('notificacoes-criticas:updated')))
    );
  }
}
