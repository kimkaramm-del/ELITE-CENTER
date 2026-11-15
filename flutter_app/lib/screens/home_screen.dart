import 'package:material_ui/material_ui.dart';

import '../data/api_client.dart';
import '../theme.dart';
import '../widgets/education_widgets.dart' as education;
import 'auth_screens.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({
    required this.student,
    required this.onOpenStudentArea,
    required this.onOpenCatalog,
    super.key,
  });

  final JsonMap? student;
  final VoidCallback onOpenStudentArea;
  final VoidCallback onOpenCatalog;

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  late Future<_HomeData> _data;
  final _searchController = TextEditingController();
  String _searchQuery = '';

  @override
  void initState() {
    super.initState();
    _data = _load();
  }

  Future<_HomeData> _load({bool forceRefresh = false}) async {
    final results = await Future.wait([
      EliteApi.instance.catalog(forceRefresh: forceRefresh),
      EliteApi.instance.news(forceRefresh: forceRefresh),
    ]);
    return _HomeData(
      asJsonMap(results[0]),
      asJsonList(asJsonMap(results[1])['items']),
    );
  }

  Future<void> _refresh() async {
    final next = _load(forceRefresh: true);
    setState(() => _data = next);
    await next;
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => FutureBuilder<_HomeData>(
    future: _data,
    builder: (context, snapshot) {
      if (snapshot.hasError) {
        return _HomeFailure(
          message: snapshot.error is ApiException
              ? (snapshot.error! as ApiException).message
              : 'تعذر تحميل بيانات المركز.',
          onRetry: _refresh,
        );
      }
      if (!snapshot.hasData) {
        return ListView(
          padding: EdgeInsets.fromLTRB(20, 24, 20, 30),
          children: const [education.ShimmerLoadingList(itemCount: 4)],
        );
      }
      final data = snapshot.data!;
      final grades = asJsonList(data.catalog['grades']);
      final visibleGrades = grades.where(_matchesGrade).toList();
      final settings = asJsonMap(data.catalog['settings']);
      final subjects = grades.fold<int>(
        0,
        (total, grade) => total + asJsonList(grade['subjects']).length,
      );
      final teachers = <String>{};
      for (final grade in grades) {
        for (final subject in asJsonList(grade['subjects'])) {
          teachers.addAll(
            (subject['teachers'] as List? ?? const []).whereType<String>(),
          );
        }
      }
      return RefreshIndicator(
        color: EliteColors.wine,
        onRefresh: _refresh,
        child: ListView(
          padding: const EdgeInsets.fromLTRB(20, 12, 20, 30),
          children: [
            HoverDepth(
              depth: 12,
              borderRadius: BorderRadius.circular(26),
              child: _WelcomeHeader(
                centerName: settings['centerName'] as String? ?? 'مركز النخبة',
                student: widget.student,
                onOpenStudentArea: widget.onOpenStudentArea,
              ),
            ),
            const SizedBox(height: 22),
            _SystemStatus(
              label: settings['tagline'] as String? ?? 'منصة تعليمية متكاملة',
              isLive: true,
            ),
            const SizedBox(height: 28),
            Row(
              children: [
                Expanded(
                  child: PageHeading(
                    kicker: 'المسار الدراسي',
                    title:
                        settings['homeTitle'] as String? ?? 'اختر صفّك الدراسي',
                    subtitle:
                        settings['homeSubtitle'] as String? ??
                        'مدرسون متخصصون، محتوى واضح، وخطوات تعلم منظمة.',
                  ),
                ),
              ],
            ),
            const SizedBox(height: 18),
            HoverDepth(
              depth: 5,
              borderRadius: BorderRadius.circular(18),
              child: _StatStrip(
                grades: grades.length,
                subjects: subjects,
                teachers: teachers.length,
              ),
            ),
            const SizedBox(height: 24),
            _SectionRow(
              title: 'المراحل الدراسية',
              caption: 'اختر صفك للاطلاع على المواد',
              actionLabel: 'عرض الكل',
              onAction: widget.onOpenCatalog,
            ),
            const SizedBox(height: 12),
            education.SearchField(
              controller: _searchController,
              onChanged: (value) => setState(() => _searchQuery = value),
              hintText: 'ابحث عن صفك أو مادتك',
            ),
            const SizedBox(height: 12),
            if (grades.isEmpty)
              const _EmptyCard(message: 'لا توجد صفوف دراسية متاحة حالياً.')
            else if (visibleGrades.isEmpty)
              const _EmptyCard(
                message:
                    'لم نعثر على صف أو مادة بهذا الاسم. جرّب البحث بكلمة أخرى.',
              )
            else
              GridView.builder(
                itemCount: visibleGrades.length,
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                  crossAxisCount: 2,
                  mainAxisSpacing: 12,
                  crossAxisSpacing: 12,
                  childAspectRatio: 1.28,
                ),
                itemBuilder: (context, index) =>
                    _GradeCard(grade: visibleGrades[index], index: index),
              ),
            const SizedBox(height: 28),
            _SectionRow(
              title: 'من أخبار المركز',
              caption: 'تحديثات وإعلانات تعليمية',
            ),
            const SizedBox(height: 12),
            if (data.news.isEmpty)
              const _EmptyCard(message: 'ستظهر أخبار المركز الجديدة هنا.')
            else
              ...data.news.take(3).map((item) => _NewsCard(item: item)),
            const SizedBox(height: 22),
            _JoinCard(
              isSignedIn: widget.student != null,
              onTap: widget.student != null
                  ? widget.onOpenStudentArea
                  : () => Navigator.of(context).push(
                      MaterialPageRoute<JsonMap>(
                        builder: (_) => const RegistrationScreen(),
                      ),
                    ),
            ),
            if ((settings['contactText'] as String? ?? '').isNotEmpty) ...[
              const SizedBox(height: 20),
              Text(
                settings['contactText'] as String,
                textAlign: TextAlign.center,
                style: Theme.of(context).textTheme.bodyMedium,
              ),
            ],
          ],
        ),
      );
    },
  );

  bool _matchesGrade(JsonMap grade) {
    final query = _searchQuery.trim().toLowerCase();
    if (query.isEmpty) return true;

    final searchableText = [
      grade['title'],
      grade['name'],
      grade['stage'],
      ...asJsonList(grade['subjects']).map((subject) => subject['name']),
    ].whereType<String>().join(' ').toLowerCase();
    return searchableText.contains(query);
  }
}

class _HomeData {
  const _HomeData(this.catalog, this.news);

  final JsonMap catalog;
  final List<JsonMap> news;
}

class _WelcomeHeader extends StatelessWidget {
  const _WelcomeHeader({
    required this.centerName,
    required this.student,
    required this.onOpenStudentArea,
  });

  final String centerName;
  final JsonMap? student;
  final VoidCallback onOpenStudentArea;

  @override
  Widget build(BuildContext context) => DecoratedBox(
    decoration: BoxDecoration(
      gradient: const LinearGradient(
        begin: AlignmentDirectional.topStart,
        end: AlignmentDirectional.bottomEnd,
        colors: [EliteColors.wine, EliteColors.deepWine],
      ),
      borderRadius: BorderRadius.circular(26),
      boxShadow: [
        BoxShadow(
          color: EliteColors.deepWine.withValues(alpha: .18),
          blurRadius: 22,
          offset: const Offset(0, 10),
        ),
      ],
    ),
    child: ClipRRect(
      borderRadius: BorderRadius.circular(26),
      child: Stack(
        children: [
          PositionedDirectional(
            end: -58,
            top: -72,
            child: Container(
              width: 190,
              height: 190,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: Colors.white.withValues(alpha: .045),
              ),
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 18, 20, 20),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Container(
                      width: 48,
                      height: 48,
                      padding: const EdgeInsets.all(5),
                      decoration: BoxDecoration(
                        color: Colors.white.withValues(alpha: .12),
                        borderRadius: BorderRadius.circular(16),
                        border: Border.all(
                          color: EliteColors.gold.withValues(alpha: .55),
                        ),
                      ),
                      child: Image.asset(
                        'assets/elite-logo.webp',
                        fit: BoxFit.contain,
                        errorBuilder: (_, _, _) => const Icon(
                          Icons.school_rounded,
                          color: EliteColors.gold,
                          size: 28,
                        ),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            centerName,
                            style: Theme.of(context).textTheme.titleMedium
                                ?.copyWith(color: Colors.white),
                          ),
                          const SizedBox(height: 3),
                          Text(
                            'تعليم • متابعة • إنجاز',
                            style: Theme.of(context).textTheme.bodySmall
                                ?.copyWith(
                                  color: EliteColors.goldPale,
                                  fontWeight: FontWeight.w500,
                                ),
                          ),
                        ],
                      ),
                    ),
                    IconButton.filledTonal(
                      onPressed: onOpenStudentArea,
                      tooltip: student == null
                          ? 'تسجيل الدخول'
                          : 'مساحة الطالب',
                      style: IconButton.styleFrom(
                        backgroundColor: Colors.white.withValues(alpha: .12),
                        foregroundColor: Colors.white,
                      ),
                      icon: Icon(
                        student == null
                            ? Icons.person_outline_rounded
                            : Icons.space_dashboard_rounded,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 24),
                Text(
                  student == null
                      ? 'رحلتك التعليمية\nتبدأ بخطوة.'
                      : 'أهلاً بعودتك،\n${student?['studentName'] ?? 'طالبنا العزيز'}',
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: Theme.of(
                    context,
                  ).textTheme.headlineMedium?.copyWith(color: Colors.white),
                ),
                const SizedBox(height: 8),
                Text(
                  'اكتشف صفك وموادك، وتابع كل ما يساعدك على التقدم.',
                  style: Theme.of(
                    context,
                  ).textTheme.bodyMedium?.copyWith(color: Colors.white70),
                ),
                const SizedBox(height: 17),
                FilledButton.icon(
                  onPressed: onOpenStudentArea,
                  icon: const Icon(Icons.arrow_back_rounded, size: 18),
                  label: Text(student == null ? 'دخول الطالب' : 'مساحة الطالب'),
                  style: FilledButton.styleFrom(
                    backgroundColor: Colors.white,
                    foregroundColor: EliteColors.wine,
                    minimumSize: const Size(0, 44),
                    padding: const EdgeInsets.symmetric(horizontal: 16),
                    textStyle: const TextStyle(fontWeight: FontWeight.w600),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    ),
  );
}

class _SystemStatus extends StatelessWidget {
  const _SystemStatus({required this.label, required this.isLive});

  final String label;
  final bool isLive;

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 13, vertical: 11),
    decoration: BoxDecoration(
      color: Colors.white,
      borderRadius: BorderRadius.circular(14),
      border: Border.all(color: EliteColors.line),
    ),
    child: Row(
      children: [
        Container(
          width: 8,
          height: 8,
          decoration: BoxDecoration(
            color: isLive ? EliteColors.green : EliteColors.gold,
            shape: BoxShape.circle,
            boxShadow: [
              BoxShadow(
                color: (isLive ? EliteColors.green : EliteColors.gold)
                    .withValues(alpha: .3),
                blurRadius: 7,
                spreadRadius: 1,
              ),
            ],
          ),
        ),
        const SizedBox(width: 9),
        Expanded(
          child: Text(
            label,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: Theme.of(context).textTheme.bodyMedium?.copyWith(
              color: EliteColors.ink,
              fontSize: 11,
            ),
          ),
        ),
        const SizedBox(width: 8),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 5),
          decoration: BoxDecoration(
            color: EliteColors.green.withValues(alpha: .08),
            borderRadius: BorderRadius.circular(20),
          ),
          child: Text(
            isLive ? 'متصل الآن' : 'قريباً',
            style: Theme.of(context).textTheme.labelSmall?.copyWith(
              color: isLive ? EliteColors.green : EliteColors.muted,
            ),
          ),
        ),
      ],
    ),
  );
}

class _StatStrip extends StatelessWidget {
  const _StatStrip({
    required this.grades,
    required this.subjects,
    required this.teachers,
  });

  final int grades;
  final int subjects;
  final int teachers;

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.symmetric(vertical: 15),
    decoration: BoxDecoration(
      color: Colors.white,
      borderRadius: BorderRadius.circular(16),
      border: Border.all(color: EliteColors.line),
    ),
    child: Row(
      children: [
        _StatItem(icon: Icons.school_outlined, value: '$grades', label: 'صفوف'),
        const _Divider(),
        _StatItem(
          icon: Icons.auto_stories_outlined,
          value: '$subjects',
          label: 'مادة',
        ),
        const _Divider(),
        _StatItem(
          icon: Icons.workspace_premium_outlined,
          value: '$teachers',
          label: 'مدرس',
        ),
      ],
    ),
  );
}

class _StatItem extends StatelessWidget {
  const _StatItem({
    required this.icon,
    required this.value,
    required this.label,
  });

  final IconData icon;
  final String value;
  final String label;

  @override
  Widget build(BuildContext context) => Expanded(
    child: Column(
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(icon, size: 15, color: EliteColors.gold),
            const SizedBox(width: 5),
            Text(
              value,
              style: Theme.of(context).textTheme.titleLarge?.copyWith(
                color: EliteColors.wine,
                fontSize: 20,
              ),
            ),
          ],
        ),
        const SizedBox(height: 3),
        Text(
          label,
          style: Theme.of(context).textTheme.bodyMedium?.copyWith(
            fontSize: 10,
            fontWeight: FontWeight.w600,
          ),
        ),
      ],
    ),
  );
}

class _Divider extends StatelessWidget {
  const _Divider();

  @override
  Widget build(BuildContext context) =>
      Container(width: 1, height: 34, color: EliteColors.line);
}

class _SectionRow extends StatelessWidget {
  const _SectionRow({
    required this.title,
    required this.caption,
    this.actionLabel,
    this.onAction,
  });

  final String title;
  final String caption;
  final String? actionLabel;
  final VoidCallback? onAction;

  @override
  Widget build(BuildContext context) => education.SectionHeader(
    title: title,
    subtitle: caption,
    actionLabel: actionLabel,
    onAction: onAction,
  );
}

class _GradeCard extends StatelessWidget {
  const _GradeCard({required this.grade, required this.index});

  final JsonMap grade;
  final int index;

  @override
  Widget build(BuildContext context) {
    final subjects = asJsonList(grade['subjects']);
    return HoverDepth(
      depth: 7,
      borderRadius: BorderRadius.circular(19),
      child: Material(
        color: Colors.white,
        borderRadius: BorderRadius.circular(19),
        child: InkWell(
          borderRadius: BorderRadius.circular(19),
          onTap: () => showModalBottomSheet<void>(
            context: context,
            isScrollControlled: true,
            backgroundColor: EliteColors.paper,
            builder: (_) => _GradeDetails(grade: grade),
          ),
          child: Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(19),
              border: Border.all(color: EliteColors.line),
            ),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Container(
                      width: 40,
                      height: 40,
                      padding: const EdgeInsets.all(2),
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        gradient: LinearGradient(
                          begin: Alignment.topRight,
                          end: Alignment.bottomLeft,
                          colors: [
                            EliteColors.goldPale,
                            EliteColors.gold,
                            EliteColors.wine,
                          ],
                        ),
                        border: Border.all(
                          color: Colors.white.withValues(alpha: .75),
                          width: 1.2,
                        ),
                        boxShadow: [
                          BoxShadow(
                            color: EliteColors.wine.withValues(alpha: .2),
                            blurRadius: 9,
                            offset: const Offset(0, 4),
                          ),
                        ],
                      ),
                      child: Container(
                        alignment: Alignment.center,
                        decoration: const BoxDecoration(
                          shape: BoxShape.circle,
                          gradient: LinearGradient(
                            begin: Alignment.topRight,
                            end: Alignment.bottomLeft,
                            colors: [
                              EliteColors.wineLight,
                              EliteColors.deepWine,
                            ],
                          ),
                        ),
                        child: Text(
                          '${grade['id'] ?? ''}',
                          style: const TextStyle(
                            color: EliteColors.goldPale,
                            fontSize: 14,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ),
                    ),
                    const Spacer(),
                    const Icon(
                      Icons.arrow_outward_rounded,
                      size: 16,
                      color: EliteColors.muted,
                    ),
                  ],
                ),
                const SizedBox(height: 16),
                Text(
                  grade['title'] as String? ?? grade['name'] as String? ?? '',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: Theme.of(context).textTheme.titleMedium,
                ),
                const SizedBox(height: 4),
                Text(
                  '${grade['stage'] ?? ''}  •  ${subjects.length} مواد',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: Theme.of(
                    context,
                  ).textTheme.bodyMedium?.copyWith(fontSize: 10),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _GradeDetails extends StatelessWidget {
  const _GradeDetails({required this.grade});

  final JsonMap grade;

  @override
  Widget build(BuildContext context) {
    final subjects = asJsonList(grade['subjects']);
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(20, 18, 20, 24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Center(
              child: Container(
                width: 38,
                height: 4,
                margin: const EdgeInsets.only(bottom: 20),
                decoration: BoxDecoration(
                  color: EliteColors.line,
                  borderRadius: BorderRadius.circular(8),
                ),
              ),
            ),
            const SectionLabel('المسار الدراسي'),
            const SizedBox(height: 6),
            Text(
              grade['title'] as String? ?? '',
              style: Theme.of(context).textTheme.headlineMedium,
            ),
            const SizedBox(height: 4),
            Text(
              grade['stage'] as String? ?? '',
              style: Theme.of(context).textTheme.bodyMedium,
            ),
            const SizedBox(height: 16),
            Flexible(
              child: ListView.separated(
                shrinkWrap: true,
                itemCount: subjects.length,
                separatorBuilder: (_, _) => const SizedBox(height: 8),
                itemBuilder: (context, index) =>
                    _SubjectRow(subject: subjects[index]),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _SubjectRow extends StatelessWidget {
  const _SubjectRow({required this.subject});

  final JsonMap subject;

  @override
  Widget build(BuildContext context) => HoverDepth(
    borderRadius: BorderRadius.circular(16),
    depth: 3,
    child: Container(
      padding: const EdgeInsets.all(13),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: EliteColors.line),
      ),
      child: Row(
        children: [
          Container(
            width: 39,
            height: 39,
            decoration: BoxDecoration(
              color: EliteColors.wine.withValues(alpha: .08),
              borderRadius: BorderRadius.circular(13),
            ),
            child: const Icon(
              Icons.auto_stories_outlined,
              color: EliteColors.wine,
              size: 19,
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  subject['name'] as String? ?? '',
                  style: Theme.of(context).textTheme.titleMedium,
                ),
                Text(
                  (subject['teachers'] as List? ?? const []).join('، '),
                  style: Theme.of(context).textTheme.bodyMedium,
                ),
              ],
            ),
          ),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 7),
            decoration: BoxDecoration(
              color: EliteColors.gold.withValues(alpha: .12),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Text(
              '${subject['price'] ?? '—'} ${subject['currency'] ?? ''}',
              textDirection: TextDirection.ltr,
              style: const TextStyle(
                color: EliteColors.wine,
                fontWeight: FontWeight.w600,
                fontSize: 11,
              ),
            ),
          ),
        ],
      ),
    ),
  );
}

class _NewsCard extends StatelessWidget {
  const _NewsCard({required this.item});

  final JsonMap item;

  @override
  Widget build(BuildContext context) => HoverDepth(
    borderRadius: BorderRadius.circular(20),
    depth: 4,
    child: Card(
      margin: const EdgeInsets.only(bottom: 9),
      child: Padding(
        padding: const EdgeInsets.all(15),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(
              width: 38,
              height: 38,
              decoration: BoxDecoration(
                color: EliteColors.gold.withValues(alpha: .15),
                borderRadius: BorderRadius.circular(13),
              ),
              child: const Icon(
                Icons.campaign_outlined,
                color: EliteColors.wine,
                size: 20,
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    item['title'] as String? ?? 'إعلان جديد',
                    style: Theme.of(context).textTheme.titleMedium,
                  ),
                  const SizedBox(height: 3),
                  Text(
                    item['summary'] as String? ??
                        item['description'] as String? ??
                        '',
                    maxLines: 3,
                    overflow: TextOverflow.ellipsis,
                    style: Theme.of(context).textTheme.bodyMedium,
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    ),
  );
}

class _JoinCard extends StatelessWidget {
  const _JoinCard({required this.isSignedIn, required this.onTap});

  final bool isSignedIn;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => HoverDepth(
    borderRadius: BorderRadius.circular(22),
    depth: 7,
    child: Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topRight,
          end: Alignment.bottomLeft,
          colors: [
            EliteColors.gold.withValues(alpha: .19),
            EliteColors.goldPale.withValues(alpha: .08),
          ],
        ),
        borderRadius: BorderRadius.circular(22),
        border: Border.all(color: EliteColors.gold.withValues(alpha: .3)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const SectionLabel('خطوتك القادمة'),
          const SizedBox(height: 8),
          Text(
            isSignedIn ? 'مساحتك الدراسية بانتظارك' : 'ابدأ رحلتك التعليمية',
            style: Theme.of(context).textTheme.titleLarge,
          ),
          const SizedBox(height: 4),
          Text(
            isSignedIn
                ? 'تابع إعلاناتك ونتائجك وتواصل مع مجتمع الطلاب.'
                : 'أرسل طلب تسجيل واختر الصف والمواد المناسبة لك.',
            style: Theme.of(context).textTheme.bodyMedium,
          ),
          const SizedBox(height: 13),
          SizedBox(
            width: double.infinity,
            child: FilledButton.icon(
              onPressed: onTap,
              icon: const Icon(Icons.arrow_back_rounded, size: 18),
              label: Text(isSignedIn ? 'مساحة الطالب' : 'طلب تسجيل'),
            ),
          ),
        ],
      ),
    ),
  );
}

class _EmptyCard extends StatelessWidget {
  const _EmptyCard({required this.message});

  final String message;

  @override
  Widget build(BuildContext context) => Card(
    child: education.EmptyStatePlaceholder(
      icon: Icons.school_outlined,
      title: 'لا توجد بيانات حالياً',
      message: message,
    ),
  );
}

class _HomeFailure extends StatelessWidget {
  const _HomeFailure({required this.message, required this.onRetry});

  final String message;
  final Future<void> Function() onRetry;

  @override
  Widget build(BuildContext context) => Center(
    child: Padding(
      padding: const EdgeInsets.all(28),
      child: education.ErrorBanner(message: message, onRetry: onRetry),
    ),
  );
}

class _TeacherCard extends StatelessWidget {
  const _TeacherCard({required this.name, required this.subjects});

  final String name;
  final Set<String> subjects;

  @override
  Widget build(BuildContext context) => Card(
    child: Padding(
      padding: const EdgeInsets.all(14),
      child: Row(
        children: [
          Container(
            width: 48,
            height: 48,
            padding: const EdgeInsets.all(2),
            decoration: const BoxDecoration(
              shape: BoxShape.circle,
              gradient: LinearGradient(
                colors: [EliteColors.goldPale, EliteColors.gold],
              ),
            ),
            child: CircleAvatar(
              backgroundColor: EliteColors.wine,
              foregroundColor: EliteColors.goldPale,
              child: Text(
                name.characters.first,
                style: const TextStyle(fontWeight: FontWeight.w600),
              ),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(name, style: Theme.of(context).textTheme.titleMedium),
                const SizedBox(height: 3),
                Text(
                  subjects.join('، '),
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: Theme.of(context).textTheme.bodyMedium,
                ),
              ],
            ),
          ),
          const SizedBox(width: 8),
          DataPill(
            icon: Icons.menu_book_outlined,
            label: '${subjects.length}',
            color: EliteColors.wine,
          ),
        ],
      ),
    ),
  );
}

class CatalogScreen extends StatefulWidget {
  const CatalogScreen({super.key});

  @override
  State<CatalogScreen> createState() => _CatalogScreenState();
}

class _CatalogScreenState extends State<CatalogScreen> {
  late Future<JsonMap> _catalog;

  @override
  void initState() {
    super.initState();
    _catalog = EliteApi.instance.catalog();
  }

  Future<void> _reloadCatalog() async {
    final next = EliteApi.instance.catalog(forceRefresh: true);
    setState(() => _catalog = next);
    await next;
  }

  @override
  Widget build(BuildContext context) => FutureBuilder<JsonMap>(
    future: _catalog,
    builder: (context, snapshot) {
      if (snapshot.hasError) {
        return Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: education.ErrorBanner(
              message: snapshot.error is ApiException
                  ? (snapshot.error! as ApiException).message
                  : 'تعذر تحميل المواد.',
              onRetry: _reloadCatalog,
            ),
          ),
        );
      }
      if (!snapshot.hasData) {
        return ListView(
          padding: EdgeInsets.all(20),
          children: const [education.ShimmerLoadingList(itemCount: 5)],
        );
      }
      final grades = asJsonList(snapshot.data!['grades']);
      final teachers = <String, Set<String>>{};
      for (final grade in grades) {
        for (final subject in asJsonList(grade['subjects'])) {
          for (final teacher
              in (subject['teachers'] as List? ?? const [])
                  .whereType<String>()) {
            teachers
                .putIfAbsent(teacher, () => <String>{})
                .add(subject['name'] as String? ?? '');
          }
        }
      }
      return DefaultTabController(
        length: 2,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Padding(
              padding: EdgeInsets.fromLTRB(20, 14, 20, 12),
              child: PageHeading(
                kicker: 'ACADEMIC CATALOG',
                title: 'المواد والمدرسون',
                subtitle: 'استكشف المسارات التعليمية واختر ما يناسبك.',
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 0, 20, 13),
              child: Container(
                padding: const EdgeInsets.all(15),
                decoration: BoxDecoration(
                  gradient: const LinearGradient(
                    begin: Alignment.topRight,
                    end: Alignment.bottomLeft,
                    colors: [EliteColors.wine, EliteColors.deepWine],
                  ),
                  borderRadius: BorderRadius.circular(20),
                  boxShadow: [
                    BoxShadow(
                      color: EliteColors.deepWine.withValues(alpha: .13),
                      blurRadius: 16,
                      offset: const Offset(0, 7),
                    ),
                  ],
                ),
                child: Row(
                  children: [
                    const Icon(
                      Icons.account_tree_outlined,
                      color: EliteColors.goldPale,
                      size: 23,
                    ),
                    const SizedBox(width: 11),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            'دليلك الدراسي',
                            style: Theme.of(context).textTheme.titleSmall
                                ?.copyWith(color: Colors.white),
                          ),
                          const SizedBox(height: 3),
                          Text(
                            '${grades.length} صفوف  •  ${teachers.length} مدرسين',
                            style: Theme.of(context).textTheme.bodySmall
                                ?.copyWith(
                                  color: EliteColors.goldPale,
                                  fontWeight: FontWeight.w500,
                                ),
                          ),
                        ],
                      ),
                    ),
                    const Icon(
                      Icons.auto_awesome_outlined,
                      color: EliteColors.gold,
                      size: 19,
                    ),
                  ],
                ),
              ),
            ),
            const Padding(
              padding: EdgeInsets.symmetric(horizontal: 20),
              child: DecoratedBox(
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.all(Radius.circular(14)),
                  border: Border.fromBorderSide(
                    BorderSide(color: EliteColors.line),
                  ),
                ),
                child: Padding(
                  padding: EdgeInsets.all(4),
                  child: TabBar(
                    indicator: BoxDecoration(
                      color: EliteColors.wine,
                      borderRadius: BorderRadius.all(Radius.circular(10)),
                    ),
                    indicatorSize: TabBarIndicatorSize.tab,
                    labelColor: Colors.white,
                    unselectedLabelColor: EliteColors.muted,
                    dividerColor: Colors.transparent,
                    labelStyle: TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
                    ),
                    tabs: [
                      Tab(text: 'الصفوف والمواد'),
                      Tab(text: 'المدرسون'),
                    ],
                  ),
                ),
              ),
            ),
            Expanded(
              child: TabBarView(
                children: [
                  ListView.separated(
                    padding: const EdgeInsets.all(20),
                    itemCount: grades.isEmpty ? 1 : grades.length,
                    separatorBuilder: (_, _) => const SizedBox(height: 10),
                    itemBuilder: (context, index) => grades.isEmpty
                        ? const education.EmptyStatePlaceholder(
                            icon: Icons.school_outlined,
                            title: 'لا توجد صفوف متاحة',
                            message: 'ستظهر الصفوف والمواد هنا عند إضافتها.',
                          )
                        : _GradeCard(grade: grades[index], index: index),
                  ),
                  ListView.separated(
                    padding: const EdgeInsets.all(20),
                    itemCount: teachers.isEmpty ? 1 : teachers.length,
                    separatorBuilder: (_, _) => const SizedBox(height: 10),
                    itemBuilder: (context, index) {
                      if (teachers.isEmpty) {
                        return const education.EmptyStatePlaceholder(
                          icon: Icons.person_search_outlined,
                          title: 'لا يوجد مدرسون متاحون',
                          message: 'ستظهر أسماء المدرسين هنا عند إضافتها.',
                        );
                      }
                      final entry = teachers.entries.elementAt(index);
                      return _TeacherCard(
                        name: entry.key,
                        subjects: entry.value,
                      );
                    },
                  ),
                ],
              ),
            ),
          ],
        ),
      );
    },
  );
}
