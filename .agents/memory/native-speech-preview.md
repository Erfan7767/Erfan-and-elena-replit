---
name: Native speech preview
description: Native speech recognition is linked through the Expo config plugin and is not available inside a plain Expo Go client.
---

The app's native speech recognizer depends on the expo-speech-recognition config plugin and must be exercised in a development or standalone native build.

**Why:** Expo Go cannot bundle arbitrary native modules that are not part of its client.

**How to apply:** Keep the web speech implementation as a preview fallback, and use a native Android build when validating microphone permissions and SpeechRecognizer callbacks.