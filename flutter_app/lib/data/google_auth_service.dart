import 'package:firebase_auth/firebase_auth.dart';
import 'package:firebase_core/firebase_core.dart' show Firebase;
import 'package:google_sign_in/google_sign_in.dart';

import '../firebase_options.dart';
import 'firebase_service.dart';

class GoogleAuthService {
  GoogleAuthService._();

  static Future<void>? _googleInitialization;

  static Future<String> signInAndGetIdToken() async {
    if (!EliteFirebaseOptions.isConfigured ||
        !EliteFirebaseOptions.isGoogleSignInConfigured) {
      throw StateError(
        'إعداد Firebase وGoogle غير مكتمل. جهّز firebase-options.json وأعد بناء التطبيق.',
      );
    }

    await FirebaseService.initialize();
    await _initializeGoogleSignIn();
    final googleUser = await GoogleSignIn.instance.authenticate();
    final idToken = googleUser.authentication.idToken;
    if (idToken == null || idToken.isEmpty) {
      throw StateError('تعذر الحصول على رمز Google. تحقق من إعداد OAuth.');
    }

    final credential = GoogleAuthProvider.credential(idToken: idToken);
    final userCredential = await FirebaseAuth.instance.signInWithCredential(
      credential,
    );
    final firebaseToken = await userCredential.user?.getIdToken(true);
    if (firebaseToken == null || firebaseToken.isEmpty) {
      throw StateError('تعذر التحقق من حساب Google.');
    }
    return firebaseToken;
  }

  static Future<void> _initializeGoogleSignIn() async {
    final initialization = _googleInitialization ??=
        GoogleSignIn.instance.initialize(
          serverClientId: EliteFirebaseOptions.googleServerClientId,
        );
    try {
      await initialization;
    } catch (_) {
      _googleInitialization = null;
      rethrow;
    }
  }

  static Future<String> refreshIdToken() async {
    final user = FirebaseAuth.instance.currentUser;
    if (user == null) return signInAndGetIdToken();
    final token = await user.getIdToken(true);
    if (token == null || token.isEmpty) {
      throw StateError('تعذر تحديث جلسة Google.');
    }
    return token;
  }

  static Future<void> signOut() async {
    if (Firebase.apps.isEmpty) return;
    await FirebaseAuth.instance.signOut();
    if (_googleInitialization != null) {
      await GoogleSignIn.instance.signOut();
    }
  }
}
