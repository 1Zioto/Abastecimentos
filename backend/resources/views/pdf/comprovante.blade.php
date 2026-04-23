<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'DejaVu Sans', sans-serif; font-size: 11px; color: #1a1a1a; background: #fff; }
  .header { background: #0f172a; color: #fff; padding: 16px 20px; display: flex; justify-content: space-between; align-items: center; }
  .header h1 { font-size: 18px; letter-spacing: 2px; font-weight: 700; }
  .header .sub { font-size: 10px; color: #94a3b8; margin-top: 2px; }
  .badge { background: #16a34a; color: #fff; padding: 4px 10px; border-radius: 20px; font-size: 10px; font-weight: 700; letter-spacing: 1px; }
  .body { padding: 20px; }
  .title { font-size: 14px; font-weight: 700; color: #0f172a; margin-bottom: 16px; border-bottom: 2px solid #e2e8f0; padding-bottom: 8px; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 16px; }
  .field { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 8px 12px; }
  .field .label { font-size: 9px; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 2px; }
  .field .value { font-size: 12px; font-weight: 600; color: #0f172a; }
  .totals { background: #0f172a; color: #fff; border-radius: 8px; padding: 14px 16px; margin-top: 16px; display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; }
  .totals .t-label { font-size: 9px; color: #94a3b8; text-transform: uppercase; margin-bottom: 2px; }
  .totals .t-value { font-size: 16px; font-weight: 700; color: #fff; }
  .totals .t-value.accent { color: #4ade80; }
  .footer { margin-top: 20px; text-align: center; font-size: 9px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 10px; }
  .id-code { font-family: monospace; font-size: 9px; color: #94a3b8; }
</style>
</head>
<body>
<div class="header">
  <div>
    <div class="h1">⛽ FUELTRACK</div>
    <div class="sub">Sistema de Gestão de Abastecimento</div>
  </div>
  <div class="badge">COMPROVANTE</div>
</div>

<div class="body">
  <div class="title">Comprovante de Abastecimento</div>

  <div class="grid">
    <div class="field">
      <div class="label">Data / Hora</div>
      <div class="value">{{ \Carbon\Carbon::parse($abastecimento->data_hora)->format('d/m/Y H:i') }}</div>
    </div>
    <div class="field">
      <div class="label">Frentista</div>
      <div class="value">{{ $abastecimento->frentista ?? '—' }}</div>
    </div>
    <div class="field">
      <div class="label">Placa do Veículo</div>
      <div class="value">{{ $abastecimento->veiculo->placa ?? $abastecimento->id_veiculo }}</div>
    </div>
    <div class="field">
      <div class="label">Veículo</div>
      <div class="value">{{ optional($abastecimento->veiculo)->marca }} {{ optional($abastecimento->veiculo)->modelo }}</div>
    </div>
    <div class="field">
      <div class="label">Motorista</div>
      <div class="value">{{ $abastecimento->nome_motorista ?? '—' }}</div>
    </div>
    <div class="field">
      <div class="label">Proprietário</div>
      <div class="value">{{ $abastecimento->nome_proprietario ?? '—' }}</div>
    </div>
    <div class="field">
      <div class="label">Tipo de Combustível</div>
      <div class="value">{{ strtoupper($abastecimento->tipo_combustivel) }}</div>
    </div>
    <div class="field">
      <div class="label">Local</div>
      <div class="value">{{ $abastecimento->local ?? '—' }}</div>
    </div>
    <div class="field">
      <div class="label">Bomba</div>
      <div class="value">{{ $abastecimento->bomba ?? '—' }}</div>
    </div>
    <div class="field">
      <div class="label">Odômetro</div>
      <div class="value">{{ number_format($abastecimento->odometro, 0, ',', '.') }} km</div>
    </div>
    <div class="field">
      <div class="label">Status</div>
      <div class="value">{{ $abastecimento->status ?? '—' }}</div>
    </div>
  </div>

  <div class="totals">
    <div>
      <div class="t-label">Quantidade</div>
      <div class="t-value">{{ number_format($abastecimento->quantidade_litros, 2, ',', '.') }} L</div>
    </div>
    <div>
      <div class="t-label">Valor por Litro</div>
      <div class="t-value">R$ {{ number_format($abastecimento->valor_por_litro, 3, ',', '.') }}</div>
    </div>
    <div>
      <div class="t-label">Valor Total</div>
      <div class="t-value accent">R$ {{ number_format($abastecimento->valor_total, 2, ',', '.') }}</div>
    </div>
  </div>

  <div class="footer">
    <div class="id-code">ID: {{ $abastecimento->id_abastecimento }}</div>
    <div>Emitido em {{ now()->format('d/m/Y \à\s H:i:s') }} — FuelTrack Sistema de Abastecimento</div>
  </div>
</div>
</body>
</html>
