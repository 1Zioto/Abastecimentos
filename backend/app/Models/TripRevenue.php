<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Str;

class TripRevenue extends Model
{
    protected $table = 'trip_revenues';
    public $incrementing = false;
    protected $keyType = 'string';

    protected $fillable = ['id', 'trip_id', 'tipo', 'descricao', 'valor', 'origem'];
    protected $casts = ['valor' => 'decimal:2'];

    public const TIPOS = ['frete', 'estadia', 'taxa', 'retorno', 'outra'];

    protected static function boot()
    {
        parent::boot();
        static::creating(fn ($m) => $m->id ??= (string) Str::uuid());
    }

    public function trip() { return $this->belongsTo(Trip::class, 'trip_id'); }
}
