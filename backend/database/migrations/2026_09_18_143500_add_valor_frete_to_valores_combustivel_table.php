<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasColumn('valores_combustivel', 'valor_frete')) {
            Schema::table('valores_combustivel', function (Blueprint $table) {
                $table->decimal('valor_frete', 10, 3)->nullable()->default(0.040);
            });
            DB::table('valores_combustivel')->whereNull('valor_frete')->update(['valor_frete' => 0.040]);
        }
    }

    public function down(): void
    {
        if (Schema::hasColumn('valores_combustivel', 'valor_frete')) {
            Schema::table('valores_combustivel', function (Blueprint $table) {
                $table->dropColumn('valor_frete');
            });
        }
    }
};
