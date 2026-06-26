<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family: Arial, Helvetica, sans-serif; font-size:10px; color:#1a1a1a; }
  .header { background:#0f172a; color:#fff; padding:14px 20px; margin-bottom:16px; }
  .header h1 { font-size:16px; font-weight:700; letter-spacing:2px; }
  .header .meta { font-size:9px; color:#94a3b8; margin-top:4px; }
  .proprietario-card { background:#f1f5f9; border-left:4px solid #3b82f6; padding:10px 14px; margin-bottom:14px; border-radius:0 6px 6px 0; }
  .proprietario-card h2 { font-size:14px; font-weight:700; color:#0f172a; }
  .proprietario-card .info { font-size:9px; color:#64748b; margin-top:2px; }
  table { width:100%; border-collapse:collapse; font-size:8.5px; table-layout:fixed; }
  thead th { background:#0f172a; color:#fff; padding:5px 6px; text-align:left; font-size:7.5px; text-transform:uppercase; letter-spacing:0.2px; }
  tbody tr:nth-child(even) { background:#f8fafc; }
  tbody td { padding:5px 6px; border-bottom:1px solid #e2e8f0; color:#374151; word-break:break-word; }
  .col-datetime { width:78px; white-space:nowrap; word-break:normal; }
  .col-placa { width:52px; white-space:nowrap; }
  .col-motorista { width:110px; }
  .col-qtd { width:54px; }
  .col-unit { width:48px; }
  .col-total { width:64px; }
  .filters { display:block; margin-top:8px; line-height:1.6; }
  .filters span { display:inline-block; background:#1e293b; color:#e2e8f0; border-radius:10px; padding:2px 7px; margin-right:4px; margin-top:3px; }
  .text-right { text-align:right; }
  .text-center { text-align:center; }
  .totals-row { background:#0f172a !important; color:#fff; font-weight:700; }
  .totals-row td { color:#fff; padding:8px; }
  .totals-row .accent { color:#4ade80; }
  .status-badge { padding:2px 6px; border-radius:10px; font-size:8px; font-weight:700; }
  .status-ok { background:#dcfce7; color:#15803d; }
  .status-pending { background:#fef9c3; color:#854d0e; }
  .footer { margin-top:16px; text-align:center; font-size:8px; color:#94a3b8; border-top:1px solid #e2e8f0; padding-top:8px; }
</style>
</head>
<body>
@php
  $tsInicio = $request->data_inicio ? strtotime((string) $request->data_inicio) : false;
  $tsFim = $request->data_fim ? strtotime((string) $request->data_fim) : false;
  $dataInicioFmt = $tsInicio ? date('d/m/Y', $tsInicio) : 'Início';
  $dataFimFmt = $tsFim ? date('d/m/Y', $tsFim) : 'Hoje';
  $veiculoFiltro = $request->id_veiculo ? optional($abastecimentos->firstWhere('id_veiculo', $request->id_veiculo))->veiculo : null;
@endphp
<div class="header">
  <h1>FUELTRACK - Relatorio por Proprietario</h1>
  <div class="meta">
    Gerado em {{ now()->format('d/m/Y H:i') }}
    <span class="filters">
      <span>Proprietário: {{ $proprietario->nome ?? 'Todos' }}</span>
      <span>Veículo: {{ optional($veiculoFiltro)->placa ?? 'Todos' }}</span>
      <span>Período: {{ $dataInicioFmt }} até {{ $dataFimFmt }}</span>
      <span>Baixa: {{ $request->status ?: 'Todos' }}</span>
    </span>
  </div>
</div>

<div class="proprietario-card">
  <h2>{{ $proprietario->nome }}</h2>
  <div class="info">
    Responsável: {{ $proprietario->responsavel ?? '—' }} |
    Contato: {{ $proprietario->celular ?? '—' }} |
    Status: {{ $proprietario->status ?? '—' }}
  </div>
</div>

<table>
  <thead>
    <tr>
      <th>Data / Hora</th>
      <th>Placa</th>
      <th>Motorista</th>
      <th class="text-right">Qtd (L)</th>
      <th class="text-right">R$/L</th>
      <th class="text-right">Total (R$)</th>
    </tr>
  </thead>
  <tbody>
    @forelse($abastecimentos as $a)
    @php
      $rawDataHora = method_exists($a, 'getRawOriginal') ? $a->getRawOriginal('data_hora') : ($a->data_hora ?? null);
      $tsDataHora = $rawDataHora ? strtotime((string) $rawDataHora) : false;
      $dataHoraFmt = $tsDataHora ? date('d/m/Y H:i', $tsDataHora) : '—';
    @endphp
    <tr>
      <td class="col-datetime">{{ $dataHoraFmt }}</td>
      <td class="col-placa"><strong>{{ optional($a->veiculo)->placa ?? '—' }}</strong></td>
      <td class="col-motorista">{{ $a->nome_motorista ?? '—' }}</td>
      <td class="text-right col-qtd">{{ number_format($a->quantidade_litros,2,',','.') }}</td>
      <td class="text-right col-unit">{{ number_format($a->valor_por_litro,3,',','.') }}</td>
      <td class="text-right col-total"><strong>{{ number_format($a->valor_total,2,',','.') }}</strong></td>
    </tr>
    @empty
    <tr><td colspan="6" class="text-center" style="padding:20px;color:#94a3b8;">Nenhum registro encontrado</td></tr>
    @endforelse
    <tr class="totals-row">
      <td colspan="3"><strong>TOTAIS</strong></td>
      <td class="text-right"><strong>{{ number_format($totais['quantidade_litros'],2,',','.') }} L</strong></td>
      <td></td>
      <td class="text-right accent"><strong>R$ {{ number_format($totais['valor_total'],2,',','.') }}</strong></td>
    </tr>
  </tbody>
</table>

<div class="footer">
  FuelTrack — Sistema de Gestão de Abastecimento | Total de {{ $abastecimentos->count() }} registros
</div>
</body>
</html>
