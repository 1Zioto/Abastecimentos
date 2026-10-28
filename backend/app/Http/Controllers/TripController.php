<?php

namespace App\Http\Controllers;

use App\Http\Requests\StoreTripRequest;
use App\Http\Resources\TripResource;
use App\Models\Trip;
use App\Services\FuelingTripMatchService;
use App\Services\TripResultService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * Viagens e resultado financeiro (Fase 1 do Sistema de Rentabilidade).
 * Endpoints sob /api/v1/trips (protegidos por auth:api).
 */
class TripController extends Controller
{
    public function __construct(
        private TripResultService $resultService,
        private FuelingTripMatchService $fuelMatch,
    ) {
    }

    /** GET /api/v1/trips */
    public function index(Request $request)
    {
        $q = Trip::query()->with(['veiculo', 'motorista']);

        if ($request->filled('status')) $q->where('status', $request->status);
        if ($request->filled('vehicle_id')) $q->where('vehicle_id', $request->vehicle_id);
        if ($request->filled('driver_id')) $q->where('driver_id', $request->driver_id);
        if ($request->filled('client_id')) $q->where('client_id', $request->client_id);
        if ($request->filled('inicio')) $q->where('previsao_saida', '>=', $request->inicio . ' 00:00:00');
        if ($request->filled('fim')) $q->where('previsao_saida', '<=', $request->fim . ' 23:59:59');
        if ($request->boolean('somente_prejuizo')) {
            $q->whereRaw("(resultado_json->'alertas'->>'prejuizo')::boolean = true");
        }

        $q->orderByDesc('created_at');
        return TripResource::collection($q->paginate(min((int) $request->get('per_page', 25), 100)));
    }

    /** GET /api/v1/trips/{trip} */
    public function show(Trip $trip)
    {
        $trip->load(['revenues', 'costs', 'veiculo', 'motorista']);
        return new TripResource($trip);
    }

    /** POST /api/v1/trips */
    public function store(StoreTripRequest $request)
    {
        $data = $request->validated();
        $revenues = $data['revenues'] ?? [];
        $costs = $data['costs'] ?? [];
        unset($data['revenues'], $data['costs']);

        $trip = DB::transaction(function () use ($data, $revenues, $costs) {
            $trip = Trip::create($data);
            foreach ($revenues as $r) $trip->revenues()->create($r);
            foreach ($costs as $c) $trip->costs()->create($c);
            $this->resultService->calcularEGravar($trip->load(['revenues', 'costs']));
            return $trip;
        });

        $trip->load(['revenues', 'costs', 'veiculo', 'motorista']);
        return (new TripResource($trip))->response()->setStatusCode(201);
    }

    /** PUT/PATCH /api/v1/trips/{trip} */
    public function update(StoreTripRequest $request, Trip $trip)
    {
        $data = $request->validated();
        $revenues = $data['revenues'] ?? null;
        $costs = $data['costs'] ?? null;
        unset($data['revenues'], $data['costs']);

        DB::transaction(function () use ($trip, $data, $revenues, $costs) {
            $trip->update($data);
            if (is_array($revenues)) {
                $trip->revenues()->delete();
                foreach ($revenues as $r) $trip->revenues()->create($r);
            }
            if (is_array($costs)) {
                $trip->costs()->delete();
                foreach ($costs as $c) $trip->costs()->create($c);
            }
            $this->resultService->calcularEGravar($trip->load(['revenues', 'costs']));
        });

        $trip->load(['revenues', 'costs', 'veiculo', 'motorista']);
        return new TripResource($trip);
    }

    /** DELETE /api/v1/trips/{trip} */
    public function destroy(Trip $trip)
    {
        $trip->delete(); // soft delete
        return response()->json(['ok' => true]);
    }

    /** POST /api/v1/trips/{trip}/recalcular — recomputa o resultado financeiro. */
    public function recalcular(Trip $trip)
    {
        $trip->load(['revenues', 'costs']);
        $resultado = $this->resultService->calcularEGravar($trip);
        return response()->json(['ok' => true, 'resultado' => $resultado]);
    }

    /** GET /api/v1/trips/{trip}/resultado — só a demonstração financeira. */
    public function resultado(Trip $trip)
    {
        $trip->load(['revenues', 'costs']);
        return response()->json($this->resultService->calcular($trip));
    }

    /** POST /api/v1/trips/{trip}/vincular-abastecimentos
     *  Casa os abastecimentos do veículo no período da viagem e lança como custo. */
    public function vincularAbastecimentos(Trip $trip)
    {
        $r = $this->fuelMatch->vincularViagem($trip);
        $trip->load(['revenues', 'costs', 'veiculo', 'motorista']);
        return response()->json(['ok' => true, 'casamento' => $r, 'trip' => new TripResource($trip)]);
    }

    /** POST /api/v1/trips-vincular-abastecimentos (lote por período)
     *  Body: { inicio, fim, company_id? } */
    public function vincularAbastecimentosLote(Request $request)
    {
        $r = $this->fuelMatch->vincularPeriodo(
            $request->input('inicio'),
            $request->input('fim'),
            $request->input('company_id'),
        );
        return response()->json(['ok' => true, 'resultado' => $r]);
    }
}
