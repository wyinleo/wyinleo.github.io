import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openStore, createServer, dayAt, WINDOW_MS } from './server.mjs';

const secret = 'test-secret-not-used-in-production-123456';
test('service starts through the deployed current symlink', { timeout: 10000 }, async () => {
    const dir = mkdtempSync(join(tmpdir(), 'counter-start-'));
    const entry = join(dir, 'server.mjs');
    symlinkSync(fileURLToPath(new URL('./server.mjs', import.meta.url)), entry);
    const child = spawn(process.execPath, [entry], { env: { ...process.env,
        COUNTER_SECRET: secret, COUNTER_DB: join(dir, 'counter.sqlite'), COUNTER_SEED_FILE: '', PORT: '0' } });
    try {
        await new Promise((resolve, reject) => {
            child.once('error', reject);
            child.once('exit', code => reject(new Error('Service exited before listening: ' + code)));
            child.stdout.on('data', data => { if (String(data).includes('listening')) resolve(); });
        });
    } finally {
        const exited = new Promise(resolve => child.once('exit', resolve));
        child.kill('SIGTERM'); await exited;
        rmSync(dir, { recursive: true });
    }
});
test('five-minute deduplication survives reloads and counts separate pages', () => {
    const dir = mkdtempSync(join(tmpdir(), 'counter-test-'));
    const path = join(dir, 'counter.sqlite');
    let store = openStore(path, secret);
    const now = Date.parse('2026-10-29T04:00:00Z');
    assert.equal(store.visit('a', '/', now).total, 1);
    assert.equal(store.visit('a', '/', now + WINDOW_MS - 1).counted, false);
    assert.equal(store.visit('a', '/', now + WINDOW_MS).total, 2);
    assert.equal(store.visit('a', '/publications/', now + WINDOW_MS).total, 3);
    assert.equal(store.visit('b', '/', now + WINDOW_MS).total, 4);
    store.close();
    store = openStore(path, secret);
    assert.equal(store.visit('a', '/', now + WINDOW_MS + 1).total, 4);
    store.close(); rmSync(dir, { recursive: true });
});

test('Beijing day/month boundaries and one-time historical baseline', () => {
    const store = openStore(':memory:', secret, { total: 100, today: 4, month: 20, day: '2026-10-31' });
    const before = Date.parse('2026-10-31T15:59:59Z'), after = before + 1000;
    assert.equal(dayAt(after), '2026-11-01');
    assert.equal(store.visit('a', '/', before).today, 5);
    const stats = store.visit('b', '/', after);
    assert.equal(stats.total, 102); assert.equal(stats.today, 1); assert.equal(stats.month, 1);
    store.close();
});

test('HTTP origins, validation, bot filtering, deduplication and no-cache response', async () => {
    const store = openStore(':memory:', secret);
    const server = createServer(store, ['https://wyinleo.github.io']);
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const root = `http://127.0.0.1:${server.address().port}`;
    const headers = { Origin: 'https://wyinleo.github.io', 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0 TestBrowser' };
    const body = JSON.stringify({ path: '/', visitorId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' });
    try {
        let response = await fetch(root + '/api/visit', { method: 'OPTIONS', headers });
        assert.equal(response.status, 204);
        response = await fetch(root + '/api/visit', { method: 'POST', headers, body });
        assert.equal(response.headers.get('access-control-allow-origin'), headers.Origin);
        assert.equal(response.headers.get('cache-control'), 'no-store');
        assert.equal((await response.json()).counted, true);
        const duplicates = await Promise.all(Array.from({ length: 8 }, () => fetch(root + '/api/visit', { method: 'POST', headers, body }).then(r => r.json())));
        assert.ok(duplicates.every(r => r.total === 1 && r.counted === false));
        response = await fetch(root + '/api/visit', { method: 'POST', headers: { ...headers, Origin: 'https://other.example' }, body });
        assert.equal(response.status, 403);
        response = await fetch(root + '/api/visit', { method: 'POST', headers, body: '{invalid' });
        assert.equal(response.status, 400);
        response = await fetch(root + '/api/visit', { method: 'POST', headers, body: JSON.stringify({ path: '//other.example/' }) });
        assert.equal(response.status, 400);
        response = await fetch(root + '/api/visit', { method: 'POST', headers: { ...headers, 'User-Agent': 'Googlebot' }, body });
        assert.equal((await response.json()).counted, false);
        assert.equal(store.stats().total, 1);
    } finally {
        await new Promise(resolve => server.close(resolve)); store.close();
    }
});

test('papernote history imports once and site counters stay isolated', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'counter-sites-'));
    const file = join(dir, 'paper.sqlite');
    const seed = { history: { '2026-10-28': 23, '2026-10-29': 7 } };
    let paper = openStore(file, secret, seed);
    paper.close(); paper = openStore(file, secret, seed);
    assert.equal(paper.stats().total, 30);
    assert.deepEqual(paper.history().stats.map(r => r.daily), [23, 7]);
    const home = openStore(':memory:', secret);
    const server = createServer(home, ['https://wyinleo.github.io'], paper);
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    const post = (prefix, path) => fetch(base + prefix + '/api/visit', {
        method: 'POST', headers: { Origin: 'https://wyinleo.github.io', 'Content-Type': 'application/json' },
        body: JSON.stringify({ path, visitorId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' }) });
    try {
        assert.equal((await (await post('/papernote', '/papernote/')).json()).total, 31);
        assert.equal(home.stats().total, 0);
        assert.equal((await (await post('', '/')).json()).total, 1);
        assert.equal(paper.stats().total, 31);
        assert.equal((await post('', '/papernote/')).status, 400);
        assert.equal((await post('/papernote', '/')).status, 400);
        assert.equal((await (await fetch(base + '/papernote/api/history')).json()).stats.reduce((n,r) => n+r.daily,0), 31);
    } finally {
        await new Promise(resolve => server.close(resolve));
        home.close(); paper.close(); rmSync(dir, { recursive: true });
    }
});
