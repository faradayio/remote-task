var assert = require('assert');

function validateTask(task, notRunning) {
  /*
    pid: 8302,
    startTime: 1433775287309,
    running: true,
    writable: true,
    errors: []
  */

  assert.equal(typeof task, 'object');

  assert.equal(typeof task.pid, 'number');
  assert(task.pid > 1);

  assert.equal(typeof task.startTime, 'number');
  assert(Date.now() >= task.startTime);
  assert(Date.now() - task.startTime < 1000);

  assert.strictEqual(task.running, !notRunning);

  assert.strictEqual(task.writable, !notRunning);

  assert.deepEqual(task.errors, []);

  if (notRunning) {
    assert.equal(task.code, 0);
    assert.equal(task.signal, null);
  }

  assert.strictEqual(Object.keys(task).length, notRunning ? 7 : 5);
}

module.exports = validateTask;
