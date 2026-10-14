import { useEffect, useState } from 'react';

/* Маршруты на хэше — работают и при открытии файла двойным кликом:
   #/            мозаика, все проекты
   #/c/<раздел>  мозаика, пересобранная под раздел (soft | tables | chairs | figures)
   #/p/<id>      страница-кейс
   #/views | #/about | #/contacts */
export function parseHash(h) {
  const s = (h === undefined ? location.hash : h).replace(/^#\/?/, '');
  const [a, b] = s.split('/');
  if (a === 'c' && ['soft', 'tables', 'chairs', 'figures'].includes(b)) return { name: 'home', cat: b, key: 'home' };
  if (a === 'p' && b) return { name: 'case', id: b, key: 'case:' + b };
  if (['views', 'about', 'contacts'].includes(a)) return { name: 'page', page: a, key: 'page:' + a };
  return { name: 'home', cat: 'all', key: 'home' };
}

export function useRoute() {
  const [r, setR] = useState(() => parseHash());
  useEffect(() => {
    const f = () => setR(parseHash());
    addEventListener('hashchange', f);
    return () => removeEventListener('hashchange', f);
  }, []);
  return r;
}
