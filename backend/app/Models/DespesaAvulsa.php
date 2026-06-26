<?php

namespace App\Models;

use App\Models\Concerns\SerializesDatesInAppTimezone;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

class DespesaAvulsa extends Model
{
    use SerializesDatesInAppTimezone;

    private static ?bool $hasSyncTokenColumn = null;

    protected $table = 'despesas_avulsas';
    protected $primaryKey = 'id_despesa';
    public $incrementing = false;
    protected $keyType = 'string';
    public $timestamps = false;

    protected $fillable = [
        'id_despesa',
        'data',
        'data_hora',
        'descricao',
        'categoria',
        'valor',
        'forma_pagamento',
        'observacao',
        'responsavel',
        'local',
        'status',
        'sync_token_at',
    ];

    protected $casts = [
        'data' => 'date',
        'data_hora' => 'datetime',
        'valor' => 'decimal:2',
        'sync_token_at' => 'datetime',
    ];

    protected static function boot()
    {
        parent::boot();

        static::creating(function ($model) {
            $model->id_despesa ??= (string) Str::uuid();
            if (static::supportsSyncToken()) {
                $model->sync_token_at = now();
            }
        });

        static::updating(function ($model) {
            if (static::supportsSyncToken()) {
                $model->sync_token_at = now();
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
}
