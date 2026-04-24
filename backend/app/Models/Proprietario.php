<?php
// app/Models/Proprietario.php
namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Str;

class Proprietario extends Model
{
    protected $table = 'proprietarios';
    protected $primaryKey = 'id_proprietario';
    public $incrementing = false;
    protected $keyType = 'string';
    public $timestamps = false;

    protected $fillable = ['id_proprietario','nome','status','responsavel','celular','observacao','data_registro'];
    protected $casts = ['data_registro' => 'datetime'];

    protected static function boot()
    {
        parent::boot();
        static::creating(fn($m) => $m->id_proprietario ??= (string) Str::uuid());
    }

    public function veiculos() { return $this->hasMany(Veiculo::class,'id_proprietario','id_proprietario'); }
    public function motoristas() { return $this->hasMany(Motorista::class,'id_proprietario','id_proprietario'); }
    public function abastecimentos() { return $this->hasMany(Abastecimento::class,'id_proprietario','id_proprietario'); }
}
