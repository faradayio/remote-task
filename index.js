var net = require('net');
var spawn = require('child_process').spawn;

var terminus = require('terminus');
var through2 = require('through2');
var Promise = require('bluebird');
var shellEscape = require('shell-escape');

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
    streams.input.write(chunk.command, enc);
    streams.output.once('data', function(data){
      chunk.cb(data);
      cb(null, data);
    });
  });

  return function(command, cb){
    transformStream.write({
      command: command,
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

  var bash = spawn('bash', [], this.options);

  var logger = new winston.Logger({
    transports: [
      new winston.transports.Papertrail({
        host: 'logs.papertrailapp.com',
        port: this.logPort
      })
    ]
  });

  bash.stdout.on('data', function(data, enc){
    logger.log(data.toString());
  });
  bash.stderr.on('data', function(data, enc){
    logger.error(data.toString());
  });

  var validator = this.validate();
  var responder = jsonWriter();

  validator.on('error', function(err){
    responder.write({
      status: 'error',
      error: err.stack || err
    });
  });

  bash.on('exit', function(code, signal){
    var message = 'bash closed with code '+code+', signal '+signal;
    if (code === 0) {
      logger.info(message);
      responder.write({
        status: 'success'
      });
    } else {
      logger.error(message);
      responder.write({
        status: 'error',
        code: code,
        signal: signal
      });
    }
    logger.close();
    responder.end();
  });

  socket
    .pipe(lineReader())
    .pipe(jsonReader())
    .pipe(through2.obj(function(chunk, enc, cb){
      if (typeof chunk == 'object' && chunk.type == 'end') {
        bash.stdin.end();
      } else {
        this.push(chunk);
      }
      cb();
    }))
    .pipe(validator)
    .pipe(this.escape())
    .pipe(bash.stdin);

  responder
    .pipe(lineWriter())
    .pipe(socket);
};

Runner.prototype.escape = function(){
  return through2.obj(function(chunk, enc, callback){
    callback(null, shellEscape(chunk));
  })
};
Runner.prototype.validate = function(){
  return through2.obj(function(chunk, enc, callback){
    if (array.isArray(chunk)) {
      callback(null, chunk);
    } else {
      callback('invalid: not an array');
    }
  })
};