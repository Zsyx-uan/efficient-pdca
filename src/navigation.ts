import { useEffect, useState } from 'react';
import type { View } from './archiveTypes';
export type Route = {
    view: View;
    bookId?: string;
    sectionId?: string;
    cardId?: string;
    tab?: string;
    q?: string;
};
export function readRoute(): Route {
    const [path, query] = location.hash.replace(/^#\/?/, '').split('?'), params = new URLSearchParams(query), parts = path.split('/');
    const valid = ['home', 'library', 'cards', 'review', 'data', 'book', 'search'];
    let bookId: string | undefined;
    try {
        bookId = parts[1] ? decodeURIComponent(parts[1]) : undefined;
    }
    catch {
        bookId = undefined;
    }
    return { view: valid.includes(parts[0]) ? parts[0] as View : 'home', bookId, sectionId: params.get('section') ?? undefined, cardId: params.get('card') ?? undefined, tab: params.get('tab') ?? undefined, q: params.get('q') ?? undefined };
}
export function navigate(route: Route, replace = false) {
    const params = new URLSearchParams();
    if (route.sectionId)
        params.set('section', route.sectionId);
    if (route.cardId)
        params.set('card', route.cardId);
    if (route.tab)
        params.set('tab', route.tab);
    if (route.q)
        params.set('q', route.q);
    const hash = `#/${route.view}${route.bookId ? `/${encodeURIComponent(route.bookId)}` : ''}${params.size ? `?${params}` : ''}`;
    if (replace) {
        history.replaceState(null, '', hash);
        window.dispatchEvent(new HashChangeEvent('hashchange'));
    }
    else
        location.hash = hash;
}
export function useRoute() { const [route, setRoute] = useState(readRoute); useEffect(() => { const update = () => setRoute(readRoute()); window.addEventListener('hashchange', update); return () => window.removeEventListener('hashchange', update); }, []); return route; }
