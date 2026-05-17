/*
 * Pre-built standalone wrap viewer. Source of truth is share-viewer/src/main.ts;
 * this file is the deploy artifact (also checked in so the server worker and
 * tests can load it without an esbuild pass). Regenerate with
 * `pnpm -C share-viewer build`.
 *
 * Hard rules (verified by privacy-invariants tests):
 *   - The ONLY network call is the same-origin HEAD probe for ./video.mp4
 *     (spec 31 reserves the path for spec 30).
 *   - No XMLHttpRequest, no sendBeacon, no third-party hostnames.
 */
(function () {
  'use strict';

  function readWrapData() {
    var node = document.getElementById('wrap-data');
    if (!node || node.textContent === null) return null;
    try {
      return JSON.parse(node.textContent);
    } catch (e) {
      return null;
    }
  }

  function chapterFor(sliceKey) {
    return String(sliceKey).replace(/_/g, ' ').toUpperCase();
  }

  function renderSlide(slice, index, total) {
    var el = document.createElement('section');
    el.className = 'slide';
    el.dataset.index = String(index);

    var chapter = document.createElement('div');
    chapter.className = 'slide-chapter';
    chapter.textContent =
      String(index + 1).padStart(2, '0') +
      ' / ' +
      String(total).padStart(2, '0') +
      ' · ' +
      chapterFor(slice.sliceKey);
    el.appendChild(chapter);

    if (slice.stat) {
      var stat = document.createElement('div');
      stat.className = 'slide-stat';
      stat.textContent = slice.stat;
      el.appendChild(stat);
    }

    var headline = document.createElement('h2');
    headline.className = 'slide-headline';
    headline.textContent = slice.headline;
    el.appendChild(headline);

    var body = document.createElement('p');
    body.className = 'slide-body';
    body.textContent = slice.body;
    el.appendChild(body);

    if (slice.supporting && slice.supporting.length > 0) {
      var ul = document.createElement('ul');
      ul.className = 'slide-supporting';
      for (var i = 0; i < slice.supporting.length; i++) {
        var li = document.createElement('li');
        li.textContent = slice.supporting[i];
        ul.appendChild(li);
      }
      el.appendChild(ul);
    }

    return el;
  }

  function mount(root, data) {
    root.innerHTML = '';
    root.dataset.mode = data.mode;

    var header = document.createElement('header');
    header.className = 'viewer-header';
    var title = document.createElement('h1');
    title.className = 'viewer-title';
    title.textContent = data.title;
    header.appendChild(title);
    root.appendChild(header);

    var stage = document.createElement('div');
    stage.className = 'viewer-stage';
    var slides = data.slices.map(function (s, i) {
      return renderSlide(s, i, data.slices.length);
    });
    for (var i = 0; i < slides.length; i++) stage.appendChild(slides[i]);
    root.appendChild(stage);

    var current = 0;
    var prev = document.createElement('button');
    prev.type = 'button';
    prev.className = 'viewer-nav-button';
    prev.textContent = '← Previous';
    var status = document.createElement('span');
    status.className = 'viewer-nav-status';
    var next = document.createElement('button');
    next.type = 'button';
    next.className = 'viewer-nav-button';
    next.textContent = 'Next →';

    function apply() {
      for (var i = 0; i < slides.length; i++) {
        slides[i].classList.toggle('is-current', i === current);
      }
      status.textContent =
        current + 1 + ' of ' + data.slices.length;
      prev.disabled = current === 0;
      next.disabled = current === data.slices.length - 1;
    }

    prev.addEventListener('click', function () {
      if (current > 0) {
        current -= 1;
        apply();
      }
    });
    next.addEventListener('click', function () {
      if (current < data.slices.length - 1) {
        current += 1;
        apply();
      }
    });

    var nav = document.createElement('div');
    nav.className = 'viewer-nav';
    nav.appendChild(prev);
    nav.appendChild(status);
    nav.appendChild(next);
    root.appendChild(nav);

    apply();

    document.addEventListener('keydown', function (e) {
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

  function init() {
    var root = document.getElementById('viewer-root');
    if (!root) return;
    var data = readWrapData();
    if (!data) {
      root.innerHTML = '<p class="viewer-error">This wrap could not be loaded.</p>';
      return;
    }
    mount(root, data);

    var videoLink = document.getElementById('video-link');
    if (videoLink) {
      fetch('./video.mp4', { method: 'HEAD' })
        .then(function (r) {
          if (r.ok) videoLink.hidden = false;
        })
        .catch(function () {
          /* offline / file:// — leave hidden */
        });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
