// ==============================================
// VIPE TRANSPORTES — INTEGRAÇÃO OPENAI
// ==============================================

const https = require('https');
const fs    = require('fs');
const path  = require('path');

const CONFIG_PATH = path.join(__dirname, 'config.json');

// Lê as configurações do arquivo em tempo real (sem reiniciar o bot)
function cfg() {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
}

// ==============================
// FUNÇÃO BASE (array de mensagens)
// ==============================
function chamarOpenAI(mensagens) {
    return new Promise((resolve, reject) => {
        const { openai } = cfg();
        const OPENAI_KEY = process.env.OPENAI_API_KEY;

        if (!OPENAI_KEY) { reject(new Error('OPENAI_API_KEY não configurada')); return; }

        const body = JSON.stringify({
            model      : openai.model      || 'gpt-4o-mini',
            max_tokens : openai.max_tokens || 2000,
            temperature: openai.temperature ?? 0.4,
            messages   : mensagens,
        });

        const options = {
            hostname: 'api.openai.com',
            path    : '/v1/chat/completions',
            method  : 'POST',
            headers : {
                'Content-Type'  : 'application/json',
                'Authorization' : `Bearer ${OPENAI_KEY}`,
                'Content-Length': Buffer.byteLength(body),
            },
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    if (json.error) reject(new Error(json.error.message));
                    else resolve(json.choices[0].message.content.trim());
                } catch (e) { reject(e); }
            });
        });

        req.on('error', reject);
        req.setTimeout(30000, () => req.destroy(new Error('Timeout OpenAI')));
        req.write(body);
        req.end();
    });
}

// ==============================
// FUNÇÃO SIMPLES (string → string)
// Usada pelo bot para curiosidades e datas comemorativas
// ==============================
async function chamarOpenAISimples(prompt) {
    const { system_prompt_simples } = cfg();
    return chamarOpenAI([
        { role: 'system', content: system_prompt_simples },
        { role: 'user'  , content: prompt },
    ]);
}

function extrairJSON(texto) {
    const limpo = String(texto || '').trim()
        .replace(/^```json\s*/i, '')
        .replace(/^```\s*/i, '')
        .replace(/```$/i, '')
        .trim();
    try { return JSON.parse(limpo); } catch (_) {}

    const inicio = limpo.indexOf('{');
    const fim = limpo.lastIndexOf('}');
    if (inicio >= 0 && fim > inicio) return JSON.parse(limpo.slice(inicio, fim + 1));
    throw new Error('Resposta da OpenAI não veio em JSON válido.');
}

async function analisarBaixaAutomatica({ texto = '', midias = [] }) {
    const dataAtual = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
    const conteudo = [
        {
            type: 'text',
            text:
                'Analise a mensagem e os comprovantes para preparar uma baixa automática de abastecimentos.\n' +
                'Extraia somente informações explicitamente visíveis ou fortemente inferíveis no comprovante/texto.\n' +
                'O objetivo principal é identificar o proprietário correto para a baixa.\n\n' +
                'Responda apenas JSON válido, sem markdown, neste formato:\n' +
                '{\n' +
                '  "local": "Matriz|Viana|null",\n' +
                '  "id_proprietario": "string|null",\n' +
                '  "nome_proprietario": "string|null",\n' +
                '  "nome_lido_comprovante": "string|null",\n' +
                '  "campo_nome_proprietario": "Empresa|Remetente|Beneficiário|Favorecido|Pagador|outro|null",\n' +
                '  "valor_pago": 0.00,\n' +
                '  "valor_pago_texto": "string|null",\n' +
                '  "valor_pago_representa": "total|unitario|indefinido",\n' +
                '  "valores_comprovantes": [0.00],\n' +
                '  "data_pagamento": "YYYY-MM-DD|null",\n' +
                '  "forma_pagamento": "PIX|dinheiro|transferência|depósito|outro|null",\n' +
                '  "recebedor": "string|null",\n' +
                '  "identificador_pagamento": "string|null",\n' +
                '  "identificadores_encontrados": ["string"],\n' +
                '  "confianca_proprietario": 0,\n' +
                '  "evidencias": "frase curta explicando de onde veio o proprietário"\n' +
                '}\n\n' +
                `Data atual para referência: ${dataAtual}.\n` +
                'Não invente id_proprietario. Se não aparecer ID, deixe null.\n' +
                'REGRA PRINCIPAL DO PROPRIETÁRIO: a Vipe Transportes é SEMPRE uma das duas partes do comprovante (quem paga OU quem recebe). O proprietário é SEMPRE a OUTRA parte — nunca a Vipe.\n' +
                'Os comprovantes (Pix, transferência, depósito) têm dois blocos: "Dados de quem pagou" (rótulos: Pagador, Remetente, Quem pagou) e "Dados de quem recebeu" (rótulos: Beneficiário, Favorecido, Quem recebeu). ' +
                'Passo 1: localize em qual bloco está a VIPE (nome contendo VIPE/VIPI, ou o CNPJ 57.312.701/0001-83). ' +
                'Passo 2: o proprietário é o NOME do bloco OPOSTO ao da Vipe. ' +
                'Exemplo real: se "Dados de quem recebeu: Nome: VIPE TRANSPORTES" e "Dados de quem pagou: Nome: ERLAN DOUGLAS BORTOLOTTI", então o proprietário é "ERLAN DOUGLAS BORTOLOTTI" (campo_nome_proprietario="Pagador"). ' +
                'Se a Vipe aparecer como quem pagou, então o proprietário é o nome em "Dados de quem recebeu" (campo_nome_proprietario="Favorecido"). ' +
                'Outros rótulos que também podem indicar o proprietário: Empresa, Titular, Cliente, Razão social. ' +
                'O proprietário é o texto que vem depois do rótulo. Exemplo: em "Empresa: F N TRANSPORTES LTDA", o proprietário lido é "F N TRANSPORTES LTDA". ' +
                'Preencha nome_lido_comprovante com esse texto exatamente lido e campo_nome_proprietario com o rótulo usado. ' +
                'VIPE, VIPI, VIPE TRANSPORTES, VIPE TRANSP, o CNPJ 57.312.701/0001-83 ou qualquer variação contendo VIPE nunca deve ser proprietário. Só deixe nome_proprietario e nome_lido_comprovante como null se realmente NÃO houver nenhum nome além da Vipe no comprovante.\n' +
                'Se houver mais de um comprovante/anexo, analise cada comprovante separadamente. ' +
                'Preencha valores_comprovantes com o valor de cada comprovante e valor_pago com a soma total. ' +
                'Preencha valor_pago_texto com o valor exatamente como aparece no comprovante, incluindo separadores. ' +
                'Leia o valor dígito por dígito: R$ 4,326.00 e R$ 4.326,00 significam 4326.00. ' +
                'Não confunda 4,326.00 com 4,166.00: se os três últimos dígitos antes dos centavos forem 326, o valor é 4326. ' +
                'Se o valor estiver borrado ou houver dúvida entre números parecidos, deixe valor_pago null, valor_pago_texto null e explique em evidencias em vez de chutar.\n' +
                'Quando houver datas diferentes em vários comprovantes, data_pagamento deve ser a data do comprovante mais recente/último pagamento visível. ' +
                'Exemplo: 3 comprovantes de R$ 64,00 devem retornar valores_comprovantes [64,64,64] e valor_pago 192. ' +
                'Mesmo que os comprovantes tenham o mesmo valor, repita o valor no array uma vez para cada comprovante. ' +
                'Use valor_pago_representa="total" quando valor_pago já for a soma, "unitario" quando for apenas o valor de um comprovante.\n' +
                'Para Pix, o identificador de duplicidade deve ser o EndToEndId/código E2E. Prioridade máxima para campos: Número de controle, Numero de controle, ID da transação, ID Pix, EndToEndId, E2E. ' +
                'Esses códigos normalmente começam com E seguido de muitos números/letras, exemplo: E60746948202605221731I1836nUjIRQ. ' +
                'Se houver "Identificador: YATI..." e também "Número de controle: E...", escolha SEMPRE o valor do Número de controle que começa com E. ' +
                'Preencha identificadores_encontrados com todos os códigos relevantes vistos, mas identificador_pagamento deve ser o código E quando existir.\n' +
                'Se houver dúvida entre favorecido, pagador e recebedor, lembre da REGRA PRINCIPAL: o proprietário é sempre a parte que NÃO é a Vipe. Escolha o nome não-Vipe e explique em evidencias.\n' +
                'Para o campo recebedor, use somente "VIPE TRANSPORTES MULTIMODAIS LTDA", "Augusto" ou null. Se aparecer Vipe/Vipi/VIPE Transportes no comprovante, normalize para "VIPE TRANSPORTES MULTIMODAIS LTDA". Não retorne variações.\n' +
                'Se a filial/local não estiver clara, use null.\n\n' +
                `Mensagem recebida:\n${texto || '(sem texto)'}`
        }
    ];

    for (const media of midias.slice(0, 4)) {
        if (media?.data && media?.mimetype?.startsWith('image/')) {
            conteudo.push({
                type: 'image_url',
                image_url: { url: `data:${media.mimetype};base64,${media.data}` }
            });
            continue;
        }
        if (!media?.previewUrl) continue;
        conteudo.push({
            type: 'image_url',
            image_url: { url: media.previewUrl }
        });
    }

    const resposta = await chamarOpenAI([
        {
            role: 'system',
            content:
                'Você é um assistente operacional da Vipe Transportes. ' +
                'Você lê comprovantes de pagamento e retorna dados estruturados para uma baixa, sem registrar nada.'
        },
        { role: 'user', content: conteudo }
    ]);

    return extrairJSON(resposta);
}

// ==============================
// ORGANIZAÇÃO DE TEXTO (OCR LOCAL) — SEM ENVIAR A IMAGEM
// ==============================
// Recebe o TEXTO já extraído localmente (Tesseract/PDF) + uma pré-extração de
// campos feita por regras locais, e pede para a IA apenas ORGANIZAR/VALIDAR em
// JSON estruturado. A imagem do comprovante NUNCA é enviada à IA aqui — ela só
// vai para a API/plataforma depois, no envio em lote.
async function organizarTextoComprovante({ texto = '', preExtraido = null, qtdComprovantes = 1 }) {
    const dataAtual = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
    const isCheque = Boolean(preExtraido && (preExtraido.is_cheque || preExtraido.tipo === 'cheque'));
    const dica = preExtraido ? JSON.stringify(preExtraido) : '(sem pré-extração)';

    const instrucao =
        'Você recebe o TEXTO de um ou mais comprovantes bancários, já extraído por OCR local ' +
        '(pode conter ruído/erros de leitura), e uma PRÉ-EXTRAÇÃO de campos feita por regras locais. ' +
        'Sua tarefa é apenas ORGANIZAR e VALIDAR esses dados em JSON — não invente o que não está no texto.\n' +
        'Extraia somente informações explicitamente presentes ou fortemente inferíveis do texto/pré-extração.\n' +
        'O objetivo principal é identificar o proprietário correto para a baixa.\n\n' +
        'Responda apenas JSON válido, sem markdown, neste formato:\n' +
        '{\n' +
        '  "local": "Matriz|Viana|null",\n' +
        '  "id_proprietario": "string|null",\n' +
        '  "nome_proprietario": "string|null",\n' +
        '  "nome_lido_comprovante": "string|null",\n' +
        '  "campo_nome_proprietario": "Empresa|Remetente|Beneficiário|Favorecido|Pagador|Emissor|Titular|outro|null",\n' +
        '  "valor_pago": 0.00,\n' +
        '  "valor_pago_texto": "string|null",\n' +
        '  "valor_pago_representa": "total|unitario|indefinido",\n' +
        '  "valores_comprovantes": [0.00],\n' +
        '  "data_pagamento": "YYYY-MM-DD|null",\n' +
        '  "forma_pagamento": "PIX|dinheiro|transferência|depósito|cheque|outro|null",\n' +
        '  "tipo_comprovante": "pix|transferencia|deposito|cheque|pagamento|desconhecido",\n' +
        '  "recebedor": "VIPE TRANSPORTES MULTIMODAIS LTDA|Augusto|null",\n' +
        '  "identificador_pagamento": "string|null",\n' +
        '  "identificadores_encontrados": ["string"],\n' +
        '  "cheque": {\n' +
        '    "valor_numerico": 0.00,\n' +
        '    "valor_extenso_texto": "string|null",\n' +
        '    "valor_extenso_numero": 0.00,\n' +
        '    "emissor": "string|null",\n' +
        '    "beneficiario": "string|null",\n' +
        '    "banco": "string|null",\n' +
        '    "numero_cheque": "string|null"\n' +
        '  },\n' +
        '  "confianca_proprietario": 0,\n' +
        '  "evidencias": "frase curta explicando de onde veio o proprietário"\n' +
        '}\n' +
        'Se NÃO for um cheque, deixe o objeto "cheque" com todos os campos null.\n\n' +
        `Data atual para referência: ${dataAtual}.\n` +
        'Não invente id_proprietario. Se não aparecer ID, deixe null.\n' +
        'REGRA PRINCIPAL DO PROPRIETÁRIO: a Vipe Transportes é SEMPRE uma das duas partes do comprovante (quem paga OU quem recebe). O proprietário é SEMPRE a OUTRA parte — nunca a Vipe. ' +
        'VIPE, VIPI, VIPE TRANSPORTES, VIPE TRANSP, o CNPJ 57.312.701/0001-83 ou qualquer variação contendo VIPE nunca é proprietário.\n' +
        'Para o campo recebedor, use somente "VIPE TRANSPORTES MULTIMODAIS LTDA", "Augusto" ou null. Se aparecer Vipe/Vipi/VIPE Transportes no texto, normalize para "VIPE TRANSPORTES MULTIMODAIS LTDA". Não retorne variações.\n' +
        'Para Pix/transferência/depósito: o proprietário é o nome do bloco OPOSTO ao da Vipe (Pagador x Beneficiário). ' +
        'Preencha nome_lido_comprovante com o texto exatamente lido e campo_nome_proprietario com o rótulo usado.\n' +
        (isCheque
            ? ('ESTE COMPROVANTE É UM CHEQUE. Regras do cheque:\n' +
               '- forma_pagamento="cheque" e tipo_comprovante="cheque".\n' +
               '- O EMISSOR (titular/empresa impressa no cheque, ex.: a razão social do correntista) e o BENEFICIÁRIO (a quem o cheque é nominal, após "pague a" / "à ordem de") são as duas partes. O proprietário é o que NÃO for a Vipe.\n' +
               '- Leia o VALOR de duas formas: o número no quadro R$ e o valor POR EXTENSO (ex.: "Dez Mil Reais"=10000.00, "Dois Mil e Quinhentos Reais"=2500.00). Se divergirem, PRIORIZE o valor por extenso. Preencha cheque.valor_numerico, cheque.valor_extenso_texto e cheque.valor_extenso_numero, e use o valor final em valor_pago.\n' +
               '- Preencha cheque.emissor, cheque.beneficiario, cheque.banco e cheque.numero_cheque a partir do texto/pré-extração.\n')
            : 'Para Pix, o identificador de duplicidade é o EndToEndId/código E2E (começa com E e muitos caracteres). Prefira "Número de controle"/"ID da transação".\n') +
        'Se houver mais de um comprovante no texto, preencha valores_comprovantes com o valor de cada um e valor_pago com a soma (valor_pago_representa="total"). ' +
        `Há aproximadamente ${qtdComprovantes} comprovante(s) neste lote.\n` +
        'Se o valor estiver ilegível/duvidoso no texto, deixe valor_pago null e explique em evidencias em vez de chutar.\n\n' +
        `PRÉ-EXTRAÇÃO local (use como forte indício, corrigindo ruído de OCR quando fizer sentido):\n${dica}\n\n` +
        `TEXTO extraído do(s) comprovante(s):\n${texto || '(sem texto)'}`;

    const resposta = await chamarOpenAI([
        {
            role: 'system',
            content:
                'Você é um assistente operacional da Vipe Transportes. ' +
                'Você organiza o texto de comprovantes (já extraído por OCR) em dados estruturados para uma baixa, sem registrar nada e sem inventar dados.'
        },
        { role: 'user', content: instrucao }
    ]);

    return extrairJSON(resposta);
}

// ==============================
// IDENTIFICADOR DE COMPROVANTE (LEITURA RÁPIDA)
// ==============================
// Lê APENAS o ID de controle / ID da transação de um comprovante (imagem ou texto),
// para verificação de duplicidade no envio em lote para a plataforma.
async function extrairIdentificadorComprovante({ texto = '', midia = null }) {
    const conteudo = [
        {
            type: 'text',
            text:
                'Leia o comprovante de pagamento e extraia SOMENTE os códigos identificadores da transação.\n' +
                'Responda apenas JSON válido, sem markdown, neste formato:\n' +
                '{\n' +
                '  "identificador_pagamento": "string|null",\n' +
                '  "identificadores_encontrados": ["string"]\n' +
                '}\n\n' +
                'REGRA ESTRITA: extraia o identificador APENAS dos campos rotulados "ID da Transação" ou "Autenticação" (ex.: "ID da transação:", "Código de autenticação:"). ' +
                'NÃO use nenhum outro campo — ignore "Número de controle", "Identificador", "Protocolo", "ID Pix", "EndToEndId", "E2E" ou qualquer outro rótulo. ' +
                'Se houver os dois campos, identificador_pagamento deve ser o valor de "ID da Transação" e identificadores_encontrados deve conter os dois. ' +
                'Não invente códigos: se os campos "ID da Transação" e "Autenticação" não estiverem visíveis, retorne null.\n\n' +
                `Texto recebido:\n${texto || '(sem texto)'}`
        }
    ];

    if (midia?.data && midia?.mimetype?.startsWith('image/')) {
        conteudo.push({
            type: 'image_url',
            image_url: { url: `data:${midia.mimetype};base64,${midia.data}` }
        });
    } else if (midia?.previewUrl && midia.format !== 'pdf' && midia.resource_type !== 'raw' && midia.resource_type !== 'document') {
        conteudo.push({
            type: 'image_url',
            image_url: { url: midia.previewUrl }
        });
    }

    const resposta = await chamarOpenAI([
        {
            role: 'system',
            content:
                'Você é um assistente operacional da Vipe Transportes. ' +
                'Você lê comprovantes de pagamento e retorna apenas os códigos identificadores da transação.'
        },
        { role: 'user', content: conteudo }
    ]);

    return extrairJSON(resposta);
}

// ==============================
// BOAS-VINDAS
// ==============================
async function gerarBoasVindas() {
    const { system_prompt } = cfg();
    return chamarOpenAI([
        { role: 'system', content: system_prompt },
        { role: 'user'  , content:
            'Crie uma saudação curta e amigável de boas-vindas para um motorista que entrou no atendimento da Vipe Transportes. ' +
            'Máximo 2 linhas. Não mencione as opções do menu.' }
    ]);
}

// ==============================
// SALDO CIOT
// ==============================
async function gerarRespostaCIOT(dados) {
    const { system_prompt } = cfg();

    if (!dados.encontrado) {
        return chamarOpenAI([
            { role: 'system', content: system_prompt },
            { role: 'user'  , content:
                `CPF/nome consultado: ${dados.cpf || dados.nome}. Nenhum contrato encontrado nos últimos 30 dias. ` +
                'Informe isso de forma amigável, mencione os "últimos 30 dias" e sugira verificar os dados.' }
        ]);
    }

    const d  = dados;
    const br = v => `R$ ${Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;

    let resposta =
        `👤 *${d.nome}*\n` +
        `🪪 CPF: \`${formatarCPF(d.cpf)}\`\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `📊 *RESUMO — últimos 30 dias*\n` +
        `• Total de contratos:  *${d.total_contratos}*\n` +
        `• Pagos:               *${d.total_pagos}*\n` +
        `• Pendentes:           *${d.total_pendentes}*\n` +
        `• Total contratado:    *${br(d.valor_total_contratado)}*\n` +
        `• Total pago:          *${br(d.valor_total_pago)}*\n` +
        `• 🔴 Saldo em aberto:  *${br(d.valor_total_pendente)}*\n` +
        `━━━━━━━━━━━━━━━━━━━━\n`;

    if (d.pendentes && d.pendentes.length > 0) {
        resposta += `⏳ *CONTRATOS PENDENTES*\n`;
        for (const [idx, c] of d.pendentes.entries()) {
            if (idx > 0) resposta += `\n─────────────────────\n`;
            resposta +=
                `📋 Contrato *${c.contrato}*\n` +
                `   Filial:      ${c.filial || '-'}\n` +
                `   Emissão:     ${c.emissao || '-'}\n` +
                `   Rota:        ${c.rota || '-'}\n` +
                `   Manifesto:   ${c.manifesto || '-'}\n` +
                `   Motorista:   ${c.nome_motorista || '-'}\n` +
                `   Proprietário:${c.nome_proprietario || '-'}\n` +
                `   Contratado:  ${br(c.vlr_contratado)}\n` +
                `   Adiantado:   ${br(c.adiantamento)}\n` +
                `   💰 Líquido:  *${br(c.vlr_liquido)}*\n`;
        }
    }

    if (d.pagos && d.pagos.length > 0) {
        resposta += `\n✅ *CONTRATOS PAGOS*\n`;
        for (const [idx, c] of d.pagos.entries()) {
            if (idx > 0) resposta += `\n─────────────────────\n`;
            resposta +=
                `📋 Contrato *${c.contrato}* — RPA ${c.nr_rpa}\n` +
                `   💳 Pago em:   *${c.data_rpa || '-'}*\n` +
                `   Rota:        ${c.rota || '-'}\n` +
                `   Motorista:   ${c.nome_motorista || '-'}\n` +
                `   Proprietário:${c.nome_proprietario || '-'}\n` +
                `   💰 Líquido:  *${br(c.vlr_liquido)}*\n`;
        }
    }

    resposta +=
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `Digite outro *CPF* para nova consulta\nou *menu* para voltar ao início.`;

    return resposta;
}

// ==============================
// MULTAS
// ==============================
async function gerarRespostaMultas(dados) {
    const { system_prompt } = cfg();

    if (!dados.encontrado) {
        return chamarOpenAI([
            { role: 'system', content: system_prompt },
            { role: 'user'  , content:
                `CPF/nome consultado: ${dados.cpf || dados.nome}. Nenhuma multa em aberto encontrada nos últimos 30 dias. ` +
                'Escreva uma mensagem curta comemorando que está limpo, mencionando "últimos 30 dias".' }
        ]);
    }

    const d  = dados;
    const br = v => `R$ ${Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;

    let resposta =
        `🚨 *MULTAS EM ABERTO*\n\n` +
        `👤 *${d.nome}*\n` +
        `🪪 CPF: \`${formatarCPF(d.cpf)}\`\n\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `📊 *RESUMO — últimos 30 dias*\n` +
        `• Total de multas:   *${d.total_multas}*\n` +
        `• Vencidas:          *${d.total_vencidas}*  ⚠️\n` +
        `• A vencer:          *${d.total_a_vencer}*\n` +
        `• Valor das multas:  *${br(d.valor_multas)}*\n` +
        `• Valor das NICs:    *${br(d.valor_nics)}*\n` +
        `• 💰 Total geral:    *${br(d.valor_total)}*\n` +
        `━━━━━━━━━━━━━━━━━━━━\n`;

    const vencidas = d.multas.filter(m => m.vencida);
    const avencer  = d.multas.filter(m => !m.vencida);

    if (vencidas.length > 0) {
        resposta += `\n⚠️ *VENCIDAS*\n\n`;
        for (const [i, m] of vencidas.entries()) resposta += _linhaMulta(i + 1, m, br);
    }
    if (avencer.length > 0) {
        resposta += `\n📅 *A VENCER*\n\n`;
        for (const [i, m] of avencer.entries()) resposta += _linhaMulta(i + 1, m, br);
    }

    resposta +=
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `Digite outro *CPF* para nova consulta\nou *menu* para voltar ao início.`;

    return resposta;
}

function _linhaMulta(i, m, br) {
    let linha =
        `🚗 *Multa ${i} — AIT ${m.ait}*\n` +
        `   Nº Processo:  ${m.numero_ifr || '-'}\n` +
        `   Veículo:      ${m.veiculo || '-'}\n` +
        `   Infração:     ${m.descricao || '-'}\n` +
        `   Data:         ${m.data_infracao || '-'}\n` +
        `   Local:        ${m.endereco || '-'}\n` +
        `   Cidade:       ${m.cidade || '-'}\n` +
        `   Multa:        ${br(m.vlr_multa)}`;
    if (m.vlr_nic > 0) linha += `\n   NIC:          ${br(m.vlr_nic)}`;
    linha +=
        `\n   💰 Total:     *${br(m.vlr_total)}*\n` +
        `   Vencimento:   ${m.vencida ? '⚠️ ' : ''}${m.vencimento}${m.vencida ? ' (VENCIDA)' : ''}\n\n`;
    return linha;
}

// ==============================
// ERRO / ENCERRAMENTO
// ==============================
async function gerarMensagemErro(contexto) {
    const { system_prompt } = cfg();
    return chamarOpenAI([
        { role: 'system', content: system_prompt },
        { role: 'user'  , content:
            `Ocorreu um erro ao processar: ${contexto}. ` +
            'Escreva uma mensagem curta pedindo desculpas e orientando a tentar novamente ou digitar "menu".' }
    ]);
}

async function gerarMensagemEncerramento(motivo) {
    const { system_prompt } = cfg();
    const ctx = motivo === 'timeout'
        ? 'O atendimento foi encerrado automaticamente por 5 minutos de inatividade.'
        : 'O usuário escolheu encerrar o atendimento.';
    return chamarOpenAI([
        { role: 'system', content: system_prompt },
        { role: 'user'  , content:
            `${ctx} Escreva uma despedida curta e amigável, dizendo que estaremos disponíveis quando precisar.` }
    ]);
}

// ==============================
// HELPER CPF
// ==============================
function formatarCPF(cpf) {
    const d = String(cpf).replace(/\D/g, '');
    if (d.length === 11) return `${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6,9)}-${d.slice(9)}`;
    return cpf;
}

module.exports = {
    chamarOpenAI,
    chamarOpenAISimples,
    analisarBaixaAutomatica,
    organizarTextoComprovante,
    extrairIdentificadorComprovante,
    gerarBoasVindas,
    gerarRespostaCIOT,
    gerarRespostaMultas,
    gerarMensagemErro,
    gerarMensagemEncerramento,
};
