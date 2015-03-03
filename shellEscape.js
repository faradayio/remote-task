var lameShellEscape = require('shell-escape');

module.exports = shellEscape;

function shellEscape(args){
  var pipes = ['{', '}', '<', '>', '>>', '|', '&>', '2>&1', '&&', ';', '||'];
  var breaks = args.map(function(arg, i){
    return {
      arg: arg,
      i: i
    };
  }).filter(function(item){
    return (pipes.indexOf(item.arg) !== -1);
  }).map(function(item){
    return item.i;
  });

  return args.reduce(function(command, arg, i){
    if (breaks.indexOf(i) === -1) {
      command.push(lameShellEscape([arg]));
    } else {
      command.push(arg);
    }
    return command;
  }, []).join(' ');
}