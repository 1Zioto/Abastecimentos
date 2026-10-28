<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('conferencia_vipe_itens', function (Blueprint $table) {
            if (!Schema::hasColumn('conferencia_vipe_itens', 'codigo_viagem')) {
                $table->string('codigo_viagem', 120)->nullable()->after('documento');
            }
            if (!Schema::hasColumn('conferencia_vipe_itens', 'abastecimento_sofit_id')) {
                $table->string('abastecimento_sofit_id', 120)->nullable()->after('abastecimento_local');
            }
            if (!Schema::hasColumn('conferencia_vipe_itens', 'abastecimento_sofit_trip_id')) {
                $table->string('abastecimento_sofit_trip_id', 120)->nullable()
                    ->after('abastecimento_sofit_id');
            }
            if (!Schema::hasColumn('conferencia_vipe_itens', 'criterio_vinculo')) {
                $table->string('criterio_vinculo', 40)->nullable()
                    ->after('abastecimento_sofit_trip_id');
            }
        });
    }

    public function down(): void
    {
        Schema::table('conferencia_vipe_itens', function (Blueprint $table) {
            $columns = array_values(array_filter(
                [
                    'codigo_viagem',
                    'abastecimento_sofit_id',
                    'abastecimento_sofit_trip_id',
                    'criterio_vinculo',
                ],
                fn (string $column) => Schema::hasColumn('conferencia_vipe_itens', $column),
            ));
            if ($columns !== []) {
                $table->dropColumn($columns);
            }
        });
    }
};
