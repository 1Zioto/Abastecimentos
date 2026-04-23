<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

class DatabaseSeeder extends Seeder
{
    public function run(): void
    {
        // Criar usuário admin padrão se não existir
        $exists = DB::table('usuarios')->where('login', 'admin')->exists();

        if (!$exists) {
            DB::table('usuarios')->insert([
                'id_user'       => (string) Str::uuid(),
                'nome'          => 'Administrador',
                'login'         => 'admin',
                'password'      => Hash::make('admin123'),
                'tipo'          => 'admin',
                'ultimo_acesso' => null,
            ]);

            $this->command->info('✅ Usuário admin criado: login=admin / senha=admin123');
            $this->command->warn('⚠️  Troque a senha padrão imediatamente após o primeiro login!');
        } else {
            $this->command->info('ℹ️  Usuário admin já existe.');
        }
    }
}
