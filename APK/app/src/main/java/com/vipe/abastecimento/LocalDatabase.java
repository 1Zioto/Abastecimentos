package com.vipe.abastecimento;

import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.database.sqlite.SQLiteOpenHelper;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/**
 * Banco local SQLite com caches dos cadastros e fila de sincronizacao.
 *
 * Tabelas:
 *  - proprietarios, veiculos, motoristas, valores_combustivel  -> cache baixado do backend
 *  - abastecimentos                                            -> registros locais + cache remoto
 *  - sync_queue                                                -> fila de operacoes pendentes
 */
public class LocalDatabase extends SQLiteOpenHelper {
    private static final String DB_NAME = "abastecimento_vipe_offline.db";
    private static final int DB_VERSION = 2;

    public LocalDatabase(Context context) {
        super(context, DB_NAME, null, DB_VERSION);
    }

    @Override
    public void onCreate(SQLiteDatabase db) {
        db.execSQL(
                "CREATE TABLE proprietarios (" +
                        "id_proprietario TEXT PRIMARY KEY, " +
                        "nome TEXT NOT NULL, " +
                        "status TEXT, " +
                        "responsavel TEXT, " +
                        "celular TEXT, " +
                        "observacao TEXT" +
                        ")"
        );

        db.execSQL(
                "CREATE TABLE veiculos (" +
                        "id_veiculo TEXT PRIMARY KEY, " +
                        "id_proprietario TEXT NOT NULL, " +
                        "placa TEXT NOT NULL, " +
                        "marca TEXT, " +
                        "modelo TEXT, " +
                        "ano TEXT, " +
                        "tipo_combustivel TEXT, " +
                        "odometro INTEGER" +
                        ")"
        );

        db.execSQL(
                "CREATE TABLE motoristas (" +
                        "id_motorista TEXT PRIMARY KEY, " +
                        "id_proprietario TEXT NOT NULL, " +
                        "nome TEXT NOT NULL, " +
                        "documento TEXT, " +
                        "celular TEXT" +
                        ")"
        );

        db.execSQL(
                "CREATE TABLE valores_combustivel (" +
                        "tipo_combustivel TEXT PRIMARY KEY, " +
                        "valor REAL NOT NULL, " +
                        "data TEXT" +
                        ")"
        );

        db.execSQL(
                "CREATE TABLE abastecimentos (" +
                        "id_local TEXT PRIMARY KEY, " +
                        "id_remoto TEXT, " +
                        "data TEXT NOT NULL, " +
                        "data_hora TEXT NOT NULL, " +
                        "frentista TEXT, " +
                        "id_proprietario TEXT NOT NULL, " +
                        "nome_proprietario TEXT, " +
                        "id_veiculo TEXT NOT NULL, " +
                        "placa TEXT, " +
                        "id_motorista TEXT, " +
                        "nome_motorista TEXT, " +
                        "local TEXT NOT NULL, " +
                        "tipo_combustivel TEXT NOT NULL, " +
                        "quantidade_litros REAL NOT NULL, " +
                        "valor_por_litro REAL NOT NULL, " +
                        "valor_total REAL NOT NULL, " +
                        "odometro INTEGER, " +
                        "foto_odometro TEXT, " +
                        "bomba TEXT, " +
                        "observacao TEXT, " +
                        "status TEXT NOT NULL, " +
                        "sync_status TEXT NOT NULL, " +
                        "origem TEXT NOT NULL, " +
                        "last_error TEXT, " +
                        "created_at TEXT NOT NULL" +
                        ")"
        );

        db.execSQL(
                "CREATE TABLE sync_queue (" +
                        "id INTEGER PRIMARY KEY AUTOINCREMENT, " +
                        "entity TEXT NOT NULL, " +
                        "action TEXT NOT NULL, " +
                        "entity_id TEXT NOT NULL, " +
                        "payload TEXT NOT NULL, " +
                        "status TEXT NOT NULL, " +
                        "last_error TEXT, " +
                        "created_at TEXT NOT NULL" +
                        ")"
        );
    }

    @Override
    public void onUpgrade(SQLiteDatabase db, int oldVersion, int newVersion) {
        db.execSQL("DROP TABLE IF EXISTS sync_queue");
        db.execSQL("DROP TABLE IF EXISTS abastecimentos");
        db.execSQL("DROP TABLE IF EXISTS proprietarios");
        db.execSQL("DROP TABLE IF EXISTS veiculos");
        db.execSQL("DROP TABLE IF EXISTS motoristas");
        db.execSQL("DROP TABLE IF EXISTS valores_combustivel");
        onCreate(db);
    }

    // ========= ABASTECIMENTOS =========

    public String saveAbastecimento(AbastecimentoLocal item) {
        String id = item.idLocal != null ? item.idLocal : UUID.randomUUID().toString();
        String now = DateUtils.nowIso();

        ContentValues values = new ContentValues();
        values.put("id_local", id);
        values.put("id_remoto", item.idRemoto);
        values.put("data", item.data);
        values.put("data_hora", item.dataHora);
        values.put("frentista", item.frentista);
        values.put("id_proprietario", item.idProprietario);
        values.put("nome_proprietario", item.nomeProprietario);
        values.put("id_veiculo", item.idVeiculo);
        values.put("placa", item.placa);
        values.put("id_motorista", item.idMotorista);
        values.put("nome_motorista", item.nomeMotorista);
        values.put("local", item.local);
        values.put("tipo_combustivel", item.tipoCombustivel);
        values.put("quantidade_litros", item.quantidadeLitros);
        values.put("valor_por_litro", item.valorPorLitro);
        values.put("valor_total", item.valorTotal);
        values.put("odometro", item.odometro);
        values.put("foto_odometro", item.fotoOdometro);
        values.put("bomba", item.bomba);
        values.put("observacao", item.observacao);
        values.put("status", item.status != null ? item.status : "Pendente");
        values.put("sync_status", "PENDENTE");
        values.put("origem", "LOCAL");
        values.put("created_at", now);

        SQLiteDatabase db = getWritableDatabase();
        db.insertOrThrow("abastecimentos", null, values);

        enqueue(db, "abastecimento", "create", id, item.toPayload(id).toString(), now);
        return id;
    }

    public List<AbastecimentoLocal> listAbastecimentos() {
        ArrayList<AbastecimentoLocal> list = new ArrayList<>();
        Cursor cursor = getReadableDatabase().rawQuery(
                "SELECT * FROM abastecimentos ORDER BY data_hora DESC LIMIT 200",
                null
        );
        try {
            while (cursor.moveToNext()) {
                list.add(AbastecimentoLocal.fromCursor(cursor));
            }
        } finally {
            cursor.close();
        }
        return list;
    }

    public int countPendingSync() {
        Cursor cursor = getReadableDatabase().rawQuery(
                "SELECT COUNT(*) FROM sync_queue WHERE status = 'PENDENTE'",
                null
        );
        try {
            return cursor.moveToFirst() ? cursor.getInt(0) : 0;
        } finally {
            cursor.close();
        }
    }

    public void markQueueSuccess(long queueId, String remoteId, String entityId) {
        SQLiteDatabase db = getWritableDatabase();
        db.execSQL("UPDATE sync_queue SET status='ENVIADO', last_error=NULL WHERE id=?",
                new Object[]{queueId});

        ContentValues values = new ContentValues();
        values.put("sync_status", "ENVIADO");
        values.put("id_remoto", remoteId);
        values.putNull("last_error");
        db.update("abastecimentos", values, "id_local=?", new String[]{entityId});
    }

    public void markQueueError(long queueId, String entityId, String error) {
        SQLiteDatabase db = getWritableDatabase();
        db.execSQL("UPDATE sync_queue SET last_error=? WHERE id=?",
                new Object[]{error, queueId});

        ContentValues values = new ContentValues();
        values.put("last_error", error);
        db.update("abastecimentos", values, "id_local=?", new String[]{entityId});
    }

    public List<SyncItem> pendingQueue() {
        ArrayList<SyncItem> list = new ArrayList<>();
        Cursor cursor = getReadableDatabase().rawQuery(
                "SELECT id, entity, action, entity_id, payload FROM sync_queue " +
                        "WHERE status='PENDENTE' ORDER BY id ASC",
                null
        );
        try {
            while (cursor.moveToNext()) {
                SyncItem item = new SyncItem();
                item.id = cursor.getLong(0);
                item.entity = cursor.getString(1);
                item.action = cursor.getString(2);
                item.entityId = cursor.getString(3);
                item.payload = cursor.getString(4);
                list.add(item);
            }
        } finally {
            cursor.close();
        }
        return list;
    }

    private void enqueue(SQLiteDatabase db, String entity, String action,
                         String entityId, String payload, String now) {
        ContentValues values = new ContentValues();
        values.put("entity", entity);
        values.put("action", action);
        values.put("entity_id", entityId);
        values.put("payload", payload);
        values.put("status", "PENDENTE");
        values.put("created_at", now);
        db.insertOrThrow("sync_queue", null, values);
    }

    // ========= CADASTROS (cache) =========

    public void replaceProprietarios(JSONArray items) {
        SQLiteDatabase db = getWritableDatabase();
        db.beginTransaction();
        try {
            db.execSQL("DELETE FROM proprietarios");
            for (int i = 0; i < items.length(); i++) {
                JSONObject p = items.optJSONObject(i);
                if (p == null) continue;
                ContentValues values = new ContentValues();
                values.put("id_proprietario", p.optString("id_proprietario"));
                values.put("nome", p.optString("nome"));
                values.put("status", p.optString("status", "Ativo"));
                values.put("responsavel", p.optString("responsavel"));
                values.put("celular", p.optString("celular"));
                values.put("observacao", p.optString("observacao"));
                db.insertWithOnConflict("proprietarios", null, values,
                        SQLiteDatabase.CONFLICT_REPLACE);
            }
            db.setTransactionSuccessful();
        } finally {
            db.endTransaction();
        }
    }

    public void replaceVeiculos(JSONArray items) {
        SQLiteDatabase db = getWritableDatabase();
        db.beginTransaction();
        try {
            db.execSQL("DELETE FROM veiculos");
            for (int i = 0; i < items.length(); i++) {
                JSONObject v = items.optJSONObject(i);
                if (v == null) continue;
                ContentValues values = new ContentValues();
                values.put("id_veiculo", v.optString("id_veiculo"));
                values.put("id_proprietario", v.optString("id_proprietario"));
                values.put("placa", v.optString("placa"));
                values.put("marca", v.optString("marca"));
                values.put("modelo", v.optString("modelo"));
                values.put("ano", v.optString("ano"));
                values.put("tipo_combustivel", v.optString("tipo_combustivel"));
                if (v.has("odometro") && !v.isNull("odometro")) {
                    values.put("odometro", v.optInt("odometro"));
                }
                db.insertWithOnConflict("veiculos", null, values,
                        SQLiteDatabase.CONFLICT_REPLACE);
            }
            db.setTransactionSuccessful();
        } finally {
            db.endTransaction();
        }
    }

    public void replaceMotoristas(JSONArray items) {
        SQLiteDatabase db = getWritableDatabase();
        db.beginTransaction();
        try {
            db.execSQL("DELETE FROM motoristas");
            for (int i = 0; i < items.length(); i++) {
                JSONObject m = items.optJSONObject(i);
                if (m == null) continue;
                ContentValues values = new ContentValues();
                values.put("id_motorista", m.optString("id_motorista"));
                values.put("id_proprietario", m.optString("id_proprietario"));
                values.put("nome", m.optString("nome"));
                values.put("documento", m.optString("documento"));
                values.put("celular", m.optString("celular"));
                db.insertWithOnConflict("motoristas", null, values,
                        SQLiteDatabase.CONFLICT_REPLACE);
            }
            db.setTransactionSuccessful();
        } finally {
            db.endTransaction();
        }
    }

    /**
     * Guardamos apenas o preco mais recente por tipo (que e o que o backend usa).
     * Assume que o backend retorna ordenado por data desc (ver ValoresCombustivelController).
     */
    public void replaceValoresCombustivel(JSONArray items) {
        SQLiteDatabase db = getWritableDatabase();
        db.beginTransaction();
        try {
            db.execSQL("DELETE FROM valores_combustivel");
            java.util.HashSet<String> tiposVistos = new java.util.HashSet<>();
            for (int i = 0; i < items.length(); i++) {
                JSONObject v = items.optJSONObject(i);
                if (v == null) continue;
                String tipo = v.optString("tipo_combustivel");
                if (tipo.isEmpty() || tiposVistos.contains(tipo)) continue;
                tiposVistos.add(tipo);

                ContentValues values = new ContentValues();
                values.put("tipo_combustivel", tipo);
                values.put("valor", v.optDouble("valor", 0));
                values.put("data", v.optString("data"));
                db.insertWithOnConflict("valores_combustivel", null, values,
                        SQLiteDatabase.CONFLICT_REPLACE);
            }
            db.setTransactionSuccessful();
        } finally {
            db.endTransaction();
        }
    }

    /**
     * Substitui a lista de abastecimentos REMOTOS (sem tocar nos locais pendentes).
     */
    public void replaceAbastecimentosRemotos(JSONArray items) {
        SQLiteDatabase db = getWritableDatabase();
        db.beginTransaction();
        try {
            db.execSQL("DELETE FROM abastecimentos WHERE origem='REMOTO'");
            String now = DateUtils.nowIso();
            for (int i = 0; i < items.length(); i++) {
                JSONObject a = items.optJSONObject(i);
                if (a == null) continue;

                String dataStr = a.optString("data", "");
                if (dataStr.length() >= 10) dataStr = dataStr.substring(0, 10);

                ContentValues values = new ContentValues();
                values.put("id_local", a.optString("id_abastecimento"));
                values.put("id_remoto", a.optString("id_abastecimento"));
                values.put("data", dataStr);
                values.put("data_hora", a.optString("data_hora"));
                values.put("frentista", a.optString("frentista"));
                values.put("id_proprietario", a.optString("id_proprietario"));
                values.put("nome_proprietario", a.optString("nome_proprietario"));
                values.put("id_veiculo", a.optString("id_veiculo"));

                JSONObject veiculo = a.optJSONObject("veiculo");
                values.put("placa", veiculo != null ? veiculo.optString("placa") : "");

                values.put("id_motorista", a.optString("id_motorista"));
                values.put("nome_motorista", a.optString("nome_motorista"));
                values.put("local", a.optString("local", "Garagem"));
                values.put("tipo_combustivel", a.optString("tipo_combustivel"));
                values.put("quantidade_litros", a.optDouble("quantidade_litros", 0));
                values.put("valor_por_litro", a.optDouble("valor_por_litro", 0));
                values.put("valor_total", a.optDouble("valor_total", 0));
                if (a.has("odometro") && !a.isNull("odometro")) {
                    values.put("odometro", a.optInt("odometro"));
                }
                values.put("foto_odometro", a.optString("foto_odometro"));
                values.put("bomba", a.optString("bomba"));
                values.put("observacao", a.optString("observacao"));
                values.put("status", a.optString("status", "Pendente"));
                values.put("sync_status", "ENVIADO");
                values.put("origem", "REMOTO");
                values.put("created_at", now);
                db.insertWithOnConflict("abastecimentos", null, values,
                        SQLiteDatabase.CONFLICT_REPLACE);
            }
            db.setTransactionSuccessful();
        } finally {
            db.endTransaction();
        }
    }

    public List<Proprietario> listProprietarios() {
        ArrayList<Proprietario> list = new ArrayList<>();
        Cursor c = getReadableDatabase().rawQuery(
                "SELECT id_proprietario, nome, status, observacao FROM proprietarios ORDER BY nome",
                null
        );
        try {
            while (c.moveToNext()) {
                Proprietario p = new Proprietario();
                p.id = c.getString(0);
                p.nome = safe(c.getString(1));
                p.status = safe(c.getString(2));
                p.observacao = safe(c.getString(3));
                list.add(p);
            }
        } finally {
            c.close();
        }
        return list;
    }

    public List<Veiculo> listVeiculosDoProprietario(String idProprietario) {
        ArrayList<Veiculo> list = new ArrayList<>();
        Cursor c = getReadableDatabase().rawQuery(
                "SELECT id_veiculo, placa, marca, modelo, tipo_combustivel, odometro " +
                        "FROM veiculos WHERE id_proprietario=? ORDER BY placa",
                new String[]{idProprietario}
        );
        try {
            while (c.moveToNext()) {
                Veiculo v = new Veiculo();
                v.id = c.getString(0);
                v.placa = safe(c.getString(1));
                v.marca = safe(c.getString(2));
                v.modelo = safe(c.getString(3));
                v.tipoCombustivel = safe(c.getString(4));
                v.odometro = c.isNull(5) ? null : c.getInt(5);
                list.add(v);
            }
        } finally {
            c.close();
        }
        return list;
    }

    public List<Motorista> listMotoristasDoProprietario(String idProprietario) {
        ArrayList<Motorista> list = new ArrayList<>();
        Cursor c = getReadableDatabase().rawQuery(
                "SELECT id_motorista, nome FROM motoristas WHERE id_proprietario=? ORDER BY nome",
                new String[]{idProprietario}
        );
        try {
            while (c.moveToNext()) {
                Motorista m = new Motorista();
                m.id = c.getString(0);
                m.nome = safe(c.getString(1));
                list.add(m);
            }
        } finally {
            c.close();
        }
        return list;
    }

    public Double valorAtualDoCombustivel(String tipo) {
        Cursor c = getReadableDatabase().rawQuery(
                "SELECT valor FROM valores_combustivel WHERE tipo_combustivel=?",
                new String[]{tipo}
        );
        try {
            return c.moveToFirst() ? c.getDouble(0) : null;
        } finally {
            c.close();
        }
    }

    public Integer ultimoOdometroVeiculo(String idVeiculo) {
        Integer maior = null;
        Cursor c1 = getReadableDatabase().rawQuery(
                "SELECT odometro FROM veiculos WHERE id_veiculo=?",
                new String[]{idVeiculo}
        );
        try {
            if (c1.moveToFirst() && !c1.isNull(0)) {
                maior = c1.getInt(0);
            }
        } finally {
            c1.close();
        }

        Cursor c2 = getReadableDatabase().rawQuery(
                "SELECT MAX(odometro) FROM abastecimentos WHERE id_veiculo=? AND odometro IS NOT NULL",
                new String[]{idVeiculo}
        );
        try {
            if (c2.moveToFirst() && !c2.isNull(0)) {
                int v = c2.getInt(0);
                if (maior == null || v > maior) {
                    maior = v;
                }
            }
        } finally {
            c2.close();
        }
        return maior;
    }

    public int countProprietarios() { return countTable("proprietarios"); }
    public int countVeiculos()      { return countTable("veiculos"); }
    public int countMotoristas()    { return countTable("motoristas"); }
    public int countValoresCombustivel() { return countTable("valores_combustivel"); }
    public int countAbastecimentosRemotos() {
        Cursor c = getReadableDatabase().rawQuery(
                "SELECT COUNT(*) FROM abastecimentos WHERE origem='REMOTO'", null);
        try {
            return c.moveToFirst() ? c.getInt(0) : 0;
        } finally {
            c.close();
        }
    }

    private int countTable(String table) {
        Cursor c = getReadableDatabase().rawQuery("SELECT COUNT(*) FROM " + table, null);
        try {
            return c.moveToFirst() ? c.getInt(0) : 0;
        } finally {
            c.close();
        }
    }

    private static String safe(String value) {
        return value == null ? "" : value;
    }

    // ========= Value objects =========

    public static class AbastecimentoLocal {
        public String idLocal;
        public String idRemoto;
        public String data;
        public String dataHora;
        public String frentista;
        public String idProprietario;
        public String nomeProprietario;
        public String idVeiculo;
        public String placa;
        public String idMotorista;
        public String nomeMotorista;
        public String local;
        public String tipoCombustivel;
        public double quantidadeLitros;
        public double valorPorLitro;
        public double valorTotal;
        public Integer odometro;
        public String fotoOdometro;
        public String bomba;
        public String observacao;
        public String status;
        public String syncStatus;
        public String origem;
        public String lastError;

        public JSONObject toPayload(String idLocal) {
            JSONObject json = new JSONObject();
            try {
                json.put("id_local", idLocal);
                json.put("data", data);
                json.put("data_hora", dataHora);
                if (frentista != null && !frentista.isEmpty()) json.put("frentista", frentista);
                json.put("id_proprietario", idProprietario);
                if (nomeProprietario != null) json.put("nome_proprietario", nomeProprietario);
                json.put("id_veiculo", idVeiculo);
                if (idMotorista != null && !idMotorista.isEmpty()) json.put("id_motorista", idMotorista);
                if (nomeMotorista != null) json.put("nome_motorista", nomeMotorista);
                json.put("local", local != null ? local : "Garagem");
                json.put("tipo_combustivel", tipoCombustivel);
                json.put("quantidade_litros", quantidadeLitros);
                if (odometro != null) json.put("odometro", odometro.intValue());
                if (fotoOdometro != null && !fotoOdometro.isEmpty()) json.put("foto_odometro", fotoOdometro);
                if (bomba != null && !bomba.isEmpty()) json.put("bomba", bomba);
                if (observacao != null && !observacao.isEmpty()) json.put("observacao", observacao);
                json.put("status", status != null ? status : "Pendente");
            } catch (Exception ignored) {}
            return json;
        }

        public static AbastecimentoLocal fromCursor(Cursor cursor) {
            AbastecimentoLocal item = new AbastecimentoLocal();
            item.idLocal = cursor.getString(cursor.getColumnIndexOrThrow("id_local"));
            item.idRemoto = cursor.getString(cursor.getColumnIndexOrThrow("id_remoto"));
            item.data = cursor.getString(cursor.getColumnIndexOrThrow("data"));
            item.dataHora = cursor.getString(cursor.getColumnIndexOrThrow("data_hora"));
            item.frentista = cursor.getString(cursor.getColumnIndexOrThrow("frentista"));
            item.idProprietario = cursor.getString(cursor.getColumnIndexOrThrow("id_proprietario"));
            item.nomeProprietario = cursor.getString(cursor.getColumnIndexOrThrow("nome_proprietario"));
            item.idVeiculo = cursor.getString(cursor.getColumnIndexOrThrow("id_veiculo"));
            item.placa = cursor.getString(cursor.getColumnIndexOrThrow("placa"));
            item.idMotorista = cursor.getString(cursor.getColumnIndexOrThrow("id_motorista"));
            item.nomeMotorista = cursor.getString(cursor.getColumnIndexOrThrow("nome_motorista"));
            item.local = cursor.getString(cursor.getColumnIndexOrThrow("local"));
            item.tipoCombustivel = cursor.getString(cursor.getColumnIndexOrThrow("tipo_combustivel"));
            item.quantidadeLitros = cursor.getDouble(cursor.getColumnIndexOrThrow("quantidade_litros"));
            item.valorPorLitro = cursor.getDouble(cursor.getColumnIndexOrThrow("valor_por_litro"));
            item.valorTotal = cursor.getDouble(cursor.getColumnIndexOrThrow("valor_total"));
            int odomIdx = cursor.getColumnIndexOrThrow("odometro");
            item.odometro = cursor.isNull(odomIdx) ? null : cursor.getInt(odomIdx);
            item.fotoOdometro = cursor.getString(cursor.getColumnIndexOrThrow("foto_odometro"));
            item.bomba = cursor.getString(cursor.getColumnIndexOrThrow("bomba"));
            item.observacao = cursor.getString(cursor.getColumnIndexOrThrow("observacao"));
            item.status = cursor.getString(cursor.getColumnIndexOrThrow("status"));
            item.syncStatus = cursor.getString(cursor.getColumnIndexOrThrow("sync_status"));
            item.origem = cursor.getString(cursor.getColumnIndexOrThrow("origem"));
            item.lastError = cursor.getString(cursor.getColumnIndexOrThrow("last_error"));
            return item;
        }
    }

    public static class Proprietario {
        public String id;
        public String nome;
        public String status;
        public String observacao;

        @Override public String toString() { return nome; }
    }

    public static class Veiculo {
        public String id;
        public String placa;
        public String marca;
        public String modelo;
        public String tipoCombustivel;
        public Integer odometro;

        @Override public String toString() {
            String extra = (modelo != null && !modelo.isEmpty()) ? " - " + modelo : "";
            return placa + extra;
        }
    }

    public static class Motorista {
        public String id;
        public String nome;

        @Override public String toString() { return nome; }
    }

    public static class SyncItem {
        public long id;
        public String entity;
        public String action;
        public String entityId;
        public String payload;
    }
}
