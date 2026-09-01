// Cloudflare Pages Function
// Route: POST /api/contact
// Receives the contact form submission from the site and relays it to
// hello@riverfinance.ca via the Resend API. Resend is used purely as a
// delivery pipe here — it sends the message and stores nothing on its
// end beyond a short send log. No lead data is stored by this function
// or by Resend; it exists only in the resulting email.

const RECIPIENT = 'hello@riverfinance.ca';

// Until riverfinance.ca is verified as a sending domain in Resend, mail
// must be sent "from" this address. Once the domain is verified (see
// deployment notes), switch this to something like
// 'River Finance <forms@riverfinance.ca>' for better deliverability.
const SENDER = 'River Finance <onboarding@resend.dev>';

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export async function onRequestPost(context) {
  const { request, env } = context;

  if (!env.RESEND_API_KEY) {
    return jsonResponse({ ok: false, error: 'Server is not configured to send email yet.' }, 500);
  }

  let form;
  try {
    form = await request.formData();
  } catch (err) {
    return jsonResponse({ ok: false, error: 'Could not read form data.' }, 400);
  }

  const name = (form.get('name') || '').toString().trim();
  const business = (form.get('business') || '').toString().trim();
  const email = (form.get('email') || '').toString().trim();
  const phone = (form.get('phone') || '').toString().trim();
  const message = (form.get('message') || '').toString().trim();

  // Honeypot: a hidden field real visitors never fill in. If it has a
  // value, silently pretend success so the bot moves on.
  const honeypot = (form.get('company_website') || '').toString().trim();
  if (honeypot) {
    return jsonResponse({ ok: true });
  }

  if (!name || !business || !email) {
    return jsonResponse({ ok: false, error: 'Name, business, and email are required.' }, 400);
  }

  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailPattern.test(email)) {
    return jsonResponse({ ok: false, error: 'That email address doesn\'t look right.' }, 400);
  }

  const subject = `Contact form: ${business || name}`;
  const textBody =
    `Name: ${name}\n` +
    `Business: ${business}\n` +
    `Email: ${email}\n` +
    `Phone: ${phone || '(not provided)'}\n\n` +
    `Message:\n${message || '(none)'}`;

  const htmlBody = `
    <h2>New contact form submission</h2>
    <p><strong>Name:</strong> ${escapeHtml(name)}</p>
    <p><strong>Business:</strong> ${escapeHtml(business)}</p>
    <p><strong>Email:</strong> ${escapeHtml(email)}</p>
    <p><strong>Phone:</strong> ${escapeHtml(phone) || '(not provided)'}</p>
    <p><strong>Message:</strong><br>${escapeHtml(message).replace(/\n/g, '<br>') || '(none)'}</p>
  `;

  try {
    const resendResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: SENDER,
        to: [RECIPIENT],
        reply_to: email,
        subject,
        text: textBody,
        html: htmlBody,
      }),
    });

    if (!resendResponse.ok) {
      const errText = await resendResponse.text();
      console.error('Resend error:', resendResponse.status, errText);
      return jsonResponse({ ok: false, error: 'The message could not be sent. Please try again.' }, 502);
    }

    return jsonResponse({ ok: true });
  } catch (err) {
    console.error('Contact function error:', err);
    return jsonResponse({ ok: false, error: 'The message could not be sent. Please try again.' }, 500);
  }
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
