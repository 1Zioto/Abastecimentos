<?php

namespace App\Http\Controllers;

class AppUpdateController extends Controller
{
    public function show()
    {
        return response()->json([
            'platform' => 'android',
            'distribution' => 'google_play',
            // O valor zero mantém o atualizador próprio desativado também
            // nas versões antigas do APK, que consultam este endpoint.
            'latest_version_code' => 0,
            'latest_version_name' => null,
            'apk_url' => null,
            'required' => false,
            'title' => null,
            'message' => 'As atualizações do aplicativo são gerenciadas pela Google Play.',
            'release_notes' => [],
        ])->withHeaders([
            'Cache-Control' => 'public, max-age=3600',
            'Vercel-CDN-Cache-Control' => 'public, s-maxage=21600, stale-while-revalidate=86400',
        ]);
    }
}
