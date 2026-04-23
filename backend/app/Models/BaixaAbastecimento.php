<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Str;

class BaixaAbastecimento extends Model
{
    protected $table = 'baixa_abastecimento';
    protected $primaryKey = 'id_baixa';
    public $incrementing = false;
    protected $keyType = 'string';
    public $timestamps = false;

    protected $fillable = [
        'id_baixa','id_abastecimento','data_hora','usuario',
        'forma_pagamento','data_pagamento','nota_entrada'
    ];

    protected $casts = ['data_hora' => 'datetime','data_pagamento' => 'datetime'];

    protected static function boot()
    {
        parent::boot();
        static::creating(fn($m) => $m->id_baixa ??= (string) Str::uuid());
    }

    public function abastecimento()
    {
        return $this->belongsTo(Abastecimento::class,'id_abastecimento','id_abastecimento');
    }
}
