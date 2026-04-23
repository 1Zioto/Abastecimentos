// src/app/core/services/api.service.ts
import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  Abastecimento, BaixaAbastecimento, EntradaNota,
  ValorCombustivel, Proprietario, Veiculo, Motorista,
  Usuario, DashboardData, PaginatedResponse
} from '../../shared/models';

@Injectable({ providedIn: 'root' })
export class ApiService {
  private base = environment.apiUrl;

  constructor(private http: HttpClient) {}

  private url(path: string) { return `${this.base}/${path}`; }

  private toParams(filters: Record<string, any>): HttpParams {
    let p = new HttpParams();
    Object.entries(filters).forEach(([k, v]) => {
      if (v !== null && v !== undefined && v !== '') p = p.set(k, v);
    });
    return p;
  }

  // Dashboard
  getDashboard(mes?: number, ano?: number): Observable<DashboardData> {
    return this.http.get<DashboardData>(this.url('dashboard'), { params: this.toParams({ mes, ano }) });
  }

  // Proprietários
  getProprietarios(filters: any = {}): Observable<PaginatedResponse<Proprietario>> {
    return this.http.get<PaginatedResponse<Proprietario>>(this.url('proprietarios'), { params: this.toParams(filters) });
  }
  getProprietariosAll(): Observable<PaginatedResponse<Proprietario>> {
    return this.getProprietarios({ per_page: 500 });
  }
  createProprietario(data: Partial<Proprietario>): Observable<Proprietario> {
    return this.http.post<Proprietario>(this.url('proprietarios'), data);
  }
  updateProprietario(id: string, data: Partial<Proprietario>): Observable<Proprietario> {
    return this.http.put<Proprietario>(this.url(`proprietarios/${id}`), data);
  }
  deleteProprietario(id: string): Observable<any> {
    return this.http.delete(this.url(`proprietarios/${id}`));
  }

  // Veículos
  getVeiculos(filters: any = {}): Observable<PaginatedResponse<Veiculo>> {
    return this.http.get<PaginatedResponse<Veiculo>>(this.url('veiculos'), { params: this.toParams(filters) });
  }
  getVeiculosByProprietario(id: string): Observable<Veiculo[]> {
    return this.http.get<Veiculo[]>(this.url(`veiculos/proprietario/${id}`));
  }
  createVeiculo(data: Partial<Veiculo>): Observable<Veiculo> {
    return this.http.post<Veiculo>(this.url('veiculos'), data);
  }
  updateVeiculo(id: string, data: Partial<Veiculo>): Observable<Veiculo> {
    return this.http.put<Veiculo>(this.url(`veiculos/${id}`), data);
  }
  deleteVeiculo(id: string): Observable<any> {
    return this.http.delete(this.url(`veiculos/${id}`));
  }

  // Motoristas
  getMotoristas(filters: any = {}): Observable<PaginatedResponse<Motorista>> {
    return this.http.get<PaginatedResponse<Motorista>>(this.url('motoristas'), { params: this.toParams(filters) });
  }
  getMotoristassByProprietario(id: string): Observable<Motorista[]> {
    return this.http.get<Motorista[]>(this.url(`motoristas/proprietario/${id}`));
  }
  createMotorista(data: Partial<Motorista>): Observable<Motorista> {
    return this.http.post<Motorista>(this.url('motoristas'), data);
  }
  updateMotorista(id: string, data: Partial<Motorista>): Observable<Motorista> {
    return this.http.put<Motorista>(this.url(`motoristas/${id}`), data);
  }
  deleteMotorista(id: string): Observable<any> {
    return this.http.delete(this.url(`motoristas/${id}`));
  }

  // Abastecimentos
  getAbastecimentos(filters: any = {}): Observable<PaginatedResponse<Abastecimento>> {
    return this.http.get<PaginatedResponse<Abastecimento>>(this.url('abastecimentos'), { params: this.toParams(filters) });
  }
  getAbastecimento(id: string): Observable<Abastecimento> {
    return this.http.get<Abastecimento>(this.url(`abastecimentos/${id}`));
  }
  createAbastecimento(data: Partial<Abastecimento>): Observable<Abastecimento> {
    return this.http.post<Abastecimento>(this.url('abastecimentos'), data);
  }
  updateAbastecimento(id: string, data: Partial<Abastecimento>): Observable<Abastecimento> {
    return this.http.put<Abastecimento>(this.url(`abastecimentos/${id}`), data);
  }
  deleteAbastecimento(id: string): Observable<any> {
    return this.http.delete(this.url(`abastecimentos/${id}`));
  }
  getAbastecimentosPendenteBaixa(filters: any = {}): Observable<Abastecimento[]> {
    return this.http.get<Abastecimento[]>(this.url('abastecimentos/filter/baixa-pendente'), { params: this.toParams(filters) });
  }
  getComprovantePdfUrl(id: string): string {
    return this.url(`abastecimentos/${id}/comprovante`);
  }

  // Baixas
  getBaixas(filters: any = {}): Observable<PaginatedResponse<BaixaAbastecimento>> {
    return this.http.get<PaginatedResponse<BaixaAbastecimento>>(this.url('baixas'), { params: this.toParams(filters) });
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
    return this.http.get<PaginatedResponse<EntradaNota>>(this.url('entrada-notas'), { params: this.toParams(filters) });
  }
  createEntradaNota(data: Partial<EntradaNota>): Observable<EntradaNota> {
    return this.http.post<EntradaNota>(this.url('entrada-notas'), data);
  }
  updateEntradaNota(id: string, data: Partial<EntradaNota>): Observable<EntradaNota> {
    return this.http.put<EntradaNota>(this.url(`entrada-notas/${id}`), data);
  }
  deleteEntradaNota(id: string): Observable<any> {
    return this.http.delete(this.url(`entrada-notas/${id}`));
  }

  // Valores Combustível
  getValoresCombustivel(filters: any = {}): Observable<PaginatedResponse<ValorCombustivel>> {
    return this.http.get<PaginatedResponse<ValorCombustivel>>(this.url('valores-combustivel'), { params: this.toParams(filters) });
  }
  getValorAtual(tipo: string): Observable<ValorCombustivel> {
    return this.http.get<ValorCombustivel>(this.url(`valores-combustivel/atual/${tipo}`));
  }
  createValorCombustivel(data: Partial<ValorCombustivel>): Observable<ValorCombustivel> {
    return this.http.post<ValorCombustivel>(this.url('valores-combustivel'), data);
  }
  updateValorCombustivel(id: string, data: Partial<ValorCombustivel>): Observable<ValorCombustivel> {
    return this.http.put<ValorCombustivel>(this.url(`valores-combustivel/${id}`), data);
  }
  deleteValorCombustivel(id: string): Observable<any> {
    return this.http.delete(this.url(`valores-combustivel/${id}`));
  }

  // Usuários
  getUsuarios(filters: any = {}): Observable<PaginatedResponse<Usuario>> {
    return this.http.get<PaginatedResponse<Usuario>>(this.url('usuarios'), { params: this.toParams(filters) });
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

  // Relatórios
  getRelatorioProprietario(filters: any): Observable<any> {
    return this.http.get(this.url('relatorios/proprietario'), { params: this.toParams(filters) });
  }
  getRelatorioProprietarioPdfUrl(filters: any): string {
    const p = new URLSearchParams(filters).toString();
    return `${this.url('relatorios/proprietario/pdf')}?${p}`;
  }
}
