const { initializeLocalApp } = require('./utils/localCatalyst');
const { PassThrough } = require('stream');
(async () => {
  try {
    const app = await initializeLocalApp();
    if (!app) throw new Error('No app');
    console.log('Got app', typeof app.filestore === 'function');
    const folderId = process.env.CATALYST_CSV_FOLDER_ID || '43082000000096018';
    const folder = app.filestore().folder(String(folderId));
    const stream = new PassThrough();
    stream.end(Buffer.from('crime_id,crime_type\n1,THEFT\n'));
    const result = await folder.uploadFile({ code: stream, name: 'check_remote_upload.csv' });
    console.log('upload result', result);
  } catch (err) {
    console.error('remote upload failed', err && err.message);
    console.error(err && err.stack);
  }
})();