// ==============================================
// VIPE TRANSPORTES — BOT WHATSAPP
// Atendente: VIPI
// ==============================================

const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const axios     = require('axios');
const cloudinary = require('cloudinary').v2;
const qrcode    = require('qrcode-terminal');
const { execFile } = require('child_process');
const path      = require('path');
const fs        = require('fs');
const crypto    = require('crypto');
const ai        = require('./openai_helper');
const ocr       = require('./ocr_comprovante');
const extrator  = require('./extrator_campos');
const db        = require('./database');
const admin     = require('./admin_server');
require('dotenv').config();

const BAIXAS_API_BASE = (process.env.BAIXAS_API_BASE || 'https://backend-seven-gilt-97.vercel.app/api').replace(/\/+$/, '');
const CLOUDINARY_FOLDER = process.env.CLOUDINARY_FOLDER || 'vipe_transportes/comprovantes_baixa';
const JANELA_AGRUPAR_ANEXOS_MS = Number(process.env.JANELA_AGRUPAR_ANEXOS_MS || 8000);
const BAIXA_LOCAL_PADRAO = 'Viana';

// ── Envio de comprovantes em lote para a plataforma (tela "Baixa por Comprovante") ──
// A API faz a leitura por IA e agrupa por proprietário. Não identificamos o
// proprietário aqui no bot.
const COMPROVANTES_LOTE_URL = (process.env.COMPROVANTES_LOTE_URL || `${BAIXAS_API_BASE}/external/comprovantes/lote`).trim();
const COMPROVANTES_API_KEY = (process.env.COMPROVANTES_API_KEY || 'vipe_3353592218cafba90fd668f8e7f430376d2f8e24681d0f19').trim();
const COMPROVANTES_LOTE_MAX = Number(process.env.COMPROVANTES_LOTE_MAX || 60);
// A API baixa cada arquivo e faz leitura por IA, o que pode demorar. Para não
// estourar o timeout (e o limite de execução do backend), enviamos em poucos
// comprovantes por requisição, com um timeout generoso por requisição.
const COMPROVANTES_LOTE_CHUNK = Math.max(1, Number(process.env.COMPROVANTES_LOTE_CHUNK || 3));
const COMPROVANTES_LOTE_TIMEOUT_MS = Number(process.env.COMPROVANTES_LOTE_TIMEOUT_MS || 180000);

// Pasta onde os comprovantes recebidos ficam guardados enquanto a baixa não é
// finalizada (o usuário pode demorar para mandar o próximo comprovante).
const COMPROVANTES_PENDENTES_DIR = process.env.COMPROVANTES_PENDENTES_DIR
    || path.join(__dirname, 'comprovantes_pendentes');
try { fs.mkdirSync(COMPROVANTES_PENDENTES_DIR, { recursive: true }); } catch (_) {}

function configurarCloudinary() {
    const cloudinaryUrl = (process.env.CLOUDINARY_URL || '').trim().replace(/[<>]/g, '');
    if (cloudinaryUrl) {
        try {
            const parsed = new URL(cloudinaryUrl);
            cloudinary.config({
                cloud_name: parsed.hostname,
                api_key: decodeURIComponent(parsed.username),
                api_secret: decodeURIComponent(parsed.password),
                secure: true
            });
            return;
        } catch (err) {
            console.error('[CLOUDINARY CONFIG]', err.message || err);
        }
    }

    cloudinary.config({
        cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
        api_key: process.env.CLOUDINARY_API_KEY,
        api_secret: process.env.CLOUDINARY_API_SECRET,
        secure: true
    });
}

configurarCloudinary();

function joinIf(base, ...parts) {
    return base ? path.join(base, ...parts) : null;
}

function encontrarNavegadorChromium() {
    const candidatos = [
        process.env.PUPPETEER_EXECUTABLE_PATH,
        process.env.CHROME_PATH,
        joinIf(process.env.PROGRAMFILES, 'Google', 'Chrome', 'Application', 'chrome.exe'),
        joinIf(process.env['ProgramFiles(x86)'], 'Google', 'Chrome', 'Application', 'chrome.exe'),
        joinIf(process.env.LOCALAPPDATA, 'Google', 'Chrome', 'Application', 'chrome.exe'),
        joinIf(process.env.PROGRAMFILES, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
        joinIf(process.env['ProgramFiles(x86)'], 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
        joinIf(process.env.LOCALAPPDATA, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    ].filter(Boolean);

    return candidatos.find((arquivo) => fs.existsSync(arquivo));
}

// Inicia o banco de dados e o painel de administração
db.inicializar();
admin.iniciar();

// ==============================
// CONFIG (lida em tempo real)
// ==============================
const CONFIG_PATH = path.join(__dirname, 'config.json');
function cfg() {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
}

// Lista VIP lida do config.json a cada mensagem (sem reiniciar)
function isVip(chatId) {
    return cfg().vip_numbers.includes(chatId);
}

// ==============================
// CAMINHOS
// ==============================
const PYTHON        = process.env.PYTHON_PATH || 'python';
const SCRIPT_CIOT   = path.join(__dirname, 'ciot_excel.py');
const SCRIPT_MULTA  = path.join(__dirname, 'multas_excel.py');
const SCRIPT_PDF    = path.join(__dirname, 'relatorio_pdf.py');
const SCRIPT_CHAT   = path.join(__dirname, 'chatbot_vip.py');
const PROJECT_ROOT  = path.resolve(__dirname, '..');
const RELATORIOS_DIR = path.join(PROJECT_ROOT, 'Relatórios');
const CAMINHO_PDF   = process.env.CAMINHO_PDF || path.join(RELATORIOS_DIR, 'Pendencias.pdf');
const TIMEOUT_MS    = 5 * 60 * 1000;

// ==============================
// SAUDAÇÕES
// ==============================
function saudacaoPorHorario() {
    const h      = new Date().getHours();
    const periodo = h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
    const emojis  = h < 12 ? '🌅' : h < 18 ? '☀️' : '🌙';
    const msgs = [
        `${emojis} ${periodo}! Aqui é o *Vipi*, do time da Vipe Transportes! Como posso te ajudar? 😊`,
        `${emojis} ${periodo}! Bem-vindo à *Vipe Transportes*! Sou o *Vipi*, pode falar!`,
        `${emojis} ${periodo}! Que bom ter você aqui! Sou o *Vipi* — no que posso ajudar?`,
        `🚛 ${periodo}! Aqui é o *Vipi* da Vipe Transportes. No que posso ajudar?`,
        `👊 ${periodo}! *Vipi* na área! Pode mandar o que precisar.`,
    ];
    return msgs[Math.floor(Math.random() * msgs.length)];
}

function saudacaoCurtaPorHorario() {
    const h = new Date().getHours();
    return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
}

// ── Nome do usuário ──────────────────────────────
// Pega só o primeiro nome, com a primeira letra maiúscula.
function primeiroNome(nomeCompleto) {
    const t = String(nomeCompleto || '').trim().split(/\s+/)[0] || '';
    return t ? t.charAt(0).toUpperCase() + t.slice(1).toLowerCase() : '';
}

// Limpa o que a pessoa digitou como nome: remove emojis/números, frases comuns,
// limita a 3 palavras e 40 caracteres.
function limparNomeInformado(texto) {
    let t = String(texto || '')
        .replace(/(meu nome (é|e)|me chamo|sou o|sou a|aqui (é|e) o|aqui (é|e) a|pode me chamar de)/gi, ' ')
        .replace(/[^\p{L}\s'.-]/gu, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    t = t.split(' ').filter(Boolean).slice(0, 3).join(' ');
    return t.slice(0, 40).trim();
}

// Retorna o nome salvo do usuário (cacheado no userState, com fallback no banco).
function nomeSalvo(chatId) {
    if (userState[chatId]?.nome) return userState[chatId].nome;
    const u = db.buscarUsuario(chatId);
    if (u?.nome) {
        if (!userState[chatId]) userState[chatId] = {};
        userState[chatId].nome = u.nome;
        return u.nome;
    }
    return null;
}

// Saudação de boas-vindas já com o nome da pessoa.
function saudacaoComNome(nome) {
    const periodo = saudacaoCurtaPorHorario();
    const h = new Date().getHours();
    const emoji = h < 12 ? '🌅' : h < 18 ? '☀️' : '🌙';
    const p = primeiroNome(nome);
    return `${emoji} ${periodo}, *${p}*! Aqui é o *Vipi*, da Vipe Transportes. No que posso te ajudar? 😊`;
}

const MSGS_CONSULTANDO = [
    '🔍 Deixa eu verificar isso pra você... um segundo! ⏳',
    '⏳ Buscando as informações agora, só um instante!',
    '🔎 Já estou olhando aqui no sistema... aguarda um pouquinho!',
    '📋 Vou checar isso agora mesmo! Um momento...',
    '💻 Consultando o sistema... já já trago o resultado!',
];
function msgConsultandoAleatoria() {
    return MSGS_CONSULTANDO[Math.floor(Math.random() * MSGS_CONSULTANDO.length)];
}

// ==============================
// DATAS COMEMORATIVAS
// ==============================
function getNthWeekday(year, month, weekday, nth) {
    let count = 0;
    for (let day = 1; day <= 31; day++) {
        const d = new Date(year, month, day);
        if (d.getMonth() !== month) break;
        if (d.getDay() === weekday) { count++; if (count === nth) return d.getDate(); }
    }
    return null;
}

function verificarDataComemorativa() {
    const hoje = new Date();
    const dia  = hoje.getDate();
    const mes  = hoje.getMonth();
    const ano  = hoje.getFullYear();

    if (mes === 2 && dia === 8)  return { tipo: 'mulher',    label: 'Dia Internacional da Mulher' };
    if (mes === 6 && dia === 25) return { tipo: 'motorista', label: 'Dia do Motorista' };

    const diadasMaes = getNthWeekday(ano, 4, 0, 2);
    if (mes === 4 && dia === diadasMaes) return { tipo: 'maes', label: 'Dia das Mães' };

    const diadosPais = getNthWeekday(ano, 7, 0, 2);
    if (mes === 7 && dia === diadosPais) return { tipo: 'pais', label: 'Dia dos Pais' };

    return null;
}

// Monta prompt lendo do config.json em tempo real
function montarPromptCuriosidade(dataComemorativa) {
    const config = cfg();

    if (dataComemorativa) {
        return config.prompts_datas_comemorativas[dataComemorativa.tipo] || null;
    }

    const curiosidadesVipe  = config.curiosidades_vipe  || [];
    const curiosidadesSetor = config.curiosidades_setor || [];
    const usarVipe = Math.random() < 0.5;

    if (usarVipe && curiosidadesVipe.length > 0) {
        const tema = curiosidadesVipe[Math.floor(Math.random() * curiosidadesVipe.length)];
        return `${tema} Use 1 ou 2 emojis relacionados. Escreva em português do Brasil, de forma descontraída e calorosa. Não use título ou introdução, vá direto à curiosidade.`;
    } else if (curiosidadesSetor.length > 0) {
        const tema = curiosidadesSetor[Math.floor(Math.random() * curiosidadesSetor.length)];
        return `${tema} Seja breve (máximo 3 linhas), descontraído e use 1 ou 2 emojis relacionados. Escreva em português do Brasil. Não use título ou introdução, vá direto à curiosidade.`;
    }
    return null;
}

async function gerarCuriosidadeOuData() {
    try {
        const dataComemorativa = verificarDataComemorativa();
        const prompt = montarPromptCuriosidade(dataComemorativa);
        if (!prompt) return null;
        const resposta = await ai.chamarOpenAISimples(prompt);
        return resposta?.trim() || null;
    } catch (err) {
        console.error('[CURIOSIDADE IA]', err.message || err);
        return null;
    }
}

// ==============================
// CLIENT WHATSAPP
// ==============================
const browserPath = encontrarNavegadorChromium();
const puppeteerOptions = {
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
};

if (browserPath) {
    puppeteerOptions.executablePath = browserPath;
    console.log(`🌐 Navegador Chromium encontrado: ${browserPath}`);
} else {
    console.warn('⚠️ Chrome/Edge nao encontrado. Instale o Chrome ou rode: npx puppeteer browsers install chrome');
}

const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: puppeteerOptions,
    webVersionCache: {
        type: 'remote',
        remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2412.54.html'
    }
});

// ==============================
// ESTADO POR CHAT
// ==============================
const userState = {};
function getEstado(id)       { return (userState[id] || {}).estado || null; }
function setEstado(id, est)  { _limparTimer(id); userState[id] = { ...(userState[id] || {}), estado: est, timer: null }; if (est !== 'menu') _iniciarTimer(id); }
function resetar(id)         { _limparTimer(id); const prev = userState[id] || {}; userState[id] = { estado: 'menu', timer: null, saudado: prev.saudado, foiTimeout: prev.foiTimeout, nome: prev.nome }; }
function _limparTimer(id)    { if (userState[id]?.timer) { clearTimeout(userState[id].timer); userState[id].timer = null; } }

function _iniciarTimer(id) {
    _limparTimer(id);
    const t = setTimeout(async () => {
        if (!getEstado(id) || getEstado(id) === 'menu') return;
        resetar(id);
        try {
            const msgs = [
                '⏱️ Ei, sumiu! Encerrando por inatividade... Quando precisar, é só chamar o *Vipi*! 👊',
                '😴 Parece que você foi descansar! Encerrando por inatividade. Qualquer coisa, estou aqui! 🚛',
                '⏱️ Sessão encerrada por inatividade. Estamos sempre aqui! *Vipi* 😊',
            ];
            await enviar(id, msgs[Math.floor(Math.random() * msgs.length)]);
            if (!userState[id]) userState[id] = {};
            userState[id].foiTimeout = true;
            db.registrar(id, isVip(id), db.TIPOS.TIMEOUT, 'Sessão encerrada por inatividade');
        } catch (e) { console.error('[TIMEOUT]', e.message); }
    }, TIMEOUT_MS);
    if (userState[id]) userState[id].timer = t;
}

function renovarTimer(id) { const e = getEstado(id); if (e && e !== 'menu') _iniciarTimer(id); }

// ==============================
// FILA POR CHAT
// ==============================
const filaProcessamento = {};
async function processarComFila(chatId, body) {
    if (!filaProcessamento[chatId]) filaProcessamento[chatId] = Promise.resolve();
    filaProcessamento[chatId] = filaProcessamento[chatId].then(() => processar(chatId, body.normalizado, body.original, body.msg));
    return filaProcessamento[chatId];
}

const gruposAnexosBaixa = {};

function deveAgruparAnexoBaixa(chatId, bodyOriginal, msg) {
    if (!isVip(chatId) || !msg?.hasMedia) return false;
    const estado = getEstado(chatId);
    if (estado && !['menu', 'baixa_analisando', 'comprovantes_escolha', 'comprovantes_coletando'].includes(estado)) return false;
    return gatilhoBaixaAutomatica(bodyOriginal, msg);
}

function agendarGrupoAnexoBaixa(chatId, bodyOriginal, msg) {
    if (!gruposAnexosBaixa[chatId]) {
        gruposAnexosBaixa[chatId] = { mensagens: [], textos: [], timer: null, avisado: false };
    }
    const grupo = gruposAnexosBaixa[chatId];
    grupo.mensagens.push(msg);
    if (bodyOriginal) grupo.textos.push(bodyOriginal);

    if (!grupo.avisado) {
        grupo.avisado = true;
        const est = getEstado(chatId);
        // Em modo de coleta para a plataforma não anunciamos "baixa de pendência".
        const aviso = est === 'comprovantes_coletando'
            ? '📥 Recebendo seus comprovantes... aguarde só um instante enquanto eu junto todos. ⏳'
            : `${saudacaoCurtaPorHorario()}! Recebi seu(s) comprovante(s) de pagamento.\n\n` +
              'Vou aguardar alguns segundos para juntar todos os anexos. ⏳';
        enviarComDigitacao(chatId, aviso, 700)
            .catch((err) => console.error('[AGRUPAR ANEXOS AVISO]', err.message || err));
    }

    if (grupo.timer) clearTimeout(grupo.timer);
    grupo.timer = setTimeout(() => {
        const atual = gruposAnexosBaixa[chatId];
        delete gruposAnexosBaixa[chatId];
        if (!atual) return;
        const texto = atual.textos.filter(Boolean).join('\n');
        const msgGrupo = {
            hasMedia: true,
            isGrupoBaixa: true,
            anexosBaixa: atual.mensagens,
            body: texto,
            from: chatId,
        };
        processarComFila(chatId, { normalizado: texto.toLowerCase(), original: texto, msg: msgGrupo })
            .catch((err) => console.error('[AGRUPAR ANEXOS PROCESSAR]', err.message || err));
    }, JANELA_AGRUPAR_ANEXOS_MS);
}

// ==============================
// ENVIO
// ==============================
async function enviar(chatId, texto) { await client.sendMessage(chatId, texto); }

async function enviarComDigitacao(chatId, texto, ms = 1200) {
    try { const chat = await client.getChatById(chatId); await chat.sendStateTyping(); await sleep(ms); await chat.clearState(); } catch (_) {}
    await client.sendMessage(chatId, texto);
}

async function enviarMenu(chatId) {
    const vip = isVip(chatId);
    const p = primeiroNome(nomeSalvo(chatId) || '');
    let menu =
        (p ? `📋 *Menu de Serviços* — Olá, ${p}!\n` : '📋 *Menu de Serviços*\n') +
        '━━━━━━━━━━━━━━━━━━━━\n\n' +
        '1️⃣  Consulta Saldo CIOT\n' +
        '2️⃣  Consulta de Multas\n' +
        '3️⃣  Baixa de Manifesto\n' +
        '4️⃣  Encerrar chat\n';
    if (vip) {
        menu += '5️⃣  📄 Relatório de Pendências (PDF)\n';
        menu += '6️⃣  🤖 Perguntar ao Vipi (IA)\n';
        menu += '7️⃣  ✅ Lançar baixa\n';
    }
    menu += '\n━━━━━━━━━━━━━━━━━━━━\n_Digite o número da opção desejada_ 👆';
    await enviarComDigitacao(chatId, menu, 800);
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function validarCPF(t) { return /^\d{11}$/.test(t.replace(/\D/g, '')); }

function hojeISO() {
    return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
}

function isPular(texto) {
    return ['pular', 'sem', 'nao', 'não', 'n/a', '-'].includes(String(texto || '').trim().toLowerCase());
}

function formatarMoeda(valor) {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(valor || 0));
}

function parseValorDecimal(texto) {
    let limpo = String(texto || '').replace(/r\$/gi, '').replace(/[^\d.,-]/g, '').trim();
    if (!limpo) return null;

    const temVirgula = limpo.includes(',');
    const temPonto = limpo.includes('.');
    if (temVirgula && temPonto) {
        const ultimaVirgula = limpo.lastIndexOf(',');
        const ultimoPonto = limpo.lastIndexOf('.');
        limpo = ultimaVirgula > ultimoPonto
            ? limpo.replace(/\./g, '').replace(',', '.')
            : limpo.replace(/,/g, '');
    } else if (temVirgula) {
        limpo = limpo.replace(/\./g, '').replace(',', '.');
    } else {
        const partes = limpo.split('.');
        if (partes.length > 2 || (partes.length === 2 && partes[1].length === 3)) {
            limpo = partes.join('');
        }
    }

    const valor = Number(limpo);
    if (!Number.isFinite(valor) || valor <= 0) return null;
    return Math.round(valor * 100) / 100;
}

function normalizarData(texto) {
    const valor = String(texto || '').trim().toLowerCase();
    if (valor === 'hoje') return hojeISO();

    let ano, mes, dia;
    let m = valor.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m) {
        [, ano, mes, dia] = m;
    } else {
        m = valor.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
        if (!m) return null;
        [, dia, mes, ano] = m;
        dia = dia.padStart(2, '0');
        mes = mes.padStart(2, '0');
    }

    const data = new Date(`${ano}-${mes}-${dia}T00:00:00`);
    if (Number.isNaN(data.getTime())) return null;
    if (data.getFullYear() !== Number(ano) || data.getMonth() + 1 !== Number(mes) || data.getDate() !== Number(dia)) return null;
    return `${ano}-${mes}-${dia}`;
}

const RECEBEDOR_VIPE = 'VIPE TRANSPORTES MULTIMODAIS LTDA';
const RECEBEDOR_AUGUSTO = 'Augusto';

function normalizarRecebedorBaixa(valor) {
    const raw = String(valor || '').trim();
    if (!raw || raw.toLowerCase() === 'null') return null;
    const norm = raw.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const digits = raw.replace(/\D/g, '');
    if (norm === '1' || norm.includes('vipe') || norm.includes('vipi') || norm.includes('multimodais') || digits.includes('57312701000183')) {
        return RECEBEDOR_VIPE;
    }
    if (norm === '2' || norm.includes('augusto')) {
        return RECEBEDOR_AUGUSTO;
    }
    return null;
}

function extrairUrls(texto) {
    const urls = String(texto || '').match(/https?:\/\/[^\s,;]+/gi) || [];
    return [...new Set(urls.map((url) => url.replace(/[)\].,;]+$/, '')))];
}

function iniciarBaixa(chatId) {
    if (!userState[chatId]) userState[chatId] = {};
    const sufixo = chatId.replace(/[^\w]/g, '').slice(-10) || 'whatsapp';
    userState[chatId].baixa = {
        local: BAIXA_LOCAL_PADRAO,
        anexos: [],
        formaPerguntada: false,
        recebedorPerguntado: false,
        anexosPerguntado: false,
        idempotency_key: `baixa-${hojeISO().replace(/-/g, '')}-${sufixo}-${crypto.randomUUID()}`
    };
}

function baixaAtual(chatId) {
    if (!userState[chatId]) userState[chatId] = {};
    if (!userState[chatId].baixa) iniciarBaixa(chatId);
    return userState[chatId].baixa;
}

async function autenticarBaixas() {
    const login = (process.env.BAIXAS_ADMIN_LOGIN || '').trim();
    const password = (process.env.BAIXAS_ADMIN_PASSWORD || '').trim();
    if (!login || !password) {
        const err = new Error('Credenciais da API de baixas não configuradas no .env.');
        err.codigo = 'BAIXAS_CREDENCIAIS';
        throw err;
    }

    const resp = await axios.post(`${BAIXAS_API_BASE}/auth/login`, { login, password }, {
        timeout: 30000,
        headers: { 'Content-Type': 'application/json' }
    });

    const token = resp.data?.token || resp.data?.access_token || resp.data?.accessToken || resp.data?.jwt;
    if (!token) throw new Error('Login realizado, mas a API não retornou token.');
    return token;
}

async function buscarAbastecimentosPendentes({ token, id_proprietario, local = BAIXA_LOCAL_PADRAO, limit = 120 }) {
    const resp = await axios.get(`${BAIXAS_API_BASE}/abastecimentos/filter/baixa-pendente`, {
        timeout: 45000,
        params: { id_proprietario, local, limit },
        headers: { Authorization: `Bearer ${token}` }
    });
    return extrairListaApi(resp.data);
}

async function chamarBaixaLote(payload, token) {
    try {
        const resp = await axios.post(`${BAIXAS_API_BASE}/baixas/lote`, payload, {
            timeout: 45000,
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });
        return { status: resp.status, data: resp.data };
    } catch (err) {
        if (err.response) return { status: err.response.status, data: err.response.data, erro: true };
        throw err;
    }
}

async function listarProprietarios({ token, search, local, includeInactive = false }) {
    const todos = [];
    let page = 1;
    let lastPage = 1;

    do {
        const params = {
            per_page: 500,
            page,
        };
        if (search) params.search = search;
        if (local) params.local = local;
        if (includeInactive) params.include_inactive = 'true';

        const resp = await axios.get(`${BAIXAS_API_BASE}/proprietarios`, {
            timeout: 30000,
            params,
            headers: { Authorization: `Bearer ${token}` }
        });

        const data = resp.data || {};
        const itens = Array.isArray(data.data) ? data.data : [];
        todos.push(...itens);
        page = Number(data.current_page || page);
        lastPage = Number(data.last_page || page);
        page += 1;
    } while (page <= lastPage);

    return todos;
}

function normalizarTextoBusca(texto) {
    return String(texto || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^\w\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .toUpperCase();
}

function pontuarProprietario(busca, prop) {
    const alvo = normalizarTextoBusca(busca);
    const nome = normalizarTextoBusca(prop.nome);
    if (!alvo || !nome) return 0;
    if (nome === alvo) return 100;
    if (nome.startsWith(alvo) || alvo.startsWith(nome)) return 85;
    if (nome.includes(alvo) || alvo.includes(nome)) return 75;

    const tokensBusca = new Set(alvo.split(' ').filter((t) => t.length > 2));
    const tokensNome = new Set(nome.split(' ').filter((t) => t.length > 2));
    if (tokensBusca.size === 0) return 0;
    let iguais = 0;
    for (const token of tokensBusca) if (tokensNome.has(token)) iguais += 1;
    return Math.round((iguais / tokensBusca.size) * 70);
}

async function resolverProprietarioCadastrado(baixa) {
    const token = await autenticarBaixas();
    const local = BAIXA_LOCAL_PADRAO;
    let candidatos = [];

    const aliasOrigem = origemAliasProprietario(baixa);
    const aliasSalvo = aliasOrigem ? db.buscarProprietarioAlias(aliasOrigem, local) : null;
    if (aliasSalvo && aliasSalvo.id_proprietario) {
        const lista = await listarProprietarios({ token, local, includeInactive: true });
        const encontrado = lista.find((p) => String(p.id_proprietario) === String(aliasSalvo.id_proprietario));
        if (encontrado) {
            db.registrarUsoProprietarioAlias(aliasSalvo.id);
            return { proprietario: encontrado, candidatos: [encontrado], token, alias: aliasSalvo };
        }
    }

    if (baixa.id_proprietario) {
        const lista = await listarProprietarios({ token, local, includeInactive: true });
        const encontrado = lista.find((p) => String(p.id_proprietario) === String(baixa.id_proprietario));
        if (encontrado) return { proprietario: encontrado, candidatos: [encontrado], token };
        return { proprietario: null, candidatos: [], token };
    }

    if (!baixa.nome_proprietario) return { proprietario: null, candidatos: [], token };

    candidatos = await listarProprietarios({
        token,
        search: baixa.nome_proprietario,
        local,
        includeInactive: true
    });

    const ordenados = candidatos
        .map((p) => ({ ...p, _score: pontuarProprietario(baixa.nome_proprietario, p) }))
        .sort((a, b) => b._score - a._score);

    const ativos = ordenados.filter((p) => String(p.status || '').toLowerCase() !== 'inativo');
    const base = ativos.length ? ativos : ordenados;

    return { proprietario: null, candidatos: base.slice(0, 5), token };
}

async function confirmarProprietarioParaLote(baixa, token) {
    const search = baixa.nome_proprietario || origemAliasProprietario(baixa);
    if (!search) return null;

    const candidatos = await listarProprietarios({
        token,
        search,
        local: BAIXA_LOCAL_PADRAO,
        includeInactive: true
    });
    const ativos = candidatos.filter((p) => String(p.status || '').toLowerCase() !== 'inativo');
    const base = ativos.length ? ativos : candidatos;

    if (baixa.id_proprietario) {
        return base.find((p) => String(p.id_proprietario) === String(baixa.id_proprietario)) || null;
    }

    return base.length === 1 ? base[0] : null;
}

function mensagemApi(data) {
    if (!data) return 'Sem mensagem detalhada.';
    return data.message || data.mensagem || data.error || data.erro || data.detail || JSON.stringify(data).slice(0, 500);
}

function resumoErroApi(data) {
    const msg = mensagemApi(data);
    if (/baixa_abastecimento/i.test(msg) && /boolean/i.test(msg) && /integer/i.test(msg)) {
        return 'Erro interno da API: o backend tentou gravar `baixa_abastecimento = 1`, mas essa coluna é booleana no PostgreSQL. A baixa não foi registrada.';
    }
    return msg.length > 900 ? `${msg.slice(0, 900)}...` : msg;
}

function procurarArrayAbastecimentos(obj, profundidade = 0) {
    if (!obj || profundidade > 3) return null;
    if (Array.isArray(obj)) return null;
    if (typeof obj !== 'object') return null;

    for (const [chave, valor] of Object.entries(obj)) {
        if (Array.isArray(valor) && /abastec|suger|pendente|item/i.test(chave)) return valor;
    }
    for (const valor of Object.values(obj)) {
        const encontrado = procurarArrayAbastecimentos(valor, profundidade + 1);
        if (encontrado) return encontrado;
    }
    return null;
}

function extrairListaApi(data) {
    if (Array.isArray(data)) return data;
    if (Array.isArray(data?.data)) return data.data;
    if (Array.isArray(data?.items)) return data.items;
    if (Array.isArray(data?.results)) return data.results;
    return procurarArrayAbastecimentos(data) || [];
}

function idAbastecimento(item) {
    return item?.id_abastecimento || item?.id || item?.abastecimento_id || item?.codigo || null;
}

function valorAbastecimento(item) {
    return parseValorDecimal(item?.valor_total ?? item?.valor ?? item?.valor_pendente ?? item?.total ?? item?.valor_abastecimento);
}

function litrosAbastecimento(item) {
    const valor = String(item?.litros ?? item?.quantidade_litros ?? item?.qtd_litros ?? item?.volume ?? '').replace(',', '.');
    const numero = Number(valor);
    return Number.isFinite(numero) ? numero : 0;
}

function dataAbastecimento(item) {
    return item?.data_hora || item?.data_abastecimento || item?.data || item?.created_at || item?.data_lancamento || '';
}

function dataAbastecimentoISO(item) {
    const texto = String(dataAbastecimento(item) || '').trim();
    if (!texto) return null;
    const iso = texto.match(/^(\d{4}-\d{2}-\d{2})/);
    if (iso) return iso[1];
    return normalizarData(texto.slice(0, 10));
}

function placaAbastecimento(item) {
    return item?.placa || item?.placa1 || item?.veiculo?.placa || '-';
}

function motoristaAbastecimento(item) {
    return item?.motorista || item?.nome_motorista || item?.motorista_nome || item?.condutor || '-';
}

function ordenarAbastecimentosPendentes(itens) {
    return [...itens].sort((a, b) => String(dataAbastecimento(a)).localeCompare(String(dataAbastecimento(b))));
}

function resumoLoteSelecionado(selecionados, valorPago, criterio) {
    const total = Math.round(selecionados.reduce((soma, item) => soma + Number(valorAbastecimento(item) || 0), 0) * 100) / 100;
    const litros = Math.round(selecionados.reduce((soma, item) => soma + litrosAbastecimento(item), 0) * 1000) / 1000;
    return {
        selecionados,
        ids: selecionados.map(idAbastecimento).filter(Boolean),
        total,
        litros,
        quantidade: selecionados.length,
        diferenca: Math.round((Number(valorPago || 0) - total) * 100) / 100,
        criterio
    };
}

function selecionarAbastecimentosPorValor(pendentes, valorPago, dataPagamento = null) {
    const alvo = Number(valorPago || 0);
    const ordenados = ordenarAbastecimentosPendentes(pendentes)
        .filter((item) => idAbastecimento(item) && valorAbastecimento(item) !== null);

    const mesmoValor = ordenados.filter((item) => Math.abs(valorAbastecimento(item) - alvo) <= 0.01);
    if (dataPagamento) {
        const exatoNaData = mesmoValor.find((item) => dataAbastecimentoISO(item) === dataPagamento);
        if (exatoNaData) return resumoLoteSelecionado([exatoNaData], valorPago, 'valor_exato_data_pagamento');
    }

    if (mesmoValor.length === 1) return resumoLoteSelecionado([mesmoValor[0]], valorPago, 'valor_exato_unico');
    if (mesmoValor.length > 1) {
        const maisRecente = [...mesmoValor].sort((a, b) => String(dataAbastecimento(b)).localeCompare(String(dataAbastecimento(a))))[0];
        return resumoLoteSelecionado([maisRecente], valorPago, 'valor_exato_mais_recente');
    }

    const selecionados = [];
    let total = 0;

    for (const item of ordenados) {
        const id = idAbastecimento(item);
        const valor = valorAbastecimento(item);
        if (!id || valor === null) continue;

        selecionados.push(item);
        total = Math.round((total + valor) * 100) / 100;
        if (total >= alvo - 0.01) break;
    }

    return resumoLoteSelecionado(selecionados, valorPago, 'soma_mais_antigos');
}

function sugerirCorrecaoValorPorPendentes(pendentes, valorInformado, dataPagamento = null) {
    const alvo = Number(valorInformado || 0);
    if (!Number.isFinite(alvo) || alvo <= 0) return null;

    const tolerancia = Math.max(100, alvo * 0.05);
    const proximos = ordenarAbastecimentosPendentes(pendentes)
        .filter((item) => idAbastecimento(item) && valorAbastecimento(item) !== null)
        .filter((item) => {
            const diferenca = Math.abs(valorAbastecimento(item) - alvo);
            return diferenca > 0.01 && diferenca <= tolerancia;
        });

    const naData = dataPagamento ? proximos.filter((item) => dataAbastecimentoISO(item) === dataPagamento) : [];
    const candidatos = naData.length ? naData : proximos;
    if (candidatos.length !== 1) return null;
    return candidatos[0];
}

function formatarListaAbastecimentos(itens, titulo = '*Abastecimentos:*') {
    if (!itens || itens.length === 0) return `${titulo}\nNenhum abastecimento encontrado.`;

    let texto = `${titulo}\n`;
    itens.forEach((item, i) => {
        const id = idAbastecimento(item) || '-';
        const data = String(dataAbastecimento(item) || '-').replace('T', ' ').slice(0, 16);
        const placa = placaAbastecimento(item);
        const motorista = motoristaAbastecimento(item);
        const litros = litrosAbastecimento(item);
        const valor = valorAbastecimento(item) || 0;
        texto += `${i + 1}. ID ${id} | ${data} | ${placa} | ${motorista} | ${litros.toLocaleString('pt-BR')} L | ${formatarMoeda(valor)}\n`;
    });
    return texto.trimEnd();
}

function montarPayloadBaixaLote(baixa) {
    return {
        ids: baixa.loteBaixa.ids,
        forma_pagamento: baixa.forma_pagamento || null,
        data_pagamento: baixa.data_pagamento,
        data_baixa: hojeISO(),
        tipo_despesa: 'Combustível',
        descricao: 'Baixa via bot WhatsApp',
        recebedor: normalizarRecebedorBaixa(baixa.recebedor) || null,
        observacao: baixa.observacao || `Baixa via bot WhatsApp - ${baixa.loteBaixa.quantidade} abastecimento(s) em lote`,
        anexos: baixa.anexos || []
    };
}

function formatarResumoLote(lote, valorPago) {
    const criterio = {
        valor_exato_data_pagamento: 'valor exato na data do pagamento',
        valor_exato_unico: 'valor exato encontrado',
        valor_exato_mais_recente: 'valor exato mais recente',
        valor_corrigido_por_pendente: 'valor corrigido pelo abastecimento pendente',
        soma_mais_antigos: 'soma dos pendentes mais antigos'
    }[lote.criterio] || 'pendentes selecionados';

    return (
        `${lote.valor_informado_original ? `Valor lido inicialmente: *${formatarMoeda(lote.valor_informado_original)}*\n` : ''}` +
        `Valor pago: *${formatarMoeda(valorPago)}*\n` +
        `Total selecionado: *${formatarMoeda(lote.total)}*\n` +
        `Diferença: *${formatarMoeda(lote.diferenca)}*\n` +
        `Litros: *${Number(lote.litros || 0).toLocaleString('pt-BR')} L*\n` +
        `Quantidade: *${lote.quantidade} abastecimento(s)*\n` +
        `Critério: *${criterio}*`
    );
}

function formatarResultadoBaixaLote(resultado, lote) {
    const data = resultado?.data || {};
    const ids = Array.isArray(data.ids) && data.ids.length ? data.ids : lote.ids;
    const total = data.total_baixado ?? data.valor_baixado ?? data.valor_total ?? lote.total;
    const litros = data.litros ?? data.total_litros ?? lote.litros;
    const quantidade = data.quantidade ?? data.total_abastecimentos ?? ids.length;

    return (
        `Total baixado: *${formatarMoeda(total)}*\n` +
        `Litros: *${Number(litros || 0).toLocaleString('pt-BR')} L*\n` +
        `Quantidade: *${quantidade} abastecimento(s)*\n` +
        `IDs baixados: *${ids.join(', ')}*`
    );
}

function normalizarFormaPagamento(texto) {
    const valor = String(texto || '').trim();
    if (/^pix$/i.test(valor)) return 'PIX';
    return valor;
}

function comandoZerarBaseBaixa(body) {
    return /^(zerar|zerar base|zerar baixas|limpar base|limpar baixas|começar do zero|comecar do zero|iniciar do zero)$/i.test(String(body || '').trim());
}

function normalizarIdentificadorPagamento(valor) {
    const texto = String(valor || '').trim();
    if (!texto || texto.toLowerCase() === 'null') return null;
    return texto.replace(/[\s:;.,-]/g, '').toUpperCase();
}

function ehIdentificadorPixControle(valor) {
    return /^E\d{20,}[A-Z0-9._-]*$/i.test(String(valor || '').trim());
}

function coletarIdentificadoresPagamentoTexto(texto) {
    const bruto = String(texto || '');
    const candidatos = [];
    // REGRA: o ID de duplicidade só pode vir dos campos "ID da Transação"
    // ou "Autenticação" do comprovante. Nenhum outro termo é aceito.
    const padroes = [
        {
            re: /id\s*(?:da)?\s*transa[cç][aã]o\s*[:\-]?\s*([A-Z0-9._-]{8,100})/gi,
            prioridade: 100
        },
        {
            re: /(?:c[oó]digo\s*(?:de)?\s*)?autentica[cç][aã]o\s*[:\-]?\s*([A-Z0-9._-]{8,100})/gi,
            prioridade: 90
        },
    ];

    for (const padrao of padroes) {
        for (const m of bruto.matchAll(padrao.re)) {
            if (m?.[1]) candidatos.push({ valor: m[1].trim(), prioridade: padrao.prioridade, origem: 'texto' });
        }
    }

    const vistos = new Set();
    return candidatos.filter((c) => {
        const normalizado = normalizarIdentificadorPagamento(c.valor);
        if (!normalizado || vistos.has(normalizado)) return false;
        vistos.add(normalizado);
        return true;
    });
}

function escolherMelhorIdentificadorPagamento(...fontes) {
    const candidatos = [];
    for (const fonte of fontes.flat(Infinity)) {
        if (!fonte) continue;
        if (typeof fonte === 'string') {
            candidatos.push({ valor: fonte, prioridade: 50, origem: 'ia' });
            continue;
        }
        if (typeof fonte === 'object' && fonte.valor) {
            candidatos.push({ valor: fonte.valor, prioridade: Number(fonte.prioridade || 50), origem: fonte.origem || 'ia' });
        }
    }

    return candidatos
        .filter((c) => normalizarIdentificadorPagamento(c.valor))
        .sort((a, b) => {
            const scoreA = (ehIdentificadorPixControle(a.valor) ? 1000 : 0) + Number(a.prioridade || 0);
            const scoreB = (ehIdentificadorPixControle(b.valor) ? 1000 : 0) + Number(b.prioridade || 0);
            return scoreB - scoreA;
        })[0]?.valor?.trim() || null;
}

function extrairIdentificadorPagamentoTexto(texto) {
    return escolherMelhorIdentificadorPagamento(coletarIdentificadoresPagamentoTexto(texto));
}

function extrairTextoPdfLocal(arquivo) {
    if (!arquivo || !/\.pdf$/i.test(arquivo) || !fs.existsSync(arquivo)) return Promise.resolve('');
    const codigo = [
        'import sys',
        'try:',
        '    import pdfplumber',
        '    with pdfplumber.open(sys.argv[1]) as pdf:',
        '        print("\\n".join((p.extract_text() or "") for p in pdf.pages))',
        'except Exception:',
        '    print("")',
    ].join('\n');
    return new Promise((resolve) => {
        execFile(PYTHON, ['-c', codigo, arquivo], { timeout: 15000, env: { ...process.env, PYTHONIOENCODING: 'utf-8' } }, (err, stdout) => {
            if (err) return resolve('');
            resolve(String(stdout || '').trim());
        });
    });
}

function hashBase64(base64) {
    if (!base64) return null;
    return crypto.createHash('sha256').update(Buffer.from(base64, 'base64')).digest('hex');
}

function hashTexto(texto) {
    if (!texto) return null;
    return crypto.createHash('sha256').update(String(texto).trim()).digest('hex');
}

function cloudinaryConfigurado() {
    return true; // Cloudinary removido, agora usa Google Drive via backend
}

function extensaoPorMime(mimetype) {
    const mapa = {
        'image/jpeg': 'jpg',
        'image/png': 'png',
        'image/webp': 'webp',
        'application/pdf': 'pdf',
    };
    return mapa[mimetype] || String(mimetype || '').split('/')[1] || 'bin';
}

// Salva uma cópia local do comprovante recebido na pasta de pendentes.
// Retorna o caminho do arquivo gravado (ou null se não houver dados).
function salvarComprovanteLocal(media, chatId) {
    if (!media?.data) return null;
    try {
        const ext = extensaoPorMime(media.mimetype);
        const chatLimpo = String(chatId || 'whatsapp').replace(/[^\w]/g, '').slice(-12) || 'whatsapp';
        const hashCurto = hashBase64(media.data).slice(0, 8);
        const nome = `${hojeISO()}_${chatLimpo}_${hashCurto}.${ext}`;
        const destino = path.join(COMPROVANTES_PENDENTES_DIR, nome);
        if (!fs.existsSync(destino)) {
            fs.writeFileSync(destino, Buffer.from(media.data, 'base64'));
        }
        console.log(`💾 Comprovante salvo em pendentes: ${destino}`);
        return destino;
    } catch (err) {
        console.error('[COMPROVANTE LOCAL]', err.message || err);
        return null;
    }
}

async function uploadComprovanteGoogleDrive(media, chatId) {
    if (!media?.data || !media?.mimetype) throw new Error('Anexo sem dados para upload.');

    const bytesAprox = Math.ceil((media.data.length * 3) / 4);
    if (bytesAprox > 55 * 1024 * 1024) {
        throw new Error('Comprovante maior que o limite seguro para upload automático.');
    }

    const ext = extensaoPorMime(media.mimetype);
    const filename = `comprovante-${hojeISO().replace(/-/g, '')}-${chatId.replace(/[^\w]/g, '').slice(-10)}-${crypto.randomUUID()}.${ext}`;

    let result = null;
    let ultimoErro = null;
    for (let tentativa = 1; tentativa <= 3; tentativa++) {
        try {
            const resp = await axios.post(`${BAIXAS_API_BASE}/external/upload-drive-base64`, {
                filename: filename,
                mimeType: media.mimetype,
                base64Data: media.data
            }, {
                headers: {
                    'X-Api-Key': COMPROVANTES_API_KEY,
                    'Content-Type': 'application/json'
                },
                timeout: 60000
            });
            result = resp.data;
            break;
        } catch (err) {
            ultimoErro = err;
            const detalhe = err?.response?.data?.error || err?.response?.data?.message || err?.message || JSON.stringify(err);
            console.error(`[DRIVE UPLOAD] tentativa ${tentativa}/3 falhou (${media.mimetype}): ${detalhe}`);
            if (tentativa < 3) await sleep(1200 * tentativa);
        }
    }
    
    if (!result) {
        const msgErro = ultimoErro?.response?.data?.message || ultimoErro?.message || 'falha desconhecida no upload';
        throw new Error(msgErro);
    }

    return { 
        url: result.url, 
        previewUrl: result.previewUrl, 
        public_id: result.public_id, 
        resource_type: result.resource_type, 
        format: result.format 
    };
}

function gatilhoBaixaAutomatica(bodyOriginal, msg) {
    const texto = String(bodyOriginal || '').trim();
    const comandoCurto = /^(0|menu|[1-7])$/i.test(texto);
    return Boolean(msg?.hasMedia || (texto.length > 10 && !comandoCurto));
}

function normalizarLocalBaixa(valor) {
    const texto = String(valor || '').trim();
    if (/viana/i.test(texto)) return 'Viana';
    if (/matriz/i.test(texto)) return 'Matriz';
    return null;
}

function normalizarNomeLidoComprovante(nome) {
    const texto = String(nome || '').replace(/\s+/g, ' ').trim();
    if (!texto || texto.toLowerCase() === 'null') return '';
    if (/vipe/i.test(texto)) return '';
    return texto;
}

function origemAliasProprietario(baixa) {
    return normalizarNomeLidoComprovante(baixa.nome_lido_comprovante || baixa.nome_proprietario);
}

function salvarAliasProprietarioSeNecessario(baixa, proprietario) {
    const alias = origemAliasProprietario(baixa);
    if (!alias || !proprietario?.id_proprietario || !proprietario?.nome) return null;

    const salvo = db.salvarProprietarioAlias({
        alias,
        local: BAIXA_LOCAL_PADRAO,
        id_proprietario: proprietario.id_proprietario,
        nome_proprietario: proprietario.nome,
        campo_origem: baixa.campo_nome_proprietario || null,
        observacao: 'Equivalencia confirmada pelo usuario no fluxo de baixa do bot'
    });
    if (salvo) baixa.alias_proprietario_salvo = alias;
    return salvo;
}

function aplicarAliasProprietarioSalvo(baixa) {
    const alias = origemAliasProprietario(baixa);
    if (!alias) return null;
    const salvo = db.buscarProprietarioAlias(alias, BAIXA_LOCAL_PADRAO);
    if (!salvo) return null;

    baixa.id_proprietario = String(salvo.id_proprietario);
    baixa.nome_proprietario = salvo.nome_proprietario;
    baixa.local = BAIXA_LOCAL_PADRAO;
    baixa.alias_proprietario_usado = salvo.alias;
    return salvo;
}

function preencherBaixaComAnalise(chatId, analise, textoOriginal = '') {
    const baixa = baixaAtual(chatId);
    baixa.local = BAIXA_LOCAL_PADRAO;

    const id = String(analise?.id_proprietario || '').trim();
    const nomeLido = normalizarNomeLidoComprovante(analise?.nome_lido_comprovante || analise?.nome_proprietario);
    const campoNome = String(analise?.campo_nome_proprietario || '').trim();
    if (id && id.toLowerCase() !== 'null') {
        baixa.id_proprietario = id;
    }
    if (nomeLido) {
        baixa.nome_lido_comprovante = nomeLido;
        baixa.nome_proprietario = nomeLido;
    }
    if (campoNome && campoNome.toLowerCase() !== 'null') {
        baixa.campo_nome_proprietario = campoNome;
    }

    const valorTexto = String(analise?.valor_pago_texto || '').trim();
    const valor = parseValorDecimal(valorTexto || analise?.valor_pago);
    if (valor !== null) baixa.valor_pago = valor;
    if (valorTexto && valorTexto.toLowerCase() !== 'null') baixa.valor_pago_texto = valorTexto;
    if (analise?.calculo_valor) baixa.calculo_valor = String(analise.calculo_valor);

    const dataPagamento = normalizarData(analise?.data_pagamento);
    if (dataPagamento) baixa.data_pagamento = dataPagamento;
    baixa.data_baixa = hojeISO();

    if (analise?.forma_pagamento && String(analise.forma_pagamento).toLowerCase() !== 'null') {
        baixa.forma_pagamento = normalizarFormaPagamento(analise.forma_pagamento);
        baixa.formaPerguntada = true;
    }
    if (analise?.recebedor && String(analise.recebedor).toLowerCase() !== 'null') {
        const recebedor = normalizarRecebedorBaixa(analise.recebedor);
        if (recebedor) {
            baixa.recebedor = recebedor;
            baixa.recebedorPerguntado = true;
        }
    }

    const identificadoresIA = [];
    if (Array.isArray(analise?.identificadores_encontrados)) {
        for (const item of analise.identificadores_encontrados) {
            if (typeof item === 'string') identificadoresIA.push({ valor: item, prioridade: 60, origem: 'ia_lista' });
            else if (item?.valor) identificadoresIA.push({ valor: item.valor, prioridade: item.prioridade || 60, origem: 'ia_lista' });
        }
    }
    const identificador = escolherMelhorIdentificadorPagamento(
        coletarIdentificadoresPagamentoTexto(textoOriginal),
        identificadoresIA,
        analise?.identificador_pagamento ? { valor: analise.identificador_pagamento, prioridade: 50, origem: 'ia' } : null
    );
    if (identificador) {
        baixa.identificador_pagamento = String(identificador).trim();
        baixa.identificador_normalizado = normalizarIdentificadorPagamento(identificador);
    }

    const urls = extrairUrls(textoOriginal).slice(0, 4);
    if (urls.length > 0) {
        baixa.anexos = urls;
        baixa.anexosPerguntado = true;
    }

    baixa.analise_ia = {
        confianca_proprietario: Number(analise?.confianca_proprietario || 0),
        evidencias: String(analise?.evidencias || '').trim()
    };

    aplicarAliasProprietarioSalvo(baixa);
}

function proprietarioBaixa(baixa) {
    return baixa.nome_proprietario || null;
}

function proprietarioRascunho(rascunho) {
    return rascunho?.nome_proprietario || 'nome não identificado';
}

function ajustarValorPorComprovantesAgrupados(analise, quantidadeComprovantes) {
    if (!analise || quantidadeComprovantes <= 1) return analise;

    const valores = Array.isArray(analise.valores_comprovantes)
        ? analise.valores_comprovantes.map(parseValorDecimal).filter((v) => v !== null)
        : [];

    const representa = String(analise.valor_pago_representa || '').toLowerCase();

    if (valores.length > 1) {
        const soma = Math.round(valores.reduce((total, valor) => total + valor, 0) * 100) / 100;
        analise.valor_pago = soma;
        analise.valor_pago_representa = 'total';
        analise.calculo_valor = `${valores.length} comprovantes: ${valores.map(formatarMoeda).join(' + ')} = ${formatarMoeda(soma)}`;
        return analise;
    }

    const valor = parseValorDecimal(analise.valor_pago);
    const valorUnitario = valores.length === 1 && representa !== 'total' ? valores[0] : valor;
    if (valorUnitario !== null && (representa === 'unitario' || (valores.length === 1 && representa !== 'total'))) {
        const total = Math.round(valorUnitario * quantidadeComprovantes * 100) / 100;
        analise.valor_pago = total;
        analise.valor_pago_representa = 'total';
        analise.calculo_valor = `${quantidadeComprovantes} comprovante(s) x ${formatarMoeda(valorUnitario)} = ${formatarMoeda(total)}`;
    }

    return analise;
}

function resumoBaixaExtraida(baixa) {
    const linhas = [
        `Filial: *${baixa.local || 'não identificada'}*`,
        `Proprietário: *${proprietarioBaixa(baixa) || 'não identificado'}*`,
        `Valor pago: *${baixa.valor_pago ? formatarMoeda(baixa.valor_pago) : 'não identificado'}*`,
        `Data do pagamento: *${baixa.data_pagamento || 'não identificada'}*`,
    ];
    if (baixa.valor_pago_texto) linhas.push(`Valor lido no comprovante: *${baixa.valor_pago_texto}*`);
    if (baixa.nome_lido_comprovante && normalizarTextoBusca(baixa.nome_lido_comprovante) !== normalizarTextoBusca(baixa.nome_proprietario)) {
        linhas.push(`Nome no comprovante: *${baixa.nome_lido_comprovante}*`);
    }
    if (baixa.alias_proprietario_usado) linhas.push('Memória aplicada: *sim*');
    if (baixa.calculo_valor) linhas.push(`Cálculo: *${baixa.calculo_valor}*`);
    if (baixa.forma_pagamento) linhas.push(`Forma: *${baixa.forma_pagamento}*`);
    if (baixa.recebedor) linhas.push(`Recebedor: *${baixa.recebedor}*`);
    if (baixa.anexos?.length) linhas.push(`URLs de comprovante: *${baixa.anexos.length}*`);
    if (baixa.analise_ia?.evidencias) linhas.push(`Leitura da IA: _${baixa.analise_ia.evidencias}_`);
    if (baixa.identificador_pagamento) linhas.push(`Identificador: *${baixa.identificador_pagamento}*`);
    return linhas.join('\n');
}

async function baixarMidiasParaAnalise(msg, limite = 4) {
    if (!msg?.hasMedia) return [];
    const mensagens = msg.isGrupoBaixa ? (msg.anexosBaixa || []).slice(0, limite) : [msg];
    const itens = [];

    for (const mensagem of mensagens) {
        // Em raros casos o WhatsApp não consegue decriptar a mídia na 1ª tentativa.
        // Tenta baixar até 3 vezes antes de desistir, para a imagem não sumir.
        let media = null;
        for (let tentativa = 1; tentativa <= 3; tentativa++) {
            try {
                media = await mensagem.downloadMedia();
            } catch (err) {
                console.error(`[DOWNLOAD MEDIA] tentativa ${tentativa}/3 falhou: ${err.message || err}`);
            }
            if (media && media.data) break;
            if (tentativa < 3) await sleep(1000 * tentativa);
        }
        if (!media || !media.data) {
            console.error('[DOWNLOAD MEDIA] não foi possível baixar a mídia após 3 tentativas.');
            itens.push({ mimetype: '', data: null, analisavel: false, uploadError: 'Não consegui baixar a mídia do WhatsApp (tente reenviar).' });
            continue;
        }

        const tamanhoBase64 = String(media.data || '').length;
        const chatComprovante = mensagem.from || mensagem.to || msg.from || msg.to || 'whatsapp';
        const item = {
            mimetype: media.mimetype || '',
            data: tamanhoBase64 <= 22_000_000 ? media.data : null,
            filename: media.filename || mensagem._data?.filename || 'comprovante',
            analisavel: Boolean(media.mimetype?.startsWith('image/') && tamanhoBase64 <= 22_000_000),
            arquivo_hash: hashBase64(media.data),
            arquivo_local: salvarComprovanteLocal(media, chatComprovante)
        };

        if (item.mimetype === 'application/pdf' && item.arquivo_local) {
            item.texto_extraido = await extrairTextoPdfLocal(item.arquivo_local);
        }

        // OCR LOCAL de imagens (Tesseract.js): extrai o texto SEM enviar a imagem
        // para a IA. O texto é organizado depois por openai_helper.organizarTextoComprovante.
        if (item.mimetype?.startsWith('image/') && item.data && ocr.ocrDisponivel()) {
            try {
                const r = await ocr.extrairTextoImagem(item.data, { mimetype: item.mimetype });
                if (r?.texto) {
                    item.texto_extraido = r.texto;
                    item.ocr_confianca = r.confianca;
                    item.ocr_qualidade = ocr.qualidadeTexto(r.texto);
                }
            } catch (err) {
                console.error('[OCR LOCAL]', err.message || err);
            }
        }

        try {
            const uploaded = await uploadComprovanteGoogleDrive(media, mensagem.from || mensagem.to || msg.from || msg.to || 'whatsapp');
            item.url = uploaded.url;
            item.previewUrl = uploaded.previewUrl;
            item.public_id = uploaded.public_id;
            item.resource_type = uploaded.resource_type;
            item.format = uploaded.format;
            if (item.previewUrl) item.analisavel = true;
        } catch (err) {
            item.uploadError = err.message || String(err);
            console.error('[DRIVE UPLOAD]', err.message || err);
        }

        itens.push(item);
    }

    return itens;
}

async function proximaEtapaBaixa(chatId, origemAutomatica = false) {
    const baixa = baixaAtual(chatId);
    baixa.local = BAIXA_LOCAL_PADRAO;
    if (baixa.id_proprietario && !baixa.nome_proprietario) {
        await completarNomeProprietarioParaFeedback(chatId);
    }

    if (!baixa.nome_proprietario) {
        setEstado(chatId, 'baixa_proprietario');
        return enviarComDigitacao(chatId,
            '👤 Não consegui confirmar o *nome* do proprietário com segurança.\n\n' +
            'Se tiver o ID, envie assim: *ID 123*\n' +
            'Se não tiver, envie o *nome exatamente como cadastrado*.\n\n' +
            '_(Digite 0 para voltar ao menu)_', 900
        );
    }

    if (!baixa.valor_pago) {
        setEstado(chatId, 'baixa_valor');
        return enviarComDigitacao(chatId, '💵 Qual foi o *valor pago*?\n\nExemplos: *4166,00* ou *4166.00*\n\n_(Digite 0 para voltar ao menu)_', 800);
    }

    if (!baixa.data_pagamento) {
        setEstado(chatId, 'baixa_data_pagamento');
        return enviarComDigitacao(chatId, '📅 Qual foi a *data real do pagamento*?\n\nPode enviar como *DD/MM/AAAA*, *YYYY-MM-DD* ou *hoje*.\n\n_(Digite 0 para voltar ao menu)_', 800);
    }

    if (!baixa.forma_pagamento && !baixa.formaPerguntada) {
        setEstado(chatId, 'baixa_forma_pagamento');
        return enviarComDigitacao(chatId, '💳 Forma de pagamento?\n\nExemplos: *PIX*, *dinheiro*, *transferência*, *depósito*.\n\nSe não quiser informar, digite *pular*.', 800);
    }

    if (!baixa.recebedor && !baixa.recebedorPerguntado) {
        setEstado(chatId, 'baixa_recebedor');
        return enviarComDigitacao(chatId, `🙋 Quem recebeu o pagamento?\n\n1️⃣ ${RECEBEDOR_VIPE}\n2️⃣ ${RECEBEDOR_AUGUSTO}\n\nDigite *1*, *2* ou *pular*.`, 750);
    }

    if (!baixa.anexosPerguntado) {
        setEstado(chatId, 'baixa_anexos');
        const avisoMidia = baixa.comprovantesRecebidos
            ? '\n\n_Se o comprovante já foi enviado, vou subir para o Google Drive automaticamente._'
            : '';
        return enviarComDigitacao(chatId,
            '🧾 Envie o comprovante como *anexo* aqui no WhatsApp ou mande até *4 URLs públicas*.\n\n' +
            'Se não quiser anexar comprovante agora, digite *pular*.' +
            avisoMidia, 900
        );
    }

    if (origemAutomatica) {
        await enviarComDigitacao(chatId, '🔎 Vou validar o proprietário e salvar um rascunho da baixa...', 700);
    }
    return registrarRascunhoEConfirmar(chatId);
}

async function prepararBaixaLote(chatId) {
    const baixa = baixaAtual(chatId);
    await enviarComDigitacao(chatId, '🔐 Autenticando e buscando abastecimentos pendentes... ⏳', 1000);
    try {
        const token = baixa.token || await autenticarBaixas();
        baixa.token = token;

        if (!baixa.id_proprietario) {
            resetar(chatId);
            return enviarComDigitacao(chatId, '⚠️ Não encontrei o ID do proprietário confirmado. Abra o rascunho novamente e confirme o proprietário antes de enviar.', 900);
        }

        const proprietarioConfirmado = await confirmarProprietarioParaLote(baixa, token);
        if (!proprietarioConfirmado) {
            resetar(chatId);
            return enviarComDigitacao(chatId,
                '⚠️ Não consegui confirmar esse proprietário na base usando *search* e *local=Viana*.\n\n' +
                `Proprietário no rascunho: *${proprietarioBaixa(baixa) || '-'}*\n` +
                `ID no rascunho: *${baixa.id_proprietario || '-'}*\n\n` +
                'Nenhuma baixa foi registrada. Abra o rascunho novamente e confirme o proprietário pela lista.',
                1000
            );
        }
        baixa.id_proprietario = String(proprietarioConfirmado.id_proprietario);
        baixa.nome_proprietario = proprietarioConfirmado.nome;

        const pendentes = await buscarAbastecimentosPendentes({
            token,
            id_proprietario: baixa.id_proprietario,
            local: BAIXA_LOCAL_PADRAO,
            limit: 120
        });

        if (!pendentes.length) {
            db.registrar(chatId, true, db.TIPOS.BAIXA_AUTOMATICA, 'Nenhum abastecimento pendente encontrado para lote', baixa.id_proprietario);
            resetar(chatId);
            return enviarComDigitacao(chatId,
                '⚠️ A API não retornou abastecimentos pendentes para esse proprietário em *Viana*.\n\n' +
                `Proprietário: *${proprietarioBaixa(baixa) || baixa.id_proprietario}*\n` +
                `ID: *${baixa.id_proprietario}*\n\n` +
                'Nenhuma baixa foi registrada.',
                1000
            );
        }

        let lote = selecionarAbastecimentosPorValor(pendentes, baixa.valor_pago, baixa.data_pagamento);
        if (Math.abs(lote.diferenca) > 0.01) {
            const candidatoCorrecao = sugerirCorrecaoValorPorPendentes(pendentes, baixa.valor_pago, baixa.data_pagamento);
            if (candidatoCorrecao) {
                const valorOriginal = baixa.valor_pago;
                baixa.valor_pago = valorAbastecimento(candidatoCorrecao);
                lote = resumoLoteSelecionado([candidatoCorrecao], baixa.valor_pago, 'valor_corrigido_por_pendente');
                lote.valor_informado_original = valorOriginal;
                baixa.valor_corrigido_pela_api = true;
            }
        }
        baixa.loteBaixa = lote;
        baixa.abastecimentosPendentes = pendentes;
        baixa.payloadLote = montarPayloadBaixaLote(baixa);

        if (!lote.ids.length || Math.abs(lote.diferenca) > 0.01) {
            db.registrar(chatId, true, db.TIPOS.BAIXA_AUTOMATICA, 'Lote não fechou com valor pago', JSON.stringify({
                valor_pago: baixa.valor_pago,
                total_selecionado: lote.total,
                diferenca: lote.diferenca,
                id_proprietario: baixa.id_proprietario
            }).slice(0, 500));
            resetar(chatId);
            return enviarComDigitacao(chatId,
                '⚠️ *Não vou registrar a baixa ainda.*\n\n' +
                'A soma dos abastecimentos pendentes não fechou com o valor pago usando abastecimentos inteiros.\n\n' +
                `${formatarResumoLote(lote, baixa.valor_pago)}\n\n` +
                `${formatarListaAbastecimentos(lote.selecionados, '*Abastecimentos selecionados pela API:*')}\n\n` +
                'Confira o proprietário, o valor pago ou os abastecimentos pendentes no sistema.',
                1200
            );
        }

        setEstado(chatId, 'baixa_confirmacao');
        return enviarComDigitacao(chatId,
            '✅ *Lote pronto para registrar uma única baixa.*\n\n' +
            `${formatarResumoLote(lote, baixa.valor_pago)}\n\n` +
            `Filial: *${BAIXA_LOCAL_PADRAO}*\n` +
            `Proprietário: *${proprietarioBaixa(baixa) || 'nome não identificado'}*\n` +
            `ID proprietário: *${baixa.id_proprietario}*\n` +
            `Data do pagamento: *${baixa.data_pagamento}*\n` +
            `Comprovantes: *${baixa.anexos.length}*\n\n` +
            `${formatarListaAbastecimentos(lote.selecionados, '*Abastecimentos que serão baixados:*')}\n\n` +
            'O que deseja fazer?\n\n' +
            '1️⃣  Registrar baixa no sistema\n' +
            '2️⃣  Cancelar envio', 1200
        );
    } catch (err) {
        console.error('[BAIXA LOTE PREPARAR]', err.response?.data || err.message || err);
        resetar(chatId);
        if (err.codigo === 'BAIXAS_CREDENCIAIS') {
            return enviarComDigitacao(chatId, '🔐 Baixa em lote ainda não está configurada: faltam *BAIXAS_ADMIN_LOGIN* e/ou *BAIXAS_ADMIN_PASSWORD* no arquivo .env.\n\nNenhuma baixa foi enviada.', 1000);
        }
        return enviarComDigitacao(chatId, '😬 Erro ao preparar a baixa em lote. Nenhuma baixa foi registrada.\n\nDigite *menu* para voltar.', 900);
    }
}

function mesmaBaixaRascunho(rascunho, baixa) {
    if (rascunho.local && baixa.local && rascunho.local !== baixa.local) return false;
    if (rascunho.id_proprietario && baixa.id_proprietario) {
        return String(rascunho.id_proprietario) === String(baixa.id_proprietario);
    }
    return normalizarTextoBusca(rascunho.nome_proprietario) === normalizarTextoBusca(baixa.nome_proprietario);
}

function dataPagamentoUltimoLancamento(anterior, atual) {
    return atual || anterior || null;
}

function anexosUnicos(...listas) {
    return [...new Set(listas.flat().filter(Boolean))].slice(0, 4);
}

async function validarProprietarioAntesDoRascunho(chatId) {
    const baixa = baixaAtual(chatId);
    baixa.local = BAIXA_LOCAL_PADRAO;
    try {
        const resolucao = await resolverProprietarioCadastrado(baixa);
        if (resolucao.proprietario) {
            baixa.id_proprietario = String(resolucao.proprietario.id_proprietario);
            baixa.nome_proprietario = resolucao.proprietario.nome;
            baixa.local = BAIXA_LOCAL_PADRAO;
            baixa.proprietario_cadastrado = true;
            baixa.proprietario_status = resolucao.proprietario.status || null;
            baixa.token = resolucao.token;
            salvarAliasProprietarioSeNecessario(baixa, resolucao.proprietario);
            return true;
        }

        if (resolucao.candidatos.length > 1) {
            userState[chatId].opcoesProprietarioBaixa = resolucao.candidatos;
            setEstado(chatId, 'baixa_escolha_proprietario');
            let texto = '🔎 Encontrei mais de um proprietário parecido. Qual deles é o correto?\n\n';
            resolucao.candidatos.forEach((p, i) => {
                texto += `*${i + 1}* — ${p.nome} | ID ${p.id_proprietario} | ${p.local || '-'} | ${p.status || '-'}\n`;
            });
            texto += '\nDigite o *número* correto ou envie outro nome/ID.';
            await enviarComDigitacao(chatId, texto, 1000);
            return false;
        }

        if (resolucao.candidatos.length === 1) {
            const p = resolucao.candidatos[0];
            userState[chatId].opcoesProprietarioBaixa = [p];
            setEstado(chatId, 'baixa_escolha_proprietario');
            return enviarComDigitacao(chatId,
                `🔎 Encontrei este proprietário, mas quero confirmar:\n\n*1* — ${p.nome} | ID ${p.id_proprietario} | ${p.local || '-'} | ${p.status || '-'}\n\nDigite *1* para usar este cadastro ou envie outro nome/ID.`,
                900
            ).then(() => false);
        }

        setEstado(chatId, 'baixa_proprietario');
        const nomeLido = origemAliasProprietario(baixa);
        await enviarComDigitacao(chatId,
            `⚠️ Não encontrei proprietário cadastrado para *${nomeLido || baixa.id_proprietario || 'nome não identificado'}* em *${BAIXA_LOCAL_PADRAO}*.\n\n` +
            `${nomeLido ? `Li no comprovante: *${nomeLido}*.\n\n` : ''}` +
            'Envie o *ID* ou o *nome correto exatamente como está cadastrado*. Vou procurar na base e guardar essa equivalência para os próximos comprovantes.',
            900
        );
        return false;
    } catch (err) {
        console.error('[PROPRIETARIOS]', err.response?.data || err.message || err);
        setEstado(chatId, 'baixa_proprietario');
        if (err.codigo === 'BAIXAS_CREDENCIAIS') {
            await enviarComDigitacao(chatId, '🔐 Não consegui consultar proprietários porque faltam *BAIXAS_ADMIN_LOGIN* e/ou *BAIXAS_ADMIN_PASSWORD* no .env.\n\nNão vou salvar essa baixa como pronta até confirmar o proprietário na base.', 1000);
            return false;
        }
        await enviarComDigitacao(chatId, '⚠️ Não consegui consultar a base de proprietários agora. Tente novamente em instantes ou envie o nome/ID correto depois.\n\nNão vou salvar essa baixa como pronta até confirmar o proprietário.', 900);
        return false;
    }
}

async function completarNomeProprietarioParaFeedback(chatId) {
    const baixa = baixaAtual(chatId);
    if (!baixa.id_proprietario || baixa.nome_proprietario) return;

    try {
        const resolucao = await resolverProprietarioCadastrado(baixa);
        if (!resolucao.proprietario) return;

        baixa.nome_proprietario = resolucao.proprietario.nome;
        baixa.local = BAIXA_LOCAL_PADRAO;
        baixa.proprietario_cadastrado = true;
        baixa.proprietario_status = resolucao.proprietario.status || null;
        baixa.token = resolucao.token;
    } catch (err) {
        console.error('[PROPRIETARIO FEEDBACK]', err.response?.data || err.message || err);
    }
}

async function salvarOuAtualizarRascunhoBaixa(chatId) {
    const baixa = baixaAtual(chatId);
    const hashComprovante = baixa.arquivo_hash || (baixa.anexos?.[0] ? `url:${hashTexto(baixa.anexos[0])}` : null);
    const duplicado = db.buscarComprovanteDuplicado({
        identificador_normalizado: baixa.identificador_normalizado || normalizarIdentificadorPagamento(baixa.identificador_pagamento),
        arquivo_hash: hashComprovante
    });
    if (duplicado) {
        const rascunhoAberto = String(duplicado.rascunho_status || '').toLowerCase() === 'aberta' && duplicado.rascunho_id;

        if (rascunhoAberto) {
            const rascunho = db.obterBaixaRascunho(duplicado.rascunho_id);
            if (rascunho) {
                resetar(chatId);
                if (!userState[chatId]) userState[chatId] = {};
                userState[chatId].rascunhoDuplicadoBaixaId = rascunho.id;
                setEstado(chatId, 'baixa_duplicado_aberto');
                await enviarComDigitacao(chatId,
                    '⚠️ *Esse comprovante já está em um rascunho aberto.*\n\n' +
                    'Não somei o valor novamente.\n\n' +
                    `Proprietário: *${proprietarioRascunho(rascunho)}*\n` +
                    `Filial: *${rascunho.local || '-'}*\n` +
                    `Valor acumulado: *${formatarMoeda(rascunho.valor_total)}*\n` +
                    `Comprovantes/lançamentos: *${(rascunho.itens || []).length}*\n\n` +
                    'O que deseja fazer?\n\n' +
                    '1️⃣  Zerar esse rascunho e começar do zero\n' +
                    '2️⃣  Continuar o lançamento sem duplicar',
                    1200
                );
                return null;
            }
        }

        resetar(chatId);
        const prop = duplicado.nome_proprietario || 'nome não identificado';
        await enviarComDigitacao(chatId,
            '⚠️ *Comprovante duplicado detectado.*\n\n' +
            `Esse pagamento já está em uma baixa *${duplicado.rascunho_status || 'registrada'}*.\n` +
            `Proprietário: *${prop}*\n` +
            `Filial: *${duplicado.local || '-'}*\n` +
            `Valor já lançado: *${formatarMoeda(duplicado.valor_pago || 0)}*\n` +
            `${duplicado.identificador ? `Identificador: *${duplicado.identificador}*\n` : ''}` +
            '\nNão somei esse valor novamente.\n\n' +
            'Se quiser realmente refazer, digite *zerar base*, confirme a limpeza e envie o comprovante de novo.',
            1200
        );
        return null;
    }

    const validado = await validarProprietarioAntesDoRascunho(chatId);
    if (!validado) return null;

    const abertos = db.listarBaixasRascunhoAbertas(chatId);
    const existente = abertos.find((r) => mesmaBaixaRascunho(r, baixa));
    const item = {
        valor_pago: Number(baixa.valor_pago || 0),
        data_pagamento: baixa.data_pagamento,
        forma_pagamento: baixa.forma_pagamento || null,
        recebedor: normalizarRecebedorBaixa(baixa.recebedor) || null,
        anexos: baixa.anexos || [],
        nome_lido_comprovante: baixa.nome_lido_comprovante || null,
        campo_nome_proprietario: baixa.campo_nome_proprietario || null,
        alias_proprietario_usado: baixa.alias_proprietario_usado || null,
        alias_proprietario_salvo: baixa.alias_proprietario_salvo || null,
        identificador_pagamento: baixa.identificador_pagamento || null,
        identificador_normalizado: baixa.identificador_normalizado || normalizarIdentificadorPagamento(baixa.identificador_pagamento),
        arquivo_hash: hashComprovante,
        cloudinary_public_id: baixa.cloudinary_public_id || null,
        calculo_valor: baixa.calculo_valor || null,
        quantidade_comprovantes: baixa.comprovantesRecebidos || baixa.anexos?.length || 1,
        origem: baixa.origem_automatica ? 'ia' : 'manual',
        criado_em: new Date().toISOString()
    };

    const itens = existente ? [...(existente.itens || []), item] : [item];
    const anexos = anexosUnicos(existente?.anexos || [], baixa.anexos || []);
    const valorTotal = itens.reduce((soma, it) => soma + Number(it.valor_pago || 0), 0);

    const salvo = db.salvarBaixaRascunho({
        id: existente?.id,
        telefone: chatId,
        status: 'aberta',
        local: BAIXA_LOCAL_PADRAO,
        id_proprietario: baixa.id_proprietario || existente?.id_proprietario || null,
        nome_proprietario: baixa.nome_proprietario || existente?.nome_proprietario || null,
        valor_total: Math.round(valorTotal * 100) / 100,
        data_pagamento: dataPagamentoUltimoLancamento(existente?.data_pagamento, baixa.data_pagamento),
        data_baixa: hojeISO(),
        forma_pagamento: baixa.forma_pagamento || existente?.forma_pagamento || null,
        recebedor: normalizarRecebedorBaixa(baixa.recebedor || existente?.recebedor) || null,
        observacao: 'Baixa via agente externo',
        anexos,
        itens,
        idempotency_key: existente?.idempotency_key || baixa.idempotency_key,
        payload: null,
        resposta: null,
        enviado_em: existente?.enviado_em || null
    });

    baixa.rascunho_id = salvo.id;
    baixa.local = BAIXA_LOCAL_PADRAO;
    baixa.id_proprietario = salvo.id_proprietario;
    baixa.nome_proprietario = salvo.nome_proprietario;
    baixa.valor_pago = salvo.valor_total;
    baixa.data_pagamento = salvo.data_pagamento;
    baixa.anexos = salvo.anexos || [];
    baixa.idempotency_key = salvo.idempotency_key;

    db.registrarComprovanteBaixa({
        rascunho_id: salvo.id,
        telefone: chatId,
        identificador: item.identificador_pagamento,
        identificador_normalizado: item.identificador_normalizado,
        arquivo_hash: item.arquivo_hash,
        anexo_url: (item.anexos || [])[0] || null,
        valor_pago: item.valor_pago,
    });

    return salvo;
}

async function registrarRascunhoEConfirmar(chatId) {
    const rascunho = await salvarOuAtualizarRascunhoBaixa(chatId);
    if (!rascunho) return;

    if (rascunho.reaproveitado_por_duplicidade) {
        carregarRascunhoNoEstado(chatId, rascunho);
    }

    setEstado(chatId, 'baixa_rascunho_decisao');
    return enviarComDigitacao(chatId,
        `${rascunho.reaproveitado_por_duplicidade ? '🧾 *Esse comprovante já está neste rascunho.*\n\nNão somei o valor novamente. Você pode enviar a baixa a partir daqui.\n\n' : '🧾 *Rascunho de baixa atualizado.*\n\n'}` +
        `Proprietário: *${proprietarioRascunho(rascunho)}*\n` +
        `Filial: *${rascunho.local || '-'}*\n` +
        `Valor acumulado: *${formatarMoeda(rascunho.valor_total)}*\n` +
        `Comprovantes/lançamentos: *${(rascunho.itens || []).length}*\n` +
        `Data de pagamento usada: *${rascunho.data_pagamento || '-'}*\n\n` +
        'O que deseja fazer?\n\n' +
        '1️⃣  Enviar baixa agora\n' +
        '2️⃣  Aguardar mais comprovantes\n' +
        '3️⃣  Zerar e começar do zero', 1200
    );
}

function carregarRascunhoNoEstado(chatId, rascunho) {
    iniciarBaixa(chatId);
    const baixa = baixaAtual(chatId);
    baixa.rascunho_id = rascunho.id;
    baixa.local = BAIXA_LOCAL_PADRAO;
    baixa.id_proprietario = rascunho.id_proprietario;
    baixa.nome_proprietario = rascunho.nome_proprietario;
    baixa.valor_pago = rascunho.valor_total;
    baixa.data_pagamento = rascunho.data_pagamento;
    baixa.data_baixa = hojeISO();
    baixa.forma_pagamento = rascunho.forma_pagamento;
    baixa.recebedor = normalizarRecebedorBaixa(rascunho.recebedor);
    baixa.anexos = rascunho.anexos || [];
    baixa.idempotency_key = rascunho.idempotency_key;
    baixa.observacao = `Baixa via agente externo - ${rascunho.itens?.length || 1} lançamento(s) acumulado(s) no bot`;
}

async function iniciarBaixaPorMensagem(chatId, textoOriginal, msg) {
    iniciarBaixa(chatId);
    const baixa = baixaAtual(chatId);
    baixa.origem_automatica = true;
    baixa.local = BAIXA_LOCAL_PADRAO;
    baixa.data_baixa = hojeISO();
    const identificadorTexto = extrairIdentificadorPagamentoTexto(textoOriginal);
    if (identificadorTexto) {
        baixa.identificador_pagamento = identificadorTexto;
        baixa.identificador_normalizado = normalizarIdentificadorPagamento(identificadorTexto);
    }
    setEstado(chatId, 'baixa_analisando');

    if (!msg?.isGrupoBaixa) {
        await enviarComDigitacao(chatId,
            `${saudacaoCurtaPorHorario()}! Identifiquei que você está enviando um *comprovante de pagamento*.\n\n` +
            'Vou interpretar como uma possível *baixa de pendência de abastecimento* e analisar os dados com IA. ⏳',
            900
        );
    } else {
        await enviarComDigitacao(chatId, `📎 Recebi *${msg.anexosBaixa?.length || 1}* comprovante(s). Vou analisar tudo junto agora. ⏳`, 700);
    }

    let midias = [];
    try {
        midias = await baixarMidiasParaAnalise(msg);
        baixa.comprovantesRecebidos = midias.length;
        const arquivosLocais = midias.map((m) => m.arquivo_local).filter(Boolean);
        if (arquivosLocais.length > 0) {
            baixa.arquivos_locais = Array.from(new Set([...(baixa.arquivos_locais || []), ...arquivosLocais]));
        }
        const urlsDrive = midias.map((m) => m.url).filter(Boolean);
        if (urlsDrive.length > 0) {
            baixa.anexos = anexosUnicos(baixa.anexos || [], urlsDrive);
            baixa.anexosPerguntado = true;
        }
        const hashesMidia = midias.map((m) => m.arquivo_hash).filter(Boolean);
        if (hashesMidia.length > 0) baixa.arquivo_hash = hashesMidia[0];
        const publicIdsMidia = midias.map((m) => m.public_id).filter(Boolean);
        if (publicIdsMidia.length > 0) baixa.cloudinary_public_id = publicIdsMidia[0];
        const textoExtraidoMidias = midias.map((m) => m.texto_extraido).filter(Boolean).join('\n\n');
        const textoParaAnalise = [textoOriginal, textoExtraidoMidias].filter(Boolean).join('\n\n');
        const identificadorTextoMidia = extrairIdentificadorPagamentoTexto(textoParaAnalise);
        if (identificadorTextoMidia) {
            baixa.identificador_pagamento = identificadorTextoMidia;
            baixa.identificador_normalizado = normalizarIdentificadorPagamento(identificadorTextoMidia);
        }
        const midiasAnalisaveis = midias.filter((m) => m.analisavel && (m.data || m.previewUrl));

        // ── FLUXO OCR-FIRST ──────────────────────────────────────────
        // 1) O OCR local já rodou nas mídias (texto_extraido). Se TODAS as
        //    mídias analisáveis tiverem texto local bom, organizamos apenas o
        //    TEXTO pela IA — a imagem NÃO é enviada para a IA (só vai p/ a API
        //    depois, no envio em lote).
        // 2) Caímos para a IA de visão somente quando o OCR vier fraco/ausente
        //    (típico de cheque manuscrito ou PDF escaneado).
        const midiaFracaParaTexto = midiasAnalisaveis.some(
            (m) => !m.texto_extraido || ocr.ocrFraco(m.texto_extraido)
        );
        const usarVisao = midiasAnalisaveis.length > 0 && midiaFracaParaTexto;

        let analise;
        if (usarVisao) {
            console.log('[BAIXA IA] OCR fraco/ausente -> fallback para IA de visão.');
            analise = await ai.analisarBaixaAutomatica({
                texto: textoParaAnalise,
                midias: midiasAnalisaveis
            });
        } else {
            console.log('[BAIXA IA] OCR local suficiente -> organizando apenas o texto (imagem não enviada à IA).');
            const preExtraido = extrator.analisarTexto(textoParaAnalise);
            analise = await ai.organizarTextoComprovante({
                texto: textoParaAnalise,
                preExtraido,
                qtdComprovantes: midias.length || 1
            });
        }
        analise = ajustarValorPorComprovantesAgrupados(analise, midias.length);
        preencherBaixaComAnalise(chatId, analise, textoParaAnalise);

        if (midias.length > 0 && midiasAnalisaveis.length === 0) {
            await enviarComDigitacao(chatId, '📎 Recebi o anexo, mas só consigo ler automaticamente imagens leves. Vou seguir com o texto e pedir o que faltar.', 700);
        }
        const falhasUpload = midias.filter((m) => m.uploadError);
        if (falhasUpload.length > 0 && urlsDrive.length === 0) {
            const guardado = (baixa.arquivos_locais || []).length > 0;
            const motivo = falhasUpload.find((m) => m.uploadError)?.uploadError || 'falha no upload';
            await enviarComDigitacao(chatId,
                `⚠️ Recebi o comprovante, mas não consegui subir no Google Drive (${motivo}).` +
                (guardado ? '\n\n💾 Não se preocupe: guardei o arquivo na pasta local de comprovantes pendentes.' : '') +
                '\n\nVou pedir para reenviar o anexo quando chegar na etapa dos comprovantes.', 800);
        }

        await completarNomeProprietarioParaFeedback(chatId);
        await enviarComDigitacao(chatId, `🧠 *Dados identificados pela IA:*\n\n${resumoBaixaExtraida(baixa)}`, 900);
    } catch (err) {
        console.error('[ANALISE BAIXA IA]', err.message || err);
        await enviarComDigitacao(chatId, '😬 Não consegui analisar automaticamente. Sem problema, vou coletar os dados da baixa agora.', 800);
    }

    return proximaEtapaBaixa(chatId, true);
}

// ==============================================
// ENVIO DE COMPROVANTES EM LOTE PARA A PLATAFORMA
// ==============================================

// Extrai as mensagens de mídia de uma msg (simples ou agrupada).
function coletarMensagensMidia(msg) {
    if (!msg) return [];
    if (msg.isGrupoBaixa) return (msg.anexosBaixa || []).filter(Boolean);
    if (msg.hasMedia) return [msg];
    return [];
}

// Ao receber comprovante(s), pergunta se é baixa única ou envio para a plataforma.
async function iniciarEscolhaComprovante(chatId, textoOriginal, msg) {
    if (!userState[chatId]) userState[chatId] = {};
    const mensagens = coletarMensagensMidia(msg);
    userState[chatId].comprovantePendente = { textoOriginal: textoOriginal || '', mensagens };
    const qtd = mensagens.length || 1;
    setEstado(chatId, 'comprovantes_escolha');
    db.registrar(chatId, true, db.TIPOS.BAIXA_AUTOMATICA, 'Comprovante recebido - aguardando escolha do tipo', `qtd=${qtd}`);
    return enviarComDigitacao(chatId,
        `📎 Recebi *${qtd}* comprovante(s) de pagamento!\n\n` +
        'O que você quer fazer?\n\n' +
        '1️⃣  *Baixa única* — eu leio o comprovante e lanço a baixa da pendência aqui mesmo\n' +
        '2️⃣  *Enviar para a plataforma* — você manda quantos comprovantes quiser e eu envio todos para a tela *Baixa por Comprovante*\n\n' +
        '_(Digite 0 para cancelar)_',
        1000
    );
}

// Extrai o ID de controle / ID da transação de um comprovante do lote.
// PDFs: usa o texto já extraído. Imagens: leitura rápida por IA.
async function identificarComprovanteParaDedupe(m) {
    const candidatos = [];

    if (m.texto_extraido) {
        candidatos.push(...coletarIdentificadoresPagamentoTexto(m.texto_extraido));
    }

    // Imagem (ou PDF sem texto legível com preview): pede só o identificador à IA.
    const precisaIA = candidatos.length === 0 && (m.analisavel || m.previewUrl);
    if (precisaIA) {
        try {
            const resultado = await ai.extrairIdentificadorComprovante({ midia: m });
            if (resultado?.identificador_pagamento) candidatos.push(resultado.identificador_pagamento);
            if (Array.isArray(resultado?.identificadores_encontrados)) {
                candidatos.push(...resultado.identificadores_encontrados);
            }
        } catch (err) {
            console.error('[LOTE IDENTIFICADOR IA]', err.message || err);
        }
    }

    const identificador = escolherMelhorIdentificadorPagamento(candidatos);
    return {
        identificador,
        identificador_normalizado: normalizarIdentificadorPagamento(identificador),
    };
}

function formatarDataDuplicado(criado_em) {
    const texto = String(criado_em || '').trim();
    if (!texto) return null;
    const m = texto.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/);
    if (!m) return texto;
    return m[4] ? `${m[3]}/${m[2]}/${m[1]} às ${m[4]}:${m[5]}` : `${m[3]}/${m[2]}/${m[1]}`;
}

// Baixa do WhatsApp + upload para o Google Drive dos comprovantes recebidos,
// acumulando as URLs no estado do usuário até o "Finalizado".
// Antes de aceitar cada comprovante, verifica duplicidade pelo ID de
// controle/transação (e pelo hash do arquivo) — duplicados não entram no lote.
async function processarComprovantesLoteRecebidos(chatId, msg) {
    if (!userState[chatId]) userState[chatId] = {};
    const lote = userState[chatId].loteComprovantes
        || (userState[chatId].loteComprovantes = { urls: [], pendentesLocais: [], itens: [], falhas: 0 });
    if (!Array.isArray(lote.itens)) lote.itens = [];

    const totalAntes = lote.urls.length + lote.pendentesLocais.length;
    if (totalAntes >= COMPROVANTES_LOTE_MAX) {
        return enviarComDigitacao(chatId,
            `⚠️ Você já atingiu o limite de *${COMPROVANTES_LOTE_MAX}* comprovantes nesta remessa. Digite *Finalizado* para enviar.`, 700);
    }

    await enviarComDigitacao(chatId, '☁️ Recebendo e conferindo o(s) comprovante(s)... ⏳', 500);

    let midias = [];
    try {
        midias = await baixarMidiasParaAnalise(msg, COMPROVANTES_LOTE_MAX);
    } catch (err) {
        console.error('[LOTE COMPROVANTE DOWNLOAD]', err.message || err);
        return enviarComDigitacao(chatId, '😬 Não consegui baixar esse(s) comprovante(s). Tente reenviar.', 700);
    }

    let novos = 0;
    let falhasUpload = 0;
    const duplicados = [];
    let indice = 0;

    for (const m of midias) {
        indice += 1;
        if (!m.url && !m.arquivo_local) {
            lote.falhas += 1;
            continue;
        }

        // ── Verificação de duplicidade ──────────────────────────
        const { identificador, identificador_normalizado } = await identificarComprovanteParaDedupe(m);
        const arquivo_hash = m.arquivo_hash || null;
        const rotulo = m.filename && m.filename !== 'comprovante'
            ? m.filename
            : `comprovante ${indice}`;

        // 1) Duplicado dentro da própria remessa atual.
        const dupNaRemessa = lote.itens.find((item) =>
            (identificador_normalizado && item.identificador_normalizado === identificador_normalizado) ||
            (arquivo_hash && item.arquivo_hash === arquivo_hash)
        );
        if (dupNaRemessa) {
            duplicados.push({ rotulo, identificador: identificador || dupNaRemessa.identificador, motivo: 'já está nesta remessa' });
            continue;
        }

        // 2) Duplicado em envio anterior (plataforma) ou em baixa única.
        let dupAnterior = null;
        try {
            dupAnterior = db.buscarComprovanteLoteDuplicado({ identificador_normalizado, arquivo_hash });
        } catch (err) {
            console.error('[LOTE DEDUPE DB]', err.message || err);
        }
        if (dupAnterior) {
            const quando = formatarDataDuplicado(dupAnterior.criado_em);
            const motivo = dupAnterior.origem === 'baixa_unica'
                ? `já foi usado em uma baixa única${quando ? ` em ${quando}` : ''}`
                : `já foi enviado para a plataforma${quando ? ` em ${quando}` : ''}`;
            duplicados.push({ rotulo, identificador: identificador || dupAnterior.identificador, motivo });
            continue;
        }

        // ── Comprovante novo: entra no lote ─────────────────────
        if (m.url) {
            lote.urls.push(m.url);
            novos += 1;
        } else {
            lote.pendentesLocais.push(m.arquivo_local);
            novos += 1;
            falhasUpload += 1;
        }
        const itemLote = {
            url: m.url || null,
            arquivo_local: m.arquivo_local || null,
            filename: m.filename || null,
            identificador: identificador || null,
            identificador_normalizado: identificador_normalizado || null,
            arquivo_hash,
        };
        lote.itens.push(itemLote);
        try {
            db.registrarComprovanteLotePendente({
                telefone: chatId,
                identificador: itemLote.identificador,
                identificador_normalizado: itemLote.identificador_normalizado,
                arquivo_hash: itemLote.arquivo_hash,
                anexo_url: itemLote.url,
                filename: itemLote.filename,
            });
        } catch (err) {
            console.error('[REGISTRAR COMPROVANTE LOTE PENDENTE]', err.message || err);
        }
    }

    const total = lote.urls.length + lote.pendentesLocais.length;
    let texto = '';

    if (duplicados.length > 0) {
        texto += `🚫 *${duplicados.length} comprovante(s) duplicado(s) — NÃO serão enviados:*\n`;
        for (const d of duplicados) {
            texto += `\n• *${d.rotulo}*${d.identificador ? `\n  🆔 ${d.identificador}` : ''}\n  ↳ ${d.motivo}`;
        }
        texto += '\n\n';
        db.registrar(chatId, true, db.TIPOS.BAIXA_AUTOMATICA, 'Comprovantes duplicados bloqueados (lote)',
            duplicados.map((d) => d.identificador || d.rotulo).join(', ').slice(0, 200));
    }

    texto += novos > 0
        ? `📥 Recebi *${novos}* comprovante(s) novo(s). Total acumulado: *${total}*.`
        : `📥 Nenhum comprovante novo aceito. Total acumulado: *${total}*.`;
    if (falhasUpload > 0) {
        texto += `\n⚠️ ${falhasUpload} não subiu(ram) para a nuvem, mas guardei localmente e tento enviar mesmo assim.`;
    }
    texto += '\n\nContinue enviando ou digite *Finalizado* para concluir. 📤';
    return enviarComDigitacao(chatId, texto, 700);
}

// Divide um array em lotes de tamanho fixo.
function emLotes(arr, tamanho) {
    const out = [];
    for (let i = 0; i < arr.length; i += tamanho) out.push(arr.slice(i, i + tamanho));
    return out;
}

// Envia os comprovantes acumulados para a API da plataforma, em pequenos lotes.
// URLs públicas → JSON com arquivo_urls. Arquivos locais → multipart arquivos[].
// Continua mesmo se um lote falhar e retorna o que foi enviado e o que faltou,
// para que o usuário possa tentar reenviar apenas os que não passaram.
async function enviarComprovantesLoteApi(lote) {
    const urls = [...new Set((lote.urls || []).filter(Boolean))];
    const locais = [...new Set((lote.pendentesLocais || []).filter(Boolean))].filter((arq) => {
        try { return fs.existsSync(arq); } catch (_) { return false; }
    });
    const headersBase = { 'X-Api-Key': COMPROVANTES_API_KEY };

    const urlsFalharam = [];
    const locaisFalharam = [];
    let enviados = 0;
    // Detalhes reportados pela plataforma (novos de fato, duplicados ignorados, erros).
    const plataforma = { novos: 0, duplicados: [], erros: [], temDetalhes: false };

    const coletarDetalhes = (data, qtdGrupo) => {
        if (!data || typeof data !== 'object') return;
        if (data.total_recebido !== undefined || Array.isArray(data.comprovantes)) {
            plataforma.temDetalhes = true;
            plataforma.novos += Number(data.total_recebido ?? (data.comprovantes?.length || 0));
            for (const d of (data.duplicados || [])) plataforma.duplicados.push(d);
            for (const e of (data.erros || [])) plataforma.erros.push(e);
        } else {
            plataforma.novos += qtdGrupo;
        }
    };

    // Mapa url → hash SHA-256 do arquivo (para a API deduplicar pelo hash).
    const hashPorUrl = new Map();
    for (const item of (lote.itens || [])) {
        if (item?.url && item?.arquivo_hash) hashPorUrl.set(item.url, item.arquivo_hash);
    }

    // 1) URLs públicas → JSON, em lotes pequenos (com os hashes alinhados).
    for (const grupo of emLotes(urls, COMPROVANTES_LOTE_CHUNK)) {
        try {
            const resp = await axios.post(COMPROVANTES_LOTE_URL, {
                arquivo_urls: grupo,
                arquivo_hashes: grupo.map((u) => hashPorUrl.get(u) || null),
            }, {
                timeout: COMPROVANTES_LOTE_TIMEOUT_MS,
                headers: { ...headersBase, 'Content-Type': 'application/json' }
            });
            enviados += grupo.length;
            coletarDetalhes(resp?.data, grupo.length);
        } catch (err) {
            console.error('[LOTE COMPROVANTE ENVIO URLS]', err.response?.status, JSON.stringify(err.response?.data || err.message || err).slice(0, 300));
            urlsFalharam.push(...grupo);
        }
    }

    // 2) Arquivos locais (uploads que falharam) → multipart, em lotes.
    if (locais.length > 0) {
        let FormData = null;
        try { FormData = require('form-data'); }
        catch (_) { FormData = null; }

        if (FormData) {
            for (const grupo of emLotes(locais, COMPROVANTES_LOTE_CHUNK)) {
                try {
                    const form = new FormData();
                    for (const arquivo of grupo) {
                        form.append('arquivos[]', fs.createReadStream(arquivo), path.basename(arquivo));
                    }
                    const respForm = await axios.post(COMPROVANTES_LOTE_URL, form, {
                        timeout: COMPROVANTES_LOTE_TIMEOUT_MS,
                        maxBodyLength: Infinity,
                        maxContentLength: Infinity,
                        headers: { ...headersBase, ...form.getHeaders() }
                    });
                    enviados += grupo.length;
                    coletarDetalhes(respForm?.data, grupo.length);
                } catch (err) {
                    console.error('[LOTE COMPROVANTE ENVIO ARQUIVOS]', err.response?.status, JSON.stringify(err.response?.data || err.message || err).slice(0, 300));
                    locaisFalharam.push(...grupo);
                }
            }
        } else {
            console.warn('[LOTE COMPROVANTE] form-data indisponível; arquivos locais não enviados.');
            locaisFalharam.push(...locais);
        }
    }

    return { enviados, urlsFalharam, locaisFalharam, plataforma };
}

// Monta o resumo do que a PLATAFORMA reportou (novos x duplicados x erros),
// para o usuário saber exatamente o que vai aparecer na tela.
function resumoPlataformaLote(plataforma) {
    if (!plataforma?.temDetalhes) return '';
    let texto = `\n\n📋 *Plataforma confirmou:* ${plataforma.novos} novo(s) na tela.`;
    if (plataforma.duplicados.length > 0) {
        texto += `\n🚫 *${plataforma.duplicados.length} duplicado(s) ignorado(s)* (já existiam na plataforma):`;
        for (const d of plataforma.duplicados.slice(0, 6)) {
            const nome = d.remetente_extraido || d.proprietario_nome || 'remetente não lido';
            const valor = d.valor_extraido ? ` — R$ ${d.valor_extraido}` : '';
            const status = d.status ? ` (status: ${d.status})` : '';
            texto += `\n• ${nome}${valor}${status}`;
        }
        texto += '\n_Se algum desses não aparece na tela, é porque o registro original já foi baixado (aplicado). Exclua o antigo na plataforma antes de reenviar._';
    }
    if (plataforma.erros.length > 0) {
        texto += `\n❌ *${plataforma.erros.length} erro(s):*`;
        for (const e of plataforma.erros.slice(0, 4)) {
            texto += `\n• ${String(e.message || 'erro').slice(0, 120)}`;
        }
    }
    return texto;
}

// Conclui a remessa: dispara o envio para a plataforma e dá o feedback final.
async function finalizarEnvioComprovantesLote(chatId) {
    // Se ainda há um grupo de anexos sendo agregado, pede para aguardar.
    if (gruposAnexosBaixa[chatId]) {
        return enviarComDigitacao(chatId,
            '⏳ Ainda estou recebendo seus últimos comprovantes. Aguarde a confirmação e digite *Finalizado* novamente.', 700);
    }

    const lote = (userState[chatId] || {}).loteComprovantes || { urls: [], pendentesLocais: [] };
    const total = (lote.urls?.length || 0) + (lote.pendentesLocais?.length || 0);
    if (total === 0) {
        return enviarComDigitacao(chatId,
            '🤔 Ainda não recebi nenhum comprovante. Envie pelo menos um antes de finalizar, ou digite *menu* para sair.', 700);
    }

    await enviarComDigitacao(chatId,
        `📤 Enviando *${total}* comprovante(s) para a plataforma, em pequenos lotes... isso pode levar um tempinho. ⏳`, 800);
    let resultado;
    try {
        resultado = await enviarComprovantesLoteApi(lote);
    } catch (err) {
        console.error('[LOTE COMPROVANTE ENVIO]', err.response?.data || err.message || err);
        const detalhe = err.response?.data ? mensagemApi(err.response.data) : (err.message || 'erro desconhecido');
        return enviarComDigitacao(chatId,
            `😬 Não consegui enviar os comprovantes para a plataforma.\n\n*Motivo:* ${String(detalhe).slice(0, 300)}\n\n` +
            'Seus comprovantes continuam guardados aqui. Digite *Finalizado* para tentar novamente ou *cancelar* para sair.', 1000);
    }

    const falharam = resultado.urlsFalharam.length + resultado.locaisFalharam.length;

    // Registra os identificadores/hashes dos comprovantes que FORAM enviados,
    // para bloquear duplicidades em remessas futuras.
    const urlsFalhaSet = new Set(resultado.urlsFalharam);
    const locaisFalhaSet = new Set(resultado.locaisFalharam);
    const itens = Array.isArray(lote.itens) ? lote.itens : [];
    const itensRestantes = [];
    for (const item of itens) {
        const enviado = item.url
            ? !urlsFalhaSet.has(item.url)
            : (item.arquivo_local ? !locaisFalhaSet.has(item.arquivo_local) : false);
        if (!enviado) { itensRestantes.push(item); continue; }
        try {
            db.confirmarComprovanteLoteEnviado({
                telefone: chatId,
                identificador: item.identificador,
                identificador_normalizado: item.identificador_normalizado,
                arquivo_hash: item.arquivo_hash,
                anexo_url: item.url
            });
        } catch (err) {
            console.error('[LOTE DEDUPE REGISTRO]', err.message || err);
        }
    }

    // Mantém só os que faltaram, para um eventual reenvio com "Finalizado".
    lote.urls = resultado.urlsFalharam;
    lote.pendentesLocais = resultado.locaisFalharam;
    lote.itens = itensRestantes;

    if (resultado.enviados > 0 && falharam === 0) {
        db.registrar(chatId, true, db.TIPOS.BAIXA_AUTOMATICA, 'Comprovantes enviados para a plataforma (lote)', `qtd=${resultado.enviados}`);
        resetar(chatId);
        return enviarComDigitacao(chatId,
            '🎉 *Comprovantes enviados com sucesso!*\n\n' +
            `Foram enviados *${resultado.enviados}* comprovante(s) para a tela *Baixa por Comprovante*.` +
            resumoPlataformaLote(resultado.plataforma) +
            '\n\nA leitura por IA vai agrupar por proprietário. Os que não forem reconhecidos podem ser vinculados manualmente na tela — e o sistema lembra esse nome nas próximas vezes. 😉\n\n' +
            'Digite *menu* para voltar.', 1200);
    }

    if (resultado.enviados > 0 && falharam > 0) {
        db.registrar(chatId, true, db.TIPOS.BAIXA_AUTOMATICA, 'Comprovantes enviados parcialmente (lote)', `ok=${resultado.enviados} falhou=${falharam}`);
        return enviarComDigitacao(chatId,
            `⚠️ *Envio parcial.*\n\n` +
            `✅ Enviados: *${resultado.enviados}*\n` +
            `❌ Não enviados: *${falharam}*` +
            resumoPlataformaLote(resultado.plataforma) +
            '\n\nGuardei os que faltaram. Digite *Finalizado* para tentar reenviar só esses, ou *cancelar* para sair.', 1100);
    }

    // Nada foi enviado.
    db.registrar(chatId, true, db.TIPOS.BAIXA_AUTOMATICA, 'Falha total no envio de comprovantes (lote)', `qtd=${falharam}`);
    return enviarComDigitacao(chatId,
        `😬 Não consegui enviar os comprovantes para a plataforma (a API demorou demais ou recusou).\n\n` +
        'Seus comprovantes continuam guardados aqui. Digite *Finalizado* para tentar novamente ou *cancelar* para sair.', 1000);
}

// ==============================
// CHAMADAS PYTHON
// ==============================
function chamarPython(script, arg) {
    return new Promise((resolve, reject) => {
        execFile(PYTHON, [script, arg],
            { timeout: 30000, env: { ...process.env, PYTHONIOENCODING: 'utf-8' } },
            (err, stdout, stderr) => {
                if (err) { reject(stderr || err.message); return; }
                try { resolve(JSON.parse(stdout.trim())); }
                catch (e) { reject(`Erro ao interpretar: ${stdout.slice(0, 200)}`); }
            }
        );
    });
}

function chamarChatbot(pergunta) {
    return new Promise((resolve, reject) => {
        const proc = execFile(
            PYTHON, [SCRIPT_CHAT],
            { timeout: 60000, env: { ...process.env, PYTHONIOENCODING: 'utf-8' } },
            (err, stdout, stderr) => {
                if (err) reject(stderr || err.message);
                else resolve(stdout.trim());
            }
        );
        proc.stdin.write(pergunta);
        proc.stdin.end();
    });
}

function chamarPythonRaw(script, arg) {
    return new Promise((resolve, reject) => {
        execFile(PYTHON, [script, arg],
            { timeout: 60000, env: { ...process.env, PYTHONIOENCODING: 'utf-8' } },
            (err, stdout, stderr) => { if (err) reject(stderr || err.message); else resolve(stdout.trim()); }
        );
    });
}

// ==============================
// PROCESSAMENTO
// ==============================
async function processar(chatId, body, bodyOriginal = body, msg = null) {
    const estado = getEstado(chatId);
    const textoOriginal = String(bodyOriginal || '').trim();
    renovarTimer(chatId);

    if (body === 'menu' || body === '0') { resetar(chatId); db.registrar(chatId, isVip(chatId), db.TIPOS.MENU_ABERTO, 'Usuário solicitou menu principal'); return enviarMenu(chatId); }

    if (isVip(chatId) && !['baixa_confirmar_zerar_base', 'baixa_duplicado_aberto'].includes(estado) && comandoZerarBaseBaixa(body)) {
        setEstado(chatId, 'baixa_confirmar_zerar_base');
        return enviarComDigitacao(chatId,
            '⚠️ Você quer zerar a base local de baixas e começar do zero?\n\n' +
            '1️⃣  Sim, zerar tudo\n' +
            '2️⃣  Cancelar',
            900
        );
    }

    // ---- CHATBOT VIP — estado livre ----
    if (estado === 'chatbot_vip') {
        if (body === 'sair' || body === 'voltar') { resetar(chatId); return enviarMenu(chatId); }

        const pedePDF = /pdf|relat[oó]rio|exportar|gerar.*relat|relat.*gerar/i.test(body);
        if (pedePDF) {
            await enviarComDigitacao(chatId, '📄 Gerando relatório de pendências... aguarda um momento! ⏳', 1000);
            try {
                await chamarPythonRaw(SCRIPT_PDF, CAMINHO_PDF);
                const media = MessageMedia.fromFilePath(CAMINHO_PDF);
                await client.sendMessage(chatId, media, {
                    caption: `📊 *Relatório de Pendências — Vipe Transportes*\n🗓️ Gerado em ${new Date().toLocaleString('pt-BR')}`
                });
                await sleep(500);
                await enviarComDigitacao(chatId, '_Pode fazer outra pergunta ou digitar *sair* para voltar ao menu._', 600);
            } catch (err) {
                console.error('[PDF no CHAT]', err);
                await enviarComDigitacao(chatId, '😬 Erro ao gerar o PDF. Tenta novamente ou digita *sair*.', 800);
            }
            return;
        }

        await enviarComDigitacao(chatId, '🤖 Deixa eu pensar... ⏳', 1500);
        try {
            const resultado = await chamarChatbot(body);
            const dados = JSON.parse(resultado);
            if (dados.erro) {
                await enviarComDigitacao(chatId, `😬 ${dados.erro}`, 800);
            } else {
                await enviarComDigitacao(chatId, dados.resposta, 1000);
                await sleep(500);
                await enviarComDigitacao(chatId, '_Pode fazer outra pergunta ou digitar *sair* para voltar ao menu._', 600);
            }
        } catch (err) {
            console.error('[CHATBOT]', err);
            await enviarComDigitacao(chatId, '😬 Erro ao consultar a IA. Tenta novamente ou digita *sair*.', 800);
        }
        return;
    }

    // ---- CADASTRO DO NOME DO USUÁRIO ----
    if (estado === 'aguardando_nome_usuario') {
        const nome = limparNomeInformado(textoOriginal);
        if (!nome || nome.length < 2) {
            return enviarComDigitacao(chatId, '😅 Não consegui entender. Pode me dizer só o seu *primeiro nome*?', 800);
        }
        db.salvarNomeUsuario(chatId, nome);
        if (!userState[chatId]) userState[chatId] = {};
        userState[chatId].nome = nome;
        db.registrar(chatId, isVip(chatId), db.TIPOS.PRIMEIRO_ACESSO, 'Usuário informou o nome', nome);
        resetar(chatId);
        await enviarComDigitacao(chatId, `Prazer, *${primeiroNome(nome)}*! 🙌 Vou te chamar assim a partir de agora.`, 900);
        await sleep(500);
        return enviarMenu(chatId);
    }

    // ---- MENU PRINCIPAL ----
    if (!estado || estado === 'menu') {
        if (isVip(chatId) && gatilhoBaixaAutomatica(textoOriginal, msg)) {
            // Se veio anexo (comprovante), perguntamos antes o que fazer:
            // baixa única OU apenas enviar para a plataforma.
            if (msg?.hasMedia) {
                return iniciarEscolhaComprovante(chatId, textoOriginal, msg);
            }
            db.registrar(chatId, true, db.TIPOS.BAIXA_AUTOMATICA, 'Mensagem inicial interpretada como baixa automática', textoOriginal.slice(0, 250));
            return iniciarBaixaPorMensagem(chatId, textoOriginal, msg);
        }

        if (body === '1') {
            db.registrar(chatId, isVip(chatId), db.TIPOS.CONSULTA_CIOT, 'Usuário selecionou consulta de CIOT');
            if (isVip(chatId)) {
                setEstado(chatId, 'aguardando_ciot_tipo');
                return enviarComDigitacao(chatId, '💰 *Consulta Saldo CIOT*\n\nComo prefere buscar?\n\n1️⃣  Por CPF\n2️⃣  Por nome do motorista\n\n_(Digite 0 para voltar ao menu)_', 1000);
            }
            setEstado(chatId, 'aguardando_cpf_ciot');
            return enviarComDigitacao(chatId, '💰 *Consulta Saldo CIOT*\n\nMe passa o *CPF* do motorista ou proprietário! 😊\n\n_(Digite 0 para voltar ao menu)_', 1000);
        }

        if (body === '2') {
            db.registrar(chatId, isVip(chatId), db.TIPOS.CONSULTA_MULTA, 'Usuário selecionou consulta de multas');
            if (isVip(chatId)) {
                setEstado(chatId, 'aguardando_multa_tipo');
                return enviarComDigitacao(chatId, '🚨 *Consulta de Multas*\n\nComo prefere buscar?\n\n1️⃣  Por CPF\n2️⃣  Por nome do motorista\n\n_(Digite 0 para voltar ao menu)_', 1000);
            }
            setEstado(chatId, 'aguardando_cpf_multa');
            return enviarComDigitacao(chatId, '🚨 *Consulta de Multas*\n\nMe passa o *CPF* do motorista! 😊\n\n_(Digite 0 para voltar ao menu)_', 1000);
        }

        if (body === '3') {
            db.registrar(chatId, isVip(chatId), db.TIPOS.BAIXA_MANIFESTO, 'Usuário selecionou baixa de manifesto');
            setEstado(chatId, 'aguardando_manifesto');
            return enviarComDigitacao(chatId, '📦 *Baixa de Manifesto*\n\nQual o *número do manifesto* a ser baixado?\n\n_(Digite 0 para voltar ao menu)_', 1000);
        }

        if (body === '4') {
            resetar(chatId);
            db.registrar(chatId, isVip(chatId), db.TIPOS.ENCERRAMENTO, 'Usuário encerrou o chat');
            const msgs = [
                '👊 Valeu! Qualquer coisa é só chamar o *Vipi*! Até mais! 🚛',
                '😊 Tá bom! Estamos sempre aqui quando precisar. Abraço! 🤜🤛',
                '✅ Ok! Se precisar de algo, pode chamar! Até logo! 👋',
                '🙌 Encerrando o chat por aqui! Boa viagem e bons fretes! Até mais! 🚛',
            ];
            return enviarComDigitacao(chatId, msgs[Math.floor(Math.random() * msgs.length)], 800);
        }

        if (body === '5' && isVip(chatId)) {
            db.registrar(chatId, isVip(chatId), db.TIPOS.RELATORIO_PDF, 'Usuário solicitou relatório de pendências (PDF)');
            await enviarComDigitacao(chatId, '📄 Gerando relatório de pendências... aguarda um momento! ⏳', 1000);
            try {
                await chamarPythonRaw(SCRIPT_PDF, CAMINHO_PDF);
                const media = MessageMedia.fromFilePath(CAMINHO_PDF);
                await client.sendMessage(chatId, media, {
                    caption: `📊 *Relatório de Pendências — Vipe Transportes*\n🗓️ Gerado em ${new Date().toLocaleString('pt-BR')}\n\n_Conteúdo: CIOTs em aberto + Multas em aberto_`
                });
            } catch (err) {
                console.error('[PDF]', err);
                await enviarComDigitacao(chatId, '😬 Erro ao gerar o relatório. Verifique se as planilhas estão acessíveis e tente novamente.', 800);
            }
            return;
        }

        if (body === '6' && isVip(chatId)) {
            setEstado(chatId, 'chatbot_vip');
            return enviarComDigitacao(chatId,
                '🤖 *Vipi — Assistente de Dados*\n\n' +
                'Pode me perguntar qualquer coisa sobre os dados de *CIOT* e *Multas*!\n\n' +
                'Exemplos:\n' +
                '• _Quais motoristas têm mais de R$ 5.000 pendente?_\n' +
                '• _Qual o total de multas vencidas?_\n' +
                '• _Quem tem mais contratos em aberto?_\n\n' +
                '_(Digite 0 para voltar ao menu)_', 1200
            );
        }

        if (body === '7' && isVip(chatId)) {
            db.registrar(chatId, true, db.TIPOS.BAIXA_AUTOMATICA, 'Usuário selecionou lançar baixa automática');
            const rascunhos = db.listarBaixasRascunhoAbertas(chatId);
            if (rascunhos.length > 0) {
                if (!userState[chatId]) userState[chatId] = {};
                userState[chatId].opcoesRascunhoBaixa = rascunhos;
                setEstado(chatId, 'baixa_escolha_rascunho');
                let texto = '🧾 *Rascunhos de baixa abertos*\n\n';
                rascunhos.slice(0, 8).forEach((r, i) => {
                    texto += `*${i + 1}* — ${proprietarioRascunho(r)} | ${r.local || '-'} | ${formatarMoeda(r.valor_total)} | ${(r.itens || []).length} lançamento(s)\n`;
                });
                texto += '\nDigite o número para abrir/enviar, *novo* para iniciar outra baixa, ou *zerar* para começar do zero.';
                return enviarComDigitacao(chatId, texto, 1000);
            }
            iniciarBaixa(chatId);
            await enviarComDigitacao(chatId, '✅ *Lançar baixa*\n\nFilial definida: *Viana*.', 700);
            return proximaEtapaBaixa(chatId);
        }

        // PRIMEIRA MENSAGEM / RETORNO
        resetar(chatId);
        const foiTimeout = (userState[chatId] || {}).foiTimeout;

        if (foiTimeout) {
            userState[chatId].foiTimeout = false;
            const pNome = primeiroNome(nomeSalvo(chatId) || '');
            const msgs = pNome ? [
                `👋 Oi de novo, *${pNome}*! Que bom te ver! Como posso ajudar? 😊`,
                `🙌 Olá, *${pNome}*! No que posso ajudar agora?`,
                `😄 Ei, *${pNome}* voltou! *Vipi* aqui, pronto pra ajudar!`,
            ] : [
                '👋 Oi, voltou! Que bom! Como posso te ajudar agora? 😊',
                '🙌 Olá de novo! No que posso ajudar?',
                '😄 Ei, tá de volta! *Vipi* aqui, pronto pra ajudar!',
                '👊 Oba, apareceu! Pode falar, estou aqui! 🚛',
            ];
            await enviarComDigitacao(chatId, msgs[Math.floor(Math.random() * msgs.length)], 1000);
            await sleep(400);

        } else if (!userState[chatId] || !userState[chatId].saudado) {
            db.registrar(chatId, isVip(chatId), db.TIPOS.PRIMEIRO_ACESSO, 'Primeiro contato do usuário');

            const mensagemIA = await gerarCuriosidadeOuData();
            if (mensagemIA) {
                const dataComemorativa = verificarDataComemorativa();
                let prefixo;
                if (dataComemorativa) {
                    const prefixos = {
                        motorista : '🚛 *Feliz Dia do Motorista!*',
                        maes      : '💐 *Feliz Dia das Mães!*',
                        pais      : '👨‍👧 *Feliz Dia dos Pais!*',
                        mulher    : '🌸 *Feliz Dia Internacional da Mulher!*',
                    };
                    prefixo = prefixos[dataComemorativa.tipo] || '🎉 *Data Especial!*';
                } else {
                    const falaDeNos = /vipe|nossa|nossa frota|nossa miss/i.test(mensagemIA);
                    prefixo = falaDeNos ? '💛 *Sabia que a Vipe Transportes...*' : '💡 *Você sabia?*';
                }
                await enviarComDigitacao(chatId, `${prefixo}\n\n${mensagemIA}`, 1800);
                await sleep(800);
            }

            if (!userState[chatId]) userState[chatId] = {};
            userState[chatId].saudado = true;

            // Se ainda não sabemos o nome da pessoa, perguntamos antes do menu.
            const nome = nomeSalvo(chatId);
            if (!nome) {
                setEstado(chatId, 'aguardando_nome_usuario');
                return enviarComDigitacao(chatId,
                    `${saudacaoCurtaPorHorario()}! Eu sou o *Vipi*, da Vipe Transportes. 😊\n\nPra começar, *como você se chama?*`,
                    1200);
            }

            await enviarComDigitacao(chatId, saudacaoComNome(nome), 1200);
            await sleep(600);
        }

        return enviarMenu(chatId);
    }

    // ---- ESCOLHA: BAIXA ÚNICA x ENVIAR PARA A PLATAFORMA ----
    if (estado === 'comprovantes_escolha') {
        // Mandou mais comprovantes antes de escolher → acumula no pendente.
        if (msg?.hasMedia) {
            const pend = userState[chatId].comprovantePendente || { mensagens: [], textoOriginal: '' };
            pend.mensagens = [...(pend.mensagens || []), ...coletarMensagensMidia(msg)];
            if (textoOriginal) pend.textoOriginal = [pend.textoOriginal, textoOriginal].filter(Boolean).join('\n');
            userState[chatId].comprovantePendente = pend;
            return enviarComDigitacao(chatId,
                `📎 Ok, já são *${pend.mensagens.length}* comprovante(s) aguardando.\n\n` +
                'Me diga: *1* para baixa única ou *2* para enviar para a plataforma.', 700);
        }

        const pend = userState[chatId].comprovantePendente || { mensagens: [], textoOriginal: '' };

        if (['1', 'baixa unica', 'baixa única', 'unica', 'única'].includes(body)) {
            db.registrar(chatId, true, db.TIPOS.BAIXA_AUTOMATICA, 'Escolheu baixa única', '');
            const msgBaixa = pend.mensagens.length
                ? { hasMedia: true, isGrupoBaixa: true, anexosBaixa: pend.mensagens, body: pend.textoOriginal || '', from: chatId }
                : null;
            userState[chatId].comprovantePendente = null;
            return iniciarBaixaPorMensagem(chatId, pend.textoOriginal || '', msgBaixa);
        }

        if (['2', 'enviar', 'plataforma', 'lote', 'comprovante', 'comprovantes'].includes(body)) {
            db.registrar(chatId, true, db.TIPOS.BAIXA_AUTOMATICA, 'Escolheu enviar comprovantes para a plataforma', '');
            
            // Check if there are pending vouchers in the database
            let pendentesDb = [];
            try {
                pendentesDb = db.obterComprovantesLotePendentes(chatId);
            } catch (err) {
                console.error('[OBTER COMPROVANTES PENDENTES DB]', err.message || err);
            }

            if (pendentesDb.length > 0) {
                userState[chatId].novosComprovantesTemporarios = pend.mensagens;
                userState[chatId].textoOriginalTemporario = pend.textoOriginal;
                userState[chatId].comprovantePendente = null;
                setEstado(chatId, 'comprovantes_decidir_pendentes');
                return enviarComDigitacao(chatId,
                    `⚠️ *Identifiquei que você possui ${pendentesDb.length} comprovante(s) não enviado(s) da última vez.*\n\n` +
                    'O que deseja fazer com eles?\n\n' +
                    '1️⃣  *Manter e continuar* — juntar os comprovantes antigos com os novos que você acabou de enviar\n' +
                    '2️⃣  *Descartar anteriores* — apagar os antigos e começar uma nova remessa do zero\n\n' +
                    '_(Digite 0 para cancelar)_',
                    1000
                );
            }

            userState[chatId].loteComprovantes = { urls: [], pendentesLocais: [], itens: [], falhas: 0 };
            userState[chatId].comprovantePendente = null;
            setEstado(chatId, 'comprovantes_coletando');
            await enviarComDigitacao(chatId,
                '✅ Beleza! Modo *envio de comprovantes* ativado.\n\n' +
                'Pode mandar *quantos comprovantes quiser* (imagens ou PDFs), um atrás do outro.\n\n' +
                'Quando terminar, digite *Finalizado* que eu envio tudo para a plataforma. 📤', 900);
            // Processa o(s) comprovante(s) que já tinham sido enviados.
            if (pend.mensagens.length) {
                const msgBuffer = { hasMedia: true, isGrupoBaixa: true, anexosBaixa: pend.mensagens, from: chatId };
                return processarComprovantesLoteRecebidos(chatId, msgBuffer);
            }
            return;
        }

        return enviarComDigitacao(chatId,
            'Escolha uma opção:\n\n' +
            '1️⃣  Baixa única\n' +
            '2️⃣  Enviar comprovantes para a plataforma\n\n' +
            '_(Digite 0 para cancelar)_', 700);
    }

    // ---- COLETA DE COMPROVANTES PARA A PLATAFORMA ----
    if (estado === 'comprovantes_coletando') {
        if (msg?.hasMedia) {
            return processarComprovantesLoteRecebidos(chatId, msg);
        }
        if (['finalizado', 'finalizar', 'finalizei', 'concluir', 'concluido', 'concluído', 'pronto', 'fim', 'terminei'].includes(body)) {
            return finalizarEnvioComprovantesLote(chatId);
        }
        if (['cancelar', 'cancela'].includes(body)) {
            try {
                db.descartarComprovantesLotePendentes(chatId);
            } catch (err) {
                console.error('[DESCARTAR COMPROVANTES PENDENTES DB]', err.message || err);
            }
            resetar(chatId);
            return enviarComDigitacao(chatId, '✅ Envio cancelado. Nenhum comprovante foi enviado.\n\nDigite *menu* para voltar.', 700);
        }
        const lote = userState[chatId].loteComprovantes || { urls: [], pendentesLocais: [] };
        const total = (lote.urls?.length || 0) + (lote.pendentesLocais?.length || 0);
        return enviarComDigitacao(chatId,
            `📥 Já recebi *${total}* comprovante(s).\n\n` +
            'Mande mais comprovantes ou digite *Finalizado* para enviar tudo para a plataforma.', 600);
    }

    // ---- ESCOLHA DE COMPROVANTES PENDENTES ANTERIORES ----
    if (estado === 'comprovantes_decidir_pendentes') {
        const novosMensagens = userState[chatId].novosComprovantesTemporarios || [];
        
        if (['1', 'manter', 'continuar', 'manter e continuar'].includes(body)) {
            let pendentesDb = [];
            try {
                pendentesDb = db.obterComprovantesLotePendentes(chatId);
            } catch (err) {
                console.error('[OBTER COMPROVANTES PENDENTES DB]', err.message || err);
            }

            const lote = userState[chatId].loteComprovantes = { urls: [], pendentesLocais: [], itens: [], falhas: 0 };
            
            // Reconstrói a fila do lote a partir dos registros do banco
            for (const item of pendentesDb) {
                if (item.anexo_url) lote.urls.push(item.anexo_url);
                else if (item.arquivo_local) lote.pendentesLocais.push(item.arquivo_local);
                
                lote.itens.push({
                    url: item.anexo_url || null,
                    arquivo_local: item.arquivo_local || null,
                    filename: item.filename || null,
                    identificador: item.identificador || null,
                    identificador_normalizado: item.identificador_normalizado || null,
                    arquivo_hash: item.arquivo_hash || null,
                });
            }
            
            userState[chatId].novosComprovantesTemporarios = null;
            userState[chatId].textoOriginalTemporario = null;
            setEstado(chatId, 'comprovantes_coletando');
            
            await enviarComDigitacao(chatId,
                `✅ Combinado! Recuperei *${pendentesDb.length}* comprovante(s) anterior(es).\n\n` +
                'Continuando a coleta. Pode enviar mais comprovantes ou digitar *Finalizado*. 📤', 800);
                
            // Processa o(s) novo(s) comprovante(s) que iniciaram esta interação
            if (novosMensagens.length > 0) {
                const msgBuffer = { hasMedia: true, isGrupoBaixa: true, anexosBaixa: novosMensagens, from: chatId };
                return processarComprovantesLoteRecebidos(chatId, msgBuffer);
            }
            return;
        }

        if (['2', 'descartar', 'apagar', 'descartar anteriores'].includes(body)) {
            try {
                db.descartarComprovantesLotePendentes(chatId);
            } catch (err) {
                console.error('[DESCARTAR COMPROVANTES PENDENTES DB]', err.message || err);
            }

            userState[chatId].loteComprovantes = { urls: [], pendentesLocais: [], itens: [], falhas: 0 };
            userState[chatId].novosComprovantesTemporarios = null;
            userState[chatId].textoOriginalTemporario = null;
            setEstado(chatId, 'comprovantes_coletando');
            
            await enviarComDigitacao(chatId,
                '✅ Entendido! Descartei os comprovantes anteriores e iniciei uma nova remessa.\n\n' +
                'Pode enviar mais comprovantes ou digitar *Finalizado*. 📤', 800);
                
            // Processa o(s) novo(s) comprovante(s)
            if (novosMensagens.length > 0) {
                const msgBuffer = { hasMedia: true, isGrupoBaixa: true, anexosBaixa: novosMensagens, from: chatId };
                return processarComprovantesLoteRecebidos(chatId, msgBuffer);
            }
            return;
        }

        let pendentesDb = [];
        try {
            pendentesDb = db.obterComprovantesLotePendentes(chatId);
        } catch (err) {
            console.error('[OBTER COMPROVANTES PENDENTES DB]', err.message || err);
        }

        return enviarComDigitacao(chatId,
            `Escolha uma opção para os *${pendentesDb.length}* comprovante(s) pendentes:\n\n` +
            '1️⃣  *Manter e continuar* — juntar os anteriores com os novos\n' +
            '2️⃣  *Descartar anteriores* — apagar os antigos e começar do zero\n\n' +
            '_(Digite 0 para cancelar)_', 700);
    }

    // ---- LANÇAR BAIXA (VIP) ----
    if (estado === 'baixa_duplicado_aberto') {
        const rascunhoId = (userState[chatId] || {}).rascunhoDuplicadoBaixaId;
        const rascunho = rascunhoId ? db.obterBaixaRascunho(rascunhoId) : null;

        if (['1', 'zerar', 'comecar do zero', 'começar do zero'].includes(body)) {
            if (rascunho) db.cancelarBaixaRascunho(rascunho.id, rascunho.telefone === chatId ? chatId : null);
            resetar(chatId);
            return enviarComDigitacao(chatId,
                '✅ Rascunho zerado. Pode enviar o comprovante novamente para começar do zero.',
                900
            );
        }

        if (['2', 'continuar', 'seguir', 'enviar', 'lancar', 'lançar'].includes(body)) {
            if (!rascunho) {
                resetar(chatId);
                return enviarComDigitacao(chatId, '⚠️ Não encontrei esse rascunho aberto. Envie o comprovante novamente ou digite *menu*.', 800);
            }
            carregarRascunhoNoEstado(chatId, rascunho);
            setEstado(chatId, 'baixa_rascunho_decisao');
            return enviarComDigitacao(chatId,
                '🧾 *Rascunho carregado sem duplicar o comprovante.*\n\n' +
                `Proprietário: *${proprietarioRascunho(rascunho)}*\n` +
                `Filial: *${rascunho.local || '-'}*\n` +
                `Valor acumulado: *${formatarMoeda(rascunho.valor_total)}*\n` +
                `Comprovantes/lançamentos: *${(rascunho.itens || []).length}*\n\n` +
                'O que deseja fazer?\n\n' +
                '1️⃣  Enviar baixa agora\n' +
                '2️⃣  Aguardar mais comprovantes\n' +
                '3️⃣  Zerar e começar do zero',
                1000
            );
        }

        return enviarComDigitacao(chatId,
            'Escolha uma opção:\n\n' +
            '1️⃣  Zerar esse rascunho e começar do zero\n' +
            '2️⃣  Continuar o lançamento sem duplicar',
            700
        );
    }

    if (estado === 'baixa_confirmar_zerar_base') {
        if (['1', 'sim', 's', 'confirmar', 'zerar'].includes(body)) {
            const total = db.zerarBaseBaixas(chatId);
            resetar(chatId);
            db.registrar(chatId, true, db.TIPOS.BAIXA_AUTOMATICA, 'Usuário zerou base local de baixas', JSON.stringify(total));
            return enviarComDigitacao(chatId,
                '✅ Base local de baixas zerada.\n\n' +
                `${total.rascunhos} baixa(s) local(is) foram fechada(s) e ${total.comprovantes} comprovante(s) deixaram de contar como duplicados.\n\n` +
                'Pode enviar um novo comprovante ou digitar *menu* para começar de novo.',
                900
            );
        }
        if (['2', 'cancelar', 'nao', 'não', 'n'].includes(body)) {
            resetar(chatId);
            return enviarComDigitacao(chatId, 'Tudo bem, mantive os rascunhos como estavam.\n\nDigite *menu* para voltar.', 700);
        }
        return enviarComDigitacao(chatId,
            'Escolha uma opção:\n\n' +
            '1️⃣  Sim, zerar tudo\n' +
            '2️⃣  Cancelar',
            700
        );
    }

    if (estado === 'baixa_escolha_rascunho') {
        const opcoes = (userState[chatId] || {}).opcoesRascunhoBaixa || [];
        if (comandoZerarBaseBaixa(body)) {
            setEstado(chatId, 'baixa_confirmar_zerar_base');
            return enviarComDigitacao(chatId,
                '⚠️ Você quer zerar a base local de baixas e começar do zero?\n\n' +
                '1️⃣  Sim, zerar tudo\n' +
                '2️⃣  Cancelar',
                900
            );
        }
        if (body === 'novo' || body === 'nova') {
            iniciarBaixa(chatId);
            await enviarComDigitacao(chatId, '✅ *Nova baixa*\n\nFilial definida: *Viana*.', 700);
            return proximaEtapaBaixa(chatId);
        }

        const idx = parseInt(body) - 1;
        if (isNaN(idx) || idx < 0 || idx >= opcoes.length) {
            return enviarComDigitacao(chatId, '⚠️ Escolha um número da lista ou digite *novo* para iniciar outra baixa.', 700);
        }

        const rascunho = db.obterBaixaRascunho(opcoes[idx].id);
        if (!rascunho) {
            resetar(chatId);
            return enviarComDigitacao(chatId, '⚠️ Não encontrei esse rascunho. Digite *menu* e tente novamente.', 700);
        }

        carregarRascunhoNoEstado(chatId, rascunho);
        setEstado(chatId, 'baixa_rascunho_decisao');
        return enviarComDigitacao(chatId,
            '🧾 *Rascunho aberto*\n\n' +
            `Proprietário: *${proprietarioRascunho(rascunho)}*\n` +
            `Filial: *${rascunho.local || '-'}*\n` +
            `Valor acumulado: *${formatarMoeda(rascunho.valor_total)}*\n` +
            `Comprovantes/lançamentos: *${(rascunho.itens || []).length}*\n\n` +
            'O que deseja fazer?\n\n' +
            '1️⃣  Enviar baixa agora\n' +
            '2️⃣  Aguardar mais comprovantes\n' +
            '3️⃣  Zerar e começar do zero',
            1000
        );
    }

    if (estado === 'baixa_escolha_proprietario') {
        const opcoes = (userState[chatId] || {}).opcoesProprietarioBaixa || [];
        const idx = parseInt(body) - 1;
        const baixa = baixaAtual(chatId);

        if (!isNaN(idx) && idx >= 0 && idx < opcoes.length) {
            const escolhido = opcoes[idx];
            baixa.id_proprietario = String(escolhido.id_proprietario);
            baixa.nome_proprietario = escolhido.nome;
            baixa.local = BAIXA_LOCAL_PADRAO;
            baixa.proprietario_cadastrado = true;
            salvarAliasProprietarioSeNecessario(baixa, escolhido);
            userState[chatId].opcoesProprietarioBaixa = null;
            return proximaEtapaBaixa(chatId);
        }

        const idMatch = textoOriginal.match(/^id[:\s-]*(.+)$/i) || textoOriginal.match(/^#?(\d+)$/);
        if (idMatch) {
            baixa.id_proprietario = idMatch[1].trim();
            delete baixa.nome_proprietario;
        } else if (textoOriginal.length >= 3) {
            baixa.nome_proprietario = textoOriginal.replace(/^nome[:\s-]*/i, '').trim();
            delete baixa.id_proprietario;
        } else {
            return enviarComDigitacao(chatId, '⚠️ Escolha uma opção da lista ou envie outro ID/nome de proprietário.', 700);
        }
        userState[chatId].opcoesProprietarioBaixa = null;
        return proximaEtapaBaixa(chatId);
    }

    if (estado === 'baixa_rascunho_decisao') {
        const baixa = baixaAtual(chatId);
        const rascunho = baixa.rascunho_id ? db.obterBaixaRascunho(baixa.rascunho_id) : null;

        if (['2', 'aguardar', 'esperar', 'nao', 'não', 'n', 'mais dados'].includes(body)) {
            resetar(chatId);
            return enviarComDigitacao(chatId,
                '✅ Perfeito. Rascunho guardado.\n\n' +
                'Quando chegar outro comprovante desse proprietário/local, vou somar no mesmo registro aberto.\n' +
                'Quando quiser finalizar, envie o comprovante ou digite *menu* e escolha *Lançar baixa*.',
                900
            );
        }

        if (['1', 'enviar', 'encerrar', 'finalizar', 'fechar', 'sim', 's'].includes(body)) {
            if (!rascunho) {
                resetar(chatId);
                return enviarComDigitacao(chatId, '⚠️ Não encontrei o rascunho dessa baixa. Envie os dados novamente ou digite *menu*.', 800);
            }
            carregarRascunhoNoEstado(chatId, rascunho);
            return prepararBaixaLote(chatId);
        }

        if (['3', 'zerar', 'zerar base', 'começar do zero', 'comecar do zero', 'iniciar do zero'].includes(body)) {
            const total = db.zerarBaseBaixas(chatId);
            resetar(chatId);
            return enviarComDigitacao(chatId,
                '✅ Base local de baixas zerada. Vamos começar do zero.\n\n' +
                `${total.rascunhos} baixa(s) local(is) foram fechada(s) e ${total.comprovantes} comprovante(s) deixaram de contar como duplicados.\n\n` +
                'Agora envie um novo comprovante ou uma nova mensagem de baixa para eu analisar com IA.',
                900
            );
        }

        return enviarComDigitacao(chatId,
            'Escolha uma opção:\n\n' +
            '1️⃣  Enviar baixa agora\n' +
            '2️⃣  Aguardar mais comprovantes\n' +
            '3️⃣  Zerar e começar do zero',
            800
        );
    }

    if (estado === 'baixa_local') {
        const baixa = baixaAtual(chatId);
        baixa.local = BAIXA_LOCAL_PADRAO;
        await enviarComDigitacao(chatId, '✅ Baixas via bot serão lançadas sempre na filial *Viana*.', 600);
        return proximaEtapaBaixa(chatId);
    }

    if (estado === 'baixa_proprietario') {
        const baixa = baixaAtual(chatId);
        const texto = textoOriginal.replace(/^nome[:\s-]*/i, '').trim();
        const idMatch = textoOriginal.match(/^id[:\s-]*(.+)$/i) || textoOriginal.match(/^#?(\d+)$/);

        if (idMatch) {
            baixa.id_proprietario = idMatch[1].trim();
            delete baixa.nome_proprietario;
        } else if (texto.length >= 3) {
            baixa.nome_proprietario = texto;
            delete baixa.id_proprietario;
        } else {
            return enviarComDigitacao(chatId, '⚠️ Informe um *ID* ou o *nome exato* do proprietário.', 700);
        }

        return proximaEtapaBaixa(chatId);
    }

    if (estado === 'baixa_valor') {
        const valor = parseValorDecimal(textoOriginal);
        if (valor === null) {
            return enviarComDigitacao(chatId, '⚠️ Valor inválido. Envie apenas número, sem R$. Exemplo: *4166,00*', 700);
        }
        baixaAtual(chatId).valor_pago = valor;
        return proximaEtapaBaixa(chatId);
    }

    if (estado === 'baixa_data_pagamento') {
        const dataPagamento = normalizarData(textoOriginal);
        if (!dataPagamento) {
            return enviarComDigitacao(chatId, '⚠️ Data inválida. Envie como *DD/MM/AAAA* ou *YYYY-MM-DD*.', 700);
        }
        const baixa = baixaAtual(chatId);
        baixa.data_pagamento = dataPagamento;
        baixa.data_baixa = hojeISO();
        return proximaEtapaBaixa(chatId);
    }

    if (estado === 'baixa_forma_pagamento') {
        const baixa = baixaAtual(chatId);
        baixa.formaPerguntada = true;
        if (!isPular(body)) baixa.forma_pagamento = normalizarFormaPagamento(textoOriginal);
        return proximaEtapaBaixa(chatId);
    }

    if (estado === 'baixa_recebedor') {
        const baixa = baixaAtual(chatId);
        baixa.recebedorPerguntado = true;
        if (!isPular(body)) {
            const recebedor = normalizarRecebedorBaixa(textoOriginal);
            if (!recebedor) {
                await enviarComDigitacao(chatId, `Não reconheci esse recebedor. Use *1* para ${RECEBEDOR_VIPE}, *2* para ${RECEBEDOR_AUGUSTO}, ou *pular*.`, 650);
                return;
            }
            baixa.recebedor = recebedor;
        }
        return proximaEtapaBaixa(chatId);
    }

    if (estado === 'baixa_anexos') {
        const baixa = baixaAtual(chatId);
        baixa.anexosPerguntado = true;
        if (msg?.hasMedia) {
            await enviarComDigitacao(chatId, '☁️ Subindo comprovante para o Google Drive... ⏳', 700);
            const midias = await baixarMidiasParaAnalise(msg);
            const urlsDrive = midias.map((m) => m.url).filter(Boolean);
            const arquivosLocais = midias.map((m) => m.arquivo_local).filter(Boolean);
            if (arquivosLocais.length > 0) {
                baixa.arquivos_locais = Array.from(new Set([...(baixa.arquivos_locais || []), ...arquivosLocais]));
            }
            if (urlsDrive.length === 0) {
                baixa.anexosPerguntado = false;
                const erro = midias.find((m) => m.uploadError)?.uploadError || 'não foi possível fazer upload';
                const guardado = arquivosLocais.length > 0 ? '\n\n💾 Guardei o arquivo na pasta local de comprovantes pendentes, então ele não foi perdido.' : '';
                return enviarComDigitacao(chatId, `⚠️ Não consegui subir o comprovante: ${erro}${guardado}\n\nTente enviar novamente ou digite *pular*.`, 900);
            }
            baixa.anexos = anexosUnicos(baixa.anexos || [], urlsDrive);
            baixa.comprovantesRecebidos = true;
            const hashesMidia = midias.map((m) => m.arquivo_hash).filter(Boolean);
            if (hashesMidia.length > 0) baixa.arquivo_hash = hashesMidia[0];
            const publicIdsMidia = midias.map((m) => m.public_id).filter(Boolean);
            if (publicIdsMidia.length > 0) baixa.cloudinary_public_id = publicIdsMidia[0];
            baixa.cloudinaryConfigurado = true;
        } else if (isPular(body)) {
            baixa.anexos = [];
        } else {
            const urls = extrairUrls(textoOriginal);
            if (urls.length === 0) return enviarComDigitacao(chatId, '⚠️ Não encontrei anexo nem URL pública. Envie o comprovante aqui no WhatsApp, mande links começando com *http://* ou *https://*, ou digite *pular*.', 800);
            if (urls.length > 4) return enviarComDigitacao(chatId, '⚠️ Envie no máximo *4* comprovantes.', 700);
            baixa.anexos = urls;
        }

        return registrarRascunhoEConfirmar(chatId);
    }

    if (estado === 'baixa_confirmacao') {
        if (['2', 'cancelar', 'cancela', 'nao', 'não'].includes(body)) {
            resetar(chatId);
            return enviarComDigitacao(chatId, '✅ Combinado. Baixa cancelada, nada foi registrado.\n\nDigite *menu* para voltar.', 800);
        }
        if (!['1', 'confirmar', 'confirma', 'sim', 's'].includes(body)) {
            return enviarComDigitacao(chatId,
                'Escolha uma opção:\n\n' +
                '1️⃣  Registrar baixa no sistema\n' +
                '2️⃣  Cancelar envio',
                700
            );
        }

        const baixa = baixaAtual(chatId);
        await enviarComDigitacao(chatId, '✅ Registrando uma única baixa em lote no sistema... ⏳', 1000);
        try {
            const token = baixa.token || await autenticarBaixas();
            const payload = baixa.payloadLote;
            const lote = baixa.loteBaixa;
            if (!payload?.ids?.length || !lote?.ids?.length) {
                resetar(chatId);
                return enviarComDigitacao(chatId, '⚠️ Não encontrei os IDs do lote preparado. Abra o rascunho e envie novamente para eu buscar os pendentes antes de registrar.', 900);
            }

            const resultado = await chamarBaixaLote(payload, token);

            if (resultado.erro || resultado.status >= 400) {
                db.registrar(chatId, true, db.TIPOS.BAIXA_AUTOMATICA, 'Erro ao confirmar baixa em lote', JSON.stringify(resultado.data).slice(0, 500));
                resetar(chatId);
                return enviarComDigitacao(chatId,
                    `😬 A baixa não foi registrada.\n\n` +
                    `${resumoErroApi(resultado.data)}\n\n` +
                    `${formatarResumoLote(lote, baixa.valor_pago)}\n\n` +
                    'O rascunho continua salvo. Use *menu* > *7* para tentar novamente depois de conferir o sistema.',
                    1200
                );
            }

            db.registrar(chatId, true, db.TIPOS.BAIXA_AUTOMATICA, 'Baixa em lote registrada', JSON.stringify(resultado.data).slice(0, 500));
            if (baixa.rascunho_id) {
                db.marcarBaixaRascunhoEnviada(baixa.rascunho_id, payload, resultado.data);
            }
            resetar(chatId);
            return enviarComDigitacao(chatId,
                '🎉 *Baixa em lote registrada com sucesso!*\n\n' +
                `${formatarResultadoBaixaLote(resultado, lote)}\n\n` +
                'Digite *menu* para voltar.', 1200
            );
        } catch (err) {
            console.error('[BAIXA LOTE CONFIRMAR]', err.response?.data || err.message || err);
            resetar(chatId);
            return enviarComDigitacao(chatId, '😬 Erro ao confirmar a baixa em lote. Verifique no sistema antes de tentar novamente.\n\nDigite *menu* para voltar.', 900);
        }
    }

    // ---- SUBMENU CIOT (VIP) ----
    if (estado === 'aguardando_ciot_tipo') {
        if (body === '1') { setEstado(chatId, 'aguardando_cpf_ciot'); return enviarComDigitacao(chatId, '🪪 Me passa o *CPF* pra eu consultar! 😊\n\n_(Digite 0 para voltar ao menu)_', 800); }
        if (body === '2') { setEstado(chatId, 'aguardando_nome_ciot'); return enviarComDigitacao(chatId, '🔍 Me fala *parte do nome* do motorista! 😊\n\n_(Digite 0 para voltar ao menu)_', 800); }
        return enviarComDigitacao(chatId, '⚠️ Digite *1* para CPF ou *2* para nome.\n\n_(Digite 0 para voltar)_', 600);
    }

    // ---- SUBMENU MULTAS (VIP) ----
    if (estado === 'aguardando_multa_tipo') {
        if (body === '1') { setEstado(chatId, 'aguardando_cpf_multa'); return enviarComDigitacao(chatId, '🪪 Me passa o *CPF* pra eu consultar! 😊\n\n_(Digite 0 para voltar ao menu)_', 800); }
        if (body === '2') { setEstado(chatId, 'aguardando_nome_multa'); return enviarComDigitacao(chatId, '🔍 Me fala *parte do nome* do motorista! 😊\n\n_(Digite 0 para voltar ao menu)_', 800); }
        return enviarComDigitacao(chatId, '⚠️ Digite *1* para CPF ou *2* para nome.\n\n_(Digite 0 para voltar)_', 600);
    }

    // Validação CPF
    const precisaCPF = estado === 'aguardando_cpf_ciot' || estado === 'aguardando_cpf_multa';
    if (precisaCPF && !validarCPF(body)) {
        return enviarComDigitacao(chatId, '⚠️ CPF inválido! Me manda os *11 dígitos* sem pontos ou traço, tá? 😊\n\n_(Digite 0 para voltar ao menu)_', 800);
    }

    // ---- CIOT POR CPF ----
    if (estado === 'aguardando_cpf_ciot') {
        const cpf = body.replace(/\D/g, '');
        db.registrar(chatId, isVip(chatId), db.TIPOS.CONSULTA_CIOT, 'Consulta CIOT por CPF', cpf);
        await enviarComDigitacao(chatId, msgConsultandoAleatoria(), 1200);
        try {
            const dados = await chamarPython(SCRIPT_CIOT, cpf);
            await enviarComDigitacao(chatId, await ai.gerarRespostaCIOT(dados).catch(() => fallbackCIOT(dados)), 1000);
        } catch (err) { console.error(`[CIOT CPF]`, err); resetar(chatId); await enviarComDigitacao(chatId, '😬 Deu um erro! Tenta de novo ou digita *menu*.', 800); }
        return;
    }

    // ---- CIOT POR NOME ----
    if (estado === 'aguardando_nome_ciot') {
        db.registrar(chatId, isVip(chatId), db.TIPOS.CONSULTA_CIOT, 'Consulta CIOT por nome', body);
        await enviarComDigitacao(chatId, msgConsultandoAleatoria(), 1200);
        try {
            const dados = await chamarPython(SCRIPT_CIOT, `--nome:${body}`);
            if (!dados.encontrado || !dados.nomes || dados.nomes.length === 0) {
                return enviarComDigitacao(chatId, `😕 Não achei nenhum motorista com *"${body}"* nos últimos 30 dias.\n\nTenta com outra parte do nome! 😊\n\n_(Digite 0 para voltar)_`, 900);
            }
            if (dados.nomes.length === 1) {
                const r = await chamarPython(SCRIPT_CIOT, `--nome-exato:${dados.nomes[0]}`);
                return enviarComDigitacao(chatId, await ai.gerarRespostaCIOT(r).catch(() => fallbackCIOT(r)), 1000);
            }
            userState[chatId].listaNomes = dados.nomes;
            setEstado(chatId, 'aguardando_escolha_nome');
            let msg = `🔍 Achei *${dados.nomes.length}* motoristas com *"${body}"*:\n\n`;
            dados.nomes.forEach((n, i) => { msg += `*${i+1}* — ${n}\n`; });
            msg += `\nQual deles? Digite o *número*! 😊\n_(Digite 0 para voltar)_`;
            return enviarComDigitacao(chatId, msg, 1000);
        } catch (err) { console.error(`[CIOT NOME]`, err); resetar(chatId); return enviarComDigitacao(chatId, '😬 Deu um erro! Tenta de novo ou digita *menu*.', 800); }
    }

    // ---- ESCOLHA NOME CIOT ----
    if (estado === 'aguardando_escolha_nome') {
        const lista = (userState[chatId] || {}).listaNomes || [];
        const idx = parseInt(body) - 1;
        if (isNaN(idx) || idx < 0 || idx >= lista.length) {
            let msg = `⚠️ Inválido! Escolha entre 1 e ${lista.length}:\n\n`;
            lista.forEach((n, i) => { msg += `*${i+1}* — ${n}\n`; });
            return enviarComDigitacao(chatId, msg + '\n_(Digite 0 para voltar)_', 800);
        }
        await enviarComDigitacao(chatId, msgConsultandoAleatoria(), 1200);
        try {
            const r = await chamarPython(SCRIPT_CIOT, `--nome-exato:${lista[idx]}`);
            db.registrar(chatId, isVip(chatId), db.TIPOS.CONSULTA_CIOT, 'Consulta CIOT por nome (escolha)', lista[idx]);
            setEstado(chatId, 'aguardando_nome_ciot');
            return enviarComDigitacao(chatId, await ai.gerarRespostaCIOT(r).catch(() => fallbackCIOT(r)), 1000);
        } catch (err) { console.error(`[CIOT ESCOLHA]`, err); resetar(chatId); return enviarComDigitacao(chatId, '😬 Deu um erro! Tenta de novo ou digita *menu*.', 800); }
    }

    // ---- MULTAS POR CPF ----
    if (estado === 'aguardando_cpf_multa') {
        const cpf = body.replace(/\D/g, '');
        db.registrar(chatId, isVip(chatId), db.TIPOS.CONSULTA_MULTA, 'Consulta de multas por CPF', cpf);
        await enviarComDigitacao(chatId, msgConsultandoAleatoria(), 1200);
        try {
            const dados = await chamarPython(SCRIPT_MULTA, cpf);
            await enviarComDigitacao(chatId, await ai.gerarRespostaMultas(dados).catch(() => fallbackMultas(dados)), 1000);
        } catch (err) { console.error(`[MULTAS]`, err); resetar(chatId); await enviarComDigitacao(chatId, '😬 Erro ao consultar! Tenta de novo ou digita *menu*.', 800); }
        return;
    }

    // ---- MULTAS POR NOME ----
    if (estado === 'aguardando_nome_multa') {
        db.registrar(chatId, isVip(chatId), db.TIPOS.CONSULTA_MULTA, 'Consulta de multas por nome', body);
        await enviarComDigitacao(chatId, msgConsultandoAleatoria(), 1200);
        try {
            const dados = await chamarPython(SCRIPT_MULTA, `--nome:${body}`);
            if (!dados.encontrado || !dados.nomes || dados.nomes.length === 0) {
                return enviarComDigitacao(chatId, `😕 Nenhum motorista com *"${body}"* nos últimos 30 dias.\n\nTenta com outra parte do nome! 😊\n\n_(Digite 0 para voltar)_`, 900);
            }
            if (dados.nomes.length === 1) {
                const r = await chamarPython(SCRIPT_MULTA, `--nome-exato:${dados.nomes[0]}`);
                return enviarComDigitacao(chatId, await ai.gerarRespostaMultas(r).catch(() => fallbackMultas(r)), 1000);
            }
            userState[chatId].listaNomesMulta = dados.nomes;
            setEstado(chatId, 'aguardando_escolha_nome_multa');
            let msg = `🔍 Achei *${dados.nomes.length}* motoristas com *"${body}"*:\n\n`;
            dados.nomes.forEach((n, i) => { msg += `*${i+1}* — ${n}\n`; });
            msg += `\nQual deles? 😊\n_(Digite 0 para voltar)_`;
            return enviarComDigitacao(chatId, msg, 1000);
        } catch (err) { console.error(`[MULTA NOME]`, err); resetar(chatId); return enviarComDigitacao(chatId, '😬 Deu um erro! Tenta de novo ou digita *menu*.', 800); }
    }

    // ---- ESCOLHA NOME MULTAS ----
    if (estado === 'aguardando_escolha_nome_multa') {
        const lista = (userState[chatId] || {}).listaNomesMulta || [];
        const idx = parseInt(body) - 1;
        if (isNaN(idx) || idx < 0 || idx >= lista.length) {
            let msg = `⚠️ Inválido! Escolha entre 1 e ${lista.length}:\n\n`;
            lista.forEach((n, i) => { msg += `*${i+1}* — ${n}\n`; });
            return enviarComDigitacao(chatId, msg + '\n_(Digite 0 para voltar)_', 800);
        }
        await enviarComDigitacao(chatId, msgConsultandoAleatoria(), 1200);
        try {
            const r = await chamarPython(SCRIPT_MULTA, `--nome-exato:${lista[idx]}`);
            db.registrar(chatId, isVip(chatId), db.TIPOS.CONSULTA_MULTA, 'Consulta de multas por nome (escolha)', lista[idx]);
            setEstado(chatId, 'aguardando_nome_multa');
            return enviarComDigitacao(chatId, await ai.gerarRespostaMultas(r).catch(() => fallbackMultas(r)), 1000);
        } catch (err) { console.error(`[MULTA ESCOLHA]`, err); resetar(chatId); return enviarComDigitacao(chatId, '😬 Deu um erro! Tenta de novo ou digita *menu*.', 800); }
    }

    // ---- CHATBOT VIP (estado direto) ----
    if (estado === 'chatbot_vip') {
        db.registrar(chatId, isVip(chatId), db.TIPOS.CHATBOT_IA, 'Pergunta ao assistente IA', body);
        await enviarComDigitacao(chatId, '🤖 Consultando os dados... aguarda! ⏳', 1000);
        try {
            const openaiKey = process.env.OPENAI_API_KEY || '';
            const resultado = await new Promise((resolve, reject) => {
                execFile(
                    PYTHON, [SCRIPT_CHAT, body, openaiKey],
                    { timeout: 60000, env: { ...process.env, PYTHONIOENCODING: 'utf-8' } },
                    (err, stdout, stderr) => {
                        if (err) { reject(stderr || err.message); return; }
                        try {
                            const parsed = JSON.parse(stdout.trim());
                            if (parsed.erro) reject(parsed.erro);
                            else resolve(parsed.resposta);
                        } catch (e) { reject(stdout.slice(0, 200)); }
                    }
                );
            });
            await enviarComDigitacao(chatId, resultado, 800);
            await sleep(500);
            await enviarComDigitacao(chatId, '💬 Pode fazer outra pergunta ou digitar *0* para voltar ao menu.', 600);
        } catch (err) {
            console.error('[CHATBOT]', err);
            db.registrar(chatId, isVip(chatId), db.TIPOS.ERRO, 'Erro no chatbot IA', err.toString().slice(0, 200));
            await enviarComDigitacao(chatId, '😬 Não consegui responder agora. Tenta de novo!', 800);
        }
        return;
    }

    // ---- MANIFESTO ----
    if (estado === 'aguardando_manifesto') {
        db.registrar(chatId, isVip(chatId), db.TIPOS.BAIXA_MANIFESTO, 'Baixa de manifesto solicitada', body);
        await enviarComDigitacao(chatId, `📦 Manifesto *${body}* recebido!\n\n⚙️ Funcionalidade em desenvolvimento. Em breve disponível!\n\nDigita *menu* pra voltar. 😊`, 1000);
        resetar(chatId);
        return;
    }

    // Fallback
    resetar(chatId);
    return enviarMenu(chatId);
}

// ==============================
// FALLBACKS
// ==============================
function fallbackCIOT(d) {
    if (!d.encontrado) return `😕 Nenhum contrato encontrado nos últimos 30 dias.\n\nTenta verificar os dados! 😊\n\nDigite *menu* para voltar.`;
    return `📊 *${d.total_contratos}* contrato(s) | Pendente: *R$ ${Number(d.valor_total_pendente||0).toFixed(2)}*\n\nDigite *menu* para voltar.`;
}
function fallbackMultas(d) {
    if (!d.encontrado) return `✅ Nenhuma multa em aberto nos últimos 30 dias! 🎉\n\nDigite *menu* para voltar.`;
    return `🚨 *${d.total_multas}* multa(s) | Total: *R$ ${Number(d.valor_total||0).toFixed(2)}*\n\nDigite *menu* para voltar.`;
}

// ==============================
// EVENTOS
// ==============================
client.on('qr', (qr) => { console.log('\n📱 Escaneie o QR Code:\n'); qrcode.generate(qr, { small: true }); });

client.once('ready', () => {
    const vipCount = cfg().vip_numbers.length;
    console.log('✅ Vipi está pronto!');
    console.log(`🔑 VIPs cadastrados: ${vipCount}`);
});

client.on('message', async (msg) => {
    if (msg.isGroupMsg) return;
    if (msg.isStatus) return;
    if (!msg.hasMedia && msg.type !== 'chat') return;
    const chatId = msg.from;
    const bodyOriginal = (msg.body || '').trim();
    const body   = bodyOriginal.toLowerCase();
    console.log(`[MSG] ${chatId} | vip=${isVip(chatId)} | estado=${getEstado(chatId)} | body=${body.slice(0,50)}`);
    if (deveAgruparAnexoBaixa(chatId, bodyOriginal, msg)) {
        agendarGrupoAnexoBaixa(chatId, bodyOriginal, msg);
        return;
    }
    try { await processarComFila(chatId, { normalizado: body, original: bodyOriginal, msg }); }
    catch (err) { console.error(`[BOT ${chatId}]`, err.message); }
});

client.on('message_create', async (msg) => {
    if (!msg.fromMe) return;
    const chatId = msg.to;
    if (msg.body.trim().toLowerCase() === 'encerrar atendimento') {
        resetar(chatId);
        await enviarComDigitacao(chatId, '✅ Atendimento encerrado pelo operador. *Vipi* de volta! 😊', 800);
        await sleep(1500);
        await enviarMenu(chatId);
    }
});

client.initialize();
