<?php

namespace App\Models;

use App\Models\Concerns\SerializesDatesInAppTimezone;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Str;
use Illuminate\Support\Facades\Schema;

class BaixaAbastecimento extends Model
{
    use SerializesDatesInAppTimezone;

    private static ?bool $hasSyncTokenColumn = null;
    protected $table = 'baixa_abastecimento';
    protected $primaryKey = 'id_baixa';
    public $incrementing = false;
    protected $keyType = 'string';
    public $timestamps = false;

    protected $fillable = [
        'id_baixa','id_abastecimento','data_hora','usuario',
        'forma_pagamento','data_pagamento','nota_entrada', 'sync_token_at'
    ];

    protected $casts = ['data_hora' => 'datetime','data_pagamento' => 'datetime', 'sync_token_at' => 'datetime'];

    protected static function boot()
    {
        parent::boot();
        static::creating(function ($m) {
            $m->id_baixa ??= (string) Str::uuid();
            if (static::supportsSyncToken()) {
                $m->sync_token_at = now();
            }
        });
        static::updating(function ($m) {
            if (static::supportsSyncToken()) {
                $m->sync_token_at = now();
            }
        });
    }

    private static function supportsSyncToken(): bool
    {
        if (static::$hasSyncTokenColumn !== null) {
            return static::$hasSyncTokenColumn;
        }

        try {
            static::$hasSyncTokenColumn = Schema::hasColumn((new static)->getTable(), 'sync_token_at');
        } catch (\Throwable) {
            static::$hasSyncTokenColumn = false;
        }

        return static::$hasSyncTokenColumn;
    }

    public function abastecimento()
    {
        return $this->belongsTo(Abastecimento::class,'id_abastecimento','id_abastecimento');
    }
}
