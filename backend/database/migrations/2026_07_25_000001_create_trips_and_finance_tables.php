<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Fase 1 do Sistema de Rentabilidade — Viagens e resultado financeiro.
 * Cria: system_parameters, trips, trip_revenues, trip_costs.
 * Não altera tabelas existentes (veiculos, motoristas, abastecimentos).
 */
return new class extends Migration
{
    public function up(): void
    {
        // ---- Parâmetros configuráveis do sistema (preço diesel, consumo, rateio...) ----
        if (!Schema::hasTable('system_parameters')) {
            Schema::create('system_parameters', function (Blueprint $table) {
                $table->uuid('id')->primary();
                $table->uuid('company_id')->nullable()->index();
                $table->string('chave', 120)->index();
                $table->json('valor');
                $table->string('tipo', 40)->nullable();          // number|money|percent|string|json
                $table->string('descricao', 255)->nullable();
                $table->timestamp('vigencia_inicio')->nullable();
                $table->timestamp('vigencia_fim')->nullable();
                $table->string('updated_by', 120)->nullable();
                $table->timestamps();
                $table->unique(['company_id', 'chave']);
            });
        }

        // ---- Viagens ----
        if (!Schema::hasTable('trips')) {
            Schema::create('trips', function (Blueprint $table) {
                $table->uuid('id')->primary();
                $table->uuid('company_id')->nullable()->index();
                $table->uuid('branch_id')->nullable();
                $table->unsignedBigInteger('numero')->nullable()->unique();

                $table->uuid('client_id')->nullable()->index();
                $table->uuid('vehicle_id')->nullable()->index();   // -> veiculos.id_veiculo
                $table->uuid('trailer_id')->nullable();
                $table->uuid('driver_id')->nullable()->index();    // -> motoristas.id_motorista
                $table->uuid('route_id')->nullable();
                $table->uuid('product_id')->nullable();

                $table->string('origem', 160)->nullable();
                $table->string('destino', 160)->nullable();

                $table->timestamp('previsao_saida')->nullable();
                $table->timestamp('saida_real')->nullable();
                $table->timestamp('previsao_chegada')->nullable();
                $table->timestamp('chegada_real')->nullable();

                $table->decimal('peso_kg', 12, 2)->nullable();
                $table->decimal('quantidade', 12, 2)->nullable();
                $table->string('tipo_carga', 60)->nullable();

                $table->decimal('km_inicial', 12, 2)->nullable();
                $table->decimal('km_final', 12, 2)->nullable();
                $table->decimal('km_carregado', 12, 2)->nullable();
                $table->decimal('km_vazio', 12, 2)->nullable();

                $table->string('status', 40)->default('planejada')->index();
                $table->string('cte_numero', 60)->nullable();
                $table->string('mdfe_numero', 60)->nullable();

                // Parâmetros de cálculo com snapshot na própria viagem (fallback nos globais)
                $table->decimal('margem_desejada_pct', 6, 2)->nullable();
                $table->decimal('custo_fixo_diario', 12, 2)->nullable();

                $table->jsonb('resultado_json')->nullable();       // snapshot auditável do cálculo
                $table->text('observacao')->nullable();

                $table->timestamps();
                $table->softDeletes();
            });
        }

        // ---- Receitas da viagem ----
        if (!Schema::hasTable('trip_revenues')) {
            Schema::create('trip_revenues', function (Blueprint $table) {
                $table->uuid('id')->primary();
                $table->uuid('trip_id')->index();
                $table->string('tipo', 40);                        // frete|estadia|taxa|retorno|outra
                $table->string('descricao', 255)->nullable();
                $table->decimal('valor', 14, 2)->default(0);
                $table->string('origem', 40)->default('manual');
                $table->timestamps();
            });
        }

        // ---- Custos da viagem ----
        if (!Schema::hasTable('trip_costs')) {
            Schema::create('trip_costs', function (Blueprint $table) {
                $table->uuid('id')->primary();
                $table->uuid('trip_id')->index();
                $table->string('categoria', 40);                   // combustivel|pedagio|comissao|...
                $table->string('natureza', 20)->default('variavel'); // variavel|fixo_rateado
                $table->string('descricao', 255)->nullable();
                $table->decimal('valor', 14, 2)->default(0);
                $table->string('origem', 40)->default('manual');   // manual|abastecimento|telemetria|rateio
                $table->uuid('ref_id')->nullable();                // ex.: id_abastecimento de origem
                $table->timestamps();
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('trip_costs');
        Schema::dropIfExists('trip_revenues');
        Schema::dropIfExists('trips');
        Schema::dropIfExists('system_parameters');
    }
};
