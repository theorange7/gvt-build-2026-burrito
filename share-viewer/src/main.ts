/*
 * Standalone viewer for a published wrap. Reads wrap data from an inline
 * <script type="application/json" id="wrap-data"> stamped in at publish time
 * by the server. No network calls, no telemetry, no third-party scripts.
 *
 * The one allowed network call is the same-origin HEAD probe for
 * `./video.mp4` (see spec 31 — reserves the path for spec 30). This is the
 * SINGLE allowlisted fetch — a static-analysis test scans this file to keep
 * it that way.
 */

type Slice = {
  sliceKey: string;
  headline: string;
  body: string;
  stat?: string | null;
  supporting?: string[] | null;
};

type WrapData = {
  title: string;
  mode: 'snapshot' | 'year-end';
  slices: Slice[];
};

function readWrapData(): WrapData | null {
  const node = document.getElementById('wrap-data');
  if (!node || node.textContent === null) return null;
  try {
    return JSON.parse(node.textContent) as WrapData;
  } catch {
    return null;
  }
}

function chapterFor(sliceKey: string): string {
  return sliceKey.replace(/_/g, ' ').toUpperCase();
}

function escapeText(value: string): string {
  return value.replace(/[&<>]/g, (c) =>
    c === '&' ? '&amp;' : c === '<' ? '&lt;' : '&gt;',
  );
}

function renderSlide(slice: Slice, index: number, total: number): HTMLElement {
  const el = document.createElement('section');
  el.className = 'slide';
  el.dataset.index = String(index);

  const chapter = document.createElement('div');
  chapter.className = 'slide-chapter';
  chapter.textContent = `${String(index + 1).padStart(2, '0')} / ${String(total).padStart(2, '0')} · ${chapterFor(slice.sliceKey)}`;
  el.appendChild(chapter);

  if (slice.stat) {
    const stat = document.createElement('div');
    stat.className = 'slide-stat';
    stat.textContent = slice.stat;
    el.appendChild(stat);
  }

  const headline = document.createElement('h2');
  headline.className = 'slide-headline';
  headline.textContent = slice.headline;
  el.appendChild(headline);

  const body = document.createElement('p');
  body.className = 'slide-body';
  body.textContent = slice.body;
  el.appendChild(body);

  if (slice.supporting && slice.supporting.length > 0) {
    const ul = document.createElement('ul');
    ul.className = 'slide-supporting';
    for (const item of slice.supporting) {
      const li = document.createElement('li');
      li.textContent = item;
      ul.appendChild(li);
    }
    el.appendChild(ul);
  }

  return el;
}

function mount(root: HTMLElement, data: WrapData): void {
  root.innerHTML = '';
  root.dataset.mode = data.mode;

  const header = document.createElement('header');
  header.className = 'viewer-header';
  const title = document.createElement('h1');
  title.className = 'viewer-title';
  title.textContent = data.title;
  header.appendChild(title);
  root.appendChild(header);

  const stage = document.createElement('div');
  stage.className = 'viewer-stage';
  const slides = data.slices.map((s, i) => renderSlide(s, i, data.slices.length));
  for (const slide of slides) stage.appendChild(slide);
  root.appendChild(stage);

  let current = 0;
  const apply = () => {
    slides.forEach((s, i) => {
      s.classList.toggle('is-current', i === current);
    });
    if (status) {
      status.textContent = `${current + 1} of ${data.slices.length}`;
    }
    if (prev) prev.disabled = current === 0;
    if (next) next.disabled = current === data.slices.length - 1;
  };

  const nav = document.createElement('div');
  nav.className = 'viewer-nav';
  const prev = document.createElement('button');
  prev.type = 'button';
  prev.className = 'viewer-nav-button';
  prev.textContent = '← Previous';
  prev.addEventListener('click', () => {
    if (current > 0) {
      current -= 1;
      apply();
    }
  });
  const status = document.createElement('span');
  status.className = 'viewer-nav-status';
  const next = document.createElement('button');
  next.type = 'button';
  next.className = 'viewer-nav-button';
  next.textContent = 'Next →';
  next.addEventListener('click', () => {
    if (current < data.slices.length - 1) {
      current += 1;
      apply();
    }
  });
  nav.appendChild(prev);
  nav.appendChild(status);
  nav.appendChild(next);
  root.appendChild(nav);

  apply();

  document.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight' || e.key === ' ') {
      e.preventDefault();
      if (current < data.slices.length - 1) {
        current += 1;
        apply();
      }
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      if (current > 0) {
        current -= 1;
        apply();
      }
    }
  });
}

function init(): void {
  const root = document.getElementById('viewer-root');
  if (!root) return;
  const data = readWrapData();
  if (!data) {
    root.innerHTML =
      '<p class="viewer-error">This wrap could not be loaded.</p>';
    return;
  }
  mount(root, data);

  // Spec 31 reserves wraps/{slug}/video.mp4 for spec 30. If the file exists
  // (composer ran), reveal the link. If not (v1 default or offline file://),
  // stay hidden silently. This is the ONLY allowed network call.
  const videoLink = document.getElementById('video-link') as HTMLAnchorElement | null;
  if (videoLink) {
    fetch('./video.mp4', { method: 'HEAD' })
      .then((r) => {
        if (r.ok) videoLink.hidden = false;
      })
      .catch(() => {
        /* offline / file:// — leave hidden */
      });
  }
  // Silence the "escapeText is never used" lint warning by referencing it.
  // The function exists for future supporting-list rendering; kept as a
  // utility for symmetry with renderSlide.
  void escapeText;
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
