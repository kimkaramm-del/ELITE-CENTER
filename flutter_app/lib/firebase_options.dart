import 'package:firebase_core/firebase_core.dart';

class EliteFirebaseOptions {
  EliteFirebaseOptions._();

  static const apiKey = String.fromEnvironment('FIREBASE_API_KEY');
  static const appId = String.fromEnvironment('FIREBASE_APP_ID');
  static const messagingSenderId = String.fromEnvironment(
    'FIREBASE_MESSAGING_SENDER_ID',
  );
  static const projectId = String.fromEnvironment('FIREBASE_PROJECT_ID');
  static const googleServerClientId = String.fromEnvironment(
    'GOOGLE_SERVER_CLIENT_ID',
  );

  static bool _hasValue(String value) =>
      value.isNotEmpty && !value.startsWith('replace-with-');

  static bool get isConfigured =>
      _hasValue(apiKey) &&
      _hasValue(appId) &&
      _hasValue(messagingSenderId) &&
      _hasValue(projectId);

  static bool get isGoogleSignInConfigured =>
      _hasValue(googleServerClientId) &&
      googleServerClientId.endsWith('.apps.googleusercontent.com');

  static FirebaseOptions get android => const FirebaseOptions(
    apiKey: apiKey,
    appId: appId,
    messagingSenderId: messagingSenderId,
    projectId: projectId,
  );
}
