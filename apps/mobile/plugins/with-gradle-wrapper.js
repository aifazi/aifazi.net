const fs = require('fs');
const path = require('path');
const { withDangerousMod } = require('@expo/config-plugins');

// The Expo SDK 57 / RN 0.87 Android toolchain (AGP applied by
// expo-modules-core) refuses to evaluate the project when the wrapper is
// older than Gradle 9.4.1 ("Minimum supported Gradle version is 9.4.1.
// Current version is 9.3.1"), but the prebuild template still ships
// gradle-9.3.1-bin.zip — so every `expo prebuild` (CI release builds, EAS)
// generates a project that cannot build until the wrapper is raised here.
// The wrapper jar only downloads the distributionUrl, so bumping the URL is
// sufficient; no jar regeneration needed.
//
// Idempotent and forward-safe: if a future template already ships >= the
// required version, it is left untouched.
const MIN_GRADLE_VERSION = [9, 4, 1];

function parseVersion(text) {
  const m = text.match(/gradle-(\d+)\.(\d+)(?:\.(\d+))-bin\.zip/);
  if (!m) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3] || 0)];
}

function isOlder(current, min) {
  for (let i = 0; i < min.length; i++) {
    if ((current[i] || 0) !== min[i]) return (current[i] || 0) < min[i];
  }
  return false;
}

module.exports = function withGradleWrapper(config) {
  config = withDangerousMod(config, [
    'android',
    (cfg) => {
      const file = path.join(
        cfg.modRequest.platformProjectRoot,
        'gradle',
        'wrapper',
        'gradle-wrapper.properties'
      );
      const contents = fs.readFileSync(file, 'utf8');
      const current = parseVersion(contents);
      if (!current || !isOlder(current, MIN_GRADLE_VERSION)) return cfg;
      const pinned = MIN_GRADLE_VERSION.join('.');
      const next = contents.replace(
        /gradle-\d+\.\d+(?:\.\d+)?-bin\.zip/,
        `gradle-${pinned}-bin.zip`
      );
      if (next !== contents) fs.writeFileSync(file, next);
      return cfg;
    },
  ]);
  return config;
};
