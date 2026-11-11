// Vercel serverless function: POST /api/contact  ->  sends the enquiry via Resend.
// The Resend API key lives only in the host's environment variables, never in the page.

const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  let b = req.body;
  if (typeof b === "string") {
    try { b = JSON.parse(b || "{}"); } catch { b = {}; }
  }
  b = b || {};

  // Honeypot: real visitors never fill this hidden field.
  if (b.website) return res.status(200).json({ ok: true });

  const player = String(b.player || "").trim().slice(0, 80);
  const phone = String(b.phone || "").trim().slice(0, 30);
  const email = String(b.email || "").trim().slice(0, 120);
  const age = String(b.age || "").trim().slice(0, 3);

  if (!player || !phone || !age || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: "Please fill in all fields with valid details." });
  }

  const key = process.env.RESEND_API_KEY;
  if (!key) return res.status(500).json({ error: "Email is not configured." });

  const to = process.env.CONTACT_TO || "srijan.fa.contact@gmail.com";
  const from = process.env.CONTACT_FROM || "Srijan FA <onboarding@resend.dev>";

  const text = `New enquiry from the website\n\nPlayer: ${player}\nAge: ${age}\nPhone: ${phone}\nEmail: ${email}\n`;
  const html = `<h2>New enquiry from the website</h2>
<p><b>Player:</b> ${esc(player)}<br><b>Age:</b> ${esc(age)}<br><b>Phone:</b> ${esc(phone)}<br><b>Email:</b> ${esc(email)}</p>
<p>Reply to this email to answer them directly.</p>`;

  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [to], reply_to: email, subject: `New enquiry: ${player} (age ${age})`, html, text }),
    });
    if (!r.ok) {
      console.error("Resend error:", r.status, await r.text());
      return res.status(502).json({ error: "Could not send the message." });
    }
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error(err);
    return res.status(502).json({ error: "Could not send the message." });
  }
};
