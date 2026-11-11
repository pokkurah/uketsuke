/* ポックル QR受付 通信部（本番：Apps Script／試験：このブラウザ内だけで動くモック） */
(function () {
  var CFG = window.RCP_CONFIG || {};
  var MOCK = !CFG.API_URL || CFG.API_URL === 'mock';

  function remote(method, params) {
    if (method === 'GET') {
      return fetch(CFG.API_URL + '?' + new URLSearchParams(params).toString(), { cache: 'no-store' })
        .then(function (r) { return r.json(); });
    }
    return fetch(CFG.API_URL, {
      method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(params)
    }).then(function (r) { return r.json(); });
  }

  /* ---- モック（サーバーと同じルール） ---- */
  var MK = 'rcp_mock_db', MOCK_KEY = 'test';
  function today() { return new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10); }
  function load() {
    var d; try { d = JSON.parse(localStorage.getItem(MK)); } catch (e) { }
    d = d || { rows: [], delay: 0, delayAt: 0 };
    d.rows = d.rows.filter(function (r) { return r.date === today(); });
    return d;
  }
  function save(d) { localStorage.setItem(MK, JSON.stringify(d)); }
  function rid() { return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-6); }
  function delayNow(d) { return d.delay && Date.now() - d.delayAt < 3600e3 ? d.delay : 0; }
  function find(d, id) { return d.rows.filter(function (r) { return r.id === id; })[0]; }
  function digits(s, n) { return String(s || '').replace(/[^0-9]/g, '').slice(0, n); }
  function mock(p) {
    var d = load(), r;
    try {
      if (p.action !== 'public' && p.action !== 'status' && p.action !== 'checkin' && p.k !== MOCK_KEY) throw 'auth';
      switch (p.action) {
        case 'public': return { ok: true, delay: delayNow(d) };
        case 'checkin':
          var card = digits(p.card, 5), phone = digits(p.phone, 11);
          if (!p.cat || !p.wait) throw '入力が足りません';
          if (!card) throw '診察券番号を入力してください';
          var dup = d.rows.filter(function (x) { return x.card === card && ['new', 'accepted', 'called'].indexOf(x.status) >= 0; })[0];
          if (dup) return { ok: true, id: dup.id, dup: true, delay: delayNow(d) };
          if (p.wait === 'car' && !p.car) throw '車種を入力してください';
          if (p.cat !== 'reserved' && !p.agree) throw '待ち時間・料金の確認が必要です';
          r = { id: rid(), date: today(), createdAt: Date.now(), cat: p.cat, card: card, phone: card ? '' : phone,
            owner: String(p.owner || '').slice(0, 20), pet: String(p.pet || '').slice(0, 20), wait: p.wait,
            car: p.wait === 'car' ? String(p.car).slice(0, 30) : '', status: 'new', room: '', calledAt: 0,
            calledBy: '', acceptedAt: 0, enteredAt: 0 };
          d.rows.push(r); save(d);
          return { ok: true, id: r.id, delay: delayNow(d) };
        case 'status':
          r = find(d, p.id);
          if (!r) return { ok: false, err: 'notfound', delay: delayNow(d) };
          return { ok: true, status: r.status, room: r.room, wait: r.wait, cat: r.cat, card: r.card, owner: r.owner, pet: r.pet,
            car: r.car, createdAt: r.createdAt, delay: delayNow(d) };
        case 'board':
          return { ok: true, delay: delayNow(d), delayAt: d.delayAt, now: Date.now(),
            rows: d.rows.filter(function (x) {
              return x.status !== 'entered' && x.status !== 'cancelled' && !(x.wait === 'inside' && x.status === 'accepted');
            }) };
        case 'setDelay': d.delay = Number(p.min) || 0; d.delayAt = Date.now(); save(d); return { ok: true, delay: d.delay };
      }
      r = find(d, p.id); if (!r) throw '見つかりません';
      if (p.action === 'call') {
        if (!/^[1-5]$/.test(String(p.room))) throw '診察室を選んでください';
        if (r.status === 'called') return { ok: false, err: 'already', room: r.room };
        if (r.status === 'entered' || r.status === 'cancelled') return { ok: false, err: 'closed' };
        r.status = 'called'; r.room = String(p.room); r.calledAt = Date.now(); r.calledBy = p.by || '';
      } else if (p.action === 'accept' && r.status === 'new') { r.status = 'accepted'; r.acceptedAt = Date.now(); }
      else if (p.action === 'uncall' && r.status === 'called') { r.status = 'accepted'; r.room = ''; r.calledAt = 0; }
      else if (p.action === 'enter') { r.status = 'entered'; r.enteredAt = Date.now(); }
      else if (p.action === 'cancel') { r.status = 'cancelled'; }
      save(d); return { ok: true };
    } catch (e) { return { ok: false, err: String(e) }; }
  }

  window.RCP = {
    isMock: MOCK,
    get: function (params) { return MOCK ? Promise.resolve(mock(params)) : remote('GET', params); },
    post: function (params) { return MOCK ? Promise.resolve(mock(params)) : remote('POST', params); }
  };
})();
