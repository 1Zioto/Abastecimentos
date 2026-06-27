<?php

require __DIR__.'/vendor/autoload.php';
$app = require_once __DIR__.'/bootstrap/app.php';
$app->make(\Illuminate\Contracts\Console\Kernel::class)->bootstrap();

use App\Services\GoogleDriveService;
use Illuminate\Support\Facades\Http;

class GoogleDriveInspector extends GoogleDriveService {
    public function listFiles() {
        $refMethod = new ReflectionMethod(GoogleDriveService::class, 'accessToken');
        $refMethod->setAccessible(true);
        $accessToken = $refMethod->invoke($this);
        
        $refFolder = new ReflectionMethod(GoogleDriveService::class, 'folderId');
        $refFolder->setAccessible(true);
        $folderId = $refFolder->invoke($this, $accessToken);
        
        echo "Pasta ID: $folderId\n";
        
        $url = "https://www.googleapis.com/drive/v3/files";
        $response = Http::withToken($accessToken)
            ->connectTimeout(10)
            ->timeout(25)
            ->get($url, [
                'q' => "'$folderId' in parents and trashed = false",
                'fields' => 'files(id, name, mimeType, createdTime, webViewLink)',
                'orderBy' => 'createdTime desc'
            ]);
            
        if (!$response->successful()) {
            throw new Exception("Erro API Google Drive: " . $response->body());
        }
        
        return $response->json('files') ?? [];
    }
}

$inspector = new GoogleDriveInspector();
try {
    $files = $inspector->listFiles();
    echo "=== ARQUIVOS NA PASTA DO GOOGLE DRIVE ===\n";
    echo "Total de arquivos: " . count($files) . "\n\n";
    foreach ($files as $f) {
        echo "ID: " . $f['id'] . "\n";
        echo "Nome: " . $f['name'] . "\n";
        echo "Tipo: " . $f['mimeType'] . "\n";
        echo "Criado em: " . $f['createdTime'] . "\n";
        echo "Link: " . $f['webViewLink'] . "\n";
        echo "----------------------------------------\n";
    }
} catch (Exception $e) {
    echo "Erro: " . $e->getMessage() . "\n";
}
