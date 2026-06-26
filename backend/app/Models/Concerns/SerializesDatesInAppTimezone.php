<?php

namespace App\Models\Concerns;

use Carbon\CarbonImmutable;
use DateTimeInterface;

trait SerializesDatesInAppTimezone
{
    protected function serializeDate(DateTimeInterface $date): string
    {
        return CarbonImmutable::instance($date)
            ->timezone(config('app.timezone', 'America/Sao_Paulo'))
            ->format('Y-m-d\TH:i:s');
    }
}
