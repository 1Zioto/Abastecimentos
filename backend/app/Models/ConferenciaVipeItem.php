<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Str;

class ConferenciaVipeItem extends Model
{
    protected $table = 'conferencia_vipe_itens';

    protected $primaryKey = 'id_item';

    public $incrementing = false;

    protected $keyType = 'string';

    protected $guarded = [];

    protected $casts = [
        'data' => 'date',
        'data_hora' => 'datetime',
        'abastecimento_data' => 'date',
        'abastecimento_data_hora' => 'datetime',
        'valor_relatorio' => 'decimal:2',
        'quantidade_relatorio' => 'decimal:2',
        'abastecimento_quantidade' => 'decimal:2',
        'abastecimento_valor_por_litro' => 'decimal:3',
        'abastecimento_valor_total' => 'decimal:2',
        'diferenca_valor' => 'decimal:2',
        'diferenca_quantidade' => 'decimal:2',
        'checado' => 'boolean',
        'checado_em' => 'datetime',
        'created_at' => 'datetime',
        'updated_at' => 'datetime',
    ];

    protected static function booted(): void
    {
        static::creating(function (self $model) {
            $model->id_item ??= (string) Str::uuid();
        });
    }

    public function importacao(): BelongsTo
    {
        return $this->belongsTo(
            ConferenciaVipeImportacao::class,
            'id_conferencia',
            'id_conferencia',
        );
    }
}
