<?php
// =============================================
// ProprietarioController.php
// =============================================
namespace App\Http\Controllers;

use App\Models\Proprietario;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class ProprietarioController extends Controller
{
    private function garantirColunasProprietarios(): void
    {
        $this->garantirColunasAuditoria('proprietarios');
        if (!$this->tabelaTemColuna('proprietarios', 'local')) {
            DB::statement('ALTER TABLE proprietarios ADD COLUMN IF NOT EXISTS local VARCHAR(40) NULL');
        }
        if (!$this->tabelaTemColuna('proprietarios', 'odometro_obrigatorio')) {
            DB::statement('ALTER TABLE proprietarios ADD COLUMN IF NOT EXISTS odometro_obrigatorio BOOLEAN NOT NULL DEFAULT FALSE');
        }
        DB::statement('ALTER TABLE proprietarios ADD COLUMN IF NOT EXISTS limite_financeiro NUMERIC(14,2) NULL');
        DB::statement('ALTER TABLE proprietarios ADD COLUMN IF NOT EXISTS limite_litros NUMERIC(14,2) NULL');
        DB::statement('ALTER TABLE proprietarios ADD COLUMN IF NOT EXISTS bloqueio_automatico BOOLEAN NOT NULL DEFAULT FALSE');
        DB::statement('ALTER TABLE proprietarios ADD COLUMN IF NOT EXISTS alerta_limite_percentual NUMERIC(5,2) NOT NULL DEFAULT 80');
        DB::statement('ALTER TABLE proprietarios ADD COLUMN IF NOT EXISTS preco_custo_automatico BOOLEAN NOT NULL DEFAULT FALSE');
    }

    private function filiaisPermitidas(): array
    {
        $user = auth()->user();
        if (!$user) {
            abort(401, 'Não autenticado.');
        }
        return method_exists($user, 'filiaisAcesso') ? $user->filiaisAcesso() : ['Matriz', 'Viana'];
    }

    private function aplicarFiltroFilial($query, Request $request)
    {
        return $this->aplicarFiltroLocalPermitido(
            $query,
            'proprietarios',
            $this->filiaisPermitidas(),
            $request->query('local')
        );
    }

    private function validarAcessoFilial(string $local): void
    {
        if (!in_array($local, $this->filiaisPermitidas(), true)) {
            abort(403, 'Usuário sem acesso a esta filial.');
        }
    }

    private function limiteRules(): array
    {
        return [
            'limite_financeiro' => 'nullable|numeric|min:0',
            'limite_litros' => 'nullable|numeric|min:0',
            'bloqueio_automatico' => 'nullable|boolean',
            'alerta_limite_percentual' => 'nullable|numeric|min:1|max:100',
            'preco_custo_automatico' => 'nullable|boolean',
        ];
    }

    private function normalizarLimites(array &$data): void
    {
        foreach (['limite_financeiro', 'limite_litros', 'alerta_limite_percentual'] as $campo) {
            if (!array_key_exists($campo, $data)) {
                continue;
            }
            if ($data[$campo] === null || trim((string) $data[$campo]) === '') {
                $data[$campo] = $campo === 'alerta_limite_percentual' ? 80 : null;
            }
        }

        if (array_key_exists('bloqueio_automatico', $data)) {
            $data['bloqueio_automatico'] = filter_var($data['bloqueio_automatico'], FILTER_VALIDATE_BOOLEAN) ? 'true' : 'false';
        }

        if (array_key_exists('preco_custo_automatico', $data)) {
            $data['preco_custo_automatico'] = filter_var($data['preco_custo_automatico'], FILTER_VALIDATE_BOOLEAN) ? 'true' : 'false';
        }
    }

    private function ocultarLimitesSeNaoAdmin(Proprietario $proprietario): Proprietario
    {
        if (auth()->user()?->tipo !== 'admin') {
            $proprietario->makeHidden([
                'limite_financeiro',
                'limite_litros',
                'bloqueio_automatico',
                'alerta_limite_percentual',
                'preco_custo_automatico',
                'limites_resumo',
            ]);
        }

        return $proprietario;
    }

    private function resumoLimites(Proprietario $proprietario): array
    {
        $query = DB::table('abastecimentos')
            ->where('id_proprietario', $proprietario->id_proprietario);

        $this->aplicarFiltroAtivos($query, 'abastecimentos', request());

        if ($this->tabelaTemColuna('abastecimentos', 'baixa_abastecimento')) {
            $query->where(function ($q) {
                $q->whereRaw('baixa_abastecimento = false')
                    ->orWhereNull('baixa_abastecimento');
            });
        }

        $pendenteValor = (float) (clone $query)->sum('valor_total');
        $pendenteLitros = (float) (clone $query)->sum('quantidade_litros');
        $limiteFinanceiro = $proprietario->limite_financeiro !== null ? (float) $proprietario->limite_financeiro : null;
        $limiteLitros = $proprietario->limite_litros !== null ? (float) $proprietario->limite_litros : null;
        $alertaPercentual = (float) ($proprietario->alerta_limite_percentual ?? 80);

        $percentualFinanceiro = $limiteFinanceiro && $limiteFinanceiro > 0 ? ($pendenteValor / $limiteFinanceiro) * 100 : null;
        $percentualLitros = $limiteLitros && $limiteLitros > 0 ? ($pendenteLitros / $limiteLitros) * 100 : null;
        $estourado = ($percentualFinanceiro !== null && $percentualFinanceiro > 100)
            || ($percentualLitros !== null && $percentualLitros > 100);
        $alerta = !$estourado && (
            ($percentualFinanceiro !== null && $percentualFinanceiro >= $alertaPercentual)
            || ($percentualLitros !== null && $percentualLitros >= $alertaPercentual)
        );

        return [
            'pendente_valor' => round($pendenteValor, 2),
            'pendente_litros' => round($pendenteLitros, 2),
            'limite_financeiro' => $limiteFinanceiro,
            'limite_litros' => $limiteLitros,
            'alerta_limite_percentual' => $alertaPercentual,
            'percentual_financeiro' => $percentualFinanceiro === null ? null : round($percentualFinanceiro, 2),
            'percentual_litros' => $percentualLitros === null ? null : round($percentualLitros, 2),
            'situacao' => $estourado ? 'estourado' : ($alerta ? 'alerta' : 'normal'),
        ];
    }

    public function index(Request $request)
    {
        $this->garantirColunasProprietarios();
        $query = Proprietario::query();
        $this->aplicarFiltroFilial($query, $request);
        $this->aplicarFiltroAtivos($query, 'proprietarios', $request);
        $this->aplicarFiltroSyncToken($query, $request, 'proprietarios');
        if ($request->filled('search')) {
            $query->where('nome', 'ilike', '%'.$request->search.'%');
        }
        if ($request->filled('status')) {
            $query->where('status', $request->status);
        }
        if ($this->suportaSyncIncremental($request, 'proprietarios')) {
            $result = $query->orderBy('sync_token_at')->orderBy('id_proprietario')->paginate($request->get('per_page', 50));
        } else {
            $result = $query->orderBy('nome')->paginate($request->get('per_page', 50));
        }
        if ($request->boolean('with_limites') && auth()->user()?->tipo === 'admin') {
            $result->getCollection()->transform(function (Proprietario $proprietario) {
                $proprietario->setAttribute('limites_resumo', $this->resumoLimites($proprietario));
                return $proprietario;
            });
        }
        $result->getCollection()->transform(fn (Proprietario $proprietario) => $this->ocultarLimitesSeNaoAdmin($proprietario));
        return new \Illuminate\Http\JsonResponse($result);
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'nome'        => 'required|string|max:255',
            'status'      => 'nullable|string',
            'responsavel' => 'nullable|string',
            'celular'     => 'nullable|string',
            'observacao'  => 'nullable|string',
            'local'       => 'nullable|string|in:Matriz,Viana',
            'odometro_obrigatorio' => 'nullable|boolean',
            ...$this->limiteRules(),
        ]);
        $this->garantirColunasProprietarios();
        $data['local'] = trim((string) ($data['local'] ?? '')) ?: ($this->filiaisPermitidas()[0] ?? 'Matriz');
        $data['status'] = ucfirst(mb_strtolower(trim((string) ($data['status'] ?? 'Ativo')) ?: 'Ativo'));
        $data['odometro_obrigatorio'] = filter_var($data['odometro_obrigatorio'] ?? false, FILTER_VALIDATE_BOOLEAN) ? 'true' : 'false';
        if (auth()->user()?->tipo !== 'admin') {
            unset($data['limite_financeiro'], $data['limite_litros'], $data['bloqueio_automatico'], $data['alerta_limite_percentual'], $data['preco_custo_automatico']);
        }
        $this->normalizarLimites($data);
        $this->validarAcessoFilial($data['local']);
        $existing = Proprietario::query()
            ->whereRaw('LOWER(nome) = LOWER(?)', [trim((string) $data['nome'])])
            ->when(
                $this->tabelaTemColuna('proprietarios', 'local'),
                fn ($q) => $q->whereRaw('LOWER(local) = LOWER(?)', [$data['local']])
            )
            ->first();
        if ($existing) {
            return new \Illuminate\Http\JsonResponse($this->ocultarLimitesSeNaoAdmin($existing));
        }
        $data['data_registro'] = now();
        return new \Illuminate\Http\JsonResponse($this->ocultarLimitesSeNaoAdmin(Proprietario::create($data)), 201);
    }

    public function show(string $id)
    {
        $this->garantirColunasProprietarios();
        $proprietario = Proprietario::with(['veiculos','motoristas'])->findOrFail($id);
        $this->validarAcessoFilial((string) $proprietario->local);
        return new \Illuminate\Http\JsonResponse($this->ocultarLimitesSeNaoAdmin($proprietario));
    }

    public function update(Request $request, string $id)
    {
        $proprietario = Proprietario::findOrFail($id);
        $this->validarAcessoFilial((string) $proprietario->local);
        $data = $request->validate([
            'nome'        => 'sometimes|string|max:255',
            'status'      => 'nullable|string',
            'responsavel' => 'nullable|string',
            'celular'     => 'nullable|string',
            'observacao'  => 'nullable|string',
            'local'       => 'nullable|string|in:Matriz,Viana',
            'odometro_obrigatorio' => 'nullable|boolean',
            ...$this->limiteRules(),
        ]);
        $this->garantirColunasProprietarios();
        if (array_key_exists('local', $data)) {
            $data['local'] = trim((string) ($data['local'] ?? '')) ?: $proprietario->local;
            $this->validarAcessoFilial($data['local']);
        }
        if (array_key_exists('odometro_obrigatorio', $data)) {
            $data['odometro_obrigatorio'] = filter_var($data['odometro_obrigatorio'], FILTER_VALIDATE_BOOLEAN) ? 'true' : 'false';
        }
        if (auth()->user()?->tipo !== 'admin') {
            unset($data['limite_financeiro'], $data['limite_litros'], $data['bloqueio_automatico'], $data['alerta_limite_percentual'], $data['preco_custo_automatico']);
        }
        $this->normalizarLimites($data);
        $this->registrarAlteracoes($proprietario, $data);
        $proprietario->update($data);
        return new \Illuminate\Http\JsonResponse($proprietario->fresh());
    }

    public function bloquear(Request $request, string $id)
    {
        $data = $request->validate([
            'observacao' => 'nullable|string',
        ]);

        $proprietario = Proprietario::findOrFail($id);
        $this->validarAcessoFilial((string) $proprietario->local);
        $data = [
            'status' => 'Bloqueado',
            'observacao' => $data['observacao'] ?? $proprietario->observacao,
        ];
        $this->registrarAlteracoes($proprietario, $data);
        $proprietario->update($data);

        return new \Illuminate\Http\JsonResponse($proprietario->fresh());
    }

    public function desbloquear(string $id)
    {
        $proprietario = Proprietario::findOrFail($id);
        $this->validarAcessoFilial((string) $proprietario->local);
        $data = ['status' => 'Ativo'];
        $this->registrarAlteracoes($proprietario, $data);
        $proprietario->update($data);

        return new \Illuminate\Http\JsonResponse($proprietario->fresh());
    }

    public function destroy(string $id)
    {
        $proprietario = Proprietario::findOrFail($id);
        $this->validarAcessoFilial((string) $proprietario->local);
        return $this->inativarRegistro($proprietario, 'Proprietário inativado');
    }

    public function restore(string $id)
    {
        $proprietario = Proprietario::findOrFail($id);
        $this->validarAcessoFilial((string) $proprietario->local);
        return $this->restaurarRegistro($proprietario, 'Proprietário restaurado');
    }
}
