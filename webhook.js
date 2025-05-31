var http = require('http');
var https = require('https');
var urllib = require('url');

// Turns a commentary object into a Discord webhook embed payload.
function buildPayload(commentary, result) {
  var ctx = result || {};
  var fields = [];

  if (ctx.repo) fields.push({ name: 'Challenger', value: String(ctx.repo), inline: true });
  if (ctx.branch) fields.push({ name: 'Branch', value: String(ctx.branch), inline: true });
  if (ctx.commit) fields.push({ name: 'Commit', value: String(ctx.commit).substring(0, 7), inline: true });
  if (ctx.actor) fields.push({ name: 'Pilot', value: String(ctx.actor), inline: true });

  var embed = {
    title: '[' + commentary.icon + '] ' + commentary.headline,
    description: commentary.line,
    color: commentary.color,
    fields: fields
  };

  if (ctx.runUrl) {
    embed.url = String(ctx.runUrl);
  }

  return {
    username: 'Ringside Control',
    embeds: [embed]
  };
}

// Posts a payload to a webhook URL. Uses http or https based on the URL,
// so tests can point it at a local server. Returns a promise that
// resolves with { statusCode } or rejects on transport error.
function postWebhook(webhookUrl, payload) {
  return new Promise(function (resolve, reject) {
    var parsed = urllib.parse(webhookUrl);
    var transport = parsed.protocol === 'https:' ? https : http;
    var body = JSON.stringify(payload);

    var options = {
      hostname: parsed.hostname,
      port: parsed.port,
      path: parsed.path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      }
    };

    var req = transport.request(options, function (res) {
      var chunks = '';
      res.on('data', function (c) { chunks += c; });
      res.on('end', function () {
        resolve({ statusCode: res.statusCode, body: chunks });
      });
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

module.exports = {
  buildPayload: buildPayload,
  postWebhook: postWebhook
};
