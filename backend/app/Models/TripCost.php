<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Str;

class TripCost extends Model
{
    protected $table = 'trip_costs';
    public $incrementing = false;
    protected $keyType = 'string';

    protected $fillable = ['id', 'trip_id', 'categoria', 'natureza', 'descricao', 'valor', 'origem', 'ref_id'];
    protected $casts = ['valor' => 'decimal:2'];

    public const CATEGORIAS = [
        'combustivel', 'pedagio', 'arla', 'comissao', 'diaria', 'alimentacao',
        'hospedagem', 'descarga', 'lavagem', 'manutencao', 'pneus', 'multa',
        'taxa', 'seguro', 'rastreamento', 'outro',
    ];
    public const NATUREZAS = ['variavel', 'fixo_rateado'];

    protected static function boot()
    {
        parent::boot();
        static::creating(fn ($m) => $m->id ??= (string) Str::uuid());
    }

    public function trip() { return $this->belongsTo(Trip::class, 'trip_id'); }
}
