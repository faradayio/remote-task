var through = require('through2').obj;
var request = require('request-promise');
var Promise = require('bluebird');

function wait(ms) {
  return new Promise(function(resolve){
    setTimeout(resolve, ms);
  });
}

function client(baseUrl, options){
  var queue = [],
      ended = false,
      ending = false,
      retries = 0,
      errorCount = 0,
      id, req, task;

  function send() {
    if (!queue.length && (!ending || ended)) {
      return Promise.resolve();
    }
    if (req) {
      return req;
    }

    var commands = queue;
    queue = [];

    if (ending) {
      ended = true;
    }

    var url;

    if (id) {
      url = '/tasks/'+id;
    } else {
      url = '/tasks';
    }

    var end = ending;

    var post = {
      url: baseUrl+url,
      json: true,
      body: {
        commands: commands,
        end: end
      }
    };
    for (var key in options) {
      post.body[key] = options[key];
    }

    req = (
      request.post(post).then(function(body){
          task = body;
          id = task.id;
          ended = end;
          req = null;

          var self = this;

          task.errors.slice(0, errorCount)
            .forEach(function(err){
              self.emit('error', err);
            });

          errorCount += task.errors.length;

          send();
          return;
        }).catch(function(err){
          queue = commands.concat(queue);
          req = null;

          retries++;
          if (retries === 10) {
            console.log('Failed to run commands after 10 retries\n  '+commands.join('\n  '), err);
            throw err;
          }

          return wait(1000 * 10).then(send);
        })
    );

    return req;
  }

  function end() {
    ending = true;
    return send();
  }

  var pollRetries = 0, polls = 0;

  function pollForCompletion(delayed) {
    if (delayed) {
      return (new Promise(function(resolve){

        var delay = 4096;
        if (polls <= 11) {
          delay = 10+Math.pow(2, polls); //EXPONENTIAL BACKOFF YAY
        }
        polls++;

        setTimeout(resolve, delay);
      }).then(pollForCompletion));
    }

    return (
      request.get({
        url: baseUrl+'/tasks/'+id,
        json: true
      }).then(function(body){
          task = body;
          if (task.running) {
            return pollForCompletion(true);
          } else {
            return task;
          }
        })
        .catch(function(err){
          pollRetries++;

          if (pollRetries === 10) {
            throw err;
          }

          return pollForCompletion(true);
        })
    );
  }

  return through(function(command, enc, cb){
    queue.push(command);
    send().then(cb.bind(null, null, null)).catch(cb);
  }, function(cb){
    var self = this;
    end()
      .then(pollForCompletion)
      .then(function(){
        self.push(task);
        cb();
      })
      .catch(cb);
  });
}

module.exports = client;
