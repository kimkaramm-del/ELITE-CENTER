import 'dart:async';

import 'package:material_ui/material_ui.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/services.dart';

import 'data/api_client.dart';
import 'data/firebase_messaging_service.dart';
import 'data/google_auth_service.dart';
import 'data/notification_permission.dart';
import 'screens/auth_screens.dart';
import 'screens/home_screen.dart';
import 'screens/student_screens.dart';
import 'theme.dart';
import 'widgets/education_widgets.dart' as education;

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  try {
    await FirebaseMessagingService.initialize();
  } on FirebaseException catch (error) {
    debugPrint('Firebase initialization failed: $error');
  }
  SystemChrome.setSystemUIOverlayStyle(
    const SystemUiOverlayStyle(
      statusBarColor: EliteColors.paper,
      statusBarIconBrightness: Brightness.dark,
      systemNavigationBarColor: Colors.white,
      systemNavigationBarIconBrightness: Brightness.dark,
    ),
  );
  runApp(const EliteCenterApp());
}

class EliteCenterApp extends StatefulWidget {
  const EliteCenterApp({super.key});

  @override
  State<EliteCenterApp> createState() => _EliteCenterAppState();
}

class _EliteCenterAppState extends State<EliteCenterApp> {
  JsonMap? _student;
  String? _startupError;
  bool _isRestoring = true;

  @override
  void initState() {
    super.initState();
    _restoreSession();
  }

  Future<void> _restoreSession({bool showLoading = false}) async {
    if (showLoading && mounted) setState(() => _isRestoring = true);
    try {
      _student = await EliteApi.instance.restoreSession();
      _startupError = null;
    } on ApiException catch (error) {
      _startupError = error.message;
    }
    if (mounted) setState(() => _isRestoring = false);
  }

  Future<void> _login(BuildContext context) async {
    final student = await Navigator.of(context).push<JsonMap>(
      MaterialPageRoute<JsonMap>(builder: (_) => const LoginScreen()),
    );
    if (student != null && mounted) {
      setState(() {
        _student = student;
        _startupError = null;
      });
    }
  }

  Future<void> _logout() async {
    await EliteApi.instance.logout();
    await GoogleAuthService.signOut();
    if (mounted) {
      setState(() {
        _student = null;
        _startupError = null;
      });
    }
  }

  @override
  Widget build(BuildContext context) => MaterialApp(
    title: 'مركز النخبة',
    debugShowCheckedModeBanner: false,
    theme: buildEliteTheme(),
    locale: const Locale('ar'),
    supportedLocales: const [Locale('ar'), Locale('en')],
    localizationsDelegates: GlobalMaterialLocalizations.delegates,
    home: _isRestoring
        ? const _StartupScreen()
        : _HomeShell(
            student: _student,
            startupError: _startupError,
            onLogin: _login,
            onLogout: _logout,
            onRetryStartup: () => _restoreSession(showLoading: true),
          ),
  );
}

class _StartupScreen extends StatelessWidget {
  const _StartupScreen();

  @override
  Widget build(BuildContext context) => Scaffold(
    body: Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 82,
            height: 82,
            padding: const EdgeInsets.all(3),
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              gradient: const LinearGradient(
                begin: Alignment.topRight,
                end: Alignment.bottomLeft,
                colors: [EliteColors.goldPale, EliteColors.gold],
              ),
              boxShadow: [
                BoxShadow(
                  color: EliteColors.wine.withValues(alpha: .18),
                  blurRadius: 28,
                  offset: const Offset(0, 12),
                ),
              ],
            ),
            child: Container(
              padding: const EdgeInsets.all(15),
              decoration: const BoxDecoration(
                color: EliteColors.wine,
                shape: BoxShape.circle,
              ),
              child: Image.asset(
                'assets/elite-logo.webp',
                errorBuilder: (_, _, _) => const Icon(
                  Icons.school_rounded,
                  color: EliteColors.gold,
                  size: 40,
                ),
              ),
            ),
          ),
          const SizedBox(height: 17),
          const Text(
            'مركز النخبة',
            style: TextStyle(
              color: EliteColors.ink,
              fontSize: 20,
              fontWeight: FontWeight.w800,
            ),
          ),
          const SizedBox(height: 5),
          const Text(
            'تهيئة مساحة التعلم الآمنة',
            style: TextStyle(color: EliteColors.muted, fontSize: 12),
          ),
          const SizedBox(height: 18),
          const SizedBox(
            width: 22,
            height: 22,
            child: CircularProgressIndicator(
              strokeWidth: 2,
              color: EliteColors.gold,
            ),
          ),
        ],
      ),
    ),
  );
}

class _HomeShell extends StatefulWidget {
  const _HomeShell({
    required this.student,
    required this.startupError,
    required this.onLogin,
    required this.onLogout,
    required this.onRetryStartup,
  });

  final JsonMap? student;
  final String? startupError;
  final Future<void> Function(BuildContext context) onLogin;
  final Future<void> Function() onLogout;
  final Future<void> Function() onRetryStartup;

  @override
  State<_HomeShell> createState() => _HomeShellState();
}

class _HomeShellState extends State<_HomeShell> {
  int _selectedIndex = 0;
  bool _showStartupError = true;
  late final StreamSubscription<RemoteMessage> _foregroundSubscription;

  @override
  void initState() {
    super.initState();
    _foregroundSubscription = FirebaseMessagingService.foregroundMessages
        .listen(_showNotification);
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _requestNotificationPermission();
    });
  }

  @override
  void dispose() {
    _foregroundSubscription.cancel();
    super.dispose();
  }

  Future<void> _requestNotificationPermission() async {
    try {
      await NotificationPermission.requestOnce();
    } on PlatformException catch (error) {
      debugPrint('Notification permission request failed: $error');
      if (!mounted) return;
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(const SnackBar(content: Text('تعذر طلب إذن الإشعارات.')));
    } on MissingPluginException catch (error) {
      debugPrint('Notification permission channel is unavailable: $error');
      if (!mounted) return;
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(const SnackBar(content: Text('تعذر طلب إذن الإشعارات.')));
    }
  }

  void _showNotification(RemoteMessage message) {
    final title = message.notification?.title;
    final body = message.notification?.body;
    final text = [
      title,
      body,
    ].whereType<String>().where((part) => part.isNotEmpty).join('\n');
    if (text.isEmpty || !mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(text)));
  }

  @override
  Widget build(BuildContext context) {
    final pages = [
      HomeScreen(
        student: widget.student,
        onOpenStudentArea: () {
          if (widget.student == null) {
            widget.onLogin(context);
          } else {
            setState(() => _selectedIndex = 3);
          }
        },
        onOpenCatalog: () => setState(() => _selectedIndex = 1),
      ),
      const CatalogScreen(),
      FeedScreen(
        student: widget.student,
        onLogin: () => widget.onLogin(context),
      ),
      AccountScreen(
        student: widget.student,
        onLogin: () => widget.onLogin(context),
        onLogout: widget.onLogout,
      ),
    ];

    return Scaffold(
      body: SafeArea(
        bottom: false,
        child: Column(
          children: [
            if (widget.startupError != null && _showStartupError)
              Padding(
                padding: const EdgeInsets.fromLTRB(14, 8, 14, 2),
                child: education.ErrorBanner(
                  message: widget.startupError!,
                  onRetry: widget.onRetryStartup,
                  onDismiss: () => setState(() => _showStartupError = false),
                ),
              ),
            Expanded(
              child: IndexedStack(index: _selectedIndex, children: pages),
            ),
          ],
        ),
      ),
      bottomNavigationBar: _EliteNavigationBar(
        selectedIndex: _selectedIndex,
        onSelected: (index) => setState(() => _selectedIndex = index),
      ),
    );
  }
}

class _EliteNavigationBar extends StatelessWidget {
  const _EliteNavigationBar({
    required this.selectedIndex,
    required this.onSelected,
  });

  final int selectedIndex;
  final ValueChanged<int> onSelected;

  @override
  Widget build(BuildContext context) => SafeArea(
    top: false,
    child: NavigationBar(
      selectedIndex: selectedIndex,
      onDestinationSelected: onSelected,
      destinations: const [
        NavigationDestination(
          icon: Icon(Icons.home_outlined),
          selectedIcon: Icon(Icons.home_rounded),
          label: 'الرئيسية',
        ),
        NavigationDestination(
          icon: Icon(Icons.auto_stories_outlined),
          selectedIcon: Icon(Icons.auto_stories_rounded),
          label: 'المواد',
        ),
        NavigationDestination(
          icon: Icon(Icons.forum_outlined),
          selectedIcon: Icon(Icons.forum_rounded),
          label: 'الموجز',
        ),
        NavigationDestination(
          icon: Icon(Icons.person_outline_rounded),
          selectedIcon: Icon(Icons.person_rounded),
          label: 'حسابي',
        ),
      ],
    ),
  );
}
