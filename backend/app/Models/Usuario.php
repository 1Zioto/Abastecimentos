<?php

namespace App\Models;

use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Support\Str;
use Tymon\JWTAuth\Contracts\JWTSubject;

class Usuario extends Authenticatable implements JWTSubject
{
    protected $table = 'usuarios';
    protected $primaryKey = 'id_user';
    public $incrementing = false;
    protected $keyType = 'string';
    public $timestamps = false;

    protected $fillable = ['id_user','nome','login','password','ultimo_acesso','tipo'];
    protected $hidden = ['password'];
    protected $casts = ['ultimo_acesso' => 'datetime'];

    protected static function boot()
    {
        parent::boot();
        static::creating(fn($m) => $m->id_user ??= (string) Str::uuid());
    }

    public function getJWTIdentifier() { return $this->getKey(); }
    public function getJWTCustomClaims() { return ['tipo' => $this->tipo]; }
}
