var net = require('net');
var spawn = require('child_process').spawn;

var terminus = require('terminus');
var through2 = require('through2');
var Promise = require('bluebird');

var winston = require('winston');
require('winston-papertrail').Papertrail;

var lineReader = require('through2-linereader');
var lineWriter = require('through2-linewriter');
var jsonReader = require('through2-jsonreader');
var jsonWriter = require('through2-jsonwriter');

module.exports = function(logPort, options){
  return new Runner(logPort, options);
};

module.exports.remoteStreams = function(){
  var input = jsonWriter();
  var output = input
    .pipe(lineWriter())
    .pipe(net.connect.apply(net, arguments))
    .pipe(lineReader())
    .pipe(jsonReader());

  return {
    input: input,
    output: output
  };
};

module.exports.remoteStream = function(){
  var streams = this.remoteStreams.apply(this, arguments);

  return through2.obj(function(chunk, enc, cb){
    streams.input.write(chunk, enc);
    streams.output.once('data', function(data){
      cb(null, data);
    });
  });
};

module.exports.remote = function(){
  var streams = this.remoteStreams.apply(this, arguments);

  var transformStream = through2.obj(function(chunk, enc, cb){
    streams.input.write(chunk.data, enc);
    streams.output.once('data', function(data){
      chunk.cb(data);
      cb(null, data);
    });
  });

  return function(data, cb){
    transformStream.write({
      data: data,
      cb: cb
    });
  };
};

function Runner(logPort, options){
  this.logPort = logPort;
  this.options = options || {};

  this.clients = [];
  return net.createServer(this.onConnection.bind(this));
};

Runner.prototype.onConnection = function(socket){
  this.clients.push(socket);

  var self = this;

  socket.on('end', function(){
    self.clients.splice(self.clients.indexOf(socket), 1);
  });

  socket
    .pipe(lineReader())
    .pipe(jsonReader())
    .pipe(this.commandStream())
    .pipe(jsonWriter())
    .pipe(lineWriter())
    .pipe(socket);
};

Runner.prototype.commandStream = function(){
  var self = this;
  return through2.obj(function(chunk, enc, callback){
    if (typeof chunk != 'object' || !Array.isArray(chunk.command)) {
      callback(null, {status: 'invalid'});
    } else {
      self.runCommand(chunk.command)
        .then(function(code){
          callback(null, {status: 'success', code: code});
        })
        .catch(function(code){
          callback(null, {status: 'failure', code: code});
        });
    }
  });
};

Runner.prototype.runCommand = function(args){
  var command = args.shift();
  var child = spawn(command, args, this.options);

  var logger = new winston.Logger({
    transports: [
      new winston.transports.Papertrail({
        host: 'logs.papertrailapp.com',
        port: this.logPort
      })
    ]
  });

  var logger_ended = 0;
  var logger_cleanup = function(){
    logger_ended++;
    if (logger_ended == 3) {
      setTimeout(logger.close.bind(logger), 10000);
    }
  };

  child.stdout
    .on('end', logger_cleanup)
    .pipe(lineReader(true))
    .pipe(terminus(function(chunk, enc, cb){
      logger.log('info', chunk.toString());
      cb();
    }));

  child.stderr
    .on('end', logger_cleanup)
    .pipe(lineReader(true))
    .pipe(terminus(function(chunk, enc, cb){
      logger.error(chunk.toString());
      cb();
    }));

  return new Promise(function(resolve, reject){
    var error_triggered = false;

    child.on('error', function(err){
      error_triggered = true;
      logger.log('critical', 'task failed', err);
      reject(-1);

      logger_cleanup();
    });

    child.on('exit', function(code){
      if (error_triggered) return;
      if (code === 0) {
        resolve(code);
      } else {
        logger.log('critical', 'task failed');
        reject(code);
      }
      logger_cleanup();
    });

  });
};