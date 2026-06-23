/**
 * PURPCLAW Metrics Aggregator - Builder Bravo
 * Port 7890
 * Polls service-specific health endpoints every 2s
 * Exposes: GET /metrics, GET /health, GET /logs (SSE), GET /events (SSE)
 */

require('dotenv').config({ path: require('path').join(__dirname, '.env') });
require('./lib/runtime/telemetry-console').installConsoleTelemetry('purpclaw-metrics');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { getServices } = require('./service_registry');

// Parse --port argument (e.g. node metrics_aggregator.js --port 7890)
const PORT_ARG = process.argv.indexOf('--port');
const PORT = PORT_ARG !== -1 ? parseInt(process.argv[PORT_ARG + 1], 10) : 7890;
const BASE_POLL_INTERVAL_MS = 2000;
const MAX_BACKOFF_MS = 30000;

const SERVICE_TARGETS = getServices({ includeUi: false })
  .filter(function(service) { return service.healthPort && service.healthPath && service.key !== 'metrics'; })
  .map(function(service) {
    return {
      key: service.key,
      name: service.name,
      port: service.healthPort,
      servicePort: service.port,
      path: service.healthPath,
      group: service.group,
      required: service.required,
      note: service.note || null
    };
  });

const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY || '';

function authCheck(req, res) {
  const remoteAddr = req.socket.remoteAddress || '';
  const isLocal = remoteAddr === '127.0.0.1' || remoteAddr === '::1' || remoteAddr === '::ffff:127.0.0.1';
  if (isLocal) return true;
  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;
  if (INTERNAL_API_KEY && token === INTERNAL_API_KEY) return true;
  res.writeHead(401, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
  res.end(JSON.stringify({ error: 'Unauthorized - set INTERNAL_API_KEY or access from localhost' }));
  return false;
}

const serviceState = {};

for (var i = 0; i < SERVICE_TARGETS.length; i++) {
  var target = SERVICE_TARGETS[i];
  serviceState[target.key] = {
    status: 'unknown',
    response_time_ms: null,
    consecutive_failures: 0,
    last_check: null,
    history: [],
    next_check: 0  // timestamp when this service should be polled next
  };
}

var pendingPoll = null;

// Compute backoff interval for a given failure count
function backoffForFailures(failures) {
  if (failures <= 1) return BASE_POLL_INTERVAL_MS;
  var interval = BASE_POLL_INTERVAL_MS * Math.pow(2, failures - 1);
  return Math.min(interval, MAX_BACKOFF_MS);
}

// Publish diagnostic events to unified_eventbus
function publishDiagnosticEvent(serviceName, port, status, prevStatus, responseTime) {
  var topic = 'system.health';
  var payload = {
    service: serviceName,
    port: port,
    status: status,
    previous_status: prevStatus,
    response_time_ms: responseTime,
    source: 'metrics_aggregator'
  };
  var msg = JSON.stringify({ topic: topic, payload: payload, timestamp: new Date().toISOString() });
  try {
    var req = http.request({
      hostname: '127.0.0.1',
      port: 7782,
      path: '/publish',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(msg) }
    }, function() {});
    req.on('error', function(e) {
      console.error(`[metrics_aggregator] Failed to publish diagnostic: ${e.message}`);
    });
    req.write(msg);
    req.end();
  } catch (e) {
    console.error(`[metrics_aggregator] publishDiagnosticEvent error: ${e.message}`);
  }
}

function pollServices() {
  var now = Date.now();

  if (pendingPoll) return;

  // Check which services are due for polling
  var dueTargets = SERVICE_TARGETS.filter(function(target) {
    return now >= serviceState[target.key].next_check;
  });

  if (dueTargets.length === 0) return;
  pendingPoll = true;

  var count = dueTargets.length;
  dueTargets.forEach(function(target) {
    checkService(target, now, function() {
      count--;
      if (count === 0) pendingPoll = false;
    });
  });
}

function checkService(target, now, cb) {
  var start = Date.now();
  var req = http.get({
    hostname: '127.0.0.1',
    port: target.port,
    path: target.path,
    timeout: 2000
  }, function(res) {
    var elapsed = Date.now() - start;
    var prev = serviceState[target.key];
    var newHistory = prev.history.slice(-9);
    newHistory.push({ ts: now, ms: elapsed, ok: res.statusCode === 200 });
    var newStatus = res.statusCode === 200 ? 'up' : 'down';
    if (prev.status !== newStatus) {
      publishDiagnosticEvent(target.name, target.servicePort || target.port, newStatus, prev.status, elapsed);
    }
    serviceState[target.key] = {
      status: newStatus,
      response_time_ms: elapsed,
      consecutive_failures: newStatus === 'up' ? 0 : prev.consecutive_failures + 1,
      last_check: now,
      status_code: res.statusCode,
      history: newHistory,
      next_check: now + (newStatus === 'up' ? BASE_POLL_INTERVAL_MS : backoffForFailures(prev.consecutive_failures + 1))
    };
    res.resume();
    cb();
  });
  req.on('error', function(e) {
    var prev = serviceState[target.key];
    var newHistory = prev.history.slice(-9);
    var failures = prev.consecutive_failures + 1;
    var nextInterval = backoffForFailures(failures);
    newHistory.push({ ts: now, ms: null, ok: false });
    var newStatus = 'down';
    if (prev.status !== newStatus) {
      publishDiagnosticEvent(target.name, target.servicePort || target.port, newStatus, prev.status, null);
    }
    serviceState[target.key] = {
      status: newStatus,
      response_time_ms: null,
      consecutive_failures: failures,
      last_check: now,
      history: newHistory,
      next_check: now + nextInterval  // backoff on failure
    };
    cb();
  });
  req.on('timeout', function() {
    req.destroy();
    var prev = serviceState[target.key];
    var newHistory = prev.history.slice(-9);
    var failures = prev.consecutive_failures + 1;
    var nextInterval = backoffForFailures(failures);
    newHistory.push({ ts: now, ms: null, ok: false });
    var newStatus = 'down';
    if (prev.status !== newStatus) {
      publishDiagnosticEvent(target.name, target.servicePort || target.port, newStatus, prev.status, null);
    }
    serviceState[target.key] = {
      status: newStatus,
      response_time_ms: null,
      consecutive_failures: failures,
      last_check: now,
      history: newHistory,
      next_check: now + nextInterval  // backoff on failure
    };
    cb();
  });
}

function discoverLogFiles() {
  var logsDir = path.join(__dirname, 'logs');
  if (!fs.existsSync(logsDir)) return [];
  try {
    var files = fs.readdirSync(logsDir).filter(function(f) { return f.endsWith('.log'); });
    return files.map(function(f) {
      var fullPath = path.join(logsDir, f);
      var stat = fs.statSync(fullPath);
      return { name: f, path: fullPath, mtime: stat.mtime.getTime() };
    }).sort(function(a, b) { return b.mtime - a.mtime; });
  } catch (e) {
    return [];
  }
}

function LogTailer(filepath) {
  this.filepath = filepath;
  this.pos = 0;
  this.closed = false;
  try {
    var stat = fs.statSync(filepath);
    this.pos = stat.size;
  } catch (e) {}
}

LogTailer.prototype.readNew = function() {
  if (this.closed) return [];
  try {
    var buf = Buffer.alloc(65536);
    var fd = fs.openSync(this.filepath, 'r');
    var read = fs.readSync(fd, buf, 0, 65536, this.pos);
    fs.closeSync(fd);
    this.pos += read;
    if (read === 0) return [];
    var text = buf.slice(0, read).toString('utf8');
    return text.split('\n').filter(function(l) { return l.trim().length > 0; });
  } catch (e) {
    return [];
  }
};

var logTailers = {};

function getLogTailer(filepath) {
  if (!logTailers[filepath]) {
    logTailers[filepath] = new LogTailer(filepath);
  }
  return logTailers[filepath];
}

function formatSSE(event, data) {
  return 'event: ' + event + '\ndata: ' + JSON.stringify(data) + '\n\n';
}

function sendSSE(res, event, data) {
  res.write(formatSSE(event, data));
}

function serveMetrics(req, res) {
  var metrics = {};
  for (var i = 0; i < SERVICE_TARGETS.length; i++) {
    var target = SERVICE_TARGETS[i];
    var state = serviceState[target.key];
    metrics[target.key] = {
      name: target.name,
      port: target.servicePort || target.port,
      health_port: target.port,
      health_path: target.path,
      group: target.group,
      required: target.required,
      note: target.note,
      status: state.status,
      response_time_ms: state.response_time_ms,
      consecutive_failures: state.consecutive_failures,
      last_check: state.last_check ? new Date(state.last_check).toISOString() : null,
      history: state.history
    };
  }
  res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
  res.end(JSON.stringify(metrics, null, 2));
}

function serveHealth(req, res) {
  var total = SERVICE_TARGETS.length;
  var up = 0;
  var requiredDown = 0;
  for (var p in serviceState) {
    if (serviceState[p].status === 'up') up++;
  }
  for (var i = 0; i < SERVICE_TARGETS.length; i++) {
    var target = SERVICE_TARGETS[i];
    if (target.required && serviceState[target.key].status !== 'up') requiredDown++;
  }
  res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
  res.end(JSON.stringify({
    status: requiredDown === 0 ? (up === total ? 'healthy' : 'degraded') : 'unhealthy',
    aggregator: 'metrics_aggregator',
    port: PORT,
    uptime_ms: Math.round(process.uptime() * 1000),
    total_services: total,
    up_services: up,
    down_services: total - up,
    required_down: requiredDown
  }, null, 2));
}

function serveLogsSSE(req, res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*'
  });

  var files = discoverLogFiles();
  sendSSE(res, 'files', files.map(function(f) { return f.name; }));

  for (var i = 0; i < Math.min(files.length, 5); i++) {
    var f = files[i];
    try {
      var content = fs.readFileSync(f.path, 'utf8');
      var lines = content.split('\n').filter(function(l) { return l.trim(); });
      var last50 = lines.slice(-50);
      for (var j = 0; j < last50.length; j++) {
        sendSSE(res, 'log_line', { file: f.name, line: last50[j] });
      }
    } catch (e) {}
  }

  var interval = setInterval(function() {
    if (res.destroyed) {
      clearInterval(interval);
      return;
    }
    var files2 = discoverLogFiles();
    for (var k = 0; k < files2.length; k++) {
      var f2 = files2[k];
      var tailer = getLogTailer(f2.path);
      var newLines = tailer.readNew();
      for (var m = 0; m < newLines.length; m++) {
        sendSSE(res, 'log_line', { file: f2.name, line: newLines[m] });
      }
    }
  }, 1000);

  req.on('close', function() {
    clearInterval(interval);
  });
}

function serveEventsSSE(req, res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*'
  });

  sendSSE(res, 'connected', { timestamp: Date.now(), source: 'metrics_aggregator' });

  var interval = setInterval(function() {
    if (res.destroyed) {
      clearInterval(interval);
      return;
    }
    var up = 0;
    for (var p in serviceState) { if (serviceState[p].status === 'up') up++; }
    sendSSE(res, 'heartbeat', {
      timestamp: Date.now(),
      up_count: up,
      total: SERVICE_TARGETS.length
    });
  }, 3000);

  req.on('close', function() {
    clearInterval(interval);
  });
}

var server = http.createServer(function(req, res) {
  var url = req.url.split('?')[0];
  // Auth check for all endpoints
  if (!authCheck(req, res)) return;
  if (url === '/metrics' && req.method === 'GET') {
    serveMetrics(req, res);
  } else if (url === '/health' && req.method === 'GET') {
    serveHealth(req, res);
  } else if (url === '/logs' && req.method === 'GET') {
    serveLogsSSE(req, res);
  } else if (url === '/events' && req.method === 'GET') {
    serveEventsSSE(req, res);
  } else {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found', path: url }));
  }
});

server.listen(PORT, '0.0.0.0', function() {
  console.log('[metrics_aggregator] running on port ' + PORT);
  console.log('[metrics_aggregator] monitoring ' + SERVICE_TARGETS.length + ' services');
  console.log('[metrics_aggregator] endpoints: /metrics /health /logs (SSE) /events (SSE)');
});

pollServices();
setInterval(pollServices, BASE_POLL_INTERVAL_MS);

process.on('SIGTERM', function() {
  console.log('[metrics_aggregator] shutting down');
  publishDiagnosticEvent('metrics_aggregator', PORT, 'shutdown', 'unknown', 0);
  server.close(function() { process.exit(0); });
});
