<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family:'DejaVu Sans',sans-serif; font-size:10px; color:#1a1a1a; }
  .header { background:#0f172a; color:#fff; padding:14px 20px; margin-bottom:16px; }
  .header h1 { font-size:16px; font-weight:700; letter-spacing:2px; }
  .header .meta { font-size:9px; color:#94a3b8; margin-top:4px; }
  .proprietario-card { background:#f1f5f9; border-left:4px solid #3b82f6; padding:10px 14px; margin-bottom:14px; border-radius:0 6px 6px 0; }
  .proprietario-card h2 { font-size:14px; font-weight:700; color:#0f172a; }
  .proprietario-card .info { font-size:9px; color:#64748b; margin-top:2px; }
  table { width:100%; border-collapse:collapse; font-size:9px; }
  thead th { background:#0f172a; color:#fff; padding:6px 8px; text-align:left; font-size:8px; text-transform:uppercase; letter-spacing:0.5px; }
  tbody tr:nth-child(even) { background:#f8fafc; }
  tbody tr:hover { background:#eff6ff; }
  tbody td { padding:5px 8px; border-bottom:1px solid #e2e8f0; color:#374151; }
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
<div class="header">
  <h1>⛽ FUELTRACK — Relatório por Proprietário</h1>
  <div class="meta">
    Período: {{ $request->data_inicio ? \Carbon\Carbon::parse($request->data_inicio)->format('d/m/Y') : 'Início' }}
    até {{ $request->data_fim ? \Carbon\Carbon::parse($request->data_fim)->format('d/m/Y') : 'Hoje' }}
    — Gerado em {{ now()->format('d/m/Y H:i') }}
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
      <th>Combustível</th>
      <th>Motorista</th>
      <th class="text-right">Qtd (L)</th>
      <th class="text-right">R$/L</th>
      <th class="text-right">Total (R$)</th>
      <th class="text-center">Status</th>
    </tr>
  </thead>
  <tbody>
    @forelse($abastecimentos as $a)
    <tr>
      <td>{{ \Carbon\Carbon::parse($a->data_hora)->format('d/m/Y H:i') }}</td>
      <td><strong>{{ optional($a->veiculo)->placa ?? '—' }}</strong></td>
      <td>{{ strtoupper($a->tipo_combustivel) }}</td>
      <td>{{ $a->nome_motorista ?? '—' }}</td>
      <td class="text-right">{{ number_format($a->quantidade_litros,2,',','.') }}</td>
      <td class="text-right">{{ number_format($a->valor_por_litro,3,',','.') }}</td>
      <td class="text-right"><strong>{{ number_format($a->valor_total,2,',','.') }}</strong></td>
      <td class="text-center">
        <span class="status-badge {{ $a->baixa_abastecimento ? 'status-ok' : 'status-pending' }}">
          {{ $a->baixa_abastecimento ? 'Baixado' : 'Pendente' }}
        </span>
      </td>
    </tr>
    @empty
    <tr><td colspan="8" class="text-center" style="padding:20px;color:#94a3b8;">Nenhum registro encontrado</td></tr>
    @endforelse
    <tr class="totals-row">
      <td colspan="4"><strong>TOTAIS</strong></td>
      <td class="text-right"><strong>{{ number_format($totais['quantidade_litros'],2,',','.') }} L</strong></td>
      <td></td>
      <td class="text-right accent"><strong>R$ {{ number_format($totais['valor_total'],2,',','.') }}</strong></td>
      <td></td>
    </tr>
  </tbody>
</table>

<div class="footer">
  FuelTrack — Sistema de Gestão de Abastecimento | Total de {{ $abastecimentos->count() }} registros
</div>
</body>
</html>
