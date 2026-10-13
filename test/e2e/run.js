const suites = [
  './app.test',
  './index.test',
  './result.test',
  './detail.test',
  './favorites.test',
  './history.test'
];

const { resetEnvironment } = require('./helpers');

(async () => {
  let passed = 0;
  let failed = 0;
  for (const suitePath of suites) {
    const suite = require(suitePath);
    console.log('\n# ' + suite.name);
    for (const testCase of suite.cases) {
      resetEnvironment();
      try {
        await testCase.run();
        passed += 1;
        console.log('✓', testCase.name);
      } catch (err) {
        failed += 1;
        console.error('✗', testCase.name);
        console.error(err && err.stack ? err.stack : err);
      }
    }
  }
  console.log('\n页面级 Mock 自动化：' + passed + '/' + (passed + failed) + ' 通过');
  if (failed) process.exitCode = 1;
})().catch(err => {
  console.error(err && err.stack ? err.stack : err);
  process.exitCode = 1;
});
