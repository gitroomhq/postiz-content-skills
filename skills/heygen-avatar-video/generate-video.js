#!/usr/bin/env node
/**
 * generate-video.js - Generate a HeyGen talking-head video of YOUR avatar from a script.
 *
 * The avatar look and voice come only from config (HEYGEN_AVATAR_ID / HEYGEN_VOICE_ID in
 * ~/.content-skills/.env or the environment). They are not CLI flags, so a long or sloppy
 * agent context cannot silently swap the presenter. If HEYGEN_VOICE_ID is empty, the look's
 * own default voice is used.
 *
 * HeyGen v3 API:
 *   POST /v3/videos                         -> { data: { video_id } }
 *   GET  /v3/videos/{id}                    -> { data: { status, video_url, ... } }
 *   GET  /v3/avatars/looks?ownership=private  (your own avatar looks)
 *   GET  /v3/voices?type=private               (your own cloned voices)
 * Docs: https://developers.heygen.com/generate-avatar-video
 *
 * Requirements: Node 18+ (native fetch), HEYGEN_API_KEY.
 *
 *   node generate-video.js --list-looks
 *   node generate-video.js --list-voices
 *   node generate-video.js --script-file script.txt --out ./talk.mp4 --caption --json
 */

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

// ---------------------------------------------------------------------------
// Config: ~/.content-skills/.env (environment variables win)
// ---------------------------------------------------------------------------
function loadEnvFile() {
  const home = process.env.CONTENT_SKILLS_HOME || path.join(os.homedir(), '.content-skills');
  const file = path.join(home, '.env');
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let val = m[2];
    if (/^(['"]).*\1$/.test(val)) val = val.slice(1, -1);
    if (process.env[m[1]] === undefined || process.env[m[1]] === '') process.env[m[1]] = val;
  }
}
loadEnvFile();

// Keys that must never be accepted from callers or the CLI.
const LOCKED_KEYS = ['avatarId', 'avatar_id', 'avatar-id', 'voiceId', 'voice_id', 'voice-id', 'groupId', 'group_id', 'look-id', 'lookId'];

const BASE_URL = 'https://api.heygen.com';

const DEFAULTS = {
  engine: 'heygen-avatar-6', // newest. Also: heygen-avatar-6-turbo, avatar_v, avatar_iv
  resolution: '1080p', // Avatar 6: 1080p | 2k. Older engines: 1080p | 720p
  aspectRatio: '16:9', // 16:9 | 9:16
  title: undefined,
  background: undefined, // '#RRGGBB' or an https image URL
  caption: false, // true -> SRT sidecar; 'burn' -> also burned in
  speed: undefined, // 0.5 - 1.5
  motionPrompt: undefined,
  motionExpressiveness: undefined, // Avatar 6 only: 'default' | 'less'
  callbackUrl: undefined,
  wait: true,
  pollIntervalMs: 10_000,
  timeoutMs: 20 * 60 * 1000,
  out: undefined,
  dryRun: false,
  log: (...args) => console.error(...args),
};

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------
function apiKey() {
  const key = process.env.HEYGEN_API_KEY;
  if (!key) throw new Error('HEYGEN_API_KEY is not set. Add it to ~/.content-skills/.env');
  return key;
}

async function api(method, route, body) {
  const res = await fetch(`${BASE_URL}${route}`, {
    method,
    headers: { 'X-Api-Key': apiKey(), 'Content-Type': 'application/json', Accept: 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { raw: text };
  }
  if (!res.ok) {
    const err = json.error || json;
    const msg = typeof err === 'string' ? err : err.message || JSON.stringify(err);
    const e = new Error(`HeyGen ${method} ${route} -> ${res.status}: ${msg}`);
    e.status = res.status;
    e.body = json;
    e.retryAfter = res.headers.get('retry-after');
    throw e;
  }
  return json;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function listAll(route) {
  const items = [];
  let token;
  do {
    const sep = route.includes('?') ? '&' : '?';
    const json = await api('GET', `${route}${sep}limit=50${token ? `&token=${encodeURIComponent(token)}` : ''}`);
    items.push(...(json.data || []));
    token = json.has_more ? json.next_token : undefined;
  } while (token);
  return items;
}

// ---------------------------------------------------------------------------
// Identity (from config only)
// ---------------------------------------------------------------------------
async function resolveIdentity() {
  const avatarId = (process.env.HEYGEN_AVATAR_ID || '').trim();
  if (!avatarId) {
    throw new Error(
      'HEYGEN_AVATAR_ID is not set. Run `node generate-video.js --list-looks`, pick your look id, ' +
        'and put it in ~/.content-skills/.env',
    );
  }
  let voiceId = (process.env.HEYGEN_VOICE_ID || '').trim();
  if (!voiceId) {
    const look = (await api('GET', `/v3/avatars/looks/${encodeURIComponent(avatarId)}`)).data || {};
    voiceId = look.default_voice_id;
    if (!voiceId) throw new Error(`Look ${avatarId} has no default voice. Set HEYGEN_VOICE_ID (see --list-voices).`);
  }
  return { avatarId, voiceId };
}

function assertNoOverrides(opts) {
  const bad = LOCKED_KEYS.filter((k) => opts[k] !== undefined);
  if (bad.length) {
    throw new Error(
      `Refusing to override the presenter: ${bad.join(', ')}. ` +
        'The avatar and voice come only from HEYGEN_AVATAR_ID / HEYGEN_VOICE_ID in ~/.content-skills/.env.',
    );
  }
}

// ---------------------------------------------------------------------------
// Request builder
// ---------------------------------------------------------------------------
function buildRequest(opts, identity) {
  assertNoOverrides(opts);
  if (!opts.script || !opts.script.trim()) throw new Error('A non-empty script is required.');

  const body = {
    type: 'avatar',
    avatar_id: identity.avatarId,
    voice_id: identity.voiceId,
    script: opts.script.trim(),
    resolution: opts.resolution,
    aspect_ratio: opts.aspectRatio,
  };

  if (opts.engine) body.engine = { type: opts.engine };
  if (opts.motionExpressiveness) {
    if (!String(opts.engine).startsWith('heygen-avatar-6')) {
      throw new Error('motionExpressiveness only works with the Avatar 6 engines.');
    }
    body.engine.motion_expressiveness = opts.motionExpressiveness;
  }
  if (opts.title) body.title = opts.title;
  if (opts.callbackUrl) body.callback_url = opts.callbackUrl;
  if (opts.motionPrompt) body.motion_prompt = opts.motionPrompt;
  if (opts.speed) body.voice_settings = { speed: Number(opts.speed) };
  if (opts.background) {
    body.background = /^#([0-9a-f]{3}){1,2}$/i.test(opts.background)
      ? { type: 'color', value: opts.background }
      : { type: 'image', url: opts.background };
  }
  if (opts.caption) {
    body.caption = { file_format: 'srt' };
    if (opts.caption === 'burn') body.caption.style = 'default';
  }
  return body;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------
async function createVideo(opts = {}) {
  assertNoOverrides(opts);
  const o = { ...DEFAULTS, ...opts };
  const identity = await resolveIdentity();
  const body = buildRequest(o, identity);
  if (o.dryRun) return { dry_run: true, request: body };
  o.log(`[heygen] creating video (engine=${o.engine}, ${o.aspectRatio} @ ${o.resolution})`);
  const data = (await api('POST', '/v3/videos', body)).data || {};
  const videoId = data.video_id || data.id;
  if (!videoId) throw new Error(`Unexpected create response: ${JSON.stringify(data)}`);
  o.log(`[heygen] video_id=${videoId}  https://app.heygen.com/videos/${videoId}`);
  return { video_id: videoId, request: body };
}

async function getVideo(videoId) {
  return (await api('GET', `/v3/videos/${encodeURIComponent(videoId)}`)).data;
}

async function waitForVideo(videoId, opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  const deadline = Date.now() + o.timeoutMs;
  let lastStatus = null;
  while (Date.now() < deadline) {
    let video;
    try {
      video = await getVideo(videoId);
    } catch (e) {
      if (e.status === 429 || e.status >= 500 || !e.status) {
        const backoff = e.retryAfter ? Number(e.retryAfter) * 1000 : o.pollIntervalMs;
        o.log(`[heygen] ${e.status || e.message} while polling, retrying in ${backoff / 1000}s`);
        await sleep(backoff);
        continue;
      }
      throw e;
    }
    if (video.status !== lastStatus) {
      o.log(`[heygen] status=${video.status}`);
      lastStatus = video.status;
    }
    if (video.status === 'completed') return video;
    if (video.status === 'failed') {
      throw new Error(`Video ${videoId} failed: ${video.failure_code || ''} ${video.failure_message || ''}`.trim());
    }
    await sleep(o.pollIntervalMs);
  }
  throw new Error(`Timed out after ${o.timeoutMs / 1000}s waiting for video ${videoId}.`);
}

async function downloadTo(url, outPath) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed: ${res.status} ${res.statusText}`);
  fs.mkdirSync(path.dirname(path.resolve(outPath)), { recursive: true });
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(outPath, buf);
  return { path: path.resolve(outPath), bytes: buf.length };
}

async function generateVideo(opts = {}) {
  assertNoOverrides(opts);
  const o = { ...DEFAULTS, ...opts };
  const created = await createVideo(o);
  if (created.dry_run) return created;
  const { video_id } = created;
  if (!o.wait) return { video_id, status: 'pending' };

  const video = await waitForVideo(video_id, o);
  const result = {
    video_id,
    status: video.status,
    video_url: video.video_url,
    captioned_video_url: video.captioned_video_url,
    subtitle_url: video.subtitle_url,
    thumbnail_url: video.thumbnail_url,
    duration: video.duration,
  };
  if (o.out) {
    o.log(`[heygen] downloading to ${o.out}`);
    result.file = await downloadTo(video.video_url, o.out);
    if (video.subtitle_url) {
      const srt = o.out.replace(/\.[^.]+$/, '') + '.srt';
      result.subtitle_file = (await downloadTo(video.subtitle_url, srt)).path;
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------
function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) {
      args._.push(a);
      continue;
    }
    const key = a.slice(2);
    if (key.startsWith('no-')) {
      args[key.slice(3)] = false;
      continue;
    }
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) args[key] = true;
    else {
      args[key] = next;
      i++;
    }
  }
  return args;
}

function usage() {
  return `Usage: node generate-video.js --script "<text>" [options]

Find your presenter (once, during setup):
  --list-looks             Your own avatar looks (id, name, orientation, default voice)
  --list-voices            Your own cloned voices
  --whoami                 Show the look + voice this script will use

Script (one required):
  --script <text>          The text the presenter will say
  --script-file <path>     Read the script from a file

Options:
  --out <file.mp4>         Download the finished video (and .srt next to it with --caption)
  --title <text>           Title in the HeyGen dashboard
  --engine <heygen-avatar-6|heygen-avatar-6-turbo|avatar_v|avatar_iv>   (default heygen-avatar-6)
  --aspect <16:9|9:16>     (default 16:9)
  --resolution <2k|1080p>  (default 1080p)
  --background <#hex|url>  Solid color or image background
  --caption [burn]         SRT sidecar; "burn" also burns captions in
  --speed <0.5-1.5>        Voice speed
  --motion-prompt <text>   Body motion, e.g. "gesture with hands while talking"
  --motion-expressiveness <default|less>   Avatar 6 only
  --callback-url <url>     Webhook on completion
  --no-wait                Submit and exit with the video_id
  --dry-run                Print the request body, do not call HeyGen
  --poll-interval <sec>    (default 10)
  --timeout <min>          (default 20)
  --json                   Only the JSON result on stdout (logs on stderr)

The presenter comes only from HEYGEN_AVATAR_ID / HEYGEN_VOICE_ID (~/.content-skills/.env).`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || process.argv.includes('-h')) return console.log(usage());

  if (args['list-looks']) {
    const looks = await listAll('/v3/avatars/looks?ownership=private');
    if (!looks.length) console.log('No private avatar looks in this HeyGen account. Create one at https://app.heygen.com/avatars');
    for (const l of looks) {
      console.log(`${l.id}  ${l.avatar_type || ''}  ${l.preferred_orientation || ''}  voice=${l.default_voice_id || '-'}  "${l.name}"`);
    }
    return;
  }
  if (args['list-voices']) {
    const voices = await listAll('/v3/voices?type=private');
    if (!voices.length) console.log('No private voices in this HeyGen account.');
    for (const v of voices) console.log(`${v.voice_id}  ${v.language || ''}  "${v.name}"`);
    return;
  }
  if (args.whoami) {
    const id = await resolveIdentity();
    const look = (await api('GET', `/v3/avatars/looks/${encodeURIComponent(id.avatarId)}`)).data || {};
    console.log(JSON.stringify({ avatar_id: id.avatarId, look_name: look.name, orientation: look.preferred_orientation, voice_id: id.voiceId }, null, 2));
    return;
  }

  let script = args.script;
  if (args['script-file']) script = fs.readFileSync(args['script-file'], 'utf8');
  if (!script || script === true) {
    console.error(usage());
    process.exit(2);
  }

  const passedLocked = LOCKED_KEYS.filter((k) => args[k] !== undefined);
  if (passedLocked.length) {
    console.error(`Error: --${passedLocked[0]} is not allowed. Set the presenter in ~/.content-skills/.env instead.`);
    process.exit(2);
  }

  const opts = {
    script,
    out: args.out,
    title: args.title,
    engine: args.engine,
    aspectRatio: args.aspect,
    resolution: args.resolution,
    background: args.background,
    caption: args.caption === true ? true : args.caption,
    speed: args.speed,
    motionPrompt: args['motion-prompt'],
    motionExpressiveness: args['motion-expressiveness'],
    callbackUrl: args['callback-url'],
    wait: args.wait !== false,
    dryRun: !!args['dry-run'],
    pollIntervalMs: args['poll-interval'] ? Number(args['poll-interval']) * 1000 : undefined,
    timeoutMs: args.timeout ? Number(args.timeout) * 60 * 1000 : undefined,
  };
  for (const k of Object.keys(opts)) if (opts[k] === undefined) delete opts[k];

  const result = await generateVideo(opts);
  if (args.json || result.dry_run) return console.log(JSON.stringify(result, null, 2));
  if (result.status === 'completed') {
    console.log(`Video ready (${result.duration ?? '?'}s)`);
    if (result.file) console.log(`  saved: ${result.file.path} (${(result.file.bytes / 1e6).toFixed(1)} MB)`);
    if (result.subtitle_file) console.log(`  captions: ${result.subtitle_file}`);
    console.log(`  dashboard: https://app.heygen.com/videos/${result.video_id}`);
  } else {
    console.log(`Submitted. video_id=${result.video_id}`);
  }
}

module.exports = { DEFAULTS, buildRequest, resolveIdentity, createVideo, getVideo, waitForVideo, generateVideo };

if (require.main === module) {
  main().catch((err) => {
    console.error(`Error: ${err.message}`);
    if (err.body) console.error(JSON.stringify(err.body, null, 2));
    process.exit(1);
  });
}
