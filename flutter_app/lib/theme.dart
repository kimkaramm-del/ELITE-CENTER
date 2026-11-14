import 'package:flutter/gestures.dart';
import 'package:material_ui/material_ui.dart';

abstract final class EliteColors {
  static const ink = Color(0xFF401221);
  static const wine = Color(0xFF7B1230);
  static const wineLight = Color(0xFFA63853);
  static const deepWine = Color(0xFF4F0A1E);
  static const gold = Color(0xFFC19A3D);
  static const goldPale = Color(0xFFECD48C);
  static const paper = Color(0xFFF8F5F6);
  static const surface = Color(0xFFFFFFFF);
  static const muted = Color(0xFF765962);
  static const line = Color(0xFFE7DCE0);
  static const green = Color(0xFF39735F);
  static const red = Color(0xFFB94D55);
}

ThemeData buildEliteTheme() {
  final scheme =
      ColorScheme.fromSeed(
        seedColor: EliteColors.wine,
        primary: EliteColors.wine,
        secondary: EliteColors.gold,
        tertiary: EliteColors.green,
        surface: EliteColors.surface,
        error: EliteColors.red,
      ).copyWith(
        outline: EliteColors.line,
        outlineVariant: EliteColors.line,
        surfaceContainerLow: const Color(0xFFFCF9FA),
        surfaceContainer: const Color(0xFFF5F0F2),
        onSurface: EliteColors.ink,
        onSurfaceVariant: EliteColors.muted,
      );

  return ThemeData(
    useMaterial3: true,
    colorScheme: scheme,
    scaffoldBackgroundColor: EliteColors.paper,
    visualDensity: VisualDensity.standard,
    appBarTheme: const AppBarTheme(
      backgroundColor: EliteColors.paper,
      foregroundColor: EliteColors.ink,
      surfaceTintColor: Colors.transparent,
      elevation: 0,
      scrolledUnderElevation: 0,
      centerTitle: false,
      titleTextStyle: TextStyle(
        color: EliteColors.ink,
        fontSize: 17,
        fontWeight: FontWeight.w600,
      ),
    ),
    cardTheme: CardThemeData(
      color: EliteColors.surface,
      elevation: 0,
      shadowColor: Colors.transparent,
      margin: EdgeInsets.zero,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
        side: const BorderSide(color: EliteColors.line),
      ),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: EliteColors.surface,
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 15),
      hintStyle: const TextStyle(color: EliteColors.muted),
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: const BorderSide(color: EliteColors.line),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: const BorderSide(color: EliteColors.line),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: const BorderSide(color: EliteColors.wine, width: 1.5),
      ),
      errorBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: const BorderSide(color: EliteColors.red),
      ),
      focusedErrorBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: const BorderSide(color: EliteColors.red, width: 1.5),
      ),
    ),
    textTheme: const TextTheme(
      headlineLarge: TextStyle(
        color: EliteColors.ink,
        fontSize: 32,
        fontWeight: FontWeight.w700,
        height: 1.3,
      ),
      headlineMedium: TextStyle(
        color: EliteColors.ink,
        fontSize: 26,
        fontWeight: FontWeight.w700,
        height: 1.35,
      ),
      headlineSmall: TextStyle(
        color: EliteColors.ink,
        fontSize: 23,
        fontWeight: FontWeight.w600,
        height: 1.35,
      ),
      titleLarge: TextStyle(
        color: EliteColors.ink,
        fontSize: 19,
        fontWeight: FontWeight.w600,
      ),
      titleMedium: TextStyle(
        color: EliteColors.ink,
        fontSize: 16,
        fontWeight: FontWeight.w600,
      ),
      titleSmall: TextStyle(
        color: EliteColors.ink,
        fontSize: 14,
        fontWeight: FontWeight.w600,
      ),
      bodyLarge: TextStyle(color: EliteColors.ink, fontSize: 15, height: 1.65),
      bodyMedium: TextStyle(
        color: EliteColors.muted,
        fontSize: 13,
        height: 1.6,
        fontWeight: FontWeight.w500,
      ),
      labelSmall: TextStyle(
        color: EliteColors.muted,
        fontSize: 10,
        fontWeight: FontWeight.w600,
      ),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        backgroundColor: EliteColors.wine,
        foregroundColor: Colors.white,
        minimumSize: const Size(0, 48),
        elevation: 0,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
        textStyle: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        foregroundColor: EliteColors.wine,
        minimumSize: const Size(0, 46),
        side: const BorderSide(color: EliteColors.line),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
        textStyle: const TextStyle(fontWeight: FontWeight.w600),
      ),
    ),
    textButtonTheme: TextButtonThemeData(
      style: TextButton.styleFrom(
        foregroundColor: EliteColors.wine,
        textStyle: const TextStyle(fontWeight: FontWeight.w600),
      ),
    ),
    navigationBarTheme: NavigationBarThemeData(
      height: 68,
      elevation: 0,
      backgroundColor: EliteColors.surface,
      indicatorColor: Color(0xFFF6E8ED),
      labelTextStyle: const WidgetStatePropertyAll(
        TextStyle(fontSize: 11, fontWeight: FontWeight.w600),
      ),
    ),
    dividerTheme: const DividerThemeData(
      color: EliteColors.line,
      space: 1,
      thickness: 1,
    ),
    snackBarTheme: SnackBarThemeData(
      behavior: SnackBarBehavior.floating,
      backgroundColor: EliteColors.ink,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
    ),
    bottomSheetTheme: const BottomSheetThemeData(
      backgroundColor: EliteColors.paper,
      surfaceTintColor: Colors.transparent,
      showDragHandle: true,
    ),
  );
}

class TechnicalBackdrop extends StatelessWidget {
  const TechnicalBackdrop({
    required this.child,
    this.borderRadius = const BorderRadius.all(Radius.circular(28)),
    super.key,
  });

  final Widget child;
  final BorderRadius borderRadius;

  @override
  Widget build(BuildContext context) => ClipRRect(
    borderRadius: borderRadius,
    child: Stack(
      children: [
        Positioned.fill(
          child: const DecoratedBox(
            decoration: BoxDecoration(
              gradient: LinearGradient(
                begin: AlignmentDirectional.topStart,
                end: AlignmentDirectional.bottomEnd,
                colors: [EliteColors.wine, EliteColors.deepWine],
              ),
            ),
          ),
        ),
        PositionedDirectional(
          top: -70,
          end: -62,
          child: Container(
            width: 190,
            height: 190,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              border: Border.all(color: EliteColors.gold.withValues(alpha: .1)),
              color: Colors.white.withValues(alpha: .035),
            ),
          ),
        ),
        child,
      ],
    ),
  );
}

class HoverDepth extends StatefulWidget {
  const HoverDepth({
    required this.child,
    this.borderRadius = const BorderRadius.all(Radius.circular(22)),
    this.depth = 7,
    super.key,
  });

  final Widget child;
  final BorderRadius borderRadius;
  final double depth;

  @override
  State<HoverDepth> createState() => _HoverDepthState();
}

class _HoverDepthState extends State<HoverDepth> {
  double _tiltX = 0;
  double _tiltY = 0;
  bool _isHovered = false;

  void _onHover(PointerHoverEvent event) {
    final renderBox = context.findRenderObject();
    if (renderBox is! RenderBox ||
        !renderBox.hasSize ||
        renderBox.size.isEmpty) {
      return;
    }
    final position = renderBox.globalToLocal(event.position);
    final x = position.dx / renderBox.size.width;
    final y = position.dy / renderBox.size.height;
    setState(() {
      _isHovered = true;
      _tiltX = (.5 - y) * .06;
      _tiltY = (x - .5) * .06;
    });
  }

  void _resetTilt(PointerExitEvent _) {
    if (!mounted) return;
    setState(() {
      _isHovered = false;
      _tiltX = 0;
      _tiltY = 0;
    });
  }

  Matrix4 get _transform => Matrix4.identity()
    ..setEntry(3, 2, .001)
    ..rotateX(_tiltX)
    ..rotateY(_tiltY)
    ..translateByDouble(0.0, _isHovered ? -2.0 : 0.0, 0.0, 1.0);

  @override
  Widget build(BuildContext context) => MouseRegion(
    onHover: _onHover,
    onExit: _resetTilt,
    child: AnimatedContainer(
      duration: const Duration(milliseconds: 180),
      curve: Curves.easeOutCubic,
      transform: _transform,
      transformAlignment: Alignment.center,
      decoration: BoxDecoration(
        borderRadius: widget.borderRadius,
        boxShadow: [
          BoxShadow(
            color: EliteColors.deepWine.withValues(
              alpha: _isHovered ? .09 : .045,
            ),
            blurRadius: 8 + widget.depth.clamp(1.0, 16.0).toDouble() * .35,
            offset: Offset(
              0,
              2.5 + widget.depth.clamp(1.0, 16.0).toDouble() * .16,
            ),
          ),
        ],
      ),
      child: ClipRRect(borderRadius: widget.borderRadius, child: widget.child),
    ),
  );
}

class PortalHero extends StatelessWidget {
  const PortalHero({
    required this.kicker,
    required this.title,
    required this.subtitle,
    required this.icon,
    super.key,
  });

  final String kicker;
  final String title;
  final String subtitle;
  final IconData icon;

  @override
  Widget build(BuildContext context) => HoverDepth(
    depth: 9,
    child: TechnicalBackdrop(
      child: Padding(
        padding: const EdgeInsets.all(19),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Container(
                  width: 43,
                  height: 43,
                  decoration: BoxDecoration(
                    color: Colors.white.withValues(alpha: .1),
                    borderRadius: BorderRadius.circular(15),
                    border: Border.all(
                      color: EliteColors.gold.withValues(alpha: .65),
                    ),
                  ),
                  child: Icon(icon, color: EliteColors.goldPale, size: 22),
                ),
                const Spacer(),
                const DataPill(
                  icon: Icons.lock_outline_rounded,
                  label: 'بوابة آمنة',
                  color: EliteColors.goldPale,
                ),
              ],
            ),
            const SizedBox(height: 17),
            SectionLabel(kicker),
            const SizedBox(height: 7),
            Text(
              title,
              style: Theme.of(
                context,
              ).textTheme.headlineSmall?.copyWith(color: Colors.white),
            ),
            const SizedBox(height: 5),
            Text(
              subtitle,
              style: Theme.of(
                context,
              ).textTheme.bodyMedium?.copyWith(color: Colors.white70),
            ),
          ],
        ),
      ),
    ),
  );
}

class SectionLabel extends StatelessWidget {
  const SectionLabel(this.label, {super.key});

  final String label;

  @override
  Widget build(BuildContext context) => Text(
    label,
    style: Theme.of(context).textTheme.labelSmall?.copyWith(
      color: EliteColors.gold,
      fontWeight: FontWeight.w600,
    ),
  );
}

class InlineMessage extends StatelessWidget {
  const InlineMessage(this.message, {this.isError = false, super.key});

  final String message;
  final bool isError;

  @override
  Widget build(BuildContext context) => Container(
    width: double.infinity,
    padding: const EdgeInsets.all(14),
    decoration: BoxDecoration(
      color: isError
          ? EliteColors.red.withValues(alpha: .08)
          : EliteColors.green.withValues(alpha: .08),
      borderRadius: BorderRadius.circular(14),
      border: Border.all(
        color: (isError ? EliteColors.red : EliteColors.green).withValues(
          alpha: .2,
        ),
      ),
    ),
    child: Text(
      message,
      style: Theme.of(context).textTheme.bodyMedium?.copyWith(
        color: isError ? EliteColors.red : EliteColors.green,
      ),
    ),
  );
}

class DataPill extends StatelessWidget {
  const DataPill({
    required this.icon,
    required this.label,
    this.color = EliteColors.gold,
    super.key,
  });

  final IconData icon;
  final String label;
  final Color color;

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 11, vertical: 8),
    decoration: BoxDecoration(
      color: color.withValues(alpha: .1),
      borderRadius: BorderRadius.circular(12),
      border: Border.all(color: color.withValues(alpha: .2)),
    ),
    child: Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(icon, size: 14, color: color),
        const SizedBox(width: 6),
        Text(
          label,
          style: Theme.of(
            context,
          ).textTheme.labelSmall?.copyWith(color: color, fontSize: 11),
        ),
      ],
    ),
  );
}

class PageHeading extends StatelessWidget {
  const PageHeading({
    required this.kicker,
    required this.title,
    this.subtitle,
    super.key,
  });

  final String kicker;
  final String title;
  final String? subtitle;

  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      SectionLabel(kicker),
      const SizedBox(height: 7),
      Text(title, style: Theme.of(context).textTheme.headlineMedium),
      if (subtitle != null) ...[
        const SizedBox(height: 8),
        Text(subtitle!, style: Theme.of(context).textTheme.bodyMedium),
      ],
    ],
  );
}
