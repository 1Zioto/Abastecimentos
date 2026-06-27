<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;

class AppUpdateController extends Controller
{
    public function show(Request $request)
    {
        $notes = env(
            'APP_APK_RELEASE_NOTES',
            "Novo filtro por Fornecedor na tela de Entrada de Notas"
                . "\nCorreção na exibição de data e hora na lista de Entrada de Notas"
                . "\nAtualizações futuras passam a ser aplicadas automaticamente via Shorebird (sem precisar baixar novo APK)"
        );

        return response()->json([
            'platform' => 'android',
            'latest_version_code' => (int) env('APP_APK_VERSION_CODE', 5911),
            'latest_version_name' => env('APP_APK_VERSION_NAME', '2.0 - Update 24'),
            'apk_url' => env(
                'APP_APK_URL',
                'https://abastecimentovipetrasportes.vercel.app/assets/downloads/vipe-abastecimento-2.0-update-24-5911.apk'
            ),
            'required' => filter_var(env('APP_APK_REQUIRED', false), FILTER_VALIDATE_BOOLEAN),
            'title' => env('APP_APK_UPDATE_TITLE', 'Versão 2.0 - Update 24 disponível'),
            'message' => env(
                'APP_APK_UPDATE_MESSAGE',
                'Há uma nova versão do aplicativo disponível. Atualize para receber as melhorias e correções mais recentes.'
            ),
            'release_notes' => array_values(array_filter(array_map(
                'trim',
                preg_split('/\r\n|\r|\n/', str_replace('\\n', "\n", $notes))
            ))),
        ]);
    }
}
