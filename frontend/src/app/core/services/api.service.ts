// src/app/core/services/api.service.ts
import { Injectable } from '@angular/core';
import { HttpClient, HttpParams, HttpResponse } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthService } from './auth.service';
import {
  Abastecimento, BaixaAbastecimento, EntradaNota,
  ValorCombustivel, Proprietario, Veiculo, Motorista,
  Usuario, DashboardData, PaginatedResponse, EncerranteBomba, DespesaAvulsa,
  BalancetePrivadoData, TanqueHistoricoData, AbastecimentoAuditoriaData,
  GraficosGerenciaisData
} from '../../shared/models';

@Injectable({ providedIn: 'root' })
export class ApiService {
  private base = environment.apiUrl;

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

  // Proprietários
  getProprietarios(filters: any = {}): Observable<PaginatedResponse<Proprietario>> {
    return this.http.get<PaginatedResponse<Proprietario>>(this.url('proprietarios'), { params: this.toParams(this.withGaragem(filters)) });
  }
  getProprietariosAll(): Observable<PaginatedResponse<Proprietario>> {
    return this.getProprietarios({ per_page: 500 });
  }
  createProprietario(data: Partial<Proprietario>): Observable<Proprietario> {
    return this.http.post<Proprietario>(this.url('proprietarios'), { ...data, local: data.local || this.auth.getGaragem() });
  }
  updateProprietario(id: string, data: Partial<Proprietario>): Observable<Proprietario> {
    return this.http.put<Proprietario>(this.url(`proprietarios/${id}`), data);
  }
  bloquearProprietario(id: string, observacao: string): Observable<Proprietario> {
    return this.http.post<Proprietario>(this.url(`proprietarios/${id}/bloquear`), { observacao });
  }
  desbloquearProprietario(id: string): Observable<Proprietario> {
    return this.http.post<Proprietario>(this.url(`proprietarios/${id}/desbloquear`), {});
  }
  deleteProprietario(id: string): Observable<any> {
    return this.http.delete(this.url(`proprietarios/${id}`));
  }

  // Veículos
  getVeiculos(filters: any = {}): Observable<PaginatedResponse<Veiculo>> {
    return this.http.get<PaginatedResponse<Veiculo>>(this.url('veiculos'), { params: this.toParams(this.withGaragem(filters)) });
  }
  getVeiculosByProprietario(id: string): Observable<Veiculo[]> {
    return this.http.get<Veiculo[]>(this.url(`veiculos/proprietario/${id}`));
  }
  createVeiculo(data: Partial<Veiculo>): Observable<Veiculo> {
    return this.http.post<Veiculo>(this.url('veiculos'), { ...data, local: data.local || this.auth.getGaragem() });
  }
  updateVeiculo(id: string, data: Partial<Veiculo>): Observable<Veiculo> {
    return this.http.put<Veiculo>(this.url(`veiculos/${id}`), data);
  }
  transferirVeiculo(id: string, data: { id_proprietario: string; data_transferencia?: string; observacao?: string }): Observable<{ message: string; veiculo: Veiculo }> {
    return this.http.post<{ message: string; veiculo: Veiculo }>(this.url(`veiculos/${id}/transferir`), data);
  }
  deleteVeiculo(id: string): Observable<any> {
    return this.http.delete(this.url(`veiculos/${id}`));
  }

  // Motoristas
  getMotoristas(filters: any = {}): Observable<PaginatedResponse<Motorista>> {
    return this.http.get<PaginatedResponse<Motorista>>(this.url('motoristas'), { params: this.toParams(this.withGaragem(filters)) });
  }
  getMotoristassByProprietario(id: string): Observable<Motorista[]> {
    return this.http.get<Motorista[]>(this.url(`motoristas/proprietario/${id}`));
  }
  createMotorista(data: Partial<Motorista>): Observable<Motorista> {
    return this.http.post<Motorista>(this.url('motoristas'), { ...data, local: data.local || this.auth.getGaragem() });
  }
  updateMotorista(id: string, data: Partial<Motorista>): Observable<Motorista> {
    return this.http.put<Motorista>(this.url(`motoristas/${id}`), data);
  }
  deleteMotorista(id: string): Observable<any> {
    return this.http.delete(this.url(`motoristas/${id}`));
  }

  // Abastecimentos
  getAbastecimentos(filters: any = {}): Observable<PaginatedResponse<Abastecimento>> {
    return this.http.get<PaginatedResponse<Abastecimento>>(this.url('abastecimentos'), { params: this.toParams(this.withGaragem(filters)) });
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
  createBaixa(data: any): Observable<BaixaAbastecimento> {
    return this.http.post<BaixaAbastecimento>(this.url('baixas'), data);
  }
  createBaixaLote(data: any): Observable<any> {
    return this.http.post(this.url('baixas/lote'), data);
  }
  deleteBaixa(id: string): Observable<any> {
    return this.http.delete(this.url(`baixas/${id}`));
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

  // Valores Combustível
  getValoresCombustivel(filters: any = {}): Observable<PaginatedResponse<ValorCombustivel>> {
    return this.http.get<PaginatedResponse<ValorCombustivel>>(this.url('valores-combustivel'), { params: this.toParams(this.withGaragem(filters)) });
  }
  getValorAtual(tipo: string, local?: string): Observable<ValorCombustivel> {
    return this.http.get<ValorCombustivel>(this.url(`valores-combustivel/atual/${tipo}`), {
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
      params: this.toParams(filters),
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

  // Uploads
  uploadToDrive(file: File): Observable<any> {
    const fd = new FormData();
    fd.append('file', file);
    return this.http.post(this.url('uploads/drive'), fd);
  }

  // Nova Baixa por Comprovante
  uploadComprovantePagamento(file: File): Observable<any> {
    const fd = new FormData();
    fd.append('arquivo', file);
    return this.http.post(this.url('comprovantes-pagamento'), fd);
  }

  listarComprovantes(filters: any = {}): Observable<any> {
    return this.http.get(this.url('comprovantes-pagamento'), { params: this.toParams(filters) });
  }

  atualizarProprietarioComprovante(id: string, data: { proprietario_id: string; salvar_alias?: boolean }): Observable<any> {
    return this.http.patch(this.url(`comprovantes-pagamento/${id}`), data);
  }

  confirmarBaixaComprovante(id: string, data: any): Observable<any> {
    return this.http.post(this.url(`comprovantes-pagamento/${id}/confirmar`), data);
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
}
