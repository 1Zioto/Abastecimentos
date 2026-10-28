import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_cache_manager/flutter_cache_manager.dart';

import 'constants.dart';

/// Cache persistente para imagens remotas. Miniaturas ficam disponíveis por
/// 30 dias, inclusive depois de fechar e abrir o aplicativo.
class CachedRemoteImage extends StatelessWidget {
  static final CacheManager _cacheManager = CacheManager(
    Config(
      'vipe_remote_images_v1',
      stalePeriod: const Duration(days: 30),
      maxNrOfCacheObjects: 1000,
    ),
  );

  final String url;
  final double? width;
  final double? height;
  final BoxFit fit;
  final bool thumbnail;
  final Widget? error;
  final Widget? placeholder;

  const CachedRemoteImage({
    super.key,
    required this.url,
    this.width,
    this.height,
    this.fit = BoxFit.cover,
    this.thumbnail = true,
    this.error,
    this.placeholder,
  });

  static String resolveUrl(String value, {required bool thumbnail}) {
    if (!thumbnail) return value;

    final uri = Uri.tryParse(value);
    if (uri != null && uri.path.endsWith('/drive-image')) {
      final id = uri.queryParameters['id'];
      if (id != null && id.isNotEmpty) {
        return '${AppConstants.apiBaseUrl}/drive-thumb?id=$id';
      }
    }

    if (value.contains('drive.google.com')) {
      final match = RegExp(r'(?:id=|file/d/)([^&/?]+)').firstMatch(value);
      final id = match?.group(1);
      if (id != null && id.isNotEmpty) {
        return '${AppConstants.apiBaseUrl}/drive-thumb?id=$id';
      }
    }

    return value;
  }

  @override
  Widget build(BuildContext context) {
    return CachedNetworkImage(
      imageUrl: resolveUrl(url, thumbnail: thumbnail),
      cacheManager: _cacheManager,
      width: width,
      height: height,
      fit: fit,
      fadeInDuration: const Duration(milliseconds: 120),
      placeholder: (_, __) =>
          placeholder ??
          const Center(
            child: SizedBox(
              width: 22,
              height: 22,
              child: CircularProgressIndicator(strokeWidth: 2),
            ),
          ),
      errorWidget: (_, __, ___) =>
          error ?? const Center(child: Icon(Icons.broken_image_outlined)),
    );
  }
}
