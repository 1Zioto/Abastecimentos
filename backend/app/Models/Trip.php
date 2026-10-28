<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Viagem — unidade central de rentabilidade. Cada viagem tem receitas e custos
 * e produz uma demonstração financeira (resultado_json) calculada pelo
 * App\Services\TripResultService.
 */
class Trip extends Model
{
    use SoftDeletes;

    protected $table = 'trips';
    public $incrementing = false;
    protected $keyType = 'string';

    protected $fillable = [
        'id', 'company_id', 'branch_id', 'numero',
        'client_id', 'vehicle_id', 'trailer_id', 'driver_id', 'route_id', 'product_id',
        'origem', 'destino',
        'previsao_saida', 'saida_real', 'previsao_chegada', 'chegada_real',
        'peso_kg', 'quantidade', 'tipo_carga',
        'km_inicial', 'km_final', 'km_carregado', 'km_vazio',
        'status', 'cte_numero', 'mdfe_numero',
        'margem_desejada_pct', 'custo_fixo_diario',
        'resultado_json', 'observacao',
    ];

    protected $casts = [
        'previsao_saida' => 'datetime',
        'saida_real' => 'datetime',
        'previsao_chegada' => 'datetime',
        'chegada_real' => 'datetime',
        'peso_kg' => 'decimal:2',
        'quantidade' => 'decimal:2',
        'km_inicial' => 'decimal:2',
        'km_final' => 'decimal:2',
        'km_carregado' => 'decimal:2',
        'km_vazio' => 'decimal:2',
        'margem_desejada_pct' => 'decimal:2',
        'custo_fixo_diario' => 'decimal:2',
        'resultado_json' => 'array',
    ];

    public const STATUSES = [
        'planejada', 'aguardando_veiculo', 'aguardando_motorista',
        'deslocamento_coleta', 'em_carregamento', 'em_viagem', 'parada',
        'em_descarga', 'finalizada', 'cancelada', 'com_ocorrencia', 'em_analise_financeira',
    ];

    protected static function boot()
    {
        parent::boot();
        static::creating(function ($m) {
            $m->id ??= (string) Str::uuid();
            if (empty($m->numero)) {
                $max = DB::table('trips')->max('numero');
                $m->numero = ($max ?? 0) + 1;
            }
        });
    }

    public function revenues() { return $this->hasMany(TripRevenue::class, 'trip_id'); }
    public function costs()    { return $this->hasMany(TripCost::class, 'trip_id'); }
    public function veiculo()  { return $this->belongsTo(Veiculo::class, 'vehicle_id', 'id_veiculo'); }
    public function motorista(){ return $this->belongsTo(Motorista::class, 'driver_id', 'id_motorista'); }
}
