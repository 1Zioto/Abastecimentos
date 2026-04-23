<?php

namespace App\Http\Controllers;

use App\Models\Usuario;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Tymon\JWTAuth\Facades\JWTAuth;
use Tymon\JWTAuth\Exceptions\JWTException;

class AuthController extends Controller
{
    public function login(Request $request)
    {
        $request->validate([
            'login' => 'required|string',
            'password' => 'required|string',
        ]);

        $usuario = Usuario::where('login', $request->login)->first();

        if (!$usuario || !Hash::check($request->password, $usuario->password)) {
            return response()->json(['message' => 'Credenciais inválidas'], 401);
        }

        try {
            $token = JWTAuth::fromUser($usuario);
        } catch (JWTException $e) {
            return response()->json(['message' => 'Erro ao gerar token'], 500);
        }

        $usuario->update(['ultimo_acesso' => now()]);

        return response()->json([
            'token' => $token,
            'token_type' => 'bearer',
            'expires_in' => config('jwt.ttl') * 60,
            'user' => [
                'id' => $usuario->id_user,
                'nome' => $usuario->nome,
                'login' => $usuario->login,
                'tipo' => $usuario->tipo,
            ]
        ]);
    }

    public function logout()
    {
        JWTAuth::invalidate(JWTAuth::getToken());
        return response()->json(['message' => 'Logout realizado com sucesso']);
    }

    public function me()
    {
        $user = JWTAuth::parseToken()->authenticate();
        return response()->json([
            'id' => $user->id_user,
            'nome' => $user->nome,
            'login' => $user->login,
            'tipo' => $user->tipo,
        ]);
    }

    public function refresh()
    {
        try {
            $newToken = JWTAuth::refresh(JWTAuth::getToken());
            return response()->json(['token' => $newToken]);
        } catch (JWTException $e) {
            return response()->json(['message' => 'Token inválido'], 401);
        }
    }
}
