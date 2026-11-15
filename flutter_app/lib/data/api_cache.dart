import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:shared_preferences/shared_preferences.dart';

class CachedApiResponse {
  const CachedApiResponse({required this.payload, required this.savedAt});

  final Map<String, dynamic> payload;
  final DateTime savedAt;

  bool get isFresh => DateTime.now().difference(savedAt) <= ApiCache.freshFor;

  bool get isUsableOffline =>
      DateTime.now().difference(savedAt) <= ApiCache.maxStaleFor;
}

class ApiCache {
  ApiCache._();

  static const _keyPrefix = 'elite-center:api-cache:';
  static const freshFor = Duration(minutes: 10);
  static const maxStaleFor = Duration(days: 30);

  static final ApiCache instance = ApiCache._();
  static final Future<SharedPreferences> _preferences =
      SharedPreferences.getInstance();

  Future<CachedApiResponse?> read(String path) async {
    try {
      final raw = (await _preferences).getString('$_keyPrefix$path');
      if (raw == null) return null;

      final decoded = jsonDecode(raw);
      if (decoded is Map<String, dynamic> &&
          decoded['savedAt'] is int &&
          decoded['payload'] is Map<String, dynamic>) {
        return CachedApiResponse(
          payload: decoded['payload'] as Map<String, dynamic>,
          savedAt: DateTime.fromMillisecondsSinceEpoch(
            decoded['savedAt'] as int,
          ),
        );
      }

      debugPrint('Discarding invalid cached API response for $path.');
      await _remove(path);
      return null;
    } on FormatException catch (error) {
      debugPrint('Discarding malformed cached API response for $path: $error');
      await _remove(path);
      return null;
    } on PlatformException catch (error) {
      debugPrint('Unable to read cached API response for $path: $error');
      return null;
    } on MissingPluginException catch (error) {
      debugPrint('API cache storage is unavailable for $path: $error');
      return null;
    }
  }

  Future<void> write(String path, Map<String, dynamic> payload) async {
    try {
      final preferences = await _preferences;
      final stored = await preferences.setString(
        '$_keyPrefix$path',
        jsonEncode({
          'savedAt': DateTime.now().millisecondsSinceEpoch,
          'payload': payload,
        }),
      );
      if (!stored) {
        debugPrint('Unable to persist cached API response for $path.');
      }
    } on PlatformException catch (error) {
      debugPrint('Unable to write cached API response for $path: $error');
    } on MissingPluginException catch (error) {
      debugPrint('API cache storage is unavailable for $path: $error');
    }
  }

  Future<void> _remove(String path) async {
    try {
      await (await _preferences).remove('$_keyPrefix$path');
    } on PlatformException catch (error) {
      debugPrint('Unable to remove invalid API cache for $path: $error');
    } on MissingPluginException catch (error) {
      debugPrint('API cache storage is unavailable for $path: $error');
    }
  }
}
