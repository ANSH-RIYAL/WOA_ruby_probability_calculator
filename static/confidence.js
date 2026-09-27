(function () {
  "use strict";
  var W = window.WOA;

  var elLadderBody = document.querySelector('#ladderTable tbody');
  var elMetaCaveat = document.getElementById('metaCaveat');
  var elTrialsLabel = document.getElementById('trialsLabel');
  var elCards = document.getElementById('ciCards');

  var ladder = [];
  var rewards = null;
  var inFlightController = null;
  var lastTickets = 2000;

  var RANGE_W = 560, RANGE_H = 46;
  var RPAD = { l: 8, r: 8 };

  function buildRangeSvg(low, mean, high) {
    var domainMax = Math.max(high * 1.12, mean * 1.2, 1);
    var trackW = RANGE_W - RPAD.l - RPAD.r;
    function x(v) { return RPAD.l + Math.min(v, domainMax) / domainMax * trackW; }

    var y = RANGE_H / 2;
    var xs = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    xs.setAttribute('viewBox', '0 0 ' + RANGE_W + ' ' + RANGE_H);
    xs.setAttribute('class', 'chart-svg');
    xs.setAttribute('role', 'img');
    xs.setAttribute('aria-label', '95% range from ' + W.fmt(low) + ' to ' + W.fmt(high));

    xs.appendChild(W.svgEl('line', { x1: x(0), x2: x(domainMax), y1: y, y2: y, stroke: 'var(--border)', 'stroke-width': 6, 'stroke-linecap': 'round' }));
    xs.appendChild(W.svgEl('line', { x1: x(low), x2: x(high), y1: y, y2: y, stroke: 'var(--gold-line)', 'stroke-width': 6, 'stroke-linecap': 'round' }));
    xs.appendChild(W.svgEl('circle', { cx: x(mean), cy: y, r: 6.5, fill: 'var(--ruby)', stroke: 'var(--surface)', 'stroke-width': 2 }));

    [{ v: low, anchor: 'start' }, { v: high, anchor: 'end' }].forEach(function (p) {
      var t = W.svgEl('text', { x: x(p.v), y: y - 14, class: 'axis-label', 'text-anchor': p.anchor });
      t.textContent = W.fmtCompact(p.v);
      xs.appendChild(t);
    });
    var mt = W.svgEl('text', { x: x(mean), y: y + 22, class: 'axis-label', 'text-anchor': 'middle', 'font-weight': 700, fill: 'var(--ruby)' });
    mt.textContent = W.fmtCompact(mean);
    xs.appendChild(mt);

    return xs;
  }

  function renderCards(rewardsData) {
    elCards.innerHTML = '';
    ['rubies', 'construction_tokens'].forEach(function (key) {
      var r = rewardsData[key];
      if (!r) return;
      var card = document.createElement('div');
      card.className = 'panel ci-card';

      var head = document.createElement('div');
      head.innerHTML = '<h3>' + r.label + '</h3><span class="ci-unit">' + r.unit + ' per event</span>';
      card.appendChild(head);

      var rangeWrap = document.createElement('div');
      rangeWrap.className = 'ci-range-wrap';
      rangeWrap.appendChild(buildRangeSvg(r.ci_low, r.expected, r.ci_high));
      card.appendChild(rangeWrap);

      var nums = document.createElement('div');
      nums.className = 'ci-numbers';
      nums.innerHTML =
        '<div class="ci-num low"><span class="ci-num-label">2.5th pct</span><span class="ci-num-value">' + W.fmt(r.ci_low) + '</span></div>' +
        '<div class="ci-num mean"><span class="ci-num-label">Expected</span><span class="ci-num-value">' + W.fmt(r.expected) + '</span></div>' +
        '<div class="ci-num high"><span class="ci-num-label">97.5th pct</span><span class="ci-num-value">' + W.fmt(r.ci_high) + '</span></div>';
      card.appendChild(nums);

      elCards.appendChild(card);
    });
  }

  function fetchAndRender(tickets) {
    if (inFlightController) inFlightController.abort();
    inFlightController = new AbortController();
    var params = new URLSearchParams({ tickets: tickets });

    fetch('/api/confidence?' + params.toString(), { signal: inFlightController.signal })
      .then(function (r) { if (!r.ok) throw new Error('API error ' + r.status); return r.json(); })
      .then(function (data) {
        renderCards(data.rewards);
        W.renderLadder(elLadderBody, ladder, data.boxes_per_tier, rewards ? rewards.rubies : null);
        elTrialsLabel.textContent = data.trials.toLocaleString('en-US');
      })
      .catch(function (err) { if (err.name !== 'AbortError') console.error(err); });
  }

  fetch('/api/model')
    .then(function (r) { return r.json(); })
    .then(function (data) {
      ladder = data.ladder;
      rewards = data.rewards;
      elMetaCaveat.innerHTML =
        'Model reconstructed from <code>WoA 2024 + Boxes.xlsx</code>. ' +
        (rewards.construction_tokens && rewards.construction_tokens.meta
          ? rewards.construction_tokens.meta.confidence + ' ' + rewards.construction_tokens.meta.caveat
          : '');
      lastTickets = W.initTicketInputs(function (tickets) { lastTickets = tickets; fetchAndRender(tickets); });
      fetchAndRender(lastTickets);
    });
})();
