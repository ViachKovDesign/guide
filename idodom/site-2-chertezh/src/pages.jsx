import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { byId, CATS, ANGLES, EXTRA, galleryFor, neighbour, counts } from './data.js';
import { scroller, currentScroll } from './scroll.js';

/* ── Гигантская бегущая строка: сначала разгон (ramp), затем постоянная скорость; от скролла не зависит ── */
export function Marquee({ text }) {
  const t = text.toUpperCase();
  const reps = Math.max(2, Math.ceil(20 / (t.length + 3)));
  const group = (g) => (
    <div className="marquee__group" key={g} aria-hidden="true">
      {Array.from({ length: reps }, (_, i) => <span key={i}>{t}<i>—</i></span>)}
    </div>
  );
  return (
    <div className="marquee">
      <h1 className="sr-only">{text}</h1>
      <div className="marquee__track">{group(0)}{group(1)}</div>
    </div>
  );
}

const reveal = {
  initial: { opacity: 0, y: 70, filter: 'blur(10px)' },
  whileInView: { opacity: 1, y: 0, filter: 'blur(0px)' },
  viewport: { once: true, margin: '0px 0px -12% 0px' },
  transition: { duration: 1.1, ease: [0.19, 1, 0.22, 1] }
};

/* ── Асимметричная галерея: кадры разной ширины и высоты, с намеренными пустотами ── */
const ROWS = [
  [{ s: 2, c: 8, mt: 0 }, { s: 13, c: 4, mt: 22 }],
  [{ s: 5, c: 5, mt: 8 }, { s: 12, c: 5, mt: 0 }],
  [{ s: 1, c: 6, mt: 12 }, { s: 9, c: 7, mt: 34 }],
  [{ s: 4, c: 10, mt: 10 }],
  [{ s: 8, c: 4, mt: 0 }, { s: 14, c: 3, mt: 16 }]
];
export function Gallery({ items }) {
  const rows = []; let n = 0;
  for (const tpl of ROWS) {
    if (n >= items.length) break;
    rows.push(tpl.map(slot => ({ slot, it: items[n++] })).filter(x => x.it));
  }
  return (
    <section className="gallery" aria-label="Галерея">
      {rows.map((row, ri) => (
        <div className="gallery__row" key={ri}>
          {row.map(({ slot, it }, j) => {
            const inner = (
              <>
                <span className="gallery__media"><img src={it.src} alt={it.name || ''} loading="lazy" decoding="async" draggable="false" /></span>
                {it.caption && <figcaption><b>{it.idx}</b><span>{it.name}</span><em>{it.caption}</em></figcaption>}
              </>
            );
            return (
              <motion.figure key={j} className="gallery__item" {...reveal}
                style={{ '--start': slot.s, '--cols': slot.c, '--mt': slot.mt, '--aspect-height-ratio': it.r }}>
                {it.id ? <a href={'#/p/' + it.id} data-cursor-label={it.name}>{inner}</a> : <div>{inner}</div>}
              </motion.figure>
            );
          })}
        </div>
      ))}
    </section>
  );
}

function Meta({ rows }) {
  return <dl className="meta">{rows.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>;
}

function Shell({ title, meta, text, children, bottom }) {
  return (
    <>
      <section className="page__top"><Marquee text={title} /></section>
      <section className="page__info">
        <Meta rows={meta} />
        <div className="page__text">{text.map((t, i) => <p key={i}>{t}</p>)}</div>
      </section>
      {children}
      {bottom}
    </>
  );
}

const EXTRA_TEXT = {
  soft: 'Каркас из массива, пена высокой плотности и съёмные чехлы. Секции соединяются между собой, порядок можно менять под стену.',
  tables: 'Столешницу подбираем по рисунку камня или дерева. Основание — сталь или латунь, регулируемые опоры спрятаны в ножках.',
  chairs: 'Мягкая посадка на плотной пене, ножки из массива. Обивку можно заменить на любую ткань из коллекции.',
  figures: 'Каждая грань обтянута отдельно. Фигуры можно сочетать: ставить рядом или разводить по разным углам комнаты.'
};

function FilmFrame({ p }) {
  const ref = useRef(null);
  const [paused, setPaused] = useState(false);
  const toggle = () => { const v = ref.current; if (!v) return; if (v.paused) { v.play(); setPaused(false); } else { v.pause(); setPaused(true); } };
  return (
    <motion.section className="film" {...reveal} data-cursor-label={paused ? 'Играть' : 'Пауза'} onClick={toggle}>
      <video ref={ref} src={p.video} poster={p.img} autoPlay muted loop playsInline preload="auto" />
    </motion.section>
  );
}

function NextLink({ id }) {
  const n = neighbour(id, 1);
  return (
    <a className="next" href={'#/p/' + n.id} data-cursor-label={'Далее — ' + n.name}>
      <span className="eyebrow">Следующий проект</span>
      <span className="next__name">{n.name}</span>
      <span className="next__img"><img src={n.img} alt="" loading="lazy" /></span>
    </a>
  );
}

export function CasePage({ id }) {
  const p = byId[id];
  useEffect(() => {
    if (!p) return;
    const f = (e) => {
      if (e.key === 'ArrowRight') location.hash = '#/p/' + neighbour(id, 1).id;
      else if (e.key === 'ArrowLeft') location.hash = '#/p/' + neighbour(id, -1).id;
      else if (e.key === 'Escape') location.hash = '#/';
    };
    addEventListener('keydown', f); return () => removeEventListener('keydown', f);
  }, [id, p]);
  const gallery = useMemo(() => (p ? galleryFor(p) : []), [p]);
  if (!p) return <Shell title="Нет такого" meta={[['Ошибка', '404']]} text={['Такого проекта нет в каталоге. Вернитесь на мозаику и выберите другой.']} />;
  return (
    <Shell title={p.name} bottom={<NextLink id={id} />}
      meta={[['Год', p.year], ['Тип', CATS[p.cat] + (p.kind === 'film' ? ' · фильм' : '')], ['Размер', p.size], ['Материал', p.material]]}
      text={[p.text, p.kind === 'film' ? 'Видео без звука: включается само и идёт по кругу. Нажмите на кадр, чтобы поставить на паузу.' : EXTRA_TEXT[p.cat]]}>
      {p.kind === 'film' && <FilmFrame p={p} />}
      <Gallery items={gallery} />
    </Shell>
  );
}

export function InfoPage({ page }) {
  if (page === 'views') {
    const items = ANGLES.map((a, i) => ({ src: '../assets/img/p/' + a.id + '.jpg', r: a.r, name: a.name, caption: a.text, idx: '0' + (i + 1) }));
    return (
      <Shell title="Ракурсы"
        meta={[['Модель', 'Диван «Дуга»'], ['Ракурсов', String(items.length)], ['Камера', 'Фронт · Три четверти · Сверху · Деталь'], ['Раздел', CATS.soft]]}
        text={['Один диван — четыре взгляда. Фронт показывает пропорции, три четверти — изгиб дуги, вид сверху — как диван читается на плане комнаты, деталь — фаску и фактуру ткани.', 'Так мы смотрим на каждую вещь, прежде чем показать её вам.']}>
        <Gallery items={items} />
        <a className="next" href="#/p/duga" data-cursor-label="Диван «Дуга»"><span className="eyebrow">Модель</span><span className="next__name">Дуга</span><span className="next__img"><img src={byId.duga.img} alt="" loading="lazy" /></span></a>
      </Shell>
    );
  }
  if (page === 'about') {
    const items = [
      { src: EXTRA.vein.src, r: EXTRA.vein.r, name: EXTRA.vein.name },
      { src: byId.gran.img, r: byId.gran.r, name: byId.gran.name, id: 'gran' },
      { src: EXTRA.interior.src, r: EXTRA.interior.r, name: EXTRA.interior.name },
      { src: byId.duga.img, r: byId.duga.r, name: byId.duga.name, id: 'duga' }
    ];
    return (
      <Shell title="О нас"
        meta={[['Направления', 'Мебель · Интерьер · Дизайн'], ['Принцип', 'Home priority — дом на первом месте'], ['Каталог', counts.all + ' позиций, 4 раздела']]}
        text={['IDODOM — это мебель, интерьер и дизайн в одном месте. Мы начинаем с чертежа и заканчиваем вещью, в которой хочется жить.', 'Сначала размеры и пропорции, потом ткань и цвет. Мрамор, дерево, плотные ткани — то, что хорошо стареет. Мебель подчиняется пространству, а не наоборот.']}>
        <Gallery items={items} />
      </Shell>
    );
  }
  return <ContactsPage />;
}

function ContactsPage() {
  const [sent, setSent] = useState('');
  const [topic, setTopic] = useState('soft');
  const submit = (e) => {
    e.preventDefault();
    const f = e.currentTarget;
    if (!f.checkValidity()) { f.reportValidity(); return; }
    setSent('Спасибо' + (f.elements.name.value ? ', ' + f.elements.name.value.trim() : '') + '. Заявка принята — мы ответим в течение рабочего дня.');
    f.reset();
  };
  return (
    <Shell title="Контакты"
      meta={[['Телефон', '+7 (000) 000-00-00'], ['Почта', 'hello@idodom.example'], ['Шоурум', 'Адрес — по записи']]}
      text={['Расскажите о вашем пространстве: что обставляем, какие размеры и сроки. Ответим в течение рабочего дня и предложим, с чего начать.']}>
      <motion.form className="form2" onSubmit={submit} noValidate {...reveal}>
        <label className="field2"><span>Имя</span><input name="name" type="text" autoComplete="name" required /></label>
        <label className="field2"><span>Телефон или e-mail</span><input name="contact" type="text" autoComplete="tel" required /></label>
        <fieldset className="chips2"><legend>Что обставляем</legend>
          {[['soft', CATS.soft], ['tables', CATS.tables], ['chairs', CATS.chairs], ['figures', CATS.figures], ['all', 'Интерьер целиком']].map(([k, t]) => (
            <label key={k}><input type="radio" name="topic" value={k} checked={topic === k} onChange={() => setTopic(k)} /><span>{t}</span></label>
          ))}
        </fieldset>
        <label className="field2"><span>Пара слов о проекте</span><textarea name="msg" rows="3" /></label>
        <button className="btn2" type="submit"><span>Отправить заявку</span><i /></button>
        <p className="form2__status" role="status">{sent}</p>
      </motion.form>
    </Shell>
  );
}
