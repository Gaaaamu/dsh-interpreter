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
    // The app's own dialog primitives. The settings panel is a Modal like the
    // app's other dialogs: a small card over a dimmed page, Esc and focus handled
    // by the shell instead of by a hand-rolled overlay.
    const { Button, Modal } = require('@deepseek-ai/dsh-client-ui-primitives');
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
/* The settings dialog is the app's own Modal: a compact card over a dimmed
   conversation, with grouped rows and a fixed header / footer. The doubled
   selectors beat the Modal's card geometry, which is a single class in a sheet
   that may arrive after this one. The Modal's content element wraps both the
   title bar and the body, so only its last child — the body, which has no
   class to hook — scrolls, and the title and close button stay put. */
.ra-set-dialog.ra-set-dialog{width:min(520px,calc(100vw - 32px));max-width:min(520px,calc(100vw - 32px));max-height:min(740px,calc(100vh - 64px));-webkit-app-region:no-drag}
.ra-set-content.ra-set-content{display:flex;flex-direction:column;min-height:0;overflow:hidden}
.ra-set-content.ra-set-content > div:last-child{flex:1 1 auto;min-height:0;overflow-y:auto;overscroll-behavior:contain}
.ra-set-body{display:flex;flex-direction:column;gap:18px;padding:2px 0 4px}
.ra-set-section{display:flex;flex-direction:column;gap:8px}
.ra-set-sec-bar{display:flex;align-items:center;gap:8px;padding:0 2px}
.ra-set-head{font-size:12px;font-weight:500;color:var(--dsw-alias-label-secondary,inherit)}
.ra-set-sec-meta{margin-left:auto;display:inline-flex;align-items:center;gap:10px;font-size:11px;font-variant-numeric:tabular-nums;color:var(--dsw-alias-label-caption,var(--dsw-alias-label-secondary,inherit))}
.ra-set-count[data-over=true]{color:var(--dsw-alias-state-error-primary,#d94a4a)}
.ra-set-reset{padding:0;border:0;background:transparent;cursor:pointer;font:inherit;font-size:11px;color:var(--dsw-alias-label-secondary,inherit);transition:color 120ms ease}
.ra-set-reset:hover{color:var(--dsw-alias-label-primary,inherit);text-decoration:underline;text-underline-offset:2px}
.ra-set-card{display:flex;flex-direction:column;border-radius:12px;background:var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,.07));border:.5px solid var(--dsw-alias-border-l1,rgba(128,128,128,.16))}
.ra-set-row{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px 14px;min-height:44px;padding:8px 14px;box-sizing:border-box;transition:opacity 140ms ease}
.ra-set-row+.ra-set-row{border-top:.5px solid var(--dsw-alias-border-l1,rgba(128,128,128,.14))}
.ra-set-row[data-dim=true]{opacity:.5}
.ra-set-row[data-dim=true]:hover,.ra-set-row[data-dim=true]:focus-within{opacity:1}
.ra-set-label{flex:0 0 auto;display:inline-flex;align-items:center;gap:5px;font-size:13px;font-weight:400;color:var(--dsw-alias-label-primary,inherit);white-space:nowrap}
.ra-set-tip{position:relative;display:inline-flex;align-items:center;justify-content:center;width:16px;height:16px;padding:0;border:0;border-radius:50%;background:transparent;color:var(--dsw-alias-label-caption,var(--dsw-alias-label-secondary,inherit));cursor:default;outline:none;transition:color 120ms ease}
.ra-set-tip svg{opacity:.68;transition:opacity 120ms ease}
.ra-set-tip:hover,.ra-set-tip:focus-visible{color:var(--dsw-alias-label-primary,inherit)}
.ra-set-tip:hover svg,.ra-set-tip:focus-visible svg{opacity:1}
.ra-set-tip-pop{position:absolute;bottom:calc(100% + 7px);left:-8px;z-index:40;width:max-content;max-width:252px;padding:7px 10px;border-radius:8px;background:var(--dsw-alias-bg-layer-3,#363639);border:.5px solid var(--dsw-alias-border-l2,rgba(128,128,128,.3));box-shadow:var(--dsw-elevation-prominent,0 8px 24px rgba(0,0,0,.38));font-size:12px;font-weight:400;line-height:1.5;white-space:normal;text-align:left;color:var(--dsw-alias-label-primary,inherit);pointer-events:none;visibility:hidden;opacity:0;transform:translateY(3px);transition:opacity 110ms ease,transform 110ms ease,visibility 0s linear 110ms}
.ra-set-tip:hover .ra-set-tip-pop,.ra-set-tip:focus-visible .ra-set-tip-pop{visibility:visible;opacity:1;transform:translateY(0);transition:opacity 110ms ease,transform 110ms ease,visibility 0s}
.ra-set-ctl{display:flex;align-items:center;justify-content:flex-end;flex-wrap:wrap;gap:8px;min-width:0;flex:1 1 auto}
.ra-set-pair{display:inline-flex;align-items:center;gap:6px}
.ra-set-pair+.ra-set-pair{margin-left:4px}
.ra-set-inline-lbl{font-size:12px;font-family:var(--ds-font-family-code,ui-monospace,monospace);color:var(--dsw-alias-label-secondary,inherit);white-space:nowrap}
.ra-set-badge{font-size:11px;font-variant-numeric:tabular-nums;color:var(--dsw-alias-label-caption,var(--dsw-alias-label-secondary,inherit));white-space:nowrap}
.ra-set-num-wrap{display:inline-flex;align-items:center;height:30px;padding:0 8px;gap:4px;box-sizing:border-box;border:.5px solid var(--dsw-alias-border-l2,rgba(128,128,128,.26));border-radius:var(--dsw-radius-sm,7px);background:var(--dsw-alias-bg-layer-1,rgba(128,128,128,.08));transition:border-color 120ms ease,box-shadow 120ms ease}
.ra-set-num-wrap:focus-within{border-color:var(--dsw-alias-label-secondary,rgba(160,160,160,.55));box-shadow:0 0 0 2px var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,.16))}
.ra-set-num{width:54px;min-width:0;padding:0;border:0;outline:none;background:transparent;font:inherit;font-size:13px;font-variant-numeric:tabular-nums;text-align:right;color:var(--dsw-alias-label-primary,inherit)}
.ra-set-num[data-w=xs]{width:42px}
.ra-set-num[data-w=sm]{width:50px}
.ra-set-num[data-w=md]{width:66px}
.ra-set-num[data-w=lg]{width:76px}
.ra-set-unit{flex:none;font-size:12px;color:var(--dsw-alias-label-caption,var(--dsw-alias-label-secondary,inherit));user-select:none}
.ra-set-seg{display:inline-flex;align-items:center;gap:2px;padding:2px;border-radius:8px;background:var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,.12));border:.5px solid var(--dsw-alias-border-l1,rgba(128,128,128,.16))}
.ra-set-seg-btn{height:26px;padding:0 12px;border:0;border-radius:6px;background:transparent;cursor:pointer;font:inherit;font-size:12px;font-weight:400;color:var(--dsw-alias-label-secondary,inherit);transition:background 120ms ease,color 120ms ease,box-shadow 120ms ease;white-space:nowrap}
.ra-set-seg-btn:hover{color:var(--dsw-alias-label-primary,inherit)}
.ra-set-seg-btn[data-on=true]{background:var(--dsw-alias-bg-layer-3,rgba(255,255,255,.16));color:var(--dsw-alias-label-primary,inherit);font-weight:500;box-shadow:0 1px 2px rgba(0,0,0,.12),0 0 0 .5px var(--dsw-alias-border-l2,rgba(128,128,128,.24))}
.ra-set-sel{position:relative;flex:0 1 268px;min-width:160px;max-width:268px}
.ra-set-sel-btn{display:flex;align-items:center;justify-content:space-between;gap:8px;width:100%;height:30px;padding:0 9px 0 10px;box-sizing:border-box;border:.5px solid var(--dsw-alias-border-l2,rgba(128,128,128,.26));border-radius:var(--dsw-radius-sm,7px);background:var(--dsw-alias-bg-layer-1,rgba(128,128,128,.08));cursor:pointer;font:inherit;font-size:13px;color:var(--dsw-alias-label-primary,inherit);text-align:left;transition:border-color 120ms ease,box-shadow 120ms ease}
.ra-set-sel-btn:hover{border-color:var(--dsw-alias-border-l3,rgba(128,128,128,.38))}
.ra-set-sel-btn[aria-expanded=true]{border-color:var(--dsw-alias-label-secondary,rgba(160,160,160,.55));box-shadow:0 0 0 2px var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,.16))}
.ra-set-sel-val{display:flex;align-items:baseline;gap:6px;min-width:0;flex:1 1 auto;overflow:hidden}
.ra-set-sel-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ra-set-sel-name[data-empty=true]{color:var(--dsw-alias-label-caption,var(--dsw-alias-label-secondary,inherit))}
.ra-set-sel-prov{flex:0 1 auto;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:11px;color:var(--dsw-alias-label-caption,var(--dsw-alias-label-secondary,inherit))}
.ra-set-sel-caret{flex:none;display:inline-flex;color:var(--dsw-alias-label-secondary,inherit);transition:transform 140ms ease}
.ra-set-sel-btn[aria-expanded=true] .ra-set-sel-caret{transform:rotate(180deg)}
.ra-set-sel-menu{position:absolute;top:calc(100% + 6px);right:0;min-width:100%;max-width:min(340px,80vw);max-height:240px;overflow-y:auto;overscroll-behavior:contain;z-index:30;padding:4px;box-sizing:border-box;border-radius:11px;background:var(--dsw-alias-bg-layer-2,#2c2c2e);border:.5px solid var(--dsw-alias-border-l2,rgba(128,128,128,.24));box-shadow:var(--dsw-elevation-prominent,0 8px 24px rgba(0,0,0,.28))}
.ra-set-sel-grp{padding:6px 10px 3px;font-size:11px;font-weight:500;color:var(--dsw-alias-label-caption,var(--dsw-alias-label-secondary,inherit));user-select:none}
.ra-set-sel-grp:not(:first-child){margin-top:4px;padding-top:7px;border-top:.5px solid var(--dsw-alias-border-l1,rgba(128,128,128,.16))}
.ra-set-sel-opt{display:flex;align-items:center;gap:8px;width:100%;padding:7px 10px;border:0;border-radius:7px;background:transparent;cursor:pointer;font:inherit;font-size:13px;text-align:left;color:var(--dsw-alias-label-secondary,inherit);transition:background 100ms ease,color 100ms ease}
.ra-set-sel-opt:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,.14));color:var(--dsw-alias-label-primary,inherit)}
.ra-set-sel-opt[data-on=true]{color:var(--dsw-alias-label-primary,inherit);font-weight:500}
.ra-set-sel-opt-text{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ra-set-sel-empty{padding:12px 10px;font-size:12px;text-align:center;color:var(--dsw-alias-label-secondary,inherit)}
.ra-set-slider{flex:0 1 132px;width:132px;height:4px;-webkit-appearance:none;appearance:none;border-radius:999px;background:var(--dsw-alias-border-l2,rgba(128,128,128,.28));outline:none;cursor:pointer}
.ra-set-slider::-webkit-slider-thumb{-webkit-appearance:none;appearance:none;width:14px;height:14px;border-radius:50%;background:var(--dsw-alias-label-primary,#e5e5e5);border:2px solid var(--dsw-alias-bg-layer-2,#262626);box-shadow:0 1px 3px rgba(0,0,0,.3);transition:transform 100ms ease}
.ra-set-slider::-webkit-slider-thumb:hover{transform:scale(1.12)}
.ra-set-area{box-sizing:border-box;width:100%;min-height:144px;max-height:320px;resize:vertical;padding:11px 13px;border:.5px solid var(--dsw-alias-border-l2,rgba(128,128,128,.22));border-radius:12px;outline:none;font-family:var(--dsw-font-family,system-ui,-apple-system,sans-serif);font-size:13px;line-height:1.65;color:var(--dsw-alias-label-primary,inherit);background:var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,.07));transition:border-color 120ms ease,box-shadow 120ms ease,background 120ms ease}
.ra-set-area::-webkit-scrollbar,.ra-set-sel-menu::-webkit-scrollbar,.ra-set-content.ra-set-content > div:last-child::-webkit-scrollbar{width:6px;height:6px}
.ra-set-area::-webkit-scrollbar-thumb,.ra-set-sel-menu::-webkit-scrollbar-thumb,.ra-set-content.ra-set-content > div:last-child::-webkit-scrollbar-thumb{border-radius:999px;background:var(--dsw-alias-border-l2,rgba(128,128,128,.32))}
.ra-set-area::-webkit-scrollbar-track,.ra-set-sel-menu::-webkit-scrollbar-track,.ra-set-content.ra-set-content > div:last-child::-webkit-scrollbar-track{background:transparent}
.ra-set-area:focus{border-color:var(--dsw-alias-label-secondary,rgba(160,160,160,.55));background:var(--dsw-alias-bg-layer-1,rgba(128,128,128,.08));box-shadow:0 0 0 2px var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,.16))}
.ra-set-foot{display:flex;flex-direction:column;gap:10px;width:100%}
.ra-set-actions{display:flex;align-items:center;justify-content:flex-end;gap:8px;min-width:0}
.ra-set-error{margin:0;padding:8px 12px;border-radius:var(--dsw-radius-md,8px);font-size:12px;line-height:1.5;background:var(--dsw-alias-state-error-bg,rgba(220,60,60,.12));color:var(--dsw-alias-state-error-primary,#d94a4a)}
.ra-set-failed{display:flex;flex-direction:column;align-items:flex-start;gap:12px;padding:6px 0}
.ra-set-skel-stack{display:flex;flex-direction:column;gap:16px;padding:4px 0}
.ra-set-skel{border-radius:12px;background:var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,.08));animation:ra-set-pulse 1.4s ease-in-out infinite}
@keyframes ra-set-pulse{0%,100%{opacity:.5}50%{opacity:.9}}
@media(prefers-reduced-motion:reduce){.ra-set-skel{animation:none}}
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
    /**
     * The built-in prompt in force, in the same words the Host stores. 基准 runs the
     * reader's own prompt when they wrote one, so the menu then calls it 自定义.
     */
    const VARIANT_LABEL = { baseline: '基准', roles: '角色版' };
    const VARIANT_MENU = [
      { value: 'baseline', label: '基准' },
      { value: 'roles', label: '角色版（实验）' },
    ];
    /** The answer's own language, or one fixed, in the same three words the Host stores. */
    const LANG_LABEL = { auto: '跟随', zh: '中文', en: '英文' };
    const LANG_MENU = [
      { value: 'auto', label: '跟随原文' },
      { value: 'zh', label: '中文' },
      { value: 'en', label: '英文' },
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
      // The block's own footer draws the cost and the two icon buttons at an
      // opacity below 1, and a translucent element is a layer of its own. Those
      // layers come later in the document, so without this the card would slide
      // under them; a positive z-index keeps it on top wherever it is opened.
      zIndex: 20,
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
      // Its own cursor: bold and italic read their words with this same
      // function, and a shared one would send the outer run back to the start.
      const pattern = new RegExp(INLINE.source, 'g');
      while ((match = pattern.exec(text)) !== null) {
        if (match.index > last) out.push(text.slice(last, match.index));
        const token = match[0];
        const key = `${prefix}-${match.index}`;
        let used = token.length;
        // Code, links and the like inside bold keep their own look.
        if (token.startsWith('**')) out.push(h('strong', { key }, inline(token.slice(2, -2), key)));
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
        } else out.push(h('em', { key }, inline(token.slice(1, -1), key)));
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
     * Change the mode, the allow-list, the length tier, the language or the
     * built-in prompt. Only the change travels, never the whole list: every block
     * holds its own copy, and a stale copy sent back would wipe out what another
     * block added.
     * @param change - `{ mode?, addSessions?, removeSessions?, length?, language?, variant? }`.
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

    /**
     * The built-in prompt a gate names, standing in with 基准 for anything else: an
     * older Host, or a row written by hand in a newer vocabulary.
     */
    function effectiveVariant(gate) {
      return VARIANT_LABEL[gate?.variant] === undefined ? 'baseline' : gate.variant;
    }

    /** The gate's switches as every block shares them, read from a Host reply. */
    function gateOf(reply, previous) {
      return {
        mode: typeof reply.mode === 'string' ? reply.mode : previous?.mode ?? 'manual',
        sessions: Array.isArray(reply.sessions) ? reply.sessions : previous?.sessions ?? [],
        length: effectiveLength(reply),
        language: effectiveLanguage(reply),
        variant: effectiveVariant(reply),
        ownPrompt: typeof reply.ownPrompt === 'boolean' ? reply.ownPrompt : previous?.ownPrompt === true,
      };
    }

    /** 12431 is harder to take in at a glance than 12.4k. */
    function formatTokens(count) {
      if (typeof count !== 'number' || !Number.isFinite(count) || count <= 0) return '';
      if (count < 1000) return String(count);
      return `${Math.round((count / 1000) * 10) / 10}k`;
    }

    /**
     * A call's tokens as the reader can add them up. DeepSeek Harness counts
     * cached prompt tokens apart from the input and folds thinking into the
     * output, so the prompt is shown whole with its cached part, and the output
     * with its thinking part: input and output then make the total.
     * @param usage - the Host's token accounting for one call or a pair.
     */
    function usageWords(usage) {
      const cached = usage.cacheReadTokens ?? 0;
      const prompt = usage.inputTokens + cached + (usage.cacheWriteTokens ?? 0);
      const thinking = usage.reasoningTokens ?? 0;
      return `输入 ${prompt}${cached > 0 ? `（缓存命中 ${cached}）` : ''} · 输出 ${usage.outputTokens}${thinking > 0 ? `（思考 ${thinking}）` : ''} · 合计 ${usage.totalTokens}`;
    }

    /** Seconds of waiting not worth mentioning: most rewrites are back before this. */
    const QUIET_WAIT_SECONDS = 10;

    /** The wait beside 「整理中」, in the caption's voice. */
    const WAITED = { marginLeft: 8, color: 'var(--dsw-alias-label-secondary, inherit)' };

    /**
     * How long a rewrite has been waited on, once it is long enough to say:
     * 「已等 45 秒」, then 「已等 2 分 5 秒」.
     * @param since - when the request went out, in milliseconds.
     * @param now - the time to measure to.
     */
    function waitedWords(since, now) {
      if (typeof since !== 'number') return '';
      const seconds = Math.floor((now - since) / 1000);
      if (seconds < QUIET_WAIT_SECONDS) return '';
      return seconds < 60 ? `已等 ${seconds} 秒` : `已等 ${Math.floor(seconds / 60)} 分 ${seconds % 60} 秒`;
    }

    /** What each call of a rewrite was for, in the reader's words. */
    const CALL_LABEL = { draft: '初稿', tighten: '再压一遍', repair: '按排版问题重写' };

    /** The layout code decided, or that it decided none. */
    function layoutWords(trace) {
      const outline = trace.outline;
      if (outline === null || outline === undefined) return '不由代码定版式';
      const sections = outline.sections.length;
      const read = sections === 0 ? '原文没有分节' : `原文 ${sections} 节`;
      return `${outline.blocks ? '分块' : '不分块'}（${read}${outline.asks ? '，末尾在等读者决定' : ''}）`;
    }

    /**
     * One line on how a rewrite was made, for the cost's tooltip: the layout,
     * how many calls, and which draft was kept.
     * @param trace - what the Host recorded, or nothing from an older Host.
     */
    function traceLine(trace) {
      if (trace === null || typeof trace !== 'object' || !Array.isArray(trace.calls)) return '';
      const parts = [VARIANT_LABEL[trace.variant] ?? trace.variant, layoutWords(trace)];
      const [draft, second] = trace.calls;
      if (draft !== undefined) {
        const found = draft.problems?.length ?? 0;
        parts.push(`初稿 ${draft.chars} 字${draft.over ? '，超预算' : ''}${found > 0 ? `，${found} 处排版问题` : ''}`);
      }
      if (second === undefined) parts.push('1 次调用');
      else if (second.failed !== undefined) parts.push(`${CALL_LABEL[second.kind] ?? second.kind}失败，用初稿`);
      else parts.push(`${CALL_LABEL[second.kind] ?? second.kind}后 ${second.chars} 字，用${trace.kept === 2 ? '第二稿' : '初稿'}`);
      return parts.join(' · ');
    }

    /**
     * The whole record of a rewrite as Markdown, to copy and read side by side
     * with the 速览: the budget, the layout and the words that told the model
     * about it, each call with what code found in its draft, and the first draft
     * when a second call replaced or tried to replace it.
     * @param trace - what the Host recorded.
     */
    function traceText(trace) {
      if (trace === null || typeof trace !== 'object' || !Array.isArray(trace.calls)) return '';
      const lines = [
        '# 速览生成过程',
        '',
        `- 写法：${VARIANT_LABEL[trace.variant] ?? trace.variant}`,
        `- 原文 ${trace.original} 字，预算 ${trace.budget} 字`,
        `- 版式：${layoutWords(trace)}`,
      ];
      const sections = trace.outline?.sections ?? [];
      if (sections.length > 0) lines.push(`- 原文各节：${sections.map((title) => `「${title}」`).join('、')}`);
      if (trace.hint) lines.push(`- 告诉模型的版式：${trace.hint}`);
      trace.calls.forEach((call, at) => {
        lines.push('', `## 第 ${at + 1} 次调用：${CALL_LABEL[call.kind] ?? call.kind}`, '');
        if (call.instruction) lines.push(`- 指令：${call.instruction}`);
        if (call.effort) lines.push(`- 思考档位：${call.effort}`);
        if (call.failed !== undefined) {
          lines.push(`- 失败：${call.failed}`);
          return;
        }
        lines.push(`- 结果 ${call.chars} 字${call.over ? '，超过预算 1.5 倍' : ''}`);
        if (call.problems.length <= 1) lines.push(`- 代码查出的排版问题：${call.problems[0] ?? '无'}`);
        else lines.push(`- 代码查出 ${call.problems.length} 处排版问题：`, ...call.problems.map((problem) => `  - ${problem}`));
        if (call.usage) lines.push(`- tokens：${usageWords(call.usage)}`);
      });
      lines.push('', `最后用的是${trace.kept === 2 ? '第二稿' : '初稿'}。`);
      if (typeof trace.firstDraft === 'string') lines.push('', '## 初稿全文', '', trace.firstDraft);
      return lines.join('\n');
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
     * Whether the settings dialog is open. One flag for the whole page: the block's
     * ⋯ menu raises it from any Turn, the dialog's close button, Esc and a click on
     * the mask lower it, and the `shell.overlay` entry that paints the dialog is the
     * only thing that reads it.
     */
    const settingsStore = { open: false, listeners: new Set() };

    function setSettingsOpen(open) {
      settingsStore.open = open;
      for (const listener of settingsStore.listeners) listener(open);
    }

    /** Raise the dialog; the overlay entry renders it over the conversation. */
    function openSettingsDialog() {
      setSettingsOpen(true);
    }

    /** Lower it, leaving the conversation underneath exactly as it was. */
    function closeSettingsDialog() {
      setSettingsOpen(false);
    }

    /** The flag as the dialog reads it. */
    function useSettingsOpen() {
      const [open, setOpen] = useState(settingsStore.open);
      useEffect(() => {
        settingsStore.listeners.add(setOpen);
        setOpen(settingsStore.open);
        return () => { settingsStore.listeners.delete(setOpen); };
      }, []);
      return open;
    }

    /**
     * Where a settings-dialog save leaves the chosen rewrite model. The model row is
     * the one switch the block does not share through `gateStore` (the catalog read
     * owns it), so the dialog hands it back here and a block that opens its ⋯ menu
     * afterwards names the new model. Set as the save lands, before the dialog closes.
     */
    let savedModel = '';

    /** The id of the one sheet every block shares. */
    const STYLE_ID = 'dsh-interpreter-css';

    /**
     * Put the block's sheet in the page once, however many blocks are open. Every
     * rule is scoped under `ra-` classes, so nothing in it reaches the app.
     */
    function ensureStyle() {
      if (typeof document === 'undefined') return;
      let sheet = document.getElementById(STYLE_ID);
      if (sheet === null) {
        sheet = document.createElement('style');
        sheet.id = STYLE_ID;
        document.head.appendChild(sheet);
      }
      if (sheet.textContent !== CSS) sheet.textContent = CSS;
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
      setSharedGate(gateOf(saved, gateStore.value));
    }

    function loadGate() {
      if (gateStore.loading || (gateStore.value !== null && !gateStore.failed)) return;
      gateStore.loading = true;
      requestGate()
        .then((result) => {
          if (result.status !== 'ok') throw new Error(result.message ?? '读不到设置');
          gateStore.failed = false;
          setSharedGate(gateOf(result, null));
        })
        .catch(() => {
          // Unreadable settings must not start spending: stand in with the
          // default, a folded line that waits for a click, and let the next
          // block that mounts try again.
          gateStore.failed = true;
          setSharedGate({ mode: 'manual', sessions: [], length: 'normal', language: 'auto', variant: 'baseline', ownPrompt: false });
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
      /** Bumped when the length tier, the language or the prompt changes: this block redoes its Turn. */
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
              setSharedGate(gateOf(result, previous));
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

      /**
       * The prompt switch works like the language one: written through for every
       * block, and only the block that was clicked redoes its Turn. Each prompt
       * keeps its own cache, so flipping between them on one answer compares the
       * two at the cost of one rewrite each.
       */
      const chooseVariant = (pick) => {
        closeMenu();
        setModeError('');
        const previous = gate;
        setSharedGate({ ...previous, variant: pick });
        saveGate({ variant: pick })
          .then((result) => {
            if (result.status !== 'ok') throw new Error(result.message ?? '没保存上');
            if (previous.variant !== pick && started) setRevision((n) => n + 1);
          })
          .catch((error) => {
            setSharedGate(previous);
            setModeError(error instanceof Error ? error.message : String(error));
          });
      };

      /** The 基准 row's name: 自定义 while it runs the reader's own prompt. */
      const variantLabel = (value, menu) => {
        if (value === 'baseline' && gate?.ownPrompt === true) return '自定义';
        return menu ? VARIANT_MENU.find((item) => item.value === value)?.label ?? '' : VARIANT_LABEL[value] ?? '';
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
        setPhase({ kind: 'loading', since: Date.now() });
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
            if (result.status === 'ok') setPhase({ kind: 'ready', text: result.text, usage: result.usage, trace: result.trace });
            else if (result.status === 'skip') setPhase({ kind: result.reason === 'too-long' ? 'toolong' : 'none' });
            else setPhase({ kind: 'failed', message: readableError(result.message ?? '') });
          })
          .catch((error) => {
            if (live) setPhase({ kind: 'failed', message: readableError(error instanceof Error ? error.message : String(error)) });
          });
        return () => { live = false; };
      }, [usable, started, sessionId, seq, attempt, revision]);

      /**
       * A rewrite that goes back for a second pass can take minutes; the wait
       * says how long it has been, so a slow one does not look like a stuck one.
       */
      const [now, setNow] = useState(() => Date.now());
      useEffect(() => {
        if (phase.kind !== 'loading' || phase.since === undefined) return undefined;
        const timer = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(timer);
      }, [phase]);

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
              h('span', { className: 'ra-dot3' }, '.'))),
          waitedWords(phase.since, now) === ''
            ? null
            : h('span', { key: 'waited', style: WAITED }, waitedWords(phase.since, now))));
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
      /** How it was made, under what it cost: a line, never a panel. */
      const made = ready ? traceLine(phase.trace) : '';
      const cost = usage === undefined
        ? null
        : h('span', {
            style: COST,
            title: `${usageWords(usage)} tokens${made === '' ? '' : `\n${made}`}`,
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

      /** The card's contents: the five switches, or the list one of them opens. */
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
      } else if (view === 'variant') {
        const current = gate === null ? null : effectiveVariant(gate);
        menuRows = [backRow, ...VARIANT_MENU.map((item) => menuRow(
          item.value, variantLabel(item.value, true), item.value === current, item.value === hover,
          () => chooseVariant(item.value), () => setHover(item.value), () => setHover(null),
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
          valueRow('variant', '提示词', gate === null ? '' : variantLabel(effectiveVariant(gate), false), 'variant'),
          valueRow('model', '模型', modelLabel(), 'model'),
          h('div', { key: 'split', style: DIVIDER }),
          // Only a finished rewrite has a record to copy.
          ready && traceText(phase.trace) !== ''
            ? h('button', {
                key: 'trace',
                style: { ...ITEM, ...(hover === 'trace' ? ITEM_HOVER : null) },
                onMouseEnter: () => setHover('trace'),
                onMouseLeave: () => setHover(null),
                onClick: () => {
                  copyText(traceText(phase.trace)).then((done) => setCopyState(done ? 'copied' : 'failed'));
                  closeMenu();
                },
              }, h('span', { style: ITEM_TEXT }, '复制生成过程'))
            : null,
          h('button', {
            key: 'settings',
            style: { ...ITEM, ...(hover === 'settings' ? ITEM_HOVER : null) },
            onMouseEnter: () => setHover('settings'),
            onMouseLeave: () => setHover(null),
            onClick: () => {
              // The menu would hang over the dialog's dimmed page, so it folds
              // away first and the dialog paints one layer above the conversation.
              closeMenu();
              openSettingsDialog();
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

    /** Quiet info glyph whose explanation stays hidden until hovered or focused. */
    function InfoTip({ text }) {
      return h('span', { className: 'ra-set-tip', tabIndex: 0, 'aria-label': text },
        h('svg', {
          width: 13, height: 13, viewBox: '0 0 16 16', fill: 'none',
          stroke: 'currentColor', strokeWidth: 1.4,
          strokeLinecap: 'round', strokeLinejoin: 'round',
          'aria-hidden': 'true',
        },
          h('circle', { cx: 8, cy: 8, r: 6.2 }),
          h('path', { d: 'M8 7.3v3.4' }),
          h('circle', { cx: 8, cy: 5.1, r: 0.55, fill: 'currentColor', stroke: 'none' })),
        h('span', { className: 'ra-set-tip-pop', role: 'tooltip' }, text));
    }

    /** Downward caret for the custom model selector. */
    function CaretIcon() {
      return h('svg', {
        width: 12, height: 12, viewBox: '0 0 16 16', fill: 'none',
        stroke: 'currentColor', strokeWidth: 1.6,
        strokeLinecap: 'round', strokeLinejoin: 'round',
        'aria-hidden': 'true',
      }, h('path', { d: 'M4.2 6.2 8 10l3.8-3.8' }));
    }

    /**
     * Resolve a `provider::model` value against the loaded catalog so the trigger
     * shows human-readable names without falling back to an empty string when a
     * saved model is temporarily absent from the catalog.
     */
    function resolveModelLabel(value, providers) {
      if (value === '') return { empty: true, name: '选择模型', provider: '' };
      const [providerId, modelId] = value.split('::');
      for (const provider of providers ?? []) {
        if (provider.id !== providerId) continue;
        for (const candidate of provider.models) {
          if (candidate.id === modelId) return { empty: false, name: candidate.name, provider: provider.name };
        }
      }
      return { empty: false, name: modelId ?? value, provider: providerId ?? '' };
    }

    /**
     * The plugin's own settings dialog. The ⋯ menu edits one switch at a time in a
     * popover; this dialog puts every global row the bundle owns in one place,
     * grouped into core choices, prompt, and generation parameters. It lives in
     * `shell.overlay`, so it opens over the conversation without moving it.
     */
    function SettingsDialog() {
      const open = useSettingsOpen();
      const [state, setState] = useState({ kind: 'loading' });
      const [draft, setDraft] = useState(null);
      const [initial, setInitial] = useState(null);
      const [model, setModel] = useState('');
      const [models, setModels] = useState(null);
      const [modelOpen, setModelOpen] = useState(false);
      const [length, setLength] = useState('normal');
      const [language, setLanguage] = useState('auto');
      const [variant, setVariant] = useState('baseline');
      const [defaultPrompt, setDefaultPrompt] = useState('');
      /** The built-in 角色版 text, shown read-only while that prompt is in force. */
      const [rolePrompt, setRolePrompt] = useState('');
      const [tokensToday, setTokensToday] = useState(0);
      const [saving, setSaving] = useState(false);
      const [error, setError] = useState('');
      const [saved, setSaved] = useState(false);

      /** The rows and the catalog arrive together: the model row needs both. */
      const load = () => {
        setState({ kind: 'loading' });
        setModelOpen(false);
        setError('');
        setSaved(false);
        Promise.all([requestGate(), requestModels()]).then(
          ([gate, catalog]) => {
            if (gate.status !== 'ok') throw new Error(gate.message ?? '读不到设置');
            if (catalog.status !== 'ok') throw new Error(catalog.message ?? '读不到模型清单');
            const nextDraft = draftOf(gate.settings);
            const nextLength = effectiveLength(gate);
            const nextLanguage = effectiveLanguage(gate);
            const nextVariant = effectiveVariant(gate);
            // No model chosen yet is a real state: the row must stay empty rather
            // than become a `::` pair the Host would refuse.
            const nextModel = catalog.provider === '' || catalog.model === '' ? '' : `${catalog.provider}::${catalog.model}`;
            setDraft(nextDraft);
            setLength(nextLength);
            setLanguage(nextLanguage);
            setVariant(nextVariant);
            setModel(nextModel);
            setModels({ providers: catalog.providers });
            setDefaultPrompt(typeof gate.defaultPrompt === 'string' ? gate.defaultPrompt : '');
            setRolePrompt(typeof gate.builtInPrompts?.roles === 'string' ? gate.builtInPrompts.roles : '');
            setTokensToday(typeof gate.tokensToday === 'number' && Number.isFinite(gate.tokensToday) ? gate.tokensToday : 0);
            setInitial({ draft: nextDraft, model: nextModel, length: nextLength, language: nextLanguage, variant: nextVariant });
            setState({ kind: 'ready' });
          },
          (failure) => setState({
            kind: 'failed',
            message: failure instanceof Error ? failure.message : String(failure),
          }),
        );
      };

      // The sheet goes in once; the rows are read every time the dialog is raised,
      // so it never shows a stale copy of a row saved from elsewhere since.
      useEffect(() => { ensureStyle(); }, []);
      useEffect(() => {
        if (open) load();
        else setModelOpen(false);
      }, [open]);

      // Close the custom model dropdown on outside click or Esc without dismissing
      // the surrounding Modal on the first Esc press.
      useEffect(() => {
        if (!modelOpen) return undefined;
        const close = () => setModelOpen(false);
        const onKey = (event) => {
          if (event.key === 'Escape') {
            event.stopPropagation();
            setModelOpen(false);
          }
        };
        document.addEventListener('click', close);
        window.addEventListener('keydown', onKey, true);
        return () => {
          document.removeEventListener('click', close);
          window.removeEventListener('keydown', onKey, true);
        };
      }, [modelOpen]);

      const dirty = initial !== null && draft !== null && (
        model !== initial.model
        || length !== initial.length
        || language !== initial.language
        || variant !== initial.variant
        || Object.keys(initial.draft).some((key) => draft[key] !== initial.draft[key])
      );

      /** A field being retyped: the saved state and complaint clear as soon as it changes. */
      const edit = (field) => (event) => {
        const value = event.target.value;
        setDraft((current) => ({ ...current, [field]: value }));
        setError('');
        setSaved(false);
      };

      /** Save every row at once: one write, one answer, and no restart in between. */
      const save = () => {
        if (saving || state.kind !== 'ready' || !dirty) return;
        let rows;
        try {
          rows = readDraft(draft);
        } catch (failure) {
          setError(failure instanceof Error ? failure.message : String(failure));
          return;
        }
        setSaving(true);
        setError('');
        setSaved(false);
        const [provider, id] = model.split('::');
        saveGate({
          ...rows,
          length,
          language,
          variant,
          // The pair is the one thing the Host will not take half of.
          ...(model === '' || !provider || !id ? null : { provider, model: id }),
        })
          .then((result) => {
            if (result.status !== 'ok') throw new Error(result.message ?? '没保存上');
            const nextDraft = result.settings !== undefined ? draftOf(result.settings) : draft;
            setSaving(false);
            savedModel = model;
            // The reply is every row as it now stands: open blocks read it from the
            // shared gate, so their menus are current the moment the reader returns.
            publishGate(result);
            setDraft(nextDraft);
            setInitial({ draft: nextDraft, model, length, language, variant });
            setSaved(true);
          })
          .catch((failure) => {
            setSaving(false);
            setError(failure instanceof Error ? failure.message : String(failure));
          });
      };

      // Allow Cmd/Ctrl+S or Cmd/Ctrl+Enter to save while the dialog is open.
      useEffect(() => {
        if (!open || state.kind !== 'ready') return undefined;
        const onKey = (event) => {
          if (!(event.metaKey || event.ctrlKey)) return;
          if (event.key.toLowerCase() === 's' || event.key === 'Enter') {
            event.preventDefault();
            save();
          }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
      });

      /** Tactile segmented switcher: one track, active item lifted. */
      const segment = (menu, current, choose) => h('div', { className: 'ra-set-seg', role: 'radiogroup' },
        menu.map((item) => h('button', {
          key: item.value,
          type: 'button',
          role: 'radio',
          'aria-checked': item.value === current,
          className: 'ra-set-seg-btn',
          'data-on': item.value === current ? 'true' : 'false',
          onClick: () => {
            choose(item.value);
            setError('');
            setSaved(false);
          },
        }, item.label)));

      /** Compact numeric box with an optional embedded trailing unit. */
      const numBox = (field, width, opts = {}) => h('label', { className: 'ra-set-num-wrap' },
        h('input', {
          className: 'ra-set-num',
          'data-w': width,
          type: 'text',
          inputMode: opts.mode ?? 'numeric',
          spellCheck: false,
          'aria-label': opts.label,
          value: draft?.[field] ?? '',
          onChange: edit(field),
        }),
        opts.unit === undefined ? null : h('span', { className: 'ra-set-unit' }, opts.unit));

      /** One aligned row inside a grouped settings card. */
      const cardRow = (key, label, control, opts = {}) => h('div', {
        key,
        className: 'ra-set-row',
        'data-dim': opts.dim ? 'true' : undefined,
      },
        h('span', { className: 'ra-set-label' },
          label,
          opts.tip === undefined ? null : h(InfoTip, { text: opts.tip })),
        h('div', { className: 'ra-set-ctl' }, control));

      /** What the dialog renders inside the Modal body. */
      let body;
      if (state.kind === 'loading') {
        body = h('div', { className: 'ra-set-skel-stack', 'aria-busy': 'true' },
          h('div', { className: 'ra-set-skel', style: { height: 134 } }),
          h('div', { className: 'ra-set-skel', style: { height: 164 } }),
          h('div', { className: 'ra-set-skel', style: { height: 178 } }));
      } else if (state.kind === 'failed') {
        body = h('div', { className: 'ra-set-failed' },
          h('p', { className: 'ra-set-error' }, state.message),
          h(Button, { variant: 'outline', onClick: load }, '重试'));
      } else {
        const providers = models?.providers ?? [];
        const resolved = resolveModelLabel(model, providers);
        const showProv = !resolved.empty && resolved.provider !== '' && providers.length > 1
          && !resolved.name.toLowerCase().startsWith(`${resolved.provider.toLowerCase()}/`);
        const modelPicker = h('div', {
          className: 'ra-set-sel',
          onClick: (event) => event.stopPropagation(),
        },
          h('button', {
            type: 'button',
            className: 'ra-set-sel-btn',
            'aria-haspopup': 'listbox',
            'aria-expanded': modelOpen,
            title: resolved.empty ? '选择模型' : (resolved.provider ? `${resolved.provider} · ${resolved.name}` : resolved.name),
            onClick: () => setModelOpen((was) => !was),
          },
            h('span', { className: 'ra-set-sel-val' },
              h('span', { className: 'ra-set-sel-name', 'data-empty': resolved.empty ? 'true' : undefined }, resolved.name),
              showProv ? h('span', { className: 'ra-set-sel-prov' }, resolved.provider) : null),
            h('span', { className: 'ra-set-sel-caret' }, h(CaretIcon))),
          modelOpen
            ? h('div', { className: 'ra-set-sel-menu', role: 'listbox' },
                providers.length === 0
                  ? h('div', { className: 'ra-set-sel-empty' }, '暂无可用模型')
                  : providers.flatMap((provider) => [
                      h('div', { key: `g:${provider.id}`, className: 'ra-set-sel-grp' }, provider.name),
                      ...provider.models.map((candidate) => {
                        const value = `${provider.id}::${candidate.id}`;
                        const active = value === model;
                        return h('button', {
                          key: value,
                          type: 'button',
                          role: 'option',
                          'aria-selected': active,
                          className: 'ra-set-sel-opt',
                          'data-on': active ? 'true' : 'false',
                          onClick: () => {
                            setModel(value);
                            setModelOpen(false);
                            setError('');
                            setSaved(false);
                          },
                        },
                          h('span', { className: 'ra-set-sel-opt-text' }, candidate.name),
                          h('span', { style: CHECK_SLOT }, active ? h(CheckIcon) : null));
                      }),
                    ]))
            : null);

        // 角色版 is built in and not editable: the box shows it, read-only, and the
        // reader's own text waits untouched for 基准.
        const showsRoles = variant === 'roles' && rolePrompt !== '';
        const promptText = showsRoles ? rolePrompt : draft?.prompt ?? '';
        const promptLen = promptText.length;
        const promptCustomized = !showsRoles && defaultPrompt !== '' && promptText !== defaultPrompt;

        const rawTemp = Number(draft?.temperature);
        const sliderTemp = Number.isFinite(rawTemp) ? Math.min(2, Math.max(0, rawTemp)) : 0.3;
        const sliderPct = (sliderTemp / 2) * 100;

        const rawCap = String(draft?.dailyTokenCap ?? '').trim();
        const capNum = Number(rawCap);
        const capUnlimited = rawCap !== '' && Number.isFinite(capNum) && capNum === 0;
        const spentText = tokensToday > 0 ? `今日 ${formatTokens(tokensToday)}` : '';
        const capBadge = spentText && capUnlimited
          ? `${spentText} · 不限`
          : spentText || (capUnlimited ? '不限' : '');

        body = h('div', { className: 'ra-set-body' },
          h('div', { className: 'ra-set-card' },
            cardRow('model', '模型', modelPicker),
            cardRow('length', '详略', segment(LENGTH_MENU, length, setLength)),
            cardRow('language', '语言', segment(LANG_MENU, language, setLanguage)),
            cardRow('variant', '提示词', segment(VARIANT_MENU, variant, setVariant), {
              tip: '基准是一直以来的写法，下面改过的提示词就用在它上面；角色版按每块内容的作用取舍，是内置的实验写法，不能改。两种各自缓存，可以在同一条回答上来回对比。',
            })),
          h('section', { className: 'ra-set-section' },
            h('div', { className: 'ra-set-sec-bar' },
              h('span', { className: 'ra-set-head' }, showsRoles ? '角色版提示词' : '基准提示词'),
              h('span', { className: 'ra-set-sec-meta' },
                showsRoles ? h('span', { key: 'fixed' }, '内置 · 只读') : null,
                promptCustomized
                  ? h('button', {
                      type: 'button',
                      className: 'ra-set-reset',
                      onClick: () => {
                        setDraft((current) => ({ ...current, prompt: defaultPrompt }));
                        setError('');
                        setSaved(false);
                      },
                    }, '恢复默认')
                  : null,
                h('span', {
                  className: 'ra-set-count',
                  'data-over': promptLen > MAX_PROMPT_CHARS ? 'true' : undefined,
                }, `${promptLen} / ${MAX_PROMPT_CHARS}`))),
            h('textarea', {
              className: 'ra-set-area',
              spellCheck: false,
              maxLength: MAX_PROMPT_CHARS,
              value: promptText,
              readOnly: showsRoles,
              onChange: showsRoles ? undefined : edit('prompt'),
            })),
          h('section', { className: 'ra-set-section' },
            h('div', { className: 'ra-set-sec-bar' },
              h('span', { className: 'ra-set-head' }, '参数')),
            h('div', { className: 'ra-set-card' },
              cardRow('range', '触发字数', [
                h('span', { key: 'min', className: 'ra-set-pair' },
                  h('span', { className: 'ra-set-inline-lbl' }, 'min'),
                  numBox('minChars', 'sm', { label: '最短字数' })),
                h('span', { key: 'max', className: 'ra-set-pair' },
                  h('span', { className: 'ra-set-inline-lbl' }, 'max'),
                  numBox('maxChars', 'md', { label: '最长字数' })),
              ], { tip: '原文字数在此范围内才会显示速览，短于 min 或长于 max 的回答会跳过。' }),
              cardRow('tier', '普通档篇幅', [
                h('span', { key: 'r', className: 'ra-set-pair' },
                  h('span', { className: 'ra-set-inline-lbl' }, 'ratio'),
                  numBox('ratio', 'xs', { label: '普通档比例', mode: 'decimal' })),
                h('span', { key: 'c', className: 'ra-set-pair' },
                  h('span', { className: 'ra-set-inline-lbl' }, 'cap'),
                  numBox('capChars', 'sm', { label: '普通档上限', unit: '字' })),
              ], {
                dim: length === 'detailed',
                tip: '仅影响普通档：按原文比例估算目标字数，以 cap 封顶（下限 150 字）。详细档固定 0.5 / 1600 字。',
              }),
              cardRow('temperature', 'Temperature', [
                h('input', {
                  key: 'slider',
                  className: 'ra-set-slider',
                  type: 'range',
                  min: 0,
                  max: 2,
                  step: 0.1,
                  'aria-label': 'Temperature',
                  value: sliderTemp,
                  style: {
                    background: `linear-gradient(to right, var(--dsw-alias-label-primary,#e5e5e5) 0%, var(--dsw-alias-label-primary,#e5e5e5) ${sliderPct}%, var(--dsw-alias-border-l2,rgba(128,128,128,.28)) ${sliderPct}%, var(--dsw-alias-border-l2,rgba(128,128,128,.28)) 100%)`,
                  },
                  onChange: (event) => {
                    const next = String(Math.round(Number(event.target.value) * 10) / 10);
                    setDraft((current) => ({ ...current, temperature: next }));
                    setError('');
                    setSaved(false);
                  },
                }),
                numBox('temperature', 'xs', { label: '温度', mode: 'decimal' }),
              ], { tip: '采样温度（0–2）：越低越贴近原文，越高越自由。' }),
              cardRow('cap', '自动日限额', [
                capBadge === '' ? null : h('span', { key: 'badge', className: 'ra-set-badge' }, capBadge),
                numBox('dailyTokenCap', 'lg', { label: '每日上限', unit: 'tokens' }),
              ], { tip: '自动模式每日 token 上限，0 为不限。手动点击不受限，但同样计入当日用量。' }))));
      }

      const saveLabel = saving ? '保存中…' : (!dirty && saved ? '已保存' : '保存');

      // One dialog: grouped cards in a scrolling body, error pinned in the footer
      // so validation messages never scroll out of sight. Esc, × and backdrop close
      // through the same handler.
      return h(Modal, {
        open,
        title: '速览设置',
        closeLabel: '关闭',
        onClose: closeSettingsDialog,
        className: 'ra-set-dialog',
        contentClassName: 'ra-set-content',
        footer: h('div', { className: 'ra-set-foot' },
          error === '' ? null : h('p', { className: 'ra-set-error', role: 'alert' }, error),
          h('div', { className: 'ra-set-actions' },
            h(Button, {
              variant: 'primary',
              disabled: saving || state.kind !== 'ready' || !dirty,
              onClick: save,
            }, saveLabel))),
      }, body);
    }

    // The test suite reaches the pure helpers through this hook; the app never sets it.
    if (typeof window.__DSH_INTERPRETER_TEST__ === 'function') {
      window.__DSH_INTERPRETER_TEST__({ blocks, inline, safeHref, tableCells, effectiveMode, effectiveLength, effectiveLanguage, renderBlock, readReply, headline, probeTurn, copyText, draftOf, readDraft, resolveModelLabel, traceLine, traceText, waitedWords });
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
        // The settings dialog is an overlay entry, not a panel: it paints over the
        // page and leaves the conversation underneath exactly as it was.
        ctx.slots.inject('shell.overlay', () => ctx.slots.register({
          name: 'shell.overlay',
          id: 'interpreter-settings',
        }, SettingsDialog));
      },
    };
  },
});
