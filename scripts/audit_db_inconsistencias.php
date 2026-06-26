<?php

require __DIR__ . '/../backend/vendor/autoload.php';
$app = require __DIR__ . '/../backend/bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

function auditActiveQuery(string $table, string $alias)
{
    return DB::table("$table as $alias")->whereNull("$alias.deleted_at");
}

function auditRows($query, int $limit = 200)
{
    return $query->limit($limit)->get();
}

function auditCount($query): int
{
    return (int) DB::query()->fromSub($query, 'x')->count();
}

function auditRoundedTotalExpr(string $litrosExpr, string $valorExpr): string
{
    return "FLOOR(ROUND((COALESCE($litrosExpr, 0) * COALESCE($valorExpr, 0))::numeric, 2) + 0.5)";
}

$report = [
    'gerado_em' => date('c'),
    'modo' => 'somente leitura; nenhum dado alterado',
    'totais' => [],
    'resumo' => [],
    'achados' => [],
];

$tables = [
    'abastecimentos',
    'veiculos',
    'motoristas',
    'proprietarios',
    'valores_combustivel',
    'entrada_notas',
    'usuarios',
    'despesas_avulsas',
    'encerrantes_bomba',
];

foreach ($tables as $table) {
    if (!Schema::hasTable($table)) {
        continue;
    }
    $query = DB::table($table);
    $total = (clone $query)->count();
    $ativos = Schema::hasColumn($table, 'deleted_at')
        ? (clone $query)->whereNull('deleted_at')->count()
        : $total;
    $report['totais'][$table] = [
        'total' => $total,
        'ativos' => $ativos,
        'inativos' => $total - $ativos,
    ];
}

$add = function (string $key, string $titulo, $query, int $limit = 100) use (&$report) {
    $count = auditCount(clone $query);
    $report['resumo'][$key] = $count;
    $report['achados'][$key] = [
        'titulo' => $titulo,
        'total' => $count,
        'amostra_limite' => $limit,
        'items' => auditRows($query, $limit),
    ];
};

$baseAb = auditActiveQuery('abastecimentos', 'a');

$add(
    'abastecimentos_sem_veiculo',
    'Abastecimentos ativos sem veículo válido',
    (clone $baseAb)
        ->leftJoin('veiculos as v', 'v.id_veiculo', '=', 'a.id_veiculo')
        ->where(function ($q) {
            $q->whereNull('a.id_veiculo')
                ->orWhere('a.id_veiculo', '')
                ->orWhereNull('v.id_veiculo')
                ->orWhereNotNull('v.deleted_at');
        })
        ->select([
            'a.id_abastecimento',
            'a.data_hora',
            'a.local',
            'a.placa1',
            'a.id_veiculo',
            'a.nome_proprietario',
            'a.nome_motorista',
            'a.quantidade_litros',
            'a.status',
        ])
        ->orderByDesc('a.data_hora')
);

$add(
    'abastecimentos_sem_motorista',
    'Abastecimentos ativos sem motorista válido',
    (clone $baseAb)
        ->leftJoin('motoristas as m', 'm.id_motorista', '=', 'a.id_motorista')
        ->where(function ($q) {
            $q->whereNull('a.id_motorista')
                ->orWhere('a.id_motorista', '')
                ->orWhereNull('m.id_motorista')
                ->orWhereNotNull('m.deleted_at');
        })
        ->select([
            'a.id_abastecimento',
            'a.data_hora',
            'a.local',
            'a.id_motorista',
            'a.nome_motorista',
            'a.placa1',
            'a.quantidade_litros',
            'a.status',
        ])
        ->orderByDesc('a.data_hora')
);

$add(
    'abastecimentos_sem_proprietario',
    'Abastecimentos ativos sem proprietário válido',
    (clone $baseAb)
        ->leftJoin('proprietarios as p', 'p.id_proprietario', '=', 'a.id_proprietario')
        ->where(function ($q) {
            $q->whereNull('a.id_proprietario')
                ->orWhere('a.id_proprietario', '')
                ->orWhereNull('p.id_proprietario')
                ->orWhereNotNull('p.deleted_at');
        })
        ->select([
            'a.id_abastecimento',
            'a.data_hora',
            'a.local',
            'a.id_proprietario',
            'a.nome_proprietario',
            'a.nome_motorista',
            'a.placa1',
            'a.quantidade_litros',
            'a.status',
        ])
        ->orderByDesc('a.data_hora')
);

$add(
    'abastecimentos_sem_bomba',
    'Abastecimentos ativos sem anexo da bomba',
    (clone $baseAb)
        ->where(function ($q) {
            $q->whereNull('a.bomba')
                ->orWhereRaw("TRIM(COALESCE(a.bomba,'')) = ''");
        })
        ->select([
            'a.id_abastecimento',
            'a.data_hora',
            'a.local',
            'a.nome_proprietario',
            'a.nome_motorista',
            'a.placa1',
            'a.quantidade_litros',
            'a.status',
        ])
        ->orderByDesc('a.data_hora')
);

$add(
    'abastecimentos_campos_numericos_invalidos',
    'Abastecimentos ativos com litros/preços/totais inválidos',
    (clone $baseAb)
        ->where(function ($q) {
            $q->whereNull('a.quantidade_litros')
                ->orWhere('a.quantidade_litros', '<=', 0)
                ->orWhereNull('a.valor_por_litro')
                ->orWhere('a.valor_por_litro', '<', 0)
                ->orWhereNull('a.valor_total')
                ->orWhere('a.valor_total', '<', 0);
        })
        ->select([
            'a.id_abastecimento',
            'a.data_hora',
            'a.local',
            'a.quantidade_litros',
            'a.valor_por_litro',
            'a.valor_total',
            'a.status',
        ])
        ->orderByDesc('a.data_hora')
);

$expectedTotal = auditRoundedTotalExpr('a.quantidade_litros', 'a.valor_por_litro');
$add(
    'abastecimentos_total_divergente_regra_arredondamento',
    'Abastecimentos ativos cujo total não bate com a regra atual de arredondamento',
    (clone $baseAb)
        ->whereRaw("ABS(COALESCE(a.valor_total,0) - $expectedTotal) >= 0.01")
        ->selectRaw(
            "a.id_abastecimento, a.data_hora, a.local, a.placa1, a.nome_proprietario, " .
            "a.nome_motorista, a.quantidade_litros, a.valor_por_litro, a.valor_total, " .
            "$expectedTotal as valor_total_esperado, " .
            "(COALESCE(a.valor_total,0) - $expectedTotal) as diferenca, a.status"
        )
        ->orderByDesc('a.data_hora'),
    200
);

$currentPricesSql = "
    SELECT DISTINCT ON (LOWER(tipo_combustivel), LOWER(local))
        tipo_combustivel, local, valor, data, sync_token_at, id_valor
    FROM valores_combustivel
    WHERE deleted_at IS NULL
    ORDER BY LOWER(tipo_combustivel), LOWER(local), data DESC, sync_token_at DESC NULLS LAST, id_valor DESC
";

$add(
    'abastecimentos_preco_diferente_preco_vigente_atual',
    'Abastecimentos ativos com valor/L diferente do preço vigente atual da filial/tipo',
    DB::table('abastecimentos as a')
        ->leftJoin(DB::raw("($currentPricesSql) as pc"), function ($join) {
            $join->on(DB::raw('LOWER(pc.tipo_combustivel)'), '=', DB::raw('LOWER(a.tipo_combustivel)'))
                ->on(DB::raw('LOWER(pc.local)'), '=', DB::raw('LOWER(a.local)'));
        })
        ->whereNull('a.deleted_at')
        ->where(function ($q) {
            $q->whereNull('pc.valor')
                ->orWhereRaw('ROUND(CAST(a.valor_por_litro AS numeric), 2) <> ROUND(CAST(pc.valor AS numeric), 2)');
        })
        ->selectRaw(
            'a.id_abastecimento, a.data_hora, a.local, a.placa1, a.nome_proprietario, ' .
            'a.nome_motorista, a.tipo_combustivel, a.quantidade_litros, a.valor_por_litro, ' .
            'pc.valor as valor_vigente_atual, a.valor_total, a.status'
        )
        ->orderByDesc('a.data_hora'),
    200
);

$add(
    'abastecimentos_possiveis_duplicados',
    'Possíveis abastecimentos duplicados: mesma placa/motorista/litros/local no mesmo dia',
    DB::table('abastecimentos as a')
        ->leftJoin('veiculos as v', 'v.id_veiculo', '=', 'a.id_veiculo')
        ->whereNull('a.deleted_at')
        ->selectRaw(
            "a.data, a.local, COALESCE(NULLIF(v.placa,''), NULLIF(a.placa1,''), a.id_veiculo) as placa, " .
            "a.id_motorista, a.nome_motorista, a.quantidade_litros, COUNT(*) as total, " .
            "STRING_AGG(a.id_abastecimento, ', ' ORDER BY a.data_hora) as ids, " .
            "MIN(a.data_hora) as primeira_data_hora, MAX(a.data_hora) as ultima_data_hora"
        )
        ->groupByRaw(
            "a.data, a.local, COALESCE(NULLIF(v.placa,''), NULLIF(a.placa1,''), a.id_veiculo), " .
            "a.id_motorista, a.nome_motorista, a.quantidade_litros"
        )
        ->havingRaw('COUNT(*) > 1')
        ->orderByDesc('ultima_data_hora')
);

$odometerSql = "
    SELECT
        a.id_abastecimento,
        a.id_veiculo,
        COALESCE(v.placa, a.placa1) as placa,
        a.data_hora,
        a.local,
        a.nome_motorista,
        a.odometro,
        LAG(a.odometro) OVER (PARTITION BY a.id_veiculo ORDER BY a.data_hora, a.id_abastecimento) as odometro_anterior,
        LAG(a.id_abastecimento) OVER (PARTITION BY a.id_veiculo ORDER BY a.data_hora, a.id_abastecimento) as id_anterior
    FROM abastecimentos a
    LEFT JOIN veiculos v ON v.id_veiculo = a.id_veiculo
    WHERE a.deleted_at IS NULL AND a.odometro IS NOT NULL AND a.id_veiculo IS NOT NULL
";

$add(
    'abastecimentos_odometro_retrocesso',
    'Abastecimentos com odômetro menor ou igual ao anterior da mesma placa',
    DB::table(DB::raw("($odometerSql) as o"))
        ->whereNotNull('o.odometro_anterior')
        ->whereRaw('o.odometro <= o.odometro_anterior')
        ->select([
            'o.id_abastecimento',
            'o.id_anterior',
            'o.placa',
            'o.data_hora',
            'o.local',
            'o.nome_motorista',
            'o.odometro_anterior',
            'o.odometro',
        ])
        ->orderByDesc('o.data_hora')
);

$add(
    'veiculos_sem_proprietario',
    'Veículos ativos sem proprietário válido',
    auditActiveQuery('veiculos', 'v')
        ->leftJoin('proprietarios as p', 'p.id_proprietario', '=', 'v.id_proprietario')
        ->where(function ($q) {
            $q->whereNull('v.id_proprietario')
                ->orWhere('v.id_proprietario', '')
                ->orWhereNull('p.id_proprietario')
                ->orWhereNotNull('p.deleted_at');
        })
        ->select(['v.id_veiculo', 'v.placa', 'v.local', 'v.id_proprietario', 'v.tipo_combustivel', 'v.status'])
        ->orderBy('v.placa')
);

$add(
    'motoristas_sem_proprietario',
    'Motoristas ativos sem empresa/proprietário válido',
    auditActiveQuery('motoristas', 'm')
        ->leftJoin('proprietarios as p', 'p.id_proprietario', '=', 'm.id_proprietario')
        ->where(function ($q) {
            $q->whereNull('m.id_proprietario')
                ->orWhere('m.id_proprietario', '')
                ->orWhereNull('p.id_proprietario')
                ->orWhereNotNull('p.deleted_at');
        })
        ->select(['m.id_motorista', 'm.nome', 'm.apelido', 'm.local', 'm.id_proprietario', 'm.status'])
        ->orderBy('m.nome')
);

$add(
    'veiculos_placa_duplicada',
    'Placas duplicadas em veículos ativos',
    auditActiveQuery('veiculos', 'v')
        ->whereRaw("TRIM(COALESCE(v.placa,'')) <> ''")
        ->selectRaw(
            "UPPER(REPLACE(v.placa, '-', '')) as placa_normalizada, COUNT(*) as total, " .
            "STRING_AGG(v.id_veiculo, ', ') as ids, STRING_AGG(COALESCE(v.local,''), ', ') as locais"
        )
        ->groupByRaw("UPPER(REPLACE(v.placa, '-', ''))")
        ->havingRaw('COUNT(*) > 1')
        ->orderBy('placa_normalizada')
);

$add(
    'motoristas_nome_duplicado',
    'Nomes de motoristas duplicados em cadastros ativos',
    auditActiveQuery('motoristas', 'm')
        ->whereRaw("TRIM(COALESCE(m.nome,'')) <> ''")
        ->selectRaw(
            "UPPER(TRIM(m.nome)) as nome_normalizado, COUNT(*) as total, " .
            "STRING_AGG(m.id_motorista, ', ') as ids, STRING_AGG(COALESCE(m.local,''), ', ') as locais"
        )
        ->groupByRaw("UPPER(TRIM(m.nome))")
        ->havingRaw('COUNT(*) > 1')
        ->orderBy('nome_normalizado'),
    200
);

$add(
    'proprietarios_nome_duplicado',
    'Nomes de proprietários duplicados em cadastros ativos',
    auditActiveQuery('proprietarios', 'p')
        ->whereRaw("TRIM(COALESCE(p.nome,'')) <> ''")
        ->selectRaw(
            "UPPER(TRIM(p.nome)) as nome_normalizado, COUNT(*) as total, " .
            "STRING_AGG(p.id_proprietario, ', ') as ids, STRING_AGG(COALESCE(p.local,''), ', ') as locais"
        )
        ->groupByRaw("UPPER(TRIM(p.nome))")
        ->havingRaw('COUNT(*) > 1')
        ->orderBy('nome_normalizado')
);

$add(
    'entrada_notas_anexo_ausente',
    'Entradas de nota ativas sem foto/anexo da nota',
    auditActiveQuery('entrada_notas', 'e')
        ->where(function ($q) {
            $q->whereNull('e.foto_nota')
                ->orWhereRaw("TRIM(COALESCE(e.foto_nota,'')) = ''");
        })
        ->select([
            'e.id_financeiro',
            'e.data_hora',
            'e.data',
            'e.local',
            'e.numero_nota_fiscal',
            'e.quantidade',
            'e.valor',
            'e.valor_litro',
            'e.responsavel',
            'e.status',
        ])
        ->orderByDesc('e.data_hora')
);

$add(
    'entrada_notas_valor_divergente',
    'Entradas de nota cujo valor não bate com quantidade x valor/litro',
    auditActiveQuery('entrada_notas', 'e')
        ->whereRaw('ABS(COALESCE(e.valor,0) - ROUND((COALESCE(e.quantidade,0) * COALESCE(e.valor_litro,0))::numeric, 2)) >= 0.01')
        ->selectRaw(
            'e.id_financeiro, e.data_hora, e.data, e.local, e.numero_nota_fiscal, e.quantidade, ' .
            'e.valor_litro, e.valor, ROUND((COALESCE(e.quantidade,0) * COALESCE(e.valor_litro,0))::numeric, 2) as valor_esperado, ' .
            '(COALESCE(e.valor,0) - ROUND((COALESCE(e.quantidade,0) * COALESCE(e.valor_litro,0))::numeric, 2)) as diferenca, e.responsavel, e.status'
        )
        ->orderByDesc('e.data_hora')
);

$add(
    'precos_combustivel_duplicados_mesmo_instante',
    'Preços duplicados para mesma filial/tipo/data',
    auditActiveQuery('valores_combustivel', 'vc')
        ->selectRaw(
            "vc.local, vc.tipo_combustivel, vc.data, COUNT(*) as total, " .
            "STRING_AGG(vc.valor::text, ', ' ORDER BY vc.valor) as valores, STRING_AGG(vc.id_valor, ', ') as ids"
        )
        ->groupBy('vc.local', 'vc.tipo_combustivel', 'vc.data')
        ->havingRaw('COUNT(*) > 1')
        ->orderByDesc('vc.data')
);

$add(
    'precos_combustivel_filial_tipo_sem_preco',
    'Filiais/tipos usados em abastecimento sem preço ativo cadastrado correspondente',
    DB::table('abastecimentos as a')
        ->leftJoin('valores_combustivel as vc', function ($join) {
            $join->on(DB::raw('LOWER(vc.tipo_combustivel)'), '=', DB::raw('LOWER(a.tipo_combustivel)'))
                ->on(DB::raw('LOWER(vc.local)'), '=', DB::raw('LOWER(a.local)'))
                ->whereNull('vc.deleted_at');
        })
        ->whereNull('a.deleted_at')
        ->selectRaw('a.local, a.tipo_combustivel, COUNT(*) as abastecimentos')
        ->groupBy('a.local', 'a.tipo_combustivel')
        ->havingRaw('COUNT(vc.id_valor) = 0')
        ->orderBy('a.local')
);

$add(
    'usuarios_sem_filial_acesso',
    'Usuários ativos sem filiais de acesso configuradas',
    auditActiveQuery('usuarios', 'u')
        ->where(function ($q) {
            $q->whereNull('u.filiais_acesso')
                ->orWhereRaw("jsonb_array_length(COALESCE(u.filiais_acesso, '[]'::jsonb)) = 0");
        })
        ->select(['u.id_user', 'u.nome', 'u.login', 'u.tipo', 'u.filiais_acesso', 'u.status'])
        ->orderBy('u.nome')
);

foreach (['abastecimentos', 'veiculos', 'motoristas', 'proprietarios', 'valores_combustivel', 'entrada_notas', 'despesas_avulsas', 'encerrantes_bomba'] as $table) {
    if (!Schema::hasTable($table) || !Schema::hasColumn($table, 'local')) {
        continue;
    }
    $add(
        $table . '_local_invalido',
        "{$table}: local fora de Matriz/Viana em registros ativos",
        DB::table($table)
            ->whereNull('deleted_at')
            ->where(function ($q) {
                $q->whereNull('local')
                    ->orWhereNotIn('local', ['Matriz', 'Viana']);
            })
            ->select('*')
            ->orderBy('local'),
        50
    );
}

$reportPath = __DIR__ . '/../outputs/auditoria_inconsistencias_banco_' . date('Ymd_His') . '.json';
if (!is_dir(dirname($reportPath))) {
    mkdir(dirname($reportPath), 0777, true);
}
file_put_contents($reportPath, json_encode($report, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));

$nonZero = [];
foreach ($report['achados'] as $key => $entry) {
    if (($entry['total'] ?? 0) > 0) {
        $nonZero[$key] = [
            'titulo' => $entry['titulo'],
            'total' => $entry['total'],
        ];
    }
}

echo json_encode([
    'relatorio' => realpath($reportPath),
    'totais' => $report['totais'],
    'achados_com_inconsistencias' => $nonZero,
], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE), PHP_EOL;
