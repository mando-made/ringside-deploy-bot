var commentary = require('./commentary');
var webhook = require('./webhook');

// Reads a result from CLI flags first, falling back to environment
// variables (the shape GitHub Actions provides). This lets the same
// bot run as an Action step or be driven by hand for a demo.
function readResult(argv, env) {
  var flags = {};
  for (var i = 0; i < argv.length; i++) {
    var arg = argv[i];
    if (arg.indexOf('--') === 0) {
      var eq = arg.indexOf('=');
      if (eq !== -1) {
        flags[arg.substring(2, eq)] = arg.substring(eq + 1);
      } else {
        flags[arg.substring(2)] = argv[i + 1];
        i++;
      }
    }
  }

  return {
    status: flags.status || env.DEPLOY_STATUS || env.GITHUB_JOB_STATUS,
    repo: flags.repo || env.GITHUB_REPOSITORY,
    branch: flags.branch || env.GITHUB_REF_NAME,
    commit: flags.commit || env.GITHUB_SHA,
    actor: flags.actor || env.GITHUB_ACTOR,
    arena: flags.arena || env.GITHUB_WORKFLOW,
    durationSeconds: flags.duration ? parseInt(flags.duration, 10) : undefined,
    runUrl: flags.runUrl || env.RUN_URL,
    webhookUrl: flags.webhook || env.DISCORD_WEBHOOK_URL,
    dryRun: flags.hasOwnProperty('dry-run') || env.DRY_RUN === 'true'
  };
}

function run(argv, env) {
  var result = readResult(argv, env);
  var call = commentary.buildCommentary(result);
  var payload = webhook.buildPayload(call, result);

  // Always print the call, so there's a record in the CI log.
  console.log('[' + call.icon + '] ' + call.headline);
  console.log(call.line);

  if (result.dryRun) {
    console.log('\n(dry run, not posting. payload below)');
    console.log(JSON.stringify(payload, null, 2));
    return Promise.resolve(0);
  }

  if (!result.webhookUrl) {
    console.error('\nNo webhook URL set. Pass --webhook=<url> or set DISCORD_WEBHOOK_URL.');
    return Promise.resolve(1);
  }

  return webhook.postWebhook(result.webhookUrl, payload).then(function (res) {
    if (res.statusCode >= 200 && res.statusCode < 300) {
      console.log('\nPosted to the arena feed (' + res.statusCode + ').');
      return 0;
    }
    console.error('\nWebhook rejected the post (' + res.statusCode + ').');
    return 1;
  }).catch(function (err) {
    console.error('\nComms link down. ' + err.message);
    return 1;
  });
}

module.exports = { run: run, readResult: readResult };

// Run directly from the command line.
if (require.main === module) {
  run(process.argv.slice(2), process.env).then(function (code) {
    process.exit(code);
  });
}
