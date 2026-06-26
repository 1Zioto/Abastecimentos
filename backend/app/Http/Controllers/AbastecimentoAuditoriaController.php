<?php

namespace App\Http\Controllers;

use App\Models\Abastecimento;
use App\Models\ValoresCombustivel;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class AbastecimentoAuditoriaController extends Controller
{
    private function garantirColunasAuditoriaAbastecimentos(): void
    {
        DB::statement('ALTER TABLE abastecimentos ADD COLUMN IF NOT EXISTS auditoria_auditado_por_id VARCHAR(120) NULL');
        DB::statement('ALTER TABLE abastecimentos ADD COLUMN IF NOT EXISTS auditoria_auditado_por VARCHAR(160) NULL');
        DB::statement('ALTER TABLE abastecimentos ADD COLUMN IF NOT EXISTS auditoria_auditado_em TIMESTAMP NULL');
    }

    private function filiaisPermitidas(): array
    {
        $user = auth()->user();
        if (!$user) {
            abort(401, 'Não autenticado.');
        }

        return method_exists($user, 'filiaisAcesso') ? $user->filiaisAcesso() : ['Matriz', 'Viana'];
    }

    private function normalizarTexto(?string $valor): string
    {
        return trim(mb_strtoupper((string) $valor));
    }

    private function dataAbastecimento(Abastecimento $abastecimento): string
    {
        $raw = $abastecimento->data_hora ?? $abastecimento->data ?? null;
        if ($raw instanceof \DateTimeInterface) {
            return $raw->format('Y-m-d');
        }

        try {
            return (new \DateTimeImmutable((string) $raw))->format('Y-m-d');
        } catch (\Throwable) {
            return substr((string) ($abastecimento->data ?? ''), 0, 10);
        }
    }

    private function timestampOrdenacao(Abastecimento $abastecimento): int
    {
        $raw = $abastecimento->data_hora ?? $abastecimento->data ?? null;
        if ($raw instanceof \DateTimeInterface) {
            return $raw->getTimestamp();
        }

        return strtotime((string) $raw) ?: 0;
    }

    private function precoEsperado(?string $tipo, ?string $local, string $data, array &$cache): ?float
    {
        $tipo = trim((string) $tipo);
        $local = trim((string) $local);
        if ($tipo === '' || $local === '') {
            return null;
        }

        $key = mb_strtolower($local . '|' . $tipo . '|' . $data);
        if (array_key_exists($key, $cache)) {
            return $cache[$key];
        }

        $query = ValoresCombustivel::query()
            ->whereRaw('LOWER(tipo_combustivel) = LOWER(?)', [$tipo])
            ->whereRaw('LOWER(local) = LOWER(?)', [$local])
            ->whereDate('data', '<=', $data)
            ->orderByDesc('data');

        if ($this->tabelaTemColuna('valores_combustivel', 'sync_token_at')) {
            $query->orderByDesc('sync_token_at');
        }

        $valor = $query->orderByDesc('id_valor')->value('valor');

        if ($valor === null) {
            $fallback = ValoresCombustivel::query()
                ->whereRaw('LOWER(tipo_combustivel) = LOWER(?)', [$tipo])
                ->whereRaw('LOWER(local) = LOWER(?)', [$local])
                ->orderByDesc('data');

            if ($this->tabelaTemColuna('valores_combustivel', 'sync_token_at')) {
                $fallback->orderByDesc('sync_token_at');
            }

            $valor = $fallback->orderByDesc('id_valor')->value('valor');
        }

        $cache[$key] = $valor === null ? null : (float) $valor;
        return $cache[$key];
    }

    private function suspeita(string $tipo, string $severidade, string $mensagem, array $meta = []): array
    {
        return [
            'tipo' => $tipo,
            'severidade' => $severidade,
            'mensagem' => $mensagem,
            'meta' => $meta,
        ];
    }

    public function index(Request $request): JsonResponse
    {
        $this->garantirColunasAuditoriaAbastecimentos();

        $limit = max(1, min((int) $request->get('limit', 1000), 2000));
        $query = Abastecimento::query()
            ->with([
                'veiculo:id_veiculo,placa,id_proprietario,local,odometro',
                'motorista:id_motorista,nome,id_proprietario,local',
                'proprietario:id_proprietario,nome,status,local',
            ]);

        $this->aplicarFiltroLocalPermitido($query, 'abastecimentos', $this->filiaisPermitidas(), $request->query('local'));
        $this->aplicarFiltroAtivos($query, 'abastecimentos', $request);

        if ($request->filled('data_inicio')) {
            $query->whereDate('data', '>=', $request->query('data_inicio'));
        }
        if ($request->filled('data_fim')) {
            $query->whereDate('data', '<=', $request->query('data_fim'));
        }
        if ($request->filled('placa')) {
            $placa = trim((string) $request->query('placa'));
            $query->whereHas('veiculo', fn ($q) => $q->where('placa', 'ilike', '%' . $placa . '%'));
        }
        if (!$request->boolean('incluir_auditados')) {
            $query->whereNull('auditoria_auditado_em');
        }

        $abastecimentos = $query
            ->orderByDesc('data_hora')
            ->limit($limit)
            ->get()
            ->sortBy(fn (Abastecimento $item) => $this->timestampOrdenacao($item))
            ->values();

        $duplicados = [];
        foreach ($abastecimentos as $abastecimento) {
            $placa = $this->normalizarTexto($abastecimento->veiculo?->placa ?? $abastecimento->placa1 ?? null);
            $quantidade = number_format((float) $abastecimento->quantidade_litros, 2, '.', '');
            $key = $this->normalizarTexto($abastecimento->local) . '|' . $placa . '|' . $quantidade . '|' . $this->dataAbastecimento($abastecimento);
            if ($placa !== '') {
                $duplicados[$key] ??= [];
                $duplicados[$key][] = $abastecimento->id_abastecimento;
            }
        }

        $duplicados = array_filter($duplicados, fn (array $ids) => count($ids) > 1);
        $maiorOdometroPorVeiculo = [];
        $precoCache = [];
        $resultado = [];
        $contagemTipos = [];

        foreach ($abastecimentos as $abastecimento) {
            $suspeitas = [];
            $data = $this->dataAbastecimento($abastecimento);
            $placa = $this->normalizarTexto($abastecimento->veiculo?->placa ?? $abastecimento->placa1 ?? null);
            $quantidade = number_format((float) $abastecimento->quantidade_litros, 2, '.', '');
            $duplicateKey = $this->normalizarTexto($abastecimento->local) . '|' . $placa . '|' . $quantidade . '|' . $data;

            if (isset($duplicados[$duplicateKey])) {
                $suspeitas[] = $this->suspeita(
                    'duplicado',
                    'alta',
                    'Mesma placa, quantidade, filial e data aparecem mais de uma vez.',
                    ['ids' => array_values($duplicados[$duplicateKey])]
                );
            }

            $veiculoId = (string) ($abastecimento->id_veiculo ?? '');
            $odometro = $abastecimento->odometro === null ? null : (int) $abastecimento->odometro;
            if ($veiculoId !== '' && $odometro !== null && $odometro > 0) {
                $ultimo = $maiorOdometroPorVeiculo[$veiculoId] ?? null;
                if ($ultimo !== null && $odometro <= $ultimo['odometro']) {
                    $suspeitas[] = $this->suspeita(
                        'km_menor',
                        'alta',
                        "Odômetro {$odometro} não é maior que o registro anterior {$ultimo['odometro']} para a mesma placa.",
                        ['registro_anterior' => $ultimo['id_abastecimento'], 'km_anterior' => $ultimo['odometro']]
                    );
                }
                if ($ultimo === null || $odometro > $ultimo['odometro']) {
                    $maiorOdometroPorVeiculo[$veiculoId] = [
                        'odometro' => $odometro,
                        'id_abastecimento' => $abastecimento->id_abastecimento,
                    ];
                }
            }

            $precoEsperado = $this->precoEsperado($abastecimento->tipo_combustivel, $abastecimento->local, $data, $precoCache);
            $precoLancado = $abastecimento->valor_por_litro === null ? null : (float) $abastecimento->valor_por_litro;
            if ($precoEsperado !== null && $precoLancado !== null && abs($precoLancado - $precoEsperado) > 0.01) {
                $suspeitas[] = $this->suspeita(
                    'valor_filial',
                    'alta',
                    'Valor por litro não bate com o preço vigente da filial.',
                    ['lancado' => $precoLancado, 'esperado' => $precoEsperado]
                );
            }

            if (mb_strtolower(trim((string) $abastecimento->status)) === 'inconsistente') {
                $suspeitas[] = $this->suspeita(
                    'imagem_incompativel',
                    'alta',
                    'Análise da imagem marcou o abastecimento como inconsistente.'
                );
            }

            $bomba = trim((string) $abastecimento->bomba);
            if ($bomba === '' || !preg_match('/^https?:\/\//i', $bomba)) {
                $suspeitas[] = $this->suspeita(
                    'sem_foto',
                    'alta',
                    'Abastecimento sem foto da bomba online vinculada.'
                );
            }

            if (!$abastecimento->veiculo) {
                $suspeitas[] = $this->suspeita('vinculo_divergente', 'alta', 'Veículo vinculado não foi encontrado.');
            }
            if (!$abastecimento->motorista) {
                $suspeitas[] = $this->suspeita('vinculo_divergente', 'alta', 'Motorista vinculado não foi encontrado.');
            }
            if (!$abastecimento->proprietario) {
                $suspeitas[] = $this->suspeita('vinculo_divergente', 'alta', 'Proprietário vinculado não foi encontrado.');
            }
            if ($abastecimento->veiculo && $abastecimento->veiculo->id_proprietario !== $abastecimento->id_proprietario) {
                $suspeitas[] = $this->suspeita('vinculo_divergente', 'alta', 'Veículo pertence a outro proprietário.');
            }
            if ($abastecimento->motorista && $abastecimento->motorista->id_proprietario !== $abastecimento->id_proprietario) {
                $suspeitas[] = $this->suspeita('vinculo_divergente', 'alta', 'Motorista pertence a outro proprietário.');
            }
            if ($placa !== '' && trim((string) $abastecimento->placa1) !== '' && $placa !== $this->normalizarTexto($abastecimento->placa1)) {
                $suspeitas[] = $this->suspeita('vinculo_divergente', 'media', 'Placa digitada difere da placa do veículo vinculado.');
            }

            $tipoFiltro = trim((string) $request->query('tipo'));
            if ($tipoFiltro !== '') {
                $suspeitas = array_values(array_filter(
                    $suspeitas,
                    fn (array $suspeita) => $suspeita['tipo'] === $tipoFiltro
                ));
            }

            if ($suspeitas === []) {
                continue;
            }

            foreach ($suspeitas as $suspeita) {
                $contagemTipos[$suspeita['tipo']] = ($contagemTipos[$suspeita['tipo']] ?? 0) + 1;
            }

            $resultado[] = [
                'abastecimento' => $abastecimento,
                'suspeitas' => $suspeitas,
            ];
        }

        usort($resultado, function (array $a, array $b) {
            $aTime = $this->timestampOrdenacao($a['abastecimento']);
            $bTime = $this->timestampOrdenacao($b['abastecimento']);
            return $bTime <=> $aTime;
        });

        return new JsonResponse([
            'resumo' => [
                'total' => count($resultado),
                'por_tipo' => $contagemTipos,
            ],
            'data' => $resultado,
        ]);
    }

    public function marcarAuditado(Request $request, string $id): JsonResponse
    {
        $this->garantirColunasAuditoriaAbastecimentos();

        $query = Abastecimento::query()->where('id_abastecimento', $id);
        $this->aplicarFiltroLocalPermitido($query, 'abastecimentos', $this->filiaisPermitidas(), null);
        $this->aplicarFiltroAtivos($query, 'abastecimentos', $request);

        /** @var Abastecimento $abastecimento */
        $abastecimento = $query->firstOrFail();
        $user = auth()->user();
        $payload = [
            'auditoria_auditado_por_id' => (string) ($user?->id_user ?? $user?->id ?? ''),
            'auditoria_auditado_por' => trim((string) ($user?->nome ?? $user?->login ?? 'Administrador')),
            'auditoria_auditado_em' => now(),
        ];

        $this->registrarAlteracoes($abastecimento, $payload);
        $abastecimento->forceFill($payload)->save();

        return new JsonResponse([
            'message' => 'Item marcado como auditado.',
            'data' => $abastecimento->fresh(['veiculo', 'motorista', 'proprietario']),
        ]);
    }
}
