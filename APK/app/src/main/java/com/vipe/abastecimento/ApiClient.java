package com.vipe.abastecimento;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.DataOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

/**
 * Cliente HTTP minimalista usando HttpURLConnection (zero dependencias extras).
 * Adiciona automaticamente o header Authorization a partir do AuthStore.
 */
public class ApiClient {
    public static final String BASE_URL = "https://backend-seven-gilt-97.vercel.app/api";

    private static final int CONNECT_TIMEOUT_MS = 20_000;
    private static final int READ_TIMEOUT_MS = 30_000;

    private final AuthStore auth;

    public ApiClient(AuthStore auth) {
        this.auth = auth;
    }

    public static class ApiException extends IOException {
        public final int statusCode;
        public final String body;

        public ApiException(int statusCode, String message, String body) {
            super(message);
            this.statusCode = statusCode;
            this.body = body;
        }
    }

    public JSONObject get(String path) throws IOException {
        return requestJson("GET", path, null);
    }

    public JSONObject post(String path, JSONObject body) throws IOException {
        return requestJson("POST", path, body != null ? body.toString() : "");
    }

    public JSONObject postRaw(String path, String rawJsonBody) throws IOException {
        return requestJson("POST", path, rawJsonBody);
    }

    private JSONObject requestJson(String method, String path, String body) throws IOException {
        URL url = new URL(BASE_URL + path);
        HttpURLConnection con = null;
        try {
            con = (HttpURLConnection) url.openConnection();
            con.setConnectTimeout(CONNECT_TIMEOUT_MS);
            con.setReadTimeout(READ_TIMEOUT_MS);
            con.setRequestMethod(method);
            con.setRequestProperty("Accept", "application/json");
            con.setRequestProperty("User-Agent", "AbastecimentoVipe-Android/1.0");

            String token = auth.getToken();
            if (token != null && !token.isEmpty()) {
                con.setRequestProperty("Authorization", "Bearer " + token);
            }

            if (body != null) {
                con.setDoOutput(true);
                con.setRequestProperty("Content-Type", "application/json; charset=utf-8");
                byte[] payload = body.getBytes(StandardCharsets.UTF_8);
                con.setFixedLengthStreamingMode(payload.length);
                DataOutputStream out = new DataOutputStream(con.getOutputStream());
                try {
                    out.write(payload);
                    out.flush();
                } finally {
                    out.close();
                }
            }

            int status = con.getResponseCode();
            String responseText = readStream(status >= 200 && status < 300
                    ? con.getInputStream()
                    : con.getErrorStream());

            if (status >= 200 && status < 300) {
                if (responseText == null || responseText.isEmpty()) {
                    return new JSONObject();
                }
                // Algumas respostas vem como array direto. Embrulhamos em objeto para uniformizar.
                String trimmed = responseText.trim();
                if (trimmed.startsWith("[")) {
                    JSONObject wrapper = new JSONObject();
                    try {
                        wrapper.put("data", new org.json.JSONArray(trimmed));
                    } catch (Exception ignored) {}
                    return wrapper;
                }
                try {
                    return new JSONObject(trimmed);
                } catch (Exception e) {
                    JSONObject wrapper = new JSONObject();
                    try { wrapper.put("raw", trimmed); } catch (Exception ignored) {}
                    return wrapper;
                }
            }

            String message = extractMessage(responseText, status);
            throw new ApiException(status, message, responseText);
        } finally {
            if (con != null) con.disconnect();
        }
    }

    private String readStream(InputStream stream) {
        if (stream == null) return "";
        StringBuilder sb = new StringBuilder();
        BufferedReader reader = null;
        try {
            reader = new BufferedReader(new InputStreamReader(stream, StandardCharsets.UTF_8));
            String line;
            while ((line = reader.readLine()) != null) {
                sb.append(line).append('\n');
            }
        } catch (IOException ignored) {
        } finally {
            if (reader != null) {
                try { reader.close(); } catch (IOException ignored) {}
            }
        }
        return sb.toString().trim();
    }

    private String extractMessage(String body, int status) {
        if (body == null || body.isEmpty()) return "HTTP " + status;
        try {
            JSONObject json = new JSONObject(body);
            String message = json.optString("message", null);
            if (message != null && !message.isEmpty()) return message;
        } catch (Exception ignored) {}
        return "HTTP " + status + ": " + body;
    }
}
