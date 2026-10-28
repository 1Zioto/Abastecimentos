<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('encerrantes_diarios', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->date('data');
            $table->string('local', 40);
            $table->decimal('quantidade_tanque', 14, 3);
            $table->text('foto_regua');
            $table->text('foto_medidor');
            $table->string('usuario_id', 120);
            $table->string('usuario_nome');
            $table->string('client_request_id', 120)->unique();
            $table->timestamp('created_at');
            $table->unique(['local', 'data']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('encerrantes_diarios');
    }
};
