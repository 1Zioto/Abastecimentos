// src/app/shared/models/index.ts

export interface Proprietario {
  id_proprietario: string;
  nome: string;
  status?: string;
  responsavel?: string;
  celular?: string;
  data_registro?: string;
}

export interface Veiculo {
  id_veiculo: string;
  placa: string;
  marca?: string;
  modelo?: string;
  ano?: string;
  tipo_combustivel?: string;
  numero_chassi?: string;
  id_proprietario: string;
  odometro?: number;
  renavam?: string;
  cor?: string;
  foto?: string;
  proprietario?: Proprietario;
}

export interface Motorista {
  id_motorista: string;
  nome: string;
  id_proprietario: string;
  documento?: string;
  celular?: string;
  proprietario?: Proprietario;
}

export interface Abastecimento {
  id_abastecimento: string;
  data: string;
  data_hora: string;
  frentista?: string;
  id_veiculo: string;
  id_motorista?: string;
  id_proprietario: string;
  nome_motorista?: string;
  nome_proprietario?: string;
  local?: string;
  tipo_combustivel: string;
  quantidade_litros: number;
  valor_por_litro: number;
  valor_total: number;
  odometro?: number;
  foto_odometro?: string;
  bomba?: string;
  status?: string;
  baixa_abastecimento?: boolean;
  data_baixa?: string;
  tipo_despesa?: string;
  descricao?: string;
  valor?: number;
  status1?: string;
  placa1?: string;
  recebedor?: string;
  observacao?: string;
  anexo?: string;
  created_at?: string;
  veiculo?: Veiculo;
  motorista?: Motorista;
  proprietario?: Proprietario;
}

export interface BaixaAbastecimento {
  id_baixa: string;
  id_abastecimento: string;
  data_hora: string;
  usuario?: string;
  forma_pagamento?: string;
  data_pagamento?: string;
  nota_entrada?: string;
  abastecimento?: Abastecimento;
}

export interface EntradaNota {
  id_financeiro: string;
  data: string;
  numero_nota_fiscal?: string;
  valor?: number;
  quantidade?: number;
  valor_litro?: number;
  responsavel?: string;
  foto_nota?: string;
  tipo?: string;
}

export interface ValorCombustivel {
  id_valor: string;
  tipo_combustivel: string;
  valor: number;
  data: string;
  responsavel?: string;
}

export interface Usuario {
  id_user: string;
  nome: string;
  login: string;
  tipo: 'admin' | 'operador' | 'visualizador';
  ultimo_acesso?: string;
}

export interface AuthUser {
  id: string;
  nome: string;
  login: string;
  tipo: string;
}

export interface LoginResponse {
  token: string;
  token_type: string;
  expires_in: number;
  user: AuthUser;
}

export interface PaginatedResponse<T> {
  data: T[];
  current_page: number;
  last_page: number;
  per_page: number;
  total: number;
  from: number;
  to: number;
}

export interface DashboardData {
  totais: {
    abastecimentos: number;
    litros: number;
    valor: number;
    pendente_baixa: number;
    veiculos: number;
    proprietarios: number;
    motoristas: number;
  };
  por_dia: { dia: string; total: number; litros: number; valor: number }[];
  por_combustivel: { tipo_combustivel: string; total: number; litros: number; valor: number }[];
  top_proprietarios: { id_proprietario: string; nome_proprietario: string; total: number; valor: number }[];
}
