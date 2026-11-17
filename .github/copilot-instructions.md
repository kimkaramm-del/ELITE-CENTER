# Project conventions

- The Android student app is built with Flutter; keep its Dart source in `flutter_app/lib/`.
- The app is Arabic-first and right-to-left. Preserve its existing Arabic localization and RTL layout.
- The Node.js API in `server/` provides services for the Flutter app. Grade, subject, teacher, and price records live in `server/catalog.json`.
- Keep credentials out of source control. Add only variable names to `.env.example`; put local values in an ignored `.env` file.
