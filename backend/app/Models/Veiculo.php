<?php

namespace App\Models;

use App\Models\Concerns\SerializesDatesInAppTimezone;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Str;
use Illuminate\Support\Facades\Schema;

class Veiculo extends Model
{
    use SerializesDatesInAppTimezone;

    private static ?bool $hasSyncTokenColumn = null;
    protected $table = 'veiculos';
    protected $primaryKey = 'id_veiculo';
    public $incrementing = false;
    protected $keyType = 'string';
    public $timestamps = false;

    protected $fillable = [
        'id_veiculo','placa','marca','modelo','ano','tipo_combustivel',
        'numero_chassi','id_proprietario','odometro','renavam','cor','foto','local','sync_token_at'
    ];
    protected $casts = ['sync_token_at' => 'datetime'];

    protected static function boot()
    {
        parent::boot();
        static::creating(function ($m) {
            $m->id_veiculo ??= (string) Str::uuid();
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

    public function proprietario() { return $this->belongsTo(Proprietario::class,'id_proprietario','id_proprietario'); }
    public function abastecimentos() { return $this->hasMany(Abastecimento::class,'id_veiculo','id_veiculo'); }
}
