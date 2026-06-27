<?php

namespace App\Http\Controllers;

use App\Models\Abastecimento;
use App\Models\EncerranteBomba;
use App\Models\EntradaNota;
use App\Models\Proprietario;
use App\Models\ValoresCombustivel;
use App\Models\Veiculo;
use Carbon\CarbonImmutable;
use Carbon\CarbonInterface;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use Barryvdh\DomPDF\Facade\Pdf;

class AbastecimentoController extends Controller
{
    private const ENCERRANTE_HORA_PADRAO = '07:00';
    private const ENCERRANTE_DIA_OBRIGATORIO = CarbonInterface::SATURDAY;

    private function filiaisPermitidas(): array
    {
        $user = auth()->user();
        if (!$user) {
            abort(401, 'Não autenticado.');
        }
        return method_exists($user, 'filiaisAcesso') ? $user->filiaisAcesso() : ['Matriz', 'Viana'];
    }

    private function aplicarFiltroFiliais($query, Request $request)
    {
        return $this->aplicarFiltroLocalPermitido(
            $query,
            'abastecimentos',
            $this->filiaisPermitidas(),
            $request->query('local')
        );
    }

    private function validarAcessoFilial(string $local): void
    {
        if (!in_array($local, $this->filiaisPermitidas(), true)) {
            throw ValidationException::withMessages([
                'local' => 'Usuário sem acesso a esta filial.',
            ]);
        }
    }

    private function garantirSchemaEncerrante(): void
    {
        DB::statement(<<<'SQL'
            CREATE TABLE IF NOT EXISTS configuracoes_sistema (
                chave VARCHAR(120) PRIMARY KEY,
                valor TEXT NULL,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        SQL);

        DB::statement(<<<'SQL'
            CREATE TABLE IF NOT EXISTS encerrantes_bomba (
                id_encerrante VARCHAR(120) PRIMARY KEY,
                data DATE NOT NULL,
                local VARCHAR(80) NOT NULL,
                quantidade_tanque NUMERIC(12,2) NOT NULL,
                litros_bomba NUMERIC(12,2) NOT NULL,
                foto TEXT NOT NULL,
                usuario_id VARCHAR(120) NULL,
                usuario_nome VARCHAR(255) NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                sync_token_at TIMESTAMP NULL,
                deleted_at TIMESTAMP NULL,
                deleted_by VARCHAR(255) NULL,
                deleted_by_id VARCHAR(120) NULL
            )
        SQL);

        DB::table('configuracoes_sistema')->insertOrIgnore([
            [
                'chave' => 'encerrante_bomba_hora',
                'valor' => self::ENCERRANTE_HORA_PADRAO,
                'updated_at' => now(),
            ],
        ]);
    }

    private function horaObrigatoriaEncerrante(): string
    {
        $this->garantirSchemaEncerrante();
        $valor = DB::table('configuracoes_sistema')
            ->where('chave', 'encerrante_bomba_hora')
            ->value('valor');

        return preg_match('/^\d{2}:\d{2}$/', (string) $valor)
            ? (string) $valor
            : self::ENCERRANTE_HORA_PADRAO;
    }

    private function ultimoMomentoObrigatorioEncerrante(CarbonImmutable $agora, string $hora): CarbonImmutable
    {
        $momento = $agora->setTimeFromTimeString($hora . ':00');

        while ($momento->dayOfWeek !== self::ENCERRANTE_DIA_OBRIGATORIO || $momento->greaterThan($agora)) {
            $momento = $momento->subDay();
        }

        return $momento;
    }

    private function validarEncerranteObrigatorio(string $local): void
    {
        $this->garantirSchemaEncerrante();

        $tipo = strtolower((string) (auth()->user()?->tipo ?? ''));
        if (!in_array($tipo, ['admin', 'operador'], true)) {
            return;
        }

        $hora = $this->horaObrigatoriaEncerrante();
        $agora = CarbonImmutable::now(config('app.timezone', 'America/Sao_Paulo'));
        $momentoObrigatorio = $this->ultimoMomentoObrigatorioEncerrante($agora, $hora);
        if ($agora->lessThan($momentoObrigatorio)) {
            return;
        }

        $ultimoQuery = EncerranteBomba::query()
            ->where('local', $local)
            ->whereDate('data', '>=', $momentoObrigatorio->toDateString());

        if ($this->tabelaTemColuna('encerrantes_bomba', 'deleted_at')) {
            $ultimoQuery->whereNull('deleted_at');
        }

        $ultimo = $ultimoQuery
            ->orderByDesc('data')
            ->orderByDesc('created_at')
            ->first();

        if ($ultimo) {
            return;
        }

        throw ValidationException::withMessages([
            'encerrante_bomba' => [
                "Encerrante semanal pendente para {$local}. Informe o encerrante da bomba antes de registrar novo abastecimento.",
            ],
        ]);
    }

    private function garantirColunasVerificacaoImagem(): void
    {
        if (!$this->tabelaTemColuna('abastecimentos', 'id_abastecimento')) {
            return;
        }

        DB::statement('ALTER TABLE abastecimentos ADD COLUMN IF NOT EXISTS imagem_verificada_por_id VARCHAR(120) NULL');
        DB::statement('ALTER TABLE abastecimentos ADD COLUMN IF NOT EXISTS imagem_verificada_por VARCHAR(255) NULL');
        DB::statement('ALTER TABLE abastecimentos ADD COLUMN IF NOT EXISTS imagem_verificada_em TIMESTAMP NULL');
    }

    private function proprietarioEstaBloqueado(?Proprietario $proprietario): bool
    {
        return mb_strtoupper(trim((string) ($proprietario?->status ?? ''))) === 'BLOQUEADO';
    }

    private function validarProprietarioPodeAbastecer(string $idProprietario): void
    {
        $proprietario = Proprietario::query()
            ->select(['id_proprietario', 'nome', 'status', 'observacao'])
            ->findOrFail($idProprietario);

        if (!$this->proprietarioEstaBloqueado($proprietario)) {
            return;
        }

        $mensagem = 'Proprietário bloqueado. Não é possível registrar abastecimento para este proprietário.';
        $observacao = trim((string) $proprietario->observacao);
        if ($observacao !== '') {
            $mensagem .= ' Motivo: ' . $observacao;
        }

        throw ValidationException::withMessages([
            'id_proprietario' => [$mensagem],
        ]);
    }

    private function garantirColunasLimiteProprietarios(): void
    {
        if (!$this->tabelaTemColuna('proprietarios', 'id_proprietario')) {
            return;
        }

        DB::statement('ALTER TABLE proprietarios ADD COLUMN IF NOT EXISTS limite_financeiro NUMERIC(14,2) NULL');
        DB::statement('ALTER TABLE proprietarios ADD COLUMN IF NOT EXISTS limite_litros NUMERIC(14,2) NULL');
        DB::statement('ALTER TABLE proprietarios ADD COLUMN IF NOT EXISTS bloqueio_automatico BOOLEAN NOT NULL DEFAULT FALSE');
        DB::statement('ALTER TABLE proprietarios ADD COLUMN IF NOT EXISTS alerta_limite_percentual NUMERIC(5,2) NOT NULL DEFAULT 80');
        DB::statement('ALTER TABLE proprietarios ADD COLUMN IF NOT EXISTS preco_custo_automatico BOOLEAN NOT NULL DEFAULT FALSE');
    }

    private function formatarMoeda(float $valor): string
    {
        return 'R$ ' . number_format($valor, 2, ',', '.');
    }

    private function formatarLitros(float $valor): string
    {
        return number_format($valor, 2, ',', '.') . ' L';
    }

    private function validarLimiteProprietarioAbastecimento(string $idProprietario, float $litrosNovo, float $valorNovo): void
    {
        $this->garantirColunasLimiteProprietarios();

        $proprietario = Proprietario::query()
            ->select([
                'id_proprietario',
                'nome',
                'status',
                'observacao',
                'limite_financeiro',
                'limite_litros',
                'bloqueio_automatico',
            ])
            ->findOrFail($idProprietario);

        if (!$proprietario->bloqueio_automatico) {
            return;
        }

        $limiteFinanceiro = $proprietario->limite_financeiro !== null ? (float) $proprietario->limite_financeiro : null;
        $limiteLitros = $proprietario->limite_litros !== null ? (float) $proprietario->limite_litros : null;
        if (($limiteFinanceiro === null || $limiteFinanceiro <= 0) && ($limiteLitros === null || $limiteLitros <= 0)) {
            return;
        }

        $pendentes = DB::table('abastecimentos')
            ->where('id_proprietario', $idProprietario);

        $this->aplicarFiltroAtivos($pendentes, 'abastecimentos', request());

        if ($this->tabelaTemColuna('abastecimentos', 'baixa_abastecimento')) {
            $pendentes->where(function ($q) {
                $q->whereRaw('baixa_abastecimento = false')
                    ->orWhereNull('baixa_abastecimento');
            });
        }

        $valorPendente = (float) (clone $pendentes)->sum('valor_total');
        $litrosPendente = (float) (clone $pendentes)->sum('quantidade_litros');
        $valorProjetado = $valorPendente + $valorNovo;
        $litrosProjetado = $litrosPendente + $litrosNovo;
        $motivos = [];

        if ($limiteFinanceiro !== null && $limiteFinanceiro > 0 && $valorProjetado > $limiteFinanceiro) {
            $motivos[] = 'limite financeiro excedido: pendente atual '
                . $this->formatarMoeda($valorPendente)
                . ', novo abastecimento '
                . $this->formatarMoeda($valorNovo)
                . ', limite '
                . $this->formatarMoeda($limiteFinanceiro);
        }

        if ($limiteLitros !== null && $limiteLitros > 0 && $litrosProjetado > $limiteLitros) {
            $motivos[] = 'limite de litros excedido: pendente atual '
                . $this->formatarLitros($litrosPendente)
                . ', novo abastecimento '
                . $this->formatarLitros($litrosNovo)
                . ', limite '
                . $this->formatarLitros($limiteLitros);
        }

        if ($motivos === []) {
            return;
        }

        $mensagem = 'Proprietário bloqueado automaticamente por limite. ' . implode('; ', $motivos) . '.';
        $payload = [
            'status' => 'Bloqueado',
            'observacao' => trim($mensagem . ' ' . trim((string) $proprietario->observacao)),
        ];

        $this->registrarAlteracoes($proprietario, $payload);
        $proprietario->forceFill($payload)->save();

        throw ValidationException::withMessages([
            'id_proprietario' => [$mensagem],
        ]);
    }

    private function normalizarLocal(?string $local): string
    {
        $valor = trim((string) $local);
        if ($valor === '' || strcasecmp($valor, 'Garagem') === 0 || strcasecmp($valor, 'Cariacica') === 0) {
            return 'Matriz';
        }
        if (strcasecmp($valor, 'Garagem Viana') === 0) {
            return 'Viana';
        }
        return $valor;
    }

    private function normalizarDataRequest(mixed $value): mixed
    {
        if (!is_string($value)) {
            return $value;
        }

        $text = trim($value);
        if ($text === '') {
            return $value;
        }

        if (preg_match('/^(\d{4}-\d{2}-\d{2})/', $text, $matches)) {
            return $matches[1];
        }

        if (preg_match('/^(\d{2})\/(\d{2})\/(\d{4})/', $text, $matches)) {
            return "{$matches[3]}-{$matches[2]}-{$matches[1]}";
        }

        try {
            return (new \DateTimeImmutable($text))->format('Y-m-d');
        } catch (\Throwable) {
            return $value;
        }
    }

    private function normalizarDataHoraRequest(mixed $value, mixed $dateFallback = null): mixed
    {
        if (!is_string($value)) {
            return $value;
        }

        $text = trim($value);
        if ($text === '') {
            return $value;
        }

        $date = null;
        if (preg_match('/^(\d{4}-\d{2}-\d{2})/', $text, $dateMatches)) {
            $date = $dateMatches[1];
        }

        preg_match_all('/(?:^|T|\s)(\d{1,2}:\d{2}(?::\d{2})?)/', $text, $timeMatches);
        $times = $timeMatches[1] ?? [];
        $time = $times ? end($times) : null;

        if ($date !== null && $time !== null) {
            return $date . ' ' . (substr_count($time, ':') === 1 ? "{$time}:00" : $time);
        }

        $fallbackDate = $this->normalizarDataRequest($dateFallback);
        if (is_string($fallbackDate) && preg_match('/^\d{4}-\d{2}-\d{2}$/', $fallbackDate) && $time !== null) {
            return $fallbackDate . ' ' . (substr_count($time, ':') === 1 ? "{$time}:00" : $time);
        }

        try {
            return (new \DateTimeImmutable(str_replace(' ', 'T', $text)))->format('Y-m-d H:i:s');
        } catch (\Throwable) {
            return $value;
        }
    }

    private function normalizarDatasRequest(Request $request): void
    {
        $data = [];
        if ($request->has('data')) {
            $data['data'] = $this->normalizarDataRequest($request->input('data'));
        }
        if ($request->has('data_hora')) {
            $data['data_hora'] = $this->normalizarDataHoraRequest(
                $request->input('data_hora'),
                $data['data'] ?? $request->input('data')
            );
        }
        if ($data !== []) {
            $request->merge($data);
        }
    }

    private function calcularValorTotalAbastecimento(float|int|null $litros, float|int|null $valorPorLitro): float
    {
        $totalComCentavos = round(
            ((float) ($litros ?? 0) * (float) ($valorPorLitro ?? 0)),
            2,
            PHP_ROUND_HALF_UP
        );

        return (float) floor($totalComCentavos + 0.5);
    }

    private function valorCombustivelAtualPorFilial(string $tipoCombustivel, string $local): float
    {
        $query = ValoresCombustivel::query()
            ->where('tipo_combustivel', $tipoCombustivel)
            ->whereRaw('LOWER(local) = LOWER(?)', [$local])
            ->orderByDesc('data');

        if ($this->tabelaTemColuna('valores_combustivel', 'sync_token_at')) {
            $query->orderByDesc('sync_token_at');
        }

        $valor = $query->orderByDesc('id_valor')->value('valor');

        if ($valor === null) {
            throw ValidationException::withMessages([
                'valor_por_litro' => [
                    "Nenhum preço cadastrado para {$tipoCombustivel} na filial {$local}. Cadastre o preço em Tabela de Preços antes de salvar o abastecimento.",
                ],
            ]);
        }

        return (float) $valor;
    }

    /**
     * Preço de custo (por litro) para proprietários com "preço de custo automático" ativado.
     * Considera o valor da última nota fiscal de entrada (compra) para o tipo de combustível e filial informados.
     */
    private function custoUltimaEntradaNotaPorFilial(string $tipoCombustivel, string $local): float
    {
        $query = EntradaNota::query()
            ->where('tipo', $tipoCombustivel)
            ->whereRaw('LOWER(local) = LOWER(?)', [$local]);

        $this->aplicarFiltroNotasAjusteEntradaNotas($query, 'entrada_notas');

        $query->orderByDesc('data');

        if ($this->tabelaTemColuna('entrada_notas', 'sync_token_at')) {
            $query->orderByDesc('sync_token_at');
        }

        $entrada = $query->orderByDesc('id_financeiro')->first();

        if (!$entrada) {
            throw ValidationException::withMessages([
                'valor_por_litro' => [
                    "Nenhuma nota fiscal de entrada cadastrada para {$tipoCombustivel} na filial {$local}. Não é possível aplicar o preço de custo automático para este proprietário.",
                ],
            ]);
        }

        // Preço de custo = (valor da nota + custo de transporte) / quantidade de litros comprados
        $quantidade = (float) ($entrada->quantidade ?? 0);
        if ($quantidade > 0) {
            $valorCompraFinal = $entrada->valor_compra_final !== null
                ? (float) $entrada->valor_compra_final
                : round(
                    (float) ($entrada->valor ?? 0)
                    + (float) ($entrada->custo_transporte_total ?? round($quantidade * self::ENTRADA_NOTA_CUSTO_TRANSPORTE_LITRO, 2)),
                    2
                );

            return round($valorCompraFinal / $quantidade, 3);
        }

        $valorLitro = $entrada->valor_litro !== null ? (float) $entrada->valor_litro : null;
        if ($valorLitro !== null && $valorLitro > 0) {
            return round($valorLitro + (float) ($entrada->custo_transporte_litro ?? 0), 3);
        }

        throw ValidationException::withMessages([
            'valor_por_litro' => [
                "A última nota fiscal de entrada de {$tipoCombustivel} na filial {$local} não possui valores suficientes para calcular o preço de custo automático.",
            ],
        ]);
    }

    /**
     * Preview do preço de custo automático (última nota fiscal de entrada) para um tipo de
     * combustível/filial, usado pelo formulário de abastecimento ao selecionar um proprietário
     * com "preço de custo automático" ativado.
     */
    public function precoCustoAutomatico(Request $request, string $tipo)
    {
        $local = $this->normalizarLocal($request->query('local'));
        $this->validarAcessoFilial($local);

        $valor = $this->custoUltimaEntradaNotaPorFilial($tipo, $local);

        return new \Illuminate\Http\JsonResponse([
            'tipo_combustivel' => $tipo,
            'local' => $local,
            'valor' => $valor,
        ]);
    }

    private function buildComprovanteDiagnostics(Abastecimento $abastecimento): array
    {
        $rawDataHora = method_exists($abastecimento, 'getRawOriginal')
            ? $abastecimento->getRawOriginal('data_hora')
            : ($abastecimento->data_hora ?? null);

        $rawData = method_exists($abastecimento, 'getRawOriginal')
            ? $abastecimento->getRawOriginal('data')
            : ($abastecimento->data ?? null);

        return [
            'id_abastecimento' => $abastecimento->id_abastecimento,
            'id_veiculo' => $abastecimento->id_veiculo,
            'id_motorista' => $abastecimento->id_motorista,
            'id_proprietario' => $abastecimento->id_proprietario,
            'raw' => [
                'data' => $rawData,
                'data_hora' => $rawDataHora,
                'tipo_combustivel' => $abastecimento->tipo_combustivel,
                'status' => $abastecimento->status,
                'odometro' => $abastecimento->odometro,
                'quantidade_litros' => $abastecimento->quantidade_litros,
                'valor_por_litro' => $abastecimento->valor_por_litro,
                'valor_total' => $abastecimento->valor_total,
            ],
            'relations' => [
                'veiculo_loaded' => $abastecimento->relationLoaded('veiculo'),
                'motorista_loaded' => $abastecimento->relationLoaded('motorista'),
                'proprietario_loaded' => $abastecimento->relationLoaded('proprietario'),
                'veiculo_exists' => (bool) optional($abastecimento->veiculo)->id_veiculo,
                'motorista_exists' => (bool) optional($abastecimento->motorista)->id_motorista,
                'proprietario_exists' => (bool) optional($abastecimento->proprietario)->id_proprietario,
            ],
            'runtime' => [
                'php_version' => PHP_VERSION,
                'tmp_dir' => sys_get_temp_dir(),
                'dompdf_options' => $this->pdfRuntimeOptions(),
            ],
        ];
    }

    private function pdfRuntimeOptions(): array
    {
        $tmpBase = rtrim(sys_get_temp_dir(), DIRECTORY_SEPARATOR);

        return [
            'defaultFont' => 'Helvetica',
            'isHtml5ParserEnabled' => true,
            'isRemoteEnabled' => false,
            'tempDir' => $tmpBase,
            'chroot' => base_path(),
        ];
    }

    private function garantirColunaOdometroObrigatorioProprietario(): void
    {
        if ($this->tabelaTemColuna('proprietarios', 'odometro_obrigatorio')) {
            return;
        }

        \Illuminate\Support\Facades\DB::statement('ALTER TABLE proprietarios ADD COLUMN IF NOT EXISTS odometro_obrigatorio BOOLEAN NOT NULL DEFAULT FALSE');
    }

    private function proprietarioExigeOdometro(?string $idVeiculo, ?string $idProprietario = null): bool
    {
        $this->garantirColunaOdometroObrigatorioProprietario();
        $obrigatorio = null;

        if ($idVeiculo) {
            $obrigatorio = Veiculo::query()
                ->where('veiculos.id_veiculo', $idVeiculo)
                ->leftJoin('proprietarios', 'proprietarios.id_proprietario', '=', 'veiculos.id_proprietario')
                ->value('proprietarios.odometro_obrigatorio');
        }

        if ($obrigatorio === null && $idProprietario) {
            $obrigatorio = Proprietario::query()
                ->where('id_proprietario', $idProprietario)
                ->value('odometro_obrigatorio');
        }

        return filter_var($obrigatorio, FILTER_VALIDATE_BOOLEAN);
    }

    private function validarCamposObrigatoriosAbastecimento(array $data, ?Abastecimento $original = null): void
    {
        $resultado = [
            'data' => $data['data'] ?? $original?->data,
            'data_hora' => $data['data_hora'] ?? $original?->data_hora,
            'frentista' => $data['frentista'] ?? $original?->frentista,
            'id_proprietario' => $data['id_proprietario'] ?? $original?->id_proprietario,
            'id_veiculo' => $data['id_veiculo'] ?? $original?->id_veiculo,
            'id_motorista' => $data['id_motorista'] ?? $original?->id_motorista,
            'local' => $data['local'] ?? $original?->local,
            'tipo_combustivel' => $data['tipo_combustivel'] ?? $original?->tipo_combustivel,
            'quantidade_litros' => $data['quantidade_litros'] ?? $original?->quantidade_litros,
            'status' => $data['status'] ?? $original?->status,
            'odometro' => array_key_exists('odometro', $data) ? $data['odometro'] : $original?->odometro,
        ];

        $campos = [
            'data' => 'Data',
            'data_hora' => 'Data e hora',
            'frentista' => 'Frentista',
            'id_proprietario' => 'Proprietário',
            'id_veiculo' => 'Veículo',
            'id_motorista' => 'Motorista',
            'local' => 'Local',
            'tipo_combustivel' => 'Tipo de combustível',
            'status' => 'Status',
        ];

        $erros = [];
        foreach ($campos as $campo => $rotulo) {
            if (trim((string) ($resultado[$campo] ?? '')) === '') {
                $erros[$campo] = "{$rotulo} é obrigatório.";
            }
        }

        if ($resultado['quantidade_litros'] === null || (float) $resultado['quantidade_litros'] <= 0) {
            $erros['quantidade_litros'] = 'Quantidade de litros é obrigatória.';
        }

        if ($this->proprietarioExigeOdometro(
            $resultado['id_veiculo'] ? (string) $resultado['id_veiculo'] : null,
            $resultado['id_proprietario'] ? (string) $resultado['id_proprietario'] : null,
        ) && trim((string) ($resultado['odometro'] ?? '')) === '') {
            $erros['odometro'] = 'Odômetro é obrigatório para este proprietário.';
        }

        if (!empty($erros)) {
            throw ValidationException::withMessages($erros);
        }
    }

    private function validarAnexoBombaObrigatorio(array $data, ?Abastecimento $original = null): void
    {
        $bomba = array_key_exists('bomba', $data) ? $data['bomba'] : $original?->bomba;
        if (trim((string) $bomba) === '') {
            throw ValidationException::withMessages([
                'bomba' => ['Anexe a imagem da bomba antes de salvar o abastecimento.'],
            ]);
        }

        if (!$this->anexoOnlineValido($bomba)) {
            throw ValidationException::withMessages([
                'bomba' => ['A imagem da bomba ainda não foi enviada online. Aguarde o upload ou anexe a foto novamente.'],
            ]);
        }

        $fotoOdometro = array_key_exists('foto_odometro', $data) ? $data['foto_odometro'] : $original?->foto_odometro;
        if (trim((string) $fotoOdometro) !== '' && !$this->anexoOnlineValido($fotoOdometro)) {
            throw ValidationException::withMessages([
                'foto_odometro' => ['A foto do hodômetro ainda não foi enviada online. Aguarde o upload ou anexe a foto novamente.'],
            ]);
        }
    }

    private function anexoOnlineValido(mixed $value): bool
    {
        $url = trim((string) $value);
        if ($url === '' || !filter_var($url, FILTER_VALIDATE_URL)) {
            return false;
        }

        $scheme = strtolower((string) parse_url($url, PHP_URL_SCHEME));
        return in_array($scheme, ['http', 'https'], true);
    }

    private function preencherNomesRelacionados(array &$data, ?Abastecimento $original = null): void
    {
        $idProprietario = $data['id_proprietario'] ?? $original?->id_proprietario;
        if ($idProprietario && empty($data['nome_proprietario'])) {
            $data['nome_proprietario'] = Proprietario::query()
                ->where('id_proprietario', $idProprietario)
                ->value('nome');
        }

        $idMotorista = $data['id_motorista'] ?? $original?->id_motorista;
        if ($idMotorista && empty($data['nome_motorista'])) {
            $data['nome_motorista'] = \App\Models\Motorista::query()
                ->where('id_motorista', $idMotorista)
                ->value('nome');
        }
    }

    public function index(Request $request)
    {
        $this->garantirColunasAuditoria('abastecimentos');
        $this->garantirColunasVerificacaoImagem();
        $query = Abastecimento::with(['veiculo', 'motorista', 'proprietario']);
        $this->aplicarFiltroFiliais($query, $request);
        $this->aplicarFiltroAtivos($query, 'abastecimentos', $request);
        $this->aplicarFiltroSyncToken($query, $request, 'abastecimentos');

        if ($request->filled('id_proprietario')) {
            $query->where('id_proprietario', $request->id_proprietario);
        }
        if ($request->filled('id_veiculo')) {
            $query->where('id_veiculo', $request->id_veiculo);
        }
        if ($request->filled('id_motorista')) {
            $query->where('id_motorista', $request->id_motorista);
        }
        if ($request->filled('placa')) {
            $query->whereHas('veiculo', fn($q) => $q->where('placa', 'ilike', '%' . $request->placa . '%'));
        }
        if ($request->filled('data_inicio')) {
            $query->whereDate('data', '>=', $request->data_inicio);
        }
        if ($request->filled('data_fim')) {
            $query->whereDate('data', '<=', $request->data_fim);
        }
        if ($request->filled('status')) {
            $query->where('status', $request->status);
        }
        if ($request->filled('baixa') && $this->tabelaTemColuna('abastecimentos', 'baixa_abastecimento')) {
            $baixaFiltro = strtolower(trim((string) $request->baixa));
            if (in_array($baixaFiltro, ['baixado', 'baixados', 'true', '1'], true)) {
                $query->whereRaw('COALESCE(abastecimentos.baixa_abastecimento, false) = true');
            } elseif (in_array($baixaFiltro, ['pendente', 'pendentes', 'false', '0'], true)) {
                $query->whereRaw('COALESCE(abastecimentos.baixa_abastecimento, false) = false');
            }
        }
        if ($request->filled('tipo_combustivel')) {
            $query->where('tipo_combustivel', $request->tipo_combustivel);
        }
        if ($request->filled('valor_total')) {
            $raw = str_replace(['R$', ' '], '', trim((string) $request->valor_total));
            if (str_contains($raw, ',')) {
                $raw = str_replace('.', '', $raw);
                $raw = str_replace(',', '.', $raw);
            }
            if (is_numeric($raw)) {
                $query->whereRaw(
                    'ABS(COALESCE(abastecimentos.valor_total, FLOOR(COALESCE(abastecimentos.valor_por_litro, 0) * COALESCE(abastecimentos.quantidade_litros, 0) + 0.000001)) - ?) < 0.005',
                    [(float) $raw]
                );
            }
        }

        $perPage = $request->get('per_page', 20);
        if ($this->suportaSyncIncremental($request, 'abastecimentos')) {
            return new \Illuminate\Http\JsonResponse(
                $query->orderBy('sync_token_at')->orderBy('id_abastecimento')->paginate($perPage)
            );
        }

        $sortBy = (string) $request->get('sort_by', 'data_hora');
        $sortDir = strtolower((string) $request->get('sort_dir', 'desc')) === 'asc' ? 'asc' : 'desc';
        $joinedForSort = false;

        switch ($sortBy) {
            case 'placa':
                $query->leftJoin('veiculos as sort_veiculos', 'sort_veiculos.id_veiculo', '=', 'abastecimentos.id_veiculo')
                    ->select('abastecimentos.*')
                    ->orderByRaw("LOWER(COALESCE(sort_veiculos.placa, '')) {$sortDir}");
                $joinedForSort = true;
                break;
            case 'proprietario':
                $query->leftJoin('proprietarios as sort_proprietarios', 'sort_proprietarios.id_proprietario', '=', 'abastecimentos.id_proprietario')
                    ->select('abastecimentos.*')
                    ->orderByRaw("LOWER(COALESCE(abastecimentos.nome_proprietario, sort_proprietarios.nome, '')) {$sortDir}");
                $joinedForSort = true;
                break;
            case 'motorista':
                $query->leftJoin('motoristas as sort_motoristas', 'sort_motoristas.id_motorista', '=', 'abastecimentos.id_motorista')
                    ->select('abastecimentos.*')
                    ->orderByRaw("LOWER(COALESCE(abastecimentos.nome_motorista, sort_motoristas.nome, '')) {$sortDir}");
                $joinedForSort = true;
                break;
            case 'tipo_combustivel':
                $query->orderByRaw("LOWER(COALESCE(abastecimentos.tipo_combustivel, '')) {$sortDir}");
                break;
            case 'quantidade_litros':
                $query->orderBy('abastecimentos.quantidade_litros', $sortDir);
                break;
            case 'valor_por_litro':
                $query->orderBy('abastecimentos.valor_por_litro', $sortDir);
                break;
            case 'valor_total':
                $query->orderBy('abastecimentos.valor_total', $sortDir);
                break;
            case 'verificado_por':
                $query->orderByRaw("LOWER(COALESCE(abastecimentos.imagem_verificada_por, '')) {$sortDir}");
                break;
            case 'baixa':
                $query->orderBy('abastecimentos.baixa_abastecimento', $sortDir);
                break;
            case 'data_hora':
            default:
                $query->orderBy('abastecimentos.data_hora', $sortDir);
                break;
        }

        if ($sortBy !== 'data_hora') {
            $query->orderByDesc('abastecimentos.data_hora');
        }
        if (!$joinedForSort) {
            $query->select('abastecimentos.*');
        }

        return new \Illuminate\Http\JsonResponse($query->paginate($perPage));
    }

    public function store(Request $request)
    {
        $this->normalizarDatasRequest($request);

        $data = $request->validate([
            'id_abastecimento'  => 'nullable|string|max:80',
            'data'              => 'required|date',
            'data_hora'         => 'required|date',
            'frentista'         => 'nullable|string',
            'id_veiculo'        => 'required|exists:veiculos,id_veiculo',
            'id_motorista'      => 'required|exists:motoristas,id_motorista',
            'id_proprietario'   => 'required|exists:proprietarios,id_proprietario',
            'nome_motorista'    => 'nullable|string',
            'nome_proprietario' => 'nullable|string',
            'local'             => 'required|string',
            'tipo_combustivel'  => 'required|string',
            'quantidade_litros' => 'required|numeric|min:0.01',
            'odometro'          => 'nullable|numeric',
            'foto_odometro'     => 'nullable|string',
            'bomba'             => 'nullable|string',
            'status'            => 'required|string',
            'responsavel'       => 'nullable|string',
        ]);

        if (!empty($data['id_abastecimento'])) {
            $existing = Abastecimento::with(['veiculo', 'motorista', 'proprietario'])
                ->find($data['id_abastecimento']);
            if ($existing) {
                return new \Illuminate\Http\JsonResponse($existing);
            }
        }

        $data['local'] = $this->normalizarLocal($data['local'] ?? null);
        $this->validarAcessoFilial($data['local']);
        $this->validarEncerranteObrigatorio((string) $data['local']);
        $data['status'] = trim((string) ($data['status'] ?? '')) ?: 'Pendente';
        $data['frentista'] = trim((string) ($data['frentista'] ?? ''))
            ?: trim((string) ($data['responsavel'] ?? auth()->user()?->nome ?? auth()->user()?->login ?? ''));

        $this->validarProprietarioPodeAbastecer((string) $data['id_proprietario']);

        $this->preencherNomesRelacionados($data);
        $this->validarCamposObrigatoriosAbastecimento($data);
        $this->validarAnexoBombaObrigatorio($data);
        unset($data['responsavel']);

        // Buscar valor atual do combustível pela filial selecionada — NÃO pode ser alterado depois
        $this->garantirColunasLimiteProprietarios();
        $precoCustoAutomatico = filter_var(
            Proprietario::query()->where('id_proprietario', $data['id_proprietario'])->value('preco_custo_automatico'),
            FILTER_VALIDATE_BOOLEAN
        );

        $valorAtual = $precoCustoAutomatico
            ? $this->custoUltimaEntradaNotaPorFilial((string) $data['tipo_combustivel'], (string) $data['local'])
            : $this->valorCombustivelAtualPorFilial((string) $data['tipo_combustivel'], (string) $data['local']);

        $data['valor_por_litro'] = $valorAtual;
        $data['valor_total'] = $this->calcularValorTotalAbastecimento(
            $data['quantidade_litros'] ?? 0,
            $valorAtual
        );

        $this->validarLimiteProprietarioAbastecimento(
            (string) $data['id_proprietario'],
            (float) $data['quantidade_litros'],
            (float) $data['valor_total']
        );

        // Atualizar odômetro do veículo
        if (!empty($data['odometro'])) {
            Veiculo::where('id_veiculo', $data['id_veiculo'])
                ->where(function ($q) use ($data) {
                    $q->whereNull('odometro')
                        ->orWhere('odometro', '<', $data['odometro']);
                })
                ->update([
                    'odometro' => $data['odometro'],
                    'sync_token_at' => now(),
                ]);
        }

        $abastecimento = Abastecimento::create($data);

        // Move the file to the correct folder
        if (!empty($abastecimento->foto_odometro) || !empty($abastecimento->anexo) || !empty($abastecimento->bomba)) {
            try {
                $drive = app(\App\Services\GoogleDriveService::class);
                $proprietarioNome = trim((string)$data['nome_proprietario']) ?: 'Desconhecido';
                $targetFolder = $drive->resolveProprietarioFolder($proprietarioNome, 'Abastecimentos');

                if (!empty($abastecimento->foto_odometro)) {
                    $fileId = $drive->extractFileId($abastecimento->foto_odometro);
                    if ($fileId) $drive->moveFile($fileId, $targetFolder);
                }
                
                if (!empty($abastecimento->anexo)) {
                    $fileId = $drive->extractFileId($abastecimento->anexo);
                    if ($fileId) $drive->moveFile($fileId, $targetFolder);
                }

                if (!empty($abastecimento->bomba)) {
                    $fileId = $drive->extractFileId($abastecimento->bomba);
                    if ($fileId) $drive->moveFile($fileId, $targetFolder);
                }
            } catch (\Throwable $e) {
                \Illuminate\Support\Facades\Log::warning("Falha ao organizar pasta no Google Drive: " . $e->getMessage());
            }
        }

        return new \Illuminate\Http\JsonResponse($abastecimento->load(['veiculo','motorista','proprietario']), 201);
    }

    public function show(Request $request, string $id)
    {
        $this->garantirColunasVerificacaoImagem();
        $abastecimentoQuery = Abastecimento::query()
            ->with([
                'veiculo:id_veiculo,placa,modelo,tipo_combustivel,id_proprietario',
                'motorista:id_motorista,nome,id_proprietario',
                'proprietario:id_proprietario,nome',
            ]);

        if ($request->boolean('include_baixas')) {
            $abastecimentoQuery->with([
                'baixas' => fn ($q) => $q
                    ->select([
                        'id_baixa',
                        'id_abastecimento',
                        'data_hora',
                        'usuario',
                        'forma_pagamento',
                        'data_pagamento',
                        'nota_entrada',
                    ])
                    ->orderByDesc('data_hora')
                    ->limit(200),
            ]);
        }

        $this->aplicarFiltroFiliais($abastecimentoQuery, $request);
        $abastecimento = $abastecimentoQuery->findOrFail($id);
        return new \Illuminate\Http\JsonResponse($abastecimento);
    }

    public function update(Request $request, string $id)
    {
        try {
            $currentUser = auth()->user();
            if (!$currentUser || $currentUser->tipo !== 'admin') {
                return new \Illuminate\Http\JsonResponse(['message' => 'Somente administradores podem editar registros'], 403);
            }

            $this->normalizarDatasRequest($request);

            $abastecimento = Abastecimento::findOrFail($id);
            $this->validarAcessoFilial((string) $abastecimento->local);

            $data = $request->validate([
                'data'              => 'sometimes|date',
                'data_hora'         => 'sometimes|date',
                'frentista'         => 'nullable|string',
                'id_veiculo'        => 'sometimes|exists:veiculos,id_veiculo',
                'id_motorista'      => 'sometimes|required|exists:motoristas,id_motorista',
                'id_proprietario'   => 'sometimes|exists:proprietarios,id_proprietario',
                'nome_motorista'    => 'nullable|string',
                'nome_proprietario' => 'nullable|string',
                'local'             => 'sometimes|required|string',
                'tipo_combustivel'  => 'sometimes|string',
                'quantidade_litros' => 'sometimes|numeric|min:0.01',
                'odometro'          => 'nullable|numeric',
                'foto_odometro'     => 'nullable|string',
                'bomba'             => 'nullable|string',
                'status'            => 'sometimes|required|string',
                'responsavel'       => 'nullable|string',
            ]);

            // REGRA: valor_por_litro NÃO é recalculado na edição
            // Apenas recalcular valor_total se quantidade mudar, usando o valor já gravado
            if (isset($data['quantidade_litros'])) {
                $data['valor_total'] = $this->calcularValorTotalAbastecimento(
                    $data['quantidade_litros'],
                    $abastecimento->valor_por_litro
                );
            }

            // Remover campos protegidos caso venham no request
            unset($data['valor_por_litro']);
            if (array_key_exists('local', $data)) {
                $data['local'] = $this->normalizarLocal($data['local'] ?? $abastecimento->local);
                $this->validarAcessoFilial($data['local']);
            }
            if (array_key_exists('frentista', $data) && trim((string) ($data['frentista'] ?? '')) !== '') {
                $data['frentista'] = trim((string) $data['frentista']);
            } elseif (empty($abastecimento->frentista)) {
                $data['frentista'] = trim((string) ($data['responsavel'] ?? auth()->user()?->nome ?? auth()->user()?->login ?? ''));
            } else {
                unset($data['frentista']);
            }
            if (array_key_exists('id_proprietario', $data)) {
                $this->validarProprietarioPodeAbastecer((string) $data['id_proprietario']);
            }
            $this->preencherNomesRelacionados($data, $abastecimento);
            $this->validarCamposObrigatoriosAbastecimento($data, $abastecimento);
            $this->validarAnexoBombaObrigatorio($data, $abastecimento);
            unset($data['responsavel']);
            $data = $this->manterSomenteAlteracoesReais($abastecimento, $data);
            $this->registrarAlteracoes($abastecimento, $data);

            $abastecimento->update($data);

            // Move the file to the correct folder
            if (!empty($data['foto_odometro']) || !empty($data['anexo']) || !empty($data['bomba'])) {
                try {
                    $drive = app(\App\Services\GoogleDriveService::class);
                    $proprietarioNome = trim((string)$abastecimento->nome_proprietario) ?: 'Desconhecido';
                    $targetFolder = $drive->resolveProprietarioFolder($proprietarioNome, 'Abastecimentos');

                    if (!empty($data['foto_odometro'])) {
                        $fileId = $drive->extractFileId($data['foto_odometro']);
                        if ($fileId) $drive->moveFile($fileId, $targetFolder);
                    }
                    
                    if (!empty($data['anexo'])) {
                        $fileId = $drive->extractFileId($data['anexo']);
                        if ($fileId) $drive->moveFile($fileId, $targetFolder);
                    }

                    if (!empty($data['bomba'])) {
                        $fileId = $drive->extractFileId($data['bomba']);
                        if ($fileId) $drive->moveFile($fileId, $targetFolder);
                    }
                } catch (\Throwable $e) {
                    \Illuminate\Support\Facades\Log::warning("Falha ao organizar pasta no Google Drive: " . $e->getMessage());
                }
            }

            return new \Illuminate\Http\JsonResponse($abastecimento->fresh(['veiculo','motorista','proprietario']));
        } catch (\Illuminate\Database\Eloquent\ModelNotFoundException $e) {
            return new \Illuminate\Http\JsonResponse(['message' => 'Abastecimento não encontrado.'], 404);
        } catch (\Illuminate\Validation\ValidationException $e) {
            return new \Illuminate\Http\JsonResponse([
                'message' => 'Erro de validação.',
                'errors' => $e->errors()
            ], 422);
        } catch (\Throwable $e) {
            return new \Illuminate\Http\JsonResponse([
                'message' => 'Erro interno ao atualizar abastecimento: ' . $e->getMessage()
            ], 500);
        }
    }

    public function destroy(string $id)
    {
        $currentUser = auth()->user();
        if (!$currentUser || $currentUser->tipo !== 'admin') {
            return new \Illuminate\Http\JsonResponse(['message' => 'Somente administradores podem excluir abastecimentos'], 403);
        }

        $abastecimento = Abastecimento::findOrFail($id);
        $this->validarAcessoFilial((string) $abastecimento->local);
        return $this->inativarRegistro($abastecimento, 'Abastecimento inativado');
    }

    public function forceDelete(string $id)
    {
        return $this->destroy($id);
    }

    public function restore(string $id)
    {
        $currentUser = auth()->user();
        if (!$currentUser || $currentUser->tipo !== 'admin') {
            return new \Illuminate\Http\JsonResponse(['message' => 'Somente administradores podem restaurar abastecimentos'], 403);
        }

        $abastecimento = Abastecimento::findOrFail($id);
        $this->validarAcessoFilial((string) $abastecimento->local);
        return $this->restaurarRegistro($abastecimento, 'Abastecimento restaurado');
    }

    public function verificarInconsistencia(string $id): JsonResponse
    {
        $currentUser = auth()->user();
        if (!$currentUser || !in_array($currentUser->tipo, ['admin', 'operador'], true)) {
            return new JsonResponse(['message' => 'Somente administradores e operadores podem marcar abastecimentos como consistentes'], 403);
        }

        $this->garantirColunasVerificacaoImagem();
        $abastecimento = Abastecimento::findOrFail($id);
        $this->validarAcessoFilial((string) $abastecimento->local);

        if ($abastecimento->status === 'Inconsistente') {
            $abastecimento->status = 'Confirmado';
        }
        $abastecimento->imagem_verificada_por_id = (string) $currentUser->getAuthIdentifier();
        $abastecimento->imagem_verificada_por = $currentUser->nome ?? $currentUser->login ?? 'Sistema';
        $abastecimento->imagem_verificada_em = now();
        $abastecimento->save();

        return new JsonResponse($abastecimento->fresh(['veiculo', 'motorista', 'proprietario']));
    }

    public function analisarInconsistencias(string $id): JsonResponse
    {
        $currentUser = auth()->user();
        if (!$currentUser || !in_array($currentUser->tipo, ['admin', 'operador'], true)) {
            return new JsonResponse(['message' => 'Somente administradores e operadores podem verificar inconsistências'], 403);
        }

        $abastecimento = Abastecimento::with(['veiculo', 'motorista', 'proprietario'])->findOrFail($id);
        $this->validarAcessoFilial((string) $abastecimento->local);

        return new JsonResponse([
            'abastecimento' => $abastecimento,
            'analysis' => [
                'skipped' => true,
                'inconsistent' => $abastecimento->status === 'Inconsistente',
                'message' => 'A análise por IA só é executada no lançamento do abastecimento. Use marcar consistente para resolver a pendência.',
            ],
        ]);
    }

    public function pendenteBaixa(Request $request)
    {
        $limit = (int) $request->get('limit', 120);
        $limit = max(1, min($limit, 300));

        $abastecimentoColumns = [
            'id_abastecimento',
            'data',
            'data_hora',
            'id_veiculo',
            'id_motorista',
            'id_proprietario',
            'quantidade_litros',
            'valor_total',
        ];

        foreach (['nome_motorista', 'nome_proprietario', 'baixa_abastecimento', 'local', 'status'] as $column) {
            if ($this->tabelaTemColuna('abastecimentos', $column)) {
                $abastecimentoColumns[] = $column;
            }
        }

        $veiculoColumns = ['id_veiculo', 'placa'];
        if ($this->tabelaTemColuna('veiculos', 'modelo')) {
            $veiculoColumns[] = 'modelo';
        }

        $query = Abastecimento::query()
            ->select($abastecimentoColumns)
            ->with([
                'veiculo:' . implode(',', $veiculoColumns),
            ]);

        if ($this->tabelaTemColuna('abastecimentos', 'baixa_abastecimento')) {
            $query->where(function ($q) {
                $q->whereRaw('baixa_abastecimento = false')
                    ->orWhereNull('baixa_abastecimento');
            });
        }

        $this->aplicarFiltroFiliais($query, $request);

        if ($request->filled('id_proprietario')) {
            $query->where('id_proprietario', $request->id_proprietario);
        }
        if ($request->filled('placa')) {
            $query->whereHas('veiculo', fn($q) => $q->where('placa', 'ilike', '%' . $request->placa . '%'));
        }
        if ($request->filled('data_inicio')) {
            $query->whereDate('data', '>=', $request->data_inicio);
        }
        if ($request->filled('data_fim')) {
            $query->whereDate('data', '<=', $request->data_fim);
        }

        return new \Illuminate\Http\JsonResponse(
            $query->orderByDesc('data_hora')->limit($limit)->get()
        );
    }

    public function comprovante(Request $request, string $id)
    {
        $errorId = (string) Str::uuid();

        try {
            $abastecimento = Abastecimento::with(['veiculo', 'motorista', 'proprietario'])
                ->findOrFail($id);
            $this->validarAcessoFilial((string) $abastecimento->local);

            $diagnostics = $this->buildComprovanteDiagnostics($abastecimento);
            Log::info('Comprovante PDF - início', [
                'error_id' => $errorId,
                'id_abastecimento' => $id,
                'diagnostics' => $diagnostics,
            ]);

            $forcePdf = $request->boolean('pdf') || $request->query('format') === 'pdf';
            if (!$forcePdf) {
                return response()
                    ->view('pdf.comprovante', compact('abastecimento'))
                    ->header('Content-Type', 'text/html; charset=UTF-8');
            }

            $pdf = Pdf::setOption($this->pdfRuntimeOptions())
                ->loadView('pdf.comprovante', compact('abastecimento'))
                ->setPaper('a5', 'portrait');

            return $pdf->stream("comprovante_{$id}.pdf", ['Attachment' => false]);
        } catch (\Throwable $e) {
            $context = [
                'error_id' => $errorId,
                'id_abastecimento' => $id,
                'message' => $e->getMessage(),
                'trace' => $e->getTraceAsString(),
            ];

            try {
                $abastecimento = Abastecimento::with(['veiculo', 'motorista', 'proprietario'])->find($id);
                if ($abastecimento) {
                    $context['diagnostics'] = $this->buildComprovanteDiagnostics($abastecimento);
                } else {
                    $context['diagnostics'] = ['record_found' => false];
                }
            } catch (\Throwable $diagError) {
                $context['diagnostics_error'] = $diagError->getMessage();
            }

            Log::error('Erro ao gerar comprovante PDF', [
                ...$context,
            ]);

            return new JsonResponse([
                'message' => 'Erro ao gerar comprovante PDF',
                'error' => $e->getMessage(),
                'error_id' => $errorId,
            ], 500);
        }
    }

    public function comprovanteDebug(string $id): JsonResponse
    {
        $abastecimento = Abastecimento::with(['veiculo', 'motorista', 'proprietario'])
            ->findOrFail($id);
        $this->validarAcessoFilial((string) $abastecimento->local);

        $diagnostics = $this->buildComprovanteDiagnostics($abastecimento);
        $renderStatus = ['view_rendered' => false, 'error' => null];

        try {
            view('pdf.comprovante', compact('abastecimento'))->render();
            $renderStatus['view_rendered'] = true;
        } catch (\Throwable $e) {
            $renderStatus['error'] = $e->getMessage();
        }

        return new JsonResponse([
            'ok' => true,
            'id_abastecimento' => $id,
            'diagnostics' => $diagnostics,
            'render_status' => $renderStatus,
        ]);
    }
}
