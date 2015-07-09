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
