---
name: Gemini secret boundary
description: The mobile app uses a server-side Gemini proxy so provider credentials never ship in the Expo bundle.
---

Gemini credentials must remain server-side; the mobile client should call the routed API endpoint rather than embedding a provider key.

**Why:** Expo public variables are bundled into the client and can be extracted from a released app.

**How to apply:** Keep `GOOGLE_GEMINI_API_KEY` as a project secret and route model calls through the API server with explicit retry and error handling.