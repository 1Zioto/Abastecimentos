<?php
// app/Models/Proprietario.php
namespace App\Models;

use App\Models\Concerns\SerializesDatesInAppTimezone;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Str;
use Illuminate\Support\Facades\Schema;

class Proprietario extends Model
{
    use SerializesDatesInAppTimezone;

    private static ?bool $hasSyncTokenColumn = null;
    protected $table = 'proprietarios';
    protected $primaryKey = 'id_proprietario';
    public $incrementing = false;
    protected $keyType = 'string';
    public $timestamps = false;

    protected $fillable = [
        'id_proprietario',
        'nome',
        'status',
        'responsavel',
        'celular',
        'observacao',
        'data_registro',
        'local',
        'odometro_obrigatorio',
        'limite_financeiro',
        'limite_litros',
        'bloqueio_automatico',
        'alerta_limite_percentual',
        'sync_token_at',
    ];
    protected $casts = [
        'data_registro' => 'datetime',
        'odometro_obrigatorio' => 'boolean',
        'limite_financeiro' => 'decimal:2',
        'limite_litros' => 'decimal:2',
        'bloqueio_automatico' => 'boolean',
        'alerta_limite_percentual' => 'decimal:2',
        'sync_token_at' => 'datetime',
    ];

    protected static function boot()
    {
        parent::boot();
        static::creating(function ($m) {
            $m->id_proprietario ??= (string) Str::uuid();
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

    public function veiculos() { return $this->hasMany(Veiculo::class,'id_proprietario','id_proprietario'); }
    public function motoristas() { return $this->hasMany(Motorista::class,'id_proprietario','id_proprietario'); }
    public function abastecimentos() { return $this->hasMany(Abastecimento::class,'id_proprietario','id_proprietario'); }
}
