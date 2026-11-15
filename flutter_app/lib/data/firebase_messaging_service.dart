import 'dart:async';

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import '../firebase_options.dart';

@pragma('vm:entry-point')
Future<void> firebaseMessagingBackgroundHandler(RemoteMessage message) async {
  if (Firebase.apps.isEmpty && EliteFirebaseOptions.isConfigured) {
    await Firebase.initializeApp(options: EliteFirebaseOptions.android);
  }
}

class FirebaseMessagingService {
  FirebaseMessagingService._();

  static const _installationIdKey = 'elite-center:firebase-installation-id';
  static const _storage = FlutterSecureStorage();
  static final _foregroundMessages =
      StreamController<RemoteMessage>.broadcast();

  static bool _initialized = false;

  static bool get isInitialized => _initialized;
  static Stream<RemoteMessage> get foregroundMessages =>
      _foregroundMessages.stream;

  static Future<bool> initialize() async {
    if (!EliteFirebaseOptions.isConfigured) {
      debugPrint(
        'Firebase is not configured. Add the FIREBASE_* Dart defines to enable FCM.',
      );
      return false;
    }

    await Firebase.initializeApp(options: EliteFirebaseOptions.android);
    FirebaseMessaging.onBackgroundMessage(firebaseMessagingBackgroundHandler);
    FirebaseMessaging.onMessage.listen(
      _foregroundMessages.add,
      onError: (Object error, StackTrace stackTrace) {
        debugPrint('Firebase foreground message stream failed: $error');
      },
    );
    FirebaseMessaging.instance.onRegistered.listen(
      _saveInstallationId,
      onError: (Object error, StackTrace stackTrace) {
        debugPrint('Firebase installation registration failed: $error');
      },
    );
    _initialized = true;
    return true;
  }

  static Future<AuthorizationStatus?> requestPermission() async {
    if (!_initialized) return null;

    final settings = await FirebaseMessaging.instance.requestPermission(
      alert: true,
      badge: true,
      sound: true,
    );
    if (settings.authorizationStatus == AuthorizationStatus.authorized ||
        settings.authorizationStatus == AuthorizationStatus.provisional) {
      await FirebaseMessaging.instance.register();
    }
    return settings.authorizationStatus;
  }

  static Future<void> refreshTokenIfAuthorized() async {
    if (!_initialized) return;

    final settings = await FirebaseMessaging.instance.getNotificationSettings();
    if (settings.authorizationStatus != AuthorizationStatus.authorized &&
        settings.authorizationStatus != AuthorizationStatus.provisional) {
      return;
    }

    await FirebaseMessaging.instance.register();
  }

  static Future<String?> readInstallationId() =>
      _storage.read(key: _installationIdKey);

  static Future<void> _saveInstallationId(String installationId) =>
      _storage.write(key: _installationIdKey, value: installationId);
}
