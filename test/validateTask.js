var assert = require('assert');

function validateTask(task, notRunning, notWriteable, unsuccessful) {
  /*
    id: "c57579f3-af61-47cb-b803-10527b776c89",
    pid: 8302,
    startTime: 1433775287309,
    running: true,
    writable: true,
    errors: []
  */
  var testedAttrs = {};

  assert.equal(typeof task, 'object');

  assert.equal(typeof task.id, 'string');
  assert(/^[0-9a-z\-]{36}$/.test(task.id));
  testedAttrs.id = true;

  assert.equal(typeof task.pid, 'number');
  assert(task.pid > 1);
  testedAttrs.pid = true;

  assert.equal(typeof task.startTime, 'number');
  assert(Date.now() >= task.startTime);
  testedAttrs.startTime = true;

  assert.strictEqual(task.running, !notRunning);
  testedAttrs.running = true;

  assert.strictEqual(task.writable, !(notRunning || notWriteable));
  testedAttrs.writable = true;

  assert.deepEqual(task.errors, []);
  testedAttrs.errors = true;

  if (notRunning) {
    if (unsuccessful) {
      assert.notEqual(task.code, 0);
      assert.notEqual(task.signal, null);
    } else {
      assert.equal(task.code, 0);
      assert.equal(task.signal, null);
    }
    testedAttrs.code = true;
    testedAttrs.signal = true;
  }

  if (task.hasOwnProperty('timeout')) {
    assert.equal(typeof task.timeout, 'number');
    testedAttrs.timeout = true;
  }

  assert.deepEqual(Object.keys(task).sort(), Object.keys(testedAttrs).sort());
}

module.exports = validateTask;
