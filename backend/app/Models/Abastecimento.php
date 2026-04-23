<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Str;

class Abastecimento extends Model
{
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
        'status1',
        'placa1',
        'recebedor',
        'observacao',
        'anexo',
    ];

    protected $casts = [
        'data' => 'date',
        'data_hora' => 'datetime',
        'quantidade_litros' => 'decimal:2',
        'valor_por_litro' => 'decimal:3',
        'valor_total' => 'decimal:2',
        'valor' => 'decimal:2',
        'odometro' => 'integer',
        'lancado_sofit' => 'boolean',
        'selecionado' => 'boolean',
        'lancado_api' => 'boolean',
        'baixa_abastecimento' => 'boolean',
        'data_baixa' => 'datetime',
        'created_at' => 'datetime',
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
        });
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
