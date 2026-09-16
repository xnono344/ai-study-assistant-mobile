// Learn more https://docs.expo.io/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// expo-sqlite's web worker imports a WebAssembly asset.
config.resolver.assetExts = [...config.resolver.assetExts, 'wasm'];

module.exports = config;
