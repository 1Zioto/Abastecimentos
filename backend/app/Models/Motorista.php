<?php
namespace App\Models;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Str;
use Illuminate\Support\Facades\Schema;

class Motorista extends Model
{
    private static ?bool $hasSyncTokenColumn = null;
    protected $table = 'motoristas';
    protected $primaryKey = 'id_motorista';
    public $incrementing = false; protected $keyType = 'string'; public $timestamps = false;
    protected $fillable = ['id_motorista','nome','id_proprietario','documento','celular','local','sync_token_at'];
    protected $casts = ['sync_token_at' => 'datetime'];
    protected static function boot()
    {
        parent::boot();
        static::creating(function ($m) {
            $m->id_motorista ??= (string) Str::uuid();
            if (static::supportsSyncToken()) {
                $m->sync_token_at = now();
            }
        });
        static::updating(function ($m) {
            if (static::supportsSyncToken()) {
                $m->sync_token_at = now();
            }
        });
    }

    private static function supportsSyncToken(): bool
    {
        if (static::$hasSyncTokenColumn !== null) {
            return static::$hasSyncTokenColumn;
        }

        try {
            static::$hasSyncTokenColumn = Schema::hasColumn((new static)->getTable(), 'sync_token_at');
        } catch (\Throwable) {
            static::$hasSyncTokenColumn = false;
        }

        return static::$hasSyncTokenColumn;
    }
    public function proprietario() { return $this->belongsTo(Proprietario::class,'id_proprietario','id_proprietario'); }
}
