import 'package:material_ui/material_ui.dart';

import '../data/api_client.dart';
import '../theme.dart';
import '../widgets/education_widgets.dart' as education;

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _formKey = GlobalKey<FormState>();
  final _email = TextEditingController();
  final _code = TextEditingController();
  bool _isLoading = false;
  String? _error;

  @override
  void dispose() {
    _email.dispose();
    _code.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() {
      _isLoading = true;
      _error = null;
    });
    try {
      final student = await EliteApi.instance.verifyCode(
        _email.text,
        _code.text,
      );
      if (mounted) Navigator.of(context).pop(student);
    } on ApiException catch (error) {
      if (mounted) setState(() => _error = error.message);
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(
      title: const Text('دخول الطالب'),
      leading: IconButton(
        onPressed: () => Navigator.of(context).maybePop(),
        icon: const Icon(Icons.arrow_forward_rounded),
      ),
    ),
    body: SafeArea(
      child: ListView(
        padding: const EdgeInsets.fromLTRB(22, 8, 22, 30),
        children: [
          const PortalHero(
            kicker: 'STUDENT PORTAL / AUTH 01',
            title: 'أهلاً بعودتك.',
            subtitle: 'سجّل الدخول إلى مساحتك التعليمية الآمنة.',
            icon: Icons.school_outlined,
          ),
          const SizedBox(height: 25),
          const PageHeading(
            kicker: 'SECURE ACCESS',
            title: 'دخول مساحة الطالب',
            subtitle:
                'أدخل البريد الإلكتروني وكود الدخول المرسل من إدارة المركز.',
          ),
          const SizedBox(height: 18),
          HoverDepth(
            depth: 6,
            child: Card(
              child: Padding(
                padding: const EdgeInsets.all(17),
                child: Form(
                  key: _formKey,
                  child: Column(
                    children: [
                      TextFormField(
                        controller: _email,
                        keyboardType: TextInputType.emailAddress,
                        textDirection: TextDirection.ltr,
                        textAlign: TextAlign.left,
                        autofillHints: const [AutofillHints.email],
                        decoration: const InputDecoration(
                          labelText: 'البريد الإلكتروني',
                          hintText: 'name@example.com',
                          prefixIcon: Icon(Icons.alternate_email_rounded),
                        ),
                        validator: (value) {
                          final email = value?.trim() ?? '';
                          return RegExp(
                                r'^[^\s@]+@[^\s@]+\.[^\s@]+$',
                              ).hasMatch(email)
                              ? null
                              : 'أدخل بريداً إلكترونياً صالحاً.';
                        },
                      ),
                      const SizedBox(height: 13),
                      TextFormField(
                        controller: _code,
                        textCapitalization: TextCapitalization.characters,
                        textDirection: TextDirection.ltr,
                        textAlign: TextAlign.left,
                        autofillHints: const [AutofillHints.oneTimeCode],
                        decoration: const InputDecoration(
                          labelText: 'كود الدخول',
                          hintText: 'ELITE-XXXXXXXX',
                          prefixIcon: Icon(Icons.key_rounded),
                        ),
                        validator: (value) =>
                            (value?.trim().isNotEmpty ?? false)
                            ? null
                            : 'أدخل كود الدخول المرسل إليك.',
                      ),
                      if (_error != null) ...[
                        const SizedBox(height: 13),
                        InlineMessage(_error!, isError: true),
                      ],
                      const SizedBox(height: 18),
                      FilledButton(
                        onPressed: _isLoading ? null : _submit,
                        child: _isLoading
                            ? const SizedBox(
                                width: 22,
                                height: 22,
                                child: CircularProgressIndicator(
                                  strokeWidth: 2,
                                  color: Colors.white,
                                ),
                              )
                            : const Text('دخول الطالب'),
                      ),
                      const SizedBox(height: 13),
                      const Row(
                        children: [
                          Icon(
                            Icons.info_outline,
                            size: 16,
                            color: EliteColors.muted,
                          ),
                          SizedBox(width: 7),
                          Expanded(
                            child: Text(
                              'الكود مرتبط ببريدك المسجّل، وتحفظ الجلسة في التخزين الآمن للجهاز.',
                              style: TextStyle(
                                color: EliteColors.muted,
                                fontSize: 11,
                                height: 1.5,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
          const SizedBox(height: 22),
          OutlinedButton.icon(
            onPressed: () => Navigator.of(context).push(
              MaterialPageRoute<JsonMap>(
                builder: (_) => const RegistrationScreen(),
              ),
            ),
            icon: const Icon(Icons.person_add_alt_1_rounded),
            label: const Text('طالب جديد؟ أرسل طلب تسجيل'),
            style: OutlinedButton.styleFrom(
              foregroundColor: EliteColors.wine,
              minimumSize: const Size.fromHeight(52),
              side: const BorderSide(color: EliteColors.line),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(16),
              ),
            ),
          ),
        ],
      ),
    ),
  );
}

class RegistrationScreen extends StatefulWidget {
  const RegistrationScreen({super.key});

  @override
  State<RegistrationScreen> createState() => _RegistrationScreenState();
}

class _RegistrationScreenState extends State<RegistrationScreen> {
  final _formKey = GlobalKey<FormState>();
  final _name = TextEditingController();
  final _phone = TextEditingController();
  final _email = TextEditingController();
  late Future<JsonMap> _catalog;
  int? _gradeId;
  final Set<String> _selectedSubjects = {};
  bool _isSending = false;
  String? _message;
  String? _requestId;

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
  void dispose() {
    _name.dispose();
    _phone.dispose();
    _email.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    if (_selectedSubjects.isEmpty) {
      setState(() => _message = 'اختر مادة واحدة على الأقل.');
      return;
    }
    setState(() {
      _isSending = true;
      _message = null;
      _requestId = null;
    });
    try {
      final result = await EliteApi.instance.registrationRequest({
        'name': _name.text.trim(),
        'phone': _phone.text.trim(),
        'email': _email.text.trim(),
        'gradeId': _gradeId,
        'programType': 'center',
        'subjectIds': _selectedSubjects.toList(),
      });
      if (!mounted) return;
      setState(() {
        _requestId = result['id'] as String?;
        _message =
            'وصل طلبك إلى إدارة المركز. ستراجع الإدارة الطلب وتشاركك كود الدخول عند الموافقة.';
      });
    } on ApiException catch (error) {
      if (mounted) setState(() => _message = error.message);
    } finally {
      if (mounted) setState(() => _isSending = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(
      title: const Text('طلب تسجيل'),
      leading: IconButton(
        onPressed: () => Navigator.of(context).maybePop(),
        icon: const Icon(Icons.arrow_forward_rounded),
      ),
    ),
    body: FutureBuilder<JsonMap>(
      future: _catalog,
      builder: (context, snapshot) {
        if (snapshot.hasError) {
          return Center(
            child: Padding(
              padding: const EdgeInsets.all(22),
              child: education.ErrorBanner(
                message: snapshot.error is ApiException
                    ? (snapshot.error! as ApiException).message
                    : 'تعذر تحميل بيانات التسجيل.',
                onRetry: _reloadCatalog,
              ),
            ),
          );
        }
        if (!snapshot.hasData) {
          return ListView(
            padding: EdgeInsets.fromLTRB(20, 24, 20, 28),
            children: const [education.ShimmerLoadingList(itemCount: 4)],
          );
        }

        final grades = asJsonList(snapshot.data!['grades']);
        if (grades.isEmpty) {
          return const education.EmptyStatePlaceholder(
            icon: Icons.school_outlined,
            title: 'التسجيل غير متاح حالياً',
            message: 'لا توجد صفوف دراسية يمكن التسجيل فيها الآن.',
          );
        }
        if (_gradeId == null && grades.isNotEmpty) {
          _gradeId = grades.first['id'] as int?;
        }
        final grade = grades.cast<JsonMap?>().firstWhere(
          (item) => item?['id'] == _gradeId,
          orElse: () => null,
        );
        final subjects = asJsonList(grade?['subjects']);
        final registrationOpen =
            asJsonMap(snapshot.data!['settings'])['registrationOpen'] !=
                false &&
            asJsonMap(snapshot.data!['settings'])['registrationOpen'] !=
                'false';

        return ListView(
          padding: const EdgeInsets.fromLTRB(20, 8, 20, 28),
          children: [
            const PortalHero(
              kicker: 'NEW STUDENT / ENROLLMENT',
              title: 'ابدأ رحلتك معنا',
              subtitle: 'أدخل بياناتك واختر الصف والمواد لإرسال طلبك للمراجعة.',
              icon: Icons.auto_awesome_outlined,
            ),
            const SizedBox(height: 19),
            if (!registrationOpen)
              const InlineMessage(
                'التسجيل مغلق حالياً من إدارة المركز.',
                isError: true,
              )
            else
              HoverDepth(
                depth: 7,
                child: Card(
                  child: Padding(
                    padding: const EdgeInsets.all(17),
                    child: Form(
                      key: _formKey,
                      child: Column(
                        children: [
                          TextFormField(
                            controller: _name,
                            textInputAction: TextInputAction.next,
                            autofillHints: const [AutofillHints.name],
                            decoration: const InputDecoration(
                              labelText: 'اسم الطالب الكامل',
                              prefixIcon: Icon(Icons.person_outline_rounded),
                            ),
                            validator: (value) =>
                                (value?.trim().length ?? 0) >= 2
                                ? null
                                : 'أدخل اسم الطالب.',
                          ),
                          const SizedBox(height: 12),
                          TextFormField(
                            controller: _phone,
                            keyboardType: TextInputType.phone,
                            textDirection: TextDirection.ltr,
                            textAlign: TextAlign.left,
                            autofillHints: const [
                              AutofillHints.telephoneNumber,
                            ],
                            decoration: const InputDecoration(
                              labelText: 'رقم الهاتف',
                              hintText: '+963 9xx xxx xxx',
                              prefixIcon: Icon(Icons.phone_outlined),
                            ),
                            validator: (value) =>
                                RegExp(
                                  r'^[+\d\s()-]{7,24}$',
                                ).hasMatch(value?.trim() ?? '')
                                ? null
                                : 'أدخل رقم هاتف صالحاً.',
                          ),
                          const SizedBox(height: 12),
                          TextFormField(
                            controller: _email,
                            keyboardType: TextInputType.emailAddress,
                            textDirection: TextDirection.ltr,
                            textAlign: TextAlign.left,
                            autofillHints: const [AutofillHints.email],
                            decoration: const InputDecoration(
                              labelText: 'البريد الإلكتروني',
                              hintText: 'name@example.com',
                              prefixIcon: Icon(Icons.alternate_email_rounded),
                            ),
                            validator: (value) =>
                                RegExp(
                                  r'^[^\s@]+@[^\s@]+\.[^\s@]+$',
                                ).hasMatch(value?.trim() ?? '')
                                ? null
                                : 'تحقق من البريد الإلكتروني.',
                          ),
                          const SizedBox(height: 12),
                          DropdownButtonFormField<int>(
                            initialValue: _gradeId,
                            decoration: const InputDecoration(
                              labelText: 'الصف الدراسي',
                              prefixIcon: Icon(Icons.school_outlined),
                            ),
                            items: grades
                                .map(
                                  (item) => DropdownMenuItem<int>(
                                    value: item['id'] as int,
                                    child: Text(item['title'] as String? ?? ''),
                                  ),
                                )
                                .toList(),
                            onChanged: (value) => setState(() {
                              _gradeId = value;
                              _selectedSubjects.clear();
                            }),
                          ),
                          const SizedBox(height: 18),
                          Align(
                            alignment: AlignmentDirectional.centerStart,
                            child: Text(
                              'المواد المطلوبة',
                              style: Theme.of(context).textTheme.titleMedium,
                            ),
                          ),
                          const SizedBox(height: 4),
                          Align(
                            alignment: AlignmentDirectional.centerStart,
                            child: Text(
                              'اختر مادة واحدة على الأقل',
                              style: Theme.of(context).textTheme.bodyMedium,
                            ),
                          ),
                          const SizedBox(height: 10),
                          ...subjects.map((subject) {
                            final id = subject['id'] as String;
                            final selected = _selectedSubjects.contains(id);
                            return Card(
                              margin: const EdgeInsets.only(bottom: 8),
                              child: CheckboxListTile(
                                value: selected,
                                activeColor: EliteColors.wine,
                                controlAffinity:
                                    ListTileControlAffinity.leading,
                                title: Text(
                                  subject['name'] as String? ?? '',
                                  style: const TextStyle(
                                    fontSize: 14,
                                    fontWeight: FontWeight.w700,
                                  ),
                                ),
                                subtitle: Text(
                                  '${(subject['teachers'] as List? ?? const []).join('، ')}  •  ${subject['price'] ?? '—'} ${subject['currency'] ?? ''}',
                                  style: const TextStyle(fontSize: 11),
                                ),
                                onChanged: (value) => setState(() {
                                  if (value == true) {
                                    _selectedSubjects.add(id);
                                  } else {
                                    _selectedSubjects.remove(id);
                                  }
                                }),
                              ),
                            );
                          }),
                          if (_message != null) ...[
                            const SizedBox(height: 10),
                            InlineMessage(
                              _message!,
                              isError: _requestId == null,
                            ),
                          ],
                          if (_requestId != null) ...[
                            const SizedBox(height: 8),
                            DataPill(
                              icon: Icons.confirmation_number_outlined,
                              label: 'رقم الطلب: $_requestId',
                              color: EliteColors.wine,
                            ),
                          ],
                          const SizedBox(height: 15),
                          FilledButton(
                            onPressed: _isSending ? null : _submit,
                            child: _isSending
                                ? const SizedBox(
                                    width: 22,
                                    height: 22,
                                    child: CircularProgressIndicator(
                                      strokeWidth: 2,
                                      color: Colors.white,
                                    ),
                                  )
                                : const Text('إرسال طلب التسجيل'),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
            const SizedBox(height: 18),
            const Text(
              'هذا طلب تسجيل للمراجعة وليس حساباً مفعّلاً. عند الموافقة ترسل الإدارة كود الدخول المرتبط ببريدك.',
              textAlign: TextAlign.center,
              style: TextStyle(
                color: EliteColors.muted,
                fontSize: 11,
                height: 1.6,
              ),
            ),
          ],
        );
      },
    ),
  );
}
