<?php

namespace App\Http\Requests;

use App\Models\Trip;
use App\Models\TripCost;
use App\Models\TripRevenue;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StoreTripRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true; // autorização via middleware de rota (auth:api)
    }

    public function rules(): array
    {
        return [
            'company_id' => ['nullable', 'uuid'],
            'branch_id' => ['nullable', 'uuid'],
            'client_id' => ['nullable', 'uuid'],
            'vehicle_id' => ['nullable', 'uuid'],
            'trailer_id' => ['nullable', 'uuid'],
            'driver_id' => ['nullable', 'uuid'],
            'route_id' => ['nullable', 'uuid'],
            'product_id' => ['nullable', 'uuid'],

            'origem' => ['nullable', 'string', 'max:160'],
            'destino' => ['nullable', 'string', 'max:160'],

            'previsao_saida' => ['nullable', 'date'],
            'saida_real' => ['nullable', 'date'],
            'previsao_chegada' => ['nullable', 'date'],
            'chegada_real' => ['nullable', 'date'],

            'peso_kg' => ['nullable', 'numeric', 'min:0'],
            'quantidade' => ['nullable', 'numeric', 'min:0'],
            'tipo_carga' => ['nullable', 'string', 'max:60'],

            'km_inicial' => ['nullable', 'numeric', 'min:0'],
            'km_final' => ['nullable', 'numeric', 'min:0', 'gte:km_inicial'],
            'km_carregado' => ['nullable', 'numeric', 'min:0'],
            'km_vazio' => ['nullable', 'numeric', 'min:0'],

            'status' => ['nullable', Rule::in(Trip::STATUSES)],
            'cte_numero' => ['nullable', 'string', 'max:60'],
            'mdfe_numero' => ['nullable', 'string', 'max:60'],
            'margem_desejada_pct' => ['nullable', 'numeric', 'min:0', 'max:99.99'],
            'custo_fixo_diario' => ['nullable', 'numeric', 'min:0'],
            'observacao' => ['nullable', 'string'],

            // Receitas e custos aninhados (opcionais na criação)
            'revenues' => ['nullable', 'array'],
            'revenues.*.tipo' => ['required_with:revenues', Rule::in(TripRevenue::TIPOS)],
            'revenues.*.descricao' => ['nullable', 'string', 'max:255'],
            'revenues.*.valor' => ['required_with:revenues', 'numeric', 'min:0'],

            'costs' => ['nullable', 'array'],
            'costs.*.categoria' => ['required_with:costs', Rule::in(TripCost::CATEGORIAS)],
            'costs.*.natureza' => ['nullable', Rule::in(TripCost::NATUREZAS)],
            'costs.*.descricao' => ['nullable', 'string', 'max:255'],
            'costs.*.valor' => ['required_with:costs', 'numeric', 'min:0'],
        ];
    }
}
