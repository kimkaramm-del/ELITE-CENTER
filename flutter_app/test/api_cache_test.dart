import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:elite_center/data/api_cache.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  test('persists and restores a cached API response', () async {
    SharedPreferences.setMockInitialValues({
      'elite-center:api-cache:/api/news': 'invalid json',
    });

    final cache = ApiCache.instance;
    expect(await cache.read('/api/news'), isNull);

    const payload = {
      'items': [
        {'title': 'خبر'},
      ],
    };
    await cache.write('/api/catalog', payload);

    final cached = await cache.read('/api/catalog');
    expect(cached?.payload, payload);
    expect(cached?.isFresh, isTrue);
    expect(cached?.isUsableOffline, isTrue);
  });
}
