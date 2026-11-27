// Backlog text (description, comments) and AI answers as HTML: Markdown by marked, then cleaned by
// DOMPurify, since the text comes from Backlog and must not run code in the panel. Links open in
// the browser (right-click for more); `![alt](attachment:<id>)` images become preview buttons, as
// the frame has no network to show them inline.
import { h } from './vendor/preact.js';
import { useEffect, useMemo, useRef } from './vendor/hooks.js';
import { Marked } from './vendor/marked.js';
import DOMPurify from './vendor/purify.js';
import { ATTACHMENT_SCHEME } from '../protocol.js';
import { cx, openMenu, useApp } from './ui.js';
const escape = (s) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const marked = new Marked({
    gfm: true,
    breaks: false,
    renderer: {
        image({ href, text }) {
            if (href?.startsWith(ATTACHMENT_SCHEME)) {
                const id = href.slice(ATTACHMENT_SCHEME.length);
                // Drawn when it scrolls into view (src/web/markdown.tsx, LazyImages); a press opens it big.
                return `<span class="att-img is-loading" data-att="${escape(id)}" role="button" tabindex="0" title="${escape(text || 'image')}"><span class="att-label">🖼 ${escape(text || 'image')}</span></span>`;
            }
            // Outside images cannot load (no network): a link to them instead.
            return `<a href="${escape(href ?? '')}">${escape(text || href || 'image')}</a>`;
        }
    }
});
export function toHtml(text) {
    const html = marked.parse(text, { async: false });
    return DOMPurify.sanitize(html, { ADD_ATTR: ['data-att', 'tabindex'], FORBID_TAGS: ['style', 'form', 'input'], FORBID_ATTR: ['style'] });
}
/**
 * Fills each image placeholder once it nears the view: one request per image, cached by the app,
 * so a long description with many screenshots costs nothing until it is scrolled to.
 */
function useLazyImages(root, issueKey, html, app) {
    useEffect(() => {
        const el = root.current;
        if (!el || !issueKey)
            return;
        const holders = [...el.querySelectorAll('.att-img[data-att]')];
        if (!holders.length)
            return;
        const load = (holder) => {
            const id = Number(holder.dataset.att);
            app
                .imageUrl(issueKey, id)
                .then((url) => {
                if (!holder.isConnected)
                    return;
                const img = document.createElement('img');
                img.alt = holder.title;
                img.decoding = 'async';
                img.onload = () => holder.classList.remove('is-loading');
                img.onerror = () => holder.classList.replace('is-loading', 'is-failed');
                img.src = url;
                holder.replaceChildren(img);
            })
                .catch(() => holder.classList.replace('is-loading', 'is-failed'));
        };
        if (typeof IntersectionObserver === 'undefined')
            return holders.forEach(load);
        const seen = new IntersectionObserver((entries) => {
            for (const entry of entries) {
                if (!entry.isIntersecting)
                    continue;
                seen.unobserve(entry.target);
                load(entry.target);
            }
        }, { rootMargin: '300px 0px' });
        holders.forEach((holder) => seen.observe(holder));
        return () => seen.disconnect();
    }, [html, issueKey]);
}
export function Markdown({ text, issueKey, place, class: cls }) {
    const [, app] = useApp();
    const html = useMemo(() => toHtml(text), [text]);
    const root = useRef(null);
    useLazyImages(root, issueKey, html, app);
    const linkOf = (e) => e.target.closest?.('a[href]');
    return (h("div", { ref: root, class: cx('markdown', cls), onKeyDown: (e) => {
            const att = e.target.closest?.('[data-att]');
            if (att && issueKey && (e.key === 'Enter' || e.key === ' ')) {
                e.preventDefault();
                void app.openAttachment(issueKey, Number(att.dataset.att), place);
            }
        }, dangerouslySetInnerHTML: { __html: html }, onClick: (e) => {
            const att = e.target.closest?.('[data-att]');
            if (att && issueKey) {
                e.preventDefault();
                return void app.openAttachment(issueKey, Number(att.dataset.att), place);
            }
            const a = linkOf(e);
            if (!a)
                return;
            e.preventDefault();
            void app.openLink(place, a.href);
        }, onContextMenu: (e) => {
            const a = linkOf(e);
            if (!a)
                return;
            const url = a.href;
            openMenu(e, [
                { label: 'Open in browser', icon: 'external', onSelect: () => void app.linkAction(place, url, 'browser') },
                { label: "Open in Orca's browser", icon: 'globe', onSelect: () => void app.linkAction(place, url, 'orca') },
                { label: 'Copy link', icon: 'copy', onSelect: () => void app.linkAction(place, url, 'copy') }
            ]);
        } }));
}
