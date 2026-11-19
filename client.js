/**
 * Client half of the dsh-interpreter bundle.
 *
 * Contributes one block under every finished Turn: the 「速览」 rewrite of the
 * answer, requested from the Host route on mount. The original answer above is
 * untouched; the block only adds a readable copy beside it.
 */
window.__ModuleLoader__.load({
  id: 'dsh-interpreter',
  factory(require) {
    const React = require('react');
    const { createElement: h, useEffect, useMemo, useState } = React;

    /** Host route that owns the rewrite model call. */
    const ROUTE = '/interpreter/rewrite';
    /** Host routes behind the model picker. */
    const MODELS = '/interpreter/models';
    const CONFIG = '/interpreter/config';

    /** Raised surface, same idiom as the tool-call cards above it. */
    const CARD = {
      marginTop: 14, padding: '12px 16px 14px', borderRadius: 10,
      background: 'var(--dsw-alias-bg-layer-1, rgba(128,128,128,0.08))',
      lineHeight: 1.78, wordBreak: 'break-word',
    };
    /** The name of this block; renaming the feature starts and ends here. */
    const NAME = '速览';
    /** Same measure as the answer above: a narrower column reads as a cramped box. */
    const BODY = { marginTop: 14 };
    /** An untouched Turn in manual mode only offers the entry point: no card, no paint. */
    const BARE = { marginTop: 14, padding: '2px 0' };
    const HEAD = { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' };
    const SPACER = { flex: 1 };
    /** The same voice as the Turn header above it: big enough to scan, not bold. */
    const DISCLOSURE = {
      display: 'inline-flex', alignItems: 'center', gap: 6, padding: 0,
      border: 0, background: 'transparent', cursor: 'pointer',
      fontSize: 15, fontWeight: 400, lineHeight: 1.4,
      color: 'var(--dsw-alias-label-secondary, inherit)',
    };
    /**
     * One chevron for every trigger. Drawn in an svg because a rotated border box
     * keeps its ink off the middle, which is what made the old one look off-centre.
     */
    const CHEVRON = { flex: '0 0 auto', display: 'block', transition: 'transform 120ms ease' };
    const ACTION = {
      fontSize: 12, padding: 0, border: 0, cursor: 'pointer', background: 'transparent',
      color: 'var(--dsw-alias-label-secondary, inherit)',
    };
    const MUTED = { fontSize: 12, color: 'var(--dsw-alias-label-secondary, inherit)' };
    /**
     * Waiting speaks in DSH's own voice — the blue of 「深度求索中」 with the light
     * running along the words — instead of a dead 「整理中…」. The two stops are the
     * colours sampled from that label.
     */
    const PULSE = {
      display: 'inline-block', fontSize: 14, lineHeight: 1.6,
      backgroundImage: 'linear-gradient(90deg, #3c4790 0%, #8abcfe 45%, #3c4790 90%)',
      backgroundSize: '250% 100%', backgroundRepeat: 'no-repeat',
      backgroundClip: 'text', WebkitBackgroundClip: 'text', color: 'transparent',
      animation: 'ra-pulse 1.8s linear infinite',
    };
    const PULSE_CSS = '@keyframes ra-pulse{from{background-position:100% 0}to{background-position:0% 0}}';
    /** Quiet until the pointer arrives: an icon carries no more meaning in full ink. */
    const ICON_BUTTON = {
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      width: 22, height: 22, padding: 0, border: 0, borderRadius: 6,
      background: 'transparent', cursor: 'pointer',
      color: 'var(--dsw-alias-label-secondary, inherit)',
      opacity: 0.4, transition: 'opacity 120ms ease',
    };
    /** The closing line of the block holds nothing but that icon. */
    const FOOT = { display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 8, marginTop: 2 };
    /** What one rewrite cost, small enough to sit beside the icon. */
    const COST = {
      fontSize: 11, fontVariantNumeric: 'tabular-nums', opacity: 0.75,
      color: 'var(--dsw-alias-label-secondary, inherit)',
    };
    /** A menu trigger keeps its label whether the card is open or not. */
    const ACTION_TRIGGER = { ...ACTION, display: 'inline-flex', alignItems: 'center', gap: 5 };
    /** A sentence inside a menu card, where an item would sit. */    const MENU_TEXT = {
      padding: '7px 10px', fontSize: 13, lineHeight: 1.6,
      color: 'var(--dsw-alias-label-secondary, inherit)',
    };
    /** The three states the Host stores. The menu only names the scope, in the same three words. */
    const MODE_LABEL = { global: '全部', session: '本会话', manual: '手动' };
    const MODE_MENU = [
      { value: 'global', label: '全部' },
      { value: 'session', label: '本会话' },
      { value: 'manual', label: '手动' },
    ];
    /** Anchors a menu card to the control that opens it. */
    const PICKER = { position: 'relative', display: 'inline-flex' };
    const TRIGGER = {
      display: 'inline-flex', alignItems: 'center', gap: 5, maxWidth: 230,
      fontSize: 12, padding: 0, border: 0, cursor: 'pointer',
      background: 'transparent', color: 'var(--dsw-alias-label-secondary, inherit)',
    };
    const TRIGGER_TEXT = { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' };
    /** The menu card: one flat layer above the block, no border, an elevation shadow. */
    const MENU = {
      position: 'absolute', top: 'calc(100% + 6px)', right: 0,
      minWidth: 190, maxWidth: 320, maxHeight: 260, overflowY: 'auto',
      padding: 4, borderRadius: 12,
      // Opaque on purpose. The native fill is rgba(48,49,54,0.64) — 64% of a blue-cast
      // grey — and laying it over anything here turned the whole card a shade bluer
      // than the surfaces around it. One step of the neutral ladder stays neutral.
      background: 'var(--dsw-alias-bg-layer-2, #2c2c2e)',
      boxShadow: 'var(--dsw-elevation-prominent, 0 8px 24px rgba(0,0,0,0.28))',
    };
    /** A row stays quiet until something points at it; only the one in force is in full ink. */
    const ITEM = {
      display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left',
      fontSize: 13, padding: '7px 10px', border: 0, borderRadius: 'var(--dsw-radius-md, 8px)',
      background: 'transparent', cursor: 'pointer',
      color: 'var(--dsw-alias-label-secondary, inherit)',
    };
    const ITEM_TEXT = { flex: '1 1 auto', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' };
    /** Every row reserves the same corner for the check, so widening never shifts the card. */
    const CHECK_SLOT = {
      flex: '0 0 12px', display: 'inline-flex',
      alignItems: 'center', justifyContent: 'center',
    };
    const ITEM_HOVER = {
      background: 'var(--dsw-alias-interactive-bg-hover, rgba(128,128,128,0.16))',
      color: 'var(--dsw-alias-label-primary, inherit)',
    };
    const ITEM_ON = { fontWeight: 600, color: 'var(--dsw-alias-label-primary, inherit)' };
    /** The opening sentence is the point of the whole block, so it gets a step up. */
    const LEAD = { margin: '0 0 12px', fontSize: 15, lineHeight: 1.7 };
    const PARAGRAPH = { margin: '0 0 12px' };
    const LIST = { margin: '0 0 12px', paddingLeft: 20 };
    const BULLET_ITEM = { marginBottom: 6 };
    const H = { fontSize: 15, fontWeight: 600, margin: '16px 0 8px' };
    const PRE = {
      margin: '0 0 12px', padding: '10px 12px',
      background: 'var(--dsw-alias-bg-layer-2, rgba(128,128,128,0.13))',
      borderRadius: 6, overflowX: 'auto', fontSize: 13, lineHeight: 1.6,
    };
    const CODE = {
      padding: '1px 5px', borderRadius: 4,
      background: 'var(--dsw-alias-bg-layer-2, rgba(128,128,128,0.15))', fontSize: '0.9em',
    };
    const QUOTE = {
      margin: '0 0 12px', paddingLeft: 12,
      borderLeft: '2px solid var(--dsw-alias-border-l2, rgba(128,128,128,0.3))',
      color: 'var(--dsw-alias-label-secondary, inherit)',
    };
    const TABLE_WRAP = { margin: '0 0 14px', overflowX: 'auto' };
    const TABLE_BOX = { borderCollapse: 'collapse', fontSize: 13.5, lineHeight: 1.6 };
    /** Small, quiet header; hairline rows keep a wide table scannable. */
    const TH = {
      textAlign: 'left', fontSize: 12, fontWeight: 600, letterSpacing: '0.03em',
      color: 'var(--dsw-alias-label-secondary, inherit)',
      padding: '0 24px 7px 0',
      borderBottom: '1px solid var(--dsw-alias-border-l1, rgba(128,128,128,0.3))',
    };
    const TD = {
      padding: '9px 24px 9px 0', verticalAlign: 'top',
      borderBottom: '1px solid var(--dsw-alias-border-l1, rgba(128,128,128,0.18))',
    };

    const INLINE = /(\*\*[^*\n]+\*\*|`[^`\n]+`|\[[^\]\n]+\]\([^)\s]+\)|\*[^*\n]+\*)/g;
    const FENCE = /^```\s*[\w+-]*\s*$/;
    const HEADING = /^(#{1,6})\s+(.*)$/;
    const BULLET = /^\s*[-*+]\s+/;
    const ORDERED = /^\s*\d+[.)]\s+/;
    const QUOTED = /^>\s?/;
    const RULE = /^\s*(-{3,}|\*{3,})\s*$/;
    /** Lines that start a block of their own instead of continuing a paragraph. */
    const SPECIAL = /^(#{1,6}\s|```|>|\s*[-*+]\s+|\s*\d+[.)]\s+|\s*\|)/;
    /** A table row, and the separator row that follows a header. */
    const TABLE = /^\s*\|/;
    const SEPARATOR = /^\s*\|?[\s:|-]*-[\s:|-]*\|?\s*$/;

    /**
     * Split one inline run into text, code, bold, italic and link nodes.
     * @param text - the raw run.
     * @param prefix - node key prefix.
     */
    function inline(text, prefix) {
      const out = [];
      let last = 0;
      let match;
      INLINE.lastIndex = 0;
      while ((match = INLINE.exec(text)) !== null) {
        if (match.index > last) out.push(text.slice(last, match.index));
        const token = match[0];
        const key = `${prefix}-${match.index}`;
        if (token.startsWith('**')) out.push(h('strong', { key }, token.slice(2, -2)));
        else if (token.startsWith('`')) out.push(h('code', { key, style: CODE }, token.slice(1, -1)));
        else if (token.startsWith('[')) {
          const link = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(token);
          out.push(h('a', { key, href: link[2], target: '_blank', rel: 'noreferrer' }, link[1]));
        } else out.push(h('em', { key }, token.slice(1, -1)));
        last = match.index + token.length;
      }
      if (last < text.length) out.push(text.slice(last));
      return out;
    }

    /**
     * Fold the rewrite Markdown into paragraph, list, heading and code blocks.
     * @param source - the Markdown text.
     */
    function blocks(source) {
      const lines = source.replace(/\r\n?/g, '\n').split('\n');
      const out = [];
      let index = 0;
      while (index < lines.length) {
        const line = lines[index];
        if (line.trim() === '') { index += 1; continue; }
        if (FENCE.test(line)) {
          const code = [];
          index += 1;
          while (index < lines.length && !FENCE.test(lines[index])) { code.push(lines[index]); index += 1; }
          index += 1;
          out.push({ kind: 'code', text: code.join('\n') });
          continue;
        }
        const heading = HEADING.exec(line);
        if (heading !== null) {
          out.push({ kind: 'heading', level: heading[1].length, text: heading[2] });
          index += 1;
          continue;
        }
        if (RULE.test(line)) { out.push({ kind: 'rule' }); index += 1; continue; }
        if (BULLET.test(line) || ORDERED.test(line)) {
          const ordered = ORDERED.test(line);
          const items = [];
          while (index < lines.length && (ordered ? ORDERED : BULLET).test(lines[index])) {
            items.push(lines[index].replace(ordered ? ORDERED : BULLET, ''));
            index += 1;
          }
          out.push({ kind: 'list', ordered, items });
          continue;
        }
        if (QUOTED.test(line)) {
          const quoted = [];
          while (index < lines.length && QUOTED.test(lines[index])) {
            quoted.push(lines[index].replace(QUOTED, ''));
            index += 1;
          }
          out.push({ kind: 'quote', text: quoted.join('\n') });
          continue;
        }
        if (TABLE.test(line)) {
          // Keep it a table: the original may use one, and a folded list reads worse.
          const rows = [];
          let head = null;
          while (index < lines.length && TABLE.test(lines[index])) {
            const row = lines[index];
            index += 1;
            if (SEPARATOR.test(row)) {
              if (head === null && rows.length === 1) head = rows.pop();
              continue;
            }
            const cells = row
              .replace(/^\s*\|/, '')
              .replace(/\|\s*$/, '')
              .split('|')
              .map((cell) => cell.trim());
            rows.push(cells);
          }
          if (rows.length > 0 || head !== null) out.push({ kind: 'table', head, rows });
          continue;
        }
        const paragraph = [];
        while (index < lines.length && lines[index].trim() !== '' && !SPECIAL.test(lines[index])) {
          paragraph.push(lines[index]);
          index += 1;
        }
        if (paragraph.length === 0) { out.push({ kind: 'paragraph', text: line }); index += 1; continue; }
        out.push({ kind: 'paragraph', text: paragraph.join('\n') });
      }
      return out;
    }

    /** Render one parsed block. */
    function renderBlock(block, at) {
      const key = `b${at}`;
      if (block.kind === 'heading') return h('div', { key, style: H }, inline(block.text, key));
      if (block.kind === 'code') return h('pre', { key, style: PRE }, h('code', null, block.text));
      if (block.kind === 'list') {
        const children = block.items.map((item, i) => h('li', { key: `i${i}`, style: BULLET_ITEM }, inline(item, `${key}-${i}`)));
        return h(block.ordered ? 'ol' : 'ul', { key, style: LIST }, children);
      }
      if (block.kind === 'quote') return h('blockquote', { key, style: QUOTE }, inline(block.text, key));
      if (block.kind === 'table') {
        const rows = block.rows.map((cells, r) => h('tr', { key: `r${r}` },
          cells.map((cell, c) => h('td', { key: `c${c}`, style: TD }, inline(cell, `${key}-${r}-${c}`)))));
        if (block.head !== null) {
          rows.unshift(h('tr', { key: 'h' },
            block.head.map((cell, c) => h('th', { key: `c${c}`, style: TH }, inline(cell, `${key}-h-${c}`)))));
        }
        return h('div', { key, style: TABLE_WRAP }, h('table', { style: TABLE_BOX }, h('tbody', null, rows)));
      }
      if (block.kind === 'rule') return h('hr', { key, style: { border: 0, borderTop: '1px solid var(--dsw-alias-border-l1, rgba(128,128,128,0.25))', margin: '14px 0' } });
      return h('p', { key, style: at === 0 ? LEAD : PARAGRAPH }, inline(block.text, key));
    }

    /** Ask the Host for the readable rewrite of one finished Turn. */
    function requestRewrite(sessionId, seq, force) {
      return fetch(ROUTE, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sessionId, seq, force }),
      }).then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      });
    }

    /** Provider errors are too technical to show as-is. */
    function readableError(message) {
      return /UNKNOWN_MODEL|no configured model/i.test(message) ? '这个模型现在用不了，点「模型」换一个' : message;
    }

    /** Read the selectable models and the one in force. */
    function requestModels() {
      return fetch(MODELS).then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      });
    }

    /** Remember a new rewrite model. */
    function saveModel(provider, model) {
      return fetch(CONFIG, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ provider, model }),
      }).then((response) => response.json());
    }

    /** Ask the Host when a new answer should get a block. */
    function requestGate() {
      return fetch(CONFIG).then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      });
    }

    /** Remember the chosen mode, and which Sessions opted in. */
    function saveGate(mode, sessions) {
      return fetch(CONFIG, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ mode, sessions }),
      }).then((response) => response.json());
    }

    /** 12431 is harder to take in at a glance than 12.4k. */
    function formatTokens(count) {
      if (typeof count !== 'number' || !Number.isFinite(count) || count <= 0) return '';
      if (count < 1000) return String(count);
      return `${Math.round((count / 1000) * 10) / 10}k`;
    }

    /** The mark that says which row is in force, without a sentence saying so. */
    function CheckIcon() {
      return h('svg', {
        width: 12, height: 12, viewBox: '0 0 24 24', fill: 'none',
        stroke: 'currentColor', strokeWidth: 2.5,
        strokeLinecap: 'round', strokeLinejoin: 'round',
        'aria-hidden': 'true',
      }, h('path', { d: 'M20 6 9 17l-5-5' }));
    }

    /**
     * The lowest point a floating card may reach. Below it sits the composer, which
     * paints over the log, so a card that crosses this line would come out cut off.
     * @param element - the trigger that is about to open a card.
     * @returns that edge, in viewport coordinates.
     */
    function logBottom(element) {
      let limit = window.innerHeight;
      // The composer is the box the reader types in, wherever the layout puts it.
      const composer = document.querySelector('textarea, [contenteditable="true"]');
      if (composer !== null) limit = Math.min(limit, composer.getBoundingClientRect().top - 8);
      let node = element === null || element === undefined ? null : element.parentElement;
      while (node !== null && node !== undefined) {
        const overflow = getComputedStyle(node).overflowY;
        if ((overflow === 'auto' || overflow === 'scroll') && node.scrollHeight > node.clientHeight + 4) {
          limit = Math.min(limit, node.getBoundingClientRect().bottom);
          break;
        }
        node = node.parentElement;
      }
      return limit;
    }

    /**
     * A card hangs below its trigger unless that would not fit and there is more
     * room above; then it hangs above.
     * @param element - the trigger that opens the card.
     * @param room - how much height the card needs.
     * @returns true when it should grow upwards.
     */
    function opensUpwards(element, room) {
      const rect = element.getBoundingClientRect();
      const below = logBottom(element) - rect.bottom;
      return below < room && rect.top > below;
    }

    /** A stroke circular arrow: reads as 「再来一次」 at 14px, no words needed. */
    function RefreshIcon() {
      return h('svg', {
        width: 14, height: 14, viewBox: '0 0 24 24', fill: 'none',
        stroke: 'currentColor', strokeWidth: 2,
        strokeLinecap: 'round', strokeLinejoin: 'round',
        'aria-hidden': 'true',
      },
        h('path', { d: 'M21 12a9 9 0 1 1-2.64-6.36' }),
        h('path', { d: 'M21 3v6h-6' }));
    }

    /**
     * A chevron that turns with the block: down when open, right when folded away.
     * @param props.shown - whether the block it points at is open.
     */
    function Chevron(props) {
      return h('svg', {
        width: 12, height: 12, viewBox: '0 0 24 24', fill: 'none',
        stroke: 'currentColor', strokeWidth: 2.2,
        strokeLinecap: 'round', strokeLinejoin: 'round',
        'aria-hidden': 'true',
        style: { ...CHEVRON, transform: props.shown ? 'none' : 'rotate(-90deg)' },
      },
        h('path', { d: 'm6 9 6 6 6-6' }));
    }

    /** One 「速览」 block for the Turn the slot hands over. */
    function Interpreter(props) {
      const sessionId = props.sessionId;
      const seq = props.seq;
      const [open, setOpen] = useState(true);
      const [phase, setPhase] = useState({ kind: 'loading' });
      const [attempt, setAttempt] = useState(0);
      /** null until the Host says when blocks are wanted. */
      const [gate, setGate] = useState(null);
      /** Set when the reader asks for this Turn by hand. */
      const [wanted, setWanted] = useState(false);
      const [modeOpen, setModeOpen] = useState(false);
      const [modeHover, setModeHover] = useState(null);
      const [modeError, setModeError] = useState('');
      /** The catalog, read the first time the menu opens and kept afterwards. */
      const [models, setModels] = useState(null);
      const [choice, setChoice] = useState('');
      const [menuOpen, setMenuOpen] = useState(false);
      const [hover, setHover] = useState(null);
      /** True when the card has to grow upwards to stay clear of the composer. */
      const [menuUp, setMenuUp] = useState(false);
      const [saving, setSaving] = useState(false);
      const [pickerError, setPickerError] = useState('');
      const [iconHover, setIconHover] = useState(false);
      const usable = typeof sessionId === 'string' && typeof seq === 'number';
      const auto = gate !== null
        && (gate.mode === 'global' || (gate.mode === 'session' && gate.sessions.includes(sessionId)));
      /** Nothing is rewritten until either the mode asks for it or the reader does. */
      const started = auto || wanted;

      /** A card near the end of the log grows upwards instead of under the composer. */
      const fitsBelow = (element, room) => !opensUpwards(element, room);

      /** The card hangs below its trigger, or above it when the log ends too soon. */
      const cardStyle = () => (menuUp
        ? { ...MENU, top: 'auto', bottom: 'calc(100% + 6px)' }
        : MENU);

      /** One row of a card: quiet by default, checked and in full ink when it is in force. */
      const menuRow = (key, label, inForce, active, onPick, onEnter, onLeave) => h('button', {
        key,
        style: { ...ITEM, ...(active ? ITEM_HOVER : null), ...(inForce ? ITEM_ON : null) },
        onMouseEnter: onEnter,
        onMouseLeave: onLeave,
        onClick: onPick,
      },
        h('span', { style: ITEM_TEXT }, label),
        h('span', { key: 'check', style: CHECK_SLOT }, inForce ? h(CheckIcon) : null));

      const openModelMenu = (event) => {
        event.stopPropagation();
        setModeOpen(false);
        setPickerError('');
        setMenuUp(!fitsBelow(event.currentTarget, 270));
        setMenuOpen((open) => !open);
        // The catalog is read once; a failed read gets another chance on next open.
        if (models !== null && models.kind !== 'failed') return;
        setModels({ kind: 'loading' });
        requestModels()
          .then((result) => {
            if (result.status !== 'ok') throw new Error(result.message ?? '读不到模型清单');
            setChoice(`${result.provider}::${result.model}`);
            setModels({ kind: 'ready', providers: result.providers });
          })
          .catch((error) => setModels({ kind: 'failed', message: error instanceof Error ? error.message : String(error) }));
      };

      /** Choosing is saving: the menu writes through and folds itself away. */
      const pickModel = (value) => {
        if (saving) return;
        const [provider, model] = value.split('::');
        setSaving(true);
        setPickerError('');
        saveModel(provider, model)
          .then((result) => {
            if (result.status !== 'ok') throw new Error(result.message ?? '保存失败');
            setSaving(false);
            setChoice(value);
            setMenuOpen(false);
            // Picking a model on a quiet Turn is itself a request for a block.
            setWanted(true);
            setAttempt((n) => n + 1);
          })
          .catch((error) => {
            setSaving(false);
            setPickerError(error instanceof Error ? error.message : String(error));
          });
      };

      /** The mode menu writes straight through; a failed save puts the old one back. */
      const chooseMode = (mode) => {
        setModeOpen(false);
        setModeError('');
        const previous = gate;
        const sessions = mode === 'session'
          ? [...new Set([...previous.sessions, sessionId])]
          : previous.sessions;
        setGate({ mode, sessions });
        // Switching this Turn to an automatic mode fills in the block the reader is
        // looking at; earlier Turns keep whatever they already had.
        if (!started && mode !== 'manual') setWanted(true);
        saveGate(mode, sessions)
          .then((result) => {
            if (result.status !== 'ok') throw new Error(result.message ?? '没保存上');
          })
          .catch((error) => {
            setGate(previous);
            setModeError(error instanceof Error ? error.message : String(error));
          });
      };

      /** Clicking anywhere else folds the model list away. */
      useEffect(() => {
        if (!menuOpen && !modeOpen) return undefined;
        const close = () => { setMenuOpen(false); setModeOpen(false); };
        document.addEventListener('click', close);
        return () => document.removeEventListener('click', close);
      }, [menuOpen, modeOpen]);

      /** Read the mode once, so a Turn nobody asked about stays quiet. */
      useEffect(() => {
        if (!usable) return undefined;
        let live = true;
        requestGate()
          .then((result) => {
            if (!live) return;
            if (result.status !== 'ok') throw new Error(result.message ?? '读不到设置');
            setGate({
              mode: result.mode,
              sessions: Array.isArray(result.sessions) ? result.sessions : [],
            });
            // 手动 means nothing happens until asked: the block starts folded so the
            // reader only ever sees a 「› 速览」 line and opens it on purpose.
            if (result.mode === 'manual') setOpen(false);
          })
          .catch(() => {
            // Unreadable settings are not worth losing the feature over: the old
            // behaviour, every answer gets a block, is the safer stand-in.
            if (live) setGate({ mode: 'global', sessions: [] });
          });
        return () => { live = false; };
      }, [usable, sessionId]);

      useEffect(() => {
        if (!usable || !started) return undefined;
        let live = true;
        setPhase({ kind: 'loading' });
        requestRewrite(sessionId, seq, attempt > 0)
          .then((result) => {
            if (!live) return;
            if (result.status === 'ok') setPhase({ kind: 'ready', text: result.text, usage: result.usage });
            else if (result.status === 'skip') setPhase({ kind: result.reason === 'too-long' ? 'toolong' : 'none' });
            else setPhase({ kind: 'failed', message: readableError(result.message ?? '') });
          })
          .catch((error) => {
            if (live) setPhase({ kind: 'failed', message: readableError(error instanceof Error ? error.message : String(error)) });
          });
        return () => { live = false; };
      }, [usable, started, sessionId, seq, attempt]);

      const parsed = useMemo(() => (phase.kind === 'ready' ? blocks(phase.text) : []), [phase]);

      // Automatic mode keeps a short answer out of the way; a hand-opened block
      // says why it stayed empty instead of vanishing under the reader's finger.
      const quiet = phase.kind === 'none';
      if (!usable || (quiet && !wanted)) return null;

      const ready = phase.kind === 'ready';
      const shown = started && open;
      const body = [];
      if (phase.kind === 'loading') body.push(h('div', { key: 'wait', style: PULSE }, '整理中…'));
      else if (phase.kind === 'toolong') body.push(h('div', { key: 'long', style: MUTED }, '原文太长，这次没有整理'));
      else if (quiet) body.push(h('div', { key: 'short', style: MUTED }, '这条没什么可压的'));
      else if (phase.kind === 'failed') {
        body.push(h('div', { key: 'fail', style: MUTED }, `整理失败：${phase.message}`));
        body.push(h('button', { key: 'retry', style: ACTION, onClick: () => setAttempt((n) => n + 1) }, '重试'));
      } else body.push(...parsed.map(renderBlock));

      /** What one rewrite cost, written in the same small voice as the icon. */
      const usage = ready ? phase.usage : undefined;
      const cost = usage === undefined
        ? null
        : h('span', {
            style: COST,
            title: `输入 ${usage.inputTokens} · 输出 ${usage.outputTokens} · 合计 ${usage.totalTokens} tokens`,
          }, `${formatTokens(usage.totalTokens)} tokens`);

      /** 「模型」 opens a second-level card under itself; the row keeps its shape. */
      const modelTrigger = h('button', {
        style: ACTION_TRIGGER,
        title: '换一个改写模型',
        onClick: openModelMenu,
      },
        h('span', null, '模型'));
      let control = modelTrigger;
      if (menuOpen) {
        const rows = [];
        if (models === null || models.kind === 'loading') {
          rows.push(h('div', { key: 'load', style: MENU_TEXT }, '读取模型清单…'));
        } else if (models.kind === 'failed') {
          rows.push(h('div', { key: 'fail', style: MENU_TEXT }, models.message));
        } else {
          for (const provider of models.providers) {
            for (const model of provider.models) {
              const value = `${provider.id}::${model.id}`;
              rows.push(menuRow(
                value,
                `${provider.name} · ${model.name}`,
                value === choice,
                value === hover && !saving,
                () => pickModel(value),
                () => setHover(value),
                () => setHover(null),
              ));
            }
          }
          if (rows.length === 0) rows.push(h('div', { key: 'none', style: MENU_TEXT }, '没有可用的模型'));
        }
        if (pickerError) {
          rows.push(h('div', {
            key: 'error',
            style: { ...MENU_TEXT, color: 'var(--dsw-alias-state-error-primary, inherit)' },
          }, pickerError));
        }
        control = h('div', { style: PICKER }, modelTrigger, h('div', { style: cardStyle() }, rows));
      }

      /** 「全部 / 本会话 / 手动」: the switch itself, kept as small as the other actions. */
      let gateControl = null;
      if (gate !== null) {
        const items = MODE_MENU.map((item) => menuRow(
          item.value,
          item.label,
          item.value === gate.mode,
          item.value === modeHover,
          () => chooseMode(item.value),
          () => setModeHover(item.value),
          () => setModeHover(null),
        ));
        gateControl = h('div', { style: PICKER },
          h('button', {
            style: TRIGGER,
            title: '新的回答要不要自动速览',
            onClick: (event) => {
              event.stopPropagation();
              // Two open cards would sit on top of each other; the mode wins.
              setMenuOpen(false);
              setMenuUp(!fitsBelow(event.currentTarget, 130));
              setModeOpen((open) => !open);
            },
          },
            h('span', { style: TRIGGER_TEXT }, MODE_LABEL[gate.mode] ?? '模式')),
          modeOpen ? h('div', { style: cardStyle() }, items) : null);
      }

      return h('section', { style: started ? CARD : BARE },
        // The keyframes only exist while something is being written.
        phase.kind === 'loading' ? h('style', { key: 'ra-pulse' }, PULSE_CSS) : null,
        h('div', { style: HEAD },
          h('button', {
            style: DISCLOSURE,
            title: !started ? '生成速览' : shown ? '收起' : '展开',
            onClick: () => {
              // A quiet Turn has no body yet: the first click is the request.
              if (!started) {
                setWanted(true);
                setOpen(true);
                return;
              }
              setOpen(!open);
            },
          },
            h(Chevron, { shown }),
            h('span', null, NAME)),
          h('span', { style: SPACER }),
          modeError ? h('span', { style: MUTED }, modeError) : null,
          // Folded away, the head is only the name and the chevron; the switches
          // belong to the thing they switch, and come back with it.
          shown ? gateControl : null,
          shown ? control : null),
        shown ? h('div', { style: BODY }, body) : null,
        shown && ready
          ? h('div', { style: FOOT },
              cost,
              h('button', {
                style: { ...ICON_BUTTON, opacity: iconHover ? 1 : 0.4 },
                title: '重新整理这一条',
                'aria-label': '重新整理这一条',
                onMouseEnter: () => setIconHover(true),
                onMouseLeave: () => setIconHover(false),
                onClick: () => setAttempt((n) => n + 1),
              }, h(RefreshIcon)))
          : null);
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        ctx.slots.inject('conversation.chat.turnTail', () => ctx.slots.register({
          name: 'conversation.chat.turnTail',
          id: 'interpreter',
          order: 10,
          inject: (sessionId) => ({ sessionId }),
        }, Interpreter));
      },
    };
  },
});
