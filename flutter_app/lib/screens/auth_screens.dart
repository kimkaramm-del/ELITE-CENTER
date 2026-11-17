import 'package:material_ui/material_ui.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/services.dart';
import 'package:google_sign_in/google_sign_in.dart';

import '../data/api_client.dart';
import '../data/google_auth_service.dart';
import '../theme.dart';
import '../widgets/education_widgets.dart' as education;

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _code = TextEditingController();
  String _role = 'student';
  String? _firebaseToken;
  bool _isLoading = false;
  bool _needsCode = false;
  bool _pendingApproval = false;
  String? _error;
  String? _message;

  @override
  void dispose() {
    _code.dispose();
    super.dispose();
  }

  Future<void> _continueWithGoogle() async {
    if (_role == 'student' && _needsCode && _code.text.trim().isEmpty) {
      setState(() => _error = 'أدخل كود المعهد أولاً.');
      return;
    }
    setState(() {
      _isLoading = true;
      _error = null;
      _message = null;
    });
    try {
      final token = _firebaseToken == null
          ? await GoogleAuthService.signInAndGetIdToken()
          : await GoogleAuthService.refreshIdToken();
      final result = await EliteApi.instance.signInWithGoogle(
        idToken: token,
        role: _role,
        instituteCode: _code.text,
      );
      if (!mounted) return;
      if (result['needsRegistration'] == true) {
        final email = result['email'] as String?;
        if (email == null || email.isEmpty) {
          throw const ApiException('تعذر قراءة بريد حساب Google.');
        }
        await Navigator.of(context).push<void>(
          MaterialPageRoute(
            builder: (_) => RegistrationScreen(
              googleEmail: email,
              googleName: result['studentName'] as String? ?? '',
            ),
          ),
        );
      } else if (result['needsInstituteCode'] == true) {
        setState(() {
          _firebaseToken = token;
          _needsCode = true;
          _message =
              'هذا البريد مسجل لدى المركز. أدخل كود المعهد لربط اشتراكك بحساب Google.';
        });
      } else if (result['pendingApproval'] == true) {
        setState(() {
          _firebaseToken = token;
          _pendingApproval = true;
          _message = _role == 'teacher'
              ? 'تم إرسال طلب اعتماد حساب الأستاذ. ستظهر صلاحيات الحساب بعد موافقة الإدارة.'
              : 'طلب تسجيلك قيد المراجعة. سيتم ربط حساب Google تلقائياً بعد الموافقة.';
        });
      } else {
        Navigator.of(context).pop(result);
      }
    } on ApiException catch (error) {
      if (mounted) setState(() => _error = error.message);
    } on FirebaseAuthException catch (error) {
      if (mounted) {
        setState(
          () => _error =
              'تعذر تسجيل الدخول إلى Firebase: ${error.message ?? error.code}',
        );
      }
    } on GoogleSignInException catch (error) {
      if (mounted) {
        setState(() => _error = 'تعذر إكمال تسجيل الدخول إلى Google: $error');
      }
    } on PlatformException catch (error) {
      if (mounted) {
        setState(
          () =>
              _error = 'تعذر فتح تسجيل Google: ${error.message ?? error.code}',
        );
      }
    } on StateError catch (error) {
      if (mounted) setState(() => _error = error.message.toString());
    } on Exception catch (error) {
      if (mounted) setState(() => _error = 'تعذر تسجيل الدخول: $error');
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  void _selectRole(String role) {
    if (_role == role) return;
    setState(() {
      _role = role;
      _firebaseToken = null;
      _code.clear();
      _needsCode = false;
      _pendingApproval = false;
      _error = null;
      _message = null;
    });
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(
      title: Text(_role == 'teacher' ? 'دخول الأستاذ' : 'دخول الطالب'),
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
            title: 'دخول آمن إلى المركز',
            subtitle:
                'سجّل الدخول أو أنشئ طلب تسجيل طالب جديد باستخدام Google.',
          ),
          const SizedBox(height: 18),
          HoverDepth(
            depth: 6,
            child: Card(
              child: Padding(
                padding: const EdgeInsets.all(17),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    SegmentedButton<String>(
                      segments: const [
                        ButtonSegment(
                          value: 'student',
                          icon: Icon(Icons.school_outlined),
                          label: Text('طالب'),
                        ),
                        ButtonSegment(
                          value: 'teacher',
                          icon: Icon(Icons.school_outlined),
                          label: Text('أستاذ'),
                        ),
                      ],
                      selected: {_role},
                      onSelectionChanged: _isLoading
                          ? null
                          : (selection) => _selectRole(selection.first),
                    ),
                    const SizedBox(height: 17),
                    if (_needsCode && _role == 'student') ...[
                      TextField(
                        controller: _code,
                        textCapitalization: TextCapitalization.characters,
                        textDirection: TextDirection.ltr,
                        textAlign: TextAlign.left,
                        autofillHints: const [AutofillHints.oneTimeCode],
                        decoration: const InputDecoration(
                          labelText: 'كود المعهد',
                          hintText: 'ELITE-XXXXXXXX',
                          prefixIcon: Icon(Icons.key_rounded),
                        ),
                      ),
                      const SizedBox(height: 14),
                    ],
                    if (_pendingApproval && _message != null)
                      InlineMessage(_message!)
                    else if (_message != null)
                      InlineMessage(_message!),
                    if (_error != null) ...[
                      const SizedBox(height: 12),
                      InlineMessage(_error!, isError: true),
                    ],
                    const SizedBox(height: 16),
                    FilledButton.icon(
                      onPressed: _isLoading ? null : _continueWithGoogle,
                      icon: _isLoading
                          ? const SizedBox(
                              width: 20,
                              height: 20,
                              child: CircularProgressIndicator(
                                strokeWidth: 2,
                                color: Colors.white,
                              ),
                            )
                          : Icon(
                              _pendingApproval
                                  ? Icons.refresh_rounded
                                  : Icons.login_rounded,
                            ),
                      label: Text(
                        _isLoading
                            ? 'جارٍ التحقق...'
                            : _pendingApproval
                            ? 'تحديث حالة التسجيل'
                            : _needsCode
                            ? 'تأكيد كود المعهد'
                            : _role == 'teacher'
                            ? 'المتابعة باستخدام Google'
                            : 'الدخول باستخدام Google',
                      ),
                    ),
                    const SizedBox(height: 12),
                    Text(
                      _role == 'teacher'
                          ? 'حساب الأستاذ لا يُفعّل ولا تظهر شارة الأستاذ قبل موافقة إدارة المركز.'
                          : 'يجب أن يطابق بريد Google البريد المسجل لدى المركز. تحفظ جلسة API في التخزين الآمن.',
                      textAlign: TextAlign.center,
                      style: const TextStyle(
                        color: EliteColors.muted,
                        fontSize: 11,
                        height: 1.5,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
          if (_role == 'student') ...[
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
        ],
      ),
    ),
  );
}

class RegistrationScreen extends StatefulWidget {
  const RegistrationScreen({super.key, this.googleEmail, this.googleName});

  final String? googleEmail;
  final String? googleName;

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
    if (widget.googleEmail != null) _email.text = widget.googleEmail!;
    if (widget.googleName != null) _name.text = widget.googleName!;
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
      final values = <String, dynamic>{
        'name': _name.text.trim(),
        'phone': _phone.text.trim(),
        'email': _email.text.trim(),
        'gradeId': _gradeId,
        'programType': 'center',
        'subjectIds': _selectedSubjects.toList(),
      };
      if (widget.googleEmail != null) {
        values['googleIdToken'] = await GoogleAuthService.refreshIdToken();
      }
      final result = await EliteApi.instance.registrationRequest(values);
      if (!mounted) return;
      setState(() {
        _requestId = result['id'] as String?;
        _message = widget.googleEmail == null
            ? 'وصل طلبك إلى إدارة المركز. ستراجع الإدارة الطلب وتشاركك كود الدخول عند الموافقة.'
            : 'وصل طلبك المرتبط بحساب Google. بعد موافقة الإدارة سيتم ربط الحساب تلقائياً.';
      });
    } on ApiException catch (error) {
      if (mounted) setState(() => _message = error.message);
    } on FirebaseAuthException catch (error) {
      if (mounted) {
        setState(
          () => _message =
              'تعذر التحقق من حساب Google: ${error.message ?? error.code}',
        );
      }
    } on StateError catch (error) {
      if (mounted) setState(() => _message = error.message.toString());
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
              subtitle: 'أكمل بياناتك واختر الصف والمواد لإرسال طلبك للمراجعة.',
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
                            readOnly: widget.googleEmail != null,
                            autofillHints: const [AutofillHints.email],
                            decoration: InputDecoration(
                              labelText: 'البريد الإلكتروني',
                              hintText: 'name@example.com',
                              prefixIcon: Icon(Icons.alternate_email_rounded),
                              helperText: widget.googleEmail == null
                                  ? null
                                  : 'سيتم ربط الطلب ببريد Google الموثق.',
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
                                : Text(
                                    widget.googleEmail == null
                                        ? 'إرسال طلب التسجيل'
                                        : 'إرسال طلب التسجيل عبر Google',
                                  ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
            const SizedBox(height: 18),
            Text(
              widget.googleEmail == null
                  ? 'هذا طلب تسجيل للمراجعة وليس حساباً مفعّلاً. عند الموافقة ترسل الإدارة كود الدخول المرتبط ببريدك.'
                  : 'هذا طلب تسجيل للمراجعة وليس حساباً مفعّلاً. عند الموافقة سيتم ربط حساب Google تلقائياً.',
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
