import 'package:flutter/material.dart';

import '../core/api_client.dart';
import '../core/app_state.dart';
import '../core/constants.dart';
import '../core/date_utils.dart';
import '../widgets/common.dart';

class PingoScreen extends StatefulWidget {
  const PingoScreen({super.key});

  @override
  State<PingoScreen> createState() => _PingoScreenState();
}

class _PingoScreenState extends State<PingoScreen> {
  final _perguntaCtrl = TextEditingController();
  final _proprietarioCtrl = TextEditingController();
  final _motoristaCtrl = TextEditingController();
  final _placaCtrl = TextEditingController();
  final _scrollCtrl = ScrollController();

  final List<_PingoMessage> _messages = [];
  List<String> _proprietarios = [];
  List<String> _motoristas = [];
  List<String> _placas = [];
  String _inicio = '';
  String _fim = '';
  String _situacao = 'todos';
  String _contexto = '';
  bool _asking = false;
  bool _loadingOptions = false;
  bool _showFilters = false;

  static const _sugestoes = [
    'Verifique possíveis duplicidades por placa e quantidade',
    'Faça uma auditoria e mostre as principais inconsistências',
    'Quais placas abasteceram novamente em menos de 60 minutos?',
    'Existem preços por litro fora do padrão?',
    'Encontre odômetros menores que o registro anterior',
    'Compare este período com o período anterior',
    'Projete o gasto e os litros até o fim do mês',
    'Quem teve mais abastecimentos neste período?',
  ];

  bool get _isAdmin => Roles.isAdmin(AppState.instance.auth.tipo);
  String get _filial => AppState.instance.auth.filialAtual ?? 'Matriz';

  @override
  void initState() {
    super.initState();
    if (_isAdmin) _loadOptions();
  }

  @override
  void dispose() {
    _perguntaCtrl.dispose();
    _proprietarioCtrl.dispose();
    _motoristaCtrl.dispose();
    _placaCtrl.dispose();
    _scrollCtrl.dispose();
    super.dispose();
  }

  Future<void> _loadOptions() async {
    setState(() => _loadingOptions = true);
    try {
      final result = await AppState.instance.api
          .get('/pingo/opcoes', query: {'local': _filial});
      if (!mounted || result is! Map) return;
      setState(() {
        _proprietarios = _strings(result['proprietarios']);
        _motoristas = _strings(result['motoristas']);
        _placas = _strings(result['placas']);
      });
    } catch (_) {
      // Os campos continuam aceitando texto mesmo sem as sugestões.
    } finally {
      if (mounted) setState(() => _loadingOptions = false);
    }
  }

  List<String> _strings(dynamic value) => value is List
      ? value
          .map((item) => item.toString())
          .where((item) => item.isNotEmpty)
          .toList()
      : [];

  Future<void> _ask([String? suggestion]) async {
    final text = (suggestion ?? _perguntaCtrl.text).trim();
    if (text.length < 3 || _asking || !_isAdmin) return;

    final history = _messages
        .skip(_messages.length > 6 ? _messages.length - 6 : 0)
        .map((message) => {
              'role': message.pingo ? 'assistant' : 'user',
              'text': message.text.length > 1500
                  ? message.text.substring(0, 1500)
                  : message.text,
            })
        .toList();

    setState(() {
      _messages.add(_PingoMessage(text: text, pingo: false));
      _perguntaCtrl.clear();
      _asking = true;
    });
    _scrollToEnd();

    try {
      final result = await AppState.instance.api.post('/pingo/perguntar', {
        'pergunta': text,
        'local': _filial,
        'data_inicio': _inicio.isEmpty ? null : _inicio,
        'data_fim': _fim.isEmpty ? null : _fim,
        'situacao': _situacao,
        'proprietario': _emptyToNull(_proprietarioCtrl.text),
        'motorista': _emptyToNull(_motoristaCtrl.text),
        'placa': _emptyToNull(_placaCtrl.text.toUpperCase()),
        'historico': history,
      });
      if (!mounted) return;
      final response = result is Map
          ? (result['resposta'] ?? 'Não encontrei uma resposta.').toString()
          : 'Não encontrei uma resposta.';
      final context = result is Map && result['contexto'] is Map
          ? Map<String, dynamic>.from(result['contexto'] as Map)
          : <String, dynamic>{};
      final entity = context['entidade_ativa'] is Map
          ? Map<String, dynamic>.from(context['entidade_ativa'] as Map)
          : <String, dynamic>{};
      final capabilities =
          _strings(context['capacidades_usadas']).map(_capabilityName).toList();
      setState(() {
        _messages.add(_PingoMessage(
          text: response,
          pingo: true,
          scope: _scope(),
        ));
        _contexto = [
          if (entity.isNotEmpty)
            '${entity['tipo'] ?? 'Entidade'}: ${entity['nome'] ?? ''}',
          ...capabilities,
        ].where((item) => item.trim().isNotEmpty).join(' · ');
      });
    } on ApiException catch (error) {
      if (!mounted) return;
      setState(() => _messages.add(_PingoMessage(
            text: error.message,
            pingo: true,
          )));
    } catch (_) {
      if (!mounted) return;
      setState(() => _messages.add(const _PingoMessage(
            text: 'Não consegui consultar a base agora. Tente novamente.',
            pingo: true,
          )));
    } finally {
      if (mounted) {
        setState(() => _asking = false);
        _scrollToEnd();
      }
    }
  }

  String? _emptyToNull(String value) {
    final result = value.trim();
    return result.isEmpty ? null : result;
  }

  String _capabilityName(String value) =>
      const {
        'duplicidades': 'Duplicidades',
        'auditoria': 'Auditoria',
        'comparacao_temporal': 'Comparação temporal',
        'projecao': 'Projeção',
        'detalhe_entidade': 'Detalhamento',
      }[value] ??
      value;

  String _scope() => [
        _filial,
        if (_inicio.isNotEmpty) 'de $_inicio',
        if (_fim.isNotEmpty) 'até $_fim',
        _emptyToNull(_proprietarioCtrl.text),
        _emptyToNull(_motoristaCtrl.text),
        _emptyToNull(_placaCtrl.text),
        if (_situacao != 'todos') _situacao,
      ].whereType<String>().join(' · ');

  void _scrollToEnd() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!_scrollCtrl.hasClients) return;
      _scrollCtrl.animateTo(
        _scrollCtrl.position.maxScrollExtent,
        duration: const Duration(milliseconds: 220),
        curve: Curves.easeOut,
      );
    });
  }

  void _newConversation() {
    setState(() {
      _messages.clear();
      _contexto = '';
      _perguntaCtrl.clear();
    });
  }

  void _clearFilters() {
    setState(() {
      _inicio = '';
      _fim = '';
      _situacao = 'todos';
      _proprietarioCtrl.clear();
      _motoristaCtrl.clear();
      _placaCtrl.clear();
    });
  }

  @override
  Widget build(BuildContext context) {
    if (!_isAdmin) {
      return const Center(
        child: Text('O Pingo está disponível somente para administradores.'),
      );
    }

    return Column(
      children: [
        _header(),
        if (_showFilters) _filters(),
        if (_contexto.isNotEmpty)
          Container(
            width: double.infinity,
            margin: const EdgeInsets.fromLTRB(12, 4, 12, 0),
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
            decoration: BoxDecoration(
              color: const Color(0xFFEAF3FF),
              borderRadius: BorderRadius.circular(10),
            ),
            child: Row(children: [
              Expanded(
                  child: Text('Contexto: $_contexto',
                      style: const TextStyle(fontSize: 12))),
              TextButton(
                  onPressed: _newConversation,
                  child: const Text('Nova conversa')),
            ]),
          ),
        Expanded(child: _conversation()),
        _composer(),
      ],
    );
  }

  Widget _header() => Container(
        margin: const EdgeInsets.fromLTRB(12, 12, 12, 4),
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: Theme.of(context).cardColor,
          borderRadius: BorderRadius.circular(16),
        ),
        child: Row(children: [
          Container(
            width: 48,
            height: 48,
            decoration: BoxDecoration(
              gradient: const LinearGradient(
                  colors: [Color(0xFF2563EB), Color(0xFF14B8A6)]),
              borderRadius: BorderRadius.circular(14),
            ),
            child: const Center(
                child: Text('P',
                    style: TextStyle(
                        color: Colors.white,
                        fontSize: 22,
                        fontWeight: FontWeight.w900))),
          ),
          const SizedBox(width: 12),
          const Expanded(
              child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                Text('Olá, eu sou o Pingo.',
                    style:
                        TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
                Text('Pergunte sobre a base da filial selecionada.',
                    style: TextStyle(fontSize: 12, color: AppTheme.textMuted)),
              ])),
          Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
            const Text('FILIAL',
                style: TextStyle(fontSize: 9, color: AppTheme.textMuted)),
            Text(_filial, style: const TextStyle(fontWeight: FontWeight.w800)),
          ]),
          IconButton(
            tooltip: 'Filtros',
            onPressed: () => setState(() => _showFilters = !_showFilters),
            icon: Icon(_showFilters ? Icons.filter_alt_off : Icons.tune),
          ),
        ]),
      );

  Widget _filters() => Card(
        margin: const EdgeInsets.fromLTRB(12, 4, 12, 4),
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Column(children: [
            Row(children: [
              Expanded(
                  child: _dateButton('De', _inicio,
                      (value) => setState(() => _inicio = value))),
              const SizedBox(width: 8),
              Expanded(
                  child: _dateButton(
                      'Até', _fim, (value) => setState(() => _fim = value))),
            ]),
            const SizedBox(height: 8),
            DropdownButtonFormField<String>(
              initialValue: _situacao,
              decoration: const InputDecoration(labelText: 'Situação'),
              items: const [
                DropdownMenuItem(value: 'todos', child: Text('Todos')),
                DropdownMenuItem(value: 'pendente', child: Text('Pendente')),
                DropdownMenuItem(value: 'pago', child: Text('Pago')),
              ],
              onChanged: (value) =>
                  setState(() => _situacao = value ?? 'todos'),
            ),
            const SizedBox(height: 8),
            _autocomplete('Proprietário', _proprietarioCtrl, _proprietarios),
            const SizedBox(height: 8),
            _autocomplete('Motorista', _motoristaCtrl, _motoristas),
            const SizedBox(height: 8),
            _autocomplete('Placa', _placaCtrl, _placas),
            Align(
              alignment: Alignment.centerRight,
              child: TextButton.icon(
                onPressed: _clearFilters,
                icon: const Icon(Icons.filter_alt_off),
                label: const Text('Limpar filtros'),
              ),
            ),
          ]),
        ),
      );

  Widget _dateButton(
          String label, String value, ValueChanged<String> changed) =>
      OutlinedButton.icon(
        onPressed: () async {
          final selected = await pickDateIso(context, initialIso: value);
          if (selected != null) changed(selected);
        },
        icon: const Icon(Icons.event_outlined),
        label: Text(value.isEmpty ? label : AppDates.formatDateBr(value)),
      );

  Widget _autocomplete(String label, TextEditingController controller,
          List<String> options) =>
      Autocomplete<String>(
        optionsBuilder: (value) {
          final query = value.text.trim().toLowerCase();
          if (query.isEmpty) return options.take(40);
          return options
              .where((item) => item.toLowerCase().contains(query))
              .take(40);
        },
        onSelected: (value) => controller.text = value,
        fieldViewBuilder: (context, fieldController, focus, submit) {
          if (fieldController.text != controller.text) {
            fieldController.text = controller.text;
          }
          return TextField(
            controller: fieldController,
            focusNode: focus,
            textCapitalization: label == 'Placa'
                ? TextCapitalization.characters
                : TextCapitalization.words,
            decoration: InputDecoration(
              labelText: label,
              suffixIcon: _loadingOptions
                  ? const Padding(
                      padding: EdgeInsets.all(14),
                      child: CircularProgressIndicator(strokeWidth: 2))
                  : null,
            ),
            onChanged: (value) => controller.text = value,
          );
        },
      );

  Widget _conversation() {
    if (_messages.isEmpty && !_asking) {
      return ListView(
        padding: const EdgeInsets.all(12),
        children: [
          const Padding(
            padding: EdgeInsets.symmetric(vertical: 14),
            child: Text('Sugestões de perguntas',
                style: TextStyle(fontWeight: FontWeight.w800)),
          ),
          ..._sugestoes.map((question) => Card(
                child: ListTile(
                  title: Text(question),
                  trailing: const Icon(Icons.arrow_forward_ios, size: 14),
                  onTap: () => _ask(question),
                ),
              )),
        ],
      );
    }
    return ListView.builder(
      controller: _scrollCtrl,
      padding: const EdgeInsets.all(12),
      itemCount: _messages.length + (_asking ? 1 : 0),
      itemBuilder: (context, index) {
        if (index == _messages.length) {
          return const _PingoBubble(
              message: _PingoMessage(
                  text: 'Analisando a base filtrada…', pingo: true),
              loading: true);
        }
        return _PingoBubble(message: _messages[index]);
      },
    );
  }

  Widget _composer() => SafeArea(
        top: false,
        child: Container(
          margin: const EdgeInsets.fromLTRB(12, 4, 12, 10),
          padding: const EdgeInsets.fromLTRB(12, 4, 4, 4),
          decoration: BoxDecoration(
            color: Theme.of(context).cardColor,
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: Theme.of(context).dividerColor),
          ),
          child: Row(children: [
            Expanded(
                child: TextField(
              controller: _perguntaCtrl,
              enabled: !_asking,
              maxLength: 1000,
              minLines: 1,
              maxLines: 4,
              textInputAction: TextInputAction.send,
              onSubmitted: (_) => _ask(),
              decoration: const InputDecoration(
                counterText: '',
                border: InputBorder.none,
                hintText: 'Pergunte ao Pingo…',
              ),
            )),
            IconButton.filled(
              tooltip: 'Enviar',
              onPressed: _asking ? null : () => _ask(),
              icon: _asking
                  ? const SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(strokeWidth: 2))
                  : const Icon(Icons.send_rounded),
            ),
          ]),
        ),
      );
}

class _PingoMessage {
  final String text;
  final bool pingo;
  final String? scope;

  const _PingoMessage({required this.text, required this.pingo, this.scope});
}

class _PingoBubble extends StatelessWidget {
  final _PingoMessage message;
  final bool loading;

  const _PingoBubble({required this.message, this.loading = false});

  @override
  Widget build(BuildContext context) => Align(
        alignment: message.pingo ? Alignment.centerLeft : Alignment.centerRight,
        child: Container(
          constraints: const BoxConstraints(maxWidth: 540),
          margin: const EdgeInsets.symmetric(vertical: 5),
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color:
                message.pingo ? Theme.of(context).cardColor : AppTheme.primary,
            borderRadius: BorderRadius.circular(15),
            border: message.pingo
                ? Border.all(color: Theme.of(context).dividerColor)
                : null,
          ),
          child:
              Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(message.pingo ? 'Pingo' : 'Você',
                style: TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.w800,
                    color: message.pingo ? AppTheme.success : Colors.white70)),
            const SizedBox(height: 4),
            if (loading)
              const LinearProgressIndicator()
            else
              SelectableText(message.text,
                  style: TextStyle(
                      height: 1.45,
                      color: message.pingo ? null : Colors.white)),
            if (message.scope?.isNotEmpty == true) ...[
              const SizedBox(height: 7),
              Text(message.scope!,
                  style:
                      const TextStyle(fontSize: 10, color: AppTheme.textMuted)),
            ],
          ]),
        ),
      );
}
