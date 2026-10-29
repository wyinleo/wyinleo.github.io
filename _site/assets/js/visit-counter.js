(function () {
    'use strict';
    var api;
    try { api = atob(document.currentScript.getAttribute('data-counter-code') || ''); }
    catch (error) { return; }
    if (!api) return;
    api = api.replace(/\/$/, '');
    var visibleStats = document.getElementById('visit-total');
    var sent = false;

    function render(data) {
        ['total', 'today', 'month'].forEach(function (key) {
            var node = document.getElementById('visit-' + key);
            if (node && Number.isSafeInteger(data[key]) && data[key] >= 0) {
                node.textContent = data[key].toLocaleString('en-US');
                node.removeAttribute('title');
            }
        });
    }
    function request(path, options) {
        var controller = new AbortController();
        var timeout = setTimeout(function () { controller.abort(); }, 8000);
        return fetch(api + path, Object.assign({ credentials: 'omit', cache: 'no-store', signal: controller.signal }, options))
            .then(function (response) {
                if (!response.ok) throw new Error('Counter unavailable');
                return response.json();
            }).then(render).finally(function () { clearTimeout(timeout); });
    }
    function refresh() {
        if (!visibleStats || document.visibilityState === 'hidden') return;
        request('/api/stats').catch(function () {
            visibleStats.title = 'Visit statistics are temporarily unavailable';
        });
    }
    function visit() {
        if (sent || document.visibilityState === 'hidden') return;
        sent = true;
        var visitorId = null;
        try {
            // Honor the opt-out switch used by the previous GoatCounter integration.
            if (localStorage.getItem('skipgc') === 't') { refresh(); return; }
            visitorId = localStorage.getItem('homepage-counter:visitor');
            if (!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(visitorId || '')) {
                visitorId = crypto.randomUUID();
                localStorage.setItem('homepage-counter:visitor', visitorId);
            }
        } catch (error) { visitorId = null; }
        var canonical = document.querySelector('link[rel="canonical"]');
        var path = location.pathname;
        if (canonical) {
            try {
                var url = new URL(canonical.href);
                if (url.origin === location.origin) path = url.pathname;
            } catch (error) { /* Use the current page path. */ }
        }
        // Each real page load is checked by the server's five-minute deduplication.
        request('/api/visit', { method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: path, visitorId: visitorId }) }).catch(refresh);
    }
    if (location.protocol === 'file:' || /(^localhost$|^127\.|^192\.168\.|^10\.|^172\.(1[6-9]|2\d|3[01])\.)/.test(location.hostname)) return;
    if (window.top !== window.self) return;
    visit();
    document.addEventListener('visibilitychange', function () {
        if (document.visibilityState !== 'visible') return;
        if (!sent) visit(); else refresh();
    });
    // Refresh displayed totals only; this never creates new visits.
    if (visibleStats) setInterval(refresh, 5 * 60 * 1000);
}());
