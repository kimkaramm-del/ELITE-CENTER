import 'package:firebase_core/firebase_core.dart';

import '../firebase_options.dart';

class FirebaseService {
  FirebaseService._();

  static Future<FirebaseApp>? _initialization;

  static Future<FirebaseApp> initialize() {
    if (Firebase.apps.isNotEmpty) return Future.value(Firebase.app());
    return _initialization ??= Firebase.initializeApp(
      options: EliteFirebaseOptions.android,
    );
  }

}
