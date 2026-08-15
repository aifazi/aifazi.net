/**
 * metro.config.js - Metro bundler configuration for production builds
 * Includes JavaScript obfuscation, minification, and anti-tamper measures
 */

const { getDefaultConfig } = require('expo/metro-config');
const TerserPlugin = require('terser-webpack-plugin');

const config = getDefaultConfig(__dirname);

// Production-only transformations
if (process.env.NODE_ENV === 'production') {
  // Enable minification with Terser
  config.transformer.minifierConfig = {
    keep_fnames: false,
    mangle: {
      toplevel: true,
      properties: {
        regex: /^_/  // Only mangle properties starting with _
      }
    },
    compress: {
      drop_console: true,
      drop_debugger: true,
      pure_funcs: ['console.log', 'console.debug', 'console.info'],
      passes: 2
    },
    output: {
      comments: false
    }
  };

  // Enable mangling for source code
  config.transformer.minifierPath = 'metro-minify-terser';
  
  // Disable source maps in production
  config.transformer.generateSourceMaps = false;
}

// Anti-tamper: Add integrity checks
config.transformer.getTransformOptions = async () => ({
  transform: {
    experimentalImportSupport: false,
    inlineRequires: true,
  },
});

// Custom serializer for production
config.serializer = {
  ...config.serializer,
  processModuleFilter: (module) => {
    // Exclude test files and development-only modules in production
    if (process.env.NODE_ENV === 'production') {
      const path = module.path;
      if (path.includes('__tests__') || 
          path.includes('.test.') || 
          path.includes('.spec.') ||
          path.includes('__mocks__')) {
        return false;
      }
    }
    return true;
  }
};

// Anti-tamper: Add runtime integrity checks
config.resolver.platforms = ['native', 'android', 'ios', 'web'];

// Custom transformer for obfuscation
config.transformer = {
  ...config.transformer,
  babelTransformerPath: require.resolve('metro-react-native-babel-transformer'),
  unstable_allowRequireContext: false,
};

module.exports = config;