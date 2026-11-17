# مركز النخبة

تطبيق الطلاب الأصلي مبني بـ Flutter في `flutter_app/`. يستخدم التطبيق واجهة Node.js API في `server/` للكتالوج وتسجيل الدخول والبيانات الخاصة بالطالب.

## تشغيل API

يتطلب Node.js 22.13 أو أحدث. انسخ `.env.example` إلى `.env` واضبط القيم المحلية، ثم شغّل:

```sh
npm ci
npm start
```

يستمع API افتراضياً على `http://127.0.0.1:3001`. يقرأ الكتالوج الأولي من `server/catalog.json` ويحفظ بيانات التشغيل في SQLite. غيّر `API_PORT` و`API_HOST` عند الحاجة. لا ترفع `.env` أو قاعدة البيانات أو بيانات الطلاب إلى Git.

للنشر على Render، يثبت `render.yaml` الاعتماديات ويشغّل API مع فحص صحة على `/api/health` وقرص بيانات دائم في `/var/data`. اضبط `ADMIN_ACCESS_CODE` وبيانات Firebase كمتغيرات سرية في خدمة الاستضافة. شغّل نسخة واحدة من الخادم لكل قاعدة SQLite.

## تطبيق الهاتف (Flutter)

يتطلب Flutter stable وAndroid SDK وJDK 21. لتشغيل التطبيق من مجلد Flutter:

```sh
cd flutter_app
flutter pub get
flutter run --dart-define=API_BASE_URL=http://10.0.2.2:3001
```

العنوان أعلاه لمحاكي Android عند تشغيل API محلياً. على جهاز فعلي استخدم عنوان الجهاز الذي يشغّل API مع `API_HOST=0.0.0.0`، أو مرّر عنوان الخدمة المنشورة. القيمة الافتراضية للتطبيق هي `https://elite-center-server.onrender.com`.

لبناء APK إصدار Release أصغر حجماً ومقسّم حسب معمارية الجهاز من جذر المشروع:

```sh
npm run android:build
```

يتطلب الأمر إعداد `flutter_app/firebase-options.json` بالقيم الحقيقية كما في قسم Firebase أدناه. ينتج ثلاثة ملفات في `flutter_app/build/app/outputs/flutter-apk/`: اختر `app-arm64-v8a-release.apk` لمعظم الهواتف الحديثة، أو الملف المطابق لمعمارية جهازك. ولإنشاء APK Debug للتطوير استخدم `npm run android:build:debug`. إعداد توقيع Release الحالي يستخدم مفتاح Debug، لذلك الناتج للاختبار والتثبيت المباشر وليس للنشر على Google Play.

### إعداد Firebase

يستخدم التطبيق Firebase Authentication لتسجيل الدخول عبر Google وFirebase Cloud Messaging للإشعارات. أضف تطبيق Android بمعرّف الحزمة `com.elitecenter.elite_center` إلى مشروع Firebase، وفعّل Google Authentication. جهّز `flutter_app/firebase-options.json` محلياً اعتماداً على `flutter_app/firebase-options.example.json`، ثم شغّل التطبيق باستخدام:

```sh
cd flutter_app
flutter run --dart-define-from-file=firebase-options.json
```

يحتاج الخادم إلى `FIREBASE_PROJECT_ID` و`FIREBASE_SERVICE_ACCOUNT_JSON` كمتغيرات بيئة سرية للتحقق من رموز Firebase. لا تضف بيانات Service Account إلى التطبيق أو Git.

عند تسجيل طالب جديد عبر Google، يُفتح نموذج التسجيل مع تعبئة الاسم والبريد الموثقين. يبقى الطلب بانتظار موافقة الإدارة، ثم يُربط اشتراكه بحساب Google عند تسجيل الدخول التالي. أما الطالب الذي لديه اشتراك قائم غير مربوط فيستخدم كود المعهد لربطه.

## التطوير والفحوصات

```sh
npm test
npm run lint
```

واختبارات Flutter:

```sh
cd flutter_app
flutter test
```
