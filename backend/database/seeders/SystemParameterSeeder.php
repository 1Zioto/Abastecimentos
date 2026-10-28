<?php

namespace Database\Seeders;

use App\Models\SystemParameter;
use Illuminate\Database\Seeder;

/**
 * Parâmetros iniciais do motor financeiro. Valores de partida — ajustáveis
 * pela diretoria em system_parameters sem mexer em código.
 */
class SystemParameterSeeder extends Seeder
{
    public function run(): void
    {
        $parametros = [
            ['chave' => 'preco_medio_diesel', 'valor' => ['v' => 6.20], 'tipo' => 'money',
             'descricao' => 'Preço médio do diesel (R$/litro) usado nas estimativas'],
            ['chave' => 'consumo_esperado_kml', 'valor' => ['v' => 2.5], 'tipo' => 'number',
             'descricao' => 'Consumo esperado padrão da frota (km/l) quando o veículo não tem média própria'],
            ['chave' => 'consumo_marcha_lenta_lph', 'valor' => ['v' => 3.0], 'tipo' => 'number',
             'descricao' => 'Consumo em marcha lenta (litros/hora) para estimar desperdício'],
            ['chave' => 'custo_fixo_diario_veiculo', 'valor' => ['v' => 350.00], 'tipo' => 'money',
             'descricao' => 'Custo fixo diário rateado por veículo (salários, depreciação, seguro, etc.)'],
            ['chave' => 'custo_hora_motorista', 'valor' => ['v' => 18.00], 'tipo' => 'money',
             'descricao' => 'Custo-hora do motorista para cálculo de custo de oportunidade'],
            ['chave' => 'margem_desejada_pct', 'valor' => ['v' => 15.0], 'tipo' => 'percent',
             'descricao' => 'Margem desejada padrão para o preço recomendado de frete'],
        ];

        foreach ($parametros as $p) {
            SystemParameter::updateOrCreate(
                ['company_id' => null, 'chave' => $p['chave']],
                ['valor' => $p['valor'], 'tipo' => $p['tipo'], 'descricao' => $p['descricao']]
            );
        }
    }
}
