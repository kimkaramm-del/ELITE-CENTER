import 'package:material_ui/material_ui.dart';

import '../data/api_client.dart';
import '../theme.dart';
import '../widgets/education_widgets.dart' as education;
import 'auth_screens.dart';

class FeedScreen extends StatefulWidget {
  const FeedScreen({required this.student, required this.onLogin, super.key});

  final JsonMap? student;
  final VoidCallback onLogin;

  @override
  State<FeedScreen> createState() => _FeedScreenState();
}

class _FeedScreenState extends State<FeedScreen> {
  final _composer = TextEditingController();
  List<JsonMap> _posts = [];
  int? _nextCursor;
  bool _isLoading = true;
  bool _isBusy = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    if (widget.student != null) _load();
  }

  @override
  void didUpdateWidget(covariant FeedScreen oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.student == null && widget.student != null) {
      _posts = [];
      _nextCursor = null;
      _load();
    } else if (oldWidget.student != null && widget.student == null) {
      _posts = [];
      _nextCursor = null;
      _error = null;
      _isLoading = false;
    }
  }

  @override
  void dispose() {
    _composer.dispose();
    super.dispose();
  }

  Future<void> _load({bool append = false}) async {
    setState(() {
      _isLoading = true;
      _error = null;
    });
    try {
      final result = await EliteApi.instance.communityPosts(
        cursor: append ? (_nextCursor ?? 0) : 0,
      );
      if (!mounted) return;
      setState(() {
        final items = asJsonList(result['items']);
        _posts = append ? [..._posts, ...items] : items;
        _nextCursor = result['nextCursor'] as int?;
      });
    } on ApiException catch (error) {
      if (mounted) setState(() => _error = error.message);
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  Future<void> _publish() async {
    final text = _composer.text.trim();
    if (text.isEmpty || _isBusy) return;
    setState(() {
      _isBusy = true;
      _error = null;
    });
    try {
      final result = await EliteApi.instance.createPost(text);
      if (!mounted) return;
      setState(() {
        _posts = [asJsonMap(result['item']), ..._posts];
        _composer.clear();
      });
      FocusScope.of(context).unfocus();
    } on ApiException catch (error) {
      if (mounted) setState(() => _error = error.message);
    } finally {
      if (mounted) setState(() => _isBusy = false);
    }
  }

  Future<void> _togglePost(String id, {required bool reaction}) async {
    final index = _posts.indexWhere((post) => post['id'] == id);
    if (index < 0) return;
    try {
      final result = reaction
          ? await EliteApi.instance.reactToPost(id)
          : await EliteApi.instance.bookmarkPost(id);
      if (!mounted) return;
      setState(() {
        _posts[index] = {..._posts[index], ...result};
      });
    } on ApiException catch (error) {
      if (mounted) setState(() => _error = error.message);
    }
  }

  Future<void> _openComments(JsonMap post) async {
    final added = await showModalBottomSheet<JsonMap>(
      context: context,
      isScrollControlled: true,
      backgroundColor: EliteColors.paper,
      builder: (_) => _CommentsSheet(post: post),
    );
    if (added == null || !mounted) return;
    setState(() {
      _posts = _posts.map((item) {
        if (item['id'] != post['id']) return item;
        return {
          ...item,
          'comments': [...asJsonList(item['comments']), added],
          'commentCount': (item['commentCount'] as int? ?? 0) + 1,
        };
      }).toList();
    });
  }

  @override
  Widget build(BuildContext context) {
    if (widget.student == null) {
      return _SignInPrompt(onLogin: widget.onLogin);
    }
    return RefreshIndicator(
      color: EliteColors.wine,
      onRefresh: () => _load(),
      child: ListView(
        padding: const EdgeInsets.fromLTRB(20, 16, 20, 26),
        children: [
          HoverDepth(
            depth: 8,
            borderRadius: BorderRadius.circular(21),
            child: TechnicalBackdrop(
              borderRadius: BorderRadius.circular(21),
              child: Padding(
                padding: const EdgeInsets.all(17),
                child: Row(
                  children: [
                    Container(
                      width: 43,
                      height: 43,
                      decoration: BoxDecoration(
                        color: Colors.white.withValues(alpha: .1),
                        borderRadius: BorderRadius.circular(15),
                        border: Border.all(
                          color: EliteColors.gold.withValues(alpha: .55),
                        ),
                      ),
                      child: const Icon(
                        Icons.forum_outlined,
                        color: EliteColors.goldPale,
                      ),
                    ),
                    const SizedBox(width: 11),
                    const Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          SectionLabel('STUDENT COMMUNITY / LIVE'),
                          SizedBox(height: 4),
                          Text(
                            'موجز الطلاب',
                            style: TextStyle(
                              color: Colors.white,
                              fontSize: 19,
                              fontWeight: FontWeight.w800,
                            ),
                          ),
                        ],
                      ),
                    ),
                    const DataPill(
                      icon: Icons.lock_outline,
                      label: 'آمن',
                      color: EliteColors.goldPale,
                    ),
                  ],
                ),
              ),
            ),
          ),
          const SizedBox(height: 9),
          const Text(
            'مساحة آمنة لتبادل الفائدة والمعرفة باحترام.',
            style: TextStyle(color: EliteColors.muted, fontSize: 12),
          ),
          const SizedBox(height: 17),
          HoverDepth(
            borderRadius: BorderRadius.circular(20),
            depth: 6,
            child: Container(
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(20),
                border: Border.all(color: EliteColors.line),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      CircleAvatar(
                        radius: 17,
                        backgroundColor: EliteColors.wine.withValues(alpha: .1),
                        child: const Icon(
                          Icons.edit_note_rounded,
                          color: EliteColors.wine,
                          size: 20,
                        ),
                      ),
                      const SizedBox(width: 9),
                      const Text(
                        'شارك فكرة أو سؤالاً',
                        style: TextStyle(
                          color: EliteColors.ink,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                      const Spacer(),
                      const DataPill(
                        icon: Icons.lock_outline,
                        label: 'خاص بالطلاب',
                        color: EliteColors.green,
                      ),
                    ],
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: _composer,
                    maxLength: 2000,
                    maxLines: 3,
                    decoration: const InputDecoration(
                      hintText: 'ما الفائدة التي تود مشاركتها اليوم؟',
                      counterText: '',
                    ),
                  ),
                  const SizedBox(height: 9),
                  SizedBox(
                    width: double.infinity,
                    child: FilledButton.icon(
                      onPressed: _isBusy ? null : _publish,
                      icon: const Icon(Icons.send_rounded, size: 17),
                      label: Text(_isBusy ? 'جارٍ النشر...' : 'نشر في الموجز'),
                    ),
                  ),
                ],
              ),
            ),
          ),
          if (_error != null) ...[
            const SizedBox(height: 12),
            education.ErrorBanner(
              message: _error!,
              onRetry: () => _load(),
              onDismiss: () => setState(() => _error = null),
            ),
          ],
          const SizedBox(height: 22),
          Row(
            children: [
              Expanded(
                child: Text(
                  'آخر المشاركات',
                  style: Theme.of(context).textTheme.titleLarge,
                ),
              ),
              Text(
                '${_posts.length} مشاركة',
                style: Theme.of(context).textTheme.labelSmall,
              ),
            ],
          ),
          const SizedBox(height: 11),
          if (_isLoading && _posts.isEmpty)
            const education.ShimmerLoadingList(itemCount: 3)
          else if (_posts.isEmpty && _error == null)
            const _EmptyStudentState(
              icon: Icons.forum_outlined,
              title: 'لا توجد مشاركات بعد',
              message: 'كن أول من يشارك فائدة مع زملائه.',
            )
          else ...[
            ..._posts.map(
              (post) => _PostCard(
                post: post,
                onReaction: () =>
                    _togglePost(post['id'] as String, reaction: true),
                onBookmark: () =>
                    _togglePost(post['id'] as String, reaction: false),
                onComments: () => _openComments(post),
              ),
            ),
            if (_nextCursor != null)
              OutlinedButton.icon(
                onPressed: _isLoading ? null : () => _load(append: true),
                icon: const Icon(Icons.expand_more_rounded),
                label: Text(_isLoading ? 'جارٍ التحميل...' : 'مشاركات أقدم'),
              ),
          ],
        ],
      ),
    );
  }
}

class _PostCard extends StatelessWidget {
  const _PostCard({
    required this.post,
    required this.onReaction,
    required this.onBookmark,
    required this.onComments,
  });

  final JsonMap post;
  final VoidCallback onReaction;
  final VoidCallback onBookmark;
  final VoidCallback onComments;

  @override
  Widget build(BuildContext context) {
    final author = asJsonMap(post['author']);
    return HoverDepth(
      borderRadius: BorderRadius.circular(20),
      depth: 5,
      child: Card(
        margin: const EdgeInsets.only(bottom: 11),
        child: Padding(
          padding: const EdgeInsets.all(15),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  CircleAvatar(
                    radius: 19,
                    backgroundColor: EliteColors.gold.withValues(alpha: .2),
                    foregroundColor: EliteColors.wine,
                    child: Text(
                      (author['studentName'] as String? ?? 'ط')
                          .characters
                          .first,
                      style: const TextStyle(fontWeight: FontWeight.w800),
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            Flexible(
                              child: Text(
                                author['studentName'] as String? ?? 'طالب',
                                overflow: TextOverflow.ellipsis,
                                style: const TextStyle(
                                  color: EliteColors.ink,
                                  fontWeight: FontWeight.w700,
                                ),
                              ),
                            ),
                            if (author['isTeacher'] == true) ...[
                              const SizedBox(width: 5),
                              const _RoleBadge(isTeacher: true),
                            ] else if (author['isVerified'] == true) ...[
                              const SizedBox(width: 5),
                              const _RoleBadge(isTeacher: false),
                            ],
                          ],
                        ),
                        Text(
                          '${author['grade'] ?? ''}  •  ${_formatDate(post['createdAt'])}',
                          style: Theme.of(
                            context,
                          ).textTheme.bodyMedium?.copyWith(fontSize: 10),
                        ),
                      ],
                    ),
                  ),
                  const Icon(
                    Icons.verified_rounded,
                    size: 16,
                    color: EliteColors.green,
                  ),
                ],
              ),
              const SizedBox(height: 13),
              Text(
                post['text'] as String? ?? '',
                style: Theme.of(context).textTheme.bodyLarge,
              ),
              const SizedBox(height: 12),
              const Divider(height: 1, color: EliteColors.line),
              Row(
                children: [
                  _PostAction(
                    icon: (post['isLiked'] as bool? ?? false)
                        ? Icons.favorite_rounded
                        : Icons.favorite_border_rounded,
                    label: '${post['reactionCount'] ?? 0}',
                    isActive: post['isLiked'] as bool? ?? false,
                    onTap: onReaction,
                  ),
                  _PostAction(
                    icon: Icons.mode_comment_outlined,
                    label: '${post['commentCount'] ?? 0}',
                    onTap: onComments,
                  ),
                  const Spacer(),
                  IconButton(
                    tooltip: post['isSaved'] == true
                        ? 'إزالة من المحفوظات'
                        : 'حفظ المنشور',
                    onPressed: onBookmark,
                    icon: Icon(
                      post['isSaved'] == true
                          ? Icons.bookmark_rounded
                          : Icons.bookmark_border_rounded,
                      color: post['isSaved'] == true
                          ? EliteColors.wine
                          : EliteColors.muted,
                      size: 20,
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _PostAction extends StatelessWidget {
  const _PostAction({
    required this.icon,
    required this.label,
    required this.onTap,
    this.isActive = false,
  });

  final IconData icon;
  final String label;
  final VoidCallback onTap;
  final bool isActive;

  @override
  Widget build(BuildContext context) => TextButton.icon(
    onPressed: onTap,
    style: TextButton.styleFrom(
      foregroundColor: isActive ? EliteColors.wine : EliteColors.muted,
      padding: const EdgeInsets.symmetric(horizontal: 8),
      textStyle: const TextStyle(fontSize: 11),
    ),
    icon: Icon(icon, size: 17),
    label: Text(label),
  );
}

class _CommentsSheet extends StatefulWidget {
  const _CommentsSheet({required this.post});

  final JsonMap post;

  @override
  State<_CommentsSheet> createState() => _CommentsSheetState();
}

class _CommentsSheetState extends State<_CommentsSheet> {
  final _text = TextEditingController();
  bool _sending = false;
  String? _error;

  @override
  void dispose() {
    _text.dispose();
    super.dispose();
  }

  Future<void> _send() async {
    if (_text.text.trim().isEmpty || _sending) return;
    setState(() {
      _sending = true;
      _error = null;
    });
    try {
      final result = await EliteApi.instance.addComment(
        widget.post['id'] as String,
        _text.text,
      );
      if (mounted) Navigator.of(context).pop(asJsonMap(result['item']));
    } on ApiException catch (error) {
      if (mounted) setState(() => _error = error.message);
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final comments = asJsonList(widget.post['comments']);
    return SafeArea(
      child: Padding(
        padding: EdgeInsets.fromLTRB(
          20,
          18,
          20,
          MediaQuery.viewInsetsOf(context).bottom + 18,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    'التعليقات',
                    style: Theme.of(context).textTheme.titleLarge,
                  ),
                ),
                Text('${widget.post['commentCount'] ?? comments.length}'),
              ],
            ),
            const SizedBox(height: 12),
            if (comments.isEmpty)
              const Padding(
                padding: EdgeInsets.all(18),
                child: Text('كن أول من يعلّق على هذه المشاركة.'),
              )
            else
              Flexible(
                child: ListView.separated(
                  shrinkWrap: true,
                  itemCount: comments.length,
                  separatorBuilder: (_, _) =>
                      const Divider(height: 12, color: EliteColors.line),
                  itemBuilder: (context, index) {
                    final comment = comments[index];
                    final author = asJsonMap(comment['author']);
                    return Align(
                      alignment: AlignmentDirectional.centerStart,
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Flexible(
                            child: Text.rich(
                              TextSpan(
                                children: [
                                  TextSpan(
                                    text: '${author['studentName'] ?? 'طالب'}: ',
                                    style: const TextStyle(
                                      fontWeight: FontWeight.w700,
                                    ),
                                  ),
                                  TextSpan(
                                    text: comment['text'] as String? ?? '',
                                  ),
                                ],
                              ),
                            ),
                          ),
                          if (author['isTeacher'] == true) ...[
                            const SizedBox(width: 5),
                            const _RoleBadge(isTeacher: true),
                          ] else if (author['isVerified'] == true) ...[
                            const SizedBox(width: 5),
                            const _RoleBadge(isTeacher: false),
                          ],
                        ],
                      ),
                    );
                  },
                ),
              ),
            const SizedBox(height: 10),
            Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: _text,
                    maxLength: 1000,
                    maxLines: 1,
                    decoration: const InputDecoration(
                      hintText: 'أضف تعليقاً...',
                      counterText: '',
                      contentPadding: EdgeInsets.symmetric(
                        horizontal: 14,
                        vertical: 12,
                      ),
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                IconButton.filled(
                  onPressed: _sending ? null : _send,
                  icon: const Icon(Icons.send_rounded),
                ),
              ],
            ),
            if (_error != null) ...[
              const SizedBox(height: 8),
              education.ErrorBanner(
                message: _error!,
                onRetry: _send,
                onDismiss: () => setState(() => _error = null),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _RoleBadge extends StatelessWidget {
  const _RoleBadge({required this.isTeacher});

  final bool isTeacher;

  @override
  Widget build(BuildContext context) => Tooltip(
    message: isTeacher ? 'أستاذ معتمد' : 'طالب موثق',
    child: Icon(
      isTeacher ? Icons.school_rounded : Icons.verified_rounded,
      size: 16,
      color: const Color(0xFF1976D2),
    ),
  );
}

class AccountScreen extends StatefulWidget {
  const AccountScreen({
    required this.student,
    required this.onLogin,
    required this.onLogout,
    super.key,
  });

  final JsonMap? student;
  final VoidCallback onLogin;
  final Future<void> Function() onLogout;

  @override
  State<AccountScreen> createState() => _AccountScreenState();
}

class _AccountScreenState extends State<AccountScreen> {
  late Future<JsonMap>? _profile;
  bool _isLoggingOut = false;
  String? _logoutError;

  @override
  void initState() {
    super.initState();
    _profile = widget.student == null ? null : EliteApi.instance.profile();
  }

  @override
  void didUpdateWidget(covariant AccountScreen oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.student == null && widget.student != null) {
      _profile = EliteApi.instance.profile();
    } else if (oldWidget.student != null && widget.student == null) {
      _profile = null;
    }
  }

  Future<void> _logout() async {
    setState(() {
      _isLoggingOut = true;
      _logoutError = null;
    });
    try {
      await widget.onLogout();
    } on ApiException catch (error) {
      if (mounted) setState(() => _logoutError = error.message);
    } finally {
      if (mounted) setState(() => _isLoggingOut = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final student = widget.student;
    if (student == null) {
      return ListView(
        padding: const EdgeInsets.fromLTRB(20, 16, 20, 26),
        children: [
          PageHeading(
            kicker: 'مساحة الطالب',
            title: 'مساحة الطالب',
            subtitle: 'سجّل الدخول لمتابعة بياناتك الدراسية بأمان.',
          ),
          const SizedBox(height: 22),
          HoverDepth(
            depth: 9,
            child: TechnicalBackdrop(
              child: Padding(
                padding: const EdgeInsets.all(20),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Icon(
                      Icons.shield_moon_outlined,
                      color: EliteColors.gold,
                      size: 32,
                    ),
                    const SizedBox(height: 13),
                    const Text(
                      'مساحة خاصة بك',
                      style: TextStyle(
                        color: Colors.white,
                        fontSize: 21,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    const SizedBox(height: 5),
                    const Text(
                      'نتائجك، طلباتك، وإعلانات الإدارة في مكان واحد.',
                      style: TextStyle(color: Colors.white70, height: 1.6),
                    ),
                    const SizedBox(height: 17),
                    SizedBox(
                      width: double.infinity,
                      child: FilledButton(
                        onPressed: widget.onLogin,
                        style: FilledButton.styleFrom(
                          backgroundColor: EliteColors.gold,
                          foregroundColor: EliteColors.ink,
                        ),
                        child: const Text('تسجيل الدخول'),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
          const SizedBox(height: 12),
          OutlinedButton.icon(
            onPressed: () => Navigator.of(context).push(
              MaterialPageRoute<JsonMap>(
                builder: (_) => const RegistrationScreen(),
              ),
            ),
            icon: const Icon(Icons.person_add_alt_1_rounded),
            label: const Text('طلب تسجيل جديد'),
          ),
        ],
      );
    }

    return FutureBuilder<JsonMap>(
      future: _profile,
      builder: (context, snapshot) {
        final profile = snapshot.data ?? student;
        final isTeacher =
            profile['role'] == 'teacher' || profile['isTeacher'] == true;
        final subjects = (profile['subjects'] as List? ?? const [])
            .whereType<String>()
            .toList();
        return ListView(
          padding: const EdgeInsets.fromLTRB(20, 16, 20, 28),
          children: [
            PageHeading(
              kicker: 'الملف الدراسي',
              title: isTeacher ? 'حساب الأستاذ' : 'ملفي الدراسي',
              subtitle: isTeacher
                  ? 'حساب معتمد من إدارة مركز النخبة.'
                  : 'بيانات اشتراكك ومساحتك التعليمية.',
            ),
            const SizedBox(height: 17),
            if (snapshot.hasError)
              education.ErrorBanner(
                message: snapshot.error is ApiException
                    ? (snapshot.error! as ApiException).message
                    : 'تعذر تحميل بيانات الملف الشخصي.',
                onRetry: () {
                  setState(() => _profile = EliteApi.instance.profile());
                },
              )
            else if (!snapshot.hasData)
              const education.ShimmerLoadingList(itemCount: 1)
            else
              _StudentIdCard(profile: profile),
            if (!isTeacher) ...[
              const SizedBox(height: 12),
              const SizedBox(height: 21),
              Text(
                'الخدمات الدراسية',
                style: Theme.of(context).textTheme.titleLarge,
              ),
              const SizedBox(height: 10),
              _AccountLink(
                icon: Icons.assessment_outlined,
                title: 'علاماتي',
                subtitle: 'النتائج المعتمدة من إدارة المركز',
                onTap: () => _openSection(context, StudentSection.marks),
              ),
              _AccountLink(
                icon: Icons.campaign_outlined,
                title: 'إعلانات الإدارة',
                subtitle: 'التنبيهات والتحديثات الخاصة بالطلاب',
                onTap: () =>
                    _openSection(context, StudentSection.announcements),
              ),
              _AccountLink(
                icon: Icons.receipt_long_outlined,
                title: 'طلباتي',
                subtitle: 'حالة طلبات التسجيل والمواد المختارة',
                onTap: () => _openSection(context, StudentSection.requests),
              ),
              _AccountLink(
                icon: Icons.menu_book_outlined,
                title: 'المواد المسجلة',
                subtitle: subjects.isEmpty
                    ? 'تواصل مع الإدارة لمعرفة مواد اشتراكك'
                    : subjects.join('، '),
                onTap: () => _openSection(context, StudentSection.requests),
              ),
            ],
            const SizedBox(height: 14),
            if (_logoutError != null)
              education.ErrorBanner(
                message: _logoutError!,
                onRetry: _logout,
                onDismiss: () => setState(() => _logoutError = null),
              ),
            const SizedBox(height: 8),
            OutlinedButton.icon(
              onPressed: _isLoggingOut ? null : _logout,
              icon: const Icon(Icons.logout_rounded),
              label: Text(
                _isLoggingOut ? 'جارٍ تسجيل الخروج...' : 'تسجيل الخروج',
              ),
              style: OutlinedButton.styleFrom(
                foregroundColor: EliteColors.red,
                minimumSize: const Size.fromHeight(50),
                side: BorderSide(color: EliteColors.red.withValues(alpha: .3)),
              ),
            ),
            const SizedBox(height: 18),
            const Center(
              child: Text(
                'ELITE CENTER  •  SECURE STUDENT SPACE',
                textDirection: TextDirection.ltr,
                style: TextStyle(
                  color: EliteColors.muted,
                  fontSize: 8,
                  letterSpacing: 1,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ),
          ],
        );
      },
    );
  }

  void _openSection(BuildContext context, StudentSection section) {
    Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => StudentContentScreen(section: section),
      ),
    );
  }
}

class _StudentIdCard extends StatelessWidget {
  const _StudentIdCard({required this.profile});

  final JsonMap profile;

  @override
  Widget build(BuildContext context) {
    final isTeacher =
        profile['role'] == 'teacher' || profile['isTeacher'] == true;
    return HoverDepth(
      depth: 10,
      child: TechnicalBackdrop(
        child: Padding(
          padding: const EdgeInsets.all(19),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  const Icon(
                    Icons.badge_outlined,
                    color: EliteColors.gold,
                    size: 21,
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      isTeacher
                          ? 'TEACHER ACCESS CARD'
                          : 'STUDENT ACCESS CARD',
                      textDirection: TextDirection.ltr,
                      style: const TextStyle(
                        color: EliteColors.goldPale,
                        fontSize: 9,
                        letterSpacing: 1.1,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
                  DataPill(
                    icon: isTeacher
                        ? Icons.school_rounded
                        : Icons.check_circle_outline,
                    label: isTeacher ? 'أستاذ معتمد' : 'اشتراك نشط',
                    color: isTeacher
                        ? const Color(0xFF90CAF9)
                        : EliteColors.goldPale,
                  ),
                ],
              ),
              const SizedBox(height: 20),
              Row(
                children: [
                  Flexible(
                    child: Text(
                      profile['name'] as String? ??
                          profile['studentName'] as String? ??
                          'الطالب',
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 23,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                  ),
                  if (isTeacher) ...[
                    const SizedBox(width: 6),
                    const _RoleBadge(isTeacher: true),
                  ],
                ],
              ),
              const SizedBox(height: 4),
              Text(
                profile['email'] as String? ?? '',
                textDirection: TextDirection.ltr,
                style: const TextStyle(color: Colors.white70, fontSize: 12),
              ),
              const SizedBox(height: 16),
              const Divider(color: Colors.white24, height: 1),
              const SizedBox(height: 13),
              Row(
                children: [
                  const Icon(
                    Icons.school_outlined,
                    size: 16,
                    color: EliteColors.gold,
                  ),
                  const SizedBox(width: 7),
                  Text(
                    profile['grade'] as String? ?? 'الصف الدراسي',
                    style: const TextStyle(color: Colors.white, fontSize: 12),
                  ),
                  const Spacer(),
                  const Text(
                    'ID • VERIFIED',
                    textDirection: TextDirection.ltr,
                    style: TextStyle(
                      color: EliteColors.goldPale,
                      fontSize: 8,
                      letterSpacing: .9,
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _AccountLink extends StatelessWidget {
  const _AccountLink({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.onTap,
  });

  final IconData icon;
  final String title;
  final String subtitle;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => HoverDepth(
    borderRadius: BorderRadius.circular(18),
    depth: 4,
    child: Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: ListTile(
        onTap: onTap,
        leading: Container(
          width: 40,
          height: 40,
          decoration: BoxDecoration(
            color: EliteColors.gold.withValues(alpha: .14),
            borderRadius: BorderRadius.circular(14),
          ),
          child: Icon(icon, size: 20, color: EliteColors.wine),
        ),
        title: Text(
          title,
          style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14),
        ),
        subtitle: Text(subtitle, style: const TextStyle(fontSize: 11)),
        trailing: const Icon(
          Icons.chevron_left_rounded,
          size: 20,
          color: EliteColors.muted,
        ),
      ),
    ),
  );
}

enum StudentSection { marks, announcements, requests }

class StudentContentScreen extends StatefulWidget {
  const StudentContentScreen({required this.section, super.key});

  final StudentSection section;

  @override
  State<StudentContentScreen> createState() => _StudentContentScreenState();
}

class _StudentContentScreenState extends State<StudentContentScreen> {
  late Future<List<JsonMap>> _items;

  String get _title => switch (widget.section) {
    StudentSection.marks => 'علاماتي',
    StudentSection.announcements => 'إعلانات الإدارة',
    StudentSection.requests => 'طلباتي',
  };

  @override
  void initState() {
    super.initState();
    _items = _load();
  }

  Future<List<JsonMap>> _load() async {
    final result = switch (widget.section) {
      StudentSection.marks => await EliteApi.instance.marks(),
      StudentSection.announcements => await EliteApi.instance.announcements(),
      StudentSection.requests => await EliteApi.instance.myRequests(),
    };
    return asJsonList(result['items']);
  }

  Future<void> _reload() async {
    final next = _load();
    setState(() => _items = next);
    await next;
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(
      title: Text(_title),
      leading: IconButton(
        onPressed: () => Navigator.of(context).maybePop(),
        icon: const Icon(Icons.arrow_forward_rounded),
      ),
    ),
    body: Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(18, 12, 18, 10),
          child: TechnicalBackdrop(
            borderRadius: BorderRadius.circular(20),
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Row(
                children: [
                  Container(
                    width: 42,
                    height: 42,
                    decoration: BoxDecoration(
                      color: Colors.white.withValues(alpha: .1),
                      borderRadius: BorderRadius.circular(14),
                    ),
                    child: Icon(_sectionIcon, color: EliteColors.goldPale),
                  ),
                  const SizedBox(width: 11),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const SectionLabel('سجلات الطالب'),
                        const SizedBox(height: 3),
                        Text(
                          _title,
                          style: const TextStyle(
                            color: Colors.white,
                            fontSize: 18,
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                      ],
                    ),
                  ),
                  const Icon(
                    Icons.verified_user_outlined,
                    color: EliteColors.gold,
                    size: 20,
                  ),
                ],
              ),
            ),
          ),
        ),
        Expanded(
          child: FutureBuilder<List<JsonMap>>(
            future: _items,
            builder: (context, snapshot) {
              if (snapshot.hasError) {
                return Center(
                  child: Padding(
                    padding: const EdgeInsets.all(22),
                    child: education.ErrorBanner(
                      message: snapshot.error is ApiException
                          ? (snapshot.error! as ApiException).message
                          : 'تعذر تحميل البيانات.',
                      onRetry: _reload,
                    ),
                  ),
                );
              }
              if (!snapshot.hasData) {
                return ListView(
                  padding: EdgeInsets.all(18),
                  children: const [education.ShimmerLoadingList(itemCount: 3)],
                );
              }
              final items = snapshot.data!;
              if (items.isEmpty) {
                final isMarks = widget.section == StudentSection.marks;
                return education.EmptyStatePlaceholder(
                  icon: isMarks
                      ? Icons.assessment_outlined
                      : Icons.inbox_outlined,
                  title: isMarks
                      ? 'لا توجد علامات منشورة'
                      : 'لا توجد عناصر حالياً',
                  message: isMarks
                      ? 'ستظهر نتائجك هنا بعد اعتمادها من إدارة المركز.'
                      : 'ستظهر التحديثات الجديدة هنا عند توفرها.',
                );
              }
              return ListView.separated(
                padding: const EdgeInsets.all(18),
                itemCount: items.length,
                separatorBuilder: (_, _) => const SizedBox(height: 9),
                itemBuilder: (context, index) =>
                    _contentCard(context, items[index]),
              );
            },
          ),
        ),
      ],
    ),
  );

  IconData get _sectionIcon => switch (widget.section) {
    StudentSection.marks => Icons.auto_graph_rounded,
    StudentSection.announcements => Icons.campaign_outlined,
    StudentSection.requests => Icons.receipt_long_outlined,
  };

  Widget _contentCard(BuildContext context, JsonMap item) {
    switch (widget.section) {
      case StudentSection.marks:
        final score = item['score'] ?? '—';
        final maxScore = item['maxScore'] ?? '—';
        return Card(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Row(
              children: [
                const Icon(
                  Icons.auto_graph_rounded,
                  color: EliteColors.wine,
                  size: 22,
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        item['subject'] as String? ?? '',
                        style: Theme.of(context).textTheme.titleMedium,
                      ),
                      Text(
                        '${item['exam'] ?? ''}  •  ${item['term'] ?? ''}',
                        style: Theme.of(context).textTheme.bodyMedium,
                      ),
                      Text(
                        item['date'] as String? ?? '',
                        style: Theme.of(context).textTheme.bodyMedium,
                      ),
                    ],
                  ),
                ),
                Text(
                  '$score / $maxScore',
                  textDirection: TextDirection.ltr,
                  style: const TextStyle(
                    color: EliteColors.wine,
                    fontSize: 15,
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ],
            ),
          ),
        );
      case StudentSection.announcements:
        return Card(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    const Icon(
                      Icons.campaign_outlined,
                      color: EliteColors.wine,
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        _formatDate(item['createdAt']),
                        style: Theme.of(context).textTheme.bodyMedium,
                      ),
                    ),
                    if (item['isRead'] != true)
                      const DataPill(
                        icon: Icons.circle,
                        label: 'جديد',
                        color: EliteColors.green,
                      ),
                  ],
                ),
                const SizedBox(height: 11),
                Text(
                  item['text'] as String? ?? '',
                  style: Theme.of(context).textTheme.bodyLarge,
                ),
                if (item['isRead'] != true &&
                    (item['notificationId'] as String? ?? '').isNotEmpty)
                  Align(
                    alignment: AlignmentDirectional.centerStart,
                    child: TextButton(
                      onPressed: () async {
                        try {
                          await EliteApi.instance.markNotificationRead(
                            item['notificationId'] as String,
                          );
                          if (mounted) {
                            setState(() => _items = _load());
                          }
                        } on ApiException catch (error) {
                          if (!context.mounted) return;
                          ScaffoldMessenger.of(context).showSnackBar(
                            SnackBar(content: Text(error.message)),
                          );
                        }
                      },
                      child: const Text('تحديد كمقروء'),
                    ),
                  ),
              ],
            ),
          ),
        );
      case StudentSection.requests:
        final status = item['status'] as String? ?? 'pending';
        final statusLabel = switch (status) {
          'approved' => 'تمت الموافقة',
          'rejected' => 'مرفوض',
          _ => 'قيد المراجعة',
        };
        final statusColor = status == 'approved'
            ? EliteColors.green
            : status == 'rejected'
            ? EliteColors.red
            : EliteColors.gold;
        return Card(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        item['gradeTitle'] as String? ?? 'طلب تسجيل',
                        style: Theme.of(context).textTheme.titleMedium,
                      ),
                    ),
                    DataPill(
                      icon: Icons.circle,
                      label: statusLabel,
                      color: statusColor,
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                Text(
                  (item['subjects'] as List? ?? const []).join('، '),
                  style: Theme.of(context).textTheme.bodyMedium,
                ),
                if ((item['statusMessage'] as String? ?? '').isNotEmpty) ...[
                  const SizedBox(height: 7),
                  Text(
                    item['statusMessage'] as String,
                    style: Theme.of(context).textTheme.bodyMedium,
                  ),
                ],
                const SizedBox(height: 7),
                Text(
                  'تاريخ الطلب: ${_formatDate(item['createdAt'])}',
                  style: Theme.of(context).textTheme.labelSmall,
                ),
              ],
            ),
          ),
        );
    }
  }
}

class _SignInPrompt extends StatelessWidget {
  const _SignInPrompt({required this.onLogin});

  final VoidCallback onLogin;

  @override
  Widget build(BuildContext context) => Center(
    child: Padding(
      padding: const EdgeInsets.all(28),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 76,
            height: 76,
            decoration: BoxDecoration(
              color: EliteColors.gold.withValues(alpha: .15),
              borderRadius: BorderRadius.circular(26),
            ),
            child: const Icon(
              Icons.lock_person_outlined,
              color: EliteColors.wine,
              size: 36,
            ),
          ),
          const SizedBox(height: 17),
          Text(
            'موجز خاص بالطلاب',
            style: Theme.of(context).textTheme.titleLarge,
          ),
          const SizedBox(height: 6),
          Text(
            'سجّل الدخول لمتابعة مجتمع الطلاب والمشاركة فيه.',
            textAlign: TextAlign.center,
            style: Theme.of(context).textTheme.bodyMedium,
          ),
          const SizedBox(height: 17),
          FilledButton(onPressed: onLogin, child: const Text('تسجيل الدخول')),
        ],
      ),
    ),
  );
}

class _EmptyStudentState extends StatelessWidget {
  const _EmptyStudentState({
    required this.icon,
    required this.title,
    required this.message,
  });

  final IconData icon;
  final String title;
  final String message;

  @override
  Widget build(BuildContext context) => education.EmptyStatePlaceholder(
    icon: icon,
    title: title,
    message: message,
  );
}

String _formatDate(Object? value) {
  final date = DateTime.tryParse(value as String? ?? '')?.toLocal();
  if (date == null) return '';
  return '${date.year}/${date.month.toString().padLeft(2, '0')}/${date.day.toString().padLeft(2, '0')}';
}
