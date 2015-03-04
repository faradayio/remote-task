var assert = require('assert');
var shellescape = require('./shellEscape');

//simple
var args = ['curl', '-v', '-H', 'Location;', '-H', 'User-Agent: dave#10', 'http://www.daveeddy.com/?name=dave&age=24'];

var escaped = shellescape(args);

assert.strictEqual(escaped, "curl -v -H 'Location;' -H 'User-Agent: dave#10' 'http://www.daveeddy.com/?name=dave&age=24'");
console.log(escaped);


//more
var d = {
  "echo 'hello\\nworld'": ['echo', 'hello\\nworld'],
  "echo 'hello\\tworld'": ['echo', 'hello\\tworld'],
  "echo '\thello\nworld'\\'": ['echo', '\thello\nworld\''],
  "echo 'hello  world'": ['echo', 'hello  world'],
  "echo hello world": ['echo', 'hello', 'world'],
  "echo 'hello\\\\'\\' \\''\\\\'\\''world'": ["echo", "hello\\\\'", "'\\\\'world"],
  "echo hello 'world\\'": ["echo", "hello", "world\\"]
};

Object.keys(d).forEach(function(s) {
  var escaped = shellescape(d[s]);
  assert.strictEqual(escaped, s);
  console.log(s);
});


//advanced
var args = ['echo', 'hello!', 'how are you doing $USER', '"double"', "'single'"];

var escaped = shellescape(args);
assert.strictEqual(escaped, "echo 'hello!' 'how are you doing $USER' '\"double\"' \\''single'\\'");
console.log(escaped);

//my tests
var escaped = shellescape(['cat', 'file.csv', '>', 'otherthing.csv']);
assert.strictEqual(escaped, "cat 'file.csv' > 'otherthing.csv'");
console.log(escaped);

var escaped = shellescape(['cat', 'file.csv', '|', 'mappy', '>', 'otherthing.csv']);
assert.strictEqual(escaped, "cat 'file.csv' | mappy > 'otherthing.csv'");
console.log(escaped);

var escaped = shellescape(['cat', 'file.csv?&', '|', 'mappy', '>', 'otherthing.csv']);
assert.strictEqual(escaped, "cat 'file.csv?&' | mappy > 'otherthing.csv'");
console.log(escaped);

var escaped = shellescape(['hi\'?']);
console.log(escaped);
assert.strictEqual(escaped, "'hi'\\''?'");

var escaped = shellescape(['--delimeter', '\\|']);
console.log(escaped);
assert.strictEqual(escaped, "--delimeter \\|");