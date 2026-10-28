<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::table('abastecimentos', function (Blueprint $table) {
            $table->index(['data_hora']);
            $table->index(['baixa_abastecimento', 'data_hora']);
            $table->index(['id_proprietario', 'data_hora']);
            $table->index(['id_veiculo', 'data_hora']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('abastecimentos', function (Blueprint $table) {
            $table->dropIndex(['data_hora']);
            $table->dropIndex(['baixa_abastecimento', 'data_hora']);
            $table->dropIndex(['id_proprietario', 'data_hora']);
            $table->dropIndex(['id_veiculo', 'data_hora']);
        });
    }
};
