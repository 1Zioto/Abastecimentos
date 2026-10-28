<?php

namespace App\Http\Resources;

use Illuminate\Http\Resources\Json\JsonResource;

class TripCostResource extends JsonResource
{
    public function toArray($request): array
    {
        return [
            'id' => $this->id,
            'trip_id' => $this->trip_id,
            'categoria' => $this->categoria,
            'natureza' => $this->natureza,
            'descricao' => $this->descricao,
            'valor' => $this->valor,
            'origem' => $this->origem,
            'ref_id' => $this->ref_id,
        ];
    }
}
