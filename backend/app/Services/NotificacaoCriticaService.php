<?php

namespace App\Services;

use App\Models\Abastecimento;
use App\Models\EncerranteBomba;
use App\Models\EntradaNota;
use App\Models\Proprietario;
use App\Models\ValoresCombustivel;
use App\Models\Veiculo;
use Carbon\Carbon;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

class NotificacaoCriticaService
{
    public const LIMITE_ESTOQUE_CRITICO_LITROS = 2000.0;
    public const TOLERANCIA_ENCERRANTE_DIARIO_LITROS = 50.0;
    public const TOLERANCIA_ENCERRANTE_BOMBA_LITROS = 0.5;

    private static bool $schemaEnsured = false;

    public static function ensureSchema(): void
    {
        if (self::$schemaEnsured) {
            return;
        }

        try {
            $exists = DB::selectOne(
                "SELECT 1 FROM information_schema.tables WHERE table_schema = current_schema() AND table_name = 'notificacoes_criticas'"
            );

            if (!$exists) {
                DB::statement(<<<'SQL'
                    CREATE TABLE IF NOT EXISTS notificacoes_criticas (
                        id BIGSERIAL PRIMARY KEY,
                        tipo VARCHAR(80) NOT NULL,
                        categoria VARCHAR(60) NOT NULL,
                        prioridade VARCHAR(20) NOT NULL DEFAULT 'critica',
                        titulo VARCHAR(255) NOT NULL,
                        mensagem TEXT NOT NULL,
                        local VARCHAR(40) NULL,
                        tabela_origem VARCHAR(80) NULL,
                        registro_id VARCHAR(120) NULL,
                        autor_id VARCHAR(120) NULL,
                        autor_nome VARCHAR(255) NULL,
                        dados_json TEXT NULL,
                        chave_dedup VARCHAR(180) NULL,
                        vista_em TIMESTAMP NULL,
                        vista_por_id VARCHAR(120) NULL,
                        vista_por_nome VARCHAR(255) NULL,
                        vista_por_login VARCHAR(120) NULL,
                        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
                    )
                SQL);

                DB::statement('CREATE INDEX IF NOT EXISTS notificacoes_criticas_created_idx ON notificacoes_criticas (created_at DESC, id DESC)');
                DB::statement('CREATE INDEX IF NOT EXISTS notificacoes_criticas_tipo_idx ON notificacoes_criticas (tipo)');
                DB::statement('CREATE INDEX IF NOT EXISTS notificacoes_criticas_dedup_idx ON notificacoes_criticas (chave_dedup, created_at DESC)');
            }

            $leiturasExists = DB::selectOne(
                "SELECT 1 FROM information_schema.tables WHERE table_schema = current_schema() AND table_name = 'notificacoes_criticas_leituras'"
            );

            if (!$leiturasExists) {
                DB::statement(<<<'SQL'
                    CREATE TABLE IF NOT EXISTS notificacoes_criticas_leituras (
                        id BIGSERIAL PRIMARY KEY,
                        notificacao_id BIGINT NOT NULL REFERENCES notificacoes_criticas(id) ON DELETE CASCADE,
                        usuario_id VARCHAR(120) NOT NULL,
                        usuario_nome VARCHAR(255) NOT NULL,
                        usuario_login VARCHAR(120) NULL,
                        dispositivo VARCHAR(120) NULL,
                        vista_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                        UNIQUE (notificacao_id, usuario_id)
                    )
                SQL);

                DB::statement('CREATE INDEX IF NOT EXISTS notif_crit_leituras_notif_idx ON notificacoes_criticas_leituras (notificacao_id)');
                DB::statement('CREATE INDEX IF NOT EXISTS notif_crit_leituras_user_idx ON notificacoes_criticas_leituras (usuario_id, vista_em DESC)');
            }

            self::$schemaEnsured = true;
        } catch (\Throwable $e) {
            Log::warning('[NotificacaoCritica] Falha ao garantir schema: ' . $e->getMessage());
        }
    }

    /**
     * Registra uma notificação crítica para os administradores.
     */
    public static function registrar(array $attrs, int $dedupMinutos = 0): ?int
    {
        try {
            self::ensureSchema();

            $user = auth('api')->user() ?? auth()->user();
            $autorId = $attrs['autor_id'] ?? ($user ? (string) $user->getAuthIdentifier() : null);
            $autorNome = $attrs['autor_nome'] ?? ($user?->nome ?? $user?->login ?? 'Sistema');
            $chaveDedup = isset($attrs['chave_dedup']) ? mb_substr((string) $attrs['chave_dedup'], 0, 180) : null;

            if ($chaveDedup !== null && $chaveDedup !== '' && $dedupMinutos > 0) {
                $recente = DB::table('notificacoes_criticas')
                    ->where('chave_dedup', $chaveDedup)
                    ->where('created_at', '>=', now()->subMinutes($dedupMinutos))
                    ->value('id');
                if ($recente) {
                    return (int) $recente;
                }
            }

            $dados = $attrs['dados'] ?? null;
            $dadosJson = is_string($dados)
                ? $dados
                : ($dados !== null ? json_encode($dados, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) : null);

            $id = DB::table('notificacoes_criticas')->insertGetId([
                'tipo'          => mb_substr((string) ($attrs['tipo'] ?? 'alerta_critico'), 0, 80),
                'categoria'     => mb_substr((string) ($attrs['categoria'] ?? 'abastecimentos'), 0, 60),
                'prioridade'    => in_array(($attrs['prioridade'] ?? 'critica'), ['critica', 'alta'], true)
                    ? $attrs['prioridade']
                    : 'critica',
                'titulo'        => mb_substr((string) ($attrs['titulo'] ?? 'Alerta Crítico'), 0, 255),
                'mensagem'      => (string) ($attrs['mensagem'] ?? ''),
                'local'         => isset($attrs['local']) && $attrs['local'] !== ''
                    ? mb_substr((string) $attrs['local'], 0, 40)
                    : null,
                'tabela_origem' => isset($attrs['tabela_origem'])
                    ? mb_substr((string) $attrs['tabela_origem'], 0, 80)
                    : null,
                'registro_id'   => isset($attrs['registro_id'])
                    ? mb_substr((string) $attrs['registro_id'], 0, 120)
                    : null,
                'autor_id'      => $autorId !== null ? mb_substr((string) $autorId, 0, 120) : null,
                'autor_nome'    => $autorNome !== null ? mb_substr((string) $autorNome, 0, 255) : null,
                'dados_json'    => $dadosJson,
                'chave_dedup'   => $chaveDedup,
                'created_at'    => $attrs['created_at'] ?? now(),
            ]);

            return (int) $id;
        } catch (\Throwable $e) {
            Log::warning('[NotificacaoCritica] Falha ao registrar notificação: ' . $e->getMessage());
            return null;
        }
    }

    /**
     * Marca uma ou mais notificações como vistas pelo administrador logado,
     * salvando a data/hora exata (vista_em) e os dados do usuário logado.
     */
    public static function marcarVistas(array $ids, $user, ?string $dispositivo = 'APK'): int
    {
        try {
            self::ensureSchema();
            $ids = array_values(array_unique(array_filter(array_map('intval', $ids), fn ($v) => $v > 0)));
            if (empty($ids) || !$user) {
                return 0;
            }

            $usuarioId = (string) $user->getAuthIdentifier();
            $usuarioNome = (string) ($user->nome ?? $user->login ?? 'Administrador');
            $usuarioLogin = (string) ($user->login ?? $usuarioNome);
            $agora = now();

            $rows = [];
            foreach ($ids as $id) {
                $rows[] = [
                    'notificacao_id' => $id,
                    'usuario_id'     => mb_substr($usuarioId, 0, 120),
                    'usuario_nome'   => mb_substr($usuarioNome, 0, 255),
                    'usuario_login'  => mb_substr($usuarioLogin, 0, 120),
                    'dispositivo'    => $dispositivo ? mb_substr($dispositivo, 0, 120) : 'APK',
                    'vista_em'       => $agora,
                ];
            }

            DB::table('notificacoes_criticas_leituras')->insertOrIgnore($rows);

            // Atualiza também as colunas diretas na tabela principal caso ainda não tenham sido preenchidas
            DB::table('notificacoes_criticas')
                ->whereIn('id', $ids)
                ->whereNull('vista_em')
                ->update([
                    'vista_em'        => $agora,
                    'vista_por_id'    => mb_substr($usuarioId, 0, 120),
                    'vista_por_nome'  => mb_substr($usuarioNome, 0, 255),
                    'vista_por_login' => mb_substr($usuarioLogin, 0, 120),
                ]);

            return count($ids);
        } catch (\Throwable $e) {
            Log::warning('[NotificacaoCritica] Falha ao marcar vistas: ' . $e->getMessage());
            return 0;
        }
    }

    /**
     * 1. Gatilhos na criação de um abastecimento:
     *    - Status Inconsistente
     *    - Lançamento Retroativo
     *    - Duplicidade no dia ou Volume Atípico (> 900 L ou <= 5 L)
     *    - Verificação de Tanque Zerado / Estoque Crítico Pré-Zero na filial
     */
    public static function aoCriarAbastecimento(Abastecimento $a): void
    {
        try {
            $placa = self::placaAbastecimento($a);
            $codigo = $a->atua_id ?: substr((string) $a->id_abastecimento, 0, 8);
            $litros = number_format((float) $a->quantidade_litros, 2, ',', '.');
            $valor = 'R$ ' . number_format((float) $a->valor_total, 2, ',', '.');
            $local = (string) ($a->local ?: 'Matriz');
            $frentista = (string) ($a->frentista ?: 'Não informado');

            // 1.1 Status Inconsistente
            if (mb_strtolower(trim((string) $a->status)) === 'inconsistente') {
                self::registrar([
                    'tipo'          => 'abastecimento_inconsistente',
                    'categoria'     => 'abastecimentos',
                    'prioridade'    => 'alta',
                    'titulo'        => "Abastecimento Inconsistente — {$placa} ({$local})",
                    'mensagem'      => "{$codigo} • Placa {$placa} • {$litros} L ({$valor}) lançado por {$frentista} em {$local} caiu com status INCONSISTENTE.",
                    'local'         => $local,
                    'tabela_origem' => 'abastecimentos',
                    'registro_id'   => (string) $a->id_abastecimento,
                    'dados'         => [
                        'atua_id' => $a->atua_id,
                        'placa'   => $placa,
                        'litros'  => (float) $a->quantidade_litros,
                        'valor'   => (float) $a->valor_total,
                        'status'  => $a->status,
                    ],
                ]);
            }

            // 1.2 Lançamento Retroativo (data do abastecimento anterior à data de hoje)
            $dataAbast = $a->data ? Carbon::parse($a->data)->startOfDay() : null;
            $hoje = Carbon::now(config('app.timezone', 'America/Sao_Paulo'))->startOfDay();
            if ($dataAbast && $dataAbast->lt($hoje)) {
                $diasAtraso = (int) $dataAbast->diffInDays($hoje);
                $dataFmt = $dataAbast->format('d/m/Y');
                self::registrar([
                    'tipo'          => 'abastecimento_retroativo',
                    'categoria'     => 'abastecimentos',
                    'prioridade'    => 'alta',
                    'titulo'        => "Lançamento Retroativo — {$placa} ({$dataFmt})",
                    'mensagem'      => "{$codigo} • Placa {$placa} foi registrado hoje por {$frentista} ({$local}) com data retroativa de {$dataFmt} ({$diasAtraso} dia(s) atrás) • {$litros} L ({$valor}).",
                    'local'         => $local,
                    'tabela_origem' => 'abastecimentos',
                    'registro_id'   => (string) $a->id_abastecimento,
                    'dados'         => [
                        'atua_id'         => $a->atua_id,
                        'placa'           => $placa,
                        'data_abast'      => $dataAbast->toDateString(),
                        'dias_retroativo' => $diasAtraso,
                        'litros'          => (float) $a->quantidade_litros,
                        'valor'           => (float) $a->valor_total,
                    ],
                ]);
            }

            // 1.3 Volume Atípico (> 900 L ou <= 5 L)
            $qtd = (float) $a->quantidade_litros;
            if ($qtd > 900.0 || $qtd <= 5.0) {
                $motivoVol = $qtd > 900.0 ? "acima de 900 L ({$litros} L)" : "muito baixo/teste ({$litros} L)";
                self::registrar([
                    'tipo'          => 'abastecimento_duplicado_atipico',
                    'categoria'     => 'abastecimentos',
                    'prioridade'    => 'alta',
                    'titulo'        => "Volume Atípico — {$placa} ({$litros} L)",
                    'mensagem'      => "{$codigo} • Placa {$placa} em {$local} registrado com volume {$motivoVol} • Valor: {$valor} • Frentista: {$frentista}.",
                    'local'         => $local,
                    'tabela_origem' => 'abastecimentos',
                    'registro_id'   => (string) $a->id_abastecimento,
                    'dados'         => [
                        'subtipo' => 'volume_atipico',
                        'atua_id' => $a->atua_id,
                        'placa'   => $placa,
                        'litros'  => $qtd,
                        'valor'   => (float) $a->valor_total,
                    ],
                ]);
            }

            // 1.4 Possível Duplicidade (outro abastecimento ativo para o mesmo veículo na mesma data)
            if (!empty($a->id_veiculo) && !empty($a->data)) {
                $dataStr = $a->data instanceof \DateTimeInterface
                    ? $a->data->format('Y-m-d')
                    : substr((string) $a->data, 0, 10);

                $outrosNoDia = Abastecimento::query()
                    ->where('id_veiculo', $a->id_veiculo)
                    ->whereDate('data', $dataStr)
                    ->where('id_abastecimento', '<>', $a->id_abastecimento)
                    ->whereNull('deleted_at')
                    ->whereRaw("LOWER(COALESCE(status, '')) <> 'inativo'")
                    ->get(['id_abastecimento', 'atua_id', 'quantidade_litros', 'valor_total', 'data_hora']);

                if ($outrosNoDia->isNotEmpty()) {
                    $anterior = $outrosNoDia->first();
                    $codAnt = $anterior->atua_id ?: substr((string) $anterior->id_abastecimento, 0, 8);
                    $litrosAnt = number_format((float) $anterior->quantidade_litros, 2, ',', '.');
                    self::registrar([
                        'tipo'          => 'abastecimento_duplicado_atipico',
                        'categoria'     => 'abastecimentos',
                        'prioridade'    => 'alta',
                        'titulo'        => "Possível Duplicidade — {$placa} ({$local})",
                        'mensagem'      => "A placa {$placa} recebeu mais de um abastecimento na data " . Carbon::parse($dataStr)->format('d/m/Y') . ": {$codAnt} ({$litrosAnt} L) e agora {$codigo} ({$litros} L).",
                        'local'         => $local,
                        'tabela_origem' => 'abastecimentos',
                        'registro_id'   => (string) $a->id_abastecimento,
                        'dados'         => [
                            'subtipo'           => 'duplicidade_dia',
                            'placa'             => $placa,
                            'novo_atua_id'      => $a->atua_id,
                            'anterior_atua_id'  => $anterior->atua_id,
                            'quantidade_no_dia' => $outrosNoDia->count() + 1,
                        ],
                    ]);
                }
            }

            // 1.5 Verifica saldo do tanque da filial após o abastecimento
            self::verificarSaldoTanque($local);
        } catch (\Throwable $e) {
            Log::warning('[NotificacaoCritica] Erro em aoCriarAbastecimento: ' . $e->getMessage());
        }
    }

    /**
     * 2. Gatilhos em edições de modelos (chamado em Controller::registrarAlteracoes).
     */
    public static function aoEditarModelo(Model $model, array $data): void
    {
        try {
            $tabela = $model->getTable();
            $mudancas = [];

            foreach ($data as $campo => $novo) {
                if (in_array($campo, ['sync_token_at', 'updated_at'], true)) {
                    continue;
                }
                $anterior = $model->getAttribute($campo);
                if ((string) $anterior === (string) $novo) {
                    continue;
                }
                $mudancas[$campo] = [
                    'antes'  => $anterior,
                    'depois' => $novo,
                ];
            }

            if (empty($mudancas)) {
                return;
            }

            $user = auth('api')->user() ?? auth()->user();
            $autor = $user?->nome ?? $user?->login ?? 'Sistema';

            if ($tabela === 'abastecimentos' && $model instanceof Abastecimento) {
                $placa = self::placaAbastecimento($model);
                $codigo = $model->atua_id ?: substr((string) $model->id_abastecimento, 0, 8);
                $local = (string) ($data['local'] ?? $model->local ?? 'Matriz');

                // 2.1 Edição de Litragem ou Valor
                if (isset($mudancas['quantidade_litros']) || isset($mudancas['valor_total'])) {
                    $litrosAntes = number_format((float) $model->quantidade_litros, 2, ',', '.');
                    $litrosDepois = number_format((float) ($data['quantidade_litros'] ?? $model->quantidade_litros), 2, ',', '.');
                    $valAntes = 'R$ ' . number_format((float) $model->valor_total, 2, ',', '.');
                    $valDepois = 'R$ ' . number_format((float) ($data['valor_total'] ?? $model->valor_total), 2, ',', '.');

                    self::registrar([
                        'tipo'          => 'abastecimento_editado_volume_valor',
                        'categoria'     => 'abastecimentos',
                        'prioridade'    => 'critica',
                        'titulo'        => "Abastecimento Editado (Litros/Valor) — {$placa}",
                        'mensagem'      => "{$codigo} ({$local}) • Placa {$placa} alterado por {$autor}: Litros {$litrosAntes} L -> {$litrosDepois} L | Valor {$valAntes} -> {$valDepois}.",
                        'local'         => $local,
                        'tabela_origem' => 'abastecimentos',
                        'registro_id'   => (string) $model->id_abastecimento,
                        'dados'         => [
                            'atua_id'  => $model->atua_id,
                            'placa'    => $placa,
                            'mudancas' => $mudancas,
                        ],
                    ]);
                    self::verificarSaldoTanque($local);
                }

                // 2.2 Status alterado para Inconsistente
                if (isset($mudancas['status']) && mb_strtolower(trim((string) $mudancas['status']['depois'])) === 'inconsistente') {
                    self::registrar([
                        'tipo'          => 'abastecimento_inconsistente',
                        'categoria'     => 'abastecimentos',
                        'prioridade'    => 'alta',
                        'titulo'        => "Marcado como Inconsistente — {$placa} ({$local})",
                        'mensagem'      => "{$codigo} • Placa {$placa} teve o status alterado para INCONSISTENTE por {$autor}.",
                        'local'         => $local,
                        'tabela_origem' => 'abastecimentos',
                        'registro_id'   => (string) $model->id_abastecimento,
                        'dados'         => [
                            'atua_id'  => $model->atua_id,
                            'placa'    => $placa,
                            'mudancas' => $mudancas,
                        ],
                    ]);
                }

                // 2.3 Edição de Placa, Motorista, Proprietário, Data/Hora, Odômetro ou Foto
                $camposCadastro = array_intersect(
                    array_keys($mudancas),
                    ['id_veiculo', 'id_motorista', 'id_proprietario', 'nome_motorista', 'nome_proprietario', 'data', 'data_hora', 'odometro', 'foto_odometro', 'bomba']
                );
                if (!empty($camposCadastro)) {
                    $partes = [];
                    foreach ($camposCadastro as $c) {
                        if (in_array($c, ['foto_odometro', 'bomba'], true)) {
                            $partes[] = "{$c}: foto substituída";
                        } else {
                            $partes[] = "{$c}: " . ($mudancas[$c]['antes'] ?? 'vazio') . ' -> ' . ($mudancas[$c]['depois'] ?? 'vazio');
                        }
                    }
                    self::registrar([
                        'tipo'          => 'abastecimento_editado_dados',
                        'categoria'     => 'abastecimentos',
                        'prioridade'    => 'alta',
                        'titulo'        => "Dados do Abastecimento Editados — {$placa}",
                        'mensagem'      => "{$codigo} ({$local}) • Editado por {$autor}: " . implode(' | ', $partes) . '.',
                        'local'         => $local,
                        'tabela_origem' => 'abastecimentos',
                        'registro_id'   => (string) $model->id_abastecimento,
                        'dados'         => [
                            'atua_id'  => $model->atua_id,
                            'placa'    => $placa,
                            'mudancas' => $mudancas,
                        ],
                    ]);
                }
                return;
            }

            if ($tabela === 'entrada_notas') {
                $local = (string) ($data['local'] ?? $model->getAttribute('local') ?? 'Matriz');
                $nrNota = (string) ($data['numero_nota_fiscal'] ?? $model->getAttribute('numero_nota_fiscal') ?? $model->getKey());
                $fornecedor = (string) ($data['fornecedor'] ?? $model->getAttribute('fornecedor') ?? '');
                $resumoCampos = implode(', ', array_keys($mudancas));
                self::registrar([
                    'tipo'          => 'entrada_nota_alterada_excluida',
                    'categoria'     => 'tanques_estoque',
                    'prioridade'    => 'critica',
                    'titulo'        => "Nota de Entrada Editada — NF {$nrNota} ({$local})",
                    'mensagem'      => "A Nota de Entrada NF {$nrNota} ({$fornecedor}) da filial {$local} foi alterada por {$autor} (campos: {$resumoCampos}).",
                    'local'         => $local,
                    'tabela_origem' => 'entrada_notas',
                    'registro_id'   => (string) $model->getKey(),
                    'dados'         => ['mudancas' => $mudancas],
                ]);
                self::verificarSaldoTanque($local);
                return;
            }

            if ($tabela === 'despesas_avulsas') {
                $local = (string) ($data['local'] ?? $model->getAttribute('local') ?? 'Matriz');
                $desc = (string) ($data['descricao'] ?? $model->getAttribute('descricao') ?? 'Despesa');
                $valAntes = number_format((float) $model->getAttribute('valor'), 2, ',', '.');
                $valDepois = number_format((float) ($data['valor'] ?? $model->getAttribute('valor')), 2, ',', '.');
                self::registrar([
                    'tipo'          => 'despesa_avulsa_alterada_excluida',
                    'categoria'     => 'financeiro',
                    'prioridade'    => 'alta',
                    'titulo'        => "Despesa Avulsa Editada — {$desc} ({$local})",
                    'mensagem'      => "Despesa '{$desc}' ({$local}) alterada por {$autor}: R$ {$valAntes} -> R$ {$valDepois}.",
                    'local'         => $local,
                    'tabela_origem' => 'despesas_avulsas',
                    'registro_id'   => (string) $model->getKey(),
                    'dados'         => ['mudancas' => $mudancas],
                ]);
                return;
            }

            if ($tabela === 'veiculos') {
                if (isset($mudancas['id_proprietario']) || isset($mudancas['local']) || isset($mudancas['placa'])) {
                    $placa = (string) ($data['placa'] ?? $model->getAttribute('placa') ?? $model->getKey());
                    $local = (string) ($data['local'] ?? $model->getAttribute('local') ?? 'Matriz');
                    $partes = [];
                    if (isset($mudancas['id_proprietario'])) {
                        $propAnt = Proprietario::query()->where('id_proprietario', $mudancas['id_proprietario']['antes'])->value('nome')
                            ?: $mudancas['id_proprietario']['antes'];
                        $propNovo = Proprietario::query()->where('id_proprietario', $mudancas['id_proprietario']['depois'])->value('nome')
                            ?: $mudancas['id_proprietario']['depois'];
                        $partes[] = "Proprietário: {$propAnt} -> {$propNovo}";
                    }
                    if (isset($mudancas['local'])) {
                        $partes[] = "Filial: {$mudancas['local']['antes']} -> {$mudancas['local']['depois']}";
                    }
                    if (isset($mudancas['placa'])) {
                        $partes[] = "Placa: {$mudancas['placa']['antes']} -> {$mudancas['placa']['depois']}";
                    }
                    self::registrar([
                        'tipo'          => 'veiculo_proprietario_filial_alterado',
                        'categoria'     => 'cadastros_integracoes',
                        'prioridade'    => 'alta',
                        'titulo'        => "Alteração Crítica de Veículo — {$placa}",
                        'mensagem'      => "Veículo {$placa} alterado por {$autor}: " . implode(' | ', $partes) . '.',
                        'local'         => $local,
                        'tabela_origem' => 'veiculos',
                        'registro_id'   => (string) $model->getKey(),
                        'dados'         => ['placa' => $placa, 'mudancas' => $mudancas],
                    ]);
                }
                return;
            }

            if ($tabela === 'usuarios') {
                $nomeAlvo = (string) ($data['nome'] ?? $model->getAttribute('nome') ?? $model->getKey());
                $campos = implode(', ', array_keys($mudancas));
                self::registrar([
                    'tipo'          => 'usuario_alterado',
                    'categoria'     => 'cadastros_integracoes',
                    'prioridade'    => 'critica',
                    'titulo'        => "Cadastro de Usuário Alterado — {$nomeAlvo}",
                    'mensagem'      => "O usuário '{$nomeAlvo}' teve dados/permissões alterados por {$autor} (campos: {$campos}).",
                    'local'         => 'Geral',
                    'tabela_origem' => 'usuarios',
                    'registro_id'   => (string) $model->getKey(),
                    'dados'         => ['mudancas' => $mudancas],
                ]);
            }
        } catch (\Throwable $e) {
            Log::warning('[NotificacaoCritica] Erro em aoEditarModelo: ' . $e->getMessage());
        }
    }

    /**
     * 3. Gatilhos na exclusão/inativação de registros (Controller::inativarRegistro).
     */
    public static function aoInativarModelo(Model $model): void
    {
        try {
            $tabela = $model->getTable();
            $user = auth('api')->user() ?? auth()->user();
            $autor = $user?->nome ?? $user?->login ?? 'Sistema';

            if ($tabela === 'abastecimentos' && $model instanceof Abastecimento) {
                $placa = self::placaAbastecimento($model);
                $codigo = $model->atua_id ?: substr((string) $model->id_abastecimento, 0, 8);
                $litros = number_format((float) $model->quantidade_litros, 2, ',', '.');
                $valor = 'R$ ' . number_format((float) $model->valor_total, 2, ',', '.');
                $local = (string) ($model->local ?: 'Matriz');
                $motorista = (string) ($model->nome_motorista ?: 'Não informado');
                $proprietario = (string) ($model->nome_proprietario ?: 'Não informado');
                $jaEnviadoAtua = !empty($model->atua_caixa) || !empty($model->atua_enviado_em);

                self::registrar([
                    'tipo'          => $jaEnviadoAtua ? 'abastecimento_excluido_atua' : 'abastecimento_excluido',
                    'categoria'     => 'abastecimentos',
                    'prioridade'    => 'critica',
                    'titulo'        => $jaEnviadoAtua
                        ? "EXCLUSÃO CRÍTICA (Já na Atua) — {$codigo} ({$placa})"
                        : "Abastecimento Excluído — {$codigo} ({$placa})",
                    'mensagem'      => "{$codigo} ({$local}) • Placa {$placa} ({$motorista} / {$proprietario}) • {$litros} L ({$valor}) foi EXCLUÍDO por {$autor}."
                        . ($jaEnviadoAtua ? " ATENÇÃO: Este registro já havia sido enviado à Atua (Caixa: " . ($model->atua_caixa ?: 'S/N') . ")." : ''),
                    'local'         => $local,
                    'tabela_origem' => 'abastecimentos',
                    'registro_id'   => (string) $model->id_abastecimento,
                    'dados'         => [
                        'atua_id'         => $model->atua_id,
                        'atua_caixa'      => $model->atua_caixa,
                        'atua_enviado_em' => $model->atua_enviado_em ? (string) $model->atua_enviado_em : null,
                        'placa'           => $placa,
                        'litros'          => (float) $model->quantidade_litros,
                        'valor_total'     => (float) $model->valor_total,
                        'motorista'       => $motorista,
                        'proprietario'    => $proprietario,
                    ],
                ]);
                self::verificarSaldoTanque($local);
                return;
            }

            if ($tabela === 'entrada_notas') {
                $local = (string) ($model->getAttribute('local') ?: 'Matriz');
                $nrNota = (string) ($model->getAttribute('numero_nota_fiscal') ?: $model->getKey());
                $fornecedor = (string) ($model->getAttribute('fornecedor') ?: '');
                $qtd = number_format((float) $model->getAttribute('quantidade'), 2, ',', '.');
                $valor = 'R$ ' . number_format((float) $model->getAttribute('valor'), 2, ',', '.');
                self::registrar([
                    'tipo'          => 'entrada_nota_alterada_excluida',
                    'categoria'     => 'tanques_estoque',
                    'prioridade'    => 'critica',
                    'titulo'        => "Nota de Entrada Excluída — NF {$nrNota} ({$local})",
                    'mensagem'      => "A Nota de Entrada NF {$nrNota} ({$fornecedor}) de {$qtd} L ({$valor}) na filial {$local} foi EXCLUÍDA por {$autor}.",
                    'local'         => $local,
                    'tabela_origem' => 'entrada_notas',
                    'registro_id'   => (string) $model->getKey(),
                    'dados'         => $model->toArray(),
                ]);
                self::verificarSaldoTanque($local);
                return;
            }

            if ($tabela === 'baixa_abastecimento') {
                $idAbast = (string) $model->getAttribute('id_abastecimento');
                $forma = (string) ($model->getAttribute('forma_pagamento') ?: 'Não informada');
                self::registrar([
                    'tipo'          => 'baixa_excluida_estornada',
                    'categoria'     => 'financeiro',
                    'prioridade'    => 'critica',
                    'titulo'        => "Baixa de Abastecimento Excluída/Estornada",
                    'mensagem'      => "Uma baixa ({$forma}) vinculada ao abastecimento {$idAbast} foi excluída/estornada por {$autor}.",
                    'local'         => 'Geral',
                    'tabela_origem' => 'baixa_abastecimento',
                    'registro_id'   => (string) $model->getKey(),
                    'dados'         => $model->toArray(),
                ]);
                return;
            }

            if ($tabela === 'despesas_avulsas') {
                $local = (string) ($model->getAttribute('local') ?: 'Matriz');
                $desc = (string) ($model->getAttribute('descricao') ?: 'Despesa');
                $valor = 'R$ ' . number_format((float) $model->getAttribute('valor'), 2, ',', '.');
                self::registrar([
                    'tipo'          => 'despesa_avulsa_alterada_excluida',
                    'categoria'     => 'financeiro',
                    'prioridade'    => 'alta',
                    'titulo'        => "Despesa Avulsa Excluída — {$desc} ({$local})",
                    'mensagem'      => "A despesa avulsa '{$desc}' no valor de {$valor} ({$local}) foi EXCLUÍDA por {$autor}.",
                    'local'         => $local,
                    'tabela_origem' => 'despesas_avulsas',
                    'registro_id'   => (string) $model->getKey(),
                    'dados'         => $model->toArray(),
                ]);
                return;
            }

            if ($tabela === 'veiculos') {
                $placa = (string) ($model->getAttribute('placa') ?: $model->getKey());
                $local = (string) ($model->getAttribute('local') ?: 'Matriz');
                self::registrar([
                    'tipo'          => 'veiculo_proprietario_filial_alterado',
                    'categoria'     => 'cadastros_integracoes',
                    'prioridade'    => 'alta',
                    'titulo'        => "Veículo Inativado — {$placa}",
                    'mensagem'      => "O veículo de placa {$placa} ({$local}) foi inativado/excluído por {$autor}.",
                    'local'         => $local,
                    'tabela_origem' => 'veiculos',
                    'registro_id'   => (string) $model->getKey(),
                    'dados'         => $model->toArray(),
                ]);
                return;
            }

            if ($tabela === 'usuarios') {
                $nomeAlvo = (string) ($model->getAttribute('nome') ?: $model->getKey());
                self::registrar([
                    'tipo'          => 'usuario_alterado',
                    'categoria'     => 'cadastros_integracoes',
                    'prioridade'    => 'critica',
                    'titulo'        => "Usuário Inativado — {$nomeAlvo}",
                    'mensagem'      => "O usuário '{$nomeAlvo}' foi inativado/excluído por {$autor}.",
                    'local'         => 'Geral',
                    'tabela_origem' => 'usuarios',
                    'registro_id'   => (string) $model->getKey(),
                    'dados'         => $model->toArray(),
                ]);
            }
        } catch (\Throwable $e) {
            Log::warning('[NotificacaoCritica] Erro em aoInativarModelo: ' . $e->getMessage());
        }
    }

    /**
     * 4. Verifica o saldo atual de uma filial (ou de todas: Matriz e Viana)
     *    e dispara alerta de Tanque Zerado (<= 0 L) ou Estoque Crítico (< 2000 L).
     */
    public static function verificarSaldoTanque(?string $localEspecifico = null): void
    {
        try {
            $locais = $localEspecifico ? [$localEspecifico] : ['Matriz', 'Viana'];

            foreach ($locais as $local) {
                $entradas = (float) EntradaNota::query()
                    ->where('local', $local)
                    ->whereNull('deleted_at')
                    ->where(function ($q) {
                        $q->whereNull('status')->orWhereRaw("LOWER(status) <> 'inativo'");
                    })
                    ->sum('quantidade');

                $saidas = (float) Abastecimento::query()
                    ->where('local', $local)
                    ->whereNull('deleted_at')
                    ->where(function ($q) {
                        $q->whereNull('status')->orWhereRaw("LOWER(status) <> 'inativo'");
                    })
                    ->sum('quantidade_litros');

                $saldo = round($entradas - $saidas, 2);
                $saldoFmt = number_format($saldo, 2, ',', '.');

                if ($saldo <= 0) {
                    self::registrar([
                        'tipo'          => 'tanque_zerado',
                        'categoria'     => 'tanques_estoque',
                        'prioridade'    => 'critica',
                        'titulo'        => "Tanque Zerado — {$local} ({$saldoFmt} L)",
                        'mensagem'      => "O saldo calculado do tanque da filial {$local} chegou a {$saldoFmt} L (<= 0 L). Confira entradas e saídas imediatamente.",
                        'local'         => $local,
                        'tabela_origem' => 'tanques',
                        'registro_id'   => strtolower($local),
                        'chave_dedup'   => 'tanque_zerado_' . strtolower($local) . '_' . now()->toDateString(),
                        'dados'         => [
                            'local'        => $local,
                            'saldo_litros' => $saldo,
                            'entradas'     => $entradas,
                            'saidas'       => $saidas,
                        ],
                    ], 360); // deduplica por 6h na mesma data
                } elseif ($saldo < self::LIMITE_ESTOQUE_CRITICO_LITROS) {
                    self::registrar([
                        'tipo'          => 'tanque_estoque_critico',
                        'categoria'     => 'tanques_estoque',
                        'prioridade'    => 'critica',
                        'titulo'        => "Estoque Crítico (Pré-Zero) — {$local} ({$saldoFmt} L)",
                        'mensagem'      => "Atenção: o saldo disponível no tanque da filial {$local} caiu para {$saldoFmt} L (abaixo do nível crítico de 2.000 L).",
                        'local'         => $local,
                        'tabela_origem' => 'tanques',
                        'registro_id'   => strtolower($local),
                        'chave_dedup'   => 'tanque_critico_' . strtolower($local) . '_' . now()->toDateString(),
                        'dados'         => [
                            'local'        => $local,
                            'saldo_litros' => $saldo,
                            'limite'       => self::LIMITE_ESTOQUE_CRITICO_LITROS,
                        ],
                    ], 360);
                }
            }
        } catch (\Throwable $e) {
            Log::warning('[NotificacaoCritica] Erro em verificarSaldoTanque: ' . $e->getMessage());
        }
    }

    /**
     * 5. Divergência no Encerrante Diário (régua/medidor vs. saldo do sistema).
     */
    public static function aoRegistrarEncerranteDiario(object $registro): void
    {
        try {
            if (!isset($registro->saldo_sistema) || $registro->saldo_sistema === null) {
                return;
            }
            $medido = (float) $registro->quantidade_tanque;
            $sistema = (float) $registro->saldo_sistema;
            $dif = round($medido - $sistema, 2);

            if (abs($dif) > self::TOLERANCIA_ENCERRANTE_DIARIO_LITROS) {
                $local = (string) ($registro->local ?? 'Matriz');
                $medidoFmt = number_format($medido, 2, ',', '.');
                $sistFmt = number_format($sistema, 2, ',', '.');
                $difFmt = ($dif > 0 ? '+' : '') . number_format($dif, 2, ',', '.');
                $autor = (string) ($registro->usuario_nome ?? 'Operador');

                self::registrar([
                    'tipo'          => 'encerrante_divergente',
                    'categoria'     => 'tanques_estoque',
                    'prioridade'    => 'critica',
                    'titulo'        => "Divergência no Encerrante Diário — {$local} ({$difFmt} L)",
                    'mensagem'      => "Fechamento diário em {$local} por {$autor}: Tanque medido = {$medidoFmt} L vs. Saldo sistema = {$sistFmt} L (Diferença: {$difFmt} L).",
                    'local'         => $local,
                    'tabela_origem' => 'encerrantes_diarios',
                    'registro_id'   => (string) ($registro->id ?? ''),
                    'dados'         => [
                        'local'             => $local,
                        'data'              => $registro->data ?? null,
                        'quantidade_tanque' => $medido,
                        'saldo_sistema'     => $sistema,
                        'diferenca_litros'  => $dif,
                    ],
                ]);
            }
        } catch (\Throwable $e) {
            Log::warning('[NotificacaoCritica] Erro em aoRegistrarEncerranteDiario: ' . $e->getMessage());
        }
    }

    /**
     * 6. Edição, Exclusão ou Divergência em Encerrante de Bomba.
     */
    public static function aoMovimentarEncerranteBomba(EncerranteBomba $registro, string $acao, ?array $divergencia = null): void
    {
        try {
            $local = (string) ($registro->local ?: 'Matriz');
            $dataFmt = $registro->data ? Carbon::parse($registro->data)->format('d/m/Y') : '';
            $user = auth('api')->user() ?? auth()->user();
            $autor = $user?->nome ?? $user?->login ?? $registro->usuario_nome ?? 'Sistema';

            if (in_array($acao, ['update', 'delete'], true)) {
                $verbo = $acao === 'delete' ? 'EXCLUÍDO' : 'EDITADO';
                self::registrar([
                    'tipo'          => 'encerrante_alterado_excluido',
                    'categoria'     => 'tanques_estoque',
                    'prioridade'    => 'alta',
                    'titulo'        => "Encerrante de Bomba {$verbo} — {$local} ({$dataFmt})",
                    'mensagem'      => "O registro de encerrante de bomba de {$dataFmt} ({$local}, Bomba: " . number_format((float) $registro->litros_bomba, 2, ',', '.') . " L) foi {$verbo} por {$autor}.",
                    'local'         => $local,
                    'tabela_origem' => 'encerrantes_bomba',
                    'registro_id'   => (string) $registro->id_encerrante,
                    'dados'         => $registro->toArray(),
                ]);
            }

            if ($divergencia && !empty($divergencia['divergente'])) {
                $difBomba = number_format((float) ($divergencia['diferenca_encerrante_saida'] ?? 0), 2, ',', '.');
                $difTanque = number_format((float) ($divergencia['diferenca_tanque'] ?? 0), 2, ',', '.');
                self::registrar([
                    'tipo'          => 'encerrante_divergente',
                    'categoria'     => 'tanques_estoque',
                    'prioridade'    => 'critica',
                    'titulo'        => "Divergência de Encerrante de Bomba — {$local} ({$dataFmt})",
                    'mensagem'      => "Encerrante registrado em {$local} ({$dataFmt}) por {$autor} apresentou divergência: Dif. Bomba vs. Saídas = {$difBomba} L | Dif. Tanque = {$difTanque} L.",
                    'local'         => $local,
                    'tabela_origem' => 'encerrantes_bomba',
                    'registro_id'   => (string) $registro->id_encerrante,
                    'dados'         => $divergencia,
                ]);
            }
        } catch (\Throwable $e) {
            Log::warning('[NotificacaoCritica] Erro em aoMovimentarEncerranteBomba: ' . $e->getMessage());
        }
    }

    /**
     * 7. Alteração do Preço do Diesel.
     */
    public static function aoAlterarPrecoCombustivel(ValoresCombustivel $novo, ?ValoresCombustivel $anterior = null): void
    {
        try {
            $local = (string) ($novo->local ?: 'Matriz');
            $combustivel = (string) ($novo->tipo_combustivel ?: 'OLEO DIESEL S10');
            $precoNovo = 'R$ ' . number_format((float) $novo->valor, 3, ',', '.');
            $freteNovo = 'R$ ' . number_format((float) ($novo->valor_frete ?? 0.04), 3, ',', '.');
            $autor = (string) ($novo->responsavel ?: 'Administrador');

            $msgAnt = $anterior
                ? 'R$ ' . number_format((float) $anterior->valor, 3, ',', '.') . ' -> ' . $precoNovo
                : 'Novo valor: ' . $precoNovo;

            self::registrar([
                'tipo'          => 'preco_combustivel_alterado',
                'categoria'     => 'tanques_estoque',
                'prioridade'    => 'alta',
                'titulo'        => "Preço do Combustível Alterado — {$local} ({$precoNovo})",
                'mensagem'      => "{$combustivel} na filial {$local} atualizado por {$autor}: {$msgAnt} (Frete: {$freteNovo}/L).",
                'local'         => $local,
                'tabela_origem' => 'valores_combustivel',
                'registro_id'   => (string) $novo->id_valor,
                'dados'         => [
                    'local'          => $local,
                    'combustivel'    => $combustivel,
                    'valor_anterior' => $anterior ? (float) $anterior->valor : null,
                    'valor_novo'     => (float) $novo->valor,
                    'valor_frete'    => (float) ($novo->valor_frete ?? 0.04),
                ],
            ]);
        } catch (\Throwable $e) {
            Log::warning('[NotificacaoCritica] Erro em aoAlterarPrecoCombustivel: ' . $e->getMessage());
        }
    }

    /**
     * 8. Falha na Integração Atua.
     */
    public static function aoFalharIntegracaoAtua(Abastecimento $a, string $erro): void
    {
        try {
            $placa = self::placaAbastecimento($a);
            $codigo = $a->atua_id ?: substr((string) $a->id_abastecimento, 0, 8);
            $local = (string) ($a->local ?: 'Matriz');

            self::registrar([
                'tipo'          => 'atua_falha_integracao',
                'categoria'     => 'cadastros_integracoes',
                'prioridade'    => 'alta',
                'titulo'        => "Falha na Integração Atua — {$codigo} ({$placa})",
                'mensagem'      => "O abastecimento {$codigo} (Placa {$placa}, {$local}) falhou ao integrar com a Atua: {$erro}",
                'local'         => $local,
                'tabela_origem' => 'abastecimentos',
                'registro_id'   => (string) $a->id_abastecimento,
                'chave_dedup'   => 'atua_erro_' . $a->id_abastecimento . '_' . md5($erro),
                'dados'         => [
                    'atua_id' => $a->atua_id,
                    'placa'   => $placa,
                    'erro'    => $erro,
                ],
            ], 240);
        } catch (\Throwable $e) {
            Log::warning('[NotificacaoCritica] Erro em aoFalharIntegracaoAtua: ' . $e->getMessage());
        }
    }

    /**
     * 9. Exclusão/Edição de Comprovante de Pagamento, Baixa ou Crédito de Proprietário.
     */
    public static function aoMovimentarComprovanteOuBaixa(
        string $tipo,
        string $titulo,
        string $mensagem,
        string $tabela,
        string $registroId,
        ?string $local = 'Geral',
        array $dados = []
    ): void {
        self::registrar([
            'tipo'          => $tipo,
            'categoria'     => 'financeiro',
            'prioridade'    => 'critica',
            'titulo'        => $titulo,
            'mensagem'      => $mensagem,
            'local'         => $local,
            'tabela_origem' => $tabela,
            'registro_id'   => $registroId,
            'dados'         => $dados,
        ]);
    }

    /**
     * 10. Erro de Sincronização em Operadores (app_erros).
     */
    public static function aoRegistrarErroApp(int $idErro, array $data, $user): void
    {
        try {
            $origem = mb_strtolower(trim((string) ($data['origem'] ?? '')));
            $tipo = mb_strtolower(trim((string) ($data['tipo'] ?? '')));
            $mensagem = trim((string) ($data['mensagem'] ?? ''));

            $ehErroSyncOuCritico = str_contains($origem, 'sync')
                || str_contains($tipo, 'sync')
                || str_contains(mb_strtolower($mensagem), 'sincroniza')
                || str_contains(mb_strtolower($mensagem), 'upload')
                || ($user && strtolower((string) ($user->tipo ?? '')) === 'operador');

            if (!$ehErroSyncOuCritico) {
                return;
            }

            $nomeUsuario = $user?->nome ?? $user?->login ?? 'Operador';
            $local = (string) ($data['local'] ?? 'Geral');

            self::registrar([
                'tipo'          => 'operador_erro_sincronizacao',
                'categoria'     => 'cadastros_integracoes',
                'prioridade'    => 'alta',
                'titulo'        => "Erro de Sincronização — {$nomeUsuario} ({$local})",
                'mensagem'      => "Aparelho de {$nomeUsuario} ({$local}) reportou falha: {$mensagem}"
                    . (!empty($data['detalhe']) ? ' • ' . mb_substr((string) $data['detalhe'], 0, 180) : ''),
                'local'         => $local,
                'tabela_origem' => 'app_erros',
                'registro_id'   => (string) $idErro,
                'autor_id'      => $user ? (string) $user->getAuthIdentifier() : null,
                'autor_nome'    => $nomeUsuario,
                'chave_dedup'   => 'app_erro_sync_' . ($user ? $user->getAuthIdentifier() : 'anon') . '_' . md5($mensagem),
                'dados'         => $data,
            ], 60);
        } catch (\Throwable $e) {
            Log::warning('[NotificacaoCritica] Erro em aoRegistrarErroApp: ' . $e->getMessage());
        }
    }

    /**
     * Popula retroativamente as notificações críticas de Outubro/2026 a partir
     * do histórico de auditoria caso a tabela acabe de ser criada e esteja vazia.
     */
    public static function sincronizarHistoricoOutubroSeVazio(): void
    {
        try {
            self::ensureSchema();
            if (DB::table('notificacoes_criticas')->exists()) {
                return;
            }

            // 1. Abastecimentos excluídos de outubro/2026 em diante
            $excluidos = Abastecimento::query()
                ->with('veiculo:id_veiculo,placa')
                ->whereNotNull('deleted_at')
                ->where('deleted_at', '>=', '2026-10-01 00:00:00')
                ->orderBy('deleted_at')
                ->get();

            foreach ($excluidos as $a) {
                $placa = self::placaAbastecimento($a);
                $codigo = $a->atua_id ?: substr((string) $a->id_abastecimento, 0, 8);
                $litros = number_format((float) $a->quantidade_litros, 2, ',', '.');
                $valor = 'R$ ' . number_format((float) $a->valor_total, 2, ',', '.');
                $local = (string) ($a->local ?: 'Matriz');
                $autor = (string) ($a->deleted_by ?: 'Administrador');
                $jaEnviadoAtua = !empty($a->atua_caixa) || !empty($a->atua_enviado_em);

                self::registrar([
                    'tipo'          => $jaEnviadoAtua ? 'abastecimento_excluido_atua' : 'abastecimento_excluido',
                    'categoria'     => 'abastecimentos',
                    'prioridade'    => 'critica',
                    'titulo'        => $jaEnviadoAtua
                        ? "EXCLUSÃO CRÍTICA (Já na Atua) — {$codigo} ({$placa})"
                        : "Abastecimento Excluído — {$codigo} ({$placa})",
                    'mensagem'      => "{$codigo} ({$local}) • Placa {$placa} ({$a->nome_motorista} / {$a->nome_proprietario}) • {$litros} L ({$valor}) foi EXCLUÍDO por {$autor}."
                        . ($jaEnviadoAtua ? " ATENÇÃO: Já enviado à Atua (Caixa: {$a->atua_caixa})." : ''),
                    'local'         => $local,
                    'tabela_origem' => 'abastecimentos',
                    'registro_id'   => (string) $a->id_abastecimento,
                    'autor_id'      => $a->deleted_by_id,
                    'autor_nome'    => $autor,
                    'created_at'    => $a->deleted_at,
                    'dados'         => [
                        'atua_id'     => $a->atua_id,
                        'atua_caixa'  => $a->atua_caixa,
                        'placa'       => $placa,
                        'litros'      => (float) $a->quantidade_litros,
                        'valor_total' => (float) $a->valor_total,
                    ],
                ]);
            }

            // 2. Edições de volume/valor em abastecimentos de outubro/2026 em diante
            $audits = DB::table('auditoria_alteracoes')
                ->where('tabela', 'abastecimentos')
                ->where('acao', 'update')
                ->whereIn('campo', ['quantidade_litros', 'valor_total'])
                ->where('created_at', '>=', '2026-10-01 00:00:00')
                ->orderBy('created_at')
                ->get()
                ->groupBy(fn ($r) => $r->registro_id . '|' . substr((string) $r->created_at, 0, 19));

            foreach ($audits as $grupo) {
                $primeiro = $grupo->first();
                $a = Abastecimento::with('veiculo:id_veiculo,placa')->find($primeiro->registro_id);
                if (!$a) {
                    continue;
                }
                $placa = self::placaAbastecimento($a);
                $codigo = $a->atua_id ?: substr((string) $a->id_abastecimento, 0, 8);
                $local = (string) ($a->local ?: 'Matriz');
                $partes = [];
                foreach ($grupo as $item) {
                    if ($item->campo === 'quantidade_litros') {
                        $partes[] = "Litros: {$item->valor_anterior} L -> {$item->valor_novo} L";
                    } elseif ($item->campo === 'valor_total') {
                        $partes[] = "Valor: R$ {$item->valor_anterior} -> R$ {$item->valor_novo}";
                    }
                }
                self::registrar([
                    'tipo'          => 'abastecimento_editado_volume_valor',
                    'categoria'     => 'abastecimentos',
                    'prioridade'    => 'critica',
                    'titulo'        => "Abastecimento Editado (Litros/Valor) — {$placa}",
                    'mensagem'      => "{$codigo} ({$local}) • Placa {$placa} alterado por {$primeiro->usuario_nome}: " . implode(' | ', $partes) . '.',
                    'local'         => $local,
                    'tabela_origem' => 'abastecimentos',
                    'registro_id'   => (string) $a->id_abastecimento,
                    'autor_id'      => $primeiro->usuario_id,
                    'autor_nome'    => $primeiro->usuario_nome,
                    'created_at'    => $primeiro->created_at,
                    'dados'         => [
                        'atua_id' => $a->atua_id,
                        'placa'   => $placa,
                        'partes'  => $partes,
                    ],
                ]);
            }
        } catch (\Throwable $e) {
            Log::warning('[NotificacaoCritica] Erro ao sincronizar histórico de outubro: ' . $e->getMessage());
        }
    }

    private static function placaAbastecimento(Abastecimento $a): string
    {
        if ($a->relationLoaded('veiculo') && $a->veiculo?->placa) {
            return (string) $a->veiculo->placa;
        }
        if (!empty($a->placa1)) {
            return (string) $a->placa1;
        }
        if (!empty($a->id_veiculo)) {
            $placa = Veiculo::query()->where('id_veiculo', $a->id_veiculo)->value('placa');
            if ($placa) {
                return (string) $placa;
            }
            return (string) $a->id_veiculo;
        }
        return 'SEM-PLACA';
    }
}

