# Nova AI

A starter Android AI assistant built with Expo (React Native) and a small Node.js backend.
It uses Groq's OpenAI-compatible Chat Completions API. The Groq secret stays on the backend,
never inside the Android app.

## What is included
- Chat screen with streaming-style response display (request/response)
- Local chat history stored on the device
- New chat
- Image picker UI and image-capable request plumbing (configure a Groq vision model)
- Text-to-speech for reading assistant replies
- Secure backend proxy for Groq

## Important
This is a source project, not a compiled APK. An APK must be built with Expo EAS Build.
The app cannot call Groq until you deploy the backend and set its URL in `app.json`.
Free Groq usage has limits and model availability can change.

## 1. Create the Groq backend
1. Deploy the `server` folder to a Node.js host that supports environment variables.
2. Set `GROQ_API_KEY` to your secret key in the host's environment-variable settings.
3. Optionally set `GROQ_TEXT_MODEL` (default: `llama-3.3-70b-versatile`).
4. Optionally set `GROQ_VISION_MODEL` to a currently available vision model in your Groq console.
5. Set `APP_ORIGIN=*` for initial testing, or restrict it to your app's web origin if applicable.
6. Copy the deployed HTTPS URL.

Never put the Groq API key in the app, source code, screenshots, or chat messages.

## 2. Configure the app
Open `app.json` and replace `https://YOUR-BACKEND.example.com` with your deployed backend URL.

## 3. Build an Android APK
You need a free Expo account and EAS CLI:
```bash
npm install
npm install -g eas-cli
eas login
eas build:configure
eas build -p android --profile preview
```
The EAS build page provides the APK download when the build finishes. Use the APK on your Android phone to install.

## 4. Run locally
```bash
npm install
npx expo start
```

## Notes
- Voice output uses the phone's text-to-speech engine.
- Voice input is not enabled in this first starter because Android speech-recognition permissions and native plugin configuration need device testing.
- Image requests require a vision model currently enabled for your Groq account. The app displays a useful error if the backend is not configured.
