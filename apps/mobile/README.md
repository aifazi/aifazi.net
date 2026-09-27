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

## Architecture

- **Expo Router** for navigation
- **PASETO v4** tokens for authentication (no JWT)
- **Nextcloud Talk** (external, `https://cloud.aifazi.net/apps/spreed/`) for chat & calls
- **EAS Updates** for OTA updates
