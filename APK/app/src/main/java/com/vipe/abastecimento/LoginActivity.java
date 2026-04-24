package com.vipe.abastecimento;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.Typeface;
import android.os.AsyncTask;
import android.os.Bundle;
import android.text.InputType;
import android.view.Gravity;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;
import android.widget.Toast;

import org.json.JSONObject;

/**
 * Tela de login. POST /auth/login e armazena JWT em AuthStore.
 */
public class LoginActivity extends Activity {
    private EditText inputLogin;
    private EditText inputSenha;
    private Button btnEntrar;
    private ProgressBar progress;
    private TextView feedback;
    private AuthStore authStore;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        authStore = new AuthStore(this);

        if (authStore.isAuthenticated()) {
            goToMain();
            return;
        }

        setContentView(buildLayout());
    }

    private LinearLayout buildLayout() {
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setGravity(Gravity.CENTER_VERTICAL);
        root.setBackgroundColor(Color.rgb(13, 20, 39));
        root.setPadding(dp(24), dp(40), dp(24), dp(40));

        TextView title = new TextView(this);
        title.setText("Abastecimento Vipe");
        title.setTextColor(Color.WHITE);
        title.setTextSize(26);
        title.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        title.setGravity(Gravity.CENTER);
        root.addView(title);

        TextView subtitle = new TextView(this);
        subtitle.setText("Entre com seu usuario do sistema para sincronizar os registros.");
        subtitle.setTextColor(Color.rgb(148, 163, 184));
        subtitle.setTextSize(13);
        subtitle.setGravity(Gravity.CENTER);
        subtitle.setPadding(0, dp(8), 0, dp(28));
        root.addView(subtitle);

        inputLogin = buildInput("Login", InputType.TYPE_CLASS_TEXT);
        root.addView(inputLogin);
        space(root, 12);

        inputSenha = buildInput("Senha", InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_PASSWORD);
        root.addView(inputSenha);
        space(root, 20);

        btnEntrar = new Button(this);
        btnEntrar.setText("Entrar");
        btnEntrar.setTextColor(Color.WHITE);
        btnEntrar.setBackgroundColor(Color.rgb(14, 165, 233));
        btnEntrar.setOnClickListener(v -> tentarLogin());
        root.addView(btnEntrar, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, dp(48)));

        progress = new ProgressBar(this);
        progress.setVisibility(android.view.View.GONE);
        LinearLayout.LayoutParams progressParams = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        progressParams.gravity = Gravity.CENTER_HORIZONTAL;
        progressParams.topMargin = dp(16);
        root.addView(progress, progressParams);

        feedback = new TextView(this);
        feedback.setTextColor(Color.rgb(248, 113, 113));
        feedback.setTextSize(13);
        feedback.setGravity(Gravity.CENTER);
        feedback.setPadding(0, dp(12), 0, 0);
        root.addView(feedback);

        TextView help = new TextView(this);
        help.setText("Dica: login padrao admin / admin123");
        help.setTextColor(Color.rgb(100, 116, 139));
        help.setTextSize(11);
        help.setGravity(Gravity.CENTER);
        help.setPadding(0, dp(24), 0, 0);
        root.addView(help);

        return root;
    }

    private EditText buildInput(String hint, int type) {
        EditText e = new EditText(this);
        e.setHint(hint);
        e.setHintTextColor(Color.rgb(100, 116, 139));
        e.setTextColor(Color.WHITE);
        e.setBackgroundColor(Color.rgb(10, 15, 30));
        e.setInputType(type);
        e.setSingleLine(true);
        e.setPadding(dp(14), dp(12), dp(14), dp(12));
        return e;
    }

    private void space(LinearLayout root, int dp) {
        android.view.View v = new android.view.View(this);
        root.addView(v, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, dp(dp)));
    }

    private void tentarLogin() {
        final String login = inputLogin.getText().toString().trim();
        final String senha = inputSenha.getText().toString();
        if (login.isEmpty() || senha.isEmpty()) {
            feedback.setText("Informe login e senha.");
            return;
        }

        feedback.setText("");
        progress.setVisibility(android.view.View.VISIBLE);
        btnEntrar.setEnabled(false);

        new AsyncTask<Void, Void, Object>() {
            @Override
            protected Object doInBackground(Void... voids) {
                try {
                    ApiClient api = new ApiClient(authStore);
                    JSONObject body = new JSONObject();
                    body.put("login", login);
                    body.put("password", senha);

                    JSONObject resp = api.post("/auth/login", body);
                    String token = resp.optString("token");
                    if (token.isEmpty()) {
                        return "Resposta sem token.";
                    }
                    JSONObject user = resp.optJSONObject("user");
                    String nome = user != null ? user.optString("nome", login) : login;
                    String userLogin = user != null ? user.optString("login", login) : login;
                    String tipo = user != null ? user.optString("tipo", "operador") : "operador";
                    authStore.save(token, nome, userLogin, tipo);
                    return Boolean.TRUE;
                } catch (ApiClient.ApiException e) {
                    return e.getMessage();
                } catch (Exception e) {
                    return "Falha na conexao: " + e.getMessage();
                }
            }

            @Override
            protected void onPostExecute(Object result) {
                progress.setVisibility(android.view.View.GONE);
                btnEntrar.setEnabled(true);
                if (result instanceof Boolean && (Boolean) result) {
                    Toast.makeText(LoginActivity.this, "Bem-vindo!", Toast.LENGTH_SHORT).show();
                    goToMain();
                } else {
                    feedback.setText(String.valueOf(result));
                }
            }
        }.execute();
    }

    private void goToMain() {
        startActivity(new Intent(this, MainActivity.class));
        finish();
    }

    private int dp(int value) {
        return (int) (value * getResources().getDisplayMetrics().density);
    }
}
