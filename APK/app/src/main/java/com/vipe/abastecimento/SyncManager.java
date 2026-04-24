package com.vipe.abastecimento;

import android.os.AsyncTask;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.List;

/**
 * Orquestra a sincronizacao em duas fases:
 *  1) DOWNLOAD: baixa proprietarios, veiculos, motoristas, valores_combustivel e abastecimentos
 *     para alimentar os caches locais.
 *  2) UPLOAD: drena sync_queue enviando cada operacao pendente via POST /abastecimentos.
 *
 * Reporta progresso via listener rodando na UI thread.
 */
public class SyncManager {

    public interface Listener {
        void onProgress(String message);
        void onFinish(Result result);
    }

    public static class Result {
        public int baixados;
        public int enviados;
        public int falhas;
        public String erroGlobal;
        public boolean success() { return erroGlobal == null && falhas == 0; }

        public String resumo() {
            if (erroGlobal != null) {
                return "Erro: " + erroGlobal;
            }
            StringBuilder sb = new StringBuilder();
            sb.append("Cadastros atualizados. ");
            if (enviados > 0) sb.append(enviados).append(" enviado(s). ");
            if (falhas > 0) sb.append(falhas).append(" com erro.");
            else if (enviados == 0) sb.append("Nada pendente para enviar.");
            return sb.toString().trim();
        }
    }

    private final ApiClient api;
    private final LocalDatabase db;
    private final Listener listener;

    public SyncManager(ApiClient api, LocalDatabase db, Listener listener) {
        this.api = api;
        this.db = db;
        this.listener = listener;
    }

    public void start() {
        new AsyncTask<Void, String, Result>() {
            @Override
            protected Result doInBackground(Void... voids) {
                Result r = new Result();
                try {
                    publishProgress("Baixando proprietarios...");
                    JSONArray proprietarios = fetchAllPaginated("/proprietarios");
                    db.replaceProprietarios(proprietarios);
                    r.baixados += proprietarios.length();

                    publishProgress("Baixando veiculos...");
                    JSONArray veiculos = fetchAllPaginated("/veiculos");
                    db.replaceVeiculos(veiculos);
                    r.baixados += veiculos.length();

                    publishProgress("Baixando motoristas...");
                    JSONArray motoristas = fetchAllPaginated("/motoristas");
                    db.replaceMotoristas(motoristas);
                    r.baixados += motoristas.length();

                    publishProgress("Baixando precos de combustivel...");
                    JSONArray valores = fetchAllPaginated("/valores-combustivel");
                    db.replaceValoresCombustivel(valores);
                    r.baixados += valores.length();

                    publishProgress("Baixando ultimos abastecimentos...");
                    // Limita a 1 pagina com per_page=100 para nao pesar
                    JSONObject abastResp = api.get("/abastecimentos?per_page=100");
                    JSONArray abastData = extractArray(abastResp);
                    db.replaceAbastecimentosRemotos(abastData);
                    r.baixados += abastData.length();

                    publishProgress("Enviando registros pendentes...");
                    List<LocalDatabase.SyncItem> fila = db.pendingQueue();
                    for (LocalDatabase.SyncItem item : fila) {
                        if ("abastecimento".equals(item.entity) && "create".equals(item.action)) {
                            try {
                                JSONObject resp = api.postRaw("/abastecimentos", item.payload);
                                String remoteId = resp.optString("id_abastecimento");
                                db.markQueueSuccess(item.id, remoteId, item.entityId);
                                r.enviados++;
                                publishProgress("Enviado " + r.enviados + "/" + fila.size() + "...");
                            } catch (Exception e) {
                                r.falhas++;
                                db.markQueueError(item.id, item.entityId, e.getMessage());
                            }
                        }
                    }
                    return r;
                } catch (ApiClient.ApiException e) {
                    r.erroGlobal = e.getMessage();
                    return r;
                } catch (Exception e) {
                    r.erroGlobal = "Falha de rede: " + e.getMessage();
                    return r;
                }
            }

            @Override
            protected void onProgressUpdate(String... values) {
                if (listener != null && values != null && values.length > 0) {
                    listener.onProgress(values[0]);
                }
            }

            @Override
            protected void onPostExecute(Result result) {
                if (listener != null) listener.onFinish(result);
            }
        }.execute();
    }

    /**
     * Baixa todas as paginas de um endpoint paginado por Laravel (estrutura {data, last_page, ...}).
     * Limita a 10 paginas por seguranca.
     */
    private JSONArray fetchAllPaginated(String path) throws Exception {
        JSONArray combined = new JSONArray();
        int page = 1;
        int lastPage = 1;
        do {
            String sep = path.contains("?") ? "&" : "?";
            JSONObject resp = api.get(path + sep + "per_page=100&page=" + page);
            JSONArray pageData = extractArray(resp);
            for (int i = 0; i < pageData.length(); i++) {
                combined.put(pageData.opt(i));
            }
            lastPage = resp.optInt("last_page", page);
            page++;
        } while (page <= lastPage && page <= 10);
        return combined;
    }

    private JSONArray extractArray(JSONObject resp) {
        JSONArray arr = resp.optJSONArray("data");
        return arr != null ? arr : new JSONArray();
    }
}
