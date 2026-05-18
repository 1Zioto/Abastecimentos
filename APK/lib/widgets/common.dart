import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:intl/intl.dart';

import '../core/constants.dart';

/// Widgets reutilizaveis em toda a aplicacao.

class KpiCard extends StatelessWidget {
  final String titulo;
  final String valor;
  final IconData icone;
  final Color? cor;

  const KpiCard({
    super.key,
    required this.titulo,
    required this.valor,
    required this.icone,
    this.cor,
  });

  @override
  Widget build(BuildContext context) {
    final c = cor ?? AppTheme.primary;
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Row(
          children: [
            Container(
              width: 44,
              height: 44,
              decoration: BoxDecoration(
                color: c.withOpacity(0.18),
                borderRadius: BorderRadius.circular(10),
              ),
              child: Icon(icone, color: c, size: 22),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(titulo,
                      style: const TextStyle(
                        color: AppTheme.textMuted,
                        fontSize: 12,
                      )),
                  const SizedBox(height: 2),
                  Text(valor,
                      style: const TextStyle(
                        fontSize: 18,
                        fontWeight: FontWeight.w700,
                      )),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class StatusChip extends StatelessWidget {
  final String? status;
  const StatusChip({super.key, required this.status});

  @override
  Widget build(BuildContext context) {
    final s = status ?? 'Pendente';
    Color bg;
    Color fg = Colors.white;
    switch (s) {
      case 'Pago':
        bg = AppTheme.success;
        break;
      case 'Confirmado':
        bg = AppTheme.primary;
        break;
      case 'Cancelado':
        bg = AppTheme.danger;
        break;
      default:
        bg = AppTheme.warning;
        fg = Colors.black87;
    }
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: bg.withOpacity(0.2),
        border: Border.all(color: bg),
        borderRadius: BorderRadius.circular(30),
      ),
      child: Text(
        s,
        style: TextStyle(color: fg, fontSize: 11, fontWeight: FontWeight.w600),
      ),
    );
  }
}

class EmptyState extends StatelessWidget {
  final IconData icone;
  final String titulo;
  final String? mensagem;
  final Widget? acao;

  const EmptyState({
    super.key,
    this.icone = Icons.inbox_outlined,
    required this.titulo,
    this.mensagem,
    this.acao,
  });

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icone, size: 56, color: AppTheme.textMuted),
            const SizedBox(height: 14),
            Text(titulo,
                textAlign: TextAlign.center,
                style: const TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.w600,
                )),
            if (mensagem != null) ...[
              const SizedBox(height: 8),
              Text(mensagem!,
                  textAlign: TextAlign.center,
                  style: const TextStyle(color: AppTheme.textMuted)),
            ],
            if (acao != null) ...[
              const SizedBox(height: 16),
              acao!,
            ],
          ],
        ),
      ),
    );
  }
}

class SectionHeader extends StatelessWidget {
  final String texto;
  final Widget? trailing;
  const SectionHeader({super.key, required this.texto, this.trailing});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(4, 14, 4, 6),
      child: Row(
        children: [
          Expanded(
            child: Text(
              texto.toUpperCase(),
              style: const TextStyle(
                color: AppTheme.textMuted,
                fontSize: 12,
                letterSpacing: 1.2,
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
          if (trailing != null) trailing!,
        ],
      ),
    );
  }
}

class LoadingOverlay extends StatelessWidget {
  final bool show;
  final String? message;
  final Widget child;
  const LoadingOverlay({
    super.key,
    required this.show,
    required this.child,
    this.message,
  });

  @override
  Widget build(BuildContext context) {
    return Stack(
      children: [
        child,
        if (show)
          Container(
            color: Colors.black.withOpacity(0.55),
            child: Center(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const CircularProgressIndicator(),
                  if (message != null) ...[
                    const SizedBox(height: 14),
                    Text(message!,
                        style: const TextStyle(color: Colors.white)),
                  ],
                ],
              ),
            ),
          ),
      ],
    );
  }
}

/// Mostra um seletor de data (pt-BR) e retorna string ISO yyyy-MM-dd.
Future<String?> pickDateIso(BuildContext context,
    {String? initialIso}) async {
  DateTime initial = DateTime.now();
  if (initialIso != null && initialIso.isNotEmpty) {
    try {
      initial = DateTime.parse(initialIso);
    } catch (_) {}
  }
  final picked = await showDatePicker(
    context: context,
    initialDate: initial,
    firstDate: DateTime(2000),
    lastDate: DateTime(2100),
    locale: const Locale('pt', 'BR'),
  );
  if (picked == null) return null;
  return DateFormat('yyyy-MM-dd').format(picked);
}

/// TextField para numero decimal (aceita virgula ou ponto).
class DecimalField extends StatelessWidget {
  final TextEditingController controller;
  final String label;
  final String? hint;
  final String? suffix;
  final void Function(String)? onChanged;
  final bool enabled;

  const DecimalField({
    super.key,
    required this.controller,
    required this.label,
    this.hint,
    this.suffix,
    this.onChanged,
    this.enabled = true,
  });

  @override
  Widget build(BuildContext context) {
    return TextField(
      controller: controller,
      enabled: enabled,
      keyboardType: const TextInputType.numberWithOptions(decimal: true),
      inputFormatters: [
        FilteringTextInputFormatter.allow(RegExp(r'[0-9.,]')),
      ],
      onChanged: onChanged,
      decoration: InputDecoration(
        labelText: label,
        hintText: hint,
        suffixText: suffix,
      ),
    );
  }
}

double? parseDecimal(String? txt) {
  if (txt == null || txt.trim().isEmpty) return null;
  return double.tryParse(txt.trim().replaceAll(',', '.'));
}
