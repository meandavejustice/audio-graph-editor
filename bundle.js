(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
var FlowGraph = require('flowgraph')
var FlowGraphView = require('flowgraph-editor')
var getUserMedia = require('getusermedia')
var insertCss = require('insert-css')
var templates = require('./templates.json')
var delegate = require('delegate-dom')
var extend = require('xtend')
var domArray = require('dom-array')

var AudioContext = require('audiocontext');
var AudioGraph = require('audiograph');
var context = new AudioContext();

window.audioGraph = new AudioGraph(context);

var templatesElement = document.querySelector('#templates')
var startButton = document.querySelector('#start')
var addNodeForm = document.querySelector('#add-node')
var nodeNameInput = document.querySelector('#node-name')

Object.keys(templates).forEach(function (name) {
  var li = document.createElement('li')
  var button = document.createElement('button')
  var text = document.createTextNode(name)
  button.appendChild(text)
  li.appendChild(button)
  templatesElement.appendChild(li)
})

delegate.on(templatesElement, 'button', 'click', function (e) {
  var label = e.target.innerText
  var config = templates[label]
  var opts = {label: label, config: config}
  if(!config.in) opts.inports = []
  if(!config.out) opts.outports = []

  var options = extend({
    x: 200,
    y: 200
  }, opts)
  try {
    var node = graph.addNode(options)
  } catch(e) {
    alert(e.message)
  }
})

startButton.addEventListener('click', function () {
  startButton.innerHTML = 'bundling...'
  runCode()
})

window.graph = new FlowGraph()

window.view = new FlowGraphView(graph)
document.body.appendChild(view.svg)

var Windows = require('./windows')
var windows = new Windows()

graph.on('node-deleted', function (node) {
  windows.remove(node.id)
})

graph.on('node-added', function (node) {
  windows.add({id: node.id, name: node.id + '(' + node.label + ')', x: node.x + 100, y: node.y, config: node.config})
  windows.hide(node.id)
})

view.on('node-select', function (node) {
  windows.show(node.id)
  windows.setPosition(node.id, {x: node.x + 108, y: node.y})
})

insertCss(FlowGraphView.css)

function stop() {
  callMethodForSourceNodes('stop');
}

function start() {
  callMethodForSourceNodes('start');
}

function callMethodForSourceNodes(method) {
  window.audioGraph.sourceIds.forEach(function(id) {
    window.audioGraph.graph.forEach(function(obj) {
      if (obj.id === id && obj.node[method]) obj.node[method]();
    });
  });
}

function runCode() {
  var edgeMap = {};

	graph.getEdges().forEach(function(e) {edgeMap[e.source.id] = e.target.id;});

  var mediaSource;
  var nodes = graph.nodes.map(function (node) {
    // opts
    var selectorOpts = '#window-' + node.id + ' input'
    var opts = {}
    domArray(document.querySelectorAll(selectorOpts)).forEach(function (elem) {
      opts[elem.dataset.name] = elem.value;
    })
    if (edgeMap[node.id]) node.output = edgeMap[node.id];
    else node.output = 'output';
    node.type = node.label;
    node.opts = opts;
    node.params = extend(node.config['node-params'], node.opts);
    if (node.type === 'mediaStreamSource') {
      mediaSource = node;
    }
    return node;
  });

  if (mediaSource) {
    getUserMedia(function (err, stream) {
      if (err) console.error('failed');
      else {
        mediaSource.source = stream;
        window.audioGraph.graph = nodes;
        runnit();
      }
    });
  } else {
    window.audioGraph.graph = nodes;
    runnit();
  }
}

function runnit() {
  window.audioGraph.update();
  start();
  setTimeout(stop, 4000);
  startButton.innerHTML = 'Start';
}


window.addEventListener('message', receiveMessage, false)

function receiveMessage(e) {
  if(typeof e.data === 'string') console.log(e.data)
  if(typeof e.data === 'object') {
    if(e.data.type === 'nodeOut') {
      view.blinkEdge(e.data.id)
    }
  }
}

},{"./templates.json":131,"./windows":132,"audiocontext":2,"audiograph":3,"delegate-dom":11,"dom-array":17,"flowgraph":71,"flowgraph-editor":20,"getusermedia":83,"insert-css":86,"xtend":130}],2:[function(require,module,exports){
/*
 * Web Audio API AudioContext shim
 */
(function (definition) {
    if (typeof exports === "object") {
        module.exports = definition();
    }
})(function () {
  return window.AudioContext || window.webkitAudioContext;
});

},{}],3:[function(require,module,exports){
module.exports = require('./lib/index.js');
},{"./lib/index.js":4}],4:[function(require,module,exports){
var cap = require('lodash.capitalize');
var values = require('lodash.values');
var inherits = require('inherits');
var EventEmitter = require('events').EventEmitter;
var uuid = require('uuid');

inherits(AudioGraph, EventEmitter);

module.exports = AudioGraph;

function getNode(ctx, type, source) {
  return ctx['create' + cap(type)](source);
}

function setParams(node, params) {
  Object.keys(params).forEach(function(p) {
    node[p] = params[p];
  })
  return node;
}

function AudioGraph(context, initGraph) {
  EventEmitter.call(this);
  this.context = context;
  this.graph = initGraph || [];
  this.id = 'audiograph-'+ uuid();
  this.update();
  this.sourceIds = getSourceIds(this.graph);
  return this;
}

AudioGraph.prototype.update = function() {
  this.graph = generateAndConnectGraph(this.context, this.graph);
  this.sourceIds = getSourceIds(this.graph);
  this.emit('update', this);
  return this;
}

function getSourceIds(graph) {
  return graph.map(function(obj) {return obj.id})
         .filter(function(id) {
           return !~graph.map(function(obj) {
                      return obj.output;
                    }).indexOf(id)});
}

function generateAndConnectGraph(ctx, oldGraph) {
  if (!oldGraph.length) return oldGraph;
  var outputId, nuGraph = {
    "output": {node: ctx.destination}
  };

  // loop over and create (or disconnect) nodes
  oldGraph.forEach(function(obj) {
    if (obj.output === 'output') outputId = obj.id;
    if (obj.node) obj.node.disconnect();
    if (obj.type === 'mediaStreamSource') obj.node = getNode(ctx, obj.type, obj.source);
    else if (obj.type === 'delay') obj.node = getNode(ctx, obj.type, obj.params.maxDelayTime);
    else obj.node = getNode(ctx, obj.type);
    nuGraph[obj.id] = obj;

    setParams(obj.node, obj.params);
  });

  oldGraph.forEach(function(obj) {
    nuGraph[obj.id].node.connect(nuGraph[obj.output].node);
  })

  return values(nuGraph);
}

},{"events":10,"inherits":85,"lodash.capitalize":87,"lodash.values":89,"uuid":96}],5:[function(require,module,exports){

},{}],6:[function(require,module,exports){
/*!
 * The buffer module from node.js, for the browser.
 *
 * @author   Feross Aboukhadijeh <feross@feross.org> <http://feross.org>
 * @license  MIT
 */

var base64 = require('base64-js')
var ieee754 = require('ieee754')
var isArray = require('is-array')

exports.Buffer = Buffer
exports.SlowBuffer = SlowBuffer
exports.INSPECT_MAX_BYTES = 50
Buffer.poolSize = 8192 // not used by this implementation

var rootParent = {}

/**
 * If `Buffer.TYPED_ARRAY_SUPPORT`:
 *   === true    Use Uint8Array implementation (fastest)
 *   === false   Use Object implementation (most compatible, even IE6)
 *
 * Browsers that support typed arrays are IE 10+, Firefox 4+, Chrome 7+, Safari 5.1+,
 * Opera 11.6+, iOS 4.2+.
 *
 * Note:
 *
 * - Implementation must support adding new properties to `Uint8Array` instances.
 *   Firefox 4-29 lacked support, fixed in Firefox 30+.
 *   See: https://bugzilla.mozilla.org/show_bug.cgi?id=695438.
 *
 *  - Chrome 9-10 is missing the `TypedArray.prototype.subarray` function.
 *
 *  - IE10 has a broken `TypedArray.prototype.subarray` function which returns arrays of
 *    incorrect length in some situations.
 *
 * We detect these buggy browsers and set `Buffer.TYPED_ARRAY_SUPPORT` to `false` so they will
 * get the Object implementation, which is slower but will work correctly.
 */
Buffer.TYPED_ARRAY_SUPPORT = (function () {
  try {
    var buf = new ArrayBuffer(0)
    var arr = new Uint8Array(buf)
    arr.foo = function () { return 42 }
    return arr.foo() === 42 && // typed array instances can be augmented
        typeof arr.subarray === 'function' && // chrome 9-10 lack `subarray`
        new Uint8Array(1).subarray(1, 1).byteLength === 0 // ie10 has broken `subarray`
  } catch (e) {
    return false
  }
})()

function kMaxLength () {
  return Buffer.TYPED_ARRAY_SUPPORT
    ? 0x7fffffff
    : 0x3fffffff
}

/**
 * Class: Buffer
 * =============
 *
 * The Buffer constructor returns instances of `Uint8Array` that are augmented
 * with function properties for all the node `Buffer` API functions. We use
 * `Uint8Array` so that square bracket notation works as expected -- it returns
 * a single octet.
 *
 * By augmenting the instances, we can avoid modifying the `Uint8Array`
 * prototype.
 */
function Buffer (arg) {
  if (!(this instanceof Buffer)) {
    // Avoid going through an ArgumentsAdaptorTrampoline in the common case.
    if (arguments.length > 1) return new Buffer(arg, arguments[1])
    return new Buffer(arg)
  }

  this.length = 0
  this.parent = undefined

  // Common case.
  if (typeof arg === 'number') {
    return fromNumber(this, arg)
  }

  // Slightly less common case.
  if (typeof arg === 'string') {
    return fromString(this, arg, arguments.length > 1 ? arguments[1] : 'utf8')
  }

  // Unusual.
  return fromObject(this, arg)
}

function fromNumber (that, length) {
  that = allocate(that, length < 0 ? 0 : checked(length) | 0)
  if (!Buffer.TYPED_ARRAY_SUPPORT) {
    for (var i = 0; i < length; i++) {
      that[i] = 0
    }
  }
  return that
}

function fromString (that, string, encoding) {
  if (typeof encoding !== 'string' || encoding === '') encoding = 'utf8'

  // Assumption: byteLength() return value is always < kMaxLength.
  var length = byteLength(string, encoding) | 0
  that = allocate(that, length)

  that.write(string, encoding)
  return that
}

function fromObject (that, object) {
  if (Buffer.isBuffer(object)) return fromBuffer(that, object)

  if (isArray(object)) return fromArray(that, object)

  if (object == null) {
    throw new TypeError('must start with number, buffer, array or string')
  }

  if (typeof ArrayBuffer !== 'undefined' && object.buffer instanceof ArrayBuffer) {
    return fromTypedArray(that, object)
  }

  if (object.length) return fromArrayLike(that, object)

  return fromJsonObject(that, object)
}

function fromBuffer (that, buffer) {
  var length = checked(buffer.length) | 0
  that = allocate(that, length)
  buffer.copy(that, 0, 0, length)
  return that
}

function fromArray (that, array) {
  var length = checked(array.length) | 0
  that = allocate(that, length)
  for (var i = 0; i < length; i += 1) {
    that[i] = array[i] & 255
  }
  return that
}

// Duplicate of fromArray() to keep fromArray() monomorphic.
function fromTypedArray (that, array) {
  var length = checked(array.length) | 0
  that = allocate(that, length)
  // Truncating the elements is probably not what people expect from typed
  // arrays with BYTES_PER_ELEMENT > 1 but it's compatible with the behavior
  // of the old Buffer constructor.
  for (var i = 0; i < length; i += 1) {
    that[i] = array[i] & 255
  }
  return that
}

function fromArrayLike (that, array) {
  var length = checked(array.length) | 0
  that = allocate(that, length)
  for (var i = 0; i < length; i += 1) {
    that[i] = array[i] & 255
  }
  return that
}

// Deserialize { type: 'Buffer', data: [1,2,3,...] } into a Buffer object.
// Returns a zero-length buffer for inputs that don't conform to the spec.
function fromJsonObject (that, object) {
  var array
  var length = 0

  if (object.type === 'Buffer' && isArray(object.data)) {
    array = object.data
    length = checked(array.length) | 0
  }
  that = allocate(that, length)

  for (var i = 0; i < length; i += 1) {
    that[i] = array[i] & 255
  }
  return that
}

function allocate (that, length) {
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    // Return an augmented `Uint8Array` instance, for best performance
    that = Buffer._augment(new Uint8Array(length))
  } else {
    // Fallback: Return an object instance of the Buffer class
    that.length = length
    that._isBuffer = true
  }

  var fromPool = length !== 0 && length <= Buffer.poolSize >>> 1
  if (fromPool) that.parent = rootParent

  return that
}

function checked (length) {
  // Note: cannot use `length < kMaxLength` here because that fails when
  // length is NaN (which is otherwise coerced to zero.)
  if (length >= kMaxLength()) {
    throw new RangeError('Attempt to allocate Buffer larger than maximum ' +
                         'size: 0x' + kMaxLength().toString(16) + ' bytes')
  }
  return length | 0
}

function SlowBuffer (subject, encoding) {
  if (!(this instanceof SlowBuffer)) return new SlowBuffer(subject, encoding)

  var buf = new Buffer(subject, encoding)
  delete buf.parent
  return buf
}

Buffer.isBuffer = function isBuffer (b) {
  return !!(b != null && b._isBuffer)
}

Buffer.compare = function compare (a, b) {
  if (!Buffer.isBuffer(a) || !Buffer.isBuffer(b)) {
    throw new TypeError('Arguments must be Buffers')
  }

  if (a === b) return 0

  var x = a.length
  var y = b.length

  var i = 0
  var len = Math.min(x, y)
  while (i < len) {
    if (a[i] !== b[i]) break

    ++i
  }

  if (i !== len) {
    x = a[i]
    y = b[i]
  }

  if (x < y) return -1
  if (y < x) return 1
  return 0
}

Buffer.isEncoding = function isEncoding (encoding) {
  switch (String(encoding).toLowerCase()) {
    case 'hex':
    case 'utf8':
    case 'utf-8':
    case 'ascii':
    case 'binary':
    case 'base64':
    case 'raw':
    case 'ucs2':
    case 'ucs-2':
    case 'utf16le':
    case 'utf-16le':
      return true
    default:
      return false
  }
}

Buffer.concat = function concat (list, length) {
  if (!isArray(list)) throw new TypeError('list argument must be an Array of Buffers.')

  if (list.length === 0) {
    return new Buffer(0)
  } else if (list.length === 1) {
    return list[0]
  }

  var i
  if (length === undefined) {
    length = 0
    for (i = 0; i < list.length; i++) {
      length += list[i].length
    }
  }

  var buf = new Buffer(length)
  var pos = 0
  for (i = 0; i < list.length; i++) {
    var item = list[i]
    item.copy(buf, pos)
    pos += item.length
  }
  return buf
}

function byteLength (string, encoding) {
  if (typeof string !== 'string') string = '' + string

  var len = string.length
  if (len === 0) return 0

  // Use a for loop to avoid recursion
  var loweredCase = false
  for (;;) {
    switch (encoding) {
      case 'ascii':
      case 'binary':
      // Deprecated
      case 'raw':
      case 'raws':
        return len
      case 'utf8':
      case 'utf-8':
        return utf8ToBytes(string).length
      case 'ucs2':
      case 'ucs-2':
      case 'utf16le':
      case 'utf-16le':
        return len * 2
      case 'hex':
        return len >>> 1
      case 'base64':
        return base64ToBytes(string).length
      default:
        if (loweredCase) return utf8ToBytes(string).length // assume utf8
        encoding = ('' + encoding).toLowerCase()
        loweredCase = true
    }
  }
}
Buffer.byteLength = byteLength

// pre-set for values that may exist in the future
Buffer.prototype.length = undefined
Buffer.prototype.parent = undefined

function slowToString (encoding, start, end) {
  var loweredCase = false

  start = start | 0
  end = end === undefined || end === Infinity ? this.length : end | 0

  if (!encoding) encoding = 'utf8'
  if (start < 0) start = 0
  if (end > this.length) end = this.length
  if (end <= start) return ''

  while (true) {
    switch (encoding) {
      case 'hex':
        return hexSlice(this, start, end)

      case 'utf8':
      case 'utf-8':
        return utf8Slice(this, start, end)

      case 'ascii':
        return asciiSlice(this, start, end)

      case 'binary':
        return binarySlice(this, start, end)

      case 'base64':
        return base64Slice(this, start, end)

      case 'ucs2':
      case 'ucs-2':
      case 'utf16le':
      case 'utf-16le':
        return utf16leSlice(this, start, end)

      default:
        if (loweredCase) throw new TypeError('Unknown encoding: ' + encoding)
        encoding = (encoding + '').toLowerCase()
        loweredCase = true
    }
  }
}

Buffer.prototype.toString = function toString () {
  var length = this.length | 0
  if (length === 0) return ''
  if (arguments.length === 0) return utf8Slice(this, 0, length)
  return slowToString.apply(this, arguments)
}

Buffer.prototype.equals = function equals (b) {
  if (!Buffer.isBuffer(b)) throw new TypeError('Argument must be a Buffer')
  if (this === b) return true
  return Buffer.compare(this, b) === 0
}

Buffer.prototype.inspect = function inspect () {
  var str = ''
  var max = exports.INSPECT_MAX_BYTES
  if (this.length > 0) {
    str = this.toString('hex', 0, max).match(/.{2}/g).join(' ')
    if (this.length > max) str += ' ... '
  }
  return '<Buffer ' + str + '>'
}

Buffer.prototype.compare = function compare (b) {
  if (!Buffer.isBuffer(b)) throw new TypeError('Argument must be a Buffer')
  if (this === b) return 0
  return Buffer.compare(this, b)
}

Buffer.prototype.indexOf = function indexOf (val, byteOffset) {
  if (byteOffset > 0x7fffffff) byteOffset = 0x7fffffff
  else if (byteOffset < -0x80000000) byteOffset = -0x80000000
  byteOffset >>= 0

  if (this.length === 0) return -1
  if (byteOffset >= this.length) return -1

  // Negative offsets start from the end of the buffer
  if (byteOffset < 0) byteOffset = Math.max(this.length + byteOffset, 0)

  if (typeof val === 'string') {
    if (val.length === 0) return -1 // special case: looking for empty string always fails
    return String.prototype.indexOf.call(this, val, byteOffset)
  }
  if (Buffer.isBuffer(val)) {
    return arrayIndexOf(this, val, byteOffset)
  }
  if (typeof val === 'number') {
    if (Buffer.TYPED_ARRAY_SUPPORT && Uint8Array.prototype.indexOf === 'function') {
      return Uint8Array.prototype.indexOf.call(this, val, byteOffset)
    }
    return arrayIndexOf(this, [ val ], byteOffset)
  }

  function arrayIndexOf (arr, val, byteOffset) {
    var foundIndex = -1
    for (var i = 0; byteOffset + i < arr.length; i++) {
      if (arr[byteOffset + i] === val[foundIndex === -1 ? 0 : i - foundIndex]) {
        if (foundIndex === -1) foundIndex = i
        if (i - foundIndex + 1 === val.length) return byteOffset + foundIndex
      } else {
        foundIndex = -1
      }
    }
    return -1
  }

  throw new TypeError('val must be string, number or Buffer')
}

// `get` will be removed in Node 0.13+
Buffer.prototype.get = function get (offset) {
  console.log('.get() is deprecated. Access using array indexes instead.')
  return this.readUInt8(offset)
}

// `set` will be removed in Node 0.13+
Buffer.prototype.set = function set (v, offset) {
  console.log('.set() is deprecated. Access using array indexes instead.')
  return this.writeUInt8(v, offset)
}

function hexWrite (buf, string, offset, length) {
  offset = Number(offset) || 0
  var remaining = buf.length - offset
  if (!length) {
    length = remaining
  } else {
    length = Number(length)
    if (length > remaining) {
      length = remaining
    }
  }

  // must be an even number of digits
  var strLen = string.length
  if (strLen % 2 !== 0) throw new Error('Invalid hex string')

  if (length > strLen / 2) {
    length = strLen / 2
  }
  for (var i = 0; i < length; i++) {
    var parsed = parseInt(string.substr(i * 2, 2), 16)
    if (isNaN(parsed)) throw new Error('Invalid hex string')
    buf[offset + i] = parsed
  }
  return i
}

function utf8Write (buf, string, offset, length) {
  return blitBuffer(utf8ToBytes(string, buf.length - offset), buf, offset, length)
}

function asciiWrite (buf, string, offset, length) {
  return blitBuffer(asciiToBytes(string), buf, offset, length)
}

function binaryWrite (buf, string, offset, length) {
  return asciiWrite(buf, string, offset, length)
}

function base64Write (buf, string, offset, length) {
  return blitBuffer(base64ToBytes(string), buf, offset, length)
}

function ucs2Write (buf, string, offset, length) {
  return blitBuffer(utf16leToBytes(string, buf.length - offset), buf, offset, length)
}

Buffer.prototype.write = function write (string, offset, length, encoding) {
  // Buffer#write(string)
  if (offset === undefined) {
    encoding = 'utf8'
    length = this.length
    offset = 0
  // Buffer#write(string, encoding)
  } else if (length === undefined && typeof offset === 'string') {
    encoding = offset
    length = this.length
    offset = 0
  // Buffer#write(string, offset[, length][, encoding])
  } else if (isFinite(offset)) {
    offset = offset | 0
    if (isFinite(length)) {
      length = length | 0
      if (encoding === undefined) encoding = 'utf8'
    } else {
      encoding = length
      length = undefined
    }
  // legacy write(string, encoding, offset, length) - remove in v0.13
  } else {
    var swap = encoding
    encoding = offset
    offset = length | 0
    length = swap
  }

  var remaining = this.length - offset
  if (length === undefined || length > remaining) length = remaining

  if ((string.length > 0 && (length < 0 || offset < 0)) || offset > this.length) {
    throw new RangeError('attempt to write outside buffer bounds')
  }

  if (!encoding) encoding = 'utf8'

  var loweredCase = false
  for (;;) {
    switch (encoding) {
      case 'hex':
        return hexWrite(this, string, offset, length)

      case 'utf8':
      case 'utf-8':
        return utf8Write(this, string, offset, length)

      case 'ascii':
        return asciiWrite(this, string, offset, length)

      case 'binary':
        return binaryWrite(this, string, offset, length)

      case 'base64':
        // Warning: maxLength not taken into account in base64Write
        return base64Write(this, string, offset, length)

      case 'ucs2':
      case 'ucs-2':
      case 'utf16le':
      case 'utf-16le':
        return ucs2Write(this, string, offset, length)

      default:
        if (loweredCase) throw new TypeError('Unknown encoding: ' + encoding)
        encoding = ('' + encoding).toLowerCase()
        loweredCase = true
    }
  }
}

Buffer.prototype.toJSON = function toJSON () {
  return {
    type: 'Buffer',
    data: Array.prototype.slice.call(this._arr || this, 0)
  }
}

function base64Slice (buf, start, end) {
  if (start === 0 && end === buf.length) {
    return base64.fromByteArray(buf)
  } else {
    return base64.fromByteArray(buf.slice(start, end))
  }
}

function utf8Slice (buf, start, end) {
  var res = ''
  var tmp = ''
  end = Math.min(buf.length, end)

  for (var i = start; i < end; i++) {
    if (buf[i] <= 0x7F) {
      res += decodeUtf8Char(tmp) + String.fromCharCode(buf[i])
      tmp = ''
    } else {
      tmp += '%' + buf[i].toString(16)
    }
  }

  return res + decodeUtf8Char(tmp)
}

function asciiSlice (buf, start, end) {
  var ret = ''
  end = Math.min(buf.length, end)

  for (var i = start; i < end; i++) {
    ret += String.fromCharCode(buf[i] & 0x7F)
  }
  return ret
}

function binarySlice (buf, start, end) {
  var ret = ''
  end = Math.min(buf.length, end)

  for (var i = start; i < end; i++) {
    ret += String.fromCharCode(buf[i])
  }
  return ret
}

function hexSlice (buf, start, end) {
  var len = buf.length

  if (!start || start < 0) start = 0
  if (!end || end < 0 || end > len) end = len

  var out = ''
  for (var i = start; i < end; i++) {
    out += toHex(buf[i])
  }
  return out
}

function utf16leSlice (buf, start, end) {
  var bytes = buf.slice(start, end)
  var res = ''
  for (var i = 0; i < bytes.length; i += 2) {
    res += String.fromCharCode(bytes[i] + bytes[i + 1] * 256)
  }
  return res
}

Buffer.prototype.slice = function slice (start, end) {
  var len = this.length
  start = ~~start
  end = end === undefined ? len : ~~end

  if (start < 0) {
    start += len
    if (start < 0) start = 0
  } else if (start > len) {
    start = len
  }

  if (end < 0) {
    end += len
    if (end < 0) end = 0
  } else if (end > len) {
    end = len
  }

  if (end < start) end = start

  var newBuf
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    newBuf = Buffer._augment(this.subarray(start, end))
  } else {
    var sliceLen = end - start
    newBuf = new Buffer(sliceLen, undefined)
    for (var i = 0; i < sliceLen; i++) {
      newBuf[i] = this[i + start]
    }
  }

  if (newBuf.length) newBuf.parent = this.parent || this

  return newBuf
}

/*
 * Need to make sure that buffer isn't trying to write out of bounds.
 */
function checkOffset (offset, ext, length) {
  if ((offset % 1) !== 0 || offset < 0) throw new RangeError('offset is not uint')
  if (offset + ext > length) throw new RangeError('Trying to access beyond buffer length')
}

Buffer.prototype.readUIntLE = function readUIntLE (offset, byteLength, noAssert) {
  offset = offset | 0
  byteLength = byteLength | 0
  if (!noAssert) checkOffset(offset, byteLength, this.length)

  var val = this[offset]
  var mul = 1
  var i = 0
  while (++i < byteLength && (mul *= 0x100)) {
    val += this[offset + i] * mul
  }

  return val
}

Buffer.prototype.readUIntBE = function readUIntBE (offset, byteLength, noAssert) {
  offset = offset | 0
  byteLength = byteLength | 0
  if (!noAssert) {
    checkOffset(offset, byteLength, this.length)
  }

  var val = this[offset + --byteLength]
  var mul = 1
  while (byteLength > 0 && (mul *= 0x100)) {
    val += this[offset + --byteLength] * mul
  }

  return val
}

Buffer.prototype.readUInt8 = function readUInt8 (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 1, this.length)
  return this[offset]
}

Buffer.prototype.readUInt16LE = function readUInt16LE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 2, this.length)
  return this[offset] | (this[offset + 1] << 8)
}

Buffer.prototype.readUInt16BE = function readUInt16BE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 2, this.length)
  return (this[offset] << 8) | this[offset + 1]
}

Buffer.prototype.readUInt32LE = function readUInt32LE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 4, this.length)

  return ((this[offset]) |
      (this[offset + 1] << 8) |
      (this[offset + 2] << 16)) +
      (this[offset + 3] * 0x1000000)
}

Buffer.prototype.readUInt32BE = function readUInt32BE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 4, this.length)

  return (this[offset] * 0x1000000) +
    ((this[offset + 1] << 16) |
    (this[offset + 2] << 8) |
    this[offset + 3])
}

Buffer.prototype.readIntLE = function readIntLE (offset, byteLength, noAssert) {
  offset = offset | 0
  byteLength = byteLength | 0
  if (!noAssert) checkOffset(offset, byteLength, this.length)

  var val = this[offset]
  var mul = 1
  var i = 0
  while (++i < byteLength && (mul *= 0x100)) {
    val += this[offset + i] * mul
  }
  mul *= 0x80

  if (val >= mul) val -= Math.pow(2, 8 * byteLength)

  return val
}

Buffer.prototype.readIntBE = function readIntBE (offset, byteLength, noAssert) {
  offset = offset | 0
  byteLength = byteLength | 0
  if (!noAssert) checkOffset(offset, byteLength, this.length)

  var i = byteLength
  var mul = 1
  var val = this[offset + --i]
  while (i > 0 && (mul *= 0x100)) {
    val += this[offset + --i] * mul
  }
  mul *= 0x80

  if (val >= mul) val -= Math.pow(2, 8 * byteLength)

  return val
}

Buffer.prototype.readInt8 = function readInt8 (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 1, this.length)
  if (!(this[offset] & 0x80)) return (this[offset])
  return ((0xff - this[offset] + 1) * -1)
}

Buffer.prototype.readInt16LE = function readInt16LE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 2, this.length)
  var val = this[offset] | (this[offset + 1] << 8)
  return (val & 0x8000) ? val | 0xFFFF0000 : val
}

Buffer.prototype.readInt16BE = function readInt16BE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 2, this.length)
  var val = this[offset + 1] | (this[offset] << 8)
  return (val & 0x8000) ? val | 0xFFFF0000 : val
}

Buffer.prototype.readInt32LE = function readInt32LE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 4, this.length)

  return (this[offset]) |
    (this[offset + 1] << 8) |
    (this[offset + 2] << 16) |
    (this[offset + 3] << 24)
}

Buffer.prototype.readInt32BE = function readInt32BE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 4, this.length)

  return (this[offset] << 24) |
    (this[offset + 1] << 16) |
    (this[offset + 2] << 8) |
    (this[offset + 3])
}

Buffer.prototype.readFloatLE = function readFloatLE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 4, this.length)
  return ieee754.read(this, offset, true, 23, 4)
}

Buffer.prototype.readFloatBE = function readFloatBE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 4, this.length)
  return ieee754.read(this, offset, false, 23, 4)
}

Buffer.prototype.readDoubleLE = function readDoubleLE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 8, this.length)
  return ieee754.read(this, offset, true, 52, 8)
}

Buffer.prototype.readDoubleBE = function readDoubleBE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 8, this.length)
  return ieee754.read(this, offset, false, 52, 8)
}

function checkInt (buf, value, offset, ext, max, min) {
  if (!Buffer.isBuffer(buf)) throw new TypeError('buffer must be a Buffer instance')
  if (value > max || value < min) throw new RangeError('value is out of bounds')
  if (offset + ext > buf.length) throw new RangeError('index out of range')
}

Buffer.prototype.writeUIntLE = function writeUIntLE (value, offset, byteLength, noAssert) {
  value = +value
  offset = offset | 0
  byteLength = byteLength | 0
  if (!noAssert) checkInt(this, value, offset, byteLength, Math.pow(2, 8 * byteLength), 0)

  var mul = 1
  var i = 0
  this[offset] = value & 0xFF
  while (++i < byteLength && (mul *= 0x100)) {
    this[offset + i] = (value / mul) & 0xFF
  }

  return offset + byteLength
}

Buffer.prototype.writeUIntBE = function writeUIntBE (value, offset, byteLength, noAssert) {
  value = +value
  offset = offset | 0
  byteLength = byteLength | 0
  if (!noAssert) checkInt(this, value, offset, byteLength, Math.pow(2, 8 * byteLength), 0)

  var i = byteLength - 1
  var mul = 1
  this[offset + i] = value & 0xFF
  while (--i >= 0 && (mul *= 0x100)) {
    this[offset + i] = (value / mul) & 0xFF
  }

  return offset + byteLength
}

Buffer.prototype.writeUInt8 = function writeUInt8 (value, offset, noAssert) {
  value = +value
  offset = offset | 0
  if (!noAssert) checkInt(this, value, offset, 1, 0xff, 0)
  if (!Buffer.TYPED_ARRAY_SUPPORT) value = Math.floor(value)
  this[offset] = value
  return offset + 1
}

function objectWriteUInt16 (buf, value, offset, littleEndian) {
  if (value < 0) value = 0xffff + value + 1
  for (var i = 0, j = Math.min(buf.length - offset, 2); i < j; i++) {
    buf[offset + i] = (value & (0xff << (8 * (littleEndian ? i : 1 - i)))) >>>
      (littleEndian ? i : 1 - i) * 8
  }
}

Buffer.prototype.writeUInt16LE = function writeUInt16LE (value, offset, noAssert) {
  value = +value
  offset = offset | 0
  if (!noAssert) checkInt(this, value, offset, 2, 0xffff, 0)
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    this[offset] = value
    this[offset + 1] = (value >>> 8)
  } else {
    objectWriteUInt16(this, value, offset, true)
  }
  return offset + 2
}

Buffer.prototype.writeUInt16BE = function writeUInt16BE (value, offset, noAssert) {
  value = +value
  offset = offset | 0
  if (!noAssert) checkInt(this, value, offset, 2, 0xffff, 0)
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    this[offset] = (value >>> 8)
    this[offset + 1] = value
  } else {
    objectWriteUInt16(this, value, offset, false)
  }
  return offset + 2
}

function objectWriteUInt32 (buf, value, offset, littleEndian) {
  if (value < 0) value = 0xffffffff + value + 1
  for (var i = 0, j = Math.min(buf.length - offset, 4); i < j; i++) {
    buf[offset + i] = (value >>> (littleEndian ? i : 3 - i) * 8) & 0xff
  }
}

Buffer.prototype.writeUInt32LE = function writeUInt32LE (value, offset, noAssert) {
  value = +value
  offset = offset | 0
  if (!noAssert) checkInt(this, value, offset, 4, 0xffffffff, 0)
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    this[offset + 3] = (value >>> 24)
    this[offset + 2] = (value >>> 16)
    this[offset + 1] = (value >>> 8)
    this[offset] = value
  } else {
    objectWriteUInt32(this, value, offset, true)
  }
  return offset + 4
}

Buffer.prototype.writeUInt32BE = function writeUInt32BE (value, offset, noAssert) {
  value = +value
  offset = offset | 0
  if (!noAssert) checkInt(this, value, offset, 4, 0xffffffff, 0)
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    this[offset] = (value >>> 24)
    this[offset + 1] = (value >>> 16)
    this[offset + 2] = (value >>> 8)
    this[offset + 3] = value
  } else {
    objectWriteUInt32(this, value, offset, false)
  }
  return offset + 4
}

Buffer.prototype.writeIntLE = function writeIntLE (value, offset, byteLength, noAssert) {
  value = +value
  offset = offset | 0
  if (!noAssert) {
    var limit = Math.pow(2, 8 * byteLength - 1)

    checkInt(this, value, offset, byteLength, limit - 1, -limit)
  }

  var i = 0
  var mul = 1
  var sub = value < 0 ? 1 : 0
  this[offset] = value & 0xFF
  while (++i < byteLength && (mul *= 0x100)) {
    this[offset + i] = ((value / mul) >> 0) - sub & 0xFF
  }

  return offset + byteLength
}

Buffer.prototype.writeIntBE = function writeIntBE (value, offset, byteLength, noAssert) {
  value = +value
  offset = offset | 0
  if (!noAssert) {
    var limit = Math.pow(2, 8 * byteLength - 1)

    checkInt(this, value, offset, byteLength, limit - 1, -limit)
  }

  var i = byteLength - 1
  var mul = 1
  var sub = value < 0 ? 1 : 0
  this[offset + i] = value & 0xFF
  while (--i >= 0 && (mul *= 0x100)) {
    this[offset + i] = ((value / mul) >> 0) - sub & 0xFF
  }

  return offset + byteLength
}

Buffer.prototype.writeInt8 = function writeInt8 (value, offset, noAssert) {
  value = +value
  offset = offset | 0
  if (!noAssert) checkInt(this, value, offset, 1, 0x7f, -0x80)
  if (!Buffer.TYPED_ARRAY_SUPPORT) value = Math.floor(value)
  if (value < 0) value = 0xff + value + 1
  this[offset] = value
  return offset + 1
}

Buffer.prototype.writeInt16LE = function writeInt16LE (value, offset, noAssert) {
  value = +value
  offset = offset | 0
  if (!noAssert) checkInt(this, value, offset, 2, 0x7fff, -0x8000)
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    this[offset] = value
    this[offset + 1] = (value >>> 8)
  } else {
    objectWriteUInt16(this, value, offset, true)
  }
  return offset + 2
}

Buffer.prototype.writeInt16BE = function writeInt16BE (value, offset, noAssert) {
  value = +value
  offset = offset | 0
  if (!noAssert) checkInt(this, value, offset, 2, 0x7fff, -0x8000)
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    this[offset] = (value >>> 8)
    this[offset + 1] = value
  } else {
    objectWriteUInt16(this, value, offset, false)
  }
  return offset + 2
}

Buffer.prototype.writeInt32LE = function writeInt32LE (value, offset, noAssert) {
  value = +value
  offset = offset | 0
  if (!noAssert) checkInt(this, value, offset, 4, 0x7fffffff, -0x80000000)
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    this[offset] = value
    this[offset + 1] = (value >>> 8)
    this[offset + 2] = (value >>> 16)
    this[offset + 3] = (value >>> 24)
  } else {
    objectWriteUInt32(this, value, offset, true)
  }
  return offset + 4
}

Buffer.prototype.writeInt32BE = function writeInt32BE (value, offset, noAssert) {
  value = +value
  offset = offset | 0
  if (!noAssert) checkInt(this, value, offset, 4, 0x7fffffff, -0x80000000)
  if (value < 0) value = 0xffffffff + value + 1
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    this[offset] = (value >>> 24)
    this[offset + 1] = (value >>> 16)
    this[offset + 2] = (value >>> 8)
    this[offset + 3] = value
  } else {
    objectWriteUInt32(this, value, offset, false)
  }
  return offset + 4
}

function checkIEEE754 (buf, value, offset, ext, max, min) {
  if (value > max || value < min) throw new RangeError('value is out of bounds')
  if (offset + ext > buf.length) throw new RangeError('index out of range')
  if (offset < 0) throw new RangeError('index out of range')
}

function writeFloat (buf, value, offset, littleEndian, noAssert) {
  if (!noAssert) {
    checkIEEE754(buf, value, offset, 4, 3.4028234663852886e+38, -3.4028234663852886e+38)
  }
  ieee754.write(buf, value, offset, littleEndian, 23, 4)
  return offset + 4
}

Buffer.prototype.writeFloatLE = function writeFloatLE (value, offset, noAssert) {
  return writeFloat(this, value, offset, true, noAssert)
}

Buffer.prototype.writeFloatBE = function writeFloatBE (value, offset, noAssert) {
  return writeFloat(this, value, offset, false, noAssert)
}

function writeDouble (buf, value, offset, littleEndian, noAssert) {
  if (!noAssert) {
    checkIEEE754(buf, value, offset, 8, 1.7976931348623157E+308, -1.7976931348623157E+308)
  }
  ieee754.write(buf, value, offset, littleEndian, 52, 8)
  return offset + 8
}

Buffer.prototype.writeDoubleLE = function writeDoubleLE (value, offset, noAssert) {
  return writeDouble(this, value, offset, true, noAssert)
}

Buffer.prototype.writeDoubleBE = function writeDoubleBE (value, offset, noAssert) {
  return writeDouble(this, value, offset, false, noAssert)
}

// copy(targetBuffer, targetStart=0, sourceStart=0, sourceEnd=buffer.length)
Buffer.prototype.copy = function copy (target, targetStart, start, end) {
  if (!start) start = 0
  if (!end && end !== 0) end = this.length
  if (targetStart >= target.length) targetStart = target.length
  if (!targetStart) targetStart = 0
  if (end > 0 && end < start) end = start

  // Copy 0 bytes; we're done
  if (end === start) return 0
  if (target.length === 0 || this.length === 0) return 0

  // Fatal error conditions
  if (targetStart < 0) {
    throw new RangeError('targetStart out of bounds')
  }
  if (start < 0 || start >= this.length) throw new RangeError('sourceStart out of bounds')
  if (end < 0) throw new RangeError('sourceEnd out of bounds')

  // Are we oob?
  if (end > this.length) end = this.length
  if (target.length - targetStart < end - start) {
    end = target.length - targetStart + start
  }

  var len = end - start

  if (len < 1000 || !Buffer.TYPED_ARRAY_SUPPORT) {
    for (var i = 0; i < len; i++) {
      target[i + targetStart] = this[i + start]
    }
  } else {
    target._set(this.subarray(start, start + len), targetStart)
  }

  return len
}

// fill(value, start=0, end=buffer.length)
Buffer.prototype.fill = function fill (value, start, end) {
  if (!value) value = 0
  if (!start) start = 0
  if (!end) end = this.length

  if (end < start) throw new RangeError('end < start')

  // Fill 0 bytes; we're done
  if (end === start) return
  if (this.length === 0) return

  if (start < 0 || start >= this.length) throw new RangeError('start out of bounds')
  if (end < 0 || end > this.length) throw new RangeError('end out of bounds')

  var i
  if (typeof value === 'number') {
    for (i = start; i < end; i++) {
      this[i] = value
    }
  } else {
    var bytes = utf8ToBytes(value.toString())
    var len = bytes.length
    for (i = start; i < end; i++) {
      this[i] = bytes[i % len]
    }
  }

  return this
}

/**
 * Creates a new `ArrayBuffer` with the *copied* memory of the buffer instance.
 * Added in Node 0.12. Only available in browsers that support ArrayBuffer.
 */
Buffer.prototype.toArrayBuffer = function toArrayBuffer () {
  if (typeof Uint8Array !== 'undefined') {
    if (Buffer.TYPED_ARRAY_SUPPORT) {
      return (new Buffer(this)).buffer
    } else {
      var buf = new Uint8Array(this.length)
      for (var i = 0, len = buf.length; i < len; i += 1) {
        buf[i] = this[i]
      }
      return buf.buffer
    }
  } else {
    throw new TypeError('Buffer.toArrayBuffer not supported in this browser')
  }
}

// HELPER FUNCTIONS
// ================

var BP = Buffer.prototype

/**
 * Augment a Uint8Array *instance* (not the Uint8Array class!) with Buffer methods
 */
Buffer._augment = function _augment (arr) {
  arr.constructor = Buffer
  arr._isBuffer = true

  // save reference to original Uint8Array set method before overwriting
  arr._set = arr.set

  // deprecated, will be removed in node 0.13+
  arr.get = BP.get
  arr.set = BP.set

  arr.write = BP.write
  arr.toString = BP.toString
  arr.toLocaleString = BP.toString
  arr.toJSON = BP.toJSON
  arr.equals = BP.equals
  arr.compare = BP.compare
  arr.indexOf = BP.indexOf
  arr.copy = BP.copy
  arr.slice = BP.slice
  arr.readUIntLE = BP.readUIntLE
  arr.readUIntBE = BP.readUIntBE
  arr.readUInt8 = BP.readUInt8
  arr.readUInt16LE = BP.readUInt16LE
  arr.readUInt16BE = BP.readUInt16BE
  arr.readUInt32LE = BP.readUInt32LE
  arr.readUInt32BE = BP.readUInt32BE
  arr.readIntLE = BP.readIntLE
  arr.readIntBE = BP.readIntBE
  arr.readInt8 = BP.readInt8
  arr.readInt16LE = BP.readInt16LE
  arr.readInt16BE = BP.readInt16BE
  arr.readInt32LE = BP.readInt32LE
  arr.readInt32BE = BP.readInt32BE
  arr.readFloatLE = BP.readFloatLE
  arr.readFloatBE = BP.readFloatBE
  arr.readDoubleLE = BP.readDoubleLE
  arr.readDoubleBE = BP.readDoubleBE
  arr.writeUInt8 = BP.writeUInt8
  arr.writeUIntLE = BP.writeUIntLE
  arr.writeUIntBE = BP.writeUIntBE
  arr.writeUInt16LE = BP.writeUInt16LE
  arr.writeUInt16BE = BP.writeUInt16BE
  arr.writeUInt32LE = BP.writeUInt32LE
  arr.writeUInt32BE = BP.writeUInt32BE
  arr.writeIntLE = BP.writeIntLE
  arr.writeIntBE = BP.writeIntBE
  arr.writeInt8 = BP.writeInt8
  arr.writeInt16LE = BP.writeInt16LE
  arr.writeInt16BE = BP.writeInt16BE
  arr.writeInt32LE = BP.writeInt32LE
  arr.writeInt32BE = BP.writeInt32BE
  arr.writeFloatLE = BP.writeFloatLE
  arr.writeFloatBE = BP.writeFloatBE
  arr.writeDoubleLE = BP.writeDoubleLE
  arr.writeDoubleBE = BP.writeDoubleBE
  arr.fill = BP.fill
  arr.inspect = BP.inspect
  arr.toArrayBuffer = BP.toArrayBuffer

  return arr
}

var INVALID_BASE64_RE = /[^+\/0-9A-z\-]/g

function base64clean (str) {
  // Node strips out invalid characters like \n and \t from the string, base64-js does not
  str = stringtrim(str).replace(INVALID_BASE64_RE, '')
  // Node converts strings with length < 2 to ''
  if (str.length < 2) return ''
  // Node allows for non-padded base64 strings (missing trailing ===), base64-js does not
  while (str.length % 4 !== 0) {
    str = str + '='
  }
  return str
}

function stringtrim (str) {
  if (str.trim) return str.trim()
  return str.replace(/^\s+|\s+$/g, '')
}

function toHex (n) {
  if (n < 16) return '0' + n.toString(16)
  return n.toString(16)
}

function utf8ToBytes (string, units) {
  units = units || Infinity
  var codePoint
  var length = string.length
  var leadSurrogate = null
  var bytes = []
  var i = 0

  for (; i < length; i++) {
    codePoint = string.charCodeAt(i)

    // is surrogate component
    if (codePoint > 0xD7FF && codePoint < 0xE000) {
      // last char was a lead
      if (leadSurrogate) {
        // 2 leads in a row
        if (codePoint < 0xDC00) {
          if ((units -= 3) > -1) bytes.push(0xEF, 0xBF, 0xBD)
          leadSurrogate = codePoint
          continue
        } else {
          // valid surrogate pair
          codePoint = leadSurrogate - 0xD800 << 10 | codePoint - 0xDC00 | 0x10000
          leadSurrogate = null
        }
      } else {
        // no lead yet

        if (codePoint > 0xDBFF) {
          // unexpected trail
          if ((units -= 3) > -1) bytes.push(0xEF, 0xBF, 0xBD)
          continue
        } else if (i + 1 === length) {
          // unpaired lead
          if ((units -= 3) > -1) bytes.push(0xEF, 0xBF, 0xBD)
          continue
        } else {
          // valid lead
          leadSurrogate = codePoint
          continue
        }
      }
    } else if (leadSurrogate) {
      // valid bmp char, but last char was a lead
      if ((units -= 3) > -1) bytes.push(0xEF, 0xBF, 0xBD)
      leadSurrogate = null
    }

    // encode utf8
    if (codePoint < 0x80) {
      if ((units -= 1) < 0) break
      bytes.push(codePoint)
    } else if (codePoint < 0x800) {
      if ((units -= 2) < 0) break
      bytes.push(
        codePoint >> 0x6 | 0xC0,
        codePoint & 0x3F | 0x80
      )
    } else if (codePoint < 0x10000) {
      if ((units -= 3) < 0) break
      bytes.push(
        codePoint >> 0xC | 0xE0,
        codePoint >> 0x6 & 0x3F | 0x80,
        codePoint & 0x3F | 0x80
      )
    } else if (codePoint < 0x200000) {
      if ((units -= 4) < 0) break
      bytes.push(
        codePoint >> 0x12 | 0xF0,
        codePoint >> 0xC & 0x3F | 0x80,
        codePoint >> 0x6 & 0x3F | 0x80,
        codePoint & 0x3F | 0x80
      )
    } else {
      throw new Error('Invalid code point')
    }
  }

  return bytes
}

function asciiToBytes (str) {
  var byteArray = []
  for (var i = 0; i < str.length; i++) {
    // Node's code seems to be doing this and not & 0x7F..
    byteArray.push(str.charCodeAt(i) & 0xFF)
  }
  return byteArray
}

function utf16leToBytes (str, units) {
  var c, hi, lo
  var byteArray = []
  for (var i = 0; i < str.length; i++) {
    if ((units -= 2) < 0) break

    c = str.charCodeAt(i)
    hi = c >> 8
    lo = c % 256
    byteArray.push(lo)
    byteArray.push(hi)
  }

  return byteArray
}

function base64ToBytes (str) {
  return base64.toByteArray(base64clean(str))
}

function blitBuffer (src, dst, offset, length) {
  for (var i = 0; i < length; i++) {
    if ((i + offset >= dst.length) || (i >= src.length)) break
    dst[i + offset] = src[i]
  }
  return i
}

function decodeUtf8Char (str) {
  try {
    return decodeURIComponent(str)
  } catch (err) {
    return String.fromCharCode(0xFFFD) // UTF 8 invalid char
  }
}

},{"base64-js":7,"ieee754":8,"is-array":9}],7:[function(require,module,exports){
var lookup = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

;(function (exports) {
	'use strict';

  var Arr = (typeof Uint8Array !== 'undefined')
    ? Uint8Array
    : Array

	var PLUS   = '+'.charCodeAt(0)
	var SLASH  = '/'.charCodeAt(0)
	var NUMBER = '0'.charCodeAt(0)
	var LOWER  = 'a'.charCodeAt(0)
	var UPPER  = 'A'.charCodeAt(0)
	var PLUS_URL_SAFE = '-'.charCodeAt(0)
	var SLASH_URL_SAFE = '_'.charCodeAt(0)

	function decode (elt) {
		var code = elt.charCodeAt(0)
		if (code === PLUS ||
		    code === PLUS_URL_SAFE)
			return 62 // '+'
		if (code === SLASH ||
		    code === SLASH_URL_SAFE)
			return 63 // '/'
		if (code < NUMBER)
			return -1 //no match
		if (code < NUMBER + 10)
			return code - NUMBER + 26 + 26
		if (code < UPPER + 26)
			return code - UPPER
		if (code < LOWER + 26)
			return code - LOWER + 26
	}

	function b64ToByteArray (b64) {
		var i, j, l, tmp, placeHolders, arr

		if (b64.length % 4 > 0) {
			throw new Error('Invalid string. Length must be a multiple of 4')
		}

		// the number of equal signs (place holders)
		// if there are two placeholders, than the two characters before it
		// represent one byte
		// if there is only one, then the three characters before it represent 2 bytes
		// this is just a cheap hack to not do indexOf twice
		var len = b64.length
		placeHolders = '=' === b64.charAt(len - 2) ? 2 : '=' === b64.charAt(len - 1) ? 1 : 0

		// base64 is 4/3 + up to two characters of the original data
		arr = new Arr(b64.length * 3 / 4 - placeHolders)

		// if there are placeholders, only get up to the last complete 4 chars
		l = placeHolders > 0 ? b64.length - 4 : b64.length

		var L = 0

		function push (v) {
			arr[L++] = v
		}

		for (i = 0, j = 0; i < l; i += 4, j += 3) {
			tmp = (decode(b64.charAt(i)) << 18) | (decode(b64.charAt(i + 1)) << 12) | (decode(b64.charAt(i + 2)) << 6) | decode(b64.charAt(i + 3))
			push((tmp & 0xFF0000) >> 16)
			push((tmp & 0xFF00) >> 8)
			push(tmp & 0xFF)
		}

		if (placeHolders === 2) {
			tmp = (decode(b64.charAt(i)) << 2) | (decode(b64.charAt(i + 1)) >> 4)
			push(tmp & 0xFF)
		} else if (placeHolders === 1) {
			tmp = (decode(b64.charAt(i)) << 10) | (decode(b64.charAt(i + 1)) << 4) | (decode(b64.charAt(i + 2)) >> 2)
			push((tmp >> 8) & 0xFF)
			push(tmp & 0xFF)
		}

		return arr
	}

	function uint8ToBase64 (uint8) {
		var i,
			extraBytes = uint8.length % 3, // if we have 1 byte left, pad 2 bytes
			output = "",
			temp, length

		function encode (num) {
			return lookup.charAt(num)
		}

		function tripletToBase64 (num) {
			return encode(num >> 18 & 0x3F) + encode(num >> 12 & 0x3F) + encode(num >> 6 & 0x3F) + encode(num & 0x3F)
		}

		// go through the array every three bytes, we'll deal with trailing stuff later
		for (i = 0, length = uint8.length - extraBytes; i < length; i += 3) {
			temp = (uint8[i] << 16) + (uint8[i + 1] << 8) + (uint8[i + 2])
			output += tripletToBase64(temp)
		}

		// pad the end with zeros, but make sure to not forget the extra bytes
		switch (extraBytes) {
			case 1:
				temp = uint8[uint8.length - 1]
				output += encode(temp >> 2)
				output += encode((temp << 4) & 0x3F)
				output += '=='
				break
			case 2:
				temp = (uint8[uint8.length - 2] << 8) + (uint8[uint8.length - 1])
				output += encode(temp >> 10)
				output += encode((temp >> 4) & 0x3F)
				output += encode((temp << 2) & 0x3F)
				output += '='
				break
		}

		return output
	}

	exports.toByteArray = b64ToByteArray
	exports.fromByteArray = uint8ToBase64
}(typeof exports === 'undefined' ? (this.base64js = {}) : exports))

},{}],8:[function(require,module,exports){
exports.read = function (buffer, offset, isLE, mLen, nBytes) {
  var e, m
  var eLen = nBytes * 8 - mLen - 1
  var eMax = (1 << eLen) - 1
  var eBias = eMax >> 1
  var nBits = -7
  var i = isLE ? (nBytes - 1) : 0
  var d = isLE ? -1 : 1
  var s = buffer[offset + i]

  i += d

  e = s & ((1 << (-nBits)) - 1)
  s >>= (-nBits)
  nBits += eLen
  for (; nBits > 0; e = e * 256 + buffer[offset + i], i += d, nBits -= 8) {}

  m = e & ((1 << (-nBits)) - 1)
  e >>= (-nBits)
  nBits += mLen
  for (; nBits > 0; m = m * 256 + buffer[offset + i], i += d, nBits -= 8) {}

  if (e === 0) {
    e = 1 - eBias
  } else if (e === eMax) {
    return m ? NaN : ((s ? -1 : 1) * Infinity)
  } else {
    m = m + Math.pow(2, mLen)
    e = e - eBias
  }
  return (s ? -1 : 1) * m * Math.pow(2, e - mLen)
}

exports.write = function (buffer, value, offset, isLE, mLen, nBytes) {
  var e, m, c
  var eLen = nBytes * 8 - mLen - 1
  var eMax = (1 << eLen) - 1
  var eBias = eMax >> 1
  var rt = (mLen === 23 ? Math.pow(2, -24) - Math.pow(2, -77) : 0)
  var i = isLE ? 0 : (nBytes - 1)
  var d = isLE ? 1 : -1
  var s = value < 0 || (value === 0 && 1 / value < 0) ? 1 : 0

  value = Math.abs(value)

  if (isNaN(value) || value === Infinity) {
    m = isNaN(value) ? 1 : 0
    e = eMax
  } else {
    e = Math.floor(Math.log(value) / Math.LN2)
    if (value * (c = Math.pow(2, -e)) < 1) {
      e--
      c *= 2
    }
    if (e + eBias >= 1) {
      value += rt / c
    } else {
      value += rt * Math.pow(2, 1 - eBias)
    }
    if (value * c >= 2) {
      e++
      c /= 2
    }

    if (e + eBias >= eMax) {
      m = 0
      e = eMax
    } else if (e + eBias >= 1) {
      m = (value * c - 1) * Math.pow(2, mLen)
      e = e + eBias
    } else {
      m = value * Math.pow(2, eBias - 1) * Math.pow(2, mLen)
      e = 0
    }
  }

  for (; mLen >= 8; buffer[offset + i] = m & 0xff, i += d, m /= 256, mLen -= 8) {}

  e = (e << mLen) | m
  eLen += mLen
  for (; eLen > 0; buffer[offset + i] = e & 0xff, i += d, e /= 256, eLen -= 8) {}

  buffer[offset + i - d] |= s * 128
}

},{}],9:[function(require,module,exports){

/**
 * isArray
 */

var isArray = Array.isArray;

/**
 * toString
 */

var str = Object.prototype.toString;

/**
 * Whether or not the given `val`
 * is an array.
 *
 * example:
 *
 *        isArray([]);
 *        // > true
 *        isArray(arguments);
 *        // > false
 *        isArray('');
 *        // > false
 *
 * @param {mixed} val
 * @return {bool}
 */

module.exports = isArray || function (val) {
  return !! val && '[object Array]' == str.call(val);
};

},{}],10:[function(require,module,exports){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

function EventEmitter() {
  this._events = this._events || {};
  this._maxListeners = this._maxListeners || undefined;
}
module.exports = EventEmitter;

// Backwards-compat with node 0.10.x
EventEmitter.EventEmitter = EventEmitter;

EventEmitter.prototype._events = undefined;
EventEmitter.prototype._maxListeners = undefined;

// By default EventEmitters will print a warning if more than 10 listeners are
// added to it. This is a useful default which helps finding memory leaks.
EventEmitter.defaultMaxListeners = 10;

// Obviously not all Emitters should be limited to 10. This function allows
// that to be increased. Set to zero for unlimited.
EventEmitter.prototype.setMaxListeners = function(n) {
  if (!isNumber(n) || n < 0 || isNaN(n))
    throw TypeError('n must be a positive number');
  this._maxListeners = n;
  return this;
};

EventEmitter.prototype.emit = function(type) {
  var er, handler, len, args, i, listeners;

  if (!this._events)
    this._events = {};

  // If there is no 'error' event listener then throw.
  if (type === 'error') {
    if (!this._events.error ||
        (isObject(this._events.error) && !this._events.error.length)) {
      er = arguments[1];
      if (er instanceof Error) {
        throw er; // Unhandled 'error' event
      }
      throw TypeError('Uncaught, unspecified "error" event.');
    }
  }

  handler = this._events[type];

  if (isUndefined(handler))
    return false;

  if (isFunction(handler)) {
    switch (arguments.length) {
      // fast cases
      case 1:
        handler.call(this);
        break;
      case 2:
        handler.call(this, arguments[1]);
        break;
      case 3:
        handler.call(this, arguments[1], arguments[2]);
        break;
      // slower
      default:
        len = arguments.length;
        args = new Array(len - 1);
        for (i = 1; i < len; i++)
          args[i - 1] = arguments[i];
        handler.apply(this, args);
    }
  } else if (isObject(handler)) {
    len = arguments.length;
    args = new Array(len - 1);
    for (i = 1; i < len; i++)
      args[i - 1] = arguments[i];

    listeners = handler.slice();
    len = listeners.length;
    for (i = 0; i < len; i++)
      listeners[i].apply(this, args);
  }

  return true;
};

EventEmitter.prototype.addListener = function(type, listener) {
  var m;

  if (!isFunction(listener))
    throw TypeError('listener must be a function');

  if (!this._events)
    this._events = {};

  // To avoid recursion in the case that type === "newListener"! Before
  // adding it to the listeners, first emit "newListener".
  if (this._events.newListener)
    this.emit('newListener', type,
              isFunction(listener.listener) ?
              listener.listener : listener);

  if (!this._events[type])
    // Optimize the case of one listener. Don't need the extra array object.
    this._events[type] = listener;
  else if (isObject(this._events[type]))
    // If we've already got an array, just append.
    this._events[type].push(listener);
  else
    // Adding the second element, need to change to array.
    this._events[type] = [this._events[type], listener];

  // Check for listener leak
  if (isObject(this._events[type]) && !this._events[type].warned) {
    var m;
    if (!isUndefined(this._maxListeners)) {
      m = this._maxListeners;
    } else {
      m = EventEmitter.defaultMaxListeners;
    }

    if (m && m > 0 && this._events[type].length > m) {
      this._events[type].warned = true;
      console.error('(node) warning: possible EventEmitter memory ' +
                    'leak detected. %d listeners added. ' +
                    'Use emitter.setMaxListeners() to increase limit.',
                    this._events[type].length);
      if (typeof console.trace === 'function') {
        // not supported in IE 10
        console.trace();
      }
    }
  }

  return this;
};

EventEmitter.prototype.on = EventEmitter.prototype.addListener;

EventEmitter.prototype.once = function(type, listener) {
  if (!isFunction(listener))
    throw TypeError('listener must be a function');

  var fired = false;

  function g() {
    this.removeListener(type, g);

    if (!fired) {
      fired = true;
      listener.apply(this, arguments);
    }
  }

  g.listener = listener;
  this.on(type, g);

  return this;
};

// emits a 'removeListener' event iff the listener was removed
EventEmitter.prototype.removeListener = function(type, listener) {
  var list, position, length, i;

  if (!isFunction(listener))
    throw TypeError('listener must be a function');

  if (!this._events || !this._events[type])
    return this;

  list = this._events[type];
  length = list.length;
  position = -1;

  if (list === listener ||
      (isFunction(list.listener) && list.listener === listener)) {
    delete this._events[type];
    if (this._events.removeListener)
      this.emit('removeListener', type, listener);

  } else if (isObject(list)) {
    for (i = length; i-- > 0;) {
      if (list[i] === listener ||
          (list[i].listener && list[i].listener === listener)) {
        position = i;
        break;
      }
    }

    if (position < 0)
      return this;

    if (list.length === 1) {
      list.length = 0;
      delete this._events[type];
    } else {
      list.splice(position, 1);
    }

    if (this._events.removeListener)
      this.emit('removeListener', type, listener);
  }

  return this;
};

EventEmitter.prototype.removeAllListeners = function(type) {
  var key, listeners;

  if (!this._events)
    return this;

  // not listening for removeListener, no need to emit
  if (!this._events.removeListener) {
    if (arguments.length === 0)
      this._events = {};
    else if (this._events[type])
      delete this._events[type];
    return this;
  }

  // emit removeListener for all listeners on all events
  if (arguments.length === 0) {
    for (key in this._events) {
      if (key === 'removeListener') continue;
      this.removeAllListeners(key);
    }
    this.removeAllListeners('removeListener');
    this._events = {};
    return this;
  }

  listeners = this._events[type];

  if (isFunction(listeners)) {
    this.removeListener(type, listeners);
  } else {
    // LIFO order
    while (listeners.length)
      this.removeListener(type, listeners[listeners.length - 1]);
  }
  delete this._events[type];

  return this;
};

EventEmitter.prototype.listeners = function(type) {
  var ret;
  if (!this._events || !this._events[type])
    ret = [];
  else if (isFunction(this._events[type]))
    ret = [this._events[type]];
  else
    ret = this._events[type].slice();
  return ret;
};

EventEmitter.listenerCount = function(emitter, type) {
  var ret;
  if (!emitter._events || !emitter._events[type])
    ret = 0;
  else if (isFunction(emitter._events[type]))
    ret = 1;
  else
    ret = emitter._events[type].length;
  return ret;
};

function isFunction(arg) {
  return typeof arg === 'function';
}

function isNumber(arg) {
  return typeof arg === 'number';
}

function isObject(arg) {
  return typeof arg === 'object' && arg !== null;
}

function isUndefined(arg) {
  return arg === void 0;
}

},{}],11:[function(require,module,exports){
module.exports = on;
module.exports.on = on;
module.exports.off = off;

/**
 * Module dependencies.
 */

var matches = require('matches-dom-selector')
  , on = require('dom-event');

/**
 * Delegate event `type` to `selector`
 * and invoke `fn(e)`. A callback function
 * is returned which may be passed to `.unbind()`.
 *
 * @param {Element} el
 * @param {String} selector
 * @param {String} type
 * @param {Function} fn
 * @param {Boolean} capture
 * @return {Function}
 * @api public
 */

function on(el, selector, type, fn, capture){
  return on(el, type, function(e){
    if (matches(e.target || e.srcElement, selector)) fn.call(el, e);
  }, capture);
};

/**
 * Unbind event `type`'s callback `fn`.
 *
 * @param {Element} el
 * @param {String} type
 * @param {Function} fn
 * @param {Boolean} capture
 * @api public
 */

function off(el, type, fn, capture){
  on.off(el, type, fn, capture);
};

},{"dom-event":12,"matches-dom-selector":13}],12:[function(require,module,exports){
module.exports = on;
module.exports.on = on;
module.exports.off = off;

function on (element, event, callback, capture) {
  !element.addEventListener && (event = 'on' + event);
  (element.addEventListener || element.attachEvent).call(element, event, callback, capture);
  return callback;
}

function off (element, event, callback, capture) {
  !element.removeEventListener && (event = 'on' + event);
  (element.removeEventListener || element.detachEvent).call(element, event, callback, capture);
  return callback;
}

},{}],13:[function(require,module,exports){
/**
 * Module dependencies.
 */

var query = require('select-dom');

/**
 * Element prototype.
 */

var proto = Element.prototype;

/**
 * Vendor function.
 */

var vendor = proto.matchesSelector
  || proto.webkitMatchesSelector
  || proto.mozMatchesSelector
  || proto.msMatchesSelector
  || proto.oMatchesSelector;

/**
 * Expose `match()`.
 */

module.exports = match;

/**
 * Match `el` to `selector`.
 *
 * @param {Element} el
 * @param {String} selector
 * @return {Boolean}
 * @api public
 */

function match(el, selector) {
  if (vendor) return vendor.call(el, selector);
  var nodes = query.all(selector, el.parentNode);
  for (var i = 0; i < nodes.length; ++i) {
    if (nodes[i] == el) return true;
  }
  return false;
}

},{"select-dom":15}],14:[function(require,module,exports){
var qwery = require("qwery");

module.exports = {
  one: one,
  all: all
};

function all (selector, parent) {
  return qwery(selector, parent);
}

function one (selector, parent) {
  return all(selector, parent)[0];
}

},{"qwery":16}],15:[function(require,module,exports){
var fallback = require('./fallback');

module.exports = one;
module.exports.all = all;

function one (selector, parent) {
  parent || (parent = document);

  if (parent.querySelector) {
    return parent.querySelector(selector);
  }

  return fallback.one(selector, parent);
}

function all (selector, parent) {
  parent || (parent = document);

  if (parent.querySelectorAll) {
    return parent.querySelectorAll(selector);
  }

  return fallback.all(selector, parent);
}

},{"./fallback":14}],16:[function(require,module,exports){
/*!
  * @preserve Qwery - A Blazing Fast query selector engine
  * https://github.com/ded/qwery
  * copyright Dustin Diaz 2012
  * MIT License
  */

(function (name, context, definition) {
  if (typeof module != 'undefined' && module.exports) module.exports = definition()
  else if (typeof define == 'function' && define.amd) define(definition)
  else context[name] = definition()
})('qwery', this, function () {
  var doc = document
    , html = doc.documentElement
    , byClass = 'getElementsByClassName'
    , byTag = 'getElementsByTagName'
    , qSA = 'querySelectorAll'
    , useNativeQSA = 'useNativeQSA'
    , tagName = 'tagName'
    , nodeType = 'nodeType'
    , select // main select() method, assign later

    , id = /#([\w\-]+)/
    , clas = /\.[\w\-]+/g
    , idOnly = /^#([\w\-]+)$/
    , classOnly = /^\.([\w\-]+)$/
    , tagOnly = /^([\w\-]+)$/
    , tagAndOrClass = /^([\w]+)?\.([\w\-]+)$/
    , splittable = /(^|,)\s*[>~+]/
    , normalizr = /^\s+|\s*([,\s\+\~>]|$)\s*/g
    , splitters = /[\s\>\+\~]/
    , splittersMore = /(?![\s\w\-\/\?\&\=\:\.\(\)\!,@#%<>\{\}\$\*\^'"]*\]|[\s\w\+\-]*\))/
    , specialChars = /([.*+?\^=!:${}()|\[\]\/\\])/g
    , simple = /^(\*|[a-z0-9]+)?(?:([\.\#]+[\w\-\.#]+)?)/
    , attr = /\[([\w\-]+)(?:([\|\^\$\*\~]?\=)['"]?([ \w\-\/\?\&\=\:\.\(\)\!,@#%<>\{\}\$\*\^]+)["']?)?\]/
    , pseudo = /:([\w\-]+)(\(['"]?([^()]+)['"]?\))?/
    , easy = new RegExp(idOnly.source + '|' + tagOnly.source + '|' + classOnly.source)
    , dividers = new RegExp('(' + splitters.source + ')' + splittersMore.source, 'g')
    , tokenizr = new RegExp(splitters.source + splittersMore.source)
    , chunker = new RegExp(simple.source + '(' + attr.source + ')?' + '(' + pseudo.source + ')?')

  var walker = {
      ' ': function (node) {
        return node && node !== html && node.parentNode
      }
    , '>': function (node, contestant) {
        return node && node.parentNode == contestant.parentNode && node.parentNode
      }
    , '~': function (node) {
        return node && node.previousSibling
      }
    , '+': function (node, contestant, p1, p2) {
        if (!node) return false
        return (p1 = previous(node)) && (p2 = previous(contestant)) && p1 == p2 && p1
      }
    }

  function cache() {
    this.c = {}
  }
  cache.prototype = {
    g: function (k) {
      return this.c[k] || undefined
    }
  , s: function (k, v, r) {
      v = r ? new RegExp(v) : v
      return (this.c[k] = v)
    }
  }

  var classCache = new cache()
    , cleanCache = new cache()
    , attrCache = new cache()
    , tokenCache = new cache()

  function classRegex(c) {
    return classCache.g(c) || classCache.s(c, '(^|\\s+)' + c + '(\\s+|$)', 1)
  }

  // not quite as fast as inline loops in older browsers so don't use liberally
  function each(a, fn) {
    var i = 0, l = a.length
    for (; i < l; i++) fn(a[i])
  }

  function flatten(ar) {
    for (var r = [], i = 0, l = ar.length; i < l; ++i) arrayLike(ar[i]) ? (r = r.concat(ar[i])) : (r[r.length] = ar[i])
    return r
  }

  function arrayify(ar) {
    var i = 0, l = ar.length, r = []
    for (; i < l; i++) r[i] = ar[i]
    return r
  }

  function previous(n) {
    while (n = n.previousSibling) if (n[nodeType] == 1) break;
    return n
  }

  function q(query) {
    return query.match(chunker)
  }

  // called using `this` as element and arguments from regex group results.
  // given => div.hello[title="world"]:foo('bar')
  // div.hello[title="world"]:foo('bar'), div, .hello, [title="world"], title, =, world, :foo('bar'), foo, ('bar'), bar]
  function interpret(whole, tag, idsAndClasses, wholeAttribute, attribute, qualifier, value, wholePseudo, pseudo, wholePseudoVal, pseudoVal) {
    var i, m, k, o, classes
    if (this[nodeType] !== 1) return false
    if (tag && tag !== '*' && this[tagName] && this[tagName].toLowerCase() !== tag) return false
    if (idsAndClasses && (m = idsAndClasses.match(id)) && m[1] !== this.id) return false
    if (idsAndClasses && (classes = idsAndClasses.match(clas))) {
      for (i = classes.length; i--;) if (!classRegex(classes[i].slice(1)).test(this.className)) return false
    }
    if (pseudo && qwery.pseudos[pseudo] && !qwery.pseudos[pseudo](this, pseudoVal)) return false
    if (wholeAttribute && !value) { // select is just for existance of attrib
      o = this.attributes
      for (k in o) {
        if (Object.prototype.hasOwnProperty.call(o, k) && (o[k].name || k) == attribute) {
          return this
        }
      }
    }
    if (wholeAttribute && !checkAttr(qualifier, getAttr(this, attribute) || '', value)) {
      // select is for attrib equality
      return false
    }
    return this
  }

  function clean(s) {
    return cleanCache.g(s) || cleanCache.s(s, s.replace(specialChars, '\\$1'))
  }

  function checkAttr(qualify, actual, val) {
    switch (qualify) {
    case '=':
      return actual == val
    case '^=':
      return actual.match(attrCache.g('^=' + val) || attrCache.s('^=' + val, '^' + clean(val), 1))
    case '$=':
      return actual.match(attrCache.g('$=' + val) || attrCache.s('$=' + val, clean(val) + '$', 1))
    case '*=':
      return actual.match(attrCache.g(val) || attrCache.s(val, clean(val), 1))
    case '~=':
      return actual.match(attrCache.g('~=' + val) || attrCache.s('~=' + val, '(?:^|\\s+)' + clean(val) + '(?:\\s+|$)', 1))
    case '|=':
      return actual.match(attrCache.g('|=' + val) || attrCache.s('|=' + val, '^' + clean(val) + '(-|$)', 1))
    }
    return 0
  }

  // given a selector, first check for simple cases then collect all base candidate matches and filter
  function _qwery(selector, _root) {
    var r = [], ret = [], i, l, m, token, tag, els, intr, item, root = _root
      , tokens = tokenCache.g(selector) || tokenCache.s(selector, selector.split(tokenizr))
      , dividedTokens = selector.match(dividers)

    if (!tokens.length) return r

    token = (tokens = tokens.slice(0)).pop() // copy cached tokens, take the last one
    if (tokens.length && (m = tokens[tokens.length - 1].match(idOnly))) root = byId(_root, m[1])
    if (!root) return r

    intr = q(token)
    // collect base candidates to filter
    els = root !== _root && root[nodeType] !== 9 && dividedTokens && /^[+~]$/.test(dividedTokens[dividedTokens.length - 1]) ?
      function (r) {
        while (root = root.nextSibling) {
          root[nodeType] == 1 && (intr[1] ? intr[1] == root[tagName].toLowerCase() : 1) && (r[r.length] = root)
        }
        return r
      }([]) :
      root[byTag](intr[1] || '*')
    // filter elements according to the right-most part of the selector
    for (i = 0, l = els.length; i < l; i++) {
      if (item = interpret.apply(els[i], intr)) r[r.length] = item
    }
    if (!tokens.length) return r

    // filter further according to the rest of the selector (the left side)
    each(r, function (e) { if (ancestorMatch(e, tokens, dividedTokens)) ret[ret.length] = e })
    return ret
  }

  // compare element to a selector
  function is(el, selector, root) {
    if (isNode(selector)) return el == selector
    if (arrayLike(selector)) return !!~flatten(selector).indexOf(el) // if selector is an array, is el a member?

    var selectors = selector.split(','), tokens, dividedTokens
    while (selector = selectors.pop()) {
      tokens = tokenCache.g(selector) || tokenCache.s(selector, selector.split(tokenizr))
      dividedTokens = selector.match(dividers)
      tokens = tokens.slice(0) // copy array
      if (interpret.apply(el, q(tokens.pop())) && (!tokens.length || ancestorMatch(el, tokens, dividedTokens, root))) {
        return true
      }
    }
    return false
  }

  // given elements matching the right-most part of a selector, filter out any that don't match the rest
  function ancestorMatch(el, tokens, dividedTokens, root) {
    var cand
    // recursively work backwards through the tokens and up the dom, covering all options
    function crawl(e, i, p) {
      while (p = walker[dividedTokens[i]](p, e)) {
        if (isNode(p) && (interpret.apply(p, q(tokens[i])))) {
          if (i) {
            if (cand = crawl(p, i - 1, p)) return cand
          } else return p
        }
      }
    }
    return (cand = crawl(el, tokens.length - 1, el)) && (!root || isAncestor(cand, root))
  }

  function isNode(el, t) {
    return el && typeof el === 'object' && (t = el[nodeType]) && (t == 1 || t == 9)
  }

  function uniq(ar) {
    var a = [], i, j;
    o:
    for (i = 0; i < ar.length; ++i) {
      for (j = 0; j < a.length; ++j) if (a[j] == ar[i]) continue o
      a[a.length] = ar[i]
    }
    return a
  }

  function arrayLike(o) {
    return (typeof o === 'object' && isFinite(o.length))
  }

  function normalizeRoot(root) {
    if (!root) return doc
    if (typeof root == 'string') return qwery(root)[0]
    if (!root[nodeType] && arrayLike(root)) return root[0]
    return root
  }

  function byId(root, id, el) {
    // if doc, query on it, else query the parent doc or if a detached fragment rewrite the query and run on the fragment
    return root[nodeType] === 9 ? root.getElementById(id) :
      root.ownerDocument &&
        (((el = root.ownerDocument.getElementById(id)) && isAncestor(el, root) && el) ||
          (!isAncestor(root, root.ownerDocument) && select('[id="' + id + '"]', root)[0]))
  }

  function qwery(selector, _root) {
    var m, el, root = normalizeRoot(_root)

    // easy, fast cases that we can dispatch with simple DOM calls
    if (!root || !selector) return []
    if (selector === window || isNode(selector)) {
      return !_root || (selector !== window && isNode(root) && isAncestor(selector, root)) ? [selector] : []
    }
    if (selector && arrayLike(selector)) return flatten(selector)
    if (m = selector.match(easy)) {
      if (m[1]) return (el = byId(root, m[1])) ? [el] : []
      if (m[2]) return arrayify(root[byTag](m[2]))
      if (hasByClass && m[3]) return arrayify(root[byClass](m[3]))
    }

    return select(selector, root)
  }

  // where the root is not document and a relationship selector is first we have to
  // do some awkward adjustments to get it to work, even with qSA
  function collectSelector(root, collector) {
    return function (s) {
      var oid, nid
      if (splittable.test(s)) {
        if (root[nodeType] !== 9) {
          // make sure the el has an id, rewrite the query, set root to doc and run it
          if (!(nid = oid = root.getAttribute('id'))) root.setAttribute('id', nid = '__qwerymeupscotty')
          s = '[id="' + nid + '"]' + s // avoid byId and allow us to match context element
          collector(root.parentNode || root, s, true)
          oid || root.removeAttribute('id')
        }
        return;
      }
      s.length && collector(root, s, false)
    }
  }

  var isAncestor = 'compareDocumentPosition' in html ?
    function (element, container) {
      return (container.compareDocumentPosition(element) & 16) == 16
    } : 'contains' in html ?
    function (element, container) {
      container = container[nodeType] === 9 || container == window ? html : container
      return container !== element && container.contains(element)
    } :
    function (element, container) {
      while (element = element.parentNode) if (element === container) return 1
      return 0
    }
  , getAttr = function () {
      // detect buggy IE src/href getAttribute() call
      var e = doc.createElement('p')
      return ((e.innerHTML = '<a href="#x">x</a>') && e.firstChild.getAttribute('href') != '#x') ?
        function (e, a) {
          return a === 'class' ? e.className : (a === 'href' || a === 'src') ?
            e.getAttribute(a, 2) : e.getAttribute(a)
        } :
        function (e, a) { return e.getAttribute(a) }
    }()
  , hasByClass = !!doc[byClass]
    // has native qSA support
  , hasQSA = doc.querySelector && doc[qSA]
    // use native qSA
  , selectQSA = function (selector, root) {
      var result = [], ss, e
      try {
        if (root[nodeType] === 9 || !splittable.test(selector)) {
          // most work is done right here, defer to qSA
          return arrayify(root[qSA](selector))
        }
        // special case where we need the services of `collectSelector()`
        each(ss = selector.split(','), collectSelector(root, function (ctx, s) {
          e = ctx[qSA](s)
          if (e.length == 1) result[result.length] = e.item(0)
          else if (e.length) result = result.concat(arrayify(e))
        }))
        return ss.length > 1 && result.length > 1 ? uniq(result) : result
      } catch (ex) { }
      return selectNonNative(selector, root)
    }
    // no native selector support
  , selectNonNative = function (selector, root) {
      var result = [], items, m, i, l, r, ss
      selector = selector.replace(normalizr, '$1')
      if (m = selector.match(tagAndOrClass)) {
        r = classRegex(m[2])
        items = root[byTag](m[1] || '*')
        for (i = 0, l = items.length; i < l; i++) {
          if (r.test(items[i].className)) result[result.length] = items[i]
        }
        return result
      }
      // more complex selector, get `_qwery()` to do the work for us
      each(ss = selector.split(','), collectSelector(root, function (ctx, s, rewrite) {
        r = _qwery(s, ctx)
        for (i = 0, l = r.length; i < l; i++) {
          if (ctx[nodeType] === 9 || rewrite || isAncestor(r[i], root)) result[result.length] = r[i]
        }
      }))
      return ss.length > 1 && result.length > 1 ? uniq(result) : result
    }
  , configure = function (options) {
      // configNativeQSA: use fully-internal selector or native qSA where present
      if (typeof options[useNativeQSA] !== 'undefined')
        select = !options[useNativeQSA] ? selectNonNative : hasQSA ? selectQSA : selectNonNative
    }

  configure({ useNativeQSA: true })

  qwery.configure = configure
  qwery.uniq = uniq
  qwery.is = is
  qwery.pseudos = {}

  return qwery
});

},{}],17:[function(require,module,exports){
'use strict';

var parse = require('parse-html')
  , slice = [].slice;

function convert(arg, ctx) {
  var result = []
    , query
    , nodes;

  switch (true) {
    case (typeof arg === 'string'):
      query = [];
      nodes = [];

      try {
        query = (ctx || document).querySelectorAll(arg);
      } catch (e) {
        nodes = parse(arg);
      }

      query.length && (result = slice.call(query));
      nodes.length && (result = nodes);
      query = nodes = null;
      break;
    case (arg instanceof NodeList):
      result = slice.call(arg);
      break;
    case (arg instanceof Element || arg === document ||
        arg === window):
      result.push(arg);
      break;
    case (Array.isArray(arg)):
      result = arg;
      break;
    default:
      break;
  }

  return result;
}

module.exports = convert;

},{"parse-html":18}],18:[function(require,module,exports){
'use strict';

function parse(str) {
  var doc = document.implementation.createHTMLDocument('');

  doc.body.innerHTML = str;
  return [].slice.call(doc.body.children);
}

module.exports = parse;

},{}],19:[function(require,module,exports){
var h = require('virtual-hyperscript-svg')

exports.render = renderEdge
exports.renderCurve = renderCurve

function renderEdge (data, edge) {
  var sourceNode = data.getNode(edge.source.id)
  var targetNode = data.getNode(edge.target.id)

  var sourcePort = edge.source.port
  var targetPort = edge.target.port

  var sourcePos = sourceNode.outports.indexOf(sourcePort)
  var targetPos = targetNode.inports.indexOf(targetPort)

  var source = {
    x: sourceNode.x + 100,
    y: sourceNode.y + ((sourcePos + 1) * 100 / (sourceNode.outports.length + 1))
  }
  var target = {
    x: targetNode.x,
    y: targetNode.y + ((targetPos + 1) * 100 / (targetNode.inports.length + 1))
  }

  var classes = [
    'edge',
    'edge-source-node-' + sourceNode.id,
    'edge-source-' + sourceNode.id + '-' + sourcePort,
    'edge-target-' + targetNode.id + '-' + targetPort
  ]

  return renderCurve(
    source,
    target,
    classes.join(' '),
    [sourceNode.id, targetNode.id, sourcePort, targetPort].join('-')
  )
}

function renderCurve (from, to, className, id) {
  return h('path', {
    class: className, id: id, d: createEdgePath(from, to)
  })
}

// originally from https://github.com/the-grid/the-graph/blob/master/the-graph/the-graph-edge.js
function createEdgePath (from, to) {
  var c1 = {}
  var c2 = {}
  var nodeSize = 100
  var curve = nodeSize // ~NodeSize

  if (to.x - 5 < from.x) {
    var curveFactor = (from.x - to.x) * curve / 200
    if (Math.abs(to.y - from.y) < nodeSize / 2) {
      // Loopback
      c1.x = from.x + curveFactor
      c1.y = from.y - curveFactor
      c2.x = to.x - curveFactor
      c2.y = to.y - curveFactor
    } else {
      // Stick out some
      c1.x = from.x + curveFactor
      c1.y = from.y + (to.y > from.y ? curveFactor : -curveFactor)
      c2.x = to.x - curveFactor
      c2.y = to.y + (to.y > from.y ? -curveFactor : curveFactor)
    }
  } else {
    // Controls halfway between
    c1.x = from.x + (to.x - from.x) / 2
    c1.y = from.y
    c2.x = c1.x
    c2.y = to.y
  }

  return [
    'M',
    from.x, from.y,
    'C',
    c1.x, c1.y,
    c2.x, c2.y,
    to.x, to.y
  ].join(' ')
}

},{"virtual-hyperscript-svg":67}],20:[function(require,module,exports){
(function (Buffer){
var EventEmitter = require('events').EventEmitter


var inherits = require('inherits')
var delegate = require('delegate-dom')
var classList = require('dom-classlist')
var domArray = require('dom-array')

var h = require('virtual-hyperscript-svg')
var diff = require('virtual-dom/diff')
var patch = require('virtual-dom/patch')
var createElement = require('virtual-dom/create-element')

var edge = require('./edge.js')
var renderEdge = edge.render
var renderCurve = edge.renderCurve

var renderNode = require('./node.js')

module.exports = FlowGraphView

FlowGraphView.css = Buffer("aHRtbCwgYm9keSwgc3ZnIHsKICBoZWlnaHQ6IDEwMCU7CiAgd2lkdGg6IDEwMCU7CiAgbWFyZ2luOiAwOwogIHBhZGRpbmc6IDA7Cn0Kc3ZnIC5ub2RlIHsKICBmaWxsOiByZ2JhKDEyNSwxMjUsMTI1LDAuNSk7CiAgY3Vyc29yOiAtd2Via2l0LWdyYWI7Cn0Kc3ZnIC5ub2RlIC5ib2R5IHsKICBzdHJva2U6IGJsYWNrOwogIHN0cm9rZS13aWR0aDogM3B4Owp9CgpzdmcgdGV4dDo6c2VsZWN0aW9uIHsgYmFja2dyb3VuZDogbm9uZTsgfQoKc3ZnIC5ub2RlIHRleHQgewogIGZpbGw6IGJsYWNrOwogIGZvbnQtc2l6ZTogMjVweDsKICBmb250LWZhbWlseTogSGVsdmV0aWNhOwogIHRleHQtYW5jaG9yOiBtaWRkbGU7CiAgZG9taW5hbnQtYmFzZWxpbmU6IG1pZGRsZTsKfQpzdmcgLnBvcnQgewogIGN1cnNvcjogcG9pbnRlcjsKICBzdHJva2U6IGJsYWNrOwogIHN0cm9rZS13aWR0aDogM3B4Owp9CnN2ZyAucG9ydDpob3ZlciB7CiAgcjogNzsKfQpzdmcgLm91dHB1dHsKICBmaWxsOiAjRkY1RTU2Owp9CnN2ZyAuaW5wdXQgewogIGZpbGw6ICM0OEQ1NTk7Cn0Kc3ZnIC5jb25uZWN0b3IsIHN2ZyAuZWRnZSB7CiAgZmlsbDogdHJhbnNwYXJlbnQ7CiAgc3Ryb2tlOiBibGFjazsKICBzdHJva2Utd2lkdGg6IDNweDsKICB0cmFuc2l0aW9uOiBzdHJva2Utd2lkdGggMC4zczsKfQoKc3ZnIC5lZGdlOmhvdmVyIHsKICBzdHJva2U6IHJlZDsKICBzdHJva2Utd2lkdGg6IDVweDsKICBjdXJzb3I6IG5vdC1hbGxvd2VkOwp9CgpzdmcgLmVkZ2VhY3RpdmUgewogIHN0cm9rZS13aWR0aDogN3B4Owp9CgpzdmcgLm5vZGUgLmNsb3NlIHsKICBmaWxsOiAgI0ZGNUU1NjsKICBjdXJzb3I6IG5vdC1hbGxvd2VkOwogIHRyYW5zaXRpb246IGhlaWdodCAwLjJzLCB3aWR0aCAwLjJzLCB4IDAuMnMsIHkgMC4yczsKfQoKc3ZnIC5ub2RlIC5jbG9zZTpob3ZlciB7CiAgeDogMDsKICB5OiAwOwogIHdpZHRoOiAxMDBweDsKICBoZWlnaHQ6IDEwMHB4OwogIHJ4OiA4OwogIHN0cm9rZS13aWR0aDogM3B4OwogIHN0cm9rZTogIzdCMTYxMTsKfQ==","base64").toString()

inherits(FlowGraphView, EventEmitter)

function FlowGraphView (data, element) {
  this.data = data
  this.tree = this.render()
  this.svg = createElement(this.tree)
  this.registerHandlers()
}

FlowGraphView.prototype.render = function () {
  var domNodes = this.data.getEdges()
    .map(renderEdge.bind(this, this.data))

  if (this.data.connector.active) {
    var line = renderCurve(
      this.data.connector.from,
      this.data.connector.to,
      'connector'
    )
    domNodes.push(line)
  }
  domNodes = domNodes.concat(this.data.getNodes().map(renderNode))
  var svg = h('svg', {}, domNodes)
  return svg
}

FlowGraphView.prototype.activateEdge = function (source, target, outport, inport) {
  outport = outport || 'out'
  inport = inport || 'in'

  var selector = '.edge-source-' + source + '-' + outport
  if (target) selector += '.edge-target-' + target + '-' + inport

  var edges = document.querySelectorAll(selector)
  domArray(edges).forEach(function (edge) {
    classList(edge).add('edgeactive')
  })
}

FlowGraphView.prototype.deactivateEdge = function (source, target, outport, inport) {
  outport = outport || 'out'
  inport = inport || 'in'

  var selector = '.edge-source-' + source + '-' + outport
  if (target) selector += '.edge-target-' + target + '-' + inport

  var edges = document.querySelectorAll(selector)
  domArray(edges).forEach(function (edge) {
    classList(edge).remove('edgeactive')
  })
}

FlowGraphView.prototype.blinkEdge = function (source, target, outport, inport, ms) {
  ms = ms || 300
  this.activateEdge(source, target, outport, inport)
  setTimeout(this.deactivateEdge.bind(this, source, target, outport, inport), ms)
}

FlowGraphView.prototype.registerHandlers = function () {
  var self = this
  var data = this.data

  setInterval(function () {
    var newTree = this.render()
    var patches = diff(this.tree, newTree)
    this.svg = patch(this.svg, patches)
    this.tree = newTree
  }.bind(this), 50)

  delegate.on(this.svg, '.edge', 'click', function (e) {
    var id = e.target.getAttribute('id')
    var a = id.split('-')
    data.disconnect(a[0], a[1], a[2], a[3])
  })

  delegate.on(this.svg, '.node rect, .node text', 'click', function (e) {
    var id = e.target.parentNode.getAttribute('id')
    self.emit('node-select', data.getNode(id))
  })

  delegate.on(this.svg, '.node .close', 'click', function (e) {
    var id = e.target.parentNode.getAttribute('id')
    data.deleteNode(id)
  })

  delegate.on(this.svg, '.node rect, .node text', 'mousedown', function (e) {
    var id = e.target.parentNode.getAttribute('id')

    document.onmousemove = moveObject
    var moved = data.getNode(id)
    function moveObject (e) {
      moved.x = e.pageX - 50
      moved.y = e.pageY - 50
    }
  })

  delegate.on(this.svg, '.node circle', 'mouseover', function (e) {
    var id = e.target.parentNode.getAttribute('id')
    var port = e.target.getAttribute('id').split('-')[2]
    var isInput = hasClass(e.target, 'input')
    var compatible = data.connector.isInput !== isInput
    if (data.connector.active && compatible) {
      stopDrag()
      var sourceId = isInput ? data.connector.from.id : id
      var targetId = isInput ? id : data.connector.from.id
      var sourcePort = isInput ? data.connector.from.port : port
      var targetPort = isInput ? port : data.connector.from.port
      data.connect(sourceId, targetId, sourcePort, targetPort)
    }
  })

  delegate.on(this.svg, '.node circle', 'mousedown', function (e) {
    var id = e.target.parentNode.getAttribute('id')
    var port = e.target.getAttribute('id').split('-')[2]
    var isInput = hasClass(e.target, 'input')

    document.onmousemove = moveLine
    data.connector.from.x = e.pageX
    data.connector.from.y = e.pageY
    data.connector.from.id = id
    data.connector.from.port = port
    data.connector.isInput = isInput
    data.connector.active = true
    data.connector.to.x = e.pageX
    data.connector.to.y = e.pageY
    function moveLine (e) {
      data.connector.to.x = e.pageX
      data.connector.to.y = e.pageY
    }
  })

  document.body.addEventListener('mouseup', stopDrag)

  function stopDrag () {
    document.onmousemove = function () {}
    data.connector.active = false
  }
}

function hasClass (element, className) {
  return element.getAttribute('class').split(' ').indexOf(className) > -1
}

}).call(this,require("buffer").Buffer)

},{"./edge.js":19,"./node.js":21,"buffer":6,"delegate-dom":22,"dom-array":28,"dom-classlist":30,"events":10,"inherits":31,"virtual-dom/create-element":32,"virtual-dom/diff":33,"virtual-dom/patch":41,"virtual-hyperscript-svg":67}],21:[function(require,module,exports){
var h = require('virtual-hyperscript-svg')

module.exports = renderNode

function renderNode (node) {
  var rect = h('rect', {
    class: 'body',
    x: 0,
    y: 0,
    rx: '8px',
    ry: '8px',
    width: 100,
    height: 100
  })

  var ports = node.inports.map(function (name, i) {
    return h('circle', {
      class: 'port input',
      id: node.id + '-inport-' + name,
      r: 5,
      cx: 0,
      cy: (i + 1) * 100 / (node.inports.length + 1)
    })
  })

  ports = ports.concat(node.outports.map(function (name, i) {
    return h('circle', {
      class: 'port output',
      id: node.id + '-outport-' + name,
      r: 5,
      cx: 100,
      cy: (i + 1) * 100 / (node.outports.length + 1)
    })
  }))

  var closeButton = h('rect', {
    class: 'close',
    x: 5,
    y: 5,
    width: '10px',
    height: '10px',
    rx: 2
  })
  var text = h('text', {x: 50, y: 50}, node.label || node.id)
  var domNode = h('g', {
    id: node.id,
    class: 'node',
    transform: 'translate(' + node.x + ',' + node.y + ')'
  },
    [
      rect,
      closeButton,
      text
    ].concat(ports))
  return domNode
}

},{"virtual-hyperscript-svg":67}],22:[function(require,module,exports){
arguments[4][11][0].apply(exports,arguments)
},{"dom-event":23,"dup":11,"matches-dom-selector":24}],23:[function(require,module,exports){
arguments[4][12][0].apply(exports,arguments)
},{"dup":12}],24:[function(require,module,exports){
arguments[4][13][0].apply(exports,arguments)
},{"dup":13,"select-dom":26}],25:[function(require,module,exports){
arguments[4][14][0].apply(exports,arguments)
},{"dup":14,"qwery":27}],26:[function(require,module,exports){
arguments[4][15][0].apply(exports,arguments)
},{"./fallback":25,"dup":15}],27:[function(require,module,exports){
arguments[4][16][0].apply(exports,arguments)
},{"dup":16}],28:[function(require,module,exports){
arguments[4][17][0].apply(exports,arguments)
},{"dup":17,"parse-html":29}],29:[function(require,module,exports){
arguments[4][18][0].apply(exports,arguments)
},{"dup":18}],30:[function(require,module,exports){
/**
 * Module export
 *
 * @param {Element} el
 * @return {ClassList}
 */

module.exports = function (el) {
  return new ClassList(el);
};

/**
 * Initialize a new ClassList for the given element
 *
 * @param {Element} el DOM Element
 */
function ClassList(el) {
  if (!el || el.nodeType !== 1) {
    throw new Error('A DOM Element reference is required');
  }

  this.el = el;
  this.classList = el.classList;
}

/**
 * Check token validity
 *
 * @param token
 * @param [method]
 */
function checkToken(token, method) {
  method = method || 'a method';

  if (typeof token != 'string') {
    throw new TypeError(
      'Failed to execute \'' + method + '\' on \'ClassList\': ' +
      'the token provided (\'' + token + '\') is not a string.'
    );
  }
  if (token === "") {
    throw new SyntaxError(
      'Failed to execute \'' + method + '\' on \'ClassList\': ' +
      'the token provided must not be empty.'
    );
  }
  if (/\s/.test(token)) {
    throw new Error(
      'Failed to execute \'' + method + '\' on \'ClassList\': ' +
      'the token provided (\'' + token + '\') contains HTML space ' +
      'characters, which are not valid in tokens.'
    );
  }
}

/**
 * Return an array of the class names on the element.
 *
 * @return {Array}
 */
ClassList.prototype.toArray = function () {
  var str = (this.el.getAttribute('class') || '').replace(/^\s+|\s+$/g, '');
  var classes = str.split(/\s+/);
  if ('' === classes[0]) { classes.shift(); }
  return classes;
};

/**
 * Add the given `token` to the class list if it's not already present.
 *
 * @param {String} token
 */
ClassList.prototype.add = function (token) {
  var classes, index, updated;
  checkToken(token, 'add');

  if (this.classList) {
    this.classList.add(token);
  }
  else {
    // fallback
    classes = this.toArray();
    index = classes.indexOf(token);
    if (index === -1) {
      classes.push(token);
      this.el.setAttribute('class', classes.join(' '));
    }
  }

  return;
};

/**
 * Check if the given `token` is in the class list.
 *
 * @param {String} token
 * @return {Boolean}
 */
ClassList.prototype.contains = function (token) {
  checkToken(token, 'contains');

  return this.classList ?
    this.classList.contains(token) :
    this.toArray().indexOf(token) > -1;
};

/**
 * Remove any class names that match the given `token`, when present.
 *
 * @param {String|RegExp} token
 */
ClassList.prototype.remove = function (token) {
  var arr, classes, i, index, len;

  if ('[object RegExp]' == Object.prototype.toString.call(token)) {
    arr = this.toArray();
    for (i = 0, len = arr.length; i < len; i++) {
      if (token.test(arr[i])) {
        this.remove(arr[i]);
      }
    }
  }
  else {
    checkToken(token, 'remove');

    if (this.classList) {
      this.classList.remove(token);
    }
    else {
      // fallback
      classes = this.toArray();
      index = classes.indexOf(token);
      if (index > -1) {
        classes.splice(index, 1);
        this.el.setAttribute('class', classes.join(' '));
      }
    }
  }

  return;
};

/**
 * Toggle the `token` in the class list. Optionally force state via `force`.
 *
 * Native `classList` is not used as some browsers that support `classList` do
 * not support `force`. Avoiding `classList` altogether keeps this function
 * simple.
 *
 * @param {String} token
 * @param {Boolean} [force]
 * @return {Boolean}
 */
ClassList.prototype.toggle = function (token, force) {
  checkToken(token, 'toggle');

  var hasToken = this.contains(token);
  var method = hasToken ? (force !== true && 'remove') : (force !== false && 'add');

  if (method) {
    this[method](token);
  }

  return (typeof force == 'boolean' ? force : !hasToken);
};

},{}],31:[function(require,module,exports){
if (typeof Object.create === 'function') {
  // implementation from standard node.js 'util' module
  module.exports = function inherits(ctor, superCtor) {
    ctor.super_ = superCtor
    ctor.prototype = Object.create(superCtor.prototype, {
      constructor: {
        value: ctor,
        enumerable: false,
        writable: true,
        configurable: true
      }
    });
  };
} else {
  // old school shim for old browsers
  module.exports = function inherits(ctor, superCtor) {
    ctor.super_ = superCtor
    var TempCtor = function () {}
    TempCtor.prototype = superCtor.prototype
    ctor.prototype = new TempCtor()
    ctor.prototype.constructor = ctor
  }
}

},{}],32:[function(require,module,exports){
var createElement = require("./vdom/create-element.js")

module.exports = createElement

},{"./vdom/create-element.js":43}],33:[function(require,module,exports){
var diff = require("./vtree/diff.js")

module.exports = diff

},{"./vtree/diff.js":66}],34:[function(require,module,exports){
/*!
 * Cross-Browser Split 1.1.1
 * Copyright 2007-2012 Steven Levithan <stevenlevithan.com>
 * Available under the MIT License
 * ECMAScript compliant, uniform cross-browser split method
 */

/**
 * Splits a string into an array of strings using a regex or string separator. Matches of the
 * separator are not included in the result array. However, if `separator` is a regex that contains
 * capturing groups, backreferences are spliced into the result each time `separator` is matched.
 * Fixes browser bugs compared to the native `String.prototype.split` and can be used reliably
 * cross-browser.
 * @param {String} str String to split.
 * @param {RegExp|String} separator Regex or string to use for separating the string.
 * @param {Number} [limit] Maximum number of items to include in the result array.
 * @returns {Array} Array of substrings.
 * @example
 *
 * // Basic use
 * split('a b c d', ' ');
 * // -> ['a', 'b', 'c', 'd']
 *
 * // With limit
 * split('a b c d', ' ', 2);
 * // -> ['a', 'b']
 *
 * // Backreferences in result array
 * split('..word1 word2..', /([a-z]+)(\d+)/i);
 * // -> ['..', 'word', '1', ' ', 'word', '2', '..']
 */
module.exports = (function split(undef) {

  var nativeSplit = String.prototype.split,
    compliantExecNpcg = /()??/.exec("")[1] === undef,
    // NPCG: nonparticipating capturing group
    self;

  self = function(str, separator, limit) {
    // If `separator` is not a regex, use `nativeSplit`
    if (Object.prototype.toString.call(separator) !== "[object RegExp]") {
      return nativeSplit.call(str, separator, limit);
    }
    var output = [],
      flags = (separator.ignoreCase ? "i" : "") + (separator.multiline ? "m" : "") + (separator.extended ? "x" : "") + // Proposed for ES6
      (separator.sticky ? "y" : ""),
      // Firefox 3+
      lastLastIndex = 0,
      // Make `global` and avoid `lastIndex` issues by working with a copy
      separator = new RegExp(separator.source, flags + "g"),
      separator2, match, lastIndex, lastLength;
    str += ""; // Type-convert
    if (!compliantExecNpcg) {
      // Doesn't need flags gy, but they don't hurt
      separator2 = new RegExp("^" + separator.source + "$(?!\\s)", flags);
    }
    /* Values for `limit`, per the spec:
     * If undefined: 4294967295 // Math.pow(2, 32) - 1
     * If 0, Infinity, or NaN: 0
     * If positive number: limit = Math.floor(limit); if (limit > 4294967295) limit -= 4294967296;
     * If negative number: 4294967296 - Math.floor(Math.abs(limit))
     * If other: Type-convert, then use the above rules
     */
    limit = limit === undef ? -1 >>> 0 : // Math.pow(2, 32) - 1
    limit >>> 0; // ToUint32(limit)
    while (match = separator.exec(str)) {
      // `separator.lastIndex` is not reliable cross-browser
      lastIndex = match.index + match[0].length;
      if (lastIndex > lastLastIndex) {
        output.push(str.slice(lastLastIndex, match.index));
        // Fix browsers whose `exec` methods don't consistently return `undefined` for
        // nonparticipating capturing groups
        if (!compliantExecNpcg && match.length > 1) {
          match[0].replace(separator2, function() {
            for (var i = 1; i < arguments.length - 2; i++) {
              if (arguments[i] === undef) {
                match[i] = undef;
              }
            }
          });
        }
        if (match.length > 1 && match.index < str.length) {
          Array.prototype.push.apply(output, match.slice(1));
        }
        lastLength = match[0].length;
        lastLastIndex = lastIndex;
        if (output.length >= limit) {
          break;
        }
      }
      if (separator.lastIndex === match.index) {
        separator.lastIndex++; // Avoid an infinite loop
      }
    }
    if (lastLastIndex === str.length) {
      if (lastLength || !separator.test("")) {
        output.push("");
      }
    } else {
      output.push(str.slice(lastLastIndex));
    }
    return output.length > limit ? output.slice(0, limit) : output;
  };

  return self;
})();

},{}],35:[function(require,module,exports){
'use strict';

var OneVersionConstraint = require('individual/one-version');

var MY_VERSION = '7';
OneVersionConstraint('ev-store', MY_VERSION);

var hashKey = '__EV_STORE_KEY@' + MY_VERSION;

module.exports = EvStore;

function EvStore(elem) {
    var hash = elem[hashKey];

    if (!hash) {
        hash = elem[hashKey] = {};
    }

    return hash;
}

},{"individual/one-version":37}],36:[function(require,module,exports){
(function (global){
'use strict';

/*global window, global*/

var root = typeof window !== 'undefined' ?
    window : typeof global !== 'undefined' ?
    global : {};

module.exports = Individual;

function Individual(key, value) {
    if (key in root) {
        return root[key];
    }

    root[key] = value;

    return value;
}

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})

},{}],37:[function(require,module,exports){
'use strict';

var Individual = require('./index.js');

module.exports = OneVersion;

function OneVersion(moduleName, version, defaultValue) {
    var key = '__INDIVIDUAL_ONE_VERSION_' + moduleName;
    var enforceKey = key + '_ENFORCE_SINGLETON';

    var versionValue = Individual(enforceKey, version);

    if (versionValue !== version) {
        throw new Error('Can only have one copy of ' +
            moduleName + '.\n' +
            'You already have version ' + versionValue +
            ' installed.\n' +
            'This means you cannot install version ' + version);
    }

    return Individual(key, defaultValue);
}

},{"./index.js":36}],38:[function(require,module,exports){
(function (global){
var topLevel = typeof global !== 'undefined' ? global :
    typeof window !== 'undefined' ? window : {}
var minDoc = require('min-document');

if (typeof document !== 'undefined') {
    module.exports = document;
} else {
    var doccy = topLevel['__GLOBAL_DOCUMENT_CACHE@4'];

    if (!doccy) {
        doccy = topLevel['__GLOBAL_DOCUMENT_CACHE@4'] = minDoc;
    }

    module.exports = doccy;
}

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})

},{"min-document":5}],39:[function(require,module,exports){
"use strict";

module.exports = function isObject(x) {
	return typeof x === "object" && x !== null;
};

},{}],40:[function(require,module,exports){
var nativeIsArray = Array.isArray
var toString = Object.prototype.toString

module.exports = nativeIsArray || isArray

function isArray(obj) {
    return toString.call(obj) === "[object Array]"
}

},{}],41:[function(require,module,exports){
var patch = require("./vdom/patch.js")

module.exports = patch

},{"./vdom/patch.js":46}],42:[function(require,module,exports){
var isObject = require("is-object")
var isHook = require("../vnode/is-vhook.js")

module.exports = applyProperties

function applyProperties(node, props, previous) {
    for (var propName in props) {
        var propValue = props[propName]

        if (propValue === undefined) {
            removeProperty(node, propName, propValue, previous);
        } else if (isHook(propValue)) {
            removeProperty(node, propName, propValue, previous)
            if (propValue.hook) {
                propValue.hook(node,
                    propName,
                    previous ? previous[propName] : undefined)
            }
        } else {
            if (isObject(propValue)) {
                patchObject(node, props, previous, propName, propValue);
            } else {
                node[propName] = propValue
            }
        }
    }
}

function removeProperty(node, propName, propValue, previous) {
    if (previous) {
        var previousValue = previous[propName]

        if (!isHook(previousValue)) {
            if (propName === "attributes") {
                for (var attrName in previousValue) {
                    node.removeAttribute(attrName)
                }
            } else if (propName === "style") {
                for (var i in previousValue) {
                    node.style[i] = ""
                }
            } else if (typeof previousValue === "string") {
                node[propName] = ""
            } else {
                node[propName] = null
            }
        } else if (previousValue.unhook) {
            previousValue.unhook(node, propName, propValue)
        }
    }
}

function patchObject(node, props, previous, propName, propValue) {
    var previousValue = previous ? previous[propName] : undefined

    // Set attributes
    if (propName === "attributes") {
        for (var attrName in propValue) {
            var attrValue = propValue[attrName]

            if (attrValue === undefined) {
                node.removeAttribute(attrName)
            } else {
                node.setAttribute(attrName, attrValue)
            }
        }

        return
    }

    if(previousValue && isObject(previousValue) &&
        getPrototype(previousValue) !== getPrototype(propValue)) {
        node[propName] = propValue
        return
    }

    if (!isObject(node[propName])) {
        node[propName] = {}
    }

    var replacer = propName === "style" ? "" : undefined

    for (var k in propValue) {
        var value = propValue[k]
        node[propName][k] = (value === undefined) ? replacer : value
    }
}

function getPrototype(value) {
    if (Object.getPrototypeOf) {
        return Object.getPrototypeOf(value)
    } else if (value.__proto__) {
        return value.__proto__
    } else if (value.constructor) {
        return value.constructor.prototype
    }
}

},{"../vnode/is-vhook.js":57,"is-object":39}],43:[function(require,module,exports){
var document = require("global/document")

var applyProperties = require("./apply-properties")

var isVNode = require("../vnode/is-vnode.js")
var isVText = require("../vnode/is-vtext.js")
var isWidget = require("../vnode/is-widget.js")
var handleThunk = require("../vnode/handle-thunk.js")

module.exports = createElement

function createElement(vnode, opts) {
    var doc = opts ? opts.document || document : document
    var warn = opts ? opts.warn : null

    vnode = handleThunk(vnode).a

    if (isWidget(vnode)) {
        return vnode.init()
    } else if (isVText(vnode)) {
        return doc.createTextNode(vnode.text)
    } else if (!isVNode(vnode)) {
        if (warn) {
            warn("Item is not a valid virtual dom node", vnode)
        }
        return null
    }

    var node = (vnode.namespace === null) ?
        doc.createElement(vnode.tagName) :
        doc.createElementNS(vnode.namespace, vnode.tagName)

    var props = vnode.properties
    applyProperties(node, props)

    var children = vnode.children

    for (var i = 0; i < children.length; i++) {
        var childNode = createElement(children[i], opts)
        if (childNode) {
            node.appendChild(childNode)
        }
    }

    return node
}

},{"../vnode/handle-thunk.js":55,"../vnode/is-vnode.js":58,"../vnode/is-vtext.js":59,"../vnode/is-widget.js":60,"./apply-properties":42,"global/document":38}],44:[function(require,module,exports){
// Maps a virtual DOM tree onto a real DOM tree in an efficient manner.
// We don't want to read all of the DOM nodes in the tree so we use
// the in-order tree indexing to eliminate recursion down certain branches.
// We only recurse into a DOM node if we know that it contains a child of
// interest.

var noChild = {}

module.exports = domIndex

function domIndex(rootNode, tree, indices, nodes) {
    if (!indices || indices.length === 0) {
        return {}
    } else {
        indices.sort(ascending)
        return recurse(rootNode, tree, indices, nodes, 0)
    }
}

function recurse(rootNode, tree, indices, nodes, rootIndex) {
    nodes = nodes || {}


    if (rootNode) {
        if (indexInRange(indices, rootIndex, rootIndex)) {
            nodes[rootIndex] = rootNode
        }

        var vChildren = tree.children

        if (vChildren) {

            var childNodes = rootNode.childNodes

            for (var i = 0; i < tree.children.length; i++) {
                rootIndex += 1

                var vChild = vChildren[i] || noChild
                var nextIndex = rootIndex + (vChild.count || 0)

                // skip recursion down the tree if there are no nodes down here
                if (indexInRange(indices, rootIndex, nextIndex)) {
                    recurse(childNodes[i], vChild, indices, nodes, rootIndex)
                }

                rootIndex = nextIndex
            }
        }
    }

    return nodes
}

// Binary search for an index in the interval [left, right]
function indexInRange(indices, left, right) {
    if (indices.length === 0) {
        return false
    }

    var minIndex = 0
    var maxIndex = indices.length - 1
    var currentIndex
    var currentItem

    while (minIndex <= maxIndex) {
        currentIndex = ((maxIndex + minIndex) / 2) >> 0
        currentItem = indices[currentIndex]

        if (minIndex === maxIndex) {
            return currentItem >= left && currentItem <= right
        } else if (currentItem < left) {
            minIndex = currentIndex + 1
        } else  if (currentItem > right) {
            maxIndex = currentIndex - 1
        } else {
            return true
        }
    }

    return false;
}

function ascending(a, b) {
    return a > b ? 1 : -1
}

},{}],45:[function(require,module,exports){
var applyProperties = require("./apply-properties")

var isWidget = require("../vnode/is-widget.js")
var VPatch = require("../vnode/vpatch.js")

var render = require("./create-element")
var updateWidget = require("./update-widget")

module.exports = applyPatch

function applyPatch(vpatch, domNode, renderOptions) {
    var type = vpatch.type
    var vNode = vpatch.vNode
    var patch = vpatch.patch

    switch (type) {
        case VPatch.REMOVE:
            return removeNode(domNode, vNode)
        case VPatch.INSERT:
            return insertNode(domNode, patch, renderOptions)
        case VPatch.VTEXT:
            return stringPatch(domNode, vNode, patch, renderOptions)
        case VPatch.WIDGET:
            return widgetPatch(domNode, vNode, patch, renderOptions)
        case VPatch.VNODE:
            return vNodePatch(domNode, vNode, patch, renderOptions)
        case VPatch.ORDER:
            reorderChildren(domNode, patch)
            return domNode
        case VPatch.PROPS:
            applyProperties(domNode, patch, vNode.properties)
            return domNode
        case VPatch.THUNK:
            return replaceRoot(domNode,
                renderOptions.patch(domNode, patch, renderOptions))
        default:
            return domNode
    }
}

function removeNode(domNode, vNode) {
    var parentNode = domNode.parentNode

    if (parentNode) {
        parentNode.removeChild(domNode)
    }

    destroyWidget(domNode, vNode);

    return null
}

function insertNode(parentNode, vNode, renderOptions) {
    var newNode = render(vNode, renderOptions)

    if (parentNode) {
        parentNode.appendChild(newNode)
    }

    return parentNode
}

function stringPatch(domNode, leftVNode, vText, renderOptions) {
    var newNode

    if (domNode.nodeType === 3) {
        domNode.replaceData(0, domNode.length, vText.text)
        newNode = domNode
    } else {
        var parentNode = domNode.parentNode
        newNode = render(vText, renderOptions)

        if (parentNode && newNode !== domNode) {
            parentNode.replaceChild(newNode, domNode)
        }
    }

    return newNode
}

function widgetPatch(domNode, leftVNode, widget, renderOptions) {
    var updating = updateWidget(leftVNode, widget)
    var newNode

    if (updating) {
        newNode = widget.update(leftVNode, domNode) || domNode
    } else {
        newNode = render(widget, renderOptions)
    }

    var parentNode = domNode.parentNode

    if (parentNode && newNode !== domNode) {
        parentNode.replaceChild(newNode, domNode)
    }

    if (!updating) {
        destroyWidget(domNode, leftVNode)
    }

    return newNode
}

function vNodePatch(domNode, leftVNode, vNode, renderOptions) {
    var parentNode = domNode.parentNode
    var newNode = render(vNode, renderOptions)

    if (parentNode && newNode !== domNode) {
        parentNode.replaceChild(newNode, domNode)
    }

    return newNode
}

function destroyWidget(domNode, w) {
    if (typeof w.destroy === "function" && isWidget(w)) {
        w.destroy(domNode)
    }
}

function reorderChildren(domNode, moves) {
    var childNodes = domNode.childNodes
    var keyMap = {}
    var node
    var remove
    var insert

    for (var i = 0; i < moves.removes.length; i++) {
        remove = moves.removes[i]
        node = childNodes[remove.from]
        if (remove.key) {
            keyMap[remove.key] = node
        }
        domNode.removeChild(node)
    }

    var length = childNodes.length
    for (var j = 0; j < moves.inserts.length; j++) {
        insert = moves.inserts[j]
        node = keyMap[insert.key]
        // this is the weirdest bug i've ever seen in webkit
        domNode.insertBefore(node, insert.to >= length++ ? null : childNodes[insert.to])
    }
}

function replaceRoot(oldRoot, newRoot) {
    if (oldRoot && newRoot && oldRoot !== newRoot && oldRoot.parentNode) {
        oldRoot.parentNode.replaceChild(newRoot, oldRoot)
    }

    return newRoot;
}

},{"../vnode/is-widget.js":60,"../vnode/vpatch.js":63,"./apply-properties":42,"./create-element":43,"./update-widget":47}],46:[function(require,module,exports){
var document = require("global/document")
var isArray = require("x-is-array")

var domIndex = require("./dom-index")
var patchOp = require("./patch-op")
module.exports = patch

function patch(rootNode, patches) {
    return patchRecursive(rootNode, patches)
}

function patchRecursive(rootNode, patches, renderOptions) {
    var indices = patchIndices(patches)

    if (indices.length === 0) {
        return rootNode
    }

    var index = domIndex(rootNode, patches.a, indices)
    var ownerDocument = rootNode.ownerDocument

    if (!renderOptions) {
        renderOptions = { patch: patchRecursive }
        if (ownerDocument !== document) {
            renderOptions.document = ownerDocument
        }
    }

    for (var i = 0; i < indices.length; i++) {
        var nodeIndex = indices[i]
        rootNode = applyPatch(rootNode,
            index[nodeIndex],
            patches[nodeIndex],
            renderOptions)
    }

    return rootNode
}

function applyPatch(rootNode, domNode, patchList, renderOptions) {
    if (!domNode) {
        return rootNode
    }

    var newNode

    if (isArray(patchList)) {
        for (var i = 0; i < patchList.length; i++) {
            newNode = patchOp(patchList[i], domNode, renderOptions)

            if (domNode === rootNode) {
                rootNode = newNode
            }
        }
    } else {
        newNode = patchOp(patchList, domNode, renderOptions)

        if (domNode === rootNode) {
            rootNode = newNode
        }
    }

    return rootNode
}

function patchIndices(patches) {
    var indices = []

    for (var key in patches) {
        if (key !== "a") {
            indices.push(Number(key))
        }
    }

    return indices
}

},{"./dom-index":44,"./patch-op":45,"global/document":38,"x-is-array":40}],47:[function(require,module,exports){
var isWidget = require("../vnode/is-widget.js")

module.exports = updateWidget

function updateWidget(a, b) {
    if (isWidget(a) && isWidget(b)) {
        if ("name" in a && "name" in b) {
            return a.id === b.id
        } else {
            return a.init === b.init
        }
    }

    return false
}

},{"../vnode/is-widget.js":60}],48:[function(require,module,exports){
'use strict';

module.exports = AttributeHook;

function AttributeHook(namespace, value) {
    if (!(this instanceof AttributeHook)) {
        return new AttributeHook(namespace, value);
    }

    this.namespace = namespace;
    this.value = value;
}

AttributeHook.prototype.hook = function (node, prop, prev) {
    if (prev && prev.type === 'AttributeHook' &&
        prev.value === this.value &&
        prev.namespace === this.namespace) {
        return;
    }

    node.setAttributeNS(this.namespace, prop, this.value);
};

AttributeHook.prototype.unhook = function (node, prop, next) {
    if (next && next.type === 'AttributeHook' &&
        next.namespace === this.namespace) {
        return;
    }

    var colonPosition = prop.indexOf(':');
    var localName = colonPosition > -1 ? prop.substr(colonPosition + 1) : prop;
    node.removeAttributeNS(this.namespace, localName);
};

AttributeHook.prototype.type = 'AttributeHook';

},{}],49:[function(require,module,exports){
'use strict';

var EvStore = require('ev-store');

module.exports = EvHook;

function EvHook(value) {
    if (!(this instanceof EvHook)) {
        return new EvHook(value);
    }

    this.value = value;
}

EvHook.prototype.hook = function (node, propertyName) {
    var es = EvStore(node);
    var propName = propertyName.substr(3);

    es[propName] = this.value;
};

EvHook.prototype.unhook = function(node, propertyName) {
    var es = EvStore(node);
    var propName = propertyName.substr(3);

    es[propName] = undefined;
};

},{"ev-store":35}],50:[function(require,module,exports){
'use strict';

module.exports = SoftSetHook;

function SoftSetHook(value) {
    if (!(this instanceof SoftSetHook)) {
        return new SoftSetHook(value);
    }

    this.value = value;
}

SoftSetHook.prototype.hook = function (node, propertyName) {
    if (node[propertyName] !== this.value) {
        node[propertyName] = this.value;
    }
};

},{}],51:[function(require,module,exports){
'use strict';

var isArray = require('x-is-array');

var VNode = require('../vnode/vnode.js');
var VText = require('../vnode/vtext.js');
var isVNode = require('../vnode/is-vnode');
var isVText = require('../vnode/is-vtext');
var isWidget = require('../vnode/is-widget');
var isHook = require('../vnode/is-vhook');
var isVThunk = require('../vnode/is-thunk');

var parseTag = require('./parse-tag.js');
var softSetHook = require('./hooks/soft-set-hook.js');
var evHook = require('./hooks/ev-hook.js');

module.exports = h;

function h(tagName, properties, children) {
    var childNodes = [];
    var tag, props, key, namespace;

    if (!children && isChildren(properties)) {
        children = properties;
        props = {};
    }

    props = props || properties || {};
    tag = parseTag(tagName, props);

    // support keys
    if (props.hasOwnProperty('key')) {
        key = props.key;
        props.key = undefined;
    }

    // support namespace
    if (props.hasOwnProperty('namespace')) {
        namespace = props.namespace;
        props.namespace = undefined;
    }

    // fix cursor bug
    if (tag === 'INPUT' &&
        !namespace &&
        props.hasOwnProperty('value') &&
        props.value !== undefined &&
        !isHook(props.value)
    ) {
        props.value = softSetHook(props.value);
    }

    transformProperties(props);

    if (children !== undefined && children !== null) {
        addChild(children, childNodes, tag, props);
    }


    return new VNode(tag, props, childNodes, key, namespace);
}

function addChild(c, childNodes, tag, props) {
    if (typeof c === 'string') {
        childNodes.push(new VText(c));
    } else if (isChild(c)) {
        childNodes.push(c);
    } else if (isArray(c)) {
        for (var i = 0; i < c.length; i++) {
            addChild(c[i], childNodes, tag, props);
        }
    } else if (c === null || c === undefined) {
        return;
    } else {
        throw UnexpectedVirtualElement({
            foreignObject: c,
            parentVnode: {
                tagName: tag,
                properties: props
            }
        });
    }
}

function transformProperties(props) {
    for (var propName in props) {
        if (props.hasOwnProperty(propName)) {
            var value = props[propName];

            if (isHook(value)) {
                continue;
            }

            if (propName.substr(0, 3) === 'ev-') {
                // add ev-foo support
                props[propName] = evHook(value);
            }
        }
    }
}

function isChild(x) {
    return isVNode(x) || isVText(x) || isWidget(x) || isVThunk(x);
}

function isChildren(x) {
    return typeof x === 'string' || isArray(x) || isChild(x);
}

function UnexpectedVirtualElement(data) {
    var err = new Error();

    err.type = 'virtual-hyperscript.unexpected.virtual-element';
    err.message = 'Unexpected virtual child passed to h().\n' +
        'Expected a VNode / Vthunk / VWidget / string but:\n' +
        'got:\n' +
        errorString(data.foreignObject) +
        '.\n' +
        'The parent vnode is:\n' +
        errorString(data.parentVnode)
        '\n' +
        'Suggested fix: change your `h(..., [ ... ])` callsite.';
    err.foreignObject = data.foreignObject;
    err.parentVnode = data.parentVnode;

    return err;
}

function errorString(obj) {
    try {
        return JSON.stringify(obj, null, '    ');
    } catch (e) {
        return String(obj);
    }
}

},{"../vnode/is-thunk":56,"../vnode/is-vhook":57,"../vnode/is-vnode":58,"../vnode/is-vtext":59,"../vnode/is-widget":60,"../vnode/vnode.js":62,"../vnode/vtext.js":64,"./hooks/ev-hook.js":49,"./hooks/soft-set-hook.js":50,"./parse-tag.js":52,"x-is-array":40}],52:[function(require,module,exports){
'use strict';

var split = require('browser-split');

var classIdSplit = /([\.#]?[a-zA-Z0-9_:-]+)/;
var notClassId = /^\.|#/;

module.exports = parseTag;

function parseTag(tag, props) {
    if (!tag) {
        return 'DIV';
    }

    var noId = !(props.hasOwnProperty('id'));

    var tagParts = split(tag, classIdSplit);
    var tagName = null;

    if (notClassId.test(tagParts[1])) {
        tagName = 'DIV';
    }

    var classes, part, type, i;

    for (i = 0; i < tagParts.length; i++) {
        part = tagParts[i];

        if (!part) {
            continue;
        }

        type = part.charAt(0);

        if (!tagName) {
            tagName = part;
        } else if (type === '.') {
            classes = classes || [];
            classes.push(part.substring(1, part.length));
        } else if (type === '#' && noId) {
            props.id = part.substring(1, part.length);
        }
    }

    if (classes) {
        if (props.className) {
            classes.push(props.className);
        }

        props.className = classes.join(' ');
    }

    return props.namespace ? tagName : tagName.toUpperCase();
}

},{"browser-split":34}],53:[function(require,module,exports){
'use strict';

var DEFAULT_NAMESPACE = null;
var EV_NAMESPACE = 'http://www.w3.org/2001/xml-events';
var XLINK_NAMESPACE = 'http://www.w3.org/1999/xlink';
var XML_NAMESPACE = 'http://www.w3.org/XML/1998/namespace';

// http://www.w3.org/TR/SVGTiny12/attributeTable.html
// http://www.w3.org/TR/SVG/attindex.html
var SVG_PROPERTIES = {
    'about': DEFAULT_NAMESPACE,
    'accent-height': DEFAULT_NAMESPACE,
    'accumulate': DEFAULT_NAMESPACE,
    'additive': DEFAULT_NAMESPACE,
    'alignment-baseline': DEFAULT_NAMESPACE,
    'alphabetic': DEFAULT_NAMESPACE,
    'amplitude': DEFAULT_NAMESPACE,
    'arabic-form': DEFAULT_NAMESPACE,
    'ascent': DEFAULT_NAMESPACE,
    'attributeName': DEFAULT_NAMESPACE,
    'attributeType': DEFAULT_NAMESPACE,
    'azimuth': DEFAULT_NAMESPACE,
    'bandwidth': DEFAULT_NAMESPACE,
    'baseFrequency': DEFAULT_NAMESPACE,
    'baseProfile': DEFAULT_NAMESPACE,
    'baseline-shift': DEFAULT_NAMESPACE,
    'bbox': DEFAULT_NAMESPACE,
    'begin': DEFAULT_NAMESPACE,
    'bias': DEFAULT_NAMESPACE,
    'by': DEFAULT_NAMESPACE,
    'calcMode': DEFAULT_NAMESPACE,
    'cap-height': DEFAULT_NAMESPACE,
    'class': DEFAULT_NAMESPACE,
    'clip': DEFAULT_NAMESPACE,
    'clip-path': DEFAULT_NAMESPACE,
    'clip-rule': DEFAULT_NAMESPACE,
    'clipPathUnits': DEFAULT_NAMESPACE,
    'color': DEFAULT_NAMESPACE,
    'color-interpolation': DEFAULT_NAMESPACE,
    'color-interpolation-filters': DEFAULT_NAMESPACE,
    'color-profile': DEFAULT_NAMESPACE,
    'color-rendering': DEFAULT_NAMESPACE,
    'content': DEFAULT_NAMESPACE,
    'contentScriptType': DEFAULT_NAMESPACE,
    'contentStyleType': DEFAULT_NAMESPACE,
    'cursor': DEFAULT_NAMESPACE,
    'cx': DEFAULT_NAMESPACE,
    'cy': DEFAULT_NAMESPACE,
    'd': DEFAULT_NAMESPACE,
    'datatype': DEFAULT_NAMESPACE,
    'defaultAction': DEFAULT_NAMESPACE,
    'descent': DEFAULT_NAMESPACE,
    'diffuseConstant': DEFAULT_NAMESPACE,
    'direction': DEFAULT_NAMESPACE,
    'display': DEFAULT_NAMESPACE,
    'divisor': DEFAULT_NAMESPACE,
    'dominant-baseline': DEFAULT_NAMESPACE,
    'dur': DEFAULT_NAMESPACE,
    'dx': DEFAULT_NAMESPACE,
    'dy': DEFAULT_NAMESPACE,
    'edgeMode': DEFAULT_NAMESPACE,
    'editable': DEFAULT_NAMESPACE,
    'elevation': DEFAULT_NAMESPACE,
    'enable-background': DEFAULT_NAMESPACE,
    'end': DEFAULT_NAMESPACE,
    'ev:event': EV_NAMESPACE,
    'event': DEFAULT_NAMESPACE,
    'exponent': DEFAULT_NAMESPACE,
    'externalResourcesRequired': DEFAULT_NAMESPACE,
    'fill': DEFAULT_NAMESPACE,
    'fill-opacity': DEFAULT_NAMESPACE,
    'fill-rule': DEFAULT_NAMESPACE,
    'filter': DEFAULT_NAMESPACE,
    'filterRes': DEFAULT_NAMESPACE,
    'filterUnits': DEFAULT_NAMESPACE,
    'flood-color': DEFAULT_NAMESPACE,
    'flood-opacity': DEFAULT_NAMESPACE,
    'focusHighlight': DEFAULT_NAMESPACE,
    'focusable': DEFAULT_NAMESPACE,
    'font-family': DEFAULT_NAMESPACE,
    'font-size': DEFAULT_NAMESPACE,
    'font-size-adjust': DEFAULT_NAMESPACE,
    'font-stretch': DEFAULT_NAMESPACE,
    'font-style': DEFAULT_NAMESPACE,
    'font-variant': DEFAULT_NAMESPACE,
    'font-weight': DEFAULT_NAMESPACE,
    'format': DEFAULT_NAMESPACE,
    'from': DEFAULT_NAMESPACE,
    'fx': DEFAULT_NAMESPACE,
    'fy': DEFAULT_NAMESPACE,
    'g1': DEFAULT_NAMESPACE,
    'g2': DEFAULT_NAMESPACE,
    'glyph-name': DEFAULT_NAMESPACE,
    'glyph-orientation-horizontal': DEFAULT_NAMESPACE,
    'glyph-orientation-vertical': DEFAULT_NAMESPACE,
    'glyphRef': DEFAULT_NAMESPACE,
    'gradientTransform': DEFAULT_NAMESPACE,
    'gradientUnits': DEFAULT_NAMESPACE,
    'handler': DEFAULT_NAMESPACE,
    'hanging': DEFAULT_NAMESPACE,
    'height': DEFAULT_NAMESPACE,
    'horiz-adv-x': DEFAULT_NAMESPACE,
    'horiz-origin-x': DEFAULT_NAMESPACE,
    'horiz-origin-y': DEFAULT_NAMESPACE,
    'id': DEFAULT_NAMESPACE,
    'ideographic': DEFAULT_NAMESPACE,
    'image-rendering': DEFAULT_NAMESPACE,
    'in': DEFAULT_NAMESPACE,
    'in2': DEFAULT_NAMESPACE,
    'initialVisibility': DEFAULT_NAMESPACE,
    'intercept': DEFAULT_NAMESPACE,
    'k': DEFAULT_NAMESPACE,
    'k1': DEFAULT_NAMESPACE,
    'k2': DEFAULT_NAMESPACE,
    'k3': DEFAULT_NAMESPACE,
    'k4': DEFAULT_NAMESPACE,
    'kernelMatrix': DEFAULT_NAMESPACE,
    'kernelUnitLength': DEFAULT_NAMESPACE,
    'kerning': DEFAULT_NAMESPACE,
    'keyPoints': DEFAULT_NAMESPACE,
    'keySplines': DEFAULT_NAMESPACE,
    'keyTimes': DEFAULT_NAMESPACE,
    'lang': DEFAULT_NAMESPACE,
    'lengthAdjust': DEFAULT_NAMESPACE,
    'letter-spacing': DEFAULT_NAMESPACE,
    'lighting-color': DEFAULT_NAMESPACE,
    'limitingConeAngle': DEFAULT_NAMESPACE,
    'local': DEFAULT_NAMESPACE,
    'marker-end': DEFAULT_NAMESPACE,
    'marker-mid': DEFAULT_NAMESPACE,
    'marker-start': DEFAULT_NAMESPACE,
    'markerHeight': DEFAULT_NAMESPACE,
    'markerUnits': DEFAULT_NAMESPACE,
    'markerWidth': DEFAULT_NAMESPACE,
    'mask': DEFAULT_NAMESPACE,
    'maskContentUnits': DEFAULT_NAMESPACE,
    'maskUnits': DEFAULT_NAMESPACE,
    'mathematical': DEFAULT_NAMESPACE,
    'max': DEFAULT_NAMESPACE,
    'media': DEFAULT_NAMESPACE,
    'mediaCharacterEncoding': DEFAULT_NAMESPACE,
    'mediaContentEncodings': DEFAULT_NAMESPACE,
    'mediaSize': DEFAULT_NAMESPACE,
    'mediaTime': DEFAULT_NAMESPACE,
    'method': DEFAULT_NAMESPACE,
    'min': DEFAULT_NAMESPACE,
    'mode': DEFAULT_NAMESPACE,
    'name': DEFAULT_NAMESPACE,
    'nav-down': DEFAULT_NAMESPACE,
    'nav-down-left': DEFAULT_NAMESPACE,
    'nav-down-right': DEFAULT_NAMESPACE,
    'nav-left': DEFAULT_NAMESPACE,
    'nav-next': DEFAULT_NAMESPACE,
    'nav-prev': DEFAULT_NAMESPACE,
    'nav-right': DEFAULT_NAMESPACE,
    'nav-up': DEFAULT_NAMESPACE,
    'nav-up-left': DEFAULT_NAMESPACE,
    'nav-up-right': DEFAULT_NAMESPACE,
    'numOctaves': DEFAULT_NAMESPACE,
    'observer': DEFAULT_NAMESPACE,
    'offset': DEFAULT_NAMESPACE,
    'opacity': DEFAULT_NAMESPACE,
    'operator': DEFAULT_NAMESPACE,
    'order': DEFAULT_NAMESPACE,
    'orient': DEFAULT_NAMESPACE,
    'orientation': DEFAULT_NAMESPACE,
    'origin': DEFAULT_NAMESPACE,
    'overflow': DEFAULT_NAMESPACE,
    'overlay': DEFAULT_NAMESPACE,
    'overline-position': DEFAULT_NAMESPACE,
    'overline-thickness': DEFAULT_NAMESPACE,
    'panose-1': DEFAULT_NAMESPACE,
    'path': DEFAULT_NAMESPACE,
    'pathLength': DEFAULT_NAMESPACE,
    'patternContentUnits': DEFAULT_NAMESPACE,
    'patternTransform': DEFAULT_NAMESPACE,
    'patternUnits': DEFAULT_NAMESPACE,
    'phase': DEFAULT_NAMESPACE,
    'playbackOrder': DEFAULT_NAMESPACE,
    'pointer-events': DEFAULT_NAMESPACE,
    'points': DEFAULT_NAMESPACE,
    'pointsAtX': DEFAULT_NAMESPACE,
    'pointsAtY': DEFAULT_NAMESPACE,
    'pointsAtZ': DEFAULT_NAMESPACE,
    'preserveAlpha': DEFAULT_NAMESPACE,
    'preserveAspectRatio': DEFAULT_NAMESPACE,
    'primitiveUnits': DEFAULT_NAMESPACE,
    'propagate': DEFAULT_NAMESPACE,
    'property': DEFAULT_NAMESPACE,
    'r': DEFAULT_NAMESPACE,
    'radius': DEFAULT_NAMESPACE,
    'refX': DEFAULT_NAMESPACE,
    'refY': DEFAULT_NAMESPACE,
    'rel': DEFAULT_NAMESPACE,
    'rendering-intent': DEFAULT_NAMESPACE,
    'repeatCount': DEFAULT_NAMESPACE,
    'repeatDur': DEFAULT_NAMESPACE,
    'requiredExtensions': DEFAULT_NAMESPACE,
    'requiredFeatures': DEFAULT_NAMESPACE,
    'requiredFonts': DEFAULT_NAMESPACE,
    'requiredFormats': DEFAULT_NAMESPACE,
    'resource': DEFAULT_NAMESPACE,
    'restart': DEFAULT_NAMESPACE,
    'result': DEFAULT_NAMESPACE,
    'rev': DEFAULT_NAMESPACE,
    'role': DEFAULT_NAMESPACE,
    'rotate': DEFAULT_NAMESPACE,
    'rx': DEFAULT_NAMESPACE,
    'ry': DEFAULT_NAMESPACE,
    'scale': DEFAULT_NAMESPACE,
    'seed': DEFAULT_NAMESPACE,
    'shape-rendering': DEFAULT_NAMESPACE,
    'slope': DEFAULT_NAMESPACE,
    'snapshotTime': DEFAULT_NAMESPACE,
    'spacing': DEFAULT_NAMESPACE,
    'specularConstant': DEFAULT_NAMESPACE,
    'specularExponent': DEFAULT_NAMESPACE,
    'spreadMethod': DEFAULT_NAMESPACE,
    'startOffset': DEFAULT_NAMESPACE,
    'stdDeviation': DEFAULT_NAMESPACE,
    'stemh': DEFAULT_NAMESPACE,
    'stemv': DEFAULT_NAMESPACE,
    'stitchTiles': DEFAULT_NAMESPACE,
    'stop-color': DEFAULT_NAMESPACE,
    'stop-opacity': DEFAULT_NAMESPACE,
    'strikethrough-position': DEFAULT_NAMESPACE,
    'strikethrough-thickness': DEFAULT_NAMESPACE,
    'string': DEFAULT_NAMESPACE,
    'stroke': DEFAULT_NAMESPACE,
    'stroke-dasharray': DEFAULT_NAMESPACE,
    'stroke-dashoffset': DEFAULT_NAMESPACE,
    'stroke-linecap': DEFAULT_NAMESPACE,
    'stroke-linejoin': DEFAULT_NAMESPACE,
    'stroke-miterlimit': DEFAULT_NAMESPACE,
    'stroke-opacity': DEFAULT_NAMESPACE,
    'stroke-width': DEFAULT_NAMESPACE,
    'surfaceScale': DEFAULT_NAMESPACE,
    'syncBehavior': DEFAULT_NAMESPACE,
    'syncBehaviorDefault': DEFAULT_NAMESPACE,
    'syncMaster': DEFAULT_NAMESPACE,
    'syncTolerance': DEFAULT_NAMESPACE,
    'syncToleranceDefault': DEFAULT_NAMESPACE,
    'systemLanguage': DEFAULT_NAMESPACE,
    'tableValues': DEFAULT_NAMESPACE,
    'target': DEFAULT_NAMESPACE,
    'targetX': DEFAULT_NAMESPACE,
    'targetY': DEFAULT_NAMESPACE,
    'text-anchor': DEFAULT_NAMESPACE,
    'text-decoration': DEFAULT_NAMESPACE,
    'text-rendering': DEFAULT_NAMESPACE,
    'textLength': DEFAULT_NAMESPACE,
    'timelineBegin': DEFAULT_NAMESPACE,
    'title': DEFAULT_NAMESPACE,
    'to': DEFAULT_NAMESPACE,
    'transform': DEFAULT_NAMESPACE,
    'transformBehavior': DEFAULT_NAMESPACE,
    'type': DEFAULT_NAMESPACE,
    'typeof': DEFAULT_NAMESPACE,
    'u1': DEFAULT_NAMESPACE,
    'u2': DEFAULT_NAMESPACE,
    'underline-position': DEFAULT_NAMESPACE,
    'underline-thickness': DEFAULT_NAMESPACE,
    'unicode': DEFAULT_NAMESPACE,
    'unicode-bidi': DEFAULT_NAMESPACE,
    'unicode-range': DEFAULT_NAMESPACE,
    'units-per-em': DEFAULT_NAMESPACE,
    'v-alphabetic': DEFAULT_NAMESPACE,
    'v-hanging': DEFAULT_NAMESPACE,
    'v-ideographic': DEFAULT_NAMESPACE,
    'v-mathematical': DEFAULT_NAMESPACE,
    'values': DEFAULT_NAMESPACE,
    'version': DEFAULT_NAMESPACE,
    'vert-adv-y': DEFAULT_NAMESPACE,
    'vert-origin-x': DEFAULT_NAMESPACE,
    'vert-origin-y': DEFAULT_NAMESPACE,
    'viewBox': DEFAULT_NAMESPACE,
    'viewTarget': DEFAULT_NAMESPACE,
    'visibility': DEFAULT_NAMESPACE,
    'width': DEFAULT_NAMESPACE,
    'widths': DEFAULT_NAMESPACE,
    'word-spacing': DEFAULT_NAMESPACE,
    'writing-mode': DEFAULT_NAMESPACE,
    'x': DEFAULT_NAMESPACE,
    'x-height': DEFAULT_NAMESPACE,
    'x1': DEFAULT_NAMESPACE,
    'x2': DEFAULT_NAMESPACE,
    'xChannelSelector': DEFAULT_NAMESPACE,
    'xlink:actuate': XLINK_NAMESPACE,
    'xlink:arcrole': XLINK_NAMESPACE,
    'xlink:href': XLINK_NAMESPACE,
    'xlink:role': XLINK_NAMESPACE,
    'xlink:show': XLINK_NAMESPACE,
    'xlink:title': XLINK_NAMESPACE,
    'xlink:type': XLINK_NAMESPACE,
    'xml:base': XML_NAMESPACE,
    'xml:id': XML_NAMESPACE,
    'xml:lang': XML_NAMESPACE,
    'xml:space': XML_NAMESPACE,
    'y': DEFAULT_NAMESPACE,
    'y1': DEFAULT_NAMESPACE,
    'y2': DEFAULT_NAMESPACE,
    'yChannelSelector': DEFAULT_NAMESPACE,
    'z': DEFAULT_NAMESPACE,
    'zoomAndPan': DEFAULT_NAMESPACE
};

module.exports = SVGAttributeNamespace;

function SVGAttributeNamespace(value) {
  if (SVG_PROPERTIES.hasOwnProperty(value)) {
    return SVG_PROPERTIES[value];
  }
}

},{}],54:[function(require,module,exports){
'use strict';

var isArray = require('x-is-array');

var h = require('./index.js');


var SVGAttributeNamespace = require('./svg-attribute-namespace');
var attributeHook = require('./hooks/attribute-hook');

var SVG_NAMESPACE = 'http://www.w3.org/2000/svg';

module.exports = svg;

function svg(tagName, properties, children) {
    if (!children && isChildren(properties)) {
        children = properties;
        properties = {};
    }

    properties = properties || {};

    // set namespace for svg
    properties.namespace = SVG_NAMESPACE;

    var attributes = properties.attributes || (properties.attributes = {});

    for (var key in properties) {
        if (!properties.hasOwnProperty(key)) {
            continue;
        }

        var namespace = SVGAttributeNamespace(key);

        if (namespace === undefined) { // not a svg attribute
            continue;
        }

        var value = properties[key];

        if (typeof value !== 'string' &&
            typeof value !== 'number' &&
            typeof value !== 'boolean'
        ) {
            continue;
        }

        if (namespace !== null) { // namespaced attribute
            properties[key] = attributeHook(namespace, value);
            continue;
        }

        attributes[key] = value
        properties[key] = undefined
    }

    return h(tagName, properties, children);
}

function isChildren(x) {
    return typeof x === 'string' || isArray(x);
}

},{"./hooks/attribute-hook":48,"./index.js":51,"./svg-attribute-namespace":53,"x-is-array":40}],55:[function(require,module,exports){
var isVNode = require("./is-vnode")
var isVText = require("./is-vtext")
var isWidget = require("./is-widget")
var isThunk = require("./is-thunk")

module.exports = handleThunk

function handleThunk(a, b) {
    var renderedA = a
    var renderedB = b

    if (isThunk(b)) {
        renderedB = renderThunk(b, a)
    }

    if (isThunk(a)) {
        renderedA = renderThunk(a, null)
    }

    return {
        a: renderedA,
        b: renderedB
    }
}

function renderThunk(thunk, previous) {
    var renderedThunk = thunk.vnode

    if (!renderedThunk) {
        renderedThunk = thunk.vnode = thunk.render(previous)
    }

    if (!(isVNode(renderedThunk) ||
            isVText(renderedThunk) ||
            isWidget(renderedThunk))) {
        throw new Error("thunk did not return a valid node");
    }

    return renderedThunk
}

},{"./is-thunk":56,"./is-vnode":58,"./is-vtext":59,"./is-widget":60}],56:[function(require,module,exports){
module.exports = isThunk

function isThunk(t) {
    return t && t.type === "Thunk"
}

},{}],57:[function(require,module,exports){
module.exports = isHook

function isHook(hook) {
    return hook &&
      (typeof hook.hook === "function" && !hook.hasOwnProperty("hook") ||
       typeof hook.unhook === "function" && !hook.hasOwnProperty("unhook"))
}

},{}],58:[function(require,module,exports){
var version = require("./version")

module.exports = isVirtualNode

function isVirtualNode(x) {
    return x && x.type === "VirtualNode" && x.version === version
}

},{"./version":61}],59:[function(require,module,exports){
var version = require("./version")

module.exports = isVirtualText

function isVirtualText(x) {
    return x && x.type === "VirtualText" && x.version === version
}

},{"./version":61}],60:[function(require,module,exports){
module.exports = isWidget

function isWidget(w) {
    return w && w.type === "Widget"
}

},{}],61:[function(require,module,exports){
module.exports = "2"

},{}],62:[function(require,module,exports){
var version = require("./version")
var isVNode = require("./is-vnode")
var isWidget = require("./is-widget")
var isThunk = require("./is-thunk")
var isVHook = require("./is-vhook")

module.exports = VirtualNode

var noProperties = {}
var noChildren = []

function VirtualNode(tagName, properties, children, key, namespace) {
    this.tagName = tagName
    this.properties = properties || noProperties
    this.children = children || noChildren
    this.key = key != null ? String(key) : undefined
    this.namespace = (typeof namespace === "string") ? namespace : null

    var count = (children && children.length) || 0
    var descendants = 0
    var hasWidgets = false
    var hasThunks = false
    var descendantHooks = false
    var hooks

    for (var propName in properties) {
        if (properties.hasOwnProperty(propName)) {
            var property = properties[propName]
            if (isVHook(property) && property.unhook) {
                if (!hooks) {
                    hooks = {}
                }

                hooks[propName] = property
            }
        }
    }

    for (var i = 0; i < count; i++) {
        var child = children[i]
        if (isVNode(child)) {
            descendants += child.count || 0

            if (!hasWidgets && child.hasWidgets) {
                hasWidgets = true
            }

            if (!hasThunks && child.hasThunks) {
                hasThunks = true
            }

            if (!descendantHooks && (child.hooks || child.descendantHooks)) {
                descendantHooks = true
            }
        } else if (!hasWidgets && isWidget(child)) {
            if (typeof child.destroy === "function") {
                hasWidgets = true
            }
        } else if (!hasThunks && isThunk(child)) {
            hasThunks = true;
        }
    }

    this.count = count + descendants
    this.hasWidgets = hasWidgets
    this.hasThunks = hasThunks
    this.hooks = hooks
    this.descendantHooks = descendantHooks
}

VirtualNode.prototype.version = version
VirtualNode.prototype.type = "VirtualNode"

},{"./is-thunk":56,"./is-vhook":57,"./is-vnode":58,"./is-widget":60,"./version":61}],63:[function(require,module,exports){
var version = require("./version")

VirtualPatch.NONE = 0
VirtualPatch.VTEXT = 1
VirtualPatch.VNODE = 2
VirtualPatch.WIDGET = 3
VirtualPatch.PROPS = 4
VirtualPatch.ORDER = 5
VirtualPatch.INSERT = 6
VirtualPatch.REMOVE = 7
VirtualPatch.THUNK = 8

module.exports = VirtualPatch

function VirtualPatch(type, vNode, patch) {
    this.type = Number(type)
    this.vNode = vNode
    this.patch = patch
}

VirtualPatch.prototype.version = version
VirtualPatch.prototype.type = "VirtualPatch"

},{"./version":61}],64:[function(require,module,exports){
var version = require("./version")

module.exports = VirtualText

function VirtualText(text) {
    this.text = String(text)
}

VirtualText.prototype.version = version
VirtualText.prototype.type = "VirtualText"

},{"./version":61}],65:[function(require,module,exports){
var isObject = require("is-object")
var isHook = require("../vnode/is-vhook")

module.exports = diffProps

function diffProps(a, b) {
    var diff

    for (var aKey in a) {
        if (!(aKey in b)) {
            diff = diff || {}
            diff[aKey] = undefined
        }

        var aValue = a[aKey]
        var bValue = b[aKey]

        if (aValue === bValue) {
            continue
        } else if (isObject(aValue) && isObject(bValue)) {
            if (getPrototype(bValue) !== getPrototype(aValue)) {
                diff = diff || {}
                diff[aKey] = bValue
            } else if (isHook(bValue)) {
                 diff = diff || {}
                 diff[aKey] = bValue
            } else {
                var objectDiff = diffProps(aValue, bValue)
                if (objectDiff) {
                    diff = diff || {}
                    diff[aKey] = objectDiff
                }
            }
        } else {
            diff = diff || {}
            diff[aKey] = bValue
        }
    }

    for (var bKey in b) {
        if (!(bKey in a)) {
            diff = diff || {}
            diff[bKey] = b[bKey]
        }
    }

    return diff
}

function getPrototype(value) {
  if (Object.getPrototypeOf) {
    return Object.getPrototypeOf(value)
  } else if (value.__proto__) {
    return value.__proto__
  } else if (value.constructor) {
    return value.constructor.prototype
  }
}

},{"../vnode/is-vhook":57,"is-object":39}],66:[function(require,module,exports){
var isArray = require("x-is-array")

var VPatch = require("../vnode/vpatch")
var isVNode = require("../vnode/is-vnode")
var isVText = require("../vnode/is-vtext")
var isWidget = require("../vnode/is-widget")
var isThunk = require("../vnode/is-thunk")
var handleThunk = require("../vnode/handle-thunk")

var diffProps = require("./diff-props")

module.exports = diff

function diff(a, b) {
    var patch = { a: a }
    walk(a, b, patch, 0)
    return patch
}

function walk(a, b, patch, index) {
    if (a === b) {
        return
    }

    var apply = patch[index]
    var applyClear = false

    if (isThunk(a) || isThunk(b)) {
        thunks(a, b, patch, index)
    } else if (b == null) {

        // If a is a widget we will add a remove patch for it
        // Otherwise any child widgets/hooks must be destroyed.
        // This prevents adding two remove patches for a widget.
        if (!isWidget(a)) {
            clearState(a, patch, index)
            apply = patch[index]
        }

        apply = appendPatch(apply, new VPatch(VPatch.REMOVE, a, b))
    } else if (isVNode(b)) {
        if (isVNode(a)) {
            if (a.tagName === b.tagName &&
                a.namespace === b.namespace &&
                a.key === b.key) {
                var propsPatch = diffProps(a.properties, b.properties)
                if (propsPatch) {
                    apply = appendPatch(apply,
                        new VPatch(VPatch.PROPS, a, propsPatch))
                }
                apply = diffChildren(a, b, patch, apply, index)
            } else {
                apply = appendPatch(apply, new VPatch(VPatch.VNODE, a, b))
                applyClear = true
            }
        } else {
            apply = appendPatch(apply, new VPatch(VPatch.VNODE, a, b))
            applyClear = true
        }
    } else if (isVText(b)) {
        if (!isVText(a)) {
            apply = appendPatch(apply, new VPatch(VPatch.VTEXT, a, b))
            applyClear = true
        } else if (a.text !== b.text) {
            apply = appendPatch(apply, new VPatch(VPatch.VTEXT, a, b))
        }
    } else if (isWidget(b)) {
        if (!isWidget(a)) {
            applyClear = true
        }

        apply = appendPatch(apply, new VPatch(VPatch.WIDGET, a, b))
    }

    if (apply) {
        patch[index] = apply
    }

    if (applyClear) {
        clearState(a, patch, index)
    }
}

function diffChildren(a, b, patch, apply, index) {
    var aChildren = a.children
    var orderedSet = reorder(aChildren, b.children)
    var bChildren = orderedSet.children

    var aLen = aChildren.length
    var bLen = bChildren.length
    var len = aLen > bLen ? aLen : bLen

    for (var i = 0; i < len; i++) {
        var leftNode = aChildren[i]
        var rightNode = bChildren[i]
        index += 1

        if (!leftNode) {
            if (rightNode) {
                // Excess nodes in b need to be added
                apply = appendPatch(apply,
                    new VPatch(VPatch.INSERT, null, rightNode))
            }
        } else {
            walk(leftNode, rightNode, patch, index)
        }

        if (isVNode(leftNode) && leftNode.count) {
            index += leftNode.count
        }
    }

    if (orderedSet.moves) {
        // Reorder nodes last
        apply = appendPatch(apply, new VPatch(
            VPatch.ORDER,
            a,
            orderedSet.moves
        ))
    }

    return apply
}

function clearState(vNode, patch, index) {
    // TODO: Make this a single walk, not two
    unhook(vNode, patch, index)
    destroyWidgets(vNode, patch, index)
}

// Patch records for all destroyed widgets must be added because we need
// a DOM node reference for the destroy function
function destroyWidgets(vNode, patch, index) {
    if (isWidget(vNode)) {
        if (typeof vNode.destroy === "function") {
            patch[index] = appendPatch(
                patch[index],
                new VPatch(VPatch.REMOVE, vNode, null)
            )
        }
    } else if (isVNode(vNode) && (vNode.hasWidgets || vNode.hasThunks)) {
        var children = vNode.children
        var len = children.length
        for (var i = 0; i < len; i++) {
            var child = children[i]
            index += 1

            destroyWidgets(child, patch, index)

            if (isVNode(child) && child.count) {
                index += child.count
            }
        }
    } else if (isThunk(vNode)) {
        thunks(vNode, null, patch, index)
    }
}

// Create a sub-patch for thunks
function thunks(a, b, patch, index) {
    var nodes = handleThunk(a, b)
    var thunkPatch = diff(nodes.a, nodes.b)
    if (hasPatches(thunkPatch)) {
        patch[index] = new VPatch(VPatch.THUNK, null, thunkPatch)
    }
}

function hasPatches(patch) {
    for (var index in patch) {
        if (index !== "a") {
            return true
        }
    }

    return false
}

// Execute hooks when two nodes are identical
function unhook(vNode, patch, index) {
    if (isVNode(vNode)) {
        if (vNode.hooks) {
            patch[index] = appendPatch(
                patch[index],
                new VPatch(
                    VPatch.PROPS,
                    vNode,
                    undefinedKeys(vNode.hooks)
                )
            )
        }

        if (vNode.descendantHooks || vNode.hasThunks) {
            var children = vNode.children
            var len = children.length
            for (var i = 0; i < len; i++) {
                var child = children[i]
                index += 1

                unhook(child, patch, index)

                if (isVNode(child) && child.count) {
                    index += child.count
                }
            }
        }
    } else if (isThunk(vNode)) {
        thunks(vNode, null, patch, index)
    }
}

function undefinedKeys(obj) {
    var result = {}

    for (var key in obj) {
        result[key] = undefined
    }

    return result
}

// List diff, naive left to right reordering
function reorder(aChildren, bChildren) {
    // O(M) time, O(M) memory
    var bChildIndex = keyIndex(bChildren)
    var bKeys = bChildIndex.keys
    var bFree = bChildIndex.free

    if (bFree.length === bChildren.length) {
        return {
            children: bChildren,
            moves: null
        }
    }

    // O(N) time, O(N) memory
    var aChildIndex = keyIndex(aChildren)
    var aKeys = aChildIndex.keys
    var aFree = aChildIndex.free

    if (aFree.length === aChildren.length) {
        return {
            children: bChildren,
            moves: null
        }
    }

    // O(MAX(N, M)) memory
    var newChildren = []

    var freeIndex = 0
    var freeCount = bFree.length
    var deletedItems = 0

    // Iterate through a and match a node in b
    // O(N) time,
    for (var i = 0 ; i < aChildren.length; i++) {
        var aItem = aChildren[i]
        var itemIndex

        if (aItem.key) {
            if (bKeys.hasOwnProperty(aItem.key)) {
                // Match up the old keys
                itemIndex = bKeys[aItem.key]
                newChildren.push(bChildren[itemIndex])

            } else {
                // Remove old keyed items
                itemIndex = i - deletedItems++
                newChildren.push(null)
            }
        } else {
            // Match the item in a with the next free item in b
            if (freeIndex < freeCount) {
                itemIndex = bFree[freeIndex++]
                newChildren.push(bChildren[itemIndex])
            } else {
                // There are no free items in b to match with
                // the free items in a, so the extra free nodes
                // are deleted.
                itemIndex = i - deletedItems++
                newChildren.push(null)
            }
        }
    }

    var lastFreeIndex = freeIndex >= bFree.length ?
        bChildren.length :
        bFree[freeIndex]

    // Iterate through b and append any new keys
    // O(M) time
    for (var j = 0; j < bChildren.length; j++) {
        var newItem = bChildren[j]

        if (newItem.key) {
            if (!aKeys.hasOwnProperty(newItem.key)) {
                // Add any new keyed items
                // We are adding new items to the end and then sorting them
                // in place. In future we should insert new items in place.
                newChildren.push(newItem)
            }
        } else if (j >= lastFreeIndex) {
            // Add any leftover non-keyed items
            newChildren.push(newItem)
        }
    }

    var simulate = newChildren.slice()
    var simulateIndex = 0
    var removes = []
    var inserts = []
    var simulateItem

    for (var k = 0; k < bChildren.length;) {
        var wantedItem = bChildren[k]
        simulateItem = simulate[simulateIndex]

        // remove items
        while (simulateItem === null && simulate.length) {
            removes.push(remove(simulate, simulateIndex, null))
            simulateItem = simulate[simulateIndex]
        }

        if (!simulateItem || simulateItem.key !== wantedItem.key) {
            // if we need a key in this position...
            if (wantedItem.key) {
                if (simulateItem && simulateItem.key) {
                    // if an insert doesn't put this key in place, it needs to move
                    if (bKeys[simulateItem.key] !== k + 1) {
                        removes.push(remove(simulate, simulateIndex, simulateItem.key))
                        simulateItem = simulate[simulateIndex]
                        // if the remove didn't put the wanted item in place, we need to insert it
                        if (!simulateItem || simulateItem.key !== wantedItem.key) {
                            inserts.push({key: wantedItem.key, to: k})
                        }
                        // items are matching, so skip ahead
                        else {
                            simulateIndex++
                        }
                    }
                    else {
                        inserts.push({key: wantedItem.key, to: k})
                    }
                }
                else {
                    inserts.push({key: wantedItem.key, to: k})
                }
                k++
            }
            // a key in simulate has no matching wanted key, remove it
            else if (simulateItem && simulateItem.key) {
                removes.push(remove(simulate, simulateIndex, simulateItem.key))
            }
        }
        else {
            simulateIndex++
            k++
        }
    }

    // remove all the remaining nodes from simulate
    while(simulateIndex < simulate.length) {
        simulateItem = simulate[simulateIndex]
        removes.push(remove(simulate, simulateIndex, simulateItem && simulateItem.key))
    }

    // If the only moves we have are deletes then we can just
    // let the delete patch remove these items.
    if (removes.length === deletedItems && !inserts.length) {
        return {
            children: newChildren,
            moves: null
        }
    }

    return {
        children: newChildren,
        moves: {
            removes: removes,
            inserts: inserts
        }
    }
}

function remove(arr, index, key) {
    arr.splice(index, 1)

    return {
        from: index,
        key: key
    }
}

function keyIndex(children) {
    var keys = {}
    var free = []
    var length = children.length

    for (var i = 0; i < length; i++) {
        var child = children[i]

        if (child.key) {
            keys[child.key] = i
        } else {
            free.push(i)
        }
    }

    return {
        keys: keys,     // A hash of key name to index
        free: free,     // An array of unkeyed item indices
    }
}

function appendPatch(apply, patch) {
    if (apply) {
        if (isArray(apply)) {
            apply.push(patch)
        } else {
            apply = [apply, patch]
        }

        return apply
    } else {
        return patch
    }
}

},{"../vnode/handle-thunk":55,"../vnode/is-thunk":56,"../vnode/is-vnode":58,"../vnode/is-vtext":59,"../vnode/is-widget":60,"../vnode/vpatch":63,"./diff-props":65,"x-is-array":40}],67:[function(require,module,exports){
var ns = 'http://www.w3.org/2000/svg';
var hsvg = require('virtual-dom/virtual-hyperscript/svg');
var has = require('has');
var isarray = require('isarray');
var xtend = require('xtend');

module.exports = function (name, props, children) {
    if (name.toUpperCase() === 'SVG' && !has(props, 'xmlns')) {
        if (typeof props === 'string') {
            children = [ props ];
            props = {};
        }
        else if (isarray(props)) {
            children = props;
            props = {};
        }
        return hsvg(name, xtend({ xmlns: ns }, props), children);
    }
    else return hsvg(name, props, children);
};

},{"has":68,"isarray":69,"virtual-dom/virtual-hyperscript/svg":54,"xtend":70}],68:[function(require,module,exports){
var hasOwn = Object.prototype.hasOwnProperty;


module.exports = function has(obj, property) {
  return hasOwn.call(obj, property);
};

},{}],69:[function(require,module,exports){
module.exports = Array.isArray || function (arr) {
  return Object.prototype.toString.call(arr) == '[object Array]';
};

},{}],70:[function(require,module,exports){
module.exports = extend

function extend() {
    var target = {}

    for (var i = 0; i < arguments.length; i++) {
        var source = arguments[i]

        for (var key in source) {
            if (source.hasOwnProperty(key)) {
                target[key] = source[key]
            }
        }
    }

    return target
}

},{}],71:[function(require,module,exports){
var EventEmitter = require('events').EventEmitter
var indexArray = require('index-array')
var xtend = require('xtend')
var inherits = require('inherits')
var random = require('randomjs')

module.exports = Flowgraph

function Flowgraph () {
  EventEmitter.call(this)
  this.nodes = []
  this.edges = []
  this.connector = {
    active: false,
    from: {},
    to: {}
  }
}

inherits(Flowgraph, EventEmitter)

Flowgraph.prototype.addNode = function (node, inports, outports) {
  if (typeof inports === 'string') inports = [inports]
  if (typeof outports === 'string') outports = [outports]

  var options = {
    id: random('[a-z][a-z0-9_]{16}'),
    x: 0,
    y: 0,
    inports: inports || ['in'],
    outports: outports || ['out']
  }
  if (typeof node === 'string') options.id = node
  else options = xtend(options, node)

  if (!/^[a-z][a-z0-9_]*$/.test(options.id)) throw (new Error('ID can only be [a-z][a-z0-9_]+'))
  if (this.getNode(options.id)) throw (new Error('Node ID already exists'))

  this.nodes.push(options)
  this.emit('node-added', options)
  return options
}

Flowgraph.prototype.addNodes = function (nodes) {
  nodes.forEach(this.addNode.bind(this))
}

Flowgraph.prototype.getInports = function (node) {
  return this.getNode(node).inports || []
}

Flowgraph.prototype.getOutports = function (node) {
  return this.getNode(node).outports || []
}

Flowgraph.prototype.deleteNode = function (id) {
  var removedEdges = []
  this.edges = this.edges.filter(function (edge) {
    if (edge.source.id === id || edge.target.id === id) {
      removedEdges.push(edge)
      return false
    }
    return true
  })
  removedEdges.forEach(function (edge) {
    this.emit('edge-deleted', edge)
  }.bind(this))

  var deletedNode = null
  this.nodes = this.nodes.filter(function (node) {
    if (node.id === id) deletedNode = node
    else return true
  })
  if (deletedNode) this.emit('node-deleted', deletedNode)
}

Flowgraph.prototype.connect = function (source, target, sourcePort, targetPort) {
  if (!sourcePort) sourcePort = this.defaultOutport(source)
  if (!targetPort) targetPort = this.defaultInport(target)

  var edge = {
    source: {id: source, port: sourcePort},
    target: {id: target, port: targetPort}
  }
  this.edges.push(edge)
  this.emit('edge-added', edge)
}

Flowgraph.prototype.disconnect = function (source, target, sourcePort, targetPort) {
  var removedEdge = null

  this.edges = this.edges.filter(function (edge) {
    if (edge.source.port !== sourcePort || edge.target.port !== targetPort) return true
    if (edge.source.id === source && edge.target.id === target) removedEdge = edge
    else return true
  })
  if (removedEdge) this.emit('edge-deleted', removedEdge)
}

Flowgraph.prototype.getEdges = function () {
  return this.edges
}

Flowgraph.prototype.getEdge = function (source, target, sourcePort, targetPort) {
  if (!sourcePort) sourcePort = this.defaultOutport(source)
  if (!targetPort) targetPort = this.defaultInport(target)

  return this.edges.filter(function (edge) {
    return edge.source.id === source &&
          edge.source.port === sourcePort &&
          edge.target.id === target &&
          edge.target.port === targetPort
  })[0]
}

Flowgraph.prototype.defaultOutport = function (node) {
  var outports = this.getNode(node).outports
  return outports.length === 1 ? outports[0] : false
}

Flowgraph.prototype.defaultInport = function (node) {
  var inports = this.getNode(node).inports
  return inports.length === 1 ? inports[0] : false
}

Flowgraph.prototype.getNode = function (id) {
  return indexArray(this.nodes, 'id')[id]
}

Flowgraph.prototype.getNodes = function () {
  return this.nodes
}

Flowgraph.prototype.export = function () {
  return {nodes: this.nodes, edges: this.edges}
}

Flowgraph.prototype.toJSON = function () {
  return JSON.stringify(this.export())
}

Flowgraph.prototype.import = function (graph) {
  if (typeof graph === 'string') graph = JSON.parse(graph)
  // TODO: Validate import
  this.nodes = graph.nodes
  this.edges = graph.edges
}

},{"events":10,"index-array":72,"inherits":73,"randomjs":74,"xtend":82}],72:[function(require,module,exports){
'use strict'

module.exports = function (array, key) {
  if (!array || !key) return {}
  var object = {}
  for (var i = 0, length = array.length; i < length; ++i) {
    if (array[i][key] === undefined || array[i][key] === null) break
    object[array[i][key]] = array[i]
  }
  return object
}

},{}],73:[function(require,module,exports){
arguments[4][31][0].apply(exports,arguments)
},{"dup":31}],74:[function(require,module,exports){
var randexp = require('randexp').randexp;

module.exports = function(pattern, attributes) {
  return randexp(pattern, attributes);
}
},{"randexp":75}],75:[function(require,module,exports){
var ret = require('ret');
var DRange = require('discontinuous-range');
var types = ret.types;


/**
 * If code is alphabetic, converts to other case.
 * If not alphabetic, returns back code.
 *
 * @param {Number} code
 * @return {Number}
 */
function toOtherCase(code) {
  return code + (97 <= code && code <= 122 ? -32 :
                 65 <= code && code <= 90  ?  32 : 0);
}


/**
 * Randomly returns a true or false value.
 *
 * @return {Boolean}
 */
function randBool() {
  return !this.randInt(0, 1);
};


/**
 * Randomly selects and returns a value from the array.
 *
 * @param {Array.<Object>} arr
 * @return {Object}
 */
function randSelect(arr) {
  if (arr instanceof DRange) {
    return arr.index(this.randInt(0, arr.length - 1));
  }
  return arr[this.randInt(0, arr.length - 1)];
};


/**
 * Determines if a character code is alphabetic and decide
 * to switch case randomly.
 *
 * @param {Number} code
 * @param {Boolean} ignoreCase
 * @return {String}
 */
function char(code, ignoreCase) {
  code = ignoreCase && randBool.call(this) ? toOtherCase(code) : code;
  return String.fromCharCode(code);
};


/**
 * expands a token to a DiscontinuousRange of characters which has a 
 * length and an index function (for random selecting)
 *
 * @param {Object} token
 * @return {DiscontinuousRange}
 */
function expand(token) {
  if (token.type === ret.types.CHAR) return new DRange(token.value);
  if (token.type === ret.types.RANGE) return new DRange(token.from, token.to);
  if (token.type === ret.types.SET) {
    var drange = new DRange();
    for (var i = 0; i < token.set.length; i++) {
      drange.add(expand.call(this, token.set[i]));
    }
    if (token.not) {
      return this.defaultRange.clone().subtract(drange);
    } else {
      return drange;
    }
  }
  throw new Error('unexpandable token type: ' + token.type);
};


/**
 * @constructor
 * @param {RegExp|String} regexp
 * @param {String} m
 */
var RandExp = module.exports = function(regexp, m) {
  this.defaultRange = this.defaultRange.clone();
  if (regexp instanceof RegExp) {
    this.ignoreCase = regexp.ignoreCase;
    this.multiline = regexp.multiline;
    if (typeof regexp.max === 'number') {
      this.max = regexp.max;
    }
    regexp = regexp.source;

  } else if (typeof regexp === 'string') {
    this.ignoreCase = m && m.indexOf('i') !== -1;
    this.multiline = m && m.indexOf('m') !== -1;
  } else {
    throw new Error('Expected a regexp or string');
  }

  this.tokens = ret(regexp);
};


// When a repetitional token has its max set to Infinite,
// randexp won't actually generate a random amount between min and Infinite
// instead it will see Infinite as min + 100.
RandExp.prototype.max = 100;


// Generates the random string.
RandExp.prototype.gen = function() {
  return gen.call(this, this.tokens, []);
};


// Enables use of randexp with a shorter call.
RandExp.randexp = function(regexp, m) {
  var randexp;

  if (regexp._randexp === undefined) {
    randexp = new RandExp(regexp, m);
    regexp._randexp = randexp;
  } else {
    randexp = regexp._randexp;
    if (typeof regexp.max === 'number') {
      randexp.max = regexp.max;
    }
    if (regexp.defaultRange instanceof DRange) {
      randexp.defaultRange = regexp.defaultRange;
    }
    if (typeof regexp.randInt === 'function') {
      randexp.randInt = regexp.randInt;
    }
  }

  return randexp.gen();
};


// This enables sugary /regexp/.gen syntax.
RandExp.sugar = function() {
  /* jshint freeze:false */
  RegExp.prototype.gen = function() {
    return RandExp.randexp(this);
  };
};

// This allows expanding to include additional characters
// for instance: RandExp.defaultRange.add(0, 65535);
RandExp.prototype.defaultRange = new DRange(32, 126);






/**
 * Randomly generates and returns a number between a and b (inclusive).
 *
 * @param {Number} a
 * @param {Number} b
 * @return {Number}
 */
RandExp.prototype.randInt = function(a, b) {
  return a + Math.floor(Math.random() * (1 + b - a));
};


/**
 * Generate random string modeled after given tokens.
 *
 * @param {Object} token
 * @param {Array.<String>} groups
 * @return {String}
 */
function gen(token, groups) {
  var stack, str, n, i, l;

  switch (token.type) {


    case types.ROOT:
    case types.GROUP:
      if (token.notFollowedBy) { return ''; }

      // Insert placeholder until group string is generated.
      if (token.remember && token.groupNumber === undefined) {
        token.groupNumber = groups.push(null) - 1;
      }

      stack = token.options ? randSelect.call(this, token.options) : token.stack;

      str = '';
      for (i = 0, l = stack.length; i < l; i++) {
        str += gen.call(this, stack[i], groups);
      }

      if (token.remember) {
        groups[token.groupNumber] = str;
      }
      return str;


    case types.POSITION:
      // Do nothing for now.
      return '';


    case types.SET:

      var expanded_set = expand.call(this, token);
      if (!expanded_set.length) return '';
      return char.call(this, randSelect.call(this, expanded_set), this.ignoreCase);

    case types.RANGE:
      return char.call(this, this.randInt(token.from, token.to), this.ignoreCase);


    case types.REPETITION:
      // Randomly generate number between min and max.
      n = this.randInt(token.min,
              token.max === Infinity ? token.min + this.max : token.max);

      str = '';
      for (i = 0; i < n; i++) {
        str += gen.call(this, token.value, groups);
      }

      return str;


    case types.REFERENCE:
      return groups[token.value - 1] || '';


    case types.CHAR:
      return char.call(this, token.value, this.ignoreCase);
  }
}



},{"discontinuous-range":76,"ret":77}],76:[function(require,module,exports){
//protected helper class
function _SubRange(low, high) {
    this.low = low;
    this.high = high;
    this.length = 1 + high - low;
}

_SubRange.prototype.overlaps = function (range) {
    return !(this.high < range.low || this.low > range.high);
};

_SubRange.prototype.touches = function (range) {
    return !(this.high + 1 < range.low || this.low - 1 > range.high);
};

//returns inclusive combination of _SubRanges as a _SubRange
_SubRange.prototype.add = function (range) {
    return this.touches(range) && new _SubRange(Math.min(this.low, range.low), Math.max(this.high, range.high));
};

//returns subtraction of _SubRanges as an array of _SubRanges (there's a case where subtraction divides it in 2)
_SubRange.prototype.subtract = function (range) {
    if (!this.overlaps(range)) return false;
    if (range.low <= this.low && range.high >= this.high) return [];
    if (range.low > this.low && range.high < this.high) return [new _SubRange(this.low, range.low - 1), new _SubRange(range.high + 1, this.high)];
    if (range.low <= this.low) return [new _SubRange(range.high + 1, this.high)];
    return [new _SubRange(this.low, range.low - 1)];
};

_SubRange.prototype.toString = function () {
    if (this.low == this.high) return this.low.toString();
    return this.low + '-' + this.high;
};

_SubRange.prototype.clone = function () {
    return new _SubRange(this.low, this.high);
};




function DiscontinuousRange(a, b) {
    if (this instanceof DiscontinuousRange) {
        this.ranges = [];
        this.length = 0;
        if (a !== undefined) this.add(a, b);
    } else {
        return new DiscontinuousRange(a, b);
    }
}

function _update_length(self) {
    self.length = self.ranges.reduce(function (previous, range) {return previous + range.length}, 0);
}

DiscontinuousRange.prototype.add = function (a, b) {
    var self = this;
    function _add(subrange) {
        var new_ranges = [];
        var i = 0;
        while (i < self.ranges.length && !subrange.touches(self.ranges[i])) {
            new_ranges.push(self.ranges[i].clone());
            i++;
        }
        while (i < self.ranges.length && subrange.touches(self.ranges[i])) {
            subrange = subrange.add(self.ranges[i]);
            i++;
        }
        new_ranges.push(subrange);
        while (i < self.ranges.length) {
            new_ranges.push(self.ranges[i].clone());
            i++;
        }
        self.ranges = new_ranges;
        _update_length(self);
    }

    if (a instanceof DiscontinuousRange) {
        a.ranges.forEach(_add);
    } else {
        if (a instanceof _SubRange) {
            _add(a);
        } else {
            if (b === undefined) b = a;
            _add(new _SubRange(a, b));
        }
    }
    return this;
};

DiscontinuousRange.prototype.subtract = function (a, b) {
    var self = this;
    function _subtract(subrange) {
        var new_ranges = [];
        var i = 0;
        while (i < self.ranges.length && !subrange.overlaps(self.ranges[i])) {
            new_ranges.push(self.ranges[i].clone());
            i++;
        }
        while (i < self.ranges.length && subrange.overlaps(self.ranges[i])) {
            new_ranges = new_ranges.concat(self.ranges[i].subtract(subrange));
            i++;
        }
        while (i < self.ranges.length) {
            new_ranges.push(self.ranges[i].clone());
            i++;
        }
        self.ranges = new_ranges;
        _update_length(self);
    }
    if (a instanceof DiscontinuousRange) {
        a.ranges.forEach(_subtract);
    } else {
        if (a instanceof _SubRange) {
            _subtract(a);
        } else {
            if (b === undefined) b = a;
            _subtract(new _SubRange(a, b));
        }
    }
    return this;
};


DiscontinuousRange.prototype.index = function (index) {
    var i = 0;
    while (i < this.ranges.length && this.ranges[i].length <= index) {
        index -= this.ranges[i].length;
        i++;
    }
    if (i >= this.ranges.length) return null;
    return this.ranges[i].low + index;
};


DiscontinuousRange.prototype.toString = function () {
    return '[ ' + this.ranges.join(', ') + ' ]'
};

DiscontinuousRange.prototype.clone = function () {
    return new DiscontinuousRange(this);
};

module.exports = DiscontinuousRange;

},{}],77:[function(require,module,exports){
var util      = require('./util');
var types     = require('./types');
var sets      = require('./sets');
var positions = require('./positions');


module.exports = function(regexpStr) {
  var i = 0, l, c,
      start = { type: types.ROOT, stack: []},

      // Keep track of last clause/group and stack.
      lastGroup = start,
      last = start.stack,
      groupStack = [];


  var repeatErr = function(i) {
    util.error(regexpStr, 'Nothing to repeat at column ' + (i - 1));
  };

  // Decode a few escaped characters.
  var str = util.strToChars(regexpStr);
  l = str.length;

  // Iterate through each character in string.
  while (i < l) {
    c = str[i++];

    switch (c) {
      // Handle escaped characters, inclues a few sets.
      case '\\':
        c = str[i++];

        switch (c) {
          case 'b':
            last.push(positions.wordBoundary());
            break;

          case 'B':
            last.push(positions.nonWordBoundary());
            break;

          case 'w':
            last.push(sets.words());
            break;

          case 'W':
            last.push(sets.notWords());
            break;

          case 'd':
            last.push(sets.ints());
            break;

          case 'D':
            last.push(sets.notInts());
            break;

          case 's':
            last.push(sets.whitespace());
            break;

          case 'S':
            last.push(sets.notWhitespace());
            break;

          default:
            // Check if c is integer.
            // In which case it's a reference.
            if (/\d/.test(c)) {
              last.push({ type: types.REFERENCE, value: parseInt(c, 10) });

            // Escaped character.
            } else {
              last.push({ type: types.CHAR, value: c.charCodeAt(0) });
            }
        }

        break;


      // Positionals.
      case '^':
          last.push(positions.begin());
        break;

      case '$':
          last.push(positions.end());
        break;


      // Handle custom sets.
      case '[':
        // Check if this class is 'anti' i.e. [^abc].
        var not;
        if (str[i] === '^') {
          not = true;
          i++;
        } else {
          not = false;
        }

        // Get all the characters in class.
        var classTokens = util.tokenizeClass(str.slice(i), regexpStr);

        // Increase index by length of class.
        i += classTokens[1];
        last.push({
            type: types.SET
          , set: classTokens[0]
          , not: not
        });

        break;


      // Class of any character except \n.
      case '.':
        last.push(sets.anyChar());
        break;


      // Push group onto stack.
      case '(':
        // Create group.
        var group = {
            type: types.GROUP
          , stack: []
          , remember: true
        };

        c = str[i];

        // if if this is a special kind of group.
        if (c === '?') {
          c = str[i + 1];
          i += 2;

          // Match if followed by.
          if (c === '=') {
            group.followedBy = true;

          // Match if not followed by.
          } else if (c === '!') {
            group.notFollowedBy = true;

          } else if (c !== ':') {
            util.error(regexpStr,
                'Invalid group, character \'' + c + '\' after \'?\' at column ' +
                (i - 1));
          }

          group.remember = false;
        }

        // Insert subgroup into current group stack.
        last.push(group);

        // Remember the current group for when the group closes.
        groupStack.push(lastGroup);

        // Make this new group the current group.
        lastGroup = group;
        last = group.stack;
        break;


      // Pop group out of stack.
      case ')':
        if (groupStack.length === 0) {
          util.error(regexpStr, 'Unmatched ) at column ' + (i - 1));
        }
        lastGroup = groupStack.pop();

        // Check if this group has a PIPE.
        // To get back the correct last stack.
        last = lastGroup.options ? lastGroup.options[lastGroup.options.length - 1] : lastGroup.stack;
        break;


      // Use pipe character to give more choices.
      case '|':
        // Create array where options are if this is the first PIPE
        // in this clause.
        if (!lastGroup.options) {
          lastGroup.options = [lastGroup.stack];
          delete lastGroup.stack;
        }

        // Create a new stack and add to options for rest of clause.
        var stack = [];
        lastGroup.options.push(stack);
        last = stack;
        break;


      // Repetition.
      // For every repetition, remove last element from last stack
      // then insert back a RANGE object.
      // This design is chosen because there could be more than
      // one repetition symbols in a regex i.e. `a?+{2,3}`.
      case '{':
        var rs = /^(\d+)(,(\d+)?)?\}/.exec(str.slice(i)), min, max;
        if (rs !== null) {
          min = parseInt(rs[1], 10);
          max = rs[2] ? rs[3] ? parseInt(rs[3], 10) : Infinity : min;
          i += rs[0].length;

          last.push({
              type: types.REPETITION
            , min: min
            , max: max
            , value: last.pop()
          });
        } else {
          last.push({
              type: types.CHAR
            , value: 123
          });
        }
        break;

      case '?':
        if (last.length === 0) {
          repeatErr(i);
        }
        last.push({
            type: types.REPETITION
          , min: 0
          , max: 1
          , value: last.pop()
        });
        break;

      case '+':
        if (last.length === 0) {
          repeatErr(i);
        }
        last.push({
            type: types.REPETITION
          , min: 1
          , max: Infinity
          , value: last.pop()
        });
        break;

      case '*':
        if (last.length === 0) {
          repeatErr(i);
        }
        last.push({
            type: types.REPETITION
          , min: 0
          , max: Infinity
          , value: last.pop()
        });
        break;


      // Default is a character that is not `\[](){}?+*^$`.
      default:
        last.push({
            type: types.CHAR
          , value: c.charCodeAt(0)
        });
    }

  }

  // Check if any groups have not been closed.
  if (groupStack.length !== 0) {
    util.error(regexpStr, 'Unterminated group');
  }

  return start;
};

module.exports.types = types;

},{"./positions":78,"./sets":79,"./types":80,"./util":81}],78:[function(require,module,exports){
var types = require('./types');

exports.wordBoundary = function() {
  return { type: types.POSITION, value: 'b' };
};

exports.nonWordBoundary = function() {
  return { type: types.POSITION, value: 'B' };
};

exports.begin = function() {
  return { type: types.POSITION, value: '^' };
};

exports.end = function() {
  return { type: types.POSITION, value: '$' };
};

},{"./types":80}],79:[function(require,module,exports){
var types = require('./types');

var INTS = function() {
 return [{ type: types.RANGE , from: 48, to: 57 }];
};

var WORDS = function() {
 return [
      { type: types.CHAR, value: 95 }
    , { type: types.RANGE, from: 97, to: 122 }
    , { type: types.RANGE, from: 65, to: 90 }
  ].concat(INTS());
};

var WHITESPACE = function() {
 return [
      { type: types.CHAR, value: 9 }
    , { type: types.CHAR, value: 10 }
    , { type: types.CHAR, value: 11 }
    , { type: types.CHAR, value: 12 }
    , { type: types.CHAR, value: 13 }
    , { type: types.CHAR, value: 32 }
    , { type: types.CHAR, value: 160 }
    , { type: types.CHAR, value: 5760 }
    , { type: types.CHAR, value: 6158 }
    , { type: types.CHAR, value: 8192 }
    , { type: types.CHAR, value: 8193 }
    , { type: types.CHAR, value: 8194 }
    , { type: types.CHAR, value: 8195 }
    , { type: types.CHAR, value: 8196 }
    , { type: types.CHAR, value: 8197 }
    , { type: types.CHAR, value: 8198 }
    , { type: types.CHAR, value: 8199 }
    , { type: types.CHAR, value: 8200 }
    , { type: types.CHAR, value: 8201 }
    , { type: types.CHAR, value: 8202 }
    , { type: types.CHAR, value: 8232 }
    , { type: types.CHAR, value: 8233 }
    , { type: types.CHAR, value: 8239 }
    , { type: types.CHAR, value: 8287 }
    , { type: types.CHAR, value: 12288 }
    , { type: types.CHAR, value: 65279 }
  ];
};

var NOTANYCHAR = function() {
 return [
      { type: types.CHAR, value: 10 }
    , { type: types.CHAR, value: 13 }
    , { type: types.CHAR, value: 8232 }
    , { type: types.CHAR, value: 8233 }
  ];
};

// predefined class objects
exports.words = function() {
  return { type: types.SET, set: WORDS(), not: false };
};

exports.notWords = function() {
  return { type: types.SET, set: WORDS(), not: true };
};

exports.ints = function() {
  return { type: types.SET, set: INTS(), not: false };
};

exports.notInts = function() {
  return { type: types.SET, set: INTS(), not: true };
};

exports.whitespace = function() {
  return { type: types.SET, set: WHITESPACE(), not: false };
};

exports.notWhitespace = function() {
  return { type: types.SET, set: WHITESPACE(), not: true };
};

exports.anyChar = function() {
  return { type: types.SET, set: NOTANYCHAR(), not: true };
};

},{"./types":80}],80:[function(require,module,exports){
module.exports = {
    ROOT       : 0
  , GROUP      : 1
  , POSITION   : 2
  , SET        : 3
  , RANGE      : 4
  , REPETITION : 5
  , REFERENCE  : 6
  , CHAR       : 7
};

},{}],81:[function(require,module,exports){
var types = require('./types');
var sets  = require('./sets');


// All of these are private and only used by randexp.
// It's assumed that they will always be called with the correct input.

var CTRL = '@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^ ?';
var SLSH = { '0': 0, 't': 9, 'n': 10, 'v': 11, 'f': 12, 'r': 13 };

/**
 * Finds character representations in str and convert all to
 * their respective characters
 *
 * @param {String} str
 * @return {String}
 */
exports.strToChars = function(str) {
  var chars_regex = /(\[\\b\])|\\(?:u([A-F0-9]{4})|x([A-F0-9]{2})|(0?[0-7]{2})|c([@A-Z\[\\\]\^?])|([0tnvfr]))/g;
  str = str.replace(chars_regex, function(s, b, a16, b16, c8, dctrl, eslsh) {
    var code = b     ? 8 :
               a16   ? parseInt(a16, 16) :
               b16   ? parseInt(b16, 16) :
               c8    ? parseInt(c8,   8) :
               dctrl ? CTRL.indexOf(dctrl) :
               eslsh ? SLSH[eslsh] : undefined;
    
    var c = String.fromCharCode(code);

    // Escape special regex characters.
    if (/[\[\]{}\^$.|?*+()]/.test(c)) {
      c = '\\' + c;
    }

    return c;
  });

  return str;
};


/**
 * turns class into tokens
 * reads str until it encounters a ] not preceeded by a \
 *
 * @param {String} str
 * @param {String} regexpStr
 * @return {Array.<Array.<Object>, Number>}
 */
exports.tokenizeClass = function(str, regexpStr) {
  var tokens = []
    , regexp = /\\(?:(w)|(d)|(s)|(W)|(D)|(S))|((?:(?:\\)(.)|([^\]\\]))-(?:\\)?([^\]]))|(\])|(?:\\)?(.)/g
    , rs, c
    ;


  while ((rs = regexp.exec(str)) != null) {
    if (rs[1]) {
      tokens.push(sets.words());

    } else if (rs[2]) {
      tokens.push(sets.ints());

    } else if (rs[3]) {
      tokens.push(sets.whitespace());

    } else if (rs[4]) {
      tokens.push(sets.notWords());

    } else if (rs[5]) {
      tokens.push(sets.notInts());

    } else if (rs[6]) {
      tokens.push(sets.notWhitespace());

    } else if (rs[7]) {
      tokens.push({
          type: types.RANGE
        , from: (rs[8] || rs[9]).charCodeAt(0)
        ,   to: rs[10].charCodeAt(0)
      });

    } else if (c = rs[12]) {
      tokens.push({
          type: types.CHAR
        , value: c.charCodeAt(0)
      });

    } else {
      return [tokens, regexp.lastIndex];
    }
  }

  exports.error(regexpStr, 'Unterminated character class');
};


/**
 * Shortcut to throw errors.
 *
 * @param {String} regexp
 * @param {String} msg
 */
exports.error = function(regexp, msg) {
  throw new SyntaxError('Invalid regular expression: /' + regexp + '/: ' + msg);
};

},{"./sets":79,"./types":80}],82:[function(require,module,exports){
arguments[4][70][0].apply(exports,arguments)
},{"dup":70}],83:[function(require,module,exports){
// getUserMedia helper by @HenrikJoreteg
var func = (window.navigator.getUserMedia ||
            window.navigator.webkitGetUserMedia ||
            window.navigator.mozGetUserMedia ||
            window.navigator.msGetUserMedia);


module.exports = function (constraints, cb) {
    var options;
    var haveOpts = arguments.length === 2;
    var defaultOpts = {video: true, audio: true};
    var error;
    var denied = 'PermissionDeniedError';
    var notSatified = 'ConstraintNotSatisfiedError';

    // make constraints optional
    if (!haveOpts) {
        cb = constraints;
        constraints = defaultOpts;
    }

    // treat lack of browser support like an error
    if (!func) {
        // throw proper error per spec
        error = new Error('MediaStreamError');
        error.name = 'NotSupportedError';
        return cb(error);
    }

    func.call(window.navigator, constraints, function (stream) {
        cb(null, stream);
    }, function (err) {
        var error;
        // coerce into an error object since FF gives us a string
        // there are only two valid names according to the spec
        // we coerce all non-denied to "constraint not satisfied".
        if (typeof err === 'string') {
            error = new Error('MediaStreamError');
            if (err === denied) {
                error.name = denied;
            } else {
                error.name = notSatified;
            }
        } else {
            // if we get an error object make sure '.name' property is set
            // according to spec: http://dev.w3.org/2011/webrtc/editor/getusermedia.html#navigatorusermediaerror-and-navigatorusermediaerrorcallback
            error = err;
            if (!error.name) {
                // this is likely chrome which
                // sets a property called "ERROR_DENIED" on the error object
                // if so we make sure to set a name
                if (error[denied]) {
                    err.name = denied;
                } else {
                    err.name = notSatified;
                }
            }
        }

        cb(error);
    });
};

},{}],84:[function(require,module,exports){
'use strict'

module.exports = function (array, key, config) {
  var keepInArray = config && config.keepInArray
  if (!array || !key) return {}
  var object = {}
  for (var i = 0, length = array.length; i < length; ++i) {
    if (array[i][key] === undefined || array[i][key] === null) break
    if (!object[array[i][key]]) {
      if (keepInArray) object[array[i][key]] = [array[i]]
      else object[array[i][key]] = array[i]
    } else if (!Array.isArray(object[array[i][key]])) {
      object[array[i][key]] = [object[array[i][key]]]
      object[array[i][key]].push(array[i])
    } else {
      object[array[i][key]].push(array[i])
    }

  }
  return object
}

},{}],85:[function(require,module,exports){
arguments[4][31][0].apply(exports,arguments)
},{"dup":31}],86:[function(require,module,exports){
var inserted = {};

module.exports = function (css, options) {
    if (inserted[css]) return;
    inserted[css] = true;
    
    var elem = document.createElement('style');
    elem.setAttribute('type', 'text/css');

    if ('textContent' in elem) {
      elem.textContent = css;
    } else {
      elem.styleSheet.cssText = css;
    }
    
    var head = document.getElementsByTagName('head')[0];
    if (options && options.prepend) {
        head.insertBefore(elem, head.childNodes[0]);
    } else {
        head.appendChild(elem);
    }
};

},{}],87:[function(require,module,exports){
/**
 * lodash 3.0.0 (Custom Build) <https://lodash.com/>
 * Build: `lodash modern modularize exports="npm" -o ./`
 * Copyright 2012-2015 The Dojo Foundation <http://dojofoundation.org/>
 * Based on Underscore.js 1.7.0 <http://underscorejs.org/LICENSE>
 * Copyright 2009-2015 Jeremy Ashkenas, DocumentCloud and Investigative Reporters & Editors
 * Available under MIT license <https://lodash.com/license>
 */
var baseToString = require('lodash._basetostring');

/**
 * Capitalizes the first character of `string`.
 *
 * @static
 * @memberOf _
 * @category String
 * @param {string} [string=''] The string to capitalize.
 * @returns {string} Returns the capitalized string.
 * @example
 *
 * _.capitalize('fred');
 * // => 'Fred'
 */
function capitalize(string) {
  string = baseToString(string);
  return string && (string.charAt(0).toUpperCase() + string.slice(1));
}

module.exports = capitalize;

},{"lodash._basetostring":88}],88:[function(require,module,exports){
/**
 * lodash 3.0.1 (Custom Build) <https://lodash.com/>
 * Build: `lodash modern modularize exports="npm" -o ./`
 * Copyright 2012-2015 The Dojo Foundation <http://dojofoundation.org/>
 * Based on Underscore.js 1.8.3 <http://underscorejs.org/LICENSE>
 * Copyright 2009-2015 Jeremy Ashkenas, DocumentCloud and Investigative Reporters & Editors
 * Available under MIT license <https://lodash.com/license>
 */

/**
 * Converts `value` to a string if it's not one. An empty string is returned
 * for `null` or `undefined` values.
 *
 * @private
 * @param {*} value The value to process.
 * @returns {string} Returns the string.
 */
function baseToString(value) {
  return value == null ? '' : (value + '');
}

module.exports = baseToString;

},{}],89:[function(require,module,exports){
/**
 * lodash 3.0.0 (Custom Build) <https://lodash.com/>
 * Build: `lodash modern modularize exports="npm" -o ./`
 * Copyright 2012-2015 The Dojo Foundation <http://dojofoundation.org/>
 * Based on Underscore.js 1.7.0 <http://underscorejs.org/LICENSE>
 * Copyright 2009-2015 Jeremy Ashkenas, DocumentCloud and Investigative Reporters & Editors
 * Available under MIT license <https://lodash.com/license>
 */
var baseValues = require('lodash._basevalues'),
    keys = require('lodash.keys');

/**
 * Creates an array of the own enumerable property values of `object`.
 *
 * **Note:** Non-object values are coerced to objects.
 *
 * @static
 * @memberOf _
 * @category Object
 * @param {Object} object The object to query.
 * @returns {Array} Returns the array of property values.
 * @example
 *
 * function Foo() {
 *   this.a = 1;
 *   this.b = 2;
 * }
 *
 * Foo.prototype.c = 3;
 *
 * _.values(new Foo);
 * // => [1, 2] (iteration order is not guaranteed)
 *
 * _.values('hi');
 * // => ['h', 'i']
 */
function values(object) {
  return baseValues(object, keys(object));
}

module.exports = values;

},{"lodash._basevalues":90,"lodash.keys":91}],90:[function(require,module,exports){
/**
 * lodash 3.0.0 (Custom Build) <https://lodash.com/>
 * Build: `lodash modern modularize exports="npm" -o ./`
 * Copyright 2012-2015 The Dojo Foundation <http://dojofoundation.org/>
 * Based on Underscore.js 1.7.0 <http://underscorejs.org/LICENSE>
 * Copyright 2009-2015 Jeremy Ashkenas, DocumentCloud and Investigative Reporters & Editors
 * Available under MIT license <https://lodash.com/license>
 */

/**
 * The base implementation of `_.values` and `_.valuesIn` which creates an
 * array of `object` property values corresponding to the property names
 * returned by `keysFunc`.
 *
 * @private
 * @param {Object} object The object to query.
 * @param {Array} props The property names to get values for.
 * @returns {Object} Returns the array of property values.
 */
function baseValues(object, props) {
  var index = -1,
      length = props.length,
      result = Array(length);

  while (++index < length) {
    result[index] = object[props[index]];
  }
  return result;
}

module.exports = baseValues;

},{}],91:[function(require,module,exports){
/**
 * lodash 3.1.2 (Custom Build) <https://lodash.com/>
 * Build: `lodash modern modularize exports="npm" -o ./`
 * Copyright 2012-2015 The Dojo Foundation <http://dojofoundation.org/>
 * Based on Underscore.js 1.8.3 <http://underscorejs.org/LICENSE>
 * Copyright 2009-2015 Jeremy Ashkenas, DocumentCloud and Investigative Reporters & Editors
 * Available under MIT license <https://lodash.com/license>
 */
var getNative = require('lodash._getnative'),
    isArguments = require('lodash.isarguments'),
    isArray = require('lodash.isarray');

/** Used to detect unsigned integer values. */
var reIsUint = /^\d+$/;

/** Used for native method references. */
var objectProto = Object.prototype;

/** Used to check objects for own properties. */
var hasOwnProperty = objectProto.hasOwnProperty;

/* Native method references for those with the same name as other `lodash` methods. */
var nativeKeys = getNative(Object, 'keys');

/**
 * Used as the [maximum length](http://ecma-international.org/ecma-262/6.0/#sec-number.max_safe_integer)
 * of an array-like value.
 */
var MAX_SAFE_INTEGER = 9007199254740991;

/**
 * The base implementation of `_.property` without support for deep paths.
 *
 * @private
 * @param {string} key The key of the property to get.
 * @returns {Function} Returns the new function.
 */
function baseProperty(key) {
  return function(object) {
    return object == null ? undefined : object[key];
  };
}

/**
 * Gets the "length" property value of `object`.
 *
 * **Note:** This function is used to avoid a [JIT bug](https://bugs.webkit.org/show_bug.cgi?id=142792)
 * that affects Safari on at least iOS 8.1-8.3 ARM64.
 *
 * @private
 * @param {Object} object The object to query.
 * @returns {*} Returns the "length" value.
 */
var getLength = baseProperty('length');

/**
 * Checks if `value` is array-like.
 *
 * @private
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is array-like, else `false`.
 */
function isArrayLike(value) {
  return value != null && isLength(getLength(value));
}

/**
 * Checks if `value` is a valid array-like index.
 *
 * @private
 * @param {*} value The value to check.
 * @param {number} [length=MAX_SAFE_INTEGER] The upper bounds of a valid index.
 * @returns {boolean} Returns `true` if `value` is a valid index, else `false`.
 */
function isIndex(value, length) {
  value = (typeof value == 'number' || reIsUint.test(value)) ? +value : -1;
  length = length == null ? MAX_SAFE_INTEGER : length;
  return value > -1 && value % 1 == 0 && value < length;
}

/**
 * Checks if `value` is a valid array-like length.
 *
 * **Note:** This function is based on [`ToLength`](http://ecma-international.org/ecma-262/6.0/#sec-tolength).
 *
 * @private
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is a valid length, else `false`.
 */
function isLength(value) {
  return typeof value == 'number' && value > -1 && value % 1 == 0 && value <= MAX_SAFE_INTEGER;
}

/**
 * A fallback implementation of `Object.keys` which creates an array of the
 * own enumerable property names of `object`.
 *
 * @private
 * @param {Object} object The object to query.
 * @returns {Array} Returns the array of property names.
 */
function shimKeys(object) {
  var props = keysIn(object),
      propsLength = props.length,
      length = propsLength && object.length;

  var allowIndexes = !!length && isLength(length) &&
    (isArray(object) || isArguments(object));

  var index = -1,
      result = [];

  while (++index < propsLength) {
    var key = props[index];
    if ((allowIndexes && isIndex(key, length)) || hasOwnProperty.call(object, key)) {
      result.push(key);
    }
  }
  return result;
}

/**
 * Checks if `value` is the [language type](https://es5.github.io/#x8) of `Object`.
 * (e.g. arrays, functions, objects, regexes, `new Number(0)`, and `new String('')`)
 *
 * @static
 * @memberOf _
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is an object, else `false`.
 * @example
 *
 * _.isObject({});
 * // => true
 *
 * _.isObject([1, 2, 3]);
 * // => true
 *
 * _.isObject(1);
 * // => false
 */
function isObject(value) {
  // Avoid a V8 JIT bug in Chrome 19-20.
  // See https://code.google.com/p/v8/issues/detail?id=2291 for more details.
  var type = typeof value;
  return !!value && (type == 'object' || type == 'function');
}

/**
 * Creates an array of the own enumerable property names of `object`.
 *
 * **Note:** Non-object values are coerced to objects. See the
 * [ES spec](http://ecma-international.org/ecma-262/6.0/#sec-object.keys)
 * for more details.
 *
 * @static
 * @memberOf _
 * @category Object
 * @param {Object} object The object to query.
 * @returns {Array} Returns the array of property names.
 * @example
 *
 * function Foo() {
 *   this.a = 1;
 *   this.b = 2;
 * }
 *
 * Foo.prototype.c = 3;
 *
 * _.keys(new Foo);
 * // => ['a', 'b'] (iteration order is not guaranteed)
 *
 * _.keys('hi');
 * // => ['0', '1']
 */
var keys = !nativeKeys ? shimKeys : function(object) {
  var Ctor = object == null ? undefined : object.constructor;
  if ((typeof Ctor == 'function' && Ctor.prototype === object) ||
      (typeof object != 'function' && isArrayLike(object))) {
    return shimKeys(object);
  }
  return isObject(object) ? nativeKeys(object) : [];
};

/**
 * Creates an array of the own and inherited enumerable property names of `object`.
 *
 * **Note:** Non-object values are coerced to objects.
 *
 * @static
 * @memberOf _
 * @category Object
 * @param {Object} object The object to query.
 * @returns {Array} Returns the array of property names.
 * @example
 *
 * function Foo() {
 *   this.a = 1;
 *   this.b = 2;
 * }
 *
 * Foo.prototype.c = 3;
 *
 * _.keysIn(new Foo);
 * // => ['a', 'b', 'c'] (iteration order is not guaranteed)
 */
function keysIn(object) {
  if (object == null) {
    return [];
  }
  if (!isObject(object)) {
    object = Object(object);
  }
  var length = object.length;
  length = (length && isLength(length) &&
    (isArray(object) || isArguments(object)) && length) || 0;

  var Ctor = object.constructor,
      index = -1,
      isProto = typeof Ctor == 'function' && Ctor.prototype === object,
      result = Array(length),
      skipIndexes = length > 0;

  while (++index < length) {
    result[index] = (index + '');
  }
  for (var key in object) {
    if (!(skipIndexes && isIndex(key, length)) &&
        !(key == 'constructor' && (isProto || !hasOwnProperty.call(object, key)))) {
      result.push(key);
    }
  }
  return result;
}

module.exports = keys;

},{"lodash._getnative":92,"lodash.isarguments":93,"lodash.isarray":94}],92:[function(require,module,exports){
/**
 * lodash 3.9.1 (Custom Build) <https://lodash.com/>
 * Build: `lodash modern modularize exports="npm" -o ./`
 * Copyright 2012-2015 The Dojo Foundation <http://dojofoundation.org/>
 * Based on Underscore.js 1.8.3 <http://underscorejs.org/LICENSE>
 * Copyright 2009-2015 Jeremy Ashkenas, DocumentCloud and Investigative Reporters & Editors
 * Available under MIT license <https://lodash.com/license>
 */

/** `Object#toString` result references. */
var funcTag = '[object Function]';

/** Used to detect host constructors (Safari > 5). */
var reIsHostCtor = /^\[object .+?Constructor\]$/;

/**
 * Checks if `value` is object-like.
 *
 * @private
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is object-like, else `false`.
 */
function isObjectLike(value) {
  return !!value && typeof value == 'object';
}

/** Used for native method references. */
var objectProto = Object.prototype;

/** Used to resolve the decompiled source of functions. */
var fnToString = Function.prototype.toString;

/** Used to check objects for own properties. */
var hasOwnProperty = objectProto.hasOwnProperty;

/**
 * Used to resolve the [`toStringTag`](http://ecma-international.org/ecma-262/6.0/#sec-object.prototype.tostring)
 * of values.
 */
var objToString = objectProto.toString;

/** Used to detect if a method is native. */
var reIsNative = RegExp('^' +
  fnToString.call(hasOwnProperty).replace(/[\\^$.*+?()[\]{}|]/g, '\\$&')
  .replace(/hasOwnProperty|(function).*?(?=\\\()| for .+?(?=\\\])/g, '$1.*?') + '$'
);

/**
 * Gets the native function at `key` of `object`.
 *
 * @private
 * @param {Object} object The object to query.
 * @param {string} key The key of the method to get.
 * @returns {*} Returns the function if it's native, else `undefined`.
 */
function getNative(object, key) {
  var value = object == null ? undefined : object[key];
  return isNative(value) ? value : undefined;
}

/**
 * Checks if `value` is classified as a `Function` object.
 *
 * @static
 * @memberOf _
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is correctly classified, else `false`.
 * @example
 *
 * _.isFunction(_);
 * // => true
 *
 * _.isFunction(/abc/);
 * // => false
 */
function isFunction(value) {
  // The use of `Object#toString` avoids issues with the `typeof` operator
  // in older versions of Chrome and Safari which return 'function' for regexes
  // and Safari 8 equivalents which return 'object' for typed array constructors.
  return isObject(value) && objToString.call(value) == funcTag;
}

/**
 * Checks if `value` is the [language type](https://es5.github.io/#x8) of `Object`.
 * (e.g. arrays, functions, objects, regexes, `new Number(0)`, and `new String('')`)
 *
 * @static
 * @memberOf _
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is an object, else `false`.
 * @example
 *
 * _.isObject({});
 * // => true
 *
 * _.isObject([1, 2, 3]);
 * // => true
 *
 * _.isObject(1);
 * // => false
 */
function isObject(value) {
  // Avoid a V8 JIT bug in Chrome 19-20.
  // See https://code.google.com/p/v8/issues/detail?id=2291 for more details.
  var type = typeof value;
  return !!value && (type == 'object' || type == 'function');
}

/**
 * Checks if `value` is a native function.
 *
 * @static
 * @memberOf _
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is a native function, else `false`.
 * @example
 *
 * _.isNative(Array.prototype.push);
 * // => true
 *
 * _.isNative(_);
 * // => false
 */
function isNative(value) {
  if (value == null) {
    return false;
  }
  if (isFunction(value)) {
    return reIsNative.test(fnToString.call(value));
  }
  return isObjectLike(value) && reIsHostCtor.test(value);
}

module.exports = getNative;

},{}],93:[function(require,module,exports){
/**
 * lodash 3.0.4 (Custom Build) <https://lodash.com/>
 * Build: `lodash modern modularize exports="npm" -o ./`
 * Copyright 2012-2015 The Dojo Foundation <http://dojofoundation.org/>
 * Based on Underscore.js 1.8.3 <http://underscorejs.org/LICENSE>
 * Copyright 2009-2015 Jeremy Ashkenas, DocumentCloud and Investigative Reporters & Editors
 * Available under MIT license <https://lodash.com/license>
 */

/**
 * Checks if `value` is object-like.
 *
 * @private
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is object-like, else `false`.
 */
function isObjectLike(value) {
  return !!value && typeof value == 'object';
}

/** Used for native method references. */
var objectProto = Object.prototype;

/** Used to check objects for own properties. */
var hasOwnProperty = objectProto.hasOwnProperty;

/** Native method references. */
var propertyIsEnumerable = objectProto.propertyIsEnumerable;

/**
 * Used as the [maximum length](http://ecma-international.org/ecma-262/6.0/#sec-number.max_safe_integer)
 * of an array-like value.
 */
var MAX_SAFE_INTEGER = 9007199254740991;

/**
 * The base implementation of `_.property` without support for deep paths.
 *
 * @private
 * @param {string} key The key of the property to get.
 * @returns {Function} Returns the new function.
 */
function baseProperty(key) {
  return function(object) {
    return object == null ? undefined : object[key];
  };
}

/**
 * Gets the "length" property value of `object`.
 *
 * **Note:** This function is used to avoid a [JIT bug](https://bugs.webkit.org/show_bug.cgi?id=142792)
 * that affects Safari on at least iOS 8.1-8.3 ARM64.
 *
 * @private
 * @param {Object} object The object to query.
 * @returns {*} Returns the "length" value.
 */
var getLength = baseProperty('length');

/**
 * Checks if `value` is array-like.
 *
 * @private
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is array-like, else `false`.
 */
function isArrayLike(value) {
  return value != null && isLength(getLength(value));
}

/**
 * Checks if `value` is a valid array-like length.
 *
 * **Note:** This function is based on [`ToLength`](http://ecma-international.org/ecma-262/6.0/#sec-tolength).
 *
 * @private
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is a valid length, else `false`.
 */
function isLength(value) {
  return typeof value == 'number' && value > -1 && value % 1 == 0 && value <= MAX_SAFE_INTEGER;
}

/**
 * Checks if `value` is classified as an `arguments` object.
 *
 * @static
 * @memberOf _
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is correctly classified, else `false`.
 * @example
 *
 * _.isArguments(function() { return arguments; }());
 * // => true
 *
 * _.isArguments([1, 2, 3]);
 * // => false
 */
function isArguments(value) {
  return isObjectLike(value) && isArrayLike(value) &&
    hasOwnProperty.call(value, 'callee') && !propertyIsEnumerable.call(value, 'callee');
}

module.exports = isArguments;

},{}],94:[function(require,module,exports){
/**
 * lodash 3.0.4 (Custom Build) <https://lodash.com/>
 * Build: `lodash modern modularize exports="npm" -o ./`
 * Copyright 2012-2015 The Dojo Foundation <http://dojofoundation.org/>
 * Based on Underscore.js 1.8.3 <http://underscorejs.org/LICENSE>
 * Copyright 2009-2015 Jeremy Ashkenas, DocumentCloud and Investigative Reporters & Editors
 * Available under MIT license <https://lodash.com/license>
 */

/** `Object#toString` result references. */
var arrayTag = '[object Array]',
    funcTag = '[object Function]';

/** Used to detect host constructors (Safari > 5). */
var reIsHostCtor = /^\[object .+?Constructor\]$/;

/**
 * Checks if `value` is object-like.
 *
 * @private
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is object-like, else `false`.
 */
function isObjectLike(value) {
  return !!value && typeof value == 'object';
}

/** Used for native method references. */
var objectProto = Object.prototype;

/** Used to resolve the decompiled source of functions. */
var fnToString = Function.prototype.toString;

/** Used to check objects for own properties. */
var hasOwnProperty = objectProto.hasOwnProperty;

/**
 * Used to resolve the [`toStringTag`](http://ecma-international.org/ecma-262/6.0/#sec-object.prototype.tostring)
 * of values.
 */
var objToString = objectProto.toString;

/** Used to detect if a method is native. */
var reIsNative = RegExp('^' +
  fnToString.call(hasOwnProperty).replace(/[\\^$.*+?()[\]{}|]/g, '\\$&')
  .replace(/hasOwnProperty|(function).*?(?=\\\()| for .+?(?=\\\])/g, '$1.*?') + '$'
);

/* Native method references for those with the same name as other `lodash` methods. */
var nativeIsArray = getNative(Array, 'isArray');

/**
 * Used as the [maximum length](http://ecma-international.org/ecma-262/6.0/#sec-number.max_safe_integer)
 * of an array-like value.
 */
var MAX_SAFE_INTEGER = 9007199254740991;

/**
 * Gets the native function at `key` of `object`.
 *
 * @private
 * @param {Object} object The object to query.
 * @param {string} key The key of the method to get.
 * @returns {*} Returns the function if it's native, else `undefined`.
 */
function getNative(object, key) {
  var value = object == null ? undefined : object[key];
  return isNative(value) ? value : undefined;
}

/**
 * Checks if `value` is a valid array-like length.
 *
 * **Note:** This function is based on [`ToLength`](http://ecma-international.org/ecma-262/6.0/#sec-tolength).
 *
 * @private
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is a valid length, else `false`.
 */
function isLength(value) {
  return typeof value == 'number' && value > -1 && value % 1 == 0 && value <= MAX_SAFE_INTEGER;
}

/**
 * Checks if `value` is classified as an `Array` object.
 *
 * @static
 * @memberOf _
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is correctly classified, else `false`.
 * @example
 *
 * _.isArray([1, 2, 3]);
 * // => true
 *
 * _.isArray(function() { return arguments; }());
 * // => false
 */
var isArray = nativeIsArray || function(value) {
  return isObjectLike(value) && isLength(value.length) && objToString.call(value) == arrayTag;
};

/**
 * Checks if `value` is classified as a `Function` object.
 *
 * @static
 * @memberOf _
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is correctly classified, else `false`.
 * @example
 *
 * _.isFunction(_);
 * // => true
 *
 * _.isFunction(/abc/);
 * // => false
 */
function isFunction(value) {
  // The use of `Object#toString` avoids issues with the `typeof` operator
  // in older versions of Chrome and Safari which return 'function' for regexes
  // and Safari 8 equivalents which return 'object' for typed array constructors.
  return isObject(value) && objToString.call(value) == funcTag;
}

/**
 * Checks if `value` is the [language type](https://es5.github.io/#x8) of `Object`.
 * (e.g. arrays, functions, objects, regexes, `new Number(0)`, and `new String('')`)
 *
 * @static
 * @memberOf _
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is an object, else `false`.
 * @example
 *
 * _.isObject({});
 * // => true
 *
 * _.isObject([1, 2, 3]);
 * // => true
 *
 * _.isObject(1);
 * // => false
 */
function isObject(value) {
  // Avoid a V8 JIT bug in Chrome 19-20.
  // See https://code.google.com/p/v8/issues/detail?id=2291 for more details.
  var type = typeof value;
  return !!value && (type == 'object' || type == 'function');
}

/**
 * Checks if `value` is a native function.
 *
 * @static
 * @memberOf _
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is a native function, else `false`.
 * @example
 *
 * _.isNative(Array.prototype.push);
 * // => true
 *
 * _.isNative(_);
 * // => false
 */
function isNative(value) {
  if (value == null) {
    return false;
  }
  if (isFunction(value)) {
    return reIsNative.test(fnToString.call(value));
  }
  return isObjectLike(value) && reIsHostCtor.test(value);
}

module.exports = isArray;

},{}],95:[function(require,module,exports){
(function (global){

var rng;

if (global.crypto && crypto.getRandomValues) {
  // WHATWG crypto-based RNG - http://wiki.whatwg.org/wiki/Crypto
  // Moderately fast, high quality
  var _rnds8 = new Uint8Array(16);
  rng = function whatwgRNG() {
    crypto.getRandomValues(_rnds8);
    return _rnds8;
  };
}

if (!rng) {
  // Math.random()-based (RNG)
  //
  // If all else fails, use Math.random().  It's fast, but is of unspecified
  // quality.
  var  _rnds = new Array(16);
  rng = function() {
    for (var i = 0, r; i < 16; i++) {
      if ((i & 0x03) === 0) r = Math.random() * 0x100000000;
      _rnds[i] = r >>> ((i & 0x03) << 3) & 0xff;
    }

    return _rnds;
  };
}

module.exports = rng;


}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})

},{}],96:[function(require,module,exports){
//     uuid.js
//
//     Copyright (c) 2010-2012 Robert Kieffer
//     MIT License - http://opensource.org/licenses/mit-license.php

// Unique ID creation requires a high quality random # generator.  We feature
// detect to determine the best RNG source, normalizing to a function that
// returns 128-bits of randomness, since that's what's usually required
var _rng = require('./rng');

// Maps for number <-> hex string conversion
var _byteToHex = [];
var _hexToByte = {};
for (var i = 0; i < 256; i++) {
  _byteToHex[i] = (i + 0x100).toString(16).substr(1);
  _hexToByte[_byteToHex[i]] = i;
}

// **`parse()` - Parse a UUID into it's component bytes**
function parse(s, buf, offset) {
  var i = (buf && offset) || 0, ii = 0;

  buf = buf || [];
  s.toLowerCase().replace(/[0-9a-f]{2}/g, function(oct) {
    if (ii < 16) { // Don't overflow!
      buf[i + ii++] = _hexToByte[oct];
    }
  });

  // Zero out remaining bytes if string was short
  while (ii < 16) {
    buf[i + ii++] = 0;
  }

  return buf;
}

// **`unparse()` - Convert UUID byte array (ala parse()) into a string**
function unparse(buf, offset) {
  var i = offset || 0, bth = _byteToHex;
  return  bth[buf[i++]] + bth[buf[i++]] +
          bth[buf[i++]] + bth[buf[i++]] + '-' +
          bth[buf[i++]] + bth[buf[i++]] + '-' +
          bth[buf[i++]] + bth[buf[i++]] + '-' +
          bth[buf[i++]] + bth[buf[i++]] + '-' +
          bth[buf[i++]] + bth[buf[i++]] +
          bth[buf[i++]] + bth[buf[i++]] +
          bth[buf[i++]] + bth[buf[i++]];
}

// **`v1()` - Generate time-based UUID**
//
// Inspired by https://github.com/LiosK/UUID.js
// and http://docs.python.org/library/uuid.html

// random #'s we need to init node and clockseq
var _seedBytes = _rng();

// Per 4.5, create and 48-bit node id, (47 random bits + multicast bit = 1)
var _nodeId = [
  _seedBytes[0] | 0x01,
  _seedBytes[1], _seedBytes[2], _seedBytes[3], _seedBytes[4], _seedBytes[5]
];

// Per 4.2.2, randomize (14 bit) clockseq
var _clockseq = (_seedBytes[6] << 8 | _seedBytes[7]) & 0x3fff;

// Previous uuid creation time
var _lastMSecs = 0, _lastNSecs = 0;

// See https://github.com/broofa/node-uuid for API details
function v1(options, buf, offset) {
  var i = buf && offset || 0;
  var b = buf || [];

  options = options || {};

  var clockseq = options.clockseq !== undefined ? options.clockseq : _clockseq;

  // UUID timestamps are 100 nano-second units since the Gregorian epoch,
  // (1582-10-15 00:00).  JSNumbers aren't precise enough for this, so
  // time is handled internally as 'msecs' (integer milliseconds) and 'nsecs'
  // (100-nanoseconds offset from msecs) since unix epoch, 1970-01-01 00:00.
  var msecs = options.msecs !== undefined ? options.msecs : new Date().getTime();

  // Per 4.2.1.2, use count of uuid's generated during the current clock
  // cycle to simulate higher resolution clock
  var nsecs = options.nsecs !== undefined ? options.nsecs : _lastNSecs + 1;

  // Time since last uuid creation (in msecs)
  var dt = (msecs - _lastMSecs) + (nsecs - _lastNSecs)/10000;

  // Per 4.2.1.2, Bump clockseq on clock regression
  if (dt < 0 && options.clockseq === undefined) {
    clockseq = clockseq + 1 & 0x3fff;
  }

  // Reset nsecs if clock regresses (new clockseq) or we've moved onto a new
  // time interval
  if ((dt < 0 || msecs > _lastMSecs) && options.nsecs === undefined) {
    nsecs = 0;
  }

  // Per 4.2.1.2 Throw error if too many uuids are requested
  if (nsecs >= 10000) {
    throw new Error('uuid.v1(): Can\'t create more than 10M uuids/sec');
  }

  _lastMSecs = msecs;
  _lastNSecs = nsecs;
  _clockseq = clockseq;

  // Per 4.1.4 - Convert from unix epoch to Gregorian epoch
  msecs += 12219292800000;

  // `time_low`
  var tl = ((msecs & 0xfffffff) * 10000 + nsecs) % 0x100000000;
  b[i++] = tl >>> 24 & 0xff;
  b[i++] = tl >>> 16 & 0xff;
  b[i++] = tl >>> 8 & 0xff;
  b[i++] = tl & 0xff;

  // `time_mid`
  var tmh = (msecs / 0x100000000 * 10000) & 0xfffffff;
  b[i++] = tmh >>> 8 & 0xff;
  b[i++] = tmh & 0xff;

  // `time_high_and_version`
  b[i++] = tmh >>> 24 & 0xf | 0x10; // include version
  b[i++] = tmh >>> 16 & 0xff;

  // `clock_seq_hi_and_reserved` (Per 4.2.2 - include variant)
  b[i++] = clockseq >>> 8 | 0x80;

  // `clock_seq_low`
  b[i++] = clockseq & 0xff;

  // `node`
  var node = options.node || _nodeId;
  for (var n = 0; n < 6; n++) {
    b[i + n] = node[n];
  }

  return buf ? buf : unparse(b);
}

// **`v4()` - Generate random UUID**

// See https://github.com/broofa/node-uuid for API details
function v4(options, buf, offset) {
  // Deprecated - 'format' argument, as supported in v1.2
  var i = buf && offset || 0;

  if (typeof(options) == 'string') {
    buf = options == 'binary' ? new Array(16) : null;
    options = null;
  }
  options = options || {};

  var rnds = options.random || (options.rng || _rng)();

  // Per 4.4, set bits for version and `clock_seq_hi_and_reserved`
  rnds[6] = (rnds[6] & 0x0f) | 0x40;
  rnds[8] = (rnds[8] & 0x3f) | 0x80;

  // Copy bytes to buffer, if provided
  if (buf) {
    for (var ii = 0; ii < 16; ii++) {
      buf[i + ii] = rnds[ii];
    }
  }

  return buf || unparse(rnds);
}

// Export public API
var uuid = v4;
uuid.v1 = v1;
uuid.v4 = v4;
uuid.parse = parse;
uuid.unparse = unparse;

module.exports = uuid;

},{"./rng":95}],97:[function(require,module,exports){
arguments[4][32][0].apply(exports,arguments)
},{"./vdom/create-element.js":109,"dup":32}],98:[function(require,module,exports){
arguments[4][33][0].apply(exports,arguments)
},{"./vtree/diff.js":129,"dup":33}],99:[function(require,module,exports){
var h = require("./virtual-hyperscript/index.js")

module.exports = h

},{"./virtual-hyperscript/index.js":116}],100:[function(require,module,exports){
arguments[4][34][0].apply(exports,arguments)
},{"dup":34}],101:[function(require,module,exports){
arguments[4][35][0].apply(exports,arguments)
},{"dup":35,"individual/one-version":103}],102:[function(require,module,exports){
(function (global){
'use strict';

/*global window, global*/

var root = typeof window !== 'undefined' ?
    window : typeof global !== 'undefined' ?
    global : {};

module.exports = Individual;

function Individual(key, value) {
    if (key in root) {
        return root[key];
    }

    root[key] = value;

    return value;
}

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})

},{}],103:[function(require,module,exports){
arguments[4][37][0].apply(exports,arguments)
},{"./index.js":102,"dup":37}],104:[function(require,module,exports){
(function (global){
var topLevel = typeof global !== 'undefined' ? global :
    typeof window !== 'undefined' ? window : {}
var minDoc = require('min-document');

if (typeof document !== 'undefined') {
    module.exports = document;
} else {
    var doccy = topLevel['__GLOBAL_DOCUMENT_CACHE@4'];

    if (!doccy) {
        doccy = topLevel['__GLOBAL_DOCUMENT_CACHE@4'] = minDoc;
    }

    module.exports = doccy;
}

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})

},{"min-document":5}],105:[function(require,module,exports){
arguments[4][39][0].apply(exports,arguments)
},{"dup":39}],106:[function(require,module,exports){
arguments[4][40][0].apply(exports,arguments)
},{"dup":40}],107:[function(require,module,exports){
arguments[4][41][0].apply(exports,arguments)
},{"./vdom/patch.js":112,"dup":41}],108:[function(require,module,exports){
arguments[4][42][0].apply(exports,arguments)
},{"../vnode/is-vhook.js":120,"dup":42,"is-object":105}],109:[function(require,module,exports){
arguments[4][43][0].apply(exports,arguments)
},{"../vnode/handle-thunk.js":118,"../vnode/is-vnode.js":121,"../vnode/is-vtext.js":122,"../vnode/is-widget.js":123,"./apply-properties":108,"dup":43,"global/document":104}],110:[function(require,module,exports){
arguments[4][44][0].apply(exports,arguments)
},{"dup":44}],111:[function(require,module,exports){
arguments[4][45][0].apply(exports,arguments)
},{"../vnode/is-widget.js":123,"../vnode/vpatch.js":126,"./apply-properties":108,"./create-element":109,"./update-widget":113,"dup":45}],112:[function(require,module,exports){
arguments[4][46][0].apply(exports,arguments)
},{"./dom-index":110,"./patch-op":111,"dup":46,"global/document":104,"x-is-array":106}],113:[function(require,module,exports){
arguments[4][47][0].apply(exports,arguments)
},{"../vnode/is-widget.js":123,"dup":47}],114:[function(require,module,exports){
arguments[4][49][0].apply(exports,arguments)
},{"dup":49,"ev-store":101}],115:[function(require,module,exports){
arguments[4][50][0].apply(exports,arguments)
},{"dup":50}],116:[function(require,module,exports){
arguments[4][51][0].apply(exports,arguments)
},{"../vnode/is-thunk":119,"../vnode/is-vhook":120,"../vnode/is-vnode":121,"../vnode/is-vtext":122,"../vnode/is-widget":123,"../vnode/vnode.js":125,"../vnode/vtext.js":127,"./hooks/ev-hook.js":114,"./hooks/soft-set-hook.js":115,"./parse-tag.js":117,"dup":51,"x-is-array":106}],117:[function(require,module,exports){
arguments[4][52][0].apply(exports,arguments)
},{"browser-split":100,"dup":52}],118:[function(require,module,exports){
arguments[4][55][0].apply(exports,arguments)
},{"./is-thunk":119,"./is-vnode":121,"./is-vtext":122,"./is-widget":123,"dup":55}],119:[function(require,module,exports){
arguments[4][56][0].apply(exports,arguments)
},{"dup":56}],120:[function(require,module,exports){
arguments[4][57][0].apply(exports,arguments)
},{"dup":57}],121:[function(require,module,exports){
arguments[4][58][0].apply(exports,arguments)
},{"./version":124,"dup":58}],122:[function(require,module,exports){
arguments[4][59][0].apply(exports,arguments)
},{"./version":124,"dup":59}],123:[function(require,module,exports){
arguments[4][60][0].apply(exports,arguments)
},{"dup":60}],124:[function(require,module,exports){
arguments[4][61][0].apply(exports,arguments)
},{"dup":61}],125:[function(require,module,exports){
arguments[4][62][0].apply(exports,arguments)
},{"./is-thunk":119,"./is-vhook":120,"./is-vnode":121,"./is-widget":123,"./version":124,"dup":62}],126:[function(require,module,exports){
arguments[4][63][0].apply(exports,arguments)
},{"./version":124,"dup":63}],127:[function(require,module,exports){
arguments[4][64][0].apply(exports,arguments)
},{"./version":124,"dup":64}],128:[function(require,module,exports){
arguments[4][65][0].apply(exports,arguments)
},{"../vnode/is-vhook":120,"dup":65,"is-object":105}],129:[function(require,module,exports){
arguments[4][66][0].apply(exports,arguments)
},{"../vnode/handle-thunk":118,"../vnode/is-thunk":119,"../vnode/is-vnode":121,"../vnode/is-vtext":122,"../vnode/is-widget":123,"../vnode/vpatch":126,"./diff-props":128,"dup":66,"x-is-array":106}],130:[function(require,module,exports){
arguments[4][70][0].apply(exports,arguments)
},{"dup":70}],131:[function(require,module,exports){
module.exports={
  "oscillator": {
    "node-params": {"type": "square", "frequency": 440},
    "params": [
      {"name": "type", "type": "string"},
      {"name": "frequency", "type": "number"}
    ],
    "out": true
  },
  "gain": {
    "node-params": {
      "gain": 0.2
    },
    "params": [
      {"name": "gain", "type": "number"}
    ],
    "in": true,
    "out": true
  },
  "delay": {
    "node-params": {
      "delayTime": 0.33,
      "maxDelaytime": 1
    },
    "params": [
      {"name": "delayTime", "type": "number"},
      {"name": "maxDelayTime", "type": "number"}
    ],
    "in": true,
    "out": true
  },
  "biquadFilter": {
    "node-params": {
      "type": "blah",
      "frequency": 440,
      "detune": 3,
      "Q": "wat is this?"
    },
    "params": [
      {"name": "type", "type": "string"},
      {"name": "frequency", "type": "number"},
      {"name": "detune", "type": "number"},
      {"name": "Q", "type": "string"}
    ],
    "in": true,
    "out": true
  },
  "stereoPanner": {
    "node-params": {
      "pan": 3
    },
    "params": [
      {"name": "pan", "type": "number"}
    ],
    "in": true,
    "out": true
  },
  "mediaStreamSource": {
    "node-params": {
      "source": false
    },
    "out": true
  }
}

},{}],132:[function(require,module,exports){
var h = require('virtual-dom/h')
var diff = require('virtual-dom/diff')
var patch = require('virtual-dom/patch')
var createElement = require('virtual-dom/create-element')
var uuid = require('uuid')
var indexArray = require('index-array')

module.exports = Windows

function Windows() {
  this.list = []

  this.defaultConfig = {};

  this.tree = this.render()
  this.rootNode = createElement(this.tree)
  document.body.appendChild(this.rootNode)

  this.dragWindow = {}

  setInterval(this.patch.bind(this), 20)

  window.addEventListener('mousemove', function (e) {
    this.dragWindow.x = e.pageX - this.dragWindow.offsetX
    this.dragWindow.y = e.pageY - this.dragWindow.offsetY
  }.bind(this))

  window.addEventListener('mouseup', function (e) {
    this.dragWindow = {}
  }.bind(this))

}

Windows.prototype.getWindow = function (id) {
  return indexArray(this.list, 'id')[id] || {}
}

Windows.prototype.patch = function () {
    var newTree = this.render()
    var patches = diff(this.tree, newTree)
    this.rootNode = patch(this.rootNode, patches)
    this.tree = newTree
}

Windows.prototype.add = function add(win, id) {
  win.id = win.id || id || uuid()
  this.list.push(win)
  return win.id
}

Windows.prototype.remove = function (id) {
  this.list = this.list.filter(function (win) {
    return win.id !== id
  })
}

Windows.prototype.hide = function (id) {
  var win = this.getWindow(id)
  win.hidden = true
}

Windows.prototype.show = function (id) {
  var win = this.getWindow(id)
  win.hidden = false
}

Windows.prototype.setPosition = function (id, pos) {
  var win = this.getWindow(id)
  win.x = pos.x
  win.y = pos.y
}

Windows.prototype.ondrag = function(id, ev) {
  this.dragWindow = this.getWindow(id)
  this.dragWindow.offsetX = ev.offsetX
  this.dragWindow.offsetY = ev.offsetY
}

Windows.prototype.render = function render() {
  var defaultBody = this.defaultBody
  var divWindows = this.list
    .map(function (win) {
      var style = {
        top: win.y + 'px',
        left: win.x + 'px',
        visibility: (win.hidden ? 'hidden' : 'visible')
      }
      var id = win.id
      var ondrag = this.ondrag.bind(this, id)
      var close = this.hide.bind(this, id)

      var form = []
      ;(win.config.params || []).forEach(function (param) {
        form.push(h('div', {className: 'form-label'}, param.name))
        form.push(h('input', {dataset: {name: param.name}}))
      })

      return h('div.window', {style: style, id: 'window-' + win.id}, [
        h('div.bar', {onmousedown: ondrag},[
          h('div.name', win.name),
          h('div.close', {onclick: close}, '×')
        ]),
        h('div.body', form)
      ])
    }.bind(this))
  return h('div.windows', divWindows)
}

},{"index-array":84,"uuid":96,"virtual-dom/create-element":97,"virtual-dom/diff":98,"virtual-dom/h":99,"virtual-dom/patch":107}]},{},[1])
//# sourceMappingURL=data:application/json;charset:utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJpbmRleC5qcyIsIm5vZGVfbW9kdWxlcy9hdWRpb2NvbnRleHQvc3JjL2F1ZGlvY29udGV4dC5qcyIsIm5vZGVfbW9kdWxlcy9hdWRpb2dyYXBoL2luZGV4LmpzIiwibm9kZV9tb2R1bGVzL2F1ZGlvZ3JhcGgvbGliL2luZGV4LmpzIiwibm9kZV9tb2R1bGVzL2Jyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL2Jyb3dzZXItcmVzb2x2ZS9lbXB0eS5qcyIsIm5vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9idWZmZXIvaW5kZXguanMiLCJub2RlX21vZHVsZXMvYnJvd3NlcmlmeS9ub2RlX21vZHVsZXMvYnVmZmVyL25vZGVfbW9kdWxlcy9iYXNlNjQtanMvbGliL2I2NC5qcyIsIm5vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9idWZmZXIvbm9kZV9tb2R1bGVzL2llZWU3NTQvaW5kZXguanMiLCJub2RlX21vZHVsZXMvYnJvd3NlcmlmeS9ub2RlX21vZHVsZXMvYnVmZmVyL25vZGVfbW9kdWxlcy9pcy1hcnJheS9pbmRleC5qcyIsIm5vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9ldmVudHMvZXZlbnRzLmpzIiwibm9kZV9tb2R1bGVzL2RlbGVnYXRlLWRvbS9pbmRleC5qcyIsIm5vZGVfbW9kdWxlcy9kZWxlZ2F0ZS1kb20vbm9kZV9tb2R1bGVzL2RvbS1ldmVudC9pbmRleC5qcyIsIm5vZGVfbW9kdWxlcy9kZWxlZ2F0ZS1kb20vbm9kZV9tb2R1bGVzL21hdGNoZXMtZG9tLXNlbGVjdG9yL2luZGV4LmpzIiwibm9kZV9tb2R1bGVzL2RlbGVnYXRlLWRvbS9ub2RlX21vZHVsZXMvbWF0Y2hlcy1kb20tc2VsZWN0b3Ivbm9kZV9tb2R1bGVzL3NlbGVjdC1kb20vZmFsbGJhY2suanMiLCJub2RlX21vZHVsZXMvZGVsZWdhdGUtZG9tL25vZGVfbW9kdWxlcy9tYXRjaGVzLWRvbS1zZWxlY3Rvci9ub2RlX21vZHVsZXMvc2VsZWN0LWRvbS9pbmRleC5qcyIsIm5vZGVfbW9kdWxlcy9kZWxlZ2F0ZS1kb20vbm9kZV9tb2R1bGVzL21hdGNoZXMtZG9tLXNlbGVjdG9yL25vZGVfbW9kdWxlcy9zZWxlY3QtZG9tL25vZGVfbW9kdWxlcy9xd2VyeS9xd2VyeS5qcyIsIm5vZGVfbW9kdWxlcy9kb20tYXJyYXkvaW5kZXguanMiLCJub2RlX21vZHVsZXMvZG9tLWFycmF5L25vZGVfbW9kdWxlcy9wYXJzZS1odG1sL2luZGV4LmpzIiwibm9kZV9tb2R1bGVzL2Zsb3dncmFwaC1lZGl0b3IvZWRnZS5qcyIsIm5vZGVfbW9kdWxlcy9mbG93Z3JhcGgtZWRpdG9yL2luZGV4LmpzIiwibm9kZV9tb2R1bGVzL2Zsb3dncmFwaC1lZGl0b3Ivbm9kZS5qcyIsIm5vZGVfbW9kdWxlcy9mbG93Z3JhcGgtZWRpdG9yL25vZGVfbW9kdWxlcy9kb20tY2xhc3NsaXN0L2luZGV4LmpzIiwibm9kZV9tb2R1bGVzL2Zsb3dncmFwaC1lZGl0b3Ivbm9kZV9tb2R1bGVzL2luaGVyaXRzL2luaGVyaXRzX2Jyb3dzZXIuanMiLCJub2RlX21vZHVsZXMvZmxvd2dyYXBoLWVkaXRvci9ub2RlX21vZHVsZXMvdmlydHVhbC1kb20vY3JlYXRlLWVsZW1lbnQuanMiLCJub2RlX21vZHVsZXMvZmxvd2dyYXBoLWVkaXRvci9ub2RlX21vZHVsZXMvdmlydHVhbC1kb20vZGlmZi5qcyIsIm5vZGVfbW9kdWxlcy9mbG93Z3JhcGgtZWRpdG9yL25vZGVfbW9kdWxlcy92aXJ0dWFsLWRvbS9ub2RlX21vZHVsZXMvYnJvd3Nlci1zcGxpdC9pbmRleC5qcyIsIm5vZGVfbW9kdWxlcy9mbG93Z3JhcGgtZWRpdG9yL25vZGVfbW9kdWxlcy92aXJ0dWFsLWRvbS9ub2RlX21vZHVsZXMvZXYtc3RvcmUvaW5kZXguanMiLCJub2RlX21vZHVsZXMvZmxvd2dyYXBoLWVkaXRvci9ub2RlX21vZHVsZXMvdmlydHVhbC1kb20vbm9kZV9tb2R1bGVzL2V2LXN0b3JlL25vZGVfbW9kdWxlcy9pbmRpdmlkdWFsL2luZGV4LmpzIiwibm9kZV9tb2R1bGVzL2Zsb3dncmFwaC1lZGl0b3Ivbm9kZV9tb2R1bGVzL3ZpcnR1YWwtZG9tL25vZGVfbW9kdWxlcy9ldi1zdG9yZS9ub2RlX21vZHVsZXMvaW5kaXZpZHVhbC9vbmUtdmVyc2lvbi5qcyIsIm5vZGVfbW9kdWxlcy9mbG93Z3JhcGgtZWRpdG9yL25vZGVfbW9kdWxlcy92aXJ0dWFsLWRvbS9ub2RlX21vZHVsZXMvZ2xvYmFsL2RvY3VtZW50LmpzIiwibm9kZV9tb2R1bGVzL2Zsb3dncmFwaC1lZGl0b3Ivbm9kZV9tb2R1bGVzL3ZpcnR1YWwtZG9tL25vZGVfbW9kdWxlcy9pcy1vYmplY3QvaW5kZXguanMiLCJub2RlX21vZHVsZXMvZmxvd2dyYXBoLWVkaXRvci9ub2RlX21vZHVsZXMvdmlydHVhbC1kb20vbm9kZV9tb2R1bGVzL3gtaXMtYXJyYXkvaW5kZXguanMiLCJub2RlX21vZHVsZXMvZmxvd2dyYXBoLWVkaXRvci9ub2RlX21vZHVsZXMvdmlydHVhbC1kb20vcGF0Y2guanMiLCJub2RlX21vZHVsZXMvZmxvd2dyYXBoLWVkaXRvci9ub2RlX21vZHVsZXMvdmlydHVhbC1kb20vdmRvbS9hcHBseS1wcm9wZXJ0aWVzLmpzIiwibm9kZV9tb2R1bGVzL2Zsb3dncmFwaC1lZGl0b3Ivbm9kZV9tb2R1bGVzL3ZpcnR1YWwtZG9tL3Zkb20vY3JlYXRlLWVsZW1lbnQuanMiLCJub2RlX21vZHVsZXMvZmxvd2dyYXBoLWVkaXRvci9ub2RlX21vZHVsZXMvdmlydHVhbC1kb20vdmRvbS9kb20taW5kZXguanMiLCJub2RlX21vZHVsZXMvZmxvd2dyYXBoLWVkaXRvci9ub2RlX21vZHVsZXMvdmlydHVhbC1kb20vdmRvbS9wYXRjaC1vcC5qcyIsIm5vZGVfbW9kdWxlcy9mbG93Z3JhcGgtZWRpdG9yL25vZGVfbW9kdWxlcy92aXJ0dWFsLWRvbS92ZG9tL3BhdGNoLmpzIiwibm9kZV9tb2R1bGVzL2Zsb3dncmFwaC1lZGl0b3Ivbm9kZV9tb2R1bGVzL3ZpcnR1YWwtZG9tL3Zkb20vdXBkYXRlLXdpZGdldC5qcyIsIm5vZGVfbW9kdWxlcy9mbG93Z3JhcGgtZWRpdG9yL25vZGVfbW9kdWxlcy92aXJ0dWFsLWRvbS92aXJ0dWFsLWh5cGVyc2NyaXB0L2hvb2tzL2F0dHJpYnV0ZS1ob29rLmpzIiwibm9kZV9tb2R1bGVzL2Zsb3dncmFwaC1lZGl0b3Ivbm9kZV9tb2R1bGVzL3ZpcnR1YWwtZG9tL3ZpcnR1YWwtaHlwZXJzY3JpcHQvaG9va3MvZXYtaG9vay5qcyIsIm5vZGVfbW9kdWxlcy9mbG93Z3JhcGgtZWRpdG9yL25vZGVfbW9kdWxlcy92aXJ0dWFsLWRvbS92aXJ0dWFsLWh5cGVyc2NyaXB0L2hvb2tzL3NvZnQtc2V0LWhvb2suanMiLCJub2RlX21vZHVsZXMvZmxvd2dyYXBoLWVkaXRvci9ub2RlX21vZHVsZXMvdmlydHVhbC1kb20vdmlydHVhbC1oeXBlcnNjcmlwdC9pbmRleC5qcyIsIm5vZGVfbW9kdWxlcy9mbG93Z3JhcGgtZWRpdG9yL25vZGVfbW9kdWxlcy92aXJ0dWFsLWRvbS92aXJ0dWFsLWh5cGVyc2NyaXB0L3BhcnNlLXRhZy5qcyIsIm5vZGVfbW9kdWxlcy9mbG93Z3JhcGgtZWRpdG9yL25vZGVfbW9kdWxlcy92aXJ0dWFsLWRvbS92aXJ0dWFsLWh5cGVyc2NyaXB0L3N2Zy1hdHRyaWJ1dGUtbmFtZXNwYWNlLmpzIiwibm9kZV9tb2R1bGVzL2Zsb3dncmFwaC1lZGl0b3Ivbm9kZV9tb2R1bGVzL3ZpcnR1YWwtZG9tL3ZpcnR1YWwtaHlwZXJzY3JpcHQvc3ZnLmpzIiwibm9kZV9tb2R1bGVzL2Zsb3dncmFwaC1lZGl0b3Ivbm9kZV9tb2R1bGVzL3ZpcnR1YWwtZG9tL3Zub2RlL2hhbmRsZS10aHVuay5qcyIsIm5vZGVfbW9kdWxlcy9mbG93Z3JhcGgtZWRpdG9yL25vZGVfbW9kdWxlcy92aXJ0dWFsLWRvbS92bm9kZS9pcy10aHVuay5qcyIsIm5vZGVfbW9kdWxlcy9mbG93Z3JhcGgtZWRpdG9yL25vZGVfbW9kdWxlcy92aXJ0dWFsLWRvbS92bm9kZS9pcy12aG9vay5qcyIsIm5vZGVfbW9kdWxlcy9mbG93Z3JhcGgtZWRpdG9yL25vZGVfbW9kdWxlcy92aXJ0dWFsLWRvbS92bm9kZS9pcy12bm9kZS5qcyIsIm5vZGVfbW9kdWxlcy9mbG93Z3JhcGgtZWRpdG9yL25vZGVfbW9kdWxlcy92aXJ0dWFsLWRvbS92bm9kZS9pcy12dGV4dC5qcyIsIm5vZGVfbW9kdWxlcy9mbG93Z3JhcGgtZWRpdG9yL25vZGVfbW9kdWxlcy92aXJ0dWFsLWRvbS92bm9kZS9pcy13aWRnZXQuanMiLCJub2RlX21vZHVsZXMvZmxvd2dyYXBoLWVkaXRvci9ub2RlX21vZHVsZXMvdmlydHVhbC1kb20vdm5vZGUvdmVyc2lvbi5qcyIsIm5vZGVfbW9kdWxlcy9mbG93Z3JhcGgtZWRpdG9yL25vZGVfbW9kdWxlcy92aXJ0dWFsLWRvbS92bm9kZS92bm9kZS5qcyIsIm5vZGVfbW9kdWxlcy9mbG93Z3JhcGgtZWRpdG9yL25vZGVfbW9kdWxlcy92aXJ0dWFsLWRvbS92bm9kZS92cGF0Y2guanMiLCJub2RlX21vZHVsZXMvZmxvd2dyYXBoLWVkaXRvci9ub2RlX21vZHVsZXMvdmlydHVhbC1kb20vdm5vZGUvdnRleHQuanMiLCJub2RlX21vZHVsZXMvZmxvd2dyYXBoLWVkaXRvci9ub2RlX21vZHVsZXMvdmlydHVhbC1kb20vdnRyZWUvZGlmZi1wcm9wcy5qcyIsIm5vZGVfbW9kdWxlcy9mbG93Z3JhcGgtZWRpdG9yL25vZGVfbW9kdWxlcy92aXJ0dWFsLWRvbS92dHJlZS9kaWZmLmpzIiwibm9kZV9tb2R1bGVzL2Zsb3dncmFwaC1lZGl0b3Ivbm9kZV9tb2R1bGVzL3ZpcnR1YWwtaHlwZXJzY3JpcHQtc3ZnL2luZGV4LmpzIiwibm9kZV9tb2R1bGVzL2Zsb3dncmFwaC1lZGl0b3Ivbm9kZV9tb2R1bGVzL3ZpcnR1YWwtaHlwZXJzY3JpcHQtc3ZnL25vZGVfbW9kdWxlcy9oYXMvc3JjL2luZGV4LmpzIiwibm9kZV9tb2R1bGVzL2Zsb3dncmFwaC1lZGl0b3Ivbm9kZV9tb2R1bGVzL3ZpcnR1YWwtaHlwZXJzY3JpcHQtc3ZnL25vZGVfbW9kdWxlcy9pc2FycmF5L2luZGV4LmpzIiwibm9kZV9tb2R1bGVzL2Zsb3dncmFwaC1lZGl0b3Ivbm9kZV9tb2R1bGVzL3ZpcnR1YWwtaHlwZXJzY3JpcHQtc3ZnL25vZGVfbW9kdWxlcy94dGVuZC9pbW11dGFibGUuanMiLCJub2RlX21vZHVsZXMvZmxvd2dyYXBoL2luZGV4LmpzIiwibm9kZV9tb2R1bGVzL2Zsb3dncmFwaC9ub2RlX21vZHVsZXMvaW5kZXgtYXJyYXkvaW5kZXguanMiLCJub2RlX21vZHVsZXMvZmxvd2dyYXBoL25vZGVfbW9kdWxlcy9yYW5kb21qcy9pbmRleC5qcyIsIm5vZGVfbW9kdWxlcy9mbG93Z3JhcGgvbm9kZV9tb2R1bGVzL3JhbmRvbWpzL25vZGVfbW9kdWxlcy9yYW5kZXhwL2xpYi9yYW5kZXhwLmpzIiwibm9kZV9tb2R1bGVzL2Zsb3dncmFwaC9ub2RlX21vZHVsZXMvcmFuZG9tanMvbm9kZV9tb2R1bGVzL3JhbmRleHAvbm9kZV9tb2R1bGVzL2Rpc2NvbnRpbnVvdXMtcmFuZ2UvaW5kZXguanMiLCJub2RlX21vZHVsZXMvZmxvd2dyYXBoL25vZGVfbW9kdWxlcy9yYW5kb21qcy9ub2RlX21vZHVsZXMvcmFuZGV4cC9ub2RlX21vZHVsZXMvcmV0L2xpYi9pbmRleC5qcyIsIm5vZGVfbW9kdWxlcy9mbG93Z3JhcGgvbm9kZV9tb2R1bGVzL3JhbmRvbWpzL25vZGVfbW9kdWxlcy9yYW5kZXhwL25vZGVfbW9kdWxlcy9yZXQvbGliL3Bvc2l0aW9ucy5qcyIsIm5vZGVfbW9kdWxlcy9mbG93Z3JhcGgvbm9kZV9tb2R1bGVzL3JhbmRvbWpzL25vZGVfbW9kdWxlcy9yYW5kZXhwL25vZGVfbW9kdWxlcy9yZXQvbGliL3NldHMuanMiLCJub2RlX21vZHVsZXMvZmxvd2dyYXBoL25vZGVfbW9kdWxlcy9yYW5kb21qcy9ub2RlX21vZHVsZXMvcmFuZGV4cC9ub2RlX21vZHVsZXMvcmV0L2xpYi90eXBlcy5qcyIsIm5vZGVfbW9kdWxlcy9mbG93Z3JhcGgvbm9kZV9tb2R1bGVzL3JhbmRvbWpzL25vZGVfbW9kdWxlcy9yYW5kZXhwL25vZGVfbW9kdWxlcy9yZXQvbGliL3V0aWwuanMiLCJub2RlX21vZHVsZXMvZ2V0dXNlcm1lZGlhL2luZGV4LWJyb3dzZXIuanMiLCJub2RlX21vZHVsZXMvaW5kZXgtYXJyYXkvaW5kZXguanMiLCJub2RlX21vZHVsZXMvaW5zZXJ0LWNzcy9pbmRleC5qcyIsIm5vZGVfbW9kdWxlcy9sb2Rhc2guY2FwaXRhbGl6ZS9pbmRleC5qcyIsIm5vZGVfbW9kdWxlcy9sb2Rhc2guY2FwaXRhbGl6ZS9ub2RlX21vZHVsZXMvbG9kYXNoLl9iYXNldG9zdHJpbmcvaW5kZXguanMiLCJub2RlX21vZHVsZXMvbG9kYXNoLnZhbHVlcy9pbmRleC5qcyIsIm5vZGVfbW9kdWxlcy9sb2Rhc2gudmFsdWVzL25vZGVfbW9kdWxlcy9sb2Rhc2guX2Jhc2V2YWx1ZXMvaW5kZXguanMiLCJub2RlX21vZHVsZXMvbG9kYXNoLnZhbHVlcy9ub2RlX21vZHVsZXMvbG9kYXNoLmtleXMvaW5kZXguanMiLCJub2RlX21vZHVsZXMvbG9kYXNoLnZhbHVlcy9ub2RlX21vZHVsZXMvbG9kYXNoLmtleXMvbm9kZV9tb2R1bGVzL2xvZGFzaC5fZ2V0bmF0aXZlL2luZGV4LmpzIiwibm9kZV9tb2R1bGVzL2xvZGFzaC52YWx1ZXMvbm9kZV9tb2R1bGVzL2xvZGFzaC5rZXlzL25vZGVfbW9kdWxlcy9sb2Rhc2guaXNhcmd1bWVudHMvaW5kZXguanMiLCJub2RlX21vZHVsZXMvbG9kYXNoLnZhbHVlcy9ub2RlX21vZHVsZXMvbG9kYXNoLmtleXMvbm9kZV9tb2R1bGVzL2xvZGFzaC5pc2FycmF5L2luZGV4LmpzIiwibm9kZV9tb2R1bGVzL3V1aWQvcm5nLWJyb3dzZXIuanMiLCJub2RlX21vZHVsZXMvdXVpZC91dWlkLmpzIiwibm9kZV9tb2R1bGVzL3ZpcnR1YWwtZG9tL2guanMiLCJub2RlX21vZHVsZXMvdmlydHVhbC1kb20vbm9kZV9tb2R1bGVzL2V2LXN0b3JlL25vZGVfbW9kdWxlcy9pbmRpdmlkdWFsL2luZGV4LmpzIiwibm9kZV9tb2R1bGVzL3ZpcnR1YWwtZG9tL25vZGVfbW9kdWxlcy9nbG9iYWwvZG9jdW1lbnQuanMiLCJ0ZW1wbGF0ZXMuanNvbiIsIndpbmRvd3MuanMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7QUNBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDckpBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDVkE7O0FDQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN0RUE7O0FDQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDMTVDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzVIQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNwRkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDakNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDN1NBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM1Q0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDZkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDN0NBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNkQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN4QkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDalhBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDM0NBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDVkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7OztBQ3BGQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7OztBQ3JLQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQ3hEQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNyS0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3ZCQTtBQUNBO0FBQ0E7QUFDQTs7QUNIQTtBQUNBO0FBQ0E7QUFDQTs7QUNIQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzFHQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7OztBQ3BCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7O0FDbkJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7OztBQ3RCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7OztBQ2ZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNMQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDUkE7QUFDQTtBQUNBO0FBQ0E7O0FDSEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNqR0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM5Q0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNyRkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3hKQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzVFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNmQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbkNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzNCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDakJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3ZJQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN0REE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN6VEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzlEQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3hDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDTEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNQQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ1BBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDUEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ0xBO0FBQ0E7O0FDREE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDeEVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdEJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDVkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMxREE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMzYUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3BCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNOQTtBQUNBO0FBQ0E7QUFDQTs7QUNIQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDakJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ25KQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7Ozs7QUNYQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ0pBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNyUEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDaEpBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN0UkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2pCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2xGQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ1ZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7Ozs7QUMxR0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzlEQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7OztBQ3JCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3RCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDN0JBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdEJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN6Q0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMvQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzVPQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDeklBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDMUdBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7QUNwTEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7OztBQy9CQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7Ozs7O0FDdkxBO0FBQ0E7QUFDQTtBQUNBOzs7Ozs7O0FDSEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7Ozs7OztBQ25CQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUNmQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2hFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EiLCJmaWxlIjoiZ2VuZXJhdGVkLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXNDb250ZW50IjpbIihmdW5jdGlvbiBlKHQsbixyKXtmdW5jdGlvbiBzKG8sdSl7aWYoIW5bb10pe2lmKCF0W29dKXt2YXIgYT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2lmKCF1JiZhKXJldHVybiBhKG8sITApO2lmKGkpcmV0dXJuIGkobywhMCk7dmFyIGY9bmV3IEVycm9yKFwiQ2Fubm90IGZpbmQgbW9kdWxlICdcIitvK1wiJ1wiKTt0aHJvdyBmLmNvZGU9XCJNT0RVTEVfTk9UX0ZPVU5EXCIsZn12YXIgbD1uW29dPXtleHBvcnRzOnt9fTt0W29dWzBdLmNhbGwobC5leHBvcnRzLGZ1bmN0aW9uKGUpe3ZhciBuPXRbb11bMV1bZV07cmV0dXJuIHMobj9uOmUpfSxsLGwuZXhwb3J0cyxlLHQsbixyKX1yZXR1cm4gbltvXS5leHBvcnRzfXZhciBpPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7Zm9yKHZhciBvPTA7bzxyLmxlbmd0aDtvKyspcyhyW29dKTtyZXR1cm4gc30pIiwidmFyIEZsb3dHcmFwaCA9IHJlcXVpcmUoJ2Zsb3dncmFwaCcpXG52YXIgRmxvd0dyYXBoVmlldyA9IHJlcXVpcmUoJ2Zsb3dncmFwaC1lZGl0b3InKVxudmFyIGdldFVzZXJNZWRpYSA9IHJlcXVpcmUoJ2dldHVzZXJtZWRpYScpXG52YXIgaW5zZXJ0Q3NzID0gcmVxdWlyZSgnaW5zZXJ0LWNzcycpXG52YXIgdGVtcGxhdGVzID0gcmVxdWlyZSgnLi90ZW1wbGF0ZXMuanNvbicpXG52YXIgZGVsZWdhdGUgPSByZXF1aXJlKCdkZWxlZ2F0ZS1kb20nKVxudmFyIGV4dGVuZCA9IHJlcXVpcmUoJ3h0ZW5kJylcbnZhciBkb21BcnJheSA9IHJlcXVpcmUoJ2RvbS1hcnJheScpXG5cbnZhciBBdWRpb0NvbnRleHQgPSByZXF1aXJlKCdhdWRpb2NvbnRleHQnKTtcbnZhciBBdWRpb0dyYXBoID0gcmVxdWlyZSgnYXVkaW9ncmFwaCcpO1xudmFyIGNvbnRleHQgPSBuZXcgQXVkaW9Db250ZXh0KCk7XG5cbndpbmRvdy5hdWRpb0dyYXBoID0gbmV3IEF1ZGlvR3JhcGgoY29udGV4dCk7XG5cbnZhciB0ZW1wbGF0ZXNFbGVtZW50ID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcignI3RlbXBsYXRlcycpXG52YXIgc3RhcnRCdXR0b24gPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcjc3RhcnQnKVxudmFyIGFkZE5vZGVGb3JtID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcignI2FkZC1ub2RlJylcbnZhciBub2RlTmFtZUlucHV0ID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcignI25vZGUtbmFtZScpXG5cbk9iamVjdC5rZXlzKHRlbXBsYXRlcykuZm9yRWFjaChmdW5jdGlvbiAobmFtZSkge1xuICB2YXIgbGkgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdsaScpXG4gIHZhciBidXR0b24gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdidXR0b24nKVxuICB2YXIgdGV4dCA9IGRvY3VtZW50LmNyZWF0ZVRleHROb2RlKG5hbWUpXG4gIGJ1dHRvbi5hcHBlbmRDaGlsZCh0ZXh0KVxuICBsaS5hcHBlbmRDaGlsZChidXR0b24pXG4gIHRlbXBsYXRlc0VsZW1lbnQuYXBwZW5kQ2hpbGQobGkpXG59KVxuXG5kZWxlZ2F0ZS5vbih0ZW1wbGF0ZXNFbGVtZW50LCAnYnV0dG9uJywgJ2NsaWNrJywgZnVuY3Rpb24gKGUpIHtcbiAgdmFyIGxhYmVsID0gZS50YXJnZXQuaW5uZXJUZXh0XG4gIHZhciBjb25maWcgPSB0ZW1wbGF0ZXNbbGFiZWxdXG4gIHZhciBvcHRzID0ge2xhYmVsOiBsYWJlbCwgY29uZmlnOiBjb25maWd9XG4gIGlmKCFjb25maWcuaW4pIG9wdHMuaW5wb3J0cyA9IFtdXG4gIGlmKCFjb25maWcub3V0KSBvcHRzLm91dHBvcnRzID0gW11cblxuICB2YXIgb3B0aW9ucyA9IGV4dGVuZCh7XG4gICAgeDogMjAwLFxuICAgIHk6IDIwMFxuICB9LCBvcHRzKVxuICB0cnkge1xuICAgIHZhciBub2RlID0gZ3JhcGguYWRkTm9kZShvcHRpb25zKVxuICB9IGNhdGNoKGUpIHtcbiAgICBhbGVydChlLm1lc3NhZ2UpXG4gIH1cbn0pXG5cbnN0YXJ0QnV0dG9uLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgZnVuY3Rpb24gKCkge1xuICBzdGFydEJ1dHRvbi5pbm5lckhUTUwgPSAnYnVuZGxpbmcuLi4nXG4gIHJ1bkNvZGUoKVxufSlcblxud2luZG93LmdyYXBoID0gbmV3IEZsb3dHcmFwaCgpXG5cbndpbmRvdy52aWV3ID0gbmV3IEZsb3dHcmFwaFZpZXcoZ3JhcGgpXG5kb2N1bWVudC5ib2R5LmFwcGVuZENoaWxkKHZpZXcuc3ZnKVxuXG52YXIgV2luZG93cyA9IHJlcXVpcmUoJy4vd2luZG93cycpXG52YXIgd2luZG93cyA9IG5ldyBXaW5kb3dzKClcblxuZ3JhcGgub24oJ25vZGUtZGVsZXRlZCcsIGZ1bmN0aW9uIChub2RlKSB7XG4gIHdpbmRvd3MucmVtb3ZlKG5vZGUuaWQpXG59KVxuXG5ncmFwaC5vbignbm9kZS1hZGRlZCcsIGZ1bmN0aW9uIChub2RlKSB7XG4gIHdpbmRvd3MuYWRkKHtpZDogbm9kZS5pZCwgbmFtZTogbm9kZS5pZCArICcoJyArIG5vZGUubGFiZWwgKyAnKScsIHg6IG5vZGUueCArIDEwMCwgeTogbm9kZS55LCBjb25maWc6IG5vZGUuY29uZmlnfSlcbiAgd2luZG93cy5oaWRlKG5vZGUuaWQpXG59KVxuXG52aWV3Lm9uKCdub2RlLXNlbGVjdCcsIGZ1bmN0aW9uIChub2RlKSB7XG4gIHdpbmRvd3Muc2hvdyhub2RlLmlkKVxuICB3aW5kb3dzLnNldFBvc2l0aW9uKG5vZGUuaWQsIHt4OiBub2RlLnggKyAxMDgsIHk6IG5vZGUueX0pXG59KVxuXG5pbnNlcnRDc3MoRmxvd0dyYXBoVmlldy5jc3MpXG5cbmZ1bmN0aW9uIHN0b3AoKSB7XG4gIGNhbGxNZXRob2RGb3JTb3VyY2VOb2Rlcygnc3RvcCcpO1xufVxuXG5mdW5jdGlvbiBzdGFydCgpIHtcbiAgY2FsbE1ldGhvZEZvclNvdXJjZU5vZGVzKCdzdGFydCcpO1xufVxuXG5mdW5jdGlvbiBjYWxsTWV0aG9kRm9yU291cmNlTm9kZXMobWV0aG9kKSB7XG4gIHdpbmRvdy5hdWRpb0dyYXBoLnNvdXJjZUlkcy5mb3JFYWNoKGZ1bmN0aW9uKGlkKSB7XG4gICAgd2luZG93LmF1ZGlvR3JhcGguZ3JhcGguZm9yRWFjaChmdW5jdGlvbihvYmopIHtcbiAgICAgIGlmIChvYmouaWQgPT09IGlkICYmIG9iai5ub2RlW21ldGhvZF0pIG9iai5ub2RlW21ldGhvZF0oKTtcbiAgICB9KTtcbiAgfSk7XG59XG5cbmZ1bmN0aW9uIHJ1bkNvZGUoKSB7XG4gIHZhciBlZGdlTWFwID0ge307XG5cblx0Z3JhcGguZ2V0RWRnZXMoKS5mb3JFYWNoKGZ1bmN0aW9uKGUpIHtlZGdlTWFwW2Uuc291cmNlLmlkXSA9IGUudGFyZ2V0LmlkO30pO1xuXG4gIHZhciBtZWRpYVNvdXJjZTtcbiAgdmFyIG5vZGVzID0gZ3JhcGgubm9kZXMubWFwKGZ1bmN0aW9uIChub2RlKSB7XG4gICAgLy8gb3B0c1xuICAgIHZhciBzZWxlY3Rvck9wdHMgPSAnI3dpbmRvdy0nICsgbm9kZS5pZCArICcgaW5wdXQnXG4gICAgdmFyIG9wdHMgPSB7fVxuICAgIGRvbUFycmF5KGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoc2VsZWN0b3JPcHRzKSkuZm9yRWFjaChmdW5jdGlvbiAoZWxlbSkge1xuICAgICAgb3B0c1tlbGVtLmRhdGFzZXQubmFtZV0gPSBlbGVtLnZhbHVlO1xuICAgIH0pXG4gICAgaWYgKGVkZ2VNYXBbbm9kZS5pZF0pIG5vZGUub3V0cHV0ID0gZWRnZU1hcFtub2RlLmlkXTtcbiAgICBlbHNlIG5vZGUub3V0cHV0ID0gJ291dHB1dCc7XG4gICAgbm9kZS50eXBlID0gbm9kZS5sYWJlbDtcbiAgICBub2RlLm9wdHMgPSBvcHRzO1xuICAgIG5vZGUucGFyYW1zID0gZXh0ZW5kKG5vZGUuY29uZmlnWydub2RlLXBhcmFtcyddLCBub2RlLm9wdHMpO1xuICAgIGlmIChub2RlLnR5cGUgPT09ICdtZWRpYVN0cmVhbVNvdXJjZScpIHtcbiAgICAgIG1lZGlhU291cmNlID0gbm9kZTtcbiAgICB9XG4gICAgcmV0dXJuIG5vZGU7XG4gIH0pO1xuXG4gIGlmIChtZWRpYVNvdXJjZSkge1xuICAgIGdldFVzZXJNZWRpYShmdW5jdGlvbiAoZXJyLCBzdHJlYW0pIHtcbiAgICAgIGlmIChlcnIpIGNvbnNvbGUuZXJyb3IoJ2ZhaWxlZCcpO1xuICAgICAgZWxzZSB7XG4gICAgICAgIG1lZGlhU291cmNlLnNvdXJjZSA9IHN0cmVhbTtcbiAgICAgICAgd2luZG93LmF1ZGlvR3JhcGguZ3JhcGggPSBub2RlcztcbiAgICAgICAgcnVubml0KCk7XG4gICAgICB9XG4gICAgfSk7XG4gIH0gZWxzZSB7XG4gICAgd2luZG93LmF1ZGlvR3JhcGguZ3JhcGggPSBub2RlcztcbiAgICBydW5uaXQoKTtcbiAgfVxufVxuXG5mdW5jdGlvbiBydW5uaXQoKSB7XG4gIHdpbmRvdy5hdWRpb0dyYXBoLnVwZGF0ZSgpO1xuICBzdGFydCgpO1xuICBzZXRUaW1lb3V0KHN0b3AsIDQwMDApO1xuICBzdGFydEJ1dHRvbi5pbm5lckhUTUwgPSAnU3RhcnQnO1xufVxuXG5cbndpbmRvdy5hZGRFdmVudExpc3RlbmVyKCdtZXNzYWdlJywgcmVjZWl2ZU1lc3NhZ2UsIGZhbHNlKVxuXG5mdW5jdGlvbiByZWNlaXZlTWVzc2FnZShlKSB7XG4gIGlmKHR5cGVvZiBlLmRhdGEgPT09ICdzdHJpbmcnKSBjb25zb2xlLmxvZyhlLmRhdGEpXG4gIGlmKHR5cGVvZiBlLmRhdGEgPT09ICdvYmplY3QnKSB7XG4gICAgaWYoZS5kYXRhLnR5cGUgPT09ICdub2RlT3V0Jykge1xuICAgICAgdmlldy5ibGlua0VkZ2UoZS5kYXRhLmlkKVxuICAgIH1cbiAgfVxufVxuIiwiLypcbiAqIFdlYiBBdWRpbyBBUEkgQXVkaW9Db250ZXh0IHNoaW1cbiAqL1xuKGZ1bmN0aW9uIChkZWZpbml0aW9uKSB7XG4gICAgaWYgKHR5cGVvZiBleHBvcnRzID09PSBcIm9iamVjdFwiKSB7XG4gICAgICAgIG1vZHVsZS5leHBvcnRzID0gZGVmaW5pdGlvbigpO1xuICAgIH1cbn0pKGZ1bmN0aW9uICgpIHtcbiAgcmV0dXJuIHdpbmRvdy5BdWRpb0NvbnRleHQgfHwgd2luZG93LndlYmtpdEF1ZGlvQ29udGV4dDtcbn0pO1xuIiwibW9kdWxlLmV4cG9ydHMgPSByZXF1aXJlKCcuL2xpYi9pbmRleC5qcycpOyIsInZhciBjYXAgPSByZXF1aXJlKCdsb2Rhc2guY2FwaXRhbGl6ZScpO1xudmFyIHZhbHVlcyA9IHJlcXVpcmUoJ2xvZGFzaC52YWx1ZXMnKTtcbnZhciBpbmhlcml0cyA9IHJlcXVpcmUoJ2luaGVyaXRzJyk7XG52YXIgRXZlbnRFbWl0dGVyID0gcmVxdWlyZSgnZXZlbnRzJykuRXZlbnRFbWl0dGVyO1xudmFyIHV1aWQgPSByZXF1aXJlKCd1dWlkJyk7XG5cbmluaGVyaXRzKEF1ZGlvR3JhcGgsIEV2ZW50RW1pdHRlcik7XG5cbm1vZHVsZS5leHBvcnRzID0gQXVkaW9HcmFwaDtcblxuZnVuY3Rpb24gZ2V0Tm9kZShjdHgsIHR5cGUsIHNvdXJjZSkge1xuICByZXR1cm4gY3R4WydjcmVhdGUnICsgY2FwKHR5cGUpXShzb3VyY2UpO1xufVxuXG5mdW5jdGlvbiBzZXRQYXJhbXMobm9kZSwgcGFyYW1zKSB7XG4gIE9iamVjdC5rZXlzKHBhcmFtcykuZm9yRWFjaChmdW5jdGlvbihwKSB7XG4gICAgbm9kZVtwXSA9IHBhcmFtc1twXTtcbiAgfSlcbiAgcmV0dXJuIG5vZGU7XG59XG5cbmZ1bmN0aW9uIEF1ZGlvR3JhcGgoY29udGV4dCwgaW5pdEdyYXBoKSB7XG4gIEV2ZW50RW1pdHRlci5jYWxsKHRoaXMpO1xuICB0aGlzLmNvbnRleHQgPSBjb250ZXh0O1xuICB0aGlzLmdyYXBoID0gaW5pdEdyYXBoIHx8IFtdO1xuICB0aGlzLmlkID0gJ2F1ZGlvZ3JhcGgtJysgdXVpZCgpO1xuICB0aGlzLnVwZGF0ZSgpO1xuICB0aGlzLnNvdXJjZUlkcyA9IGdldFNvdXJjZUlkcyh0aGlzLmdyYXBoKTtcbiAgcmV0dXJuIHRoaXM7XG59XG5cbkF1ZGlvR3JhcGgucHJvdG90eXBlLnVwZGF0ZSA9IGZ1bmN0aW9uKCkge1xuICB0aGlzLmdyYXBoID0gZ2VuZXJhdGVBbmRDb25uZWN0R3JhcGgodGhpcy5jb250ZXh0LCB0aGlzLmdyYXBoKTtcbiAgdGhpcy5zb3VyY2VJZHMgPSBnZXRTb3VyY2VJZHModGhpcy5ncmFwaCk7XG4gIHRoaXMuZW1pdCgndXBkYXRlJywgdGhpcyk7XG4gIHJldHVybiB0aGlzO1xufVxuXG5mdW5jdGlvbiBnZXRTb3VyY2VJZHMoZ3JhcGgpIHtcbiAgcmV0dXJuIGdyYXBoLm1hcChmdW5jdGlvbihvYmopIHtyZXR1cm4gb2JqLmlkfSlcbiAgICAgICAgIC5maWx0ZXIoZnVuY3Rpb24oaWQpIHtcbiAgICAgICAgICAgcmV0dXJuICF+Z3JhcGgubWFwKGZ1bmN0aW9uKG9iaikge1xuICAgICAgICAgICAgICAgICAgICAgIHJldHVybiBvYmoub3V0cHV0O1xuICAgICAgICAgICAgICAgICAgICB9KS5pbmRleE9mKGlkKX0pO1xufVxuXG5mdW5jdGlvbiBnZW5lcmF0ZUFuZENvbm5lY3RHcmFwaChjdHgsIG9sZEdyYXBoKSB7XG4gIGlmICghb2xkR3JhcGgubGVuZ3RoKSByZXR1cm4gb2xkR3JhcGg7XG4gIHZhciBvdXRwdXRJZCwgbnVHcmFwaCA9IHtcbiAgICBcIm91dHB1dFwiOiB7bm9kZTogY3R4LmRlc3RpbmF0aW9ufVxuICB9O1xuXG4gIC8vIGxvb3Agb3ZlciBhbmQgY3JlYXRlIChvciBkaXNjb25uZWN0KSBub2Rlc1xuICBvbGRHcmFwaC5mb3JFYWNoKGZ1bmN0aW9uKG9iaikge1xuICAgIGlmIChvYmoub3V0cHV0ID09PSAnb3V0cHV0Jykgb3V0cHV0SWQgPSBvYmouaWQ7XG4gICAgaWYgKG9iai5ub2RlKSBvYmoubm9kZS5kaXNjb25uZWN0KCk7XG4gICAgaWYgKG9iai50eXBlID09PSAnbWVkaWFTdHJlYW1Tb3VyY2UnKSBvYmoubm9kZSA9IGdldE5vZGUoY3R4LCBvYmoudHlwZSwgb2JqLnNvdXJjZSk7XG4gICAgZWxzZSBpZiAob2JqLnR5cGUgPT09ICdkZWxheScpIG9iai5ub2RlID0gZ2V0Tm9kZShjdHgsIG9iai50eXBlLCBvYmoucGFyYW1zLm1heERlbGF5VGltZSk7XG4gICAgZWxzZSBvYmoubm9kZSA9IGdldE5vZGUoY3R4LCBvYmoudHlwZSk7XG4gICAgbnVHcmFwaFtvYmouaWRdID0gb2JqO1xuXG4gICAgc2V0UGFyYW1zKG9iai5ub2RlLCBvYmoucGFyYW1zKTtcbiAgfSk7XG5cbiAgb2xkR3JhcGguZm9yRWFjaChmdW5jdGlvbihvYmopIHtcbiAgICBudUdyYXBoW29iai5pZF0ubm9kZS5jb25uZWN0KG51R3JhcGhbb2JqLm91dHB1dF0ubm9kZSk7XG4gIH0pXG5cbiAgcmV0dXJuIHZhbHVlcyhudUdyYXBoKTtcbn1cbiIsbnVsbCwiLyohXG4gKiBUaGUgYnVmZmVyIG1vZHVsZSBmcm9tIG5vZGUuanMsIGZvciB0aGUgYnJvd3Nlci5cbiAqXG4gKiBAYXV0aG9yICAgRmVyb3NzIEFib3VraGFkaWplaCA8ZmVyb3NzQGZlcm9zcy5vcmc+IDxodHRwOi8vZmVyb3NzLm9yZz5cbiAqIEBsaWNlbnNlICBNSVRcbiAqL1xuXG52YXIgYmFzZTY0ID0gcmVxdWlyZSgnYmFzZTY0LWpzJylcbnZhciBpZWVlNzU0ID0gcmVxdWlyZSgnaWVlZTc1NCcpXG52YXIgaXNBcnJheSA9IHJlcXVpcmUoJ2lzLWFycmF5JylcblxuZXhwb3J0cy5CdWZmZXIgPSBCdWZmZXJcbmV4cG9ydHMuU2xvd0J1ZmZlciA9IFNsb3dCdWZmZXJcbmV4cG9ydHMuSU5TUEVDVF9NQVhfQllURVMgPSA1MFxuQnVmZmVyLnBvb2xTaXplID0gODE5MiAvLyBub3QgdXNlZCBieSB0aGlzIGltcGxlbWVudGF0aW9uXG5cbnZhciByb290UGFyZW50ID0ge31cblxuLyoqXG4gKiBJZiBgQnVmZmVyLlRZUEVEX0FSUkFZX1NVUFBPUlRgOlxuICogICA9PT0gdHJ1ZSAgICBVc2UgVWludDhBcnJheSBpbXBsZW1lbnRhdGlvbiAoZmFzdGVzdClcbiAqICAgPT09IGZhbHNlICAgVXNlIE9iamVjdCBpbXBsZW1lbnRhdGlvbiAobW9zdCBjb21wYXRpYmxlLCBldmVuIElFNilcbiAqXG4gKiBCcm93c2VycyB0aGF0IHN1cHBvcnQgdHlwZWQgYXJyYXlzIGFyZSBJRSAxMCssIEZpcmVmb3ggNCssIENocm9tZSA3KywgU2FmYXJpIDUuMSssXG4gKiBPcGVyYSAxMS42KywgaU9TIDQuMisuXG4gKlxuICogTm90ZTpcbiAqXG4gKiAtIEltcGxlbWVudGF0aW9uIG11c3Qgc3VwcG9ydCBhZGRpbmcgbmV3IHByb3BlcnRpZXMgdG8gYFVpbnQ4QXJyYXlgIGluc3RhbmNlcy5cbiAqICAgRmlyZWZveCA0LTI5IGxhY2tlZCBzdXBwb3J0LCBmaXhlZCBpbiBGaXJlZm94IDMwKy5cbiAqICAgU2VlOiBodHRwczovL2J1Z3ppbGxhLm1vemlsbGEub3JnL3Nob3dfYnVnLmNnaT9pZD02OTU0MzguXG4gKlxuICogIC0gQ2hyb21lIDktMTAgaXMgbWlzc2luZyB0aGUgYFR5cGVkQXJyYXkucHJvdG90eXBlLnN1YmFycmF5YCBmdW5jdGlvbi5cbiAqXG4gKiAgLSBJRTEwIGhhcyBhIGJyb2tlbiBgVHlwZWRBcnJheS5wcm90b3R5cGUuc3ViYXJyYXlgIGZ1bmN0aW9uIHdoaWNoIHJldHVybnMgYXJyYXlzIG9mXG4gKiAgICBpbmNvcnJlY3QgbGVuZ3RoIGluIHNvbWUgc2l0dWF0aW9ucy5cbiAqXG4gKiBXZSBkZXRlY3QgdGhlc2UgYnVnZ3kgYnJvd3NlcnMgYW5kIHNldCBgQnVmZmVyLlRZUEVEX0FSUkFZX1NVUFBPUlRgIHRvIGBmYWxzZWAgc28gdGhleSB3aWxsXG4gKiBnZXQgdGhlIE9iamVjdCBpbXBsZW1lbnRhdGlvbiwgd2hpY2ggaXMgc2xvd2VyIGJ1dCB3aWxsIHdvcmsgY29ycmVjdGx5LlxuICovXG5CdWZmZXIuVFlQRURfQVJSQVlfU1VQUE9SVCA9IChmdW5jdGlvbiAoKSB7XG4gIHRyeSB7XG4gICAgdmFyIGJ1ZiA9IG5ldyBBcnJheUJ1ZmZlcigwKVxuICAgIHZhciBhcnIgPSBuZXcgVWludDhBcnJheShidWYpXG4gICAgYXJyLmZvbyA9IGZ1bmN0aW9uICgpIHsgcmV0dXJuIDQyIH1cbiAgICByZXR1cm4gYXJyLmZvbygpID09PSA0MiAmJiAvLyB0eXBlZCBhcnJheSBpbnN0YW5jZXMgY2FuIGJlIGF1Z21lbnRlZFxuICAgICAgICB0eXBlb2YgYXJyLnN1YmFycmF5ID09PSAnZnVuY3Rpb24nICYmIC8vIGNocm9tZSA5LTEwIGxhY2sgYHN1YmFycmF5YFxuICAgICAgICBuZXcgVWludDhBcnJheSgxKS5zdWJhcnJheSgxLCAxKS5ieXRlTGVuZ3RoID09PSAwIC8vIGllMTAgaGFzIGJyb2tlbiBgc3ViYXJyYXlgXG4gIH0gY2F0Y2ggKGUpIHtcbiAgICByZXR1cm4gZmFsc2VcbiAgfVxufSkoKVxuXG5mdW5jdGlvbiBrTWF4TGVuZ3RoICgpIHtcbiAgcmV0dXJuIEJ1ZmZlci5UWVBFRF9BUlJBWV9TVVBQT1JUXG4gICAgPyAweDdmZmZmZmZmXG4gICAgOiAweDNmZmZmZmZmXG59XG5cbi8qKlxuICogQ2xhc3M6IEJ1ZmZlclxuICogPT09PT09PT09PT09PVxuICpcbiAqIFRoZSBCdWZmZXIgY29uc3RydWN0b3IgcmV0dXJucyBpbnN0YW5jZXMgb2YgYFVpbnQ4QXJyYXlgIHRoYXQgYXJlIGF1Z21lbnRlZFxuICogd2l0aCBmdW5jdGlvbiBwcm9wZXJ0aWVzIGZvciBhbGwgdGhlIG5vZGUgYEJ1ZmZlcmAgQVBJIGZ1bmN0aW9ucy4gV2UgdXNlXG4gKiBgVWludDhBcnJheWAgc28gdGhhdCBzcXVhcmUgYnJhY2tldCBub3RhdGlvbiB3b3JrcyBhcyBleHBlY3RlZCAtLSBpdCByZXR1cm5zXG4gKiBhIHNpbmdsZSBvY3RldC5cbiAqXG4gKiBCeSBhdWdtZW50aW5nIHRoZSBpbnN0YW5jZXMsIHdlIGNhbiBhdm9pZCBtb2RpZnlpbmcgdGhlIGBVaW50OEFycmF5YFxuICogcHJvdG90eXBlLlxuICovXG5mdW5jdGlvbiBCdWZmZXIgKGFyZykge1xuICBpZiAoISh0aGlzIGluc3RhbmNlb2YgQnVmZmVyKSkge1xuICAgIC8vIEF2b2lkIGdvaW5nIHRocm91Z2ggYW4gQXJndW1lbnRzQWRhcHRvclRyYW1wb2xpbmUgaW4gdGhlIGNvbW1vbiBjYXNlLlxuICAgIGlmIChhcmd1bWVudHMubGVuZ3RoID4gMSkgcmV0dXJuIG5ldyBCdWZmZXIoYXJnLCBhcmd1bWVudHNbMV0pXG4gICAgcmV0dXJuIG5ldyBCdWZmZXIoYXJnKVxuICB9XG5cbiAgdGhpcy5sZW5ndGggPSAwXG4gIHRoaXMucGFyZW50ID0gdW5kZWZpbmVkXG5cbiAgLy8gQ29tbW9uIGNhc2UuXG4gIGlmICh0eXBlb2YgYXJnID09PSAnbnVtYmVyJykge1xuICAgIHJldHVybiBmcm9tTnVtYmVyKHRoaXMsIGFyZylcbiAgfVxuXG4gIC8vIFNsaWdodGx5IGxlc3MgY29tbW9uIGNhc2UuXG4gIGlmICh0eXBlb2YgYXJnID09PSAnc3RyaW5nJykge1xuICAgIHJldHVybiBmcm9tU3RyaW5nKHRoaXMsIGFyZywgYXJndW1lbnRzLmxlbmd0aCA+IDEgPyBhcmd1bWVudHNbMV0gOiAndXRmOCcpXG4gIH1cblxuICAvLyBVbnVzdWFsLlxuICByZXR1cm4gZnJvbU9iamVjdCh0aGlzLCBhcmcpXG59XG5cbmZ1bmN0aW9uIGZyb21OdW1iZXIgKHRoYXQsIGxlbmd0aCkge1xuICB0aGF0ID0gYWxsb2NhdGUodGhhdCwgbGVuZ3RoIDwgMCA/IDAgOiBjaGVja2VkKGxlbmd0aCkgfCAwKVxuICBpZiAoIUJ1ZmZlci5UWVBFRF9BUlJBWV9TVVBQT1JUKSB7XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBsZW5ndGg7IGkrKykge1xuICAgICAgdGhhdFtpXSA9IDBcbiAgICB9XG4gIH1cbiAgcmV0dXJuIHRoYXRcbn1cblxuZnVuY3Rpb24gZnJvbVN0cmluZyAodGhhdCwgc3RyaW5nLCBlbmNvZGluZykge1xuICBpZiAodHlwZW9mIGVuY29kaW5nICE9PSAnc3RyaW5nJyB8fCBlbmNvZGluZyA9PT0gJycpIGVuY29kaW5nID0gJ3V0ZjgnXG5cbiAgLy8gQXNzdW1wdGlvbjogYnl0ZUxlbmd0aCgpIHJldHVybiB2YWx1ZSBpcyBhbHdheXMgPCBrTWF4TGVuZ3RoLlxuICB2YXIgbGVuZ3RoID0gYnl0ZUxlbmd0aChzdHJpbmcsIGVuY29kaW5nKSB8IDBcbiAgdGhhdCA9IGFsbG9jYXRlKHRoYXQsIGxlbmd0aClcblxuICB0aGF0LndyaXRlKHN0cmluZywgZW5jb2RpbmcpXG4gIHJldHVybiB0aGF0XG59XG5cbmZ1bmN0aW9uIGZyb21PYmplY3QgKHRoYXQsIG9iamVjdCkge1xuICBpZiAoQnVmZmVyLmlzQnVmZmVyKG9iamVjdCkpIHJldHVybiBmcm9tQnVmZmVyKHRoYXQsIG9iamVjdClcblxuICBpZiAoaXNBcnJheShvYmplY3QpKSByZXR1cm4gZnJvbUFycmF5KHRoYXQsIG9iamVjdClcblxuICBpZiAob2JqZWN0ID09IG51bGwpIHtcbiAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdtdXN0IHN0YXJ0IHdpdGggbnVtYmVyLCBidWZmZXIsIGFycmF5IG9yIHN0cmluZycpXG4gIH1cblxuICBpZiAodHlwZW9mIEFycmF5QnVmZmVyICE9PSAndW5kZWZpbmVkJyAmJiBvYmplY3QuYnVmZmVyIGluc3RhbmNlb2YgQXJyYXlCdWZmZXIpIHtcbiAgICByZXR1cm4gZnJvbVR5cGVkQXJyYXkodGhhdCwgb2JqZWN0KVxuICB9XG5cbiAgaWYgKG9iamVjdC5sZW5ndGgpIHJldHVybiBmcm9tQXJyYXlMaWtlKHRoYXQsIG9iamVjdClcblxuICByZXR1cm4gZnJvbUpzb25PYmplY3QodGhhdCwgb2JqZWN0KVxufVxuXG5mdW5jdGlvbiBmcm9tQnVmZmVyICh0aGF0LCBidWZmZXIpIHtcbiAgdmFyIGxlbmd0aCA9IGNoZWNrZWQoYnVmZmVyLmxlbmd0aCkgfCAwXG4gIHRoYXQgPSBhbGxvY2F0ZSh0aGF0LCBsZW5ndGgpXG4gIGJ1ZmZlci5jb3B5KHRoYXQsIDAsIDAsIGxlbmd0aClcbiAgcmV0dXJuIHRoYXRcbn1cblxuZnVuY3Rpb24gZnJvbUFycmF5ICh0aGF0LCBhcnJheSkge1xuICB2YXIgbGVuZ3RoID0gY2hlY2tlZChhcnJheS5sZW5ndGgpIHwgMFxuICB0aGF0ID0gYWxsb2NhdGUodGhhdCwgbGVuZ3RoKVxuICBmb3IgKHZhciBpID0gMDsgaSA8IGxlbmd0aDsgaSArPSAxKSB7XG4gICAgdGhhdFtpXSA9IGFycmF5W2ldICYgMjU1XG4gIH1cbiAgcmV0dXJuIHRoYXRcbn1cblxuLy8gRHVwbGljYXRlIG9mIGZyb21BcnJheSgpIHRvIGtlZXAgZnJvbUFycmF5KCkgbW9ub21vcnBoaWMuXG5mdW5jdGlvbiBmcm9tVHlwZWRBcnJheSAodGhhdCwgYXJyYXkpIHtcbiAgdmFyIGxlbmd0aCA9IGNoZWNrZWQoYXJyYXkubGVuZ3RoKSB8IDBcbiAgdGhhdCA9IGFsbG9jYXRlKHRoYXQsIGxlbmd0aClcbiAgLy8gVHJ1bmNhdGluZyB0aGUgZWxlbWVudHMgaXMgcHJvYmFibHkgbm90IHdoYXQgcGVvcGxlIGV4cGVjdCBmcm9tIHR5cGVkXG4gIC8vIGFycmF5cyB3aXRoIEJZVEVTX1BFUl9FTEVNRU5UID4gMSBidXQgaXQncyBjb21wYXRpYmxlIHdpdGggdGhlIGJlaGF2aW9yXG4gIC8vIG9mIHRoZSBvbGQgQnVmZmVyIGNvbnN0cnVjdG9yLlxuICBmb3IgKHZhciBpID0gMDsgaSA8IGxlbmd0aDsgaSArPSAxKSB7XG4gICAgdGhhdFtpXSA9IGFycmF5W2ldICYgMjU1XG4gIH1cbiAgcmV0dXJuIHRoYXRcbn1cblxuZnVuY3Rpb24gZnJvbUFycmF5TGlrZSAodGhhdCwgYXJyYXkpIHtcbiAgdmFyIGxlbmd0aCA9IGNoZWNrZWQoYXJyYXkubGVuZ3RoKSB8IDBcbiAgdGhhdCA9IGFsbG9jYXRlKHRoYXQsIGxlbmd0aClcbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBsZW5ndGg7IGkgKz0gMSkge1xuICAgIHRoYXRbaV0gPSBhcnJheVtpXSAmIDI1NVxuICB9XG4gIHJldHVybiB0aGF0XG59XG5cbi8vIERlc2VyaWFsaXplIHsgdHlwZTogJ0J1ZmZlcicsIGRhdGE6IFsxLDIsMywuLi5dIH0gaW50byBhIEJ1ZmZlciBvYmplY3QuXG4vLyBSZXR1cm5zIGEgemVyby1sZW5ndGggYnVmZmVyIGZvciBpbnB1dHMgdGhhdCBkb24ndCBjb25mb3JtIHRvIHRoZSBzcGVjLlxuZnVuY3Rpb24gZnJvbUpzb25PYmplY3QgKHRoYXQsIG9iamVjdCkge1xuICB2YXIgYXJyYXlcbiAgdmFyIGxlbmd0aCA9IDBcblxuICBpZiAob2JqZWN0LnR5cGUgPT09ICdCdWZmZXInICYmIGlzQXJyYXkob2JqZWN0LmRhdGEpKSB7XG4gICAgYXJyYXkgPSBvYmplY3QuZGF0YVxuICAgIGxlbmd0aCA9IGNoZWNrZWQoYXJyYXkubGVuZ3RoKSB8IDBcbiAgfVxuICB0aGF0ID0gYWxsb2NhdGUodGhhdCwgbGVuZ3RoKVxuXG4gIGZvciAodmFyIGkgPSAwOyBpIDwgbGVuZ3RoOyBpICs9IDEpIHtcbiAgICB0aGF0W2ldID0gYXJyYXlbaV0gJiAyNTVcbiAgfVxuICByZXR1cm4gdGhhdFxufVxuXG5mdW5jdGlvbiBhbGxvY2F0ZSAodGhhdCwgbGVuZ3RoKSB7XG4gIGlmIChCdWZmZXIuVFlQRURfQVJSQVlfU1VQUE9SVCkge1xuICAgIC8vIFJldHVybiBhbiBhdWdtZW50ZWQgYFVpbnQ4QXJyYXlgIGluc3RhbmNlLCBmb3IgYmVzdCBwZXJmb3JtYW5jZVxuICAgIHRoYXQgPSBCdWZmZXIuX2F1Z21lbnQobmV3IFVpbnQ4QXJyYXkobGVuZ3RoKSlcbiAgfSBlbHNlIHtcbiAgICAvLyBGYWxsYmFjazogUmV0dXJuIGFuIG9iamVjdCBpbnN0YW5jZSBvZiB0aGUgQnVmZmVyIGNsYXNzXG4gICAgdGhhdC5sZW5ndGggPSBsZW5ndGhcbiAgICB0aGF0Ll9pc0J1ZmZlciA9IHRydWVcbiAgfVxuXG4gIHZhciBmcm9tUG9vbCA9IGxlbmd0aCAhPT0gMCAmJiBsZW5ndGggPD0gQnVmZmVyLnBvb2xTaXplID4+PiAxXG4gIGlmIChmcm9tUG9vbCkgdGhhdC5wYXJlbnQgPSByb290UGFyZW50XG5cbiAgcmV0dXJuIHRoYXRcbn1cblxuZnVuY3Rpb24gY2hlY2tlZCAobGVuZ3RoKSB7XG4gIC8vIE5vdGU6IGNhbm5vdCB1c2UgYGxlbmd0aCA8IGtNYXhMZW5ndGhgIGhlcmUgYmVjYXVzZSB0aGF0IGZhaWxzIHdoZW5cbiAgLy8gbGVuZ3RoIGlzIE5hTiAod2hpY2ggaXMgb3RoZXJ3aXNlIGNvZXJjZWQgdG8gemVyby4pXG4gIGlmIChsZW5ndGggPj0ga01heExlbmd0aCgpKSB7XG4gICAgdGhyb3cgbmV3IFJhbmdlRXJyb3IoJ0F0dGVtcHQgdG8gYWxsb2NhdGUgQnVmZmVyIGxhcmdlciB0aGFuIG1heGltdW0gJyArXG4gICAgICAgICAgICAgICAgICAgICAgICAgJ3NpemU6IDB4JyArIGtNYXhMZW5ndGgoKS50b1N0cmluZygxNikgKyAnIGJ5dGVzJylcbiAgfVxuICByZXR1cm4gbGVuZ3RoIHwgMFxufVxuXG5mdW5jdGlvbiBTbG93QnVmZmVyIChzdWJqZWN0LCBlbmNvZGluZykge1xuICBpZiAoISh0aGlzIGluc3RhbmNlb2YgU2xvd0J1ZmZlcikpIHJldHVybiBuZXcgU2xvd0J1ZmZlcihzdWJqZWN0LCBlbmNvZGluZylcblxuICB2YXIgYnVmID0gbmV3IEJ1ZmZlcihzdWJqZWN0LCBlbmNvZGluZylcbiAgZGVsZXRlIGJ1Zi5wYXJlbnRcbiAgcmV0dXJuIGJ1ZlxufVxuXG5CdWZmZXIuaXNCdWZmZXIgPSBmdW5jdGlvbiBpc0J1ZmZlciAoYikge1xuICByZXR1cm4gISEoYiAhPSBudWxsICYmIGIuX2lzQnVmZmVyKVxufVxuXG5CdWZmZXIuY29tcGFyZSA9IGZ1bmN0aW9uIGNvbXBhcmUgKGEsIGIpIHtcbiAgaWYgKCFCdWZmZXIuaXNCdWZmZXIoYSkgfHwgIUJ1ZmZlci5pc0J1ZmZlcihiKSkge1xuICAgIHRocm93IG5ldyBUeXBlRXJyb3IoJ0FyZ3VtZW50cyBtdXN0IGJlIEJ1ZmZlcnMnKVxuICB9XG5cbiAgaWYgKGEgPT09IGIpIHJldHVybiAwXG5cbiAgdmFyIHggPSBhLmxlbmd0aFxuICB2YXIgeSA9IGIubGVuZ3RoXG5cbiAgdmFyIGkgPSAwXG4gIHZhciBsZW4gPSBNYXRoLm1pbih4LCB5KVxuICB3aGlsZSAoaSA8IGxlbikge1xuICAgIGlmIChhW2ldICE9PSBiW2ldKSBicmVha1xuXG4gICAgKytpXG4gIH1cblxuICBpZiAoaSAhPT0gbGVuKSB7XG4gICAgeCA9IGFbaV1cbiAgICB5ID0gYltpXVxuICB9XG5cbiAgaWYgKHggPCB5KSByZXR1cm4gLTFcbiAgaWYgKHkgPCB4KSByZXR1cm4gMVxuICByZXR1cm4gMFxufVxuXG5CdWZmZXIuaXNFbmNvZGluZyA9IGZ1bmN0aW9uIGlzRW5jb2RpbmcgKGVuY29kaW5nKSB7XG4gIHN3aXRjaCAoU3RyaW5nKGVuY29kaW5nKS50b0xvd2VyQ2FzZSgpKSB7XG4gICAgY2FzZSAnaGV4JzpcbiAgICBjYXNlICd1dGY4JzpcbiAgICBjYXNlICd1dGYtOCc6XG4gICAgY2FzZSAnYXNjaWknOlxuICAgIGNhc2UgJ2JpbmFyeSc6XG4gICAgY2FzZSAnYmFzZTY0JzpcbiAgICBjYXNlICdyYXcnOlxuICAgIGNhc2UgJ3VjczInOlxuICAgIGNhc2UgJ3Vjcy0yJzpcbiAgICBjYXNlICd1dGYxNmxlJzpcbiAgICBjYXNlICd1dGYtMTZsZSc6XG4gICAgICByZXR1cm4gdHJ1ZVxuICAgIGRlZmF1bHQ6XG4gICAgICByZXR1cm4gZmFsc2VcbiAgfVxufVxuXG5CdWZmZXIuY29uY2F0ID0gZnVuY3Rpb24gY29uY2F0IChsaXN0LCBsZW5ndGgpIHtcbiAgaWYgKCFpc0FycmF5KGxpc3QpKSB0aHJvdyBuZXcgVHlwZUVycm9yKCdsaXN0IGFyZ3VtZW50IG11c3QgYmUgYW4gQXJyYXkgb2YgQnVmZmVycy4nKVxuXG4gIGlmIChsaXN0Lmxlbmd0aCA9PT0gMCkge1xuICAgIHJldHVybiBuZXcgQnVmZmVyKDApXG4gIH0gZWxzZSBpZiAobGlzdC5sZW5ndGggPT09IDEpIHtcbiAgICByZXR1cm4gbGlzdFswXVxuICB9XG5cbiAgdmFyIGlcbiAgaWYgKGxlbmd0aCA9PT0gdW5kZWZpbmVkKSB7XG4gICAgbGVuZ3RoID0gMFxuICAgIGZvciAoaSA9IDA7IGkgPCBsaXN0Lmxlbmd0aDsgaSsrKSB7XG4gICAgICBsZW5ndGggKz0gbGlzdFtpXS5sZW5ndGhcbiAgICB9XG4gIH1cblxuICB2YXIgYnVmID0gbmV3IEJ1ZmZlcihsZW5ndGgpXG4gIHZhciBwb3MgPSAwXG4gIGZvciAoaSA9IDA7IGkgPCBsaXN0Lmxlbmd0aDsgaSsrKSB7XG4gICAgdmFyIGl0ZW0gPSBsaXN0W2ldXG4gICAgaXRlbS5jb3B5KGJ1ZiwgcG9zKVxuICAgIHBvcyArPSBpdGVtLmxlbmd0aFxuICB9XG4gIHJldHVybiBidWZcbn1cblxuZnVuY3Rpb24gYnl0ZUxlbmd0aCAoc3RyaW5nLCBlbmNvZGluZykge1xuICBpZiAodHlwZW9mIHN0cmluZyAhPT0gJ3N0cmluZycpIHN0cmluZyA9ICcnICsgc3RyaW5nXG5cbiAgdmFyIGxlbiA9IHN0cmluZy5sZW5ndGhcbiAgaWYgKGxlbiA9PT0gMCkgcmV0dXJuIDBcblxuICAvLyBVc2UgYSBmb3IgbG9vcCB0byBhdm9pZCByZWN1cnNpb25cbiAgdmFyIGxvd2VyZWRDYXNlID0gZmFsc2VcbiAgZm9yICg7Oykge1xuICAgIHN3aXRjaCAoZW5jb2RpbmcpIHtcbiAgICAgIGNhc2UgJ2FzY2lpJzpcbiAgICAgIGNhc2UgJ2JpbmFyeSc6XG4gICAgICAvLyBEZXByZWNhdGVkXG4gICAgICBjYXNlICdyYXcnOlxuICAgICAgY2FzZSAncmF3cyc6XG4gICAgICAgIHJldHVybiBsZW5cbiAgICAgIGNhc2UgJ3V0ZjgnOlxuICAgICAgY2FzZSAndXRmLTgnOlxuICAgICAgICByZXR1cm4gdXRmOFRvQnl0ZXMoc3RyaW5nKS5sZW5ndGhcbiAgICAgIGNhc2UgJ3VjczInOlxuICAgICAgY2FzZSAndWNzLTInOlxuICAgICAgY2FzZSAndXRmMTZsZSc6XG4gICAgICBjYXNlICd1dGYtMTZsZSc6XG4gICAgICAgIHJldHVybiBsZW4gKiAyXG4gICAgICBjYXNlICdoZXgnOlxuICAgICAgICByZXR1cm4gbGVuID4+PiAxXG4gICAgICBjYXNlICdiYXNlNjQnOlxuICAgICAgICByZXR1cm4gYmFzZTY0VG9CeXRlcyhzdHJpbmcpLmxlbmd0aFxuICAgICAgZGVmYXVsdDpcbiAgICAgICAgaWYgKGxvd2VyZWRDYXNlKSByZXR1cm4gdXRmOFRvQnl0ZXMoc3RyaW5nKS5sZW5ndGggLy8gYXNzdW1lIHV0ZjhcbiAgICAgICAgZW5jb2RpbmcgPSAoJycgKyBlbmNvZGluZykudG9Mb3dlckNhc2UoKVxuICAgICAgICBsb3dlcmVkQ2FzZSA9IHRydWVcbiAgICB9XG4gIH1cbn1cbkJ1ZmZlci5ieXRlTGVuZ3RoID0gYnl0ZUxlbmd0aFxuXG4vLyBwcmUtc2V0IGZvciB2YWx1ZXMgdGhhdCBtYXkgZXhpc3QgaW4gdGhlIGZ1dHVyZVxuQnVmZmVyLnByb3RvdHlwZS5sZW5ndGggPSB1bmRlZmluZWRcbkJ1ZmZlci5wcm90b3R5cGUucGFyZW50ID0gdW5kZWZpbmVkXG5cbmZ1bmN0aW9uIHNsb3dUb1N0cmluZyAoZW5jb2RpbmcsIHN0YXJ0LCBlbmQpIHtcbiAgdmFyIGxvd2VyZWRDYXNlID0gZmFsc2VcblxuICBzdGFydCA9IHN0YXJ0IHwgMFxuICBlbmQgPSBlbmQgPT09IHVuZGVmaW5lZCB8fCBlbmQgPT09IEluZmluaXR5ID8gdGhpcy5sZW5ndGggOiBlbmQgfCAwXG5cbiAgaWYgKCFlbmNvZGluZykgZW5jb2RpbmcgPSAndXRmOCdcbiAgaWYgKHN0YXJ0IDwgMCkgc3RhcnQgPSAwXG4gIGlmIChlbmQgPiB0aGlzLmxlbmd0aCkgZW5kID0gdGhpcy5sZW5ndGhcbiAgaWYgKGVuZCA8PSBzdGFydCkgcmV0dXJuICcnXG5cbiAgd2hpbGUgKHRydWUpIHtcbiAgICBzd2l0Y2ggKGVuY29kaW5nKSB7XG4gICAgICBjYXNlICdoZXgnOlxuICAgICAgICByZXR1cm4gaGV4U2xpY2UodGhpcywgc3RhcnQsIGVuZClcblxuICAgICAgY2FzZSAndXRmOCc6XG4gICAgICBjYXNlICd1dGYtOCc6XG4gICAgICAgIHJldHVybiB1dGY4U2xpY2UodGhpcywgc3RhcnQsIGVuZClcblxuICAgICAgY2FzZSAnYXNjaWknOlxuICAgICAgICByZXR1cm4gYXNjaWlTbGljZSh0aGlzLCBzdGFydCwgZW5kKVxuXG4gICAgICBjYXNlICdiaW5hcnknOlxuICAgICAgICByZXR1cm4gYmluYXJ5U2xpY2UodGhpcywgc3RhcnQsIGVuZClcblxuICAgICAgY2FzZSAnYmFzZTY0JzpcbiAgICAgICAgcmV0dXJuIGJhc2U2NFNsaWNlKHRoaXMsIHN0YXJ0LCBlbmQpXG5cbiAgICAgIGNhc2UgJ3VjczInOlxuICAgICAgY2FzZSAndWNzLTInOlxuICAgICAgY2FzZSAndXRmMTZsZSc6XG4gICAgICBjYXNlICd1dGYtMTZsZSc6XG4gICAgICAgIHJldHVybiB1dGYxNmxlU2xpY2UodGhpcywgc3RhcnQsIGVuZClcblxuICAgICAgZGVmYXVsdDpcbiAgICAgICAgaWYgKGxvd2VyZWRDYXNlKSB0aHJvdyBuZXcgVHlwZUVycm9yKCdVbmtub3duIGVuY29kaW5nOiAnICsgZW5jb2RpbmcpXG4gICAgICAgIGVuY29kaW5nID0gKGVuY29kaW5nICsgJycpLnRvTG93ZXJDYXNlKClcbiAgICAgICAgbG93ZXJlZENhc2UgPSB0cnVlXG4gICAgfVxuICB9XG59XG5cbkJ1ZmZlci5wcm90b3R5cGUudG9TdHJpbmcgPSBmdW5jdGlvbiB0b1N0cmluZyAoKSB7XG4gIHZhciBsZW5ndGggPSB0aGlzLmxlbmd0aCB8IDBcbiAgaWYgKGxlbmd0aCA9PT0gMCkgcmV0dXJuICcnXG4gIGlmIChhcmd1bWVudHMubGVuZ3RoID09PSAwKSByZXR1cm4gdXRmOFNsaWNlKHRoaXMsIDAsIGxlbmd0aClcbiAgcmV0dXJuIHNsb3dUb1N0cmluZy5hcHBseSh0aGlzLCBhcmd1bWVudHMpXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUuZXF1YWxzID0gZnVuY3Rpb24gZXF1YWxzIChiKSB7XG4gIGlmICghQnVmZmVyLmlzQnVmZmVyKGIpKSB0aHJvdyBuZXcgVHlwZUVycm9yKCdBcmd1bWVudCBtdXN0IGJlIGEgQnVmZmVyJylcbiAgaWYgKHRoaXMgPT09IGIpIHJldHVybiB0cnVlXG4gIHJldHVybiBCdWZmZXIuY29tcGFyZSh0aGlzLCBiKSA9PT0gMFxufVxuXG5CdWZmZXIucHJvdG90eXBlLmluc3BlY3QgPSBmdW5jdGlvbiBpbnNwZWN0ICgpIHtcbiAgdmFyIHN0ciA9ICcnXG4gIHZhciBtYXggPSBleHBvcnRzLklOU1BFQ1RfTUFYX0JZVEVTXG4gIGlmICh0aGlzLmxlbmd0aCA+IDApIHtcbiAgICBzdHIgPSB0aGlzLnRvU3RyaW5nKCdoZXgnLCAwLCBtYXgpLm1hdGNoKC8uezJ9L2cpLmpvaW4oJyAnKVxuICAgIGlmICh0aGlzLmxlbmd0aCA+IG1heCkgc3RyICs9ICcgLi4uICdcbiAgfVxuICByZXR1cm4gJzxCdWZmZXIgJyArIHN0ciArICc+J1xufVxuXG5CdWZmZXIucHJvdG90eXBlLmNvbXBhcmUgPSBmdW5jdGlvbiBjb21wYXJlIChiKSB7XG4gIGlmICghQnVmZmVyLmlzQnVmZmVyKGIpKSB0aHJvdyBuZXcgVHlwZUVycm9yKCdBcmd1bWVudCBtdXN0IGJlIGEgQnVmZmVyJylcbiAgaWYgKHRoaXMgPT09IGIpIHJldHVybiAwXG4gIHJldHVybiBCdWZmZXIuY29tcGFyZSh0aGlzLCBiKVxufVxuXG5CdWZmZXIucHJvdG90eXBlLmluZGV4T2YgPSBmdW5jdGlvbiBpbmRleE9mICh2YWwsIGJ5dGVPZmZzZXQpIHtcbiAgaWYgKGJ5dGVPZmZzZXQgPiAweDdmZmZmZmZmKSBieXRlT2Zmc2V0ID0gMHg3ZmZmZmZmZlxuICBlbHNlIGlmIChieXRlT2Zmc2V0IDwgLTB4ODAwMDAwMDApIGJ5dGVPZmZzZXQgPSAtMHg4MDAwMDAwMFxuICBieXRlT2Zmc2V0ID4+PSAwXG5cbiAgaWYgKHRoaXMubGVuZ3RoID09PSAwKSByZXR1cm4gLTFcbiAgaWYgKGJ5dGVPZmZzZXQgPj0gdGhpcy5sZW5ndGgpIHJldHVybiAtMVxuXG4gIC8vIE5lZ2F0aXZlIG9mZnNldHMgc3RhcnQgZnJvbSB0aGUgZW5kIG9mIHRoZSBidWZmZXJcbiAgaWYgKGJ5dGVPZmZzZXQgPCAwKSBieXRlT2Zmc2V0ID0gTWF0aC5tYXgodGhpcy5sZW5ndGggKyBieXRlT2Zmc2V0LCAwKVxuXG4gIGlmICh0eXBlb2YgdmFsID09PSAnc3RyaW5nJykge1xuICAgIGlmICh2YWwubGVuZ3RoID09PSAwKSByZXR1cm4gLTEgLy8gc3BlY2lhbCBjYXNlOiBsb29raW5nIGZvciBlbXB0eSBzdHJpbmcgYWx3YXlzIGZhaWxzXG4gICAgcmV0dXJuIFN0cmluZy5wcm90b3R5cGUuaW5kZXhPZi5jYWxsKHRoaXMsIHZhbCwgYnl0ZU9mZnNldClcbiAgfVxuICBpZiAoQnVmZmVyLmlzQnVmZmVyKHZhbCkpIHtcbiAgICByZXR1cm4gYXJyYXlJbmRleE9mKHRoaXMsIHZhbCwgYnl0ZU9mZnNldClcbiAgfVxuICBpZiAodHlwZW9mIHZhbCA9PT0gJ251bWJlcicpIHtcbiAgICBpZiAoQnVmZmVyLlRZUEVEX0FSUkFZX1NVUFBPUlQgJiYgVWludDhBcnJheS5wcm90b3R5cGUuaW5kZXhPZiA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgcmV0dXJuIFVpbnQ4QXJyYXkucHJvdG90eXBlLmluZGV4T2YuY2FsbCh0aGlzLCB2YWwsIGJ5dGVPZmZzZXQpXG4gICAgfVxuICAgIHJldHVybiBhcnJheUluZGV4T2YodGhpcywgWyB2YWwgXSwgYnl0ZU9mZnNldClcbiAgfVxuXG4gIGZ1bmN0aW9uIGFycmF5SW5kZXhPZiAoYXJyLCB2YWwsIGJ5dGVPZmZzZXQpIHtcbiAgICB2YXIgZm91bmRJbmRleCA9IC0xXG4gICAgZm9yICh2YXIgaSA9IDA7IGJ5dGVPZmZzZXQgKyBpIDwgYXJyLmxlbmd0aDsgaSsrKSB7XG4gICAgICBpZiAoYXJyW2J5dGVPZmZzZXQgKyBpXSA9PT0gdmFsW2ZvdW5kSW5kZXggPT09IC0xID8gMCA6IGkgLSBmb3VuZEluZGV4XSkge1xuICAgICAgICBpZiAoZm91bmRJbmRleCA9PT0gLTEpIGZvdW5kSW5kZXggPSBpXG4gICAgICAgIGlmIChpIC0gZm91bmRJbmRleCArIDEgPT09IHZhbC5sZW5ndGgpIHJldHVybiBieXRlT2Zmc2V0ICsgZm91bmRJbmRleFxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgZm91bmRJbmRleCA9IC0xXG4gICAgICB9XG4gICAgfVxuICAgIHJldHVybiAtMVxuICB9XG5cbiAgdGhyb3cgbmV3IFR5cGVFcnJvcigndmFsIG11c3QgYmUgc3RyaW5nLCBudW1iZXIgb3IgQnVmZmVyJylcbn1cblxuLy8gYGdldGAgd2lsbCBiZSByZW1vdmVkIGluIE5vZGUgMC4xMytcbkJ1ZmZlci5wcm90b3R5cGUuZ2V0ID0gZnVuY3Rpb24gZ2V0IChvZmZzZXQpIHtcbiAgY29uc29sZS5sb2coJy5nZXQoKSBpcyBkZXByZWNhdGVkLiBBY2Nlc3MgdXNpbmcgYXJyYXkgaW5kZXhlcyBpbnN0ZWFkLicpXG4gIHJldHVybiB0aGlzLnJlYWRVSW50OChvZmZzZXQpXG59XG5cbi8vIGBzZXRgIHdpbGwgYmUgcmVtb3ZlZCBpbiBOb2RlIDAuMTMrXG5CdWZmZXIucHJvdG90eXBlLnNldCA9IGZ1bmN0aW9uIHNldCAodiwgb2Zmc2V0KSB7XG4gIGNvbnNvbGUubG9nKCcuc2V0KCkgaXMgZGVwcmVjYXRlZC4gQWNjZXNzIHVzaW5nIGFycmF5IGluZGV4ZXMgaW5zdGVhZC4nKVxuICByZXR1cm4gdGhpcy53cml0ZVVJbnQ4KHYsIG9mZnNldClcbn1cblxuZnVuY3Rpb24gaGV4V3JpdGUgKGJ1Ziwgc3RyaW5nLCBvZmZzZXQsIGxlbmd0aCkge1xuICBvZmZzZXQgPSBOdW1iZXIob2Zmc2V0KSB8fCAwXG4gIHZhciByZW1haW5pbmcgPSBidWYubGVuZ3RoIC0gb2Zmc2V0XG4gIGlmICghbGVuZ3RoKSB7XG4gICAgbGVuZ3RoID0gcmVtYWluaW5nXG4gIH0gZWxzZSB7XG4gICAgbGVuZ3RoID0gTnVtYmVyKGxlbmd0aClcbiAgICBpZiAobGVuZ3RoID4gcmVtYWluaW5nKSB7XG4gICAgICBsZW5ndGggPSByZW1haW5pbmdcbiAgICB9XG4gIH1cblxuICAvLyBtdXN0IGJlIGFuIGV2ZW4gbnVtYmVyIG9mIGRpZ2l0c1xuICB2YXIgc3RyTGVuID0gc3RyaW5nLmxlbmd0aFxuICBpZiAoc3RyTGVuICUgMiAhPT0gMCkgdGhyb3cgbmV3IEVycm9yKCdJbnZhbGlkIGhleCBzdHJpbmcnKVxuXG4gIGlmIChsZW5ndGggPiBzdHJMZW4gLyAyKSB7XG4gICAgbGVuZ3RoID0gc3RyTGVuIC8gMlxuICB9XG4gIGZvciAodmFyIGkgPSAwOyBpIDwgbGVuZ3RoOyBpKyspIHtcbiAgICB2YXIgcGFyc2VkID0gcGFyc2VJbnQoc3RyaW5nLnN1YnN0cihpICogMiwgMiksIDE2KVxuICAgIGlmIChpc05hTihwYXJzZWQpKSB0aHJvdyBuZXcgRXJyb3IoJ0ludmFsaWQgaGV4IHN0cmluZycpXG4gICAgYnVmW29mZnNldCArIGldID0gcGFyc2VkXG4gIH1cbiAgcmV0dXJuIGlcbn1cblxuZnVuY3Rpb24gdXRmOFdyaXRlIChidWYsIHN0cmluZywgb2Zmc2V0LCBsZW5ndGgpIHtcbiAgcmV0dXJuIGJsaXRCdWZmZXIodXRmOFRvQnl0ZXMoc3RyaW5nLCBidWYubGVuZ3RoIC0gb2Zmc2V0KSwgYnVmLCBvZmZzZXQsIGxlbmd0aClcbn1cblxuZnVuY3Rpb24gYXNjaWlXcml0ZSAoYnVmLCBzdHJpbmcsIG9mZnNldCwgbGVuZ3RoKSB7XG4gIHJldHVybiBibGl0QnVmZmVyKGFzY2lpVG9CeXRlcyhzdHJpbmcpLCBidWYsIG9mZnNldCwgbGVuZ3RoKVxufVxuXG5mdW5jdGlvbiBiaW5hcnlXcml0ZSAoYnVmLCBzdHJpbmcsIG9mZnNldCwgbGVuZ3RoKSB7XG4gIHJldHVybiBhc2NpaVdyaXRlKGJ1Ziwgc3RyaW5nLCBvZmZzZXQsIGxlbmd0aClcbn1cblxuZnVuY3Rpb24gYmFzZTY0V3JpdGUgKGJ1Ziwgc3RyaW5nLCBvZmZzZXQsIGxlbmd0aCkge1xuICByZXR1cm4gYmxpdEJ1ZmZlcihiYXNlNjRUb0J5dGVzKHN0cmluZyksIGJ1Ziwgb2Zmc2V0LCBsZW5ndGgpXG59XG5cbmZ1bmN0aW9uIHVjczJXcml0ZSAoYnVmLCBzdHJpbmcsIG9mZnNldCwgbGVuZ3RoKSB7XG4gIHJldHVybiBibGl0QnVmZmVyKHV0ZjE2bGVUb0J5dGVzKHN0cmluZywgYnVmLmxlbmd0aCAtIG9mZnNldCksIGJ1Ziwgb2Zmc2V0LCBsZW5ndGgpXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUud3JpdGUgPSBmdW5jdGlvbiB3cml0ZSAoc3RyaW5nLCBvZmZzZXQsIGxlbmd0aCwgZW5jb2RpbmcpIHtcbiAgLy8gQnVmZmVyI3dyaXRlKHN0cmluZylcbiAgaWYgKG9mZnNldCA9PT0gdW5kZWZpbmVkKSB7XG4gICAgZW5jb2RpbmcgPSAndXRmOCdcbiAgICBsZW5ndGggPSB0aGlzLmxlbmd0aFxuICAgIG9mZnNldCA9IDBcbiAgLy8gQnVmZmVyI3dyaXRlKHN0cmluZywgZW5jb2RpbmcpXG4gIH0gZWxzZSBpZiAobGVuZ3RoID09PSB1bmRlZmluZWQgJiYgdHlwZW9mIG9mZnNldCA9PT0gJ3N0cmluZycpIHtcbiAgICBlbmNvZGluZyA9IG9mZnNldFxuICAgIGxlbmd0aCA9IHRoaXMubGVuZ3RoXG4gICAgb2Zmc2V0ID0gMFxuICAvLyBCdWZmZXIjd3JpdGUoc3RyaW5nLCBvZmZzZXRbLCBsZW5ndGhdWywgZW5jb2RpbmddKVxuICB9IGVsc2UgaWYgKGlzRmluaXRlKG9mZnNldCkpIHtcbiAgICBvZmZzZXQgPSBvZmZzZXQgfCAwXG4gICAgaWYgKGlzRmluaXRlKGxlbmd0aCkpIHtcbiAgICAgIGxlbmd0aCA9IGxlbmd0aCB8IDBcbiAgICAgIGlmIChlbmNvZGluZyA9PT0gdW5kZWZpbmVkKSBlbmNvZGluZyA9ICd1dGY4J1xuICAgIH0gZWxzZSB7XG4gICAgICBlbmNvZGluZyA9IGxlbmd0aFxuICAgICAgbGVuZ3RoID0gdW5kZWZpbmVkXG4gICAgfVxuICAvLyBsZWdhY3kgd3JpdGUoc3RyaW5nLCBlbmNvZGluZywgb2Zmc2V0LCBsZW5ndGgpIC0gcmVtb3ZlIGluIHYwLjEzXG4gIH0gZWxzZSB7XG4gICAgdmFyIHN3YXAgPSBlbmNvZGluZ1xuICAgIGVuY29kaW5nID0gb2Zmc2V0XG4gICAgb2Zmc2V0ID0gbGVuZ3RoIHwgMFxuICAgIGxlbmd0aCA9IHN3YXBcbiAgfVxuXG4gIHZhciByZW1haW5pbmcgPSB0aGlzLmxlbmd0aCAtIG9mZnNldFxuICBpZiAobGVuZ3RoID09PSB1bmRlZmluZWQgfHwgbGVuZ3RoID4gcmVtYWluaW5nKSBsZW5ndGggPSByZW1haW5pbmdcblxuICBpZiAoKHN0cmluZy5sZW5ndGggPiAwICYmIChsZW5ndGggPCAwIHx8IG9mZnNldCA8IDApKSB8fCBvZmZzZXQgPiB0aGlzLmxlbmd0aCkge1xuICAgIHRocm93IG5ldyBSYW5nZUVycm9yKCdhdHRlbXB0IHRvIHdyaXRlIG91dHNpZGUgYnVmZmVyIGJvdW5kcycpXG4gIH1cblxuICBpZiAoIWVuY29kaW5nKSBlbmNvZGluZyA9ICd1dGY4J1xuXG4gIHZhciBsb3dlcmVkQ2FzZSA9IGZhbHNlXG4gIGZvciAoOzspIHtcbiAgICBzd2l0Y2ggKGVuY29kaW5nKSB7XG4gICAgICBjYXNlICdoZXgnOlxuICAgICAgICByZXR1cm4gaGV4V3JpdGUodGhpcywgc3RyaW5nLCBvZmZzZXQsIGxlbmd0aClcblxuICAgICAgY2FzZSAndXRmOCc6XG4gICAgICBjYXNlICd1dGYtOCc6XG4gICAgICAgIHJldHVybiB1dGY4V3JpdGUodGhpcywgc3RyaW5nLCBvZmZzZXQsIGxlbmd0aClcblxuICAgICAgY2FzZSAnYXNjaWknOlxuICAgICAgICByZXR1cm4gYXNjaWlXcml0ZSh0aGlzLCBzdHJpbmcsIG9mZnNldCwgbGVuZ3RoKVxuXG4gICAgICBjYXNlICdiaW5hcnknOlxuICAgICAgICByZXR1cm4gYmluYXJ5V3JpdGUodGhpcywgc3RyaW5nLCBvZmZzZXQsIGxlbmd0aClcblxuICAgICAgY2FzZSAnYmFzZTY0JzpcbiAgICAgICAgLy8gV2FybmluZzogbWF4TGVuZ3RoIG5vdCB0YWtlbiBpbnRvIGFjY291bnQgaW4gYmFzZTY0V3JpdGVcbiAgICAgICAgcmV0dXJuIGJhc2U2NFdyaXRlKHRoaXMsIHN0cmluZywgb2Zmc2V0LCBsZW5ndGgpXG5cbiAgICAgIGNhc2UgJ3VjczInOlxuICAgICAgY2FzZSAndWNzLTInOlxuICAgICAgY2FzZSAndXRmMTZsZSc6XG4gICAgICBjYXNlICd1dGYtMTZsZSc6XG4gICAgICAgIHJldHVybiB1Y3MyV3JpdGUodGhpcywgc3RyaW5nLCBvZmZzZXQsIGxlbmd0aClcblxuICAgICAgZGVmYXVsdDpcbiAgICAgICAgaWYgKGxvd2VyZWRDYXNlKSB0aHJvdyBuZXcgVHlwZUVycm9yKCdVbmtub3duIGVuY29kaW5nOiAnICsgZW5jb2RpbmcpXG4gICAgICAgIGVuY29kaW5nID0gKCcnICsgZW5jb2RpbmcpLnRvTG93ZXJDYXNlKClcbiAgICAgICAgbG93ZXJlZENhc2UgPSB0cnVlXG4gICAgfVxuICB9XG59XG5cbkJ1ZmZlci5wcm90b3R5cGUudG9KU09OID0gZnVuY3Rpb24gdG9KU09OICgpIHtcbiAgcmV0dXJuIHtcbiAgICB0eXBlOiAnQnVmZmVyJyxcbiAgICBkYXRhOiBBcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbCh0aGlzLl9hcnIgfHwgdGhpcywgMClcbiAgfVxufVxuXG5mdW5jdGlvbiBiYXNlNjRTbGljZSAoYnVmLCBzdGFydCwgZW5kKSB7XG4gIGlmIChzdGFydCA9PT0gMCAmJiBlbmQgPT09IGJ1Zi5sZW5ndGgpIHtcbiAgICByZXR1cm4gYmFzZTY0LmZyb21CeXRlQXJyYXkoYnVmKVxuICB9IGVsc2Uge1xuICAgIHJldHVybiBiYXNlNjQuZnJvbUJ5dGVBcnJheShidWYuc2xpY2Uoc3RhcnQsIGVuZCkpXG4gIH1cbn1cblxuZnVuY3Rpb24gdXRmOFNsaWNlIChidWYsIHN0YXJ0LCBlbmQpIHtcbiAgdmFyIHJlcyA9ICcnXG4gIHZhciB0bXAgPSAnJ1xuICBlbmQgPSBNYXRoLm1pbihidWYubGVuZ3RoLCBlbmQpXG5cbiAgZm9yICh2YXIgaSA9IHN0YXJ0OyBpIDwgZW5kOyBpKyspIHtcbiAgICBpZiAoYnVmW2ldIDw9IDB4N0YpIHtcbiAgICAgIHJlcyArPSBkZWNvZGVVdGY4Q2hhcih0bXApICsgU3RyaW5nLmZyb21DaGFyQ29kZShidWZbaV0pXG4gICAgICB0bXAgPSAnJ1xuICAgIH0gZWxzZSB7XG4gICAgICB0bXAgKz0gJyUnICsgYnVmW2ldLnRvU3RyaW5nKDE2KVxuICAgIH1cbiAgfVxuXG4gIHJldHVybiByZXMgKyBkZWNvZGVVdGY4Q2hhcih0bXApXG59XG5cbmZ1bmN0aW9uIGFzY2lpU2xpY2UgKGJ1Ziwgc3RhcnQsIGVuZCkge1xuICB2YXIgcmV0ID0gJydcbiAgZW5kID0gTWF0aC5taW4oYnVmLmxlbmd0aCwgZW5kKVxuXG4gIGZvciAodmFyIGkgPSBzdGFydDsgaSA8IGVuZDsgaSsrKSB7XG4gICAgcmV0ICs9IFN0cmluZy5mcm9tQ2hhckNvZGUoYnVmW2ldICYgMHg3RilcbiAgfVxuICByZXR1cm4gcmV0XG59XG5cbmZ1bmN0aW9uIGJpbmFyeVNsaWNlIChidWYsIHN0YXJ0LCBlbmQpIHtcbiAgdmFyIHJldCA9ICcnXG4gIGVuZCA9IE1hdGgubWluKGJ1Zi5sZW5ndGgsIGVuZClcblxuICBmb3IgKHZhciBpID0gc3RhcnQ7IGkgPCBlbmQ7IGkrKykge1xuICAgIHJldCArPSBTdHJpbmcuZnJvbUNoYXJDb2RlKGJ1ZltpXSlcbiAgfVxuICByZXR1cm4gcmV0XG59XG5cbmZ1bmN0aW9uIGhleFNsaWNlIChidWYsIHN0YXJ0LCBlbmQpIHtcbiAgdmFyIGxlbiA9IGJ1Zi5sZW5ndGhcblxuICBpZiAoIXN0YXJ0IHx8IHN0YXJ0IDwgMCkgc3RhcnQgPSAwXG4gIGlmICghZW5kIHx8IGVuZCA8IDAgfHwgZW5kID4gbGVuKSBlbmQgPSBsZW5cblxuICB2YXIgb3V0ID0gJydcbiAgZm9yICh2YXIgaSA9IHN0YXJ0OyBpIDwgZW5kOyBpKyspIHtcbiAgICBvdXQgKz0gdG9IZXgoYnVmW2ldKVxuICB9XG4gIHJldHVybiBvdXRcbn1cblxuZnVuY3Rpb24gdXRmMTZsZVNsaWNlIChidWYsIHN0YXJ0LCBlbmQpIHtcbiAgdmFyIGJ5dGVzID0gYnVmLnNsaWNlKHN0YXJ0LCBlbmQpXG4gIHZhciByZXMgPSAnJ1xuICBmb3IgKHZhciBpID0gMDsgaSA8IGJ5dGVzLmxlbmd0aDsgaSArPSAyKSB7XG4gICAgcmVzICs9IFN0cmluZy5mcm9tQ2hhckNvZGUoYnl0ZXNbaV0gKyBieXRlc1tpICsgMV0gKiAyNTYpXG4gIH1cbiAgcmV0dXJuIHJlc1xufVxuXG5CdWZmZXIucHJvdG90eXBlLnNsaWNlID0gZnVuY3Rpb24gc2xpY2UgKHN0YXJ0LCBlbmQpIHtcbiAgdmFyIGxlbiA9IHRoaXMubGVuZ3RoXG4gIHN0YXJ0ID0gfn5zdGFydFxuICBlbmQgPSBlbmQgPT09IHVuZGVmaW5lZCA/IGxlbiA6IH5+ZW5kXG5cbiAgaWYgKHN0YXJ0IDwgMCkge1xuICAgIHN0YXJ0ICs9IGxlblxuICAgIGlmIChzdGFydCA8IDApIHN0YXJ0ID0gMFxuICB9IGVsc2UgaWYgKHN0YXJ0ID4gbGVuKSB7XG4gICAgc3RhcnQgPSBsZW5cbiAgfVxuXG4gIGlmIChlbmQgPCAwKSB7XG4gICAgZW5kICs9IGxlblxuICAgIGlmIChlbmQgPCAwKSBlbmQgPSAwXG4gIH0gZWxzZSBpZiAoZW5kID4gbGVuKSB7XG4gICAgZW5kID0gbGVuXG4gIH1cblxuICBpZiAoZW5kIDwgc3RhcnQpIGVuZCA9IHN0YXJ0XG5cbiAgdmFyIG5ld0J1ZlxuICBpZiAoQnVmZmVyLlRZUEVEX0FSUkFZX1NVUFBPUlQpIHtcbiAgICBuZXdCdWYgPSBCdWZmZXIuX2F1Z21lbnQodGhpcy5zdWJhcnJheShzdGFydCwgZW5kKSlcbiAgfSBlbHNlIHtcbiAgICB2YXIgc2xpY2VMZW4gPSBlbmQgLSBzdGFydFxuICAgIG5ld0J1ZiA9IG5ldyBCdWZmZXIoc2xpY2VMZW4sIHVuZGVmaW5lZClcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IHNsaWNlTGVuOyBpKyspIHtcbiAgICAgIG5ld0J1ZltpXSA9IHRoaXNbaSArIHN0YXJ0XVxuICAgIH1cbiAgfVxuXG4gIGlmIChuZXdCdWYubGVuZ3RoKSBuZXdCdWYucGFyZW50ID0gdGhpcy5wYXJlbnQgfHwgdGhpc1xuXG4gIHJldHVybiBuZXdCdWZcbn1cblxuLypcbiAqIE5lZWQgdG8gbWFrZSBzdXJlIHRoYXQgYnVmZmVyIGlzbid0IHRyeWluZyB0byB3cml0ZSBvdXQgb2YgYm91bmRzLlxuICovXG5mdW5jdGlvbiBjaGVja09mZnNldCAob2Zmc2V0LCBleHQsIGxlbmd0aCkge1xuICBpZiAoKG9mZnNldCAlIDEpICE9PSAwIHx8IG9mZnNldCA8IDApIHRocm93IG5ldyBSYW5nZUVycm9yKCdvZmZzZXQgaXMgbm90IHVpbnQnKVxuICBpZiAob2Zmc2V0ICsgZXh0ID4gbGVuZ3RoKSB0aHJvdyBuZXcgUmFuZ2VFcnJvcignVHJ5aW5nIHRvIGFjY2VzcyBiZXlvbmQgYnVmZmVyIGxlbmd0aCcpXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUucmVhZFVJbnRMRSA9IGZ1bmN0aW9uIHJlYWRVSW50TEUgKG9mZnNldCwgYnl0ZUxlbmd0aCwgbm9Bc3NlcnQpIHtcbiAgb2Zmc2V0ID0gb2Zmc2V0IHwgMFxuICBieXRlTGVuZ3RoID0gYnl0ZUxlbmd0aCB8IDBcbiAgaWYgKCFub0Fzc2VydCkgY2hlY2tPZmZzZXQob2Zmc2V0LCBieXRlTGVuZ3RoLCB0aGlzLmxlbmd0aClcblxuICB2YXIgdmFsID0gdGhpc1tvZmZzZXRdXG4gIHZhciBtdWwgPSAxXG4gIHZhciBpID0gMFxuICB3aGlsZSAoKytpIDwgYnl0ZUxlbmd0aCAmJiAobXVsICo9IDB4MTAwKSkge1xuICAgIHZhbCArPSB0aGlzW29mZnNldCArIGldICogbXVsXG4gIH1cblxuICByZXR1cm4gdmFsXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUucmVhZFVJbnRCRSA9IGZ1bmN0aW9uIHJlYWRVSW50QkUgKG9mZnNldCwgYnl0ZUxlbmd0aCwgbm9Bc3NlcnQpIHtcbiAgb2Zmc2V0ID0gb2Zmc2V0IHwgMFxuICBieXRlTGVuZ3RoID0gYnl0ZUxlbmd0aCB8IDBcbiAgaWYgKCFub0Fzc2VydCkge1xuICAgIGNoZWNrT2Zmc2V0KG9mZnNldCwgYnl0ZUxlbmd0aCwgdGhpcy5sZW5ndGgpXG4gIH1cblxuICB2YXIgdmFsID0gdGhpc1tvZmZzZXQgKyAtLWJ5dGVMZW5ndGhdXG4gIHZhciBtdWwgPSAxXG4gIHdoaWxlIChieXRlTGVuZ3RoID4gMCAmJiAobXVsICo9IDB4MTAwKSkge1xuICAgIHZhbCArPSB0aGlzW29mZnNldCArIC0tYnl0ZUxlbmd0aF0gKiBtdWxcbiAgfVxuXG4gIHJldHVybiB2YWxcbn1cblxuQnVmZmVyLnByb3RvdHlwZS5yZWFkVUludDggPSBmdW5jdGlvbiByZWFkVUludDggKG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgaWYgKCFub0Fzc2VydCkgY2hlY2tPZmZzZXQob2Zmc2V0LCAxLCB0aGlzLmxlbmd0aClcbiAgcmV0dXJuIHRoaXNbb2Zmc2V0XVxufVxuXG5CdWZmZXIucHJvdG90eXBlLnJlYWRVSW50MTZMRSA9IGZ1bmN0aW9uIHJlYWRVSW50MTZMRSAob2Zmc2V0LCBub0Fzc2VydCkge1xuICBpZiAoIW5vQXNzZXJ0KSBjaGVja09mZnNldChvZmZzZXQsIDIsIHRoaXMubGVuZ3RoKVxuICByZXR1cm4gdGhpc1tvZmZzZXRdIHwgKHRoaXNbb2Zmc2V0ICsgMV0gPDwgOClcbn1cblxuQnVmZmVyLnByb3RvdHlwZS5yZWFkVUludDE2QkUgPSBmdW5jdGlvbiByZWFkVUludDE2QkUgKG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgaWYgKCFub0Fzc2VydCkgY2hlY2tPZmZzZXQob2Zmc2V0LCAyLCB0aGlzLmxlbmd0aClcbiAgcmV0dXJuICh0aGlzW29mZnNldF0gPDwgOCkgfCB0aGlzW29mZnNldCArIDFdXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUucmVhZFVJbnQzMkxFID0gZnVuY3Rpb24gcmVhZFVJbnQzMkxFIChvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIGlmICghbm9Bc3NlcnQpIGNoZWNrT2Zmc2V0KG9mZnNldCwgNCwgdGhpcy5sZW5ndGgpXG5cbiAgcmV0dXJuICgodGhpc1tvZmZzZXRdKSB8XG4gICAgICAodGhpc1tvZmZzZXQgKyAxXSA8PCA4KSB8XG4gICAgICAodGhpc1tvZmZzZXQgKyAyXSA8PCAxNikpICtcbiAgICAgICh0aGlzW29mZnNldCArIDNdICogMHgxMDAwMDAwKVxufVxuXG5CdWZmZXIucHJvdG90eXBlLnJlYWRVSW50MzJCRSA9IGZ1bmN0aW9uIHJlYWRVSW50MzJCRSAob2Zmc2V0LCBub0Fzc2VydCkge1xuICBpZiAoIW5vQXNzZXJ0KSBjaGVja09mZnNldChvZmZzZXQsIDQsIHRoaXMubGVuZ3RoKVxuXG4gIHJldHVybiAodGhpc1tvZmZzZXRdICogMHgxMDAwMDAwKSArXG4gICAgKCh0aGlzW29mZnNldCArIDFdIDw8IDE2KSB8XG4gICAgKHRoaXNbb2Zmc2V0ICsgMl0gPDwgOCkgfFxuICAgIHRoaXNbb2Zmc2V0ICsgM10pXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUucmVhZEludExFID0gZnVuY3Rpb24gcmVhZEludExFIChvZmZzZXQsIGJ5dGVMZW5ndGgsIG5vQXNzZXJ0KSB7XG4gIG9mZnNldCA9IG9mZnNldCB8IDBcbiAgYnl0ZUxlbmd0aCA9IGJ5dGVMZW5ndGggfCAwXG4gIGlmICghbm9Bc3NlcnQpIGNoZWNrT2Zmc2V0KG9mZnNldCwgYnl0ZUxlbmd0aCwgdGhpcy5sZW5ndGgpXG5cbiAgdmFyIHZhbCA9IHRoaXNbb2Zmc2V0XVxuICB2YXIgbXVsID0gMVxuICB2YXIgaSA9IDBcbiAgd2hpbGUgKCsraSA8IGJ5dGVMZW5ndGggJiYgKG11bCAqPSAweDEwMCkpIHtcbiAgICB2YWwgKz0gdGhpc1tvZmZzZXQgKyBpXSAqIG11bFxuICB9XG4gIG11bCAqPSAweDgwXG5cbiAgaWYgKHZhbCA+PSBtdWwpIHZhbCAtPSBNYXRoLnBvdygyLCA4ICogYnl0ZUxlbmd0aClcblxuICByZXR1cm4gdmFsXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUucmVhZEludEJFID0gZnVuY3Rpb24gcmVhZEludEJFIChvZmZzZXQsIGJ5dGVMZW5ndGgsIG5vQXNzZXJ0KSB7XG4gIG9mZnNldCA9IG9mZnNldCB8IDBcbiAgYnl0ZUxlbmd0aCA9IGJ5dGVMZW5ndGggfCAwXG4gIGlmICghbm9Bc3NlcnQpIGNoZWNrT2Zmc2V0KG9mZnNldCwgYnl0ZUxlbmd0aCwgdGhpcy5sZW5ndGgpXG5cbiAgdmFyIGkgPSBieXRlTGVuZ3RoXG4gIHZhciBtdWwgPSAxXG4gIHZhciB2YWwgPSB0aGlzW29mZnNldCArIC0taV1cbiAgd2hpbGUgKGkgPiAwICYmIChtdWwgKj0gMHgxMDApKSB7XG4gICAgdmFsICs9IHRoaXNbb2Zmc2V0ICsgLS1pXSAqIG11bFxuICB9XG4gIG11bCAqPSAweDgwXG5cbiAgaWYgKHZhbCA+PSBtdWwpIHZhbCAtPSBNYXRoLnBvdygyLCA4ICogYnl0ZUxlbmd0aClcblxuICByZXR1cm4gdmFsXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUucmVhZEludDggPSBmdW5jdGlvbiByZWFkSW50OCAob2Zmc2V0LCBub0Fzc2VydCkge1xuICBpZiAoIW5vQXNzZXJ0KSBjaGVja09mZnNldChvZmZzZXQsIDEsIHRoaXMubGVuZ3RoKVxuICBpZiAoISh0aGlzW29mZnNldF0gJiAweDgwKSkgcmV0dXJuICh0aGlzW29mZnNldF0pXG4gIHJldHVybiAoKDB4ZmYgLSB0aGlzW29mZnNldF0gKyAxKSAqIC0xKVxufVxuXG5CdWZmZXIucHJvdG90eXBlLnJlYWRJbnQxNkxFID0gZnVuY3Rpb24gcmVhZEludDE2TEUgKG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgaWYgKCFub0Fzc2VydCkgY2hlY2tPZmZzZXQob2Zmc2V0LCAyLCB0aGlzLmxlbmd0aClcbiAgdmFyIHZhbCA9IHRoaXNbb2Zmc2V0XSB8ICh0aGlzW29mZnNldCArIDFdIDw8IDgpXG4gIHJldHVybiAodmFsICYgMHg4MDAwKSA/IHZhbCB8IDB4RkZGRjAwMDAgOiB2YWxcbn1cblxuQnVmZmVyLnByb3RvdHlwZS5yZWFkSW50MTZCRSA9IGZ1bmN0aW9uIHJlYWRJbnQxNkJFIChvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIGlmICghbm9Bc3NlcnQpIGNoZWNrT2Zmc2V0KG9mZnNldCwgMiwgdGhpcy5sZW5ndGgpXG4gIHZhciB2YWwgPSB0aGlzW29mZnNldCArIDFdIHwgKHRoaXNbb2Zmc2V0XSA8PCA4KVxuICByZXR1cm4gKHZhbCAmIDB4ODAwMCkgPyB2YWwgfCAweEZGRkYwMDAwIDogdmFsXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUucmVhZEludDMyTEUgPSBmdW5jdGlvbiByZWFkSW50MzJMRSAob2Zmc2V0LCBub0Fzc2VydCkge1xuICBpZiAoIW5vQXNzZXJ0KSBjaGVja09mZnNldChvZmZzZXQsIDQsIHRoaXMubGVuZ3RoKVxuXG4gIHJldHVybiAodGhpc1tvZmZzZXRdKSB8XG4gICAgKHRoaXNbb2Zmc2V0ICsgMV0gPDwgOCkgfFxuICAgICh0aGlzW29mZnNldCArIDJdIDw8IDE2KSB8XG4gICAgKHRoaXNbb2Zmc2V0ICsgM10gPDwgMjQpXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUucmVhZEludDMyQkUgPSBmdW5jdGlvbiByZWFkSW50MzJCRSAob2Zmc2V0LCBub0Fzc2VydCkge1xuICBpZiAoIW5vQXNzZXJ0KSBjaGVja09mZnNldChvZmZzZXQsIDQsIHRoaXMubGVuZ3RoKVxuXG4gIHJldHVybiAodGhpc1tvZmZzZXRdIDw8IDI0KSB8XG4gICAgKHRoaXNbb2Zmc2V0ICsgMV0gPDwgMTYpIHxcbiAgICAodGhpc1tvZmZzZXQgKyAyXSA8PCA4KSB8XG4gICAgKHRoaXNbb2Zmc2V0ICsgM10pXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUucmVhZEZsb2F0TEUgPSBmdW5jdGlvbiByZWFkRmxvYXRMRSAob2Zmc2V0LCBub0Fzc2VydCkge1xuICBpZiAoIW5vQXNzZXJ0KSBjaGVja09mZnNldChvZmZzZXQsIDQsIHRoaXMubGVuZ3RoKVxuICByZXR1cm4gaWVlZTc1NC5yZWFkKHRoaXMsIG9mZnNldCwgdHJ1ZSwgMjMsIDQpXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUucmVhZEZsb2F0QkUgPSBmdW5jdGlvbiByZWFkRmxvYXRCRSAob2Zmc2V0LCBub0Fzc2VydCkge1xuICBpZiAoIW5vQXNzZXJ0KSBjaGVja09mZnNldChvZmZzZXQsIDQsIHRoaXMubGVuZ3RoKVxuICByZXR1cm4gaWVlZTc1NC5yZWFkKHRoaXMsIG9mZnNldCwgZmFsc2UsIDIzLCA0KVxufVxuXG5CdWZmZXIucHJvdG90eXBlLnJlYWREb3VibGVMRSA9IGZ1bmN0aW9uIHJlYWREb3VibGVMRSAob2Zmc2V0LCBub0Fzc2VydCkge1xuICBpZiAoIW5vQXNzZXJ0KSBjaGVja09mZnNldChvZmZzZXQsIDgsIHRoaXMubGVuZ3RoKVxuICByZXR1cm4gaWVlZTc1NC5yZWFkKHRoaXMsIG9mZnNldCwgdHJ1ZSwgNTIsIDgpXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUucmVhZERvdWJsZUJFID0gZnVuY3Rpb24gcmVhZERvdWJsZUJFIChvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIGlmICghbm9Bc3NlcnQpIGNoZWNrT2Zmc2V0KG9mZnNldCwgOCwgdGhpcy5sZW5ndGgpXG4gIHJldHVybiBpZWVlNzU0LnJlYWQodGhpcywgb2Zmc2V0LCBmYWxzZSwgNTIsIDgpXG59XG5cbmZ1bmN0aW9uIGNoZWNrSW50IChidWYsIHZhbHVlLCBvZmZzZXQsIGV4dCwgbWF4LCBtaW4pIHtcbiAgaWYgKCFCdWZmZXIuaXNCdWZmZXIoYnVmKSkgdGhyb3cgbmV3IFR5cGVFcnJvcignYnVmZmVyIG11c3QgYmUgYSBCdWZmZXIgaW5zdGFuY2UnKVxuICBpZiAodmFsdWUgPiBtYXggfHwgdmFsdWUgPCBtaW4pIHRocm93IG5ldyBSYW5nZUVycm9yKCd2YWx1ZSBpcyBvdXQgb2YgYm91bmRzJylcbiAgaWYgKG9mZnNldCArIGV4dCA+IGJ1Zi5sZW5ndGgpIHRocm93IG5ldyBSYW5nZUVycm9yKCdpbmRleCBvdXQgb2YgcmFuZ2UnKVxufVxuXG5CdWZmZXIucHJvdG90eXBlLndyaXRlVUludExFID0gZnVuY3Rpb24gd3JpdGVVSW50TEUgKHZhbHVlLCBvZmZzZXQsIGJ5dGVMZW5ndGgsIG5vQXNzZXJ0KSB7XG4gIHZhbHVlID0gK3ZhbHVlXG4gIG9mZnNldCA9IG9mZnNldCB8IDBcbiAgYnl0ZUxlbmd0aCA9IGJ5dGVMZW5ndGggfCAwXG4gIGlmICghbm9Bc3NlcnQpIGNoZWNrSW50KHRoaXMsIHZhbHVlLCBvZmZzZXQsIGJ5dGVMZW5ndGgsIE1hdGgucG93KDIsIDggKiBieXRlTGVuZ3RoKSwgMClcblxuICB2YXIgbXVsID0gMVxuICB2YXIgaSA9IDBcbiAgdGhpc1tvZmZzZXRdID0gdmFsdWUgJiAweEZGXG4gIHdoaWxlICgrK2kgPCBieXRlTGVuZ3RoICYmIChtdWwgKj0gMHgxMDApKSB7XG4gICAgdGhpc1tvZmZzZXQgKyBpXSA9ICh2YWx1ZSAvIG11bCkgJiAweEZGXG4gIH1cblxuICByZXR1cm4gb2Zmc2V0ICsgYnl0ZUxlbmd0aFxufVxuXG5CdWZmZXIucHJvdG90eXBlLndyaXRlVUludEJFID0gZnVuY3Rpb24gd3JpdGVVSW50QkUgKHZhbHVlLCBvZmZzZXQsIGJ5dGVMZW5ndGgsIG5vQXNzZXJ0KSB7XG4gIHZhbHVlID0gK3ZhbHVlXG4gIG9mZnNldCA9IG9mZnNldCB8IDBcbiAgYnl0ZUxlbmd0aCA9IGJ5dGVMZW5ndGggfCAwXG4gIGlmICghbm9Bc3NlcnQpIGNoZWNrSW50KHRoaXMsIHZhbHVlLCBvZmZzZXQsIGJ5dGVMZW5ndGgsIE1hdGgucG93KDIsIDggKiBieXRlTGVuZ3RoKSwgMClcblxuICB2YXIgaSA9IGJ5dGVMZW5ndGggLSAxXG4gIHZhciBtdWwgPSAxXG4gIHRoaXNbb2Zmc2V0ICsgaV0gPSB2YWx1ZSAmIDB4RkZcbiAgd2hpbGUgKC0taSA+PSAwICYmIChtdWwgKj0gMHgxMDApKSB7XG4gICAgdGhpc1tvZmZzZXQgKyBpXSA9ICh2YWx1ZSAvIG11bCkgJiAweEZGXG4gIH1cblxuICByZXR1cm4gb2Zmc2V0ICsgYnl0ZUxlbmd0aFxufVxuXG5CdWZmZXIucHJvdG90eXBlLndyaXRlVUludDggPSBmdW5jdGlvbiB3cml0ZVVJbnQ4ICh2YWx1ZSwgb2Zmc2V0LCBub0Fzc2VydCkge1xuICB2YWx1ZSA9ICt2YWx1ZVxuICBvZmZzZXQgPSBvZmZzZXQgfCAwXG4gIGlmICghbm9Bc3NlcnQpIGNoZWNrSW50KHRoaXMsIHZhbHVlLCBvZmZzZXQsIDEsIDB4ZmYsIDApXG4gIGlmICghQnVmZmVyLlRZUEVEX0FSUkFZX1NVUFBPUlQpIHZhbHVlID0gTWF0aC5mbG9vcih2YWx1ZSlcbiAgdGhpc1tvZmZzZXRdID0gdmFsdWVcbiAgcmV0dXJuIG9mZnNldCArIDFcbn1cblxuZnVuY3Rpb24gb2JqZWN0V3JpdGVVSW50MTYgKGJ1ZiwgdmFsdWUsIG9mZnNldCwgbGl0dGxlRW5kaWFuKSB7XG4gIGlmICh2YWx1ZSA8IDApIHZhbHVlID0gMHhmZmZmICsgdmFsdWUgKyAxXG4gIGZvciAodmFyIGkgPSAwLCBqID0gTWF0aC5taW4oYnVmLmxlbmd0aCAtIG9mZnNldCwgMik7IGkgPCBqOyBpKyspIHtcbiAgICBidWZbb2Zmc2V0ICsgaV0gPSAodmFsdWUgJiAoMHhmZiA8PCAoOCAqIChsaXR0bGVFbmRpYW4gPyBpIDogMSAtIGkpKSkpID4+PlxuICAgICAgKGxpdHRsZUVuZGlhbiA/IGkgOiAxIC0gaSkgKiA4XG4gIH1cbn1cblxuQnVmZmVyLnByb3RvdHlwZS53cml0ZVVJbnQxNkxFID0gZnVuY3Rpb24gd3JpdGVVSW50MTZMRSAodmFsdWUsIG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgdmFsdWUgPSArdmFsdWVcbiAgb2Zmc2V0ID0gb2Zmc2V0IHwgMFxuICBpZiAoIW5vQXNzZXJ0KSBjaGVja0ludCh0aGlzLCB2YWx1ZSwgb2Zmc2V0LCAyLCAweGZmZmYsIDApXG4gIGlmIChCdWZmZXIuVFlQRURfQVJSQVlfU1VQUE9SVCkge1xuICAgIHRoaXNbb2Zmc2V0XSA9IHZhbHVlXG4gICAgdGhpc1tvZmZzZXQgKyAxXSA9ICh2YWx1ZSA+Pj4gOClcbiAgfSBlbHNlIHtcbiAgICBvYmplY3RXcml0ZVVJbnQxNih0aGlzLCB2YWx1ZSwgb2Zmc2V0LCB0cnVlKVxuICB9XG4gIHJldHVybiBvZmZzZXQgKyAyXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUud3JpdGVVSW50MTZCRSA9IGZ1bmN0aW9uIHdyaXRlVUludDE2QkUgKHZhbHVlLCBvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIHZhbHVlID0gK3ZhbHVlXG4gIG9mZnNldCA9IG9mZnNldCB8IDBcbiAgaWYgKCFub0Fzc2VydCkgY2hlY2tJbnQodGhpcywgdmFsdWUsIG9mZnNldCwgMiwgMHhmZmZmLCAwKVxuICBpZiAoQnVmZmVyLlRZUEVEX0FSUkFZX1NVUFBPUlQpIHtcbiAgICB0aGlzW29mZnNldF0gPSAodmFsdWUgPj4+IDgpXG4gICAgdGhpc1tvZmZzZXQgKyAxXSA9IHZhbHVlXG4gIH0gZWxzZSB7XG4gICAgb2JqZWN0V3JpdGVVSW50MTYodGhpcywgdmFsdWUsIG9mZnNldCwgZmFsc2UpXG4gIH1cbiAgcmV0dXJuIG9mZnNldCArIDJcbn1cblxuZnVuY3Rpb24gb2JqZWN0V3JpdGVVSW50MzIgKGJ1ZiwgdmFsdWUsIG9mZnNldCwgbGl0dGxlRW5kaWFuKSB7XG4gIGlmICh2YWx1ZSA8IDApIHZhbHVlID0gMHhmZmZmZmZmZiArIHZhbHVlICsgMVxuICBmb3IgKHZhciBpID0gMCwgaiA9IE1hdGgubWluKGJ1Zi5sZW5ndGggLSBvZmZzZXQsIDQpOyBpIDwgajsgaSsrKSB7XG4gICAgYnVmW29mZnNldCArIGldID0gKHZhbHVlID4+PiAobGl0dGxlRW5kaWFuID8gaSA6IDMgLSBpKSAqIDgpICYgMHhmZlxuICB9XG59XG5cbkJ1ZmZlci5wcm90b3R5cGUud3JpdGVVSW50MzJMRSA9IGZ1bmN0aW9uIHdyaXRlVUludDMyTEUgKHZhbHVlLCBvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIHZhbHVlID0gK3ZhbHVlXG4gIG9mZnNldCA9IG9mZnNldCB8IDBcbiAgaWYgKCFub0Fzc2VydCkgY2hlY2tJbnQodGhpcywgdmFsdWUsIG9mZnNldCwgNCwgMHhmZmZmZmZmZiwgMClcbiAgaWYgKEJ1ZmZlci5UWVBFRF9BUlJBWV9TVVBQT1JUKSB7XG4gICAgdGhpc1tvZmZzZXQgKyAzXSA9ICh2YWx1ZSA+Pj4gMjQpXG4gICAgdGhpc1tvZmZzZXQgKyAyXSA9ICh2YWx1ZSA+Pj4gMTYpXG4gICAgdGhpc1tvZmZzZXQgKyAxXSA9ICh2YWx1ZSA+Pj4gOClcbiAgICB0aGlzW29mZnNldF0gPSB2YWx1ZVxuICB9IGVsc2Uge1xuICAgIG9iamVjdFdyaXRlVUludDMyKHRoaXMsIHZhbHVlLCBvZmZzZXQsIHRydWUpXG4gIH1cbiAgcmV0dXJuIG9mZnNldCArIDRcbn1cblxuQnVmZmVyLnByb3RvdHlwZS53cml0ZVVJbnQzMkJFID0gZnVuY3Rpb24gd3JpdGVVSW50MzJCRSAodmFsdWUsIG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgdmFsdWUgPSArdmFsdWVcbiAgb2Zmc2V0ID0gb2Zmc2V0IHwgMFxuICBpZiAoIW5vQXNzZXJ0KSBjaGVja0ludCh0aGlzLCB2YWx1ZSwgb2Zmc2V0LCA0LCAweGZmZmZmZmZmLCAwKVxuICBpZiAoQnVmZmVyLlRZUEVEX0FSUkFZX1NVUFBPUlQpIHtcbiAgICB0aGlzW29mZnNldF0gPSAodmFsdWUgPj4+IDI0KVxuICAgIHRoaXNbb2Zmc2V0ICsgMV0gPSAodmFsdWUgPj4+IDE2KVxuICAgIHRoaXNbb2Zmc2V0ICsgMl0gPSAodmFsdWUgPj4+IDgpXG4gICAgdGhpc1tvZmZzZXQgKyAzXSA9IHZhbHVlXG4gIH0gZWxzZSB7XG4gICAgb2JqZWN0V3JpdGVVSW50MzIodGhpcywgdmFsdWUsIG9mZnNldCwgZmFsc2UpXG4gIH1cbiAgcmV0dXJuIG9mZnNldCArIDRcbn1cblxuQnVmZmVyLnByb3RvdHlwZS53cml0ZUludExFID0gZnVuY3Rpb24gd3JpdGVJbnRMRSAodmFsdWUsIG9mZnNldCwgYnl0ZUxlbmd0aCwgbm9Bc3NlcnQpIHtcbiAgdmFsdWUgPSArdmFsdWVcbiAgb2Zmc2V0ID0gb2Zmc2V0IHwgMFxuICBpZiAoIW5vQXNzZXJ0KSB7XG4gICAgdmFyIGxpbWl0ID0gTWF0aC5wb3coMiwgOCAqIGJ5dGVMZW5ndGggLSAxKVxuXG4gICAgY2hlY2tJbnQodGhpcywgdmFsdWUsIG9mZnNldCwgYnl0ZUxlbmd0aCwgbGltaXQgLSAxLCAtbGltaXQpXG4gIH1cblxuICB2YXIgaSA9IDBcbiAgdmFyIG11bCA9IDFcbiAgdmFyIHN1YiA9IHZhbHVlIDwgMCA/IDEgOiAwXG4gIHRoaXNbb2Zmc2V0XSA9IHZhbHVlICYgMHhGRlxuICB3aGlsZSAoKytpIDwgYnl0ZUxlbmd0aCAmJiAobXVsICo9IDB4MTAwKSkge1xuICAgIHRoaXNbb2Zmc2V0ICsgaV0gPSAoKHZhbHVlIC8gbXVsKSA+PiAwKSAtIHN1YiAmIDB4RkZcbiAgfVxuXG4gIHJldHVybiBvZmZzZXQgKyBieXRlTGVuZ3RoXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUud3JpdGVJbnRCRSA9IGZ1bmN0aW9uIHdyaXRlSW50QkUgKHZhbHVlLCBvZmZzZXQsIGJ5dGVMZW5ndGgsIG5vQXNzZXJ0KSB7XG4gIHZhbHVlID0gK3ZhbHVlXG4gIG9mZnNldCA9IG9mZnNldCB8IDBcbiAgaWYgKCFub0Fzc2VydCkge1xuICAgIHZhciBsaW1pdCA9IE1hdGgucG93KDIsIDggKiBieXRlTGVuZ3RoIC0gMSlcblxuICAgIGNoZWNrSW50KHRoaXMsIHZhbHVlLCBvZmZzZXQsIGJ5dGVMZW5ndGgsIGxpbWl0IC0gMSwgLWxpbWl0KVxuICB9XG5cbiAgdmFyIGkgPSBieXRlTGVuZ3RoIC0gMVxuICB2YXIgbXVsID0gMVxuICB2YXIgc3ViID0gdmFsdWUgPCAwID8gMSA6IDBcbiAgdGhpc1tvZmZzZXQgKyBpXSA9IHZhbHVlICYgMHhGRlxuICB3aGlsZSAoLS1pID49IDAgJiYgKG11bCAqPSAweDEwMCkpIHtcbiAgICB0aGlzW29mZnNldCArIGldID0gKCh2YWx1ZSAvIG11bCkgPj4gMCkgLSBzdWIgJiAweEZGXG4gIH1cblxuICByZXR1cm4gb2Zmc2V0ICsgYnl0ZUxlbmd0aFxufVxuXG5CdWZmZXIucHJvdG90eXBlLndyaXRlSW50OCA9IGZ1bmN0aW9uIHdyaXRlSW50OCAodmFsdWUsIG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgdmFsdWUgPSArdmFsdWVcbiAgb2Zmc2V0ID0gb2Zmc2V0IHwgMFxuICBpZiAoIW5vQXNzZXJ0KSBjaGVja0ludCh0aGlzLCB2YWx1ZSwgb2Zmc2V0LCAxLCAweDdmLCAtMHg4MClcbiAgaWYgKCFCdWZmZXIuVFlQRURfQVJSQVlfU1VQUE9SVCkgdmFsdWUgPSBNYXRoLmZsb29yKHZhbHVlKVxuICBpZiAodmFsdWUgPCAwKSB2YWx1ZSA9IDB4ZmYgKyB2YWx1ZSArIDFcbiAgdGhpc1tvZmZzZXRdID0gdmFsdWVcbiAgcmV0dXJuIG9mZnNldCArIDFcbn1cblxuQnVmZmVyLnByb3RvdHlwZS53cml0ZUludDE2TEUgPSBmdW5jdGlvbiB3cml0ZUludDE2TEUgKHZhbHVlLCBvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIHZhbHVlID0gK3ZhbHVlXG4gIG9mZnNldCA9IG9mZnNldCB8IDBcbiAgaWYgKCFub0Fzc2VydCkgY2hlY2tJbnQodGhpcywgdmFsdWUsIG9mZnNldCwgMiwgMHg3ZmZmLCAtMHg4MDAwKVxuICBpZiAoQnVmZmVyLlRZUEVEX0FSUkFZX1NVUFBPUlQpIHtcbiAgICB0aGlzW29mZnNldF0gPSB2YWx1ZVxuICAgIHRoaXNbb2Zmc2V0ICsgMV0gPSAodmFsdWUgPj4+IDgpXG4gIH0gZWxzZSB7XG4gICAgb2JqZWN0V3JpdGVVSW50MTYodGhpcywgdmFsdWUsIG9mZnNldCwgdHJ1ZSlcbiAgfVxuICByZXR1cm4gb2Zmc2V0ICsgMlxufVxuXG5CdWZmZXIucHJvdG90eXBlLndyaXRlSW50MTZCRSA9IGZ1bmN0aW9uIHdyaXRlSW50MTZCRSAodmFsdWUsIG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgdmFsdWUgPSArdmFsdWVcbiAgb2Zmc2V0ID0gb2Zmc2V0IHwgMFxuICBpZiAoIW5vQXNzZXJ0KSBjaGVja0ludCh0aGlzLCB2YWx1ZSwgb2Zmc2V0LCAyLCAweDdmZmYsIC0weDgwMDApXG4gIGlmIChCdWZmZXIuVFlQRURfQVJSQVlfU1VQUE9SVCkge1xuICAgIHRoaXNbb2Zmc2V0XSA9ICh2YWx1ZSA+Pj4gOClcbiAgICB0aGlzW29mZnNldCArIDFdID0gdmFsdWVcbiAgfSBlbHNlIHtcbiAgICBvYmplY3RXcml0ZVVJbnQxNih0aGlzLCB2YWx1ZSwgb2Zmc2V0LCBmYWxzZSlcbiAgfVxuICByZXR1cm4gb2Zmc2V0ICsgMlxufVxuXG5CdWZmZXIucHJvdG90eXBlLndyaXRlSW50MzJMRSA9IGZ1bmN0aW9uIHdyaXRlSW50MzJMRSAodmFsdWUsIG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgdmFsdWUgPSArdmFsdWVcbiAgb2Zmc2V0ID0gb2Zmc2V0IHwgMFxuICBpZiAoIW5vQXNzZXJ0KSBjaGVja0ludCh0aGlzLCB2YWx1ZSwgb2Zmc2V0LCA0LCAweDdmZmZmZmZmLCAtMHg4MDAwMDAwMClcbiAgaWYgKEJ1ZmZlci5UWVBFRF9BUlJBWV9TVVBQT1JUKSB7XG4gICAgdGhpc1tvZmZzZXRdID0gdmFsdWVcbiAgICB0aGlzW29mZnNldCArIDFdID0gKHZhbHVlID4+PiA4KVxuICAgIHRoaXNbb2Zmc2V0ICsgMl0gPSAodmFsdWUgPj4+IDE2KVxuICAgIHRoaXNbb2Zmc2V0ICsgM10gPSAodmFsdWUgPj4+IDI0KVxuICB9IGVsc2Uge1xuICAgIG9iamVjdFdyaXRlVUludDMyKHRoaXMsIHZhbHVlLCBvZmZzZXQsIHRydWUpXG4gIH1cbiAgcmV0dXJuIG9mZnNldCArIDRcbn1cblxuQnVmZmVyLnByb3RvdHlwZS53cml0ZUludDMyQkUgPSBmdW5jdGlvbiB3cml0ZUludDMyQkUgKHZhbHVlLCBvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIHZhbHVlID0gK3ZhbHVlXG4gIG9mZnNldCA9IG9mZnNldCB8IDBcbiAgaWYgKCFub0Fzc2VydCkgY2hlY2tJbnQodGhpcywgdmFsdWUsIG9mZnNldCwgNCwgMHg3ZmZmZmZmZiwgLTB4ODAwMDAwMDApXG4gIGlmICh2YWx1ZSA8IDApIHZhbHVlID0gMHhmZmZmZmZmZiArIHZhbHVlICsgMVxuICBpZiAoQnVmZmVyLlRZUEVEX0FSUkFZX1NVUFBPUlQpIHtcbiAgICB0aGlzW29mZnNldF0gPSAodmFsdWUgPj4+IDI0KVxuICAgIHRoaXNbb2Zmc2V0ICsgMV0gPSAodmFsdWUgPj4+IDE2KVxuICAgIHRoaXNbb2Zmc2V0ICsgMl0gPSAodmFsdWUgPj4+IDgpXG4gICAgdGhpc1tvZmZzZXQgKyAzXSA9IHZhbHVlXG4gIH0gZWxzZSB7XG4gICAgb2JqZWN0V3JpdGVVSW50MzIodGhpcywgdmFsdWUsIG9mZnNldCwgZmFsc2UpXG4gIH1cbiAgcmV0dXJuIG9mZnNldCArIDRcbn1cblxuZnVuY3Rpb24gY2hlY2tJRUVFNzU0IChidWYsIHZhbHVlLCBvZmZzZXQsIGV4dCwgbWF4LCBtaW4pIHtcbiAgaWYgKHZhbHVlID4gbWF4IHx8IHZhbHVlIDwgbWluKSB0aHJvdyBuZXcgUmFuZ2VFcnJvcigndmFsdWUgaXMgb3V0IG9mIGJvdW5kcycpXG4gIGlmIChvZmZzZXQgKyBleHQgPiBidWYubGVuZ3RoKSB0aHJvdyBuZXcgUmFuZ2VFcnJvcignaW5kZXggb3V0IG9mIHJhbmdlJylcbiAgaWYgKG9mZnNldCA8IDApIHRocm93IG5ldyBSYW5nZUVycm9yKCdpbmRleCBvdXQgb2YgcmFuZ2UnKVxufVxuXG5mdW5jdGlvbiB3cml0ZUZsb2F0IChidWYsIHZhbHVlLCBvZmZzZXQsIGxpdHRsZUVuZGlhbiwgbm9Bc3NlcnQpIHtcbiAgaWYgKCFub0Fzc2VydCkge1xuICAgIGNoZWNrSUVFRTc1NChidWYsIHZhbHVlLCBvZmZzZXQsIDQsIDMuNDAyODIzNDY2Mzg1Mjg4NmUrMzgsIC0zLjQwMjgyMzQ2NjM4NTI4ODZlKzM4KVxuICB9XG4gIGllZWU3NTQud3JpdGUoYnVmLCB2YWx1ZSwgb2Zmc2V0LCBsaXR0bGVFbmRpYW4sIDIzLCA0KVxuICByZXR1cm4gb2Zmc2V0ICsgNFxufVxuXG5CdWZmZXIucHJvdG90eXBlLndyaXRlRmxvYXRMRSA9IGZ1bmN0aW9uIHdyaXRlRmxvYXRMRSAodmFsdWUsIG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgcmV0dXJuIHdyaXRlRmxvYXQodGhpcywgdmFsdWUsIG9mZnNldCwgdHJ1ZSwgbm9Bc3NlcnQpXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUud3JpdGVGbG9hdEJFID0gZnVuY3Rpb24gd3JpdGVGbG9hdEJFICh2YWx1ZSwgb2Zmc2V0LCBub0Fzc2VydCkge1xuICByZXR1cm4gd3JpdGVGbG9hdCh0aGlzLCB2YWx1ZSwgb2Zmc2V0LCBmYWxzZSwgbm9Bc3NlcnQpXG59XG5cbmZ1bmN0aW9uIHdyaXRlRG91YmxlIChidWYsIHZhbHVlLCBvZmZzZXQsIGxpdHRsZUVuZGlhbiwgbm9Bc3NlcnQpIHtcbiAgaWYgKCFub0Fzc2VydCkge1xuICAgIGNoZWNrSUVFRTc1NChidWYsIHZhbHVlLCBvZmZzZXQsIDgsIDEuNzk3NjkzMTM0ODYyMzE1N0UrMzA4LCAtMS43OTc2OTMxMzQ4NjIzMTU3RSszMDgpXG4gIH1cbiAgaWVlZTc1NC53cml0ZShidWYsIHZhbHVlLCBvZmZzZXQsIGxpdHRsZUVuZGlhbiwgNTIsIDgpXG4gIHJldHVybiBvZmZzZXQgKyA4XG59XG5cbkJ1ZmZlci5wcm90b3R5cGUud3JpdGVEb3VibGVMRSA9IGZ1bmN0aW9uIHdyaXRlRG91YmxlTEUgKHZhbHVlLCBvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIHJldHVybiB3cml0ZURvdWJsZSh0aGlzLCB2YWx1ZSwgb2Zmc2V0LCB0cnVlLCBub0Fzc2VydClcbn1cblxuQnVmZmVyLnByb3RvdHlwZS53cml0ZURvdWJsZUJFID0gZnVuY3Rpb24gd3JpdGVEb3VibGVCRSAodmFsdWUsIG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgcmV0dXJuIHdyaXRlRG91YmxlKHRoaXMsIHZhbHVlLCBvZmZzZXQsIGZhbHNlLCBub0Fzc2VydClcbn1cblxuLy8gY29weSh0YXJnZXRCdWZmZXIsIHRhcmdldFN0YXJ0PTAsIHNvdXJjZVN0YXJ0PTAsIHNvdXJjZUVuZD1idWZmZXIubGVuZ3RoKVxuQnVmZmVyLnByb3RvdHlwZS5jb3B5ID0gZnVuY3Rpb24gY29weSAodGFyZ2V0LCB0YXJnZXRTdGFydCwgc3RhcnQsIGVuZCkge1xuICBpZiAoIXN0YXJ0KSBzdGFydCA9IDBcbiAgaWYgKCFlbmQgJiYgZW5kICE9PSAwKSBlbmQgPSB0aGlzLmxlbmd0aFxuICBpZiAodGFyZ2V0U3RhcnQgPj0gdGFyZ2V0Lmxlbmd0aCkgdGFyZ2V0U3RhcnQgPSB0YXJnZXQubGVuZ3RoXG4gIGlmICghdGFyZ2V0U3RhcnQpIHRhcmdldFN0YXJ0ID0gMFxuICBpZiAoZW5kID4gMCAmJiBlbmQgPCBzdGFydCkgZW5kID0gc3RhcnRcblxuICAvLyBDb3B5IDAgYnl0ZXM7IHdlJ3JlIGRvbmVcbiAgaWYgKGVuZCA9PT0gc3RhcnQpIHJldHVybiAwXG4gIGlmICh0YXJnZXQubGVuZ3RoID09PSAwIHx8IHRoaXMubGVuZ3RoID09PSAwKSByZXR1cm4gMFxuXG4gIC8vIEZhdGFsIGVycm9yIGNvbmRpdGlvbnNcbiAgaWYgKHRhcmdldFN0YXJ0IDwgMCkge1xuICAgIHRocm93IG5ldyBSYW5nZUVycm9yKCd0YXJnZXRTdGFydCBvdXQgb2YgYm91bmRzJylcbiAgfVxuICBpZiAoc3RhcnQgPCAwIHx8IHN0YXJ0ID49IHRoaXMubGVuZ3RoKSB0aHJvdyBuZXcgUmFuZ2VFcnJvcignc291cmNlU3RhcnQgb3V0IG9mIGJvdW5kcycpXG4gIGlmIChlbmQgPCAwKSB0aHJvdyBuZXcgUmFuZ2VFcnJvcignc291cmNlRW5kIG91dCBvZiBib3VuZHMnKVxuXG4gIC8vIEFyZSB3ZSBvb2I/XG4gIGlmIChlbmQgPiB0aGlzLmxlbmd0aCkgZW5kID0gdGhpcy5sZW5ndGhcbiAgaWYgKHRhcmdldC5sZW5ndGggLSB0YXJnZXRTdGFydCA8IGVuZCAtIHN0YXJ0KSB7XG4gICAgZW5kID0gdGFyZ2V0Lmxlbmd0aCAtIHRhcmdldFN0YXJ0ICsgc3RhcnRcbiAgfVxuXG4gIHZhciBsZW4gPSBlbmQgLSBzdGFydFxuXG4gIGlmIChsZW4gPCAxMDAwIHx8ICFCdWZmZXIuVFlQRURfQVJSQVlfU1VQUE9SVCkge1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbGVuOyBpKyspIHtcbiAgICAgIHRhcmdldFtpICsgdGFyZ2V0U3RhcnRdID0gdGhpc1tpICsgc3RhcnRdXG4gICAgfVxuICB9IGVsc2Uge1xuICAgIHRhcmdldC5fc2V0KHRoaXMuc3ViYXJyYXkoc3RhcnQsIHN0YXJ0ICsgbGVuKSwgdGFyZ2V0U3RhcnQpXG4gIH1cblxuICByZXR1cm4gbGVuXG59XG5cbi8vIGZpbGwodmFsdWUsIHN0YXJ0PTAsIGVuZD1idWZmZXIubGVuZ3RoKVxuQnVmZmVyLnByb3RvdHlwZS5maWxsID0gZnVuY3Rpb24gZmlsbCAodmFsdWUsIHN0YXJ0LCBlbmQpIHtcbiAgaWYgKCF2YWx1ZSkgdmFsdWUgPSAwXG4gIGlmICghc3RhcnQpIHN0YXJ0ID0gMFxuICBpZiAoIWVuZCkgZW5kID0gdGhpcy5sZW5ndGhcblxuICBpZiAoZW5kIDwgc3RhcnQpIHRocm93IG5ldyBSYW5nZUVycm9yKCdlbmQgPCBzdGFydCcpXG5cbiAgLy8gRmlsbCAwIGJ5dGVzOyB3ZSdyZSBkb25lXG4gIGlmIChlbmQgPT09IHN0YXJ0KSByZXR1cm5cbiAgaWYgKHRoaXMubGVuZ3RoID09PSAwKSByZXR1cm5cblxuICBpZiAoc3RhcnQgPCAwIHx8IHN0YXJ0ID49IHRoaXMubGVuZ3RoKSB0aHJvdyBuZXcgUmFuZ2VFcnJvcignc3RhcnQgb3V0IG9mIGJvdW5kcycpXG4gIGlmIChlbmQgPCAwIHx8IGVuZCA+IHRoaXMubGVuZ3RoKSB0aHJvdyBuZXcgUmFuZ2VFcnJvcignZW5kIG91dCBvZiBib3VuZHMnKVxuXG4gIHZhciBpXG4gIGlmICh0eXBlb2YgdmFsdWUgPT09ICdudW1iZXInKSB7XG4gICAgZm9yIChpID0gc3RhcnQ7IGkgPCBlbmQ7IGkrKykge1xuICAgICAgdGhpc1tpXSA9IHZhbHVlXG4gICAgfVxuICB9IGVsc2Uge1xuICAgIHZhciBieXRlcyA9IHV0ZjhUb0J5dGVzKHZhbHVlLnRvU3RyaW5nKCkpXG4gICAgdmFyIGxlbiA9IGJ5dGVzLmxlbmd0aFxuICAgIGZvciAoaSA9IHN0YXJ0OyBpIDwgZW5kOyBpKyspIHtcbiAgICAgIHRoaXNbaV0gPSBieXRlc1tpICUgbGVuXVxuICAgIH1cbiAgfVxuXG4gIHJldHVybiB0aGlzXG59XG5cbi8qKlxuICogQ3JlYXRlcyBhIG5ldyBgQXJyYXlCdWZmZXJgIHdpdGggdGhlICpjb3BpZWQqIG1lbW9yeSBvZiB0aGUgYnVmZmVyIGluc3RhbmNlLlxuICogQWRkZWQgaW4gTm9kZSAwLjEyLiBPbmx5IGF2YWlsYWJsZSBpbiBicm93c2VycyB0aGF0IHN1cHBvcnQgQXJyYXlCdWZmZXIuXG4gKi9cbkJ1ZmZlci5wcm90b3R5cGUudG9BcnJheUJ1ZmZlciA9IGZ1bmN0aW9uIHRvQXJyYXlCdWZmZXIgKCkge1xuICBpZiAodHlwZW9mIFVpbnQ4QXJyYXkgIT09ICd1bmRlZmluZWQnKSB7XG4gICAgaWYgKEJ1ZmZlci5UWVBFRF9BUlJBWV9TVVBQT1JUKSB7XG4gICAgICByZXR1cm4gKG5ldyBCdWZmZXIodGhpcykpLmJ1ZmZlclxuICAgIH0gZWxzZSB7XG4gICAgICB2YXIgYnVmID0gbmV3IFVpbnQ4QXJyYXkodGhpcy5sZW5ndGgpXG4gICAgICBmb3IgKHZhciBpID0gMCwgbGVuID0gYnVmLmxlbmd0aDsgaSA8IGxlbjsgaSArPSAxKSB7XG4gICAgICAgIGJ1ZltpXSA9IHRoaXNbaV1cbiAgICAgIH1cbiAgICAgIHJldHVybiBidWYuYnVmZmVyXG4gICAgfVxuICB9IGVsc2Uge1xuICAgIHRocm93IG5ldyBUeXBlRXJyb3IoJ0J1ZmZlci50b0FycmF5QnVmZmVyIG5vdCBzdXBwb3J0ZWQgaW4gdGhpcyBicm93c2VyJylcbiAgfVxufVxuXG4vLyBIRUxQRVIgRlVOQ1RJT05TXG4vLyA9PT09PT09PT09PT09PT09XG5cbnZhciBCUCA9IEJ1ZmZlci5wcm90b3R5cGVcblxuLyoqXG4gKiBBdWdtZW50IGEgVWludDhBcnJheSAqaW5zdGFuY2UqIChub3QgdGhlIFVpbnQ4QXJyYXkgY2xhc3MhKSB3aXRoIEJ1ZmZlciBtZXRob2RzXG4gKi9cbkJ1ZmZlci5fYXVnbWVudCA9IGZ1bmN0aW9uIF9hdWdtZW50IChhcnIpIHtcbiAgYXJyLmNvbnN0cnVjdG9yID0gQnVmZmVyXG4gIGFyci5faXNCdWZmZXIgPSB0cnVlXG5cbiAgLy8gc2F2ZSByZWZlcmVuY2UgdG8gb3JpZ2luYWwgVWludDhBcnJheSBzZXQgbWV0aG9kIGJlZm9yZSBvdmVyd3JpdGluZ1xuICBhcnIuX3NldCA9IGFyci5zZXRcblxuICAvLyBkZXByZWNhdGVkLCB3aWxsIGJlIHJlbW92ZWQgaW4gbm9kZSAwLjEzK1xuICBhcnIuZ2V0ID0gQlAuZ2V0XG4gIGFyci5zZXQgPSBCUC5zZXRcblxuICBhcnIud3JpdGUgPSBCUC53cml0ZVxuICBhcnIudG9TdHJpbmcgPSBCUC50b1N0cmluZ1xuICBhcnIudG9Mb2NhbGVTdHJpbmcgPSBCUC50b1N0cmluZ1xuICBhcnIudG9KU09OID0gQlAudG9KU09OXG4gIGFyci5lcXVhbHMgPSBCUC5lcXVhbHNcbiAgYXJyLmNvbXBhcmUgPSBCUC5jb21wYXJlXG4gIGFyci5pbmRleE9mID0gQlAuaW5kZXhPZlxuICBhcnIuY29weSA9IEJQLmNvcHlcbiAgYXJyLnNsaWNlID0gQlAuc2xpY2VcbiAgYXJyLnJlYWRVSW50TEUgPSBCUC5yZWFkVUludExFXG4gIGFyci5yZWFkVUludEJFID0gQlAucmVhZFVJbnRCRVxuICBhcnIucmVhZFVJbnQ4ID0gQlAucmVhZFVJbnQ4XG4gIGFyci5yZWFkVUludDE2TEUgPSBCUC5yZWFkVUludDE2TEVcbiAgYXJyLnJlYWRVSW50MTZCRSA9IEJQLnJlYWRVSW50MTZCRVxuICBhcnIucmVhZFVJbnQzMkxFID0gQlAucmVhZFVJbnQzMkxFXG4gIGFyci5yZWFkVUludDMyQkUgPSBCUC5yZWFkVUludDMyQkVcbiAgYXJyLnJlYWRJbnRMRSA9IEJQLnJlYWRJbnRMRVxuICBhcnIucmVhZEludEJFID0gQlAucmVhZEludEJFXG4gIGFyci5yZWFkSW50OCA9IEJQLnJlYWRJbnQ4XG4gIGFyci5yZWFkSW50MTZMRSA9IEJQLnJlYWRJbnQxNkxFXG4gIGFyci5yZWFkSW50MTZCRSA9IEJQLnJlYWRJbnQxNkJFXG4gIGFyci5yZWFkSW50MzJMRSA9IEJQLnJlYWRJbnQzMkxFXG4gIGFyci5yZWFkSW50MzJCRSA9IEJQLnJlYWRJbnQzMkJFXG4gIGFyci5yZWFkRmxvYXRMRSA9IEJQLnJlYWRGbG9hdExFXG4gIGFyci5yZWFkRmxvYXRCRSA9IEJQLnJlYWRGbG9hdEJFXG4gIGFyci5yZWFkRG91YmxlTEUgPSBCUC5yZWFkRG91YmxlTEVcbiAgYXJyLnJlYWREb3VibGVCRSA9IEJQLnJlYWREb3VibGVCRVxuICBhcnIud3JpdGVVSW50OCA9IEJQLndyaXRlVUludDhcbiAgYXJyLndyaXRlVUludExFID0gQlAud3JpdGVVSW50TEVcbiAgYXJyLndyaXRlVUludEJFID0gQlAud3JpdGVVSW50QkVcbiAgYXJyLndyaXRlVUludDE2TEUgPSBCUC53cml0ZVVJbnQxNkxFXG4gIGFyci53cml0ZVVJbnQxNkJFID0gQlAud3JpdGVVSW50MTZCRVxuICBhcnIud3JpdGVVSW50MzJMRSA9IEJQLndyaXRlVUludDMyTEVcbiAgYXJyLndyaXRlVUludDMyQkUgPSBCUC53cml0ZVVJbnQzMkJFXG4gIGFyci53cml0ZUludExFID0gQlAud3JpdGVJbnRMRVxuICBhcnIud3JpdGVJbnRCRSA9IEJQLndyaXRlSW50QkVcbiAgYXJyLndyaXRlSW50OCA9IEJQLndyaXRlSW50OFxuICBhcnIud3JpdGVJbnQxNkxFID0gQlAud3JpdGVJbnQxNkxFXG4gIGFyci53cml0ZUludDE2QkUgPSBCUC53cml0ZUludDE2QkVcbiAgYXJyLndyaXRlSW50MzJMRSA9IEJQLndyaXRlSW50MzJMRVxuICBhcnIud3JpdGVJbnQzMkJFID0gQlAud3JpdGVJbnQzMkJFXG4gIGFyci53cml0ZUZsb2F0TEUgPSBCUC53cml0ZUZsb2F0TEVcbiAgYXJyLndyaXRlRmxvYXRCRSA9IEJQLndyaXRlRmxvYXRCRVxuICBhcnIud3JpdGVEb3VibGVMRSA9IEJQLndyaXRlRG91YmxlTEVcbiAgYXJyLndyaXRlRG91YmxlQkUgPSBCUC53cml0ZURvdWJsZUJFXG4gIGFyci5maWxsID0gQlAuZmlsbFxuICBhcnIuaW5zcGVjdCA9IEJQLmluc3BlY3RcbiAgYXJyLnRvQXJyYXlCdWZmZXIgPSBCUC50b0FycmF5QnVmZmVyXG5cbiAgcmV0dXJuIGFyclxufVxuXG52YXIgSU5WQUxJRF9CQVNFNjRfUkUgPSAvW14rXFwvMC05QS16XFwtXS9nXG5cbmZ1bmN0aW9uIGJhc2U2NGNsZWFuIChzdHIpIHtcbiAgLy8gTm9kZSBzdHJpcHMgb3V0IGludmFsaWQgY2hhcmFjdGVycyBsaWtlIFxcbiBhbmQgXFx0IGZyb20gdGhlIHN0cmluZywgYmFzZTY0LWpzIGRvZXMgbm90XG4gIHN0ciA9IHN0cmluZ3RyaW0oc3RyKS5yZXBsYWNlKElOVkFMSURfQkFTRTY0X1JFLCAnJylcbiAgLy8gTm9kZSBjb252ZXJ0cyBzdHJpbmdzIHdpdGggbGVuZ3RoIDwgMiB0byAnJ1xuICBpZiAoc3RyLmxlbmd0aCA8IDIpIHJldHVybiAnJ1xuICAvLyBOb2RlIGFsbG93cyBmb3Igbm9uLXBhZGRlZCBiYXNlNjQgc3RyaW5ncyAobWlzc2luZyB0cmFpbGluZyA9PT0pLCBiYXNlNjQtanMgZG9lcyBub3RcbiAgd2hpbGUgKHN0ci5sZW5ndGggJSA0ICE9PSAwKSB7XG4gICAgc3RyID0gc3RyICsgJz0nXG4gIH1cbiAgcmV0dXJuIHN0clxufVxuXG5mdW5jdGlvbiBzdHJpbmd0cmltIChzdHIpIHtcbiAgaWYgKHN0ci50cmltKSByZXR1cm4gc3RyLnRyaW0oKVxuICByZXR1cm4gc3RyLnJlcGxhY2UoL15cXHMrfFxccyskL2csICcnKVxufVxuXG5mdW5jdGlvbiB0b0hleCAobikge1xuICBpZiAobiA8IDE2KSByZXR1cm4gJzAnICsgbi50b1N0cmluZygxNilcbiAgcmV0dXJuIG4udG9TdHJpbmcoMTYpXG59XG5cbmZ1bmN0aW9uIHV0ZjhUb0J5dGVzIChzdHJpbmcsIHVuaXRzKSB7XG4gIHVuaXRzID0gdW5pdHMgfHwgSW5maW5pdHlcbiAgdmFyIGNvZGVQb2ludFxuICB2YXIgbGVuZ3RoID0gc3RyaW5nLmxlbmd0aFxuICB2YXIgbGVhZFN1cnJvZ2F0ZSA9IG51bGxcbiAgdmFyIGJ5dGVzID0gW11cbiAgdmFyIGkgPSAwXG5cbiAgZm9yICg7IGkgPCBsZW5ndGg7IGkrKykge1xuICAgIGNvZGVQb2ludCA9IHN0cmluZy5jaGFyQ29kZUF0KGkpXG5cbiAgICAvLyBpcyBzdXJyb2dhdGUgY29tcG9uZW50XG4gICAgaWYgKGNvZGVQb2ludCA+IDB4RDdGRiAmJiBjb2RlUG9pbnQgPCAweEUwMDApIHtcbiAgICAgIC8vIGxhc3QgY2hhciB3YXMgYSBsZWFkXG4gICAgICBpZiAobGVhZFN1cnJvZ2F0ZSkge1xuICAgICAgICAvLyAyIGxlYWRzIGluIGEgcm93XG4gICAgICAgIGlmIChjb2RlUG9pbnQgPCAweERDMDApIHtcbiAgICAgICAgICBpZiAoKHVuaXRzIC09IDMpID4gLTEpIGJ5dGVzLnB1c2goMHhFRiwgMHhCRiwgMHhCRClcbiAgICAgICAgICBsZWFkU3Vycm9nYXRlID0gY29kZVBvaW50XG4gICAgICAgICAgY29udGludWVcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAvLyB2YWxpZCBzdXJyb2dhdGUgcGFpclxuICAgICAgICAgIGNvZGVQb2ludCA9IGxlYWRTdXJyb2dhdGUgLSAweEQ4MDAgPDwgMTAgfCBjb2RlUG9pbnQgLSAweERDMDAgfCAweDEwMDAwXG4gICAgICAgICAgbGVhZFN1cnJvZ2F0ZSA9IG51bGxcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgLy8gbm8gbGVhZCB5ZXRcblxuICAgICAgICBpZiAoY29kZVBvaW50ID4gMHhEQkZGKSB7XG4gICAgICAgICAgLy8gdW5leHBlY3RlZCB0cmFpbFxuICAgICAgICAgIGlmICgodW5pdHMgLT0gMykgPiAtMSkgYnl0ZXMucHVzaCgweEVGLCAweEJGLCAweEJEKVxuICAgICAgICAgIGNvbnRpbnVlXG4gICAgICAgIH0gZWxzZSBpZiAoaSArIDEgPT09IGxlbmd0aCkge1xuICAgICAgICAgIC8vIHVucGFpcmVkIGxlYWRcbiAgICAgICAgICBpZiAoKHVuaXRzIC09IDMpID4gLTEpIGJ5dGVzLnB1c2goMHhFRiwgMHhCRiwgMHhCRClcbiAgICAgICAgICBjb250aW51ZVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIC8vIHZhbGlkIGxlYWRcbiAgICAgICAgICBsZWFkU3Vycm9nYXRlID0gY29kZVBvaW50XG4gICAgICAgICAgY29udGludWVcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0gZWxzZSBpZiAobGVhZFN1cnJvZ2F0ZSkge1xuICAgICAgLy8gdmFsaWQgYm1wIGNoYXIsIGJ1dCBsYXN0IGNoYXIgd2FzIGEgbGVhZFxuICAgICAgaWYgKCh1bml0cyAtPSAzKSA+IC0xKSBieXRlcy5wdXNoKDB4RUYsIDB4QkYsIDB4QkQpXG4gICAgICBsZWFkU3Vycm9nYXRlID0gbnVsbFxuICAgIH1cblxuICAgIC8vIGVuY29kZSB1dGY4XG4gICAgaWYgKGNvZGVQb2ludCA8IDB4ODApIHtcbiAgICAgIGlmICgodW5pdHMgLT0gMSkgPCAwKSBicmVha1xuICAgICAgYnl0ZXMucHVzaChjb2RlUG9pbnQpXG4gICAgfSBlbHNlIGlmIChjb2RlUG9pbnQgPCAweDgwMCkge1xuICAgICAgaWYgKCh1bml0cyAtPSAyKSA8IDApIGJyZWFrXG4gICAgICBieXRlcy5wdXNoKFxuICAgICAgICBjb2RlUG9pbnQgPj4gMHg2IHwgMHhDMCxcbiAgICAgICAgY29kZVBvaW50ICYgMHgzRiB8IDB4ODBcbiAgICAgIClcbiAgICB9IGVsc2UgaWYgKGNvZGVQb2ludCA8IDB4MTAwMDApIHtcbiAgICAgIGlmICgodW5pdHMgLT0gMykgPCAwKSBicmVha1xuICAgICAgYnl0ZXMucHVzaChcbiAgICAgICAgY29kZVBvaW50ID4+IDB4QyB8IDB4RTAsXG4gICAgICAgIGNvZGVQb2ludCA+PiAweDYgJiAweDNGIHwgMHg4MCxcbiAgICAgICAgY29kZVBvaW50ICYgMHgzRiB8IDB4ODBcbiAgICAgIClcbiAgICB9IGVsc2UgaWYgKGNvZGVQb2ludCA8IDB4MjAwMDAwKSB7XG4gICAgICBpZiAoKHVuaXRzIC09IDQpIDwgMCkgYnJlYWtcbiAgICAgIGJ5dGVzLnB1c2goXG4gICAgICAgIGNvZGVQb2ludCA+PiAweDEyIHwgMHhGMCxcbiAgICAgICAgY29kZVBvaW50ID4+IDB4QyAmIDB4M0YgfCAweDgwLFxuICAgICAgICBjb2RlUG9pbnQgPj4gMHg2ICYgMHgzRiB8IDB4ODAsXG4gICAgICAgIGNvZGVQb2ludCAmIDB4M0YgfCAweDgwXG4gICAgICApXG4gICAgfSBlbHNlIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignSW52YWxpZCBjb2RlIHBvaW50JylcbiAgICB9XG4gIH1cblxuICByZXR1cm4gYnl0ZXNcbn1cblxuZnVuY3Rpb24gYXNjaWlUb0J5dGVzIChzdHIpIHtcbiAgdmFyIGJ5dGVBcnJheSA9IFtdXG4gIGZvciAodmFyIGkgPSAwOyBpIDwgc3RyLmxlbmd0aDsgaSsrKSB7XG4gICAgLy8gTm9kZSdzIGNvZGUgc2VlbXMgdG8gYmUgZG9pbmcgdGhpcyBhbmQgbm90ICYgMHg3Ri4uXG4gICAgYnl0ZUFycmF5LnB1c2goc3RyLmNoYXJDb2RlQXQoaSkgJiAweEZGKVxuICB9XG4gIHJldHVybiBieXRlQXJyYXlcbn1cblxuZnVuY3Rpb24gdXRmMTZsZVRvQnl0ZXMgKHN0ciwgdW5pdHMpIHtcbiAgdmFyIGMsIGhpLCBsb1xuICB2YXIgYnl0ZUFycmF5ID0gW11cbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBzdHIubGVuZ3RoOyBpKyspIHtcbiAgICBpZiAoKHVuaXRzIC09IDIpIDwgMCkgYnJlYWtcblxuICAgIGMgPSBzdHIuY2hhckNvZGVBdChpKVxuICAgIGhpID0gYyA+PiA4XG4gICAgbG8gPSBjICUgMjU2XG4gICAgYnl0ZUFycmF5LnB1c2gobG8pXG4gICAgYnl0ZUFycmF5LnB1c2goaGkpXG4gIH1cblxuICByZXR1cm4gYnl0ZUFycmF5XG59XG5cbmZ1bmN0aW9uIGJhc2U2NFRvQnl0ZXMgKHN0cikge1xuICByZXR1cm4gYmFzZTY0LnRvQnl0ZUFycmF5KGJhc2U2NGNsZWFuKHN0cikpXG59XG5cbmZ1bmN0aW9uIGJsaXRCdWZmZXIgKHNyYywgZHN0LCBvZmZzZXQsIGxlbmd0aCkge1xuICBmb3IgKHZhciBpID0gMDsgaSA8IGxlbmd0aDsgaSsrKSB7XG4gICAgaWYgKChpICsgb2Zmc2V0ID49IGRzdC5sZW5ndGgpIHx8IChpID49IHNyYy5sZW5ndGgpKSBicmVha1xuICAgIGRzdFtpICsgb2Zmc2V0XSA9IHNyY1tpXVxuICB9XG4gIHJldHVybiBpXG59XG5cbmZ1bmN0aW9uIGRlY29kZVV0ZjhDaGFyIChzdHIpIHtcbiAgdHJ5IHtcbiAgICByZXR1cm4gZGVjb2RlVVJJQ29tcG9uZW50KHN0cilcbiAgfSBjYXRjaCAoZXJyKSB7XG4gICAgcmV0dXJuIFN0cmluZy5mcm9tQ2hhckNvZGUoMHhGRkZEKSAvLyBVVEYgOCBpbnZhbGlkIGNoYXJcbiAgfVxufVxuIiwidmFyIGxvb2t1cCA9ICdBQkNERUZHSElKS0xNTk9QUVJTVFVWV1hZWmFiY2RlZmdoaWprbG1ub3BxcnN0dXZ3eHl6MDEyMzQ1Njc4OSsvJztcblxuOyhmdW5jdGlvbiAoZXhwb3J0cykge1xuXHQndXNlIHN0cmljdCc7XG5cbiAgdmFyIEFyciA9ICh0eXBlb2YgVWludDhBcnJheSAhPT0gJ3VuZGVmaW5lZCcpXG4gICAgPyBVaW50OEFycmF5XG4gICAgOiBBcnJheVxuXG5cdHZhciBQTFVTICAgPSAnKycuY2hhckNvZGVBdCgwKVxuXHR2YXIgU0xBU0ggID0gJy8nLmNoYXJDb2RlQXQoMClcblx0dmFyIE5VTUJFUiA9ICcwJy5jaGFyQ29kZUF0KDApXG5cdHZhciBMT1dFUiAgPSAnYScuY2hhckNvZGVBdCgwKVxuXHR2YXIgVVBQRVIgID0gJ0EnLmNoYXJDb2RlQXQoMClcblx0dmFyIFBMVVNfVVJMX1NBRkUgPSAnLScuY2hhckNvZGVBdCgwKVxuXHR2YXIgU0xBU0hfVVJMX1NBRkUgPSAnXycuY2hhckNvZGVBdCgwKVxuXG5cdGZ1bmN0aW9uIGRlY29kZSAoZWx0KSB7XG5cdFx0dmFyIGNvZGUgPSBlbHQuY2hhckNvZGVBdCgwKVxuXHRcdGlmIChjb2RlID09PSBQTFVTIHx8XG5cdFx0ICAgIGNvZGUgPT09IFBMVVNfVVJMX1NBRkUpXG5cdFx0XHRyZXR1cm4gNjIgLy8gJysnXG5cdFx0aWYgKGNvZGUgPT09IFNMQVNIIHx8XG5cdFx0ICAgIGNvZGUgPT09IFNMQVNIX1VSTF9TQUZFKVxuXHRcdFx0cmV0dXJuIDYzIC8vICcvJ1xuXHRcdGlmIChjb2RlIDwgTlVNQkVSKVxuXHRcdFx0cmV0dXJuIC0xIC8vbm8gbWF0Y2hcblx0XHRpZiAoY29kZSA8IE5VTUJFUiArIDEwKVxuXHRcdFx0cmV0dXJuIGNvZGUgLSBOVU1CRVIgKyAyNiArIDI2XG5cdFx0aWYgKGNvZGUgPCBVUFBFUiArIDI2KVxuXHRcdFx0cmV0dXJuIGNvZGUgLSBVUFBFUlxuXHRcdGlmIChjb2RlIDwgTE9XRVIgKyAyNilcblx0XHRcdHJldHVybiBjb2RlIC0gTE9XRVIgKyAyNlxuXHR9XG5cblx0ZnVuY3Rpb24gYjY0VG9CeXRlQXJyYXkgKGI2NCkge1xuXHRcdHZhciBpLCBqLCBsLCB0bXAsIHBsYWNlSG9sZGVycywgYXJyXG5cblx0XHRpZiAoYjY0Lmxlbmd0aCAlIDQgPiAwKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0ludmFsaWQgc3RyaW5nLiBMZW5ndGggbXVzdCBiZSBhIG11bHRpcGxlIG9mIDQnKVxuXHRcdH1cblxuXHRcdC8vIHRoZSBudW1iZXIgb2YgZXF1YWwgc2lnbnMgKHBsYWNlIGhvbGRlcnMpXG5cdFx0Ly8gaWYgdGhlcmUgYXJlIHR3byBwbGFjZWhvbGRlcnMsIHRoYW4gdGhlIHR3byBjaGFyYWN0ZXJzIGJlZm9yZSBpdFxuXHRcdC8vIHJlcHJlc2VudCBvbmUgYnl0ZVxuXHRcdC8vIGlmIHRoZXJlIGlzIG9ubHkgb25lLCB0aGVuIHRoZSB0aHJlZSBjaGFyYWN0ZXJzIGJlZm9yZSBpdCByZXByZXNlbnQgMiBieXRlc1xuXHRcdC8vIHRoaXMgaXMganVzdCBhIGNoZWFwIGhhY2sgdG8gbm90IGRvIGluZGV4T2YgdHdpY2Vcblx0XHR2YXIgbGVuID0gYjY0Lmxlbmd0aFxuXHRcdHBsYWNlSG9sZGVycyA9ICc9JyA9PT0gYjY0LmNoYXJBdChsZW4gLSAyKSA/IDIgOiAnPScgPT09IGI2NC5jaGFyQXQobGVuIC0gMSkgPyAxIDogMFxuXG5cdFx0Ly8gYmFzZTY0IGlzIDQvMyArIHVwIHRvIHR3byBjaGFyYWN0ZXJzIG9mIHRoZSBvcmlnaW5hbCBkYXRhXG5cdFx0YXJyID0gbmV3IEFycihiNjQubGVuZ3RoICogMyAvIDQgLSBwbGFjZUhvbGRlcnMpXG5cblx0XHQvLyBpZiB0aGVyZSBhcmUgcGxhY2Vob2xkZXJzLCBvbmx5IGdldCB1cCB0byB0aGUgbGFzdCBjb21wbGV0ZSA0IGNoYXJzXG5cdFx0bCA9IHBsYWNlSG9sZGVycyA+IDAgPyBiNjQubGVuZ3RoIC0gNCA6IGI2NC5sZW5ndGhcblxuXHRcdHZhciBMID0gMFxuXG5cdFx0ZnVuY3Rpb24gcHVzaCAodikge1xuXHRcdFx0YXJyW0wrK10gPSB2XG5cdFx0fVxuXG5cdFx0Zm9yIChpID0gMCwgaiA9IDA7IGkgPCBsOyBpICs9IDQsIGogKz0gMykge1xuXHRcdFx0dG1wID0gKGRlY29kZShiNjQuY2hhckF0KGkpKSA8PCAxOCkgfCAoZGVjb2RlKGI2NC5jaGFyQXQoaSArIDEpKSA8PCAxMikgfCAoZGVjb2RlKGI2NC5jaGFyQXQoaSArIDIpKSA8PCA2KSB8IGRlY29kZShiNjQuY2hhckF0KGkgKyAzKSlcblx0XHRcdHB1c2goKHRtcCAmIDB4RkYwMDAwKSA+PiAxNilcblx0XHRcdHB1c2goKHRtcCAmIDB4RkYwMCkgPj4gOClcblx0XHRcdHB1c2godG1wICYgMHhGRilcblx0XHR9XG5cblx0XHRpZiAocGxhY2VIb2xkZXJzID09PSAyKSB7XG5cdFx0XHR0bXAgPSAoZGVjb2RlKGI2NC5jaGFyQXQoaSkpIDw8IDIpIHwgKGRlY29kZShiNjQuY2hhckF0KGkgKyAxKSkgPj4gNClcblx0XHRcdHB1c2godG1wICYgMHhGRilcblx0XHR9IGVsc2UgaWYgKHBsYWNlSG9sZGVycyA9PT0gMSkge1xuXHRcdFx0dG1wID0gKGRlY29kZShiNjQuY2hhckF0KGkpKSA8PCAxMCkgfCAoZGVjb2RlKGI2NC5jaGFyQXQoaSArIDEpKSA8PCA0KSB8IChkZWNvZGUoYjY0LmNoYXJBdChpICsgMikpID4+IDIpXG5cdFx0XHRwdXNoKCh0bXAgPj4gOCkgJiAweEZGKVxuXHRcdFx0cHVzaCh0bXAgJiAweEZGKVxuXHRcdH1cblxuXHRcdHJldHVybiBhcnJcblx0fVxuXG5cdGZ1bmN0aW9uIHVpbnQ4VG9CYXNlNjQgKHVpbnQ4KSB7XG5cdFx0dmFyIGksXG5cdFx0XHRleHRyYUJ5dGVzID0gdWludDgubGVuZ3RoICUgMywgLy8gaWYgd2UgaGF2ZSAxIGJ5dGUgbGVmdCwgcGFkIDIgYnl0ZXNcblx0XHRcdG91dHB1dCA9IFwiXCIsXG5cdFx0XHR0ZW1wLCBsZW5ndGhcblxuXHRcdGZ1bmN0aW9uIGVuY29kZSAobnVtKSB7XG5cdFx0XHRyZXR1cm4gbG9va3VwLmNoYXJBdChudW0pXG5cdFx0fVxuXG5cdFx0ZnVuY3Rpb24gdHJpcGxldFRvQmFzZTY0IChudW0pIHtcblx0XHRcdHJldHVybiBlbmNvZGUobnVtID4+IDE4ICYgMHgzRikgKyBlbmNvZGUobnVtID4+IDEyICYgMHgzRikgKyBlbmNvZGUobnVtID4+IDYgJiAweDNGKSArIGVuY29kZShudW0gJiAweDNGKVxuXHRcdH1cblxuXHRcdC8vIGdvIHRocm91Z2ggdGhlIGFycmF5IGV2ZXJ5IHRocmVlIGJ5dGVzLCB3ZSdsbCBkZWFsIHdpdGggdHJhaWxpbmcgc3R1ZmYgbGF0ZXJcblx0XHRmb3IgKGkgPSAwLCBsZW5ndGggPSB1aW50OC5sZW5ndGggLSBleHRyYUJ5dGVzOyBpIDwgbGVuZ3RoOyBpICs9IDMpIHtcblx0XHRcdHRlbXAgPSAodWludDhbaV0gPDwgMTYpICsgKHVpbnQ4W2kgKyAxXSA8PCA4KSArICh1aW50OFtpICsgMl0pXG5cdFx0XHRvdXRwdXQgKz0gdHJpcGxldFRvQmFzZTY0KHRlbXApXG5cdFx0fVxuXG5cdFx0Ly8gcGFkIHRoZSBlbmQgd2l0aCB6ZXJvcywgYnV0IG1ha2Ugc3VyZSB0byBub3QgZm9yZ2V0IHRoZSBleHRyYSBieXRlc1xuXHRcdHN3aXRjaCAoZXh0cmFCeXRlcykge1xuXHRcdFx0Y2FzZSAxOlxuXHRcdFx0XHR0ZW1wID0gdWludDhbdWludDgubGVuZ3RoIC0gMV1cblx0XHRcdFx0b3V0cHV0ICs9IGVuY29kZSh0ZW1wID4+IDIpXG5cdFx0XHRcdG91dHB1dCArPSBlbmNvZGUoKHRlbXAgPDwgNCkgJiAweDNGKVxuXHRcdFx0XHRvdXRwdXQgKz0gJz09J1xuXHRcdFx0XHRicmVha1xuXHRcdFx0Y2FzZSAyOlxuXHRcdFx0XHR0ZW1wID0gKHVpbnQ4W3VpbnQ4Lmxlbmd0aCAtIDJdIDw8IDgpICsgKHVpbnQ4W3VpbnQ4Lmxlbmd0aCAtIDFdKVxuXHRcdFx0XHRvdXRwdXQgKz0gZW5jb2RlKHRlbXAgPj4gMTApXG5cdFx0XHRcdG91dHB1dCArPSBlbmNvZGUoKHRlbXAgPj4gNCkgJiAweDNGKVxuXHRcdFx0XHRvdXRwdXQgKz0gZW5jb2RlKCh0ZW1wIDw8IDIpICYgMHgzRilcblx0XHRcdFx0b3V0cHV0ICs9ICc9J1xuXHRcdFx0XHRicmVha1xuXHRcdH1cblxuXHRcdHJldHVybiBvdXRwdXRcblx0fVxuXG5cdGV4cG9ydHMudG9CeXRlQXJyYXkgPSBiNjRUb0J5dGVBcnJheVxuXHRleHBvcnRzLmZyb21CeXRlQXJyYXkgPSB1aW50OFRvQmFzZTY0XG59KHR5cGVvZiBleHBvcnRzID09PSAndW5kZWZpbmVkJyA/ICh0aGlzLmJhc2U2NGpzID0ge30pIDogZXhwb3J0cykpXG4iLCJleHBvcnRzLnJlYWQgPSBmdW5jdGlvbiAoYnVmZmVyLCBvZmZzZXQsIGlzTEUsIG1MZW4sIG5CeXRlcykge1xuICB2YXIgZSwgbVxuICB2YXIgZUxlbiA9IG5CeXRlcyAqIDggLSBtTGVuIC0gMVxuICB2YXIgZU1heCA9ICgxIDw8IGVMZW4pIC0gMVxuICB2YXIgZUJpYXMgPSBlTWF4ID4+IDFcbiAgdmFyIG5CaXRzID0gLTdcbiAgdmFyIGkgPSBpc0xFID8gKG5CeXRlcyAtIDEpIDogMFxuICB2YXIgZCA9IGlzTEUgPyAtMSA6IDFcbiAgdmFyIHMgPSBidWZmZXJbb2Zmc2V0ICsgaV1cblxuICBpICs9IGRcblxuICBlID0gcyAmICgoMSA8PCAoLW5CaXRzKSkgLSAxKVxuICBzID4+PSAoLW5CaXRzKVxuICBuQml0cyArPSBlTGVuXG4gIGZvciAoOyBuQml0cyA+IDA7IGUgPSBlICogMjU2ICsgYnVmZmVyW29mZnNldCArIGldLCBpICs9IGQsIG5CaXRzIC09IDgpIHt9XG5cbiAgbSA9IGUgJiAoKDEgPDwgKC1uQml0cykpIC0gMSlcbiAgZSA+Pj0gKC1uQml0cylcbiAgbkJpdHMgKz0gbUxlblxuICBmb3IgKDsgbkJpdHMgPiAwOyBtID0gbSAqIDI1NiArIGJ1ZmZlcltvZmZzZXQgKyBpXSwgaSArPSBkLCBuQml0cyAtPSA4KSB7fVxuXG4gIGlmIChlID09PSAwKSB7XG4gICAgZSA9IDEgLSBlQmlhc1xuICB9IGVsc2UgaWYgKGUgPT09IGVNYXgpIHtcbiAgICByZXR1cm4gbSA/IE5hTiA6ICgocyA/IC0xIDogMSkgKiBJbmZpbml0eSlcbiAgfSBlbHNlIHtcbiAgICBtID0gbSArIE1hdGgucG93KDIsIG1MZW4pXG4gICAgZSA9IGUgLSBlQmlhc1xuICB9XG4gIHJldHVybiAocyA/IC0xIDogMSkgKiBtICogTWF0aC5wb3coMiwgZSAtIG1MZW4pXG59XG5cbmV4cG9ydHMud3JpdGUgPSBmdW5jdGlvbiAoYnVmZmVyLCB2YWx1ZSwgb2Zmc2V0LCBpc0xFLCBtTGVuLCBuQnl0ZXMpIHtcbiAgdmFyIGUsIG0sIGNcbiAgdmFyIGVMZW4gPSBuQnl0ZXMgKiA4IC0gbUxlbiAtIDFcbiAgdmFyIGVNYXggPSAoMSA8PCBlTGVuKSAtIDFcbiAgdmFyIGVCaWFzID0gZU1heCA+PiAxXG4gIHZhciBydCA9IChtTGVuID09PSAyMyA/IE1hdGgucG93KDIsIC0yNCkgLSBNYXRoLnBvdygyLCAtNzcpIDogMClcbiAgdmFyIGkgPSBpc0xFID8gMCA6IChuQnl0ZXMgLSAxKVxuICB2YXIgZCA9IGlzTEUgPyAxIDogLTFcbiAgdmFyIHMgPSB2YWx1ZSA8IDAgfHwgKHZhbHVlID09PSAwICYmIDEgLyB2YWx1ZSA8IDApID8gMSA6IDBcblxuICB2YWx1ZSA9IE1hdGguYWJzKHZhbHVlKVxuXG4gIGlmIChpc05hTih2YWx1ZSkgfHwgdmFsdWUgPT09IEluZmluaXR5KSB7XG4gICAgbSA9IGlzTmFOKHZhbHVlKSA/IDEgOiAwXG4gICAgZSA9IGVNYXhcbiAgfSBlbHNlIHtcbiAgICBlID0gTWF0aC5mbG9vcihNYXRoLmxvZyh2YWx1ZSkgLyBNYXRoLkxOMilcbiAgICBpZiAodmFsdWUgKiAoYyA9IE1hdGgucG93KDIsIC1lKSkgPCAxKSB7XG4gICAgICBlLS1cbiAgICAgIGMgKj0gMlxuICAgIH1cbiAgICBpZiAoZSArIGVCaWFzID49IDEpIHtcbiAgICAgIHZhbHVlICs9IHJ0IC8gY1xuICAgIH0gZWxzZSB7XG4gICAgICB2YWx1ZSArPSBydCAqIE1hdGgucG93KDIsIDEgLSBlQmlhcylcbiAgICB9XG4gICAgaWYgKHZhbHVlICogYyA+PSAyKSB7XG4gICAgICBlKytcbiAgICAgIGMgLz0gMlxuICAgIH1cblxuICAgIGlmIChlICsgZUJpYXMgPj0gZU1heCkge1xuICAgICAgbSA9IDBcbiAgICAgIGUgPSBlTWF4XG4gICAgfSBlbHNlIGlmIChlICsgZUJpYXMgPj0gMSkge1xuICAgICAgbSA9ICh2YWx1ZSAqIGMgLSAxKSAqIE1hdGgucG93KDIsIG1MZW4pXG4gICAgICBlID0gZSArIGVCaWFzXG4gICAgfSBlbHNlIHtcbiAgICAgIG0gPSB2YWx1ZSAqIE1hdGgucG93KDIsIGVCaWFzIC0gMSkgKiBNYXRoLnBvdygyLCBtTGVuKVxuICAgICAgZSA9IDBcbiAgICB9XG4gIH1cblxuICBmb3IgKDsgbUxlbiA+PSA4OyBidWZmZXJbb2Zmc2V0ICsgaV0gPSBtICYgMHhmZiwgaSArPSBkLCBtIC89IDI1NiwgbUxlbiAtPSA4KSB7fVxuXG4gIGUgPSAoZSA8PCBtTGVuKSB8IG1cbiAgZUxlbiArPSBtTGVuXG4gIGZvciAoOyBlTGVuID4gMDsgYnVmZmVyW29mZnNldCArIGldID0gZSAmIDB4ZmYsIGkgKz0gZCwgZSAvPSAyNTYsIGVMZW4gLT0gOCkge31cblxuICBidWZmZXJbb2Zmc2V0ICsgaSAtIGRdIHw9IHMgKiAxMjhcbn1cbiIsIlxuLyoqXG4gKiBpc0FycmF5XG4gKi9cblxudmFyIGlzQXJyYXkgPSBBcnJheS5pc0FycmF5O1xuXG4vKipcbiAqIHRvU3RyaW5nXG4gKi9cblxudmFyIHN0ciA9IE9iamVjdC5wcm90b3R5cGUudG9TdHJpbmc7XG5cbi8qKlxuICogV2hldGhlciBvciBub3QgdGhlIGdpdmVuIGB2YWxgXG4gKiBpcyBhbiBhcnJheS5cbiAqXG4gKiBleGFtcGxlOlxuICpcbiAqICAgICAgICBpc0FycmF5KFtdKTtcbiAqICAgICAgICAvLyA+IHRydWVcbiAqICAgICAgICBpc0FycmF5KGFyZ3VtZW50cyk7XG4gKiAgICAgICAgLy8gPiBmYWxzZVxuICogICAgICAgIGlzQXJyYXkoJycpO1xuICogICAgICAgIC8vID4gZmFsc2VcbiAqXG4gKiBAcGFyYW0ge21peGVkfSB2YWxcbiAqIEByZXR1cm4ge2Jvb2x9XG4gKi9cblxubW9kdWxlLmV4cG9ydHMgPSBpc0FycmF5IHx8IGZ1bmN0aW9uICh2YWwpIHtcbiAgcmV0dXJuICEhIHZhbCAmJiAnW29iamVjdCBBcnJheV0nID09IHN0ci5jYWxsKHZhbCk7XG59O1xuIiwiLy8gQ29weXJpZ2h0IEpveWVudCwgSW5jLiBhbmQgb3RoZXIgTm9kZSBjb250cmlidXRvcnMuXG4vL1xuLy8gUGVybWlzc2lvbiBpcyBoZXJlYnkgZ3JhbnRlZCwgZnJlZSBvZiBjaGFyZ2UsIHRvIGFueSBwZXJzb24gb2J0YWluaW5nIGFcbi8vIGNvcHkgb2YgdGhpcyBzb2Z0d2FyZSBhbmQgYXNzb2NpYXRlZCBkb2N1bWVudGF0aW9uIGZpbGVzICh0aGVcbi8vIFwiU29mdHdhcmVcIiksIHRvIGRlYWwgaW4gdGhlIFNvZnR3YXJlIHdpdGhvdXQgcmVzdHJpY3Rpb24sIGluY2x1ZGluZ1xuLy8gd2l0aG91dCBsaW1pdGF0aW9uIHRoZSByaWdodHMgdG8gdXNlLCBjb3B5LCBtb2RpZnksIG1lcmdlLCBwdWJsaXNoLFxuLy8gZGlzdHJpYnV0ZSwgc3VibGljZW5zZSwgYW5kL29yIHNlbGwgY29waWVzIG9mIHRoZSBTb2Z0d2FyZSwgYW5kIHRvIHBlcm1pdFxuLy8gcGVyc29ucyB0byB3aG9tIHRoZSBTb2Z0d2FyZSBpcyBmdXJuaXNoZWQgdG8gZG8gc28sIHN1YmplY3QgdG8gdGhlXG4vLyBmb2xsb3dpbmcgY29uZGl0aW9uczpcbi8vXG4vLyBUaGUgYWJvdmUgY29weXJpZ2h0IG5vdGljZSBhbmQgdGhpcyBwZXJtaXNzaW9uIG5vdGljZSBzaGFsbCBiZSBpbmNsdWRlZFxuLy8gaW4gYWxsIGNvcGllcyBvciBzdWJzdGFudGlhbCBwb3J0aW9ucyBvZiB0aGUgU29mdHdhcmUuXG4vL1xuLy8gVEhFIFNPRlRXQVJFIElTIFBST1ZJREVEIFwiQVMgSVNcIiwgV0lUSE9VVCBXQVJSQU5UWSBPRiBBTlkgS0lORCwgRVhQUkVTU1xuLy8gT1IgSU1QTElFRCwgSU5DTFVESU5HIEJVVCBOT1QgTElNSVRFRCBUTyBUSEUgV0FSUkFOVElFUyBPRlxuLy8gTUVSQ0hBTlRBQklMSVRZLCBGSVRORVNTIEZPUiBBIFBBUlRJQ1VMQVIgUFVSUE9TRSBBTkQgTk9OSU5GUklOR0VNRU5ULiBJTlxuLy8gTk8gRVZFTlQgU0hBTEwgVEhFIEFVVEhPUlMgT1IgQ09QWVJJR0hUIEhPTERFUlMgQkUgTElBQkxFIEZPUiBBTlkgQ0xBSU0sXG4vLyBEQU1BR0VTIE9SIE9USEVSIExJQUJJTElUWSwgV0hFVEhFUiBJTiBBTiBBQ1RJT04gT0YgQ09OVFJBQ1QsIFRPUlQgT1Jcbi8vIE9USEVSV0lTRSwgQVJJU0lORyBGUk9NLCBPVVQgT0YgT1IgSU4gQ09OTkVDVElPTiBXSVRIIFRIRSBTT0ZUV0FSRSBPUiBUSEVcbi8vIFVTRSBPUiBPVEhFUiBERUFMSU5HUyBJTiBUSEUgU09GVFdBUkUuXG5cbmZ1bmN0aW9uIEV2ZW50RW1pdHRlcigpIHtcbiAgdGhpcy5fZXZlbnRzID0gdGhpcy5fZXZlbnRzIHx8IHt9O1xuICB0aGlzLl9tYXhMaXN0ZW5lcnMgPSB0aGlzLl9tYXhMaXN0ZW5lcnMgfHwgdW5kZWZpbmVkO1xufVxubW9kdWxlLmV4cG9ydHMgPSBFdmVudEVtaXR0ZXI7XG5cbi8vIEJhY2t3YXJkcy1jb21wYXQgd2l0aCBub2RlIDAuMTAueFxuRXZlbnRFbWl0dGVyLkV2ZW50RW1pdHRlciA9IEV2ZW50RW1pdHRlcjtcblxuRXZlbnRFbWl0dGVyLnByb3RvdHlwZS5fZXZlbnRzID0gdW5kZWZpbmVkO1xuRXZlbnRFbWl0dGVyLnByb3RvdHlwZS5fbWF4TGlzdGVuZXJzID0gdW5kZWZpbmVkO1xuXG4vLyBCeSBkZWZhdWx0IEV2ZW50RW1pdHRlcnMgd2lsbCBwcmludCBhIHdhcm5pbmcgaWYgbW9yZSB0aGFuIDEwIGxpc3RlbmVycyBhcmVcbi8vIGFkZGVkIHRvIGl0LiBUaGlzIGlzIGEgdXNlZnVsIGRlZmF1bHQgd2hpY2ggaGVscHMgZmluZGluZyBtZW1vcnkgbGVha3MuXG5FdmVudEVtaXR0ZXIuZGVmYXVsdE1heExpc3RlbmVycyA9IDEwO1xuXG4vLyBPYnZpb3VzbHkgbm90IGFsbCBFbWl0dGVycyBzaG91bGQgYmUgbGltaXRlZCB0byAxMC4gVGhpcyBmdW5jdGlvbiBhbGxvd3Ncbi8vIHRoYXQgdG8gYmUgaW5jcmVhc2VkLiBTZXQgdG8gemVybyBmb3IgdW5saW1pdGVkLlxuRXZlbnRFbWl0dGVyLnByb3RvdHlwZS5zZXRNYXhMaXN0ZW5lcnMgPSBmdW5jdGlvbihuKSB7XG4gIGlmICghaXNOdW1iZXIobikgfHwgbiA8IDAgfHwgaXNOYU4obikpXG4gICAgdGhyb3cgVHlwZUVycm9yKCduIG11c3QgYmUgYSBwb3NpdGl2ZSBudW1iZXInKTtcbiAgdGhpcy5fbWF4TGlzdGVuZXJzID0gbjtcbiAgcmV0dXJuIHRoaXM7XG59O1xuXG5FdmVudEVtaXR0ZXIucHJvdG90eXBlLmVtaXQgPSBmdW5jdGlvbih0eXBlKSB7XG4gIHZhciBlciwgaGFuZGxlciwgbGVuLCBhcmdzLCBpLCBsaXN0ZW5lcnM7XG5cbiAgaWYgKCF0aGlzLl9ldmVudHMpXG4gICAgdGhpcy5fZXZlbnRzID0ge307XG5cbiAgLy8gSWYgdGhlcmUgaXMgbm8gJ2Vycm9yJyBldmVudCBsaXN0ZW5lciB0aGVuIHRocm93LlxuICBpZiAodHlwZSA9PT0gJ2Vycm9yJykge1xuICAgIGlmICghdGhpcy5fZXZlbnRzLmVycm9yIHx8XG4gICAgICAgIChpc09iamVjdCh0aGlzLl9ldmVudHMuZXJyb3IpICYmICF0aGlzLl9ldmVudHMuZXJyb3IubGVuZ3RoKSkge1xuICAgICAgZXIgPSBhcmd1bWVudHNbMV07XG4gICAgICBpZiAoZXIgaW5zdGFuY2VvZiBFcnJvcikge1xuICAgICAgICB0aHJvdyBlcjsgLy8gVW5oYW5kbGVkICdlcnJvcicgZXZlbnRcbiAgICAgIH1cbiAgICAgIHRocm93IFR5cGVFcnJvcignVW5jYXVnaHQsIHVuc3BlY2lmaWVkIFwiZXJyb3JcIiBldmVudC4nKTtcbiAgICB9XG4gIH1cblxuICBoYW5kbGVyID0gdGhpcy5fZXZlbnRzW3R5cGVdO1xuXG4gIGlmIChpc1VuZGVmaW5lZChoYW5kbGVyKSlcbiAgICByZXR1cm4gZmFsc2U7XG5cbiAgaWYgKGlzRnVuY3Rpb24oaGFuZGxlcikpIHtcbiAgICBzd2l0Y2ggKGFyZ3VtZW50cy5sZW5ndGgpIHtcbiAgICAgIC8vIGZhc3QgY2FzZXNcbiAgICAgIGNhc2UgMTpcbiAgICAgICAgaGFuZGxlci5jYWxsKHRoaXMpO1xuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgMjpcbiAgICAgICAgaGFuZGxlci5jYWxsKHRoaXMsIGFyZ3VtZW50c1sxXSk7XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSAzOlxuICAgICAgICBoYW5kbGVyLmNhbGwodGhpcywgYXJndW1lbnRzWzFdLCBhcmd1bWVudHNbMl0pO1xuICAgICAgICBicmVhaztcbiAgICAgIC8vIHNsb3dlclxuICAgICAgZGVmYXVsdDpcbiAgICAgICAgbGVuID0gYXJndW1lbnRzLmxlbmd0aDtcbiAgICAgICAgYXJncyA9IG5ldyBBcnJheShsZW4gLSAxKTtcbiAgICAgICAgZm9yIChpID0gMTsgaSA8IGxlbjsgaSsrKVxuICAgICAgICAgIGFyZ3NbaSAtIDFdID0gYXJndW1lbnRzW2ldO1xuICAgICAgICBoYW5kbGVyLmFwcGx5KHRoaXMsIGFyZ3MpO1xuICAgIH1cbiAgfSBlbHNlIGlmIChpc09iamVjdChoYW5kbGVyKSkge1xuICAgIGxlbiA9IGFyZ3VtZW50cy5sZW5ndGg7XG4gICAgYXJncyA9IG5ldyBBcnJheShsZW4gLSAxKTtcbiAgICBmb3IgKGkgPSAxOyBpIDwgbGVuOyBpKyspXG4gICAgICBhcmdzW2kgLSAxXSA9IGFyZ3VtZW50c1tpXTtcblxuICAgIGxpc3RlbmVycyA9IGhhbmRsZXIuc2xpY2UoKTtcbiAgICBsZW4gPSBsaXN0ZW5lcnMubGVuZ3RoO1xuICAgIGZvciAoaSA9IDA7IGkgPCBsZW47IGkrKylcbiAgICAgIGxpc3RlbmVyc1tpXS5hcHBseSh0aGlzLCBhcmdzKTtcbiAgfVxuXG4gIHJldHVybiB0cnVlO1xufTtcblxuRXZlbnRFbWl0dGVyLnByb3RvdHlwZS5hZGRMaXN0ZW5lciA9IGZ1bmN0aW9uKHR5cGUsIGxpc3RlbmVyKSB7XG4gIHZhciBtO1xuXG4gIGlmICghaXNGdW5jdGlvbihsaXN0ZW5lcikpXG4gICAgdGhyb3cgVHlwZUVycm9yKCdsaXN0ZW5lciBtdXN0IGJlIGEgZnVuY3Rpb24nKTtcblxuICBpZiAoIXRoaXMuX2V2ZW50cylcbiAgICB0aGlzLl9ldmVudHMgPSB7fTtcblxuICAvLyBUbyBhdm9pZCByZWN1cnNpb24gaW4gdGhlIGNhc2UgdGhhdCB0eXBlID09PSBcIm5ld0xpc3RlbmVyXCIhIEJlZm9yZVxuICAvLyBhZGRpbmcgaXQgdG8gdGhlIGxpc3RlbmVycywgZmlyc3QgZW1pdCBcIm5ld0xpc3RlbmVyXCIuXG4gIGlmICh0aGlzLl9ldmVudHMubmV3TGlzdGVuZXIpXG4gICAgdGhpcy5lbWl0KCduZXdMaXN0ZW5lcicsIHR5cGUsXG4gICAgICAgICAgICAgIGlzRnVuY3Rpb24obGlzdGVuZXIubGlzdGVuZXIpID9cbiAgICAgICAgICAgICAgbGlzdGVuZXIubGlzdGVuZXIgOiBsaXN0ZW5lcik7XG5cbiAgaWYgKCF0aGlzLl9ldmVudHNbdHlwZV0pXG4gICAgLy8gT3B0aW1pemUgdGhlIGNhc2Ugb2Ygb25lIGxpc3RlbmVyLiBEb24ndCBuZWVkIHRoZSBleHRyYSBhcnJheSBvYmplY3QuXG4gICAgdGhpcy5fZXZlbnRzW3R5cGVdID0gbGlzdGVuZXI7XG4gIGVsc2UgaWYgKGlzT2JqZWN0KHRoaXMuX2V2ZW50c1t0eXBlXSkpXG4gICAgLy8gSWYgd2UndmUgYWxyZWFkeSBnb3QgYW4gYXJyYXksIGp1c3QgYXBwZW5kLlxuICAgIHRoaXMuX2V2ZW50c1t0eXBlXS5wdXNoKGxpc3RlbmVyKTtcbiAgZWxzZVxuICAgIC8vIEFkZGluZyB0aGUgc2Vjb25kIGVsZW1lbnQsIG5lZWQgdG8gY2hhbmdlIHRvIGFycmF5LlxuICAgIHRoaXMuX2V2ZW50c1t0eXBlXSA9IFt0aGlzLl9ldmVudHNbdHlwZV0sIGxpc3RlbmVyXTtcblxuICAvLyBDaGVjayBmb3IgbGlzdGVuZXIgbGVha1xuICBpZiAoaXNPYmplY3QodGhpcy5fZXZlbnRzW3R5cGVdKSAmJiAhdGhpcy5fZXZlbnRzW3R5cGVdLndhcm5lZCkge1xuICAgIHZhciBtO1xuICAgIGlmICghaXNVbmRlZmluZWQodGhpcy5fbWF4TGlzdGVuZXJzKSkge1xuICAgICAgbSA9IHRoaXMuX21heExpc3RlbmVycztcbiAgICB9IGVsc2Uge1xuICAgICAgbSA9IEV2ZW50RW1pdHRlci5kZWZhdWx0TWF4TGlzdGVuZXJzO1xuICAgIH1cblxuICAgIGlmIChtICYmIG0gPiAwICYmIHRoaXMuX2V2ZW50c1t0eXBlXS5sZW5ndGggPiBtKSB7XG4gICAgICB0aGlzLl9ldmVudHNbdHlwZV0ud2FybmVkID0gdHJ1ZTtcbiAgICAgIGNvbnNvbGUuZXJyb3IoJyhub2RlKSB3YXJuaW5nOiBwb3NzaWJsZSBFdmVudEVtaXR0ZXIgbWVtb3J5ICcgK1xuICAgICAgICAgICAgICAgICAgICAnbGVhayBkZXRlY3RlZC4gJWQgbGlzdGVuZXJzIGFkZGVkLiAnICtcbiAgICAgICAgICAgICAgICAgICAgJ1VzZSBlbWl0dGVyLnNldE1heExpc3RlbmVycygpIHRvIGluY3JlYXNlIGxpbWl0LicsXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuX2V2ZW50c1t0eXBlXS5sZW5ndGgpO1xuICAgICAgaWYgKHR5cGVvZiBjb25zb2xlLnRyYWNlID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgIC8vIG5vdCBzdXBwb3J0ZWQgaW4gSUUgMTBcbiAgICAgICAgY29uc29sZS50cmFjZSgpO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIHJldHVybiB0aGlzO1xufTtcblxuRXZlbnRFbWl0dGVyLnByb3RvdHlwZS5vbiA9IEV2ZW50RW1pdHRlci5wcm90b3R5cGUuYWRkTGlzdGVuZXI7XG5cbkV2ZW50RW1pdHRlci5wcm90b3R5cGUub25jZSA9IGZ1bmN0aW9uKHR5cGUsIGxpc3RlbmVyKSB7XG4gIGlmICghaXNGdW5jdGlvbihsaXN0ZW5lcikpXG4gICAgdGhyb3cgVHlwZUVycm9yKCdsaXN0ZW5lciBtdXN0IGJlIGEgZnVuY3Rpb24nKTtcblxuICB2YXIgZmlyZWQgPSBmYWxzZTtcblxuICBmdW5jdGlvbiBnKCkge1xuICAgIHRoaXMucmVtb3ZlTGlzdGVuZXIodHlwZSwgZyk7XG5cbiAgICBpZiAoIWZpcmVkKSB7XG4gICAgICBmaXJlZCA9IHRydWU7XG4gICAgICBsaXN0ZW5lci5hcHBseSh0aGlzLCBhcmd1bWVudHMpO1xuICAgIH1cbiAgfVxuXG4gIGcubGlzdGVuZXIgPSBsaXN0ZW5lcjtcbiAgdGhpcy5vbih0eXBlLCBnKTtcblxuICByZXR1cm4gdGhpcztcbn07XG5cbi8vIGVtaXRzIGEgJ3JlbW92ZUxpc3RlbmVyJyBldmVudCBpZmYgdGhlIGxpc3RlbmVyIHdhcyByZW1vdmVkXG5FdmVudEVtaXR0ZXIucHJvdG90eXBlLnJlbW92ZUxpc3RlbmVyID0gZnVuY3Rpb24odHlwZSwgbGlzdGVuZXIpIHtcbiAgdmFyIGxpc3QsIHBvc2l0aW9uLCBsZW5ndGgsIGk7XG5cbiAgaWYgKCFpc0Z1bmN0aW9uKGxpc3RlbmVyKSlcbiAgICB0aHJvdyBUeXBlRXJyb3IoJ2xpc3RlbmVyIG11c3QgYmUgYSBmdW5jdGlvbicpO1xuXG4gIGlmICghdGhpcy5fZXZlbnRzIHx8ICF0aGlzLl9ldmVudHNbdHlwZV0pXG4gICAgcmV0dXJuIHRoaXM7XG5cbiAgbGlzdCA9IHRoaXMuX2V2ZW50c1t0eXBlXTtcbiAgbGVuZ3RoID0gbGlzdC5sZW5ndGg7XG4gIHBvc2l0aW9uID0gLTE7XG5cbiAgaWYgKGxpc3QgPT09IGxpc3RlbmVyIHx8XG4gICAgICAoaXNGdW5jdGlvbihsaXN0Lmxpc3RlbmVyKSAmJiBsaXN0Lmxpc3RlbmVyID09PSBsaXN0ZW5lcikpIHtcbiAgICBkZWxldGUgdGhpcy5fZXZlbnRzW3R5cGVdO1xuICAgIGlmICh0aGlzLl9ldmVudHMucmVtb3ZlTGlzdGVuZXIpXG4gICAgICB0aGlzLmVtaXQoJ3JlbW92ZUxpc3RlbmVyJywgdHlwZSwgbGlzdGVuZXIpO1xuXG4gIH0gZWxzZSBpZiAoaXNPYmplY3QobGlzdCkpIHtcbiAgICBmb3IgKGkgPSBsZW5ndGg7IGktLSA+IDA7KSB7XG4gICAgICBpZiAobGlzdFtpXSA9PT0gbGlzdGVuZXIgfHxcbiAgICAgICAgICAobGlzdFtpXS5saXN0ZW5lciAmJiBsaXN0W2ldLmxpc3RlbmVyID09PSBsaXN0ZW5lcikpIHtcbiAgICAgICAgcG9zaXRpb24gPSBpO1xuICAgICAgICBicmVhaztcbiAgICAgIH1cbiAgICB9XG5cbiAgICBpZiAocG9zaXRpb24gPCAwKVxuICAgICAgcmV0dXJuIHRoaXM7XG5cbiAgICBpZiAobGlzdC5sZW5ndGggPT09IDEpIHtcbiAgICAgIGxpc3QubGVuZ3RoID0gMDtcbiAgICAgIGRlbGV0ZSB0aGlzLl9ldmVudHNbdHlwZV07XG4gICAgfSBlbHNlIHtcbiAgICAgIGxpc3Quc3BsaWNlKHBvc2l0aW9uLCAxKTtcbiAgICB9XG5cbiAgICBpZiAodGhpcy5fZXZlbnRzLnJlbW92ZUxpc3RlbmVyKVxuICAgICAgdGhpcy5lbWl0KCdyZW1vdmVMaXN0ZW5lcicsIHR5cGUsIGxpc3RlbmVyKTtcbiAgfVxuXG4gIHJldHVybiB0aGlzO1xufTtcblxuRXZlbnRFbWl0dGVyLnByb3RvdHlwZS5yZW1vdmVBbGxMaXN0ZW5lcnMgPSBmdW5jdGlvbih0eXBlKSB7XG4gIHZhciBrZXksIGxpc3RlbmVycztcblxuICBpZiAoIXRoaXMuX2V2ZW50cylcbiAgICByZXR1cm4gdGhpcztcblxuICAvLyBub3QgbGlzdGVuaW5nIGZvciByZW1vdmVMaXN0ZW5lciwgbm8gbmVlZCB0byBlbWl0XG4gIGlmICghdGhpcy5fZXZlbnRzLnJlbW92ZUxpc3RlbmVyKSB7XG4gICAgaWYgKGFyZ3VtZW50cy5sZW5ndGggPT09IDApXG4gICAgICB0aGlzLl9ldmVudHMgPSB7fTtcbiAgICBlbHNlIGlmICh0aGlzLl9ldmVudHNbdHlwZV0pXG4gICAgICBkZWxldGUgdGhpcy5fZXZlbnRzW3R5cGVdO1xuICAgIHJldHVybiB0aGlzO1xuICB9XG5cbiAgLy8gZW1pdCByZW1vdmVMaXN0ZW5lciBmb3IgYWxsIGxpc3RlbmVycyBvbiBhbGwgZXZlbnRzXG4gIGlmIChhcmd1bWVudHMubGVuZ3RoID09PSAwKSB7XG4gICAgZm9yIChrZXkgaW4gdGhpcy5fZXZlbnRzKSB7XG4gICAgICBpZiAoa2V5ID09PSAncmVtb3ZlTGlzdGVuZXInKSBjb250aW51ZTtcbiAgICAgIHRoaXMucmVtb3ZlQWxsTGlzdGVuZXJzKGtleSk7XG4gICAgfVxuICAgIHRoaXMucmVtb3ZlQWxsTGlzdGVuZXJzKCdyZW1vdmVMaXN0ZW5lcicpO1xuICAgIHRoaXMuX2V2ZW50cyA9IHt9O1xuICAgIHJldHVybiB0aGlzO1xuICB9XG5cbiAgbGlzdGVuZXJzID0gdGhpcy5fZXZlbnRzW3R5cGVdO1xuXG4gIGlmIChpc0Z1bmN0aW9uKGxpc3RlbmVycykpIHtcbiAgICB0aGlzLnJlbW92ZUxpc3RlbmVyKHR5cGUsIGxpc3RlbmVycyk7XG4gIH0gZWxzZSB7XG4gICAgLy8gTElGTyBvcmRlclxuICAgIHdoaWxlIChsaXN0ZW5lcnMubGVuZ3RoKVxuICAgICAgdGhpcy5yZW1vdmVMaXN0ZW5lcih0eXBlLCBsaXN0ZW5lcnNbbGlzdGVuZXJzLmxlbmd0aCAtIDFdKTtcbiAgfVxuICBkZWxldGUgdGhpcy5fZXZlbnRzW3R5cGVdO1xuXG4gIHJldHVybiB0aGlzO1xufTtcblxuRXZlbnRFbWl0dGVyLnByb3RvdHlwZS5saXN0ZW5lcnMgPSBmdW5jdGlvbih0eXBlKSB7XG4gIHZhciByZXQ7XG4gIGlmICghdGhpcy5fZXZlbnRzIHx8ICF0aGlzLl9ldmVudHNbdHlwZV0pXG4gICAgcmV0ID0gW107XG4gIGVsc2UgaWYgKGlzRnVuY3Rpb24odGhpcy5fZXZlbnRzW3R5cGVdKSlcbiAgICByZXQgPSBbdGhpcy5fZXZlbnRzW3R5cGVdXTtcbiAgZWxzZVxuICAgIHJldCA9IHRoaXMuX2V2ZW50c1t0eXBlXS5zbGljZSgpO1xuICByZXR1cm4gcmV0O1xufTtcblxuRXZlbnRFbWl0dGVyLmxpc3RlbmVyQ291bnQgPSBmdW5jdGlvbihlbWl0dGVyLCB0eXBlKSB7XG4gIHZhciByZXQ7XG4gIGlmICghZW1pdHRlci5fZXZlbnRzIHx8ICFlbWl0dGVyLl9ldmVudHNbdHlwZV0pXG4gICAgcmV0ID0gMDtcbiAgZWxzZSBpZiAoaXNGdW5jdGlvbihlbWl0dGVyLl9ldmVudHNbdHlwZV0pKVxuICAgIHJldCA9IDE7XG4gIGVsc2VcbiAgICByZXQgPSBlbWl0dGVyLl9ldmVudHNbdHlwZV0ubGVuZ3RoO1xuICByZXR1cm4gcmV0O1xufTtcblxuZnVuY3Rpb24gaXNGdW5jdGlvbihhcmcpIHtcbiAgcmV0dXJuIHR5cGVvZiBhcmcgPT09ICdmdW5jdGlvbic7XG59XG5cbmZ1bmN0aW9uIGlzTnVtYmVyKGFyZykge1xuICByZXR1cm4gdHlwZW9mIGFyZyA9PT0gJ251bWJlcic7XG59XG5cbmZ1bmN0aW9uIGlzT2JqZWN0KGFyZykge1xuICByZXR1cm4gdHlwZW9mIGFyZyA9PT0gJ29iamVjdCcgJiYgYXJnICE9PSBudWxsO1xufVxuXG5mdW5jdGlvbiBpc1VuZGVmaW5lZChhcmcpIHtcbiAgcmV0dXJuIGFyZyA9PT0gdm9pZCAwO1xufVxuIiwibW9kdWxlLmV4cG9ydHMgPSBvbjtcbm1vZHVsZS5leHBvcnRzLm9uID0gb247XG5tb2R1bGUuZXhwb3J0cy5vZmYgPSBvZmY7XG5cbi8qKlxuICogTW9kdWxlIGRlcGVuZGVuY2llcy5cbiAqL1xuXG52YXIgbWF0Y2hlcyA9IHJlcXVpcmUoJ21hdGNoZXMtZG9tLXNlbGVjdG9yJylcbiAgLCBvbiA9IHJlcXVpcmUoJ2RvbS1ldmVudCcpO1xuXG4vKipcbiAqIERlbGVnYXRlIGV2ZW50IGB0eXBlYCB0byBgc2VsZWN0b3JgXG4gKiBhbmQgaW52b2tlIGBmbihlKWAuIEEgY2FsbGJhY2sgZnVuY3Rpb25cbiAqIGlzIHJldHVybmVkIHdoaWNoIG1heSBiZSBwYXNzZWQgdG8gYC51bmJpbmQoKWAuXG4gKlxuICogQHBhcmFtIHtFbGVtZW50fSBlbFxuICogQHBhcmFtIHtTdHJpbmd9IHNlbGVjdG9yXG4gKiBAcGFyYW0ge1N0cmluZ30gdHlwZVxuICogQHBhcmFtIHtGdW5jdGlvbn0gZm5cbiAqIEBwYXJhbSB7Qm9vbGVhbn0gY2FwdHVyZVxuICogQHJldHVybiB7RnVuY3Rpb259XG4gKiBAYXBpIHB1YmxpY1xuICovXG5cbmZ1bmN0aW9uIG9uKGVsLCBzZWxlY3RvciwgdHlwZSwgZm4sIGNhcHR1cmUpe1xuICByZXR1cm4gb24oZWwsIHR5cGUsIGZ1bmN0aW9uKGUpe1xuICAgIGlmIChtYXRjaGVzKGUudGFyZ2V0IHx8IGUuc3JjRWxlbWVudCwgc2VsZWN0b3IpKSBmbi5jYWxsKGVsLCBlKTtcbiAgfSwgY2FwdHVyZSk7XG59O1xuXG4vKipcbiAqIFVuYmluZCBldmVudCBgdHlwZWAncyBjYWxsYmFjayBgZm5gLlxuICpcbiAqIEBwYXJhbSB7RWxlbWVudH0gZWxcbiAqIEBwYXJhbSB7U3RyaW5nfSB0eXBlXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBmblxuICogQHBhcmFtIHtCb29sZWFufSBjYXB0dXJlXG4gKiBAYXBpIHB1YmxpY1xuICovXG5cbmZ1bmN0aW9uIG9mZihlbCwgdHlwZSwgZm4sIGNhcHR1cmUpe1xuICBvbi5vZmYoZWwsIHR5cGUsIGZuLCBjYXB0dXJlKTtcbn07XG4iLCJtb2R1bGUuZXhwb3J0cyA9IG9uO1xubW9kdWxlLmV4cG9ydHMub24gPSBvbjtcbm1vZHVsZS5leHBvcnRzLm9mZiA9IG9mZjtcblxuZnVuY3Rpb24gb24gKGVsZW1lbnQsIGV2ZW50LCBjYWxsYmFjaywgY2FwdHVyZSkge1xuICAhZWxlbWVudC5hZGRFdmVudExpc3RlbmVyICYmIChldmVudCA9ICdvbicgKyBldmVudCk7XG4gIChlbGVtZW50LmFkZEV2ZW50TGlzdGVuZXIgfHwgZWxlbWVudC5hdHRhY2hFdmVudCkuY2FsbChlbGVtZW50LCBldmVudCwgY2FsbGJhY2ssIGNhcHR1cmUpO1xuICByZXR1cm4gY2FsbGJhY2s7XG59XG5cbmZ1bmN0aW9uIG9mZiAoZWxlbWVudCwgZXZlbnQsIGNhbGxiYWNrLCBjYXB0dXJlKSB7XG4gICFlbGVtZW50LnJlbW92ZUV2ZW50TGlzdGVuZXIgJiYgKGV2ZW50ID0gJ29uJyArIGV2ZW50KTtcbiAgKGVsZW1lbnQucmVtb3ZlRXZlbnRMaXN0ZW5lciB8fCBlbGVtZW50LmRldGFjaEV2ZW50KS5jYWxsKGVsZW1lbnQsIGV2ZW50LCBjYWxsYmFjaywgY2FwdHVyZSk7XG4gIHJldHVybiBjYWxsYmFjaztcbn1cbiIsIi8qKlxuICogTW9kdWxlIGRlcGVuZGVuY2llcy5cbiAqL1xuXG52YXIgcXVlcnkgPSByZXF1aXJlKCdzZWxlY3QtZG9tJyk7XG5cbi8qKlxuICogRWxlbWVudCBwcm90b3R5cGUuXG4gKi9cblxudmFyIHByb3RvID0gRWxlbWVudC5wcm90b3R5cGU7XG5cbi8qKlxuICogVmVuZG9yIGZ1bmN0aW9uLlxuICovXG5cbnZhciB2ZW5kb3IgPSBwcm90by5tYXRjaGVzU2VsZWN0b3JcbiAgfHwgcHJvdG8ud2Via2l0TWF0Y2hlc1NlbGVjdG9yXG4gIHx8IHByb3RvLm1vek1hdGNoZXNTZWxlY3RvclxuICB8fCBwcm90by5tc01hdGNoZXNTZWxlY3RvclxuICB8fCBwcm90by5vTWF0Y2hlc1NlbGVjdG9yO1xuXG4vKipcbiAqIEV4cG9zZSBgbWF0Y2goKWAuXG4gKi9cblxubW9kdWxlLmV4cG9ydHMgPSBtYXRjaDtcblxuLyoqXG4gKiBNYXRjaCBgZWxgIHRvIGBzZWxlY3RvcmAuXG4gKlxuICogQHBhcmFtIHtFbGVtZW50fSBlbFxuICogQHBhcmFtIHtTdHJpbmd9IHNlbGVjdG9yXG4gKiBAcmV0dXJuIHtCb29sZWFufVxuICogQGFwaSBwdWJsaWNcbiAqL1xuXG5mdW5jdGlvbiBtYXRjaChlbCwgc2VsZWN0b3IpIHtcbiAgaWYgKHZlbmRvcikgcmV0dXJuIHZlbmRvci5jYWxsKGVsLCBzZWxlY3Rvcik7XG4gIHZhciBub2RlcyA9IHF1ZXJ5LmFsbChzZWxlY3RvciwgZWwucGFyZW50Tm9kZSk7XG4gIGZvciAodmFyIGkgPSAwOyBpIDwgbm9kZXMubGVuZ3RoOyArK2kpIHtcbiAgICBpZiAobm9kZXNbaV0gPT0gZWwpIHJldHVybiB0cnVlO1xuICB9XG4gIHJldHVybiBmYWxzZTtcbn1cbiIsInZhciBxd2VyeSA9IHJlcXVpcmUoXCJxd2VyeVwiKTtcblxubW9kdWxlLmV4cG9ydHMgPSB7XG4gIG9uZTogb25lLFxuICBhbGw6IGFsbFxufTtcblxuZnVuY3Rpb24gYWxsIChzZWxlY3RvciwgcGFyZW50KSB7XG4gIHJldHVybiBxd2VyeShzZWxlY3RvciwgcGFyZW50KTtcbn1cblxuZnVuY3Rpb24gb25lIChzZWxlY3RvciwgcGFyZW50KSB7XG4gIHJldHVybiBhbGwoc2VsZWN0b3IsIHBhcmVudClbMF07XG59XG4iLCJ2YXIgZmFsbGJhY2sgPSByZXF1aXJlKCcuL2ZhbGxiYWNrJyk7XG5cbm1vZHVsZS5leHBvcnRzID0gb25lO1xubW9kdWxlLmV4cG9ydHMuYWxsID0gYWxsO1xuXG5mdW5jdGlvbiBvbmUgKHNlbGVjdG9yLCBwYXJlbnQpIHtcbiAgcGFyZW50IHx8IChwYXJlbnQgPSBkb2N1bWVudCk7XG5cbiAgaWYgKHBhcmVudC5xdWVyeVNlbGVjdG9yKSB7XG4gICAgcmV0dXJuIHBhcmVudC5xdWVyeVNlbGVjdG9yKHNlbGVjdG9yKTtcbiAgfVxuXG4gIHJldHVybiBmYWxsYmFjay5vbmUoc2VsZWN0b3IsIHBhcmVudCk7XG59XG5cbmZ1bmN0aW9uIGFsbCAoc2VsZWN0b3IsIHBhcmVudCkge1xuICBwYXJlbnQgfHwgKHBhcmVudCA9IGRvY3VtZW50KTtcblxuICBpZiAocGFyZW50LnF1ZXJ5U2VsZWN0b3JBbGwpIHtcbiAgICByZXR1cm4gcGFyZW50LnF1ZXJ5U2VsZWN0b3JBbGwoc2VsZWN0b3IpO1xuICB9XG5cbiAgcmV0dXJuIGZhbGxiYWNrLmFsbChzZWxlY3RvciwgcGFyZW50KTtcbn1cbiIsIi8qIVxuICAqIEBwcmVzZXJ2ZSBRd2VyeSAtIEEgQmxhemluZyBGYXN0IHF1ZXJ5IHNlbGVjdG9yIGVuZ2luZVxuICAqIGh0dHBzOi8vZ2l0aHViLmNvbS9kZWQvcXdlcnlcbiAgKiBjb3B5cmlnaHQgRHVzdGluIERpYXogMjAxMlxuICAqIE1JVCBMaWNlbnNlXG4gICovXG5cbihmdW5jdGlvbiAobmFtZSwgY29udGV4dCwgZGVmaW5pdGlvbikge1xuICBpZiAodHlwZW9mIG1vZHVsZSAhPSAndW5kZWZpbmVkJyAmJiBtb2R1bGUuZXhwb3J0cykgbW9kdWxlLmV4cG9ydHMgPSBkZWZpbml0aW9uKClcbiAgZWxzZSBpZiAodHlwZW9mIGRlZmluZSA9PSAnZnVuY3Rpb24nICYmIGRlZmluZS5hbWQpIGRlZmluZShkZWZpbml0aW9uKVxuICBlbHNlIGNvbnRleHRbbmFtZV0gPSBkZWZpbml0aW9uKClcbn0pKCdxd2VyeScsIHRoaXMsIGZ1bmN0aW9uICgpIHtcbiAgdmFyIGRvYyA9IGRvY3VtZW50XG4gICAgLCBodG1sID0gZG9jLmRvY3VtZW50RWxlbWVudFxuICAgICwgYnlDbGFzcyA9ICdnZXRFbGVtZW50c0J5Q2xhc3NOYW1lJ1xuICAgICwgYnlUYWcgPSAnZ2V0RWxlbWVudHNCeVRhZ05hbWUnXG4gICAgLCBxU0EgPSAncXVlcnlTZWxlY3RvckFsbCdcbiAgICAsIHVzZU5hdGl2ZVFTQSA9ICd1c2VOYXRpdmVRU0EnXG4gICAgLCB0YWdOYW1lID0gJ3RhZ05hbWUnXG4gICAgLCBub2RlVHlwZSA9ICdub2RlVHlwZSdcbiAgICAsIHNlbGVjdCAvLyBtYWluIHNlbGVjdCgpIG1ldGhvZCwgYXNzaWduIGxhdGVyXG5cbiAgICAsIGlkID0gLyMoW1xcd1xcLV0rKS9cbiAgICAsIGNsYXMgPSAvXFwuW1xcd1xcLV0rL2dcbiAgICAsIGlkT25seSA9IC9eIyhbXFx3XFwtXSspJC9cbiAgICAsIGNsYXNzT25seSA9IC9eXFwuKFtcXHdcXC1dKykkL1xuICAgICwgdGFnT25seSA9IC9eKFtcXHdcXC1dKykkL1xuICAgICwgdGFnQW5kT3JDbGFzcyA9IC9eKFtcXHddKyk/XFwuKFtcXHdcXC1dKykkL1xuICAgICwgc3BsaXR0YWJsZSA9IC8oXnwsKVxccypbPn4rXS9cbiAgICAsIG5vcm1hbGl6ciA9IC9eXFxzK3xcXHMqKFssXFxzXFwrXFx+Pl18JClcXHMqL2dcbiAgICAsIHNwbGl0dGVycyA9IC9bXFxzXFw+XFwrXFx+XS9cbiAgICAsIHNwbGl0dGVyc01vcmUgPSAvKD8hW1xcc1xcd1xcLVxcL1xcP1xcJlxcPVxcOlxcLlxcKFxcKVxcISxAIyU8Plxce1xcfVxcJFxcKlxcXidcIl0qXFxdfFtcXHNcXHdcXCtcXC1dKlxcKSkvXG4gICAgLCBzcGVjaWFsQ2hhcnMgPSAvKFsuKis/XFxePSE6JHt9KCl8XFxbXFxdXFwvXFxcXF0pL2dcbiAgICAsIHNpbXBsZSA9IC9eKFxcKnxbYS16MC05XSspPyg/OihbXFwuXFwjXStbXFx3XFwtXFwuI10rKT8pL1xuICAgICwgYXR0ciA9IC9cXFsoW1xcd1xcLV0rKSg/OihbXFx8XFxeXFwkXFwqXFx+XT9cXD0pWydcIl0/KFsgXFx3XFwtXFwvXFw/XFwmXFw9XFw6XFwuXFwoXFwpXFwhLEAjJTw+XFx7XFx9XFwkXFwqXFxeXSspW1wiJ10/KT9cXF0vXG4gICAgLCBwc2V1ZG8gPSAvOihbXFx3XFwtXSspKFxcKFsnXCJdPyhbXigpXSspWydcIl0/XFwpKT8vXG4gICAgLCBlYXN5ID0gbmV3IFJlZ0V4cChpZE9ubHkuc291cmNlICsgJ3wnICsgdGFnT25seS5zb3VyY2UgKyAnfCcgKyBjbGFzc09ubHkuc291cmNlKVxuICAgICwgZGl2aWRlcnMgPSBuZXcgUmVnRXhwKCcoJyArIHNwbGl0dGVycy5zb3VyY2UgKyAnKScgKyBzcGxpdHRlcnNNb3JlLnNvdXJjZSwgJ2cnKVxuICAgICwgdG9rZW5penIgPSBuZXcgUmVnRXhwKHNwbGl0dGVycy5zb3VyY2UgKyBzcGxpdHRlcnNNb3JlLnNvdXJjZSlcbiAgICAsIGNodW5rZXIgPSBuZXcgUmVnRXhwKHNpbXBsZS5zb3VyY2UgKyAnKCcgKyBhdHRyLnNvdXJjZSArICcpPycgKyAnKCcgKyBwc2V1ZG8uc291cmNlICsgJyk/JylcblxuICB2YXIgd2Fsa2VyID0ge1xuICAgICAgJyAnOiBmdW5jdGlvbiAobm9kZSkge1xuICAgICAgICByZXR1cm4gbm9kZSAmJiBub2RlICE9PSBodG1sICYmIG5vZGUucGFyZW50Tm9kZVxuICAgICAgfVxuICAgICwgJz4nOiBmdW5jdGlvbiAobm9kZSwgY29udGVzdGFudCkge1xuICAgICAgICByZXR1cm4gbm9kZSAmJiBub2RlLnBhcmVudE5vZGUgPT0gY29udGVzdGFudC5wYXJlbnROb2RlICYmIG5vZGUucGFyZW50Tm9kZVxuICAgICAgfVxuICAgICwgJ34nOiBmdW5jdGlvbiAobm9kZSkge1xuICAgICAgICByZXR1cm4gbm9kZSAmJiBub2RlLnByZXZpb3VzU2libGluZ1xuICAgICAgfVxuICAgICwgJysnOiBmdW5jdGlvbiAobm9kZSwgY29udGVzdGFudCwgcDEsIHAyKSB7XG4gICAgICAgIGlmICghbm9kZSkgcmV0dXJuIGZhbHNlXG4gICAgICAgIHJldHVybiAocDEgPSBwcmV2aW91cyhub2RlKSkgJiYgKHAyID0gcHJldmlvdXMoY29udGVzdGFudCkpICYmIHAxID09IHAyICYmIHAxXG4gICAgICB9XG4gICAgfVxuXG4gIGZ1bmN0aW9uIGNhY2hlKCkge1xuICAgIHRoaXMuYyA9IHt9XG4gIH1cbiAgY2FjaGUucHJvdG90eXBlID0ge1xuICAgIGc6IGZ1bmN0aW9uIChrKSB7XG4gICAgICByZXR1cm4gdGhpcy5jW2tdIHx8IHVuZGVmaW5lZFxuICAgIH1cbiAgLCBzOiBmdW5jdGlvbiAoaywgdiwgcikge1xuICAgICAgdiA9IHIgPyBuZXcgUmVnRXhwKHYpIDogdlxuICAgICAgcmV0dXJuICh0aGlzLmNba10gPSB2KVxuICAgIH1cbiAgfVxuXG4gIHZhciBjbGFzc0NhY2hlID0gbmV3IGNhY2hlKClcbiAgICAsIGNsZWFuQ2FjaGUgPSBuZXcgY2FjaGUoKVxuICAgICwgYXR0ckNhY2hlID0gbmV3IGNhY2hlKClcbiAgICAsIHRva2VuQ2FjaGUgPSBuZXcgY2FjaGUoKVxuXG4gIGZ1bmN0aW9uIGNsYXNzUmVnZXgoYykge1xuICAgIHJldHVybiBjbGFzc0NhY2hlLmcoYykgfHwgY2xhc3NDYWNoZS5zKGMsICcoXnxcXFxccyspJyArIGMgKyAnKFxcXFxzK3wkKScsIDEpXG4gIH1cblxuICAvLyBub3QgcXVpdGUgYXMgZmFzdCBhcyBpbmxpbmUgbG9vcHMgaW4gb2xkZXIgYnJvd3NlcnMgc28gZG9uJ3QgdXNlIGxpYmVyYWxseVxuICBmdW5jdGlvbiBlYWNoKGEsIGZuKSB7XG4gICAgdmFyIGkgPSAwLCBsID0gYS5sZW5ndGhcbiAgICBmb3IgKDsgaSA8IGw7IGkrKykgZm4oYVtpXSlcbiAgfVxuXG4gIGZ1bmN0aW9uIGZsYXR0ZW4oYXIpIHtcbiAgICBmb3IgKHZhciByID0gW10sIGkgPSAwLCBsID0gYXIubGVuZ3RoOyBpIDwgbDsgKytpKSBhcnJheUxpa2UoYXJbaV0pID8gKHIgPSByLmNvbmNhdChhcltpXSkpIDogKHJbci5sZW5ndGhdID0gYXJbaV0pXG4gICAgcmV0dXJuIHJcbiAgfVxuXG4gIGZ1bmN0aW9uIGFycmF5aWZ5KGFyKSB7XG4gICAgdmFyIGkgPSAwLCBsID0gYXIubGVuZ3RoLCByID0gW11cbiAgICBmb3IgKDsgaSA8IGw7IGkrKykgcltpXSA9IGFyW2ldXG4gICAgcmV0dXJuIHJcbiAgfVxuXG4gIGZ1bmN0aW9uIHByZXZpb3VzKG4pIHtcbiAgICB3aGlsZSAobiA9IG4ucHJldmlvdXNTaWJsaW5nKSBpZiAobltub2RlVHlwZV0gPT0gMSkgYnJlYWs7XG4gICAgcmV0dXJuIG5cbiAgfVxuXG4gIGZ1bmN0aW9uIHEocXVlcnkpIHtcbiAgICByZXR1cm4gcXVlcnkubWF0Y2goY2h1bmtlcilcbiAgfVxuXG4gIC8vIGNhbGxlZCB1c2luZyBgdGhpc2AgYXMgZWxlbWVudCBhbmQgYXJndW1lbnRzIGZyb20gcmVnZXggZ3JvdXAgcmVzdWx0cy5cbiAgLy8gZ2l2ZW4gPT4gZGl2LmhlbGxvW3RpdGxlPVwid29ybGRcIl06Zm9vKCdiYXInKVxuICAvLyBkaXYuaGVsbG9bdGl0bGU9XCJ3b3JsZFwiXTpmb28oJ2JhcicpLCBkaXYsIC5oZWxsbywgW3RpdGxlPVwid29ybGRcIl0sIHRpdGxlLCA9LCB3b3JsZCwgOmZvbygnYmFyJyksIGZvbywgKCdiYXInKSwgYmFyXVxuICBmdW5jdGlvbiBpbnRlcnByZXQod2hvbGUsIHRhZywgaWRzQW5kQ2xhc3Nlcywgd2hvbGVBdHRyaWJ1dGUsIGF0dHJpYnV0ZSwgcXVhbGlmaWVyLCB2YWx1ZSwgd2hvbGVQc2V1ZG8sIHBzZXVkbywgd2hvbGVQc2V1ZG9WYWwsIHBzZXVkb1ZhbCkge1xuICAgIHZhciBpLCBtLCBrLCBvLCBjbGFzc2VzXG4gICAgaWYgKHRoaXNbbm9kZVR5cGVdICE9PSAxKSByZXR1cm4gZmFsc2VcbiAgICBpZiAodGFnICYmIHRhZyAhPT0gJyonICYmIHRoaXNbdGFnTmFtZV0gJiYgdGhpc1t0YWdOYW1lXS50b0xvd2VyQ2FzZSgpICE9PSB0YWcpIHJldHVybiBmYWxzZVxuICAgIGlmIChpZHNBbmRDbGFzc2VzICYmIChtID0gaWRzQW5kQ2xhc3Nlcy5tYXRjaChpZCkpICYmIG1bMV0gIT09IHRoaXMuaWQpIHJldHVybiBmYWxzZVxuICAgIGlmIChpZHNBbmRDbGFzc2VzICYmIChjbGFzc2VzID0gaWRzQW5kQ2xhc3Nlcy5tYXRjaChjbGFzKSkpIHtcbiAgICAgIGZvciAoaSA9IGNsYXNzZXMubGVuZ3RoOyBpLS07KSBpZiAoIWNsYXNzUmVnZXgoY2xhc3Nlc1tpXS5zbGljZSgxKSkudGVzdCh0aGlzLmNsYXNzTmFtZSkpIHJldHVybiBmYWxzZVxuICAgIH1cbiAgICBpZiAocHNldWRvICYmIHF3ZXJ5LnBzZXVkb3NbcHNldWRvXSAmJiAhcXdlcnkucHNldWRvc1twc2V1ZG9dKHRoaXMsIHBzZXVkb1ZhbCkpIHJldHVybiBmYWxzZVxuICAgIGlmICh3aG9sZUF0dHJpYnV0ZSAmJiAhdmFsdWUpIHsgLy8gc2VsZWN0IGlzIGp1c3QgZm9yIGV4aXN0YW5jZSBvZiBhdHRyaWJcbiAgICAgIG8gPSB0aGlzLmF0dHJpYnV0ZXNcbiAgICAgIGZvciAoayBpbiBvKSB7XG4gICAgICAgIGlmIChPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwobywgaykgJiYgKG9ba10ubmFtZSB8fCBrKSA9PSBhdHRyaWJ1dGUpIHtcbiAgICAgICAgICByZXR1cm4gdGhpc1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICAgIGlmICh3aG9sZUF0dHJpYnV0ZSAmJiAhY2hlY2tBdHRyKHF1YWxpZmllciwgZ2V0QXR0cih0aGlzLCBhdHRyaWJ1dGUpIHx8ICcnLCB2YWx1ZSkpIHtcbiAgICAgIC8vIHNlbGVjdCBpcyBmb3IgYXR0cmliIGVxdWFsaXR5XG4gICAgICByZXR1cm4gZmFsc2VcbiAgICB9XG4gICAgcmV0dXJuIHRoaXNcbiAgfVxuXG4gIGZ1bmN0aW9uIGNsZWFuKHMpIHtcbiAgICByZXR1cm4gY2xlYW5DYWNoZS5nKHMpIHx8IGNsZWFuQ2FjaGUucyhzLCBzLnJlcGxhY2Uoc3BlY2lhbENoYXJzLCAnXFxcXCQxJykpXG4gIH1cblxuICBmdW5jdGlvbiBjaGVja0F0dHIocXVhbGlmeSwgYWN0dWFsLCB2YWwpIHtcbiAgICBzd2l0Y2ggKHF1YWxpZnkpIHtcbiAgICBjYXNlICc9JzpcbiAgICAgIHJldHVybiBhY3R1YWwgPT0gdmFsXG4gICAgY2FzZSAnXj0nOlxuICAgICAgcmV0dXJuIGFjdHVhbC5tYXRjaChhdHRyQ2FjaGUuZygnXj0nICsgdmFsKSB8fCBhdHRyQ2FjaGUucygnXj0nICsgdmFsLCAnXicgKyBjbGVhbih2YWwpLCAxKSlcbiAgICBjYXNlICckPSc6XG4gICAgICByZXR1cm4gYWN0dWFsLm1hdGNoKGF0dHJDYWNoZS5nKCckPScgKyB2YWwpIHx8IGF0dHJDYWNoZS5zKCckPScgKyB2YWwsIGNsZWFuKHZhbCkgKyAnJCcsIDEpKVxuICAgIGNhc2UgJyo9JzpcbiAgICAgIHJldHVybiBhY3R1YWwubWF0Y2goYXR0ckNhY2hlLmcodmFsKSB8fCBhdHRyQ2FjaGUucyh2YWwsIGNsZWFuKHZhbCksIDEpKVxuICAgIGNhc2UgJ349JzpcbiAgICAgIHJldHVybiBhY3R1YWwubWF0Y2goYXR0ckNhY2hlLmcoJ349JyArIHZhbCkgfHwgYXR0ckNhY2hlLnMoJ349JyArIHZhbCwgJyg/Ol58XFxcXHMrKScgKyBjbGVhbih2YWwpICsgJyg/OlxcXFxzK3wkKScsIDEpKVxuICAgIGNhc2UgJ3w9JzpcbiAgICAgIHJldHVybiBhY3R1YWwubWF0Y2goYXR0ckNhY2hlLmcoJ3w9JyArIHZhbCkgfHwgYXR0ckNhY2hlLnMoJ3w9JyArIHZhbCwgJ14nICsgY2xlYW4odmFsKSArICcoLXwkKScsIDEpKVxuICAgIH1cbiAgICByZXR1cm4gMFxuICB9XG5cbiAgLy8gZ2l2ZW4gYSBzZWxlY3RvciwgZmlyc3QgY2hlY2sgZm9yIHNpbXBsZSBjYXNlcyB0aGVuIGNvbGxlY3QgYWxsIGJhc2UgY2FuZGlkYXRlIG1hdGNoZXMgYW5kIGZpbHRlclxuICBmdW5jdGlvbiBfcXdlcnkoc2VsZWN0b3IsIF9yb290KSB7XG4gICAgdmFyIHIgPSBbXSwgcmV0ID0gW10sIGksIGwsIG0sIHRva2VuLCB0YWcsIGVscywgaW50ciwgaXRlbSwgcm9vdCA9IF9yb290XG4gICAgICAsIHRva2VucyA9IHRva2VuQ2FjaGUuZyhzZWxlY3RvcikgfHwgdG9rZW5DYWNoZS5zKHNlbGVjdG9yLCBzZWxlY3Rvci5zcGxpdCh0b2tlbml6cikpXG4gICAgICAsIGRpdmlkZWRUb2tlbnMgPSBzZWxlY3Rvci5tYXRjaChkaXZpZGVycylcblxuICAgIGlmICghdG9rZW5zLmxlbmd0aCkgcmV0dXJuIHJcblxuICAgIHRva2VuID0gKHRva2VucyA9IHRva2Vucy5zbGljZSgwKSkucG9wKCkgLy8gY29weSBjYWNoZWQgdG9rZW5zLCB0YWtlIHRoZSBsYXN0IG9uZVxuICAgIGlmICh0b2tlbnMubGVuZ3RoICYmIChtID0gdG9rZW5zW3Rva2Vucy5sZW5ndGggLSAxXS5tYXRjaChpZE9ubHkpKSkgcm9vdCA9IGJ5SWQoX3Jvb3QsIG1bMV0pXG4gICAgaWYgKCFyb290KSByZXR1cm4gclxuXG4gICAgaW50ciA9IHEodG9rZW4pXG4gICAgLy8gY29sbGVjdCBiYXNlIGNhbmRpZGF0ZXMgdG8gZmlsdGVyXG4gICAgZWxzID0gcm9vdCAhPT0gX3Jvb3QgJiYgcm9vdFtub2RlVHlwZV0gIT09IDkgJiYgZGl2aWRlZFRva2VucyAmJiAvXlsrfl0kLy50ZXN0KGRpdmlkZWRUb2tlbnNbZGl2aWRlZFRva2Vucy5sZW5ndGggLSAxXSkgP1xuICAgICAgZnVuY3Rpb24gKHIpIHtcbiAgICAgICAgd2hpbGUgKHJvb3QgPSByb290Lm5leHRTaWJsaW5nKSB7XG4gICAgICAgICAgcm9vdFtub2RlVHlwZV0gPT0gMSAmJiAoaW50clsxXSA/IGludHJbMV0gPT0gcm9vdFt0YWdOYW1lXS50b0xvd2VyQ2FzZSgpIDogMSkgJiYgKHJbci5sZW5ndGhdID0gcm9vdClcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gclxuICAgICAgfShbXSkgOlxuICAgICAgcm9vdFtieVRhZ10oaW50clsxXSB8fCAnKicpXG4gICAgLy8gZmlsdGVyIGVsZW1lbnRzIGFjY29yZGluZyB0byB0aGUgcmlnaHQtbW9zdCBwYXJ0IG9mIHRoZSBzZWxlY3RvclxuICAgIGZvciAoaSA9IDAsIGwgPSBlbHMubGVuZ3RoOyBpIDwgbDsgaSsrKSB7XG4gICAgICBpZiAoaXRlbSA9IGludGVycHJldC5hcHBseShlbHNbaV0sIGludHIpKSByW3IubGVuZ3RoXSA9IGl0ZW1cbiAgICB9XG4gICAgaWYgKCF0b2tlbnMubGVuZ3RoKSByZXR1cm4gclxuXG4gICAgLy8gZmlsdGVyIGZ1cnRoZXIgYWNjb3JkaW5nIHRvIHRoZSByZXN0IG9mIHRoZSBzZWxlY3RvciAodGhlIGxlZnQgc2lkZSlcbiAgICBlYWNoKHIsIGZ1bmN0aW9uIChlKSB7IGlmIChhbmNlc3Rvck1hdGNoKGUsIHRva2VucywgZGl2aWRlZFRva2VucykpIHJldFtyZXQubGVuZ3RoXSA9IGUgfSlcbiAgICByZXR1cm4gcmV0XG4gIH1cblxuICAvLyBjb21wYXJlIGVsZW1lbnQgdG8gYSBzZWxlY3RvclxuICBmdW5jdGlvbiBpcyhlbCwgc2VsZWN0b3IsIHJvb3QpIHtcbiAgICBpZiAoaXNOb2RlKHNlbGVjdG9yKSkgcmV0dXJuIGVsID09IHNlbGVjdG9yXG4gICAgaWYgKGFycmF5TGlrZShzZWxlY3RvcikpIHJldHVybiAhIX5mbGF0dGVuKHNlbGVjdG9yKS5pbmRleE9mKGVsKSAvLyBpZiBzZWxlY3RvciBpcyBhbiBhcnJheSwgaXMgZWwgYSBtZW1iZXI/XG5cbiAgICB2YXIgc2VsZWN0b3JzID0gc2VsZWN0b3Iuc3BsaXQoJywnKSwgdG9rZW5zLCBkaXZpZGVkVG9rZW5zXG4gICAgd2hpbGUgKHNlbGVjdG9yID0gc2VsZWN0b3JzLnBvcCgpKSB7XG4gICAgICB0b2tlbnMgPSB0b2tlbkNhY2hlLmcoc2VsZWN0b3IpIHx8IHRva2VuQ2FjaGUucyhzZWxlY3Rvciwgc2VsZWN0b3Iuc3BsaXQodG9rZW5penIpKVxuICAgICAgZGl2aWRlZFRva2VucyA9IHNlbGVjdG9yLm1hdGNoKGRpdmlkZXJzKVxuICAgICAgdG9rZW5zID0gdG9rZW5zLnNsaWNlKDApIC8vIGNvcHkgYXJyYXlcbiAgICAgIGlmIChpbnRlcnByZXQuYXBwbHkoZWwsIHEodG9rZW5zLnBvcCgpKSkgJiYgKCF0b2tlbnMubGVuZ3RoIHx8IGFuY2VzdG9yTWF0Y2goZWwsIHRva2VucywgZGl2aWRlZFRva2Vucywgcm9vdCkpKSB7XG4gICAgICAgIHJldHVybiB0cnVlXG4gICAgICB9XG4gICAgfVxuICAgIHJldHVybiBmYWxzZVxuICB9XG5cbiAgLy8gZ2l2ZW4gZWxlbWVudHMgbWF0Y2hpbmcgdGhlIHJpZ2h0LW1vc3QgcGFydCBvZiBhIHNlbGVjdG9yLCBmaWx0ZXIgb3V0IGFueSB0aGF0IGRvbid0IG1hdGNoIHRoZSByZXN0XG4gIGZ1bmN0aW9uIGFuY2VzdG9yTWF0Y2goZWwsIHRva2VucywgZGl2aWRlZFRva2Vucywgcm9vdCkge1xuICAgIHZhciBjYW5kXG4gICAgLy8gcmVjdXJzaXZlbHkgd29yayBiYWNrd2FyZHMgdGhyb3VnaCB0aGUgdG9rZW5zIGFuZCB1cCB0aGUgZG9tLCBjb3ZlcmluZyBhbGwgb3B0aW9uc1xuICAgIGZ1bmN0aW9uIGNyYXdsKGUsIGksIHApIHtcbiAgICAgIHdoaWxlIChwID0gd2Fsa2VyW2RpdmlkZWRUb2tlbnNbaV1dKHAsIGUpKSB7XG4gICAgICAgIGlmIChpc05vZGUocCkgJiYgKGludGVycHJldC5hcHBseShwLCBxKHRva2Vuc1tpXSkpKSkge1xuICAgICAgICAgIGlmIChpKSB7XG4gICAgICAgICAgICBpZiAoY2FuZCA9IGNyYXdsKHAsIGkgLSAxLCBwKSkgcmV0dXJuIGNhbmRcbiAgICAgICAgICB9IGVsc2UgcmV0dXJuIHBcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gKGNhbmQgPSBjcmF3bChlbCwgdG9rZW5zLmxlbmd0aCAtIDEsIGVsKSkgJiYgKCFyb290IHx8IGlzQW5jZXN0b3IoY2FuZCwgcm9vdCkpXG4gIH1cblxuICBmdW5jdGlvbiBpc05vZGUoZWwsIHQpIHtcbiAgICByZXR1cm4gZWwgJiYgdHlwZW9mIGVsID09PSAnb2JqZWN0JyAmJiAodCA9IGVsW25vZGVUeXBlXSkgJiYgKHQgPT0gMSB8fCB0ID09IDkpXG4gIH1cblxuICBmdW5jdGlvbiB1bmlxKGFyKSB7XG4gICAgdmFyIGEgPSBbXSwgaSwgajtcbiAgICBvOlxuICAgIGZvciAoaSA9IDA7IGkgPCBhci5sZW5ndGg7ICsraSkge1xuICAgICAgZm9yIChqID0gMDsgaiA8IGEubGVuZ3RoOyArK2opIGlmIChhW2pdID09IGFyW2ldKSBjb250aW51ZSBvXG4gICAgICBhW2EubGVuZ3RoXSA9IGFyW2ldXG4gICAgfVxuICAgIHJldHVybiBhXG4gIH1cblxuICBmdW5jdGlvbiBhcnJheUxpa2Uobykge1xuICAgIHJldHVybiAodHlwZW9mIG8gPT09ICdvYmplY3QnICYmIGlzRmluaXRlKG8ubGVuZ3RoKSlcbiAgfVxuXG4gIGZ1bmN0aW9uIG5vcm1hbGl6ZVJvb3Qocm9vdCkge1xuICAgIGlmICghcm9vdCkgcmV0dXJuIGRvY1xuICAgIGlmICh0eXBlb2Ygcm9vdCA9PSAnc3RyaW5nJykgcmV0dXJuIHF3ZXJ5KHJvb3QpWzBdXG4gICAgaWYgKCFyb290W25vZGVUeXBlXSAmJiBhcnJheUxpa2Uocm9vdCkpIHJldHVybiByb290WzBdXG4gICAgcmV0dXJuIHJvb3RcbiAgfVxuXG4gIGZ1bmN0aW9uIGJ5SWQocm9vdCwgaWQsIGVsKSB7XG4gICAgLy8gaWYgZG9jLCBxdWVyeSBvbiBpdCwgZWxzZSBxdWVyeSB0aGUgcGFyZW50IGRvYyBvciBpZiBhIGRldGFjaGVkIGZyYWdtZW50IHJld3JpdGUgdGhlIHF1ZXJ5IGFuZCBydW4gb24gdGhlIGZyYWdtZW50XG4gICAgcmV0dXJuIHJvb3Rbbm9kZVR5cGVdID09PSA5ID8gcm9vdC5nZXRFbGVtZW50QnlJZChpZCkgOlxuICAgICAgcm9vdC5vd25lckRvY3VtZW50ICYmXG4gICAgICAgICgoKGVsID0gcm9vdC5vd25lckRvY3VtZW50LmdldEVsZW1lbnRCeUlkKGlkKSkgJiYgaXNBbmNlc3RvcihlbCwgcm9vdCkgJiYgZWwpIHx8XG4gICAgICAgICAgKCFpc0FuY2VzdG9yKHJvb3QsIHJvb3Qub3duZXJEb2N1bWVudCkgJiYgc2VsZWN0KCdbaWQ9XCInICsgaWQgKyAnXCJdJywgcm9vdClbMF0pKVxuICB9XG5cbiAgZnVuY3Rpb24gcXdlcnkoc2VsZWN0b3IsIF9yb290KSB7XG4gICAgdmFyIG0sIGVsLCByb290ID0gbm9ybWFsaXplUm9vdChfcm9vdClcblxuICAgIC8vIGVhc3ksIGZhc3QgY2FzZXMgdGhhdCB3ZSBjYW4gZGlzcGF0Y2ggd2l0aCBzaW1wbGUgRE9NIGNhbGxzXG4gICAgaWYgKCFyb290IHx8ICFzZWxlY3RvcikgcmV0dXJuIFtdXG4gICAgaWYgKHNlbGVjdG9yID09PSB3aW5kb3cgfHwgaXNOb2RlKHNlbGVjdG9yKSkge1xuICAgICAgcmV0dXJuICFfcm9vdCB8fCAoc2VsZWN0b3IgIT09IHdpbmRvdyAmJiBpc05vZGUocm9vdCkgJiYgaXNBbmNlc3RvcihzZWxlY3Rvciwgcm9vdCkpID8gW3NlbGVjdG9yXSA6IFtdXG4gICAgfVxuICAgIGlmIChzZWxlY3RvciAmJiBhcnJheUxpa2Uoc2VsZWN0b3IpKSByZXR1cm4gZmxhdHRlbihzZWxlY3RvcilcbiAgICBpZiAobSA9IHNlbGVjdG9yLm1hdGNoKGVhc3kpKSB7XG4gICAgICBpZiAobVsxXSkgcmV0dXJuIChlbCA9IGJ5SWQocm9vdCwgbVsxXSkpID8gW2VsXSA6IFtdXG4gICAgICBpZiAobVsyXSkgcmV0dXJuIGFycmF5aWZ5KHJvb3RbYnlUYWddKG1bMl0pKVxuICAgICAgaWYgKGhhc0J5Q2xhc3MgJiYgbVszXSkgcmV0dXJuIGFycmF5aWZ5KHJvb3RbYnlDbGFzc10obVszXSkpXG4gICAgfVxuXG4gICAgcmV0dXJuIHNlbGVjdChzZWxlY3Rvciwgcm9vdClcbiAgfVxuXG4gIC8vIHdoZXJlIHRoZSByb290IGlzIG5vdCBkb2N1bWVudCBhbmQgYSByZWxhdGlvbnNoaXAgc2VsZWN0b3IgaXMgZmlyc3Qgd2UgaGF2ZSB0b1xuICAvLyBkbyBzb21lIGF3a3dhcmQgYWRqdXN0bWVudHMgdG8gZ2V0IGl0IHRvIHdvcmssIGV2ZW4gd2l0aCBxU0FcbiAgZnVuY3Rpb24gY29sbGVjdFNlbGVjdG9yKHJvb3QsIGNvbGxlY3Rvcikge1xuICAgIHJldHVybiBmdW5jdGlvbiAocykge1xuICAgICAgdmFyIG9pZCwgbmlkXG4gICAgICBpZiAoc3BsaXR0YWJsZS50ZXN0KHMpKSB7XG4gICAgICAgIGlmIChyb290W25vZGVUeXBlXSAhPT0gOSkge1xuICAgICAgICAgIC8vIG1ha2Ugc3VyZSB0aGUgZWwgaGFzIGFuIGlkLCByZXdyaXRlIHRoZSBxdWVyeSwgc2V0IHJvb3QgdG8gZG9jIGFuZCBydW4gaXRcbiAgICAgICAgICBpZiAoIShuaWQgPSBvaWQgPSByb290LmdldEF0dHJpYnV0ZSgnaWQnKSkpIHJvb3Quc2V0QXR0cmlidXRlKCdpZCcsIG5pZCA9ICdfX3F3ZXJ5bWV1cHNjb3R0eScpXG4gICAgICAgICAgcyA9ICdbaWQ9XCInICsgbmlkICsgJ1wiXScgKyBzIC8vIGF2b2lkIGJ5SWQgYW5kIGFsbG93IHVzIHRvIG1hdGNoIGNvbnRleHQgZWxlbWVudFxuICAgICAgICAgIGNvbGxlY3Rvcihyb290LnBhcmVudE5vZGUgfHwgcm9vdCwgcywgdHJ1ZSlcbiAgICAgICAgICBvaWQgfHwgcm9vdC5yZW1vdmVBdHRyaWJ1dGUoJ2lkJylcbiAgICAgICAgfVxuICAgICAgICByZXR1cm47XG4gICAgICB9XG4gICAgICBzLmxlbmd0aCAmJiBjb2xsZWN0b3Iocm9vdCwgcywgZmFsc2UpXG4gICAgfVxuICB9XG5cbiAgdmFyIGlzQW5jZXN0b3IgPSAnY29tcGFyZURvY3VtZW50UG9zaXRpb24nIGluIGh0bWwgP1xuICAgIGZ1bmN0aW9uIChlbGVtZW50LCBjb250YWluZXIpIHtcbiAgICAgIHJldHVybiAoY29udGFpbmVyLmNvbXBhcmVEb2N1bWVudFBvc2l0aW9uKGVsZW1lbnQpICYgMTYpID09IDE2XG4gICAgfSA6ICdjb250YWlucycgaW4gaHRtbCA/XG4gICAgZnVuY3Rpb24gKGVsZW1lbnQsIGNvbnRhaW5lcikge1xuICAgICAgY29udGFpbmVyID0gY29udGFpbmVyW25vZGVUeXBlXSA9PT0gOSB8fCBjb250YWluZXIgPT0gd2luZG93ID8gaHRtbCA6IGNvbnRhaW5lclxuICAgICAgcmV0dXJuIGNvbnRhaW5lciAhPT0gZWxlbWVudCAmJiBjb250YWluZXIuY29udGFpbnMoZWxlbWVudClcbiAgICB9IDpcbiAgICBmdW5jdGlvbiAoZWxlbWVudCwgY29udGFpbmVyKSB7XG4gICAgICB3aGlsZSAoZWxlbWVudCA9IGVsZW1lbnQucGFyZW50Tm9kZSkgaWYgKGVsZW1lbnQgPT09IGNvbnRhaW5lcikgcmV0dXJuIDFcbiAgICAgIHJldHVybiAwXG4gICAgfVxuICAsIGdldEF0dHIgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAvLyBkZXRlY3QgYnVnZ3kgSUUgc3JjL2hyZWYgZ2V0QXR0cmlidXRlKCkgY2FsbFxuICAgICAgdmFyIGUgPSBkb2MuY3JlYXRlRWxlbWVudCgncCcpXG4gICAgICByZXR1cm4gKChlLmlubmVySFRNTCA9ICc8YSBocmVmPVwiI3hcIj54PC9hPicpICYmIGUuZmlyc3RDaGlsZC5nZXRBdHRyaWJ1dGUoJ2hyZWYnKSAhPSAnI3gnKSA/XG4gICAgICAgIGZ1bmN0aW9uIChlLCBhKSB7XG4gICAgICAgICAgcmV0dXJuIGEgPT09ICdjbGFzcycgPyBlLmNsYXNzTmFtZSA6IChhID09PSAnaHJlZicgfHwgYSA9PT0gJ3NyYycpID9cbiAgICAgICAgICAgIGUuZ2V0QXR0cmlidXRlKGEsIDIpIDogZS5nZXRBdHRyaWJ1dGUoYSlcbiAgICAgICAgfSA6XG4gICAgICAgIGZ1bmN0aW9uIChlLCBhKSB7IHJldHVybiBlLmdldEF0dHJpYnV0ZShhKSB9XG4gICAgfSgpXG4gICwgaGFzQnlDbGFzcyA9ICEhZG9jW2J5Q2xhc3NdXG4gICAgLy8gaGFzIG5hdGl2ZSBxU0Egc3VwcG9ydFxuICAsIGhhc1FTQSA9IGRvYy5xdWVyeVNlbGVjdG9yICYmIGRvY1txU0FdXG4gICAgLy8gdXNlIG5hdGl2ZSBxU0FcbiAgLCBzZWxlY3RRU0EgPSBmdW5jdGlvbiAoc2VsZWN0b3IsIHJvb3QpIHtcbiAgICAgIHZhciByZXN1bHQgPSBbXSwgc3MsIGVcbiAgICAgIHRyeSB7XG4gICAgICAgIGlmIChyb290W25vZGVUeXBlXSA9PT0gOSB8fCAhc3BsaXR0YWJsZS50ZXN0KHNlbGVjdG9yKSkge1xuICAgICAgICAgIC8vIG1vc3Qgd29yayBpcyBkb25lIHJpZ2h0IGhlcmUsIGRlZmVyIHRvIHFTQVxuICAgICAgICAgIHJldHVybiBhcnJheWlmeShyb290W3FTQV0oc2VsZWN0b3IpKVxuICAgICAgICB9XG4gICAgICAgIC8vIHNwZWNpYWwgY2FzZSB3aGVyZSB3ZSBuZWVkIHRoZSBzZXJ2aWNlcyBvZiBgY29sbGVjdFNlbGVjdG9yKClgXG4gICAgICAgIGVhY2goc3MgPSBzZWxlY3Rvci5zcGxpdCgnLCcpLCBjb2xsZWN0U2VsZWN0b3Iocm9vdCwgZnVuY3Rpb24gKGN0eCwgcykge1xuICAgICAgICAgIGUgPSBjdHhbcVNBXShzKVxuICAgICAgICAgIGlmIChlLmxlbmd0aCA9PSAxKSByZXN1bHRbcmVzdWx0Lmxlbmd0aF0gPSBlLml0ZW0oMClcbiAgICAgICAgICBlbHNlIGlmIChlLmxlbmd0aCkgcmVzdWx0ID0gcmVzdWx0LmNvbmNhdChhcnJheWlmeShlKSlcbiAgICAgICAgfSkpXG4gICAgICAgIHJldHVybiBzcy5sZW5ndGggPiAxICYmIHJlc3VsdC5sZW5ndGggPiAxID8gdW5pcShyZXN1bHQpIDogcmVzdWx0XG4gICAgICB9IGNhdGNoIChleCkgeyB9XG4gICAgICByZXR1cm4gc2VsZWN0Tm9uTmF0aXZlKHNlbGVjdG9yLCByb290KVxuICAgIH1cbiAgICAvLyBubyBuYXRpdmUgc2VsZWN0b3Igc3VwcG9ydFxuICAsIHNlbGVjdE5vbk5hdGl2ZSA9IGZ1bmN0aW9uIChzZWxlY3Rvciwgcm9vdCkge1xuICAgICAgdmFyIHJlc3VsdCA9IFtdLCBpdGVtcywgbSwgaSwgbCwgciwgc3NcbiAgICAgIHNlbGVjdG9yID0gc2VsZWN0b3IucmVwbGFjZShub3JtYWxpenIsICckMScpXG4gICAgICBpZiAobSA9IHNlbGVjdG9yLm1hdGNoKHRhZ0FuZE9yQ2xhc3MpKSB7XG4gICAgICAgIHIgPSBjbGFzc1JlZ2V4KG1bMl0pXG4gICAgICAgIGl0ZW1zID0gcm9vdFtieVRhZ10obVsxXSB8fCAnKicpXG4gICAgICAgIGZvciAoaSA9IDAsIGwgPSBpdGVtcy5sZW5ndGg7IGkgPCBsOyBpKyspIHtcbiAgICAgICAgICBpZiAoci50ZXN0KGl0ZW1zW2ldLmNsYXNzTmFtZSkpIHJlc3VsdFtyZXN1bHQubGVuZ3RoXSA9IGl0ZW1zW2ldXG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHJlc3VsdFxuICAgICAgfVxuICAgICAgLy8gbW9yZSBjb21wbGV4IHNlbGVjdG9yLCBnZXQgYF9xd2VyeSgpYCB0byBkbyB0aGUgd29yayBmb3IgdXNcbiAgICAgIGVhY2goc3MgPSBzZWxlY3Rvci5zcGxpdCgnLCcpLCBjb2xsZWN0U2VsZWN0b3Iocm9vdCwgZnVuY3Rpb24gKGN0eCwgcywgcmV3cml0ZSkge1xuICAgICAgICByID0gX3F3ZXJ5KHMsIGN0eClcbiAgICAgICAgZm9yIChpID0gMCwgbCA9IHIubGVuZ3RoOyBpIDwgbDsgaSsrKSB7XG4gICAgICAgICAgaWYgKGN0eFtub2RlVHlwZV0gPT09IDkgfHwgcmV3cml0ZSB8fCBpc0FuY2VzdG9yKHJbaV0sIHJvb3QpKSByZXN1bHRbcmVzdWx0Lmxlbmd0aF0gPSByW2ldXG4gICAgICAgIH1cbiAgICAgIH0pKVxuICAgICAgcmV0dXJuIHNzLmxlbmd0aCA+IDEgJiYgcmVzdWx0Lmxlbmd0aCA+IDEgPyB1bmlxKHJlc3VsdCkgOiByZXN1bHRcbiAgICB9XG4gICwgY29uZmlndXJlID0gZnVuY3Rpb24gKG9wdGlvbnMpIHtcbiAgICAgIC8vIGNvbmZpZ05hdGl2ZVFTQTogdXNlIGZ1bGx5LWludGVybmFsIHNlbGVjdG9yIG9yIG5hdGl2ZSBxU0Egd2hlcmUgcHJlc2VudFxuICAgICAgaWYgKHR5cGVvZiBvcHRpb25zW3VzZU5hdGl2ZVFTQV0gIT09ICd1bmRlZmluZWQnKVxuICAgICAgICBzZWxlY3QgPSAhb3B0aW9uc1t1c2VOYXRpdmVRU0FdID8gc2VsZWN0Tm9uTmF0aXZlIDogaGFzUVNBID8gc2VsZWN0UVNBIDogc2VsZWN0Tm9uTmF0aXZlXG4gICAgfVxuXG4gIGNvbmZpZ3VyZSh7IHVzZU5hdGl2ZVFTQTogdHJ1ZSB9KVxuXG4gIHF3ZXJ5LmNvbmZpZ3VyZSA9IGNvbmZpZ3VyZVxuICBxd2VyeS51bmlxID0gdW5pcVxuICBxd2VyeS5pcyA9IGlzXG4gIHF3ZXJ5LnBzZXVkb3MgPSB7fVxuXG4gIHJldHVybiBxd2VyeVxufSk7XG4iLCIndXNlIHN0cmljdCc7XG5cbnZhciBwYXJzZSA9IHJlcXVpcmUoJ3BhcnNlLWh0bWwnKVxuICAsIHNsaWNlID0gW10uc2xpY2U7XG5cbmZ1bmN0aW9uIGNvbnZlcnQoYXJnLCBjdHgpIHtcbiAgdmFyIHJlc3VsdCA9IFtdXG4gICAgLCBxdWVyeVxuICAgICwgbm9kZXM7XG5cbiAgc3dpdGNoICh0cnVlKSB7XG4gICAgY2FzZSAodHlwZW9mIGFyZyA9PT0gJ3N0cmluZycpOlxuICAgICAgcXVlcnkgPSBbXTtcbiAgICAgIG5vZGVzID0gW107XG5cbiAgICAgIHRyeSB7XG4gICAgICAgIHF1ZXJ5ID0gKGN0eCB8fCBkb2N1bWVudCkucXVlcnlTZWxlY3RvckFsbChhcmcpO1xuICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICBub2RlcyA9IHBhcnNlKGFyZyk7XG4gICAgICB9XG5cbiAgICAgIHF1ZXJ5Lmxlbmd0aCAmJiAocmVzdWx0ID0gc2xpY2UuY2FsbChxdWVyeSkpO1xuICAgICAgbm9kZXMubGVuZ3RoICYmIChyZXN1bHQgPSBub2Rlcyk7XG4gICAgICBxdWVyeSA9IG5vZGVzID0gbnVsbDtcbiAgICAgIGJyZWFrO1xuICAgIGNhc2UgKGFyZyBpbnN0YW5jZW9mIE5vZGVMaXN0KTpcbiAgICAgIHJlc3VsdCA9IHNsaWNlLmNhbGwoYXJnKTtcbiAgICAgIGJyZWFrO1xuICAgIGNhc2UgKGFyZyBpbnN0YW5jZW9mIEVsZW1lbnQgfHwgYXJnID09PSBkb2N1bWVudCB8fFxuICAgICAgICBhcmcgPT09IHdpbmRvdyk6XG4gICAgICByZXN1bHQucHVzaChhcmcpO1xuICAgICAgYnJlYWs7XG4gICAgY2FzZSAoQXJyYXkuaXNBcnJheShhcmcpKTpcbiAgICAgIHJlc3VsdCA9IGFyZztcbiAgICAgIGJyZWFrO1xuICAgIGRlZmF1bHQ6XG4gICAgICBicmVhaztcbiAgfVxuXG4gIHJldHVybiByZXN1bHQ7XG59XG5cbm1vZHVsZS5leHBvcnRzID0gY29udmVydDtcbiIsIid1c2Ugc3RyaWN0JztcblxuZnVuY3Rpb24gcGFyc2Uoc3RyKSB7XG4gIHZhciBkb2MgPSBkb2N1bWVudC5pbXBsZW1lbnRhdGlvbi5jcmVhdGVIVE1MRG9jdW1lbnQoJycpO1xuXG4gIGRvYy5ib2R5LmlubmVySFRNTCA9IHN0cjtcbiAgcmV0dXJuIFtdLnNsaWNlLmNhbGwoZG9jLmJvZHkuY2hpbGRyZW4pO1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IHBhcnNlO1xuIiwidmFyIGggPSByZXF1aXJlKCd2aXJ0dWFsLWh5cGVyc2NyaXB0LXN2ZycpXG5cbmV4cG9ydHMucmVuZGVyID0gcmVuZGVyRWRnZVxuZXhwb3J0cy5yZW5kZXJDdXJ2ZSA9IHJlbmRlckN1cnZlXG5cbmZ1bmN0aW9uIHJlbmRlckVkZ2UgKGRhdGEsIGVkZ2UpIHtcbiAgdmFyIHNvdXJjZU5vZGUgPSBkYXRhLmdldE5vZGUoZWRnZS5zb3VyY2UuaWQpXG4gIHZhciB0YXJnZXROb2RlID0gZGF0YS5nZXROb2RlKGVkZ2UudGFyZ2V0LmlkKVxuXG4gIHZhciBzb3VyY2VQb3J0ID0gZWRnZS5zb3VyY2UucG9ydFxuICB2YXIgdGFyZ2V0UG9ydCA9IGVkZ2UudGFyZ2V0LnBvcnRcblxuICB2YXIgc291cmNlUG9zID0gc291cmNlTm9kZS5vdXRwb3J0cy5pbmRleE9mKHNvdXJjZVBvcnQpXG4gIHZhciB0YXJnZXRQb3MgPSB0YXJnZXROb2RlLmlucG9ydHMuaW5kZXhPZih0YXJnZXRQb3J0KVxuXG4gIHZhciBzb3VyY2UgPSB7XG4gICAgeDogc291cmNlTm9kZS54ICsgMTAwLFxuICAgIHk6IHNvdXJjZU5vZGUueSArICgoc291cmNlUG9zICsgMSkgKiAxMDAgLyAoc291cmNlTm9kZS5vdXRwb3J0cy5sZW5ndGggKyAxKSlcbiAgfVxuICB2YXIgdGFyZ2V0ID0ge1xuICAgIHg6IHRhcmdldE5vZGUueCxcbiAgICB5OiB0YXJnZXROb2RlLnkgKyAoKHRhcmdldFBvcyArIDEpICogMTAwIC8gKHRhcmdldE5vZGUuaW5wb3J0cy5sZW5ndGggKyAxKSlcbiAgfVxuXG4gIHZhciBjbGFzc2VzID0gW1xuICAgICdlZGdlJyxcbiAgICAnZWRnZS1zb3VyY2Utbm9kZS0nICsgc291cmNlTm9kZS5pZCxcbiAgICAnZWRnZS1zb3VyY2UtJyArIHNvdXJjZU5vZGUuaWQgKyAnLScgKyBzb3VyY2VQb3J0LFxuICAgICdlZGdlLXRhcmdldC0nICsgdGFyZ2V0Tm9kZS5pZCArICctJyArIHRhcmdldFBvcnRcbiAgXVxuXG4gIHJldHVybiByZW5kZXJDdXJ2ZShcbiAgICBzb3VyY2UsXG4gICAgdGFyZ2V0LFxuICAgIGNsYXNzZXMuam9pbignICcpLFxuICAgIFtzb3VyY2VOb2RlLmlkLCB0YXJnZXROb2RlLmlkLCBzb3VyY2VQb3J0LCB0YXJnZXRQb3J0XS5qb2luKCctJylcbiAgKVxufVxuXG5mdW5jdGlvbiByZW5kZXJDdXJ2ZSAoZnJvbSwgdG8sIGNsYXNzTmFtZSwgaWQpIHtcbiAgcmV0dXJuIGgoJ3BhdGgnLCB7XG4gICAgY2xhc3M6IGNsYXNzTmFtZSwgaWQ6IGlkLCBkOiBjcmVhdGVFZGdlUGF0aChmcm9tLCB0bylcbiAgfSlcbn1cblxuLy8gb3JpZ2luYWxseSBmcm9tIGh0dHBzOi8vZ2l0aHViLmNvbS90aGUtZ3JpZC90aGUtZ3JhcGgvYmxvYi9tYXN0ZXIvdGhlLWdyYXBoL3RoZS1ncmFwaC1lZGdlLmpzXG5mdW5jdGlvbiBjcmVhdGVFZGdlUGF0aCAoZnJvbSwgdG8pIHtcbiAgdmFyIGMxID0ge31cbiAgdmFyIGMyID0ge31cbiAgdmFyIG5vZGVTaXplID0gMTAwXG4gIHZhciBjdXJ2ZSA9IG5vZGVTaXplIC8vIH5Ob2RlU2l6ZVxuXG4gIGlmICh0by54IC0gNSA8IGZyb20ueCkge1xuICAgIHZhciBjdXJ2ZUZhY3RvciA9IChmcm9tLnggLSB0by54KSAqIGN1cnZlIC8gMjAwXG4gICAgaWYgKE1hdGguYWJzKHRvLnkgLSBmcm9tLnkpIDwgbm9kZVNpemUgLyAyKSB7XG4gICAgICAvLyBMb29wYmFja1xuICAgICAgYzEueCA9IGZyb20ueCArIGN1cnZlRmFjdG9yXG4gICAgICBjMS55ID0gZnJvbS55IC0gY3VydmVGYWN0b3JcbiAgICAgIGMyLnggPSB0by54IC0gY3VydmVGYWN0b3JcbiAgICAgIGMyLnkgPSB0by55IC0gY3VydmVGYWN0b3JcbiAgICB9IGVsc2Uge1xuICAgICAgLy8gU3RpY2sgb3V0IHNvbWVcbiAgICAgIGMxLnggPSBmcm9tLnggKyBjdXJ2ZUZhY3RvclxuICAgICAgYzEueSA9IGZyb20ueSArICh0by55ID4gZnJvbS55ID8gY3VydmVGYWN0b3IgOiAtY3VydmVGYWN0b3IpXG4gICAgICBjMi54ID0gdG8ueCAtIGN1cnZlRmFjdG9yXG4gICAgICBjMi55ID0gdG8ueSArICh0by55ID4gZnJvbS55ID8gLWN1cnZlRmFjdG9yIDogY3VydmVGYWN0b3IpXG4gICAgfVxuICB9IGVsc2Uge1xuICAgIC8vIENvbnRyb2xzIGhhbGZ3YXkgYmV0d2VlblxuICAgIGMxLnggPSBmcm9tLnggKyAodG8ueCAtIGZyb20ueCkgLyAyXG4gICAgYzEueSA9IGZyb20ueVxuICAgIGMyLnggPSBjMS54XG4gICAgYzIueSA9IHRvLnlcbiAgfVxuXG4gIHJldHVybiBbXG4gICAgJ00nLFxuICAgIGZyb20ueCwgZnJvbS55LFxuICAgICdDJyxcbiAgICBjMS54LCBjMS55LFxuICAgIGMyLngsIGMyLnksXG4gICAgdG8ueCwgdG8ueVxuICBdLmpvaW4oJyAnKVxufVxuIiwidmFyIEV2ZW50RW1pdHRlciA9IHJlcXVpcmUoJ2V2ZW50cycpLkV2ZW50RW1pdHRlclxuXG5cbnZhciBpbmhlcml0cyA9IHJlcXVpcmUoJ2luaGVyaXRzJylcbnZhciBkZWxlZ2F0ZSA9IHJlcXVpcmUoJ2RlbGVnYXRlLWRvbScpXG52YXIgY2xhc3NMaXN0ID0gcmVxdWlyZSgnZG9tLWNsYXNzbGlzdCcpXG52YXIgZG9tQXJyYXkgPSByZXF1aXJlKCdkb20tYXJyYXknKVxuXG52YXIgaCA9IHJlcXVpcmUoJ3ZpcnR1YWwtaHlwZXJzY3JpcHQtc3ZnJylcbnZhciBkaWZmID0gcmVxdWlyZSgndmlydHVhbC1kb20vZGlmZicpXG52YXIgcGF0Y2ggPSByZXF1aXJlKCd2aXJ0dWFsLWRvbS9wYXRjaCcpXG52YXIgY3JlYXRlRWxlbWVudCA9IHJlcXVpcmUoJ3ZpcnR1YWwtZG9tL2NyZWF0ZS1lbGVtZW50JylcblxudmFyIGVkZ2UgPSByZXF1aXJlKCcuL2VkZ2UuanMnKVxudmFyIHJlbmRlckVkZ2UgPSBlZGdlLnJlbmRlclxudmFyIHJlbmRlckN1cnZlID0gZWRnZS5yZW5kZXJDdXJ2ZVxuXG52YXIgcmVuZGVyTm9kZSA9IHJlcXVpcmUoJy4vbm9kZS5qcycpXG5cbm1vZHVsZS5leHBvcnRzID0gRmxvd0dyYXBoVmlld1xuXG5GbG93R3JhcGhWaWV3LmNzcyA9IEJ1ZmZlcihcImFIUnRiQ3dnWW05a2VTd2djM1puSUhzS0lDQm9aV2xuYUhRNklERXdNQ1U3Q2lBZ2QybGtkR2c2SURFd01DVTdDaUFnYldGeVoybHVPaUF3T3dvZ0lIQmhaR1JwYm1jNklEQTdDbjBLYzNabklDNXViMlJsSUhzS0lDQm1hV3hzT2lCeVoySmhLREV5TlN3eE1qVXNNVEkxTERBdU5TazdDaUFnWTNWeWMyOXlPaUF0ZDJWaWEybDBMV2R5WVdJN0NuMEtjM1puSUM1dWIyUmxJQzVpYjJSNUlIc0tJQ0J6ZEhKdmEyVTZJR0pzWVdOck93b2dJSE4wY205clpTMTNhV1IwYURvZ00zQjRPd3A5Q2dwemRtY2dkR1Y0ZERvNmMyVnNaV04wYVc5dUlIc2dZbUZqYTJkeWIzVnVaRG9nYm05dVpUc2dmUW9LYzNabklDNXViMlJsSUhSbGVIUWdld29nSUdacGJHdzZJR0pzWVdOck93b2dJR1p2Ym5RdGMybDZaVG9nTWpWd2VEc0tJQ0JtYjI1MExXWmhiV2xzZVRvZ1NHVnNkbVYwYVdOaE93b2dJSFJsZUhRdFlXNWphRzl5T2lCdGFXUmtiR1U3Q2lBZ1pHOXRhVzVoYm5RdFltRnpaV3hwYm1VNklHMXBaR1JzWlRzS2ZRcHpkbWNnTG5CdmNuUWdld29nSUdOMWNuTnZjam9nY0c5cGJuUmxjanNLSUNCemRISnZhMlU2SUdKc1lXTnJPd29nSUhOMGNtOXJaUzEzYVdSMGFEb2dNM0I0T3dwOUNuTjJaeUF1Y0c5eWREcG9iM1psY2lCN0NpQWdjam9nTnpzS2ZRcHpkbWNnTG05MWRIQjFkSHNLSUNCbWFXeHNPaUFqUmtZMVJUVTJPd3A5Q25OMlp5QXVhVzV3ZFhRZ2V3b2dJR1pwYkd3NklDTTBPRVExTlRrN0NuMEtjM1puSUM1amIyNXVaV04wYjNJc0lITjJaeUF1WldSblpTQjdDaUFnWm1sc2JEb2dkSEpoYm5Od1lYSmxiblE3Q2lBZ2MzUnliMnRsT2lCaWJHRmphenNLSUNCemRISnZhMlV0ZDJsa2RHZzZJRE53ZURzS0lDQjBjbUZ1YzJsMGFXOXVPaUJ6ZEhKdmEyVXRkMmxrZEdnZ01DNHpjenNLZlFvS2MzWm5JQzVsWkdkbE9taHZkbVZ5SUhzS0lDQnpkSEp2YTJVNklISmxaRHNLSUNCemRISnZhMlV0ZDJsa2RHZzZJRFZ3ZURzS0lDQmpkWEp6YjNJNklHNXZkQzFoYkd4dmQyVmtPd3A5Q2dwemRtY2dMbVZrWjJWaFkzUnBkbVVnZXdvZ0lITjBjbTlyWlMxM2FXUjBhRG9nTjNCNE93cDlDZ3B6ZG1jZ0xtNXZaR1VnTG1Oc2IzTmxJSHNLSUNCbWFXeHNPaUFnSTBaR05VVTFOanNLSUNCamRYSnpiM0k2SUc1dmRDMWhiR3h2ZDJWa093b2dJSFJ5WVc1emFYUnBiMjQ2SUdobGFXZG9kQ0F3TGpKekxDQjNhV1IwYUNBd0xqSnpMQ0I0SURBdU1uTXNJSGtnTUM0eWN6c0tmUW9LYzNabklDNXViMlJsSUM1amJHOXpaVHBvYjNabGNpQjdDaUFnZURvZ01Ec0tJQ0I1T2lBd093b2dJSGRwWkhSb09pQXhNREJ3ZURzS0lDQm9aV2xuYUhRNklERXdNSEI0T3dvZ0lISjRPaUE0T3dvZ0lITjBjbTlyWlMxM2FXUjBhRG9nTTNCNE93b2dJSE4wY205clpUb2dJemRDTVRZeE1Uc0tmUT09XCIsXCJiYXNlNjRcIikudG9TdHJpbmcoKVxuXG5pbmhlcml0cyhGbG93R3JhcGhWaWV3LCBFdmVudEVtaXR0ZXIpXG5cbmZ1bmN0aW9uIEZsb3dHcmFwaFZpZXcgKGRhdGEsIGVsZW1lbnQpIHtcbiAgdGhpcy5kYXRhID0gZGF0YVxuICB0aGlzLnRyZWUgPSB0aGlzLnJlbmRlcigpXG4gIHRoaXMuc3ZnID0gY3JlYXRlRWxlbWVudCh0aGlzLnRyZWUpXG4gIHRoaXMucmVnaXN0ZXJIYW5kbGVycygpXG59XG5cbkZsb3dHcmFwaFZpZXcucHJvdG90eXBlLnJlbmRlciA9IGZ1bmN0aW9uICgpIHtcbiAgdmFyIGRvbU5vZGVzID0gdGhpcy5kYXRhLmdldEVkZ2VzKClcbiAgICAubWFwKHJlbmRlckVkZ2UuYmluZCh0aGlzLCB0aGlzLmRhdGEpKVxuXG4gIGlmICh0aGlzLmRhdGEuY29ubmVjdG9yLmFjdGl2ZSkge1xuICAgIHZhciBsaW5lID0gcmVuZGVyQ3VydmUoXG4gICAgICB0aGlzLmRhdGEuY29ubmVjdG9yLmZyb20sXG4gICAgICB0aGlzLmRhdGEuY29ubmVjdG9yLnRvLFxuICAgICAgJ2Nvbm5lY3RvcidcbiAgICApXG4gICAgZG9tTm9kZXMucHVzaChsaW5lKVxuICB9XG4gIGRvbU5vZGVzID0gZG9tTm9kZXMuY29uY2F0KHRoaXMuZGF0YS5nZXROb2RlcygpLm1hcChyZW5kZXJOb2RlKSlcbiAgdmFyIHN2ZyA9IGgoJ3N2ZycsIHt9LCBkb21Ob2RlcylcbiAgcmV0dXJuIHN2Z1xufVxuXG5GbG93R3JhcGhWaWV3LnByb3RvdHlwZS5hY3RpdmF0ZUVkZ2UgPSBmdW5jdGlvbiAoc291cmNlLCB0YXJnZXQsIG91dHBvcnQsIGlucG9ydCkge1xuICBvdXRwb3J0ID0gb3V0cG9ydCB8fCAnb3V0J1xuICBpbnBvcnQgPSBpbnBvcnQgfHwgJ2luJ1xuXG4gIHZhciBzZWxlY3RvciA9ICcuZWRnZS1zb3VyY2UtJyArIHNvdXJjZSArICctJyArIG91dHBvcnRcbiAgaWYgKHRhcmdldCkgc2VsZWN0b3IgKz0gJy5lZGdlLXRhcmdldC0nICsgdGFyZ2V0ICsgJy0nICsgaW5wb3J0XG5cbiAgdmFyIGVkZ2VzID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbChzZWxlY3RvcilcbiAgZG9tQXJyYXkoZWRnZXMpLmZvckVhY2goZnVuY3Rpb24gKGVkZ2UpIHtcbiAgICBjbGFzc0xpc3QoZWRnZSkuYWRkKCdlZGdlYWN0aXZlJylcbiAgfSlcbn1cblxuRmxvd0dyYXBoVmlldy5wcm90b3R5cGUuZGVhY3RpdmF0ZUVkZ2UgPSBmdW5jdGlvbiAoc291cmNlLCB0YXJnZXQsIG91dHBvcnQsIGlucG9ydCkge1xuICBvdXRwb3J0ID0gb3V0cG9ydCB8fCAnb3V0J1xuICBpbnBvcnQgPSBpbnBvcnQgfHwgJ2luJ1xuXG4gIHZhciBzZWxlY3RvciA9ICcuZWRnZS1zb3VyY2UtJyArIHNvdXJjZSArICctJyArIG91dHBvcnRcbiAgaWYgKHRhcmdldCkgc2VsZWN0b3IgKz0gJy5lZGdlLXRhcmdldC0nICsgdGFyZ2V0ICsgJy0nICsgaW5wb3J0XG5cbiAgdmFyIGVkZ2VzID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbChzZWxlY3RvcilcbiAgZG9tQXJyYXkoZWRnZXMpLmZvckVhY2goZnVuY3Rpb24gKGVkZ2UpIHtcbiAgICBjbGFzc0xpc3QoZWRnZSkucmVtb3ZlKCdlZGdlYWN0aXZlJylcbiAgfSlcbn1cblxuRmxvd0dyYXBoVmlldy5wcm90b3R5cGUuYmxpbmtFZGdlID0gZnVuY3Rpb24gKHNvdXJjZSwgdGFyZ2V0LCBvdXRwb3J0LCBpbnBvcnQsIG1zKSB7XG4gIG1zID0gbXMgfHwgMzAwXG4gIHRoaXMuYWN0aXZhdGVFZGdlKHNvdXJjZSwgdGFyZ2V0LCBvdXRwb3J0LCBpbnBvcnQpXG4gIHNldFRpbWVvdXQodGhpcy5kZWFjdGl2YXRlRWRnZS5iaW5kKHRoaXMsIHNvdXJjZSwgdGFyZ2V0LCBvdXRwb3J0LCBpbnBvcnQpLCBtcylcbn1cblxuRmxvd0dyYXBoVmlldy5wcm90b3R5cGUucmVnaXN0ZXJIYW5kbGVycyA9IGZ1bmN0aW9uICgpIHtcbiAgdmFyIHNlbGYgPSB0aGlzXG4gIHZhciBkYXRhID0gdGhpcy5kYXRhXG5cbiAgc2V0SW50ZXJ2YWwoZnVuY3Rpb24gKCkge1xuICAgIHZhciBuZXdUcmVlID0gdGhpcy5yZW5kZXIoKVxuICAgIHZhciBwYXRjaGVzID0gZGlmZih0aGlzLnRyZWUsIG5ld1RyZWUpXG4gICAgdGhpcy5zdmcgPSBwYXRjaCh0aGlzLnN2ZywgcGF0Y2hlcylcbiAgICB0aGlzLnRyZWUgPSBuZXdUcmVlXG4gIH0uYmluZCh0aGlzKSwgNTApXG5cbiAgZGVsZWdhdGUub24odGhpcy5zdmcsICcuZWRnZScsICdjbGljaycsIGZ1bmN0aW9uIChlKSB7XG4gICAgdmFyIGlkID0gZS50YXJnZXQuZ2V0QXR0cmlidXRlKCdpZCcpXG4gICAgdmFyIGEgPSBpZC5zcGxpdCgnLScpXG4gICAgZGF0YS5kaXNjb25uZWN0KGFbMF0sIGFbMV0sIGFbMl0sIGFbM10pXG4gIH0pXG5cbiAgZGVsZWdhdGUub24odGhpcy5zdmcsICcubm9kZSByZWN0LCAubm9kZSB0ZXh0JywgJ2NsaWNrJywgZnVuY3Rpb24gKGUpIHtcbiAgICB2YXIgaWQgPSBlLnRhcmdldC5wYXJlbnROb2RlLmdldEF0dHJpYnV0ZSgnaWQnKVxuICAgIHNlbGYuZW1pdCgnbm9kZS1zZWxlY3QnLCBkYXRhLmdldE5vZGUoaWQpKVxuICB9KVxuXG4gIGRlbGVnYXRlLm9uKHRoaXMuc3ZnLCAnLm5vZGUgLmNsb3NlJywgJ2NsaWNrJywgZnVuY3Rpb24gKGUpIHtcbiAgICB2YXIgaWQgPSBlLnRhcmdldC5wYXJlbnROb2RlLmdldEF0dHJpYnV0ZSgnaWQnKVxuICAgIGRhdGEuZGVsZXRlTm9kZShpZClcbiAgfSlcblxuICBkZWxlZ2F0ZS5vbih0aGlzLnN2ZywgJy5ub2RlIHJlY3QsIC5ub2RlIHRleHQnLCAnbW91c2Vkb3duJywgZnVuY3Rpb24gKGUpIHtcbiAgICB2YXIgaWQgPSBlLnRhcmdldC5wYXJlbnROb2RlLmdldEF0dHJpYnV0ZSgnaWQnKVxuXG4gICAgZG9jdW1lbnQub25tb3VzZW1vdmUgPSBtb3ZlT2JqZWN0XG4gICAgdmFyIG1vdmVkID0gZGF0YS5nZXROb2RlKGlkKVxuICAgIGZ1bmN0aW9uIG1vdmVPYmplY3QgKGUpIHtcbiAgICAgIG1vdmVkLnggPSBlLnBhZ2VYIC0gNTBcbiAgICAgIG1vdmVkLnkgPSBlLnBhZ2VZIC0gNTBcbiAgICB9XG4gIH0pXG5cbiAgZGVsZWdhdGUub24odGhpcy5zdmcsICcubm9kZSBjaXJjbGUnLCAnbW91c2VvdmVyJywgZnVuY3Rpb24gKGUpIHtcbiAgICB2YXIgaWQgPSBlLnRhcmdldC5wYXJlbnROb2RlLmdldEF0dHJpYnV0ZSgnaWQnKVxuICAgIHZhciBwb3J0ID0gZS50YXJnZXQuZ2V0QXR0cmlidXRlKCdpZCcpLnNwbGl0KCctJylbMl1cbiAgICB2YXIgaXNJbnB1dCA9IGhhc0NsYXNzKGUudGFyZ2V0LCAnaW5wdXQnKVxuICAgIHZhciBjb21wYXRpYmxlID0gZGF0YS5jb25uZWN0b3IuaXNJbnB1dCAhPT0gaXNJbnB1dFxuICAgIGlmIChkYXRhLmNvbm5lY3Rvci5hY3RpdmUgJiYgY29tcGF0aWJsZSkge1xuICAgICAgc3RvcERyYWcoKVxuICAgICAgdmFyIHNvdXJjZUlkID0gaXNJbnB1dCA/IGRhdGEuY29ubmVjdG9yLmZyb20uaWQgOiBpZFxuICAgICAgdmFyIHRhcmdldElkID0gaXNJbnB1dCA/IGlkIDogZGF0YS5jb25uZWN0b3IuZnJvbS5pZFxuICAgICAgdmFyIHNvdXJjZVBvcnQgPSBpc0lucHV0ID8gZGF0YS5jb25uZWN0b3IuZnJvbS5wb3J0IDogcG9ydFxuICAgICAgdmFyIHRhcmdldFBvcnQgPSBpc0lucHV0ID8gcG9ydCA6IGRhdGEuY29ubmVjdG9yLmZyb20ucG9ydFxuICAgICAgZGF0YS5jb25uZWN0KHNvdXJjZUlkLCB0YXJnZXRJZCwgc291cmNlUG9ydCwgdGFyZ2V0UG9ydClcbiAgICB9XG4gIH0pXG5cbiAgZGVsZWdhdGUub24odGhpcy5zdmcsICcubm9kZSBjaXJjbGUnLCAnbW91c2Vkb3duJywgZnVuY3Rpb24gKGUpIHtcbiAgICB2YXIgaWQgPSBlLnRhcmdldC5wYXJlbnROb2RlLmdldEF0dHJpYnV0ZSgnaWQnKVxuICAgIHZhciBwb3J0ID0gZS50YXJnZXQuZ2V0QXR0cmlidXRlKCdpZCcpLnNwbGl0KCctJylbMl1cbiAgICB2YXIgaXNJbnB1dCA9IGhhc0NsYXNzKGUudGFyZ2V0LCAnaW5wdXQnKVxuXG4gICAgZG9jdW1lbnQub25tb3VzZW1vdmUgPSBtb3ZlTGluZVxuICAgIGRhdGEuY29ubmVjdG9yLmZyb20ueCA9IGUucGFnZVhcbiAgICBkYXRhLmNvbm5lY3Rvci5mcm9tLnkgPSBlLnBhZ2VZXG4gICAgZGF0YS5jb25uZWN0b3IuZnJvbS5pZCA9IGlkXG4gICAgZGF0YS5jb25uZWN0b3IuZnJvbS5wb3J0ID0gcG9ydFxuICAgIGRhdGEuY29ubmVjdG9yLmlzSW5wdXQgPSBpc0lucHV0XG4gICAgZGF0YS5jb25uZWN0b3IuYWN0aXZlID0gdHJ1ZVxuICAgIGRhdGEuY29ubmVjdG9yLnRvLnggPSBlLnBhZ2VYXG4gICAgZGF0YS5jb25uZWN0b3IudG8ueSA9IGUucGFnZVlcbiAgICBmdW5jdGlvbiBtb3ZlTGluZSAoZSkge1xuICAgICAgZGF0YS5jb25uZWN0b3IudG8ueCA9IGUucGFnZVhcbiAgICAgIGRhdGEuY29ubmVjdG9yLnRvLnkgPSBlLnBhZ2VZXG4gICAgfVxuICB9KVxuXG4gIGRvY3VtZW50LmJvZHkuYWRkRXZlbnRMaXN0ZW5lcignbW91c2V1cCcsIHN0b3BEcmFnKVxuXG4gIGZ1bmN0aW9uIHN0b3BEcmFnICgpIHtcbiAgICBkb2N1bWVudC5vbm1vdXNlbW92ZSA9IGZ1bmN0aW9uICgpIHt9XG4gICAgZGF0YS5jb25uZWN0b3IuYWN0aXZlID0gZmFsc2VcbiAgfVxufVxuXG5mdW5jdGlvbiBoYXNDbGFzcyAoZWxlbWVudCwgY2xhc3NOYW1lKSB7XG4gIHJldHVybiBlbGVtZW50LmdldEF0dHJpYnV0ZSgnY2xhc3MnKS5zcGxpdCgnICcpLmluZGV4T2YoY2xhc3NOYW1lKSA+IC0xXG59XG4iLCJ2YXIgaCA9IHJlcXVpcmUoJ3ZpcnR1YWwtaHlwZXJzY3JpcHQtc3ZnJylcblxubW9kdWxlLmV4cG9ydHMgPSByZW5kZXJOb2RlXG5cbmZ1bmN0aW9uIHJlbmRlck5vZGUgKG5vZGUpIHtcbiAgdmFyIHJlY3QgPSBoKCdyZWN0Jywge1xuICAgIGNsYXNzOiAnYm9keScsXG4gICAgeDogMCxcbiAgICB5OiAwLFxuICAgIHJ4OiAnOHB4JyxcbiAgICByeTogJzhweCcsXG4gICAgd2lkdGg6IDEwMCxcbiAgICBoZWlnaHQ6IDEwMFxuICB9KVxuXG4gIHZhciBwb3J0cyA9IG5vZGUuaW5wb3J0cy5tYXAoZnVuY3Rpb24gKG5hbWUsIGkpIHtcbiAgICByZXR1cm4gaCgnY2lyY2xlJywge1xuICAgICAgY2xhc3M6ICdwb3J0IGlucHV0JyxcbiAgICAgIGlkOiBub2RlLmlkICsgJy1pbnBvcnQtJyArIG5hbWUsXG4gICAgICByOiA1LFxuICAgICAgY3g6IDAsXG4gICAgICBjeTogKGkgKyAxKSAqIDEwMCAvIChub2RlLmlucG9ydHMubGVuZ3RoICsgMSlcbiAgICB9KVxuICB9KVxuXG4gIHBvcnRzID0gcG9ydHMuY29uY2F0KG5vZGUub3V0cG9ydHMubWFwKGZ1bmN0aW9uIChuYW1lLCBpKSB7XG4gICAgcmV0dXJuIGgoJ2NpcmNsZScsIHtcbiAgICAgIGNsYXNzOiAncG9ydCBvdXRwdXQnLFxuICAgICAgaWQ6IG5vZGUuaWQgKyAnLW91dHBvcnQtJyArIG5hbWUsXG4gICAgICByOiA1LFxuICAgICAgY3g6IDEwMCxcbiAgICAgIGN5OiAoaSArIDEpICogMTAwIC8gKG5vZGUub3V0cG9ydHMubGVuZ3RoICsgMSlcbiAgICB9KVxuICB9KSlcblxuICB2YXIgY2xvc2VCdXR0b24gPSBoKCdyZWN0Jywge1xuICAgIGNsYXNzOiAnY2xvc2UnLFxuICAgIHg6IDUsXG4gICAgeTogNSxcbiAgICB3aWR0aDogJzEwcHgnLFxuICAgIGhlaWdodDogJzEwcHgnLFxuICAgIHJ4OiAyXG4gIH0pXG4gIHZhciB0ZXh0ID0gaCgndGV4dCcsIHt4OiA1MCwgeTogNTB9LCBub2RlLmxhYmVsIHx8IG5vZGUuaWQpXG4gIHZhciBkb21Ob2RlID0gaCgnZycsIHtcbiAgICBpZDogbm9kZS5pZCxcbiAgICBjbGFzczogJ25vZGUnLFxuICAgIHRyYW5zZm9ybTogJ3RyYW5zbGF0ZSgnICsgbm9kZS54ICsgJywnICsgbm9kZS55ICsgJyknXG4gIH0sXG4gICAgW1xuICAgICAgcmVjdCxcbiAgICAgIGNsb3NlQnV0dG9uLFxuICAgICAgdGV4dFxuICAgIF0uY29uY2F0KHBvcnRzKSlcbiAgcmV0dXJuIGRvbU5vZGVcbn1cbiIsIi8qKlxuICogTW9kdWxlIGV4cG9ydFxuICpcbiAqIEBwYXJhbSB7RWxlbWVudH0gZWxcbiAqIEByZXR1cm4ge0NsYXNzTGlzdH1cbiAqL1xuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIChlbCkge1xuICByZXR1cm4gbmV3IENsYXNzTGlzdChlbCk7XG59O1xuXG4vKipcbiAqIEluaXRpYWxpemUgYSBuZXcgQ2xhc3NMaXN0IGZvciB0aGUgZ2l2ZW4gZWxlbWVudFxuICpcbiAqIEBwYXJhbSB7RWxlbWVudH0gZWwgRE9NIEVsZW1lbnRcbiAqL1xuZnVuY3Rpb24gQ2xhc3NMaXN0KGVsKSB7XG4gIGlmICghZWwgfHwgZWwubm9kZVR5cGUgIT09IDEpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ0EgRE9NIEVsZW1lbnQgcmVmZXJlbmNlIGlzIHJlcXVpcmVkJyk7XG4gIH1cblxuICB0aGlzLmVsID0gZWw7XG4gIHRoaXMuY2xhc3NMaXN0ID0gZWwuY2xhc3NMaXN0O1xufVxuXG4vKipcbiAqIENoZWNrIHRva2VuIHZhbGlkaXR5XG4gKlxuICogQHBhcmFtIHRva2VuXG4gKiBAcGFyYW0gW21ldGhvZF1cbiAqL1xuZnVuY3Rpb24gY2hlY2tUb2tlbih0b2tlbiwgbWV0aG9kKSB7XG4gIG1ldGhvZCA9IG1ldGhvZCB8fCAnYSBtZXRob2QnO1xuXG4gIGlmICh0eXBlb2YgdG9rZW4gIT0gJ3N0cmluZycpIHtcbiAgICB0aHJvdyBuZXcgVHlwZUVycm9yKFxuICAgICAgJ0ZhaWxlZCB0byBleGVjdXRlIFxcJycgKyBtZXRob2QgKyAnXFwnIG9uIFxcJ0NsYXNzTGlzdFxcJzogJyArXG4gICAgICAndGhlIHRva2VuIHByb3ZpZGVkIChcXCcnICsgdG9rZW4gKyAnXFwnKSBpcyBub3QgYSBzdHJpbmcuJ1xuICAgICk7XG4gIH1cbiAgaWYgKHRva2VuID09PSBcIlwiKSB7XG4gICAgdGhyb3cgbmV3IFN5bnRheEVycm9yKFxuICAgICAgJ0ZhaWxlZCB0byBleGVjdXRlIFxcJycgKyBtZXRob2QgKyAnXFwnIG9uIFxcJ0NsYXNzTGlzdFxcJzogJyArXG4gICAgICAndGhlIHRva2VuIHByb3ZpZGVkIG11c3Qgbm90IGJlIGVtcHR5LidcbiAgICApO1xuICB9XG4gIGlmICgvXFxzLy50ZXN0KHRva2VuKSkge1xuICAgIHRocm93IG5ldyBFcnJvcihcbiAgICAgICdGYWlsZWQgdG8gZXhlY3V0ZSBcXCcnICsgbWV0aG9kICsgJ1xcJyBvbiBcXCdDbGFzc0xpc3RcXCc6ICcgK1xuICAgICAgJ3RoZSB0b2tlbiBwcm92aWRlZCAoXFwnJyArIHRva2VuICsgJ1xcJykgY29udGFpbnMgSFRNTCBzcGFjZSAnICtcbiAgICAgICdjaGFyYWN0ZXJzLCB3aGljaCBhcmUgbm90IHZhbGlkIGluIHRva2Vucy4nXG4gICAgKTtcbiAgfVxufVxuXG4vKipcbiAqIFJldHVybiBhbiBhcnJheSBvZiB0aGUgY2xhc3MgbmFtZXMgb24gdGhlIGVsZW1lbnQuXG4gKlxuICogQHJldHVybiB7QXJyYXl9XG4gKi9cbkNsYXNzTGlzdC5wcm90b3R5cGUudG9BcnJheSA9IGZ1bmN0aW9uICgpIHtcbiAgdmFyIHN0ciA9ICh0aGlzLmVsLmdldEF0dHJpYnV0ZSgnY2xhc3MnKSB8fCAnJykucmVwbGFjZSgvXlxccyt8XFxzKyQvZywgJycpO1xuICB2YXIgY2xhc3NlcyA9IHN0ci5zcGxpdCgvXFxzKy8pO1xuICBpZiAoJycgPT09IGNsYXNzZXNbMF0pIHsgY2xhc3Nlcy5zaGlmdCgpOyB9XG4gIHJldHVybiBjbGFzc2VzO1xufTtcblxuLyoqXG4gKiBBZGQgdGhlIGdpdmVuIGB0b2tlbmAgdG8gdGhlIGNsYXNzIGxpc3QgaWYgaXQncyBub3QgYWxyZWFkeSBwcmVzZW50LlxuICpcbiAqIEBwYXJhbSB7U3RyaW5nfSB0b2tlblxuICovXG5DbGFzc0xpc3QucHJvdG90eXBlLmFkZCA9IGZ1bmN0aW9uICh0b2tlbikge1xuICB2YXIgY2xhc3NlcywgaW5kZXgsIHVwZGF0ZWQ7XG4gIGNoZWNrVG9rZW4odG9rZW4sICdhZGQnKTtcblxuICBpZiAodGhpcy5jbGFzc0xpc3QpIHtcbiAgICB0aGlzLmNsYXNzTGlzdC5hZGQodG9rZW4pO1xuICB9XG4gIGVsc2Uge1xuICAgIC8vIGZhbGxiYWNrXG4gICAgY2xhc3NlcyA9IHRoaXMudG9BcnJheSgpO1xuICAgIGluZGV4ID0gY2xhc3Nlcy5pbmRleE9mKHRva2VuKTtcbiAgICBpZiAoaW5kZXggPT09IC0xKSB7XG4gICAgICBjbGFzc2VzLnB1c2godG9rZW4pO1xuICAgICAgdGhpcy5lbC5zZXRBdHRyaWJ1dGUoJ2NsYXNzJywgY2xhc3Nlcy5qb2luKCcgJykpO1xuICAgIH1cbiAgfVxuXG4gIHJldHVybjtcbn07XG5cbi8qKlxuICogQ2hlY2sgaWYgdGhlIGdpdmVuIGB0b2tlbmAgaXMgaW4gdGhlIGNsYXNzIGxpc3QuXG4gKlxuICogQHBhcmFtIHtTdHJpbmd9IHRva2VuXG4gKiBAcmV0dXJuIHtCb29sZWFufVxuICovXG5DbGFzc0xpc3QucHJvdG90eXBlLmNvbnRhaW5zID0gZnVuY3Rpb24gKHRva2VuKSB7XG4gIGNoZWNrVG9rZW4odG9rZW4sICdjb250YWlucycpO1xuXG4gIHJldHVybiB0aGlzLmNsYXNzTGlzdCA/XG4gICAgdGhpcy5jbGFzc0xpc3QuY29udGFpbnModG9rZW4pIDpcbiAgICB0aGlzLnRvQXJyYXkoKS5pbmRleE9mKHRva2VuKSA+IC0xO1xufTtcblxuLyoqXG4gKiBSZW1vdmUgYW55IGNsYXNzIG5hbWVzIHRoYXQgbWF0Y2ggdGhlIGdpdmVuIGB0b2tlbmAsIHdoZW4gcHJlc2VudC5cbiAqXG4gKiBAcGFyYW0ge1N0cmluZ3xSZWdFeHB9IHRva2VuXG4gKi9cbkNsYXNzTGlzdC5wcm90b3R5cGUucmVtb3ZlID0gZnVuY3Rpb24gKHRva2VuKSB7XG4gIHZhciBhcnIsIGNsYXNzZXMsIGksIGluZGV4LCBsZW47XG5cbiAgaWYgKCdbb2JqZWN0IFJlZ0V4cF0nID09IE9iamVjdC5wcm90b3R5cGUudG9TdHJpbmcuY2FsbCh0b2tlbikpIHtcbiAgICBhcnIgPSB0aGlzLnRvQXJyYXkoKTtcbiAgICBmb3IgKGkgPSAwLCBsZW4gPSBhcnIubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcbiAgICAgIGlmICh0b2tlbi50ZXN0KGFycltpXSkpIHtcbiAgICAgICAgdGhpcy5yZW1vdmUoYXJyW2ldKTtcbiAgICAgIH1cbiAgICB9XG4gIH1cbiAgZWxzZSB7XG4gICAgY2hlY2tUb2tlbih0b2tlbiwgJ3JlbW92ZScpO1xuXG4gICAgaWYgKHRoaXMuY2xhc3NMaXN0KSB7XG4gICAgICB0aGlzLmNsYXNzTGlzdC5yZW1vdmUodG9rZW4pO1xuICAgIH1cbiAgICBlbHNlIHtcbiAgICAgIC8vIGZhbGxiYWNrXG4gICAgICBjbGFzc2VzID0gdGhpcy50b0FycmF5KCk7XG4gICAgICBpbmRleCA9IGNsYXNzZXMuaW5kZXhPZih0b2tlbik7XG4gICAgICBpZiAoaW5kZXggPiAtMSkge1xuICAgICAgICBjbGFzc2VzLnNwbGljZShpbmRleCwgMSk7XG4gICAgICAgIHRoaXMuZWwuc2V0QXR0cmlidXRlKCdjbGFzcycsIGNsYXNzZXMuam9pbignICcpKTtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICByZXR1cm47XG59O1xuXG4vKipcbiAqIFRvZ2dsZSB0aGUgYHRva2VuYCBpbiB0aGUgY2xhc3MgbGlzdC4gT3B0aW9uYWxseSBmb3JjZSBzdGF0ZSB2aWEgYGZvcmNlYC5cbiAqXG4gKiBOYXRpdmUgYGNsYXNzTGlzdGAgaXMgbm90IHVzZWQgYXMgc29tZSBicm93c2VycyB0aGF0IHN1cHBvcnQgYGNsYXNzTGlzdGAgZG9cbiAqIG5vdCBzdXBwb3J0IGBmb3JjZWAuIEF2b2lkaW5nIGBjbGFzc0xpc3RgIGFsdG9nZXRoZXIga2VlcHMgdGhpcyBmdW5jdGlvblxuICogc2ltcGxlLlxuICpcbiAqIEBwYXJhbSB7U3RyaW5nfSB0b2tlblxuICogQHBhcmFtIHtCb29sZWFufSBbZm9yY2VdXG4gKiBAcmV0dXJuIHtCb29sZWFufVxuICovXG5DbGFzc0xpc3QucHJvdG90eXBlLnRvZ2dsZSA9IGZ1bmN0aW9uICh0b2tlbiwgZm9yY2UpIHtcbiAgY2hlY2tUb2tlbih0b2tlbiwgJ3RvZ2dsZScpO1xuXG4gIHZhciBoYXNUb2tlbiA9IHRoaXMuY29udGFpbnModG9rZW4pO1xuICB2YXIgbWV0aG9kID0gaGFzVG9rZW4gPyAoZm9yY2UgIT09IHRydWUgJiYgJ3JlbW92ZScpIDogKGZvcmNlICE9PSBmYWxzZSAmJiAnYWRkJyk7XG5cbiAgaWYgKG1ldGhvZCkge1xuICAgIHRoaXNbbWV0aG9kXSh0b2tlbik7XG4gIH1cblxuICByZXR1cm4gKHR5cGVvZiBmb3JjZSA9PSAnYm9vbGVhbicgPyBmb3JjZSA6ICFoYXNUb2tlbik7XG59O1xuIiwiaWYgKHR5cGVvZiBPYmplY3QuY3JlYXRlID09PSAnZnVuY3Rpb24nKSB7XG4gIC8vIGltcGxlbWVudGF0aW9uIGZyb20gc3RhbmRhcmQgbm9kZS5qcyAndXRpbCcgbW9kdWxlXG4gIG1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gaW5oZXJpdHMoY3Rvciwgc3VwZXJDdG9yKSB7XG4gICAgY3Rvci5zdXBlcl8gPSBzdXBlckN0b3JcbiAgICBjdG9yLnByb3RvdHlwZSA9IE9iamVjdC5jcmVhdGUoc3VwZXJDdG9yLnByb3RvdHlwZSwge1xuICAgICAgY29uc3RydWN0b3I6IHtcbiAgICAgICAgdmFsdWU6IGN0b3IsXG4gICAgICAgIGVudW1lcmFibGU6IGZhbHNlLFxuICAgICAgICB3cml0YWJsZTogdHJ1ZSxcbiAgICAgICAgY29uZmlndXJhYmxlOiB0cnVlXG4gICAgICB9XG4gICAgfSk7XG4gIH07XG59IGVsc2Uge1xuICAvLyBvbGQgc2Nob29sIHNoaW0gZm9yIG9sZCBicm93c2Vyc1xuICBtb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIGluaGVyaXRzKGN0b3IsIHN1cGVyQ3Rvcikge1xuICAgIGN0b3Iuc3VwZXJfID0gc3VwZXJDdG9yXG4gICAgdmFyIFRlbXBDdG9yID0gZnVuY3Rpb24gKCkge31cbiAgICBUZW1wQ3Rvci5wcm90b3R5cGUgPSBzdXBlckN0b3IucHJvdG90eXBlXG4gICAgY3Rvci5wcm90b3R5cGUgPSBuZXcgVGVtcEN0b3IoKVxuICAgIGN0b3IucHJvdG90eXBlLmNvbnN0cnVjdG9yID0gY3RvclxuICB9XG59XG4iLCJ2YXIgY3JlYXRlRWxlbWVudCA9IHJlcXVpcmUoXCIuL3Zkb20vY3JlYXRlLWVsZW1lbnQuanNcIilcblxubW9kdWxlLmV4cG9ydHMgPSBjcmVhdGVFbGVtZW50XG4iLCJ2YXIgZGlmZiA9IHJlcXVpcmUoXCIuL3Z0cmVlL2RpZmYuanNcIilcblxubW9kdWxlLmV4cG9ydHMgPSBkaWZmXG4iLCIvKiFcbiAqIENyb3NzLUJyb3dzZXIgU3BsaXQgMS4xLjFcbiAqIENvcHlyaWdodCAyMDA3LTIwMTIgU3RldmVuIExldml0aGFuIDxzdGV2ZW5sZXZpdGhhbi5jb20+XG4gKiBBdmFpbGFibGUgdW5kZXIgdGhlIE1JVCBMaWNlbnNlXG4gKiBFQ01BU2NyaXB0IGNvbXBsaWFudCwgdW5pZm9ybSBjcm9zcy1icm93c2VyIHNwbGl0IG1ldGhvZFxuICovXG5cbi8qKlxuICogU3BsaXRzIGEgc3RyaW5nIGludG8gYW4gYXJyYXkgb2Ygc3RyaW5ncyB1c2luZyBhIHJlZ2V4IG9yIHN0cmluZyBzZXBhcmF0b3IuIE1hdGNoZXMgb2YgdGhlXG4gKiBzZXBhcmF0b3IgYXJlIG5vdCBpbmNsdWRlZCBpbiB0aGUgcmVzdWx0IGFycmF5LiBIb3dldmVyLCBpZiBgc2VwYXJhdG9yYCBpcyBhIHJlZ2V4IHRoYXQgY29udGFpbnNcbiAqIGNhcHR1cmluZyBncm91cHMsIGJhY2tyZWZlcmVuY2VzIGFyZSBzcGxpY2VkIGludG8gdGhlIHJlc3VsdCBlYWNoIHRpbWUgYHNlcGFyYXRvcmAgaXMgbWF0Y2hlZC5cbiAqIEZpeGVzIGJyb3dzZXIgYnVncyBjb21wYXJlZCB0byB0aGUgbmF0aXZlIGBTdHJpbmcucHJvdG90eXBlLnNwbGl0YCBhbmQgY2FuIGJlIHVzZWQgcmVsaWFibHlcbiAqIGNyb3NzLWJyb3dzZXIuXG4gKiBAcGFyYW0ge1N0cmluZ30gc3RyIFN0cmluZyB0byBzcGxpdC5cbiAqIEBwYXJhbSB7UmVnRXhwfFN0cmluZ30gc2VwYXJhdG9yIFJlZ2V4IG9yIHN0cmluZyB0byB1c2UgZm9yIHNlcGFyYXRpbmcgdGhlIHN0cmluZy5cbiAqIEBwYXJhbSB7TnVtYmVyfSBbbGltaXRdIE1heGltdW0gbnVtYmVyIG9mIGl0ZW1zIHRvIGluY2x1ZGUgaW4gdGhlIHJlc3VsdCBhcnJheS5cbiAqIEByZXR1cm5zIHtBcnJheX0gQXJyYXkgb2Ygc3Vic3RyaW5ncy5cbiAqIEBleGFtcGxlXG4gKlxuICogLy8gQmFzaWMgdXNlXG4gKiBzcGxpdCgnYSBiIGMgZCcsICcgJyk7XG4gKiAvLyAtPiBbJ2EnLCAnYicsICdjJywgJ2QnXVxuICpcbiAqIC8vIFdpdGggbGltaXRcbiAqIHNwbGl0KCdhIGIgYyBkJywgJyAnLCAyKTtcbiAqIC8vIC0+IFsnYScsICdiJ11cbiAqXG4gKiAvLyBCYWNrcmVmZXJlbmNlcyBpbiByZXN1bHQgYXJyYXlcbiAqIHNwbGl0KCcuLndvcmQxIHdvcmQyLi4nLCAvKFthLXpdKykoXFxkKykvaSk7XG4gKiAvLyAtPiBbJy4uJywgJ3dvcmQnLCAnMScsICcgJywgJ3dvcmQnLCAnMicsICcuLiddXG4gKi9cbm1vZHVsZS5leHBvcnRzID0gKGZ1bmN0aW9uIHNwbGl0KHVuZGVmKSB7XG5cbiAgdmFyIG5hdGl2ZVNwbGl0ID0gU3RyaW5nLnByb3RvdHlwZS5zcGxpdCxcbiAgICBjb21wbGlhbnRFeGVjTnBjZyA9IC8oKT8/Ly5leGVjKFwiXCIpWzFdID09PSB1bmRlZixcbiAgICAvLyBOUENHOiBub25wYXJ0aWNpcGF0aW5nIGNhcHR1cmluZyBncm91cFxuICAgIHNlbGY7XG5cbiAgc2VsZiA9IGZ1bmN0aW9uKHN0ciwgc2VwYXJhdG9yLCBsaW1pdCkge1xuICAgIC8vIElmIGBzZXBhcmF0b3JgIGlzIG5vdCBhIHJlZ2V4LCB1c2UgYG5hdGl2ZVNwbGl0YFxuICAgIGlmIChPYmplY3QucHJvdG90eXBlLnRvU3RyaW5nLmNhbGwoc2VwYXJhdG9yKSAhPT0gXCJbb2JqZWN0IFJlZ0V4cF1cIikge1xuICAgICAgcmV0dXJuIG5hdGl2ZVNwbGl0LmNhbGwoc3RyLCBzZXBhcmF0b3IsIGxpbWl0KTtcbiAgICB9XG4gICAgdmFyIG91dHB1dCA9IFtdLFxuICAgICAgZmxhZ3MgPSAoc2VwYXJhdG9yLmlnbm9yZUNhc2UgPyBcImlcIiA6IFwiXCIpICsgKHNlcGFyYXRvci5tdWx0aWxpbmUgPyBcIm1cIiA6IFwiXCIpICsgKHNlcGFyYXRvci5leHRlbmRlZCA/IFwieFwiIDogXCJcIikgKyAvLyBQcm9wb3NlZCBmb3IgRVM2XG4gICAgICAoc2VwYXJhdG9yLnN0aWNreSA/IFwieVwiIDogXCJcIiksXG4gICAgICAvLyBGaXJlZm94IDMrXG4gICAgICBsYXN0TGFzdEluZGV4ID0gMCxcbiAgICAgIC8vIE1ha2UgYGdsb2JhbGAgYW5kIGF2b2lkIGBsYXN0SW5kZXhgIGlzc3VlcyBieSB3b3JraW5nIHdpdGggYSBjb3B5XG4gICAgICBzZXBhcmF0b3IgPSBuZXcgUmVnRXhwKHNlcGFyYXRvci5zb3VyY2UsIGZsYWdzICsgXCJnXCIpLFxuICAgICAgc2VwYXJhdG9yMiwgbWF0Y2gsIGxhc3RJbmRleCwgbGFzdExlbmd0aDtcbiAgICBzdHIgKz0gXCJcIjsgLy8gVHlwZS1jb252ZXJ0XG4gICAgaWYgKCFjb21wbGlhbnRFeGVjTnBjZykge1xuICAgICAgLy8gRG9lc24ndCBuZWVkIGZsYWdzIGd5LCBidXQgdGhleSBkb24ndCBodXJ0XG4gICAgICBzZXBhcmF0b3IyID0gbmV3IFJlZ0V4cChcIl5cIiArIHNlcGFyYXRvci5zb3VyY2UgKyBcIiQoPyFcXFxccylcIiwgZmxhZ3MpO1xuICAgIH1cbiAgICAvKiBWYWx1ZXMgZm9yIGBsaW1pdGAsIHBlciB0aGUgc3BlYzpcbiAgICAgKiBJZiB1bmRlZmluZWQ6IDQyOTQ5NjcyOTUgLy8gTWF0aC5wb3coMiwgMzIpIC0gMVxuICAgICAqIElmIDAsIEluZmluaXR5LCBvciBOYU46IDBcbiAgICAgKiBJZiBwb3NpdGl2ZSBudW1iZXI6IGxpbWl0ID0gTWF0aC5mbG9vcihsaW1pdCk7IGlmIChsaW1pdCA+IDQyOTQ5NjcyOTUpIGxpbWl0IC09IDQyOTQ5NjcyOTY7XG4gICAgICogSWYgbmVnYXRpdmUgbnVtYmVyOiA0Mjk0OTY3Mjk2IC0gTWF0aC5mbG9vcihNYXRoLmFicyhsaW1pdCkpXG4gICAgICogSWYgb3RoZXI6IFR5cGUtY29udmVydCwgdGhlbiB1c2UgdGhlIGFib3ZlIHJ1bGVzXG4gICAgICovXG4gICAgbGltaXQgPSBsaW1pdCA9PT0gdW5kZWYgPyAtMSA+Pj4gMCA6IC8vIE1hdGgucG93KDIsIDMyKSAtIDFcbiAgICBsaW1pdCA+Pj4gMDsgLy8gVG9VaW50MzIobGltaXQpXG4gICAgd2hpbGUgKG1hdGNoID0gc2VwYXJhdG9yLmV4ZWMoc3RyKSkge1xuICAgICAgLy8gYHNlcGFyYXRvci5sYXN0SW5kZXhgIGlzIG5vdCByZWxpYWJsZSBjcm9zcy1icm93c2VyXG4gICAgICBsYXN0SW5kZXggPSBtYXRjaC5pbmRleCArIG1hdGNoWzBdLmxlbmd0aDtcbiAgICAgIGlmIChsYXN0SW5kZXggPiBsYXN0TGFzdEluZGV4KSB7XG4gICAgICAgIG91dHB1dC5wdXNoKHN0ci5zbGljZShsYXN0TGFzdEluZGV4LCBtYXRjaC5pbmRleCkpO1xuICAgICAgICAvLyBGaXggYnJvd3NlcnMgd2hvc2UgYGV4ZWNgIG1ldGhvZHMgZG9uJ3QgY29uc2lzdGVudGx5IHJldHVybiBgdW5kZWZpbmVkYCBmb3JcbiAgICAgICAgLy8gbm9ucGFydGljaXBhdGluZyBjYXB0dXJpbmcgZ3JvdXBzXG4gICAgICAgIGlmICghY29tcGxpYW50RXhlY05wY2cgJiYgbWF0Y2gubGVuZ3RoID4gMSkge1xuICAgICAgICAgIG1hdGNoWzBdLnJlcGxhY2Uoc2VwYXJhdG9yMiwgZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICBmb3IgKHZhciBpID0gMTsgaSA8IGFyZ3VtZW50cy5sZW5ndGggLSAyOyBpKyspIHtcbiAgICAgICAgICAgICAgaWYgKGFyZ3VtZW50c1tpXSA9PT0gdW5kZWYpIHtcbiAgICAgICAgICAgICAgICBtYXRjaFtpXSA9IHVuZGVmO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSk7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKG1hdGNoLmxlbmd0aCA+IDEgJiYgbWF0Y2guaW5kZXggPCBzdHIubGVuZ3RoKSB7XG4gICAgICAgICAgQXJyYXkucHJvdG90eXBlLnB1c2guYXBwbHkob3V0cHV0LCBtYXRjaC5zbGljZSgxKSk7XG4gICAgICAgIH1cbiAgICAgICAgbGFzdExlbmd0aCA9IG1hdGNoWzBdLmxlbmd0aDtcbiAgICAgICAgbGFzdExhc3RJbmRleCA9IGxhc3RJbmRleDtcbiAgICAgICAgaWYgKG91dHB1dC5sZW5ndGggPj0gbGltaXQpIHtcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgaWYgKHNlcGFyYXRvci5sYXN0SW5kZXggPT09IG1hdGNoLmluZGV4KSB7XG4gICAgICAgIHNlcGFyYXRvci5sYXN0SW5kZXgrKzsgLy8gQXZvaWQgYW4gaW5maW5pdGUgbG9vcFxuICAgICAgfVxuICAgIH1cbiAgICBpZiAobGFzdExhc3RJbmRleCA9PT0gc3RyLmxlbmd0aCkge1xuICAgICAgaWYgKGxhc3RMZW5ndGggfHwgIXNlcGFyYXRvci50ZXN0KFwiXCIpKSB7XG4gICAgICAgIG91dHB1dC5wdXNoKFwiXCIpO1xuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICBvdXRwdXQucHVzaChzdHIuc2xpY2UobGFzdExhc3RJbmRleCkpO1xuICAgIH1cbiAgICByZXR1cm4gb3V0cHV0Lmxlbmd0aCA+IGxpbWl0ID8gb3V0cHV0LnNsaWNlKDAsIGxpbWl0KSA6IG91dHB1dDtcbiAgfTtcblxuICByZXR1cm4gc2VsZjtcbn0pKCk7XG4iLCIndXNlIHN0cmljdCc7XG5cbnZhciBPbmVWZXJzaW9uQ29uc3RyYWludCA9IHJlcXVpcmUoJ2luZGl2aWR1YWwvb25lLXZlcnNpb24nKTtcblxudmFyIE1ZX1ZFUlNJT04gPSAnNyc7XG5PbmVWZXJzaW9uQ29uc3RyYWludCgnZXYtc3RvcmUnLCBNWV9WRVJTSU9OKTtcblxudmFyIGhhc2hLZXkgPSAnX19FVl9TVE9SRV9LRVlAJyArIE1ZX1ZFUlNJT047XG5cbm1vZHVsZS5leHBvcnRzID0gRXZTdG9yZTtcblxuZnVuY3Rpb24gRXZTdG9yZShlbGVtKSB7XG4gICAgdmFyIGhhc2ggPSBlbGVtW2hhc2hLZXldO1xuXG4gICAgaWYgKCFoYXNoKSB7XG4gICAgICAgIGhhc2ggPSBlbGVtW2hhc2hLZXldID0ge307XG4gICAgfVxuXG4gICAgcmV0dXJuIGhhc2g7XG59XG4iLCIndXNlIHN0cmljdCc7XG5cbi8qZ2xvYmFsIHdpbmRvdywgZ2xvYmFsKi9cblxudmFyIHJvb3QgPSB0eXBlb2Ygd2luZG93ICE9PSAndW5kZWZpbmVkJyA/XG4gICAgd2luZG93IDogdHlwZW9mIGdsb2JhbCAhPT0gJ3VuZGVmaW5lZCcgP1xuICAgIGdsb2JhbCA6IHt9O1xuXG5tb2R1bGUuZXhwb3J0cyA9IEluZGl2aWR1YWw7XG5cbmZ1bmN0aW9uIEluZGl2aWR1YWwoa2V5LCB2YWx1ZSkge1xuICAgIGlmIChrZXkgaW4gcm9vdCkge1xuICAgICAgICByZXR1cm4gcm9vdFtrZXldO1xuICAgIH1cblxuICAgIHJvb3Rba2V5XSA9IHZhbHVlO1xuXG4gICAgcmV0dXJuIHZhbHVlO1xufVxuIiwiJ3VzZSBzdHJpY3QnO1xuXG52YXIgSW5kaXZpZHVhbCA9IHJlcXVpcmUoJy4vaW5kZXguanMnKTtcblxubW9kdWxlLmV4cG9ydHMgPSBPbmVWZXJzaW9uO1xuXG5mdW5jdGlvbiBPbmVWZXJzaW9uKG1vZHVsZU5hbWUsIHZlcnNpb24sIGRlZmF1bHRWYWx1ZSkge1xuICAgIHZhciBrZXkgPSAnX19JTkRJVklEVUFMX09ORV9WRVJTSU9OXycgKyBtb2R1bGVOYW1lO1xuICAgIHZhciBlbmZvcmNlS2V5ID0ga2V5ICsgJ19FTkZPUkNFX1NJTkdMRVRPTic7XG5cbiAgICB2YXIgdmVyc2lvblZhbHVlID0gSW5kaXZpZHVhbChlbmZvcmNlS2V5LCB2ZXJzaW9uKTtcblxuICAgIGlmICh2ZXJzaW9uVmFsdWUgIT09IHZlcnNpb24pIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdDYW4gb25seSBoYXZlIG9uZSBjb3B5IG9mICcgK1xuICAgICAgICAgICAgbW9kdWxlTmFtZSArICcuXFxuJyArXG4gICAgICAgICAgICAnWW91IGFscmVhZHkgaGF2ZSB2ZXJzaW9uICcgKyB2ZXJzaW9uVmFsdWUgK1xuICAgICAgICAgICAgJyBpbnN0YWxsZWQuXFxuJyArXG4gICAgICAgICAgICAnVGhpcyBtZWFucyB5b3UgY2Fubm90IGluc3RhbGwgdmVyc2lvbiAnICsgdmVyc2lvbik7XG4gICAgfVxuXG4gICAgcmV0dXJuIEluZGl2aWR1YWwoa2V5LCBkZWZhdWx0VmFsdWUpO1xufVxuIiwidmFyIHRvcExldmVsID0gdHlwZW9mIGdsb2JhbCAhPT0gJ3VuZGVmaW5lZCcgPyBnbG9iYWwgOlxuICAgIHR5cGVvZiB3aW5kb3cgIT09ICd1bmRlZmluZWQnID8gd2luZG93IDoge31cbnZhciBtaW5Eb2MgPSByZXF1aXJlKCdtaW4tZG9jdW1lbnQnKTtcblxuaWYgKHR5cGVvZiBkb2N1bWVudCAhPT0gJ3VuZGVmaW5lZCcpIHtcbiAgICBtb2R1bGUuZXhwb3J0cyA9IGRvY3VtZW50O1xufSBlbHNlIHtcbiAgICB2YXIgZG9jY3kgPSB0b3BMZXZlbFsnX19HTE9CQUxfRE9DVU1FTlRfQ0FDSEVANCddO1xuXG4gICAgaWYgKCFkb2NjeSkge1xuICAgICAgICBkb2NjeSA9IHRvcExldmVsWydfX0dMT0JBTF9ET0NVTUVOVF9DQUNIRUA0J10gPSBtaW5Eb2M7XG4gICAgfVxuXG4gICAgbW9kdWxlLmV4cG9ydHMgPSBkb2NjeTtcbn1cbiIsIlwidXNlIHN0cmljdFwiO1xuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIGlzT2JqZWN0KHgpIHtcblx0cmV0dXJuIHR5cGVvZiB4ID09PSBcIm9iamVjdFwiICYmIHggIT09IG51bGw7XG59O1xuIiwidmFyIG5hdGl2ZUlzQXJyYXkgPSBBcnJheS5pc0FycmF5XG52YXIgdG9TdHJpbmcgPSBPYmplY3QucHJvdG90eXBlLnRvU3RyaW5nXG5cbm1vZHVsZS5leHBvcnRzID0gbmF0aXZlSXNBcnJheSB8fCBpc0FycmF5XG5cbmZ1bmN0aW9uIGlzQXJyYXkob2JqKSB7XG4gICAgcmV0dXJuIHRvU3RyaW5nLmNhbGwob2JqKSA9PT0gXCJbb2JqZWN0IEFycmF5XVwiXG59XG4iLCJ2YXIgcGF0Y2ggPSByZXF1aXJlKFwiLi92ZG9tL3BhdGNoLmpzXCIpXG5cbm1vZHVsZS5leHBvcnRzID0gcGF0Y2hcbiIsInZhciBpc09iamVjdCA9IHJlcXVpcmUoXCJpcy1vYmplY3RcIilcbnZhciBpc0hvb2sgPSByZXF1aXJlKFwiLi4vdm5vZGUvaXMtdmhvb2suanNcIilcblxubW9kdWxlLmV4cG9ydHMgPSBhcHBseVByb3BlcnRpZXNcblxuZnVuY3Rpb24gYXBwbHlQcm9wZXJ0aWVzKG5vZGUsIHByb3BzLCBwcmV2aW91cykge1xuICAgIGZvciAodmFyIHByb3BOYW1lIGluIHByb3BzKSB7XG4gICAgICAgIHZhciBwcm9wVmFsdWUgPSBwcm9wc1twcm9wTmFtZV1cblxuICAgICAgICBpZiAocHJvcFZhbHVlID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgIHJlbW92ZVByb3BlcnR5KG5vZGUsIHByb3BOYW1lLCBwcm9wVmFsdWUsIHByZXZpb3VzKTtcbiAgICAgICAgfSBlbHNlIGlmIChpc0hvb2socHJvcFZhbHVlKSkge1xuICAgICAgICAgICAgcmVtb3ZlUHJvcGVydHkobm9kZSwgcHJvcE5hbWUsIHByb3BWYWx1ZSwgcHJldmlvdXMpXG4gICAgICAgICAgICBpZiAocHJvcFZhbHVlLmhvb2spIHtcbiAgICAgICAgICAgICAgICBwcm9wVmFsdWUuaG9vayhub2RlLFxuICAgICAgICAgICAgICAgICAgICBwcm9wTmFtZSxcbiAgICAgICAgICAgICAgICAgICAgcHJldmlvdXMgPyBwcmV2aW91c1twcm9wTmFtZV0gOiB1bmRlZmluZWQpXG4gICAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBpZiAoaXNPYmplY3QocHJvcFZhbHVlKSkge1xuICAgICAgICAgICAgICAgIHBhdGNoT2JqZWN0KG5vZGUsIHByb3BzLCBwcmV2aW91cywgcHJvcE5hbWUsIHByb3BWYWx1ZSk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIG5vZGVbcHJvcE5hbWVdID0gcHJvcFZhbHVlXG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG59XG5cbmZ1bmN0aW9uIHJlbW92ZVByb3BlcnR5KG5vZGUsIHByb3BOYW1lLCBwcm9wVmFsdWUsIHByZXZpb3VzKSB7XG4gICAgaWYgKHByZXZpb3VzKSB7XG4gICAgICAgIHZhciBwcmV2aW91c1ZhbHVlID0gcHJldmlvdXNbcHJvcE5hbWVdXG5cbiAgICAgICAgaWYgKCFpc0hvb2socHJldmlvdXNWYWx1ZSkpIHtcbiAgICAgICAgICAgIGlmIChwcm9wTmFtZSA9PT0gXCJhdHRyaWJ1dGVzXCIpIHtcbiAgICAgICAgICAgICAgICBmb3IgKHZhciBhdHRyTmFtZSBpbiBwcmV2aW91c1ZhbHVlKSB7XG4gICAgICAgICAgICAgICAgICAgIG5vZGUucmVtb3ZlQXR0cmlidXRlKGF0dHJOYW1lKVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0gZWxzZSBpZiAocHJvcE5hbWUgPT09IFwic3R5bGVcIikge1xuICAgICAgICAgICAgICAgIGZvciAodmFyIGkgaW4gcHJldmlvdXNWYWx1ZSkge1xuICAgICAgICAgICAgICAgICAgICBub2RlLnN0eWxlW2ldID0gXCJcIlxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0gZWxzZSBpZiAodHlwZW9mIHByZXZpb3VzVmFsdWUgPT09IFwic3RyaW5nXCIpIHtcbiAgICAgICAgICAgICAgICBub2RlW3Byb3BOYW1lXSA9IFwiXCJcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgbm9kZVtwcm9wTmFtZV0gPSBudWxsXG4gICAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSBpZiAocHJldmlvdXNWYWx1ZS51bmhvb2spIHtcbiAgICAgICAgICAgIHByZXZpb3VzVmFsdWUudW5ob29rKG5vZGUsIHByb3BOYW1lLCBwcm9wVmFsdWUpXG4gICAgICAgIH1cbiAgICB9XG59XG5cbmZ1bmN0aW9uIHBhdGNoT2JqZWN0KG5vZGUsIHByb3BzLCBwcmV2aW91cywgcHJvcE5hbWUsIHByb3BWYWx1ZSkge1xuICAgIHZhciBwcmV2aW91c1ZhbHVlID0gcHJldmlvdXMgPyBwcmV2aW91c1twcm9wTmFtZV0gOiB1bmRlZmluZWRcblxuICAgIC8vIFNldCBhdHRyaWJ1dGVzXG4gICAgaWYgKHByb3BOYW1lID09PSBcImF0dHJpYnV0ZXNcIikge1xuICAgICAgICBmb3IgKHZhciBhdHRyTmFtZSBpbiBwcm9wVmFsdWUpIHtcbiAgICAgICAgICAgIHZhciBhdHRyVmFsdWUgPSBwcm9wVmFsdWVbYXR0ck5hbWVdXG5cbiAgICAgICAgICAgIGlmIChhdHRyVmFsdWUgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgICAgIG5vZGUucmVtb3ZlQXR0cmlidXRlKGF0dHJOYW1lKVxuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBub2RlLnNldEF0dHJpYnV0ZShhdHRyTmFtZSwgYXR0clZhbHVlKVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuXG4gICAgfVxuXG4gICAgaWYocHJldmlvdXNWYWx1ZSAmJiBpc09iamVjdChwcmV2aW91c1ZhbHVlKSAmJlxuICAgICAgICBnZXRQcm90b3R5cGUocHJldmlvdXNWYWx1ZSkgIT09IGdldFByb3RvdHlwZShwcm9wVmFsdWUpKSB7XG4gICAgICAgIG5vZGVbcHJvcE5hbWVdID0gcHJvcFZhbHVlXG4gICAgICAgIHJldHVyblxuICAgIH1cblxuICAgIGlmICghaXNPYmplY3Qobm9kZVtwcm9wTmFtZV0pKSB7XG4gICAgICAgIG5vZGVbcHJvcE5hbWVdID0ge31cbiAgICB9XG5cbiAgICB2YXIgcmVwbGFjZXIgPSBwcm9wTmFtZSA9PT0gXCJzdHlsZVwiID8gXCJcIiA6IHVuZGVmaW5lZFxuXG4gICAgZm9yICh2YXIgayBpbiBwcm9wVmFsdWUpIHtcbiAgICAgICAgdmFyIHZhbHVlID0gcHJvcFZhbHVlW2tdXG4gICAgICAgIG5vZGVbcHJvcE5hbWVdW2tdID0gKHZhbHVlID09PSB1bmRlZmluZWQpID8gcmVwbGFjZXIgOiB2YWx1ZVxuICAgIH1cbn1cblxuZnVuY3Rpb24gZ2V0UHJvdG90eXBlKHZhbHVlKSB7XG4gICAgaWYgKE9iamVjdC5nZXRQcm90b3R5cGVPZikge1xuICAgICAgICByZXR1cm4gT2JqZWN0LmdldFByb3RvdHlwZU9mKHZhbHVlKVxuICAgIH0gZWxzZSBpZiAodmFsdWUuX19wcm90b19fKSB7XG4gICAgICAgIHJldHVybiB2YWx1ZS5fX3Byb3RvX19cbiAgICB9IGVsc2UgaWYgKHZhbHVlLmNvbnN0cnVjdG9yKSB7XG4gICAgICAgIHJldHVybiB2YWx1ZS5jb25zdHJ1Y3Rvci5wcm90b3R5cGVcbiAgICB9XG59XG4iLCJ2YXIgZG9jdW1lbnQgPSByZXF1aXJlKFwiZ2xvYmFsL2RvY3VtZW50XCIpXG5cbnZhciBhcHBseVByb3BlcnRpZXMgPSByZXF1aXJlKFwiLi9hcHBseS1wcm9wZXJ0aWVzXCIpXG5cbnZhciBpc1ZOb2RlID0gcmVxdWlyZShcIi4uL3Zub2RlL2lzLXZub2RlLmpzXCIpXG52YXIgaXNWVGV4dCA9IHJlcXVpcmUoXCIuLi92bm9kZS9pcy12dGV4dC5qc1wiKVxudmFyIGlzV2lkZ2V0ID0gcmVxdWlyZShcIi4uL3Zub2RlL2lzLXdpZGdldC5qc1wiKVxudmFyIGhhbmRsZVRodW5rID0gcmVxdWlyZShcIi4uL3Zub2RlL2hhbmRsZS10aHVuay5qc1wiKVxuXG5tb2R1bGUuZXhwb3J0cyA9IGNyZWF0ZUVsZW1lbnRcblxuZnVuY3Rpb24gY3JlYXRlRWxlbWVudCh2bm9kZSwgb3B0cykge1xuICAgIHZhciBkb2MgPSBvcHRzID8gb3B0cy5kb2N1bWVudCB8fCBkb2N1bWVudCA6IGRvY3VtZW50XG4gICAgdmFyIHdhcm4gPSBvcHRzID8gb3B0cy53YXJuIDogbnVsbFxuXG4gICAgdm5vZGUgPSBoYW5kbGVUaHVuayh2bm9kZSkuYVxuXG4gICAgaWYgKGlzV2lkZ2V0KHZub2RlKSkge1xuICAgICAgICByZXR1cm4gdm5vZGUuaW5pdCgpXG4gICAgfSBlbHNlIGlmIChpc1ZUZXh0KHZub2RlKSkge1xuICAgICAgICByZXR1cm4gZG9jLmNyZWF0ZVRleHROb2RlKHZub2RlLnRleHQpXG4gICAgfSBlbHNlIGlmICghaXNWTm9kZSh2bm9kZSkpIHtcbiAgICAgICAgaWYgKHdhcm4pIHtcbiAgICAgICAgICAgIHdhcm4oXCJJdGVtIGlzIG5vdCBhIHZhbGlkIHZpcnR1YWwgZG9tIG5vZGVcIiwgdm5vZGUpXG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIG51bGxcbiAgICB9XG5cbiAgICB2YXIgbm9kZSA9ICh2bm9kZS5uYW1lc3BhY2UgPT09IG51bGwpID9cbiAgICAgICAgZG9jLmNyZWF0ZUVsZW1lbnQodm5vZGUudGFnTmFtZSkgOlxuICAgICAgICBkb2MuY3JlYXRlRWxlbWVudE5TKHZub2RlLm5hbWVzcGFjZSwgdm5vZGUudGFnTmFtZSlcblxuICAgIHZhciBwcm9wcyA9IHZub2RlLnByb3BlcnRpZXNcbiAgICBhcHBseVByb3BlcnRpZXMobm9kZSwgcHJvcHMpXG5cbiAgICB2YXIgY2hpbGRyZW4gPSB2bm9kZS5jaGlsZHJlblxuXG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBjaGlsZHJlbi5sZW5ndGg7IGkrKykge1xuICAgICAgICB2YXIgY2hpbGROb2RlID0gY3JlYXRlRWxlbWVudChjaGlsZHJlbltpXSwgb3B0cylcbiAgICAgICAgaWYgKGNoaWxkTm9kZSkge1xuICAgICAgICAgICAgbm9kZS5hcHBlbmRDaGlsZChjaGlsZE5vZGUpXG4gICAgICAgIH1cbiAgICB9XG5cbiAgICByZXR1cm4gbm9kZVxufVxuIiwiLy8gTWFwcyBhIHZpcnR1YWwgRE9NIHRyZWUgb250byBhIHJlYWwgRE9NIHRyZWUgaW4gYW4gZWZmaWNpZW50IG1hbm5lci5cbi8vIFdlIGRvbid0IHdhbnQgdG8gcmVhZCBhbGwgb2YgdGhlIERPTSBub2RlcyBpbiB0aGUgdHJlZSBzbyB3ZSB1c2Vcbi8vIHRoZSBpbi1vcmRlciB0cmVlIGluZGV4aW5nIHRvIGVsaW1pbmF0ZSByZWN1cnNpb24gZG93biBjZXJ0YWluIGJyYW5jaGVzLlxuLy8gV2Ugb25seSByZWN1cnNlIGludG8gYSBET00gbm9kZSBpZiB3ZSBrbm93IHRoYXQgaXQgY29udGFpbnMgYSBjaGlsZCBvZlxuLy8gaW50ZXJlc3QuXG5cbnZhciBub0NoaWxkID0ge31cblxubW9kdWxlLmV4cG9ydHMgPSBkb21JbmRleFxuXG5mdW5jdGlvbiBkb21JbmRleChyb290Tm9kZSwgdHJlZSwgaW5kaWNlcywgbm9kZXMpIHtcbiAgICBpZiAoIWluZGljZXMgfHwgaW5kaWNlcy5sZW5ndGggPT09IDApIHtcbiAgICAgICAgcmV0dXJuIHt9XG4gICAgfSBlbHNlIHtcbiAgICAgICAgaW5kaWNlcy5zb3J0KGFzY2VuZGluZylcbiAgICAgICAgcmV0dXJuIHJlY3Vyc2Uocm9vdE5vZGUsIHRyZWUsIGluZGljZXMsIG5vZGVzLCAwKVxuICAgIH1cbn1cblxuZnVuY3Rpb24gcmVjdXJzZShyb290Tm9kZSwgdHJlZSwgaW5kaWNlcywgbm9kZXMsIHJvb3RJbmRleCkge1xuICAgIG5vZGVzID0gbm9kZXMgfHwge31cblxuXG4gICAgaWYgKHJvb3ROb2RlKSB7XG4gICAgICAgIGlmIChpbmRleEluUmFuZ2UoaW5kaWNlcywgcm9vdEluZGV4LCByb290SW5kZXgpKSB7XG4gICAgICAgICAgICBub2Rlc1tyb290SW5kZXhdID0gcm9vdE5vZGVcbiAgICAgICAgfVxuXG4gICAgICAgIHZhciB2Q2hpbGRyZW4gPSB0cmVlLmNoaWxkcmVuXG5cbiAgICAgICAgaWYgKHZDaGlsZHJlbikge1xuXG4gICAgICAgICAgICB2YXIgY2hpbGROb2RlcyA9IHJvb3ROb2RlLmNoaWxkTm9kZXNcblxuICAgICAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCB0cmVlLmNoaWxkcmVuLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICAgICAgcm9vdEluZGV4ICs9IDFcblxuICAgICAgICAgICAgICAgIHZhciB2Q2hpbGQgPSB2Q2hpbGRyZW5baV0gfHwgbm9DaGlsZFxuICAgICAgICAgICAgICAgIHZhciBuZXh0SW5kZXggPSByb290SW5kZXggKyAodkNoaWxkLmNvdW50IHx8IDApXG5cbiAgICAgICAgICAgICAgICAvLyBza2lwIHJlY3Vyc2lvbiBkb3duIHRoZSB0cmVlIGlmIHRoZXJlIGFyZSBubyBub2RlcyBkb3duIGhlcmVcbiAgICAgICAgICAgICAgICBpZiAoaW5kZXhJblJhbmdlKGluZGljZXMsIHJvb3RJbmRleCwgbmV4dEluZGV4KSkge1xuICAgICAgICAgICAgICAgICAgICByZWN1cnNlKGNoaWxkTm9kZXNbaV0sIHZDaGlsZCwgaW5kaWNlcywgbm9kZXMsIHJvb3RJbmRleClcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICByb290SW5kZXggPSBuZXh0SW5kZXhcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cblxuICAgIHJldHVybiBub2Rlc1xufVxuXG4vLyBCaW5hcnkgc2VhcmNoIGZvciBhbiBpbmRleCBpbiB0aGUgaW50ZXJ2YWwgW2xlZnQsIHJpZ2h0XVxuZnVuY3Rpb24gaW5kZXhJblJhbmdlKGluZGljZXMsIGxlZnQsIHJpZ2h0KSB7XG4gICAgaWYgKGluZGljZXMubGVuZ3RoID09PSAwKSB7XG4gICAgICAgIHJldHVybiBmYWxzZVxuICAgIH1cblxuICAgIHZhciBtaW5JbmRleCA9IDBcbiAgICB2YXIgbWF4SW5kZXggPSBpbmRpY2VzLmxlbmd0aCAtIDFcbiAgICB2YXIgY3VycmVudEluZGV4XG4gICAgdmFyIGN1cnJlbnRJdGVtXG5cbiAgICB3aGlsZSAobWluSW5kZXggPD0gbWF4SW5kZXgpIHtcbiAgICAgICAgY3VycmVudEluZGV4ID0gKChtYXhJbmRleCArIG1pbkluZGV4KSAvIDIpID4+IDBcbiAgICAgICAgY3VycmVudEl0ZW0gPSBpbmRpY2VzW2N1cnJlbnRJbmRleF1cblxuICAgICAgICBpZiAobWluSW5kZXggPT09IG1heEluZGV4KSB7XG4gICAgICAgICAgICByZXR1cm4gY3VycmVudEl0ZW0gPj0gbGVmdCAmJiBjdXJyZW50SXRlbSA8PSByaWdodFxuICAgICAgICB9IGVsc2UgaWYgKGN1cnJlbnRJdGVtIDwgbGVmdCkge1xuICAgICAgICAgICAgbWluSW5kZXggPSBjdXJyZW50SW5kZXggKyAxXG4gICAgICAgIH0gZWxzZSAgaWYgKGN1cnJlbnRJdGVtID4gcmlnaHQpIHtcbiAgICAgICAgICAgIG1heEluZGV4ID0gY3VycmVudEluZGV4IC0gMVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgcmV0dXJuIHRydWVcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHJldHVybiBmYWxzZTtcbn1cblxuZnVuY3Rpb24gYXNjZW5kaW5nKGEsIGIpIHtcbiAgICByZXR1cm4gYSA+IGIgPyAxIDogLTFcbn1cbiIsInZhciBhcHBseVByb3BlcnRpZXMgPSByZXF1aXJlKFwiLi9hcHBseS1wcm9wZXJ0aWVzXCIpXG5cbnZhciBpc1dpZGdldCA9IHJlcXVpcmUoXCIuLi92bm9kZS9pcy13aWRnZXQuanNcIilcbnZhciBWUGF0Y2ggPSByZXF1aXJlKFwiLi4vdm5vZGUvdnBhdGNoLmpzXCIpXG5cbnZhciByZW5kZXIgPSByZXF1aXJlKFwiLi9jcmVhdGUtZWxlbWVudFwiKVxudmFyIHVwZGF0ZVdpZGdldCA9IHJlcXVpcmUoXCIuL3VwZGF0ZS13aWRnZXRcIilcblxubW9kdWxlLmV4cG9ydHMgPSBhcHBseVBhdGNoXG5cbmZ1bmN0aW9uIGFwcGx5UGF0Y2godnBhdGNoLCBkb21Ob2RlLCByZW5kZXJPcHRpb25zKSB7XG4gICAgdmFyIHR5cGUgPSB2cGF0Y2gudHlwZVxuICAgIHZhciB2Tm9kZSA9IHZwYXRjaC52Tm9kZVxuICAgIHZhciBwYXRjaCA9IHZwYXRjaC5wYXRjaFxuXG4gICAgc3dpdGNoICh0eXBlKSB7XG4gICAgICAgIGNhc2UgVlBhdGNoLlJFTU9WRTpcbiAgICAgICAgICAgIHJldHVybiByZW1vdmVOb2RlKGRvbU5vZGUsIHZOb2RlKVxuICAgICAgICBjYXNlIFZQYXRjaC5JTlNFUlQ6XG4gICAgICAgICAgICByZXR1cm4gaW5zZXJ0Tm9kZShkb21Ob2RlLCBwYXRjaCwgcmVuZGVyT3B0aW9ucylcbiAgICAgICAgY2FzZSBWUGF0Y2guVlRFWFQ6XG4gICAgICAgICAgICByZXR1cm4gc3RyaW5nUGF0Y2goZG9tTm9kZSwgdk5vZGUsIHBhdGNoLCByZW5kZXJPcHRpb25zKVxuICAgICAgICBjYXNlIFZQYXRjaC5XSURHRVQ6XG4gICAgICAgICAgICByZXR1cm4gd2lkZ2V0UGF0Y2goZG9tTm9kZSwgdk5vZGUsIHBhdGNoLCByZW5kZXJPcHRpb25zKVxuICAgICAgICBjYXNlIFZQYXRjaC5WTk9ERTpcbiAgICAgICAgICAgIHJldHVybiB2Tm9kZVBhdGNoKGRvbU5vZGUsIHZOb2RlLCBwYXRjaCwgcmVuZGVyT3B0aW9ucylcbiAgICAgICAgY2FzZSBWUGF0Y2guT1JERVI6XG4gICAgICAgICAgICByZW9yZGVyQ2hpbGRyZW4oZG9tTm9kZSwgcGF0Y2gpXG4gICAgICAgICAgICByZXR1cm4gZG9tTm9kZVxuICAgICAgICBjYXNlIFZQYXRjaC5QUk9QUzpcbiAgICAgICAgICAgIGFwcGx5UHJvcGVydGllcyhkb21Ob2RlLCBwYXRjaCwgdk5vZGUucHJvcGVydGllcylcbiAgICAgICAgICAgIHJldHVybiBkb21Ob2RlXG4gICAgICAgIGNhc2UgVlBhdGNoLlRIVU5LOlxuICAgICAgICAgICAgcmV0dXJuIHJlcGxhY2VSb290KGRvbU5vZGUsXG4gICAgICAgICAgICAgICAgcmVuZGVyT3B0aW9ucy5wYXRjaChkb21Ob2RlLCBwYXRjaCwgcmVuZGVyT3B0aW9ucykpXG4gICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgICByZXR1cm4gZG9tTm9kZVxuICAgIH1cbn1cblxuZnVuY3Rpb24gcmVtb3ZlTm9kZShkb21Ob2RlLCB2Tm9kZSkge1xuICAgIHZhciBwYXJlbnROb2RlID0gZG9tTm9kZS5wYXJlbnROb2RlXG5cbiAgICBpZiAocGFyZW50Tm9kZSkge1xuICAgICAgICBwYXJlbnROb2RlLnJlbW92ZUNoaWxkKGRvbU5vZGUpXG4gICAgfVxuXG4gICAgZGVzdHJveVdpZGdldChkb21Ob2RlLCB2Tm9kZSk7XG5cbiAgICByZXR1cm4gbnVsbFxufVxuXG5mdW5jdGlvbiBpbnNlcnROb2RlKHBhcmVudE5vZGUsIHZOb2RlLCByZW5kZXJPcHRpb25zKSB7XG4gICAgdmFyIG5ld05vZGUgPSByZW5kZXIodk5vZGUsIHJlbmRlck9wdGlvbnMpXG5cbiAgICBpZiAocGFyZW50Tm9kZSkge1xuICAgICAgICBwYXJlbnROb2RlLmFwcGVuZENoaWxkKG5ld05vZGUpXG4gICAgfVxuXG4gICAgcmV0dXJuIHBhcmVudE5vZGVcbn1cblxuZnVuY3Rpb24gc3RyaW5nUGF0Y2goZG9tTm9kZSwgbGVmdFZOb2RlLCB2VGV4dCwgcmVuZGVyT3B0aW9ucykge1xuICAgIHZhciBuZXdOb2RlXG5cbiAgICBpZiAoZG9tTm9kZS5ub2RlVHlwZSA9PT0gMykge1xuICAgICAgICBkb21Ob2RlLnJlcGxhY2VEYXRhKDAsIGRvbU5vZGUubGVuZ3RoLCB2VGV4dC50ZXh0KVxuICAgICAgICBuZXdOb2RlID0gZG9tTm9kZVxuICAgIH0gZWxzZSB7XG4gICAgICAgIHZhciBwYXJlbnROb2RlID0gZG9tTm9kZS5wYXJlbnROb2RlXG4gICAgICAgIG5ld05vZGUgPSByZW5kZXIodlRleHQsIHJlbmRlck9wdGlvbnMpXG5cbiAgICAgICAgaWYgKHBhcmVudE5vZGUgJiYgbmV3Tm9kZSAhPT0gZG9tTm9kZSkge1xuICAgICAgICAgICAgcGFyZW50Tm9kZS5yZXBsYWNlQ2hpbGQobmV3Tm9kZSwgZG9tTm9kZSlcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHJldHVybiBuZXdOb2RlXG59XG5cbmZ1bmN0aW9uIHdpZGdldFBhdGNoKGRvbU5vZGUsIGxlZnRWTm9kZSwgd2lkZ2V0LCByZW5kZXJPcHRpb25zKSB7XG4gICAgdmFyIHVwZGF0aW5nID0gdXBkYXRlV2lkZ2V0KGxlZnRWTm9kZSwgd2lkZ2V0KVxuICAgIHZhciBuZXdOb2RlXG5cbiAgICBpZiAodXBkYXRpbmcpIHtcbiAgICAgICAgbmV3Tm9kZSA9IHdpZGdldC51cGRhdGUobGVmdFZOb2RlLCBkb21Ob2RlKSB8fCBkb21Ob2RlXG4gICAgfSBlbHNlIHtcbiAgICAgICAgbmV3Tm9kZSA9IHJlbmRlcih3aWRnZXQsIHJlbmRlck9wdGlvbnMpXG4gICAgfVxuXG4gICAgdmFyIHBhcmVudE5vZGUgPSBkb21Ob2RlLnBhcmVudE5vZGVcblxuICAgIGlmIChwYXJlbnROb2RlICYmIG5ld05vZGUgIT09IGRvbU5vZGUpIHtcbiAgICAgICAgcGFyZW50Tm9kZS5yZXBsYWNlQ2hpbGQobmV3Tm9kZSwgZG9tTm9kZSlcbiAgICB9XG5cbiAgICBpZiAoIXVwZGF0aW5nKSB7XG4gICAgICAgIGRlc3Ryb3lXaWRnZXQoZG9tTm9kZSwgbGVmdFZOb2RlKVxuICAgIH1cblxuICAgIHJldHVybiBuZXdOb2RlXG59XG5cbmZ1bmN0aW9uIHZOb2RlUGF0Y2goZG9tTm9kZSwgbGVmdFZOb2RlLCB2Tm9kZSwgcmVuZGVyT3B0aW9ucykge1xuICAgIHZhciBwYXJlbnROb2RlID0gZG9tTm9kZS5wYXJlbnROb2RlXG4gICAgdmFyIG5ld05vZGUgPSByZW5kZXIodk5vZGUsIHJlbmRlck9wdGlvbnMpXG5cbiAgICBpZiAocGFyZW50Tm9kZSAmJiBuZXdOb2RlICE9PSBkb21Ob2RlKSB7XG4gICAgICAgIHBhcmVudE5vZGUucmVwbGFjZUNoaWxkKG5ld05vZGUsIGRvbU5vZGUpXG4gICAgfVxuXG4gICAgcmV0dXJuIG5ld05vZGVcbn1cblxuZnVuY3Rpb24gZGVzdHJveVdpZGdldChkb21Ob2RlLCB3KSB7XG4gICAgaWYgKHR5cGVvZiB3LmRlc3Ryb3kgPT09IFwiZnVuY3Rpb25cIiAmJiBpc1dpZGdldCh3KSkge1xuICAgICAgICB3LmRlc3Ryb3koZG9tTm9kZSlcbiAgICB9XG59XG5cbmZ1bmN0aW9uIHJlb3JkZXJDaGlsZHJlbihkb21Ob2RlLCBtb3Zlcykge1xuICAgIHZhciBjaGlsZE5vZGVzID0gZG9tTm9kZS5jaGlsZE5vZGVzXG4gICAgdmFyIGtleU1hcCA9IHt9XG4gICAgdmFyIG5vZGVcbiAgICB2YXIgcmVtb3ZlXG4gICAgdmFyIGluc2VydFxuXG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBtb3Zlcy5yZW1vdmVzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgIHJlbW92ZSA9IG1vdmVzLnJlbW92ZXNbaV1cbiAgICAgICAgbm9kZSA9IGNoaWxkTm9kZXNbcmVtb3ZlLmZyb21dXG4gICAgICAgIGlmIChyZW1vdmUua2V5KSB7XG4gICAgICAgICAgICBrZXlNYXBbcmVtb3ZlLmtleV0gPSBub2RlXG4gICAgICAgIH1cbiAgICAgICAgZG9tTm9kZS5yZW1vdmVDaGlsZChub2RlKVxuICAgIH1cblxuICAgIHZhciBsZW5ndGggPSBjaGlsZE5vZGVzLmxlbmd0aFxuICAgIGZvciAodmFyIGogPSAwOyBqIDwgbW92ZXMuaW5zZXJ0cy5sZW5ndGg7IGorKykge1xuICAgICAgICBpbnNlcnQgPSBtb3Zlcy5pbnNlcnRzW2pdXG4gICAgICAgIG5vZGUgPSBrZXlNYXBbaW5zZXJ0LmtleV1cbiAgICAgICAgLy8gdGhpcyBpcyB0aGUgd2VpcmRlc3QgYnVnIGkndmUgZXZlciBzZWVuIGluIHdlYmtpdFxuICAgICAgICBkb21Ob2RlLmluc2VydEJlZm9yZShub2RlLCBpbnNlcnQudG8gPj0gbGVuZ3RoKysgPyBudWxsIDogY2hpbGROb2Rlc1tpbnNlcnQudG9dKVxuICAgIH1cbn1cblxuZnVuY3Rpb24gcmVwbGFjZVJvb3Qob2xkUm9vdCwgbmV3Um9vdCkge1xuICAgIGlmIChvbGRSb290ICYmIG5ld1Jvb3QgJiYgb2xkUm9vdCAhPT0gbmV3Um9vdCAmJiBvbGRSb290LnBhcmVudE5vZGUpIHtcbiAgICAgICAgb2xkUm9vdC5wYXJlbnROb2RlLnJlcGxhY2VDaGlsZChuZXdSb290LCBvbGRSb290KVxuICAgIH1cblxuICAgIHJldHVybiBuZXdSb290O1xufVxuIiwidmFyIGRvY3VtZW50ID0gcmVxdWlyZShcImdsb2JhbC9kb2N1bWVudFwiKVxudmFyIGlzQXJyYXkgPSByZXF1aXJlKFwieC1pcy1hcnJheVwiKVxuXG52YXIgZG9tSW5kZXggPSByZXF1aXJlKFwiLi9kb20taW5kZXhcIilcbnZhciBwYXRjaE9wID0gcmVxdWlyZShcIi4vcGF0Y2gtb3BcIilcbm1vZHVsZS5leHBvcnRzID0gcGF0Y2hcblxuZnVuY3Rpb24gcGF0Y2gocm9vdE5vZGUsIHBhdGNoZXMpIHtcbiAgICByZXR1cm4gcGF0Y2hSZWN1cnNpdmUocm9vdE5vZGUsIHBhdGNoZXMpXG59XG5cbmZ1bmN0aW9uIHBhdGNoUmVjdXJzaXZlKHJvb3ROb2RlLCBwYXRjaGVzLCByZW5kZXJPcHRpb25zKSB7XG4gICAgdmFyIGluZGljZXMgPSBwYXRjaEluZGljZXMocGF0Y2hlcylcblxuICAgIGlmIChpbmRpY2VzLmxlbmd0aCA9PT0gMCkge1xuICAgICAgICByZXR1cm4gcm9vdE5vZGVcbiAgICB9XG5cbiAgICB2YXIgaW5kZXggPSBkb21JbmRleChyb290Tm9kZSwgcGF0Y2hlcy5hLCBpbmRpY2VzKVxuICAgIHZhciBvd25lckRvY3VtZW50ID0gcm9vdE5vZGUub3duZXJEb2N1bWVudFxuXG4gICAgaWYgKCFyZW5kZXJPcHRpb25zKSB7XG4gICAgICAgIHJlbmRlck9wdGlvbnMgPSB7IHBhdGNoOiBwYXRjaFJlY3Vyc2l2ZSB9XG4gICAgICAgIGlmIChvd25lckRvY3VtZW50ICE9PSBkb2N1bWVudCkge1xuICAgICAgICAgICAgcmVuZGVyT3B0aW9ucy5kb2N1bWVudCA9IG93bmVyRG9jdW1lbnRcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgaW5kaWNlcy5sZW5ndGg7IGkrKykge1xuICAgICAgICB2YXIgbm9kZUluZGV4ID0gaW5kaWNlc1tpXVxuICAgICAgICByb290Tm9kZSA9IGFwcGx5UGF0Y2gocm9vdE5vZGUsXG4gICAgICAgICAgICBpbmRleFtub2RlSW5kZXhdLFxuICAgICAgICAgICAgcGF0Y2hlc1tub2RlSW5kZXhdLFxuICAgICAgICAgICAgcmVuZGVyT3B0aW9ucylcbiAgICB9XG5cbiAgICByZXR1cm4gcm9vdE5vZGVcbn1cblxuZnVuY3Rpb24gYXBwbHlQYXRjaChyb290Tm9kZSwgZG9tTm9kZSwgcGF0Y2hMaXN0LCByZW5kZXJPcHRpb25zKSB7XG4gICAgaWYgKCFkb21Ob2RlKSB7XG4gICAgICAgIHJldHVybiByb290Tm9kZVxuICAgIH1cblxuICAgIHZhciBuZXdOb2RlXG5cbiAgICBpZiAoaXNBcnJheShwYXRjaExpc3QpKSB7XG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgcGF0Y2hMaXN0Lmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICBuZXdOb2RlID0gcGF0Y2hPcChwYXRjaExpc3RbaV0sIGRvbU5vZGUsIHJlbmRlck9wdGlvbnMpXG5cbiAgICAgICAgICAgIGlmIChkb21Ob2RlID09PSByb290Tm9kZSkge1xuICAgICAgICAgICAgICAgIHJvb3ROb2RlID0gbmV3Tm9kZVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgICAgbmV3Tm9kZSA9IHBhdGNoT3AocGF0Y2hMaXN0LCBkb21Ob2RlLCByZW5kZXJPcHRpb25zKVxuXG4gICAgICAgIGlmIChkb21Ob2RlID09PSByb290Tm9kZSkge1xuICAgICAgICAgICAgcm9vdE5vZGUgPSBuZXdOb2RlXG4gICAgICAgIH1cbiAgICB9XG5cbiAgICByZXR1cm4gcm9vdE5vZGVcbn1cblxuZnVuY3Rpb24gcGF0Y2hJbmRpY2VzKHBhdGNoZXMpIHtcbiAgICB2YXIgaW5kaWNlcyA9IFtdXG5cbiAgICBmb3IgKHZhciBrZXkgaW4gcGF0Y2hlcykge1xuICAgICAgICBpZiAoa2V5ICE9PSBcImFcIikge1xuICAgICAgICAgICAgaW5kaWNlcy5wdXNoKE51bWJlcihrZXkpKVxuICAgICAgICB9XG4gICAgfVxuXG4gICAgcmV0dXJuIGluZGljZXNcbn1cbiIsInZhciBpc1dpZGdldCA9IHJlcXVpcmUoXCIuLi92bm9kZS9pcy13aWRnZXQuanNcIilcblxubW9kdWxlLmV4cG9ydHMgPSB1cGRhdGVXaWRnZXRcblxuZnVuY3Rpb24gdXBkYXRlV2lkZ2V0KGEsIGIpIHtcbiAgICBpZiAoaXNXaWRnZXQoYSkgJiYgaXNXaWRnZXQoYikpIHtcbiAgICAgICAgaWYgKFwibmFtZVwiIGluIGEgJiYgXCJuYW1lXCIgaW4gYikge1xuICAgICAgICAgICAgcmV0dXJuIGEuaWQgPT09IGIuaWRcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHJldHVybiBhLmluaXQgPT09IGIuaW5pdFxuICAgICAgICB9XG4gICAgfVxuXG4gICAgcmV0dXJuIGZhbHNlXG59XG4iLCIndXNlIHN0cmljdCc7XG5cbm1vZHVsZS5leHBvcnRzID0gQXR0cmlidXRlSG9vaztcblxuZnVuY3Rpb24gQXR0cmlidXRlSG9vayhuYW1lc3BhY2UsIHZhbHVlKSB7XG4gICAgaWYgKCEodGhpcyBpbnN0YW5jZW9mIEF0dHJpYnV0ZUhvb2spKSB7XG4gICAgICAgIHJldHVybiBuZXcgQXR0cmlidXRlSG9vayhuYW1lc3BhY2UsIHZhbHVlKTtcbiAgICB9XG5cbiAgICB0aGlzLm5hbWVzcGFjZSA9IG5hbWVzcGFjZTtcbiAgICB0aGlzLnZhbHVlID0gdmFsdWU7XG59XG5cbkF0dHJpYnV0ZUhvb2sucHJvdG90eXBlLmhvb2sgPSBmdW5jdGlvbiAobm9kZSwgcHJvcCwgcHJldikge1xuICAgIGlmIChwcmV2ICYmIHByZXYudHlwZSA9PT0gJ0F0dHJpYnV0ZUhvb2snICYmXG4gICAgICAgIHByZXYudmFsdWUgPT09IHRoaXMudmFsdWUgJiZcbiAgICAgICAgcHJldi5uYW1lc3BhY2UgPT09IHRoaXMubmFtZXNwYWNlKSB7XG4gICAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBub2RlLnNldEF0dHJpYnV0ZU5TKHRoaXMubmFtZXNwYWNlLCBwcm9wLCB0aGlzLnZhbHVlKTtcbn07XG5cbkF0dHJpYnV0ZUhvb2sucHJvdG90eXBlLnVuaG9vayA9IGZ1bmN0aW9uIChub2RlLCBwcm9wLCBuZXh0KSB7XG4gICAgaWYgKG5leHQgJiYgbmV4dC50eXBlID09PSAnQXR0cmlidXRlSG9vaycgJiZcbiAgICAgICAgbmV4dC5uYW1lc3BhY2UgPT09IHRoaXMubmFtZXNwYWNlKSB7XG4gICAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICB2YXIgY29sb25Qb3NpdGlvbiA9IHByb3AuaW5kZXhPZignOicpO1xuICAgIHZhciBsb2NhbE5hbWUgPSBjb2xvblBvc2l0aW9uID4gLTEgPyBwcm9wLnN1YnN0cihjb2xvblBvc2l0aW9uICsgMSkgOiBwcm9wO1xuICAgIG5vZGUucmVtb3ZlQXR0cmlidXRlTlModGhpcy5uYW1lc3BhY2UsIGxvY2FsTmFtZSk7XG59O1xuXG5BdHRyaWJ1dGVIb29rLnByb3RvdHlwZS50eXBlID0gJ0F0dHJpYnV0ZUhvb2snO1xuIiwiJ3VzZSBzdHJpY3QnO1xuXG52YXIgRXZTdG9yZSA9IHJlcXVpcmUoJ2V2LXN0b3JlJyk7XG5cbm1vZHVsZS5leHBvcnRzID0gRXZIb29rO1xuXG5mdW5jdGlvbiBFdkhvb2sodmFsdWUpIHtcbiAgICBpZiAoISh0aGlzIGluc3RhbmNlb2YgRXZIb29rKSkge1xuICAgICAgICByZXR1cm4gbmV3IEV2SG9vayh2YWx1ZSk7XG4gICAgfVxuXG4gICAgdGhpcy52YWx1ZSA9IHZhbHVlO1xufVxuXG5Fdkhvb2sucHJvdG90eXBlLmhvb2sgPSBmdW5jdGlvbiAobm9kZSwgcHJvcGVydHlOYW1lKSB7XG4gICAgdmFyIGVzID0gRXZTdG9yZShub2RlKTtcbiAgICB2YXIgcHJvcE5hbWUgPSBwcm9wZXJ0eU5hbWUuc3Vic3RyKDMpO1xuXG4gICAgZXNbcHJvcE5hbWVdID0gdGhpcy52YWx1ZTtcbn07XG5cbkV2SG9vay5wcm90b3R5cGUudW5ob29rID0gZnVuY3Rpb24obm9kZSwgcHJvcGVydHlOYW1lKSB7XG4gICAgdmFyIGVzID0gRXZTdG9yZShub2RlKTtcbiAgICB2YXIgcHJvcE5hbWUgPSBwcm9wZXJ0eU5hbWUuc3Vic3RyKDMpO1xuXG4gICAgZXNbcHJvcE5hbWVdID0gdW5kZWZpbmVkO1xufTtcbiIsIid1c2Ugc3RyaWN0JztcblxubW9kdWxlLmV4cG9ydHMgPSBTb2Z0U2V0SG9vaztcblxuZnVuY3Rpb24gU29mdFNldEhvb2sodmFsdWUpIHtcbiAgICBpZiAoISh0aGlzIGluc3RhbmNlb2YgU29mdFNldEhvb2spKSB7XG4gICAgICAgIHJldHVybiBuZXcgU29mdFNldEhvb2sodmFsdWUpO1xuICAgIH1cblxuICAgIHRoaXMudmFsdWUgPSB2YWx1ZTtcbn1cblxuU29mdFNldEhvb2sucHJvdG90eXBlLmhvb2sgPSBmdW5jdGlvbiAobm9kZSwgcHJvcGVydHlOYW1lKSB7XG4gICAgaWYgKG5vZGVbcHJvcGVydHlOYW1lXSAhPT0gdGhpcy52YWx1ZSkge1xuICAgICAgICBub2RlW3Byb3BlcnR5TmFtZV0gPSB0aGlzLnZhbHVlO1xuICAgIH1cbn07XG4iLCIndXNlIHN0cmljdCc7XG5cbnZhciBpc0FycmF5ID0gcmVxdWlyZSgneC1pcy1hcnJheScpO1xuXG52YXIgVk5vZGUgPSByZXF1aXJlKCcuLi92bm9kZS92bm9kZS5qcycpO1xudmFyIFZUZXh0ID0gcmVxdWlyZSgnLi4vdm5vZGUvdnRleHQuanMnKTtcbnZhciBpc1ZOb2RlID0gcmVxdWlyZSgnLi4vdm5vZGUvaXMtdm5vZGUnKTtcbnZhciBpc1ZUZXh0ID0gcmVxdWlyZSgnLi4vdm5vZGUvaXMtdnRleHQnKTtcbnZhciBpc1dpZGdldCA9IHJlcXVpcmUoJy4uL3Zub2RlL2lzLXdpZGdldCcpO1xudmFyIGlzSG9vayA9IHJlcXVpcmUoJy4uL3Zub2RlL2lzLXZob29rJyk7XG52YXIgaXNWVGh1bmsgPSByZXF1aXJlKCcuLi92bm9kZS9pcy10aHVuaycpO1xuXG52YXIgcGFyc2VUYWcgPSByZXF1aXJlKCcuL3BhcnNlLXRhZy5qcycpO1xudmFyIHNvZnRTZXRIb29rID0gcmVxdWlyZSgnLi9ob29rcy9zb2Z0LXNldC1ob29rLmpzJyk7XG52YXIgZXZIb29rID0gcmVxdWlyZSgnLi9ob29rcy9ldi1ob29rLmpzJyk7XG5cbm1vZHVsZS5leHBvcnRzID0gaDtcblxuZnVuY3Rpb24gaCh0YWdOYW1lLCBwcm9wZXJ0aWVzLCBjaGlsZHJlbikge1xuICAgIHZhciBjaGlsZE5vZGVzID0gW107XG4gICAgdmFyIHRhZywgcHJvcHMsIGtleSwgbmFtZXNwYWNlO1xuXG4gICAgaWYgKCFjaGlsZHJlbiAmJiBpc0NoaWxkcmVuKHByb3BlcnRpZXMpKSB7XG4gICAgICAgIGNoaWxkcmVuID0gcHJvcGVydGllcztcbiAgICAgICAgcHJvcHMgPSB7fTtcbiAgICB9XG5cbiAgICBwcm9wcyA9IHByb3BzIHx8IHByb3BlcnRpZXMgfHwge307XG4gICAgdGFnID0gcGFyc2VUYWcodGFnTmFtZSwgcHJvcHMpO1xuXG4gICAgLy8gc3VwcG9ydCBrZXlzXG4gICAgaWYgKHByb3BzLmhhc093blByb3BlcnR5KCdrZXknKSkge1xuICAgICAgICBrZXkgPSBwcm9wcy5rZXk7XG4gICAgICAgIHByb3BzLmtleSA9IHVuZGVmaW5lZDtcbiAgICB9XG5cbiAgICAvLyBzdXBwb3J0IG5hbWVzcGFjZVxuICAgIGlmIChwcm9wcy5oYXNPd25Qcm9wZXJ0eSgnbmFtZXNwYWNlJykpIHtcbiAgICAgICAgbmFtZXNwYWNlID0gcHJvcHMubmFtZXNwYWNlO1xuICAgICAgICBwcm9wcy5uYW1lc3BhY2UgPSB1bmRlZmluZWQ7XG4gICAgfVxuXG4gICAgLy8gZml4IGN1cnNvciBidWdcbiAgICBpZiAodGFnID09PSAnSU5QVVQnICYmXG4gICAgICAgICFuYW1lc3BhY2UgJiZcbiAgICAgICAgcHJvcHMuaGFzT3duUHJvcGVydHkoJ3ZhbHVlJykgJiZcbiAgICAgICAgcHJvcHMudmFsdWUgIT09IHVuZGVmaW5lZCAmJlxuICAgICAgICAhaXNIb29rKHByb3BzLnZhbHVlKVxuICAgICkge1xuICAgICAgICBwcm9wcy52YWx1ZSA9IHNvZnRTZXRIb29rKHByb3BzLnZhbHVlKTtcbiAgICB9XG5cbiAgICB0cmFuc2Zvcm1Qcm9wZXJ0aWVzKHByb3BzKTtcblxuICAgIGlmIChjaGlsZHJlbiAhPT0gdW5kZWZpbmVkICYmIGNoaWxkcmVuICE9PSBudWxsKSB7XG4gICAgICAgIGFkZENoaWxkKGNoaWxkcmVuLCBjaGlsZE5vZGVzLCB0YWcsIHByb3BzKTtcbiAgICB9XG5cblxuICAgIHJldHVybiBuZXcgVk5vZGUodGFnLCBwcm9wcywgY2hpbGROb2Rlcywga2V5LCBuYW1lc3BhY2UpO1xufVxuXG5mdW5jdGlvbiBhZGRDaGlsZChjLCBjaGlsZE5vZGVzLCB0YWcsIHByb3BzKSB7XG4gICAgaWYgKHR5cGVvZiBjID09PSAnc3RyaW5nJykge1xuICAgICAgICBjaGlsZE5vZGVzLnB1c2gobmV3IFZUZXh0KGMpKTtcbiAgICB9IGVsc2UgaWYgKGlzQ2hpbGQoYykpIHtcbiAgICAgICAgY2hpbGROb2Rlcy5wdXNoKGMpO1xuICAgIH0gZWxzZSBpZiAoaXNBcnJheShjKSkge1xuICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IGMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgIGFkZENoaWxkKGNbaV0sIGNoaWxkTm9kZXMsIHRhZywgcHJvcHMpO1xuICAgICAgICB9XG4gICAgfSBlbHNlIGlmIChjID09PSBudWxsIHx8IGMgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICByZXR1cm47XG4gICAgfSBlbHNlIHtcbiAgICAgICAgdGhyb3cgVW5leHBlY3RlZFZpcnR1YWxFbGVtZW50KHtcbiAgICAgICAgICAgIGZvcmVpZ25PYmplY3Q6IGMsXG4gICAgICAgICAgICBwYXJlbnRWbm9kZToge1xuICAgICAgICAgICAgICAgIHRhZ05hbWU6IHRhZyxcbiAgICAgICAgICAgICAgICBwcm9wZXJ0aWVzOiBwcm9wc1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICB9XG59XG5cbmZ1bmN0aW9uIHRyYW5zZm9ybVByb3BlcnRpZXMocHJvcHMpIHtcbiAgICBmb3IgKHZhciBwcm9wTmFtZSBpbiBwcm9wcykge1xuICAgICAgICBpZiAocHJvcHMuaGFzT3duUHJvcGVydHkocHJvcE5hbWUpKSB7XG4gICAgICAgICAgICB2YXIgdmFsdWUgPSBwcm9wc1twcm9wTmFtZV07XG5cbiAgICAgICAgICAgIGlmIChpc0hvb2sodmFsdWUpKSB7XG4gICAgICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmIChwcm9wTmFtZS5zdWJzdHIoMCwgMykgPT09ICdldi0nKSB7XG4gICAgICAgICAgICAgICAgLy8gYWRkIGV2LWZvbyBzdXBwb3J0XG4gICAgICAgICAgICAgICAgcHJvcHNbcHJvcE5hbWVdID0gZXZIb29rKHZhbHVlKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cbn1cblxuZnVuY3Rpb24gaXNDaGlsZCh4KSB7XG4gICAgcmV0dXJuIGlzVk5vZGUoeCkgfHwgaXNWVGV4dCh4KSB8fCBpc1dpZGdldCh4KSB8fCBpc1ZUaHVuayh4KTtcbn1cblxuZnVuY3Rpb24gaXNDaGlsZHJlbih4KSB7XG4gICAgcmV0dXJuIHR5cGVvZiB4ID09PSAnc3RyaW5nJyB8fCBpc0FycmF5KHgpIHx8IGlzQ2hpbGQoeCk7XG59XG5cbmZ1bmN0aW9uIFVuZXhwZWN0ZWRWaXJ0dWFsRWxlbWVudChkYXRhKSB7XG4gICAgdmFyIGVyciA9IG5ldyBFcnJvcigpO1xuXG4gICAgZXJyLnR5cGUgPSAndmlydHVhbC1oeXBlcnNjcmlwdC51bmV4cGVjdGVkLnZpcnR1YWwtZWxlbWVudCc7XG4gICAgZXJyLm1lc3NhZ2UgPSAnVW5leHBlY3RlZCB2aXJ0dWFsIGNoaWxkIHBhc3NlZCB0byBoKCkuXFxuJyArXG4gICAgICAgICdFeHBlY3RlZCBhIFZOb2RlIC8gVnRodW5rIC8gVldpZGdldCAvIHN0cmluZyBidXQ6XFxuJyArXG4gICAgICAgICdnb3Q6XFxuJyArXG4gICAgICAgIGVycm9yU3RyaW5nKGRhdGEuZm9yZWlnbk9iamVjdCkgK1xuICAgICAgICAnLlxcbicgK1xuICAgICAgICAnVGhlIHBhcmVudCB2bm9kZSBpczpcXG4nICtcbiAgICAgICAgZXJyb3JTdHJpbmcoZGF0YS5wYXJlbnRWbm9kZSlcbiAgICAgICAgJ1xcbicgK1xuICAgICAgICAnU3VnZ2VzdGVkIGZpeDogY2hhbmdlIHlvdXIgYGgoLi4uLCBbIC4uLiBdKWAgY2FsbHNpdGUuJztcbiAgICBlcnIuZm9yZWlnbk9iamVjdCA9IGRhdGEuZm9yZWlnbk9iamVjdDtcbiAgICBlcnIucGFyZW50Vm5vZGUgPSBkYXRhLnBhcmVudFZub2RlO1xuXG4gICAgcmV0dXJuIGVycjtcbn1cblxuZnVuY3Rpb24gZXJyb3JTdHJpbmcob2JqKSB7XG4gICAgdHJ5IHtcbiAgICAgICAgcmV0dXJuIEpTT04uc3RyaW5naWZ5KG9iaiwgbnVsbCwgJyAgICAnKTtcbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgIHJldHVybiBTdHJpbmcob2JqKTtcbiAgICB9XG59XG4iLCIndXNlIHN0cmljdCc7XG5cbnZhciBzcGxpdCA9IHJlcXVpcmUoJ2Jyb3dzZXItc3BsaXQnKTtcblxudmFyIGNsYXNzSWRTcGxpdCA9IC8oW1xcLiNdP1thLXpBLVowLTlfOi1dKykvO1xudmFyIG5vdENsYXNzSWQgPSAvXlxcLnwjLztcblxubW9kdWxlLmV4cG9ydHMgPSBwYXJzZVRhZztcblxuZnVuY3Rpb24gcGFyc2VUYWcodGFnLCBwcm9wcykge1xuICAgIGlmICghdGFnKSB7XG4gICAgICAgIHJldHVybiAnRElWJztcbiAgICB9XG5cbiAgICB2YXIgbm9JZCA9ICEocHJvcHMuaGFzT3duUHJvcGVydHkoJ2lkJykpO1xuXG4gICAgdmFyIHRhZ1BhcnRzID0gc3BsaXQodGFnLCBjbGFzc0lkU3BsaXQpO1xuICAgIHZhciB0YWdOYW1lID0gbnVsbDtcblxuICAgIGlmIChub3RDbGFzc0lkLnRlc3QodGFnUGFydHNbMV0pKSB7XG4gICAgICAgIHRhZ05hbWUgPSAnRElWJztcbiAgICB9XG5cbiAgICB2YXIgY2xhc3NlcywgcGFydCwgdHlwZSwgaTtcblxuICAgIGZvciAoaSA9IDA7IGkgPCB0YWdQYXJ0cy5sZW5ndGg7IGkrKykge1xuICAgICAgICBwYXJ0ID0gdGFnUGFydHNbaV07XG5cbiAgICAgICAgaWYgKCFwYXJ0KSB7XG4gICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgfVxuXG4gICAgICAgIHR5cGUgPSBwYXJ0LmNoYXJBdCgwKTtcblxuICAgICAgICBpZiAoIXRhZ05hbWUpIHtcbiAgICAgICAgICAgIHRhZ05hbWUgPSBwYXJ0O1xuICAgICAgICB9IGVsc2UgaWYgKHR5cGUgPT09ICcuJykge1xuICAgICAgICAgICAgY2xhc3NlcyA9IGNsYXNzZXMgfHwgW107XG4gICAgICAgICAgICBjbGFzc2VzLnB1c2gocGFydC5zdWJzdHJpbmcoMSwgcGFydC5sZW5ndGgpKTtcbiAgICAgICAgfSBlbHNlIGlmICh0eXBlID09PSAnIycgJiYgbm9JZCkge1xuICAgICAgICAgICAgcHJvcHMuaWQgPSBwYXJ0LnN1YnN0cmluZygxLCBwYXJ0Lmxlbmd0aCk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBpZiAoY2xhc3Nlcykge1xuICAgICAgICBpZiAocHJvcHMuY2xhc3NOYW1lKSB7XG4gICAgICAgICAgICBjbGFzc2VzLnB1c2gocHJvcHMuY2xhc3NOYW1lKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHByb3BzLmNsYXNzTmFtZSA9IGNsYXNzZXMuam9pbignICcpO1xuICAgIH1cblxuICAgIHJldHVybiBwcm9wcy5uYW1lc3BhY2UgPyB0YWdOYW1lIDogdGFnTmFtZS50b1VwcGVyQ2FzZSgpO1xufVxuIiwiJ3VzZSBzdHJpY3QnO1xuXG52YXIgREVGQVVMVF9OQU1FU1BBQ0UgPSBudWxsO1xudmFyIEVWX05BTUVTUEFDRSA9ICdodHRwOi8vd3d3LnczLm9yZy8yMDAxL3htbC1ldmVudHMnO1xudmFyIFhMSU5LX05BTUVTUEFDRSA9ICdodHRwOi8vd3d3LnczLm9yZy8xOTk5L3hsaW5rJztcbnZhciBYTUxfTkFNRVNQQUNFID0gJ2h0dHA6Ly93d3cudzMub3JnL1hNTC8xOTk4L25hbWVzcGFjZSc7XG5cbi8vIGh0dHA6Ly93d3cudzMub3JnL1RSL1NWR1RpbnkxMi9hdHRyaWJ1dGVUYWJsZS5odG1sXG4vLyBodHRwOi8vd3d3LnczLm9yZy9UUi9TVkcvYXR0aW5kZXguaHRtbFxudmFyIFNWR19QUk9QRVJUSUVTID0ge1xuICAgICdhYm91dCc6IERFRkFVTFRfTkFNRVNQQUNFLFxuICAgICdhY2NlbnQtaGVpZ2h0JzogREVGQVVMVF9OQU1FU1BBQ0UsXG4gICAgJ2FjY3VtdWxhdGUnOiBERUZBVUxUX05BTUVTUEFDRSxcbiAgICAnYWRkaXRpdmUnOiBERUZBVUxUX05BTUVTUEFDRSxcbiAgICAnYWxpZ25tZW50LWJhc2VsaW5lJzogREVGQVVMVF9OQU1FU1BBQ0UsXG4gICAgJ2FscGhhYmV0aWMnOiBERUZBVUxUX05BTUVTUEFDRSxcbiAgICAnYW1wbGl0dWRlJzogREVGQVVMVF9OQU1FU1BBQ0UsXG4gICAgJ2FyYWJpYy1mb3JtJzogREVGQVVMVF9OQU1FU1BBQ0UsXG4gICAgJ2FzY2VudCc6IERFRkFVTFRfTkFNRVNQQUNFLFxuICAgICdhdHRyaWJ1dGVOYW1lJzogREVGQVVMVF9OQU1FU1BBQ0UsXG4gICAgJ2F0dHJpYnV0ZVR5cGUnOiBERUZBVUxUX05BTUVTUEFDRSxcbiAgICAnYXppbXV0aCc6IERFRkFVTFRfTkFNRVNQQUNFLFxuICAgICdiYW5kd2lkdGgnOiBERUZBVUxUX05BTUVTUEFDRSxcbiAgICAnYmFzZUZyZXF1ZW5jeSc6IERFRkFVTFRfTkFNRVNQQUNFLFxuICAgICdiYXNlUHJvZmlsZSc6IERFRkFVTFRfTkFNRVNQQUNFLFxuICAgICdiYXNlbGluZS1zaGlmdCc6IERFRkFVTFRfTkFNRVNQQUNFLFxuICAgICdiYm94JzogREVGQVVMVF9OQU1FU1BBQ0UsXG4gICAgJ2JlZ2luJzogREVGQVVMVF9OQU1FU1BBQ0UsXG4gICAgJ2JpYXMnOiBERUZBVUxUX05BTUVTUEFDRSxcbiAgICAnYnknOiBERUZBVUxUX05BTUVTUEFDRSxcbiAgICAnY2FsY01vZGUnOiBERUZBVUxUX05BTUVTUEFDRSxcbiAgICAnY2FwLWhlaWdodCc6IERFRkFVTFRfTkFNRVNQQUNFLFxuICAgICdjbGFzcyc6IERFRkFVTFRfTkFNRVNQQUNFLFxuICAgICdjbGlwJzogREVGQVVMVF9OQU1FU1BBQ0UsXG4gICAgJ2NsaXAtcGF0aCc6IERFRkFVTFRfTkFNRVNQQUNFLFxuICAgICdjbGlwLXJ1bGUnOiBERUZBVUxUX05BTUVTUEFDRSxcbiAgICAnY2xpcFBhdGhVbml0cyc6IERFRkFVTFRfTkFNRVNQQUNFLFxuICAgICdjb2xvcic6IERFRkFVTFRfTkFNRVNQQUNFLFxuICAgICdjb2xvci1pbnRlcnBvbGF0aW9uJzogREVGQVVMVF9OQU1FU1BBQ0UsXG4gICAgJ2NvbG9yLWludGVycG9sYXRpb24tZmlsdGVycyc6IERFRkFVTFRfTkFNRVNQQUNFLFxuICAgICdjb2xvci1wcm9maWxlJzogREVGQVVMVF9OQU1FU1BBQ0UsXG4gICAgJ2NvbG9yLXJlbmRlcmluZyc6IERFRkFVTFRfTkFNRVNQQUNFLFxuICAgICdjb250ZW50JzogREVGQVVMVF9OQU1FU1BBQ0UsXG4gICAgJ2NvbnRlbnRTY3JpcHRUeXBlJzogREVGQVVMVF9OQU1FU1BBQ0UsXG4gICAgJ2NvbnRlbnRTdHlsZVR5cGUnOiBERUZBVUxUX05BTUVTUEFDRSxcbiAgICAnY3Vyc29yJzogREVGQVVMVF9OQU1FU1BBQ0UsXG4gICAgJ2N4JzogREVGQVVMVF9OQU1FU1BBQ0UsXG4gICAgJ2N5JzogREVGQVVMVF9OQU1FU1BBQ0UsXG4gICAgJ2QnOiBERUZBVUxUX05BTUVTUEFDRSxcbiAgICAnZGF0YXR5cGUnOiBERUZBVUxUX05BTUVTUEFDRSxcbiAgICAnZGVmYXVsdEFjdGlvbic6IERFRkFVTFRfTkFNRVNQQUNFLFxuICAgICdkZXNjZW50JzogREVGQVVMVF9OQU1FU1BBQ0UsXG4gICAgJ2RpZmZ1c2VDb25zdGFudCc6IERFRkFVTFRfTkFNRVNQQUNFLFxuICAgICdkaXJlY3Rpb24nOiBERUZBVUxUX05BTUVTUEFDRSxcbiAgICAnZGlzcGxheSc6IERFRkFVTFRfTkFNRVNQQUNFLFxuICAgICdkaXZpc29yJzogREVGQVVMVF9OQU1FU1BBQ0UsXG4gICAgJ2RvbWluYW50LWJhc2VsaW5lJzogREVGQVVMVF9OQU1FU1BBQ0UsXG4gICAgJ2R1cic6IERFRkFVTFRfTkFNRVNQQUNFLFxuICAgICdkeCc6IERFRkFVTFRfTkFNRVNQQUNFLFxuICAgICdkeSc6IERFRkFVTFRfTkFNRVNQQUNFLFxuICAgICdlZGdlTW9kZSc6IERFRkFVTFRfTkFNRVNQQUNFLFxuICAgICdlZGl0YWJsZSc6IERFRkFVTFRfTkFNRVNQQUNFLFxuICAgICdlbGV2YXRpb24nOiBERUZBVUxUX05BTUVTUEFDRSxcbiAgICAnZW5hYmxlLWJhY2tncm91bmQnOiBERUZBVUxUX05BTUVTUEFDRSxcbiAgICAnZW5kJzogREVGQVVMVF9OQU1FU1BBQ0UsXG4gICAgJ2V2OmV2ZW50JzogRVZfTkFNRVNQQUNFLFxuICAgICdldmVudCc6IERFRkFVTFRfTkFNRVNQQUNFLFxuICAgICdleHBvbmVudCc6IERFRkFVTFRfTkFNRVNQQUNFLFxuICAgICdleHRlcm5hbFJlc291cmNlc1JlcXVpcmVkJzogREVGQVVMVF9OQU1FU1BBQ0UsXG4gICAgJ2ZpbGwnOiBERUZBVUxUX05BTUVTUEFDRSxcbiAgICAnZmlsbC1vcGFjaXR5JzogREVGQVVMVF9OQU1FU1BBQ0UsXG4gICAgJ2ZpbGwtcnVsZSc6IERFRkFVTFRfTkFNRVNQQUNFLFxuICAgICdmaWx0ZXInOiBERUZBVUxUX05BTUVTUEFDRSxcbiAgICAnZmlsdGVyUmVzJzogREVGQVVMVF9OQU1FU1BBQ0UsXG4gICAgJ2ZpbHRlclVuaXRzJzogREVGQVVMVF9OQU1FU1BBQ0UsXG4gICAgJ2Zsb29kLWNvbG9yJzogREVGQVVMVF9OQU1FU1BBQ0UsXG4gICAgJ2Zsb29kLW9wYWNpdHknOiBERUZBVUxUX05BTUVTUEFDRSxcbiAgICAnZm9jdXNIaWdobGlnaHQnOiBERUZBVUxUX05BTUVTUEFDRSxcbiAgICAnZm9jdXNhYmxlJzogREVGQVVMVF9OQU1FU1BBQ0UsXG4gICAgJ2ZvbnQtZmFtaWx5JzogREVGQVVMVF9OQU1FU1BBQ0UsXG4gICAgJ2ZvbnQtc2l6ZSc6IERFRkFVTFRfTkFNRVNQQUNFLFxuICAgICdmb250LXNpemUtYWRqdXN0JzogREVGQVVMVF9OQU1FU1BBQ0UsXG4gICAgJ2ZvbnQtc3RyZXRjaCc6IERFRkFVTFRfTkFNRVNQQUNFLFxuICAgICdmb250LXN0eWxlJzogREVGQVVMVF9OQU1FU1BBQ0UsXG4gICAgJ2ZvbnQtdmFyaWFudCc6IERFRkFVTFRfTkFNRVNQQUNFLFxuICAgICdmb250LXdlaWdodCc6IERFRkFVTFRfTkFNRVNQQUNFLFxuICAgICdmb3JtYXQnOiBERUZBVUxUX05BTUVTUEFDRSxcbiAgICAnZnJvbSc6IERFRkFVTFRfTkFNRVNQQUNFLFxuICAgICdmeCc6IERFRkFVTFRfTkFNRVNQQUNFLFxuICAgICdmeSc6IERFRkFVTFRfTkFNRVNQQUNFLFxuICAgICdnMSc6IERFRkFVTFRfTkFNRVNQQUNFLFxuICAgICdnMic6IERFRkFVTFRfTkFNRVNQQUNFLFxuICAgICdnbHlwaC1uYW1lJzogREVGQVVMVF9OQU1FU1BBQ0UsXG4gICAgJ2dseXBoLW9yaWVudGF0aW9uLWhvcml6b250YWwnOiBERUZBVUxUX05BTUVTUEFDRSxcbiAgICAnZ2x5cGgtb3JpZW50YXRpb24tdmVydGljYWwnOiBERUZBVUxUX05BTUVTUEFDRSxcbiAgICAnZ2x5cGhSZWYnOiBERUZBVUxUX05BTUVTUEFDRSxcbiAgICAnZ3JhZGllbnRUcmFuc2Zvcm0nOiBERUZBVUxUX05BTUVTUEFDRSxcbiAgICAnZ3JhZGllbnRVbml0cyc6IERFRkFVTFRfTkFNRVNQQUNFLFxuICAgICdoYW5kbGVyJzogREVGQVVMVF9OQU1FU1BBQ0UsXG4gICAgJ2hhbmdpbmcnOiBERUZBVUxUX05BTUVTUEFDRSxcbiAgICAnaGVpZ2h0JzogREVGQVVMVF9OQU1FU1BBQ0UsXG4gICAgJ2hvcml6LWFkdi14JzogREVGQVVMVF9OQU1FU1BBQ0UsXG4gICAgJ2hvcml6LW9yaWdpbi14JzogREVGQVVMVF9OQU1FU1BBQ0UsXG4gICAgJ2hvcml6LW9yaWdpbi15JzogREVGQVVMVF9OQU1FU1BBQ0UsXG4gICAgJ2lkJzogREVGQVVMVF9OQU1FU1BBQ0UsXG4gICAgJ2lkZW9ncmFwaGljJzogREVGQVVMVF9OQU1FU1BBQ0UsXG4gICAgJ2ltYWdlLXJlbmRlcmluZyc6IERFRkFVTFRfTkFNRVNQQUNFLFxuICAgICdpbic6IERFRkFVTFRfTkFNRVNQQUNFLFxuICAgICdpbjInOiBERUZBVUxUX05BTUVTUEFDRSxcbiAgICAnaW5pdGlhbFZpc2liaWxpdHknOiBERUZBVUxUX05BTUVTUEFDRSxcbiAgICAnaW50ZXJjZXB0JzogREVGQVVMVF9OQU1FU1BBQ0UsXG4gICAgJ2snOiBERUZBVUxUX05BTUVTUEFDRSxcbiAgICAnazEnOiBERUZBVUxUX05BTUVTUEFDRSxcbiAgICAnazInOiBERUZBVUxUX05BTUVTUEFDRSxcbiAgICAnazMnOiBERUZBVUxUX05BTUVTUEFDRSxcbiAgICAnazQnOiBERUZBVUxUX05BTUVTUEFDRSxcbiAgICAna2VybmVsTWF0cml4JzogREVGQVVMVF9OQU1FU1BBQ0UsXG4gICAgJ2tlcm5lbFVuaXRMZW5ndGgnOiBERUZBVUxUX05BTUVTUEFDRSxcbiAgICAna2VybmluZyc6IERFRkFVTFRfTkFNRVNQQUNFLFxuICAgICdrZXlQb2ludHMnOiBERUZBVUxUX05BTUVTUEFDRSxcbiAgICAna2V5U3BsaW5lcyc6IERFRkFVTFRfTkFNRVNQQUNFLFxuICAgICdrZXlUaW1lcyc6IERFRkFVTFRfTkFNRVNQQUNFLFxuICAgICdsYW5nJzogREVGQVVMVF9OQU1FU1BBQ0UsXG4gICAgJ2xlbmd0aEFkanVzdCc6IERFRkFVTFRfTkFNRVNQQUNFLFxuICAgICdsZXR0ZXItc3BhY2luZyc6IERFRkFVTFRfTkFNRVNQQUNFLFxuICAgICdsaWdodGluZy1jb2xvcic6IERFRkFVTFRfTkFNRVNQQUNFLFxuICAgICdsaW1pdGluZ0NvbmVBbmdsZSc6IERFRkFVTFRfTkFNRVNQQUNFLFxuICAgICdsb2NhbCc6IERFRkFVTFRfTkFNRVNQQUNFLFxuICAgICdtYXJrZXItZW5kJzogREVGQVVMVF9OQU1FU1BBQ0UsXG4gICAgJ21hcmtlci1taWQnOiBERUZBVUxUX05BTUVTUEFDRSxcbiAgICAnbWFya2VyLXN0YXJ0JzogREVGQVVMVF9OQU1FU1BBQ0UsXG4gICAgJ21hcmtlckhlaWdodCc6IERFRkFVTFRfTkFNRVNQQUNFLFxuICAgICdtYXJrZXJVbml0cyc6IERFRkFVTFRfTkFNRVNQQUNFLFxuICAgICdtYXJrZXJXaWR0aCc6IERFRkFVTFRfTkFNRVNQQUNFLFxuICAgICdtYXNrJzogREVGQVVMVF9OQU1FU1BBQ0UsXG4gICAgJ21hc2tDb250ZW50VW5pdHMnOiBERUZBVUxUX05BTUVTUEFDRSxcbiAgICAnbWFza1VuaXRzJzogREVGQVVMVF9OQU1FU1BBQ0UsXG4gICAgJ21hdGhlbWF0aWNhbCc6IERFRkFVTFRfTkFNRVNQQUNFLFxuICAgICdtYXgnOiBERUZBVUxUX05BTUVTUEFDRSxcbiAgICAnbWVkaWEnOiBERUZBVUxUX05BTUVTUEFDRSxcbiAgICAnbWVkaWFDaGFyYWN0ZXJFbmNvZGluZyc6IERFRkFVTFRfTkFNRVNQQUNFLFxuICAgICdtZWRpYUNvbnRlbnRFbmNvZGluZ3MnOiBERUZBVUxUX05BTUVTUEFDRSxcbiAgICAnbWVkaWFTaXplJzogREVGQVVMVF9OQU1FU1BBQ0UsXG4gICAgJ21lZGlhVGltZSc6IERFRkFVTFRfTkFNRVNQQUNFLFxuICAgICdtZXRob2QnOiBERUZBVUxUX05BTUVTUEFDRSxcbiAgICAnbWluJzogREVGQVVMVF9OQU1FU1BBQ0UsXG4gICAgJ21vZGUnOiBERUZBVUxUX05BTUVTUEFDRSxcbiAgICAnbmFtZSc6IERFRkFVTFRfTkFNRVNQQUNFLFxuICAgICduYXYtZG93bic6IERFRkFVTFRfTkFNRVNQQUNFLFxuICAgICduYXYtZG93bi1sZWZ0JzogREVGQVVMVF9OQU1FU1BBQ0UsXG4gICAgJ25hdi1kb3duLXJpZ2h0JzogREVGQVVMVF9OQU1FU1BBQ0UsXG4gICAgJ25hdi1sZWZ0JzogREVGQVVMVF9OQU1FU1BBQ0UsXG4gICAgJ25hdi1uZXh0JzogREVGQVVMVF9OQU1FU1BBQ0UsXG4gICAgJ25hdi1wcmV2JzogREVGQVVMVF9OQU1FU1BBQ0UsXG4gICAgJ25hdi1yaWdodCc6IERFRkFVTFRfTkFNRVNQQUNFLFxuICAgICduYXYtdXAnOiBERUZBVUxUX05BTUVTUEFDRSxcbiAgICAnbmF2LXVwLWxlZnQnOiBERUZBVUxUX05BTUVTUEFDRSxcbiAgICAnbmF2LXVwLXJpZ2h0JzogREVGQVVMVF9OQU1FU1BBQ0UsXG4gICAgJ251bU9jdGF2ZXMnOiBERUZBVUxUX05BTUVTUEFDRSxcbiAgICAnb2JzZXJ2ZXInOiBERUZBVUxUX05BTUVTUEFDRSxcbiAgICAnb2Zmc2V0JzogREVGQVVMVF9OQU1FU1BBQ0UsXG4gICAgJ29wYWNpdHknOiBERUZBVUxUX05BTUVTUEFDRSxcbiAgICAnb3BlcmF0b3InOiBERUZBVUxUX05BTUVTUEFDRSxcbiAgICAnb3JkZXInOiBERUZBVUxUX05BTUVTUEFDRSxcbiAgICAnb3JpZW50JzogREVGQVVMVF9OQU1FU1BBQ0UsXG4gICAgJ29yaWVudGF0aW9uJzogREVGQVVMVF9OQU1FU1BBQ0UsXG4gICAgJ29yaWdpbic6IERFRkFVTFRfTkFNRVNQQUNFLFxuICAgICdvdmVyZmxvdyc6IERFRkFVTFRfTkFNRVNQQUNFLFxuICAgICdvdmVybGF5JzogREVGQVVMVF9OQU1FU1BBQ0UsXG4gICAgJ292ZXJsaW5lLXBvc2l0aW9uJzogREVGQVVMVF9OQU1FU1BBQ0UsXG4gICAgJ292ZXJsaW5lLXRoaWNrbmVzcyc6IERFRkFVTFRfTkFNRVNQQUNFLFxuICAgICdwYW5vc2UtMSc6IERFRkFVTFRfTkFNRVNQQUNFLFxuICAgICdwYXRoJzogREVGQVVMVF9OQU1FU1BBQ0UsXG4gICAgJ3BhdGhMZW5ndGgnOiBERUZBVUxUX05BTUVTUEFDRSxcbiAgICAncGF0dGVybkNvbnRlbnRVbml0cyc6IERFRkFVTFRfTkFNRVNQQUNFLFxuICAgICdwYXR0ZXJuVHJhbnNmb3JtJzogREVGQVVMVF9OQU1FU1BBQ0UsXG4gICAgJ3BhdHRlcm5Vbml0cyc6IERFRkFVTFRfTkFNRVNQQUNFLFxuICAgICdwaGFzZSc6IERFRkFVTFRfTkFNRVNQQUNFLFxuICAgICdwbGF5YmFja09yZGVyJzogREVGQVVMVF9OQU1FU1BBQ0UsXG4gICAgJ3BvaW50ZXItZXZlbnRzJzogREVGQVVMVF9OQU1FU1BBQ0UsXG4gICAgJ3BvaW50cyc6IERFRkFVTFRfTkFNRVNQQUNFLFxuICAgICdwb2ludHNBdFgnOiBERUZBVUxUX05BTUVTUEFDRSxcbiAgICAncG9pbnRzQXRZJzogREVGQVVMVF9OQU1FU1BBQ0UsXG4gICAgJ3BvaW50c0F0Wic6IERFRkFVTFRfTkFNRVNQQUNFLFxuICAgICdwcmVzZXJ2ZUFscGhhJzogREVGQVVMVF9OQU1FU1BBQ0UsXG4gICAgJ3ByZXNlcnZlQXNwZWN0UmF0aW8nOiBERUZBVUxUX05BTUVTUEFDRSxcbiAgICAncHJpbWl0aXZlVW5pdHMnOiBERUZBVUxUX05BTUVTUEFDRSxcbiAgICAncHJvcGFnYXRlJzogREVGQVVMVF9OQU1FU1BBQ0UsXG4gICAgJ3Byb3BlcnR5JzogREVGQVVMVF9OQU1FU1BBQ0UsXG4gICAgJ3InOiBERUZBVUxUX05BTUVTUEFDRSxcbiAgICAncmFkaXVzJzogREVGQVVMVF9OQU1FU1BBQ0UsXG4gICAgJ3JlZlgnOiBERUZBVUxUX05BTUVTUEFDRSxcbiAgICAncmVmWSc6IERFRkFVTFRfTkFNRVNQQUNFLFxuICAgICdyZWwnOiBERUZBVUxUX05BTUVTUEFDRSxcbiAgICAncmVuZGVyaW5nLWludGVudCc6IERFRkFVTFRfTkFNRVNQQUNFLFxuICAgICdyZXBlYXRDb3VudCc6IERFRkFVTFRfTkFNRVNQQUNFLFxuICAgICdyZXBlYXREdXInOiBERUZBVUxUX05BTUVTUEFDRSxcbiAgICAncmVxdWlyZWRFeHRlbnNpb25zJzogREVGQVVMVF9OQU1FU1BBQ0UsXG4gICAgJ3JlcXVpcmVkRmVhdHVyZXMnOiBERUZBVUxUX05BTUVTUEFDRSxcbiAgICAncmVxdWlyZWRGb250cyc6IERFRkFVTFRfTkFNRVNQQUNFLFxuICAgICdyZXF1aXJlZEZvcm1hdHMnOiBERUZBVUxUX05BTUVTUEFDRSxcbiAgICAncmVzb3VyY2UnOiBERUZBVUxUX05BTUVTUEFDRSxcbiAgICAncmVzdGFydCc6IERFRkFVTFRfTkFNRVNQQUNFLFxuICAgICdyZXN1bHQnOiBERUZBVUxUX05BTUVTUEFDRSxcbiAgICAncmV2JzogREVGQVVMVF9OQU1FU1BBQ0UsXG4gICAgJ3JvbGUnOiBERUZBVUxUX05BTUVTUEFDRSxcbiAgICAncm90YXRlJzogREVGQVVMVF9OQU1FU1BBQ0UsXG4gICAgJ3J4JzogREVGQVVMVF9OQU1FU1BBQ0UsXG4gICAgJ3J5JzogREVGQVVMVF9OQU1FU1BBQ0UsXG4gICAgJ3NjYWxlJzogREVGQVVMVF9OQU1FU1BBQ0UsXG4gICAgJ3NlZWQnOiBERUZBVUxUX05BTUVTUEFDRSxcbiAgICAnc2hhcGUtcmVuZGVyaW5nJzogREVGQVVMVF9OQU1FU1BBQ0UsXG4gICAgJ3Nsb3BlJzogREVGQVVMVF9OQU1FU1BBQ0UsXG4gICAgJ3NuYXBzaG90VGltZSc6IERFRkFVTFRfTkFNRVNQQUNFLFxuICAgICdzcGFjaW5nJzogREVGQVVMVF9OQU1FU1BBQ0UsXG4gICAgJ3NwZWN1bGFyQ29uc3RhbnQnOiBERUZBVUxUX05BTUVTUEFDRSxcbiAgICAnc3BlY3VsYXJFeHBvbmVudCc6IERFRkFVTFRfTkFNRVNQQUNFLFxuICAgICdzcHJlYWRNZXRob2QnOiBERUZBVUxUX05BTUVTUEFDRSxcbiAgICAnc3RhcnRPZmZzZXQnOiBERUZBVUxUX05BTUVTUEFDRSxcbiAgICAnc3RkRGV2aWF0aW9uJzogREVGQVVMVF9OQU1FU1BBQ0UsXG4gICAgJ3N0ZW1oJzogREVGQVVMVF9OQU1FU1BBQ0UsXG4gICAgJ3N0ZW12JzogREVGQVVMVF9OQU1FU1BBQ0UsXG4gICAgJ3N0aXRjaFRpbGVzJzogREVGQVVMVF9OQU1FU1BBQ0UsXG4gICAgJ3N0b3AtY29sb3InOiBERUZBVUxUX05BTUVTUEFDRSxcbiAgICAnc3RvcC1vcGFjaXR5JzogREVGQVVMVF9OQU1FU1BBQ0UsXG4gICAgJ3N0cmlrZXRocm91Z2gtcG9zaXRpb24nOiBERUZBVUxUX05BTUVTUEFDRSxcbiAgICAnc3RyaWtldGhyb3VnaC10aGlja25lc3MnOiBERUZBVUxUX05BTUVTUEFDRSxcbiAgICAnc3RyaW5nJzogREVGQVVMVF9OQU1FU1BBQ0UsXG4gICAgJ3N0cm9rZSc6IERFRkFVTFRfTkFNRVNQQUNFLFxuICAgICdzdHJva2UtZGFzaGFycmF5JzogREVGQVVMVF9OQU1FU1BBQ0UsXG4gICAgJ3N0cm9rZS1kYXNob2Zmc2V0JzogREVGQVVMVF9OQU1FU1BBQ0UsXG4gICAgJ3N0cm9rZS1saW5lY2FwJzogREVGQVVMVF9OQU1FU1BBQ0UsXG4gICAgJ3N0cm9rZS1saW5lam9pbic6IERFRkFVTFRfTkFNRVNQQUNFLFxuICAgICdzdHJva2UtbWl0ZXJsaW1pdCc6IERFRkFVTFRfTkFNRVNQQUNFLFxuICAgICdzdHJva2Utb3BhY2l0eSc6IERFRkFVTFRfTkFNRVNQQUNFLFxuICAgICdzdHJva2Utd2lkdGgnOiBERUZBVUxUX05BTUVTUEFDRSxcbiAgICAnc3VyZmFjZVNjYWxlJzogREVGQVVMVF9OQU1FU1BBQ0UsXG4gICAgJ3N5bmNCZWhhdmlvcic6IERFRkFVTFRfTkFNRVNQQUNFLFxuICAgICdzeW5jQmVoYXZpb3JEZWZhdWx0JzogREVGQVVMVF9OQU1FU1BBQ0UsXG4gICAgJ3N5bmNNYXN0ZXInOiBERUZBVUxUX05BTUVTUEFDRSxcbiAgICAnc3luY1RvbGVyYW5jZSc6IERFRkFVTFRfTkFNRVNQQUNFLFxuICAgICdzeW5jVG9sZXJhbmNlRGVmYXVsdCc6IERFRkFVTFRfTkFNRVNQQUNFLFxuICAgICdzeXN0ZW1MYW5ndWFnZSc6IERFRkFVTFRfTkFNRVNQQUNFLFxuICAgICd0YWJsZVZhbHVlcyc6IERFRkFVTFRfTkFNRVNQQUNFLFxuICAgICd0YXJnZXQnOiBERUZBVUxUX05BTUVTUEFDRSxcbiAgICAndGFyZ2V0WCc6IERFRkFVTFRfTkFNRVNQQUNFLFxuICAgICd0YXJnZXRZJzogREVGQVVMVF9OQU1FU1BBQ0UsXG4gICAgJ3RleHQtYW5jaG9yJzogREVGQVVMVF9OQU1FU1BBQ0UsXG4gICAgJ3RleHQtZGVjb3JhdGlvbic6IERFRkFVTFRfTkFNRVNQQUNFLFxuICAgICd0ZXh0LXJlbmRlcmluZyc6IERFRkFVTFRfTkFNRVNQQUNFLFxuICAgICd0ZXh0TGVuZ3RoJzogREVGQVVMVF9OQU1FU1BBQ0UsXG4gICAgJ3RpbWVsaW5lQmVnaW4nOiBERUZBVUxUX05BTUVTUEFDRSxcbiAgICAndGl0bGUnOiBERUZBVUxUX05BTUVTUEFDRSxcbiAgICAndG8nOiBERUZBVUxUX05BTUVTUEFDRSxcbiAgICAndHJhbnNmb3JtJzogREVGQVVMVF9OQU1FU1BBQ0UsXG4gICAgJ3RyYW5zZm9ybUJlaGF2aW9yJzogREVGQVVMVF9OQU1FU1BBQ0UsXG4gICAgJ3R5cGUnOiBERUZBVUxUX05BTUVTUEFDRSxcbiAgICAndHlwZW9mJzogREVGQVVMVF9OQU1FU1BBQ0UsXG4gICAgJ3UxJzogREVGQVVMVF9OQU1FU1BBQ0UsXG4gICAgJ3UyJzogREVGQVVMVF9OQU1FU1BBQ0UsXG4gICAgJ3VuZGVybGluZS1wb3NpdGlvbic6IERFRkFVTFRfTkFNRVNQQUNFLFxuICAgICd1bmRlcmxpbmUtdGhpY2tuZXNzJzogREVGQVVMVF9OQU1FU1BBQ0UsXG4gICAgJ3VuaWNvZGUnOiBERUZBVUxUX05BTUVTUEFDRSxcbiAgICAndW5pY29kZS1iaWRpJzogREVGQVVMVF9OQU1FU1BBQ0UsXG4gICAgJ3VuaWNvZGUtcmFuZ2UnOiBERUZBVUxUX05BTUVTUEFDRSxcbiAgICAndW5pdHMtcGVyLWVtJzogREVGQVVMVF9OQU1FU1BBQ0UsXG4gICAgJ3YtYWxwaGFiZXRpYyc6IERFRkFVTFRfTkFNRVNQQUNFLFxuICAgICd2LWhhbmdpbmcnOiBERUZBVUxUX05BTUVTUEFDRSxcbiAgICAndi1pZGVvZ3JhcGhpYyc6IERFRkFVTFRfTkFNRVNQQUNFLFxuICAgICd2LW1hdGhlbWF0aWNhbCc6IERFRkFVTFRfTkFNRVNQQUNFLFxuICAgICd2YWx1ZXMnOiBERUZBVUxUX05BTUVTUEFDRSxcbiAgICAndmVyc2lvbic6IERFRkFVTFRfTkFNRVNQQUNFLFxuICAgICd2ZXJ0LWFkdi15JzogREVGQVVMVF9OQU1FU1BBQ0UsXG4gICAgJ3ZlcnQtb3JpZ2luLXgnOiBERUZBVUxUX05BTUVTUEFDRSxcbiAgICAndmVydC1vcmlnaW4teSc6IERFRkFVTFRfTkFNRVNQQUNFLFxuICAgICd2aWV3Qm94JzogREVGQVVMVF9OQU1FU1BBQ0UsXG4gICAgJ3ZpZXdUYXJnZXQnOiBERUZBVUxUX05BTUVTUEFDRSxcbiAgICAndmlzaWJpbGl0eSc6IERFRkFVTFRfTkFNRVNQQUNFLFxuICAgICd3aWR0aCc6IERFRkFVTFRfTkFNRVNQQUNFLFxuICAgICd3aWR0aHMnOiBERUZBVUxUX05BTUVTUEFDRSxcbiAgICAnd29yZC1zcGFjaW5nJzogREVGQVVMVF9OQU1FU1BBQ0UsXG4gICAgJ3dyaXRpbmctbW9kZSc6IERFRkFVTFRfTkFNRVNQQUNFLFxuICAgICd4JzogREVGQVVMVF9OQU1FU1BBQ0UsXG4gICAgJ3gtaGVpZ2h0JzogREVGQVVMVF9OQU1FU1BBQ0UsXG4gICAgJ3gxJzogREVGQVVMVF9OQU1FU1BBQ0UsXG4gICAgJ3gyJzogREVGQVVMVF9OQU1FU1BBQ0UsXG4gICAgJ3hDaGFubmVsU2VsZWN0b3InOiBERUZBVUxUX05BTUVTUEFDRSxcbiAgICAneGxpbms6YWN0dWF0ZSc6IFhMSU5LX05BTUVTUEFDRSxcbiAgICAneGxpbms6YXJjcm9sZSc6IFhMSU5LX05BTUVTUEFDRSxcbiAgICAneGxpbms6aHJlZic6IFhMSU5LX05BTUVTUEFDRSxcbiAgICAneGxpbms6cm9sZSc6IFhMSU5LX05BTUVTUEFDRSxcbiAgICAneGxpbms6c2hvdyc6IFhMSU5LX05BTUVTUEFDRSxcbiAgICAneGxpbms6dGl0bGUnOiBYTElOS19OQU1FU1BBQ0UsXG4gICAgJ3hsaW5rOnR5cGUnOiBYTElOS19OQU1FU1BBQ0UsXG4gICAgJ3htbDpiYXNlJzogWE1MX05BTUVTUEFDRSxcbiAgICAneG1sOmlkJzogWE1MX05BTUVTUEFDRSxcbiAgICAneG1sOmxhbmcnOiBYTUxfTkFNRVNQQUNFLFxuICAgICd4bWw6c3BhY2UnOiBYTUxfTkFNRVNQQUNFLFxuICAgICd5JzogREVGQVVMVF9OQU1FU1BBQ0UsXG4gICAgJ3kxJzogREVGQVVMVF9OQU1FU1BBQ0UsXG4gICAgJ3kyJzogREVGQVVMVF9OQU1FU1BBQ0UsXG4gICAgJ3lDaGFubmVsU2VsZWN0b3InOiBERUZBVUxUX05BTUVTUEFDRSxcbiAgICAneic6IERFRkFVTFRfTkFNRVNQQUNFLFxuICAgICd6b29tQW5kUGFuJzogREVGQVVMVF9OQU1FU1BBQ0Vcbn07XG5cbm1vZHVsZS5leHBvcnRzID0gU1ZHQXR0cmlidXRlTmFtZXNwYWNlO1xuXG5mdW5jdGlvbiBTVkdBdHRyaWJ1dGVOYW1lc3BhY2UodmFsdWUpIHtcbiAgaWYgKFNWR19QUk9QRVJUSUVTLmhhc093blByb3BlcnR5KHZhbHVlKSkge1xuICAgIHJldHVybiBTVkdfUFJPUEVSVElFU1t2YWx1ZV07XG4gIH1cbn1cbiIsIid1c2Ugc3RyaWN0JztcblxudmFyIGlzQXJyYXkgPSByZXF1aXJlKCd4LWlzLWFycmF5Jyk7XG5cbnZhciBoID0gcmVxdWlyZSgnLi9pbmRleC5qcycpO1xuXG5cbnZhciBTVkdBdHRyaWJ1dGVOYW1lc3BhY2UgPSByZXF1aXJlKCcuL3N2Zy1hdHRyaWJ1dGUtbmFtZXNwYWNlJyk7XG52YXIgYXR0cmlidXRlSG9vayA9IHJlcXVpcmUoJy4vaG9va3MvYXR0cmlidXRlLWhvb2snKTtcblxudmFyIFNWR19OQU1FU1BBQ0UgPSAnaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmcnO1xuXG5tb2R1bGUuZXhwb3J0cyA9IHN2ZztcblxuZnVuY3Rpb24gc3ZnKHRhZ05hbWUsIHByb3BlcnRpZXMsIGNoaWxkcmVuKSB7XG4gICAgaWYgKCFjaGlsZHJlbiAmJiBpc0NoaWxkcmVuKHByb3BlcnRpZXMpKSB7XG4gICAgICAgIGNoaWxkcmVuID0gcHJvcGVydGllcztcbiAgICAgICAgcHJvcGVydGllcyA9IHt9O1xuICAgIH1cblxuICAgIHByb3BlcnRpZXMgPSBwcm9wZXJ0aWVzIHx8IHt9O1xuXG4gICAgLy8gc2V0IG5hbWVzcGFjZSBmb3Igc3ZnXG4gICAgcHJvcGVydGllcy5uYW1lc3BhY2UgPSBTVkdfTkFNRVNQQUNFO1xuXG4gICAgdmFyIGF0dHJpYnV0ZXMgPSBwcm9wZXJ0aWVzLmF0dHJpYnV0ZXMgfHwgKHByb3BlcnRpZXMuYXR0cmlidXRlcyA9IHt9KTtcblxuICAgIGZvciAodmFyIGtleSBpbiBwcm9wZXJ0aWVzKSB7XG4gICAgICAgIGlmICghcHJvcGVydGllcy5oYXNPd25Qcm9wZXJ0eShrZXkpKSB7XG4gICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgfVxuXG4gICAgICAgIHZhciBuYW1lc3BhY2UgPSBTVkdBdHRyaWJ1dGVOYW1lc3BhY2Uoa2V5KTtcblxuICAgICAgICBpZiAobmFtZXNwYWNlID09PSB1bmRlZmluZWQpIHsgLy8gbm90IGEgc3ZnIGF0dHJpYnV0ZVxuICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgIH1cblxuICAgICAgICB2YXIgdmFsdWUgPSBwcm9wZXJ0aWVzW2tleV07XG5cbiAgICAgICAgaWYgKHR5cGVvZiB2YWx1ZSAhPT0gJ3N0cmluZycgJiZcbiAgICAgICAgICAgIHR5cGVvZiB2YWx1ZSAhPT0gJ251bWJlcicgJiZcbiAgICAgICAgICAgIHR5cGVvZiB2YWx1ZSAhPT0gJ2Jvb2xlYW4nXG4gICAgICAgICkge1xuICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAobmFtZXNwYWNlICE9PSBudWxsKSB7IC8vIG5hbWVzcGFjZWQgYXR0cmlidXRlXG4gICAgICAgICAgICBwcm9wZXJ0aWVzW2tleV0gPSBhdHRyaWJ1dGVIb29rKG5hbWVzcGFjZSwgdmFsdWUpO1xuICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgIH1cblxuICAgICAgICBhdHRyaWJ1dGVzW2tleV0gPSB2YWx1ZVxuICAgICAgICBwcm9wZXJ0aWVzW2tleV0gPSB1bmRlZmluZWRcbiAgICB9XG5cbiAgICByZXR1cm4gaCh0YWdOYW1lLCBwcm9wZXJ0aWVzLCBjaGlsZHJlbik7XG59XG5cbmZ1bmN0aW9uIGlzQ2hpbGRyZW4oeCkge1xuICAgIHJldHVybiB0eXBlb2YgeCA9PT0gJ3N0cmluZycgfHwgaXNBcnJheSh4KTtcbn1cbiIsInZhciBpc1ZOb2RlID0gcmVxdWlyZShcIi4vaXMtdm5vZGVcIilcbnZhciBpc1ZUZXh0ID0gcmVxdWlyZShcIi4vaXMtdnRleHRcIilcbnZhciBpc1dpZGdldCA9IHJlcXVpcmUoXCIuL2lzLXdpZGdldFwiKVxudmFyIGlzVGh1bmsgPSByZXF1aXJlKFwiLi9pcy10aHVua1wiKVxuXG5tb2R1bGUuZXhwb3J0cyA9IGhhbmRsZVRodW5rXG5cbmZ1bmN0aW9uIGhhbmRsZVRodW5rKGEsIGIpIHtcbiAgICB2YXIgcmVuZGVyZWRBID0gYVxuICAgIHZhciByZW5kZXJlZEIgPSBiXG5cbiAgICBpZiAoaXNUaHVuayhiKSkge1xuICAgICAgICByZW5kZXJlZEIgPSByZW5kZXJUaHVuayhiLCBhKVxuICAgIH1cblxuICAgIGlmIChpc1RodW5rKGEpKSB7XG4gICAgICAgIHJlbmRlcmVkQSA9IHJlbmRlclRodW5rKGEsIG51bGwpXG4gICAgfVxuXG4gICAgcmV0dXJuIHtcbiAgICAgICAgYTogcmVuZGVyZWRBLFxuICAgICAgICBiOiByZW5kZXJlZEJcbiAgICB9XG59XG5cbmZ1bmN0aW9uIHJlbmRlclRodW5rKHRodW5rLCBwcmV2aW91cykge1xuICAgIHZhciByZW5kZXJlZFRodW5rID0gdGh1bmsudm5vZGVcblxuICAgIGlmICghcmVuZGVyZWRUaHVuaykge1xuICAgICAgICByZW5kZXJlZFRodW5rID0gdGh1bmsudm5vZGUgPSB0aHVuay5yZW5kZXIocHJldmlvdXMpXG4gICAgfVxuXG4gICAgaWYgKCEoaXNWTm9kZShyZW5kZXJlZFRodW5rKSB8fFxuICAgICAgICAgICAgaXNWVGV4dChyZW5kZXJlZFRodW5rKSB8fFxuICAgICAgICAgICAgaXNXaWRnZXQocmVuZGVyZWRUaHVuaykpKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihcInRodW5rIGRpZCBub3QgcmV0dXJuIGEgdmFsaWQgbm9kZVwiKTtcbiAgICB9XG5cbiAgICByZXR1cm4gcmVuZGVyZWRUaHVua1xufVxuIiwibW9kdWxlLmV4cG9ydHMgPSBpc1RodW5rXHJcblxyXG5mdW5jdGlvbiBpc1RodW5rKHQpIHtcclxuICAgIHJldHVybiB0ICYmIHQudHlwZSA9PT0gXCJUaHVua1wiXHJcbn1cclxuIiwibW9kdWxlLmV4cG9ydHMgPSBpc0hvb2tcblxuZnVuY3Rpb24gaXNIb29rKGhvb2spIHtcbiAgICByZXR1cm4gaG9vayAmJlxuICAgICAgKHR5cGVvZiBob29rLmhvb2sgPT09IFwiZnVuY3Rpb25cIiAmJiAhaG9vay5oYXNPd25Qcm9wZXJ0eShcImhvb2tcIikgfHxcbiAgICAgICB0eXBlb2YgaG9vay51bmhvb2sgPT09IFwiZnVuY3Rpb25cIiAmJiAhaG9vay5oYXNPd25Qcm9wZXJ0eShcInVuaG9va1wiKSlcbn1cbiIsInZhciB2ZXJzaW9uID0gcmVxdWlyZShcIi4vdmVyc2lvblwiKVxuXG5tb2R1bGUuZXhwb3J0cyA9IGlzVmlydHVhbE5vZGVcblxuZnVuY3Rpb24gaXNWaXJ0dWFsTm9kZSh4KSB7XG4gICAgcmV0dXJuIHggJiYgeC50eXBlID09PSBcIlZpcnR1YWxOb2RlXCIgJiYgeC52ZXJzaW9uID09PSB2ZXJzaW9uXG59XG4iLCJ2YXIgdmVyc2lvbiA9IHJlcXVpcmUoXCIuL3ZlcnNpb25cIilcblxubW9kdWxlLmV4cG9ydHMgPSBpc1ZpcnR1YWxUZXh0XG5cbmZ1bmN0aW9uIGlzVmlydHVhbFRleHQoeCkge1xuICAgIHJldHVybiB4ICYmIHgudHlwZSA9PT0gXCJWaXJ0dWFsVGV4dFwiICYmIHgudmVyc2lvbiA9PT0gdmVyc2lvblxufVxuIiwibW9kdWxlLmV4cG9ydHMgPSBpc1dpZGdldFxuXG5mdW5jdGlvbiBpc1dpZGdldCh3KSB7XG4gICAgcmV0dXJuIHcgJiYgdy50eXBlID09PSBcIldpZGdldFwiXG59XG4iLCJtb2R1bGUuZXhwb3J0cyA9IFwiMlwiXG4iLCJ2YXIgdmVyc2lvbiA9IHJlcXVpcmUoXCIuL3ZlcnNpb25cIilcbnZhciBpc1ZOb2RlID0gcmVxdWlyZShcIi4vaXMtdm5vZGVcIilcbnZhciBpc1dpZGdldCA9IHJlcXVpcmUoXCIuL2lzLXdpZGdldFwiKVxudmFyIGlzVGh1bmsgPSByZXF1aXJlKFwiLi9pcy10aHVua1wiKVxudmFyIGlzVkhvb2sgPSByZXF1aXJlKFwiLi9pcy12aG9va1wiKVxuXG5tb2R1bGUuZXhwb3J0cyA9IFZpcnR1YWxOb2RlXG5cbnZhciBub1Byb3BlcnRpZXMgPSB7fVxudmFyIG5vQ2hpbGRyZW4gPSBbXVxuXG5mdW5jdGlvbiBWaXJ0dWFsTm9kZSh0YWdOYW1lLCBwcm9wZXJ0aWVzLCBjaGlsZHJlbiwga2V5LCBuYW1lc3BhY2UpIHtcbiAgICB0aGlzLnRhZ05hbWUgPSB0YWdOYW1lXG4gICAgdGhpcy5wcm9wZXJ0aWVzID0gcHJvcGVydGllcyB8fCBub1Byb3BlcnRpZXNcbiAgICB0aGlzLmNoaWxkcmVuID0gY2hpbGRyZW4gfHwgbm9DaGlsZHJlblxuICAgIHRoaXMua2V5ID0ga2V5ICE9IG51bGwgPyBTdHJpbmcoa2V5KSA6IHVuZGVmaW5lZFxuICAgIHRoaXMubmFtZXNwYWNlID0gKHR5cGVvZiBuYW1lc3BhY2UgPT09IFwic3RyaW5nXCIpID8gbmFtZXNwYWNlIDogbnVsbFxuXG4gICAgdmFyIGNvdW50ID0gKGNoaWxkcmVuICYmIGNoaWxkcmVuLmxlbmd0aCkgfHwgMFxuICAgIHZhciBkZXNjZW5kYW50cyA9IDBcbiAgICB2YXIgaGFzV2lkZ2V0cyA9IGZhbHNlXG4gICAgdmFyIGhhc1RodW5rcyA9IGZhbHNlXG4gICAgdmFyIGRlc2NlbmRhbnRIb29rcyA9IGZhbHNlXG4gICAgdmFyIGhvb2tzXG5cbiAgICBmb3IgKHZhciBwcm9wTmFtZSBpbiBwcm9wZXJ0aWVzKSB7XG4gICAgICAgIGlmIChwcm9wZXJ0aWVzLmhhc093blByb3BlcnR5KHByb3BOYW1lKSkge1xuICAgICAgICAgICAgdmFyIHByb3BlcnR5ID0gcHJvcGVydGllc1twcm9wTmFtZV1cbiAgICAgICAgICAgIGlmIChpc1ZIb29rKHByb3BlcnR5KSAmJiBwcm9wZXJ0eS51bmhvb2spIHtcbiAgICAgICAgICAgICAgICBpZiAoIWhvb2tzKSB7XG4gICAgICAgICAgICAgICAgICAgIGhvb2tzID0ge31cbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBob29rc1twcm9wTmFtZV0gPSBwcm9wZXJ0eVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuXG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBjb3VudDsgaSsrKSB7XG4gICAgICAgIHZhciBjaGlsZCA9IGNoaWxkcmVuW2ldXG4gICAgICAgIGlmIChpc1ZOb2RlKGNoaWxkKSkge1xuICAgICAgICAgICAgZGVzY2VuZGFudHMgKz0gY2hpbGQuY291bnQgfHwgMFxuXG4gICAgICAgICAgICBpZiAoIWhhc1dpZGdldHMgJiYgY2hpbGQuaGFzV2lkZ2V0cykge1xuICAgICAgICAgICAgICAgIGhhc1dpZGdldHMgPSB0cnVlXG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmICghaGFzVGh1bmtzICYmIGNoaWxkLmhhc1RodW5rcykge1xuICAgICAgICAgICAgICAgIGhhc1RodW5rcyA9IHRydWVcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYgKCFkZXNjZW5kYW50SG9va3MgJiYgKGNoaWxkLmhvb2tzIHx8IGNoaWxkLmRlc2NlbmRhbnRIb29rcykpIHtcbiAgICAgICAgICAgICAgICBkZXNjZW5kYW50SG9va3MgPSB0cnVlXG4gICAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSBpZiAoIWhhc1dpZGdldHMgJiYgaXNXaWRnZXQoY2hpbGQpKSB7XG4gICAgICAgICAgICBpZiAodHlwZW9mIGNoaWxkLmRlc3Ryb3kgPT09IFwiZnVuY3Rpb25cIikge1xuICAgICAgICAgICAgICAgIGhhc1dpZGdldHMgPSB0cnVlXG4gICAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSBpZiAoIWhhc1RodW5rcyAmJiBpc1RodW5rKGNoaWxkKSkge1xuICAgICAgICAgICAgaGFzVGh1bmtzID0gdHJ1ZTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHRoaXMuY291bnQgPSBjb3VudCArIGRlc2NlbmRhbnRzXG4gICAgdGhpcy5oYXNXaWRnZXRzID0gaGFzV2lkZ2V0c1xuICAgIHRoaXMuaGFzVGh1bmtzID0gaGFzVGh1bmtzXG4gICAgdGhpcy5ob29rcyA9IGhvb2tzXG4gICAgdGhpcy5kZXNjZW5kYW50SG9va3MgPSBkZXNjZW5kYW50SG9va3Ncbn1cblxuVmlydHVhbE5vZGUucHJvdG90eXBlLnZlcnNpb24gPSB2ZXJzaW9uXG5WaXJ0dWFsTm9kZS5wcm90b3R5cGUudHlwZSA9IFwiVmlydHVhbE5vZGVcIlxuIiwidmFyIHZlcnNpb24gPSByZXF1aXJlKFwiLi92ZXJzaW9uXCIpXG5cblZpcnR1YWxQYXRjaC5OT05FID0gMFxuVmlydHVhbFBhdGNoLlZURVhUID0gMVxuVmlydHVhbFBhdGNoLlZOT0RFID0gMlxuVmlydHVhbFBhdGNoLldJREdFVCA9IDNcblZpcnR1YWxQYXRjaC5QUk9QUyA9IDRcblZpcnR1YWxQYXRjaC5PUkRFUiA9IDVcblZpcnR1YWxQYXRjaC5JTlNFUlQgPSA2XG5WaXJ0dWFsUGF0Y2guUkVNT1ZFID0gN1xuVmlydHVhbFBhdGNoLlRIVU5LID0gOFxuXG5tb2R1bGUuZXhwb3J0cyA9IFZpcnR1YWxQYXRjaFxuXG5mdW5jdGlvbiBWaXJ0dWFsUGF0Y2godHlwZSwgdk5vZGUsIHBhdGNoKSB7XG4gICAgdGhpcy50eXBlID0gTnVtYmVyKHR5cGUpXG4gICAgdGhpcy52Tm9kZSA9IHZOb2RlXG4gICAgdGhpcy5wYXRjaCA9IHBhdGNoXG59XG5cblZpcnR1YWxQYXRjaC5wcm90b3R5cGUudmVyc2lvbiA9IHZlcnNpb25cblZpcnR1YWxQYXRjaC5wcm90b3R5cGUudHlwZSA9IFwiVmlydHVhbFBhdGNoXCJcbiIsInZhciB2ZXJzaW9uID0gcmVxdWlyZShcIi4vdmVyc2lvblwiKVxuXG5tb2R1bGUuZXhwb3J0cyA9IFZpcnR1YWxUZXh0XG5cbmZ1bmN0aW9uIFZpcnR1YWxUZXh0KHRleHQpIHtcbiAgICB0aGlzLnRleHQgPSBTdHJpbmcodGV4dClcbn1cblxuVmlydHVhbFRleHQucHJvdG90eXBlLnZlcnNpb24gPSB2ZXJzaW9uXG5WaXJ0dWFsVGV4dC5wcm90b3R5cGUudHlwZSA9IFwiVmlydHVhbFRleHRcIlxuIiwidmFyIGlzT2JqZWN0ID0gcmVxdWlyZShcImlzLW9iamVjdFwiKVxudmFyIGlzSG9vayA9IHJlcXVpcmUoXCIuLi92bm9kZS9pcy12aG9va1wiKVxuXG5tb2R1bGUuZXhwb3J0cyA9IGRpZmZQcm9wc1xuXG5mdW5jdGlvbiBkaWZmUHJvcHMoYSwgYikge1xuICAgIHZhciBkaWZmXG5cbiAgICBmb3IgKHZhciBhS2V5IGluIGEpIHtcbiAgICAgICAgaWYgKCEoYUtleSBpbiBiKSkge1xuICAgICAgICAgICAgZGlmZiA9IGRpZmYgfHwge31cbiAgICAgICAgICAgIGRpZmZbYUtleV0gPSB1bmRlZmluZWRcbiAgICAgICAgfVxuXG4gICAgICAgIHZhciBhVmFsdWUgPSBhW2FLZXldXG4gICAgICAgIHZhciBiVmFsdWUgPSBiW2FLZXldXG5cbiAgICAgICAgaWYgKGFWYWx1ZSA9PT0gYlZhbHVlKSB7XG4gICAgICAgICAgICBjb250aW51ZVxuICAgICAgICB9IGVsc2UgaWYgKGlzT2JqZWN0KGFWYWx1ZSkgJiYgaXNPYmplY3QoYlZhbHVlKSkge1xuICAgICAgICAgICAgaWYgKGdldFByb3RvdHlwZShiVmFsdWUpICE9PSBnZXRQcm90b3R5cGUoYVZhbHVlKSkge1xuICAgICAgICAgICAgICAgIGRpZmYgPSBkaWZmIHx8IHt9XG4gICAgICAgICAgICAgICAgZGlmZlthS2V5XSA9IGJWYWx1ZVxuICAgICAgICAgICAgfSBlbHNlIGlmIChpc0hvb2soYlZhbHVlKSkge1xuICAgICAgICAgICAgICAgICBkaWZmID0gZGlmZiB8fCB7fVxuICAgICAgICAgICAgICAgICBkaWZmW2FLZXldID0gYlZhbHVlXG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHZhciBvYmplY3REaWZmID0gZGlmZlByb3BzKGFWYWx1ZSwgYlZhbHVlKVxuICAgICAgICAgICAgICAgIGlmIChvYmplY3REaWZmKSB7XG4gICAgICAgICAgICAgICAgICAgIGRpZmYgPSBkaWZmIHx8IHt9XG4gICAgICAgICAgICAgICAgICAgIGRpZmZbYUtleV0gPSBvYmplY3REaWZmXG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgZGlmZiA9IGRpZmYgfHwge31cbiAgICAgICAgICAgIGRpZmZbYUtleV0gPSBiVmFsdWVcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGZvciAodmFyIGJLZXkgaW4gYikge1xuICAgICAgICBpZiAoIShiS2V5IGluIGEpKSB7XG4gICAgICAgICAgICBkaWZmID0gZGlmZiB8fCB7fVxuICAgICAgICAgICAgZGlmZltiS2V5XSA9IGJbYktleV1cbiAgICAgICAgfVxuICAgIH1cblxuICAgIHJldHVybiBkaWZmXG59XG5cbmZ1bmN0aW9uIGdldFByb3RvdHlwZSh2YWx1ZSkge1xuICBpZiAoT2JqZWN0LmdldFByb3RvdHlwZU9mKSB7XG4gICAgcmV0dXJuIE9iamVjdC5nZXRQcm90b3R5cGVPZih2YWx1ZSlcbiAgfSBlbHNlIGlmICh2YWx1ZS5fX3Byb3RvX18pIHtcbiAgICByZXR1cm4gdmFsdWUuX19wcm90b19fXG4gIH0gZWxzZSBpZiAodmFsdWUuY29uc3RydWN0b3IpIHtcbiAgICByZXR1cm4gdmFsdWUuY29uc3RydWN0b3IucHJvdG90eXBlXG4gIH1cbn1cbiIsInZhciBpc0FycmF5ID0gcmVxdWlyZShcIngtaXMtYXJyYXlcIilcblxudmFyIFZQYXRjaCA9IHJlcXVpcmUoXCIuLi92bm9kZS92cGF0Y2hcIilcbnZhciBpc1ZOb2RlID0gcmVxdWlyZShcIi4uL3Zub2RlL2lzLXZub2RlXCIpXG52YXIgaXNWVGV4dCA9IHJlcXVpcmUoXCIuLi92bm9kZS9pcy12dGV4dFwiKVxudmFyIGlzV2lkZ2V0ID0gcmVxdWlyZShcIi4uL3Zub2RlL2lzLXdpZGdldFwiKVxudmFyIGlzVGh1bmsgPSByZXF1aXJlKFwiLi4vdm5vZGUvaXMtdGh1bmtcIilcbnZhciBoYW5kbGVUaHVuayA9IHJlcXVpcmUoXCIuLi92bm9kZS9oYW5kbGUtdGh1bmtcIilcblxudmFyIGRpZmZQcm9wcyA9IHJlcXVpcmUoXCIuL2RpZmYtcHJvcHNcIilcblxubW9kdWxlLmV4cG9ydHMgPSBkaWZmXG5cbmZ1bmN0aW9uIGRpZmYoYSwgYikge1xuICAgIHZhciBwYXRjaCA9IHsgYTogYSB9XG4gICAgd2FsayhhLCBiLCBwYXRjaCwgMClcbiAgICByZXR1cm4gcGF0Y2hcbn1cblxuZnVuY3Rpb24gd2FsayhhLCBiLCBwYXRjaCwgaW5kZXgpIHtcbiAgICBpZiAoYSA9PT0gYikge1xuICAgICAgICByZXR1cm5cbiAgICB9XG5cbiAgICB2YXIgYXBwbHkgPSBwYXRjaFtpbmRleF1cbiAgICB2YXIgYXBwbHlDbGVhciA9IGZhbHNlXG5cbiAgICBpZiAoaXNUaHVuayhhKSB8fCBpc1RodW5rKGIpKSB7XG4gICAgICAgIHRodW5rcyhhLCBiLCBwYXRjaCwgaW5kZXgpXG4gICAgfSBlbHNlIGlmIChiID09IG51bGwpIHtcblxuICAgICAgICAvLyBJZiBhIGlzIGEgd2lkZ2V0IHdlIHdpbGwgYWRkIGEgcmVtb3ZlIHBhdGNoIGZvciBpdFxuICAgICAgICAvLyBPdGhlcndpc2UgYW55IGNoaWxkIHdpZGdldHMvaG9va3MgbXVzdCBiZSBkZXN0cm95ZWQuXG4gICAgICAgIC8vIFRoaXMgcHJldmVudHMgYWRkaW5nIHR3byByZW1vdmUgcGF0Y2hlcyBmb3IgYSB3aWRnZXQuXG4gICAgICAgIGlmICghaXNXaWRnZXQoYSkpIHtcbiAgICAgICAgICAgIGNsZWFyU3RhdGUoYSwgcGF0Y2gsIGluZGV4KVxuICAgICAgICAgICAgYXBwbHkgPSBwYXRjaFtpbmRleF1cbiAgICAgICAgfVxuXG4gICAgICAgIGFwcGx5ID0gYXBwZW5kUGF0Y2goYXBwbHksIG5ldyBWUGF0Y2goVlBhdGNoLlJFTU9WRSwgYSwgYikpXG4gICAgfSBlbHNlIGlmIChpc1ZOb2RlKGIpKSB7XG4gICAgICAgIGlmIChpc1ZOb2RlKGEpKSB7XG4gICAgICAgICAgICBpZiAoYS50YWdOYW1lID09PSBiLnRhZ05hbWUgJiZcbiAgICAgICAgICAgICAgICBhLm5hbWVzcGFjZSA9PT0gYi5uYW1lc3BhY2UgJiZcbiAgICAgICAgICAgICAgICBhLmtleSA9PT0gYi5rZXkpIHtcbiAgICAgICAgICAgICAgICB2YXIgcHJvcHNQYXRjaCA9IGRpZmZQcm9wcyhhLnByb3BlcnRpZXMsIGIucHJvcGVydGllcylcbiAgICAgICAgICAgICAgICBpZiAocHJvcHNQYXRjaCkge1xuICAgICAgICAgICAgICAgICAgICBhcHBseSA9IGFwcGVuZFBhdGNoKGFwcGx5LFxuICAgICAgICAgICAgICAgICAgICAgICAgbmV3IFZQYXRjaChWUGF0Y2guUFJPUFMsIGEsIHByb3BzUGF0Y2gpKVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBhcHBseSA9IGRpZmZDaGlsZHJlbihhLCBiLCBwYXRjaCwgYXBwbHksIGluZGV4KVxuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBhcHBseSA9IGFwcGVuZFBhdGNoKGFwcGx5LCBuZXcgVlBhdGNoKFZQYXRjaC5WTk9ERSwgYSwgYikpXG4gICAgICAgICAgICAgICAgYXBwbHlDbGVhciA9IHRydWVcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGFwcGx5ID0gYXBwZW5kUGF0Y2goYXBwbHksIG5ldyBWUGF0Y2goVlBhdGNoLlZOT0RFLCBhLCBiKSlcbiAgICAgICAgICAgIGFwcGx5Q2xlYXIgPSB0cnVlXG4gICAgICAgIH1cbiAgICB9IGVsc2UgaWYgKGlzVlRleHQoYikpIHtcbiAgICAgICAgaWYgKCFpc1ZUZXh0KGEpKSB7XG4gICAgICAgICAgICBhcHBseSA9IGFwcGVuZFBhdGNoKGFwcGx5LCBuZXcgVlBhdGNoKFZQYXRjaC5WVEVYVCwgYSwgYikpXG4gICAgICAgICAgICBhcHBseUNsZWFyID0gdHJ1ZVxuICAgICAgICB9IGVsc2UgaWYgKGEudGV4dCAhPT0gYi50ZXh0KSB7XG4gICAgICAgICAgICBhcHBseSA9IGFwcGVuZFBhdGNoKGFwcGx5LCBuZXcgVlBhdGNoKFZQYXRjaC5WVEVYVCwgYSwgYikpXG4gICAgICAgIH1cbiAgICB9IGVsc2UgaWYgKGlzV2lkZ2V0KGIpKSB7XG4gICAgICAgIGlmICghaXNXaWRnZXQoYSkpIHtcbiAgICAgICAgICAgIGFwcGx5Q2xlYXIgPSB0cnVlXG4gICAgICAgIH1cblxuICAgICAgICBhcHBseSA9IGFwcGVuZFBhdGNoKGFwcGx5LCBuZXcgVlBhdGNoKFZQYXRjaC5XSURHRVQsIGEsIGIpKVxuICAgIH1cblxuICAgIGlmIChhcHBseSkge1xuICAgICAgICBwYXRjaFtpbmRleF0gPSBhcHBseVxuICAgIH1cblxuICAgIGlmIChhcHBseUNsZWFyKSB7XG4gICAgICAgIGNsZWFyU3RhdGUoYSwgcGF0Y2gsIGluZGV4KVxuICAgIH1cbn1cblxuZnVuY3Rpb24gZGlmZkNoaWxkcmVuKGEsIGIsIHBhdGNoLCBhcHBseSwgaW5kZXgpIHtcbiAgICB2YXIgYUNoaWxkcmVuID0gYS5jaGlsZHJlblxuICAgIHZhciBvcmRlcmVkU2V0ID0gcmVvcmRlcihhQ2hpbGRyZW4sIGIuY2hpbGRyZW4pXG4gICAgdmFyIGJDaGlsZHJlbiA9IG9yZGVyZWRTZXQuY2hpbGRyZW5cblxuICAgIHZhciBhTGVuID0gYUNoaWxkcmVuLmxlbmd0aFxuICAgIHZhciBiTGVuID0gYkNoaWxkcmVuLmxlbmd0aFxuICAgIHZhciBsZW4gPSBhTGVuID4gYkxlbiA/IGFMZW4gOiBiTGVuXG5cbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IGxlbjsgaSsrKSB7XG4gICAgICAgIHZhciBsZWZ0Tm9kZSA9IGFDaGlsZHJlbltpXVxuICAgICAgICB2YXIgcmlnaHROb2RlID0gYkNoaWxkcmVuW2ldXG4gICAgICAgIGluZGV4ICs9IDFcblxuICAgICAgICBpZiAoIWxlZnROb2RlKSB7XG4gICAgICAgICAgICBpZiAocmlnaHROb2RlKSB7XG4gICAgICAgICAgICAgICAgLy8gRXhjZXNzIG5vZGVzIGluIGIgbmVlZCB0byBiZSBhZGRlZFxuICAgICAgICAgICAgICAgIGFwcGx5ID0gYXBwZW5kUGF0Y2goYXBwbHksXG4gICAgICAgICAgICAgICAgICAgIG5ldyBWUGF0Y2goVlBhdGNoLklOU0VSVCwgbnVsbCwgcmlnaHROb2RlKSlcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHdhbGsobGVmdE5vZGUsIHJpZ2h0Tm9kZSwgcGF0Y2gsIGluZGV4KVxuICAgICAgICB9XG5cbiAgICAgICAgaWYgKGlzVk5vZGUobGVmdE5vZGUpICYmIGxlZnROb2RlLmNvdW50KSB7XG4gICAgICAgICAgICBpbmRleCArPSBsZWZ0Tm9kZS5jb3VudFxuICAgICAgICB9XG4gICAgfVxuXG4gICAgaWYgKG9yZGVyZWRTZXQubW92ZXMpIHtcbiAgICAgICAgLy8gUmVvcmRlciBub2RlcyBsYXN0XG4gICAgICAgIGFwcGx5ID0gYXBwZW5kUGF0Y2goYXBwbHksIG5ldyBWUGF0Y2goXG4gICAgICAgICAgICBWUGF0Y2guT1JERVIsXG4gICAgICAgICAgICBhLFxuICAgICAgICAgICAgb3JkZXJlZFNldC5tb3Zlc1xuICAgICAgICApKVxuICAgIH1cblxuICAgIHJldHVybiBhcHBseVxufVxuXG5mdW5jdGlvbiBjbGVhclN0YXRlKHZOb2RlLCBwYXRjaCwgaW5kZXgpIHtcbiAgICAvLyBUT0RPOiBNYWtlIHRoaXMgYSBzaW5nbGUgd2Fsaywgbm90IHR3b1xuICAgIHVuaG9vayh2Tm9kZSwgcGF0Y2gsIGluZGV4KVxuICAgIGRlc3Ryb3lXaWRnZXRzKHZOb2RlLCBwYXRjaCwgaW5kZXgpXG59XG5cbi8vIFBhdGNoIHJlY29yZHMgZm9yIGFsbCBkZXN0cm95ZWQgd2lkZ2V0cyBtdXN0IGJlIGFkZGVkIGJlY2F1c2Ugd2UgbmVlZFxuLy8gYSBET00gbm9kZSByZWZlcmVuY2UgZm9yIHRoZSBkZXN0cm95IGZ1bmN0aW9uXG5mdW5jdGlvbiBkZXN0cm95V2lkZ2V0cyh2Tm9kZSwgcGF0Y2gsIGluZGV4KSB7XG4gICAgaWYgKGlzV2lkZ2V0KHZOb2RlKSkge1xuICAgICAgICBpZiAodHlwZW9mIHZOb2RlLmRlc3Ryb3kgPT09IFwiZnVuY3Rpb25cIikge1xuICAgICAgICAgICAgcGF0Y2hbaW5kZXhdID0gYXBwZW5kUGF0Y2goXG4gICAgICAgICAgICAgICAgcGF0Y2hbaW5kZXhdLFxuICAgICAgICAgICAgICAgIG5ldyBWUGF0Y2goVlBhdGNoLlJFTU9WRSwgdk5vZGUsIG51bGwpXG4gICAgICAgICAgICApXG4gICAgICAgIH1cbiAgICB9IGVsc2UgaWYgKGlzVk5vZGUodk5vZGUpICYmICh2Tm9kZS5oYXNXaWRnZXRzIHx8IHZOb2RlLmhhc1RodW5rcykpIHtcbiAgICAgICAgdmFyIGNoaWxkcmVuID0gdk5vZGUuY2hpbGRyZW5cbiAgICAgICAgdmFyIGxlbiA9IGNoaWxkcmVuLmxlbmd0aFxuICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IGxlbjsgaSsrKSB7XG4gICAgICAgICAgICB2YXIgY2hpbGQgPSBjaGlsZHJlbltpXVxuICAgICAgICAgICAgaW5kZXggKz0gMVxuXG4gICAgICAgICAgICBkZXN0cm95V2lkZ2V0cyhjaGlsZCwgcGF0Y2gsIGluZGV4KVxuXG4gICAgICAgICAgICBpZiAoaXNWTm9kZShjaGlsZCkgJiYgY2hpbGQuY291bnQpIHtcbiAgICAgICAgICAgICAgICBpbmRleCArPSBjaGlsZC5jb3VudFxuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfSBlbHNlIGlmIChpc1RodW5rKHZOb2RlKSkge1xuICAgICAgICB0aHVua3Modk5vZGUsIG51bGwsIHBhdGNoLCBpbmRleClcbiAgICB9XG59XG5cbi8vIENyZWF0ZSBhIHN1Yi1wYXRjaCBmb3IgdGh1bmtzXG5mdW5jdGlvbiB0aHVua3MoYSwgYiwgcGF0Y2gsIGluZGV4KSB7XG4gICAgdmFyIG5vZGVzID0gaGFuZGxlVGh1bmsoYSwgYilcbiAgICB2YXIgdGh1bmtQYXRjaCA9IGRpZmYobm9kZXMuYSwgbm9kZXMuYilcbiAgICBpZiAoaGFzUGF0Y2hlcyh0aHVua1BhdGNoKSkge1xuICAgICAgICBwYXRjaFtpbmRleF0gPSBuZXcgVlBhdGNoKFZQYXRjaC5USFVOSywgbnVsbCwgdGh1bmtQYXRjaClcbiAgICB9XG59XG5cbmZ1bmN0aW9uIGhhc1BhdGNoZXMocGF0Y2gpIHtcbiAgICBmb3IgKHZhciBpbmRleCBpbiBwYXRjaCkge1xuICAgICAgICBpZiAoaW5kZXggIT09IFwiYVwiKSB7XG4gICAgICAgICAgICByZXR1cm4gdHJ1ZVxuICAgICAgICB9XG4gICAgfVxuXG4gICAgcmV0dXJuIGZhbHNlXG59XG5cbi8vIEV4ZWN1dGUgaG9va3Mgd2hlbiB0d28gbm9kZXMgYXJlIGlkZW50aWNhbFxuZnVuY3Rpb24gdW5ob29rKHZOb2RlLCBwYXRjaCwgaW5kZXgpIHtcbiAgICBpZiAoaXNWTm9kZSh2Tm9kZSkpIHtcbiAgICAgICAgaWYgKHZOb2RlLmhvb2tzKSB7XG4gICAgICAgICAgICBwYXRjaFtpbmRleF0gPSBhcHBlbmRQYXRjaChcbiAgICAgICAgICAgICAgICBwYXRjaFtpbmRleF0sXG4gICAgICAgICAgICAgICAgbmV3IFZQYXRjaChcbiAgICAgICAgICAgICAgICAgICAgVlBhdGNoLlBST1BTLFxuICAgICAgICAgICAgICAgICAgICB2Tm9kZSxcbiAgICAgICAgICAgICAgICAgICAgdW5kZWZpbmVkS2V5cyh2Tm9kZS5ob29rcylcbiAgICAgICAgICAgICAgICApXG4gICAgICAgICAgICApXG4gICAgICAgIH1cblxuICAgICAgICBpZiAodk5vZGUuZGVzY2VuZGFudEhvb2tzIHx8IHZOb2RlLmhhc1RodW5rcykge1xuICAgICAgICAgICAgdmFyIGNoaWxkcmVuID0gdk5vZGUuY2hpbGRyZW5cbiAgICAgICAgICAgIHZhciBsZW4gPSBjaGlsZHJlbi5sZW5ndGhcbiAgICAgICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbGVuOyBpKyspIHtcbiAgICAgICAgICAgICAgICB2YXIgY2hpbGQgPSBjaGlsZHJlbltpXVxuICAgICAgICAgICAgICAgIGluZGV4ICs9IDFcblxuICAgICAgICAgICAgICAgIHVuaG9vayhjaGlsZCwgcGF0Y2gsIGluZGV4KVxuXG4gICAgICAgICAgICAgICAgaWYgKGlzVk5vZGUoY2hpbGQpICYmIGNoaWxkLmNvdW50KSB7XG4gICAgICAgICAgICAgICAgICAgIGluZGV4ICs9IGNoaWxkLmNvdW50XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfSBlbHNlIGlmIChpc1RodW5rKHZOb2RlKSkge1xuICAgICAgICB0aHVua3Modk5vZGUsIG51bGwsIHBhdGNoLCBpbmRleClcbiAgICB9XG59XG5cbmZ1bmN0aW9uIHVuZGVmaW5lZEtleXMob2JqKSB7XG4gICAgdmFyIHJlc3VsdCA9IHt9XG5cbiAgICBmb3IgKHZhciBrZXkgaW4gb2JqKSB7XG4gICAgICAgIHJlc3VsdFtrZXldID0gdW5kZWZpbmVkXG4gICAgfVxuXG4gICAgcmV0dXJuIHJlc3VsdFxufVxuXG4vLyBMaXN0IGRpZmYsIG5haXZlIGxlZnQgdG8gcmlnaHQgcmVvcmRlcmluZ1xuZnVuY3Rpb24gcmVvcmRlcihhQ2hpbGRyZW4sIGJDaGlsZHJlbikge1xuICAgIC8vIE8oTSkgdGltZSwgTyhNKSBtZW1vcnlcbiAgICB2YXIgYkNoaWxkSW5kZXggPSBrZXlJbmRleChiQ2hpbGRyZW4pXG4gICAgdmFyIGJLZXlzID0gYkNoaWxkSW5kZXgua2V5c1xuICAgIHZhciBiRnJlZSA9IGJDaGlsZEluZGV4LmZyZWVcblxuICAgIGlmIChiRnJlZS5sZW5ndGggPT09IGJDaGlsZHJlbi5sZW5ndGgpIHtcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgIGNoaWxkcmVuOiBiQ2hpbGRyZW4sXG4gICAgICAgICAgICBtb3ZlczogbnVsbFxuICAgICAgICB9XG4gICAgfVxuXG4gICAgLy8gTyhOKSB0aW1lLCBPKE4pIG1lbW9yeVxuICAgIHZhciBhQ2hpbGRJbmRleCA9IGtleUluZGV4KGFDaGlsZHJlbilcbiAgICB2YXIgYUtleXMgPSBhQ2hpbGRJbmRleC5rZXlzXG4gICAgdmFyIGFGcmVlID0gYUNoaWxkSW5kZXguZnJlZVxuXG4gICAgaWYgKGFGcmVlLmxlbmd0aCA9PT0gYUNoaWxkcmVuLmxlbmd0aCkge1xuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgY2hpbGRyZW46IGJDaGlsZHJlbixcbiAgICAgICAgICAgIG1vdmVzOiBudWxsXG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBPKE1BWChOLCBNKSkgbWVtb3J5XG4gICAgdmFyIG5ld0NoaWxkcmVuID0gW11cblxuICAgIHZhciBmcmVlSW5kZXggPSAwXG4gICAgdmFyIGZyZWVDb3VudCA9IGJGcmVlLmxlbmd0aFxuICAgIHZhciBkZWxldGVkSXRlbXMgPSAwXG5cbiAgICAvLyBJdGVyYXRlIHRocm91Z2ggYSBhbmQgbWF0Y2ggYSBub2RlIGluIGJcbiAgICAvLyBPKE4pIHRpbWUsXG4gICAgZm9yICh2YXIgaSA9IDAgOyBpIDwgYUNoaWxkcmVuLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgIHZhciBhSXRlbSA9IGFDaGlsZHJlbltpXVxuICAgICAgICB2YXIgaXRlbUluZGV4XG5cbiAgICAgICAgaWYgKGFJdGVtLmtleSkge1xuICAgICAgICAgICAgaWYgKGJLZXlzLmhhc093blByb3BlcnR5KGFJdGVtLmtleSkpIHtcbiAgICAgICAgICAgICAgICAvLyBNYXRjaCB1cCB0aGUgb2xkIGtleXNcbiAgICAgICAgICAgICAgICBpdGVtSW5kZXggPSBiS2V5c1thSXRlbS5rZXldXG4gICAgICAgICAgICAgICAgbmV3Q2hpbGRyZW4ucHVzaChiQ2hpbGRyZW5baXRlbUluZGV4XSlcblxuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAvLyBSZW1vdmUgb2xkIGtleWVkIGl0ZW1zXG4gICAgICAgICAgICAgICAgaXRlbUluZGV4ID0gaSAtIGRlbGV0ZWRJdGVtcysrXG4gICAgICAgICAgICAgICAgbmV3Q2hpbGRyZW4ucHVzaChudWxsKVxuICAgICAgICAgICAgfVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgLy8gTWF0Y2ggdGhlIGl0ZW0gaW4gYSB3aXRoIHRoZSBuZXh0IGZyZWUgaXRlbSBpbiBiXG4gICAgICAgICAgICBpZiAoZnJlZUluZGV4IDwgZnJlZUNvdW50KSB7XG4gICAgICAgICAgICAgICAgaXRlbUluZGV4ID0gYkZyZWVbZnJlZUluZGV4KytdXG4gICAgICAgICAgICAgICAgbmV3Q2hpbGRyZW4ucHVzaChiQ2hpbGRyZW5baXRlbUluZGV4XSlcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgLy8gVGhlcmUgYXJlIG5vIGZyZWUgaXRlbXMgaW4gYiB0byBtYXRjaCB3aXRoXG4gICAgICAgICAgICAgICAgLy8gdGhlIGZyZWUgaXRlbXMgaW4gYSwgc28gdGhlIGV4dHJhIGZyZWUgbm9kZXNcbiAgICAgICAgICAgICAgICAvLyBhcmUgZGVsZXRlZC5cbiAgICAgICAgICAgICAgICBpdGVtSW5kZXggPSBpIC0gZGVsZXRlZEl0ZW1zKytcbiAgICAgICAgICAgICAgICBuZXdDaGlsZHJlbi5wdXNoKG51bGwpXG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICB2YXIgbGFzdEZyZWVJbmRleCA9IGZyZWVJbmRleCA+PSBiRnJlZS5sZW5ndGggP1xuICAgICAgICBiQ2hpbGRyZW4ubGVuZ3RoIDpcbiAgICAgICAgYkZyZWVbZnJlZUluZGV4XVxuXG4gICAgLy8gSXRlcmF0ZSB0aHJvdWdoIGIgYW5kIGFwcGVuZCBhbnkgbmV3IGtleXNcbiAgICAvLyBPKE0pIHRpbWVcbiAgICBmb3IgKHZhciBqID0gMDsgaiA8IGJDaGlsZHJlbi5sZW5ndGg7IGorKykge1xuICAgICAgICB2YXIgbmV3SXRlbSA9IGJDaGlsZHJlbltqXVxuXG4gICAgICAgIGlmIChuZXdJdGVtLmtleSkge1xuICAgICAgICAgICAgaWYgKCFhS2V5cy5oYXNPd25Qcm9wZXJ0eShuZXdJdGVtLmtleSkpIHtcbiAgICAgICAgICAgICAgICAvLyBBZGQgYW55IG5ldyBrZXllZCBpdGVtc1xuICAgICAgICAgICAgICAgIC8vIFdlIGFyZSBhZGRpbmcgbmV3IGl0ZW1zIHRvIHRoZSBlbmQgYW5kIHRoZW4gc29ydGluZyB0aGVtXG4gICAgICAgICAgICAgICAgLy8gaW4gcGxhY2UuIEluIGZ1dHVyZSB3ZSBzaG91bGQgaW5zZXJ0IG5ldyBpdGVtcyBpbiBwbGFjZS5cbiAgICAgICAgICAgICAgICBuZXdDaGlsZHJlbi5wdXNoKG5ld0l0ZW0pXG4gICAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSBpZiAoaiA+PSBsYXN0RnJlZUluZGV4KSB7XG4gICAgICAgICAgICAvLyBBZGQgYW55IGxlZnRvdmVyIG5vbi1rZXllZCBpdGVtc1xuICAgICAgICAgICAgbmV3Q2hpbGRyZW4ucHVzaChuZXdJdGVtKVxuICAgICAgICB9XG4gICAgfVxuXG4gICAgdmFyIHNpbXVsYXRlID0gbmV3Q2hpbGRyZW4uc2xpY2UoKVxuICAgIHZhciBzaW11bGF0ZUluZGV4ID0gMFxuICAgIHZhciByZW1vdmVzID0gW11cbiAgICB2YXIgaW5zZXJ0cyA9IFtdXG4gICAgdmFyIHNpbXVsYXRlSXRlbVxuXG4gICAgZm9yICh2YXIgayA9IDA7IGsgPCBiQ2hpbGRyZW4ubGVuZ3RoOykge1xuICAgICAgICB2YXIgd2FudGVkSXRlbSA9IGJDaGlsZHJlbltrXVxuICAgICAgICBzaW11bGF0ZUl0ZW0gPSBzaW11bGF0ZVtzaW11bGF0ZUluZGV4XVxuXG4gICAgICAgIC8vIHJlbW92ZSBpdGVtc1xuICAgICAgICB3aGlsZSAoc2ltdWxhdGVJdGVtID09PSBudWxsICYmIHNpbXVsYXRlLmxlbmd0aCkge1xuICAgICAgICAgICAgcmVtb3Zlcy5wdXNoKHJlbW92ZShzaW11bGF0ZSwgc2ltdWxhdGVJbmRleCwgbnVsbCkpXG4gICAgICAgICAgICBzaW11bGF0ZUl0ZW0gPSBzaW11bGF0ZVtzaW11bGF0ZUluZGV4XVxuICAgICAgICB9XG5cbiAgICAgICAgaWYgKCFzaW11bGF0ZUl0ZW0gfHwgc2ltdWxhdGVJdGVtLmtleSAhPT0gd2FudGVkSXRlbS5rZXkpIHtcbiAgICAgICAgICAgIC8vIGlmIHdlIG5lZWQgYSBrZXkgaW4gdGhpcyBwb3NpdGlvbi4uLlxuICAgICAgICAgICAgaWYgKHdhbnRlZEl0ZW0ua2V5KSB7XG4gICAgICAgICAgICAgICAgaWYgKHNpbXVsYXRlSXRlbSAmJiBzaW11bGF0ZUl0ZW0ua2V5KSB7XG4gICAgICAgICAgICAgICAgICAgIC8vIGlmIGFuIGluc2VydCBkb2Vzbid0IHB1dCB0aGlzIGtleSBpbiBwbGFjZSwgaXQgbmVlZHMgdG8gbW92ZVxuICAgICAgICAgICAgICAgICAgICBpZiAoYktleXNbc2ltdWxhdGVJdGVtLmtleV0gIT09IGsgKyAxKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICByZW1vdmVzLnB1c2gocmVtb3ZlKHNpbXVsYXRlLCBzaW11bGF0ZUluZGV4LCBzaW11bGF0ZUl0ZW0ua2V5KSlcbiAgICAgICAgICAgICAgICAgICAgICAgIHNpbXVsYXRlSXRlbSA9IHNpbXVsYXRlW3NpbXVsYXRlSW5kZXhdXG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBpZiB0aGUgcmVtb3ZlIGRpZG4ndCBwdXQgdGhlIHdhbnRlZCBpdGVtIGluIHBsYWNlLCB3ZSBuZWVkIHRvIGluc2VydCBpdFxuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKCFzaW11bGF0ZUl0ZW0gfHwgc2ltdWxhdGVJdGVtLmtleSAhPT0gd2FudGVkSXRlbS5rZXkpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpbnNlcnRzLnB1c2goe2tleTogd2FudGVkSXRlbS5rZXksIHRvOiBrfSlcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIGl0ZW1zIGFyZSBtYXRjaGluZywgc28gc2tpcCBhaGVhZFxuICAgICAgICAgICAgICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgc2ltdWxhdGVJbmRleCsrXG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBpbnNlcnRzLnB1c2goe2tleTogd2FudGVkSXRlbS5rZXksIHRvOiBrfSlcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgaW5zZXJ0cy5wdXNoKHtrZXk6IHdhbnRlZEl0ZW0ua2V5LCB0bzoga30pXG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGsrK1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgLy8gYSBrZXkgaW4gc2ltdWxhdGUgaGFzIG5vIG1hdGNoaW5nIHdhbnRlZCBrZXksIHJlbW92ZSBpdFxuICAgICAgICAgICAgZWxzZSBpZiAoc2ltdWxhdGVJdGVtICYmIHNpbXVsYXRlSXRlbS5rZXkpIHtcbiAgICAgICAgICAgICAgICByZW1vdmVzLnB1c2gocmVtb3ZlKHNpbXVsYXRlLCBzaW11bGF0ZUluZGV4LCBzaW11bGF0ZUl0ZW0ua2V5KSlcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIHNpbXVsYXRlSW5kZXgrK1xuICAgICAgICAgICAgaysrXG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvLyByZW1vdmUgYWxsIHRoZSByZW1haW5pbmcgbm9kZXMgZnJvbSBzaW11bGF0ZVxuICAgIHdoaWxlKHNpbXVsYXRlSW5kZXggPCBzaW11bGF0ZS5sZW5ndGgpIHtcbiAgICAgICAgc2ltdWxhdGVJdGVtID0gc2ltdWxhdGVbc2ltdWxhdGVJbmRleF1cbiAgICAgICAgcmVtb3Zlcy5wdXNoKHJlbW92ZShzaW11bGF0ZSwgc2ltdWxhdGVJbmRleCwgc2ltdWxhdGVJdGVtICYmIHNpbXVsYXRlSXRlbS5rZXkpKVxuICAgIH1cblxuICAgIC8vIElmIHRoZSBvbmx5IG1vdmVzIHdlIGhhdmUgYXJlIGRlbGV0ZXMgdGhlbiB3ZSBjYW4ganVzdFxuICAgIC8vIGxldCB0aGUgZGVsZXRlIHBhdGNoIHJlbW92ZSB0aGVzZSBpdGVtcy5cbiAgICBpZiAocmVtb3Zlcy5sZW5ndGggPT09IGRlbGV0ZWRJdGVtcyAmJiAhaW5zZXJ0cy5sZW5ndGgpIHtcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgIGNoaWxkcmVuOiBuZXdDaGlsZHJlbixcbiAgICAgICAgICAgIG1vdmVzOiBudWxsXG4gICAgICAgIH1cbiAgICB9XG5cbiAgICByZXR1cm4ge1xuICAgICAgICBjaGlsZHJlbjogbmV3Q2hpbGRyZW4sXG4gICAgICAgIG1vdmVzOiB7XG4gICAgICAgICAgICByZW1vdmVzOiByZW1vdmVzLFxuICAgICAgICAgICAgaW5zZXJ0czogaW5zZXJ0c1xuICAgICAgICB9XG4gICAgfVxufVxuXG5mdW5jdGlvbiByZW1vdmUoYXJyLCBpbmRleCwga2V5KSB7XG4gICAgYXJyLnNwbGljZShpbmRleCwgMSlcblxuICAgIHJldHVybiB7XG4gICAgICAgIGZyb206IGluZGV4LFxuICAgICAgICBrZXk6IGtleVxuICAgIH1cbn1cblxuZnVuY3Rpb24ga2V5SW5kZXgoY2hpbGRyZW4pIHtcbiAgICB2YXIga2V5cyA9IHt9XG4gICAgdmFyIGZyZWUgPSBbXVxuICAgIHZhciBsZW5ndGggPSBjaGlsZHJlbi5sZW5ndGhcblxuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbGVuZ3RoOyBpKyspIHtcbiAgICAgICAgdmFyIGNoaWxkID0gY2hpbGRyZW5baV1cblxuICAgICAgICBpZiAoY2hpbGQua2V5KSB7XG4gICAgICAgICAgICBrZXlzW2NoaWxkLmtleV0gPSBpXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBmcmVlLnB1c2goaSlcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHJldHVybiB7XG4gICAgICAgIGtleXM6IGtleXMsICAgICAvLyBBIGhhc2ggb2Yga2V5IG5hbWUgdG8gaW5kZXhcbiAgICAgICAgZnJlZTogZnJlZSwgICAgIC8vIEFuIGFycmF5IG9mIHVua2V5ZWQgaXRlbSBpbmRpY2VzXG4gICAgfVxufVxuXG5mdW5jdGlvbiBhcHBlbmRQYXRjaChhcHBseSwgcGF0Y2gpIHtcbiAgICBpZiAoYXBwbHkpIHtcbiAgICAgICAgaWYgKGlzQXJyYXkoYXBwbHkpKSB7XG4gICAgICAgICAgICBhcHBseS5wdXNoKHBhdGNoKVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgYXBwbHkgPSBbYXBwbHksIHBhdGNoXVxuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIGFwcGx5XG4gICAgfSBlbHNlIHtcbiAgICAgICAgcmV0dXJuIHBhdGNoXG4gICAgfVxufVxuIiwidmFyIG5zID0gJ2h0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnJztcbnZhciBoc3ZnID0gcmVxdWlyZSgndmlydHVhbC1kb20vdmlydHVhbC1oeXBlcnNjcmlwdC9zdmcnKTtcbnZhciBoYXMgPSByZXF1aXJlKCdoYXMnKTtcbnZhciBpc2FycmF5ID0gcmVxdWlyZSgnaXNhcnJheScpO1xudmFyIHh0ZW5kID0gcmVxdWlyZSgneHRlbmQnKTtcblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiAobmFtZSwgcHJvcHMsIGNoaWxkcmVuKSB7XG4gICAgaWYgKG5hbWUudG9VcHBlckNhc2UoKSA9PT0gJ1NWRycgJiYgIWhhcyhwcm9wcywgJ3htbG5zJykpIHtcbiAgICAgICAgaWYgKHR5cGVvZiBwcm9wcyA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgICAgIGNoaWxkcmVuID0gWyBwcm9wcyBdO1xuICAgICAgICAgICAgcHJvcHMgPSB7fTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIGlmIChpc2FycmF5KHByb3BzKSkge1xuICAgICAgICAgICAgY2hpbGRyZW4gPSBwcm9wcztcbiAgICAgICAgICAgIHByb3BzID0ge307XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGhzdmcobmFtZSwgeHRlbmQoeyB4bWxuczogbnMgfSwgcHJvcHMpLCBjaGlsZHJlbik7XG4gICAgfVxuICAgIGVsc2UgcmV0dXJuIGhzdmcobmFtZSwgcHJvcHMsIGNoaWxkcmVuKTtcbn07XG4iLCJ2YXIgaGFzT3duID0gT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eTtcblxuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIGhhcyhvYmosIHByb3BlcnR5KSB7XG4gIHJldHVybiBoYXNPd24uY2FsbChvYmosIHByb3BlcnR5KTtcbn07XG4iLCJtb2R1bGUuZXhwb3J0cyA9IEFycmF5LmlzQXJyYXkgfHwgZnVuY3Rpb24gKGFycikge1xuICByZXR1cm4gT2JqZWN0LnByb3RvdHlwZS50b1N0cmluZy5jYWxsKGFycikgPT0gJ1tvYmplY3QgQXJyYXldJztcbn07XG4iLCJtb2R1bGUuZXhwb3J0cyA9IGV4dGVuZFxuXG5mdW5jdGlvbiBleHRlbmQoKSB7XG4gICAgdmFyIHRhcmdldCA9IHt9XG5cbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IGFyZ3VtZW50cy5sZW5ndGg7IGkrKykge1xuICAgICAgICB2YXIgc291cmNlID0gYXJndW1lbnRzW2ldXG5cbiAgICAgICAgZm9yICh2YXIga2V5IGluIHNvdXJjZSkge1xuICAgICAgICAgICAgaWYgKHNvdXJjZS5oYXNPd25Qcm9wZXJ0eShrZXkpKSB7XG4gICAgICAgICAgICAgICAgdGFyZ2V0W2tleV0gPSBzb3VyY2Vba2V5XVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuXG4gICAgcmV0dXJuIHRhcmdldFxufVxuIiwidmFyIEV2ZW50RW1pdHRlciA9IHJlcXVpcmUoJ2V2ZW50cycpLkV2ZW50RW1pdHRlclxudmFyIGluZGV4QXJyYXkgPSByZXF1aXJlKCdpbmRleC1hcnJheScpXG52YXIgeHRlbmQgPSByZXF1aXJlKCd4dGVuZCcpXG52YXIgaW5oZXJpdHMgPSByZXF1aXJlKCdpbmhlcml0cycpXG52YXIgcmFuZG9tID0gcmVxdWlyZSgncmFuZG9tanMnKVxuXG5tb2R1bGUuZXhwb3J0cyA9IEZsb3dncmFwaFxuXG5mdW5jdGlvbiBGbG93Z3JhcGggKCkge1xuICBFdmVudEVtaXR0ZXIuY2FsbCh0aGlzKVxuICB0aGlzLm5vZGVzID0gW11cbiAgdGhpcy5lZGdlcyA9IFtdXG4gIHRoaXMuY29ubmVjdG9yID0ge1xuICAgIGFjdGl2ZTogZmFsc2UsXG4gICAgZnJvbToge30sXG4gICAgdG86IHt9XG4gIH1cbn1cblxuaW5oZXJpdHMoRmxvd2dyYXBoLCBFdmVudEVtaXR0ZXIpXG5cbkZsb3dncmFwaC5wcm90b3R5cGUuYWRkTm9kZSA9IGZ1bmN0aW9uIChub2RlLCBpbnBvcnRzLCBvdXRwb3J0cykge1xuICBpZiAodHlwZW9mIGlucG9ydHMgPT09ICdzdHJpbmcnKSBpbnBvcnRzID0gW2lucG9ydHNdXG4gIGlmICh0eXBlb2Ygb3V0cG9ydHMgPT09ICdzdHJpbmcnKSBvdXRwb3J0cyA9IFtvdXRwb3J0c11cblxuICB2YXIgb3B0aW9ucyA9IHtcbiAgICBpZDogcmFuZG9tKCdbYS16XVthLXowLTlfXXsxNn0nKSxcbiAgICB4OiAwLFxuICAgIHk6IDAsXG4gICAgaW5wb3J0czogaW5wb3J0cyB8fCBbJ2luJ10sXG4gICAgb3V0cG9ydHM6IG91dHBvcnRzIHx8IFsnb3V0J11cbiAgfVxuICBpZiAodHlwZW9mIG5vZGUgPT09ICdzdHJpbmcnKSBvcHRpb25zLmlkID0gbm9kZVxuICBlbHNlIG9wdGlvbnMgPSB4dGVuZChvcHRpb25zLCBub2RlKVxuXG4gIGlmICghL15bYS16XVthLXowLTlfXSokLy50ZXN0KG9wdGlvbnMuaWQpKSB0aHJvdyAobmV3IEVycm9yKCdJRCBjYW4gb25seSBiZSBbYS16XVthLXowLTlfXSsnKSlcbiAgaWYgKHRoaXMuZ2V0Tm9kZShvcHRpb25zLmlkKSkgdGhyb3cgKG5ldyBFcnJvcignTm9kZSBJRCBhbHJlYWR5IGV4aXN0cycpKVxuXG4gIHRoaXMubm9kZXMucHVzaChvcHRpb25zKVxuICB0aGlzLmVtaXQoJ25vZGUtYWRkZWQnLCBvcHRpb25zKVxuICByZXR1cm4gb3B0aW9uc1xufVxuXG5GbG93Z3JhcGgucHJvdG90eXBlLmFkZE5vZGVzID0gZnVuY3Rpb24gKG5vZGVzKSB7XG4gIG5vZGVzLmZvckVhY2godGhpcy5hZGROb2RlLmJpbmQodGhpcykpXG59XG5cbkZsb3dncmFwaC5wcm90b3R5cGUuZ2V0SW5wb3J0cyA9IGZ1bmN0aW9uIChub2RlKSB7XG4gIHJldHVybiB0aGlzLmdldE5vZGUobm9kZSkuaW5wb3J0cyB8fCBbXVxufVxuXG5GbG93Z3JhcGgucHJvdG90eXBlLmdldE91dHBvcnRzID0gZnVuY3Rpb24gKG5vZGUpIHtcbiAgcmV0dXJuIHRoaXMuZ2V0Tm9kZShub2RlKS5vdXRwb3J0cyB8fCBbXVxufVxuXG5GbG93Z3JhcGgucHJvdG90eXBlLmRlbGV0ZU5vZGUgPSBmdW5jdGlvbiAoaWQpIHtcbiAgdmFyIHJlbW92ZWRFZGdlcyA9IFtdXG4gIHRoaXMuZWRnZXMgPSB0aGlzLmVkZ2VzLmZpbHRlcihmdW5jdGlvbiAoZWRnZSkge1xuICAgIGlmIChlZGdlLnNvdXJjZS5pZCA9PT0gaWQgfHwgZWRnZS50YXJnZXQuaWQgPT09IGlkKSB7XG4gICAgICByZW1vdmVkRWRnZXMucHVzaChlZGdlKVxuICAgICAgcmV0dXJuIGZhbHNlXG4gICAgfVxuICAgIHJldHVybiB0cnVlXG4gIH0pXG4gIHJlbW92ZWRFZGdlcy5mb3JFYWNoKGZ1bmN0aW9uIChlZGdlKSB7XG4gICAgdGhpcy5lbWl0KCdlZGdlLWRlbGV0ZWQnLCBlZGdlKVxuICB9LmJpbmQodGhpcykpXG5cbiAgdmFyIGRlbGV0ZWROb2RlID0gbnVsbFxuICB0aGlzLm5vZGVzID0gdGhpcy5ub2Rlcy5maWx0ZXIoZnVuY3Rpb24gKG5vZGUpIHtcbiAgICBpZiAobm9kZS5pZCA9PT0gaWQpIGRlbGV0ZWROb2RlID0gbm9kZVxuICAgIGVsc2UgcmV0dXJuIHRydWVcbiAgfSlcbiAgaWYgKGRlbGV0ZWROb2RlKSB0aGlzLmVtaXQoJ25vZGUtZGVsZXRlZCcsIGRlbGV0ZWROb2RlKVxufVxuXG5GbG93Z3JhcGgucHJvdG90eXBlLmNvbm5lY3QgPSBmdW5jdGlvbiAoc291cmNlLCB0YXJnZXQsIHNvdXJjZVBvcnQsIHRhcmdldFBvcnQpIHtcbiAgaWYgKCFzb3VyY2VQb3J0KSBzb3VyY2VQb3J0ID0gdGhpcy5kZWZhdWx0T3V0cG9ydChzb3VyY2UpXG4gIGlmICghdGFyZ2V0UG9ydCkgdGFyZ2V0UG9ydCA9IHRoaXMuZGVmYXVsdElucG9ydCh0YXJnZXQpXG5cbiAgdmFyIGVkZ2UgPSB7XG4gICAgc291cmNlOiB7aWQ6IHNvdXJjZSwgcG9ydDogc291cmNlUG9ydH0sXG4gICAgdGFyZ2V0OiB7aWQ6IHRhcmdldCwgcG9ydDogdGFyZ2V0UG9ydH1cbiAgfVxuICB0aGlzLmVkZ2VzLnB1c2goZWRnZSlcbiAgdGhpcy5lbWl0KCdlZGdlLWFkZGVkJywgZWRnZSlcbn1cblxuRmxvd2dyYXBoLnByb3RvdHlwZS5kaXNjb25uZWN0ID0gZnVuY3Rpb24gKHNvdXJjZSwgdGFyZ2V0LCBzb3VyY2VQb3J0LCB0YXJnZXRQb3J0KSB7XG4gIHZhciByZW1vdmVkRWRnZSA9IG51bGxcblxuICB0aGlzLmVkZ2VzID0gdGhpcy5lZGdlcy5maWx0ZXIoZnVuY3Rpb24gKGVkZ2UpIHtcbiAgICBpZiAoZWRnZS5zb3VyY2UucG9ydCAhPT0gc291cmNlUG9ydCB8fCBlZGdlLnRhcmdldC5wb3J0ICE9PSB0YXJnZXRQb3J0KSByZXR1cm4gdHJ1ZVxuICAgIGlmIChlZGdlLnNvdXJjZS5pZCA9PT0gc291cmNlICYmIGVkZ2UudGFyZ2V0LmlkID09PSB0YXJnZXQpIHJlbW92ZWRFZGdlID0gZWRnZVxuICAgIGVsc2UgcmV0dXJuIHRydWVcbiAgfSlcbiAgaWYgKHJlbW92ZWRFZGdlKSB0aGlzLmVtaXQoJ2VkZ2UtZGVsZXRlZCcsIHJlbW92ZWRFZGdlKVxufVxuXG5GbG93Z3JhcGgucHJvdG90eXBlLmdldEVkZ2VzID0gZnVuY3Rpb24gKCkge1xuICByZXR1cm4gdGhpcy5lZGdlc1xufVxuXG5GbG93Z3JhcGgucHJvdG90eXBlLmdldEVkZ2UgPSBmdW5jdGlvbiAoc291cmNlLCB0YXJnZXQsIHNvdXJjZVBvcnQsIHRhcmdldFBvcnQpIHtcbiAgaWYgKCFzb3VyY2VQb3J0KSBzb3VyY2VQb3J0ID0gdGhpcy5kZWZhdWx0T3V0cG9ydChzb3VyY2UpXG4gIGlmICghdGFyZ2V0UG9ydCkgdGFyZ2V0UG9ydCA9IHRoaXMuZGVmYXVsdElucG9ydCh0YXJnZXQpXG5cbiAgcmV0dXJuIHRoaXMuZWRnZXMuZmlsdGVyKGZ1bmN0aW9uIChlZGdlKSB7XG4gICAgcmV0dXJuIGVkZ2Uuc291cmNlLmlkID09PSBzb3VyY2UgJiZcbiAgICAgICAgICBlZGdlLnNvdXJjZS5wb3J0ID09PSBzb3VyY2VQb3J0ICYmXG4gICAgICAgICAgZWRnZS50YXJnZXQuaWQgPT09IHRhcmdldCAmJlxuICAgICAgICAgIGVkZ2UudGFyZ2V0LnBvcnQgPT09IHRhcmdldFBvcnRcbiAgfSlbMF1cbn1cblxuRmxvd2dyYXBoLnByb3RvdHlwZS5kZWZhdWx0T3V0cG9ydCA9IGZ1bmN0aW9uIChub2RlKSB7XG4gIHZhciBvdXRwb3J0cyA9IHRoaXMuZ2V0Tm9kZShub2RlKS5vdXRwb3J0c1xuICByZXR1cm4gb3V0cG9ydHMubGVuZ3RoID09PSAxID8gb3V0cG9ydHNbMF0gOiBmYWxzZVxufVxuXG5GbG93Z3JhcGgucHJvdG90eXBlLmRlZmF1bHRJbnBvcnQgPSBmdW5jdGlvbiAobm9kZSkge1xuICB2YXIgaW5wb3J0cyA9IHRoaXMuZ2V0Tm9kZShub2RlKS5pbnBvcnRzXG4gIHJldHVybiBpbnBvcnRzLmxlbmd0aCA9PT0gMSA/IGlucG9ydHNbMF0gOiBmYWxzZVxufVxuXG5GbG93Z3JhcGgucHJvdG90eXBlLmdldE5vZGUgPSBmdW5jdGlvbiAoaWQpIHtcbiAgcmV0dXJuIGluZGV4QXJyYXkodGhpcy5ub2RlcywgJ2lkJylbaWRdXG59XG5cbkZsb3dncmFwaC5wcm90b3R5cGUuZ2V0Tm9kZXMgPSBmdW5jdGlvbiAoKSB7XG4gIHJldHVybiB0aGlzLm5vZGVzXG59XG5cbkZsb3dncmFwaC5wcm90b3R5cGUuZXhwb3J0ID0gZnVuY3Rpb24gKCkge1xuICByZXR1cm4ge25vZGVzOiB0aGlzLm5vZGVzLCBlZGdlczogdGhpcy5lZGdlc31cbn1cblxuRmxvd2dyYXBoLnByb3RvdHlwZS50b0pTT04gPSBmdW5jdGlvbiAoKSB7XG4gIHJldHVybiBKU09OLnN0cmluZ2lmeSh0aGlzLmV4cG9ydCgpKVxufVxuXG5GbG93Z3JhcGgucHJvdG90eXBlLmltcG9ydCA9IGZ1bmN0aW9uIChncmFwaCkge1xuICBpZiAodHlwZW9mIGdyYXBoID09PSAnc3RyaW5nJykgZ3JhcGggPSBKU09OLnBhcnNlKGdyYXBoKVxuICAvLyBUT0RPOiBWYWxpZGF0ZSBpbXBvcnRcbiAgdGhpcy5ub2RlcyA9IGdyYXBoLm5vZGVzXG4gIHRoaXMuZWRnZXMgPSBncmFwaC5lZGdlc1xufVxuIiwiJ3VzZSBzdHJpY3QnXG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gKGFycmF5LCBrZXkpIHtcbiAgaWYgKCFhcnJheSB8fCAha2V5KSByZXR1cm4ge31cbiAgdmFyIG9iamVjdCA9IHt9XG4gIGZvciAodmFyIGkgPSAwLCBsZW5ndGggPSBhcnJheS5sZW5ndGg7IGkgPCBsZW5ndGg7ICsraSkge1xuICAgIGlmIChhcnJheVtpXVtrZXldID09PSB1bmRlZmluZWQgfHwgYXJyYXlbaV1ba2V5XSA9PT0gbnVsbCkgYnJlYWtcbiAgICBvYmplY3RbYXJyYXlbaV1ba2V5XV0gPSBhcnJheVtpXVxuICB9XG4gIHJldHVybiBvYmplY3Rcbn1cbiIsInZhciByYW5kZXhwID0gcmVxdWlyZSgncmFuZGV4cCcpLnJhbmRleHA7XHJcblxyXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uKHBhdHRlcm4sIGF0dHJpYnV0ZXMpIHtcclxuICByZXR1cm4gcmFuZGV4cChwYXR0ZXJuLCBhdHRyaWJ1dGVzKTtcclxufSIsInZhciByZXQgPSByZXF1aXJlKCdyZXQnKTtcbnZhciBEUmFuZ2UgPSByZXF1aXJlKCdkaXNjb250aW51b3VzLXJhbmdlJyk7XG52YXIgdHlwZXMgPSByZXQudHlwZXM7XG5cblxuLyoqXG4gKiBJZiBjb2RlIGlzIGFscGhhYmV0aWMsIGNvbnZlcnRzIHRvIG90aGVyIGNhc2UuXG4gKiBJZiBub3QgYWxwaGFiZXRpYywgcmV0dXJucyBiYWNrIGNvZGUuXG4gKlxuICogQHBhcmFtIHtOdW1iZXJ9IGNvZGVcbiAqIEByZXR1cm4ge051bWJlcn1cbiAqL1xuZnVuY3Rpb24gdG9PdGhlckNhc2UoY29kZSkge1xuICByZXR1cm4gY29kZSArICg5NyA8PSBjb2RlICYmIGNvZGUgPD0gMTIyID8gLTMyIDpcbiAgICAgICAgICAgICAgICAgNjUgPD0gY29kZSAmJiBjb2RlIDw9IDkwICA/ICAzMiA6IDApO1xufVxuXG5cbi8qKlxuICogUmFuZG9tbHkgcmV0dXJucyBhIHRydWUgb3IgZmFsc2UgdmFsdWUuXG4gKlxuICogQHJldHVybiB7Qm9vbGVhbn1cbiAqL1xuZnVuY3Rpb24gcmFuZEJvb2woKSB7XG4gIHJldHVybiAhdGhpcy5yYW5kSW50KDAsIDEpO1xufTtcblxuXG4vKipcbiAqIFJhbmRvbWx5IHNlbGVjdHMgYW5kIHJldHVybnMgYSB2YWx1ZSBmcm9tIHRoZSBhcnJheS5cbiAqXG4gKiBAcGFyYW0ge0FycmF5LjxPYmplY3Q+fSBhcnJcbiAqIEByZXR1cm4ge09iamVjdH1cbiAqL1xuZnVuY3Rpb24gcmFuZFNlbGVjdChhcnIpIHtcbiAgaWYgKGFyciBpbnN0YW5jZW9mIERSYW5nZSkge1xuICAgIHJldHVybiBhcnIuaW5kZXgodGhpcy5yYW5kSW50KDAsIGFyci5sZW5ndGggLSAxKSk7XG4gIH1cbiAgcmV0dXJuIGFyclt0aGlzLnJhbmRJbnQoMCwgYXJyLmxlbmd0aCAtIDEpXTtcbn07XG5cblxuLyoqXG4gKiBEZXRlcm1pbmVzIGlmIGEgY2hhcmFjdGVyIGNvZGUgaXMgYWxwaGFiZXRpYyBhbmQgZGVjaWRlXG4gKiB0byBzd2l0Y2ggY2FzZSByYW5kb21seS5cbiAqXG4gKiBAcGFyYW0ge051bWJlcn0gY29kZVxuICogQHBhcmFtIHtCb29sZWFufSBpZ25vcmVDYXNlXG4gKiBAcmV0dXJuIHtTdHJpbmd9XG4gKi9cbmZ1bmN0aW9uIGNoYXIoY29kZSwgaWdub3JlQ2FzZSkge1xuICBjb2RlID0gaWdub3JlQ2FzZSAmJiByYW5kQm9vbC5jYWxsKHRoaXMpID8gdG9PdGhlckNhc2UoY29kZSkgOiBjb2RlO1xuICByZXR1cm4gU3RyaW5nLmZyb21DaGFyQ29kZShjb2RlKTtcbn07XG5cblxuLyoqXG4gKiBleHBhbmRzIGEgdG9rZW4gdG8gYSBEaXNjb250aW51b3VzUmFuZ2Ugb2YgY2hhcmFjdGVycyB3aGljaCBoYXMgYSBcbiAqIGxlbmd0aCBhbmQgYW4gaW5kZXggZnVuY3Rpb24gKGZvciByYW5kb20gc2VsZWN0aW5nKVxuICpcbiAqIEBwYXJhbSB7T2JqZWN0fSB0b2tlblxuICogQHJldHVybiB7RGlzY29udGludW91c1JhbmdlfVxuICovXG5mdW5jdGlvbiBleHBhbmQodG9rZW4pIHtcbiAgaWYgKHRva2VuLnR5cGUgPT09IHJldC50eXBlcy5DSEFSKSByZXR1cm4gbmV3IERSYW5nZSh0b2tlbi52YWx1ZSk7XG4gIGlmICh0b2tlbi50eXBlID09PSByZXQudHlwZXMuUkFOR0UpIHJldHVybiBuZXcgRFJhbmdlKHRva2VuLmZyb20sIHRva2VuLnRvKTtcbiAgaWYgKHRva2VuLnR5cGUgPT09IHJldC50eXBlcy5TRVQpIHtcbiAgICB2YXIgZHJhbmdlID0gbmV3IERSYW5nZSgpO1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgdG9rZW4uc2V0Lmxlbmd0aDsgaSsrKSB7XG4gICAgICBkcmFuZ2UuYWRkKGV4cGFuZC5jYWxsKHRoaXMsIHRva2VuLnNldFtpXSkpO1xuICAgIH1cbiAgICBpZiAodG9rZW4ubm90KSB7XG4gICAgICByZXR1cm4gdGhpcy5kZWZhdWx0UmFuZ2UuY2xvbmUoKS5zdWJ0cmFjdChkcmFuZ2UpO1xuICAgIH0gZWxzZSB7XG4gICAgICByZXR1cm4gZHJhbmdlO1xuICAgIH1cbiAgfVxuICB0aHJvdyBuZXcgRXJyb3IoJ3VuZXhwYW5kYWJsZSB0b2tlbiB0eXBlOiAnICsgdG9rZW4udHlwZSk7XG59O1xuXG5cbi8qKlxuICogQGNvbnN0cnVjdG9yXG4gKiBAcGFyYW0ge1JlZ0V4cHxTdHJpbmd9IHJlZ2V4cFxuICogQHBhcmFtIHtTdHJpbmd9IG1cbiAqL1xudmFyIFJhbmRFeHAgPSBtb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uKHJlZ2V4cCwgbSkge1xuICB0aGlzLmRlZmF1bHRSYW5nZSA9IHRoaXMuZGVmYXVsdFJhbmdlLmNsb25lKCk7XG4gIGlmIChyZWdleHAgaW5zdGFuY2VvZiBSZWdFeHApIHtcbiAgICB0aGlzLmlnbm9yZUNhc2UgPSByZWdleHAuaWdub3JlQ2FzZTtcbiAgICB0aGlzLm11bHRpbGluZSA9IHJlZ2V4cC5tdWx0aWxpbmU7XG4gICAgaWYgKHR5cGVvZiByZWdleHAubWF4ID09PSAnbnVtYmVyJykge1xuICAgICAgdGhpcy5tYXggPSByZWdleHAubWF4O1xuICAgIH1cbiAgICByZWdleHAgPSByZWdleHAuc291cmNlO1xuXG4gIH0gZWxzZSBpZiAodHlwZW9mIHJlZ2V4cCA9PT0gJ3N0cmluZycpIHtcbiAgICB0aGlzLmlnbm9yZUNhc2UgPSBtICYmIG0uaW5kZXhPZignaScpICE9PSAtMTtcbiAgICB0aGlzLm11bHRpbGluZSA9IG0gJiYgbS5pbmRleE9mKCdtJykgIT09IC0xO1xuICB9IGVsc2Uge1xuICAgIHRocm93IG5ldyBFcnJvcignRXhwZWN0ZWQgYSByZWdleHAgb3Igc3RyaW5nJyk7XG4gIH1cblxuICB0aGlzLnRva2VucyA9IHJldChyZWdleHApO1xufTtcblxuXG4vLyBXaGVuIGEgcmVwZXRpdGlvbmFsIHRva2VuIGhhcyBpdHMgbWF4IHNldCB0byBJbmZpbml0ZSxcbi8vIHJhbmRleHAgd29uJ3QgYWN0dWFsbHkgZ2VuZXJhdGUgYSByYW5kb20gYW1vdW50IGJldHdlZW4gbWluIGFuZCBJbmZpbml0ZVxuLy8gaW5zdGVhZCBpdCB3aWxsIHNlZSBJbmZpbml0ZSBhcyBtaW4gKyAxMDAuXG5SYW5kRXhwLnByb3RvdHlwZS5tYXggPSAxMDA7XG5cblxuLy8gR2VuZXJhdGVzIHRoZSByYW5kb20gc3RyaW5nLlxuUmFuZEV4cC5wcm90b3R5cGUuZ2VuID0gZnVuY3Rpb24oKSB7XG4gIHJldHVybiBnZW4uY2FsbCh0aGlzLCB0aGlzLnRva2VucywgW10pO1xufTtcblxuXG4vLyBFbmFibGVzIHVzZSBvZiByYW5kZXhwIHdpdGggYSBzaG9ydGVyIGNhbGwuXG5SYW5kRXhwLnJhbmRleHAgPSBmdW5jdGlvbihyZWdleHAsIG0pIHtcbiAgdmFyIHJhbmRleHA7XG5cbiAgaWYgKHJlZ2V4cC5fcmFuZGV4cCA9PT0gdW5kZWZpbmVkKSB7XG4gICAgcmFuZGV4cCA9IG5ldyBSYW5kRXhwKHJlZ2V4cCwgbSk7XG4gICAgcmVnZXhwLl9yYW5kZXhwID0gcmFuZGV4cDtcbiAgfSBlbHNlIHtcbiAgICByYW5kZXhwID0gcmVnZXhwLl9yYW5kZXhwO1xuICAgIGlmICh0eXBlb2YgcmVnZXhwLm1heCA9PT0gJ251bWJlcicpIHtcbiAgICAgIHJhbmRleHAubWF4ID0gcmVnZXhwLm1heDtcbiAgICB9XG4gICAgaWYgKHJlZ2V4cC5kZWZhdWx0UmFuZ2UgaW5zdGFuY2VvZiBEUmFuZ2UpIHtcbiAgICAgIHJhbmRleHAuZGVmYXVsdFJhbmdlID0gcmVnZXhwLmRlZmF1bHRSYW5nZTtcbiAgICB9XG4gICAgaWYgKHR5cGVvZiByZWdleHAucmFuZEludCA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgcmFuZGV4cC5yYW5kSW50ID0gcmVnZXhwLnJhbmRJbnQ7XG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIHJhbmRleHAuZ2VuKCk7XG59O1xuXG5cbi8vIFRoaXMgZW5hYmxlcyBzdWdhcnkgL3JlZ2V4cC8uZ2VuIHN5bnRheC5cblJhbmRFeHAuc3VnYXIgPSBmdW5jdGlvbigpIHtcbiAgLyoganNoaW50IGZyZWV6ZTpmYWxzZSAqL1xuICBSZWdFeHAucHJvdG90eXBlLmdlbiA9IGZ1bmN0aW9uKCkge1xuICAgIHJldHVybiBSYW5kRXhwLnJhbmRleHAodGhpcyk7XG4gIH07XG59O1xuXG4vLyBUaGlzIGFsbG93cyBleHBhbmRpbmcgdG8gaW5jbHVkZSBhZGRpdGlvbmFsIGNoYXJhY3RlcnNcbi8vIGZvciBpbnN0YW5jZTogUmFuZEV4cC5kZWZhdWx0UmFuZ2UuYWRkKDAsIDY1NTM1KTtcblJhbmRFeHAucHJvdG90eXBlLmRlZmF1bHRSYW5nZSA9IG5ldyBEUmFuZ2UoMzIsIDEyNik7XG5cblxuXG5cblxuXG4vKipcbiAqIFJhbmRvbWx5IGdlbmVyYXRlcyBhbmQgcmV0dXJucyBhIG51bWJlciBiZXR3ZWVuIGEgYW5kIGIgKGluY2x1c2l2ZSkuXG4gKlxuICogQHBhcmFtIHtOdW1iZXJ9IGFcbiAqIEBwYXJhbSB7TnVtYmVyfSBiXG4gKiBAcmV0dXJuIHtOdW1iZXJ9XG4gKi9cblJhbmRFeHAucHJvdG90eXBlLnJhbmRJbnQgPSBmdW5jdGlvbihhLCBiKSB7XG4gIHJldHVybiBhICsgTWF0aC5mbG9vcihNYXRoLnJhbmRvbSgpICogKDEgKyBiIC0gYSkpO1xufTtcblxuXG4vKipcbiAqIEdlbmVyYXRlIHJhbmRvbSBzdHJpbmcgbW9kZWxlZCBhZnRlciBnaXZlbiB0b2tlbnMuXG4gKlxuICogQHBhcmFtIHtPYmplY3R9IHRva2VuXG4gKiBAcGFyYW0ge0FycmF5LjxTdHJpbmc+fSBncm91cHNcbiAqIEByZXR1cm4ge1N0cmluZ31cbiAqL1xuZnVuY3Rpb24gZ2VuKHRva2VuLCBncm91cHMpIHtcbiAgdmFyIHN0YWNrLCBzdHIsIG4sIGksIGw7XG5cbiAgc3dpdGNoICh0b2tlbi50eXBlKSB7XG5cblxuICAgIGNhc2UgdHlwZXMuUk9PVDpcbiAgICBjYXNlIHR5cGVzLkdST1VQOlxuICAgICAgaWYgKHRva2VuLm5vdEZvbGxvd2VkQnkpIHsgcmV0dXJuICcnOyB9XG5cbiAgICAgIC8vIEluc2VydCBwbGFjZWhvbGRlciB1bnRpbCBncm91cCBzdHJpbmcgaXMgZ2VuZXJhdGVkLlxuICAgICAgaWYgKHRva2VuLnJlbWVtYmVyICYmIHRva2VuLmdyb3VwTnVtYmVyID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgdG9rZW4uZ3JvdXBOdW1iZXIgPSBncm91cHMucHVzaChudWxsKSAtIDE7XG4gICAgICB9XG5cbiAgICAgIHN0YWNrID0gdG9rZW4ub3B0aW9ucyA/IHJhbmRTZWxlY3QuY2FsbCh0aGlzLCB0b2tlbi5vcHRpb25zKSA6IHRva2VuLnN0YWNrO1xuXG4gICAgICBzdHIgPSAnJztcbiAgICAgIGZvciAoaSA9IDAsIGwgPSBzdGFjay5sZW5ndGg7IGkgPCBsOyBpKyspIHtcbiAgICAgICAgc3RyICs9IGdlbi5jYWxsKHRoaXMsIHN0YWNrW2ldLCBncm91cHMpO1xuICAgICAgfVxuXG4gICAgICBpZiAodG9rZW4ucmVtZW1iZXIpIHtcbiAgICAgICAgZ3JvdXBzW3Rva2VuLmdyb3VwTnVtYmVyXSA9IHN0cjtcbiAgICAgIH1cbiAgICAgIHJldHVybiBzdHI7XG5cblxuICAgIGNhc2UgdHlwZXMuUE9TSVRJT046XG4gICAgICAvLyBEbyBub3RoaW5nIGZvciBub3cuXG4gICAgICByZXR1cm4gJyc7XG5cblxuICAgIGNhc2UgdHlwZXMuU0VUOlxuXG4gICAgICB2YXIgZXhwYW5kZWRfc2V0ID0gZXhwYW5kLmNhbGwodGhpcywgdG9rZW4pO1xuICAgICAgaWYgKCFleHBhbmRlZF9zZXQubGVuZ3RoKSByZXR1cm4gJyc7XG4gICAgICByZXR1cm4gY2hhci5jYWxsKHRoaXMsIHJhbmRTZWxlY3QuY2FsbCh0aGlzLCBleHBhbmRlZF9zZXQpLCB0aGlzLmlnbm9yZUNhc2UpO1xuXG4gICAgY2FzZSB0eXBlcy5SQU5HRTpcbiAgICAgIHJldHVybiBjaGFyLmNhbGwodGhpcywgdGhpcy5yYW5kSW50KHRva2VuLmZyb20sIHRva2VuLnRvKSwgdGhpcy5pZ25vcmVDYXNlKTtcblxuXG4gICAgY2FzZSB0eXBlcy5SRVBFVElUSU9OOlxuICAgICAgLy8gUmFuZG9tbHkgZ2VuZXJhdGUgbnVtYmVyIGJldHdlZW4gbWluIGFuZCBtYXguXG4gICAgICBuID0gdGhpcy5yYW5kSW50KHRva2VuLm1pbixcbiAgICAgICAgICAgICAgdG9rZW4ubWF4ID09PSBJbmZpbml0eSA/IHRva2VuLm1pbiArIHRoaXMubWF4IDogdG9rZW4ubWF4KTtcblxuICAgICAgc3RyID0gJyc7XG4gICAgICBmb3IgKGkgPSAwOyBpIDwgbjsgaSsrKSB7XG4gICAgICAgIHN0ciArPSBnZW4uY2FsbCh0aGlzLCB0b2tlbi52YWx1ZSwgZ3JvdXBzKTtcbiAgICAgIH1cblxuICAgICAgcmV0dXJuIHN0cjtcblxuXG4gICAgY2FzZSB0eXBlcy5SRUZFUkVOQ0U6XG4gICAgICByZXR1cm4gZ3JvdXBzW3Rva2VuLnZhbHVlIC0gMV0gfHwgJyc7XG5cblxuICAgIGNhc2UgdHlwZXMuQ0hBUjpcbiAgICAgIHJldHVybiBjaGFyLmNhbGwodGhpcywgdG9rZW4udmFsdWUsIHRoaXMuaWdub3JlQ2FzZSk7XG4gIH1cbn1cblxuXG4iLCIvL3Byb3RlY3RlZCBoZWxwZXIgY2xhc3NcbmZ1bmN0aW9uIF9TdWJSYW5nZShsb3csIGhpZ2gpIHtcbiAgICB0aGlzLmxvdyA9IGxvdztcbiAgICB0aGlzLmhpZ2ggPSBoaWdoO1xuICAgIHRoaXMubGVuZ3RoID0gMSArIGhpZ2ggLSBsb3c7XG59XG5cbl9TdWJSYW5nZS5wcm90b3R5cGUub3ZlcmxhcHMgPSBmdW5jdGlvbiAocmFuZ2UpIHtcbiAgICByZXR1cm4gISh0aGlzLmhpZ2ggPCByYW5nZS5sb3cgfHwgdGhpcy5sb3cgPiByYW5nZS5oaWdoKTtcbn07XG5cbl9TdWJSYW5nZS5wcm90b3R5cGUudG91Y2hlcyA9IGZ1bmN0aW9uIChyYW5nZSkge1xuICAgIHJldHVybiAhKHRoaXMuaGlnaCArIDEgPCByYW5nZS5sb3cgfHwgdGhpcy5sb3cgLSAxID4gcmFuZ2UuaGlnaCk7XG59O1xuXG4vL3JldHVybnMgaW5jbHVzaXZlIGNvbWJpbmF0aW9uIG9mIF9TdWJSYW5nZXMgYXMgYSBfU3ViUmFuZ2Vcbl9TdWJSYW5nZS5wcm90b3R5cGUuYWRkID0gZnVuY3Rpb24gKHJhbmdlKSB7XG4gICAgcmV0dXJuIHRoaXMudG91Y2hlcyhyYW5nZSkgJiYgbmV3IF9TdWJSYW5nZShNYXRoLm1pbih0aGlzLmxvdywgcmFuZ2UubG93KSwgTWF0aC5tYXgodGhpcy5oaWdoLCByYW5nZS5oaWdoKSk7XG59O1xuXG4vL3JldHVybnMgc3VidHJhY3Rpb24gb2YgX1N1YlJhbmdlcyBhcyBhbiBhcnJheSBvZiBfU3ViUmFuZ2VzICh0aGVyZSdzIGEgY2FzZSB3aGVyZSBzdWJ0cmFjdGlvbiBkaXZpZGVzIGl0IGluIDIpXG5fU3ViUmFuZ2UucHJvdG90eXBlLnN1YnRyYWN0ID0gZnVuY3Rpb24gKHJhbmdlKSB7XG4gICAgaWYgKCF0aGlzLm92ZXJsYXBzKHJhbmdlKSkgcmV0dXJuIGZhbHNlO1xuICAgIGlmIChyYW5nZS5sb3cgPD0gdGhpcy5sb3cgJiYgcmFuZ2UuaGlnaCA+PSB0aGlzLmhpZ2gpIHJldHVybiBbXTtcbiAgICBpZiAocmFuZ2UubG93ID4gdGhpcy5sb3cgJiYgcmFuZ2UuaGlnaCA8IHRoaXMuaGlnaCkgcmV0dXJuIFtuZXcgX1N1YlJhbmdlKHRoaXMubG93LCByYW5nZS5sb3cgLSAxKSwgbmV3IF9TdWJSYW5nZShyYW5nZS5oaWdoICsgMSwgdGhpcy5oaWdoKV07XG4gICAgaWYgKHJhbmdlLmxvdyA8PSB0aGlzLmxvdykgcmV0dXJuIFtuZXcgX1N1YlJhbmdlKHJhbmdlLmhpZ2ggKyAxLCB0aGlzLmhpZ2gpXTtcbiAgICByZXR1cm4gW25ldyBfU3ViUmFuZ2UodGhpcy5sb3csIHJhbmdlLmxvdyAtIDEpXTtcbn07XG5cbl9TdWJSYW5nZS5wcm90b3R5cGUudG9TdHJpbmcgPSBmdW5jdGlvbiAoKSB7XG4gICAgaWYgKHRoaXMubG93ID09IHRoaXMuaGlnaCkgcmV0dXJuIHRoaXMubG93LnRvU3RyaW5nKCk7XG4gICAgcmV0dXJuIHRoaXMubG93ICsgJy0nICsgdGhpcy5oaWdoO1xufTtcblxuX1N1YlJhbmdlLnByb3RvdHlwZS5jbG9uZSA9IGZ1bmN0aW9uICgpIHtcbiAgICByZXR1cm4gbmV3IF9TdWJSYW5nZSh0aGlzLmxvdywgdGhpcy5oaWdoKTtcbn07XG5cblxuXG5cbmZ1bmN0aW9uIERpc2NvbnRpbnVvdXNSYW5nZShhLCBiKSB7XG4gICAgaWYgKHRoaXMgaW5zdGFuY2VvZiBEaXNjb250aW51b3VzUmFuZ2UpIHtcbiAgICAgICAgdGhpcy5yYW5nZXMgPSBbXTtcbiAgICAgICAgdGhpcy5sZW5ndGggPSAwO1xuICAgICAgICBpZiAoYSAhPT0gdW5kZWZpbmVkKSB0aGlzLmFkZChhLCBiKTtcbiAgICB9IGVsc2Uge1xuICAgICAgICByZXR1cm4gbmV3IERpc2NvbnRpbnVvdXNSYW5nZShhLCBiKTtcbiAgICB9XG59XG5cbmZ1bmN0aW9uIF91cGRhdGVfbGVuZ3RoKHNlbGYpIHtcbiAgICBzZWxmLmxlbmd0aCA9IHNlbGYucmFuZ2VzLnJlZHVjZShmdW5jdGlvbiAocHJldmlvdXMsIHJhbmdlKSB7cmV0dXJuIHByZXZpb3VzICsgcmFuZ2UubGVuZ3RofSwgMCk7XG59XG5cbkRpc2NvbnRpbnVvdXNSYW5nZS5wcm90b3R5cGUuYWRkID0gZnVuY3Rpb24gKGEsIGIpIHtcbiAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgZnVuY3Rpb24gX2FkZChzdWJyYW5nZSkge1xuICAgICAgICB2YXIgbmV3X3JhbmdlcyA9IFtdO1xuICAgICAgICB2YXIgaSA9IDA7XG4gICAgICAgIHdoaWxlIChpIDwgc2VsZi5yYW5nZXMubGVuZ3RoICYmICFzdWJyYW5nZS50b3VjaGVzKHNlbGYucmFuZ2VzW2ldKSkge1xuICAgICAgICAgICAgbmV3X3Jhbmdlcy5wdXNoKHNlbGYucmFuZ2VzW2ldLmNsb25lKCkpO1xuICAgICAgICAgICAgaSsrO1xuICAgICAgICB9XG4gICAgICAgIHdoaWxlIChpIDwgc2VsZi5yYW5nZXMubGVuZ3RoICYmIHN1YnJhbmdlLnRvdWNoZXMoc2VsZi5yYW5nZXNbaV0pKSB7XG4gICAgICAgICAgICBzdWJyYW5nZSA9IHN1YnJhbmdlLmFkZChzZWxmLnJhbmdlc1tpXSk7XG4gICAgICAgICAgICBpKys7XG4gICAgICAgIH1cbiAgICAgICAgbmV3X3Jhbmdlcy5wdXNoKHN1YnJhbmdlKTtcbiAgICAgICAgd2hpbGUgKGkgPCBzZWxmLnJhbmdlcy5sZW5ndGgpIHtcbiAgICAgICAgICAgIG5ld19yYW5nZXMucHVzaChzZWxmLnJhbmdlc1tpXS5jbG9uZSgpKTtcbiAgICAgICAgICAgIGkrKztcbiAgICAgICAgfVxuICAgICAgICBzZWxmLnJhbmdlcyA9IG5ld19yYW5nZXM7XG4gICAgICAgIF91cGRhdGVfbGVuZ3RoKHNlbGYpO1xuICAgIH1cblxuICAgIGlmIChhIGluc3RhbmNlb2YgRGlzY29udGludW91c1JhbmdlKSB7XG4gICAgICAgIGEucmFuZ2VzLmZvckVhY2goX2FkZCk7XG4gICAgfSBlbHNlIHtcbiAgICAgICAgaWYgKGEgaW5zdGFuY2VvZiBfU3ViUmFuZ2UpIHtcbiAgICAgICAgICAgIF9hZGQoYSk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBpZiAoYiA9PT0gdW5kZWZpbmVkKSBiID0gYTtcbiAgICAgICAgICAgIF9hZGQobmV3IF9TdWJSYW5nZShhLCBiKSk7XG4gICAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIHRoaXM7XG59O1xuXG5EaXNjb250aW51b3VzUmFuZ2UucHJvdG90eXBlLnN1YnRyYWN0ID0gZnVuY3Rpb24gKGEsIGIpIHtcbiAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgZnVuY3Rpb24gX3N1YnRyYWN0KHN1YnJhbmdlKSB7XG4gICAgICAgIHZhciBuZXdfcmFuZ2VzID0gW107XG4gICAgICAgIHZhciBpID0gMDtcbiAgICAgICAgd2hpbGUgKGkgPCBzZWxmLnJhbmdlcy5sZW5ndGggJiYgIXN1YnJhbmdlLm92ZXJsYXBzKHNlbGYucmFuZ2VzW2ldKSkge1xuICAgICAgICAgICAgbmV3X3Jhbmdlcy5wdXNoKHNlbGYucmFuZ2VzW2ldLmNsb25lKCkpO1xuICAgICAgICAgICAgaSsrO1xuICAgICAgICB9XG4gICAgICAgIHdoaWxlIChpIDwgc2VsZi5yYW5nZXMubGVuZ3RoICYmIHN1YnJhbmdlLm92ZXJsYXBzKHNlbGYucmFuZ2VzW2ldKSkge1xuICAgICAgICAgICAgbmV3X3JhbmdlcyA9IG5ld19yYW5nZXMuY29uY2F0KHNlbGYucmFuZ2VzW2ldLnN1YnRyYWN0KHN1YnJhbmdlKSk7XG4gICAgICAgICAgICBpKys7XG4gICAgICAgIH1cbiAgICAgICAgd2hpbGUgKGkgPCBzZWxmLnJhbmdlcy5sZW5ndGgpIHtcbiAgICAgICAgICAgIG5ld19yYW5nZXMucHVzaChzZWxmLnJhbmdlc1tpXS5jbG9uZSgpKTtcbiAgICAgICAgICAgIGkrKztcbiAgICAgICAgfVxuICAgICAgICBzZWxmLnJhbmdlcyA9IG5ld19yYW5nZXM7XG4gICAgICAgIF91cGRhdGVfbGVuZ3RoKHNlbGYpO1xuICAgIH1cbiAgICBpZiAoYSBpbnN0YW5jZW9mIERpc2NvbnRpbnVvdXNSYW5nZSkge1xuICAgICAgICBhLnJhbmdlcy5mb3JFYWNoKF9zdWJ0cmFjdCk7XG4gICAgfSBlbHNlIHtcbiAgICAgICAgaWYgKGEgaW5zdGFuY2VvZiBfU3ViUmFuZ2UpIHtcbiAgICAgICAgICAgIF9zdWJ0cmFjdChhKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGlmIChiID09PSB1bmRlZmluZWQpIGIgPSBhO1xuICAgICAgICAgICAgX3N1YnRyYWN0KG5ldyBfU3ViUmFuZ2UoYSwgYikpO1xuICAgICAgICB9XG4gICAgfVxuICAgIHJldHVybiB0aGlzO1xufTtcblxuXG5EaXNjb250aW51b3VzUmFuZ2UucHJvdG90eXBlLmluZGV4ID0gZnVuY3Rpb24gKGluZGV4KSB7XG4gICAgdmFyIGkgPSAwO1xuICAgIHdoaWxlIChpIDwgdGhpcy5yYW5nZXMubGVuZ3RoICYmIHRoaXMucmFuZ2VzW2ldLmxlbmd0aCA8PSBpbmRleCkge1xuICAgICAgICBpbmRleCAtPSB0aGlzLnJhbmdlc1tpXS5sZW5ndGg7XG4gICAgICAgIGkrKztcbiAgICB9XG4gICAgaWYgKGkgPj0gdGhpcy5yYW5nZXMubGVuZ3RoKSByZXR1cm4gbnVsbDtcbiAgICByZXR1cm4gdGhpcy5yYW5nZXNbaV0ubG93ICsgaW5kZXg7XG59O1xuXG5cbkRpc2NvbnRpbnVvdXNSYW5nZS5wcm90b3R5cGUudG9TdHJpbmcgPSBmdW5jdGlvbiAoKSB7XG4gICAgcmV0dXJuICdbICcgKyB0aGlzLnJhbmdlcy5qb2luKCcsICcpICsgJyBdJ1xufTtcblxuRGlzY29udGludW91c1JhbmdlLnByb3RvdHlwZS5jbG9uZSA9IGZ1bmN0aW9uICgpIHtcbiAgICByZXR1cm4gbmV3IERpc2NvbnRpbnVvdXNSYW5nZSh0aGlzKTtcbn07XG5cbm1vZHVsZS5leHBvcnRzID0gRGlzY29udGludW91c1JhbmdlO1xuIiwidmFyIHV0aWwgICAgICA9IHJlcXVpcmUoJy4vdXRpbCcpO1xudmFyIHR5cGVzICAgICA9IHJlcXVpcmUoJy4vdHlwZXMnKTtcbnZhciBzZXRzICAgICAgPSByZXF1aXJlKCcuL3NldHMnKTtcbnZhciBwb3NpdGlvbnMgPSByZXF1aXJlKCcuL3Bvc2l0aW9ucycpO1xuXG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24ocmVnZXhwU3RyKSB7XG4gIHZhciBpID0gMCwgbCwgYyxcbiAgICAgIHN0YXJ0ID0geyB0eXBlOiB0eXBlcy5ST09ULCBzdGFjazogW119LFxuXG4gICAgICAvLyBLZWVwIHRyYWNrIG9mIGxhc3QgY2xhdXNlL2dyb3VwIGFuZCBzdGFjay5cbiAgICAgIGxhc3RHcm91cCA9IHN0YXJ0LFxuICAgICAgbGFzdCA9IHN0YXJ0LnN0YWNrLFxuICAgICAgZ3JvdXBTdGFjayA9IFtdO1xuXG5cbiAgdmFyIHJlcGVhdEVyciA9IGZ1bmN0aW9uKGkpIHtcbiAgICB1dGlsLmVycm9yKHJlZ2V4cFN0ciwgJ05vdGhpbmcgdG8gcmVwZWF0IGF0IGNvbHVtbiAnICsgKGkgLSAxKSk7XG4gIH07XG5cbiAgLy8gRGVjb2RlIGEgZmV3IGVzY2FwZWQgY2hhcmFjdGVycy5cbiAgdmFyIHN0ciA9IHV0aWwuc3RyVG9DaGFycyhyZWdleHBTdHIpO1xuICBsID0gc3RyLmxlbmd0aDtcblxuICAvLyBJdGVyYXRlIHRocm91Z2ggZWFjaCBjaGFyYWN0ZXIgaW4gc3RyaW5nLlxuICB3aGlsZSAoaSA8IGwpIHtcbiAgICBjID0gc3RyW2krK107XG5cbiAgICBzd2l0Y2ggKGMpIHtcbiAgICAgIC8vIEhhbmRsZSBlc2NhcGVkIGNoYXJhY3RlcnMsIGluY2x1ZXMgYSBmZXcgc2V0cy5cbiAgICAgIGNhc2UgJ1xcXFwnOlxuICAgICAgICBjID0gc3RyW2krK107XG5cbiAgICAgICAgc3dpdGNoIChjKSB7XG4gICAgICAgICAgY2FzZSAnYic6XG4gICAgICAgICAgICBsYXN0LnB1c2gocG9zaXRpb25zLndvcmRCb3VuZGFyeSgpKTtcbiAgICAgICAgICAgIGJyZWFrO1xuXG4gICAgICAgICAgY2FzZSAnQic6XG4gICAgICAgICAgICBsYXN0LnB1c2gocG9zaXRpb25zLm5vbldvcmRCb3VuZGFyeSgpKTtcbiAgICAgICAgICAgIGJyZWFrO1xuXG4gICAgICAgICAgY2FzZSAndyc6XG4gICAgICAgICAgICBsYXN0LnB1c2goc2V0cy53b3JkcygpKTtcbiAgICAgICAgICAgIGJyZWFrO1xuXG4gICAgICAgICAgY2FzZSAnVyc6XG4gICAgICAgICAgICBsYXN0LnB1c2goc2V0cy5ub3RXb3JkcygpKTtcbiAgICAgICAgICAgIGJyZWFrO1xuXG4gICAgICAgICAgY2FzZSAnZCc6XG4gICAgICAgICAgICBsYXN0LnB1c2goc2V0cy5pbnRzKCkpO1xuICAgICAgICAgICAgYnJlYWs7XG5cbiAgICAgICAgICBjYXNlICdEJzpcbiAgICAgICAgICAgIGxhc3QucHVzaChzZXRzLm5vdEludHMoKSk7XG4gICAgICAgICAgICBicmVhaztcblxuICAgICAgICAgIGNhc2UgJ3MnOlxuICAgICAgICAgICAgbGFzdC5wdXNoKHNldHMud2hpdGVzcGFjZSgpKTtcbiAgICAgICAgICAgIGJyZWFrO1xuXG4gICAgICAgICAgY2FzZSAnUyc6XG4gICAgICAgICAgICBsYXN0LnB1c2goc2V0cy5ub3RXaGl0ZXNwYWNlKCkpO1xuICAgICAgICAgICAgYnJlYWs7XG5cbiAgICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgICAgLy8gQ2hlY2sgaWYgYyBpcyBpbnRlZ2VyLlxuICAgICAgICAgICAgLy8gSW4gd2hpY2ggY2FzZSBpdCdzIGEgcmVmZXJlbmNlLlxuICAgICAgICAgICAgaWYgKC9cXGQvLnRlc3QoYykpIHtcbiAgICAgICAgICAgICAgbGFzdC5wdXNoKHsgdHlwZTogdHlwZXMuUkVGRVJFTkNFLCB2YWx1ZTogcGFyc2VJbnQoYywgMTApIH0pO1xuXG4gICAgICAgICAgICAvLyBFc2NhcGVkIGNoYXJhY3Rlci5cbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgIGxhc3QucHVzaCh7IHR5cGU6IHR5cGVzLkNIQVIsIHZhbHVlOiBjLmNoYXJDb2RlQXQoMCkgfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBicmVhaztcblxuXG4gICAgICAvLyBQb3NpdGlvbmFscy5cbiAgICAgIGNhc2UgJ14nOlxuICAgICAgICAgIGxhc3QucHVzaChwb3NpdGlvbnMuYmVnaW4oKSk7XG4gICAgICAgIGJyZWFrO1xuXG4gICAgICBjYXNlICckJzpcbiAgICAgICAgICBsYXN0LnB1c2gocG9zaXRpb25zLmVuZCgpKTtcbiAgICAgICAgYnJlYWs7XG5cblxuICAgICAgLy8gSGFuZGxlIGN1c3RvbSBzZXRzLlxuICAgICAgY2FzZSAnWyc6XG4gICAgICAgIC8vIENoZWNrIGlmIHRoaXMgY2xhc3MgaXMgJ2FudGknIGkuZS4gW15hYmNdLlxuICAgICAgICB2YXIgbm90O1xuICAgICAgICBpZiAoc3RyW2ldID09PSAnXicpIHtcbiAgICAgICAgICBub3QgPSB0cnVlO1xuICAgICAgICAgIGkrKztcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBub3QgPSBmYWxzZTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIEdldCBhbGwgdGhlIGNoYXJhY3RlcnMgaW4gY2xhc3MuXG4gICAgICAgIHZhciBjbGFzc1Rva2VucyA9IHV0aWwudG9rZW5pemVDbGFzcyhzdHIuc2xpY2UoaSksIHJlZ2V4cFN0cik7XG5cbiAgICAgICAgLy8gSW5jcmVhc2UgaW5kZXggYnkgbGVuZ3RoIG9mIGNsYXNzLlxuICAgICAgICBpICs9IGNsYXNzVG9rZW5zWzFdO1xuICAgICAgICBsYXN0LnB1c2goe1xuICAgICAgICAgICAgdHlwZTogdHlwZXMuU0VUXG4gICAgICAgICAgLCBzZXQ6IGNsYXNzVG9rZW5zWzBdXG4gICAgICAgICAgLCBub3Q6IG5vdFxuICAgICAgICB9KTtcblxuICAgICAgICBicmVhaztcblxuXG4gICAgICAvLyBDbGFzcyBvZiBhbnkgY2hhcmFjdGVyIGV4Y2VwdCBcXG4uXG4gICAgICBjYXNlICcuJzpcbiAgICAgICAgbGFzdC5wdXNoKHNldHMuYW55Q2hhcigpKTtcbiAgICAgICAgYnJlYWs7XG5cblxuICAgICAgLy8gUHVzaCBncm91cCBvbnRvIHN0YWNrLlxuICAgICAgY2FzZSAnKCc6XG4gICAgICAgIC8vIENyZWF0ZSBncm91cC5cbiAgICAgICAgdmFyIGdyb3VwID0ge1xuICAgICAgICAgICAgdHlwZTogdHlwZXMuR1JPVVBcbiAgICAgICAgICAsIHN0YWNrOiBbXVxuICAgICAgICAgICwgcmVtZW1iZXI6IHRydWVcbiAgICAgICAgfTtcblxuICAgICAgICBjID0gc3RyW2ldO1xuXG4gICAgICAgIC8vIGlmIGlmIHRoaXMgaXMgYSBzcGVjaWFsIGtpbmQgb2YgZ3JvdXAuXG4gICAgICAgIGlmIChjID09PSAnPycpIHtcbiAgICAgICAgICBjID0gc3RyW2kgKyAxXTtcbiAgICAgICAgICBpICs9IDI7XG5cbiAgICAgICAgICAvLyBNYXRjaCBpZiBmb2xsb3dlZCBieS5cbiAgICAgICAgICBpZiAoYyA9PT0gJz0nKSB7XG4gICAgICAgICAgICBncm91cC5mb2xsb3dlZEJ5ID0gdHJ1ZTtcblxuICAgICAgICAgIC8vIE1hdGNoIGlmIG5vdCBmb2xsb3dlZCBieS5cbiAgICAgICAgICB9IGVsc2UgaWYgKGMgPT09ICchJykge1xuICAgICAgICAgICAgZ3JvdXAubm90Rm9sbG93ZWRCeSA9IHRydWU7XG5cbiAgICAgICAgICB9IGVsc2UgaWYgKGMgIT09ICc6Jykge1xuICAgICAgICAgICAgdXRpbC5lcnJvcihyZWdleHBTdHIsXG4gICAgICAgICAgICAgICAgJ0ludmFsaWQgZ3JvdXAsIGNoYXJhY3RlciBcXCcnICsgYyArICdcXCcgYWZ0ZXIgXFwnP1xcJyBhdCBjb2x1bW4gJyArXG4gICAgICAgICAgICAgICAgKGkgLSAxKSk7XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgZ3JvdXAucmVtZW1iZXIgPSBmYWxzZTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIEluc2VydCBzdWJncm91cCBpbnRvIGN1cnJlbnQgZ3JvdXAgc3RhY2suXG4gICAgICAgIGxhc3QucHVzaChncm91cCk7XG5cbiAgICAgICAgLy8gUmVtZW1iZXIgdGhlIGN1cnJlbnQgZ3JvdXAgZm9yIHdoZW4gdGhlIGdyb3VwIGNsb3Nlcy5cbiAgICAgICAgZ3JvdXBTdGFjay5wdXNoKGxhc3RHcm91cCk7XG5cbiAgICAgICAgLy8gTWFrZSB0aGlzIG5ldyBncm91cCB0aGUgY3VycmVudCBncm91cC5cbiAgICAgICAgbGFzdEdyb3VwID0gZ3JvdXA7XG4gICAgICAgIGxhc3QgPSBncm91cC5zdGFjaztcbiAgICAgICAgYnJlYWs7XG5cblxuICAgICAgLy8gUG9wIGdyb3VwIG91dCBvZiBzdGFjay5cbiAgICAgIGNhc2UgJyknOlxuICAgICAgICBpZiAoZ3JvdXBTdGFjay5sZW5ndGggPT09IDApIHtcbiAgICAgICAgICB1dGlsLmVycm9yKHJlZ2V4cFN0ciwgJ1VubWF0Y2hlZCApIGF0IGNvbHVtbiAnICsgKGkgLSAxKSk7XG4gICAgICAgIH1cbiAgICAgICAgbGFzdEdyb3VwID0gZ3JvdXBTdGFjay5wb3AoKTtcblxuICAgICAgICAvLyBDaGVjayBpZiB0aGlzIGdyb3VwIGhhcyBhIFBJUEUuXG4gICAgICAgIC8vIFRvIGdldCBiYWNrIHRoZSBjb3JyZWN0IGxhc3Qgc3RhY2suXG4gICAgICAgIGxhc3QgPSBsYXN0R3JvdXAub3B0aW9ucyA/IGxhc3RHcm91cC5vcHRpb25zW2xhc3RHcm91cC5vcHRpb25zLmxlbmd0aCAtIDFdIDogbGFzdEdyb3VwLnN0YWNrO1xuICAgICAgICBicmVhaztcblxuXG4gICAgICAvLyBVc2UgcGlwZSBjaGFyYWN0ZXIgdG8gZ2l2ZSBtb3JlIGNob2ljZXMuXG4gICAgICBjYXNlICd8JzpcbiAgICAgICAgLy8gQ3JlYXRlIGFycmF5IHdoZXJlIG9wdGlvbnMgYXJlIGlmIHRoaXMgaXMgdGhlIGZpcnN0IFBJUEVcbiAgICAgICAgLy8gaW4gdGhpcyBjbGF1c2UuXG4gICAgICAgIGlmICghbGFzdEdyb3VwLm9wdGlvbnMpIHtcbiAgICAgICAgICBsYXN0R3JvdXAub3B0aW9ucyA9IFtsYXN0R3JvdXAuc3RhY2tdO1xuICAgICAgICAgIGRlbGV0ZSBsYXN0R3JvdXAuc3RhY2s7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBDcmVhdGUgYSBuZXcgc3RhY2sgYW5kIGFkZCB0byBvcHRpb25zIGZvciByZXN0IG9mIGNsYXVzZS5cbiAgICAgICAgdmFyIHN0YWNrID0gW107XG4gICAgICAgIGxhc3RHcm91cC5vcHRpb25zLnB1c2goc3RhY2spO1xuICAgICAgICBsYXN0ID0gc3RhY2s7XG4gICAgICAgIGJyZWFrO1xuXG5cbiAgICAgIC8vIFJlcGV0aXRpb24uXG4gICAgICAvLyBGb3IgZXZlcnkgcmVwZXRpdGlvbiwgcmVtb3ZlIGxhc3QgZWxlbWVudCBmcm9tIGxhc3Qgc3RhY2tcbiAgICAgIC8vIHRoZW4gaW5zZXJ0IGJhY2sgYSBSQU5HRSBvYmplY3QuXG4gICAgICAvLyBUaGlzIGRlc2lnbiBpcyBjaG9zZW4gYmVjYXVzZSB0aGVyZSBjb3VsZCBiZSBtb3JlIHRoYW5cbiAgICAgIC8vIG9uZSByZXBldGl0aW9uIHN5bWJvbHMgaW4gYSByZWdleCBpLmUuIGBhPyt7MiwzfWAuXG4gICAgICBjYXNlICd7JzpcbiAgICAgICAgdmFyIHJzID0gL14oXFxkKykoLChcXGQrKT8pP1xcfS8uZXhlYyhzdHIuc2xpY2UoaSkpLCBtaW4sIG1heDtcbiAgICAgICAgaWYgKHJzICE9PSBudWxsKSB7XG4gICAgICAgICAgbWluID0gcGFyc2VJbnQocnNbMV0sIDEwKTtcbiAgICAgICAgICBtYXggPSByc1syXSA/IHJzWzNdID8gcGFyc2VJbnQocnNbM10sIDEwKSA6IEluZmluaXR5IDogbWluO1xuICAgICAgICAgIGkgKz0gcnNbMF0ubGVuZ3RoO1xuXG4gICAgICAgICAgbGFzdC5wdXNoKHtcbiAgICAgICAgICAgICAgdHlwZTogdHlwZXMuUkVQRVRJVElPTlxuICAgICAgICAgICAgLCBtaW46IG1pblxuICAgICAgICAgICAgLCBtYXg6IG1heFxuICAgICAgICAgICAgLCB2YWx1ZTogbGFzdC5wb3AoKVxuICAgICAgICAgIH0pO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGxhc3QucHVzaCh7XG4gICAgICAgICAgICAgIHR5cGU6IHR5cGVzLkNIQVJcbiAgICAgICAgICAgICwgdmFsdWU6IDEyM1xuICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgICAgIGJyZWFrO1xuXG4gICAgICBjYXNlICc/JzpcbiAgICAgICAgaWYgKGxhc3QubGVuZ3RoID09PSAwKSB7XG4gICAgICAgICAgcmVwZWF0RXJyKGkpO1xuICAgICAgICB9XG4gICAgICAgIGxhc3QucHVzaCh7XG4gICAgICAgICAgICB0eXBlOiB0eXBlcy5SRVBFVElUSU9OXG4gICAgICAgICAgLCBtaW46IDBcbiAgICAgICAgICAsIG1heDogMVxuICAgICAgICAgICwgdmFsdWU6IGxhc3QucG9wKClcbiAgICAgICAgfSk7XG4gICAgICAgIGJyZWFrO1xuXG4gICAgICBjYXNlICcrJzpcbiAgICAgICAgaWYgKGxhc3QubGVuZ3RoID09PSAwKSB7XG4gICAgICAgICAgcmVwZWF0RXJyKGkpO1xuICAgICAgICB9XG4gICAgICAgIGxhc3QucHVzaCh7XG4gICAgICAgICAgICB0eXBlOiB0eXBlcy5SRVBFVElUSU9OXG4gICAgICAgICAgLCBtaW46IDFcbiAgICAgICAgICAsIG1heDogSW5maW5pdHlcbiAgICAgICAgICAsIHZhbHVlOiBsYXN0LnBvcCgpXG4gICAgICAgIH0pO1xuICAgICAgICBicmVhaztcblxuICAgICAgY2FzZSAnKic6XG4gICAgICAgIGlmIChsYXN0Lmxlbmd0aCA9PT0gMCkge1xuICAgICAgICAgIHJlcGVhdEVycihpKTtcbiAgICAgICAgfVxuICAgICAgICBsYXN0LnB1c2goe1xuICAgICAgICAgICAgdHlwZTogdHlwZXMuUkVQRVRJVElPTlxuICAgICAgICAgICwgbWluOiAwXG4gICAgICAgICAgLCBtYXg6IEluZmluaXR5XG4gICAgICAgICAgLCB2YWx1ZTogbGFzdC5wb3AoKVxuICAgICAgICB9KTtcbiAgICAgICAgYnJlYWs7XG5cblxuICAgICAgLy8gRGVmYXVsdCBpcyBhIGNoYXJhY3RlciB0aGF0IGlzIG5vdCBgXFxbXSgpe30/KypeJGAuXG4gICAgICBkZWZhdWx0OlxuICAgICAgICBsYXN0LnB1c2goe1xuICAgICAgICAgICAgdHlwZTogdHlwZXMuQ0hBUlxuICAgICAgICAgICwgdmFsdWU6IGMuY2hhckNvZGVBdCgwKVxuICAgICAgICB9KTtcbiAgICB9XG5cbiAgfVxuXG4gIC8vIENoZWNrIGlmIGFueSBncm91cHMgaGF2ZSBub3QgYmVlbiBjbG9zZWQuXG4gIGlmIChncm91cFN0YWNrLmxlbmd0aCAhPT0gMCkge1xuICAgIHV0aWwuZXJyb3IocmVnZXhwU3RyLCAnVW50ZXJtaW5hdGVkIGdyb3VwJyk7XG4gIH1cblxuICByZXR1cm4gc3RhcnQ7XG59O1xuXG5tb2R1bGUuZXhwb3J0cy50eXBlcyA9IHR5cGVzO1xuIiwidmFyIHR5cGVzID0gcmVxdWlyZSgnLi90eXBlcycpO1xuXG5leHBvcnRzLndvcmRCb3VuZGFyeSA9IGZ1bmN0aW9uKCkge1xuICByZXR1cm4geyB0eXBlOiB0eXBlcy5QT1NJVElPTiwgdmFsdWU6ICdiJyB9O1xufTtcblxuZXhwb3J0cy5ub25Xb3JkQm91bmRhcnkgPSBmdW5jdGlvbigpIHtcbiAgcmV0dXJuIHsgdHlwZTogdHlwZXMuUE9TSVRJT04sIHZhbHVlOiAnQicgfTtcbn07XG5cbmV4cG9ydHMuYmVnaW4gPSBmdW5jdGlvbigpIHtcbiAgcmV0dXJuIHsgdHlwZTogdHlwZXMuUE9TSVRJT04sIHZhbHVlOiAnXicgfTtcbn07XG5cbmV4cG9ydHMuZW5kID0gZnVuY3Rpb24oKSB7XG4gIHJldHVybiB7IHR5cGU6IHR5cGVzLlBPU0lUSU9OLCB2YWx1ZTogJyQnIH07XG59O1xuIiwidmFyIHR5cGVzID0gcmVxdWlyZSgnLi90eXBlcycpO1xuXG52YXIgSU5UUyA9IGZ1bmN0aW9uKCkge1xuIHJldHVybiBbeyB0eXBlOiB0eXBlcy5SQU5HRSAsIGZyb206IDQ4LCB0bzogNTcgfV07XG59O1xuXG52YXIgV09SRFMgPSBmdW5jdGlvbigpIHtcbiByZXR1cm4gW1xuICAgICAgeyB0eXBlOiB0eXBlcy5DSEFSLCB2YWx1ZTogOTUgfVxuICAgICwgeyB0eXBlOiB0eXBlcy5SQU5HRSwgZnJvbTogOTcsIHRvOiAxMjIgfVxuICAgICwgeyB0eXBlOiB0eXBlcy5SQU5HRSwgZnJvbTogNjUsIHRvOiA5MCB9XG4gIF0uY29uY2F0KElOVFMoKSk7XG59O1xuXG52YXIgV0hJVEVTUEFDRSA9IGZ1bmN0aW9uKCkge1xuIHJldHVybiBbXG4gICAgICB7IHR5cGU6IHR5cGVzLkNIQVIsIHZhbHVlOiA5IH1cbiAgICAsIHsgdHlwZTogdHlwZXMuQ0hBUiwgdmFsdWU6IDEwIH1cbiAgICAsIHsgdHlwZTogdHlwZXMuQ0hBUiwgdmFsdWU6IDExIH1cbiAgICAsIHsgdHlwZTogdHlwZXMuQ0hBUiwgdmFsdWU6IDEyIH1cbiAgICAsIHsgdHlwZTogdHlwZXMuQ0hBUiwgdmFsdWU6IDEzIH1cbiAgICAsIHsgdHlwZTogdHlwZXMuQ0hBUiwgdmFsdWU6IDMyIH1cbiAgICAsIHsgdHlwZTogdHlwZXMuQ0hBUiwgdmFsdWU6IDE2MCB9XG4gICAgLCB7IHR5cGU6IHR5cGVzLkNIQVIsIHZhbHVlOiA1NzYwIH1cbiAgICAsIHsgdHlwZTogdHlwZXMuQ0hBUiwgdmFsdWU6IDYxNTggfVxuICAgICwgeyB0eXBlOiB0eXBlcy5DSEFSLCB2YWx1ZTogODE5MiB9XG4gICAgLCB7IHR5cGU6IHR5cGVzLkNIQVIsIHZhbHVlOiA4MTkzIH1cbiAgICAsIHsgdHlwZTogdHlwZXMuQ0hBUiwgdmFsdWU6IDgxOTQgfVxuICAgICwgeyB0eXBlOiB0eXBlcy5DSEFSLCB2YWx1ZTogODE5NSB9XG4gICAgLCB7IHR5cGU6IHR5cGVzLkNIQVIsIHZhbHVlOiA4MTk2IH1cbiAgICAsIHsgdHlwZTogdHlwZXMuQ0hBUiwgdmFsdWU6IDgxOTcgfVxuICAgICwgeyB0eXBlOiB0eXBlcy5DSEFSLCB2YWx1ZTogODE5OCB9XG4gICAgLCB7IHR5cGU6IHR5cGVzLkNIQVIsIHZhbHVlOiA4MTk5IH1cbiAgICAsIHsgdHlwZTogdHlwZXMuQ0hBUiwgdmFsdWU6IDgyMDAgfVxuICAgICwgeyB0eXBlOiB0eXBlcy5DSEFSLCB2YWx1ZTogODIwMSB9XG4gICAgLCB7IHR5cGU6IHR5cGVzLkNIQVIsIHZhbHVlOiA4MjAyIH1cbiAgICAsIHsgdHlwZTogdHlwZXMuQ0hBUiwgdmFsdWU6IDgyMzIgfVxuICAgICwgeyB0eXBlOiB0eXBlcy5DSEFSLCB2YWx1ZTogODIzMyB9XG4gICAgLCB7IHR5cGU6IHR5cGVzLkNIQVIsIHZhbHVlOiA4MjM5IH1cbiAgICAsIHsgdHlwZTogdHlwZXMuQ0hBUiwgdmFsdWU6IDgyODcgfVxuICAgICwgeyB0eXBlOiB0eXBlcy5DSEFSLCB2YWx1ZTogMTIyODggfVxuICAgICwgeyB0eXBlOiB0eXBlcy5DSEFSLCB2YWx1ZTogNjUyNzkgfVxuICBdO1xufTtcblxudmFyIE5PVEFOWUNIQVIgPSBmdW5jdGlvbigpIHtcbiByZXR1cm4gW1xuICAgICAgeyB0eXBlOiB0eXBlcy5DSEFSLCB2YWx1ZTogMTAgfVxuICAgICwgeyB0eXBlOiB0eXBlcy5DSEFSLCB2YWx1ZTogMTMgfVxuICAgICwgeyB0eXBlOiB0eXBlcy5DSEFSLCB2YWx1ZTogODIzMiB9XG4gICAgLCB7IHR5cGU6IHR5cGVzLkNIQVIsIHZhbHVlOiA4MjMzIH1cbiAgXTtcbn07XG5cbi8vIHByZWRlZmluZWQgY2xhc3Mgb2JqZWN0c1xuZXhwb3J0cy53b3JkcyA9IGZ1bmN0aW9uKCkge1xuICByZXR1cm4geyB0eXBlOiB0eXBlcy5TRVQsIHNldDogV09SRFMoKSwgbm90OiBmYWxzZSB9O1xufTtcblxuZXhwb3J0cy5ub3RXb3JkcyA9IGZ1bmN0aW9uKCkge1xuICByZXR1cm4geyB0eXBlOiB0eXBlcy5TRVQsIHNldDogV09SRFMoKSwgbm90OiB0cnVlIH07XG59O1xuXG5leHBvcnRzLmludHMgPSBmdW5jdGlvbigpIHtcbiAgcmV0dXJuIHsgdHlwZTogdHlwZXMuU0VULCBzZXQ6IElOVFMoKSwgbm90OiBmYWxzZSB9O1xufTtcblxuZXhwb3J0cy5ub3RJbnRzID0gZnVuY3Rpb24oKSB7XG4gIHJldHVybiB7IHR5cGU6IHR5cGVzLlNFVCwgc2V0OiBJTlRTKCksIG5vdDogdHJ1ZSB9O1xufTtcblxuZXhwb3J0cy53aGl0ZXNwYWNlID0gZnVuY3Rpb24oKSB7XG4gIHJldHVybiB7IHR5cGU6IHR5cGVzLlNFVCwgc2V0OiBXSElURVNQQUNFKCksIG5vdDogZmFsc2UgfTtcbn07XG5cbmV4cG9ydHMubm90V2hpdGVzcGFjZSA9IGZ1bmN0aW9uKCkge1xuICByZXR1cm4geyB0eXBlOiB0eXBlcy5TRVQsIHNldDogV0hJVEVTUEFDRSgpLCBub3Q6IHRydWUgfTtcbn07XG5cbmV4cG9ydHMuYW55Q2hhciA9IGZ1bmN0aW9uKCkge1xuICByZXR1cm4geyB0eXBlOiB0eXBlcy5TRVQsIHNldDogTk9UQU5ZQ0hBUigpLCBub3Q6IHRydWUgfTtcbn07XG4iLCJtb2R1bGUuZXhwb3J0cyA9IHtcbiAgICBST09UICAgICAgIDogMFxuICAsIEdST1VQICAgICAgOiAxXG4gICwgUE9TSVRJT04gICA6IDJcbiAgLCBTRVQgICAgICAgIDogM1xuICAsIFJBTkdFICAgICAgOiA0XG4gICwgUkVQRVRJVElPTiA6IDVcbiAgLCBSRUZFUkVOQ0UgIDogNlxuICAsIENIQVIgICAgICAgOiA3XG59O1xuIiwidmFyIHR5cGVzID0gcmVxdWlyZSgnLi90eXBlcycpO1xudmFyIHNldHMgID0gcmVxdWlyZSgnLi9zZXRzJyk7XG5cblxuLy8gQWxsIG9mIHRoZXNlIGFyZSBwcml2YXRlIGFuZCBvbmx5IHVzZWQgYnkgcmFuZGV4cC5cbi8vIEl0J3MgYXNzdW1lZCB0aGF0IHRoZXkgd2lsbCBhbHdheXMgYmUgY2FsbGVkIHdpdGggdGhlIGNvcnJlY3QgaW5wdXQuXG5cbnZhciBDVFJMID0gJ0BBQkNERUZHSElKS0xNTk9QUVJTVFVWV1hZWltcXFxcXV4gPyc7XG52YXIgU0xTSCA9IHsgJzAnOiAwLCAndCc6IDksICduJzogMTAsICd2JzogMTEsICdmJzogMTIsICdyJzogMTMgfTtcblxuLyoqXG4gKiBGaW5kcyBjaGFyYWN0ZXIgcmVwcmVzZW50YXRpb25zIGluIHN0ciBhbmQgY29udmVydCBhbGwgdG9cbiAqIHRoZWlyIHJlc3BlY3RpdmUgY2hhcmFjdGVyc1xuICpcbiAqIEBwYXJhbSB7U3RyaW5nfSBzdHJcbiAqIEByZXR1cm4ge1N0cmluZ31cbiAqL1xuZXhwb3J0cy5zdHJUb0NoYXJzID0gZnVuY3Rpb24oc3RyKSB7XG4gIHZhciBjaGFyc19yZWdleCA9IC8oXFxbXFxcXGJcXF0pfFxcXFwoPzp1KFtBLUYwLTldezR9KXx4KFtBLUYwLTldezJ9KXwoMD9bMC03XXsyfSl8YyhbQEEtWlxcW1xcXFxcXF1cXF4/XSl8KFswdG52ZnJdKSkvZztcbiAgc3RyID0gc3RyLnJlcGxhY2UoY2hhcnNfcmVnZXgsIGZ1bmN0aW9uKHMsIGIsIGExNiwgYjE2LCBjOCwgZGN0cmwsIGVzbHNoKSB7XG4gICAgdmFyIGNvZGUgPSBiICAgICA/IDggOlxuICAgICAgICAgICAgICAgYTE2ICAgPyBwYXJzZUludChhMTYsIDE2KSA6XG4gICAgICAgICAgICAgICBiMTYgICA/IHBhcnNlSW50KGIxNiwgMTYpIDpcbiAgICAgICAgICAgICAgIGM4ICAgID8gcGFyc2VJbnQoYzgsICAgOCkgOlxuICAgICAgICAgICAgICAgZGN0cmwgPyBDVFJMLmluZGV4T2YoZGN0cmwpIDpcbiAgICAgICAgICAgICAgIGVzbHNoID8gU0xTSFtlc2xzaF0gOiB1bmRlZmluZWQ7XG4gICAgXG4gICAgdmFyIGMgPSBTdHJpbmcuZnJvbUNoYXJDb2RlKGNvZGUpO1xuXG4gICAgLy8gRXNjYXBlIHNwZWNpYWwgcmVnZXggY2hhcmFjdGVycy5cbiAgICBpZiAoL1tcXFtcXF17fVxcXiQufD8qKygpXS8udGVzdChjKSkge1xuICAgICAgYyA9ICdcXFxcJyArIGM7XG4gICAgfVxuXG4gICAgcmV0dXJuIGM7XG4gIH0pO1xuXG4gIHJldHVybiBzdHI7XG59O1xuXG5cbi8qKlxuICogdHVybnMgY2xhc3MgaW50byB0b2tlbnNcbiAqIHJlYWRzIHN0ciB1bnRpbCBpdCBlbmNvdW50ZXJzIGEgXSBub3QgcHJlY2VlZGVkIGJ5IGEgXFxcbiAqXG4gKiBAcGFyYW0ge1N0cmluZ30gc3RyXG4gKiBAcGFyYW0ge1N0cmluZ30gcmVnZXhwU3RyXG4gKiBAcmV0dXJuIHtBcnJheS48QXJyYXkuPE9iamVjdD4sIE51bWJlcj59XG4gKi9cbmV4cG9ydHMudG9rZW5pemVDbGFzcyA9IGZ1bmN0aW9uKHN0ciwgcmVnZXhwU3RyKSB7XG4gIHZhciB0b2tlbnMgPSBbXVxuICAgICwgcmVnZXhwID0gL1xcXFwoPzoodyl8KGQpfChzKXwoVyl8KEQpfChTKSl8KCg/Oig/OlxcXFwpKC4pfChbXlxcXVxcXFxdKSktKD86XFxcXCk/KFteXFxdXSkpfChcXF0pfCg/OlxcXFwpPyguKS9nXG4gICAgLCBycywgY1xuICAgIDtcblxuXG4gIHdoaWxlICgocnMgPSByZWdleHAuZXhlYyhzdHIpKSAhPSBudWxsKSB7XG4gICAgaWYgKHJzWzFdKSB7XG4gICAgICB0b2tlbnMucHVzaChzZXRzLndvcmRzKCkpO1xuXG4gICAgfSBlbHNlIGlmIChyc1syXSkge1xuICAgICAgdG9rZW5zLnB1c2goc2V0cy5pbnRzKCkpO1xuXG4gICAgfSBlbHNlIGlmIChyc1szXSkge1xuICAgICAgdG9rZW5zLnB1c2goc2V0cy53aGl0ZXNwYWNlKCkpO1xuXG4gICAgfSBlbHNlIGlmIChyc1s0XSkge1xuICAgICAgdG9rZW5zLnB1c2goc2V0cy5ub3RXb3JkcygpKTtcblxuICAgIH0gZWxzZSBpZiAocnNbNV0pIHtcbiAgICAgIHRva2Vucy5wdXNoKHNldHMubm90SW50cygpKTtcblxuICAgIH0gZWxzZSBpZiAocnNbNl0pIHtcbiAgICAgIHRva2Vucy5wdXNoKHNldHMubm90V2hpdGVzcGFjZSgpKTtcblxuICAgIH0gZWxzZSBpZiAocnNbN10pIHtcbiAgICAgIHRva2Vucy5wdXNoKHtcbiAgICAgICAgICB0eXBlOiB0eXBlcy5SQU5HRVxuICAgICAgICAsIGZyb206IChyc1s4XSB8fCByc1s5XSkuY2hhckNvZGVBdCgwKVxuICAgICAgICAsICAgdG86IHJzWzEwXS5jaGFyQ29kZUF0KDApXG4gICAgICB9KTtcblxuICAgIH0gZWxzZSBpZiAoYyA9IHJzWzEyXSkge1xuICAgICAgdG9rZW5zLnB1c2goe1xuICAgICAgICAgIHR5cGU6IHR5cGVzLkNIQVJcbiAgICAgICAgLCB2YWx1ZTogYy5jaGFyQ29kZUF0KDApXG4gICAgICB9KTtcblxuICAgIH0gZWxzZSB7XG4gICAgICByZXR1cm4gW3Rva2VucywgcmVnZXhwLmxhc3RJbmRleF07XG4gICAgfVxuICB9XG5cbiAgZXhwb3J0cy5lcnJvcihyZWdleHBTdHIsICdVbnRlcm1pbmF0ZWQgY2hhcmFjdGVyIGNsYXNzJyk7XG59O1xuXG5cbi8qKlxuICogU2hvcnRjdXQgdG8gdGhyb3cgZXJyb3JzLlxuICpcbiAqIEBwYXJhbSB7U3RyaW5nfSByZWdleHBcbiAqIEBwYXJhbSB7U3RyaW5nfSBtc2dcbiAqL1xuZXhwb3J0cy5lcnJvciA9IGZ1bmN0aW9uKHJlZ2V4cCwgbXNnKSB7XG4gIHRocm93IG5ldyBTeW50YXhFcnJvcignSW52YWxpZCByZWd1bGFyIGV4cHJlc3Npb246IC8nICsgcmVnZXhwICsgJy86ICcgKyBtc2cpO1xufTtcbiIsIi8vIGdldFVzZXJNZWRpYSBoZWxwZXIgYnkgQEhlbnJpa0pvcmV0ZWdcbnZhciBmdW5jID0gKHdpbmRvdy5uYXZpZ2F0b3IuZ2V0VXNlck1lZGlhIHx8XG4gICAgICAgICAgICB3aW5kb3cubmF2aWdhdG9yLndlYmtpdEdldFVzZXJNZWRpYSB8fFxuICAgICAgICAgICAgd2luZG93Lm5hdmlnYXRvci5tb3pHZXRVc2VyTWVkaWEgfHxcbiAgICAgICAgICAgIHdpbmRvdy5uYXZpZ2F0b3IubXNHZXRVc2VyTWVkaWEpO1xuXG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gKGNvbnN0cmFpbnRzLCBjYikge1xuICAgIHZhciBvcHRpb25zO1xuICAgIHZhciBoYXZlT3B0cyA9IGFyZ3VtZW50cy5sZW5ndGggPT09IDI7XG4gICAgdmFyIGRlZmF1bHRPcHRzID0ge3ZpZGVvOiB0cnVlLCBhdWRpbzogdHJ1ZX07XG4gICAgdmFyIGVycm9yO1xuICAgIHZhciBkZW5pZWQgPSAnUGVybWlzc2lvbkRlbmllZEVycm9yJztcbiAgICB2YXIgbm90U2F0aWZpZWQgPSAnQ29uc3RyYWludE5vdFNhdGlzZmllZEVycm9yJztcblxuICAgIC8vIG1ha2UgY29uc3RyYWludHMgb3B0aW9uYWxcbiAgICBpZiAoIWhhdmVPcHRzKSB7XG4gICAgICAgIGNiID0gY29uc3RyYWludHM7XG4gICAgICAgIGNvbnN0cmFpbnRzID0gZGVmYXVsdE9wdHM7XG4gICAgfVxuXG4gICAgLy8gdHJlYXQgbGFjayBvZiBicm93c2VyIHN1cHBvcnQgbGlrZSBhbiBlcnJvclxuICAgIGlmICghZnVuYykge1xuICAgICAgICAvLyB0aHJvdyBwcm9wZXIgZXJyb3IgcGVyIHNwZWNcbiAgICAgICAgZXJyb3IgPSBuZXcgRXJyb3IoJ01lZGlhU3RyZWFtRXJyb3InKTtcbiAgICAgICAgZXJyb3IubmFtZSA9ICdOb3RTdXBwb3J0ZWRFcnJvcic7XG4gICAgICAgIHJldHVybiBjYihlcnJvcik7XG4gICAgfVxuXG4gICAgZnVuYy5jYWxsKHdpbmRvdy5uYXZpZ2F0b3IsIGNvbnN0cmFpbnRzLCBmdW5jdGlvbiAoc3RyZWFtKSB7XG4gICAgICAgIGNiKG51bGwsIHN0cmVhbSk7XG4gICAgfSwgZnVuY3Rpb24gKGVycikge1xuICAgICAgICB2YXIgZXJyb3I7XG4gICAgICAgIC8vIGNvZXJjZSBpbnRvIGFuIGVycm9yIG9iamVjdCBzaW5jZSBGRiBnaXZlcyB1cyBhIHN0cmluZ1xuICAgICAgICAvLyB0aGVyZSBhcmUgb25seSB0d28gdmFsaWQgbmFtZXMgYWNjb3JkaW5nIHRvIHRoZSBzcGVjXG4gICAgICAgIC8vIHdlIGNvZXJjZSBhbGwgbm9uLWRlbmllZCB0byBcImNvbnN0cmFpbnQgbm90IHNhdGlzZmllZFwiLlxuICAgICAgICBpZiAodHlwZW9mIGVyciA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgICAgIGVycm9yID0gbmV3IEVycm9yKCdNZWRpYVN0cmVhbUVycm9yJyk7XG4gICAgICAgICAgICBpZiAoZXJyID09PSBkZW5pZWQpIHtcbiAgICAgICAgICAgICAgICBlcnJvci5uYW1lID0gZGVuaWVkO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBlcnJvci5uYW1lID0gbm90U2F0aWZpZWQ7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAvLyBpZiB3ZSBnZXQgYW4gZXJyb3Igb2JqZWN0IG1ha2Ugc3VyZSAnLm5hbWUnIHByb3BlcnR5IGlzIHNldFxuICAgICAgICAgICAgLy8gYWNjb3JkaW5nIHRvIHNwZWM6IGh0dHA6Ly9kZXYudzMub3JnLzIwMTEvd2VicnRjL2VkaXRvci9nZXR1c2VybWVkaWEuaHRtbCNuYXZpZ2F0b3J1c2VybWVkaWFlcnJvci1hbmQtbmF2aWdhdG9ydXNlcm1lZGlhZXJyb3JjYWxsYmFja1xuICAgICAgICAgICAgZXJyb3IgPSBlcnI7XG4gICAgICAgICAgICBpZiAoIWVycm9yLm5hbWUpIHtcbiAgICAgICAgICAgICAgICAvLyB0aGlzIGlzIGxpa2VseSBjaHJvbWUgd2hpY2hcbiAgICAgICAgICAgICAgICAvLyBzZXRzIGEgcHJvcGVydHkgY2FsbGVkIFwiRVJST1JfREVOSUVEXCIgb24gdGhlIGVycm9yIG9iamVjdFxuICAgICAgICAgICAgICAgIC8vIGlmIHNvIHdlIG1ha2Ugc3VyZSB0byBzZXQgYSBuYW1lXG4gICAgICAgICAgICAgICAgaWYgKGVycm9yW2RlbmllZF0pIHtcbiAgICAgICAgICAgICAgICAgICAgZXJyLm5hbWUgPSBkZW5pZWQ7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgZXJyLm5hbWUgPSBub3RTYXRpZmllZDtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBjYihlcnJvcik7XG4gICAgfSk7XG59O1xuIiwiJ3VzZSBzdHJpY3QnXG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gKGFycmF5LCBrZXksIGNvbmZpZykge1xuICB2YXIga2VlcEluQXJyYXkgPSBjb25maWcgJiYgY29uZmlnLmtlZXBJbkFycmF5XG4gIGlmICghYXJyYXkgfHwgIWtleSkgcmV0dXJuIHt9XG4gIHZhciBvYmplY3QgPSB7fVxuICBmb3IgKHZhciBpID0gMCwgbGVuZ3RoID0gYXJyYXkubGVuZ3RoOyBpIDwgbGVuZ3RoOyArK2kpIHtcbiAgICBpZiAoYXJyYXlbaV1ba2V5XSA9PT0gdW5kZWZpbmVkIHx8IGFycmF5W2ldW2tleV0gPT09IG51bGwpIGJyZWFrXG4gICAgaWYgKCFvYmplY3RbYXJyYXlbaV1ba2V5XV0pIHtcbiAgICAgIGlmIChrZWVwSW5BcnJheSkgb2JqZWN0W2FycmF5W2ldW2tleV1dID0gW2FycmF5W2ldXVxuICAgICAgZWxzZSBvYmplY3RbYXJyYXlbaV1ba2V5XV0gPSBhcnJheVtpXVxuICAgIH0gZWxzZSBpZiAoIUFycmF5LmlzQXJyYXkob2JqZWN0W2FycmF5W2ldW2tleV1dKSkge1xuICAgICAgb2JqZWN0W2FycmF5W2ldW2tleV1dID0gW29iamVjdFthcnJheVtpXVtrZXldXV1cbiAgICAgIG9iamVjdFthcnJheVtpXVtrZXldXS5wdXNoKGFycmF5W2ldKVxuICAgIH0gZWxzZSB7XG4gICAgICBvYmplY3RbYXJyYXlbaV1ba2V5XV0ucHVzaChhcnJheVtpXSlcbiAgICB9XG5cbiAgfVxuICByZXR1cm4gb2JqZWN0XG59XG4iLCJ2YXIgaW5zZXJ0ZWQgPSB7fTtcblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiAoY3NzLCBvcHRpb25zKSB7XG4gICAgaWYgKGluc2VydGVkW2Nzc10pIHJldHVybjtcbiAgICBpbnNlcnRlZFtjc3NdID0gdHJ1ZTtcbiAgICBcbiAgICB2YXIgZWxlbSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3N0eWxlJyk7XG4gICAgZWxlbS5zZXRBdHRyaWJ1dGUoJ3R5cGUnLCAndGV4dC9jc3MnKTtcblxuICAgIGlmICgndGV4dENvbnRlbnQnIGluIGVsZW0pIHtcbiAgICAgIGVsZW0udGV4dENvbnRlbnQgPSBjc3M7XG4gICAgfSBlbHNlIHtcbiAgICAgIGVsZW0uc3R5bGVTaGVldC5jc3NUZXh0ID0gY3NzO1xuICAgIH1cbiAgICBcbiAgICB2YXIgaGVhZCA9IGRvY3VtZW50LmdldEVsZW1lbnRzQnlUYWdOYW1lKCdoZWFkJylbMF07XG4gICAgaWYgKG9wdGlvbnMgJiYgb3B0aW9ucy5wcmVwZW5kKSB7XG4gICAgICAgIGhlYWQuaW5zZXJ0QmVmb3JlKGVsZW0sIGhlYWQuY2hpbGROb2Rlc1swXSk7XG4gICAgfSBlbHNlIHtcbiAgICAgICAgaGVhZC5hcHBlbmRDaGlsZChlbGVtKTtcbiAgICB9XG59O1xuIiwiLyoqXG4gKiBsb2Rhc2ggMy4wLjAgKEN1c3RvbSBCdWlsZCkgPGh0dHBzOi8vbG9kYXNoLmNvbS8+XG4gKiBCdWlsZDogYGxvZGFzaCBtb2Rlcm4gbW9kdWxhcml6ZSBleHBvcnRzPVwibnBtXCIgLW8gLi9gXG4gKiBDb3B5cmlnaHQgMjAxMi0yMDE1IFRoZSBEb2pvIEZvdW5kYXRpb24gPGh0dHA6Ly9kb2pvZm91bmRhdGlvbi5vcmcvPlxuICogQmFzZWQgb24gVW5kZXJzY29yZS5qcyAxLjcuMCA8aHR0cDovL3VuZGVyc2NvcmVqcy5vcmcvTElDRU5TRT5cbiAqIENvcHlyaWdodCAyMDA5LTIwMTUgSmVyZW15IEFzaGtlbmFzLCBEb2N1bWVudENsb3VkIGFuZCBJbnZlc3RpZ2F0aXZlIFJlcG9ydGVycyAmIEVkaXRvcnNcbiAqIEF2YWlsYWJsZSB1bmRlciBNSVQgbGljZW5zZSA8aHR0cHM6Ly9sb2Rhc2guY29tL2xpY2Vuc2U+XG4gKi9cbnZhciBiYXNlVG9TdHJpbmcgPSByZXF1aXJlKCdsb2Rhc2guX2Jhc2V0b3N0cmluZycpO1xuXG4vKipcbiAqIENhcGl0YWxpemVzIHRoZSBmaXJzdCBjaGFyYWN0ZXIgb2YgYHN0cmluZ2AuXG4gKlxuICogQHN0YXRpY1xuICogQG1lbWJlck9mIF9cbiAqIEBjYXRlZ29yeSBTdHJpbmdcbiAqIEBwYXJhbSB7c3RyaW5nfSBbc3RyaW5nPScnXSBUaGUgc3RyaW5nIHRvIGNhcGl0YWxpemUuXG4gKiBAcmV0dXJucyB7c3RyaW5nfSBSZXR1cm5zIHRoZSBjYXBpdGFsaXplZCBzdHJpbmcuXG4gKiBAZXhhbXBsZVxuICpcbiAqIF8uY2FwaXRhbGl6ZSgnZnJlZCcpO1xuICogLy8gPT4gJ0ZyZWQnXG4gKi9cbmZ1bmN0aW9uIGNhcGl0YWxpemUoc3RyaW5nKSB7XG4gIHN0cmluZyA9IGJhc2VUb1N0cmluZyhzdHJpbmcpO1xuICByZXR1cm4gc3RyaW5nICYmIChzdHJpbmcuY2hhckF0KDApLnRvVXBwZXJDYXNlKCkgKyBzdHJpbmcuc2xpY2UoMSkpO1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IGNhcGl0YWxpemU7XG4iLCIvKipcbiAqIGxvZGFzaCAzLjAuMSAoQ3VzdG9tIEJ1aWxkKSA8aHR0cHM6Ly9sb2Rhc2guY29tLz5cbiAqIEJ1aWxkOiBgbG9kYXNoIG1vZGVybiBtb2R1bGFyaXplIGV4cG9ydHM9XCJucG1cIiAtbyAuL2BcbiAqIENvcHlyaWdodCAyMDEyLTIwMTUgVGhlIERvam8gRm91bmRhdGlvbiA8aHR0cDovL2Rvam9mb3VuZGF0aW9uLm9yZy8+XG4gKiBCYXNlZCBvbiBVbmRlcnNjb3JlLmpzIDEuOC4zIDxodHRwOi8vdW5kZXJzY29yZWpzLm9yZy9MSUNFTlNFPlxuICogQ29weXJpZ2h0IDIwMDktMjAxNSBKZXJlbXkgQXNoa2VuYXMsIERvY3VtZW50Q2xvdWQgYW5kIEludmVzdGlnYXRpdmUgUmVwb3J0ZXJzICYgRWRpdG9yc1xuICogQXZhaWxhYmxlIHVuZGVyIE1JVCBsaWNlbnNlIDxodHRwczovL2xvZGFzaC5jb20vbGljZW5zZT5cbiAqL1xuXG4vKipcbiAqIENvbnZlcnRzIGB2YWx1ZWAgdG8gYSBzdHJpbmcgaWYgaXQncyBub3Qgb25lLiBBbiBlbXB0eSBzdHJpbmcgaXMgcmV0dXJuZWRcbiAqIGZvciBgbnVsbGAgb3IgYHVuZGVmaW5lZGAgdmFsdWVzLlxuICpcbiAqIEBwcml2YXRlXG4gKiBAcGFyYW0geyp9IHZhbHVlIFRoZSB2YWx1ZSB0byBwcm9jZXNzLlxuICogQHJldHVybnMge3N0cmluZ30gUmV0dXJucyB0aGUgc3RyaW5nLlxuICovXG5mdW5jdGlvbiBiYXNlVG9TdHJpbmcodmFsdWUpIHtcbiAgcmV0dXJuIHZhbHVlID09IG51bGwgPyAnJyA6ICh2YWx1ZSArICcnKTtcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBiYXNlVG9TdHJpbmc7XG4iLCIvKipcbiAqIGxvZGFzaCAzLjAuMCAoQ3VzdG9tIEJ1aWxkKSA8aHR0cHM6Ly9sb2Rhc2guY29tLz5cbiAqIEJ1aWxkOiBgbG9kYXNoIG1vZGVybiBtb2R1bGFyaXplIGV4cG9ydHM9XCJucG1cIiAtbyAuL2BcbiAqIENvcHlyaWdodCAyMDEyLTIwMTUgVGhlIERvam8gRm91bmRhdGlvbiA8aHR0cDovL2Rvam9mb3VuZGF0aW9uLm9yZy8+XG4gKiBCYXNlZCBvbiBVbmRlcnNjb3JlLmpzIDEuNy4wIDxodHRwOi8vdW5kZXJzY29yZWpzLm9yZy9MSUNFTlNFPlxuICogQ29weXJpZ2h0IDIwMDktMjAxNSBKZXJlbXkgQXNoa2VuYXMsIERvY3VtZW50Q2xvdWQgYW5kIEludmVzdGlnYXRpdmUgUmVwb3J0ZXJzICYgRWRpdG9yc1xuICogQXZhaWxhYmxlIHVuZGVyIE1JVCBsaWNlbnNlIDxodHRwczovL2xvZGFzaC5jb20vbGljZW5zZT5cbiAqL1xudmFyIGJhc2VWYWx1ZXMgPSByZXF1aXJlKCdsb2Rhc2guX2Jhc2V2YWx1ZXMnKSxcbiAgICBrZXlzID0gcmVxdWlyZSgnbG9kYXNoLmtleXMnKTtcblxuLyoqXG4gKiBDcmVhdGVzIGFuIGFycmF5IG9mIHRoZSBvd24gZW51bWVyYWJsZSBwcm9wZXJ0eSB2YWx1ZXMgb2YgYG9iamVjdGAuXG4gKlxuICogKipOb3RlOioqIE5vbi1vYmplY3QgdmFsdWVzIGFyZSBjb2VyY2VkIHRvIG9iamVjdHMuXG4gKlxuICogQHN0YXRpY1xuICogQG1lbWJlck9mIF9cbiAqIEBjYXRlZ29yeSBPYmplY3RcbiAqIEBwYXJhbSB7T2JqZWN0fSBvYmplY3QgVGhlIG9iamVjdCB0byBxdWVyeS5cbiAqIEByZXR1cm5zIHtBcnJheX0gUmV0dXJucyB0aGUgYXJyYXkgb2YgcHJvcGVydHkgdmFsdWVzLlxuICogQGV4YW1wbGVcbiAqXG4gKiBmdW5jdGlvbiBGb28oKSB7XG4gKiAgIHRoaXMuYSA9IDE7XG4gKiAgIHRoaXMuYiA9IDI7XG4gKiB9XG4gKlxuICogRm9vLnByb3RvdHlwZS5jID0gMztcbiAqXG4gKiBfLnZhbHVlcyhuZXcgRm9vKTtcbiAqIC8vID0+IFsxLCAyXSAoaXRlcmF0aW9uIG9yZGVyIGlzIG5vdCBndWFyYW50ZWVkKVxuICpcbiAqIF8udmFsdWVzKCdoaScpO1xuICogLy8gPT4gWydoJywgJ2knXVxuICovXG5mdW5jdGlvbiB2YWx1ZXMob2JqZWN0KSB7XG4gIHJldHVybiBiYXNlVmFsdWVzKG9iamVjdCwga2V5cyhvYmplY3QpKTtcbn1cblxubW9kdWxlLmV4cG9ydHMgPSB2YWx1ZXM7XG4iLCIvKipcbiAqIGxvZGFzaCAzLjAuMCAoQ3VzdG9tIEJ1aWxkKSA8aHR0cHM6Ly9sb2Rhc2guY29tLz5cbiAqIEJ1aWxkOiBgbG9kYXNoIG1vZGVybiBtb2R1bGFyaXplIGV4cG9ydHM9XCJucG1cIiAtbyAuL2BcbiAqIENvcHlyaWdodCAyMDEyLTIwMTUgVGhlIERvam8gRm91bmRhdGlvbiA8aHR0cDovL2Rvam9mb3VuZGF0aW9uLm9yZy8+XG4gKiBCYXNlZCBvbiBVbmRlcnNjb3JlLmpzIDEuNy4wIDxodHRwOi8vdW5kZXJzY29yZWpzLm9yZy9MSUNFTlNFPlxuICogQ29weXJpZ2h0IDIwMDktMjAxNSBKZXJlbXkgQXNoa2VuYXMsIERvY3VtZW50Q2xvdWQgYW5kIEludmVzdGlnYXRpdmUgUmVwb3J0ZXJzICYgRWRpdG9yc1xuICogQXZhaWxhYmxlIHVuZGVyIE1JVCBsaWNlbnNlIDxodHRwczovL2xvZGFzaC5jb20vbGljZW5zZT5cbiAqL1xuXG4vKipcbiAqIFRoZSBiYXNlIGltcGxlbWVudGF0aW9uIG9mIGBfLnZhbHVlc2AgYW5kIGBfLnZhbHVlc0luYCB3aGljaCBjcmVhdGVzIGFuXG4gKiBhcnJheSBvZiBgb2JqZWN0YCBwcm9wZXJ0eSB2YWx1ZXMgY29ycmVzcG9uZGluZyB0byB0aGUgcHJvcGVydHkgbmFtZXNcbiAqIHJldHVybmVkIGJ5IGBrZXlzRnVuY2AuXG4gKlxuICogQHByaXZhdGVcbiAqIEBwYXJhbSB7T2JqZWN0fSBvYmplY3QgVGhlIG9iamVjdCB0byBxdWVyeS5cbiAqIEBwYXJhbSB7QXJyYXl9IHByb3BzIFRoZSBwcm9wZXJ0eSBuYW1lcyB0byBnZXQgdmFsdWVzIGZvci5cbiAqIEByZXR1cm5zIHtPYmplY3R9IFJldHVybnMgdGhlIGFycmF5IG9mIHByb3BlcnR5IHZhbHVlcy5cbiAqL1xuZnVuY3Rpb24gYmFzZVZhbHVlcyhvYmplY3QsIHByb3BzKSB7XG4gIHZhciBpbmRleCA9IC0xLFxuICAgICAgbGVuZ3RoID0gcHJvcHMubGVuZ3RoLFxuICAgICAgcmVzdWx0ID0gQXJyYXkobGVuZ3RoKTtcblxuICB3aGlsZSAoKytpbmRleCA8IGxlbmd0aCkge1xuICAgIHJlc3VsdFtpbmRleF0gPSBvYmplY3RbcHJvcHNbaW5kZXhdXTtcbiAgfVxuICByZXR1cm4gcmVzdWx0O1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IGJhc2VWYWx1ZXM7XG4iLCIvKipcbiAqIGxvZGFzaCAzLjEuMiAoQ3VzdG9tIEJ1aWxkKSA8aHR0cHM6Ly9sb2Rhc2guY29tLz5cbiAqIEJ1aWxkOiBgbG9kYXNoIG1vZGVybiBtb2R1bGFyaXplIGV4cG9ydHM9XCJucG1cIiAtbyAuL2BcbiAqIENvcHlyaWdodCAyMDEyLTIwMTUgVGhlIERvam8gRm91bmRhdGlvbiA8aHR0cDovL2Rvam9mb3VuZGF0aW9uLm9yZy8+XG4gKiBCYXNlZCBvbiBVbmRlcnNjb3JlLmpzIDEuOC4zIDxodHRwOi8vdW5kZXJzY29yZWpzLm9yZy9MSUNFTlNFPlxuICogQ29weXJpZ2h0IDIwMDktMjAxNSBKZXJlbXkgQXNoa2VuYXMsIERvY3VtZW50Q2xvdWQgYW5kIEludmVzdGlnYXRpdmUgUmVwb3J0ZXJzICYgRWRpdG9yc1xuICogQXZhaWxhYmxlIHVuZGVyIE1JVCBsaWNlbnNlIDxodHRwczovL2xvZGFzaC5jb20vbGljZW5zZT5cbiAqL1xudmFyIGdldE5hdGl2ZSA9IHJlcXVpcmUoJ2xvZGFzaC5fZ2V0bmF0aXZlJyksXG4gICAgaXNBcmd1bWVudHMgPSByZXF1aXJlKCdsb2Rhc2guaXNhcmd1bWVudHMnKSxcbiAgICBpc0FycmF5ID0gcmVxdWlyZSgnbG9kYXNoLmlzYXJyYXknKTtcblxuLyoqIFVzZWQgdG8gZGV0ZWN0IHVuc2lnbmVkIGludGVnZXIgdmFsdWVzLiAqL1xudmFyIHJlSXNVaW50ID0gL15cXGQrJC87XG5cbi8qKiBVc2VkIGZvciBuYXRpdmUgbWV0aG9kIHJlZmVyZW5jZXMuICovXG52YXIgb2JqZWN0UHJvdG8gPSBPYmplY3QucHJvdG90eXBlO1xuXG4vKiogVXNlZCB0byBjaGVjayBvYmplY3RzIGZvciBvd24gcHJvcGVydGllcy4gKi9cbnZhciBoYXNPd25Qcm9wZXJ0eSA9IG9iamVjdFByb3RvLmhhc093blByb3BlcnR5O1xuXG4vKiBOYXRpdmUgbWV0aG9kIHJlZmVyZW5jZXMgZm9yIHRob3NlIHdpdGggdGhlIHNhbWUgbmFtZSBhcyBvdGhlciBgbG9kYXNoYCBtZXRob2RzLiAqL1xudmFyIG5hdGl2ZUtleXMgPSBnZXROYXRpdmUoT2JqZWN0LCAna2V5cycpO1xuXG4vKipcbiAqIFVzZWQgYXMgdGhlIFttYXhpbXVtIGxlbmd0aF0oaHR0cDovL2VjbWEtaW50ZXJuYXRpb25hbC5vcmcvZWNtYS0yNjIvNi4wLyNzZWMtbnVtYmVyLm1heF9zYWZlX2ludGVnZXIpXG4gKiBvZiBhbiBhcnJheS1saWtlIHZhbHVlLlxuICovXG52YXIgTUFYX1NBRkVfSU5URUdFUiA9IDkwMDcxOTkyNTQ3NDA5OTE7XG5cbi8qKlxuICogVGhlIGJhc2UgaW1wbGVtZW50YXRpb24gb2YgYF8ucHJvcGVydHlgIHdpdGhvdXQgc3VwcG9ydCBmb3IgZGVlcCBwYXRocy5cbiAqXG4gKiBAcHJpdmF0ZVxuICogQHBhcmFtIHtzdHJpbmd9IGtleSBUaGUga2V5IG9mIHRoZSBwcm9wZXJ0eSB0byBnZXQuXG4gKiBAcmV0dXJucyB7RnVuY3Rpb259IFJldHVybnMgdGhlIG5ldyBmdW5jdGlvbi5cbiAqL1xuZnVuY3Rpb24gYmFzZVByb3BlcnR5KGtleSkge1xuICByZXR1cm4gZnVuY3Rpb24ob2JqZWN0KSB7XG4gICAgcmV0dXJuIG9iamVjdCA9PSBudWxsID8gdW5kZWZpbmVkIDogb2JqZWN0W2tleV07XG4gIH07XG59XG5cbi8qKlxuICogR2V0cyB0aGUgXCJsZW5ndGhcIiBwcm9wZXJ0eSB2YWx1ZSBvZiBgb2JqZWN0YC5cbiAqXG4gKiAqKk5vdGU6KiogVGhpcyBmdW5jdGlvbiBpcyB1c2VkIHRvIGF2b2lkIGEgW0pJVCBidWddKGh0dHBzOi8vYnVncy53ZWJraXQub3JnL3Nob3dfYnVnLmNnaT9pZD0xNDI3OTIpXG4gKiB0aGF0IGFmZmVjdHMgU2FmYXJpIG9uIGF0IGxlYXN0IGlPUyA4LjEtOC4zIEFSTTY0LlxuICpcbiAqIEBwcml2YXRlXG4gKiBAcGFyYW0ge09iamVjdH0gb2JqZWN0IFRoZSBvYmplY3QgdG8gcXVlcnkuXG4gKiBAcmV0dXJucyB7Kn0gUmV0dXJucyB0aGUgXCJsZW5ndGhcIiB2YWx1ZS5cbiAqL1xudmFyIGdldExlbmd0aCA9IGJhc2VQcm9wZXJ0eSgnbGVuZ3RoJyk7XG5cbi8qKlxuICogQ2hlY2tzIGlmIGB2YWx1ZWAgaXMgYXJyYXktbGlrZS5cbiAqXG4gKiBAcHJpdmF0ZVxuICogQHBhcmFtIHsqfSB2YWx1ZSBUaGUgdmFsdWUgdG8gY2hlY2suXG4gKiBAcmV0dXJucyB7Ym9vbGVhbn0gUmV0dXJucyBgdHJ1ZWAgaWYgYHZhbHVlYCBpcyBhcnJheS1saWtlLCBlbHNlIGBmYWxzZWAuXG4gKi9cbmZ1bmN0aW9uIGlzQXJyYXlMaWtlKHZhbHVlKSB7XG4gIHJldHVybiB2YWx1ZSAhPSBudWxsICYmIGlzTGVuZ3RoKGdldExlbmd0aCh2YWx1ZSkpO1xufVxuXG4vKipcbiAqIENoZWNrcyBpZiBgdmFsdWVgIGlzIGEgdmFsaWQgYXJyYXktbGlrZSBpbmRleC5cbiAqXG4gKiBAcHJpdmF0ZVxuICogQHBhcmFtIHsqfSB2YWx1ZSBUaGUgdmFsdWUgdG8gY2hlY2suXG4gKiBAcGFyYW0ge251bWJlcn0gW2xlbmd0aD1NQVhfU0FGRV9JTlRFR0VSXSBUaGUgdXBwZXIgYm91bmRzIG9mIGEgdmFsaWQgaW5kZXguXG4gKiBAcmV0dXJucyB7Ym9vbGVhbn0gUmV0dXJucyBgdHJ1ZWAgaWYgYHZhbHVlYCBpcyBhIHZhbGlkIGluZGV4LCBlbHNlIGBmYWxzZWAuXG4gKi9cbmZ1bmN0aW9uIGlzSW5kZXgodmFsdWUsIGxlbmd0aCkge1xuICB2YWx1ZSA9ICh0eXBlb2YgdmFsdWUgPT0gJ251bWJlcicgfHwgcmVJc1VpbnQudGVzdCh2YWx1ZSkpID8gK3ZhbHVlIDogLTE7XG4gIGxlbmd0aCA9IGxlbmd0aCA9PSBudWxsID8gTUFYX1NBRkVfSU5URUdFUiA6IGxlbmd0aDtcbiAgcmV0dXJuIHZhbHVlID4gLTEgJiYgdmFsdWUgJSAxID09IDAgJiYgdmFsdWUgPCBsZW5ndGg7XG59XG5cbi8qKlxuICogQ2hlY2tzIGlmIGB2YWx1ZWAgaXMgYSB2YWxpZCBhcnJheS1saWtlIGxlbmd0aC5cbiAqXG4gKiAqKk5vdGU6KiogVGhpcyBmdW5jdGlvbiBpcyBiYXNlZCBvbiBbYFRvTGVuZ3RoYF0oaHR0cDovL2VjbWEtaW50ZXJuYXRpb25hbC5vcmcvZWNtYS0yNjIvNi4wLyNzZWMtdG9sZW5ndGgpLlxuICpcbiAqIEBwcml2YXRlXG4gKiBAcGFyYW0geyp9IHZhbHVlIFRoZSB2YWx1ZSB0byBjaGVjay5cbiAqIEByZXR1cm5zIHtib29sZWFufSBSZXR1cm5zIGB0cnVlYCBpZiBgdmFsdWVgIGlzIGEgdmFsaWQgbGVuZ3RoLCBlbHNlIGBmYWxzZWAuXG4gKi9cbmZ1bmN0aW9uIGlzTGVuZ3RoKHZhbHVlKSB7XG4gIHJldHVybiB0eXBlb2YgdmFsdWUgPT0gJ251bWJlcicgJiYgdmFsdWUgPiAtMSAmJiB2YWx1ZSAlIDEgPT0gMCAmJiB2YWx1ZSA8PSBNQVhfU0FGRV9JTlRFR0VSO1xufVxuXG4vKipcbiAqIEEgZmFsbGJhY2sgaW1wbGVtZW50YXRpb24gb2YgYE9iamVjdC5rZXlzYCB3aGljaCBjcmVhdGVzIGFuIGFycmF5IG9mIHRoZVxuICogb3duIGVudW1lcmFibGUgcHJvcGVydHkgbmFtZXMgb2YgYG9iamVjdGAuXG4gKlxuICogQHByaXZhdGVcbiAqIEBwYXJhbSB7T2JqZWN0fSBvYmplY3QgVGhlIG9iamVjdCB0byBxdWVyeS5cbiAqIEByZXR1cm5zIHtBcnJheX0gUmV0dXJucyB0aGUgYXJyYXkgb2YgcHJvcGVydHkgbmFtZXMuXG4gKi9cbmZ1bmN0aW9uIHNoaW1LZXlzKG9iamVjdCkge1xuICB2YXIgcHJvcHMgPSBrZXlzSW4ob2JqZWN0KSxcbiAgICAgIHByb3BzTGVuZ3RoID0gcHJvcHMubGVuZ3RoLFxuICAgICAgbGVuZ3RoID0gcHJvcHNMZW5ndGggJiYgb2JqZWN0Lmxlbmd0aDtcblxuICB2YXIgYWxsb3dJbmRleGVzID0gISFsZW5ndGggJiYgaXNMZW5ndGgobGVuZ3RoKSAmJlxuICAgIChpc0FycmF5KG9iamVjdCkgfHwgaXNBcmd1bWVudHMob2JqZWN0KSk7XG5cbiAgdmFyIGluZGV4ID0gLTEsXG4gICAgICByZXN1bHQgPSBbXTtcblxuICB3aGlsZSAoKytpbmRleCA8IHByb3BzTGVuZ3RoKSB7XG4gICAgdmFyIGtleSA9IHByb3BzW2luZGV4XTtcbiAgICBpZiAoKGFsbG93SW5kZXhlcyAmJiBpc0luZGV4KGtleSwgbGVuZ3RoKSkgfHwgaGFzT3duUHJvcGVydHkuY2FsbChvYmplY3QsIGtleSkpIHtcbiAgICAgIHJlc3VsdC5wdXNoKGtleSk7XG4gICAgfVxuICB9XG4gIHJldHVybiByZXN1bHQ7XG59XG5cbi8qKlxuICogQ2hlY2tzIGlmIGB2YWx1ZWAgaXMgdGhlIFtsYW5ndWFnZSB0eXBlXShodHRwczovL2VzNS5naXRodWIuaW8vI3g4KSBvZiBgT2JqZWN0YC5cbiAqIChlLmcuIGFycmF5cywgZnVuY3Rpb25zLCBvYmplY3RzLCByZWdleGVzLCBgbmV3IE51bWJlcigwKWAsIGFuZCBgbmV3IFN0cmluZygnJylgKVxuICpcbiAqIEBzdGF0aWNcbiAqIEBtZW1iZXJPZiBfXG4gKiBAY2F0ZWdvcnkgTGFuZ1xuICogQHBhcmFtIHsqfSB2YWx1ZSBUaGUgdmFsdWUgdG8gY2hlY2suXG4gKiBAcmV0dXJucyB7Ym9vbGVhbn0gUmV0dXJucyBgdHJ1ZWAgaWYgYHZhbHVlYCBpcyBhbiBvYmplY3QsIGVsc2UgYGZhbHNlYC5cbiAqIEBleGFtcGxlXG4gKlxuICogXy5pc09iamVjdCh7fSk7XG4gKiAvLyA9PiB0cnVlXG4gKlxuICogXy5pc09iamVjdChbMSwgMiwgM10pO1xuICogLy8gPT4gdHJ1ZVxuICpcbiAqIF8uaXNPYmplY3QoMSk7XG4gKiAvLyA9PiBmYWxzZVxuICovXG5mdW5jdGlvbiBpc09iamVjdCh2YWx1ZSkge1xuICAvLyBBdm9pZCBhIFY4IEpJVCBidWcgaW4gQ2hyb21lIDE5LTIwLlxuICAvLyBTZWUgaHR0cHM6Ly9jb2RlLmdvb2dsZS5jb20vcC92OC9pc3N1ZXMvZGV0YWlsP2lkPTIyOTEgZm9yIG1vcmUgZGV0YWlscy5cbiAgdmFyIHR5cGUgPSB0eXBlb2YgdmFsdWU7XG4gIHJldHVybiAhIXZhbHVlICYmICh0eXBlID09ICdvYmplY3QnIHx8IHR5cGUgPT0gJ2Z1bmN0aW9uJyk7XG59XG5cbi8qKlxuICogQ3JlYXRlcyBhbiBhcnJheSBvZiB0aGUgb3duIGVudW1lcmFibGUgcHJvcGVydHkgbmFtZXMgb2YgYG9iamVjdGAuXG4gKlxuICogKipOb3RlOioqIE5vbi1vYmplY3QgdmFsdWVzIGFyZSBjb2VyY2VkIHRvIG9iamVjdHMuIFNlZSB0aGVcbiAqIFtFUyBzcGVjXShodHRwOi8vZWNtYS1pbnRlcm5hdGlvbmFsLm9yZy9lY21hLTI2Mi82LjAvI3NlYy1vYmplY3Qua2V5cylcbiAqIGZvciBtb3JlIGRldGFpbHMuXG4gKlxuICogQHN0YXRpY1xuICogQG1lbWJlck9mIF9cbiAqIEBjYXRlZ29yeSBPYmplY3RcbiAqIEBwYXJhbSB7T2JqZWN0fSBvYmplY3QgVGhlIG9iamVjdCB0byBxdWVyeS5cbiAqIEByZXR1cm5zIHtBcnJheX0gUmV0dXJucyB0aGUgYXJyYXkgb2YgcHJvcGVydHkgbmFtZXMuXG4gKiBAZXhhbXBsZVxuICpcbiAqIGZ1bmN0aW9uIEZvbygpIHtcbiAqICAgdGhpcy5hID0gMTtcbiAqICAgdGhpcy5iID0gMjtcbiAqIH1cbiAqXG4gKiBGb28ucHJvdG90eXBlLmMgPSAzO1xuICpcbiAqIF8ua2V5cyhuZXcgRm9vKTtcbiAqIC8vID0+IFsnYScsICdiJ10gKGl0ZXJhdGlvbiBvcmRlciBpcyBub3QgZ3VhcmFudGVlZClcbiAqXG4gKiBfLmtleXMoJ2hpJyk7XG4gKiAvLyA9PiBbJzAnLCAnMSddXG4gKi9cbnZhciBrZXlzID0gIW5hdGl2ZUtleXMgPyBzaGltS2V5cyA6IGZ1bmN0aW9uKG9iamVjdCkge1xuICB2YXIgQ3RvciA9IG9iamVjdCA9PSBudWxsID8gdW5kZWZpbmVkIDogb2JqZWN0LmNvbnN0cnVjdG9yO1xuICBpZiAoKHR5cGVvZiBDdG9yID09ICdmdW5jdGlvbicgJiYgQ3Rvci5wcm90b3R5cGUgPT09IG9iamVjdCkgfHxcbiAgICAgICh0eXBlb2Ygb2JqZWN0ICE9ICdmdW5jdGlvbicgJiYgaXNBcnJheUxpa2Uob2JqZWN0KSkpIHtcbiAgICByZXR1cm4gc2hpbUtleXMob2JqZWN0KTtcbiAgfVxuICByZXR1cm4gaXNPYmplY3Qob2JqZWN0KSA/IG5hdGl2ZUtleXMob2JqZWN0KSA6IFtdO1xufTtcblxuLyoqXG4gKiBDcmVhdGVzIGFuIGFycmF5IG9mIHRoZSBvd24gYW5kIGluaGVyaXRlZCBlbnVtZXJhYmxlIHByb3BlcnR5IG5hbWVzIG9mIGBvYmplY3RgLlxuICpcbiAqICoqTm90ZToqKiBOb24tb2JqZWN0IHZhbHVlcyBhcmUgY29lcmNlZCB0byBvYmplY3RzLlxuICpcbiAqIEBzdGF0aWNcbiAqIEBtZW1iZXJPZiBfXG4gKiBAY2F0ZWdvcnkgT2JqZWN0XG4gKiBAcGFyYW0ge09iamVjdH0gb2JqZWN0IFRoZSBvYmplY3QgdG8gcXVlcnkuXG4gKiBAcmV0dXJucyB7QXJyYXl9IFJldHVybnMgdGhlIGFycmF5IG9mIHByb3BlcnR5IG5hbWVzLlxuICogQGV4YW1wbGVcbiAqXG4gKiBmdW5jdGlvbiBGb28oKSB7XG4gKiAgIHRoaXMuYSA9IDE7XG4gKiAgIHRoaXMuYiA9IDI7XG4gKiB9XG4gKlxuICogRm9vLnByb3RvdHlwZS5jID0gMztcbiAqXG4gKiBfLmtleXNJbihuZXcgRm9vKTtcbiAqIC8vID0+IFsnYScsICdiJywgJ2MnXSAoaXRlcmF0aW9uIG9yZGVyIGlzIG5vdCBndWFyYW50ZWVkKVxuICovXG5mdW5jdGlvbiBrZXlzSW4ob2JqZWN0KSB7XG4gIGlmIChvYmplY3QgPT0gbnVsbCkge1xuICAgIHJldHVybiBbXTtcbiAgfVxuICBpZiAoIWlzT2JqZWN0KG9iamVjdCkpIHtcbiAgICBvYmplY3QgPSBPYmplY3Qob2JqZWN0KTtcbiAgfVxuICB2YXIgbGVuZ3RoID0gb2JqZWN0Lmxlbmd0aDtcbiAgbGVuZ3RoID0gKGxlbmd0aCAmJiBpc0xlbmd0aChsZW5ndGgpICYmXG4gICAgKGlzQXJyYXkob2JqZWN0KSB8fCBpc0FyZ3VtZW50cyhvYmplY3QpKSAmJiBsZW5ndGgpIHx8IDA7XG5cbiAgdmFyIEN0b3IgPSBvYmplY3QuY29uc3RydWN0b3IsXG4gICAgICBpbmRleCA9IC0xLFxuICAgICAgaXNQcm90byA9IHR5cGVvZiBDdG9yID09ICdmdW5jdGlvbicgJiYgQ3Rvci5wcm90b3R5cGUgPT09IG9iamVjdCxcbiAgICAgIHJlc3VsdCA9IEFycmF5KGxlbmd0aCksXG4gICAgICBza2lwSW5kZXhlcyA9IGxlbmd0aCA+IDA7XG5cbiAgd2hpbGUgKCsraW5kZXggPCBsZW5ndGgpIHtcbiAgICByZXN1bHRbaW5kZXhdID0gKGluZGV4ICsgJycpO1xuICB9XG4gIGZvciAodmFyIGtleSBpbiBvYmplY3QpIHtcbiAgICBpZiAoIShza2lwSW5kZXhlcyAmJiBpc0luZGV4KGtleSwgbGVuZ3RoKSkgJiZcbiAgICAgICAgIShrZXkgPT0gJ2NvbnN0cnVjdG9yJyAmJiAoaXNQcm90byB8fCAhaGFzT3duUHJvcGVydHkuY2FsbChvYmplY3QsIGtleSkpKSkge1xuICAgICAgcmVzdWx0LnB1c2goa2V5KTtcbiAgICB9XG4gIH1cbiAgcmV0dXJuIHJlc3VsdDtcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBrZXlzO1xuIiwiLyoqXG4gKiBsb2Rhc2ggMy45LjEgKEN1c3RvbSBCdWlsZCkgPGh0dHBzOi8vbG9kYXNoLmNvbS8+XG4gKiBCdWlsZDogYGxvZGFzaCBtb2Rlcm4gbW9kdWxhcml6ZSBleHBvcnRzPVwibnBtXCIgLW8gLi9gXG4gKiBDb3B5cmlnaHQgMjAxMi0yMDE1IFRoZSBEb2pvIEZvdW5kYXRpb24gPGh0dHA6Ly9kb2pvZm91bmRhdGlvbi5vcmcvPlxuICogQmFzZWQgb24gVW5kZXJzY29yZS5qcyAxLjguMyA8aHR0cDovL3VuZGVyc2NvcmVqcy5vcmcvTElDRU5TRT5cbiAqIENvcHlyaWdodCAyMDA5LTIwMTUgSmVyZW15IEFzaGtlbmFzLCBEb2N1bWVudENsb3VkIGFuZCBJbnZlc3RpZ2F0aXZlIFJlcG9ydGVycyAmIEVkaXRvcnNcbiAqIEF2YWlsYWJsZSB1bmRlciBNSVQgbGljZW5zZSA8aHR0cHM6Ly9sb2Rhc2guY29tL2xpY2Vuc2U+XG4gKi9cblxuLyoqIGBPYmplY3QjdG9TdHJpbmdgIHJlc3VsdCByZWZlcmVuY2VzLiAqL1xudmFyIGZ1bmNUYWcgPSAnW29iamVjdCBGdW5jdGlvbl0nO1xuXG4vKiogVXNlZCB0byBkZXRlY3QgaG9zdCBjb25zdHJ1Y3RvcnMgKFNhZmFyaSA+IDUpLiAqL1xudmFyIHJlSXNIb3N0Q3RvciA9IC9eXFxbb2JqZWN0IC4rP0NvbnN0cnVjdG9yXFxdJC87XG5cbi8qKlxuICogQ2hlY2tzIGlmIGB2YWx1ZWAgaXMgb2JqZWN0LWxpa2UuXG4gKlxuICogQHByaXZhdGVcbiAqIEBwYXJhbSB7Kn0gdmFsdWUgVGhlIHZhbHVlIHRvIGNoZWNrLlxuICogQHJldHVybnMge2Jvb2xlYW59IFJldHVybnMgYHRydWVgIGlmIGB2YWx1ZWAgaXMgb2JqZWN0LWxpa2UsIGVsc2UgYGZhbHNlYC5cbiAqL1xuZnVuY3Rpb24gaXNPYmplY3RMaWtlKHZhbHVlKSB7XG4gIHJldHVybiAhIXZhbHVlICYmIHR5cGVvZiB2YWx1ZSA9PSAnb2JqZWN0Jztcbn1cblxuLyoqIFVzZWQgZm9yIG5hdGl2ZSBtZXRob2QgcmVmZXJlbmNlcy4gKi9cbnZhciBvYmplY3RQcm90byA9IE9iamVjdC5wcm90b3R5cGU7XG5cbi8qKiBVc2VkIHRvIHJlc29sdmUgdGhlIGRlY29tcGlsZWQgc291cmNlIG9mIGZ1bmN0aW9ucy4gKi9cbnZhciBmblRvU3RyaW5nID0gRnVuY3Rpb24ucHJvdG90eXBlLnRvU3RyaW5nO1xuXG4vKiogVXNlZCB0byBjaGVjayBvYmplY3RzIGZvciBvd24gcHJvcGVydGllcy4gKi9cbnZhciBoYXNPd25Qcm9wZXJ0eSA9IG9iamVjdFByb3RvLmhhc093blByb3BlcnR5O1xuXG4vKipcbiAqIFVzZWQgdG8gcmVzb2x2ZSB0aGUgW2B0b1N0cmluZ1RhZ2BdKGh0dHA6Ly9lY21hLWludGVybmF0aW9uYWwub3JnL2VjbWEtMjYyLzYuMC8jc2VjLW9iamVjdC5wcm90b3R5cGUudG9zdHJpbmcpXG4gKiBvZiB2YWx1ZXMuXG4gKi9cbnZhciBvYmpUb1N0cmluZyA9IG9iamVjdFByb3RvLnRvU3RyaW5nO1xuXG4vKiogVXNlZCB0byBkZXRlY3QgaWYgYSBtZXRob2QgaXMgbmF0aXZlLiAqL1xudmFyIHJlSXNOYXRpdmUgPSBSZWdFeHAoJ14nICtcbiAgZm5Ub1N0cmluZy5jYWxsKGhhc093blByb3BlcnR5KS5yZXBsYWNlKC9bXFxcXF4kLiorPygpW1xcXXt9fF0vZywgJ1xcXFwkJicpXG4gIC5yZXBsYWNlKC9oYXNPd25Qcm9wZXJ0eXwoZnVuY3Rpb24pLio/KD89XFxcXFxcKCl8IGZvciAuKz8oPz1cXFxcXFxdKS9nLCAnJDEuKj8nKSArICckJ1xuKTtcblxuLyoqXG4gKiBHZXRzIHRoZSBuYXRpdmUgZnVuY3Rpb24gYXQgYGtleWAgb2YgYG9iamVjdGAuXG4gKlxuICogQHByaXZhdGVcbiAqIEBwYXJhbSB7T2JqZWN0fSBvYmplY3QgVGhlIG9iamVjdCB0byBxdWVyeS5cbiAqIEBwYXJhbSB7c3RyaW5nfSBrZXkgVGhlIGtleSBvZiB0aGUgbWV0aG9kIHRvIGdldC5cbiAqIEByZXR1cm5zIHsqfSBSZXR1cm5zIHRoZSBmdW5jdGlvbiBpZiBpdCdzIG5hdGl2ZSwgZWxzZSBgdW5kZWZpbmVkYC5cbiAqL1xuZnVuY3Rpb24gZ2V0TmF0aXZlKG9iamVjdCwga2V5KSB7XG4gIHZhciB2YWx1ZSA9IG9iamVjdCA9PSBudWxsID8gdW5kZWZpbmVkIDogb2JqZWN0W2tleV07XG4gIHJldHVybiBpc05hdGl2ZSh2YWx1ZSkgPyB2YWx1ZSA6IHVuZGVmaW5lZDtcbn1cblxuLyoqXG4gKiBDaGVja3MgaWYgYHZhbHVlYCBpcyBjbGFzc2lmaWVkIGFzIGEgYEZ1bmN0aW9uYCBvYmplY3QuXG4gKlxuICogQHN0YXRpY1xuICogQG1lbWJlck9mIF9cbiAqIEBjYXRlZ29yeSBMYW5nXG4gKiBAcGFyYW0geyp9IHZhbHVlIFRoZSB2YWx1ZSB0byBjaGVjay5cbiAqIEByZXR1cm5zIHtib29sZWFufSBSZXR1cm5zIGB0cnVlYCBpZiBgdmFsdWVgIGlzIGNvcnJlY3RseSBjbGFzc2lmaWVkLCBlbHNlIGBmYWxzZWAuXG4gKiBAZXhhbXBsZVxuICpcbiAqIF8uaXNGdW5jdGlvbihfKTtcbiAqIC8vID0+IHRydWVcbiAqXG4gKiBfLmlzRnVuY3Rpb24oL2FiYy8pO1xuICogLy8gPT4gZmFsc2VcbiAqL1xuZnVuY3Rpb24gaXNGdW5jdGlvbih2YWx1ZSkge1xuICAvLyBUaGUgdXNlIG9mIGBPYmplY3QjdG9TdHJpbmdgIGF2b2lkcyBpc3N1ZXMgd2l0aCB0aGUgYHR5cGVvZmAgb3BlcmF0b3JcbiAgLy8gaW4gb2xkZXIgdmVyc2lvbnMgb2YgQ2hyb21lIGFuZCBTYWZhcmkgd2hpY2ggcmV0dXJuICdmdW5jdGlvbicgZm9yIHJlZ2V4ZXNcbiAgLy8gYW5kIFNhZmFyaSA4IGVxdWl2YWxlbnRzIHdoaWNoIHJldHVybiAnb2JqZWN0JyBmb3IgdHlwZWQgYXJyYXkgY29uc3RydWN0b3JzLlxuICByZXR1cm4gaXNPYmplY3QodmFsdWUpICYmIG9ialRvU3RyaW5nLmNhbGwodmFsdWUpID09IGZ1bmNUYWc7XG59XG5cbi8qKlxuICogQ2hlY2tzIGlmIGB2YWx1ZWAgaXMgdGhlIFtsYW5ndWFnZSB0eXBlXShodHRwczovL2VzNS5naXRodWIuaW8vI3g4KSBvZiBgT2JqZWN0YC5cbiAqIChlLmcuIGFycmF5cywgZnVuY3Rpb25zLCBvYmplY3RzLCByZWdleGVzLCBgbmV3IE51bWJlcigwKWAsIGFuZCBgbmV3IFN0cmluZygnJylgKVxuICpcbiAqIEBzdGF0aWNcbiAqIEBtZW1iZXJPZiBfXG4gKiBAY2F0ZWdvcnkgTGFuZ1xuICogQHBhcmFtIHsqfSB2YWx1ZSBUaGUgdmFsdWUgdG8gY2hlY2suXG4gKiBAcmV0dXJucyB7Ym9vbGVhbn0gUmV0dXJucyBgdHJ1ZWAgaWYgYHZhbHVlYCBpcyBhbiBvYmplY3QsIGVsc2UgYGZhbHNlYC5cbiAqIEBleGFtcGxlXG4gKlxuICogXy5pc09iamVjdCh7fSk7XG4gKiAvLyA9PiB0cnVlXG4gKlxuICogXy5pc09iamVjdChbMSwgMiwgM10pO1xuICogLy8gPT4gdHJ1ZVxuICpcbiAqIF8uaXNPYmplY3QoMSk7XG4gKiAvLyA9PiBmYWxzZVxuICovXG5mdW5jdGlvbiBpc09iamVjdCh2YWx1ZSkge1xuICAvLyBBdm9pZCBhIFY4IEpJVCBidWcgaW4gQ2hyb21lIDE5LTIwLlxuICAvLyBTZWUgaHR0cHM6Ly9jb2RlLmdvb2dsZS5jb20vcC92OC9pc3N1ZXMvZGV0YWlsP2lkPTIyOTEgZm9yIG1vcmUgZGV0YWlscy5cbiAgdmFyIHR5cGUgPSB0eXBlb2YgdmFsdWU7XG4gIHJldHVybiAhIXZhbHVlICYmICh0eXBlID09ICdvYmplY3QnIHx8IHR5cGUgPT0gJ2Z1bmN0aW9uJyk7XG59XG5cbi8qKlxuICogQ2hlY2tzIGlmIGB2YWx1ZWAgaXMgYSBuYXRpdmUgZnVuY3Rpb24uXG4gKlxuICogQHN0YXRpY1xuICogQG1lbWJlck9mIF9cbiAqIEBjYXRlZ29yeSBMYW5nXG4gKiBAcGFyYW0geyp9IHZhbHVlIFRoZSB2YWx1ZSB0byBjaGVjay5cbiAqIEByZXR1cm5zIHtib29sZWFufSBSZXR1cm5zIGB0cnVlYCBpZiBgdmFsdWVgIGlzIGEgbmF0aXZlIGZ1bmN0aW9uLCBlbHNlIGBmYWxzZWAuXG4gKiBAZXhhbXBsZVxuICpcbiAqIF8uaXNOYXRpdmUoQXJyYXkucHJvdG90eXBlLnB1c2gpO1xuICogLy8gPT4gdHJ1ZVxuICpcbiAqIF8uaXNOYXRpdmUoXyk7XG4gKiAvLyA9PiBmYWxzZVxuICovXG5mdW5jdGlvbiBpc05hdGl2ZSh2YWx1ZSkge1xuICBpZiAodmFsdWUgPT0gbnVsbCkge1xuICAgIHJldHVybiBmYWxzZTtcbiAgfVxuICBpZiAoaXNGdW5jdGlvbih2YWx1ZSkpIHtcbiAgICByZXR1cm4gcmVJc05hdGl2ZS50ZXN0KGZuVG9TdHJpbmcuY2FsbCh2YWx1ZSkpO1xuICB9XG4gIHJldHVybiBpc09iamVjdExpa2UodmFsdWUpICYmIHJlSXNIb3N0Q3Rvci50ZXN0KHZhbHVlKTtcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBnZXROYXRpdmU7XG4iLCIvKipcbiAqIGxvZGFzaCAzLjAuNCAoQ3VzdG9tIEJ1aWxkKSA8aHR0cHM6Ly9sb2Rhc2guY29tLz5cbiAqIEJ1aWxkOiBgbG9kYXNoIG1vZGVybiBtb2R1bGFyaXplIGV4cG9ydHM9XCJucG1cIiAtbyAuL2BcbiAqIENvcHlyaWdodCAyMDEyLTIwMTUgVGhlIERvam8gRm91bmRhdGlvbiA8aHR0cDovL2Rvam9mb3VuZGF0aW9uLm9yZy8+XG4gKiBCYXNlZCBvbiBVbmRlcnNjb3JlLmpzIDEuOC4zIDxodHRwOi8vdW5kZXJzY29yZWpzLm9yZy9MSUNFTlNFPlxuICogQ29weXJpZ2h0IDIwMDktMjAxNSBKZXJlbXkgQXNoa2VuYXMsIERvY3VtZW50Q2xvdWQgYW5kIEludmVzdGlnYXRpdmUgUmVwb3J0ZXJzICYgRWRpdG9yc1xuICogQXZhaWxhYmxlIHVuZGVyIE1JVCBsaWNlbnNlIDxodHRwczovL2xvZGFzaC5jb20vbGljZW5zZT5cbiAqL1xuXG4vKipcbiAqIENoZWNrcyBpZiBgdmFsdWVgIGlzIG9iamVjdC1saWtlLlxuICpcbiAqIEBwcml2YXRlXG4gKiBAcGFyYW0geyp9IHZhbHVlIFRoZSB2YWx1ZSB0byBjaGVjay5cbiAqIEByZXR1cm5zIHtib29sZWFufSBSZXR1cm5zIGB0cnVlYCBpZiBgdmFsdWVgIGlzIG9iamVjdC1saWtlLCBlbHNlIGBmYWxzZWAuXG4gKi9cbmZ1bmN0aW9uIGlzT2JqZWN0TGlrZSh2YWx1ZSkge1xuICByZXR1cm4gISF2YWx1ZSAmJiB0eXBlb2YgdmFsdWUgPT0gJ29iamVjdCc7XG59XG5cbi8qKiBVc2VkIGZvciBuYXRpdmUgbWV0aG9kIHJlZmVyZW5jZXMuICovXG52YXIgb2JqZWN0UHJvdG8gPSBPYmplY3QucHJvdG90eXBlO1xuXG4vKiogVXNlZCB0byBjaGVjayBvYmplY3RzIGZvciBvd24gcHJvcGVydGllcy4gKi9cbnZhciBoYXNPd25Qcm9wZXJ0eSA9IG9iamVjdFByb3RvLmhhc093blByb3BlcnR5O1xuXG4vKiogTmF0aXZlIG1ldGhvZCByZWZlcmVuY2VzLiAqL1xudmFyIHByb3BlcnR5SXNFbnVtZXJhYmxlID0gb2JqZWN0UHJvdG8ucHJvcGVydHlJc0VudW1lcmFibGU7XG5cbi8qKlxuICogVXNlZCBhcyB0aGUgW21heGltdW0gbGVuZ3RoXShodHRwOi8vZWNtYS1pbnRlcm5hdGlvbmFsLm9yZy9lY21hLTI2Mi82LjAvI3NlYy1udW1iZXIubWF4X3NhZmVfaW50ZWdlcilcbiAqIG9mIGFuIGFycmF5LWxpa2UgdmFsdWUuXG4gKi9cbnZhciBNQVhfU0FGRV9JTlRFR0VSID0gOTAwNzE5OTI1NDc0MDk5MTtcblxuLyoqXG4gKiBUaGUgYmFzZSBpbXBsZW1lbnRhdGlvbiBvZiBgXy5wcm9wZXJ0eWAgd2l0aG91dCBzdXBwb3J0IGZvciBkZWVwIHBhdGhzLlxuICpcbiAqIEBwcml2YXRlXG4gKiBAcGFyYW0ge3N0cmluZ30ga2V5IFRoZSBrZXkgb2YgdGhlIHByb3BlcnR5IHRvIGdldC5cbiAqIEByZXR1cm5zIHtGdW5jdGlvbn0gUmV0dXJucyB0aGUgbmV3IGZ1bmN0aW9uLlxuICovXG5mdW5jdGlvbiBiYXNlUHJvcGVydHkoa2V5KSB7XG4gIHJldHVybiBmdW5jdGlvbihvYmplY3QpIHtcbiAgICByZXR1cm4gb2JqZWN0ID09IG51bGwgPyB1bmRlZmluZWQgOiBvYmplY3Rba2V5XTtcbiAgfTtcbn1cblxuLyoqXG4gKiBHZXRzIHRoZSBcImxlbmd0aFwiIHByb3BlcnR5IHZhbHVlIG9mIGBvYmplY3RgLlxuICpcbiAqICoqTm90ZToqKiBUaGlzIGZ1bmN0aW9uIGlzIHVzZWQgdG8gYXZvaWQgYSBbSklUIGJ1Z10oaHR0cHM6Ly9idWdzLndlYmtpdC5vcmcvc2hvd19idWcuY2dpP2lkPTE0Mjc5MilcbiAqIHRoYXQgYWZmZWN0cyBTYWZhcmkgb24gYXQgbGVhc3QgaU9TIDguMS04LjMgQVJNNjQuXG4gKlxuICogQHByaXZhdGVcbiAqIEBwYXJhbSB7T2JqZWN0fSBvYmplY3QgVGhlIG9iamVjdCB0byBxdWVyeS5cbiAqIEByZXR1cm5zIHsqfSBSZXR1cm5zIHRoZSBcImxlbmd0aFwiIHZhbHVlLlxuICovXG52YXIgZ2V0TGVuZ3RoID0gYmFzZVByb3BlcnR5KCdsZW5ndGgnKTtcblxuLyoqXG4gKiBDaGVja3MgaWYgYHZhbHVlYCBpcyBhcnJheS1saWtlLlxuICpcbiAqIEBwcml2YXRlXG4gKiBAcGFyYW0geyp9IHZhbHVlIFRoZSB2YWx1ZSB0byBjaGVjay5cbiAqIEByZXR1cm5zIHtib29sZWFufSBSZXR1cm5zIGB0cnVlYCBpZiBgdmFsdWVgIGlzIGFycmF5LWxpa2UsIGVsc2UgYGZhbHNlYC5cbiAqL1xuZnVuY3Rpb24gaXNBcnJheUxpa2UodmFsdWUpIHtcbiAgcmV0dXJuIHZhbHVlICE9IG51bGwgJiYgaXNMZW5ndGgoZ2V0TGVuZ3RoKHZhbHVlKSk7XG59XG5cbi8qKlxuICogQ2hlY2tzIGlmIGB2YWx1ZWAgaXMgYSB2YWxpZCBhcnJheS1saWtlIGxlbmd0aC5cbiAqXG4gKiAqKk5vdGU6KiogVGhpcyBmdW5jdGlvbiBpcyBiYXNlZCBvbiBbYFRvTGVuZ3RoYF0oaHR0cDovL2VjbWEtaW50ZXJuYXRpb25hbC5vcmcvZWNtYS0yNjIvNi4wLyNzZWMtdG9sZW5ndGgpLlxuICpcbiAqIEBwcml2YXRlXG4gKiBAcGFyYW0geyp9IHZhbHVlIFRoZSB2YWx1ZSB0byBjaGVjay5cbiAqIEByZXR1cm5zIHtib29sZWFufSBSZXR1cm5zIGB0cnVlYCBpZiBgdmFsdWVgIGlzIGEgdmFsaWQgbGVuZ3RoLCBlbHNlIGBmYWxzZWAuXG4gKi9cbmZ1bmN0aW9uIGlzTGVuZ3RoKHZhbHVlKSB7XG4gIHJldHVybiB0eXBlb2YgdmFsdWUgPT0gJ251bWJlcicgJiYgdmFsdWUgPiAtMSAmJiB2YWx1ZSAlIDEgPT0gMCAmJiB2YWx1ZSA8PSBNQVhfU0FGRV9JTlRFR0VSO1xufVxuXG4vKipcbiAqIENoZWNrcyBpZiBgdmFsdWVgIGlzIGNsYXNzaWZpZWQgYXMgYW4gYGFyZ3VtZW50c2Agb2JqZWN0LlxuICpcbiAqIEBzdGF0aWNcbiAqIEBtZW1iZXJPZiBfXG4gKiBAY2F0ZWdvcnkgTGFuZ1xuICogQHBhcmFtIHsqfSB2YWx1ZSBUaGUgdmFsdWUgdG8gY2hlY2suXG4gKiBAcmV0dXJucyB7Ym9vbGVhbn0gUmV0dXJucyBgdHJ1ZWAgaWYgYHZhbHVlYCBpcyBjb3JyZWN0bHkgY2xhc3NpZmllZCwgZWxzZSBgZmFsc2VgLlxuICogQGV4YW1wbGVcbiAqXG4gKiBfLmlzQXJndW1lbnRzKGZ1bmN0aW9uKCkgeyByZXR1cm4gYXJndW1lbnRzOyB9KCkpO1xuICogLy8gPT4gdHJ1ZVxuICpcbiAqIF8uaXNBcmd1bWVudHMoWzEsIDIsIDNdKTtcbiAqIC8vID0+IGZhbHNlXG4gKi9cbmZ1bmN0aW9uIGlzQXJndW1lbnRzKHZhbHVlKSB7XG4gIHJldHVybiBpc09iamVjdExpa2UodmFsdWUpICYmIGlzQXJyYXlMaWtlKHZhbHVlKSAmJlxuICAgIGhhc093blByb3BlcnR5LmNhbGwodmFsdWUsICdjYWxsZWUnKSAmJiAhcHJvcGVydHlJc0VudW1lcmFibGUuY2FsbCh2YWx1ZSwgJ2NhbGxlZScpO1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IGlzQXJndW1lbnRzO1xuIiwiLyoqXG4gKiBsb2Rhc2ggMy4wLjQgKEN1c3RvbSBCdWlsZCkgPGh0dHBzOi8vbG9kYXNoLmNvbS8+XG4gKiBCdWlsZDogYGxvZGFzaCBtb2Rlcm4gbW9kdWxhcml6ZSBleHBvcnRzPVwibnBtXCIgLW8gLi9gXG4gKiBDb3B5cmlnaHQgMjAxMi0yMDE1IFRoZSBEb2pvIEZvdW5kYXRpb24gPGh0dHA6Ly9kb2pvZm91bmRhdGlvbi5vcmcvPlxuICogQmFzZWQgb24gVW5kZXJzY29yZS5qcyAxLjguMyA8aHR0cDovL3VuZGVyc2NvcmVqcy5vcmcvTElDRU5TRT5cbiAqIENvcHlyaWdodCAyMDA5LTIwMTUgSmVyZW15IEFzaGtlbmFzLCBEb2N1bWVudENsb3VkIGFuZCBJbnZlc3RpZ2F0aXZlIFJlcG9ydGVycyAmIEVkaXRvcnNcbiAqIEF2YWlsYWJsZSB1bmRlciBNSVQgbGljZW5zZSA8aHR0cHM6Ly9sb2Rhc2guY29tL2xpY2Vuc2U+XG4gKi9cblxuLyoqIGBPYmplY3QjdG9TdHJpbmdgIHJlc3VsdCByZWZlcmVuY2VzLiAqL1xudmFyIGFycmF5VGFnID0gJ1tvYmplY3QgQXJyYXldJyxcbiAgICBmdW5jVGFnID0gJ1tvYmplY3QgRnVuY3Rpb25dJztcblxuLyoqIFVzZWQgdG8gZGV0ZWN0IGhvc3QgY29uc3RydWN0b3JzIChTYWZhcmkgPiA1KS4gKi9cbnZhciByZUlzSG9zdEN0b3IgPSAvXlxcW29iamVjdCAuKz9Db25zdHJ1Y3RvclxcXSQvO1xuXG4vKipcbiAqIENoZWNrcyBpZiBgdmFsdWVgIGlzIG9iamVjdC1saWtlLlxuICpcbiAqIEBwcml2YXRlXG4gKiBAcGFyYW0geyp9IHZhbHVlIFRoZSB2YWx1ZSB0byBjaGVjay5cbiAqIEByZXR1cm5zIHtib29sZWFufSBSZXR1cm5zIGB0cnVlYCBpZiBgdmFsdWVgIGlzIG9iamVjdC1saWtlLCBlbHNlIGBmYWxzZWAuXG4gKi9cbmZ1bmN0aW9uIGlzT2JqZWN0TGlrZSh2YWx1ZSkge1xuICByZXR1cm4gISF2YWx1ZSAmJiB0eXBlb2YgdmFsdWUgPT0gJ29iamVjdCc7XG59XG5cbi8qKiBVc2VkIGZvciBuYXRpdmUgbWV0aG9kIHJlZmVyZW5jZXMuICovXG52YXIgb2JqZWN0UHJvdG8gPSBPYmplY3QucHJvdG90eXBlO1xuXG4vKiogVXNlZCB0byByZXNvbHZlIHRoZSBkZWNvbXBpbGVkIHNvdXJjZSBvZiBmdW5jdGlvbnMuICovXG52YXIgZm5Ub1N0cmluZyA9IEZ1bmN0aW9uLnByb3RvdHlwZS50b1N0cmluZztcblxuLyoqIFVzZWQgdG8gY2hlY2sgb2JqZWN0cyBmb3Igb3duIHByb3BlcnRpZXMuICovXG52YXIgaGFzT3duUHJvcGVydHkgPSBvYmplY3RQcm90by5oYXNPd25Qcm9wZXJ0eTtcblxuLyoqXG4gKiBVc2VkIHRvIHJlc29sdmUgdGhlIFtgdG9TdHJpbmdUYWdgXShodHRwOi8vZWNtYS1pbnRlcm5hdGlvbmFsLm9yZy9lY21hLTI2Mi82LjAvI3NlYy1vYmplY3QucHJvdG90eXBlLnRvc3RyaW5nKVxuICogb2YgdmFsdWVzLlxuICovXG52YXIgb2JqVG9TdHJpbmcgPSBvYmplY3RQcm90by50b1N0cmluZztcblxuLyoqIFVzZWQgdG8gZGV0ZWN0IGlmIGEgbWV0aG9kIGlzIG5hdGl2ZS4gKi9cbnZhciByZUlzTmF0aXZlID0gUmVnRXhwKCdeJyArXG4gIGZuVG9TdHJpbmcuY2FsbChoYXNPd25Qcm9wZXJ0eSkucmVwbGFjZSgvW1xcXFxeJC4qKz8oKVtcXF17fXxdL2csICdcXFxcJCYnKVxuICAucmVwbGFjZSgvaGFzT3duUHJvcGVydHl8KGZ1bmN0aW9uKS4qPyg/PVxcXFxcXCgpfCBmb3IgLis/KD89XFxcXFxcXSkvZywgJyQxLio/JykgKyAnJCdcbik7XG5cbi8qIE5hdGl2ZSBtZXRob2QgcmVmZXJlbmNlcyBmb3IgdGhvc2Ugd2l0aCB0aGUgc2FtZSBuYW1lIGFzIG90aGVyIGBsb2Rhc2hgIG1ldGhvZHMuICovXG52YXIgbmF0aXZlSXNBcnJheSA9IGdldE5hdGl2ZShBcnJheSwgJ2lzQXJyYXknKTtcblxuLyoqXG4gKiBVc2VkIGFzIHRoZSBbbWF4aW11bSBsZW5ndGhdKGh0dHA6Ly9lY21hLWludGVybmF0aW9uYWwub3JnL2VjbWEtMjYyLzYuMC8jc2VjLW51bWJlci5tYXhfc2FmZV9pbnRlZ2VyKVxuICogb2YgYW4gYXJyYXktbGlrZSB2YWx1ZS5cbiAqL1xudmFyIE1BWF9TQUZFX0lOVEVHRVIgPSA5MDA3MTk5MjU0NzQwOTkxO1xuXG4vKipcbiAqIEdldHMgdGhlIG5hdGl2ZSBmdW5jdGlvbiBhdCBga2V5YCBvZiBgb2JqZWN0YC5cbiAqXG4gKiBAcHJpdmF0ZVxuICogQHBhcmFtIHtPYmplY3R9IG9iamVjdCBUaGUgb2JqZWN0IHRvIHF1ZXJ5LlxuICogQHBhcmFtIHtzdHJpbmd9IGtleSBUaGUga2V5IG9mIHRoZSBtZXRob2QgdG8gZ2V0LlxuICogQHJldHVybnMgeyp9IFJldHVybnMgdGhlIGZ1bmN0aW9uIGlmIGl0J3MgbmF0aXZlLCBlbHNlIGB1bmRlZmluZWRgLlxuICovXG5mdW5jdGlvbiBnZXROYXRpdmUob2JqZWN0LCBrZXkpIHtcbiAgdmFyIHZhbHVlID0gb2JqZWN0ID09IG51bGwgPyB1bmRlZmluZWQgOiBvYmplY3Rba2V5XTtcbiAgcmV0dXJuIGlzTmF0aXZlKHZhbHVlKSA/IHZhbHVlIDogdW5kZWZpbmVkO1xufVxuXG4vKipcbiAqIENoZWNrcyBpZiBgdmFsdWVgIGlzIGEgdmFsaWQgYXJyYXktbGlrZSBsZW5ndGguXG4gKlxuICogKipOb3RlOioqIFRoaXMgZnVuY3Rpb24gaXMgYmFzZWQgb24gW2BUb0xlbmd0aGBdKGh0dHA6Ly9lY21hLWludGVybmF0aW9uYWwub3JnL2VjbWEtMjYyLzYuMC8jc2VjLXRvbGVuZ3RoKS5cbiAqXG4gKiBAcHJpdmF0ZVxuICogQHBhcmFtIHsqfSB2YWx1ZSBUaGUgdmFsdWUgdG8gY2hlY2suXG4gKiBAcmV0dXJucyB7Ym9vbGVhbn0gUmV0dXJucyBgdHJ1ZWAgaWYgYHZhbHVlYCBpcyBhIHZhbGlkIGxlbmd0aCwgZWxzZSBgZmFsc2VgLlxuICovXG5mdW5jdGlvbiBpc0xlbmd0aCh2YWx1ZSkge1xuICByZXR1cm4gdHlwZW9mIHZhbHVlID09ICdudW1iZXInICYmIHZhbHVlID4gLTEgJiYgdmFsdWUgJSAxID09IDAgJiYgdmFsdWUgPD0gTUFYX1NBRkVfSU5URUdFUjtcbn1cblxuLyoqXG4gKiBDaGVja3MgaWYgYHZhbHVlYCBpcyBjbGFzc2lmaWVkIGFzIGFuIGBBcnJheWAgb2JqZWN0LlxuICpcbiAqIEBzdGF0aWNcbiAqIEBtZW1iZXJPZiBfXG4gKiBAY2F0ZWdvcnkgTGFuZ1xuICogQHBhcmFtIHsqfSB2YWx1ZSBUaGUgdmFsdWUgdG8gY2hlY2suXG4gKiBAcmV0dXJucyB7Ym9vbGVhbn0gUmV0dXJucyBgdHJ1ZWAgaWYgYHZhbHVlYCBpcyBjb3JyZWN0bHkgY2xhc3NpZmllZCwgZWxzZSBgZmFsc2VgLlxuICogQGV4YW1wbGVcbiAqXG4gKiBfLmlzQXJyYXkoWzEsIDIsIDNdKTtcbiAqIC8vID0+IHRydWVcbiAqXG4gKiBfLmlzQXJyYXkoZnVuY3Rpb24oKSB7IHJldHVybiBhcmd1bWVudHM7IH0oKSk7XG4gKiAvLyA9PiBmYWxzZVxuICovXG52YXIgaXNBcnJheSA9IG5hdGl2ZUlzQXJyYXkgfHwgZnVuY3Rpb24odmFsdWUpIHtcbiAgcmV0dXJuIGlzT2JqZWN0TGlrZSh2YWx1ZSkgJiYgaXNMZW5ndGgodmFsdWUubGVuZ3RoKSAmJiBvYmpUb1N0cmluZy5jYWxsKHZhbHVlKSA9PSBhcnJheVRhZztcbn07XG5cbi8qKlxuICogQ2hlY2tzIGlmIGB2YWx1ZWAgaXMgY2xhc3NpZmllZCBhcyBhIGBGdW5jdGlvbmAgb2JqZWN0LlxuICpcbiAqIEBzdGF0aWNcbiAqIEBtZW1iZXJPZiBfXG4gKiBAY2F0ZWdvcnkgTGFuZ1xuICogQHBhcmFtIHsqfSB2YWx1ZSBUaGUgdmFsdWUgdG8gY2hlY2suXG4gKiBAcmV0dXJucyB7Ym9vbGVhbn0gUmV0dXJucyBgdHJ1ZWAgaWYgYHZhbHVlYCBpcyBjb3JyZWN0bHkgY2xhc3NpZmllZCwgZWxzZSBgZmFsc2VgLlxuICogQGV4YW1wbGVcbiAqXG4gKiBfLmlzRnVuY3Rpb24oXyk7XG4gKiAvLyA9PiB0cnVlXG4gKlxuICogXy5pc0Z1bmN0aW9uKC9hYmMvKTtcbiAqIC8vID0+IGZhbHNlXG4gKi9cbmZ1bmN0aW9uIGlzRnVuY3Rpb24odmFsdWUpIHtcbiAgLy8gVGhlIHVzZSBvZiBgT2JqZWN0I3RvU3RyaW5nYCBhdm9pZHMgaXNzdWVzIHdpdGggdGhlIGB0eXBlb2ZgIG9wZXJhdG9yXG4gIC8vIGluIG9sZGVyIHZlcnNpb25zIG9mIENocm9tZSBhbmQgU2FmYXJpIHdoaWNoIHJldHVybiAnZnVuY3Rpb24nIGZvciByZWdleGVzXG4gIC8vIGFuZCBTYWZhcmkgOCBlcXVpdmFsZW50cyB3aGljaCByZXR1cm4gJ29iamVjdCcgZm9yIHR5cGVkIGFycmF5IGNvbnN0cnVjdG9ycy5cbiAgcmV0dXJuIGlzT2JqZWN0KHZhbHVlKSAmJiBvYmpUb1N0cmluZy5jYWxsKHZhbHVlKSA9PSBmdW5jVGFnO1xufVxuXG4vKipcbiAqIENoZWNrcyBpZiBgdmFsdWVgIGlzIHRoZSBbbGFuZ3VhZ2UgdHlwZV0oaHR0cHM6Ly9lczUuZ2l0aHViLmlvLyN4OCkgb2YgYE9iamVjdGAuXG4gKiAoZS5nLiBhcnJheXMsIGZ1bmN0aW9ucywgb2JqZWN0cywgcmVnZXhlcywgYG5ldyBOdW1iZXIoMClgLCBhbmQgYG5ldyBTdHJpbmcoJycpYClcbiAqXG4gKiBAc3RhdGljXG4gKiBAbWVtYmVyT2YgX1xuICogQGNhdGVnb3J5IExhbmdcbiAqIEBwYXJhbSB7Kn0gdmFsdWUgVGhlIHZhbHVlIHRvIGNoZWNrLlxuICogQHJldHVybnMge2Jvb2xlYW59IFJldHVybnMgYHRydWVgIGlmIGB2YWx1ZWAgaXMgYW4gb2JqZWN0LCBlbHNlIGBmYWxzZWAuXG4gKiBAZXhhbXBsZVxuICpcbiAqIF8uaXNPYmplY3Qoe30pO1xuICogLy8gPT4gdHJ1ZVxuICpcbiAqIF8uaXNPYmplY3QoWzEsIDIsIDNdKTtcbiAqIC8vID0+IHRydWVcbiAqXG4gKiBfLmlzT2JqZWN0KDEpO1xuICogLy8gPT4gZmFsc2VcbiAqL1xuZnVuY3Rpb24gaXNPYmplY3QodmFsdWUpIHtcbiAgLy8gQXZvaWQgYSBWOCBKSVQgYnVnIGluIENocm9tZSAxOS0yMC5cbiAgLy8gU2VlIGh0dHBzOi8vY29kZS5nb29nbGUuY29tL3AvdjgvaXNzdWVzL2RldGFpbD9pZD0yMjkxIGZvciBtb3JlIGRldGFpbHMuXG4gIHZhciB0eXBlID0gdHlwZW9mIHZhbHVlO1xuICByZXR1cm4gISF2YWx1ZSAmJiAodHlwZSA9PSAnb2JqZWN0JyB8fCB0eXBlID09ICdmdW5jdGlvbicpO1xufVxuXG4vKipcbiAqIENoZWNrcyBpZiBgdmFsdWVgIGlzIGEgbmF0aXZlIGZ1bmN0aW9uLlxuICpcbiAqIEBzdGF0aWNcbiAqIEBtZW1iZXJPZiBfXG4gKiBAY2F0ZWdvcnkgTGFuZ1xuICogQHBhcmFtIHsqfSB2YWx1ZSBUaGUgdmFsdWUgdG8gY2hlY2suXG4gKiBAcmV0dXJucyB7Ym9vbGVhbn0gUmV0dXJucyBgdHJ1ZWAgaWYgYHZhbHVlYCBpcyBhIG5hdGl2ZSBmdW5jdGlvbiwgZWxzZSBgZmFsc2VgLlxuICogQGV4YW1wbGVcbiAqXG4gKiBfLmlzTmF0aXZlKEFycmF5LnByb3RvdHlwZS5wdXNoKTtcbiAqIC8vID0+IHRydWVcbiAqXG4gKiBfLmlzTmF0aXZlKF8pO1xuICogLy8gPT4gZmFsc2VcbiAqL1xuZnVuY3Rpb24gaXNOYXRpdmUodmFsdWUpIHtcbiAgaWYgKHZhbHVlID09IG51bGwpIHtcbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cbiAgaWYgKGlzRnVuY3Rpb24odmFsdWUpKSB7XG4gICAgcmV0dXJuIHJlSXNOYXRpdmUudGVzdChmblRvU3RyaW5nLmNhbGwodmFsdWUpKTtcbiAgfVxuICByZXR1cm4gaXNPYmplY3RMaWtlKHZhbHVlKSAmJiByZUlzSG9zdEN0b3IudGVzdCh2YWx1ZSk7XG59XG5cbm1vZHVsZS5leHBvcnRzID0gaXNBcnJheTtcbiIsIlxudmFyIHJuZztcblxuaWYgKGdsb2JhbC5jcnlwdG8gJiYgY3J5cHRvLmdldFJhbmRvbVZhbHVlcykge1xuICAvLyBXSEFUV0cgY3J5cHRvLWJhc2VkIFJORyAtIGh0dHA6Ly93aWtpLndoYXR3Zy5vcmcvd2lraS9DcnlwdG9cbiAgLy8gTW9kZXJhdGVseSBmYXN0LCBoaWdoIHF1YWxpdHlcbiAgdmFyIF9ybmRzOCA9IG5ldyBVaW50OEFycmF5KDE2KTtcbiAgcm5nID0gZnVuY3Rpb24gd2hhdHdnUk5HKCkge1xuICAgIGNyeXB0by5nZXRSYW5kb21WYWx1ZXMoX3JuZHM4KTtcbiAgICByZXR1cm4gX3JuZHM4O1xuICB9O1xufVxuXG5pZiAoIXJuZykge1xuICAvLyBNYXRoLnJhbmRvbSgpLWJhc2VkIChSTkcpXG4gIC8vXG4gIC8vIElmIGFsbCBlbHNlIGZhaWxzLCB1c2UgTWF0aC5yYW5kb20oKS4gIEl0J3MgZmFzdCwgYnV0IGlzIG9mIHVuc3BlY2lmaWVkXG4gIC8vIHF1YWxpdHkuXG4gIHZhciAgX3JuZHMgPSBuZXcgQXJyYXkoMTYpO1xuICBybmcgPSBmdW5jdGlvbigpIHtcbiAgICBmb3IgKHZhciBpID0gMCwgcjsgaSA8IDE2OyBpKyspIHtcbiAgICAgIGlmICgoaSAmIDB4MDMpID09PSAwKSByID0gTWF0aC5yYW5kb20oKSAqIDB4MTAwMDAwMDAwO1xuICAgICAgX3JuZHNbaV0gPSByID4+PiAoKGkgJiAweDAzKSA8PCAzKSAmIDB4ZmY7XG4gICAgfVxuXG4gICAgcmV0dXJuIF9ybmRzO1xuICB9O1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IHJuZztcblxuIiwiLy8gICAgIHV1aWQuanNcbi8vXG4vLyAgICAgQ29weXJpZ2h0IChjKSAyMDEwLTIwMTIgUm9iZXJ0IEtpZWZmZXJcbi8vICAgICBNSVQgTGljZW5zZSAtIGh0dHA6Ly9vcGVuc291cmNlLm9yZy9saWNlbnNlcy9taXQtbGljZW5zZS5waHBcblxuLy8gVW5pcXVlIElEIGNyZWF0aW9uIHJlcXVpcmVzIGEgaGlnaCBxdWFsaXR5IHJhbmRvbSAjIGdlbmVyYXRvci4gIFdlIGZlYXR1cmVcbi8vIGRldGVjdCB0byBkZXRlcm1pbmUgdGhlIGJlc3QgUk5HIHNvdXJjZSwgbm9ybWFsaXppbmcgdG8gYSBmdW5jdGlvbiB0aGF0XG4vLyByZXR1cm5zIDEyOC1iaXRzIG9mIHJhbmRvbW5lc3MsIHNpbmNlIHRoYXQncyB3aGF0J3MgdXN1YWxseSByZXF1aXJlZFxudmFyIF9ybmcgPSByZXF1aXJlKCcuL3JuZycpO1xuXG4vLyBNYXBzIGZvciBudW1iZXIgPC0+IGhleCBzdHJpbmcgY29udmVyc2lvblxudmFyIF9ieXRlVG9IZXggPSBbXTtcbnZhciBfaGV4VG9CeXRlID0ge307XG5mb3IgKHZhciBpID0gMDsgaSA8IDI1NjsgaSsrKSB7XG4gIF9ieXRlVG9IZXhbaV0gPSAoaSArIDB4MTAwKS50b1N0cmluZygxNikuc3Vic3RyKDEpO1xuICBfaGV4VG9CeXRlW19ieXRlVG9IZXhbaV1dID0gaTtcbn1cblxuLy8gKipgcGFyc2UoKWAgLSBQYXJzZSBhIFVVSUQgaW50byBpdCdzIGNvbXBvbmVudCBieXRlcyoqXG5mdW5jdGlvbiBwYXJzZShzLCBidWYsIG9mZnNldCkge1xuICB2YXIgaSA9IChidWYgJiYgb2Zmc2V0KSB8fCAwLCBpaSA9IDA7XG5cbiAgYnVmID0gYnVmIHx8IFtdO1xuICBzLnRvTG93ZXJDYXNlKCkucmVwbGFjZSgvWzAtOWEtZl17Mn0vZywgZnVuY3Rpb24ob2N0KSB7XG4gICAgaWYgKGlpIDwgMTYpIHsgLy8gRG9uJ3Qgb3ZlcmZsb3chXG4gICAgICBidWZbaSArIGlpKytdID0gX2hleFRvQnl0ZVtvY3RdO1xuICAgIH1cbiAgfSk7XG5cbiAgLy8gWmVybyBvdXQgcmVtYWluaW5nIGJ5dGVzIGlmIHN0cmluZyB3YXMgc2hvcnRcbiAgd2hpbGUgKGlpIDwgMTYpIHtcbiAgICBidWZbaSArIGlpKytdID0gMDtcbiAgfVxuXG4gIHJldHVybiBidWY7XG59XG5cbi8vICoqYHVucGFyc2UoKWAgLSBDb252ZXJ0IFVVSUQgYnl0ZSBhcnJheSAoYWxhIHBhcnNlKCkpIGludG8gYSBzdHJpbmcqKlxuZnVuY3Rpb24gdW5wYXJzZShidWYsIG9mZnNldCkge1xuICB2YXIgaSA9IG9mZnNldCB8fCAwLCBidGggPSBfYnl0ZVRvSGV4O1xuICByZXR1cm4gIGJ0aFtidWZbaSsrXV0gKyBidGhbYnVmW2krK11dICtcbiAgICAgICAgICBidGhbYnVmW2krK11dICsgYnRoW2J1ZltpKytdXSArICctJyArXG4gICAgICAgICAgYnRoW2J1ZltpKytdXSArIGJ0aFtidWZbaSsrXV0gKyAnLScgK1xuICAgICAgICAgIGJ0aFtidWZbaSsrXV0gKyBidGhbYnVmW2krK11dICsgJy0nICtcbiAgICAgICAgICBidGhbYnVmW2krK11dICsgYnRoW2J1ZltpKytdXSArICctJyArXG4gICAgICAgICAgYnRoW2J1ZltpKytdXSArIGJ0aFtidWZbaSsrXV0gK1xuICAgICAgICAgIGJ0aFtidWZbaSsrXV0gKyBidGhbYnVmW2krK11dICtcbiAgICAgICAgICBidGhbYnVmW2krK11dICsgYnRoW2J1ZltpKytdXTtcbn1cblxuLy8gKipgdjEoKWAgLSBHZW5lcmF0ZSB0aW1lLWJhc2VkIFVVSUQqKlxuLy9cbi8vIEluc3BpcmVkIGJ5IGh0dHBzOi8vZ2l0aHViLmNvbS9MaW9zSy9VVUlELmpzXG4vLyBhbmQgaHR0cDovL2RvY3MucHl0aG9uLm9yZy9saWJyYXJ5L3V1aWQuaHRtbFxuXG4vLyByYW5kb20gIydzIHdlIG5lZWQgdG8gaW5pdCBub2RlIGFuZCBjbG9ja3NlcVxudmFyIF9zZWVkQnl0ZXMgPSBfcm5nKCk7XG5cbi8vIFBlciA0LjUsIGNyZWF0ZSBhbmQgNDgtYml0IG5vZGUgaWQsICg0NyByYW5kb20gYml0cyArIG11bHRpY2FzdCBiaXQgPSAxKVxudmFyIF9ub2RlSWQgPSBbXG4gIF9zZWVkQnl0ZXNbMF0gfCAweDAxLFxuICBfc2VlZEJ5dGVzWzFdLCBfc2VlZEJ5dGVzWzJdLCBfc2VlZEJ5dGVzWzNdLCBfc2VlZEJ5dGVzWzRdLCBfc2VlZEJ5dGVzWzVdXG5dO1xuXG4vLyBQZXIgNC4yLjIsIHJhbmRvbWl6ZSAoMTQgYml0KSBjbG9ja3NlcVxudmFyIF9jbG9ja3NlcSA9IChfc2VlZEJ5dGVzWzZdIDw8IDggfCBfc2VlZEJ5dGVzWzddKSAmIDB4M2ZmZjtcblxuLy8gUHJldmlvdXMgdXVpZCBjcmVhdGlvbiB0aW1lXG52YXIgX2xhc3RNU2VjcyA9IDAsIF9sYXN0TlNlY3MgPSAwO1xuXG4vLyBTZWUgaHR0cHM6Ly9naXRodWIuY29tL2Jyb29mYS9ub2RlLXV1aWQgZm9yIEFQSSBkZXRhaWxzXG5mdW5jdGlvbiB2MShvcHRpb25zLCBidWYsIG9mZnNldCkge1xuICB2YXIgaSA9IGJ1ZiAmJiBvZmZzZXQgfHwgMDtcbiAgdmFyIGIgPSBidWYgfHwgW107XG5cbiAgb3B0aW9ucyA9IG9wdGlvbnMgfHwge307XG5cbiAgdmFyIGNsb2Nrc2VxID0gb3B0aW9ucy5jbG9ja3NlcSAhPT0gdW5kZWZpbmVkID8gb3B0aW9ucy5jbG9ja3NlcSA6IF9jbG9ja3NlcTtcblxuICAvLyBVVUlEIHRpbWVzdGFtcHMgYXJlIDEwMCBuYW5vLXNlY29uZCB1bml0cyBzaW5jZSB0aGUgR3JlZ29yaWFuIGVwb2NoLFxuICAvLyAoMTU4Mi0xMC0xNSAwMDowMCkuICBKU051bWJlcnMgYXJlbid0IHByZWNpc2UgZW5vdWdoIGZvciB0aGlzLCBzb1xuICAvLyB0aW1lIGlzIGhhbmRsZWQgaW50ZXJuYWxseSBhcyAnbXNlY3MnIChpbnRlZ2VyIG1pbGxpc2Vjb25kcykgYW5kICduc2VjcydcbiAgLy8gKDEwMC1uYW5vc2Vjb25kcyBvZmZzZXQgZnJvbSBtc2Vjcykgc2luY2UgdW5peCBlcG9jaCwgMTk3MC0wMS0wMSAwMDowMC5cbiAgdmFyIG1zZWNzID0gb3B0aW9ucy5tc2VjcyAhPT0gdW5kZWZpbmVkID8gb3B0aW9ucy5tc2VjcyA6IG5ldyBEYXRlKCkuZ2V0VGltZSgpO1xuXG4gIC8vIFBlciA0LjIuMS4yLCB1c2UgY291bnQgb2YgdXVpZCdzIGdlbmVyYXRlZCBkdXJpbmcgdGhlIGN1cnJlbnQgY2xvY2tcbiAgLy8gY3ljbGUgdG8gc2ltdWxhdGUgaGlnaGVyIHJlc29sdXRpb24gY2xvY2tcbiAgdmFyIG5zZWNzID0gb3B0aW9ucy5uc2VjcyAhPT0gdW5kZWZpbmVkID8gb3B0aW9ucy5uc2VjcyA6IF9sYXN0TlNlY3MgKyAxO1xuXG4gIC8vIFRpbWUgc2luY2UgbGFzdCB1dWlkIGNyZWF0aW9uIChpbiBtc2VjcylcbiAgdmFyIGR0ID0gKG1zZWNzIC0gX2xhc3RNU2VjcykgKyAobnNlY3MgLSBfbGFzdE5TZWNzKS8xMDAwMDtcblxuICAvLyBQZXIgNC4yLjEuMiwgQnVtcCBjbG9ja3NlcSBvbiBjbG9jayByZWdyZXNzaW9uXG4gIGlmIChkdCA8IDAgJiYgb3B0aW9ucy5jbG9ja3NlcSA9PT0gdW5kZWZpbmVkKSB7XG4gICAgY2xvY2tzZXEgPSBjbG9ja3NlcSArIDEgJiAweDNmZmY7XG4gIH1cblxuICAvLyBSZXNldCBuc2VjcyBpZiBjbG9jayByZWdyZXNzZXMgKG5ldyBjbG9ja3NlcSkgb3Igd2UndmUgbW92ZWQgb250byBhIG5ld1xuICAvLyB0aW1lIGludGVydmFsXG4gIGlmICgoZHQgPCAwIHx8IG1zZWNzID4gX2xhc3RNU2VjcykgJiYgb3B0aW9ucy5uc2VjcyA9PT0gdW5kZWZpbmVkKSB7XG4gICAgbnNlY3MgPSAwO1xuICB9XG5cbiAgLy8gUGVyIDQuMi4xLjIgVGhyb3cgZXJyb3IgaWYgdG9vIG1hbnkgdXVpZHMgYXJlIHJlcXVlc3RlZFxuICBpZiAobnNlY3MgPj0gMTAwMDApIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ3V1aWQudjEoKTogQ2FuXFwndCBjcmVhdGUgbW9yZSB0aGFuIDEwTSB1dWlkcy9zZWMnKTtcbiAgfVxuXG4gIF9sYXN0TVNlY3MgPSBtc2VjcztcbiAgX2xhc3ROU2VjcyA9IG5zZWNzO1xuICBfY2xvY2tzZXEgPSBjbG9ja3NlcTtcblxuICAvLyBQZXIgNC4xLjQgLSBDb252ZXJ0IGZyb20gdW5peCBlcG9jaCB0byBHcmVnb3JpYW4gZXBvY2hcbiAgbXNlY3MgKz0gMTIyMTkyOTI4MDAwMDA7XG5cbiAgLy8gYHRpbWVfbG93YFxuICB2YXIgdGwgPSAoKG1zZWNzICYgMHhmZmZmZmZmKSAqIDEwMDAwICsgbnNlY3MpICUgMHgxMDAwMDAwMDA7XG4gIGJbaSsrXSA9IHRsID4+PiAyNCAmIDB4ZmY7XG4gIGJbaSsrXSA9IHRsID4+PiAxNiAmIDB4ZmY7XG4gIGJbaSsrXSA9IHRsID4+PiA4ICYgMHhmZjtcbiAgYltpKytdID0gdGwgJiAweGZmO1xuXG4gIC8vIGB0aW1lX21pZGBcbiAgdmFyIHRtaCA9IChtc2VjcyAvIDB4MTAwMDAwMDAwICogMTAwMDApICYgMHhmZmZmZmZmO1xuICBiW2krK10gPSB0bWggPj4+IDggJiAweGZmO1xuICBiW2krK10gPSB0bWggJiAweGZmO1xuXG4gIC8vIGB0aW1lX2hpZ2hfYW5kX3ZlcnNpb25gXG4gIGJbaSsrXSA9IHRtaCA+Pj4gMjQgJiAweGYgfCAweDEwOyAvLyBpbmNsdWRlIHZlcnNpb25cbiAgYltpKytdID0gdG1oID4+PiAxNiAmIDB4ZmY7XG5cbiAgLy8gYGNsb2NrX3NlcV9oaV9hbmRfcmVzZXJ2ZWRgIChQZXIgNC4yLjIgLSBpbmNsdWRlIHZhcmlhbnQpXG4gIGJbaSsrXSA9IGNsb2Nrc2VxID4+PiA4IHwgMHg4MDtcblxuICAvLyBgY2xvY2tfc2VxX2xvd2BcbiAgYltpKytdID0gY2xvY2tzZXEgJiAweGZmO1xuXG4gIC8vIGBub2RlYFxuICB2YXIgbm9kZSA9IG9wdGlvbnMubm9kZSB8fCBfbm9kZUlkO1xuICBmb3IgKHZhciBuID0gMDsgbiA8IDY7IG4rKykge1xuICAgIGJbaSArIG5dID0gbm9kZVtuXTtcbiAgfVxuXG4gIHJldHVybiBidWYgPyBidWYgOiB1bnBhcnNlKGIpO1xufVxuXG4vLyAqKmB2NCgpYCAtIEdlbmVyYXRlIHJhbmRvbSBVVUlEKipcblxuLy8gU2VlIGh0dHBzOi8vZ2l0aHViLmNvbS9icm9vZmEvbm9kZS11dWlkIGZvciBBUEkgZGV0YWlsc1xuZnVuY3Rpb24gdjQob3B0aW9ucywgYnVmLCBvZmZzZXQpIHtcbiAgLy8gRGVwcmVjYXRlZCAtICdmb3JtYXQnIGFyZ3VtZW50LCBhcyBzdXBwb3J0ZWQgaW4gdjEuMlxuICB2YXIgaSA9IGJ1ZiAmJiBvZmZzZXQgfHwgMDtcblxuICBpZiAodHlwZW9mKG9wdGlvbnMpID09ICdzdHJpbmcnKSB7XG4gICAgYnVmID0gb3B0aW9ucyA9PSAnYmluYXJ5JyA/IG5ldyBBcnJheSgxNikgOiBudWxsO1xuICAgIG9wdGlvbnMgPSBudWxsO1xuICB9XG4gIG9wdGlvbnMgPSBvcHRpb25zIHx8IHt9O1xuXG4gIHZhciBybmRzID0gb3B0aW9ucy5yYW5kb20gfHwgKG9wdGlvbnMucm5nIHx8IF9ybmcpKCk7XG5cbiAgLy8gUGVyIDQuNCwgc2V0IGJpdHMgZm9yIHZlcnNpb24gYW5kIGBjbG9ja19zZXFfaGlfYW5kX3Jlc2VydmVkYFxuICBybmRzWzZdID0gKHJuZHNbNl0gJiAweDBmKSB8IDB4NDA7XG4gIHJuZHNbOF0gPSAocm5kc1s4XSAmIDB4M2YpIHwgMHg4MDtcblxuICAvLyBDb3B5IGJ5dGVzIHRvIGJ1ZmZlciwgaWYgcHJvdmlkZWRcbiAgaWYgKGJ1Zikge1xuICAgIGZvciAodmFyIGlpID0gMDsgaWkgPCAxNjsgaWkrKykge1xuICAgICAgYnVmW2kgKyBpaV0gPSBybmRzW2lpXTtcbiAgICB9XG4gIH1cblxuICByZXR1cm4gYnVmIHx8IHVucGFyc2Uocm5kcyk7XG59XG5cbi8vIEV4cG9ydCBwdWJsaWMgQVBJXG52YXIgdXVpZCA9IHY0O1xudXVpZC52MSA9IHYxO1xudXVpZC52NCA9IHY0O1xudXVpZC5wYXJzZSA9IHBhcnNlO1xudXVpZC51bnBhcnNlID0gdW5wYXJzZTtcblxubW9kdWxlLmV4cG9ydHMgPSB1dWlkO1xuIiwidmFyIGggPSByZXF1aXJlKFwiLi92aXJ0dWFsLWh5cGVyc2NyaXB0L2luZGV4LmpzXCIpXG5cbm1vZHVsZS5leHBvcnRzID0gaFxuIiwiJ3VzZSBzdHJpY3QnO1xuXG4vKmdsb2JhbCB3aW5kb3csIGdsb2JhbCovXG5cbnZhciByb290ID0gdHlwZW9mIHdpbmRvdyAhPT0gJ3VuZGVmaW5lZCcgP1xuICAgIHdpbmRvdyA6IHR5cGVvZiBnbG9iYWwgIT09ICd1bmRlZmluZWQnID9cbiAgICBnbG9iYWwgOiB7fTtcblxubW9kdWxlLmV4cG9ydHMgPSBJbmRpdmlkdWFsO1xuXG5mdW5jdGlvbiBJbmRpdmlkdWFsKGtleSwgdmFsdWUpIHtcbiAgICBpZiAoa2V5IGluIHJvb3QpIHtcbiAgICAgICAgcmV0dXJuIHJvb3Rba2V5XTtcbiAgICB9XG5cbiAgICByb290W2tleV0gPSB2YWx1ZTtcblxuICAgIHJldHVybiB2YWx1ZTtcbn1cbiIsInZhciB0b3BMZXZlbCA9IHR5cGVvZiBnbG9iYWwgIT09ICd1bmRlZmluZWQnID8gZ2xvYmFsIDpcbiAgICB0eXBlb2Ygd2luZG93ICE9PSAndW5kZWZpbmVkJyA/IHdpbmRvdyA6IHt9XG52YXIgbWluRG9jID0gcmVxdWlyZSgnbWluLWRvY3VtZW50Jyk7XG5cbmlmICh0eXBlb2YgZG9jdW1lbnQgIT09ICd1bmRlZmluZWQnKSB7XG4gICAgbW9kdWxlLmV4cG9ydHMgPSBkb2N1bWVudDtcbn0gZWxzZSB7XG4gICAgdmFyIGRvY2N5ID0gdG9wTGV2ZWxbJ19fR0xPQkFMX0RPQ1VNRU5UX0NBQ0hFQDQnXTtcblxuICAgIGlmICghZG9jY3kpIHtcbiAgICAgICAgZG9jY3kgPSB0b3BMZXZlbFsnX19HTE9CQUxfRE9DVU1FTlRfQ0FDSEVANCddID0gbWluRG9jO1xuICAgIH1cblxuICAgIG1vZHVsZS5leHBvcnRzID0gZG9jY3k7XG59XG4iLCJtb2R1bGUuZXhwb3J0cz17XG4gIFwib3NjaWxsYXRvclwiOiB7XG4gICAgXCJub2RlLXBhcmFtc1wiOiB7XCJ0eXBlXCI6IFwic3F1YXJlXCIsIFwiZnJlcXVlbmN5XCI6IDQ0MH0sXG4gICAgXCJwYXJhbXNcIjogW1xuICAgICAge1wibmFtZVwiOiBcInR5cGVcIiwgXCJ0eXBlXCI6IFwic3RyaW5nXCJ9LFxuICAgICAge1wibmFtZVwiOiBcImZyZXF1ZW5jeVwiLCBcInR5cGVcIjogXCJudW1iZXJcIn1cbiAgICBdLFxuICAgIFwib3V0XCI6IHRydWVcbiAgfSxcbiAgXCJnYWluXCI6IHtcbiAgICBcIm5vZGUtcGFyYW1zXCI6IHtcbiAgICAgIFwiZ2FpblwiOiAwLjJcbiAgICB9LFxuICAgIFwicGFyYW1zXCI6IFtcbiAgICAgIHtcIm5hbWVcIjogXCJnYWluXCIsIFwidHlwZVwiOiBcIm51bWJlclwifVxuICAgIF0sXG4gICAgXCJpblwiOiB0cnVlLFxuICAgIFwib3V0XCI6IHRydWVcbiAgfSxcbiAgXCJkZWxheVwiOiB7XG4gICAgXCJub2RlLXBhcmFtc1wiOiB7XG4gICAgICBcImRlbGF5VGltZVwiOiAwLjMzLFxuICAgICAgXCJtYXhEZWxheXRpbWVcIjogMVxuICAgIH0sXG4gICAgXCJwYXJhbXNcIjogW1xuICAgICAge1wibmFtZVwiOiBcImRlbGF5VGltZVwiLCBcInR5cGVcIjogXCJudW1iZXJcIn0sXG4gICAgICB7XCJuYW1lXCI6IFwibWF4RGVsYXlUaW1lXCIsIFwidHlwZVwiOiBcIm51bWJlclwifVxuICAgIF0sXG4gICAgXCJpblwiOiB0cnVlLFxuICAgIFwib3V0XCI6IHRydWVcbiAgfSxcbiAgXCJiaXF1YWRGaWx0ZXJcIjoge1xuICAgIFwibm9kZS1wYXJhbXNcIjoge1xuICAgICAgXCJ0eXBlXCI6IFwiYmxhaFwiLFxuICAgICAgXCJmcmVxdWVuY3lcIjogNDQwLFxuICAgICAgXCJkZXR1bmVcIjogMyxcbiAgICAgIFwiUVwiOiBcIndhdCBpcyB0aGlzP1wiXG4gICAgfSxcbiAgICBcInBhcmFtc1wiOiBbXG4gICAgICB7XCJuYW1lXCI6IFwidHlwZVwiLCBcInR5cGVcIjogXCJzdHJpbmdcIn0sXG4gICAgICB7XCJuYW1lXCI6IFwiZnJlcXVlbmN5XCIsIFwidHlwZVwiOiBcIm51bWJlclwifSxcbiAgICAgIHtcIm5hbWVcIjogXCJkZXR1bmVcIiwgXCJ0eXBlXCI6IFwibnVtYmVyXCJ9LFxuICAgICAge1wibmFtZVwiOiBcIlFcIiwgXCJ0eXBlXCI6IFwic3RyaW5nXCJ9XG4gICAgXSxcbiAgICBcImluXCI6IHRydWUsXG4gICAgXCJvdXRcIjogdHJ1ZVxuICB9LFxuICBcInN0ZXJlb1Bhbm5lclwiOiB7XG4gICAgXCJub2RlLXBhcmFtc1wiOiB7XG4gICAgICBcInBhblwiOiAzXG4gICAgfSxcbiAgICBcInBhcmFtc1wiOiBbXG4gICAgICB7XCJuYW1lXCI6IFwicGFuXCIsIFwidHlwZVwiOiBcIm51bWJlclwifVxuICAgIF0sXG4gICAgXCJpblwiOiB0cnVlLFxuICAgIFwib3V0XCI6IHRydWVcbiAgfSxcbiAgXCJtZWRpYVN0cmVhbVNvdXJjZVwiOiB7XG4gICAgXCJub2RlLXBhcmFtc1wiOiB7XG4gICAgICBcInNvdXJjZVwiOiBmYWxzZVxuICAgIH0sXG4gICAgXCJvdXRcIjogdHJ1ZVxuICB9XG59XG4iLCJ2YXIgaCA9IHJlcXVpcmUoJ3ZpcnR1YWwtZG9tL2gnKVxudmFyIGRpZmYgPSByZXF1aXJlKCd2aXJ0dWFsLWRvbS9kaWZmJylcbnZhciBwYXRjaCA9IHJlcXVpcmUoJ3ZpcnR1YWwtZG9tL3BhdGNoJylcbnZhciBjcmVhdGVFbGVtZW50ID0gcmVxdWlyZSgndmlydHVhbC1kb20vY3JlYXRlLWVsZW1lbnQnKVxudmFyIHV1aWQgPSByZXF1aXJlKCd1dWlkJylcbnZhciBpbmRleEFycmF5ID0gcmVxdWlyZSgnaW5kZXgtYXJyYXknKVxuXG5tb2R1bGUuZXhwb3J0cyA9IFdpbmRvd3NcblxuZnVuY3Rpb24gV2luZG93cygpIHtcbiAgdGhpcy5saXN0ID0gW11cblxuICB0aGlzLmRlZmF1bHRDb25maWcgPSB7fTtcblxuICB0aGlzLnRyZWUgPSB0aGlzLnJlbmRlcigpXG4gIHRoaXMucm9vdE5vZGUgPSBjcmVhdGVFbGVtZW50KHRoaXMudHJlZSlcbiAgZG9jdW1lbnQuYm9keS5hcHBlbmRDaGlsZCh0aGlzLnJvb3ROb2RlKVxuXG4gIHRoaXMuZHJhZ1dpbmRvdyA9IHt9XG5cbiAgc2V0SW50ZXJ2YWwodGhpcy5wYXRjaC5iaW5kKHRoaXMpLCAyMClcblxuICB3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcignbW91c2Vtb3ZlJywgZnVuY3Rpb24gKGUpIHtcbiAgICB0aGlzLmRyYWdXaW5kb3cueCA9IGUucGFnZVggLSB0aGlzLmRyYWdXaW5kb3cub2Zmc2V0WFxuICAgIHRoaXMuZHJhZ1dpbmRvdy55ID0gZS5wYWdlWSAtIHRoaXMuZHJhZ1dpbmRvdy5vZmZzZXRZXG4gIH0uYmluZCh0aGlzKSlcblxuICB3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcignbW91c2V1cCcsIGZ1bmN0aW9uIChlKSB7XG4gICAgdGhpcy5kcmFnV2luZG93ID0ge31cbiAgfS5iaW5kKHRoaXMpKVxuXG59XG5cbldpbmRvd3MucHJvdG90eXBlLmdldFdpbmRvdyA9IGZ1bmN0aW9uIChpZCkge1xuICByZXR1cm4gaW5kZXhBcnJheSh0aGlzLmxpc3QsICdpZCcpW2lkXSB8fCB7fVxufVxuXG5XaW5kb3dzLnByb3RvdHlwZS5wYXRjaCA9IGZ1bmN0aW9uICgpIHtcbiAgICB2YXIgbmV3VHJlZSA9IHRoaXMucmVuZGVyKClcbiAgICB2YXIgcGF0Y2hlcyA9IGRpZmYodGhpcy50cmVlLCBuZXdUcmVlKVxuICAgIHRoaXMucm9vdE5vZGUgPSBwYXRjaCh0aGlzLnJvb3ROb2RlLCBwYXRjaGVzKVxuICAgIHRoaXMudHJlZSA9IG5ld1RyZWVcbn1cblxuV2luZG93cy5wcm90b3R5cGUuYWRkID0gZnVuY3Rpb24gYWRkKHdpbiwgaWQpIHtcbiAgd2luLmlkID0gd2luLmlkIHx8IGlkIHx8IHV1aWQoKVxuICB0aGlzLmxpc3QucHVzaCh3aW4pXG4gIHJldHVybiB3aW4uaWRcbn1cblxuV2luZG93cy5wcm90b3R5cGUucmVtb3ZlID0gZnVuY3Rpb24gKGlkKSB7XG4gIHRoaXMubGlzdCA9IHRoaXMubGlzdC5maWx0ZXIoZnVuY3Rpb24gKHdpbikge1xuICAgIHJldHVybiB3aW4uaWQgIT09IGlkXG4gIH0pXG59XG5cbldpbmRvd3MucHJvdG90eXBlLmhpZGUgPSBmdW5jdGlvbiAoaWQpIHtcbiAgdmFyIHdpbiA9IHRoaXMuZ2V0V2luZG93KGlkKVxuICB3aW4uaGlkZGVuID0gdHJ1ZVxufVxuXG5XaW5kb3dzLnByb3RvdHlwZS5zaG93ID0gZnVuY3Rpb24gKGlkKSB7XG4gIHZhciB3aW4gPSB0aGlzLmdldFdpbmRvdyhpZClcbiAgd2luLmhpZGRlbiA9IGZhbHNlXG59XG5cbldpbmRvd3MucHJvdG90eXBlLnNldFBvc2l0aW9uID0gZnVuY3Rpb24gKGlkLCBwb3MpIHtcbiAgdmFyIHdpbiA9IHRoaXMuZ2V0V2luZG93KGlkKVxuICB3aW4ueCA9IHBvcy54XG4gIHdpbi55ID0gcG9zLnlcbn1cblxuV2luZG93cy5wcm90b3R5cGUub25kcmFnID0gZnVuY3Rpb24oaWQsIGV2KSB7XG4gIHRoaXMuZHJhZ1dpbmRvdyA9IHRoaXMuZ2V0V2luZG93KGlkKVxuICB0aGlzLmRyYWdXaW5kb3cub2Zmc2V0WCA9IGV2Lm9mZnNldFhcbiAgdGhpcy5kcmFnV2luZG93Lm9mZnNldFkgPSBldi5vZmZzZXRZXG59XG5cbldpbmRvd3MucHJvdG90eXBlLnJlbmRlciA9IGZ1bmN0aW9uIHJlbmRlcigpIHtcbiAgdmFyIGRlZmF1bHRCb2R5ID0gdGhpcy5kZWZhdWx0Qm9keVxuICB2YXIgZGl2V2luZG93cyA9IHRoaXMubGlzdFxuICAgIC5tYXAoZnVuY3Rpb24gKHdpbikge1xuICAgICAgdmFyIHN0eWxlID0ge1xuICAgICAgICB0b3A6IHdpbi55ICsgJ3B4JyxcbiAgICAgICAgbGVmdDogd2luLnggKyAncHgnLFxuICAgICAgICB2aXNpYmlsaXR5OiAod2luLmhpZGRlbiA/ICdoaWRkZW4nIDogJ3Zpc2libGUnKVxuICAgICAgfVxuICAgICAgdmFyIGlkID0gd2luLmlkXG4gICAgICB2YXIgb25kcmFnID0gdGhpcy5vbmRyYWcuYmluZCh0aGlzLCBpZClcbiAgICAgIHZhciBjbG9zZSA9IHRoaXMuaGlkZS5iaW5kKHRoaXMsIGlkKVxuXG4gICAgICB2YXIgZm9ybSA9IFtdXG4gICAgICA7KHdpbi5jb25maWcucGFyYW1zIHx8IFtdKS5mb3JFYWNoKGZ1bmN0aW9uIChwYXJhbSkge1xuICAgICAgICBmb3JtLnB1c2goaCgnZGl2Jywge2NsYXNzTmFtZTogJ2Zvcm0tbGFiZWwnfSwgcGFyYW0ubmFtZSkpXG4gICAgICAgIGZvcm0ucHVzaChoKCdpbnB1dCcsIHtkYXRhc2V0OiB7bmFtZTogcGFyYW0ubmFtZX19KSlcbiAgICAgIH0pXG5cbiAgICAgIHJldHVybiBoKCdkaXYud2luZG93Jywge3N0eWxlOiBzdHlsZSwgaWQ6ICd3aW5kb3ctJyArIHdpbi5pZH0sIFtcbiAgICAgICAgaCgnZGl2LmJhcicsIHtvbm1vdXNlZG93bjogb25kcmFnfSxbXG4gICAgICAgICAgaCgnZGl2Lm5hbWUnLCB3aW4ubmFtZSksXG4gICAgICAgICAgaCgnZGl2LmNsb3NlJywge29uY2xpY2s6IGNsb3NlfSwgJ8OXJylcbiAgICAgICAgXSksXG4gICAgICAgIGgoJ2Rpdi5ib2R5JywgZm9ybSlcbiAgICAgIF0pXG4gICAgfS5iaW5kKHRoaXMpKVxuICByZXR1cm4gaCgnZGl2LndpbmRvd3MnLCBkaXZXaW5kb3dzKVxufVxuIl19
