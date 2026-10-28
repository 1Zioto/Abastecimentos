<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('conferencia_vipe_itens', function (Blueprint $table) {
            if (!Schema::hasColumn('conferencia_vipe_itens', 'data_hora')) {
                $table->dateTime('data_hora')->nullable()->after('data');
            }
            if (!Schema::hasColumn('conferencia_vipe_itens', 'abastecimento_data_hora')) {
                $table->dateTime('abastecimento_data_hora')->nullable()->after('abastecimento_data');
            }
            if (!Schema::hasColumn('conferencia_vipe_itens', 'diferenca_dias')) {
                $table->smallInteger('diferenca_dias')->nullable()->after('diferenca_quantidade');
            }
        });
    }

    public function down(): void
    {
        Schema::table('conferencia_vipe_itens', function (Blueprint $table) {
            $columns = array_values(array_filter(
                ['data_hora', 'abastecimento_data_hora', 'diferenca_dias'],
                fn (string $column) => Schema::hasColumn('conferencia_vipe_itens', $column),
            ));
            if ($columns !== []) {
                $table->dropColumn($columns);
            }
        });
    }
};
