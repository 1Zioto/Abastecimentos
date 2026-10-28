<?php

namespace App\Models;

use App\Models\Concerns\SerializesDatesInAppTimezone;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

class Abastecimento extends Model
{
    use SerializesDatesInAppTimezone;

    private static ?bool $hasSyncTokenColumn = null;
    protected $table = 'abastecimentos';
    protected $primaryKey = 'id_abastecimento';
    public $incrementing = false;
    protected $keyType = 'string';

    protected $fillable = [
        'id_abastecimento',
        'data',
        'data_hora',
        'frentista',
        'id_veiculo',
        'id_motorista',
        'id_proprietario',
        'nome_motorista',
        'nome_proprietario',
        'local',
        'tipo_combustivel',
        'quantidade_litros',
        'valor_por_litro',
        'valor_total',
        'odometro',
        'foto_odometro',
        'bomba',
        'status',
        'imagem_verificada_por_id',
        'imagem_verificada_por',
        'imagem_verificada_em',
        'auditoria_auditado_por_id',
        'auditoria_auditado_por',
        'auditoria_auditado_em',
        'lancado_sofit',
        'selecionado',
        'lancado_api',
        'motorista_nome_corrigido',
        'baixa_abastecimento',
        'controle',
        'data_baixa',
        'tipo_despesa',
        'descricao',
        'valor',
        'placa1',
        'recebedor',
        'valor_recebedor1',
        'recebedor2',
        'valor_recebedor2',
        'observacao',
        'anexo',
        'sync_token_at',
        'atua_seq',
        'atua_id',
        'atua_nr_nota',
        'atua_caixa',
        'atua_enviado_em',
        'atua_erro',
    ];

    protected $casts = [
        'data' => 'date',
        'data_hora' => 'datetime',
        'quantidade_litros' => 'decimal:2',
        'valor_por_litro' => 'decimal:3',
        'valor_total' => 'decimal:2',
        'valor' => 'decimal:2',
        'valor_recebedor1' => 'decimal:2',
        'valor_recebedor2' => 'decimal:2',
        'odometro' => 'integer',
        'lancado_sofit' => 'boolean',
        'selecionado' => 'boolean',
        'lancado_api' => 'boolean',
        'baixa_abastecimento' => 'boolean',
        'data_baixa' => 'datetime',
        'imagem_verificada_em' => 'datetime',
        'auditoria_auditado_em' => 'datetime',
        'created_at' => 'datetime',
        'sync_token_at' => 'datetime',
    ];

    public $timestamps = false;

    protected static function boot()
    {
        parent::boot();
        static::creating(function ($model) {
            if (empty($model->id_abastecimento)) {
                $model->id_abastecimento = (string) Str::uuid();
            }
            if (empty($model->created_at)) {
                $model->created_at = now();
            }
            if (static::supportsSyncToken()) {
                $model->sync_token_at = now();
            }
            static::atribuirIdentificadorAtua($model);
        });
        static::updating(function ($model) {
            if (static::supportsSyncToken()) {
                $model->sync_token_at = now();
            }
        });
    }

    /**
     * Identificador sequencial do abastecimento no padrão "Vipe-000000".
     *
     * O número da sequência é usado como `nrNota` na integração com a Atua
     * (que exige inteiro e deduplica por ele), e o texto "Vipe-XXXXXX" vai no
     * campo descritivo do lançamento. Assim o mesmo abastecimento reenviado
     * nunca duplica — o número é estável desde a criação.
     */
    private static function atribuirIdentificadorAtua($model): void
    {
        if (!empty($model->atua_seq)) {
            return;
        }

        try {
            if (!Schema::hasColumn((new static)->getTable(), 'atua_seq')) {
                return;
            }
            $seq = (int) \Illuminate\Support\Facades\DB::selectOne(
                "SELECT nextval('abastecimentos_atua_seq') AS seq"
            )->seq;
            $model->atua_seq = $seq;
            $model->atua_id = 'Vipe-' . str_pad((string) $seq, 6, '0', STR_PAD_LEFT);
            // Número enviado à Atua. Igual à sequência no primeiro envio; ganha
            // um número novo se o lançamento for excluído na Atua e reenviado
            // (a Atua deduplica por nrNota e ignoraria o mesmo número).
            $model->atua_nr_nota = $seq;
        } catch (\Throwable) {
            // Não pode impedir a gravação do abastecimento.
        }
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

    public function veiculo()
    {
        return $this->belongsTo(Veiculo::class, 'id_veiculo', 'id_veiculo');
    }

    public function motorista()
    {
        return $this->belongsTo(Motorista::class, 'id_motorista', 'id_motorista');
    }

    public function proprietario()
    {
        return $this->belongsTo(Proprietario::class, 'id_proprietario', 'id_proprietario');
    }

    public function baixas()
    {
        return $this->hasMany(BaixaAbastecimento::class, 'id_abastecimento', 'id_abastecimento');
    }
}
