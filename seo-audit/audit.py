#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Аудит сайта: техническое SEO, мета-теги, доверие, конверсия.

Только стандартная библиотека Python 3.8+. Ничего доустанавливать не нужно.

Как пользоваться:
    python audit.py https://kovalenko-psychologist.ru/
    python audit.py saved-page.html
    python audit.py https://site.ru/ --out otchet.md

Скрипт складывает отчёт в audit-report.md рядом с собой и печатает его в консоль.
"""

import sys
import os
import re
import io
import ssl
import gzip
import zlib
import json
import time
import socket
import argparse
from html.parser import HTMLParser
from urllib.parse import urljoin, urlparse, urlunparse
import urllib.request
import urllib.error

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/125.0 Safari/537.36")

CRIT, WARN, OK, INFO = "CRIT", "WARN", "OK", "INFO"
MARK = {CRIT: "[!!]", WARN: "[! ]", OK: "[ok]", INFO: "[i ]"}


class Finding:
    def __init__(self, level, title, detail="", fix=""):
        self.level = level
        self.title = title
        self.detail = detail
        self.fix = fix


class Report:
    def __init__(self):
        self.sections = []

    def section(self, name):
        s = (name, [])
        self.sections.append(s)
        return s[1]

    def counts(self):
        c = {CRIT: 0, WARN: 0, OK: 0, INFO: 0}
        for _, items in self.sections:
            for f in items:
                c[f.level] += 1
        return c


# ---------------------------------------------------------------- загрузка

class Fetched:
    def __init__(self, url, status, headers, body, elapsed, chain, error=None):
        self.url = url
        self.status = status
        self.headers = headers or {}
        self.body = body or b""
        self.elapsed = elapsed
        self.chain = chain or []
        self.error = error

    @property
    def text(self):
        enc = None
        ct = self.headers.get("content-type", "")
        m = re.search(r"charset=([\w\-]+)", ct, re.I)
        if m:
            enc = m.group(1)
        if not enc:
            m = re.search(rb'charset=["\']?([\w\-]+)', self.body[:4096], re.I)
            if m:
                enc = m.group(1).decode("ascii", "ignore")
        for cand in filter(None, [enc, "utf-8", "windows-1251"]):
            try:
                return self.body.decode(cand)
            except (UnicodeDecodeError, LookupError):
                continue
        return self.body.decode("utf-8", "replace")


class _Redirects(urllib.request.HTTPRedirectHandler):
    def __init__(self):
        self.chain = []

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        self.chain.append((req.full_url, code, newurl))
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def fetch(url, method="GET", timeout=25):
    handler = _Redirects()
    ctx = ssl.create_default_context()
    opener = urllib.request.build_opener(handler, urllib.request.HTTPSHandler(context=ctx))
    req = urllib.request.Request(url, method=method, headers={
        "User-Agent": UA,
        "Accept": "text/html,application/xhtml+xml,*/*;q=0.8",
        "Accept-Encoding": "gzip, deflate",
        "Accept-Language": "ru-RU,ru;q=0.9",
    })
    t0 = time.time()
    try:
        resp = opener.open(req, timeout=timeout)
        raw = resp.read()
        status, hdrs, final = resp.status, dict((k.lower(), v) for k, v in resp.headers.items()), resp.url
    except urllib.error.HTTPError as e:
        raw = e.read() if hasattr(e, "read") else b""
        status, hdrs, final = e.code, dict((k.lower(), v) for k, v in (e.headers or {}).items()), url
    except Exception as e:
        return Fetched(url, None, {}, b"", time.time() - t0, handler.chain, error=str(e))
    elapsed = time.time() - t0
    enc = hdrs.get("content-encoding", "").lower()
    try:
        if "gzip" in enc:
            raw = gzip.decompress(raw)
        elif "deflate" in enc:
            raw = zlib.decompress(raw, -zlib.MAX_WBITS)
    except Exception:
        pass
    return Fetched(final, status, hdrs, raw, elapsed, handler.chain)


# ---------------------------------------------------------------- разбор HTML

class Page(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.title = ""
        self.metas = []
        self.links = []
        self.headings = []
        self.images = []
        self.anchors = []
        self.scripts = []
        self.inline_js = []
        self.jsonld = []
        self.forms = 0
        self.inputs = []
        self.html_attrs = {}
        self.text_parts = []
        self._stack = []
        self._grab = None
        self._buf = []

    def handle_starttag(self, tag, attrs):
        a = dict((k.lower(), (v or "")) for k, v in attrs)
        self._stack.append(tag)
        if tag == "html":
            self.html_attrs = a
        elif tag == "meta":
            self.metas.append(a)
        elif tag == "link":
            self.links.append(a)
        elif tag == "img":
            self.images.append(a)
        elif tag == "a":
            self.anchors.append(a)
            self._grab = "a"
            self._buf = []
        elif tag == "script":
            if a.get("src"):
                self.scripts.append(a["src"])
            self._grab = "script"
            self._buf = []
            self._script_type = a.get("type", "").lower()
        elif tag == "form":
            self.forms += 1
        elif tag in ("input", "textarea", "select"):
            self.inputs.append(a)
        elif re.fullmatch(r"h[1-6]", tag):
            self._grab = tag
            self._buf = []
        elif tag == "title":
            self._grab = "title"
            self._buf = []

    def handle_endtag(self, tag):
        if self._stack and tag in self._stack:
            while self._stack:
                if self._stack.pop() == tag:
                    break
        txt = "".join(self._buf).strip()
        if self._grab == tag:
            if tag == "title":
                self.title = txt
            elif re.fullmatch(r"h[1-6]", tag):
                self.headings.append((tag, re.sub(r"\s+", " ", txt)))
            elif tag == "a":
                self.anchors[-1]["__text"] = re.sub(r"\s+", " ", txt) if self.anchors else ""
            elif tag == "script":
                if "ld+json" in getattr(self, "_script_type", ""):
                    self.jsonld.append(txt)
                else:
                    self.inline_js.append(txt)
            self._grab = None
            self._buf = []

    def handle_data(self, data):
        if self._grab:
            self._buf.append(data)
        if not any(t in self._stack for t in ("script", "style")):
            s = data.strip()
            if s:
                self.text_parts.append(s)

    def meta(self, name=None, prop=None):
        for m in self.metas:
            if name and m.get("name", "").lower() == name.lower():
                return m.get("content", "")
            if prop and m.get("property", "").lower() == prop.lower():
                return m.get("content", "")
        return ""

    def link_rel(self, rel):
        out = []
        for l in self.links:
            if rel.lower() in l.get("rel", "").lower().split():
                out.append(l)
        return out

    @property
    def text(self):
        return " ".join(self.text_parts)

    @property
    def words(self):
        return len(re.findall(r"[А-Яа-яЁёA-Za-z]{2,}", self.text))


def parse(html):
    p = Page()
    try:
        p.feed(html)
    except Exception:
        pass
    return p


# ---------------------------------------------------------------- проверки

def check_availability(rep, base, main):
    it = rep.section("1. Доступность, редиректы, протокол")
    if main.error or not main.status:
        it.append(Finding(CRIT, "Страница не открылась",
                          "Ошибка: %s" % (main.error or "нет ответа"),
                          "Проверьте, работает ли сайт и отвечает ли хостинг."))
        return
    if main.status >= 400:
        it.append(Finding(CRIT, "Главная отдаёт код %s" % main.status,
                          "Поисковики не смогут её проиндексировать.",
                          "Почините ответ сервера: главная должна отдавать 200."))
    else:
        it.append(Finding(OK, "Главная отвечает 200", "Время ответа %.2f c" % main.elapsed))

    if main.elapsed > 2.0:
        it.append(Finding(CRIT, "Очень медленный ответ: %.2f c" % main.elapsed,
                          "Больше 2 секунд до первого байта — люди уходят, Яндекс понижает.",
                          "Включите кэширование на хостинге, сожмите картинки, уберите лишние скрипты."))
    elif main.elapsed > 0.8:
        it.append(Finding(WARN, "Ответ небыстрый: %.2f c" % main.elapsed,
                          "Норма — до 0,8 с.",
                          "Кэш на стороне сервера + CDN."))
    else:
        it.append(Finding(OK, "Скорость ответа в норме: %.2f c" % main.elapsed))

    p = urlparse(main.url)
    if p.scheme != "https":
        it.append(Finding(CRIT, "Сайт работает не по HTTPS",
                          "Браузеры помечают такой сайт как «Не защищено». Для сайта психолога это прямая потеря доверия.",
                          "Подключите бесплатный SSL-сертификат Let's Encrypt в панели хостинга."))
    else:
        it.append(Finding(OK, "HTTPS подключён"))

    # http -> https
    http_url = urlunparse(("http",) + tuple(urlparse(base)[1:]))
    r = fetch(http_url)
    if r.error:
        it.append(Finding(INFO, "HTTP-версию проверить не удалось", r.error))
    elif r.url.startswith("https://"):
        it.append(Finding(OK, "HTTP автоматически переводится на HTTPS"))
    else:
        it.append(Finding(CRIT, "HTTP не редиректит на HTTPS",
                          "Сайт доступен по двум адресам сразу — поисковик считает это дублями.",
                          "Настройте 301-редирект с http:// на https://."))

    # www / без www
    host = urlparse(base).netloc
    other = host[4:] if host.startswith("www.") else "www." + host
    ourl = urlunparse(("https", other) + tuple(urlparse(base)[2:]))
    r2 = fetch(ourl)
    if r2.error or not r2.status:
        it.append(Finding(OK, "Зеркало %s не отвечает — дублей нет" % other))
    elif urlparse(r2.url).netloc.lower() == host.lower():
        it.append(Finding(OK, "Зеркало %s склеено редиректом" % other))
    elif r2.status == 200:
        it.append(Finding(CRIT, "Сайт открывается и на %s, и на %s" % (host, other),
                          "Два одинаковых сайта на разных адресах — поисковики делят между ними вес и могут выбрать не тот.",
                          "Оставьте одно главное зеркало и поставьте с другого 301-редирект."))

    # 404
    r3 = fetch(urljoin(base, "/proverka-404-" + str(int(time.time()))))
    if r3.status == 404:
        it.append(Finding(OK, "Несуществующие страницы отдают 404"))
    elif r3.status == 200:
        it.append(Finding(WARN, "Несуществующая страница отдаёт 200 вместо 404",
                          "Поисковик наберёт мусорных страниц-дублей.",
                          "Настройте корректный ответ 404."))
    elif r3.status:
        it.append(Finding(INFO, "Несуществующая страница отдаёт %s" % r3.status))


def check_server(rep, main):
    it = rep.section("2. Сервер, сжатие, безопасность")
    h = main.headers
    if not h:
        return
    size = len(main.body)
    it.append(Finding(INFO, "Размер HTML: %.0f КБ" % (size / 1024.0)))
    if size > 300 * 1024:
        it.append(Finding(WARN, "HTML тяжёлый (%.0f КБ)" % (size / 1024.0),
                          "Норма для страницы — до 150 КБ.",
                          "Вынесите стили и скрипты в отдельные файлы, уберите лишнее."))
    if "content-encoding" in h:
        it.append(Finding(OK, "Сжатие включено (%s)" % h["content-encoding"]))
    else:
        it.append(Finding(WARN, "Сжатие (gzip/brotli) не включено",
                          "Страница едет к посетителю в 3-4 раза тяжелее, чем могла бы.",
                          "Включите gzip или brotli в настройках хостинга."))
    if "strict-transport-security" in h:
        it.append(Finding(OK, "HSTS включён"))
    else:
        it.append(Finding(INFO, "HSTS не настроен",
                          "Не критично, но повышает безопасность.",
                          "Добавьте заголовок Strict-Transport-Security."))
    if "x-content-type-options" not in h:
        it.append(Finding(INFO, "Нет заголовка X-Content-Type-Options"))
    cc = h.get("cache-control", "")
    if not cc:
        it.append(Finding(WARN, "Не задано кэширование (Cache-Control)",
                          "Повторные визиты грузятся заново.",
                          "Пропишите Cache-Control для картинок, стилей и скриптов."))
    else:
        it.append(Finding(OK, "Cache-Control задан: %s" % cc))
    srv = h.get("server", "")
    if srv:
        it.append(Finding(INFO, "Сервер: %s" % srv))


def check_robots_sitemap(rep, base):
    it = rep.section("3. robots.txt и карта сайта")
    r = fetch(urljoin(base, "/robots.txt"))
    if r.status == 200 and r.body:
        txt = r.text
        it.append(Finding(OK, "robots.txt найден"))
        if re.search(r"^\s*Disallow:\s*/\s*$", txt, re.M | re.I):
            it.append(Finding(CRIT, "robots.txt закрывает весь сайт от индексации",
                              "Строка «Disallow: /» — сайт не попадёт в поиск вообще.",
                              "Уберите эту строку."))
        sm = re.findall(r"^\s*Sitemap:\s*(\S+)", txt, re.M | re.I)
        if sm:
            it.append(Finding(OK, "В robots.txt указана карта сайта", ", ".join(sm)))
        else:
            it.append(Finding(WARN, "В robots.txt нет ссылки на sitemap.xml",
                              "", "Добавьте строку: Sitemap: %s" % urljoin(base, "/sitemap.xml")))
        if not re.search(r"User-agent:\s*Yandex", txt, re.I):
            it.append(Finding(INFO, "Нет отдельной секции для Yandex",
                              "Не обязательно, но для рунета полезно."))
    else:
        it.append(Finding(CRIT, "robots.txt отсутствует (код %s)" % r.status,
                          "Поисковики не получают инструкций по обходу сайта.",
                          "Создайте /robots.txt с разрешением на обход и ссылкой на sitemap."))

    s = fetch(urljoin(base, "/sitemap.xml"))
    if s.status == 200 and s.body:
        urls = len(re.findall(r"<loc>", s.text, re.I))
        it.append(Finding(OK, "sitemap.xml найден", "Адресов в карте: %d" % urls))
        if urls == 0:
            it.append(Finding(WARN, "Карта сайта пустая", "", "Добавьте в неё все страницы сайта."))
    else:
        it.append(Finding(CRIT, "sitemap.xml отсутствует (код %s)" % s.status,
                          "Поисковик обходит сайт вслепую, новые страницы индексируются дольше.",
                          "Сгенерируйте карту сайта и укажите её в robots.txt и Яндекс.Вебмастере."))


def check_meta(rep, page, base, main):
    it = rep.section("4. Мета-теги и заголовки")
    t = page.title.strip()
    if not t:
        it.append(Finding(CRIT, "Нет тега <title>",
                          "Это главный SEO-тег: именно он показывается ссылкой в выдаче.",
                          "Пример: «Психолог Анна Коваленко — онлайн-консультации | Москва»"))
    else:
        it.append(Finding(INFO, "Title: «%s»" % t, "Длина: %d символов" % len(t)))
        if len(t) < 30:
            it.append(Finding(WARN, "Title слишком короткий (%d символов)" % len(t),
                              "Норма 50-65. Вы теряете место под ключевые слова.",
                              "Добавьте услугу и город: «Психолог Анна Коваленко — семейный психолог, онлайн и Москва»"))
        elif len(t) > 70:
            it.append(Finding(WARN, "Title длинный (%d символов)" % len(t),
                              "В выдаче обрежется многоточием.", "Уложитесь в 65 символов."))
        else:
            it.append(Finding(OK, "Длина title в норме (%d)" % len(t)))

    d = page.meta(name="description").strip()
    if not d:
        it.append(Finding(CRIT, "Нет meta description",
                          "Поисковик сам слепит описание из случайного куска текста — кликов будет меньше.",
                          "Напишите 150-160 символов: кто вы, с чем помогаете, как записаться."))
    else:
        it.append(Finding(INFO, "Description: «%s»" % d, "Длина: %d" % len(d)))
        if len(d) < 70:
            it.append(Finding(WARN, "Description короткий (%d)" % len(d), "Норма 150-160.", ""))
        elif len(d) > 200:
            it.append(Finding(WARN, "Description длинный (%d)" % len(d), "Обрежется.", ""))
        else:
            it.append(Finding(OK, "Длина description в норме (%d)" % len(d)))

    lang = page.html_attrs.get("lang", "")
    if not lang:
        it.append(Finding(WARN, "У тега <html> не указан язык",
                          "", 'Добавьте: <html lang="ru">'))
    else:
        it.append(Finding(OK, "Язык страницы указан: %s" % lang))

    vp = page.meta(name="viewport")
    if not vp:
        it.append(Finding(CRIT, "Нет мета-тега viewport",
                          "Сайт будет нечитаем на телефоне, а это больше половины ваших посетителей.",
                          '<meta name="viewport" content="width=device-width, initial-scale=1">'))
    else:
        it.append(Finding(OK, "Viewport задан"))

    can = page.link_rel("canonical")
    if not can:
        hint = main.url if main.url.startswith("http") else "https://ваш-сайт.ру/"
        it.append(Finding(WARN, "Нет rel=canonical",
                          "Страница может склеиться с дублями (с utm-метками, со слэшем и без).",
                          '<link rel="canonical" href="%s">' % hint))
    else:
        it.append(Finding(OK, "Canonical указан", can[0].get("href", "")))

    rb = page.meta(name="robots").lower()
    if "noindex" in rb:
        it.append(Finding(CRIT, "Страница закрыта от индексации (noindex)",
                          "Её не будет в поиске.", "Уберите noindex из мета-тега robots."))
    elif rb:
        it.append(Finding(INFO, "Meta robots: %s" % rb))

    h1s = [h for h in page.headings if h[0] == "h1"]
    if not h1s:
        it.append(Finding(CRIT, "На странице нет заголовка H1",
                          "H1 — второй по важности сигнал о теме страницы.",
                          "Добавьте один H1 с главным запросом."))
    elif len(h1s) > 1:
        it.append(Finding(WARN, "H1 несколько (%d штук)" % len(h1s),
                          "Должен быть один: " + " | ".join(x[1][:40] for x in h1s[:5]),
                          "Оставьте один H1, остальные сделайте H2."))
    else:
        it.append(Finding(OK, "Ровно один H1", "«%s»" % h1s[0][1][:80]))

    order = [int(h[0][1]) for h in page.headings]
    if order and order[0] != 1:
        it.append(Finding(INFO, "Заголовки начинаются не с H1",
                          "Первый заголовок — H%d" % order[0]))
    it.append(Finding(INFO, "Всего заголовков: %d" % len(page.headings),
                      ", ".join("%s:%d" % (lvl, sum(1 for h in page.headings if h[0] == lvl))
                                for lvl in ["h1", "h2", "h3", "h4", "h5", "h6"]
                                if any(h[0] == lvl for h in page.headings))))


def check_social(rep, page):
    it = rep.section("5. Превью ссылки в мессенджерах (Open Graph)")
    need = {"og:title": "заголовок", "og:description": "описание",
            "og:image": "картинка", "og:url": "адрес", "og:type": "тип"}
    missing = [k for k in need if not page.meta(prop=k)]
    if not missing:
        it.append(Finding(OK, "Open Graph заполнен полностью"))
    elif len(missing) == len(need):
        it.append(Finding(CRIT, "Open Graph не настроен совсем",
                          "Когда вашу ссылку кидают в Telegram или WhatsApp, она выглядит голым адресом без картинки. "
                          "Для психолога, которого рекомендуют перепостом, это прямая потеря клиентов.",
                          "Добавьте og:title, og:description, og:image (1200x630), og:url, og:type."))
    else:
        it.append(Finding(WARN, "В Open Graph не хватает: %s" % ", ".join(missing),
                          "", "Допишите недостающие теги."))
    if not page.meta(name="twitter:card"):
        it.append(Finding(INFO, "Нет twitter:card", "Мелочь, но влияет на вид превью в части клиентов."))


def check_schema(rep, page):
    it = rep.section("6. Микроразметка Schema.org")
    types = []
    for blob in page.jsonld:
        try:
            data = json.loads(blob)
        except Exception:
            it.append(Finding(WARN, "JSON-LD есть, но с синтаксической ошибкой",
                              "Поисковик его проигнорирует.", "Проверьте разметку валидатором."))
            continue
        for obj in (data if isinstance(data, list) else [data]):
            if isinstance(obj, dict):
                t = obj.get("@type")
                if t:
                    types.extend(t if isinstance(t, list) else [t])
    if types:
        it.append(Finding(OK, "Микроразметка найдена", "Типы: %s" % ", ".join(map(str, types))))
        low = [str(x).lower() for x in types]
        for want, why in [("person", "карточка специалиста"),
                          ("localbusiness", "организация с адресом и часами"),
                          ("faqpage", "блок вопрос-ответ, даёт расширенный сниппет")]:
            if want not in low:
                it.append(Finding(INFO, "Нет типа %s" % want, why))
    else:
        it.append(Finding(CRIT, "Микроразметки Schema.org нет",
                          "Без неё Яндекс и Google не понимают, что вы — конкретный специалист с услугами, "
                          "и не показывают расширенный сниппет (рейтинг, цена, адрес). "
                          "У психолога это один из главных способов выделиться в выдаче.",
                          "Добавьте JSON-LD: Person (психолог), LocalBusiness или ProfessionalService "
                          "(приём), Service (услуги), FAQPage (вопросы-ответы), Review/AggregateRating (отзывы)."))


def check_images(rep, page, base):
    it = rep.section("7. Изображения")
    if not page.images:
        it.append(Finding(WARN, "На странице нет изображений",
                          "Для психолога фото — ключевой фактор доверия.",
                          "Добавьте живое фото специалиста, дипломы, кабинет."))
        return
    it.append(Finding(INFO, "Всего изображений: %d" % len(page.images)))
    no_alt = [i for i in page.images if not i.get("alt", "").strip()]
    if no_alt:
        lvl = CRIT if len(no_alt) > len(page.images) / 2 else WARN
        it.append(Finding(lvl, "Без alt: %d из %d" % (len(no_alt), len(page.images)),
                          "alt — это текст картинки для поиска и для незрячих. "
                          "Без него вы теряете трафик из поиска по картинкам.",
                          'Опишите каждую: alt="Психолог Анна Коваленко на консультации"'))
    else:
        it.append(Finding(OK, "У всех изображений есть alt"))
    no_lazy = [i for i in page.images if "lazy" not in i.get("loading", "").lower()]
    if len(no_lazy) > 3:
        it.append(Finding(WARN, "Без отложенной загрузки: %d" % len(no_lazy),
                          "Все картинки грузятся сразу — страница открывается медленнее.",
                          'Добавьте loading="lazy" всем картинкам ниже первого экрана.'))
    no_dim = [i for i in page.images if not (i.get("width") and i.get("height"))]
    if no_dim:
        it.append(Finding(WARN, "Без указанных размеров: %d" % len(no_dim),
                          "Страница «прыгает» при загрузке — Google штрафует за это (CLS).",
                          "Проставьте width и height каждой картинке."))
    old = [i for i in page.images
           if re.search(r"\.(jpe?g|png)(\?|$)", i.get("src", ""), re.I)]
    if old:
        it.append(Finding(WARN, "В старых форматах (jpg/png): %d" % len(old),
                          "WebP весит в 2-3 раза меньше при том же качестве.",
                          "Пересохраните картинки в WebP."))


def check_content(rep, page, base):
    it = rep.section("8. Текст, ссылки, конверсия")
    w = page.words
    js_len = sum(len(x) for x in page.inline_js)
    js_rendered = w < 300 and js_len > 20000
    it.append(Finding(INFO, "Объём текста: примерно %d слов" % w))
    if js_rendered:
        it.append(Finding(WARN, "Текст страницы рисует JavaScript",
                          "В исходном коде всего %d слов, зато %d КБ скриптов. Значит, содержимое "
                          "подставляется скриптом уже в браузере. Яндекс такие страницы индексирует "
                          "хуже и медленнее, чем обычный HTML, а часть текста может не увидеть вовсе."
                          % (w, js_len // 1024),
                          "Отдавайте основной текст сразу в HTML, а скриптом только оживляйте. "
                          "Проверьте в Яндекс.Вебмастере, разделе «Инструменты», что робот видит текст."))
    elif w < 300:
        it.append(Finding(CRIT, "Текста почти нет (%d слов)" % w,
                          "Поисковику нечего ранжировать. Страницы короче 300 слов почти не выходят в топ.",
                          "Нужно 800-1500 слов: с чем работаете, как проходит консультация, "
                          "сколько стоит, ваше образование, ответы на частые вопросы."))
    elif w < 800:
        it.append(Finding(WARN, "Текста маловато (%d слов)" % w,
                          "Конкуренты в топе обычно дают 1000+.",
                          "Расширьте описание услуг и добавьте блок вопрос-ответ."))
    else:
        it.append(Finding(OK, "Объём текста достаточный (%d слов)" % w))

    host = urlparse(base).netloc.lower()
    internal = external = 0
    empty_anchor = 0
    for a in page.anchors:
        href = a.get("href", "").strip()
        if not href or href.startswith(("#", "javascript:")):
            continue
        netloc = urlparse(urljoin(base, href)).netloc.lower()
        if netloc == host or not netloc:
            internal += 1
        else:
            external += 1
        if not a.get("__text", "").strip() and not a.get("aria-label"):
            empty_anchor += 1
    it.append(Finding(INFO, "Ссылок: внутренних %d, внешних %d" % (internal, external)))
    if internal < 5:
        it.append(Finding(WARN, "Мало внутренних ссылок (%d)" % internal,
                          "Поисковик плохо обходит сайт, посетитель не находит нужное.",
                          "Свяжите страницы между собой: с главной — на услуги, цены, отзывы, статьи."))
    if empty_anchor:
        it.append(Finding(WARN, "Ссылок без текста: %d" % empty_anchor,
                          "Поисковик не понимает, куда они ведут.",
                          "Дайте текст или aria-label."))

    txt = page.text.lower()
    raw = " ".join([txt] + [a.get("href", "") for a in page.anchors]).lower()

    def has(*pats):
        return any(re.search(p, raw) for p in pats)

    checks = [
        ("Телефон", has(r"\+7[\s\-(]*\d{3}", r"8[\s\-(]*\d{3}[\s\-)]*\d{3}"),
         CRIT, "Нет телефона на странице",
         "Часть людей звонит, а не пишет. Без телефона они просто уходят.",
         "Поставьте телефон в шапку кликабельной ссылкой tel:"),
        ("Мессенджер", has(r"t\.me/", r"wa\.me/", r"whatsapp", r"telegram"),
         WARN, "Нет ссылок на мессенджеры",
         "К психологу чаще пишут, чем звонят — писать не так страшно.",
         "Добавьте кнопки Telegram и WhatsApp."),
        ("Почта", has(r"mailto:", r"[a-z0-9._%%+-]+@[a-z0-9.-]+\.[a-z]{2,}"),
         INFO, "Нет e-mail", "", "Добавьте почту для тех, кому удобнее письмом."),
        ("Цены", has(r"\d[\d\s]{2,}\s*(руб|₽|р\.)", r"стоимость", r"цена", r"прайс"),
         CRIT, "Не указаны цены",
         "Психолог без цены на сайте — первая причина закрыть вкладку. "
         "Человек думает «наверное, дорого» и уходит к тому, кто написал.",
         "Укажите стоимость консультации прямо и заметно."),
        ("Отзывы", has(r"отзыв", r"благодар"),
         CRIT, "Нет отзывов",
         "Психолога выбирают по доверию. Отзывы — главный его источник.",
         "Соберите 5-10 отзывов (с разрешения клиентов, можно анонимно) и покажите на сайте."),
        ("Образование", has(r"образован", r"диплом", r"сертификат", r"институт",
                            r"университет", r"квалификац", r"повышени"),
         CRIT, "Не указано образование и квалификация",
         "Это ключевой фактор доверия к психологу и сигнал E-E-A-T для поисковика. "
         "Без дипломов вы в глазах человека ничем не отличаетесь от самозванца.",
         "Опишите образование, подход, часы личной терапии и супервизии, покажите сканы дипломов."),
        ("Политика конфиденциальности", has(r"политик.{0,20}конфиденциальн", r"персональн.{0,15}данн",
                                            r"privacy"),
         CRIT, "Нет политики конфиденциальности",
         "Если на сайте есть форма — это нарушение 152-ФЗ, штраф до 300 000 рублей. "
         "Плюс Яндекс понижает сайты без политики.",
         "Добавьте страницу «Политика конфиденциальности» и ссылку на неё в подвал и под каждую форму."),
        ("Форма записи", page.forms > 0,
         WARN, "На странице нет формы записи",
         "Каждый лишний шаг теряет людей. Форма прямо на странице собирает тех, кому лень писать в мессенджер.",
         "Добавьте короткую форму: имя + контакт + кнопка. Не больше трёх полей."),
    ]
    for name, ok, lvl, title, detail, fix in checks:
        if ok:
            it.append(Finding(OK, "%s — есть" % name))
        else:
            it.append(Finding(lvl, title, detail, fix))

    if page.forms:
        consent = has(r"согласен", r"согласие", r"принимаю услови")
        if not consent:
            it.append(Finding(CRIT, "У формы нет галочки согласия на обработку персональных данных",
                              "Прямое нарушение 152-ФЗ. Форма собирает контакты без законного основания.",
                              "Добавьте обязательный чекбокс со ссылкой на политику конфиденциальности."))
        else:
            it.append(Finding(OK, "Согласие на обработку данных у формы есть"))


def check_analytics(rep, page):
    it = rep.section("9. Аналитика")
    blob = " ".join(page.scripts + page.inline_js).lower()
    ym = "mc.yandex.ru" in blob or "ym(" in blob
    ga = "googletagmanager" in blob or "google-analytics" in blob or "gtag(" in blob
    vk = "vk.com/js/api/openapi" in blob or "vk-pixel" in blob or "top.mail.ru" in blob
    if ym:
        it.append(Finding(OK, "Яндекс.Метрика подключена"))
    else:
        it.append(Finding(CRIT, "Яндекс.Метрики нет",
                          "Вы не знаете, сколько людей заходит, откуда они и где закрывают сайт. "
                          "Без этого любые улучшения — гадание.",
                          "Заведите счётчик на metrika.yandex.ru, включите Вебвизор и настройте цели "
                          "на клик по телефону, по мессенджеру и отправку формы."))
    if ga:
        it.append(Finding(OK, "Google Analytics подключён"))
    else:
        it.append(Finding(INFO, "Google Analytics нет", "Для рунета достаточно Метрики."))
    if vk:
        it.append(Finding(INFO, "Найден пиксель VK/Mail"))
    it.append(Finding(INFO, "Внешних скриптов на странице: %d" % len(page.scripts)))
    if len(page.scripts) > 12:
        it.append(Finding(WARN, "Много внешних скриптов (%d)" % len(page.scripts),
                          "Каждый тормозит загрузку.", "Уберите неиспользуемые."))


def check_yandex(rep, base):
    it = rep.section("10. Яндекс: индексация и региональность")
    for path, name in [("/yandex_*.html", "файл подтверждения Вебмастера")]:
        pass
    it.append(Finding(INFO, "Проверьте вручную в Яндекс.Вебмастере",
                      "Скрипт не может залезть в ваш личный кабинет.",
                      "1) webmaster.yandex.ru — добавьте сайт, подтвердите права.\n"
                      "   2) Укажите регион (город приёма или «Россия», если работаете онлайн) — "
                      "без региона вы не выходите по запросам «психолог + город».\n"
                      "   3) Загрузите sitemap.xml.\n"
                      "   4) Проверьте раздел «Диагностика» и «Страницы в поиске».\n"
                      "   5) Заведите карточку в Яндекс.Бизнесе — она даёт показы на Картах и в выдаче."))


# ---------------------------------------------------------------- вывод

def render(rep, target):
    out = []
    c = rep.counts()
    out.append("# Аудит сайта %s" % target)
    out.append("")
    out.append("Дата проверки: %s" % time.strftime("%d.%m.%Y %H:%M"))
    out.append("")
    out.append("**Итог: критичных проблем — %d, замечаний — %d, в порядке — %d.**"
               % (c[CRIT], c[WARN], c[OK]))
    out.append("")
    out.append("Обозначения: `[!!]` — критично, чинить первым; `[! ]` — важно; "
               "`[ok]` — в порядке; `[i ]` — к сведению.")
    out.append("")
    for name, items in rep.sections:
        if not items:
            continue
        out.append("## %s" % name)
        out.append("")
        for f in items:
            out.append("%s **%s**" % (MARK[f.level], f.title))
            if f.detail:
                out.append("")
                out.append("   %s" % f.detail.replace("\n", "\n   "))
            if f.fix:
                out.append("")
                out.append("   *Что сделать:* %s" % f.fix.replace("\n", "\n   "))
            out.append("")
    # план
    crits = [f for _, items in rep.sections for f in items if f.level == CRIT]
    if crits:
        out.append("## Что чинить в первую очередь")
        out.append("")
        for i, f in enumerate(crits, 1):
            out.append("%d. %s" % (i, f.title))
        out.append("")
    return "\n".join(out)


def main():
    ap = argparse.ArgumentParser(description="Аудит сайта: SEO, техника, доверие.")
    ap.add_argument("target", help="адрес сайта или путь к сохранённому HTML-файлу")
    ap.add_argument("--out", default="audit-report.md", help="куда сохранить отчёт")
    args = ap.parse_args()

    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

    rep = Report()
    target = args.target
    offline = os.path.exists(target)

    if offline:
        with open(target, "rb") as fh:
            body = fh.read()
        main_f = Fetched("file://" + os.path.abspath(target), 200, {}, body, 0.0, [])
        base = "https://example.invalid/"
        page = parse(main_f.text)
        rep.section("0. Режим разбора")[:] = [Finding(
            INFO, "Разобран сохранённый файл, а не живой сайт",
            "Проверки редиректов, robots.txt, карты сайта и скорости пропущены — "
            "для них нужен доступ к сайту по сети.")]
        check_meta(rep, page, base, main_f)
        check_social(rep, page)
        check_schema(rep, page)
        check_images(rep, page, base)
        check_content(rep, page, base)
        check_analytics(rep, page)
    else:
        if not target.startswith(("http://", "https://")):
            target = "https://" + target
        base = target
        print("Проверяю %s ..." % target)
        main_f = fetch(target)
        check_availability(rep, base, main_f)
        if main_f.error or not main_f.status:
            print(render(rep, target))
            return 1
        page = parse(main_f.text)
        check_server(rep, main_f)
        check_robots_sitemap(rep, base)
        check_meta(rep, page, base, main_f)
        check_social(rep, page)
        check_schema(rep, page)
        check_images(rep, page, base)
        check_content(rep, page, base)
        check_analytics(rep, page)
        check_yandex(rep, base)

    text = render(rep, target)
    with io.open(args.out, "w", encoding="utf-8") as fh:
        fh.write(text)
    print(text)
    print("\nОтчёт сохранён в %s" % os.path.abspath(args.out))
    return 0


if __name__ == "__main__":
    sys.exit(main())
