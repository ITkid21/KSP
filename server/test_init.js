const catalyst = require('zcatalyst-sdk-node');

console.log('Test 1: Plain initialize()');
try {
  const app = catalyst.initialize();
  console.log('Test 1 Success!', typeof app);
} catch (e) {
  console.log('Test 1 Failed:', e.message);
}

console.log('\nTest 2: initialize with catalystHeaders (Development env)');
try {
  const app = catalyst.initialize({
    catalystHeaders: {
      'x-zc-projectid': '43082000000013050',
      'x-zc-project-key': 'dummy_key',
      'x-zc-environment': 'Development'
    }
  });
  console.log('Test 2 Success!', typeof app);
} catch (e) {
  console.log('Test 2 Failed:', e.message);
}

console.log('\nTest 3: initializeApp with dummy config (no credential)');
try {
  const app = catalyst.initializeApp({
    project_id: '43082000000013050',
    project_key: 'dummy_key',
    environment: 'Development'
  });
  console.log('Test 3 Success!', typeof app);
} catch (e) {
  console.log('Test 3 Failed:', e.message);
}
