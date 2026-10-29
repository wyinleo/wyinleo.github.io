(function () {
    'use strict';

    var site = document.currentScript.getAttribute('data-goatcounter-site');
    if (!site) return;

    var endpoint;
    try {
        endpoint = new URL(site);
        if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password) return;
    } catch (error) {
        return;
    }

    // Use the public tracking endpoint; never put a private API key in this file.
    var tracker = document.createElement('script');
    tracker.async = true;
    // Serve the official tracker with the site so a CDN outage cannot stop counting.
    tracker.src = new URL('goatcounter-count.js', document.currentScript.src).href;
    tracker.setAttribute('data-goatcounter', endpoint.origin + '/count');
    document.head.appendChild(tracker);

    var counter = document.getElementById('goatcounter-visits');
    if (!counter) return;

    // TOTAL includes all tracked pages. GoatCounter may cache it for four hours.
    fetch(endpoint.origin + '/counter/TOTAL.json', { credentials: 'omit' })
        .then(function (response) {
            if (!response.ok) throw new Error('Counter unavailable');
            return response.json();
        })
        .then(function (data) {
            if (typeof data.count !== 'string' && typeof data.count !== 'number') {
                throw new Error('Invalid counter response');
            }
            counter.textContent = String(data.count);
        })
        .catch(function () {
            // Keep the footer readable without displaying a misleading zero.
            counter.textContent = '—';
            counter.title = 'Visit count is temporarily unavailable';
        });
}());
