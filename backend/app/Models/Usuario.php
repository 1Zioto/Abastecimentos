<?php

namespace App\Models;

use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Support\Str;
use Illuminate\Support\Facades\Schema;
use Tymon\JWTAuth\Contracts\JWTSubject;

class Usuario extends Authenticatable implements JWTSubject
{
    private static ?bool $hasSyncTokenColumn = null;
    protected $table = 'usuarios';
    protected $primaryKey = 'id_user';
    public $incrementing = false;
    protected $keyType = 'string';
    public $timestamps = false;

    protected $fillable = ['id_user','nome','login','password','ultimo_acesso','tipo','filiais_acesso','sync_token_at'];
    protected $hidden = ['password'];
    protected $casts = [
        'ultimo_acesso' => 'datetime',
        'filiais_acesso' => 'array',
        'sync_token_at' => 'datetime',
    ];

    protected static function boot()
    {
        parent::boot();
        static::creating(function ($m) {
            $m->id_user ??= (string) Str::uuid();
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

    public static function filiaisPadrao(): array
    {
        return ['Matriz', 'Viana'];
    }

    public static function normalizarFiliais($filiais): array
    {
        if (!is_array($filiais)) {
            return static::filiaisPadrao();
        }

        $permitidas = static::filiaisPadrao();
        $normalizadas = [];
        foreach ($filiais as $filial) {
            foreach ($permitidas as $permitida) {
                if (mb_strtolower(trim((string) $filial)) === mb_strtolower($permitida)) {
                    $normalizadas[] = $permitida;
                    break;
                }
            }
        }

        return array_values(array_unique($normalizadas)) ?: static::filiaisPadrao();
    }

    public function filiaisAcesso(): array
    {
        return static::normalizarFiliais($this->filiais_acesso ?? static::filiaisPadrao());
    }

    public function getJWTIdentifier() { return $this->getKey(); }
    public function getJWTCustomClaims() { return ['tipo' => $this->tipo]; }
}
