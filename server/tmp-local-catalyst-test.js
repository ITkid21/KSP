const { initializeLocalApp } = require('./utils/localCatalyst');
(async () => {
  try {
    const app = await initializeLocalApp();
    console.log('initialized local Catalyst app:', !!app);
    if (app) {
      console.log('app keys:', Object.keys(app).slice(0, 20));
    }
  } catch (err) {
    console.error('initializeLocalApp failed:');
    console.error(err && err.message);
    if (err && err.stack) console.error(err.stack);
  }
})();