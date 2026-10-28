<?php

namespace App\Http\Resources;

use Illuminate\Http\Resources\Json\JsonResource;

class TripRevenueResource extends JsonResource
{
    public function toArray($request): array
    {
        return [
            'id' => $this->id,
            'trip_id' => $this->trip_id,
            'tipo' => $this->tipo,
            'descricao' => $this->descricao,
            'valor' => $this->valor,
            'origem' => $this->origem,
        ];
    }
}
