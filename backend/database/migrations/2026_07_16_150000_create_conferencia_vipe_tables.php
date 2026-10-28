<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('conferencia_vipe_importacoes')) {
            Schema::create('conferencia_vipe_importacoes', function (Blueprint $table) {
                $table->uuid('id_conferencia')->primary();
                $table->string('arquivo_origem', 255);
                $table->string('arquivo_hash', 64)->unique();
                $table->string('local_considerado', 80)->default('Matriz');
                $table->json('proprietarios');
                $table->unsignedInteger('placas_cadastradas')->default(0);
                $table->unsignedInteger('linhas_arquivo')->default(0);
                $table->unsignedInteger('linhas_vipe')->default(0);
                $table->unsignedInteger('linhas_ignoradas_formato')->default(0);
                $table->unsignedInteger('linhas_outros_proprietarios')->default(0);
                $table->json('placas_outros_proprietarios')->nullable();
                $table->date('periodo_inicio')->nullable()->index();
                $table->date('periodo_fim')->nullable()->index();
                $table->string('importado_por_id', 120)->nullable();
                $table->string('importado_por', 160)->nullable();
                $table->timestamps();
            });
        }

        if (!Schema::hasTable('conferencia_vipe_itens')) {
            Schema::create('conferencia_vipe_itens', function (Blueprint $table) {
                $table->uuid('id_item')->primary();
                $table->uuid('id_conferencia');
                $table->unsignedInteger('linha_arquivo')->default(0);
                $table->string('placa', 20)->index();
                $table->date('data')->index();
                $table->string('documento', 120)->nullable();
                $table->string('item', 255)->nullable();
                $table->text('descricao')->nullable();
                $table->decimal('valor_relatorio', 14, 2)->nullable();
                $table->decimal('quantidade_relatorio', 14, 2)->nullable();
                $table->string('status_original', 20)->index();
                $table->string('status_label_original', 80);
                $table->text('mensagem_original');
                $table->string('id_abastecimento', 120)->nullable()->index();
                $table->string('abastecimento_placa', 20)->nullable();
                $table->date('abastecimento_data')->nullable();
                $table->decimal('abastecimento_quantidade', 14, 2)->nullable();
                $table->decimal('abastecimento_valor_por_litro', 14, 3)->nullable();
                $table->decimal('abastecimento_valor_total', 14, 2)->nullable();
                $table->string('abastecimento_local', 80)->nullable();
                $table->decimal('diferenca_valor', 14, 2)->nullable();
                $table->decimal('diferenca_quantidade', 14, 2)->nullable();
                $table->boolean('checado')->default(false)->index();
                $table->string('checado_por_id', 120)->nullable();
                $table->string('checado_por', 160)->nullable();
                $table->timestamp('checado_em')->nullable();
                $table->text('observacao_checagem')->nullable();
                $table->timestamps();

                $table->foreign('id_conferencia')
                    ->references('id_conferencia')
                    ->on('conferencia_vipe_importacoes')
                    ->cascadeOnDelete();
                $table->unique(['id_conferencia', 'linha_arquivo']);
                $table->index(['id_conferencia', 'data']);
                $table->index(['id_conferencia', 'status_original', 'checado']);
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('conferencia_vipe_itens');
        Schema::dropIfExists('conferencia_vipe_importacoes');
    }
};
