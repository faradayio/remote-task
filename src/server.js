var express = require('express');
var bodyParser = require('body-parser');
var util = require('util');
var fs = require('fs');
var spawn = require('child_process').spawn;
var through = require('through2').obj;
var Stream = require('stream').Stream;
var cwd = process.cwd();

module.exports = makeApp;
module.exports.NotFound = NotFound;
module.exports.UnprocessableEntity = UnprocessableEntity;


function NotFound(message) {
  Error.call(this);
  this.message = message;
  this.statusCode = 404;
}
util.inherits(NotFound, Error);

function UnprocessableEntity(message) {
  Error.call(this);
  this.message = message;
  this.statusCode = 422;
}
util.inherits(UnprocessableEntity, Error);

function logWebError(req, err) {
  console.error(req.originalUrl, err.stack || err);
}

function catchWebErrors(res) {
  return function(err){
    if (err.statusCode) {
      res.sendStatus(err.statusCode);
      if (err.statusCode >= 500) {
        logWebError(req, err);
      }
    } else {
      res.sendStatus(500);
      logWebError(res, err);
    }
  };
}

function api(fn){
  return function(req, res){
    Promise.resolve()
      .then(function(){
        return fn(req);
      })
      .then(function(result){
        res.json(result);
      })
      .catch(catchWebErrors(res));
  };
}

function isString(thing) {
  return typeof thing === 'string';
}

function pidDir(pid) {
  return cwd+'/'+pid;
}

function makeApp() {
  var tasks = {};
  var stdin = {};

  function getTasks() {
    return tasks;
  }

  function getTask(req) {
    if (typeof tasks[req.params.pid] === 'undefined') {
      throw new NotFound('task not found');
    }

    return tasks[req.params.pid];
  }

  function createTask(req) {
    if (typeof req.body !== 'object') {
      throw new UnprocessableEntity('trying to create task without a body');
    }

    var commands = req.body.commands || [];
    if (!Array.isArray(commands) || commands.filter(isString).length !== commands.length) {
      throw new UnprocessableEntity('req.body.commands must be an array of strings');
    }

    var shell = spawn('bash');
    var pid = shell.pid;

    fs.mkdir(pidDir(pid), function(err){
      if (err) {
        console.error('Error making directory', pidDir(pid), err);
      }

      shell.stdout.pipe(fs.createWriteStream(pidDir(pid)+'/stdout.log'));
      shell.stderr.pipe(fs.createWriteStream(pidDir(pid)+'/stderr.log'));
    });

    stdin[pid] = shell.stdin;

    commands.forEach(function(cmd){
      stdin[pid].write(cmd+'\n');
    });

    if (req.body.end === true) {
      stdin[pid].end();
      delete stdin[pid];
    }

    var task = tasks[pid] = {
      pid: pid,
      startTime: Date.now(),
      running: true,
      writable: req.body.end !== true,
      errors: []
    };

    shell.on('error', function(err){
      task.errors.push(err.stack || err);
    });

    shell.on('exit', function(code, signal){
      task.running = false;
      task.code = code;
      task.signal = signal;
    });

    return task;
  }

  function addCommands(req) {
    if (typeof req.body !== 'object') {
      throw new UnprocessableEntity('trying to create task without a body');
    }

    if (!/^[0-9]+$/.test(req.params.pid)) {
      throw new UnprocessableEntity('req.body.pid must be a number');
    }
    var pid = parseInt(req.params.pid);

    var commands = req.body.commands || [];
    if (!Array.isArray(commands) || commands.filter(isString).length !== commands.length) {
      throw new UnprocessableEntity('req.body.commands must be an array of strings');
    }

    var task = tasks[pid];
    if (typeof task === 'undefined') {
      throw new NotFound('task not found');
    }

    if (!task.writable) {
      throw new Error('trying to write to a closed stdin');
    }

    if (typeof stdin[pid] === 'undefined' || !(stdin[pid] instanceof Stream)) {
      throw new Error('invalid stdin stream');
    }

    commands.forEach(function(cmd){
      stdin[pid].write(cmd+'\n');
    });

    if (req.body.end === true) {
      tasks[pid].writable = false;
      stdin[pid].end();
      delete stdin[pid];
    }

    return task;
  }

  function stopTaskByPid(pid) {
    return new Promise(function(resolve, reject){
      var timeouts = [];

      function forget(){
        clearInterval(monitor);
        timeouts.forEach(clearTimeout);
      }

      function check(){
        try {
          process.kill(pid, 0);
        } catch (err) {
          if (err.message !== 'kill ESRCH') {
            throw err;
          }
          delete tasks[pid];
          delete stdin[pid];
          forget();
          resolve();
        }
      }

      var monitor = setInterval(check, 20);

      check();
      process.kill(pid, 'SIGHUP');
      check();

      timeouts.push(setTimeout(function(){
        process.kill(pid, 'SIGTERM');
        check();
      }, 5000));

      timeouts.push(setTimeout(function(){
        process.kill(pid, 'SIGKILL');
        check();
      }, 10000));

      timeouts.push(setTimeout(function(){
        forget();
        reject(new Error('unable to kill process '+pid));
      }, 15000));
    });
  }

  function stopTask(req) {
    if (!/^[0-9]+$/.test(req.params.pid)) {
      throw new UnprocessableEntity('req.body.pid must be a number');
    }
    var pid = parseInt(req.params.pid);

    return stopTaskByPid(pid);
  }

  function stopTasks() {
    var pids = Object.keys(tasks);

    return Promise.all(pids.map(stopTaskByPid));
  }

  var app = express();
  app.use(bodyParser.json());

  app.get('/tasks', api(getTasks));
  app.get('/tasks/:pid', api(getTask));
  app.post('/tasks', api(createTask));
  app.post('/tasks/:pid', api(addCommands));
  app.delete('/tasks', api(stopTasks));
  app.delete('/tasks/:pid', api(stopTask));

  return app;
}
