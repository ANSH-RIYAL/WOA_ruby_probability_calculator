window.WOA = (function () {
  "use strict";

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

  function getStoredTickets(fallback) {
    try {
      var v = parseInt(localStorage.getItem('woa_tickets'), 10);
      return isNaN(v) ? fallback : v;
    } catch (e) { return fallback; }
  }

  function setStoredTickets(v) {
    try { localStorage.setItem('woa_tickets', String(v)); } catch (e) { /* ignore */ }
  }

  // Wires the shared #tickets number input + #ticketsRange slider, restores
  // the last value from localStorage, and calls onChange(tickets) whenever
  // either control changes (debounced).
  function initTicketInputs(onChange, debounceMs) {
    var num = document.getElementById('tickets');
    var range = document.getElementById('ticketsRange');
    var timer = null;

    var initial = getStoredTickets(parseInt(num.value, 10) || 2000);
    num.value = initial;
    range.value = Math.min(parseInt(range.max, 10) || 20000, Math.max(0, initial));

    function fire(immediate) {
      var v = Math.max(0, parseInt(num.value, 10) || 0);
      setStoredTickets(v);
      clearTimeout(timer);
      if (immediate) { onChange(v); return; }
      timer = setTimeout(function () { onChange(v); }, debounceMs || 250);
    }

    num.addEventListener('input', function () {
      range.value = Math.min(parseInt(range.max, 10) || 20000, Math.max(0, parseInt(num.value, 10) || 0));
      fire(false);
    });
    range.addEventListener('input', function () {
      num.value = range.value;
      fire(false);
    });

    return initial;
  }

  function svgEl(tag, attrs) {
    var e = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    return e;
  }

  function renderLadder(tbody, ladder, boxesPerTier, rewardMeta) {
    tbody.innerHTML = '';
    ladder.forEach(function (t, i) {
      var range = t.end === null ? (fmt(t.start) + '+') : (fmt(t.start) + '–' + fmt(t.end));
      var boxes = boxesPerTier ? boxesPerTier[i] : 0;
      var rt = rewardMeta ? rewardMeta.per_tier[i] : null;
      var odds = rt ? ('1 in ' + fmt(Math.round(1 / rt.p))) : '—';
      var amount = rt ? fmt(rt.amount) : '—';
      var tr = document.createElement('tr');
      if (boxes > 0) tr.className = 'active';
      tr.innerHTML = '<td>' + t.tier + '</td><td>' + range + '</td><td>' + amount +
        '</td><td>' + odds + '</td><td>' + fmt(boxes) + '</td>';
      tbody.appendChild(tr);
    });
  }

  return {
    fmt: fmt, fmtCompact: fmtCompact, fmtPct: fmtPct,
    getStoredTickets: getStoredTickets, setStoredTickets: setStoredTickets,
    initTicketInputs: initTicketInputs, svgEl: svgEl, renderLadder: renderLadder
  };
})();
