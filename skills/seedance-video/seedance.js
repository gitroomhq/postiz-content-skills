#!/usr/bin/env node
/**
 * seedance.js - ByteDance Seedance 2.0 video via the EvoLink API: submit, poll, download.
 *
 * Modes:
 *   i2v        seedance-2.0-image-to-video      1 image = first frame, 2 images = first + last frame
 *   reference  seedance-2.0-reference-to-video  0-9 images, 0-3 videos, 0-3 audio, tagged @image1 / @video1 / @audio1
 *
 * Local files are made public automatically with `postiz upload` (EvoLink only accepts public URLs,
 * and its own upload endpoint takes images only). Large images are downscaled first.
 *
 * Requirements: Node 18+, EVOLINK_API_KEY. For local files: the `postiz` CLI (authenticated) and ffmpeg.
 */

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

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
  for (const k of ['POSTIZ_API_URL']) if (process.env[k] === '') delete process.env[k];
}
loadEnvFile();

const BASE = 'https://api.evolink.ai';
const MODELS = {
  i2v: 'seedance-2.0-image-to-video',
  reference: 'seedance-2.0-reference-to-video',
};
const PRICE_PER_SEC = { '480p': 0.092, '720p': 0.199, '1080p': 0.496 }; // i2v list price, USD
const log = (...a) => console.error('[seedance]', ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function key() {
  if (!process.env.EVOLINK_API_KEY) throw new Error('EVOLINK_API_KEY is not set. Add it to ~/.content-skills/.env');
  return process.env.EVOLINK_API_KEY;
}

async function api(method, route, body) {
  for (let attempt = 1; ; attempt++) {
    let res;
    try {
      res = await fetch(BASE + route, {
        method,
        headers: { Authorization: `Bearer ${key()}`, 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch (e) {
      if (attempt < 5) {
        log(`network error (${e.message}), retry ${attempt}`);
        await sleep(3000 * attempt);
        continue;
      }
      throw e;
    }
    const text = await res.text();
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      json = { raw: text };
    }
    if (res.ok) return json;
    if ((res.status === 429 || res.status >= 500) && attempt < 5 && method === 'GET') {
      await sleep(5000 * attempt);
      continue;
    }
    const msg = json.error ? json.error.message || JSON.stringify(json.error) : text;
    throw new Error(`EvoLink ${method} ${route} -> ${res.status}: ${msg}`);
  }
}

// ---------------------------------------------------------------------------
// Local file -> public URL (via Postiz media upload)
// ---------------------------------------------------------------------------
const IMAGE_EXT = /\.(png|jpe?g|webp)$/i;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024; // Postiz rejected a 17 MB PNG; 7.8 MB went through

function shrinkImage(file) {
  if (!IMAGE_EXT.test(file) || fs.statSync(file).size <= MAX_IMAGE_BYTES) return file;
  const out = path.join(os.tmpdir(), `seedance-${Date.now()}-${path.basename(file).replace(/\.[^.]+$/, '')}.jpg`);
  log(`downscaling ${path.basename(file)} (${(fs.statSync(file).size / 1e6).toFixed(1)} MB) to max 2560px JPEG`);
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', file, '-vf', "scale='min(2560,iw)':'min(2560,ih)':force_original_aspect_ratio=decrease", '-q:v', '2', out]);
  return out;
}

function toPublicUrl(ref) {
  if (/^https?:\/\//i.test(ref)) return ref;
  const file = path.resolve(ref);
  if (!fs.existsSync(file)) throw new Error(`File not found: ${ref}`);
  const upload = shrinkImage(file);
  for (let attempt = 1; attempt <= 8; attempt++) {
    try {
      const out = execFileSync('postiz', ['upload', upload], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
      const json = JSON.parse(out.slice(out.indexOf('{')));
      const url = json.path || json.url;
      if (!url) throw new Error(`no path in upload response: ${out}`);
      log(`uploaded ${path.basename(file)} -> ${url}`);
      return url;
    } catch (e) {
      const msg = (e.stderr || e.message || '').toString().trim().split('\n').pop();
      if (/too large/i.test(msg)) throw new Error(`Postiz rejected ${path.basename(file)} as too large. Compress it and retry.`);
      if (/auth|401|unauthor/i.test(msg)) throw new Error('postiz CLI is not authenticated. Run `postiz auth:login` or set POSTIZ_API_KEY.');
      log(`upload attempt ${attempt} failed: ${msg}`);
      if (attempt === 8) throw new Error(`Could not upload ${ref}: ${msg}`);
      execFileSync('sleep', [String(2 * attempt)]);
    }
  }
}

// ---------------------------------------------------------------------------
// Task lifecycle
// ---------------------------------------------------------------------------
async function waitForTask(id, { timeoutMin = 30, intervalSec = 10 } = {}) {
  const deadline = Date.now() + timeoutMin * 60_000;
  let last = '';
  while (Date.now() < deadline) {
    const t = await api('GET', `/v1/tasks/${encodeURIComponent(id)}`);
    const line = `${t.status} ${t.progress ?? ''}%`;
    if (line !== last) {
      log(line);
      last = line;
    }
    if (t.status === 'completed') return t;
    if (t.status === 'failed' || t.status === 'cancelled') {
      const err = t.error || {};
      throw new Error(`Task ${id} ${t.status}: ${err.code || ''} ${err.message || ''}`.trim());
    }
    await sleep(intervalSec * 1000);
  }
  throw new Error(`Timed out after ${timeoutMin} min. Resume later with: --task ${id}`);
}

async function download(url, out) {
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      const res = await fetch(url, { redirect: 'follow' });
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length < 10_000) throw new Error(`suspiciously small file (${buf.length} bytes)`);
      fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
      fs.writeFileSync(out, buf);
      return { path: path.resolve(out), bytes: buf.length };
    } catch (e) {
      log(`download attempt ${attempt} failed: ${e.message}`);
      if (attempt === 5) throw e;
      await sleep(3000 * attempt);
    }
  }
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------
function parseArgs(argv) {
  const a = { image: [], video: [], audio: [] };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (!k.startsWith('--')) continue;
    const name = k.slice(2);
    const next = argv[i + 1];
    const takesValue = next !== undefined && !next.startsWith('--');
    if (['image', 'video', 'audio'].includes(name)) {
      a[name].push(next);
      i++;
    } else if (name.startsWith('no-')) a[name.slice(3)] = false;
    else if (takesValue) {
      a[name] = next;
      i++;
    } else a[name] = true;
  }
  return a;
}

const USAGE = `Usage:
  node seedance.js --mode i2v --image still.png --prompt "..." --out clip.mp4
  node seedance.js --mode reference --image a.png --video b.mp4 --prompt "@image1 ... @video1 ..." --out clip.mp4
  node seedance.js --task <task_id> --out clip.mp4          resume polling + download

Inputs (local paths are uploaded through \`postiz upload\`; URLs are used as-is):
  --image <path|url>      repeatable. i2v: 1 (first frame) or 2 (first + last). reference: 0-9
  --video <path|url>      reference only, 0-3, total <= 15 s
  --audio <path|url>      reference only, 0-3, total <= 15 s

Options:
  --mode <i2v|reference>  (default i2v)
  --model <id>            override, e.g. seedance-2.0-fast-reference-to-video
  --prompt <text> | --prompt-file <path>
  --duration <4-15>       seconds (default 5). Billed per second
  --quality <480p|720p|1080p|4k>   (default 1080p; 4k is reference-only)
  --aspect <16:9|9:16|1:1|4:3|3:4|21:9|adaptive>   (default 16:9)
  --silent                no generated sound (generate_audio=false). B-roll audio is rarely usable anyway
  --out <file.mp4>        where to save (default ./seedance-<task>.mp4)
  --no-wait               submit and print the task id
  --dry-run               print the request (local files are NOT uploaded) and the estimated cost
  --timeout <min>         (default 30)`;

async function main() {
  const a = parseArgs(process.argv.slice(2));
  if (a.help || process.argv.includes('-h')) return console.log(USAGE);

  let taskId = a.task;
  if (!taskId) {
    const mode = a.mode || 'i2v';
    if (!MODELS[mode]) throw new Error(`--mode must be i2v or reference`);
    const prompt = a['prompt-file'] ? fs.readFileSync(a['prompt-file'], 'utf8').trim() : a.prompt;
    if (mode === 'i2v' && (a.image.length < 1 || a.image.length > 2)) throw new Error('i2v needs 1 or 2 --image');
    if (mode === 'i2v' && (a.video.length || a.audio.length)) throw new Error('i2v does not take --video/--audio; use --mode reference');
    if (mode === 'reference' && !a.image.length && !a.video.length) throw new Error('reference needs at least 1 --image or --video');
    if (mode === 'reference' && !prompt) throw new Error('reference mode needs --prompt');

    const quality = a.quality || '1080p';
    const duration = Number(a.duration || 5);
    const body = {
      model: a.model || MODELS[mode],
      prompt,
      duration,
      quality,
      aspect_ratio: a.aspect || '16:9',
      generate_audio: !a.silent,
    };

    const est = PRICE_PER_SEC[quality] ? `~$${(PRICE_PER_SEC[quality] * duration).toFixed(2)}` : 'see EvoLink pricing';
    if (a['dry-run']) {
      body.image_urls = a.image;
      if (a.video.length) body.video_urls = a.video;
      if (a.audio.length) body.audio_urls = a.audio;
      return console.log(JSON.stringify({ dry_run: true, estimated_cost: est, request: body }, null, 2));
    }

    if (a.image.length) body.image_urls = a.image.map(toPublicUrl);
    if (a.video.length) body.video_urls = a.video.map(toPublicUrl);
    if (a.audio.length) body.audio_urls = a.audio.map(toPublicUrl);
    for (const k of Object.keys(body)) if (body[k] === undefined) delete body[k];

    log(`submitting ${body.model} ${duration}s ${quality} ${body.aspect_ratio} (${est})`);
    const created = await api('POST', '/v1/videos/generations', body);
    taskId = created.id;
    if (!taskId) throw new Error(`Unexpected response: ${JSON.stringify(created)}`);
    log(`task ${taskId}`);
    if (a.wait === false) return console.log(JSON.stringify({ task_id: taskId, status: created.status }, null, 2));
  }

  const task = await waitForTask(taskId, { timeoutMin: Number(a.timeout || 30) });
  const url = (task.results || [])[0];
  if (!url) throw new Error(`Task completed without a result URL: ${JSON.stringify(task)}`);
  const out = a.out || `seedance-${taskId}.mp4`;
  const file = await download(url, out);
  console.log(JSON.stringify({ task_id: taskId, status: 'completed', video_url: url, file }, null, 2));
}

main().catch((e) => {
  console.error(`Error: ${e.message}`);
  process.exit(1);
});
