<?php
namespace App\Models;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Str;

class EntradaNota extends Model
{
    protected $table = 'entrada_notas';
    protected $primaryKey = 'id_financeiro';
    public $incrementing = false; protected $keyType = 'string'; public $timestamps = false;
    protected $fillable = ['id_financeiro','data','numero_nota_fiscal','valor','quantidade','valor_litro','responsavel','foto_nota','tipo'];
    protected $casts = ['data' => 'date','valor' => 'decimal:2','quantidade' => 'decimal:2','valor_litro' => 'decimal:3'];
    protected static function boot() { parent::boot(); static::creating(fn($m) => $m->id_financeiro ??= (string) Str::uuid()); }
}
