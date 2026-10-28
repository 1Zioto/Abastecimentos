<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('comprovantes_pagamento')
            && Schema::hasColumn('comprovantes_pagamento', 'nota_entrada')) {
            DB::statement(
                'ALTER TABLE comprovantes_pagamento ' .
                'ALTER COLUMN nota_entrada TYPE TEXT USING nota_entrada::text'
            );
        }

        if (Schema::hasTable('creditos_proprietario')
            && Schema::hasColumn('creditos_proprietario', 'nota_entrada')) {
            DB::statement(
                'ALTER TABLE creditos_proprietario ' .
                'ALTER COLUMN nota_entrada TYPE TEXT USING nota_entrada::text'
            );
        }
    }

    public function down(): void
    {
        // A expansão não é revertida para evitar truncar referências já gravadas.
    }
};
