<?php
// =============================================
// ProprietarioController.php
// =============================================
namespace App\Http\Controllers;

use App\Models\Proprietario;
use Illuminate\Http\Request;

class ProprietarioController extends Controller
{
    public function index(Request $request)
    {
        $query = Proprietario::query();
        if ($request->filled('search')) {
            $query->where('nome', 'ilike', '%'.$request->search.'%');
        }
        if ($request->filled('status')) {
            $query->where('status', $request->status);
        }
        return new \Illuminate\Http\JsonResponse($query->orderBy('nome')->paginate($request->get('per_page', 50)));
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'nome'        => 'required|string|max:255',
            'status'      => 'nullable|string',
            'responsavel' => 'nullable|string',
            'celular'     => 'nullable|string',
        ]);
        $data['data_registro'] = now();
        return new \Illuminate\Http\JsonResponse(Proprietario::create($data), 201);
    }

    public function show(string $id)
    {
        return new \Illuminate\Http\JsonResponse(Proprietario::with(['veiculos','motoristas'])->findOrFail($id));
    }

    public function update(Request $request, string $id)
    {
        $proprietario = Proprietario::findOrFail($id);
        $proprietario->update($request->validate([
            'nome'        => 'sometimes|string|max:255',
            'status'      => 'nullable|string',
            'responsavel' => 'nullable|string',
            'celular'     => 'nullable|string',
        ]));
        return new \Illuminate\Http\JsonResponse($proprietario->fresh());
    }

    public function destroy(string $id)
    {
        Proprietario::findOrFail($id)->delete();
        return new \Illuminate\Http\JsonResponse(['message' => 'Proprietário excluído']);
    }
}
