<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Database\DatabaseManager;
use Illuminate\Http\Request;
use Psr\Log\LoggerInterface;
use Symfony\Component\HttpFoundation\Response;
use Throwable;

class UseDatabaseFallback
{
    public function __construct(
        private readonly DatabaseManager $database,
        private readonly LoggerInterface $logger,
    ) {}

    public function handle(Request $request, Closure $next): Response
    {
        $primary = config('database.default', 'pgsql');

        try {
            $this->database->connection($primary)->select('select 1');
        } catch (Throwable $primaryError) {
            $this->database->purge($primary);

            if (! config('database.connections.pgsql_fallback.url')) {
                throw $primaryError;
            }

            try {
                $this->database->connection('pgsql_fallback')->select('select 1');
                $this->database->setDefaultConnection('pgsql_fallback');

                $this->logger->warning('Banco principal indisponível; usando conexão secundária.', [
                    'primary_connection' => $primary,
                    'error' => $primaryError->getMessage(),
                ]);
            } catch (Throwable $fallbackError) {
                $this->database->purge('pgsql_fallback');

                $this->logger->error('Bancos principal e secundário indisponíveis.', [
                    'primary_error' => $primaryError->getMessage(),
                    'fallback_error' => $fallbackError->getMessage(),
                ]);

                throw $fallbackError;
            }
        }

        return $next($request);
    }
}
