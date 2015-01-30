# remote-task
Simple server for remotely running tasks and logging their output to papertrail

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

var server = remoteTask(12345); //your papertrail port number

server.listen(3000);
```

Client:

```javascript
var remoteTask = require('remote-task');

var remoteControl = remoteTask.remoteStream(3000, '127.0.0.1'); //IP address is optional, arguments are passed to net.connect()

remoteControl.write(['cd', '/tmp']);
remoteControl.write(['touch', 'helloworld']);

remoteControl.on('data', function(result){
  console.log(result.status); //success, hopefully
});
```