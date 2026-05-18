<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Str;
use Illuminate\Support\Facades\Schema;

class ValoresCombustivel extends Model
{
    private static ?bool $hasSyncTokenColumn = null;
    protected $table = 'valores_combustivel';
    protected $primaryKey = 'id_valor';
    public $incrementing = false;
    protected $keyType = 'string';
    public $timestamps = false;

    protected $fillable = ['id_valor','tipo_combustivel','valor','data','responsavel','sync_token_at'];
    protected $casts = ['valor' => 'decimal:3','data' => 'datetime', 'sync_token_at' => 'datetime'];

    protected static function boot()
    {
        parent::boot();
        static::creating(function ($m) {
            $m->id_valor ??= (string) Str::uuid();
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
}
