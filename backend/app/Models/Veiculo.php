<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Str;

class Veiculo extends Model
{
    protected $table = 'veiculos';
    protected $primaryKey = 'id_veiculo';
    public $incrementing = false;
    protected $keyType = 'string';
    public $timestamps = false;

    protected $fillable = [
        'id_veiculo','placa','marca','modelo','ano','tipo_combustivel',
        'numero_chassi','id_proprietario','odometro','renavam','cor','foto'
    ];

    protected static function boot()
    {
        parent::boot();
        static::creating(fn($m) => $m->id_veiculo ??= (string) Str::uuid());
    }

    public function proprietario() { return $this->belongsTo(Proprietario::class,'id_proprietario','id_proprietario'); }
    public function abastecimentos() { return $this->hasMany(Abastecimento::class,'id_veiculo','id_veiculo'); }
}
