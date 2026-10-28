<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Str;

/**
 * Parâmetro configurável do sistema (preço do diesel, consumo esperado,
 * custo-hora do motorista, margem desejada, rateio de fixos, etc.).
 * Nenhum cálculo financeiro usa valores hard-coded — todos vêm daqui.
 */
class SystemParameter extends Model
{
    protected $table = 'system_parameters';
    public $incrementing = false;
    protected $keyType = 'string';

    protected $fillable = [
        'id', 'company_id', 'chave', 'valor', 'tipo',
        'descricao', 'vigencia_inicio', 'vigencia_fim', 'updated_by',
    ];

    protected $casts = [
        'valor' => 'array',
        'vigencia_inicio' => 'datetime',
        'vigencia_fim' => 'datetime',
    ];

    protected static function boot()
    {
        parent::boot();
        static::creating(function ($m) {
            $m->id ??= (string) Str::uuid();
        });
    }

    /**
     * Lê um parâmetro por chave (com fallback default), respeitando a empresa
     * e a vigência. Retorna o valor escalar guardado em ['v' => ...].
     */
    public static function valor(string $chave, $default = null, ?string $companyId = null)
    {
        $q = static::query()->where('chave', $chave);
        if ($companyId) {
            $q->where(function ($w) use ($companyId) {
                $w->where('company_id', $companyId)->orWhereNull('company_id');
            })->orderByRaw('company_id IS NULL'); // empresa específica tem prioridade
        }
        $now = now();
        $registro = $q->get()->first(function ($p) use ($now) {
            $okIni = !$p->vigencia_inicio || $p->vigencia_inicio <= $now;
            $okFim = !$p->vigencia_fim || $p->vigencia_fim >= $now;
            return $okIni && $okFim;
        });
        if (!$registro) return $default;
        $valor = $registro->valor;
        return is_array($valor) && array_key_exists('v', $valor) ? $valor['v'] : $valor;
    }
}
