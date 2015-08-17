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

    it('should create GET /tasks/:id', function(done){
      request(app)
        .get('/tasks/'+createdTask.id)
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

          assert.deepEqual(Object.keys(tasks), [createdTask.id]);

          validateTask(tasks[createdTask.id]);

          assert.deepEqual(createdTask, tasks[createdTask.id]);

          done();
        });
    });

    it('should be appendable', function(done){
      request(app)
        .post('/tasks/'+createdTask.id)
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
            if (typeof fs.existsSync === 'function') {
              if (fs.existsSync(process.cwd()+'/'+tmpFiles[0]) && fs.existsSync(process.cwd()+'/'+tmpFiles[1])) {
                clearInterval(interval);
                clearTimeout(timeout);
                done();
              }
            } else {
              try {
                fs.accessSync(process.cwd()+'/'+tmpFiles[0]);
                fs.accessSync(process.cwd()+'/'+tmpFiles[1]);
                clearInterval(interval);
                clearTimeout(timeout);
                done();
              } catch (err) {
                //:(
              }
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
        .delete('/tasks/'+createdTask.id)
        .expect(200, done);
    });

    it('should shown as stopped in GET /task/:id after it\'s deleted', function(done){
      request(app)
        .get('/tasks/'+createdTask.id)
        .end(function(err, res){
          if (err) {
            return done(err);
          }

          var task = res.body;

          validateTask(task, true, true, true);

          done();
        });
    });

    it('should be shown as stopped in GET /tasks after it\'s deleted', function(done){
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
          assert.equal(Object.keys(tasks).length, 1);

          validateTask(tasks[Object.keys(tasks)[0]], true, true, true);

          done();
        });
    });
  });

  describe('with a newly created task that has a timeout', function(){
    var app = server();
    var createdTask;

    it('should respond with a task object', function(done){
      request(app)
        .post('/tasks')
        .send({timeout: 1000, commands: ['sleep 10'], end: true})
        .set('Accept', 'application/json')
        .expect('Content-Type', /json/)
        .expect(200)
        .end(function(err, res){
          if (err) {
            return done(err);
          }

          createdTask = res.body;

          validateTask(createdTask, false, true);
          assert.equal(createdTask.timeout, 1000);

          done();
        });
    });

    it('should create time out', function(done){
      setTimeout(function(){
        request(app)
          .get('/tasks/'+createdTask.id)
          .set('Accept', 'application/json')
          .expect('Content-Type', /json/)
          .expect(200)
          .end(function(err, res){
            if (err) {
              return done(err);
            }

            var task = res.body;

            validateTask(task, true, true, true);

            done();
          });
      }, 1100);
    });
  });

  describe('with a broken task', function(){
    var app = server();
    var createdTask;

    it('should respond with a task object', function(done){
      request(app)
        .post('/tasks')
        .send({commands: ['exit 1'], end: true})
        .set('Accept', 'application/json')
        .expect('Content-Type', /json/)
        .expect(200)
        .end(function(err, res){
          if (err) {
            return done(err);
          }

          createdTask = res.body;

          validateTask(createdTask, false, true, true);

          done();
        });
    });

    it('should fail immediately', function(done){
      setTimeout(function(){
        request(app)
          .get('/tasks/'+createdTask.id)
          .set('Accept', 'application/json')
          .expect('Content-Type', /json/)
          .expect(200)
          .end(function(err, res){
            if (err) {
              return done(err);
            }

            var task = res.body;

            validateTask(task, true, true, true);

            done();
          });
      }, 50);
    });
  });
});
