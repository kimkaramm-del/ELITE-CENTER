import 'dart:async';
import 'dart:convert';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:http/http.dart' as http;

typedef JsonMap = Map<String, dynamic>;

class ApiException implements Exception {
  const ApiException(this.message, {this.statusCode});

  final String message;
  final int? statusCode;

  @override
  String toString() => message;
}

class EliteApi {
  EliteApi._();

  static final EliteApi instance = EliteApi._();
  static const _tokenKey = 'elite-center:student-session';
  static const _apiBase = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'http://10.0.2.2:3001',
  );
  static const _secureStorage = FlutterSecureStorage();

  final http.Client _client = http.Client();
  String? _token;

  bool get hasSession => _token != null;

  Future<JsonMap?> restoreSession() async {
    _token = await _secureStorage.read(key: _tokenKey);
    if (_token == null) return null;
    try {
      return await request('/api/session');
    } on ApiException catch (error) {
      if (error.statusCode == 401 || error.statusCode == 403) {
        await clearSession();
        return null;
      }
      rethrow;
    }
  }

  Future<JsonMap> request(
    String path, {
    String method = 'GET',
    Object? body,
    bool authenticated = true,
  }) async {
    final headers = <String, String>{
      'accept': 'application/json',
      'origin': 'https://localhost',
    };
    if (body != null) headers['content-type'] = 'application/json';
    if (authenticated && _token != null) {
      headers['authorization'] = 'Bearer $_token';
    }

    final uri = Uri.parse('$_apiBase$path');
    late http.Response response;
    try {
      response = await _client
          .send(
            http.Request(method, uri)
              ..headers.addAll(headers)
              ..body = body == null ? '' : jsonEncode(body),
          )
          .then(http.Response.fromStream)
          .timeout(const Duration(seconds: 25));
    } on TimeoutException {
      throw const ApiException(
        'انتهت مهلة الاتصال. تحقق من الإنترنت وحاول مجدداً.',
      );
    } on http.ClientException {
      throw const ApiException(
        'تعذر الاتصال بخادم مركز النخبة. تحقق من عنوان الخادم واتصال الإنترنت.',
      );
    } on FormatException {
      throw const ApiException('عنوان خادم API غير صالح.');
    }

    JsonMap payload;
    try {
      final decoded = jsonDecode(response.body);
      payload = decoded is Map<String, dynamic> ? decoded : <String, dynamic>{};
    } on FormatException {
      throw const ApiException('استجاب الخادم ببيانات غير مفهومة.');
    }

    if (response.statusCode == 401 || response.statusCode == 403) {
      if (authenticated) await clearSession();
    }
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw ApiException(
        payload['error'] as String? ??
            'تعذر إكمال الطلب (${response.statusCode}).',
        statusCode: response.statusCode,
      );
    }
    return payload;
  }

  Future<JsonMap> verifyCode(String email, String code) async {
    final result = await request(
      '/api/verify-code',
      method: 'POST',
      authenticated: false,
      body: {'email': email.trim().toLowerCase(), 'code': code.trim()},
    );
    final token = result['sessionToken'];
    if (token is! String || token.isEmpty) {
      throw const ApiException('لم يُنشئ الخادم جلسة آمنة لهذا الجهاز.');
    }
    await _secureStorage.write(key: _tokenKey, value: token);
    _token = token;
    return request('/api/session');
  }

  Future<void> clearSession() async {
    _token = null;
    await _secureStorage.delete(key: _tokenKey);
  }

  Future<void> logout() async {
    await request('/api/logout', method: 'POST');
    await clearSession();
  }

  Future<JsonMap> catalog() => request('/api/catalog', authenticated: false);

  Future<JsonMap> news() => request('/api/news', authenticated: false);

  Future<JsonMap> registrationRequest(JsonMap values) => request(
    '/api/requests',
    method: 'POST',
    authenticated: false,
    body: values,
  );

  Future<JsonMap> profile() => request('/api/profile');

  Future<JsonMap> myRequests() => request('/api/my-requests');

  Future<JsonMap> marks() => request('/api/marks');

  Future<JsonMap> announcements() => request('/api/announcements');

  Future<JsonMap> communityPosts({int cursor = 0, String query = ''}) {
    final parameters = <String, String>{'cursor': '$cursor'};
    if (query.trim().isNotEmpty) parameters['q'] = query.trim();
    return request(
      '/api/community/posts?${Uri(queryParameters: parameters).query}',
    );
  }

  Future<JsonMap> myCommunityPosts() => request('/api/community/mine');

  Future<JsonMap> createPost(String text) =>
      request('/api/community/posts', method: 'POST', body: {'text': text});

  Future<JsonMap> reactToPost(String id) =>
      request('/api/community/posts/$id/reaction', method: 'POST');

  Future<JsonMap> bookmarkPost(String id) =>
      request('/api/community/posts/$id/bookmark', method: 'POST');

  Future<JsonMap> addComment(String id, String text) => request(
    '/api/community/posts/$id/comments',
    method: 'POST',
    body: {'text': text},
  );

  Future<JsonMap> markNotificationRead(String id) =>
      request('/api/notifications/$id/read', method: 'POST');

  void close() => _client.close();
}

JsonMap asJsonMap(Object? value) =>
    value is Map<String, dynamic> ? value : <String, dynamic>{};

List<JsonMap> asJsonList(Object? value) => value is List
    ? value.whereType<Map<String, dynamic>>().toList()
    : <JsonMap>[];
