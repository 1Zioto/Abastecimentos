<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Str;

class ValoresCombustivel extends Model
{
    protected $table = 'valores_combustivel';
    protected $primaryKey = 'id_valor';
    public $incrementing = false;
    protected $keyType = 'string';
    public $timestamps = false;

    protected $fillable = ['id_valor','tipo_combustivel','valor','data','responsavel'];
    protected $casts = ['valor' => 'decimal:3','data' => 'datetime'];

    protected static function boot()
    {
        parent::boot();
        static::creating(fn($m) => $m->id_valor ??= (string) Str::uuid());
    }
}
