/**
 * What a person sees while a form is on its way and when the answer is back:
 * the pressed button turns into a spinner, and the page's result message
 * ("saved", "that link is taken") arrives as a toast instead of a line in
 * the page.
 *
 * Nothing depends on this script. Without it the forms still submit and the
 * messages still show where the page wrote them.
 * The same file lives in the platform and in the owner dashboard.
 */

// ---------------------------------------------------------------------------
// Busy buttons
// ---------------------------------------------------------------------------

function release(form: HTMLFormElement): void {
  delete form.dataset.sending;
  for (const button of form.querySelectorAll<HTMLButtonElement>('button[data-loading]')) {
    delete button.dataset.loading;
    button.removeAttribute('aria-busy');
  }
}

// On the document, so it runs after a form's own listeners and can tell when
// one of them has decided the form is not being sent after all.
document.addEventListener('submit', (event) => {
  const form = event.target;
  if (!(form instanceof HTMLFormElement) || event.defaultPrevented) return;

  // A second press while the first is on its way would send the form twice.
  if (form.dataset.sending) {
    event.preventDefault();
    return;
  }
  form.dataset.sending = 'true';

  const pressed = event.submitter instanceof HTMLButtonElement ? event.submitter : form.querySelector<HTMLButtonElement>('button[type="submit"], button:not([type])');
  if (pressed) {
    // The spinner takes the color the label had, whatever kind of button this is.
    pressed.style.setProperty('--spin', getComputedStyle(pressed).color);
    pressed.dataset.loading = 'true';
    pressed.setAttribute('aria-busy', 'true');
  }

  // A form that opens its answer in another tab leaves this page as it is.
  if (form.target === '_blank') setTimeout(() => release(form), 1500);
});

// Coming back with the browser's Back button shows the page as it was left: mid-send.
window.addEventListener('pageshow', (event) => {
  if (event.persisted) document.querySelectorAll<HTMLFormElement>('form[data-sending]').forEach(release);
});

// ---------------------------------------------------------------------------
// Toasts
// ---------------------------------------------------------------------------

/** How long a toast stays. A problem stays longer: it has to be read and acted on. */
const LIFE_MS = { ok: 4500, error: 10_000 };

const ICONS = {
  ok: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path class="toast__draw" d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  error:
    '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" aria-hidden="true"><path class="toast__draw" d="M7 7l10 10M17 7L7 17"/></svg>',
};

function dismiss(toast: HTMLElement): void {
  if (toast.classList.contains('is-leaving')) return;
  toast.classList.add('is-leaving');
  toast.addEventListener('animationend', () => toast.remove(), { once: true });
  // In case the leaving animation never runs (a browser set to show none).
  setTimeout(() => toast.remove(), 400);
}

function showToast(stack: HTMLElement, message: Element, kind: 'ok' | 'error'): void {
  const toast = document.createElement('div');
  toast.className = `toast toast--${kind}`;
  toast.setAttribute('role', kind === 'error' ? 'alert' : 'status');

  const icon = document.createElement('span');
  icon.className = 'toast__icon';
  icon.innerHTML = ICONS[kind];

  // The message's own words and lists move over as they are; its icon is replaced by the toast's.
  const body = document.createElement('div');
  body.className = 'toast__body';
  for (const node of [...message.childNodes]) {
    if (!(node instanceof SVGElement)) body.append(node);
  }

  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'toast__close';
  close.setAttribute('aria-label', 'إغلاق');
  close.innerHTML =
    '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
  close.addEventListener('click', () => dismiss(toast));

  // The bar is the toast's clock: when it has run out, the toast goes.
  // Resting the pointer on the toast pauses it (see the styles).
  const bar = document.createElement('span');
  bar.className = 'toast__bar';
  bar.style.animationDuration = `${LIFE_MS[kind]}ms`;
  bar.addEventListener('animationend', () => dismiss(toast));

  toast.append(icon, body, close, bar);
  stack.append(toast);
  message.remove();
}

function showResults(): void {
  // A message marked data-stay is part of the page (a standing warning, a
  // step still to do) and is left where it is.
  const found = [
    ...[...document.querySelectorAll('.notice[role="status"]:not(.notice--error):not([data-stay])')].map((message) => ({ message, kind: 'ok' as const })),
    ...[...document.querySelectorAll('.notice--error[role="alert"]:not([data-stay]), .auth__alert[role="alert"]')].map((message) => ({ message, kind: 'error' as const })),
  ];
  if (found.length === 0) return;

  const stack = document.createElement('div');
  stack.className = 'toasts';
  document.body.append(stack);
  for (const { message, kind } of found) showToast(stack, message, kind);

  // "?saved" has said its piece; without it, reloading the page does not say it again.
  const url = new URL(location.href);
  if (['saved', 'moved'].some((flag) => url.searchParams.has(flag))) {
    url.searchParams.delete('saved');
    url.searchParams.delete('moved');
    history.replaceState(history.state, '', url);
  }
}

showResults();
