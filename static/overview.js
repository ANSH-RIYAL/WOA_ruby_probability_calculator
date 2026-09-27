(function () {
  "use strict";
  var W = window.WOA;

  var REWARD_UI = {
    rubies: { defaultThreshold: 500000, step: 10000, chips: [100000, 500000, 1000000, 2000000] },
    construction_tokens: { defaultThreshold: 500, step: 50, chips: [100, 250, 500, 1000] },
    upgrade_tokens: { defaultThreshold: 1000, step: 100, chips: [250, 500, 1000, 2000] },
    sceats: { defaultThreshold: 500, step: 50, chips: [100, 250, 500, 1000] }
  };

  var elRewardSelect = document.getElementById('rewardSelect');
  var elThreshold = document.getElementById('threshold');
  var elThresholdUnit = document.getElementById('thresholdUnit');
  var elThresholdChips = document.getElementById('thresholdChips');
  var elResim = document.getElementById('resim');
  var elLadderBody = document.querySelector('#ladderTable tbody');
  var elLadderAmountHead = document.getElementById('ladderAmountHead');
  var elMetaCaveat = document.getElementById('metaCaveat');
  var elPageTitle = document.getElementById('pageTitle');
  var elStatMean = document.getElementById('statMean');
  var elStatMedian = document.getElementById('statMedian');
  var elStatAny = document.getElementById('statAny');
  var elStatThresh = document.getElementById('statThresh');
  var elStatThreshLabel = document.getElementById('statThreshLabel');
  var elTrialsLabel = document.getElementById('trialsLabel');
  var elUnitLabels = document.querySelectorAll('.unit-label');

  var ladder = [];
  var allRewards = {};
  var currentReward = 'rubies';
  var currentUnit = 'rubies';
  var inFlightController = null;
  var lastTickets = 2000;

  // ---- CCDF (probability of at least X) ----
  var ccdfSvg = document.getElementById('ccdf');
  var ccdfGrid = document.getElementById('ccdfGrid');
  var ccdfArea = document.getElementById('ccdfArea');
  var ccdfLine = document.getElementById('ccdfLine');
  var ccdfMarkerLine = document.getElementById('ccdfMarkerLine');
  var ccdfMarkerDot = document.getElementById('ccdfMarkerDot');
  var ccdfHoverLine = document.getElementById('ccdfHoverLine');
  var ccdfXAxis = document.getElementById('ccdfXAxis');
  var ccdfYAxis = document.getElementById('ccdfYAxis');
  var ccdfTooltip = document.getElementById('ccdfTooltip');

  // ---- PMF (distribution of outcomes) ----
  var pmfBars = document.getElementById('pmfBars');
  var pmfYAxis = document.getElementById('pmfYAxis');
  var pmfGrid = document.getElementById('pmfGrid');
  var pmfTooltip = document.getElementById('pmfTooltip');

  var PAD = { l: 44, r: 14, t: 14, b: 34 };
  var CW = 640, CH = 300;
  var plotW = CW - PAD.l - PAD.r, plotH = CH - PAD.t - PAD.b;

  function renderCcdfChart(curve, threshold, pAtThreshold) {
    var domainMax = curve.domain_max;
    var points = curve.points;

    function xScale(v) { return PAD.l + Math.min(v, domainMax) / domainMax * plotW; }
    function yScale(f) { return PAD.t + (1 - f) * plotH; }

    ccdfGrid.innerHTML = ''; ccdfXAxis.innerHTML = ''; ccdfYAxis.innerHTML = '';
    [0, 0.25, 0.5, 0.75, 1].forEach(function (f) {
      var y = yScale(f);
      ccdfGrid.appendChild(W.svgEl('line', { x1: PAD.l, x2: CW - PAD.r, y1: y, y2: y, class: 'grid-line' }));
      var t = W.svgEl('text', { x: PAD.l - 8, y: y + 3, class: 'axis-label', 'text-anchor': 'end' });
      t.textContent = Math.round(f * 100) + '%';
      ccdfYAxis.appendChild(t);
    });
    [0, domainMax * 0.25, domainMax * 0.5, domainMax * 0.75, domainMax].forEach(function (v) {
      var x = xScale(v);
      var t = W.svgEl('text', {
        x: x, y: CH - PAD.b + 16, class: 'axis-label',
        'text-anchor': (v === 0 ? 'start' : (v === domainMax ? 'end' : 'middle'))
      });
      t.textContent = W.fmtCompact(v);
      ccdfXAxis.appendChild(t);
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
    ccdfLine.setAttribute('d', d);
    ccdfArea.setAttribute('d', ad);

    var mx = xScale(Math.min(threshold, domainMax));
    ccdfMarkerLine.setAttribute('x1', mx); ccdfMarkerLine.setAttribute('x2', mx);
    ccdfMarkerLine.setAttribute('y1', PAD.t); ccdfMarkerLine.setAttribute('y2', CH - PAD.b);
    ccdfMarkerDot.setAttribute('cx', mx); ccdfMarkerDot.setAttribute('cy', yScale(pAtThreshold));

    ccdfSvg.onpointermove = function (evt) {
      var rect = ccdfSvg.getBoundingClientRect();
      var px = (evt.clientX - rect.left) / rect.width * CW;
      if (px < PAD.l || px > CW - PAD.r) { ccdfTooltip.style.opacity = 0; ccdfHoverLine.style.opacity = 0; return; }
      var v = Math.max(0, (px - PAD.l) / plotW * domainMax);
      var f = 1;
      for (var j = 0; j < points.length; j++) { if (points[j].value <= v) f = points[j].prob; else break; }
      ccdfHoverLine.style.opacity = 1;
      ccdfHoverLine.setAttribute('x1', px); ccdfHoverLine.setAttribute('x2', px);
      ccdfHoverLine.setAttribute('y1', PAD.t); ccdfHoverLine.setAttribute('y2', CH - PAD.b);
      ccdfTooltip.style.opacity = 1;
      ccdfTooltip.style.left = (px / CW * 100) + '%';
      ccdfTooltip.style.top = (yScale(f) / CH * 100) + '%';
      ccdfTooltip.textContent = '≥ ' + W.fmt(v) + ' ' + currentUnit + ': ' + W.fmtPct(f);
    };
    ccdfSvg.onpointerleave = function () { ccdfTooltip.style.opacity = 0; ccdfHoverLine.style.opacity = 0; };
  }

  function renderPmfChart(bars) {
    pmfBars.innerHTML = ''; pmfYAxis.innerHTML = ''; pmfGrid.innerHTML = '';
    var maxProb = Math.max.apply(null, bars.map(function (b) { return b.prob; }).concat([0.05]));
    var n = bars.length;
    var slot = plotW / n;
    var barW = Math.min(48, slot * 0.62);

    function yScale(p) { return PAD.t + (1 - p / maxProb) * plotH; }

    [0, 0.25, 0.5, 0.75, 1].forEach(function (f) {
      var y = PAD.t + (1 - f) * plotH;
      pmfGrid.appendChild(W.svgEl('line', { x1: PAD.l, x2: CW - PAD.r, y1: y, y2: y, class: 'grid-line' }));
      var t = W.svgEl('text', { x: PAD.l - 8, y: y + 3, class: 'axis-label', 'text-anchor': 'end' });
      t.textContent = Math.round(f * maxProb * 100) + '%';
      pmfYAxis.appendChild(t);
    });

    bars.forEach(function (b, i) {
      var cx = PAD.l + slot * (i + 0.5);
      var y = yScale(b.prob);
      var h = (CH - PAD.b) - y;
      var isTail = b.value === null && b.tail_from !== null;
      var rect = W.svgEl('rect', {
        x: cx - barW / 2, y: y, width: barW, height: Math.max(1, h),
        rx: 3, class: 'bar-rect' + (isTail ? ' other' : '')
      });
      var axisLabel = isTail ? ('>' + W.fmtCompact(b.tail_from)) : W.fmtCompact(b.value);
      var tooltipLabel = isTail ? ('more than ' + W.fmt(b.tail_from) + ' ' + currentUnit) : (W.fmt(b.value) + ' ' + currentUnit);
      rect.addEventListener('pointerenter', function () {
        pmfTooltip.style.opacity = 1;
        pmfTooltip.style.left = (cx / CW * 100) + '%';
        pmfTooltip.style.top = (y / CH * 100) + '%';
        pmfTooltip.textContent = tooltipLabel + ': ' + W.fmtPct(b.prob);
      });
      rect.addEventListener('pointerleave', function () { pmfTooltip.style.opacity = 0; });
      pmfBars.appendChild(rect);

      var lbl = W.svgEl('text', { x: cx, y: CH - PAD.b + 16, class: 'axis-label', 'text-anchor': 'middle' });
      lbl.textContent = axisLabel;
      pmfBars.appendChild(lbl);
    });
  }

  function applyResult(data) {
    W.renderLadder(elLadderBody, ladder, data.boxes_per_tier, allRewards[currentReward]);
    elStatMean.textContent = W.fmt(data.expected_amount);
    elStatMean.title = Math.round(data.expected_amount).toLocaleString('en-US') + ' ' + currentUnit + ' (exact expected value)';
    elStatMedian.textContent = W.fmt(data.median_amount);
    elStatAny.textContent = W.fmtPct(data.p_any_reward);
    elStatThreshLabel.textContent = W.fmt(data.threshold);
    elStatThresh.textContent = W.fmtPct(data.p_at_least_threshold);
    elTrialsLabel.textContent = data.trials.toLocaleString('en-US');
    renderCcdfChart(data.ccdf, data.threshold, data.p_at_least_threshold);
    renderPmfChart(data.pmf);
  }

  function fetchAndRender(tickets, opts) {
    var threshold = Math.max(0, parseInt(elThreshold.value, 10) || 0);

    if (inFlightController) inFlightController.abort();
    inFlightController = new AbortController();

    var params = new URLSearchParams({ tickets: tickets, threshold: threshold, reward: currentReward });
    if (opts && opts.fresh) params.set('seed', String(Math.floor(Math.random() * 1e9)));

    fetch('/api/calculate?' + params.toString(), { signal: inFlightController.signal })
      .then(function (r) { if (!r.ok) throw new Error('API error ' + r.status); return r.json(); })
      .then(applyResult)
      .catch(function (err) { if (err.name !== 'AbortError') console.error(err); });
  }

  function applyRewardUi(rewardKey) {
    currentReward = rewardKey;
    var meta = allRewards[rewardKey].meta;
    currentUnit = meta.unit;
    var ui = REWARD_UI[rewardKey] || { defaultThreshold: 100, step: 10, chips: [50, 100, 250, 500] };

    elPageTitle.textContent = meta.label + ' overview';
    elUnitLabels.forEach(function (el) { el.textContent = meta.unit; });
    elThresholdUnit.textContent = meta.unit;
    elLadderAmountHead.textContent = meta.label;
    elThreshold.step = ui.step;
    elThreshold.value = ui.defaultThreshold;

    elThresholdChips.innerHTML = '';
    ui.chips.forEach(function (amt) {
      var btn = document.createElement('button');
      btn.className = 'chip'; btn.type = 'button'; btn.setAttribute('data-amt', amt);
      btn.textContent = W.fmtCompact(amt);
      btn.addEventListener('click', function () { elThreshold.value = amt; fetchAndRender(lastTickets); });
      elThresholdChips.appendChild(btn);
    });

    elMetaCaveat.innerHTML = 'Model reconstructed from <code>WoA 2024 + Boxes.xlsx</code>. ' +
      (meta.confidence || '') + (meta.caveat ? ' ' + meta.caveat : '');
  }

  elThreshold.addEventListener('input', function () {
    clearTimeout(elThreshold._t);
    elThreshold._t = setTimeout(function () { fetchAndRender(lastTickets); }, 250);
  });
  elResim.addEventListener('click', function () { fetchAndRender(lastTickets, { fresh: true }); });
  elRewardSelect.addEventListener('change', function () {
    applyRewardUi(elRewardSelect.value);
    fetchAndRender(lastTickets);
  });

  fetch('/api/model')
    .then(function (r) { return r.json(); })
    .then(function (data) {
      ladder = data.ladder;
      allRewards = data.rewards;

      elRewardSelect.innerHTML = '';
      Object.keys(allRewards).forEach(function (key) {
        var opt = document.createElement('option');
        opt.value = key; opt.textContent = allRewards[key].meta.label;
        elRewardSelect.appendChild(opt);
      });
      elRewardSelect.value = 'rubies';
      applyRewardUi('rubies');

      lastTickets = W.initTicketInputs(function (tickets) { lastTickets = tickets; fetchAndRender(tickets); });
      fetchAndRender(lastTickets);
    });
})();
