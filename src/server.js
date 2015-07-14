var express = require('express');
var bodyParser = require('body-parser');
var util = require('util');
var fs = require('fs');
var Promise = require('bluebird');
var spawn = require('child_process').spawn;
var through = require('through2').obj;
var stream = require('stream');
var uuid = require('uuid');

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

function idDir(id) {
  return cwd+'/remote-task-'+id;
}

function makeApp() {
  var tasks = {};
  var stdin = {};

  function getTasks() {
    return tasks;
  }

  function getTask(req) {
    if (typeof tasks[req.params.id] === 'undefined') {
      throw new NotFound('task not found');
    }

    return tasks[req.params.id];
  }

  function createTask(req) {
    if (typeof req.body !== 'object') {
      throw new UnprocessableEntity('trying to create task without a body');
    }

    var commands = req.body.commands || [];
    if (!Array.isArray(commands) || commands.filter(isString).length !== commands.length) {
      throw new UnprocessableEntity('req.body.commands must be an array of strings');
    }

    var timeout = req.body.timeout;
    if (typeof timeout !== 'undefined' && typeof timeout !== 'number') {
      throw new UnprocessableEntity('req.body.timeout must be a number, or undefined');
    }
    timeout = timeout || 0;

    var shell = spawn('bash');
    var pid = shell.pid;
    var id = uuid.v4();

    fs.mkdir(idDir(id), function(err){
      if (err) {
        console.error('Error making directory', idDir(id), err);
      }

      shell.stdout.pipe(fs.createWriteStream(idDir(id)+'/stdout.log'));
      shell.stderr.pipe(fs.createWriteStream(idDir(id)+'/stderr.log'));
    });

    stdin[id] = new stream.PassThrough();
    stdin[id].pipe(shell.stdin);
    stdin[id].pipe(fs.createWriteStream(idDir(id)+'/stdin.log'));

    commands.forEach(function(cmd){
      stdin[id].write(cmd+'\n');
    });

    if (req.body.end === true) {
      stdin[id].end();
      delete stdin[id];
    }

    var task = tasks[id] = {
      id: id,
      pid: pid,
      startTime: Date.now(),
      running: true,
      writable: req.body.end !== true,
      errors: []
    };
    if (timeout) {
      task.timeout = timeout;
    }

    shell.on('error', function(err){
      task.errors.push(err.stack || err);
    });

    var killTimeout;
    if (timeout) {
      killTimeout = setTimeout(function(){
        stopTaskById(id).catch(function(err) {
          console.error('failed to kill '+id+' after '+timeout+'ms timeout', err && err.stack ? err.stack : err);
        });
      }, timeout);
    }

    shell.on('exit', function(code, signal){
      if (killTimeout) {
        clearTimeout(killTimeout);
      }
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

    if (!/^[0-9a-z\-]{36}$/.test(req.params.id)) {
      throw new UnprocessableEntity('req.body.id must be a uuid');
    }
    var id = req.params.id;

    var commands = req.body.commands || [];
    if (!Array.isArray(commands) || commands.filter(isString).length !== commands.length) {
      throw new UnprocessableEntity('req.body.commands must be an array of strings');
    }

    var task = tasks[id];
    if (typeof task === 'undefined') {
      throw new NotFound('task not found');
    }

    if (!task.writable) {
      throw new Error('trying to write to a closed stdin');
    }

    if (typeof stdin[id] === 'undefined' || !(stdin[id] instanceof stream.Stream)) {
      throw new Error('invalid stdin stream');
    }

    commands.forEach(function(cmd){
      stdin[id].write(cmd+'\n');
    });

    if (req.body.end === true) {
      tasks[id].writable = false;
      stdin[id].end();
      delete stdin[id];
    }

    return task;
  }

  function stopTaskById(id) {
    return new Promise(function(resolve, reject){
      var timeouts = [];
      var task = tasks[id];
      if (!task) {
        throw new Error('no such task '+id);
      }

      function forget(){
        clearInterval(monitor);
        timeouts.forEach(clearTimeout);
      }

      function check(){
        try {
          process.kill(task.pid, 0);
        } catch (err) {
          if (err.message !== 'kill ESRCH') {
            throw err;
          }
          task.writable = false;
          delete stdin[id];
          forget();
          resolve();
          return true;
        }
      }

      var monitor = setInterval(check, 20);

      if (check()) return;
      process.kill(task.pid, 'SIGHUP');
      if (check()) return;

      timeouts.push(setTimeout(function(){
        process.kill(task.pid, 'SIGTERM');
        check();
      }, 5000));

      timeouts.push(setTimeout(function(){
        process.kill(task.pid, 'SIGKILL');
        check();
      }, 10000));

      timeouts.push(setTimeout(function(){
        forget();
        reject(new Error('unable to kill process '+task.pid));
      }, 15000));
    });
  }

  function stopTask(req) {
    if (!/^[0-9a-z\-]{36}$/.test(req.params.id)) {
      throw new UnprocessableEntity('req.body.id must be a uuid');
    }
    var id = req.params.id;

    return stopTaskById(id);
  }

  function stopTasks() {
    var ids = Object.keys(tasks);

    return Promise.all(ids.map(stopTaskById));
  }

  var app = express();
  app.use(bodyParser.json());

  app.get('/tasks', api(getTasks));
  app.get('/tasks/:id', api(getTask));
  app.post('/tasks', api(createTask));
  app.post('/tasks/:id', api(addCommands));
  app.delete('/tasks', api(stopTasks));
  app.delete('/tasks/:id', api(stopTask));

  return app;
}
