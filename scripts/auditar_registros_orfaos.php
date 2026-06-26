<?php

use App\Models\Abastecimento;
use App\Models\Motorista;
use App\Models\Veiculo;
use Illuminate\Contracts\Console\Kernel;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

require __DIR__ . '/../backend/vendor/autoload.php';

$app = require __DIR__ . '/../backend/bootstrap/app.php';
$app->make(Kernel::class)->bootstrap();

$abastecimentos = Abastecimento::query()
    ->with(['veiculo:id_veiculo,placa,id_proprietario', 'proprietario:id_proprietario,nome', 'motorista:id_motorista,nome,id_proprietario'])
    ->where(function ($q) {
        $q->whereNull('id_proprietario')
            ->orWhere('id_proprietario', '')
            ->orWhereNull('id_motorista')
            ->orWhere('id_motorista', '')
            ->orWhereNull('id_veiculo')
            ->orWhere('id_veiculo', '')
            ->orWhereDoesntHave('proprietario')
            ->orWhereDoesntHave('motorista')
            ->orWhereDoesntHave('veiculo');
    })
    ->when(Schema::hasColumn('abastecimentos', 'deleted_at'), fn ($q) => $q->whereNull('deleted_at'))
    ->orderByDesc('data')
    ->limit(300)
    ->get()
    ->map(fn ($a) => [
        'id_abastecimento' => $a->id_abastecimento,
        'data' => optional($a->data)->format('Y-m-d') ?? (string) $a->data,
        'data_hora' => optional($a->data_hora)->format('Y-m-d H:i:s') ?? (string) $a->data_hora,
        'id_proprietario' => $a->id_proprietario,
        'proprietario_nome' => $a->proprietario?->nome ?? $a->nome_proprietario,
        'id_motorista' => $a->id_motorista,
        'motorista_nome' => $a->motorista?->nome ?? $a->nome_motorista,
        'id_veiculo' => $a->id_veiculo,
        'placa' => $a->veiculo?->placa ?? $a->placa1,
        'litros' => $a->quantidade_litros,
        'valor_total' => $a->valor_total,
        'status' => $a->status,
        'local' => $a->local,
        'problemas' => array_values(array_filter([
            empty($a->id_proprietario) ? 'sem id_proprietario' : null,
            $a->id_proprietario && !$a->proprietario ? 'proprietario inexistente' : null,
            empty($a->id_motorista) ? 'sem id_motorista' : null,
            $a->id_motorista && !$a->motorista ? 'motorista inexistente' : null,
            empty($a->id_veiculo) ? 'sem id_veiculo/placa' : null,
            $a->id_veiculo && !$a->veiculo ? 'veiculo inexistente' : null,
        ])),
    ]);

$veiculos = Veiculo::query()
    ->with('proprietario:id_proprietario,nome')
    ->where(function ($q) {
        $q->whereNull('id_proprietario')
            ->orWhere('id_proprietario', '')
            ->orWhereDoesntHave('proprietario');
    })
    ->when(Schema::hasColumn('veiculos', 'deleted_at'), fn ($q) => $q->whereNull('deleted_at'))
    ->orderBy('placa')
    ->limit(300)
    ->get()
    ->map(fn ($v) => [
        'id_veiculo' => $v->id_veiculo,
        'placa' => $v->placa,
        'id_proprietario' => $v->id_proprietario,
        'proprietario_nome' => $v->proprietario?->nome,
        'tipo_combustivel' => $v->tipo_combustivel,
        'local' => $v->local,
        'problema' => empty($v->id_proprietario) ? 'sem id_proprietario' : 'proprietario inexistente',
    ]);

$motoristas = Motorista::query()
    ->with('proprietario:id_proprietario,nome')
    ->where(function ($q) {
        $q->whereNull('id_proprietario')
            ->orWhere('id_proprietario', '')
            ->orWhereDoesntHave('proprietario');
    })
    ->when(Schema::hasColumn('motoristas', 'deleted_at'), fn ($q) => $q->whereNull('deleted_at'))
    ->orderBy('nome')
    ->limit(300)
    ->get()
    ->map(fn ($m) => [
        'id_motorista' => $m->id_motorista,
        'nome' => $m->nome,
        'apelido' => $m->apelido ?? null,
        'id_proprietario' => $m->id_proprietario,
        'proprietario_nome' => $m->proprietario?->nome,
        'documento' => $m->documento,
        'celular' => $m->celular,
        'local' => $m->local,
        'problema' => empty($m->id_proprietario) ? 'sem id_proprietario' : 'proprietario inexistente',
    ]);

echo json_encode([
    'resumo' => [
        'abastecimentos_com_problema' => $abastecimentos->count(),
        'veiculos_sem_proprietario' => $veiculos->count(),
        'motoristas_sem_empresa_responsavel' => $motoristas->count(),
    ],
    'abastecimentos' => $abastecimentos,
    'veiculos' => $veiculos,
    'motoristas' => $motoristas,
], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE) . PHP_EOL;
