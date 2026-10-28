<?php

namespace App\Services;

use Carbon\Carbon;

class VipeAbastecimentoConferenceService
{
    public const STATUS_OK = 'ok';
    public const STATUS_ATENCAO = 'atencao';
    public const STATUS_PENDENTE = 'pendente';

    public function normalizeText(?string $value): string
    {
        $text = trim((string) $value);
        if ($text === '') {
            return '';
        }

        $ascii = iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', $text);
        $normalized = mb_strtoupper($ascii !== false ? $ascii : $text);

        return trim((string) preg_replace('/[^A-Z0-9]+/', ' ', $normalized));
    }

    public function normalizePlate(?string $value): string
    {
        return (string) preg_replace('/[^A-Z0-9]/', '', mb_strtoupper(trim((string) $value)));
    }

    public function isVipeTransportes(?string $ownerName): bool
    {
        $name = $this->normalizeText($ownerName);

        return str_contains($name, 'VIPE') && str_contains($name, 'TRANSPORT');
    }

    /**
     * Compara cada linha do relatório com no máximo um abastecimento do sistema.
     * Um lançamento nunca pode aprovar duas linhas distintas do arquivo.
     *
     * @param  array<int, array<string, mixed>>  $reportRows
     * @param  array<int, array<string, mixed>>  $systemRows
     * @return array{items: array<int, array<string, mixed>>, summary: array<string, mixed>}
     */
    public function compare(
        array $reportRows,
        array $systemRows,
        float $moneyTolerance = 0.05,
        float $quantityTolerance = 0.10,
    ): array {
        $systemByPlate = [];
        foreach ($systemRows as $row) {
            $plate = $this->normalizePlate($row['placa'] ?? null);
            $dateTime = $this->dateTime($row['data_hora'] ?? $row['data'] ?? null);
            $date = $this->dateOnly($dateTime);
            if ($plate === '' || $date === null) {
                continue;
            }

            $normalized = [
                'id_abastecimento' => (string) ($row['id_abastecimento'] ?? ''),
                'placa' => $plate,
                'data' => $date,
                'data_hora' => $dateTime,
                'quantidade_litros' => $this->nullableFloat($row['quantidade_litros'] ?? null),
                'valor_por_litro' => $this->nullableFloat($row['valor_por_litro'] ?? null),
                'valor_total' => $this->nullableFloat($row['valor_total'] ?? null),
                'local' => $row['local'] ?? null,
                'sofit_id' => trim((string) ($row['sofit_id'] ?? '')) ?: null,
                'sofit_trip_id' => trim((string) ($row['sofit_trip_id'] ?? '')) ?: null,
            ];
            $systemByPlate[$plate][] = $normalized;
        }

        $usedIds = [];
        $items = [];

        $preparedRows = [];
        foreach ($reportRows as $index => $reportRow) {
            $plate = $this->normalizePlate($reportRow['placa'] ?? null);
            $dateTime = $this->dateTime($reportRow['data_hora'] ?? $reportRow['data'] ?? null);
            $date = $this->dateOnly($dateTime);
            $reportValue = $this->nullableFloat($reportRow['valor_total'] ?? null);
            $reportQuantity = $this->nullableFloat($reportRow['quantidade_litros'] ?? null);
            $document = $this->normalizeSofitId($reportRow['documento'] ?? null);
            $tripCode = $this->normalizeTripCode($reportRow['codigo_viagem'] ?? null);
            $priority = 3;
            foreach ($systemByPlate[$plate] ?? [] as $candidate) {
                if ($document !== '' && $this->normalizeSofitId($candidate['sofit_id']) === $document) {
                    $priority = 0;
                    break;
                }
                if (
                    $tripCode !== ''
                    && $this->normalizeTripCode($candidate['sofit_trip_id']) === $tripCode
                    && $this->candidateFullyMatches(
                        $candidate,
                        $reportValue,
                        $reportQuantity,
                        $moneyTolerance,
                        $quantityTolerance,
                    )
                ) {
                    $priority = min($priority, 1);
                    continue;
                }
                if (
                    abs($this->dayDifference($candidate['data'], $date) ?? PHP_INT_MAX) <= 1
                    && $this->candidateFullyMatches(
                        $candidate,
                        $reportValue,
                        $reportQuantity,
                        $moneyTolerance,
                        $quantityTolerance,
                    )
                ) {
                    $priority = min($priority, 2);
                }
            }
            $preparedRows[] = [
                'row' => $reportRow,
                'original_order' => $index,
                'priority' => $priority,
            ];
        }
        usort($preparedRows, function (array $a, array $b) {
            return [$a['priority'], $a['original_order']] <=> [$b['priority'], $b['original_order']];
        });

        foreach ($preparedRows as $prepared) {
            $reportRow = $prepared['row'];
            $plate = $this->normalizePlate($reportRow['placa'] ?? null);
            $reportDateTime = $this->dateTime($reportRow['data_hora'] ?? $reportRow['data'] ?? null);
            $date = $this->dateOnly($reportDateTime);
            $reportValue = $this->nullableFloat($reportRow['valor_total'] ?? null);
            $reportQuantity = $this->nullableFloat($reportRow['quantidade_litros'] ?? null);
            $document = trim((string) ($reportRow['documento'] ?? '')) ?: null;
            $tripCode = trim((string) ($reportRow['codigo_viagem'] ?? '')) ?: null;
            $normalizedDocument = $this->normalizeSofitId($document);
            $normalizedTripCode = $this->normalizeTripCode($tripCode);

            $base = [
                'linha' => (int) ($reportRow['linha'] ?? 0),
                'placa' => $plate,
                'data' => $date,
                'data_hora' => $reportDateTime,
                'documento' => $document,
                'codigo_viagem' => $tripCode,
                'item' => $reportRow['item'] ?? null,
                'descricao' => $reportRow['descricao'] ?? null,
                'valor_relatorio' => $reportValue,
                'quantidade_relatorio' => $reportQuantity,
                '_original_order' => $prepared['original_order'],
            ];

            $available = array_values(array_filter(
                $systemByPlate[$plate] ?? [],
                fn (array $candidate) => !isset($usedIds[$candidate['id_abastecimento']]),
            ));

            $withinDateWindow = array_values(array_filter(
                $available,
                fn (array $candidate) => abs(
                    $this->dayDifference($candidate['data'], $date) ?? PHP_INT_MAX,
                ) <= 1,
            ));
            $sameDocument = $normalizedDocument === '' ? [] : array_values(array_filter(
                $available,
                fn (array $candidate) => $this->normalizeSofitId($candidate['sofit_id'])
                    === $normalizedDocument,
            ));
            $sameTrip = $normalizedTripCode === '' ? [] : array_values(array_filter(
                $available,
                fn (array $candidate) => $this->normalizeTripCode($candidate['sofit_trip_id'])
                    === $normalizedTripCode,
            ));

            $match = null;
            $ambiguous = false;
            $matchCriterion = null;
            if ($sameDocument !== []) {
                $matchCriterion = 'documento_sofit';
                [$match, $ambiguous] = $this->bestCandidate(
                    $sameDocument,
                    $reportValue,
                    $reportQuantity,
                    $date,
                );
            } elseif ($sameTrip !== []) {
                $matchCriterion = 'codigo_viagem';
                [$match, $ambiguous] = $this->bestCandidate(
                    $sameTrip,
                    $reportValue,
                    $reportQuantity,
                    $date,
                );
            } elseif ($withinDateWindow !== []) {
                $matchCriterion = 'placa_data';
                [$match, $ambiguous] = $this->bestCandidate(
                    $withinDateWindow,
                    $reportValue,
                    $reportQuantity,
                    $date,
                );
            }

            if ($match === null) {
                $items[] = $base + [
                    'status' => self::STATUS_PENDENTE,
                    'status_label' => 'Pendente de lançamento',
                    'mensagem' => 'Nenhum abastecimento encontrado para esta placa e data.',
                    'abastecimento' => null,
                    'diferenca_valor' => null,
                    'diferenca_quantidade' => null,
                    'diferenca_dias' => null,
                    'criterio_vinculo' => null,
                ];
                continue;
            }

            if ($match['id_abastecimento'] !== '') {
                $usedIds[$match['id_abastecimento']] = true;
            }

            $valueDifference = ($reportValue !== null && $match['valor_total'] !== null)
                ? round($match['valor_total'] - $reportValue, 2)
                : null;
            $quantityDifference = ($reportQuantity !== null && $match['quantidade_litros'] !== null)
                ? round($match['quantidade_litros'] - $reportQuantity, 2)
                : null;
            $dateDifference = $this->dayDifference($match['data'], $date);
            $shiftedDate = $dateDifference !== null && $dateDifference !== 0;
            $dateWithinTolerance = $dateDifference !== null && abs($dateDifference) <= 1;
            $systemDocument = $this->normalizeSofitId($match['sofit_id']);
            $systemTripCode = $this->normalizeTripCode($match['sofit_trip_id']);
            $documentMatches = $normalizedDocument === ''
                || ($systemDocument !== '' && $systemDocument === $normalizedDocument);
            $tripMatches = $normalizedTripCode === ''
                || ($systemTripCode !== '' && $systemTripCode === $normalizedTripCode);

            $valueMatches = $reportValue === null
                || ($match['valor_total'] !== null && abs($valueDifference ?? INF) <= $moneyTolerance);
            $quantityMatches = $reportQuantity === null
                || ($match['quantidade_litros'] !== null && abs($quantityDifference ?? INF) <= $quantityTolerance);
            $hasComparableValue = $reportValue !== null || $reportQuantity !== null;

            $isOk = !$ambiguous
                && $hasComparableValue
                && $valueMatches
                && $quantityMatches
                && $dateWithinTolerance
                && $documentMatches
                && $tripMatches;
            $messages = [];
            if ($shiftedDate && $dateWithinTolerance) {
                $direction = $dateDifference > 0 ? 'dia seguinte' : 'dia anterior';
                $messages[] = "Data localizada no {$direction}, dentro da tolerância de ±1 dia.";
            } elseif (!$dateWithinTolerance) {
                $days = abs($dateDifference ?? 0);
                $messages[] = "Data diverge em {$days} dia(s), fora da tolerância de ±1 dia.";
            }
            if ($ambiguous) {
                $messages[] = 'Há mais de um lançamento igualmente provável.';
            }
            if (!$valueMatches) {
                $messages[] = 'O valor total diverge do relatório.';
            }
            if (!$quantityMatches) {
                $messages[] = 'A quantidade em litros diverge do relatório.';
            }
            if (!$documentMatches) {
                $messages[] = 'O identificador DES diverge do sofit_id do lançamento.';
            }
            if (!$tripMatches) {
                $systemTripLabel = trim((string) ($match['sofit_trip_id'] ?? '')) ?: 'não informado';
                $messages[] = "Código da viagem diverge: planilha {$tripCode}; Lançar no Sofit {$systemTripLabel}.";
            }
            if (!$hasComparableValue) {
                $messages[] = 'O arquivo não trouxe valor nem quantidade para validar.';
            }

            $items[] = $base + [
                'status' => $isOk ? self::STATUS_OK : self::STATUS_ATENCAO,
                'status_label' => $isOk ? 'Tudo OK' : 'Ponto de atenção',
                'mensagem' => $isOk
                    ? (
                        $shiftedDate
                            ? $messages[0] . ' Placa e valores conferem.'
                            : 'Documento Sofit, código da viagem, placa, data e valores conferem.'
                    )
                    : implode(' ', $messages),
                'abastecimento' => $match,
                'diferenca_valor' => $valueDifference,
                'diferenca_quantidade' => $quantityDifference,
                'diferenca_dias' => $dateDifference,
                'criterio_vinculo' => $matchCriterion,
            ];
        }

        usort($items, fn (array $a, array $b) => $a['_original_order'] <=> $b['_original_order']);
        foreach ($items as &$item) {
            unset($item['_original_order']);
        }
        unset($item);

        return [
            'items' => $items,
            'summary' => $this->summary($items),
        ];
    }

    /**
     * @param  array<string, mixed>  $candidate
     */
    private function candidateFullyMatches(
        array $candidate,
        ?float $reportValue,
        ?float $reportQuantity,
        float $moneyTolerance,
        float $quantityTolerance,
    ): bool {
        if ($reportValue === null && $reportQuantity === null) {
            return false;
        }

        $valueMatches = $reportValue === null
            || (
                $candidate['valor_total'] !== null
                && abs($candidate['valor_total'] - $reportValue) <= $moneyTolerance
            );
        $quantityMatches = $reportQuantity === null
            || (
                $candidate['quantidade_litros'] !== null
                && abs($candidate['quantidade_litros'] - $reportQuantity) <= $quantityTolerance
            );

        return $valueMatches && $quantityMatches;
    }

    /**
     * @param  array<int, array<string, mixed>>  $candidates
     * @return array{0: array<string, mixed>, 1: bool}
     */
    private function bestCandidate(
        array $candidates,
        ?float $reportValue,
        ?float $reportQuantity,
        ?string $reportDate,
    ): array {
        $scored = array_map(function (array $candidate) use (
            $reportValue,
            $reportQuantity,
            $reportDate,
        ) {
            $score = 0.0;
            if ($reportValue !== null) {
                $score += $candidate['valor_total'] === null
                    ? 1000000
                    : abs($candidate['valor_total'] - $reportValue);
            }
            if ($reportQuantity !== null) {
                $score += $candidate['quantidade_litros'] === null
                    ? 1000000
                    : abs($candidate['quantidade_litros'] - $reportQuantity) * 10;
            }
            $score += abs($this->dayDifference($candidate['data'], $reportDate) ?? 2) * 0.000001;

            return ['candidate' => $candidate, 'score' => $score];
        }, $candidates);

        usort($scored, fn (array $a, array $b) => $a['score'] <=> $b['score']);
        $best = $scored[0];
        $ambiguous = isset($scored[1]) && abs($scored[1]['score'] - $best['score']) < 0.0001;

        return [$best['candidate'], $ambiguous];
    }

    /**
     * @param  array<int, array<string, mixed>>  $items
     * @return array<string, mixed>
     */
    private function summary(array $items): array
    {
        $summary = [
            'total' => count($items),
            'ok' => 0,
            'atencao' => 0,
            'pendentes' => 0,
            'valor_relatorio' => 0.0,
            'valor_sistema' => 0.0,
            'diferenca_valor' => 0.0,
            'quantidade_relatorio' => 0.0,
            'quantidade_sistema' => 0.0,
            'diferenca_quantidade' => 0.0,
        ];

        foreach ($items as $item) {
            if ($item['status'] === self::STATUS_OK) {
                $summary['ok']++;
            } elseif ($item['status'] === self::STATUS_ATENCAO) {
                $summary['atencao']++;
            } else {
                $summary['pendentes']++;
            }

            $summary['valor_relatorio'] += (float) ($item['valor_relatorio'] ?? 0);
            $summary['quantidade_relatorio'] += (float) ($item['quantidade_relatorio'] ?? 0);
            if (is_array($item['abastecimento'] ?? null)) {
                $summary['valor_sistema'] += (float) ($item['abastecimento']['valor_total'] ?? 0);
                $summary['quantidade_sistema'] += (float) ($item['abastecimento']['quantidade_litros'] ?? 0);
            }
        }

        foreach (['valor_relatorio', 'valor_sistema', 'quantidade_relatorio', 'quantidade_sistema'] as $key) {
            $summary[$key] = round($summary[$key], 2);
        }
        $summary['diferenca_valor'] = round($summary['valor_sistema'] - $summary['valor_relatorio'], 2);
        $summary['diferenca_quantidade'] = round(
            $summary['quantidade_sistema'] - $summary['quantidade_relatorio'],
            2,
        );

        return $summary;
    }

    private function dateOnly(mixed $value): ?string
    {
        if ($value === null || trim((string) $value) === '') {
            return null;
        }

        try {
            return Carbon::parse((string) $value)->toDateString();
        } catch (\Throwable) {
            return null;
        }
    }

    private function dateTime(mixed $value): ?string
    {
        if ($value === null || trim((string) $value) === '') {
            return null;
        }

        try {
            return Carbon::parse((string) $value)->format('Y-m-d H:i:s');
        } catch (\Throwable) {
            return null;
        }
    }

    private function dayDifference(?string $systemDate, ?string $reportDate): ?int
    {
        if ($systemDate === null || $reportDate === null) {
            return null;
        }

        return (int) Carbon::parse($reportDate)
            ->startOfDay()
            ->diffInDays(Carbon::parse($systemDate)->startOfDay(), false);
    }

    private function normalizeSofitId(mixed $value): string
    {
        $normalized = (string) preg_replace(
            '/[^A-Z0-9]/',
            '',
            mb_strtoupper(trim((string) $value)),
        );

        return (string) preg_replace('/^DES/', '', $normalized);
    }

    private function normalizeTripCode(mixed $value): string
    {
        return (string) preg_replace(
            '/[^A-Z0-9]/',
            '',
            mb_strtoupper(trim((string) $value)),
        );
    }

    private function nullableFloat(mixed $value): ?float
    {
        if ($value === null || $value === '') {
            return null;
        }

        return is_numeric($value) ? (float) $value : null;
    }
}
