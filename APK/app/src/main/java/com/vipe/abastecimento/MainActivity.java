package com.vipe.abastecimento;

import android.app.Activity;
import android.app.AlertDialog;
import android.app.DatePickerDialog;
import android.app.ProgressDialog;
import android.app.TimePickerDialog;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.Typeface;
import android.net.ConnectivityManager;
import android.net.NetworkInfo;
import android.os.Bundle;
import android.text.InputType;
import android.text.TextUtils;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.AdapterView;
import android.widget.ArrayAdapter;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.Spinner;
import android.widget.TextView;
import android.widget.Toast;

import java.text.NumberFormat;
import java.text.ParseException;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Calendar;
import java.util.Date;
import java.util.List;
import java.util.Locale;

public class MainActivity extends Activity {

    private static final String[] TIPOS_COMBUSTIVEL = new String[]{
            "OLEO DIESEL S10", "Diesel Comum", "Gasolina Comum", "Gasolina Aditivada",
            "Etanol", "GNV", "Arla 32"
    };

    private static final String[] LOCAIS = new String[]{"Garagem", "Garagem Viana"};
    private static final String[] STATUS_LIST = new String[]{"Pendente", "Confirmado", "Pago", "Cancelado"};

    private LocalDatabase database;
    private AuthStore authStore;
    private LinearLayout listContainer;
    private TextView syncBadge;
    private TextView statusLine;
    private TextView cacheInfo;
    private final NumberFormat currency = NumberFormat.getCurrencyInstance(new Locale("pt", "BR"));

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        authStore = new AuthStore(this);
        if (!authStore.isAuthenticated()) {
            startActivity(new Intent(this, LoginActivity.class));
            finish();
            return;
        }
        database = new LocalDatabase(this);
        render();
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (listContainer != null) refreshList();
    }

    // ============== LAYOUT ==============

    private void render() {
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(Color.rgb(243, 244, 246));

        root.addView(createHeader());

        ScrollView scrollView = new ScrollView(this);
        listContainer = new LinearLayout(this);
        listContainer.setOrientation(LinearLayout.VERTICAL);
        listContainer.setPadding(dp(16), dp(14), dp(16), dp(24));
        scrollView.addView(listContainer);
        root.addView(scrollView, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, 0, 1));

        setContentView(root);
        refreshList();
    }

    private View createHeader() {
        LinearLayout header = new LinearLayout(this);
        header.setOrientation(LinearLayout.VERTICAL);
        header.setPadding(dp(16), dp(18), dp(16), dp(14));
        header.setBackgroundColor(Color.WHITE);

        LinearLayout topRow = new LinearLayout(this);
        topRow.setOrientation(LinearLayout.HORIZONTAL);

        LinearLayout titleColumn = new LinearLayout(this);
        titleColumn.setOrientation(LinearLayout.VERTICAL);
        LinearLayout.LayoutParams titleParams = new LinearLayout.LayoutParams(0,
                ViewGroup.LayoutParams.WRAP_CONTENT, 1);
        topRow.addView(titleColumn, titleParams);

        TextView title = new TextView(this);
        title.setText("Abastecimento Vipe");
        title.setTextColor(Color.rgb(17, 24, 39));
        title.setTextSize(22);
        title.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        titleColumn.addView(title);

        statusLine = new TextView(this);
        statusLine.setTextColor(Color.rgb(107, 114, 128));
        statusLine.setTextSize(12);
        titleColumn.addView(statusLine);

        Button btnMenu = new Button(this);
        btnMenu.setText("Sair");
        btnMenu.setTextColor(Color.rgb(107, 114, 128));
        btnMenu.setBackgroundColor(Color.rgb(243, 244, 246));
        btnMenu.setOnClickListener(v -> confirmarLogout());
        topRow.addView(btnMenu, new LinearLayout.LayoutParams(dp(80), dp(40)));

        header.addView(topRow);

        LinearLayout actions = new LinearLayout(this);
        actions.setOrientation(LinearLayout.HORIZONTAL);
        actions.setGravity(Gravity.CENTER_VERTICAL);
        actions.setPadding(0, dp(12), 0, 0);

        Button newButton = primaryButton("+ Novo abastecimento");
        newButton.setOnClickListener(v -> openNewDialog());
        actions.addView(newButton, new LinearLayout.LayoutParams(0, dp(44), 1));

        Button syncButton = secondaryButton("Sincronizar");
        syncButton.setOnClickListener(v -> doSync());
        LinearLayout.LayoutParams syncParams = new LinearLayout.LayoutParams(0, dp(44), 1);
        syncParams.setMargins(dp(10), 0, 0, 0);
        actions.addView(syncButton, syncParams);

        header.addView(actions);

        syncBadge = new TextView(this);
        syncBadge.setTextColor(Color.rgb(146, 64, 14));
        syncBadge.setTextSize(12);
        syncBadge.setPadding(0, dp(10), 0, 0);
        header.addView(syncBadge);

        cacheInfo = new TextView(this);
        cacheInfo.setTextColor(Color.rgb(100, 116, 139));
        cacheInfo.setTextSize(11);
        cacheInfo.setPadding(0, dp(4), 0, 0);
        header.addView(cacheInfo);

        return header;
    }

    private void refreshList() {
        listContainer.removeAllViews();
        int pending = database.countPendingSync();

        String pendingMsg = pending == 0
                ? "Tudo sincronizado."
                : pending + " registro(s) aguardando sincronizacao";
        syncBadge.setText(pendingMsg);
        syncBadge.setTextColor(pending == 0 ? Color.rgb(22, 163, 74) : Color.rgb(146, 64, 14));

        statusLine.setText(isOnline()
                ? "Online - conectado como " + authStore.getNome()
                : "Offline - registros sendo salvos no aparelho");

        cacheInfo.setText(String.format(Locale.US,
                "Cache: %d propr., %d veic., %d motor., %d combustiveis, %d abast.",
                database.countProprietarios(),
                database.countVeiculos(),
                database.countMotoristas(),
                database.countValoresCombustivel(),
                database.countAbastecimentosRemotos()));

        List<LocalDatabase.AbastecimentoLocal> abastecimentos = database.listAbastecimentos();
        if (abastecimentos.isEmpty()) {
            TextView empty = new TextView(this);
            empty.setText("Nenhum abastecimento ainda.\nToque em Sincronizar para baixar os dados existentes, ou em + Novo abastecimento para registrar offline.");
            empty.setGravity(Gravity.CENTER);
            empty.setTextColor(Color.rgb(107, 114, 128));
            empty.setTextSize(14);
            empty.setPadding(dp(18), dp(60), dp(18), dp(60));
            listContainer.addView(empty);
            return;
        }

        for (LocalDatabase.AbastecimentoLocal item : abastecimentos) {
            listContainer.addView(createCard(item));
        }
    }

    private View createCard(LocalDatabase.AbastecimentoLocal item) {
        LinearLayout card = new LinearLayout(this);
        card.setOrientation(LinearLayout.VERTICAL);
        card.setPadding(dp(14), dp(14), dp(14), dp(14));
        card.setBackgroundColor(Color.WHITE);

        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT);
        params.setMargins(0, 0, 0, dp(12));
        card.setLayoutParams(params);

        String placa = (item.placa != null && !item.placa.isEmpty())
                ? item.placa
                : (item.idVeiculo != null && item.idVeiculo.length() > 8
                    ? item.idVeiculo.substring(0, 8) + "..."
                    : (item.idVeiculo == null ? "" : item.idVeiculo));

        TextView top = new TextView(this);
        top.setText(placa + "  -  " + formatDataHora(item.dataHora));
        top.setTextColor(Color.rgb(17, 24, 39));
        top.setTextSize(16);
        top.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        card.addView(top);

        StringBuilder subtitle = new StringBuilder();
        if (item.nomeProprietario != null && !item.nomeProprietario.isEmpty()) {
            subtitle.append(item.nomeProprietario).append('\n');
        }
        subtitle.append(item.tipoCombustivel)
                .append(" - ")
                .append(String.format(Locale.US, "%.2f", item.quantidadeLitros))
                .append(" L");
        if (item.nomeMotorista != null && !item.nomeMotorista.isEmpty()) {
            subtitle.append(" - ").append(item.nomeMotorista);
        }

        TextView info = new TextView(this);
        info.setText(subtitle.toString());
        info.setTextColor(Color.rgb(75, 85, 99));
        info.setTextSize(13);
        info.setPadding(0, dp(6), 0, dp(6));
        card.addView(info);

        boolean pendente = "PENDENTE".equalsIgnoreCase(item.syncStatus);
        TextView bottom = new TextView(this);
        String status = pendente ? "PENDENTE DE SINCRONIZACAO" : "SINCRONIZADO";
        bottom.setText(currency.format(item.valorTotal) + "  -  " + status);
        bottom.setTextColor(pendente ? Color.rgb(217, 119, 6) : Color.rgb(22, 163, 74));
        bottom.setTextSize(13);
        bottom.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        card.addView(bottom);

        if (item.lastError != null && !item.lastError.isEmpty()) {
            TextView err = new TextView(this);
            err.setText("Ultimo erro: " + item.lastError);
            err.setTextColor(Color.rgb(220, 38, 38));
            err.setTextSize(11);
            err.setPadding(0, dp(4), 0, 0);
            card.addView(err);
        }

        return card;
    }

    // ============== DIALOG DE NOVO ABASTECIMENTO ==============

    private void openNewDialog() {
        final List<LocalDatabase.Proprietario> proprietarios = database.listProprietarios();
        if (proprietarios.isEmpty()) {
            new AlertDialog.Builder(this)
                    .setTitle("Cache vazio")
                    .setMessage("Nenhum proprietario baixado ainda. Conecte a internet e toque em Sincronizar ao menos uma vez antes de registrar offline.")
                    .setPositiveButton("OK", null)
                    .show();
            return;
        }

        ScrollView scroll = new ScrollView(this);
        LinearLayout form = new LinearLayout(this);
        form.setOrientation(LinearLayout.VERTICAL);
        form.setPadding(dp(16), dp(8), dp(16), dp(8));
        scroll.addView(form);

        // DATA + HORA
        final EditText dataField = dateField(DateUtils.today(), false);
        form.addView(label("Data *"));
        form.addView(dataField);

        final EditText dataHoraField = dateField(DateUtils.nowForInput(), true);
        form.addView(label("Data e hora *"));
        form.addView(dataHoraField);

        // PROPRIETARIO
        form.addView(label("Proprietario *"));
        final Spinner spProprietario = new Spinner(this);
        ArrayAdapter<LocalDatabase.Proprietario> adProp = new ArrayAdapter<>(this,
                android.R.layout.simple_spinner_item, proprietarios);
        adProp.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item);
        spProprietario.setAdapter(adProp);
        form.addView(spProprietario);

        // VEICULO
        form.addView(label("Veiculo *"));
        final Spinner spVeiculo = new Spinner(this);
        final ArrayAdapter<LocalDatabase.Veiculo> adVeic = new ArrayAdapter<>(this,
                android.R.layout.simple_spinner_item, new ArrayList<LocalDatabase.Veiculo>());
        adVeic.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item);
        spVeiculo.setAdapter(adVeic);
        form.addView(spVeiculo);

        // MOTORISTA
        form.addView(label("Motorista"));
        final Spinner spMotorista = new Spinner(this);
        final ArrayAdapter<LocalDatabase.Motorista> adMot = new ArrayAdapter<>(this,
                android.R.layout.simple_spinner_item, new ArrayList<LocalDatabase.Motorista>());
        adMot.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item);
        spMotorista.setAdapter(adMot);
        form.addView(spMotorista);

        // LOCAL
        form.addView(label("Local"));
        final Spinner spLocal = new Spinner(this);
        ArrayAdapter<String> adLocal = new ArrayAdapter<>(this,
                android.R.layout.simple_spinner_item, LOCAIS);
        adLocal.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item);
        spLocal.setAdapter(adLocal);
        form.addView(spLocal);

        // TIPO COMBUSTIVEL
        form.addView(label("Tipo de combustivel *"));
        final Spinner spTipo = new Spinner(this);
        ArrayAdapter<String> adTipo = new ArrayAdapter<>(this,
                android.R.layout.simple_spinner_item, TIPOS_COMBUSTIVEL);
        adTipo.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item);
        spTipo.setAdapter(adTipo);
        form.addView(spTipo);

        // VALOR POR LITRO (read-only, preenchido pelo cache)
        form.addView(label("Valor por litro (tabela)"));
        final EditText valorLitroField = input("", InputType.TYPE_CLASS_NUMBER | InputType.TYPE_NUMBER_FLAG_DECIMAL);
        valorLitroField.setEnabled(false);
        form.addView(valorLitroField);

        // QUANTIDADE
        form.addView(label("Quantidade (L) *"));
        final EditText litrosField = input("", InputType.TYPE_CLASS_NUMBER | InputType.TYPE_NUMBER_FLAG_DECIMAL);
        form.addView(litrosField);

        // VALOR TOTAL (read-only, calculado)
        form.addView(label("Valor total (calculado)"));
        final EditText valorTotalField = input("", InputType.TYPE_CLASS_NUMBER | InputType.TYPE_NUMBER_FLAG_DECIMAL);
        valorTotalField.setEnabled(false);
        form.addView(valorTotalField);

        // ODOMETRO
        form.addView(label("Odometro (km)"));
        final EditText odometroField = input("", InputType.TYPE_CLASS_NUMBER);
        form.addView(odometroField);
        final TextView odometroHint = new TextView(this);
        odometroHint.setTextColor(Color.rgb(100, 116, 139));
        odometroHint.setTextSize(11);
        form.addView(odometroHint);

        // STATUS
        form.addView(label("Status"));
        final Spinner spStatus = new Spinner(this);
        ArrayAdapter<String> adStatus = new ArrayAdapter<>(this,
                android.R.layout.simple_spinner_item, STATUS_LIST);
        adStatus.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item);
        spStatus.setAdapter(adStatus);
        form.addView(spStatus);

        // OBSERVACAO
        form.addView(label("Observacao"));
        final EditText obsField = input("", InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_MULTI_LINE);
        obsField.setSingleLine(false);
        obsField.setMinLines(2);
        form.addView(obsField);

        // Listeners reativos
        spProprietario.setOnItemSelectedListener(new AdapterView.OnItemSelectedListener() {
            @Override public void onItemSelected(AdapterView<?> parent, View view, int position, long id) {
                LocalDatabase.Proprietario p = proprietarios.get(position);
                adVeic.clear();
                adVeic.addAll(database.listVeiculosDoProprietario(p.id));
                adVeic.notifyDataSetChanged();

                List<LocalDatabase.Motorista> motoristas = new ArrayList<>();
                LocalDatabase.Motorista vazio = new LocalDatabase.Motorista();
                vazio.id = "";
                vazio.nome = "(sem motorista)";
                motoristas.add(vazio);
                motoristas.addAll(database.listMotoristasDoProprietario(p.id));
                adMot.clear();
                adMot.addAll(motoristas);
                adMot.notifyDataSetChanged();
            }
            @Override public void onNothingSelected(AdapterView<?> parent) {}
        });

        spVeiculo.setOnItemSelectedListener(new AdapterView.OnItemSelectedListener() {
            @Override public void onItemSelected(AdapterView<?> parent, View view, int position, long id) {
                LocalDatabase.Veiculo v = (LocalDatabase.Veiculo) spVeiculo.getSelectedItem();
                if (v == null) return;
                if (!TextUtils.isEmpty(v.tipoCombustivel)) {
                    for (int i = 0; i < TIPOS_COMBUSTIVEL.length; i++) {
                        if (TIPOS_COMBUSTIVEL[i].equalsIgnoreCase(v.tipoCombustivel)) {
                            spTipo.setSelection(i);
                            break;
                        }
                    }
                }
                Integer ultimo = database.ultimoOdometroVeiculo(v.id);
                if (ultimo != null) {
                    odometroHint.setText("Ultimo odometro registrado: " + ultimo + " km");
                    if (odometroField.getText().toString().trim().isEmpty()) {
                        odometroField.setText(String.valueOf(ultimo));
                    }
                } else {
                    odometroHint.setText("");
                }
            }
            @Override public void onNothingSelected(AdapterView<?> parent) {}
        });

        spTipo.setOnItemSelectedListener(new AdapterView.OnItemSelectedListener() {
            @Override public void onItemSelected(AdapterView<?> parent, View view, int position, long id) {
                String tipo = TIPOS_COMBUSTIVEL[position];
                Double valor = database.valorAtualDoCombustivel(tipo);
                valorLitroField.setText(valor != null
                        ? String.format(Locale.US, "%.3f", valor)
                        : "");
                recalcTotal(litrosField, valorLitroField, valorTotalField);
            }
            @Override public void onNothingSelected(AdapterView<?> parent) {}
        });

        litrosField.addTextChangedListener(new android.text.TextWatcher() {
            @Override public void beforeTextChanged(CharSequence s, int start, int count, int after) {}
            @Override public void onTextChanged(CharSequence s, int start, int before, int count) {}
            @Override public void afterTextChanged(android.text.Editable s) {
                recalcTotal(litrosField, valorLitroField, valorTotalField);
            }
        });

        if (!proprietarios.isEmpty()) {
            spProprietario.setSelection(0);
        }

        final AlertDialog dialog = new AlertDialog.Builder(this)
                .setTitle("Novo abastecimento offline")
                .setView(scroll)
                .setNegativeButton("Cancelar", null)
                .setPositiveButton("Salvar", null)
                .create();

        dialog.setOnShowListener(dlg -> dialog.getButton(AlertDialog.BUTTON_POSITIVE)
                .setOnClickListener(v -> {
                    LocalDatabase.Proprietario prop = (LocalDatabase.Proprietario) spProprietario.getSelectedItem();
                    LocalDatabase.Veiculo veic = (LocalDatabase.Veiculo) spVeiculo.getSelectedItem();
                    LocalDatabase.Motorista mot = (LocalDatabase.Motorista) spMotorista.getSelectedItem();

                    if (prop == null) { toast("Selecione um proprietario"); return; }
                    if (veic == null || veic.id == null) { toast("Selecione um veiculo"); return; }
                    if ("Bloqueado".equalsIgnoreCase(prop.status)) {
                        toast("Proprietario bloqueado. " + (TextUtils.isEmpty(prop.observacao) ? "" : prop.observacao));
                        return;
                    }

                    double litros = parseNumber(litrosField.getText().toString());
                    if (litros <= 0) { toast("Informe a quantidade em litros"); return; }

                    double valorLitro = parseNumber(valorLitroField.getText().toString());
                    Integer odometro = null;
                    String odoStr = odometroField.getText().toString().trim();
                    if (!odoStr.isEmpty()) {
                        try { odometro = Integer.parseInt(odoStr); } catch (NumberFormatException e) { odometro = null; }
                    }

                    Integer ultimoOdometro = database.ultimoOdometroVeiculo(veic.id);
                    if (odometro != null && ultimoOdometro != null && odometro < ultimoOdometro) {
                        toast("Odometro menor que o anterior (" + ultimoOdometro + " km). Corrija antes de salvar.");
                        return;
                    }

                    LocalDatabase.AbastecimentoLocal item = new LocalDatabase.AbastecimentoLocal();
                    item.data = dataField.getText().toString().trim();
                    item.dataHora = dataHoraField.getText().toString().trim();
                    item.frentista = authStore.getNome();
                    item.idProprietario = prop.id;
                    item.nomeProprietario = prop.nome;
                    item.idVeiculo = veic.id;
                    item.placa = veic.placa;
                    item.idMotorista = (mot != null && mot.id != null) ? mot.id : "";
                    item.nomeMotorista = (mot != null && mot.id != null && !mot.id.isEmpty()) ? mot.nome : "";
                    item.local = (String) spLocal.getSelectedItem();
                    item.tipoCombustivel = (String) spTipo.getSelectedItem();
                    item.quantidadeLitros = litros;
                    item.valorPorLitro = valorLitro;
                    item.valorTotal = round2(litros * valorLitro);
                    item.odometro = odometro;
                    item.observacao = obsField.getText().toString().trim();
                    item.status = (String) spStatus.getSelectedItem();

                    database.saveAbastecimento(item);
                    toast("Registro salvo offline.");
                    dialog.dismiss();
                    refreshList();
                }));
        dialog.show();
    }

    private void recalcTotal(EditText litrosField, EditText valorLitroField, EditText valorTotalField) {
        double litros = parseNumber(litrosField.getText().toString());
        double valor = parseNumber(valorLitroField.getText().toString());
        valorTotalField.setText(String.format(Locale.US, "%.2f", round2(litros * valor)));
    }

    // ============== SYNC ==============

    private void doSync() {
        if (!isOnline()) {
            new AlertDialog.Builder(this)
                    .setTitle("Sem internet")
                    .setMessage("Conecte-se a internet para sincronizar. Os registros continuam salvos no aparelho.")
                    .setPositiveButton("OK", null)
                    .show();
            return;
        }

        final ProgressDialog progress = new ProgressDialog(this);
        progress.setTitle("Sincronizando");
        progress.setMessage("Preparando...");
        progress.setCancelable(false);
        progress.show();

        ApiClient api = new ApiClient(authStore);
        new SyncManager(api, database, new SyncManager.Listener() {
            @Override public void onProgress(String message) {
                progress.setMessage(message);
            }

            @Override public void onFinish(SyncManager.Result result) {
                progress.dismiss();
                if (result.erroGlobal != null
                        && result.erroGlobal.toLowerCase(Locale.US).contains("unauthenticated")) {
                    sessaoExpirada();
                    return;
                }
                new AlertDialog.Builder(MainActivity.this)
                        .setTitle(result.success() ? "Sincronizacao concluida" : "Sincronizacao com avisos")
                        .setMessage(result.resumo())
                        .setPositiveButton("OK", (dialog, which) -> refreshList())
                        .show();
            }
        }).start();
    }

    private void sessaoExpirada() {
        authStore.clear();
        new AlertDialog.Builder(this)
                .setTitle("Sessao expirada")
                .setMessage("Faca login novamente para continuar sincronizando.")
                .setPositiveButton("OK", (dialog, which) -> {
                    startActivity(new Intent(this, LoginActivity.class));
                    finish();
                })
                .show();
    }

    private void confirmarLogout() {
        int pending = database.countPendingSync();
        String msg = pending > 0
                ? "Existem " + pending + " registro(s) ainda nao sincronizados. Sair e seguro, mas eles so serao enviados apos novo login e Sincronizar."
                : "Deseja sair do aplicativo?";
        new AlertDialog.Builder(this)
                .setTitle("Sair")
                .setMessage(msg)
                .setNegativeButton("Cancelar", null)
                .setPositiveButton("Sair", (dialog, which) -> {
                    authStore.clear();
                    startActivity(new Intent(this, LoginActivity.class));
                    finish();
                })
                .show();
    }

    // ============== HELPERS DE UI ==============

    private TextView label(String text) {
        TextView t = new TextView(this);
        t.setText(text);
        t.setTextColor(Color.rgb(71, 85, 105));
        t.setTextSize(12);
        t.setPadding(0, dp(10), 0, dp(2));
        return t;
    }

    private EditText input(String value, int type) {
        EditText e = new EditText(this);
        e.setText(value);
        e.setInputType(type);
        e.setSingleLine(true);
        return e;
    }

    private EditText dateField(String value, final boolean includeTime) {
        final EditText e = new EditText(this);
        e.setText(value);
        e.setFocusable(false);
        e.setClickable(true);
        e.setOnClickListener(v -> showPicker(e, includeTime));
        return e;
    }

    private void showPicker(final EditText target, final boolean includeTime) {
        final Calendar cal = Calendar.getInstance();
        try {
            SimpleDateFormat sdf = new SimpleDateFormat(
                    includeTime ? "yyyy-MM-dd'T'HH:mm" : "yyyy-MM-dd", Locale.US);
            Date d = sdf.parse(target.getText().toString());
            if (d != null) cal.setTime(d);
        } catch (ParseException ignored) {}

        DatePickerDialog dp = new DatePickerDialog(this,
                (view, year, month, dayOfMonth) -> {
                    cal.set(Calendar.YEAR, year);
                    cal.set(Calendar.MONTH, month);
                    cal.set(Calendar.DAY_OF_MONTH, dayOfMonth);
                    if (!includeTime) {
                        SimpleDateFormat out = new SimpleDateFormat("yyyy-MM-dd", Locale.US);
                        target.setText(out.format(cal.getTime()));
                    } else {
                        TimePickerDialog tp = new TimePickerDialog(this,
                                (tView, hourOfDay, minute) -> {
                                    cal.set(Calendar.HOUR_OF_DAY, hourOfDay);
                                    cal.set(Calendar.MINUTE, minute);
                                    SimpleDateFormat out = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm", Locale.US);
                                    target.setText(out.format(cal.getTime()));
                                },
                                cal.get(Calendar.HOUR_OF_DAY),
                                cal.get(Calendar.MINUTE),
                                true);
                        tp.show();
                    }
                },
                cal.get(Calendar.YEAR),
                cal.get(Calendar.MONTH),
                cal.get(Calendar.DAY_OF_MONTH));
        dp.show();
    }

    private Button primaryButton(String text) {
        Button b = new Button(this);
        b.setText(text);
        b.setTextColor(Color.WHITE);
        b.setBackgroundColor(Color.rgb(37, 99, 235));
        return b;
    }

    private Button secondaryButton(String text) {
        Button b = new Button(this);
        b.setText(text);
        b.setTextColor(Color.rgb(17, 24, 39));
        b.setBackgroundColor(Color.rgb(229, 231, 235));
        return b;
    }

    private void toast(String msg) {
        Toast.makeText(this, msg, Toast.LENGTH_LONG).show();
    }

    private double parseNumber(String value) {
        if (value == null) return 0;
        try {
            return Double.parseDouble(value.replace(",", ".").trim());
        } catch (Exception e) {
            return 0;
        }
    }

    private double round2(double v) {
        return Math.round(v * 100.0) / 100.0;
    }

    private String formatDataHora(String dataHora) {
        if (dataHora == null || dataHora.isEmpty()) return "";
        try {
            String src = dataHora;
            SimpleDateFormat in;
            if (src.contains("T")) {
                if (src.length() > 16) src = src.substring(0, 16);
                in = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm", Locale.US);
            } else {
                in = new SimpleDateFormat(
                        src.length() > 10 ? "yyyy-MM-dd HH:mm:ss" : "yyyy-MM-dd",
                        Locale.US);
            }
            Date d = in.parse(src);
            if (d == null) return dataHora;
            SimpleDateFormat out = new SimpleDateFormat("dd/MM HH:mm", new Locale("pt", "BR"));
            return out.format(d);
        } catch (Exception e) {
            return dataHora;
        }
    }

    private boolean isOnline() {
        try {
            ConnectivityManager manager = (ConnectivityManager) getSystemService(CONNECTIVITY_SERVICE);
            NetworkInfo info = manager != null ? manager.getActiveNetworkInfo() : null;
            return info != null && info.isConnected();
        } catch (Exception error) {
            return false;
        }
    }

    private int dp(int value) {
        return (int) (value * getResources().getDisplayMetrics().density);
    }
}
