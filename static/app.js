(function () {
  "use strict";

  var elTickets = document.getElementById('tickets');
  var elTicketsRange = document.getElementById('ticketsRange');
  var elThreshold = document.getElementById('threshold');
  var elResim = document.getElementById('resim');
  var elLadderBody = document.querySelector('#ladderTable tbody');
  var elMetaCaveat = document.getElementById('metaCaveat');
  var elStatMean = document.getElementById('statMean');
  var elStatMedian = document.getElementById('statMedian');
  var elStatAny = document.getElementById('statAny');
  var elStatThresh = document.getElementById('statThresh');
  var elStatThreshLabel = document.getElementById('statThreshLabel');
  var elTrialsLabel = document.getElementById('trialsLabel');
  var svg = document.getElementById('ccdf');
  var gridLayer = document.getElementById('gridLayer');
  var areaPath = document.getElementById('areaPath');
  var linePath = document.getElementById('linePath');
  var markerLine = document.getElementById('markerLine');
  var markerDot = document.getElementById('markerDot');
  var hoverLine = document.getElementById('hoverLine');
  var xAxisG = document.getElementById('xAxis');
  var yAxisG = document.getElementById('yAxis');
  var tooltip = document.getElementById('tooltip');

  var PAD = { l: 44, r: 14, t: 14, b: 30 };
  var W = 640, H = 300;
  var plotW = W - PAD.l - PAD.r, plotH = H - PAD.t - PAD.b;

  var TIERS = [];
  var lastResult = null;
  var debounceTimer = null;
  var inFlightController = null;

  function fmt(n) { return Math.round(n).toLocaleString('en-US'); }
  function fmtCompact(n) {
    if (n >= 1000000) return (Math.round((n / 1000000) * 10) / 10) + 'M';
    if (n >= 1000) return Math.round(n / 1000) + 'K';
    return String(Math.round(n));
  }
  function fmtPct(f) {
    if (f <= 0) return '0%';
    if (f * 100 < 0.01) return '<0.01%';
    if (f * 100 < 1) return (Math.round(f * 10000) / 100).toFixed(2) + '%';
    return (Math.round(f * 1000) / 10).toFixed(1) + '%';
  }

  function svgEl(tag, attrs) {
    var e = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    return e;
  }

  function renderLadder(boxesPerTier) {
    elLadderBody.innerHTML = '';
    TIERS.forEach(function (t, i) {
      var range = t.end === null ? (fmt(t.start) + '+') : (fmt(t.start) + '–' + fmt(t.end));
      var odds = '1 in ' + fmt(Math.round(1 / t.p));
      var boxes = boxesPerTier ? boxesPerTier[i] : 0;
      var tr = document.createElement('tr');
      if (boxes > 0) tr.className = 'active';
      tr.innerHTML = '<td>' + t.tier + '</td><td>' + range + '</td><td>' + fmt(t.amount) +
        '</td><td>' + odds + '</td><td>' + fmt(boxes) + '</td>';
      elLadderBody.appendChild(tr);
    });
  }

  function renderChart(curve, threshold, pAtThreshold) {
    var domainMax = curve.domain_max;
    var points = curve.points; // ascending value, prob = P(total >= value)

    function xScale(v) { return PAD.l + Math.min(v, domainMax) / domainMax * plotW; }
    function yScale(f) { return PAD.t + (1 - f) * plotH; }

    gridLayer.innerHTML = ''; xAxisG.innerHTML = ''; yAxisG.innerHTML = '';
    [0, 0.25, 0.5, 0.75, 1].forEach(function (f) {
      var y = yScale(f);
      gridLayer.appendChild(svgEl('line', { x1: PAD.l, x2: W - PAD.r, y1: y, y2: y, class: 'grid-line' }));
      var t = svgEl('text', { x: PAD.l - 8, y: y + 3, class: 'axis-label', 'text-anchor': 'end' });
      t.textContent = Math.round(f * 100) + '%';
      yAxisG.appendChild(t);
    });
    [0, domainMax * 0.25, domainMax * 0.5, domainMax * 0.75, domainMax].forEach(function (v) {
      var x = xScale(v);
      var t = svgEl('text', {
        x: x, y: H - PAD.b + 16, class: 'axis-label',
        'text-anchor': (v === 0 ? 'start' : (v === domainMax ? 'end' : 'middle'))
      });
      t.textContent = fmtCompact(v);
      xAxisG.appendChild(t);
    });

    var d = 'M ' + xScale(0) + ' ' + yScale(1);
    var ad = 'M ' + xScale(0) + ' ' + yScale(1);
    var prevF = 1;
    for (var i = 0; i < points.length; i++) {
      var v = points[i].value, f = points[i].prob;
      var x = xScale(v);
      d += ' L ' + x + ' ' + yScale(prevF) + ' L ' + x + ' ' + yScale(f);
      ad += ' L ' + x + ' ' + yScale(prevF) + ' L ' + x + ' ' + yScale(f);
      prevF = f;
    }
    var xEnd = xScale(domainMax);
    d += ' L ' + xEnd + ' ' + yScale(prevF);
    ad += ' L ' + xEnd + ' ' + yScale(prevF) + ' L ' + xEnd + ' ' + yScale(0) + ' L ' + xScale(0) + ' ' + yScale(0) + ' Z';
    linePath.setAttribute('d', d);
    areaPath.setAttribute('d', ad);

    var mx = xScale(Math.min(threshold, domainMax));
    markerLine.setAttribute('x1', mx); markerLine.setAttribute('x2', mx);
    markerLine.setAttribute('y1', PAD.t); markerLine.setAttribute('y2', H - PAD.b);
    markerDot.setAttribute('cx', mx); markerDot.setAttribute('cy', yScale(pAtThreshold));

    svg.onpointermove = function (evt) {
      var rect = svg.getBoundingClientRect();
      var px = (evt.clientX - rect.left) / rect.width * W;
      if (px < PAD.l || px > W - PAD.r) { tooltip.style.opacity = 0; hoverLine.style.opacity = 0; return; }
      var v = Math.max(0, (px - PAD.l) / plotW * domainMax);
      var f = 1;
      for (var j = 0; j < points.length; j++) { if (points[j].value <= v) f = points[j].prob; else break; }
      hoverLine.style.opacity = 1;
      hoverLine.setAttribute('x1', px); hoverLine.setAttribute('x2', px);
      hoverLine.setAttribute('y1', PAD.t); hoverLine.setAttribute('y2', H - PAD.b);
      tooltip.style.opacity = 1;
      tooltip.style.left = (px / W * 100) + '%';
      tooltip.style.top = (yScale(f) / H * 100) + '%';
      tooltip.textContent = '≥ ' + fmt(v) + ' rubies: ' + fmtPct(f);
    };
    svg.onpointerleave = function () { tooltip.style.opacity = 0; hoverLine.style.opacity = 0; };
  }

  function applyResult(data) {
    lastResult = data;
    renderLadder(data.boxes_per_tier);
    elStatMean.textContent = fmt(data.expected_rubies);
    elStatMean.title = Math.round(data.expected_rubies).toLocaleString('en-US') + ' rubies (exact expected value)';
    elStatMedian.textContent = fmt(data.median_rubies);
    elStatAny.textContent = fmtPct(data.p_any_jackpot);
    elStatThreshLabel.textContent = fmt(data.threshold);
    elStatThresh.textContent = fmtPct(data.p_at_least_threshold);
    elTrialsLabel.textContent = data.trials.toLocaleString('en-US');
    renderChart(data.ccdf, data.threshold, data.p_at_least_threshold);
  }

  function fetchAndRender(opts) {
    var tickets = Math.max(0, parseInt(elTickets.value, 10) || 0);
    var threshold = Math.max(0, parseInt(elThreshold.value, 10) || 0);
    elTicketsRange.value = Math.min(20000, tickets);

    if (inFlightController) inFlightController.abort();
    inFlightController = new AbortController();

    var params = new URLSearchParams({ tickets: tickets, threshold: threshold });
    if (opts && opts.fresh) params.set('seed', String(Math.floor(Math.random() * 1e9)));

    fetch('/api/calculate?' + params.toString(), { signal: inFlightController.signal })
      .then(function (r) { if (!r.ok) throw new Error('API error ' + r.status); return r.json(); })
      .then(applyResult)
      .catch(function (err) { if (err.name !== 'AbortError') console.error(err); });
  }

  function debouncedFetch() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(function () { fetchAndRender(); }, 250);
  }

  elTickets.addEventListener('input', function () {
    elTicketsRange.value = Math.min(20000, parseInt(elTickets.value, 10) || 0);
    debouncedFetch();
  });
  elTicketsRange.addEventListener('input', function () {
    elTickets.value = elTicketsRange.value;
    debouncedFetch();
  });
  elThreshold.addEventListener('input', debouncedFetch);
  elResim.addEventListener('click', function () { fetchAndRender({ fresh: true }); });
  document.querySelectorAll('.chip').forEach(function (chip) {
    chip.addEventListener('click', function () {
      elThreshold.value = chip.getAttribute('data-amt');
      fetchAndRender();
    });
  });

  fetch('/api/model')
    .then(function (r) { return r.json(); })
    .then(function (data) {
      TIERS = data.tiers;
      elMetaCaveat.innerHTML = 'Model reconstructed from <code>WoA 2024 + Boxes.xlsx</code>. ' +
        (data.meta && data.meta.caveat ? data.meta.caveat : '');
      fetchAndRender();
    });
})();
