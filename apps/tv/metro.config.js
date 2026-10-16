const path = require('path');
const {getDefaultConfig, mergeConfig} = require('@react-native/metro-config');

// Monorepo: the TV app shares @huddle/protocol, @huddle/scoring and fixtures/synth.ts with the phone and relay.
const root = path.resolve(__dirname, '../..');
const config = {
  watchFolders: [root],
  resolver: {
    nodeModulesPaths: [path.resolve(__dirname, 'node_modules'), path.resolve(root, 'node_modules')],
    extraNodeModules: {
      '@huddle/protocol': path.resolve(root, 'packages/protocol'),
      '@huddle/scoring': path.resolve(root, 'packages/scoring'),
    },
  },
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);
