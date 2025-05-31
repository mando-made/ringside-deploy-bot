# ringside-deploy-bot

Deploy notifications bore me. A green tick and a red cross tell me what
happened but nothing about it is fun to read, so I built a bot that calls
my pipeline runs like a robot-combat announcer instead. A clean deploy is a
flawless victory, a failed one gets KO'd, a cancelled run is a DQ, and a
re-run is a rematch. It posts the call to Discord as an embed.

## What a call looks like

```
[KO] K.O.
mando-made/scriptyr just ate the floor. mando-made's run on main got
KO'd at 47s. The pipeline called it. Back to the pits.
```

## How I built it

I split it so the personality lives in one place and the plumbing in
another. `commentary.js` is the voice: it takes a result, normalises
whatever status word the CI sent (`success`, `passed`, `failure`, `failed`
and so on) into one of five outcomes, fills in the repo, branch, commit,
pilot, and round time, and picks a line from a pool for that outcome. The
pool is the whole point, I did not want it reading the same way every time:

```js
success: {
  headline: 'FLAWLESS VICTORY',
  color: 0x3ddc84,
  templates: [
    '{repo} rolls out of the arena untouched. ...',
    'Not a dent on it. ...',
    '{repo} takes the round. ...'
  ]
}
```

`webhook.js` turns a call into a Discord embed and posts it, and `index.js`
is the glue: it reads flags or GitHub Actions environment variables, prints
the call to the log, and posts unless I ask for a dry run.

The one thing I was careful about was testing it properly, since a deploy
bot that silently breaks is worse than no bot. The test suite spins up a
real local HTTP server and posts to it, so I know the whole path works end
to end, not just the formatting.

## Try it without posting anything

```
npm run demo
```

Or drive it by hand with `--dry-run`, which prints the call and the exact
Discord payload instead of sending it:

```
node index.js --status=failure --repo=mando-made/scriptyr --branch=main --duration=47 --dry-run
```

## Posting for real

I pass a Discord webhook URL:

```
node index.js --status=success --repo=mando-made/scriptyr --webhook=https://discord.com/api/webhooks/...
```

or set `DISCORD_WEBHOOK_URL` in the environment.

## As a GitHub Action

`action.yml` wires it up as a composite action, so I can drop it into a
workflow and let it read the run context automatically:

```yaml
- uses: mando-made/ringside-deploy-bot@main
  if: always()
  with:
    status: ${{ job.status }}
    webhook: ${{ secrets.DISCORD_WEBHOOK_URL }}
    run-url: ${{ github.server_url }}/${{ github.repository }}/actions/runs/${{ github.run_id }}
```

The `if: always()` matters: it means the bot still calls the fight even
when the job it is reporting on lost.

## What's in here

- `commentary.js`: the voice, maps a result onto an outcome and picks a line
- `webhook.js`: builds the Discord embed and posts it
- `index.js`: reads flags or Actions env vars, prints the call, posts it
- `action.yml`: the composite GitHub Action wrapper
- `test.js`: a dependency-free test runner, including an end-to-end POST

## Tests

```
npm test
```

No dependencies, standard library only, so there is nothing to install
first.

## Credit

I looked at sarisia/actions-status-discord for how to shape a GitHub
Actions status into a Discord webhook embed, then wrote the commentary
engine and the robot-combat framing myself.
