<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Str;

class ConferenciaVipeImportacao extends Model
{
    protected $table = 'conferencia_vipe_importacoes';

    protected $primaryKey = 'id_conferencia';

    public $incrementing = false;

    protected $keyType = 'string';

    protected $guarded = [];

    protected $casts = [
        'proprietarios' => 'array',
        'placas_outros_proprietarios' => 'array',
        'periodo_inicio' => 'date',
        'periodo_fim' => 'date',
        'placas_cadastradas' => 'integer',
        'linhas_arquivo' => 'integer',
        'linhas_vipe' => 'integer',
        'linhas_ignoradas_formato' => 'integer',
        'linhas_outros_proprietarios' => 'integer',
        'created_at' => 'datetime',
        'updated_at' => 'datetime',
    ];

    protected static function booted(): void
    {
        static::creating(function (self $model) {
            $model->id_conferencia ??= (string) Str::uuid();
        });
    }

    public function itens(): HasMany
    {
        return $this->hasMany(
            ConferenciaVipeItem::class,
            'id_conferencia',
            'id_conferencia',
        );
    }
}
