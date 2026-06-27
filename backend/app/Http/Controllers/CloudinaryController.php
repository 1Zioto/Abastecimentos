<?php

namespace App\Http\Controllers;

use App\Services\CloudinaryManager;
use Illuminate\Http\JsonResponse;

class CloudinaryController extends Controller
{
    public function __construct(private CloudinaryManager $manager)
    {
    }

    /** Uso de cada conta da pool e qual está ativa. */
    public function status(): JsonResponse
    {
        return new JsonResponse($this->manager->status());
    }

    /** Força reavaliação imediata do uso e da conta ativa. */
    public function reavaliar(): JsonResponse
    {
        $index = $this->manager->reavaliar();
        return new JsonResponse([
            'message'           => 'Pool Cloudinary reavaliada.',
            'conta_ativa_index' => $index,
        ] + $this->manager->status());
    }
}
