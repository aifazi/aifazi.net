const { withGradleProperties, withAppBuildGradle } = require('@expo/config-plugins');

// Cap Gradle + Kotlin daemon memory so the release build fits the
// 2-core / 7 GB GitHub Actions runner. The Expo prebuild template sets
// org.gradle.jvmargs=-Xmx2048m with org.gradle.parallel=true and no
// kotlin.daemon.jvmargs, so the Kotlin compiler daemon inherits the Gradle
// heap and, with the heavy LiveKit/WebRTC native modules, the two JVMs plus
// parallel workers exceed the cgroup and the kernel OOM-killer aborts
// :app:compileReleaseKotlin with "The operation was canceled."
//
// Gradle gets 4 GB heap + 1 GB metaspace: it must host R8
// (:app:minifyReleaseWithR8) and every :<module>:lintVitalAnalyzeRelease
// in-process, and on this codebase (LiveKit/WebRTC/reanimated) a 2 GB heap
// OOMs R8 ("GC overhead limit exceeded") while a 512 MB metaspace OOMs the
// daemon during class loading ("OutOfMemoryError: Metaspace"). Kotlin stays
// in a separate 1.5 GB daemon, and with parallel=false + workers.max=1 the
// combined ~5.5 GB + OS headroom stays under the runner's 7 GB.
//
// lintVital is also disabled in release builds: it runs an extra full lint
// pass on every module for zero runtime value and burns the same scarce heap.
const MEMORY_PROPS = [
  { key: 'org.gradle.jvmargs', value: '-Xmx4g -XX:MaxMetaspaceSize=1g -XX:+UseParallelGC' },
  { key: 'kotlin.daemon.jvmargs', value: '-Xmx1536m -XX:MaxMetaspaceSize=512m' },
  { key: 'org.gradle.workers.max', value: '1' },
  { key: 'org.gradle.parallel', value: 'false' },
];

module.exports = function withGradleMemory(config) {
  config = withGradleProperties(config, (config) => {
    for (const prop of MEMORY_PROPS) {
      const idx = config.modResults.findIndex((p) => p.type === 'property' && p.key === prop.key);
      if (idx !== -1) {
        config.modResults[idx].value = prop.value;
      } else {
        config.modResults.push({ type: 'property', key: prop.key, value: prop.value });
      }
    }
    return config;
  });

  config = withAppBuildGradle(config, (config) => {
    let contents = config.modResults.contents;
    // Insert inside the android {} block, right after its opening brace.
    const marker = 'android {';
    const idx = contents.indexOf(marker);
    if (idx !== -1) {
      const insertAt = contents.indexOf('\n', idx) + 1;
      const lintBlock =
        '    lint {\n' +
        '        // Disable the release-only "vital" lint pass: it re-runs the\n' +
        '        // whole lint suite on every module with no runtime benefit and\n' +
        '        // exhausts the CI runner heap (OutOfMemoryError: Metaspace).\n' +
        '        checkReleaseBuilds false\n' +
        '    }\n';
      if (contents.indexOf('checkReleaseBuilds false') === -1) {
        contents = contents.slice(0, insertAt) + lintBlock + contents.slice(insertAt);
      }
    }
    config.modResults.contents = contents;
    return config;
  });

  return config;
};
