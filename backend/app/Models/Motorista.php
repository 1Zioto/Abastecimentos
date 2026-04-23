<?php
namespace App\Models;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Str;

class Motorista extends Model
{
    protected $table = 'motoristas';
    protected $primaryKey = 'id_motorista';
    public $incrementing = false; protected $keyType = 'string'; public $timestamps = false;
    protected $fillable = ['id_motorista','nome','id_proprietario','documento','celular'];
    protected static function boot() { parent::boot(); static::creating(fn($m) => $m->id_motorista ??= (string) Str::uuid()); }
    public function proprietario() { return $this->belongsTo(Proprietario::class,'id_proprietario','id_proprietario'); }
}
