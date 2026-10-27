// Breakerly website copy and links that are shared by the landing page, the app's More page and tests.
// Pure (no DOM). Feedback and "Notify me" open the person's own email app (mailto:): the project
// has no mail service, and this needs no server, no keys and no database change.

export const APP_NAME = 'Breakerly';
export const SITE_URL = 'https://www.breakerly.com';
export const FEEDBACK_EMAIL = 'margoittac@gmail.com';

export const ELECTRICIAN_PITCH = 'Leave a QR directory on every panel you touch, with your name and number on it.';
export const ELECTRICIAN_MORE = 'Homeowners scan the sticker on the panel door, see every breaker, and tap "Call your electrician" when they need you again. Free for 1–2 techs.';

export const APPS_SOON = {
  banner: 'iPhone & Android apps coming soon. Use Breakerly free on the web today.',
  title: 'Mobile apps coming soon – iPhone & Android',
  text: 'The web app works today on any phone or computer. Your homes, panels and stickers carry over to the apps when they launch.',
};

const enc = (s) => encodeURIComponent(s);

export function mailto(to, subject, body = '') {
  return `mailto:${to}?subject=${enc(subject)}${body ? `&body=${enc(body)}` : ''}`;
}

export function notifyMailto() {
  return mailto(FEEDBACK_EMAIL, 'Notify me when the Breakerly apps are out', 'Please email me when the Breakerly iPhone / Android app is ready.\n\nPhone type (iPhone or Android): ');
}

// kind: 'review' | 'idea' (anything else = general feedback)
export function feedbackMailto(kind = '', { where = 'web' } = {}) {
  const subject = kind === 'review' ? 'Breakerly review' : kind === 'idea' ? 'Breakerly feature idea' : 'Breakerly feedback';
  const prompt = kind === 'review' ? 'What do you like, and what should be better?' : kind === 'idea' ? 'The feature I wish Breakerly had:' : 'My feedback:';
  return mailto(FEEDBACK_EMAIL, subject, `${prompt}\n\n\n(sent from Breakerly ${where})`);
}
