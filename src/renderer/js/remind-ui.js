// What she does in her chat with the reminders she keeps (reminders.js has the list and reads the
// words; this is the talking and the buttons):
//  - the same reminder asked for twice: she asks what to do (replace it, add the time, take the time
//    off, leave it, cancel it, or keep both)
//  - "show my reminders": a list that's easy to read, with a button for each, to change the time,
//    push it, or cancel it, and one to clear them all
//  - "change it to 30 seconds", "add 5 minutes", "cancel the water one", "cancel number 2"
// Her lines are in Thai and English; any other language gets the English.

import { clock, parseRemindOps, parseTarget, spanText, everyText } from './reminders.js';

const fmt = (text, vars = {}) => String(text).replace(/\{(\w+)\}/g, (m, k) => (vars[k] ?? m));

const RT = {
  th: {
    empty: 'ตอนนี้ยังไม่มีแจ้งเตือนที่ตั้งไว้เลยค่ะ ว่างโล่งเลย',
    header: 'แจ้งเตือนที่ตั้งไว้ {n} รายการค่ะ',
    more: '…และอีก {n} รายการ',
    hint: 'กดปุ่มเลขเพื่อจัดการ หรือพิมพ์สั่งได้เลย เช่น "เปลี่ยนข้อ 2 เป็น 30 วินาที", "ยกเลิกเตือนข้อ 3"',
    left: 'อีก {span}', due: 'ถึงเวลาแล้ว', noText: '(ไม่ได้ระบุ)',
    clearAll: 'ลบทั้งหมด', clearAsk: 'จะลบแจ้งเตือนทั้ง {n} รายการจริง ๆ เหรอคะ?', yes: 'ลบเลย', no: 'ไม่เอา',
    cleared: 'ลบแจ้งเตือนทั้งหมดแล้วค่ะ', kept: 'โอเค เก็บไว้ทั้งหมดค่ะ',
    item: '{row}\nจะให้ทำยังไงดีคะ?',
    edit: 'แก้เวลา', plus: '+10 นาที', cancel: 'ยกเลิก', back: 'กลับ', showList: 'ดูตาราง',
    editAsk: 'จะให้เตือน “{text}” อีกนานเท่าไหร่ หรือกี่โมงคะ? พิมพ์ได้เลย เช่น 30 วินาที, 5 นาที, 1 ชม. หรือ 18:30',
    edited: 'เปลี่ยนเป็น {time} ({left}) แล้วค่ะ',
    shifted: 'ปรับเป็น {time} ({left}) แล้วค่ะ',
    removed: 'ยกเลิก “{text}” ให้แล้วค่ะ',
    notFound: 'หาแจ้งเตือนอันนั้นไม่เจอค่ะ ลองดูตารางก่อนนะ',
    which: 'อันไหนคะ? ดูตารางแล้วบอกเลขข้อได้เลย',
    dupe: 'มี “{text}” ตั้งไว้อยู่แล้วนะคะ (เตือน {time}, {left}) ครั้งนี้สั่งอีก {span} จะให้ทำยังไงดี?',
    replace: 'แทนอันเดิม', plusN: 'บวกเพิ่ม {span}', minusN: 'ลดออก {span}', keep: 'ไม่ต้องทำอะไร', dropOld: 'ยกเลิกอันเดิม', both: 'เก็บทั้งสอง',
    dReplaced: 'แทนอันเดิมแล้วค่ะ เตือน {time} ({left})',
    dPlus: 'บวกเพิ่ม {span} เป็น {time} แล้วค่ะ',
    dMinus: 'ลดออก {span} เหลือ {time} แล้วค่ะ',
    dKeep: 'โอเค ปล่อยไว้ตามเดิมค่ะ เตือน {time}',
    dDrop: 'ยกเลิกอันเดิมให้แล้วค่ะ ไม่ได้ตั้งใหม่นะ',
    dBoth: 'ตั้งเพิ่มอีกอันแล้วค่ะ เตือน {time}',
  },
  en: {
    empty: 'You have no reminders set right now.',
    header: 'You have {n} reminder(s) set:',
    more: '…and {n} more',
    hint: 'Tap a number to manage it, or just type, like "change number 2 to 30 seconds" or "cancel number 3".',
    left: 'in {span}', due: 'due now', noText: '(no text)',
    clearAll: 'Clear all', clearAsk: 'Really delete all {n} reminders?', yes: 'Delete', no: 'Keep them',
    cleared: 'All reminders deleted.', kept: 'Okay, keeping them all.',
    item: '{row}\nWhat do you want to do?',
    edit: 'Change time', plus: '+10 min', cancel: 'Cancel it', back: 'Back', showList: 'Show list',
    editAsk: 'When should I remind you about "{text}"? Type it: 30 seconds, 5 minutes, 1 hour, or 6:30 pm.',
    edited: 'Changed to {time} ({left}).',
    shifted: 'Moved to {time} ({left}).',
    removed: 'Cancelled "{text}".',
    notFound: 'I can\'t find that reminder. Have a look at the list first.',
    which: 'Which one? Look at the list and tell me its number.',
    dupe: 'You already have "{text}" set ({time}, {left}). This time you asked for {span}. What should I do?',
    replace: 'Replace it', plusN: 'Add {span}', minusN: 'Take off {span}', keep: 'Do nothing', dropOld: 'Cancel the old one', both: 'Keep both',
    dReplaced: 'Replaced. I\'ll remind you at {time} ({left}).',
    dPlus: 'Added {span}: now {time}.',
    dMinus: 'Took off {span}: now {time}.',
    dKeep: 'Okay, left as it was ({time}).',
    dDrop: 'Cancelled the old one, and didn\'t set a new one.',
    dBoth: 'Set another one for {time}.',
  },
};

const short = (s, n = 10) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

export class RemindUI {
  constructor(chat) {
    this.chat = chat;
    this.last = { id: null, at: 0 }; // the one you've just set or touched: "change it to 30 seconds"
    this.order = [];                 // the ids in the list she showed you last: "number 2"
    this.editing = null;             // { id, until }: she asked what the new time is
  }

  get lang() { return this.chat.brain.lang; }
  get R() { return RT[this.lang] || RT.en; }
  get store() { return this.chat.reminders; }

  note(id) {
    this.last = { id, at: Date.now() };
  }

  // Your message, if it's about the reminders she keeps: an op for run(), else null.
  parse(text, count = 0) {
    const e = this.editing;
    if (e && Date.now() < e.until && count <= 8) {
      const at = parseTarget(text);
      if (at && at > Date.now()) return { op: 'edit', mode: 'set', at, id: e.id };
    }
    const recent = this.last.id && Date.now() - this.last.at < 10 * 60 * 1000 && this.store?.list.some((r) => r.id === this.last.id);
    const op = parseRemindOps(text, { recent: Boolean(recent) });
    if (!op) return null;
    // "change the song to 30 seconds": no word of reminders and nothing of that name: not ours
    if (op.query && !this.find(op) && !/แจ้งเตือน|เตือน|remind|alarm|timer|rappel|recordatorio|lembrete|напомин|таймер/i.test(text)) return null;
    return op;
  }

  // the reminder an op means, or null
  find(op) {
    const list = this.store.upcoming;
    if (op.id) return list.find((r) => r.id === op.id) || null;
    if (op.index) {
      const id = this.order[op.index - 1];
      return list.find((r) => r.id === id) || list[op.index - 1] || null;
    }
    if (op.query) {
      const q = op.query.toLowerCase();
      return list.find((r) => (r.text || '').toLowerCase().includes(q)) || null;
    }
    const last = list.find((r) => r.id === this.last.id);
    if (last) return last;
    return list.length === 1 ? list[0] : null;
  }

  // her line, with buttons (menu: { actions, onAction }) if any
  say(line, face = 'smug', menu = null) {
    const { chat } = this;
    if (!chat.open) return;
    chat.panel.setFace(face);
    chat.panel.stream(line, { done: true });
    chat.remember({ role: 'assistant', content: line });
    chat.panel.setActions(menu?.actions || [], menu?.onAction || null);
  }

  row(r, i) {
    const R = this.R;
    const ms = r.at - Date.now();
    const left = ms > 1000 ? fmt(R.left, { span: spanText(ms, this.lang) }) : R.due;
    const every = r.every ? ` · ${everyText(r.every, this.lang)}` : '';
    return `${i}. ${clock(r.at, this.lang)} (${left})${every} — ${r.text || R.noText}`;
  }

  // ── what she does ──────────────────────────────────────────────────────────────────────────────
  run(op) {
    const R = this.R;
    if (op.op === 'list') return this.list();
    if (op.op === 'clear') {
      const n = this.store.list.length;
      if (!n) return { line: R.empty, face: 'smug' };
      return this.confirmClear(n);
    }
    const r = this.find(op);
    if (!r) {
      if (!this.store.list.length) return { line: R.empty, face: 'aside' };
      return { line: op.index || op.query ? R.notFound : R.which, face: 'aside' };
    }
    if (op.op === 'cancel') {
      this.store.remove(r.id);
      return { line: fmt(R.removed, { text: r.text || R.noText }), face: 'smug', menu: this.listButton() };
    }
    if (op.op === 'edit') {
      let at;
      if (op.mode === 'add') at = this.store.shift(r.id, op.ms);
      else if (op.mode === 'sub') at = this.store.shift(r.id, -op.ms);
      else {
        at = Math.max(Date.now() + 5000, op.at);
        this.store.setAt(r.id, at);
      }
      this.editing = null;
      this.note(r.id);
      return { line: fmt(op.mode === 'set' ? R.edited : R.shifted, { time: clock(at, this.lang), left: spanText(at - Date.now(), this.lang) }), face: 'smug', menu: this.listButton() };
    }
    return null;
  }

  listButton() {
    const R = this.R;
    return { actions: [{ id: 'list', label: R.showList }], onAction: () => this.say(...this.pair(this.list())) };
  }

  // the list, easy to read: one line each, a button for each (up to 5)
  list() {
    const R = this.R;
    const rs = this.store.upcoming;
    this.order = rs.map((r) => r.id);
    if (!rs.length) return { line: R.empty, face: 'smug' };
    const shown = rs.slice(0, 8);
    const lines = shown.map((r, i) => this.row(r, i + 1));
    if (rs.length > shown.length) lines.push(fmt(R.more, { n: rs.length - shown.length }));
    const line = `${fmt(R.header, { n: rs.length })}\n${lines.join('\n')}\n\n${R.hint}`;
    const actions = rs.slice(0, 5).map((r, i) => ({ id: `i:${r.id}`, label: `${i + 1}. ${short(r.text || R.noText)}` }));
    actions.push({ id: 'all', label: R.clearAll });
    return {
      line,
      face: 'smug',
      menu: {
        actions,
        onAction: (id) => {
          if (id === 'all') return this.say(...this.pair(this.confirmClear(this.store.list.length)));
          if (id.startsWith('i:')) this.item(id.slice(2));
        },
      },
    };
  }

  pair(done) {
    return [done.line, done.face, done.menu];
  }

  confirmClear(n) {
    const R = this.R;
    return {
      line: fmt(R.clearAsk, { n }),
      face: 'aside',
      menu: {
        actions: [{ id: 'yes', label: R.yes, primary: true }, { id: 'no', label: R.no }],
        onAction: (id) => {
          if (id === 'yes') {
            this.store.removeAll();
            this.say(R.cleared, 'smug');
          } else {
            this.say(R.kept, 'smug', this.listButton());
          }
        },
      },
    };
  }

  // one of them: change its time, push it ten minutes, cancel it
  item(id) {
    const R = this.R;
    const r = this.store.list.find((x) => x.id === id);
    if (!r) return this.say(R.notFound, 'aside', this.listButton());
    const i = this.order.indexOf(id) + 1 || 1;
    this.say(fmt(R.item, { row: this.row(r, i) }), 'look', {
      actions: [
        { id: 'edit', label: R.edit, primary: true },
        { id: 'plus', label: R.plus },
        { id: 'cancel', label: R.cancel },
        { id: 'back', label: R.back },
      ],
      onAction: (act) => {
        if (act === 'back') return this.say(...this.pair(this.list()));
        if (act === 'edit') {
          this.editing = { id, until: Date.now() + 3 * 60 * 1000 };
          return this.say(fmt(R.editAsk, { text: r.text || R.noText }), 'look');
        }
        if (act === 'plus') {
          const at = this.store.shift(id, 10 * 60 * 1000);
          this.note(id);
          return this.say(fmt(R.shifted, { time: clock(at, this.lang), left: spanText(at - Date.now(), this.lang) }), 'smug', this.listButton());
        }
        this.store.remove(id);
        return this.say(fmt(R.removed, { text: r.text || R.noText }), 'smug', this.listButton());
      },
    });
    return undefined;
  }

  // The same reminder, asked for again: what to do. asked: { at, text, every }
  dupe(old, asked) {
    const R = this.R;
    const span = Math.max(1000, asked.at - Date.now());
    const sp = spanText(span, this.lang);
    const left = spanText(old.at - Date.now(), this.lang);
    const line = fmt(R.dupe, { text: old.text || R.noText, time: clock(old.at, this.lang), left: fmt(R.left, { span: left }), span: sp });
    const done = (text, vars) => this.say(fmt(text, { time: clock(vars.at, this.lang), left: spanText(vars.at - Date.now(), this.lang), span: sp }), 'smug');
    return {
      line,
      face: 'aside',
      menu: {
        actions: [
          { id: 'replace', label: R.replace, primary: true },
          { id: 'plus', label: fmt(R.plusN, { span: sp }) },
          { id: 'minus', label: fmt(R.minusN, { span: sp }) },
          { id: 'keep', label: R.keep },
          { id: 'drop', label: R.dropOld },
          { id: 'both', label: R.both },
        ],
        onAction: (id) => {
          const store = this.store;
          if (!store.list.some((r) => r.id === old.id) && id !== 'both' && id !== 'replace') return this.say(R.notFound, 'aside');
          if (id === 'replace') {
            store.remove(old.id);
            const r = store.add(asked.at, asked.text, asked.every);
            this.note(r.id);
            return done(R.dReplaced, { at: r.at });
          }
          if (id === 'plus') {
            const at = store.shift(old.id, span);
            this.note(old.id);
            return done(R.dPlus, { at });
          }
          if (id === 'minus') {
            const at = store.shift(old.id, -span);
            this.note(old.id);
            return done(R.dMinus, { at });
          }
          if (id === 'drop') {
            store.remove(old.id);
            return this.say(R.dDrop, 'smug');
          }
          if (id === 'both') {
            const r = store.add(asked.at, asked.text, asked.every);
            this.note(r.id);
            return done(R.dBoth, { at: r.at });
          }
          return done(R.dKeep, { at: old.at });
        },
      },
    };
  }
}
