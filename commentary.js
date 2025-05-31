// The commentary engine. Takes a deploy/CI result and turns it into
// robot-combat fight commentary. This is the whole personality of the
// bot, so each outcome has a pool of lines it picks from, to keep it
// from sounding the same twice.

var LINES = {
  success: {
    headline: 'FLAWLESS VICTORY',
    color: 0x3ddc84,
    icon: 'WIN',
    templates: [
      '{repo} rolls out of the arena untouched. {actor} sent {branch} the full distance and it came back clean. {duration} on the clock.',
      'Not a dent on it. {actor}\'s build walked into the pipeline, wrecked every stage, and strutted out. {repo} @ {commit} is LIVE.',
      '{repo} takes the round. Every check down, every gate green, {duration} flat. Textbook from {actor}.',
      'Clean sweep in the {arena} arena. {branch} shipped without taking a hit. {actor} makes it look easy.'
    ]
  },
  failure: {
    headline: 'K.O.',
    color: 0xff4d4d,
    icon: 'KO',
    templates: [
      '{repo} just ate the floor. {actor}\'s run on {branch} got KO\'d at {duration}. The pipeline called it. Back to the pits.',
      'DOWN AND OUT. {commit} went in swinging and the {arena} stage put it on the canvas. {actor}, that one hurt.',
      'The build is DOWN. {repo} took a hard stop on {branch}, {duration} in. Someone check the servos.',
      'Pipeline lands the finishing blow on {repo}. {actor}\'s deploy never made it out of the gate. Rematch when you\'re ready.'
    ]
  },
  cancelled: {
    headline: 'MATCH CALLED // DQ',
    color: 0xf2b544,
    icon: 'DQ',
    templates: [
      'Ref waves it off. {repo} on {branch} got pulled mid-round by {actor}. No contest.',
      'DQ. The run on {commit} was called before the bell. {actor} stepped out of the ring, {duration} in.',
      '{repo} match cancelled. The {arena} stage goes quiet. No winner logged this round.'
    ]
  },
  started: {
    headline: 'FIGHTERS, TO YOUR CORNERS',
    color: 0x4fd6e0,
    icon: 'VS',
    templates: [
      'New challenger steps up. {repo} @ {commit} enters the {arena} arena. {actor} is in the pilot seat. Round starts NOW.',
      'Bell\'s about to ring. {branch} is loaded in and {actor} is locked in. Let\'s see if it has the chassis for it.',
      '{repo} rolls into the ring on {branch}. Pipeline\'s hot. Everyone watch the stages light up.'
    ]
  },
  rerun: {
    headline: 'REMATCH',
    color: 0xb48ce0,
    icon: 'RE',
    templates: [
      '{actor} calls a REMATCH. {repo} on {branch} is back in the ring for another round. No excuses this time.',
      'Round two. {commit} wants another shot at the {arena} stage. Pipeline resets. Here we go again.',
      '{repo} steps back onto the mat. {actor} ran it back. Let\'s see if the outcome changes.'
    ]
  }
};

function formatDuration(seconds) {
  if (typeof seconds !== 'number' || isNaN(seconds) || seconds < 0) {
    return 'unknown time';
  }
  var s = Math.floor(seconds);
  var m = Math.floor(s / 60);
  var rem = s % 60;
  if (m <= 0) {
    return rem + 's';
  }
  return m + 'm ' + rem + 's';
}

function shortSha(commit) {
  if (!commit) return 'unknown';
  return String(commit).substring(0, 7);
}

function fill(template, ctx) {
  return template
    .replace(/\{repo\}/g, ctx.repo || 'the challenger')
    .replace(/\{branch\}/g, ctx.branch || 'main')
    .replace(/\{commit\}/g, shortSha(ctx.commit))
    .replace(/\{actor\}/g, ctx.actor || 'the pilot')
    .replace(/\{arena\}/g, ctx.arena || 'main')
    .replace(/\{duration\}/g, formatDuration(ctx.durationSeconds));
}

// Normalises the many status strings a CI system might send into our
// five outcomes. GitHub Actions uses success/failure/cancelled; other
// systems use passed/failed/etc.
function normaliseStatus(status) {
  var s = String(status || '').toLowerCase().trim();
  if (s === 'success' || s === 'passed' || s === 'pass' || s === 'ok') return 'success';
  if (s === 'failure' || s === 'failed' || s === 'fail' || s === 'error') return 'failure';
  if (s === 'cancelled' || s === 'canceled' || s === 'skipped' || s === 'aborted') return 'cancelled';
  if (s === 'started' || s === 'queued' || s === 'in_progress' || s === 'running') return 'started';
  if (s === 'rerun' || s === 'retry' || s === 'rematch') return 'rerun';
  return 'unknown';
}

function pick(list, rng) {
  var r = typeof rng === 'function' ? rng() : Math.random();
  var index = Math.floor(r * list.length);
  if (index >= list.length) index = list.length - 1;
  return list[index];
}

// Builds a full commentary object from a result. Pass an optional rng
// (returning 0..1) to make line selection deterministic in tests.
function buildCommentary(result, rng) {
  var key = normaliseStatus(result && result.status);

  if (key === 'unknown') {
    return {
      status: 'unknown',
      headline: 'UNSCORED ROUND',
      color: 0x7c8a83,
      icon: '??',
      line: 'Pipeline sent a result the commentators don\'t recognise ("' +
        (result && result.status) + '"). No call to make on this one.'
    };
  }

  var spec = LINES[key];
  var ctx = result || {};
  var line = fill(pick(spec.templates, rng), ctx);

  return {
    status: key,
    headline: spec.headline,
    color: spec.color,
    icon: spec.icon,
    line: line
  };
}

module.exports = {
  buildCommentary: buildCommentary,
  normaliseStatus: normaliseStatus,
  formatDuration: formatDuration,
  shortSha: shortSha
};
