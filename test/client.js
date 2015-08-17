var assert = require('assert');
var validateTask = require('./validateTask');
var client = require('../').client;
var server = require('../').server;

describe('A client', function(){
  it('should do a really basic test', function(done){
    var s = server().listen(9090);

    var cl = client('http://localhost:9090');

    var data = [];

    cl.on('data', function(datum){
      data.push(datum);
    }).on('error', function(err){
      s.close();
      done(err);
    }).on('end', function(){
      assert.equal(data.length, 1);
      validateTask(data[0], true);

      s.close();
      done();
    });

    cl.write('echo hi');
    cl.write('echo how are you?');
    cl.write('echo pretty good');
    cl.end();
  });

  it('should be able to set a timeout', function(done){
    var s = server().listen(9090);

    var cl = client('http://localhost:9090', {timeout: 1000});

    var data = [];

    cl.on('data', function(datum){
      data.push(datum);
    }).on('error', function(err){
      s.close();
      done(err);
    }).on('end', function(){
      assert.equal(data.length, 1);
      validateTask(data[0], true);
      assert.equal(data[0].timeout, 1000);

      s.close();
      done();
    });

    cl.write('echo hi');
    cl.write('echo how are you?');
    cl.write('echo pretty good');
    cl.end();
  });

  describe('running a bad command', function(){
    it('should get a correct error', function(done){
      var s = server().listen(9090);

      var cl = client('http://localhost:9090');

      var data = [];

      cl.on('data', function(datum){
        data.push(datum);
      }).on('error', function(err){
        s.close();
        done(err);
      }).on('end', function(){
        assert.equal(data.length, 1);

        validateTask(data[0], true, true, true);

        s.close();
        done();
      });

      cl.write('exit 1');
      cl.end();
    });
  });
});
