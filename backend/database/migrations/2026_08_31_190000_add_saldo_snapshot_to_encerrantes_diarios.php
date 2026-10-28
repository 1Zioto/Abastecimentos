<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::table('encerrantes_diarios', function (Blueprint $table) {
            $table->decimal('saldo_sistema', 14, 3)->nullable();
            $table->timestampTz('saldo_consultado_em')->nullable();
        });
    }
    public function down(): void
    {
        Schema::table('encerrantes_diarios', fn (Blueprint $table) => $table->dropColumn(['saldo_sistema', 'saldo_consultado_em']));
    }
};
