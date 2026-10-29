import http from 'node:http';
import { createHmac } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const WINDOW_MS = 5 * 60 * 1000;
const dates = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit'
});
export function dayAt(now) {
    const parts = Object.fromEntries(dates.formatToParts(new Date(now)).map(p => [p.type, p.value]));
    return `${parts.year}-${parts.month}-${parts.day}`;
}

export function openStore(filename, secret, seed = null) {
    if (!secret || secret.length < 32) throw new Error('COUNTER_SECRET must have at least 32 characters');
    const db = new DatabaseSync(filename);
    db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
        CREATE TABLE IF NOT EXISTS daily (day TEXT PRIMARY KEY, visits INTEGER NOT NULL);
        CREATE TABLE IF NOT EXISTS recent (visitor TEXT NOT NULL, path TEXT NOT NULL,
            last_counted INTEGER NOT NULL, PRIMARY KEY(visitor, path));
        CREATE INDEX IF NOT EXISTS recent_time ON recent(last_counted);
        CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);`);
    if (seed?.history && !db.prepare('SELECT 1 FROM metadata WHERE key = ?').get('history-import')) {
        db.exec('BEGIN IMMEDIATE');
        try {
            for (const [day, visits] of Object.entries(seed.history)) {
                if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !Number.isSafeInteger(visits) || visits < 0) throw new Error('Invalid history');
                db.prepare('INSERT INTO daily VALUES (?,?)').run(day, visits);
            }
            db.prepare('INSERT INTO metadata VALUES (?,?)').run('history-import', '1');
            db.exec('COMMIT');
        } catch (error) { db.exec('ROLLBACK'); throw error; }
    }
    if (seed && !seed.history && !db.prepare('SELECT 1 FROM metadata WHERE key = ?').get('baseline')) {
        for (const k of ['total', 'today', 'month']) {
            if (!Number.isSafeInteger(seed[k]) || seed[k] < 0) throw new Error('Invalid baseline');
        }
        if (seed.total < seed.month || seed.month < seed.today || !/^\d{4}-\d{2}-\d{2}$/.test(seed.day)) {
            throw new Error('Inconsistent baseline');
        }
        db.prepare('INSERT INTO metadata VALUES (?, ?)').run('baseline', JSON.stringify(seed));
    }
    const baseline = JSON.parse(db.prepare('SELECT value FROM metadata WHERE key = ?').get('baseline')?.value || '{}');
    function stats(now = Date.now()) {
        const day = dayAt(now), month = day.slice(0, 7);
        const row = db.prepare(`SELECT COALESCE(SUM(visits),0) AS total,
            COALESCE(SUM(CASE WHEN day = ? THEN visits ELSE 0 END),0) AS today,
            COALESCE(SUM(CASE WHEN substr(day,1,7) = ? THEN visits ELSE 0 END),0) AS month FROM daily`).get(day, month);
        return {
            total: row.total + (baseline.total || 0),
            today: row.today + (baseline.day === day ? baseline.today : 0),
            month: row.month + (baseline.day?.slice(0, 7) === month ? baseline.month : 0),
            timezone: 'Asia/Shanghai', updatedAt: new Date(now).toISOString()
        };
    }
    function visit(identity, path, now = Date.now()) {
        const visitor = createHmac('sha256', secret).update(identity).digest('hex');
        let counted = false;
        db.exec('BEGIN IMMEDIATE');
        try {
            const prior = db.prepare('SELECT last_counted FROM recent WHERE visitor = ? AND path = ?').get(visitor, path);
            if (!prior || now - prior.last_counted >= WINDOW_MS) {
                db.prepare(`INSERT INTO daily VALUES (?,1) ON CONFLICT(day) DO UPDATE SET visits = visits + 1`).run(dayAt(now));
                db.prepare(`INSERT INTO recent VALUES (?,?,?) ON CONFLICT(visitor,path)
                    DO UPDATE SET last_counted = excluded.last_counted`).run(visitor, path, now);
                counted = true;
            }
            db.prepare('DELETE FROM recent WHERE last_counted < ?').run(now - 86400000);
            db.exec('COMMIT');
        } catch (error) {
            db.exec('ROLLBACK');
            throw error;
        }
        return { ...stats(now), counted };
    }
    return { stats, visit, history: () => ({ stats: db.prepare('SELECT day, visits AS daily FROM daily ORDER BY day').all() }), close: () => db.close() };
}

export function createServer(homeStore, allowedOrigins, paperStore = null) {
    const allowed = new Set(allowedOrigins);
    return http.createServer(async (req, res) => {
        const isPaper = req.url.startsWith('/papernote/');
        const store = isPaper ? paperStore : homeStore;
        const origin = req.headers.origin;
        res.setHeader('Cache-Control', 'no-store');
        res.setHeader('Vary', 'Origin');
        res.setHeader('X-Content-Type-Options', 'nosniff');
        function reply(status, body) {
            res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify(body));
        }
        if (origin && !allowed.has(origin)) return reply(403, { error: 'Origin not allowed' });
        if (origin) res.setHeader('Access-Control-Allow-Origin', origin);
        if (!store) return reply(404, { error: 'Not found' });
        const path = req.url.split('?')[0].replace(/^\/papernote(?=\/)/, '');
        if (req.method === 'OPTIONS' && path === '/api/visit' && allowed.has(origin)) {
            res.writeHead(204, { 'Access-Control-Allow-Methods': 'POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '600' });
            return res.end();
        }
        try {
            if (req.method === 'GET' && path === '/health') return reply(200, { ok: true });
            if (isPaper && req.method === 'GET' && path === '/api/history') return reply(200, store.history());
            if (req.method === 'GET' && path === '/api/stats') return reply(200, store.stats());
            if (req.method !== 'POST' || path !== '/api/visit') return reply(404, { error: 'Not found' });
            if (!allowed.has(origin)) return reply(403, { error: 'Origin required' });
            if ((req.headers['content-type'] || '').split(';')[0].trim() !== 'application/json') {
                return reply(415, { error: 'JSON required' });
            }
            const chunks = [];
            let size = 0;
            for await (const chunk of req) {
                size += chunk.length;
                if (size > 2048) return reply(413, { error: 'Body too large' });
                chunks.push(chunk);
            }
            let body;
            try { body = JSON.parse(Buffer.concat(chunks).toString()); }
            catch { return reply(400, { error: 'Invalid JSON' }); }
            if (!body || typeof body.path !== 'string' || body.path.length > 512 ||
                !body.path.startsWith('/') || body.path.startsWith('//') || /[?#\x00-\x20]/.test(body.path)) {
                return reply(400, { error: 'Invalid page path' });
            }
            if (paperStore && isPaper !== (body.path === '/papernote' || body.path.startsWith('/papernote/'))) return reply(400, { error: 'Page belongs to another site' });
            if (body.visitorId != null && !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(body.visitorId)) {
                return reply(400, { error: 'Invalid visitor ID' });
            }
            const ua = (req.headers['user-agent'] || '').slice(0, 512);
            if (/bot|crawler|spider|headless|curl|wget/i.test(ua)) return reply(200, { ...store.stats(), counted: false });
            // Nginx overwrites X-Real-IP; the service only listens on loopback.
            const ip = req.headers['x-real-ip'] || req.socket.remoteAddress || '';
            const identity = body.visitorId ? `browser:${body.visitorId}` : `fallback:${ip}:${ua}`;
            return reply(200, store.visit(identity, body.path));
        } catch (error) {
            console.error('Counter request failed:', error.message);
            if (!res.headersSent) reply(500, { error: 'Temporarily unavailable' });
        }
    });
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const seed = process.env.COUNTER_SEED_FILE ? JSON.parse(readFileSync(process.env.COUNTER_SEED_FILE, 'utf8')) : null;
    const store = openStore(process.env.COUNTER_DB || './counter.sqlite', process.env.COUNTER_SECRET, seed);
    const paperStore = process.env.PAPERNOTE_DB ? openStore(process.env.PAPERNOTE_DB, process.env.COUNTER_SECRET + ':papernote',
        JSON.parse(readFileSync(process.env.PAPERNOTE_SEED_FILE, 'utf8'))) : null;
    const server = createServer(store, (process.env.COUNTER_ORIGINS || 'https://wyinleo.github.io').split(','), paperStore);
    server.requestTimeout = 10000;
    server.headersTimeout = 10000;
    server.listen(Number(process.env.PORT || 3210), '127.0.0.1', () => console.log('Homepage counter listening on loopback'));
    for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => server.close(() => { store.close(); paperStore?.close(); process.exit(0); }));
}
