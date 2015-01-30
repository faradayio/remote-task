var net = require('net');
var spawn = require('child_process').spawn;

var terminus = require('terminus');
var through2 = require('through2');
var Promise = require('bluebird');
var shellEscape = require('shell-escape');
var es = require('event-stream');

var winston = require('winston');
require('winston-papertrail').Papertrail;

module.exports = function(logPort, options){
  return new Runner(logPort, options);
};

module.exports.remoteStream = function(){
  var input = es.stringify();
  var output = input.pipe(net.connect.apply(net, arguments))
    .pipe(es.split())
    .pipe(es.parse());

  return es.duplex(input, output);
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
  var responder = es.stringify();

  socket
    .pipe(es.split())
    .pipe(es.parse())
    .pipe(through2.obj(function(chunk, enc, cb){
      if (typeof chunk == 'object' && chunk.end == true) {
        bash.stdin.end();
      } else {
        this.push(chunk);
      }
      cb();
    }))
    .pipe(validator)
    .pipe(this.stringify())
    .pipe(bash.stdin);

  responder
    .pipe(through2.obj(function(chunk, enc, cb){
      console.log('responding', chunk);
      cb(null, chunk);
    }))
    .pipe(socket);

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
};

Runner.prototype.stringify = function(){
  return through2.obj(function(chunk, enc, callback){
    var out = shellEscape(chunk)+'\n';
    callback(null, out);
  })
};
Runner.prototype.validate = function(){
  return through2.obj(function(chunk, enc, callback){
    if (Array.isArray(chunk)) {
      callback(null, chunk);
    } else {
      callback('invalid: not an array');
    }
  })
};