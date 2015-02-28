var net = require('net');
var spawn = require('child_process').spawn;

var through2 = require('through2');
var Promise = require('bluebird');
var es = require('event-stream');
var shellEscape = require('./shellEscape');

var winston = require('winston');

module.exports = function(logFile, options){
  return new Runner(logFile, options);
};

module.exports.remoteStream = function(){
  var input = es.stringify();
  var connection = net.connect.apply(net, arguments);
  var output = input.pipe(connection)
    .pipe(es.split())
    .pipe(es.parse());

  connection.on('error', output.emit.bind(output, 'error'));

  return es.duplex(input, output);
};

function Runner(logFile, options){
  this.logFile = logFile;
  this.options = options || {};

  this.logger = new (winston.Logger)({
    transports: [
      new (winston.transports.Console)(),
      new (winston.transports.File)({ filename: logFile })
    ]
  });

  this.clients = [];
  return net.createServer(this.onConnection.bind(this));
}

Runner.prototype.onConnection = function(socket){
  this.clients.push(socket);

  var self = this;

  var logger = this.logger;

  socket.on('end', function(){
    self.clients.splice(self.clients.indexOf(socket), 1);
  });

  var bash = spawn('bash', [], this.options);

  var inputLogs = [];
  var bashLogs = [];
  bash.stdout.on('data', function(data){
    bashLogs.push(data.toString());
    logger.log(data.toString());
  });
  bash.stderr.on('data', function(data){
    bashLogs.push(data.toString());
    logger.error(data.toString());
  });

  var validator = this.validate();
  var responder = es.stringify();

  socket
    .pipe(es.split())
    .pipe(es.parse())
    .pipe(through2.obj(function(chunk, enc, cb){
      if (typeof chunk === 'object' && chunk.end === true) {
        logger.log('ending bash stdin');
        bash.stdin.end();
      } else {
        this.push(chunk);
      }
      cb();
    }))
    .pipe(validator)
    .pipe(this.stringify())
    .pipe(through2.obj(function(line, enc, cb){
      inputLogs.push(line);
      logger.log('executing: '+line);
      cb(null, line);
    }))
    .pipe(bash.stdin);

  responder
    .pipe(through2.obj(function(chunk, enc, cb){
      logger.log('responding', chunk);
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
        status: 'success',
        logs: bashLogs.join('\n'),
        input: inputLogs.join('')
      });
    } else {
      logger.error(message);
      responder.write({
        status: 'error',
        code: code,
        signal: signal,
        logs: bashLogs.join('\n'),
        input: inputLogs.join('')
      });
    }
    logger.close();
    responder.end();
  });
};

Runner.prototype.stringify = function(){
  return through2.obj(function(chunk, enc, callback){
    var out = shellEscape(chunk)+';\n';
    callback(null, out);
  });
};
Runner.prototype.validate = function(){
  return through2.obj(function(chunk, enc, callback){
    if (Array.isArray(chunk)) {
      callback(null, chunk);
    } else {
      callback('invalid: not an array');
    }
  });
};
