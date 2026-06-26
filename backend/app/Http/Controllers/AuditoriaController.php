<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class AuditoriaController extends Controller
{
    public function index(Request $request)
    {
        $this->garantirAuditoria();

        $query = DB::table('auditoria_alteracoes');

        if ($request->filled('tabela')) {
            $query->where('tabela', $request->query('tabela'));
        }
        if ($request->filled('registro_id')) {
            $query->where('registro_id', (string) $request->query('registro_id'));
        }
        if ($request->filled('acao')) {
            $query->where('acao', $request->query('acao'));
        }

        return new \Illuminate\Http\JsonResponse(
            $query->orderByDesc('created_at')
                ->orderByDesc('id')
                ->paginate((int) $request->get('per_page', 50))
        );
    }

    public function destroyAll()
    {
        $this->garantirAuditoria();
        DB::table('auditoria_alteracoes')->delete();

        return new \Illuminate\Http\JsonResponse([
            'message' => 'Histórico de alterações limpo com sucesso.',
        ]);
    }
}
