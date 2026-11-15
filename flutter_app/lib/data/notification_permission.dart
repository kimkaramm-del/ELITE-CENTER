import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import 'firebase_messaging_service.dart';

class NotificationPermission {
  NotificationPermission._();

  static const _channel = MethodChannel('com.elitecenter/notifications');
  static const _askedKey = 'elite-center:notification-permission-asked';
  static const _storage = FlutterSecureStorage();

  static Future<void> requestOnce() async {
    if (kIsWeb || defaultTargetPlatform != TargetPlatform.android) return;
    if (FirebaseMessagingService.isInitialized) {
      if (await _storage.read(key: _askedKey) == 'true') {
        await FirebaseMessagingService.refreshTokenIfAuthorized();
        return;
      }
      await FirebaseMessagingService.requestPermission();
      await _storage.write(key: _askedKey, value: 'true');
      return;
    }

    if (await _storage.read(key: _askedKey) == 'true') return;
    await _channel.invokeMethod<bool>('requestPermission');
    await _storage.write(key: _askedKey, value: 'true');
  }
}
