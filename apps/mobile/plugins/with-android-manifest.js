const { withAndroidManifest } = require('@expo/config-plugins');

// Durable fix for android/, which is GENERATED (gitignored `/android`, never
// checked in) — editing android/app/src/main/AndroidManifest.xml on disk does
// not survive the next prebuild, so this plugin is the source of truth. It
// runs last in app.json `plugins` (after all Expo plugins) and requires a
// fresh `expo prebuild` to take effect.
//
// - Backup rules (audit P0-3): app.json sets expo-secure-store
//   configureAndroidBackup:false so its plugin deletes its own
//   @xml/secure_store_* references instead of re-adding them. This plugin
//   additionally forces allowBackup="false" / fullBackupOnly="false" and
//   drops any residual dataExtractionRules / fullBackupContent references
//   (belt-and-braces) so backups (and their unrestored-token footguns)
//   are off entirely.
// - Dev scheme (audit P1-6): drop the exp+fazi:// <data> entry from the
//   exported MainActivity intent-filter; only the `aifazi` scheme (app.json
//   `scheme`) remains.
// - Permission drift (audit P1-10, NOTE ONLY — no behavior change here):
//   READ/WRITE_EXTERNAL_STORAGE (maxSdkVersion 32), SYSTEM_ALERT_WINDOW and
//   VIBRATE in the generated manifest are injected by Expo plugins at
//   prebuild, not declared in app.json, so they cannot be dropped from
//   app.json. Grep status: VIBRATE is in use (notification channel
//   vibrationPattern in src/lib/push.ts) — keep. No SYSTEM_ALERT_WINDOW or
//   external-storage API usage was found in src/, but removing plugin-injected
//   permissions needs a permissions-blocklist + prebuild regen, so they are
//   intentionally left as-is.

// - LiveKit leftovers (audit batch B): the in-house voice/video path was
//   removed (calls live in Nextcloud Talk) and no livekit dep remains in
//   package.json/lock, but stale prebuilds still carry its manifest entries.
//   Strip the mic/voip/screen-share permissions it injected (RECORD_AUDIO,
//   MODIFY_AUDIO_SETTINGS, FOREGROUND_SERVICE_MICROPHONE,
//   FOREGROUND_SERVICE_MEDIA_PROJECTION), any livekit service, and the
//   io.livekit.* meta-data so the next prebuild comes out clean. NOTE: this
//   only takes effect after a fresh `expo prebuild` (android/ is generated).

// Stale LiveKit-injected permissions (voice/video removed; calls live in
// Nextcloud Talk). CAMERA is intentionally NOT listed — expo-image-picker
// still needs it for photo capture.
const LIVEKIT_PERMISSIONS = new Set([
  'android.permission.RECORD_AUDIO',
  'android.permission.MODIFY_AUDIO_SETTINGS',
  'android.permission.FOREGROUND_SERVICE_MICROPHONE',
  'android.permission.FOREGROUND_SERVICE_MEDIA_PROJECTION',
]);

module.exports = function withAndroidManifestFix(config) {
  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults.manifest;
    if (manifest['uses-permission']) {
      manifest['uses-permission'] = manifest['uses-permission'].filter(
        (entry) => !LIVEKIT_PERMISSIONS.has(entry.$ && entry.$['android:name'])
      );
    }
    const app = manifest.application && manifest.application[0];
    if (app) {
      if (app['meta-data']) {
        app['meta-data'] = app['meta-data'].filter(
          (entry) => {
            const name = entry.$ && entry.$['android:name'];
            return !name || !name.startsWith('io.livekit.');
          }
        );
      }
      if (app.service) {
        app.service = app.service.filter(
          (entry) => {
            const name = entry.$ && entry.$['android:name'];
            return !name || (!/livekit/i.test(name) && !/screenshare/i.test(name));
          }
        );
      }
    }
    if (app && app.$) {
      app.$['android:allowBackup'] = 'false';
      app.$['android:fullBackupOnly'] = 'false';
      delete app.$['android:dataExtractionRules'];
      delete app.$['android:fullBackupContent'];
    }
    const activities = (app && app.activity) || [];
    for (const activity of activities) {
      if (!activity['intent-filter']) continue;
      activity['intent-filter'] = activity['intent-filter'].filter((filter) => {
        if (!filter.data) return true;
        filter.data = filter.data.filter(
          (d) => d.$ && d.$['android:scheme'] !== 'exp+fazi'
        );
        // Drop the whole filter if no <data> remains: a VIEW filter without
        // data would match broadly instead of narrowly.
        if (filter.data.length === 0) return false;
        return true;
      });
    }
    return config;
  });
};
