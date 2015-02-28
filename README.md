# remote-task
Simple server for remotely running tasks and logging their output to a given file

## Installation

```console
npm install remote-task
```

or

```console
npm install --save remote-task
```

## Usage

Server:

```javascript
var remoteTask = require('remote-task');

var server = remoteTask('tasks.log');

server.listen(3000);
```

Client:

```javascript
var remoteTask = require('remote-task');

var remoteControl = remoteTask.remoteStream(3000, '127.0.0.1'); //IP address is optional, arguments are passed to net.connect()

remoteControl.write(['cd', '/tmp']);
remoteControl.write(['touch', 'helloworld']);
remoteControl.write({end: true});

remoteControl.on('data', function(result){
  console.log(result.status); //success, hopefully
});
```