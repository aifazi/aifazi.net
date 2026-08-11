const { withAppBuildGradle } = require('@expo/config-plugins');

const RELEASE_SIGNING = `
        release {
            if (project.hasProperty('MYAPP_UPLOAD_STORE_FILE')) {
                storeFile file("\${MYAPP_UPLOAD_STORE_FILE}")
                storePassword "\${MYAPP_UPLOAD_STORE_PASSWORD}"
                keyAlias "\${MYAPP_UPLOAD_KEY_ALIAS}"
                keyPassword "\${MYAPP_UPLOAD_KEY_PASSWORD}"
            }
        }`;

module.exports = function withReleaseSigning(config) {
  return withAppBuildGradle(config, (config) => {
    let contents = config.modResults.contents;

    // 1) Add a release signingConfig that activates only when the workflow
    // supplies MYAPP_UPLOAD_* gradle properties (see gradle.properties).
    const open = contents.indexOf('signingConfigs {');
    if (open !== -1 && contents.indexOf('MYAPP_UPLOAD_STORE_FILE') === -1) {
      const close = contents.indexOf('\n    }', open);
      contents = contents.slice(0, close) + RELEASE_SIGNING + contents.slice(close);
    }

    // 2) Point the release buildType at the release signingConfig. The debug
    // buildType uses "signingConfigs.debug" too, so only rewrite the LAST
    // occurrence (which belongs to the release buildType).
    const needle = 'signingConfig signingConfigs.debug';
    const last = contents.lastIndexOf(needle);
    if (last !== -1) {
      contents =
        contents.slice(0, last) + 'signingConfig signingConfigs.release' + contents.slice(last + needle.length);
    }

    config.modResults.contents = contents;
    return config;
  });
};
