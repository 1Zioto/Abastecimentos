<?php
namespace App\Models;
use App\Models\Concerns\SerializesDatesInAppTimezone;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Str;
use Illuminate\Support\Facades\Schema;

class EntradaNota extends Model
{
    use SerializesDatesInAppTimezone;

    private static ?bool $hasSyncTokenColumn = null;
    protected $table = 'entrada_notas';
    protected $primaryKey = 'id_financeiro';
    public $incrementing = false; protected $keyType = 'string'; public $timestamps = false;
    protected $fillable = ['id_financeiro','data','data_hora','numero_nota_fiscal','valor','quantidade','valor_litro','custo_transporte_litro','custo_transporte_total','valor_compra_final','responsavel','foto_nota','tipo','local','fornecedor','fornecedor_ia_status','fornecedor_ia_mensagem','fornecedor_ia_extraido','fornecedor_confirmado','nota_verificacao_status','nota_verificacao_mensagem','nota_verificacao_tipo','nota_verificacao_confianca','nota_verificada_em','sync_token_at','paga'];
    protected $casts = ['data' => 'date','data_hora' => 'datetime','valor' => 'decimal:2','quantidade' => 'decimal:2','valor_litro' => 'decimal:3','custo_transporte_litro' => 'decimal:3','custo_transporte_total' => 'decimal:2','valor_compra_final' => 'decimal:2','nota_verificacao_confianca' => 'decimal:3','nota_verificada_em' => 'datetime', 'fornecedor_confirmado' => 'boolean', 'sync_token_at' => 'datetime', 'paga' => 'boolean'];
    protected static function boot()
    {
        parent::boot();
        static::creating(function ($m) {
            $m->id_financeiro ??= (string) Str::uuid();
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
