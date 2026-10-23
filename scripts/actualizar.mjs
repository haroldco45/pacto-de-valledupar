// Robot de actualización — Pacto de Valledupar (Vibras Positivas HM)
// Busca titulares nuevos en Google Noticias y los agrega a data/noticias.json.
// Corre solo en GitHub Actions cada 3 horas. No necesita librerías ni claves.
import { readFile, writeFile } from 'node:fs/promises';

const ARCHIVO = new URL('../data/noticias.json', import.meta.url);
const BUSQUEDAS = [
  '"pacto de Valledupar"',
  '"pacto Valledupar"',
  'Valledupar exjefes paramilitares Benedetti Angie Rodríguez'
];
const MAX_NOTICIAS = 250;

const rss = q =>
  `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=es-419&gl=CO&ceid=CO:es-419`;

const ENTIDADES = {
  '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&apos;': "'", '&nbsp;': ' '
};
function limpiar(txt = '') {
  return txt
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&(amp|lt|gt|quot|#39|apos|nbsp);/g, m => ENTIDADES[m])
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
const etiqueta = (bloque, tag) => {
  const m = bloque.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`));
  return m ? limpiar(m[1]) : '';
};

export function leerRSS(xml) {
  const items = [];
  for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const b = m[1];
    const medio = etiqueta(b, 'source');
    const urlMedio = (b.match(/<source[^>]*url="([^"]+)"/) || [])[1] || '';
    let titulo = etiqueta(b, 'title');
    if (medio && titulo.endsWith(` - ${medio}`)) titulo = titulo.slice(0, -(medio.length + 3));
    const fecha = new Date(etiqueta(b, 'pubDate'));
    items.push({
      titulo,
      medio: medio || 'Medio',
      urlMedio,
      enlace: etiqueta(b, 'link'),
      fecha: isNaN(fecha) ? null : fecha.toISOString()
    });
  }
  return items;
}

// Solo titulares que de verdad hablan del caso
const RELEVANTE = /valledupar|angie rodr[ií]guez|exjefes? paramilitar|exparas|mancuso|currea/i;

const TEMAS = [
  ['fiscalia', /fiscal/i],
  ['procuraduria', /procurad/i],
  ['acusacion', /comisi[oó]n de acusaci|c[aá]mara/i],
  ['justicia', /minjusticia|ministro de justicia|cancino/i],
  ['petro', /petro/i],
  ['benedetti', /benedetti/i],
  ['angie', /angie/i],
  ['mancuso', /mancuso|villamizar/i]
];
export const temasDe = t => TEMAS.filter(([, re]) => re.test(t)).map(([k]) => k);

export const clave = t =>
  t.toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

export function fusionar(actuales, nuevas) {
  const vistos = new Set(actuales.map(n => clave(n.titulo)));
  const agregadas = [];
  for (const n of nuevas) {
    if (!n.titulo || !RELEVANTE.test(n.titulo)) continue;
    const k = clave(n.titulo);
    if (vistos.has(k)) continue;
    vistos.add(k);
    agregadas.push({ ...n, temas: temasDe(n.titulo), auto: true });
  }
  const todas = [...agregadas, ...actuales]
    .sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''))
    .slice(0, MAX_NOTICIAS);
  return { todas, agregadas };
}

async function main() {
  const datos = JSON.parse(await readFile(ARCHIVO, 'utf8'));
  const encontradas = [];
  let exitosas = 0;
  for (const q of BUSQUEDAS) {
    try {
      const r = await fetch(rss(q), { headers: { 'User-Agent': 'Mozilla/5.0 (VibrasPositivasHM robot)' } });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      encontradas.push(...leerRSS(await r.text()));
      exitosas++;
    } catch (e) {
      console.error(`No se pudo leer la búsqueda ${q}:`, e.message);
    }
  }
  if (!exitosas) {
    console.error('Ninguna búsqueda respondió; no se cambia nada.');
    process.exitCode = 1;
    return;
  }
  const { todas, agregadas } = fusionar(datos.noticias, encontradas);
  datos.noticias = todas;
  datos.revisado = new Date().toISOString();
  if (agregadas.length) datos.actualizado = datos.revisado;
  await writeFile(ARCHIVO, JSON.stringify(datos, null, 2) + '\n');
  console.log(`Revisadas ${encontradas.length}, nuevas ${agregadas.length}, total ${todas.length}`);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
