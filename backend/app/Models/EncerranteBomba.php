<?php

namespace App\Models;

use App\Models\Concerns\SerializesDatesInAppTimezone;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Str;

class EncerranteBomba extends Model
{
    use SerializesDatesInAppTimezone;

    protected $table = 'encerrantes_bomba';
    protected $primaryKey = 'id_encerrante';
    public $incrementing = false;
    protected $keyType = 'string';
    public $timestamps = false;

    protected $fillable = [
        'id_encerrante',
        'data',
        'local',
        'quantidade_tanque',
        'litros_bomba',
        'foto',
        'usuario_id',
        'usuario_nome',
        'created_at',
        'sync_token_at',
    ];

    protected $casts = [
        'data' => 'date',
        'quantidade_tanque' => 'decimal:2',
        'litros_bomba' => 'decimal:2',
        'created_at' => 'datetime',
        'sync_token_at' => 'datetime',
    ];

    protected static function boot()
    {
        parent::boot();

        static::creating(function ($model) {
            $model->id_encerrante ??= (string) Str::uuid();
            $model->created_at ??= now();
            $model->sync_token_at ??= now();
        });

        static::updating(function ($model) {
            $model->sync_token_at = now();
        });
    }
}
