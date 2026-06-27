// src/app/shared/models/index.ts

export interface Proprietario {
  id_proprietario: string;
  nome: string;
  status?: string;
  responsavel?: string;
  celular?: string;
  observacao?: string;
  data_registro?: string;
  local?: string;
  odometro_obrigatorio?: boolean;
  limite_financeiro?: number | null;
  limite_litros?: number | null;
  bloqueio_automatico?: boolean;
  alerta_limite_percentual?: number | null;
  preco_custo_automatico?: boolean;
  limites_resumo?: ProprietarioLimitesResumo;
}

export interface ProprietarioLimitesResumo {
  pendente_valor: number;
  pendente_litros: number;
  limite_financeiro?: number | null;
  limite_litros?: number | null;
  alerta_limite_percentual?: number | null;
  percentual_financeiro?: number | null;
  percentual_litros?: number | null;
  situacao: 'normal' | 'alerta' | 'estourado' | string;
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
  local?: string;
  proprietario?: Proprietario;
}

export interface Motorista {
  id_motorista: string;
  nome: string;
  apelido?: string;
  id_proprietario: string;
  documento?: string;
  celular?: string;
  local?: string;
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
  imagem_verificada_por_id?: string;
  imagem_verificada_por?: string;
  imagem_verificada_em?: string;
  auditoria_auditado_por_id?: string;
  auditoria_auditado_por?: string;
  auditoria_auditado_em?: string;
  baixa_abastecimento?: boolean;
  data_baixa?: string;
  tipo_despesa?: string;
  descricao?: string;
  valor?: number;
  placa1?: string;
  recebedor?: string;
  observacao?: string;
  anexo?: string;
  created_at?: string;
  // Integração Sofit
  sofit_id?: string | null;
  sofit_status?: string | null;
  sofit_retorno?: string | null;
  sofit_trip_id?: string | null;
  sofit_lancado_em?: string | null;
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
    data_hora?: string;
    numero_nota_fiscal?: string;
  valor?: number;
  quantidade?: number;
  valor_litro?: number;
  custo_transporte_litro?: number;
  custo_transporte_total?: number;
  valor_compra_final?: number;
  responsavel?: string;
  foto_nota?: string;
  tipo?: string;
  local?: string;
  fornecedor?: string;
  fornecedor_ia_status?: string;
  fornecedor_ia_mensagem?: string;
  fornecedor_ia_extraido?: string;
  fornecedor_confirmado?: boolean;
  paga?: boolean;
  nota_verificacao_status?: string;
  nota_verificacao_mensagem?: string;
  nota_verificacao_tipo?: string;
  nota_verificacao_confianca?: number;
  nota_verificada_em?: string;
}

export interface ValorCombustivel {
  id_valor: string;
  tipo_combustivel: string;
  valor: number;
  data: string;
  responsavel?: string;
  local?: string;
}

  export interface EncerranteBomba {
    id_encerrante: string;
    data: string;
  local: string;
  quantidade_tanque: number;
  litros_bomba: number;
  foto: string;
  usuario_id?: string;
  usuario_nome?: string;
    created_at?: string;
  }

  export interface DespesaAvulsa {
    id_despesa: string;
    data: string;
    data_hora?: string;
    descricao: string;
    categoria?: string;
    valor: number;
    forma_pagamento?: string;
    observacao?: string;
    responsavel?: string;
    local?: string;
    status?: string;
  }

export interface Usuario {
  id_user: string;
  nome: string;
  login: string;
  tipo: 'admin' | 'operador' | 'visualizador';
  filiais_acesso?: string[] | string;
  ultimo_acesso?: string;
}

export interface AuthUser {
  id: string;
  nome: string;
  login: string;
  tipo: string;
  filiais_acesso?: string[] | string;
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
    valor_total_comprado?: number;
    valor_total_vendido?: number;
    valor_total_pendente_baixa?: number;
    valor_total_recebido?: number;
    litros_vendidos_hoje?: number;
    valor_vendido_hoje?: number;
    combustivel_comprado_litros?: number;
    combustivel_vendido_litros?: number;
    combustivel_tanque_litros?: number;
    veiculos?: number;
    proprietarios?: number;
    motoristas?: number;
  };
  comparativo_12_meses: {
    mes_ref: string;
    label: string;
    comprado_litros: number;
    comprado_valor?: number;
    vendido_litros: number;
    vendido_valor?: number;
    vendido_litros_pago?: number;
    vendido_valor_pago?: number;
    vendido_litros_pendente?: number;
    vendido_valor_pendente?: number;
  }[];
  status_resumo: { status: 'Pendente' | 'Pago' | string; total: number; valor_total?: number; litros_total?: number }[];
  top_proprietarios: { id_proprietario: string; nome_proprietario: string; total: number; valor: number }[];
}

export interface GraficosGerenciaisResumo {
  periodo: {
    data_inicio: string;
    data_fim: string;
    local: string;
  };
  totais: {
    comprado_valor: number;
    comprado_valor_sem_transporte?: number;
    comprado_litros: number;
    comprado_registros: number;
    custo_transporte_total?: number;
    vendido_valor: number;
    vendido_litros: number;
    abastecimentos_total: number;
    margem_bruta: number;
    pendente_baixa_valor: number;
    pendente_baixa_litros: number;
    pendente_baixa_total: number;
    ticket_medio: number;
    preco_medio_comprado: number;
    preco_medio_vendido: number;
    diferenca_media_litro: number;
    inconsistencias: number;
    proprietarios_bloqueados: number;
    proprietarios_proximos_limite: number;
    proprietarios_limite_estourado: number;
    tanque_litros: number;
    estoque_estimado_valor: number;
  };
  proprietarios_controle: {
    bloqueados: number;
    proximos_limite: number;
    limite_estourado: number;
    itens: {
      id_proprietario: string;
      nome: string;
      status: string;
      local: string;
      pendente_valor: number;
      pendente_litros: number;
      percentual_limite: number;
      situacao: string;
    }[];
  };
  ultima_entrada_nota?: {
    id_financeiro: string;
    data: string;
    data_hora?: string;
    numero_nota_fiscal?: string;
    quantidade: number;
    valor: number;
    valor_litro: number;
    custo_transporte_litro?: number;
    custo_transporte_total?: number;
    valor_compra_final?: number;
    tipo?: string;
    local?: string;
  } | null;
}

export interface GraficosGerenciaisData extends GraficosGerenciaisResumo {
  por_filial?: GraficosGerenciaisResumo[];
}

export interface BalanceteResumo {
  registros?: number;
  litros?: number;
  valor?: number;
  valor_sinalizado?: number;
  custo_transporte?: number;
}

export interface BalanceteMovimentoFinanceiro {
  comprado: number;
  vendido_pendente: number;
  recebido: number;
  despesas: number;
  saldo_competencia: number;
  saldo_caixa: number;
}

export interface BalanceteLocal {
  local: 'Matriz' | 'Viana' | string;
  compras: BalanceteResumo;
  vendas: BalanceteResumo;
  recebidos: BalanceteResumo;
  pendentes: BalanceteResumo;
  despesas: BalanceteResumo & {
    categorias?: { categoria: string; valor: number }[];
  };
  top_pendentes?: { nome_proprietario: string; valor: number }[];
  estoque_periodo_litros: number;
  saldo_a_receber?: number;
  custo_medio_compra_litro?: number;
  custo_vendido_estimado?: number;
  diferenca_bruta_estimada?: number;
  resultado_operacional_estimado?: number;
  resultado_competencia: number;
  resultado_caixa: number;
  movimento_financeiro?: BalanceteMovimentoFinanceiro;
}

export interface BalanceteSerieDiariaPonto {
  data: string;
  label: string;
  custos: number;
  vendas: number;
}

export interface BalancetePrivadoData {
  periodo: {
    data_inicio: string;
    data_fim: string;
  };
  locais: BalanceteLocal[];
  serie_diaria?: BalanceteSerieDiariaPonto[];
  consolidado: Omit<BalanceteLocal, 'local' | 'despesas' | 'top_pendentes'> & {
    despesas: BalanceteResumo;
  };
}

export interface TanqueHistoricoPonto {
  data: string;
  label: string;
  entrada_litros: number;
  saida_litros: number;
  saldo_litros: number;
  entradas: number;
  saidas: number;
  entrada_valor?: number;
  saida_valor?: number;
}

export interface TanqueHistoricoLocal {
  local: 'Matriz' | 'Viana' | string;
  saldo_inicial_litros: number;
  saldo_final_litros: number;
  entrada_periodo_litros: number;
  saida_periodo_litros: number;
  pontos: TanqueHistoricoPonto[];
}

export interface TanqueHistoricoData {
  periodo: {
    data_inicio: string;
    data_fim: string;
  };
  locais: TanqueHistoricoLocal[];
}

export interface AbastecimentoSuspeita {
  tipo: 'duplicado' | 'km_menor' | 'valor_filial' | 'imagem_incompativel' | 'sem_foto' | 'vinculo_divergente' | string;
  severidade: 'alta' | 'media' | 'baixa' | string;
  mensagem: string;
  meta?: Record<string, any>;
}

export interface AbastecimentoAuditoriaItem {
  abastecimento: Abastecimento;
  suspeitas: AbastecimentoSuspeita[];
}

export interface AbastecimentoAuditoriaData {
  resumo: {
    total: number;
    por_tipo: Record<string, number>;
  };
  data: AbastecimentoAuditoriaItem[];
}

export interface ExtratoBancario {
  id: string;
  data: string;
  descricao?: string | null;
  valor: number;
  tipo: 'credito' | 'debito';
  documento?: string | null;
  banco?: string | null;
  local?: string | null;
  status: 'pendente' | 'conciliado' | 'ignorado';
  conciliado_em?: string | null;
  conciliado_por?: string | null;
  arquivo_origem?: string | null;
  created_at?: string;
}

export interface ConciliacaoBancariaResumo {
  total: number;
  pendentes: number;
  conciliados: number;
  ignorados: number;
  valor_pendente_credito: number;
}

export interface ConciliacaoBaixaItem {
  id_baixa: string;
  id_abastecimento: string;
  id_proprietario?: string;
  nome_proprietario?: string;
  valor: number;
  data_abastecimento?: string;
  data_pagamento?: string;
  forma_pagamento?: string;
  placa1?: string;
}

export interface ConciliacaoSugestaoGrupo {
  id_proprietario: string;
  nome_proprietario?: string;
  data_pagamento: string;
  valor_total: number;
  diferenca: number;
  baixas: ConciliacaoBaixaItem[];
}
