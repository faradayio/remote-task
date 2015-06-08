var server = require('../').server;
var request = require('supertest');
var assert = require('assert');
var fs = require('fs');
var validateTask = require('./validateTask');

var tmpFiles = ['tmp1', 'tmp2', 'tmp3', 'tmp4', 'tmp5'];

function cleanup() {
  tmpFiles.forEach(function(path){
    try {
      //NO QUESTIONS
      fs.unlinkSync(path);
    } catch (err) {
      //NOTHING TO SEE HERE
    }
  });
}
cleanup();
process.on('exit', cleanup);

describe('A server', function(){
  describe('just after startup, GET /tasks', function(){
    it('should respond with empty json', function(done){
      request(server())
        .get('/tasks')
        .set('Accept', 'application/json')
        .expect('Content-Type', /json/)
        .expect(200)
        .expect({}, done);
    });
  });

  describe('just after startup, GET /tasks/1', function(){
    it('should 404', function(done){
      request(server())
        .get('/tasks/1')
        .expect(404, done);
    });
  });

  describe('with a newly created task', function(){
    var app = server();
    var createdTask;

    it('should respond with a task object', function(done){
      request(app)
        .post('/tasks')
        .send({})
        .set('Accept', 'application/json')
        .expect('Content-Type', /json/)
        .expect(200)
        .end(function(err, res){
          if (err) {
            return done(err);
          }

          createdTask = res.body;

          validateTask(createdTask);

          done();
        });
    });

    it('should create GET /tasks/:pid', function(done){
      request(app)
        .get('/tasks/'+createdTask.pid)
        .set('Accept', 'application/json')
        .expect('Content-Type', /json/)
        .expect(200)
        .end(function(err, res){
          if (err) {
            return done(err);
          }

          var task = res.body;

          validateTask(task);

          assert.deepEqual(createdTask, task);

          done();
        });
    });

    it('should be accessible in GET /tasks', function(done){
      request(app)
        .get('/tasks')
        .set('Accept', 'application/json')
        .expect('Content-Type', /json/)
        .expect(200)
        .end(function(err, res){
          if (err) {
            return done(err);
          }

          var tasks = res.body;

          assert.deepEqual(Object.keys(tasks), [createdTask.pid]);

          validateTask(tasks[createdTask.pid]);

          assert.deepEqual(createdTask, tasks[createdTask.pid]);

          done();
        });
    });

    it('should be appendable', function(done){
      request(app)
        .post('/tasks/'+createdTask.pid)
        .send({commands: ['touch '+tmpFiles[0], 'touch '+tmpFiles[1]]})
        .set('Accept', 'application/json')
        .expect('Content-Type', /json/)
        .expect(200)
        .end(function(err, res){
          if (err) {
            return done(err);
          }

          var task = res.body;

          validateTask(task);

          assert.deepEqual(createdTask, task);

          var interval = setInterval(function(){
            try {
              fs.accessSync(process.cwd()+'/'+tmpFiles[0]);
              fs.accessSync(process.cwd()+'/'+tmpFiles[1]);
              clearInterval(interval);
              clearTimeout(timeout);
              done();
            } catch (err) {
              //:(
            }
          });

          var timeout = setTimeout(function(){
            clearInterval(interval);
            done(new Error('command was not run within 500ms'));
          }, 500);
        });
    });

    it('should be deletable', function(done){
      request(app)
        .delete('/tasks/'+createdTask.pid)
        .expect(200, done);
    });

    it('should be gone from GET /task/:pid after it\'s deleted', function(done){
      request(app)
        .get('/tasks/'+createdTask.pid)
        .expect(404, done);
    });

    it('should be gone from GET /tasks after it\'s deleted', function(done){
      request(app)
        .get('/tasks')
        .set('Accept', 'application/json')
        .expect('Content-Type', /json/)
        .expect(200)
        .expect({}, done);
    });
  });
});
