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
     * The body of the block is the answer's own typography, not an imitation of it:
     * every rule below is copied from the app's markdown sheet (`_markdown_*` in the
     * frontend bundle) and every value is a live theme token, so the block follows
     * whatever theme, accent and font size the reader picked, and a future release
     * that renames its hashed classes cannot break it.
     *
     * Waiting speaks in the app's voice too: 「整理中」 carries the same light that
     * runs along 「深度求索中」, drawn from the same two tokens, with an ellipsis that
     * grows one dot at a time beside it. The light repeats without a seam because the
     * band travels exactly its own width and is off the glyphs at both ends of the
     * cycle; reduced-motion readers get the plain text and all three dots.
     */
    const CSS = `
.ra-md{min-width:0;overflow-wrap:anywhere;font:var(--dsw-font-markdown-base,14px/24px var(--dsw-font-family,system-ui));color:var(--dsw-alias-label-primary,inherit)}
.ra-md p{margin:16px 0}
.ra-md strong{font-weight:600}
.ra-md h1{font:var(--dsw-font-markdown-h1,700 21px/30px var(--dsw-font-family,system-ui));margin:32px 0 16px}
.ra-md h2{font:var(--dsw-font-markdown-h2,700 18px/28px var(--dsw-font-family,system-ui));margin:32px 0 16px}
.ra-md h3{font:var(--dsw-font-markdown-h3,600 16px/26px var(--dsw-font-family,system-ui));margin:32px 0 16px}
.ra-md :is(h4,h5,h6){font:var(--dsw-font-markdown-base-strong,600 14px/24px var(--dsw-font-family,system-ui));margin:16px 0}
.ra-md :is(h1,h2,h3,h4,h5,h6) strong{font-weight:inherit}
.ra-md :is(ul,ol){margin:16px 0;padding-left:18px}
.ra-md li:not(:first-child){margin-top:6px}
.ra-md li>:is(ul,ol){margin-top:4px}
.ra-md li::marker{line-height:24px;color:var(--dsw-alias-label-secondary,inherit)}
.ra-md :is(ul,ol) ol{list-style-position:inside;padding-left:0}
.ra-md blockquote{border-left:2px solid var(--dsw-alias-label-caption,currentColor);margin:16px 0 0;padding-left:14px}
.ra-md hr{display:block;border:none;height:.5px;margin:32px 0;background:var(--dsw-alias-border-l2,rgba(128,128,128,.3))}
.ra-md pre{margin:16px 0;padding:10px 12px;overflow:auto;font:var(--dsw-font-markdown-code,13px/20px ui-monospace);font-family:var(--ds-font-family-code,ui-monospace,monospace);background:var(--dsw-alias-bg-layer-2,rgba(128,128,128,.12));border-radius:var(--dsw-radius-md,8px)}
.ra-md pre code{font:inherit;background:none;border:0;padding:0}
.ra-md :not(pre)>code{display:inline-flex;align-items:center;box-sizing:border-box;font:var(--dsw-font-markdown-code,13px/20px ui-monospace);font-family:var(--ds-font-family-code,ui-monospace,monospace);font-size:.875em;background-color:var(--dsw-alias-markdown-inline-code,rgba(128,128,128,.18));border:.5px solid var(--dsw-alias-border-l1,rgba(128,128,128,.3));border-radius:var(--dsw-radius-sm,6px);padding:0 5px}
.ra-table{max-width:100%;overflow-x:auto;overscroll-behavior-x:contain}
.ra-md table{border-collapse:collapse;width:max-content;max-width:max-content}
.ra-md th{text-align:start;padding:10px 16px;border-bottom:.5px solid var(--dsw-alias-border-l3,rgba(128,128,128,.35));font:var(--dsw-font-markdown-table-head,600 14px/22px var(--dsw-font-family,system-ui));max-width:min(30vw,320px);min-width:100px}
.ra-md td{padding:10px 16px;border-bottom:.5px solid var(--dsw-alias-border-l2,rgba(128,128,128,.2));font:var(--dsw-font-markdown-table,14px/22px var(--dsw-font-family,system-ui));max-width:min(30vw,320px);min-width:100px}
.ra-md :is(th,td):first-child{padding-left:0}
.ra-md td:last-child{padding-right:0}
.ra-md table code{font-size:11px}
.ra-md a{position:relative;color:var(--dsw-alias-link,var(--dsw-alias-state-business-primary,#4176e6));font-weight:500;text-decoration:none;transition:box-shadow var(--ds-transition-duration,150ms) var(--ds-ease-in-out,ease);border-left:3px solid transparent;border-right:3px solid transparent;border-top:2px solid transparent;border-bottom:2px solid transparent;margin-left:-3px;margin-right:-3px}
.ra-md a:focus{outline:none;text-decoration:underline dotted var(--dsw-alias-link,currentColor);text-underline-offset:3px}
@media(hover:hover){.ra-md a:hover{outline:none;text-decoration:underline dotted var(--dsw-alias-link,currentColor);text-underline-offset:3px}}
.ra-md a:focus-visible{box-shadow:0 0 0 2px var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary,#7aaaff))}
.ra-link-icon{flex:none;width:1.1em;height:1.1em;vertical-align:-.25em;margin-right:5px}
.ra-md>:first-child,.ra-md p:first-child{margin-top:0!important}
.ra-md>:last-child,.ra-md p:last-child{margin-bottom:0!important}
.ra-wait{display:inline-flex;align-items:baseline;font:var(--dsw-font-markdown-base,14px/24px var(--dsw-font-family,system-ui));color:var(--dsw-alias-label-deep-diving,var(--dsw-alias-link,#4176e6))}
.ra-wait-root{position:relative;display:inline-grid;width:max-content;max-width:100%;vertical-align:top;color:inherit}
.ra-wait-ghost{position:absolute;inset:0;overflow:clip;pointer-events:none;user-select:none}
.ra-wait-sweep{position:absolute;inset:0;overflow:hidden;color:var(--dsw-alias-label-deep-diving-shimmer,var(--dsw-alias-label-deep-diving,#4176e6));-webkit-mask-image:linear-gradient(105deg,transparent 0%,#000 40% 60%,transparent 100%);mask-image:linear-gradient(105deg,transparent 0%,#000 40% 60%,transparent 100%);transform:translate(-100%);animation-name:ra-wait-sweep;animation-duration:1.5s;animation-delay:.3s;animation-timing-function:steps(48,end);animation-iteration-count:infinite}
.ra-wait-highlight{display:block;width:100%;height:100%;transform:translate(100%);animation-name:ra-wait-highlight;animation-duration:1.5s;animation-delay:.3s;animation-timing-function:steps(48,end);animation-iteration-count:infinite}
.ra-dots{display:inline-block;width:1em;text-align:left}
.ra-dot2{animation:ra-reveal-second 1.5s step-end infinite}
.ra-dot3{animation:ra-reveal-third 1.5s step-end infinite}
@keyframes ra-wait-sweep{0%{transform:translate(-100%)}66.6667%,to{transform:translate(100%)}}
@keyframes ra-wait-highlight{0%{transform:translate(100%)}66.6667%,to{transform:translate(-100%)}}
@keyframes ra-reveal-second{0%,33.32%{opacity:0}33.33%,to{opacity:1}}
@keyframes ra-reveal-third{0%,66.65%{opacity:0}66.66%,to{opacity:1}}
@media(prefers-reduced-motion:reduce){.ra-wait-ghost{display:none}.ra-wait-sweep,.ra-wait-highlight,.ra-dot2,.ra-dot3{animation:none;opacity:1}}
`;
    /**
     * The three glyphs a link can wear, taken from the app's own icon data so a link
     * in the block sits in the same family as a link in the answer above: GitHub's
     * mark (filled, in the brand set's padded 24-box), a page for a path on disk,
     * a globe for anything else on the web (both from the 16-box stroke set).
     */
    const BRAND_GITHUB = ['M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12'];
    const STROKE_GLOBE = [
      'M7.99986 14.0887C11.3626 14.0887 14.0886 11.3627 14.0886 7.99998C14.0886 4.63727 11.3626 1.91125 7.99986 1.91125C4.63715 1.91125 1.91113 4.63727 1.91113 7.99998C1.91113 11.3627 4.63715 14.0887 7.99986 14.0887Z',
      'M2.34619 8H13.6538',
      'M7.99976 14.0889C9.23509 14.0889 10.1743 11.3629 10.1743 8.00006C10.1743 4.63739 9.23509 1.91138 7.99976 1.91138',
      'M7.99973 14.0889C6.76445 14.0889 5.8252 11.3629 5.8252 8.00006C5.8252 4.63739 6.76445 1.91138 7.99973 1.91138',
    ];
    const STROKE_PAGE = [
      'M3.75275 14.271H12.2473C12.7749 14.271 13.2027 13.8433 13.2027 13.3156V5.91732C13.2027 5.65958 13.0985 5.41276 12.9139 5.23293L9.59477 2.00011C9.4164 1.82636 9.17717 1.72913 8.9282 1.72913H3.75275C3.22511 1.72913 2.79736 2.15686 2.79736 2.68451V13.3156C2.79736 13.8433 3.22511 14.271 3.75275 14.271Z',
      'M8.84888 1.83838V4.94133C8.84888 5.46896 9.2766 5.89671 9.80426 5.89671H13.157',
    ];

    /**
     * The glyph that heads a link. A repository gets the mark, a path on disk gets
     * the page, a URL gets the globe.
     * @param href - the link target.
     * @param prefix - node key prefix.
     */
    function linkGlyph(href, prefix) {
      const brand = /^https?:\/\/(?:[\w-]+\.)?github\.com\//i.test(href);
      const web = /^https?:/i.test(href);
      const paths = brand ? BRAND_GITHUB : web ? STROKE_GLOBE : STROKE_PAGE;
      return h('svg', {
        key: `${prefix}-glyph`,
        className: 'ra-link-icon',
        viewBox: brand ? '-2 -2 28 28' : '0 0 16 16',
        fill: brand ? 'currentColor' : 'none',
        stroke: brand ? undefined : 'currentColor',
        strokeWidth: brand ? undefined : 1.2,
        'aria-hidden': 'true',
      }, paths.map((d, i) => h('path', { key: i, d })));
    }
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
        else if (token.startsWith('`')) out.push(h('code', { key }, token.slice(1, -1)));
        else if (token.startsWith('[')) {
          const link = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(token);
          const external = /^https?:/i.test(link[2]);
          // Only a web target opens a new tab; a path stays where it is, exactly as
          // the answer above treats the two.
          out.push(h('a', {
            key,
            href: link[2],
            ...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {}),
          }, linkGlyph(link[2], key), link[1]));
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

    /**
     * Render one parsed block with the elements the app's own markdown uses; all of
     * the measuring is in CSS, so nothing here carries a typographic opinion.
     */
    function renderBlock(block, at) {
      const key = `b${at}`;
      if (block.kind === 'heading') {
        const level = Math.min(6, Math.max(1, block.level));
        return h(`h${level}`, { key }, inline(block.text, key));
      }
      if (block.kind === 'code') return h('pre', { key }, h('code', null, block.text));
      if (block.kind === 'list') {
        const children = block.items.map((item, i) => h('li', { key: `i${i}` }, inline(item, `${key}-${i}`)));
        return h(block.ordered ? 'ol' : 'ul', { key }, children);
      }
      if (block.kind === 'quote') return h('blockquote', { key }, inline(block.text, key));
      if (block.kind === 'table') {
        const rows = block.rows.map((cells, r) => h('tr', { key: `r${r}` },
          cells.map((cell, c) => h('td', { key: `c${c}` }, inline(cell, `${key}-${r}-${c}`)))));
        if (block.head !== null) {
          rows.unshift(h('tr', { key: 'h' },
            block.head.map((cell, c) => h('th', { key: `c${c}` }, inline(cell, `${key}-h-${c}`)))));
        }
        return h('div', { key, className: 'ra-table' }, h('table', null, h('tbody', null, rows)));
      }
      if (block.kind === 'rule') return h('hr', { key });
      return h('p', { key }, inline(block.text, key));
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
      if (phase.kind === 'loading') {
        // Same reading as 「深度求索中」 above: the light runs across the words, and the
        // ellipsis grows a dot at a time. The ghost copy is what the light touches —
        // the real text stays put, so nothing shifts when it passes.
        body.push(h('div', { key: 'wait' },
          h('span', { className: 'ra-wait' },
            h('span', { className: 'ra-wait-root' },
              h('span', null, '整理中'),
              h('span', { className: 'ra-wait-ghost', 'aria-hidden': 'true' },
                h('span', { className: 'ra-wait-sweep' },
                  h('span', { className: 'ra-wait-highlight' }, '整理中')))),
            h('span', { className: 'ra-dots', 'aria-hidden': 'true' },
              h('span', null, '\u00b7'),
              h('span', { className: 'ra-dot2' }, '\u00b7'),
              h('span', { className: 'ra-dot3' }, '\u00b7')))));
      } else if (phase.kind === 'toolong') body.push(h('div', { key: 'long', style: MUTED }, '原文太长，这次没有整理'));
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
        // The sheet travels with the body it styles, so nothing leaks into the app.
        shown ? h('style', { key: 'ra-css' }, CSS) : null,
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
        shown ? h('div', { style: BODY, className: 'ra-md' }, body) : null,
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
