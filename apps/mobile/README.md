# aifazi.net Mobile App

Expo React Native app for iOS and Android.

## Setup

```bash
npm install
npx expo start
```

## Build

```bash
# Development build
eas build --profile development

# Production build
eas build --profile production
```

## Environment Variables

Copy `.env.example` to `.env` and set:

- `EXPO_PUBLIC_API_URL` — Backend API URL
- `EXPO_PUBLIC_SUPABASE_URL` — Supabase project URL
- `EXPO_PUBLIC_SUPABASE_ANON_KEY` — Supabase anonymous key

## Architecture

- **Expo Router** for navigation
- **PASETO v4** tokens for authentication (no JWT)
- **E2E encryption** for chat messages
- **EAS Updates** for OTA updates
