import 'package:flutter/material.dart';

import '../core/constants.dart';
import '../core/date_utils.dart';
import '../core/models.dart';
import 'common.dart';

class DetailField {
  final String label;
  final String? value;
  final IconData? icon;

  const DetailField({
    required this.label,
    required this.value,
    this.icon,
  });
}

class DetailAction {
  final String label;
  final IconData icon;
  final Color? color;
  final String action;

  const DetailAction({
    required this.label,
    required this.icon,
    required this.action,
    this.color,
  });
}

class EntityDetailsSheet extends StatelessWidget {
  final String title;
  final String? subtitle;
  final IconData icon;
  final List<Widget> children;
  final List<DetailAction> actions;

  const EntityDetailsSheet({
    super.key,
    required this.title,
    this.subtitle,
    required this.icon,
    required this.children,
    this.actions = const [],
  });

  @override
  Widget build(BuildContext context) {
    final bottomSafe = MediaQuery.of(context).viewPadding.bottom;
    return SafeArea(
      child: DraggableScrollableSheet(
        expand: false,
        initialChildSize: 0.88,
        minChildSize: 0.45,
        maxChildSize: 0.96,
        builder: (ctx, controller) {
          return Container(
            decoration: BoxDecoration(
              color: Theme.of(ctx).scaffoldBackgroundColor,
              borderRadius:
                  const BorderRadius.vertical(top: Radius.circular(22)),
            ),
            child: Column(
              children: [
                Padding(
                  padding: const EdgeInsets.fromLTRB(18, 12, 8, 10),
                  child: Row(
                    children: [
                      CircleAvatar(
                        backgroundColor: AppTheme.primary.withOpacity(0.14),
                        child: Icon(icon, color: AppTheme.primary),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              title,
                              maxLines: 2,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(
                                fontSize: 20,
                                fontWeight: FontWeight.w900,
                              ),
                            ),
                            if ((subtitle ?? '').trim().isNotEmpty)
                              Text(
                                subtitle!,
                                maxLines: 2,
                                overflow: TextOverflow.ellipsis,
                                style:
                                    const TextStyle(color: AppTheme.textMuted),
                              ),
                          ],
                        ),
                      ),
                      IconButton(
                        tooltip: 'Fechar',
                        onPressed: () => Navigator.of(ctx).pop(),
                        icon: const Icon(Icons.close),
                      ),
                    ],
                  ),
                ),
                if (actions.isNotEmpty)
                  SingleChildScrollView(
                    scrollDirection: Axis.horizontal,
                    padding: const EdgeInsets.fromLTRB(18, 0, 18, 8),
                    child: Row(
                      children: actions
                          .map(
                            (a) => Padding(
                              padding: const EdgeInsets.only(right: 8),
                              child: OutlinedButton.icon(
                                onPressed: () => Navigator.of(ctx).pop(a.action),
                                icon: Icon(a.icon, color: a.color, size: 18),
                                label: Text(a.label),
                              ),
                            ),
                          )
                          .toList(),
                    ),
                  ),
                Expanded(
                  child: ListView(
                    controller: controller,
                    padding: EdgeInsets.fromLTRB(16, 0, 16, 22 + bottomSafe),
                    children: children,
                  ),
                ),
              ],
            ),
          );
        },
      ),
    );
  }
}

class DetailInfoGrid extends StatelessWidget {
  final List<DetailField> fields;

  const DetailInfoGrid({super.key, required this.fields});

  @override
  Widget build(BuildContext context) {
    return Wrap(
      spacing: 8,
      runSpacing: 8,
      children: fields
          .map(
            (f) => Container(
              width: 158,
              constraints: const BoxConstraints(minHeight: 74),
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(
                color: Colors.white,
                border: Border.all(color: AppTheme.border),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      if (f.icon != null) ...[
                        Icon(f.icon, size: 14, color: AppTheme.textMuted),
                        const SizedBox(width: 4),
                      ],
                      Expanded(
                        child: Text(
                          f.label,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            color: AppTheme.textMuted,
                            fontSize: 11,
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 5),
                  Text(
                    _valueOrDash(f.value),
                    maxLines: 3,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      fontWeight: FontWeight.w800,
                      fontSize: 14,
                    ),
                  ),
                ],
              ),
            ),
          )
          .toList(),
    );
  }
}

class DetailSection extends StatelessWidget {
  final String title;
  final Widget child;
  final String? emptyText;
  final int? count;

  const DetailSection({
    super.key,
    required this.title,
    required this.child,
    this.emptyText,
    this.count,
  });

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SectionHeader(
          texto: title,
          trailing: count == null
              ? null
              : Text(
                  '$count',
                  style: const TextStyle(
                    color: AppTheme.textMuted,
                    fontWeight: FontWeight.w800,
                  ),
                ),
        ),
        child,
      ],
    );
  }
}

class DetailEntityTile extends StatelessWidget {
  final IconData icon;
  final String title;
  final String? subtitle;
  final String? trailing;

  const DetailEntityTile({
    super.key,
    required this.icon,
    required this.title,
    this.subtitle,
    this.trailing,
  });

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: ListTile(
        leading: Icon(icon, color: AppTheme.primary),
        title: Text(
          title,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: const TextStyle(fontWeight: FontWeight.w800),
        ),
        subtitle: (subtitle ?? '').trim().isEmpty
            ? null
            : Text(
                subtitle!,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
              ),
        trailing: (trailing ?? '').trim().isEmpty
            ? null
            : Text(
                trailing!,
                style: const TextStyle(fontWeight: FontWeight.w800),
              ),
      ),
    );
  }
}

class DetailAbastecimentoList extends StatelessWidget {
  final List<Abastecimento> items;
  final int previewLimit;

  const DetailAbastecimentoList({
    super.key,
    required this.items,
    this.previewLimit = 30,
  });

  @override
  Widget build(BuildContext context) {
    if (items.isEmpty) {
      return const _EmptyLinkedText('Nenhum abastecimento vinculado.');
    }
    final visible = items.take(previewLimit).toList();
    return Column(
      children: [
        ...visible.map((a) => _AbastecimentoDetailTile(item: a)),
        if (items.length > visible.length)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 8),
            child: Text(
              'Mostrando ${visible.length} de ${items.length} registros.',
              style: const TextStyle(color: AppTheme.textMuted),
            ),
          ),
      ],
    );
  }
}

class EmptyLinkedText extends StatelessWidget {
  final String text;

  const EmptyLinkedText(this.text, {super.key});

  @override
  Widget build(BuildContext context) => _EmptyLinkedText(text);
}

class _EmptyLinkedText extends StatelessWidget {
  final String text;

  const _EmptyLinkedText(this.text);

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Text(
          text,
          style: const TextStyle(color: AppTheme.textMuted),
        ),
      ),
    );
  }
}

class _AbastecimentoDetailTile extends StatelessWidget {
  final Abastecimento item;

  const _AbastecimentoDetailTile({required this.item});

  @override
  Widget build(BuildContext context) {
    final total =
        item.valorTotal ?? ((item.valorPorLitro ?? 0) * item.quantidadeLitros);
    final pago = item.baixaAbastecimento ? 'Pago' : 'Pendente';
    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: ListTile(
        leading: Icon(
          item.baixaAbastecimento
              ? Icons.price_check_outlined
              : Icons.hourglass_top_rounded,
          color: item.baixaAbastecimento ? AppTheme.success : AppTheme.warning,
        ),
        title: Text(
          '${item.veiculoPlaca ?? item.idVeiculo ?? 'Sem placa'} - ${AppDates.number(item.quantidadeLitros)} L',
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: const TextStyle(fontWeight: FontWeight.w800),
        ),
        subtitle: Text(
          [
            AppDates.formatDateTimeOrDateBr(item.dataHora, item.data),
            item.motoristaNome ?? 'Motorista nao informado',
            pago,
          ].join(' | '),
          maxLines: 2,
          overflow: TextOverflow.ellipsis,
        ),
        trailing: Text(
          AppDates.money(total),
          style: const TextStyle(fontWeight: FontWeight.w800),
        ),
      ),
    );
  }
}

String _valueOrDash(String? value) {
  final v = value?.trim();
  return v == null || v.isEmpty ? '-' : v;
}
