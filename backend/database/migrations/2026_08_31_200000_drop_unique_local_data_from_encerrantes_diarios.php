<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::table('encerrantes_diarios', function (Blueprint $table) {
            $table->dropUnique(['local', 'data']);
        });
    }

    public function down(): void
    {
        Schema::table('encerrantes_diarios', function (Blueprint $table) {
            $table->unique(['local', 'data']);
        });
    }
};
