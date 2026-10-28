<?php

namespace App\Http\Resources;

use Illuminate\Http\Resources\Json\JsonResource;

class TripResource extends JsonResource
{
    public function toArray($request): array
    {
        return [
            'id' => $this->id,
            'numero' => $this->numero,
            'company_id' => $this->company_id,
            'branch_id' => $this->branch_id,
            'client_id' => $this->client_id,
            'vehicle_id' => $this->vehicle_id,
            'trailer_id' => $this->trailer_id,
            'driver_id' => $this->driver_id,
            'route_id' => $this->route_id,
            'product_id' => $this->product_id,
            'origem' => $this->origem,
            'destino' => $this->destino,
            'previsao_saida' => $this->previsao_saida,
            'saida_real' => $this->saida_real,
            'previsao_chegada' => $this->previsao_chegada,
            'chegada_real' => $this->chegada_real,
            'peso_kg' => $this->peso_kg,
            'quantidade' => $this->quantidade,
            'tipo_carga' => $this->tipo_carga,
            'km_inicial' => $this->km_inicial,
            'km_final' => $this->km_final,
            'km_carregado' => $this->km_carregado,
            'km_vazio' => $this->km_vazio,
            'status' => $this->status,
            'cte_numero' => $this->cte_numero,
            'mdfe_numero' => $this->mdfe_numero,
            'margem_desejada_pct' => $this->margem_desejada_pct,
            'custo_fixo_diario' => $this->custo_fixo_diario,
            'observacao' => $this->observacao,
            'resultado' => $this->resultado_json,
            'revenues' => TripRevenueResource::collection($this->whenLoaded('revenues')),
            'costs' => TripCostResource::collection($this->whenLoaded('costs')),
            'veiculo' => $this->whenLoaded('veiculo', fn () => [
                'id_veiculo' => $this->veiculo->id_veiculo ?? null,
                'placa' => $this->veiculo->placa ?? null,
            ]),
            'motorista' => $this->whenLoaded('motorista', fn () => [
                'id_motorista' => $this->motorista->id_motorista ?? null,
                'nome' => $this->motorista->nome ?? null,
            ]),
            'created_at' => $this->created_at,
            'updated_at' => $this->updated_at,
        ];
    }
}
