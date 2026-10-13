const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');
const {realpathSync} = require('node:fs');

/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 *
 * @type {import('@react-native/metro-config').MetroConfig}
 */
// Gradle can run through a Windows drive alias while Node resolves real paths.
const projectRoot = realpathSync(process.env.GVPCEW_METRO_ROOT || __dirname);
const config = {projectRoot, watchFolders: [projectRoot]};

module.exports = mergeConfig(getDefaultConfig(projectRoot), config);
