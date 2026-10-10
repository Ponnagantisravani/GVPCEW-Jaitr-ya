module.exports = {
  dependencies: {
    'react-native-ble-advertiser': {
      platforms: {
        android: {
          packageImportPath: 'import com.vitorpamplona.bleavertiser.BLEAdvertiserPackage;',
          packageInstance: 'new BLEAdvertiserPackage()',
        },
      },
    },
  },
};
