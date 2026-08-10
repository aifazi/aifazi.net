const { withGradleProperties } = require('@expo/config-plugins');

// Cap Gradle + Kotlin daemon memory so the release build fits the
// 2-core / 7 GB GitHub Actions runner. The Expo prebuild template sets
// org.gradle.jvmargs=-Xmx2048m with org.gradle.parallel=true and no
// kotlin.daemon.jvmargs, so the Kotlin compiler daemon inherits the Gradle
// heap and, with the heavy LiveKit/WebRTC native modules, the two JVMs plus
// parallel workers exceed the cgroup and the kernel OOM-killer aborts
// :app:compileReleaseKotlin with "The operation was canceled."
const MEMORY_PROPS = [
  { key: 'org.gradle.jvmargs', value: '-Xmx2048m -XX:MaxMetaspaceSize=512m -XX:+UseParallelGC' },
  { key: 'kotlin.daemon.jvmargs', value: '-Xmx1536m -XX:MaxMetaspaceSize=512m' },
  { key: 'org.gradle.workers.max', value: '1' },
  { key: 'org.gradle.parallel', value: 'false' },
];

module.exports = function withGradleMemory(config) {
  return withGradleProperties(config, (config) => {
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
};
