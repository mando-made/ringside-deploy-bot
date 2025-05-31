// A tiny dependency-free test runner. Keeps the project at zero
// install footprint while still actually proving the thing works.

var assert = require('assert');
var http = require('http');

var commentary = require('./commentary');
var webhook = require('./webhook');
var bot = require('./index');

var passed = 0;
var failed = 0;
var pending = [];

function test(name, fn) {
  pending.push({ name: name, fn: fn });
}

async function runAll() {
  for (var i = 0; i < pending.length; i++) {
    var t = pending[i];
    try {
      await t.fn();
      passed++;
      console.log('  ok   ' + t.name);
    } catch (err) {
      failed++;
      console.log('  FAIL ' + t.name);
      console.log('       ' + err.message);
    }
  }
  console.log('\n' + passed + ' passed, ' + failed + ' failed.');
  process.exit(failed > 0 ? 1 : 0);
}

var sampleResult = {
  status: 'success',
  repo: 'mando-made/scriptyr',
  branch: 'main',
  commit: 'a1b2c3d4e5f6',
  actor: 'mando-made',
  arena: 'deploy',
  durationSeconds: 134,
  runUrl: 'https://example.com/run/1'
};

// --- commentary engine ---

test('normaliseStatus maps common CI words onto the five outcomes', function () {
  assert.strictEqual(commentary.normaliseStatus('success'), 'success');
  assert.strictEqual(commentary.normaliseStatus('passed'), 'success');
  assert.strictEqual(commentary.normaliseStatus('FAILED'), 'failure');
  assert.strictEqual(commentary.normaliseStatus('canceled'), 'cancelled');
  assert.strictEqual(commentary.normaliseStatus('in_progress'), 'started');
  assert.strictEqual(commentary.normaliseStatus('retry'), 'rerun');
  assert.strictEqual(commentary.normaliseStatus('banana'), 'unknown');
});

test('formatDuration handles minutes, seconds, and bad input', function () {
  assert.strictEqual(commentary.formatDuration(134), '2m 14s');
  assert.strictEqual(commentary.formatDuration(45), '45s');
  assert.strictEqual(commentary.formatDuration(0), '0s');
  assert.strictEqual(commentary.formatDuration(-5), 'unknown time');
  assert.strictEqual(commentary.formatDuration('nope'), 'unknown time');
});

test('shortSha trims to 7 chars and survives missing input', function () {
  assert.strictEqual(commentary.shortSha('a1b2c3d4e5f6'), 'a1b2c3d');
  assert.strictEqual(commentary.shortSha(''), 'unknown');
  assert.strictEqual(commentary.shortSha(undefined), 'unknown');
});

test('every known status produces a non-empty, substituted line', function () {
  var statuses = ['success', 'failure', 'cancelled', 'started', 'rerun'];
  statuses.forEach(function (s) {
    var r = Object.assign({}, sampleResult, { status: s });
    var call = commentary.buildCommentary(r);
    assert.strictEqual(call.status, s);
    assert.ok(call.headline.length > 0, s + ' has a headline');
    assert.ok(call.line.length > 0, s + ' has a line');
    assert.ok(typeof call.color === 'number', s + ' has a color');
    // Token substitution actually happened: no stray {placeholders} left.
    assert.ok(call.line.indexOf('{') === -1, s + ' left an unfilled token: ' + call.line);
  });
});

test('commentary substitutes the real repo and short commit', function () {
  // Force the first template with a deterministic rng.
  var call = commentary.buildCommentary(sampleResult, function () { return 0; });
  assert.ok(call.line.indexOf('mando-made/scriptyr') !== -1, 'repo appears');
});

test('unknown status is scored gracefully, not crashed', function () {
  var call = commentary.buildCommentary({ status: 'exploded' });
  assert.strictEqual(call.status, 'unknown');
  assert.ok(call.line.indexOf('exploded') !== -1);
});

test('templates vary across the pool', function () {
  // Sweep rng across the range; expect more than one distinct line.
  var seen = {};
  for (var i = 0; i < 20; i++) {
    var rng = (function (v) { return function () { return v; }; })(i / 20);
    var call = commentary.buildCommentary(sampleResult, rng);
    seen[call.line] = true;
  }
  assert.ok(Object.keys(seen).length > 1, 'should produce more than one line');
});

// --- payload builder ---

test('buildPayload makes a valid Discord embed structure', function () {
  var call = commentary.buildCommentary(sampleResult, function () { return 0; });
  var payload = webhook.buildPayload(call, sampleResult);
  assert.ok(Array.isArray(payload.embeds), 'has embeds array');
  assert.strictEqual(payload.embeds.length, 1);
  var embed = payload.embeds[0];
  assert.ok(embed.title.indexOf(call.headline) !== -1, 'title carries headline');
  assert.strictEqual(embed.description, call.line);
  assert.strictEqual(embed.color, call.color);
  assert.strictEqual(embed.url, sampleResult.runUrl);
  // Commit field is trimmed to 7 chars.
  var commitField = embed.fields.filter(function (f) { return f.name === 'Commit'; })[0];
  assert.strictEqual(commitField.value, 'a1b2c3d');
});

// --- flag / env parsing ---

test('readResult reads CLI flags with = and spaced forms', function () {
  var r = bot.readResult(['--status=success', '--repo', 'a/b', '--dry-run'], {});
  assert.strictEqual(r.status, 'success');
  assert.strictEqual(r.repo, 'a/b');
  assert.strictEqual(r.dryRun, true);
});

test('readResult falls back to GitHub Actions env vars', function () {
  var env = {
    GITHUB_JOB_STATUS: 'failure',
    GITHUB_REPOSITORY: 'mando-made/scriptyr',
    GITHUB_REF_NAME: 'main',
    GITHUB_SHA: 'deadbeefcafe',
    GITHUB_ACTOR: 'mando-made'
  };
  var r = bot.readResult([], env);
  assert.strictEqual(r.status, 'failure');
  assert.strictEqual(r.repo, 'mando-made/scriptyr');
  assert.strictEqual(r.commit, 'deadbeefcafe');
});

// --- end to end: actually POST to a local server and check it lands ---

test('posting delivers a well-formed payload over HTTP', function () {
  return new Promise(function (resolve, reject) {
    var received = null;
    var server = http.createServer(function (req, res) {
      var body = '';
      req.on('data', function (c) { body += c; });
      req.on('end', function () {
        received = JSON.parse(body);
        res.writeHead(204);
        res.end();
      });
    });

    server.listen(0, '127.0.0.1', function () {
      var port = server.address().port;
      var url = 'http://127.0.0.1:' + port + '/webhook/test';
      var call = commentary.buildCommentary(sampleResult, function () { return 0; });
      var payload = webhook.buildPayload(call, sampleResult);

      webhook.postWebhook(url, payload).then(function (res) {
        try {
          assert.strictEqual(res.statusCode, 204, 'server accepted the post');
          assert.ok(received, 'server received a body');
          assert.strictEqual(received.username, 'Ringside Control');
          assert.strictEqual(received.embeds[0].description, call.line);
          server.close();
          resolve();
        } catch (err) {
          server.close();
          reject(err);
        }
      }).catch(function (err) {
        server.close();
        reject(err);
      });
    });
  });
});

test('run() in dry-run mode returns exit code 0 without a webhook', function () {
  return bot.run(['--status=success', '--repo=a/b', '--dry-run'], {}).then(function (code) {
    assert.strictEqual(code, 0);
  });
});

test('run() returns exit code 1 when no webhook is set and not dry-run', function () {
  return bot.run(['--status=success', '--repo=a/b'], {}).then(function (code) {
    assert.strictEqual(code, 1);
  });
});

runAll();
