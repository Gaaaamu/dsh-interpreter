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
    /** Host route that says whether a Turn is worth an entry, before anything is spent. */
    const PROBE = '/interpreter/probe';

    /** Raised surface, same idiom as the tool-call cards above it: the native
     *  turn-tail card rounds at --dsw-radius-lg, so this one does too.
     *
     *  The fill is the translucent interactive wash rather than bg-layer-1: in the
     *  light theme every bg-layer token resolves to plain white, the same as the
     *  page, so a layer-coloured block there had no edge at all. This wash tints
     *  whatever it sits on — a grey block on white paper, a lifted block in the
     *  dark — and is what the native frames use for their quiet surfaces too. */
    const CARD = {
      marginTop: 14, padding: '12px 16px 14px', borderRadius: 'var(--dsw-radius-lg, 16px)',
      background: 'var(--dsw-alias-interactive-bg-hover, rgba(128,128,128,0.08))',
      lineHeight: 1.78, wordBreak: 'break-word',
    };
    /** The name of this block; renaming the feature starts and ends here. */
    const NAME = '速览';
    /** The folded line a budget stop leaves behind: short, and never a card. */
    const BUDGET_NOTE = '今日额度已用完';
    /** Same measure as the answer above: a narrower column reads as a cramped box. */
    const BODY = { marginTop: 14 };
    /** An untouched Turn in manual mode only offers the entry point: no card, no paint. */
    const BARE = { marginTop: 14, padding: '2px 0' };
    const HEAD = { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' };
    /** The app's own separator between a title and the line that follows it: a
     *  round dot, drawn rather than typed, so the flex row centres it instead of
     *  leaving a 「·」 glyph to sit wherever the font baseline puts it. */
    const SEP = {
      flex: 'none', width: 3, height: 3, borderRadius: '50%',
      background: 'var(--dsw-alias-label-caption, currentColor)',
    };
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
    /**
     * The conclusion the folded block keeps: one clipped line beside the name, so a
     * reader can tell whether opening it is worth the click.
     */
    const HEAD_NOTE = {
      flex: '0 1 auto', minWidth: 0,
      fontSize: 13, color: 'var(--dsw-alias-label-secondary, inherit)',
      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
    };
    /** Longest conclusion the folded line keeps before it is cut with an ellipsis. */
    const HEADLINE_CHARS = 36;
    /** Turns whose judged entry is remembered; older ones are dropped past this. */
    const MAX_PROBES = 500;
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
.ra-md li>:is(ul,ol){margin:4px 0 0}
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
/* The settings page takes the whole main panel, the way the app's own entry pages do:
   a title bar that stays put and one scrolling column under it. */
.ra-set-page{--ra-set-inset:clamp(24px,4vw,48px);display:flex;flex-direction:column;align-items:center;box-sizing:border-box;height:100%;padding:0 var(--ra-set-inset)}
.ra-set-page>*{flex:none;width:100%;max-width:860px}
.ra-set-bar{display:flex;align-items:center;gap:12px;padding:calc(28px + var(--dsh-frame-top-clearance,0px)) 0 14px}
.ra-set-back{display:inline-flex;align-items:center;gap:4px;margin-left:-6px;padding:5px 10px 5px 6px;border:0;border-radius:var(--dsw-radius-md,8px);background:transparent;cursor:pointer;font:inherit;font-size:13px;color:var(--dsw-alias-label-secondary,inherit);transition:background 120ms ease,color 120ms ease}
.ra-set-back:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,.12));color:var(--dsw-alias-label-primary,inherit)}
.ra-set-title{font-size:15px;font-weight:600;color:var(--dsw-alias-label-primary,inherit)}
.ra-set-fill{flex:1 1 auto;min-width:8px}
.ra-set-note{max-width:280px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px;color:var(--dsw-alias-label-secondary,inherit)}
.ra-set-save{flex:none;padding:6px 16px;border:0;border-radius:var(--dsw-radius-md,8px);cursor:pointer;font:inherit;font-size:13px;background:var(--dsw-alias-state-business-primary,#4176e6);color:#fff;transition:opacity 120ms ease}
.ra-set-save:disabled{opacity:.5;cursor:default}
.ra-set-body{flex:1 1 auto;display:flex;flex-direction:column;gap:24px;min-height:0;overflow-y:auto;overscroll-behavior:contain;padding-bottom:56px}
.ra-set-group{display:flex;flex-direction:column;gap:10px}
.ra-set-head{font-size:12px;font-weight:600;letter-spacing:.04em;color:var(--dsw-alias-label-caption,inherit)}
.ra-set-hint{margin:0;font-size:12px;line-height:1.6;color:var(--dsw-alias-label-secondary,inherit)}
.ra-set-row{display:flex;align-items:center;gap:12px;flex-wrap:wrap}
.ra-set-label{flex:1 1 auto;min-width:120px;font-size:13px;color:var(--dsw-alias-label-primary,inherit)}
.ra-set-sub{display:block;margin-top:2px;font-size:12px;color:var(--dsw-alias-label-secondary,inherit)}
.ra-set-field{box-sizing:border-box;padding:6px 9px;border:.5px solid var(--dsw-alias-border-l2,rgba(128,128,128,.28));border-radius:var(--dsw-radius-sm,6px);outline:none;font:inherit;font-size:13px;color:var(--dsw-alias-label-primary,inherit);background:var(--dsw-alias-bg-layer-1,rgba(128,128,128,.1));transition:border-color 120ms ease}
.ra-set-field:focus{border-color:var(--dsw-alias-state-business-primary,#4176e6)}
.ra-set-field[data-width=num]{width:112px}
.ra-set-field[data-width=wide]{width:100%;max-width:340px}
.ra-set-area{box-sizing:border-box;width:100%;min-height:170px;resize:vertical;padding:10px 12px;border:.5px solid var(--dsw-alias-border-l2,rgba(128,128,128,.28));border-radius:var(--dsw-radius-md,8px);outline:none;font:var(--dsw-font-markdown-code,13px/20px ui-monospace);font-family:var(--ds-font-family-code,ui-monospace,monospace);color:var(--dsw-alias-label-primary,inherit);background:var(--dsw-alias-bg-layer-1,rgba(128,128,128,.1));transition:border-color 120ms ease}
.ra-set-area:focus{border-color:var(--dsw-alias-state-business-primary,#4176e6)}
.ra-set-chips{display:flex;gap:8px;flex-wrap:wrap}
.ra-set-chip{padding:5px 14px;border:.5px solid var(--dsw-alias-border-l2,rgba(128,128,128,.28));border-radius:999px;background:transparent;cursor:pointer;font:inherit;font-size:13px;color:var(--dsw-alias-label-secondary,inherit);transition:background 120ms ease,color 120ms ease,border-color 120ms ease}
.ra-set-chip:hover{color:var(--dsw-alias-label-primary,inherit)}
.ra-set-chip[data-on=true]{border-color:transparent;background:var(--dsw-alias-bg-layer-3,rgba(128,128,128,.24));color:var(--dsw-alias-label-primary,inherit);font-weight:600}
.ra-set-error{margin:0;padding:10px 12px;border-radius:var(--dsw-radius-md,8px);font-size:13px;line-height:1.6;background:var(--dsw-alias-state-error-bg,rgba(220,60,60,.12));color:var(--dsw-alias-state-error-primary,#d94a4a)}
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
    /** A sentence inside a menu card, where an item would sit. */
    const MENU_TEXT = {
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
    /** How long the 速览 should be, in the same words the Host stores. */
    const LENGTH_LABEL = { normal: '普通', detailed: '详细' };
    const LENGTH_MENU = [
      { value: 'normal', label: '普通' },
      { value: 'detailed', label: '详细' },
    ];
    /** The answer's own language, or one fixed, in the same three words the Host stores. */
    const LANG_LABEL = { auto: '跟随', zh: '中文', en: '英文' };
    const LANG_MENU = [
      { value: 'auto', label: '跟随回答' },
      { value: 'zh', label: '固定中文' },
      { value: 'en', label: '固定英文' },
    ];
    /** The ⋯ in the corner: quieter than the copy button, never quite gone. */
    const MORE_BUTTON = { ...ICON_BUTTON, opacity: 0.55 };
    /** A row that drills into one more list: its current value on the right, then the way in. */
    const ROW_VALUE = {
      flex: '0 0 auto', maxWidth: 132, marginLeft: 8,
      fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      color: 'var(--dsw-alias-label-caption, currentColor)',
    };
    /** Between the switches and the settings entry in the ⋯ list. */
    const DIVIDER = {
      height: 1, margin: '4px 6px',
      background: 'var(--dsw-alias-border-l2, rgba(128,128,128,0.22))',
    };
    /** Anchors a menu card to the control that opens it. */
    const PICKER = { position: 'relative', display: 'inline-flex' };
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
      fontSize: 13, padding: '7px 10px', border: 0, borderRadius: 'var(--dsw-radius-md, 12px)',
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
    /**
     * A URL standing in the prose on its own. A rewrite often keeps the address but
     * drops the brackets around it, and a bare address still has to lead somewhere.
     */
    const URL_TOKEN = 'https?:\\/\\/[^\\s<>()（）\\[\\]【】《》，。；：！？、*"\'`]+';
    /** Emphasis hugs its words: `*x*` is italic, the `*` of `a * b * c` is arithmetic. */
    const INLINE = new RegExp('(\\*\\*[^*\\n]+\\*\\*|`[^`\\n]+`|\\[[^\\]\\n]+\\]\\([^)\\s]+\\)|\\*[^\\s*](?:[^*\\n]*[^\\s*])?\\*|' + URL_TOKEN + ')', 'g');
    /** A sentence's full stop is not part of its address. */
    const TRAILING = /[.,;:!?'"]+$/;
    const FENCE = /^```\s*[\w+-]*\s*$/;
    const HEADING = /^(#{1,6})\s+(.*)$/;
    /** One list item: its indent, its marker, its text. */
    const LIST_ITEM = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/;
    const QUOTED = /^>\s?/;
    const RULE = /^\s*(-{3,}|\*{3,})\s*$/;
    /** Lines that start a block of their own instead of continuing a paragraph. */
    const SPECIAL = /^(#{1,6}\s|```|>|\s*[-*+]\s+|\s*\d+[.)]\s+|\s*\|)/;
    /** A table row, and the separator row that follows a header. */
    const TABLE = /^\s*\|/;
    const SEPARATOR = /^\s*\|?[\s:|-]*-[\s:|-]*\|?\s*$/;

    /**
     * The target a link may keep. The rewrite repeats whatever the answer said,
     * and the answer may repeat a web page, so only the web and plain paths get
     * through: `javascript:`, `data:`, `vbscript:` and any other scheme are
     * dropped. A single letter before the colon is a Windows drive, not a scheme.
     * @param href - the link target as written.
     * @returns the target, or null when the link should render as plain text.
     */
    function safeHref(href) {
      const scheme = /^\s*([a-z][a-z0-9+.-]*):/i.exec(href);
      if (scheme === null || scheme[1].length === 1) return href;
      return /^(https?|file|mailto)$/i.test(scheme[1]) ? href : null;
    }

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
        let used = token.length;
        if (token.startsWith('**')) out.push(h('strong', { key }, token.slice(2, -2)));
        else if (token.startsWith('`')) out.push(h('code', { key }, token.slice(1, -1)));
        else if (token.startsWith('[')) {
          const link = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(token);
          if (safeHref(link[2]) === null) {
            // A target nobody should follow keeps its words and loses the link.
            out.push(link[1]);
            last = match.index + used;
            continue;
          }
          const external = /^https?:/i.test(link[2]);
          // Only a web target opens a new tab; a path stays where it is, exactly as
          // the answer above treats the two.
          out.push(h('a', {
            key,
            href: link[2],
            ...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {}),
          }, linkGlyph(link[2], key), link[1]));
        } else if (/^https?:/i.test(token)) {
          const href = token.replace(TRAILING, '');
          used = href.length;
          out.push(h('a', { key, href, target: '_blank', rel: 'noopener noreferrer' },
            linkGlyph(href, key), href));
        } else out.push(h('em', { key }, token.slice(1, -1)));
        last = match.index + used;
      }
      if (last < text.length) out.push(text.slice(last));
      return out;
    }

    /**
     * The words inside an inline run, with every mark and link target dropped:
     * code keeps its exact characters, which is where globs and paths live.
     * @param node - an inline node, a list of them, or bare text.
     */
    function wordsOf(node) {
      if (typeof node === 'string') return node;
      if (Array.isArray(node)) return node.map(wordsOf).join('');
      if (node === null || typeof node !== 'object') return '';
      const children = node.children ?? node.props?.children;
      return children === undefined ? '' : wordsOf(children);
    }

    /**
     * The one line the folded block keeps: the opening sentence of the rewrite.
     * It is plain text, so opening the card shows the same sentence as its first
     * line; a sentence that would outrun the header is cut with `…`.
     * @param parsed - the rewrite, already folded into blocks.
     */
    function headline(parsed) {
      const first = parsed.find((block) => block.kind === 'paragraph' || block.kind === 'quote' || block.kind === 'list');
      if (first === undefined) return '';
      const source = first.kind === 'list' ? first.items[0]?.text ?? '' : first.text;
      const plain = wordsOf(inline(source, 'headline')).replace(/\s+/g, ' ').trim();
      const stop = plain.search(/[。！？!?]/);
      const sentence = (stop === -1 ? plain : plain.slice(0, stop)).trim().replace(/[，,、：:]$/, '');
      return sentence.length > HEADLINE_CHARS ? `${sentence.slice(0, HEADLINE_CHARS)}…` : sentence;
    }

    /**
     * Split one table row into cells. `\|` is a pipe inside a cell, and so is a
     * pipe inside backticks: a command such as `a | b` stays in one cell.
     * @param row - the raw table line.
     */
    function tableCells(row) {
      const body = row.replace(/^\s*\|/, '').replace(/\|\s*$/, '');
      const cells = [];
      let cell = '';
      let inCode = false;
      for (let at = 0; at < body.length; at += 1) {
        const char = body[at];
        if (char === '\\' && body[at + 1] === '|') { cell += '|'; at += 1; continue; }
        if (char === '`') inCode = !inCode;
        if (char === '|' && !inCode) { cells.push(cell.trim()); cell = ''; continue; }
        cell += char;
      }
      cells.push(cell.trim());
      return cells;
    }

    /** Columns a line is indented by; a tab counts as four. */
    function indentOf(text) {
      return text.replace(/\t/g, '    ').length;
    }

    /**
     * Read one list, nested lists and wrapped lines included, starting at `start`.
     * A deeper-indented item opens a list inside the item above it; a line that
     * is not a new block continues the item above it; a blank line ends the list
     * unless the next line is another item of it.
     * @param lines - every line of the source.
     * @param start - the index of the list's first item.
     * @returns the list block and the index of the first line after it.
     */
    function readList(lines, start) {
      const items = [];
      let index = start;
      while (index < lines.length) {
        const line = lines[index];
        if (line.trim() === '') {
          let ahead = index + 1;
          while (ahead < lines.length && lines[ahead].trim() === '') ahead += 1;
          if (ahead < lines.length && LIST_ITEM.test(lines[ahead]) && !RULE.test(lines[ahead])) { index = ahead; continue; }
          break;
        }
        const item = RULE.test(line) ? null : LIST_ITEM.exec(line);
        if (item !== null) {
          const ordered = /\d/.test(item[2]);
          items.push({ indent: indentOf(item[1]), ordered, number: ordered ? parseInt(item[2], 10) : 1, text: item[3] });
          index += 1;
          continue;
        }
        if (/^\s*(#{1,6}\s|```|>|\|)/.test(line) || RULE.test(line)) break;
        items[items.length - 1].text += `\n${line.trim()}`;
        index += 1;
      }
      // Fold the flat run into a tree by indentation.
      const root = { kind: 'list', ordered: items[0].ordered, start: items[0].number, items: [] };
      const stack = [{ indent: items[0].indent, list: root }];
      for (const item of items) {
        while (stack.length > 1 && item.indent < stack[stack.length - 1].indent) stack.pop();
        let level = stack[stack.length - 1];
        const parent = level.list.items[level.list.items.length - 1];
        if (item.indent > level.indent && parent !== undefined) {
          const nested = { kind: 'list', ordered: item.ordered, start: item.number, items: [] };
          parent.children.push(nested);
          level = { indent: item.indent, list: nested };
          stack.push(level);
        }
        level.list.items.push({ text: item.text, children: [] });
      }
      return { block: root, next: index };
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
        if (LIST_ITEM.test(line)) {
          const list = readList(lines, index);
          out.push(list.block);
          index = list.next;
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
            rows.push(tableCells(row));
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

    /** One list and the lists nested in its items; an ordered list keeps its first number. */
    function renderList(list, key) {
      const children = list.items.map((item, i) => {
        const itemKey = `${key}-${i}`;
        return h('li', { key: `i${i}` },
          inline(item.text, itemKey),
          item.children.map((nested, n) => renderList(nested, `${itemKey}-n${n}`)));
      });
      const start = list.ordered && list.start !== 1 ? { start: list.start } : null;
      return h(list.ordered ? 'ol' : 'ul', { key, ...start }, children);
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
      if (block.kind === 'list') return renderList(block, key);
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

    /**
     * Ask the Host for the readable rewrite of one finished Turn.
     * @param auto - true when the mode asked, not the reader; the Host then
     *   declines answers that were committed before automation was switched on.
     */
    function requestRewrite(sessionId, seq, force, auto) {
      return fetch(ROUTE, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sessionId, seq, force, auto }),
      }).then(readReply);
    }

    /**
     * Ask the Host whether one Turn is worth an entry at all. The entry is the
     * whole block in 手动, so a Turn whose answer is too short — or answered no
     * text — would otherwise grow a click that only says 「这条没什么可压的」.
     */
    function requestProbe(sessionId, seq) {
      return fetch(PROBE, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sessionId, seq }),
      }).then(readReply);
    }

    /**
     * The JSON a route answered with, or an error a reader can act on. The Host
     * refuses unauthenticated requests with an empty 401/403, which has no JSON
     * to read; other failures carry their own message.
     * @param response - the fetch response.
     */
    function readReply(response) {
      if (response.ok) return response.json();
      if (response.status === 401) throw new Error('登录已失效，刷新页面再试');
      if (response.status === 403) throw new Error('请求被拒绝：页面来源不受信任，刷新页面再试');
      return response.json().then(
        (body) => { throw new Error(body?.message ?? `HTTP ${response.status}`); },
        () => { throw new Error(`HTTP ${response.status}`); },
      );
    }

    /** Provider errors are too technical to show as-is. */
    function readableError(message) {
      if (/no configured model/i.test(message)) return '还没选改写用的模型，点「模型」挑一个';
      if (/UNKNOWN_MODEL/i.test(message)) return '这个模型现在用不了，点「模型」换一个';
      return message;
    }

    /** Read the selectable models and the one in force. */
    function requestModels() {
      return fetch(MODELS).then(readReply);
    }

    /** Remember a new rewrite model. */
    function saveModel(provider, model) {
      return fetch(CONFIG, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ provider, model }),
      }).then(readReply);
    }

    /** Ask the Host when a new answer should get a block. */
    function requestGate() {
      return fetch(CONFIG).then(readReply);
    }

    /**
     * Change the mode, the allow-list, the length tier or the language. Only the
     * change travels, never the whole list: every block holds its own copy, and a
     * stale copy sent back would wipe out what another block added.
     * @param change - `{ mode?, addSessions?, removeSessions?, length?, language? }`.
     */
    function saveGate(change) {
      return fetch(CONFIG, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(change),
      }).then(readReply);
    }

    /**
     * The mode as it applies to one Session: 本会话 only when this Session is on
     * the list; a Session left off it is, for itself, 手动.
     */
    function effectiveMode(gate, sessionId) {
      if (gate.mode === 'session') return gate.sessions.includes(sessionId) ? 'session' : 'manual';
      return gate.mode === 'global' ? 'global' : 'manual';
    }

    /**
     * The length tier a gate names, standing in with 普通 for anything else: an
     * older Host, or a row written by hand in a newer vocabulary.
     */
    function effectiveLength(gate) {
      return LENGTH_LABEL[gate?.length] === undefined ? 'normal' : gate.length;
    }

    /**
     * The language a gate names, standing in with 跟随回答 for anything else: an
     * older Host, or a row written by hand in a newer vocabulary.
     */
    function effectiveLanguage(gate) {
      return LANG_LABEL[gate?.language] === undefined ? 'auto' : gate.language;
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

    /** Two sheets, one behind the other: the usual 「复制」, readable at 14px. */
    function CopyIcon() {
      return h('svg', {
        width: 14, height: 14, viewBox: '0 0 24 24', fill: 'none',
        stroke: 'currentColor', strokeWidth: 2,
        strokeLinecap: 'round', strokeLinejoin: 'round',
        'aria-hidden': 'true',
      },
        h('rect', { x: 9, y: 9, width: 12, height: 12, rx: 2 }),
        h('path', { d: 'M15 9V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h4' }));
    }

    /** A cross: says 「复制失败」 in the same spot, so nothing shifts either way. */
    function CrossIcon() {
      return h('svg', {
        width: 14, height: 14, viewBox: '0 0 24 24', fill: 'none',
        stroke: 'currentColor', strokeWidth: 2,
        strokeLinecap: 'round', strokeLinejoin: 'round',
        'aria-hidden': 'true',
      },
        h('path', { d: 'M18 6 6 18' }),
        h('path', { d: 'm6 6 12 12' }));
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

    /** Three dots: the one place this block's own switches and settings live. */
    function MoreIcon() {
      return h('svg', {
        width: 14, height: 14, viewBox: '0 0 24 24', fill: 'currentColor',
        'aria-hidden': 'true',
      },
        h('circle', { cx: 5, cy: 12, r: 1.9 }),
        h('circle', { cx: 12, cy: 12, r: 1.9 }),
        h('circle', { cx: 19, cy: 12, r: 1.9 }));
    }

    /**
     * The key this plugin's own settings page occupies in the main panel. The page
     * is not the app's Settings dialog: it edits this bundle's rows only, and the
     * app shows it like any other entry page.
     */
    const SETTINGS_PANEL = 'interpreter-settings';

    /**
     * Where a settings-page save leaves the chosen rewrite model. The model row is
     * the one switch the block does not share through `gateStore` (the catalog read
     * owns it), so the page hands it back here and a block that opens its ⋯ menu
     * afterwards names the new model. Set before the panel switches away.
     */
    let savedModel = '';

    /** Set while the plugin is applied: opening the page needs the layout service. */
    let openSettingsPage = () => {};
    /** Set while the plugin is applied: closing it is one panel switch back. */
    let returnToConversation = () => {};

    /** The id of the one sheet every block shares. */
    const STYLE_ID = 'dsh-interpreter-css';

    /**
     * Put the block's sheet in the page once, however many blocks are open. Every
     * rule is scoped under `ra-` classes, so nothing in it reaches the app.
     */
    function ensureStyle() {
      if (typeof document === 'undefined' || document.getElementById(STYLE_ID) !== null) return;
      const sheet = document.createElement('style');
      sheet.id = STYLE_ID;
      sheet.textContent = CSS;
      document.head.appendChild(sheet);
    }

    /**
     * The gate (mode and allow-list), the length tier and the language, read once
     * for the whole page and shared by every block, so a long Session costs one
     * request instead of one per Turn, and a change made in one block reaches the
     * others.
     */
    const gateStore = { value: null, failed: false, loading: false, listeners: new Set() };

    function setSharedGate(value) {
      gateStore.value = value;
      for (const listener of gateStore.listeners) listener(value);
    }

    /**
     * Carry a settings-page save into the blocks already on screen, so the switches
     * in their ⋯ menus read the new values the moment the reader comes back.
     * @param saved - the canonical reply a save answered with.
     */
    function publishGate(saved) {
      const previous = gateStore.value;
      setSharedGate({
        mode: typeof saved.mode === 'string' ? saved.mode : previous?.mode ?? 'manual',
        sessions: Array.isArray(saved.sessions) ? saved.sessions : previous?.sessions ?? [],
        length: effectiveLength(saved),
        language: effectiveLanguage(saved),
      });
    }

    function loadGate() {
      if (gateStore.loading || (gateStore.value !== null && !gateStore.failed)) return;
      gateStore.loading = true;
      requestGate()
        .then((result) => {
          if (result.status !== 'ok') throw new Error(result.message ?? '读不到设置');
          gateStore.failed = false;
          setSharedGate({
            mode: result.mode,
            sessions: Array.isArray(result.sessions) ? result.sessions : [],
            length: effectiveLength(result),
            language: effectiveLanguage(result),
          });
        })
        .catch(() => {
          // Unreadable settings must not start spending: stand in with the
          // default, a folded line that waits for a click, and let the next
          // block that mounts try again.
          gateStore.failed = true;
          setSharedGate({ mode: 'manual', sessions: [], length: 'normal', language: 'auto' });
        })
        .finally(() => { gateStore.loading = false; });
    }

    /** The shared gate; null until the first read lands. */
    function useSharedGate(enabled) {
      const [gate, setGate] = useState(gateStore.value);
      useEffect(() => {
        if (!enabled) return undefined;
        gateStore.listeners.add(setGate);
        setGate(gateStore.value);
        loadGate();
        return () => { gateStore.listeners.delete(setGate); };
      }, [enabled]);
      return gate;
    }

    /**
     * What the Host said about each Turn, shared by every block: switching
     * Sessions remounts its Turns, and a committed answer never changes, so the
     * same Turn is never asked about twice.
     */
    const probes = new Map();

    /** Whether a click under this Turn would rewrite something. */
    function probeTurn(sessionId, seq) {
      const key = `${sessionId}:${seq}`;
      const known = probes.get(key);
      if (known !== undefined) return Promise.resolve(known);
      return requestProbe(sessionId, seq).then((result) => {
        // Only a settled answer is worth keeping: a Turn whose text has not
        // landed yet, or a read that failed, gets asked about again next mount.
        if (result.status === 'ok' || result.reason === 'too-short' || result.reason === 'too-long') {
          if (probes.size >= MAX_PROBES) probes.clear();
          probes.set(key, result.status === 'ok');
        }
        return result.status === 'ok';
      });
    }

    /**
     * Put text on the clipboard from a click. The async Clipboard API is the one
     * to use and needs a secure context; the selection trick covers a page opened
     * over plain http (a LAN address rather than 127.0.0.1).
     * @returns a promise of whether the text made it.
     */
    function copyText(text) {
      const clipboard = typeof navigator === 'undefined' ? undefined : navigator.clipboard;
      if (clipboard !== undefined && typeof clipboard.writeText === 'function') {
        return clipboard.writeText(text).then(() => true, () => copyBySelection(text));
      }
      return Promise.resolve(copyBySelection(text));
    }

    /** The pre-Clipboard-API way: select the text in a hidden box and copy it. */
    function copyBySelection(text) {
      if (typeof document === 'undefined' || document.body === null) return false;
      const area = document.createElement('textarea');
      area.value = text;
      area.setAttribute('readonly', '');
      area.style.position = 'fixed';
      area.style.top = '0';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      let copied = false;
      try {
        copied = document.execCommand('copy');
      } catch {
        copied = false;
      }
      area.remove();
      return copied;
    }

    /** One 「速览」 block for the Turn the slot hands over. */
    function Interpreter(props) {
      const sessionId = props.sessionId;
      const seq = props.seq;
      const [open, setOpen] = useState(true);
      const [phase, setPhase] = useState({ kind: 'loading' });
      const [attempt, setAttempt] = useState(0);
      /** Set when the reader asks for this Turn by hand. */
      const [wanted, setWanted] = useState(false);
      /** Set when the Host says this answer predates automation: it waits for a click. */
      const [historic, setHistoric] = useState(false);
      /** The last failed save: it shows in the head, where the menu came from. */
      const [modeError, setModeError] = useState('');
      /** Bumped when the length tier or the language changes: this block redoes its Turn. */
      const [revision, setRevision] = useState(0);
      /** The catalog, read the first time the menu opens and kept afterwards. */
      const [models, setModels] = useState(null);
      const [choice, setChoice] = useState('');
      const [menuOpen, setMenuOpen] = useState(false);
      /** Which list the ⋯ shows: the top one, or one it drilled into. */
      const [view, setView] = useState('root');
      const [hover, setHover] = useState(null);
      /** True when the card has to grow upwards to stay clear of the composer. */
      const [menuUp, setMenuUp] = useState(false);
      const [saving, setSaving] = useState(false);
      const [pickerError, setPickerError] = useState('');
      /** Which footer icon the pointer is over, if any: only that one brightens. */
      const [iconHover, setIconHover] = useState('');
      /** '' | 'copied' | 'failed': the copy button shows a tick or a cross, then it goes back. */
      const [copyState, setCopyState] = useState('');
      useEffect(() => {
        if (copyState === '') return undefined;
        const timer = setTimeout(() => setCopyState(''), 1500);
        return () => clearTimeout(timer);
      }, [copyState]);
      const usable = typeof sessionId === 'string' && typeof seq === 'number';
      /** The page's gate, live: the mode menu shows and edits this one. */
      const gate = useSharedGate(usable);
      /**
       * The gate as this block first found it. A block decides once whether the
       * mode asked for it; switching modes later fills in only the Turn the
       * reader switched from, and Turns that arrive afterwards.
       */
      const [firstGate, setFirstGate] = useState(gate);
      useEffect(() => {
        if (firstGate === null && gate !== null) setFirstGate(gate);
      }, [firstGate, gate]);
      const auto = firstGate !== null && !historic && effectiveMode(firstGate, sessionId) !== 'manual';
      /** Nothing is rewritten until either the mode asks for it or the reader does. */
      const started = auto || wanted;
      /**
       * Whether this Turn is worth an entry at all, as the Host judged it: null
       * until the answer lands. In 手动 the entry is the whole block, so this is
       * what keeps it off Turns where a click would come back empty.
       */
      const [offered, setOffered] = useState(null);
      useEffect(() => {
        if (!usable || started) return undefined;
        let live = true;
        probeTurn(sessionId, seq).then(
          (worth) => { if (live) setOffered(worth); },
          // A read that fails must not hide the entry for good: show it, and let
          // the click have the last word.
          () => { if (live) setOffered(true); },
        );
        return () => { live = false; };
      }, [usable, started, sessionId, seq]);

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

      /** Folding the menu away always returns it to its top list. */
      const closeMenu = () => {
        setMenuOpen(false);
        setView('root');
        setHover(null);
      };

      /** The catalog is read once; a failed read gets another chance on next open. */
      const loadModels = () => {
        setPickerError('');
        if (models !== null && models.kind !== 'failed') return;
        setModels({ kind: 'loading' });
        requestModels()
          .then((result) => {
            if (result.status !== 'ok') throw new Error(result.message ?? '读不到模型清单');
            savedModel = `${result.provider}::${result.model}`;
            setChoice(savedModel);
            setModels({ kind: 'ready', providers: result.providers });
          })
          .catch((error) => setModels({ kind: 'failed', message: error instanceof Error ? error.message : String(error) }));
      };

      /** The ⋯ opens the one card this block has; clicking it again folds it away. */
      const openMenu = (event) => {
        event.stopPropagation();
        if (menuOpen) {
          closeMenu();
          return;
        }
        setMenuUp(!fitsBelow(event.currentTarget, 270));
        setView('root');
        setHover(null);
        setMenuOpen(true);
        loadModels();
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
            savedModel = value;
            setChoice(value);
            closeMenu();
            // Picking a model on a quiet Turn is itself a request for a block.
            setWanted(true);
            setAttempt((n) => n + 1);
          })
          .catch((error) => {
            setSaving(false);
            setPickerError(error instanceof Error ? error.message : String(error));
          });
      };

      /**
       * The mode menu writes straight through; a failed save puts the old one back.
       * 全部 and 本会话 switch automation on (本会话 for this Session). 手动 undoes
       * whichever of the two this Session is under: off the list while the mode
       * is 本会话, every Session back to manual while it is 全部.
       */
      const chooseMode = (pick) => {
        closeMenu();
        setModeError('');
        const previous = gate;
        let change;
        let local;
        if (pick === 'global') {
          change = { mode: 'global' };
          local = { ...previous, mode: 'global' };
        } else if (pick === 'session') {
          change = { mode: 'session', addSessions: [sessionId] };
          local = { ...previous, mode: 'session', sessions: [...new Set([...previous.sessions, sessionId])] };
        } else if (previous.mode === 'session') {
          change = { removeSessions: [sessionId] };
          local = { ...previous, mode: 'session', sessions: previous.sessions.filter((id) => id !== sessionId) };
        } else {
          change = { mode: 'manual' };
          local = { ...previous, mode: 'manual' };
        }
        setSharedGate(local);
        saveGate(change)
          .then((result) => {
            if (result.status !== 'ok') throw new Error(result.message ?? '没保存上');
            // Switching this Turn to an automatic mode fills in the block the reader
            // is looking at; earlier Turns keep whatever they already had. Only once
            // the save is through: saving restarts the Host half, and a rewrite sent
            // alongside it would land on the instance being torn down.
            if (!started && pick !== 'manual') setWanted(true);
            // The Host answers with the whole gate, other blocks' changes included.
            if (typeof result.mode === 'string' && Array.isArray(result.sessions)) {
              setSharedGate({
                mode: result.mode,
                sessions: result.sessions,
                length: effectiveLength(result),
                language: effectiveLanguage(result),
              });
            }
          })
          .catch((error) => {
            setSharedGate(previous);
            setModeError(error instanceof Error ? error.message : String(error));
          });
      };

      /**
       * The length switch writes through like the mode, and every block follows.
       * The block that was clicked redoes its own Turn so its text matches the
       * new size; untouched Turns keep what they have until opened or refreshed,
       * so one click never re-bills a whole Session. A tier this block already
       * produced is still cached, so switching back and forth costs nothing.
       */
      const chooseLength = (pick) => {
        closeMenu();
        setModeError('');
        const previous = gate;
        setSharedGate({ ...previous, length: pick });
        saveGate({ length: pick })
          .then((result) => {
            if (result.status !== 'ok') throw new Error(result.message ?? '没保存上');
            if (previous.length !== pick && started) setRevision((n) => n + 1);
          })
          .catch((error) => {
            setSharedGate(previous);
            setModeError(error instanceof Error ? error.message : String(error));
          });
      };

      /**
       * The language switch works like the length one: written through for every
       * block, and only the block that was clicked redoes its Turn, so a click
       * never re-bills a whole Session. Both sides of a switch stay cached.
       */
      const chooseLanguage = (pick) => {
        closeMenu();
        setModeError('');
        const previous = gate;
        setSharedGate({ ...previous, language: pick });
        saveGate({ language: pick })
          .then((result) => {
            if (result.status !== 'ok') throw new Error(result.message ?? '没保存上');
            if (previous.language !== pick && started) setRevision((n) => n + 1);
          })
          .catch((error) => {
            setSharedGate(previous);
            setModeError(error instanceof Error ? error.message : String(error));
          });
      };

      /** Clicking anywhere else folds the menu away. */
      useEffect(() => {
        if (!menuOpen) return undefined;
        const close = () => { setMenuOpen(false); setView('root'); };
        document.addEventListener('click', close);
        return () => document.removeEventListener('click', close);
      }, [menuOpen]);

      useEffect(() => {
        if (!usable || !started) return undefined;
        let live = true;
        setPhase({ kind: 'loading' });
        requestRewrite(sessionId, seq, attempt > 0, !wanted)
          .then((result) => {
            if (!live) return;
            if (result.status === 'skip' && result.reason === 'history') {
              // Written before automation was on: fold back to the manual line.
              setHistoric(true);
              setOpen(false);
              return;
            }
            if (result.status === 'skip' && result.reason === 'budget') {
              // Today's automatic spend is spent: one folded line, no card, and a
              // click opens the explanation rather than spending again.
              setPhase({ kind: 'budget', used: result.used, cap: result.cap });
              setOpen(false);
              return;
            }
            if (result.status === 'ok') setPhase({ kind: 'ready', text: result.text, usage: result.usage });
            else if (result.status === 'skip') setPhase({ kind: result.reason === 'too-long' ? 'toolong' : 'none' });
            else setPhase({ kind: 'failed', message: readableError(result.message ?? '') });
          })
          .catch((error) => {
            if (live) setPhase({ kind: 'failed', message: readableError(error instanceof Error ? error.message : String(error)) });
          });
        return () => { live = false; };
      }, [usable, started, sessionId, seq, attempt, revision]);

      const parsed = useMemo(() => (phase.kind === 'ready' ? blocks(phase.text) : []), [phase]);

      // A Turn only grows an entry where a click has something to do: the Host
      // says so, and until it has said so there is no entry to flash up and away.
      if (!usable) return null;
      if (!started && offered !== true) return null;
      // A budget stop belongs to automation: with automation off, the Turn waits
      // for a click like any other and leaves no line behind meanwhile.
      if (phase.kind === 'budget' && !started) return null;
      // Automatic mode keeps a short answer out of the way; a hand-opened block
      // says why it stayed empty instead of vanishing under the reader's finger.
      const quiet = phase.kind === 'none';
      if (quiet && !wanted) return null;

      const ready = phase.kind === 'ready';
      const spent = phase.kind === 'budget';
      const shown = started && open;
      // Folded, the head carries the conclusion itself: the click is only for the rest.
      const folded = shown ? '' : spent ? BUDGET_NOTE : ready ? headline(parsed) : '';
      if (shown) ensureStyle();
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
              h('span', null, '.'),
              h('span', { className: 'ra-dot2' }, '.'),
              h('span', { className: 'ra-dot3' }, '.')))));
      } else if (phase.kind === 'toolong') body.push(h('div', { key: 'long', style: MUTED }, '原文太长，这次没有整理'));
      else if (spent) {
        body.push(h('div', { key: 'spend', style: MUTED },
          `今天自动速览已用 ${formatTokens(phase.used)} / ${formatTokens(phase.cap)} tokens，自动整理先停下，明天恢复。`));
        body.push(h('button', {
          key: 'now',
          style: ACTION,
          onClick: () => { setWanted(true); setAttempt((n) => n + 1); },
        }, '现在整理这一条'));
      }
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

      /**
       * Copy the summary as Markdown, the text the rewrite returned, so it pastes
       * into a note or a message without the block's styling coming along.
       */
      const copySummary = () => {
        copyText(phase.kind === 'ready' ? phase.text : '').then(
          (done) => setCopyState(done ? 'copied' : 'failed'));
      };

      /**
       * The model in force. A save made in this block and one made on the settings
       * page both land here; the page's is written last, so it wins.
       */
      const currentModel = () => (savedModel === '' ? choice : savedModel);

      /** What the model row says: the chosen model's name, or where it stands. */
      const modelLabel = () => {
        const current = currentModel();
        if (current === '') return '未选择';
        const [provider, model] = current.split('::');
        if (models !== null && models.kind === 'ready') {
          for (const entry of models.providers) {
            if (entry.id !== provider) continue;
            for (const candidate of entry.models) if (candidate.id === model) return candidate.name;
          }
        }
        return model ?? choice;
      };

      /** A row that drills into one more list: its current value, then the way in. */
      const valueRow = (key, label, value, into) => h('button', {
        key,
        style: { ...ITEM, ...(hover === key ? ITEM_HOVER : null) },
        onMouseEnter: () => setHover(key),
        onMouseLeave: () => setHover(null),
        onClick: () => {
          setModeError('');
          setPickerError('');
          setHover(null);
          setView(into);
        },
      },
        h('span', { style: ITEM_TEXT }, label),
        value === '' ? null : h('span', { style: ROW_VALUE, title: value }, value),
        h('span', { key: 'in', style: CHECK_SLOT }, h(Chevron, { shown: false })));

      /** The way back out of a drilled-in list. */
      const backRow = h('button', {
        key: 'back',
        style: { ...ITEM, ...(hover === 'back' ? ITEM_HOVER : null) },
        onMouseEnter: () => setHover('back'),
        onMouseLeave: () => setHover(null),
        onClick: () => { setHover(null); setView('root'); },
      },
        h('span', { key: 'out', style: { ...CHECK_SLOT, transform: 'rotate(180deg)' } }, h(Chevron, { shown: false })),
        h('span', { style: ITEM_TEXT }, '返回'));

      /** The card's contents: the four switches, or the list one of them opens. */
      let menuRows;
      if (view === 'mode') {
        const current = gate === null ? null : effectiveMode(gate, sessionId);
        menuRows = [backRow, ...MODE_MENU.map((item) => menuRow(
          item.value, item.label, item.value === current, item.value === hover,
          () => chooseMode(item.value), () => setHover(item.value), () => setHover(null),
        ))];
      } else if (view === 'length') {
        const current = gate === null ? null : effectiveLength(gate);
        menuRows = [backRow, ...LENGTH_MENU.map((item) => menuRow(
          item.value, item.label, item.value === current, item.value === hover,
          () => chooseLength(item.value), () => setHover(item.value), () => setHover(null),
        ))];
      } else if (view === 'language') {
        const current = gate === null ? null : effectiveLanguage(gate);
        menuRows = [backRow, ...LANG_MENU.map((item) => menuRow(
          item.value, item.label, item.value === current, item.value === hover,
          () => chooseLanguage(item.value), () => setHover(item.value), () => setHover(null),
        ))];
      } else if (view === 'model') {
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
                value === currentModel(),
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
        menuRows = [backRow, ...rows];
      } else {
        menuRows = [
          valueRow('mode', '自动速览', gate === null ? '' : MODE_LABEL[effectiveMode(gate, sessionId)] ?? '', 'mode'),
          valueRow('length', '详略', gate === null ? '' : LENGTH_LABEL[effectiveLength(gate)] ?? '', 'length'),
          valueRow('language', '语言', gate === null ? '' : LANG_LABEL[effectiveLanguage(gate)] ?? '', 'language'),
          valueRow('model', '模型', modelLabel(), 'model'),
          h('div', { key: 'split', style: DIVIDER }),
          h('button', {
            key: 'settings',
            style: { ...ITEM, ...(hover === 'settings' ? ITEM_HOVER : null) },
            onMouseEnter: () => setHover('settings'),
            onMouseLeave: () => setHover(null),
            onClick: () => {
              // Leaving the popover open would hang it over the page that replaces
              // the conversation, so it folds away before the panel switches.
              closeMenu();
              openSettingsPage();
            },
          },
            h('span', { style: ITEM_TEXT }, '设置'),
            h('span', { key: 'in', style: CHECK_SLOT }, h(Chevron, { shown: false }))),
        ];
      }

      /**
       * The ⋯ and its card: the switches that used to sit in the head live one
       * level down, so a folded line is just its name and an open one its text.
       */
      const menuControl = h('div', { style: PICKER },
        h('button', {
          style: { ...MORE_BUTTON, opacity: iconHover === 'more' || menuOpen ? 1 : 0.55 },
          title: '速览设置',
          'aria-label': '速览设置',
          'aria-expanded': menuOpen,
          onMouseEnter: () => setIconHover('more'),
          onMouseLeave: () => setIconHover(''),
          onClick: openMenu,
        }, h(MoreIcon)),
        menuOpen
          ? h('div', {
              style: cardStyle(),
              // Clicks inside the card stay inside it: the outside-click closer
              // would otherwise fold it away before a failed save could say why.
              onClick: (event) => event.stopPropagation(),
            }, menuRows)
          : null);

      // A budget stop collapsed is only a line in the page, like an untouched
      // Turn; opening it brings back the card the explanation deserves.
      return h('section', { style: started && !(spent && !shown) ? CARD : BARE },
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
          folded === '' ? null : h('span', { style: SEP, 'aria-hidden': 'true' }),
          folded === '' ? null : h('span', { style: HEAD_NOTE, title: folded }, folded),
          h('span', { style: SPACER }),
          modeError ? h('span', { style: MUTED }, modeError) : null,
          // One ⋯ holds every switch this block has: a folded line is just its
          // name, and the switches come back only when they are asked for.
          menuControl),
        shown ? h('div', { style: BODY, className: 'ra-md' }, body) : null,
        shown && ready
          ? h('div', { style: FOOT },
              cost,
              // The button answers in place: a tick for a moment, a cross if the
              // clipboard refused. Nothing appears next to the cost, so the row
              // never moves and the token count stays where it was.
              h('button', {
                style: { ...ICON_BUTTON, opacity: iconHover === 'copy' || copyState !== '' ? 1 : 0.4 },
                title: copyState === 'copied' ? '已复制' : copyState === 'failed' ? '复制失败' : '复制速览',
                'aria-label': copyState === 'copied' ? '已复制' : copyState === 'failed' ? '复制失败' : '复制速览',
                onMouseEnter: () => setIconHover('copy'),
                onMouseLeave: () => setIconHover(''),
                onClick: copySummary,
              }, copyState === 'copied' ? h(CheckIcon) : copyState === 'failed' ? h(CrossIcon) : h(CopyIcon)),
              h('button', {
                style: { ...ICON_BUTTON, opacity: iconHover === 'refresh' ? 1 : 0.4 },
                title: '重新整理这一条',
                'aria-label': '重新整理这一条',
                onMouseEnter: () => setIconHover('refresh'),
                onMouseLeave: () => setIconHover(''),
                onClick: () => setAttempt((n) => n + 1),
              }, h(RefreshIcon)))
          : null);
    }

    /**
     * One row of the settings page as text, so a number can be cleared and retyped
     * without the field fighting back.
     * @param settings - the rows the Host answered with.
     */
    function draftOf(settings) {
      const text = (value) => (typeof value === 'number' && Number.isFinite(value) ? String(value) : '');
      return {
        temperature: text(settings?.temperature),
        ratio: text(settings?.ratio),
        capChars: text(settings?.capChars),
        minChars: text(settings?.minChars),
        maxChars: text(settings?.maxChars),
        dailyTokenCap: text(settings?.dailyTokenCap),
        prompt: typeof settings?.prompt === 'string' ? settings.prompt : '',
      };
    }

    /** The smallest budget the Host leaves room for; the page checks the same floor. */
    const MIN_BUDGET = 150;
    /** The longest prompt the Host accepts. */
    const MAX_PROMPT_CHARS = 8000;

    /**
     * The draft as the Host's rows, or the first thing wrong with it. The Host checks
     * all of this as well; checking here answers a typo beside the field instead of
     * after a round trip.
     * @param draft - the page's text fields.
     */
    function readDraft(draft) {
      const number = (label, field, test, hint) => {
        const raw = String(draft[field] ?? '').trim();
        if (raw === '') throw new Error(`${label}不能为空`);
        const value = Number(raw);
        if (!Number.isFinite(value) || !test(value)) throw new Error(`${label}${hint}`);
        return value;
      };
      const prompt = String(draft.prompt ?? '').trim();
      if (prompt === '') throw new Error('提示词不能为空');
      if (prompt.length > MAX_PROMPT_CHARS) throw new Error(`提示词最多 ${MAX_PROMPT_CHARS} 字`);
      const rows = {
        temperature: number('温度', 'temperature', (value) => value >= 0 && value <= 2, '要在 0 到 2 之间'),
        ratio: number('普通档比例', 'ratio', (value) => value > 0 && value < 1, '要大于 0 且小于 1'),
        capChars: number('普通档上限', 'capChars', (value) => Number.isSafeInteger(value) && value >= MIN_BUDGET, `要是不小于 ${MIN_BUDGET} 的整数`),
        minChars: number('最短字数', 'minChars', (value) => Number.isSafeInteger(value) && value >= 0, '要是不小于 0 的整数'),
        maxChars: number('最长字数', 'maxChars', (value) => Number.isSafeInteger(value) && value >= 0, '要是不小于 0 的整数'),
        dailyTokenCap: number('每日上限', 'dailyTokenCap', (value) => Number.isSafeInteger(value) && value >= 0, '要是不小于 0 的整数'),
      };
      if (rows.minChars > rows.maxChars) throw new Error('最短字数不能大于最长字数');
      // The longest field is spelled the way the Host wants it, ready to send.
      return { ...rows, prompt: draft.prompt };
    }

    /**
     * The plugin's own settings page. The ⋯ menu edits one switch at a time in a
     * popover; this page puts every row the bundle owns in one place, including the
     * prompt and the budget numbers a popover has no room for. It holds nothing
     * Session-scoped: the automatic-rewrite scope stays in the block's own menu.
     */
    function SettingsPage() {
      const [state, setState] = useState({ kind: 'loading' });
      const [draft, setDraft] = useState(null);
      const [model, setModel] = useState('');
      const [models, setModels] = useState(null);
      const [length, setLength] = useState('normal');
      const [language, setLanguage] = useState('auto');
      const [saving, setSaving] = useState(false);
      const [error, setError] = useState('');
      const [note, setNote] = useState('');

      /** The rows and the catalog arrive together: the model row needs both. */
      const load = () => {
        setState({ kind: 'loading' });
        setError('');
        Promise.all([requestGate(), requestModels()]).then(
          ([gate, catalog]) => {
            if (gate.status !== 'ok') throw new Error(gate.message ?? '读不到设置');
            if (catalog.status !== 'ok') throw new Error(catalog.message ?? '读不到模型清单');
            setDraft(draftOf(gate.settings));
            setLength(effectiveLength(gate));
            setLanguage(effectiveLanguage(gate));
            // No model chosen yet is a real state: the row must stay empty rather
            // than become a `::` pair the Host would refuse.
            setModel(catalog.provider === '' || catalog.model === '' ? '' : `${catalog.provider}::${catalog.model}`);
            setModels({ providers: catalog.providers });
            setState({ kind: 'ready' });
          },
          (failure) => setState({
            kind: 'failed',
            message: failure instanceof Error ? failure.message : String(failure),
          }),
        );
      };

      useEffect(() => { ensureStyle(); load(); }, []);

      /** A field being retyped: the note and the complaint go as soon as it changes. */
      const edit = (field) => (event) => {
        const value = event.target.value;
        setDraft((current) => ({ ...current, [field]: value }));
        setError('');
        setNote('');
      };

      /** Save every row at once: one write, one answer, and no restart in between. */
      const save = () => {
        if (saving) return;
        let rows;
        try {
          rows = readDraft(draft);
        } catch (failure) {
          setError(failure instanceof Error ? failure.message : String(failure));
          return;
        }
        setSaving(true);
        setError('');
        setNote('');
        const [provider, id] = model.split('::');
        saveGate({
          ...rows,
          length,
          language,
          // The pair is the one thing the Host will not take half of.
          ...(provider === undefined || id === undefined ? null : { provider, model: id }),
        })
          .then((result) => {
            if (result.status !== 'ok') throw new Error(result.message ?? '没保存上');
            setSaving(false);
            savedModel = model;
            // The reply is every row as it now stands: open blocks read it from the
            // shared gate, so their menus are current the moment the reader returns.
            publishGate(result);
            if (result.settings !== undefined) setDraft(draftOf(result.settings));
            setNote('已保存');
          })
          .catch((failure) => {
            setSaving(false);
            setError(failure instanceof Error ? failure.message : String(failure));
          });
      };

      /** One pill per choice, the one in force filled in. */
      const chips = (menu, current, choose) => h('div', { className: 'ra-set-chips' },
        menu.map((item) => h('button', {
          key: item.value,
          className: 'ra-set-chip',
          'data-on': item.value === current ? 'true' : 'false',
          onClick: () => {
            choose(item.value);
            setError('');
            setNote('');
          },
        }, item.label)));

      /** A labelled row: the words on the left, the control on the right. */
      const line = (key, label, control, sub) => h('div', { key, className: 'ra-set-row' },
        h('span', { className: 'ra-set-label' },
          label,
          sub === undefined ? null : h('span', { className: 'ra-set-sub' }, sub)),
        control);

      /** A number the page treats as text until it is saved. */
      const numberField = (key, label, sub) => line(key, label, h('input', {
        className: 'ra-set-field',
        'data-width': 'num',
        type: 'text',
        inputMode: 'decimal',
        spellCheck: false,
        value: draft?.[key] ?? '',
        onChange: edit(key),
      }), sub);

      /** What the page shows under its title bar. */
      let body;
      if (state.kind === 'loading') {
        body = h('p', { className: 'ra-set-hint' }, '读取设置…');
      } else if (state.kind === 'failed') {
        body = [
          h('p', { key: 'error', className: 'ra-set-error' }, state.message),
          h('button', { key: 'retry', className: 'ra-set-back', onClick: load }, '重试'),
        ];
      } else {
        body = [
          error === '' ? null : h('p', { key: 'error', className: 'ra-set-error' }, error),
          h('section', { key: 'model', className: 'ra-set-group' },
            h('div', { className: 'ra-set-head' }, '模型'),
            h('p', { className: 'ra-set-hint' }, '用哪个模型写速览，取自当前可用的模型清单。'),
            h('div', { className: 'ra-set-row' }, h('select', {
              className: 'ra-set-field',
              'data-width': 'wide',
              value: model,
              onChange: (event) => { setModel(event.target.value); setError(''); setNote(''); },
            },
              h('option', { value: '' }, '尚未选择'),
              (models?.providers ?? []).map((provider) => h('optgroup', { key: provider.id, label: provider.name },
                provider.models.map((candidate) => h('option', {
                  key: candidate.id,
                  value: `${provider.id}::${candidate.id}`,
                }, candidate.name))))))),
          h('section', { key: 'shape', className: 'ra-set-group' },
            h('div', { className: 'ra-set-head' }, '详略与语言'),
            h('p', { className: 'ra-set-hint' }, '自动整理的范围（全部、本会话、手动）按会话算，仍在每条速览右上角的 ⋯ 里切换。'),
            line('length', '详略', chips(LENGTH_MENU, length, setLength)),
            line('language', '语言', chips(LANG_MENU, language, setLanguage))),
          h('section', { key: 'prompt', className: 'ra-set-group' },
            h('div', { className: 'ra-set-head' }, '提示词'),
            h('p', { className: 'ra-set-hint' }, `交给模型的要求，决定速览怎么写。最多 ${MAX_PROMPT_CHARS} 字。`),
            h('textarea', {
              className: 'ra-set-area',
              spellCheck: false,
              maxLength: MAX_PROMPT_CHARS,
              value: draft?.prompt ?? '',
              onChange: edit('prompt'),
            })),
          h('section', { key: 'budget', className: 'ra-set-group' },
            h('div', { className: 'ra-set-head' }, '字数与温度'),
            h('p', { className: 'ra-set-hint' }, '速览太短会被丢掉，太长会按上限截断；丢掉的那条改为手动点开。'),
            numberField('minChars', '最短字数', '短于这个就丢掉'),
            numberField('maxChars', '最长字数', '长于这个就截断'),
            numberField('temperature', '温度', '0 最贴原文，2 最自由')),
          h('section', { key: 'tier', className: 'ra-set-group' },
            h('div', { className: 'ra-set-head' }, '普通档的篇幅'),
            h('p', { className: 'ra-set-hint' }, '只影响普通档：按原文比例估字数，再用上限兜底。详细档不看这两项，固定按一半比例、最多 1600 字。'),
            numberField('ratio', '比例', '0 到 1 之间，如 0.3'),
            numberField('capChars', '上限', `不小于 ${MIN_BUDGET} 的整数`)),
          h('section', { key: 'cap', className: 'ra-set-group' },
            h('div', { className: 'ra-set-head' }, '每天最多用'),
            h('p', { className: 'ra-set-hint' }, '自动速览当天的 token 用量上限，0 表示不限。只拦自动的；手动点开的不拦，但同样计入当天用量。'),
            numberField('dailyTokenCap', '每日上限', 'tokens，0 表示不限')),
        ];
      }

      return h('div', { className: 'ra-set-page' },
        h('div', { className: 'ra-set-bar' },
          h('button', { className: 'ra-set-back', onClick: returnToConversation },
            h('span', { style: { display: 'inline-flex', transform: 'rotate(180deg)' } }, h(Chevron, { shown: false })),
            h('span', null, '返回对话')),
          h('span', { className: 'ra-set-title' }, '速览设置'),
          h('span', { className: 'ra-set-fill' }),
          note === '' ? null : h('span', { className: 'ra-set-note' }, note),
          h('button', {
            className: 'ra-set-save',
            disabled: saving || state.kind !== 'ready',
            onClick: save,
          }, saving ? '保存中…' : '保存')),
        h('div', { className: 'ra-set-body' }, body));
    }

    // The test suite reaches the pure helpers through this hook; the app never sets it.
    if (typeof window.__DSH_INTERPRETER_TEST__ === 'function') {
      window.__DSH_INTERPRETER_TEST__({ blocks, inline, safeHref, tableCells, effectiveMode, effectiveLength, effectiveLanguage, renderBlock, readReply, headline, probeTurn, copyText, draftOf, readDraft });
    }

    return {
      inject: ['slots', 'layout'],
      apply(ctx) {
        ctx.slots.inject('conversation.chat.turnTail', () => ctx.slots.register({
          name: 'conversation.chat.turnTail',
          id: 'interpreter',
          order: 10,
          inject: (sessionId) => ({ sessionId }),
        }, Interpreter));
        ctx.slots.inject('main', () => ctx.slots.register({
          name: 'main',
          key: SETTINGS_PANEL,
          inject: () => ({}),
        }, SettingsPage));
        // Reaching the page is one panel switch; the block's entry row does it, and
        // the page's own 返回对话 undoes it. Wired after the key is registered, so
        // neither call can land on a panel the app does not know.
        openSettingsPage = () => {
          if (typeof ctx.layout?.selectPanel === 'function') ctx.layout.selectPanel(SETTINGS_PANEL);
        };
        returnToConversation = () => {
          if (typeof ctx.layout?.selectPanel === 'function') ctx.layout.selectPanel(null);
        };
      },
    };
  },
});
