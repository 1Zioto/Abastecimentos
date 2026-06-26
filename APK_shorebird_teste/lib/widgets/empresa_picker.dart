import 'package:flutter/material.dart';

import '../core/constants.dart';
import '../core/models.dart';

/// Campo "Empresa / Proprietario" com modal de busca por digitacao.
///
/// Substitui DropdownButtonFormField em telas onde a lista pode ser grande.
/// Em modos de filtro use [allowNull] = true para permitir "Todas".
class EmpresaPickerField extends StatelessWidget {
  final List<Proprietario> proprietarios;
  final String? value;
  final ValueChanged<String?> onChanged;

  /// Texto exibido no rotulo do campo.
  final String label;

  /// Permite o estado "nenhuma selecionada" (uso em filtros).
  final bool allowNull;

  /// Texto exibido quando [allowNull] esta ativo e [value] esta vazio.
  final String nullLabel;

  /// Tooltip exibido no estado vazio (ex.: "Selecione uma empresa").
  final String hint;

  /// Habilita/desabilita o campo (campo continua tappavel mas nao abre).
  final bool enabled;

  const EmpresaPickerField({
    super.key,
    required this.proprietarios,
    required this.value,
    required this.onChanged,
    this.label = 'Empresa',
    this.allowNull = false,
    this.nullLabel = 'Todas',
    this.hint = 'Selecionar empresa',
    this.enabled = true,
  });

  String? get _selectedName {
    if (value == null) return null;
    final hit = proprietarios.where((p) => p.idProprietario == value);
    if (hit.isEmpty) return null;
    return hit.first.nome;
  }

  Future<void> _open(BuildContext context) async {
    if (!enabled) return;
    final escolhido = await showEmpresaPicker(
      context,
      proprietarios: proprietarios,
      selecionado: value,
      allowNull: allowNull,
      nullLabel: nullLabel,
      titulo: label,
    );
    if (escolhido == null) return;
    // Quando allowNull, retornamos um wrapper para distinguir "limpar" (id == -1)
    // de "cancelar" (resultado null do showModalBottomSheet).
    if (escolhido.cleared) {
      onChanged(null);
    } else {
      onChanged(escolhido.idProprietario);
    }
  }

  @override
  Widget build(BuildContext context) {
    final selectedName = _selectedName;
    final showsClear = allowNull && value != null;

    return InkWell(
      onTap: enabled ? () => _open(context) : null,
      borderRadius: BorderRadius.circular(8),
      child: InputDecorator(
        decoration: InputDecoration(
          labelText: label,
          prefixIcon: const Icon(Icons.business_outlined),
          suffixIcon: showsClear
              ? IconButton(
                  tooltip: 'Limpar',
                  icon: const Icon(Icons.close, size: 18),
                  onPressed: enabled ? () => onChanged(null) : null,
                )
              : const Icon(Icons.search),
        ),
        child: Text(
          selectedName ?? (allowNull ? nullLabel : hint),
          style: TextStyle(
            color: selectedName == null ? AppTheme.textMuted : null,
          ),
          overflow: TextOverflow.ellipsis,
        ),
      ),
    );
  }
}

/// Resultado retornado pelo modal de selecao de empresa.
///
/// Quando [cleared] for true, significa que o usuario clicou em "Todas"
/// (apenas com [allowNull]), o que deve resultar em [onChanged] com null.
class EmpresaPickerResult {
  final String? idProprietario;
  final String? nome;
  final bool cleared;

  const EmpresaPickerResult({
    required this.idProprietario,
    required this.nome,
    this.cleared = false,
  });

  factory EmpresaPickerResult.cleared() => const EmpresaPickerResult(
      idProprietario: null, nome: null, cleared: true);

  factory EmpresaPickerResult.fromProprietario(Proprietario p) =>
      EmpresaPickerResult(idProprietario: p.idProprietario, nome: p.nome);
}

/// Abre o modal de busca por digitacao e retorna a empresa escolhida.
///
/// Retorna null se o usuario fechar o modal sem selecionar nada.
Future<EmpresaPickerResult?> showEmpresaPicker(
  BuildContext context, {
  required List<Proprietario> proprietarios,
  String? selecionado,
  bool allowNull = false,
  String nullLabel = 'Todas',
  String titulo = 'Selecionar empresa',
}) {
  return showModalBottomSheet<EmpresaPickerResult>(
    context: context,
    isScrollControlled: true,
    backgroundColor: AppTheme.surface,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(18)),
    ),
    builder: (ctx) {
      final buscaCtrl = TextEditingController();
      return StatefulBuilder(
        builder: (context, setModalState) {
          final termo = buscaCtrl.text.trim().toLowerCase();
          final filtrados = proprietarios.where((p) {
            if (termo.isEmpty) return true;
            final nome = p.nome.toLowerCase();
            final cel = (p.celular ?? '').toLowerCase();
            return nome.contains(termo) || cel.contains(termo);
          }).toList()
            ..sort(
                (a, b) => a.nome.toLowerCase().compareTo(b.nome.toLowerCase()));

          return Padding(
            padding: EdgeInsets.only(
              left: 12,
              right: 12,
              top: 12,
              bottom: MediaQuery.of(ctx).viewInsets.bottom + 12,
            ),
            child: SizedBox(
              height: MediaQuery.of(ctx).size.height * 0.72,
              child: Column(
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          titulo,
                          style: const TextStyle(
                            fontSize: 16,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ),
                      IconButton(
                        tooltip: 'Fechar',
                        icon: const Icon(Icons.close),
                        onPressed: () => Navigator.of(ctx).pop(),
                      ),
                    ],
                  ),
                  const SizedBox(height: 8),
                  TextField(
                    controller: buscaCtrl,
                    autofocus: true,
                    textInputAction: TextInputAction.search,
                    decoration: const InputDecoration(
                      labelText: 'Digite para filtrar',
                      hintText: 'Nome ou celular',
                      prefixIcon: Icon(Icons.search),
                    ),
                    onChanged: (_) => setModalState(() {}),
                  ),
                  const SizedBox(height: 10),
                  if (allowNull)
                    Align(
                      alignment: Alignment.centerLeft,
                      child: TextButton.icon(
                        onPressed: () => Navigator.of(ctx)
                            .pop(EmpresaPickerResult.cleared()),
                        icon: const Icon(Icons.layers_clear_outlined),
                        label: Text(nullLabel),
                      ),
                    ),
                  Expanded(
                    child: filtrados.isEmpty
                        ? const Center(
                            child: Text('Nenhuma empresa encontrada'),
                          )
                        : ListView.separated(
                            itemCount: filtrados.length,
                            separatorBuilder: (_, __) =>
                                const Divider(height: 1),
                            itemBuilder: (_, i) {
                              final p = filtrados[i];
                              final bloqueado =
                                  p.status.trim().toUpperCase() == 'BLOQUEADO';
                              return ListTile(
                                dense: true,
                                title: Text(
                                  '${p.nome}${bloqueado ? ' (bloqueado)' : ''}',
                                  style: TextStyle(
                                    color: bloqueado ? AppTheme.danger : null,
                                    fontWeight:
                                        bloqueado ? FontWeight.w700 : null,
                                  ),
                                ),
                                subtitle: p.celular == null ||
                                        p.celular!.trim().isEmpty
                                    ? null
                                    : Text(p.celular!),
                                trailing: selecionado == p.idProprietario
                                    ? const Icon(
                                        Icons.check_circle,
                                        color: AppTheme.success,
                                      )
                                    : null,
                                onTap: () => Navigator.of(ctx).pop(
                                    EmpresaPickerResult.fromProprietario(p)),
                              );
                            },
                          ),
                  ),
                ],
              ),
            ),
          );
        },
      );
    },
  );
}
