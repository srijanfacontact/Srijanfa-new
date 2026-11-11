// GET /api/fixtures  ->  reads the coaches' Google Doc and returns the fixtures as JSON.
// The Doc must be shared as "Anyone with the link can view". Set FIXTURES_DOC_ID (link or ID) on the host.
// Each fixture is one line:
//   15 Nov 2026 | Srijan FA vs Bethel FA | Match 19 | Report 10:50 AM | Warm-up 11:20 AM | Checks 11:40 AM | KO 11:50 AM | Result 2-1
// Lines that do not start with a valid date (headings, instructions, notes) are ignored.

const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
const p2 = (n) => String(n).padStart(2, "0");

function validYmd(y, m, d) {
  const dt = new Date(Date.UTC(+y, +m - 1, +d));
  return dt.getUTCFullYear() === +y && dt.getUTCMonth() === +m - 1 && dt.getUTCDate() === +d;
}

function normDate(x) {
  x = String(x || "").trim().replace(/^[*\-\u2022\s]+/, "");
  let m, y, mo, d;
  if ((m = x.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/))) { y = m[1]; mo = m[2]; d = m[3]; }
  else if ((m = x.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})$/))) { y = m[3]; mo = m[2]; d = m[1]; }
  else if ((m = x.match(/^(?:[A-Za-z]{3,9},?\s+)?(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]{3,9}),?\s*(\d{4})?$/))) {
    mo = MONTHS[m[2].slice(0, 3).toLowerCase()];
    if (!mo) return "";
    y = m[3] || new Date().getFullYear();
    d = m[1];
  } else return "";
  return validYmd(y, mo, d) ? `${y}-${p2(mo)}-${p2(d)}` : "";
}

const LABELS = [
  ["m", /^match(\s*day)?\b/i],
  ["r", /^report(ing)?(\s*time)?\b/i],
  ["w", /^warm[\s-]*up(\s*time)?\b/i],
  ["c", /^(pre[\s-]*match(\s*checks?)?|checks?)\b/i],
  ["k", /^(ko|kick[\s-]*off)(\s*time)?\b/i],
  ["res", /^(result|score|ft)\b/i],
];

function parseLine(line) {
  const parts = String(line).split("|").map((s) => s.trim()).filter(Boolean);
  if (parts.length < 2) return null;
  const d = normDate(parts[0]);
  if (!d) return null;
  const teams = parts[1].split(/\s+vs\.?\s+/i);
  if (teams.length !== 2 || !teams[0].trim() || !teams[1].trim()) return null;
  const f = { m: "", d, h: teams[0].trim(), a: teams[1].trim(), r: "", w: "", c: "", k: "", res: "" };
  for (const seg of parts.slice(2)) {
    for (const [key, re] of LABELS) {
      if (re.test(seg)) { f[key] = seg.replace(re, "").replace(/^[\s:\-]+/, "").trim().slice(0, 40); break; }
    }
  }
  return f;
}

module.exports = async (req, res) => {
  const raw = (process.env.FIXTURES_DOC_ID || "").trim();
  const id = (raw.match(/\/d\/([A-Za-z0-9_-]+)/) || [null, raw])[1];
  if (!id) return res.status(501).json({ error: "FIXTURES_DOC_ID is not set." });
  try {
    const r = await fetch(`https://docs.google.com/document/d/${id}/export?format=txt`, { redirect: "follow" });
    if (!r.ok) throw new Error("Google returned " + r.status);
    const text = (await r.text()).replace(/^\uFEFF/, "");
    if (/^\s*</.test(text)) throw new Error("The document is not shared with 'Anyone with the link'.");
    const list = text.split(/\r?\n/).slice(0, 400).map(parseLine).filter(Boolean);
    res.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate=300");
    return res.status(200).json(list);
  } catch (err) {
    console.error(err);
    return res.status(502).json({ error: "Could not read the fixtures document." });
  }
};
module.exports.parseLine = parseLine;
