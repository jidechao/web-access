#!/usr/bin/env node
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PROXY_SCRIPT = path.join(ROOT, 'scripts', 'cdp-proxy.mjs');
const LOG_DIR = path.join(ROOT, 'tmp');
const LOG_FILE = path.join(LOG_DIR, 'cdp-proxy.log');
const PROXY_PORT = Number(process.env.CDP_PROXY_PORT || 3456);
const CHROME_PORT = Number(process.env.CHROME_DEBUG_PORT || 9222);

function nodeVersionOk() {
  const major = Number(process.versions.node.split('.')[0]);
  const version = `v${process.versions.node}`;
  if (major >= 22) {
    console.log(`node: ok (${version})`);
    return true;
  }
  console.log(`node: warn (${version}, recommended: 22+)`);
  return true;
}

function checkTcpPort(port, host = '127.0.0.1', timeoutMs = 2000) {
  return new Promise((resolve) => {
    const socket = net.createConnection(port, host);
    const timer = setTimeout(() => {
      socket.destroy();
      resolve(false);
    }, timeoutMs);
    socket.once('connect', () => {
      clearTimeout(timer);
      socket.destroy();
      resolve(true);
    });
    socket.once('error', () => {
      clearTimeout(timer);
      resolve(false);
    });
  });
}

function httpGetJson(url, timeoutMs = 2000) {
  return new Promise((resolve) => {
    const req = fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    req.then(async (res) => {
      const text = await res.text();
      try {
        resolve(JSON.parse(text));
      } catch {
        resolve(null);
      }
    }).catch(() => resolve(null));
  });
}

async function ensureChrome() {
  const ok = await checkTcpPort(CHROME_PORT);
  if (ok) {
    console.log(`chrome: ok (port ${CHROME_PORT})`);
    return true;
  }
  console.log('chrome: not connected');
  console.log('  open chrome://inspect/#remote-debugging');
  console.log('  enable "Allow remote debugging for this browser instance"');
  return false;
}

function startProxyDetached() {
  fs.mkdirSync(LOG_DIR, { recursive: true });
  const logFd = fs.openSync(LOG_FILE, 'a');
  const child = spawn(process.execPath, [PROXY_SCRIPT], {
    detached: true,
    stdio: ['ignore', logFd, logFd],
    windowsHide: true,
  });
  child.unref();
}

async function ensureProxy() {
  const healthUrl = `http://127.0.0.1:${PROXY_PORT}/health`;
  const health = await httpGetJson(healthUrl);

  if (health?.connected === true) {
    console.log('proxy: ready');
    return true;
  }

  if (!health || health.status !== 'ok') {
    console.log('proxy: starting...');
    startProxyDetached();
  }

  for (let i = 1; i <= 15; i += 1) {
    await new Promise((r) => setTimeout(r, 1000));
    const next = await httpGetJson(healthUrl);
    if (next?.connected === true) {
      console.log('proxy: ready');
      return true;
    }
    if (i === 3) {
      console.log('waiting for Chrome to authorize CDP and proxy to connect...');
    }
  }

  console.log('proxy: failed to connect');
  console.log(`  check logs: ${LOG_FILE}`);
  return false;
}

async function main() {
  if (!nodeVersionOk()) {
    process.exit(1);
  }

  const chromeOk = await ensureChrome();
  if (!chromeOk) {
    process.exit(1);
  }

  const proxyOk = await ensureProxy();
  if (!proxyOk) {
    process.exit(1);
  }

  if (os.platform() === 'win32') {
    console.log('hint: run API calls with curl.exe or PowerShell Invoke-RestMethod');
  }
}

await main();
