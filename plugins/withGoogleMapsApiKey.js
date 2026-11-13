const { withAndroidManifest } = require('@expo/config-plugins');

module.exports = function withGoogleMapsApiKey(config, { apiKey }) {
  if (!apiKey) {
    throw new Error('Google Maps API key is required');
  }

  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults;
    const application = manifest.manifest.application?.[0];

    if (!application) {
      throw new Error('<application> tag not found in AndroidManifest');
    }

    // Ensure the meta-data array exists
    application['meta-data'] = application['meta-data'] || [];

    // Remove any existing Google Maps key (avoid duplicates)
    application['meta-data'] = application['meta-data'].filter(
      (item) => item.$?.['android:name'] !== 'com.google.android.geo.API_KEY'
    );

    // Add the new key
    application['meta-data'].push({
      $: {
        'android:name': 'com.google.android.geo.API_KEY',
        'android:value': apiKey,
      },
    });

    return config;
  });
};