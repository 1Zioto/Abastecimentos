package com.vipe.abastecimento;

import android.content.Context;
import android.content.SharedPreferences;

/**
 * Persistencia simples do JWT + informacoes do usuario logado.
 * Usa SharedPreferences normal (sem keystore) -- o backend usa JWT com TTL,
 * entao o roubo do token tem janela de validade curta.
 */
public class AuthStore {
    private static final String PREFS = "abastecimento_vipe_auth";
    private static final String KEY_TOKEN = "jwt_token";
    private static final String KEY_NOME = "user_nome";
    private static final String KEY_LOGIN = "user_login";
    private static final String KEY_TIPO = "user_tipo";

    private final SharedPreferences prefs;

    public AuthStore(Context context) {
        this.prefs = context.getApplicationContext()
                .getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    public void save(String token, String nome, String login, String tipo) {
        prefs.edit()
                .putString(KEY_TOKEN, token)
                .putString(KEY_NOME, nome)
                .putString(KEY_LOGIN, login)
                .putString(KEY_TIPO, tipo)
                .apply();
    }

    public void clear() {
        prefs.edit().clear().apply();
    }

    public boolean isAuthenticated() {
        String token = getToken();
        return token != null && !token.isEmpty();
    }

    public String getToken() {
        return prefs.getString(KEY_TOKEN, null);
    }

    public String getNome() {
        return prefs.getString(KEY_NOME, "");
    }

    public String getLogin() {
        return prefs.getString(KEY_LOGIN, "");
    }

    public String getTipo() {
        return prefs.getString(KEY_TIPO, "");
    }
}
