// Page transitions: every move between pages plays the same smooth, fully controlled
// animation, whether it comes from a mouse wheel, trackpad, swipe, key, link or page dot.
// Nothing can be dragged or scrolled by hand.
(() => {
  const deck = document.querySelector('.deck');
  const track = document.querySelector('.track');
  const pages = [...track.querySelectorAll('.page')];
  const dots = document.getElementById('dots');
  const dotButtons = [...dots.querySelectorAll('button')];
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');

  const EASE = 'cubic-bezier(0.65, 0, 0.35, 1)'; // even, smooth start and finish
  const DURATION = 800; // ms, the same everywhere

  let index = Math.max(0, pages.findIndex((page) => '#' + page.id === location.hash));
  let busyUntil = 0;
  const animating = () => performance.now() < busyUntil;
  const height = () => deck.clientHeight;
  const clamp = (i) => Math.max(0, Math.min(pages.length - 1, i));

  // Each page is placed in whole screen-heights (percentages) relative to the current one,
  // so it always lines up exactly, even when a phone changes the screen size by itself.
  function place() {
    pages.forEach((page, i) => {
      page.style.transform = `translate3d(0, ${(i - index) * 100}%, 0)`;
    });
  }

  function setTransition(value) {
    pages.forEach((page) => { page.style.transition = value; });
  }

  // On a computer, arriving on the contact page puts the cursor straight into the terminal,
  // once the page has finished gliding in. Not on phones: it would pop the keyboard up over the page.
  const terminalInput = document.getElementById('term-input');
  const terminalPage = terminalInput && terminalInput.closest('.page');
  function focusTerminalSoon(delay) {
    if (!terminalInput || !matchMedia('(pointer: fine)').matches) return;
    setTimeout(() => {
      if (pages[index] === terminalPage && !window.crashed) terminalInput.focus({ preventScroll: true });
    }, delay);
  }

  function markActive() {
    pages.forEach((page, i) => page.classList.toggle('is-active', i === index));
    dotButtons.forEach((dot, i) => dot.setAttribute('aria-current', i === index ? 'true' : 'false'));
  }

  function go(next) {
    if (window.crashed) return; // after the `crash` command, nothing moves until a refresh
    next = clamp(next);
    if (next === index) return;
    // Going down, the old page's content drifts up as it fades; going up, it drifts down.
    track.style.setProperty('--shift', next > index ? '-2.25rem' : '2.25rem');
    index = next;
    const duration = reduceMotion.matches ? 0 : DURATION;
    setTransition(duration ? `transform ${duration}ms ${EASE}` : 'none');
    track.style.setProperty('--delay', '320ms');
    place();
    busyUntil = performance.now() + duration;
    // With "Reduce Motion" turned on in the device settings, pages cross-fade instead of sliding.
    if (reduceMotion.matches && pages[index].animate) {
      pages[index].animate([{ opacity: 0 }, { opacity: 1 }], { duration: 450, easing: 'ease' });
    }
    markActive();
    const url = index === 0 ? location.pathname + location.search : '#' + pages[index].id;
    history.replaceState(null, '', url);
    // Leaving the contact page takes the cursor out of the terminal; arriving puts it in.
    if (document.activeElement === terminalInput && pages[index] !== terminalPage) terminalInput.blur();
    focusTerminalSoon(duration);
  }

  // Pages never scroll. If a page's content is taller than the screen (small phones,
  // short windows), it's shrunk just enough to fit. Measured from layout sizes,
  // so the glide-in offsets don't count.
  function fit() {
    for (const page of pages) {
      const parts = [...page.children];
      parts.forEach((part) => { part.style.zoom = ''; });
      const style = getComputedStyle(page);
      let fixed = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
      let content = 0;
      for (const part of parts) {
        content += part.offsetHeight;
        if (!part.matches('.intro-grid, .contact-inner')) fixed += parseFloat(getComputedStyle(part).marginTop) || 0;
      }
      const scale = Math.min(1, ((page.clientHeight - fixed) / content) * 0.98);
      if (scale < 1) parts.forEach((part) => { part.style.zoom = scale.toFixed(3); });
    }
  }

  // Mouse wheel and trackpad.
  // A trackpad flick keeps sending scroll events for a second or more. One flick turns
  // one page; the rest of it is ignored. A new flick (scrolling speeding up again) counts.
  let lastWheelAt = -Infinity;
  let gestureUsed = false;
  let gestureSum = 0;
  const recent = [];
  const average = (list) => list.reduce((a, b) => a + b, 0) / list.length;
  const speedingUp = () =>
    recent.length >= 6 && average(recent.slice(-2)) > average(recent.slice(-6, -2)) * 1.6 && average(recent.slice(-2)) > 10;

  addEventListener('wheel', (event) => {
    if (event.ctrlKey) { // ctrl + wheel and trackpad pinch would zoom the page
      event.preventDefault();
      return;
    }
    const now = performance.now();
    const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? height() : 1;
    const dy = event.deltaY * unit;
    const dx = event.deltaX * unit;
    event.preventDefault();
    if (now - lastWheelAt > 180) {
      gestureUsed = false;
      gestureSum = 0;
      recent.length = 0;
    }
    lastWheelAt = now;
    if (Math.abs(dx) > Math.abs(dy)) return; // no sideways scrolling
    recent.push(Math.abs(dy));
    if (recent.length > 12) recent.shift();
    if (gestureUsed && !animating() && speedingUp()) {
      gestureUsed = false;
      gestureSum = 0;
    }
    if (gestureUsed || animating()) return;
    gestureSum += dy;
    // Tiny nudges don't turn the page. A single mouse-wheel click always does,
    // even in browsers that report it as only a few pixels.
    const firstEvent = recent.length === 1;
    if (Math.abs(gestureSum) < 25 && !(firstEvent && Math.abs(dy) >= 4)) return;
    gestureUsed = true;
    go(index + Math.sign(gestureSum));
  }, { passive: false });

  // Touch: the page never follows the finger. A swipe up or down simply plays
  // the same controlled glide as on a computer.
  const zoomedIn = () => window.visualViewport && visualViewport.scale > 1.01;
  let touch = null;

  deck.addEventListener('touchstart', (event) => {
    const t = event.touches[0];
    touch = event.touches.length === 1 && !zoomedIn() ? { x0: t.clientX, y0: t.clientY, time: event.timeStamp } : null;
  }, { passive: true });

  deck.addEventListener('touchmove', (event) => {
    event.preventDefault(); // nothing moves under the finger
    if (event.touches.length !== 1) touch = null; // two fingers: not a swipe
  }, { passive: false });

  // No pinch-zooming anywhere: Safari ignores the viewport tag's user-scalable=no,
  // so its pinch gestures and two-finger moves are cancelled here.
  for (const type of ['gesturestart', 'gesturechange', 'gestureend']) {
    document.addEventListener(type, (event) => event.preventDefault(), { passive: false });
  }
  document.addEventListener('touchmove', (event) => {
    if (event.touches.length > 1) event.preventDefault();
  }, { passive: false });

  deck.addEventListener('touchend', (event) => {
    if (!touch) return;
    const t = event.changedTouches[0];
    const dy = t.clientY - touch.y0;
    const dx = t.clientX - touch.x0;
    const speed = Math.abs(dy) / Math.max(1, event.timeStamp - touch.time);
    touch = null;
    if (Math.abs(dy) < Math.abs(dx)) return; // sideways
    const swiped = Math.abs(dy) >= 40 || (Math.abs(dy) >= 15 && speed >= 0.3); // a real swipe, not a tap
    if (!swiped || animating()) return;
    go(index + (dy < 0 ? 1 : -1));
  });
  deck.addEventListener('touchcancel', () => { touch = null; });

  // Keyboard, except while typing in the terminal
  addEventListener('keydown', (event) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const target = event.target;
    const inField = target instanceof HTMLElement &&
      (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));
    if (inField && event.key === 'Escape') { // Esc leaves the terminal, so arrow keys turn pages again
      target.blur();
      return;
    }
    // While typing, arrow keys are the terminal's command history; Page Up/Down still turn pages.
    if (inField && event.key !== 'PageUp' && event.key !== 'PageDown') return;
    let next;
    switch (event.key) {
      case 'ArrowDown': case 'PageDown': next = index + 1; break;
      case 'ArrowUp': case 'PageUp': next = index - 1; break;
      case 'Home': next = 0; break;
      case 'End': next = pages.length - 1; break;
      case ' ':
        if (target instanceof Element && target.closest('button, a')) return; // space still presses buttons
        next = index + (event.shiftKey ? -1 : 1);
        break;
      default: return;
    }
    event.preventDefault();
    if (!animating()) go(next);
  });

  // "contact ↓" link and page dots
  for (const link of deck.querySelectorAll('a[href^="#"]')) {
    link.addEventListener('click', (event) => {
      const i = pages.indexOf(document.querySelector(link.getAttribute('href')));
      if (i < 0) return;
      event.preventDefault();
      go(i);
    });
  }
  dotButtons.forEach((dot, i) => dot.addEventListener('click', () => go(i)));

  // Tabbing to something on the other page moves to that page.
  deck.addEventListener('focusin', (event) => {
    const i = pages.indexOf(event.target.closest('.page'));
    if (i >= 0 && i !== index) go(i);
  });
  // The frame itself must never scroll (browsers sometimes try when focusing things).
  deck.addEventListener('scroll', () => {
    if (deck.scrollTop || deck.scrollLeft) deck.scrollTo(0, 0);
  });

  // Re-fit the pages when the window or phone rotates or resizes.
  addEventListener('resize', fit);
  window.visualViewport?.addEventListener('resize', fit);

  // Phones sometimes nudge the whole page, for example to make room for the keyboard.
  // Once nothing is being typed, put it back exactly where it belongs.
  const typing = () => document.activeElement instanceof HTMLInputElement;
  const resetWindow = () => {
    if (!typing() && (scrollX || scrollY)) scrollTo(0, 0);
  };
  addEventListener('scroll', resetWindow, { passive: true });
  addEventListener('focusout', () => setTimeout(resetWindow, 60));

  // The photo is only shown once it's downloaded and decoded, then it glides in.
  const photoBox = document.querySelector('.portrait-wrap');
  const photo = photoBox && photoBox.querySelector('img');
  if (photo) {
    const showPhoto = () => photoBox.classList.add('is-loaded');
    (photo.decode ? photo.decode() : Promise.resolve()).then(showPhoto, showPhoto);
  }

  // Once the photo has fully glided in, it starts floating gently (.is-floating in the CSS).
  // It only stops after its page has slid off screen, so the float never overlaps the
  // glide-in and its start and stop are never seen. Not with Reduce Motion (there's no glide
  // to wait for), nor when the page had to be shrunk to fit: Safari mis-draws moving things
  // inside shrunk content.
  if (photoBox) {
    const aboutPage = photoBox.closest('.page');
    photoBox.addEventListener('transitionend', (event) => {
      if (event.target !== photoBox || event.propertyName !== 'transform') return;
      const arrived = aboutPage.classList.contains('is-active') && photoBox.classList.contains('is-loaded');
      const shrunk = Boolean(photoBox.closest('.intro-grid').style.zoom);
      if (arrived && !shrunk && !window.crashed) photoBox.classList.add('is-floating');
    });
    aboutPage.addEventListener('transitionend', (event) => {
      if (event.target === aboutPage && event.propertyName === 'transform' && !aboutPage.classList.contains('is-active')) {
        photoBox.classList.remove('is-floating');
      }
    });
  }

  // On a computer, the floating photo also drifts a little away from the mouse. It moves on a
  // soft spring, so it starts gently, glides, and settles without snapping. When it first
  // notices the mouse (and again after the mouse leaves and comes back) the effect builds up
  // over a second and a half, so the first reaction is calm. It uses the separate `translate`
  // property, so it adds to the float instead of replacing it. It only reacts while the photo
  // is floating (fully arrived), and drifts back to the center when the mouse leaves the
  // window or the page changes.
  if (photo && matchMedia('(hover: hover) and (pointer: fine)').matches) {
    const MAX_SHIFT = 16; // px, at full strength
    const SPEED = 4.2; // how quickly the spring follows (higher is snappier)
    const DAMPING = 0.9; // 1 settles with no overshoot; a touch under lands softly
    const EASE_IN = 1500; // ms for the first reaction to build up to full strength
    // -1..1, leveling off smoothly toward the window edges instead of stopping hard
    const soft = (value) => {
      const v = Math.max(-1, Math.min(1, value));
      return 1.5 * v - 0.5 * v ** 3;
    };

    const mouse = { x: 0, y: 0 }; // where the mouse is, around the photo's center
    const position = { x: 0, y: 0 };
    const velocity = { x: 0, y: 0 };
    let tracking = false;
    let trackingSince = 0;
    let frame = 0;
    let lastTime = 0;

    const strength = (now) => {
      if (!tracking) return 0;
      const t = Math.min(1, (now - trackingSince) / EASE_IN);
      return t * t * (3 - 2 * t); // eases in and out
    };

    const step = (now) => {
      const dt = lastTime ? Math.min(0.05, (now - lastTime) / 1000) : 1 / 60;
      lastTime = now;
      const s = strength(now);
      let moving = tracking && s < 1;
      for (const axis of ['x', 'y']) {
        const goal = mouse[axis] * s;
        const pull = SPEED * SPEED * (goal - position[axis]) - 2 * DAMPING * SPEED * velocity[axis];
        velocity[axis] += pull * dt;
        position[axis] += velocity[axis] * dt;
        if (Math.abs(goal - position[axis]) > 0.0005 || Math.abs(velocity[axis]) > 0.0005) moving = true;
      }
      photo.style.translate = `${(-position.x * MAX_SHIFT).toFixed(2)}px ${(-position.y * MAX_SHIFT).toFixed(2)}px`; // away from the mouse
      if (moving) {
        frame = requestAnimationFrame(step);
      } else {
        frame = 0;
        lastTime = 0;
      }
    };
    const wake = () => {
      if (!frame) frame = requestAnimationFrame(step);
    };
    const letGo = () => {
      tracking = false;
      wake();
    };

    addEventListener('pointermove', (event) => {
      if (event.pointerType !== 'mouse') return;
      if (!photoBox.classList.contains('is-floating') || reduceMotion.matches) return letGo();
      const box = photoBox.getBoundingClientRect();
      mouse.x = soft((event.clientX - (box.left + box.width / 2)) / (innerWidth / 2));
      mouse.y = soft((event.clientY - (box.top + box.height / 2)) / (innerHeight / 2));
      if (!tracking) {
        tracking = true;
        trackingSince = performance.now();
      }
      wake();
    });
    document.documentElement.addEventListener('mouseleave', letGo);
    new MutationObserver(() => {
      if (!photoBox.classList.contains('is-floating')) letGo();
    }).observe(photoBox, { attributes: true, attributeFilter: ['class'] });
  }

  // Start: show the first page, then let its content glide in.
  fit();
  setTransition('none');
  track.style.setProperty('--delay', '150ms');
  place();
  dots.hidden = false;
  requestAnimationFrame(() => requestAnimationFrame(markActive));
  focusTerminalSoon(600); // in case the site was opened straight on the contact page
  window.pagesReady = true;
})();

// The terminal's `crash` command: the page glitches in bursts that keep getting stronger,
// switches off like an old TV, then "dies" into a fake 404 until it's refreshed. Purely for fun.
(() => {
  const root = document.documentElement;
  const deck = document.querySelector('.deck');
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const random = (min, max) => min + Math.random() * (max - min);
  const pick = (list) => list[Math.floor(Math.random() * list.length)];
  const GLITCH_MS = 1700;

  // Copies of the page, each showing one thin strip shifted sideways: the "torn signal" look
  function makeSlices(count) {
    const layer = document.createElement('div');
    layer.className = 'glitch-slices';
    layer.setAttribute('aria-hidden', 'true');
    for (let i = 0; i < count; i++) {
      const copy = deck.cloneNode(true);
      copy.querySelectorAll('[id]').forEach((el) => el.removeAttribute('id'));
      copy.classList.add('glitch-slice');
      copy.inert = true;
      copy.hidden = true;
      layer.append(copy);
    }
    document.body.append(layer);
    return layer;
  }

  // TV static: a small canvas of random grey pixels, stretched over the screen
  function makeNoise() {
    const canvas = document.createElement('canvas');
    canvas.className = 'glitch-noise';
    canvas.width = 160;
    canvas.height = 100;
    document.body.append(canvas);
    const ctx = canvas.getContext('2d');
    const frame = ctx && ctx.createImageData(canvas.width, canvas.height);
    canvas.draw = (opacity) => {
      if (!frame) return;
      const d = frame.data;
      for (let i = 0; i < d.length; i += 4) {
        const v = (Math.random() * 255) | 0;
        d[i] = v;
        d[i + 1] = v;
        d[i + 2] = v;
        d[i + 3] = 255;
      }
      ctx.putImageData(frame, 0, 0);
      canvas.style.opacity = opacity;
    };
    return canvas;
  }

  function show404() {
    const screen = document.createElement('div');
    screen.className = 'crash-404';
    screen.setAttribute('role', 'alert');
    screen.innerHTML = `
      <div>
        <h1 class="glitch" data-text="404">404</h1>
        <p class="crash-title">page not found<span class="crash-cursor">_</span></p>
        <p class="crash-hint">you crashed it. <button type="button">refresh</button> to bring it back.</p>
      </div>`;
    screen.querySelector('button').addEventListener('click', () => location.reload());
    document.body.append(screen);
    document.title = '404 · Not Found';
  }

  window.crashSite = () => {
    if (window.crashed) return;
    window.crashed = true;
    document.activeElement?.blur?.();
    root.classList.add('crashing');

    if (reduceMotion.matches) { // no shaking for people who turned motion off
      deck.style.transition = 'opacity 0.4s ease';
      deck.style.opacity = '0';
      setTimeout(show404, 400);
      return;
    }

    const slices = makeSlices(4);
    const bars = document.createElement('div'); // inverted bars that flash across the screen
    bars.className = 'glitch-bars';
    for (let i = 0; i < 6; i++) bars.append(document.createElement('span'));
    document.body.append(bars);
    const noise = makeNoise();
    const scan = document.createElement('div'); // screen lines
    scan.className = 'glitch-scan';
    document.body.append(scan);
    const tints = ['none', 'none', 'hue-rotate(90deg) saturate(4)', 'hue-rotate(-100deg) saturate(4)', 'invert(1)', 'contrast(2.5) saturate(0)'];

    const start = performance.now();
    const timer = setInterval(() => {
      const progress = Math.min(1, (performance.now() - start) / GLITCH_MS);
      const strength = 0.2 + 0.8 * progress ** 1.5;
      // Real glitches come in bursts: some moments calm, more of them wild as it builds up
      const burst = Math.random() < 0.35 + 0.6 * progress;
      const s = burst ? strength : strength * 0.15;
      const split = random(1, 9) * s;
      // Late on, the picture sometimes jumps vertically, like a TV losing its signal
      const jump = burst && progress > 0.45 && Math.random() < 0.12 ? random(-0.18, 0.18) * innerHeight : 0;
      deck.style.transform = `translate3d(${random(-12, 12) * s}px, ${random(-4, 4) * s + jump}px, 0)`;
      deck.style.filter = burst
        ? `drop-shadow(${split}px 0 0 rgba(109, 40, 217, 0.85)) drop-shadow(${-split}px 0 0 rgba(0, 240, 255, 0.8))` +
          (progress > 0.6 && Math.random() < 0.08 ? ' invert(1)' : '')
        : 'none';
      deck.style.opacity = Math.random() < 0.06 * s ? '0.25' : '1';

      for (const slice of slices.children) {
        const on = burst && Math.random() < 0.3 + 0.6 * s;
        slice.hidden = !on;
        if (!on) continue;
        const top = random(0, 96);
        const height = random(0.8, 2 + 14 * s);
        slice.style.clipPath = `inset(${top}% 0 ${Math.max(0, 100 - top - height)}% 0)`;
        slice.style.transform = `translate3d(${random(-1, 1) * 70 * s}px, 0, 0)`;
        slice.style.filter = pick(tints);
      }
      for (const bar of bars.children) {
        const on = burst && Math.random() < 0.15 + 0.35 * s;
        bar.style.opacity = on ? '1' : '0';
        if (!on) continue;
        bar.style.top = `${random(0, 100)}%`;
        bar.style.height = `${random(0.2, 0.6 + 3 * s)}%`;
        bar.style.transform = `translateX(${random(-30, 30) * s}%)`;
      }
      noise.draw(burst ? (0.05 + 0.3 * s).toFixed(2) : '0.04');
      scan.style.opacity = (0.3 + 0.7 * progress).toFixed(2);
    }, 50);

    // Then switch off like an old TV: a white flash squashes into a glowing line,
    // then a dot, then dark. After a beat of black, the 404 flickers on.
    setTimeout(() => {
      clearInterval(timer);
      for (const layer of [slices, bars, noise, scan]) layer.remove();
      deck.style.transform = '';
      deck.style.filter = '';
      root.classList.add('crt-off');
      const crt = document.createElement('div');
      crt.className = 'crt';
      document.body.append(crt);
      setTimeout(() => { deck.style.opacity = '0'; }, 70);
      if (!crt.animate) {
        setTimeout(show404, 900);
        return;
      }
      crt.animate([
        { opacity: 0, transform: 'scale(1, 1)' },
        { opacity: 1, transform: 'scale(1, 1)', offset: 0.1 },
        { opacity: 1, transform: 'scale(1, 0.006)', offset: 0.45 },
        { opacity: 1, transform: 'scale(0.003, 0.006)', offset: 0.8 },
        { opacity: 0, transform: 'scale(0, 0)' },
      ], { duration: 750, easing: 'cubic-bezier(0.6, 0, 0.4, 1)', fill: 'forwards' }).onfinish = () => {
        crt.remove();
        setTimeout(show404, 250);
      };
    }, GLITCH_MS);
  };
})();

(() => {
  const cli = document.getElementById('cli');
  const out = document.getElementById('term-out');
  const form = document.getElementById('term-form');
  const input = document.getElementById('term-input');

  // The email is put together here instead of being written in the HTML,
  // so simple spam bots that only read the page source don't find it.
  const email = ['dbamir', 'outlook.com'].join('@');
  const github = 'https://github.com/dbamir';
  const linkedin = 'https://www.linkedin.com/in/amir-arsalan-pazhouhi-5b028b264';
  const instagram = 'https://www.instagram.com/amirpzq/';
  // A WhatsApp username link opens a chat without showing a phone number.
  const whatsapp = 'https://wa.me/amirpzq';

  // Like a real terminal window: once it's full, the oldest lines leave at the top.
  function trim() {
    while (out.scrollHeight > out.clientHeight + 1 && out.childElementCount > 1) out.firstElementChild.remove();
  }

  function print(...parts) {
    const line = document.createElement('p');
    line.append(...parts);
    out.append(line);
    trim();
    return line;
  }

  function link(text, href, newTab = false) {
    const a = document.createElement('a');
    a.href = href;
    a.textContent = text;
    if (newTab) {
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
    }
    return a;
  }

  function span(className, text) {
    const s = document.createElement('span');
    s.className = className;
    s.textContent = text;
    return s;
  }

  const arrow = () => span('t-arrow', '→ ');

  // Profile commands show one line with a spinner and a thin progress bar, then open the
  // profile in a new tab. The bar stutters forward in uneven jumps with pauses, different
  // every time, like a real download. A new command cancels one that's still loading,
  // shown as ^C, so quick taps never open several tabs.
  // How long it can take depends on the browser: a new tab is only allowed shortly after
  // the tap. Safari (every iPhone browser, and Safari on Mac, which has GestureEvent) blocks
  // it at 1 second; Chrome, Firefox and Edge allow a few seconds.
  const OPEN_DELAY = 'GestureEvent' in window ? 850 : 2000; // ms
  const BAR = 8; // progress bar width, in characters (keeps the line on one row on a phone)
  const SPINNER = '⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏';
  let pending = null;

  // A few uneven jumps with pauses between them (one of them long), ending at 100%
  // just before the tab opens. Returns [time in ms, percent] pairs.
  function stutter() {
    const steps = [];
    let at = 0;
    let percent = 0;
    const longPause = Math.floor(Math.random() * 3) + 1;
    while (percent < 100) {
      at += (40 + Math.random() * 120) * (steps.length === longPause ? 3 : 1);
      percent = Math.min(100, percent + 6 + Math.random() * 24);
      steps.push([at, Math.round(percent)]);
    }
    const fit = (OPEN_DELAY - 100) / at;
    return steps.map(([time, value]) => [time * fit, value]);
  }

  function cancelPending() {
    if (!pending) return;
    cancelAnimationFrame(pending.frame);
    clearTimeout(pending.open);
    pending.line.replaceChildren(span('t-error', '✗'), ' opening ', pending.name, span('t-error', ' ^C'));
    pending = null;
  }

  function openProfile(name, href) {
    const spin = span('t-arrow', SPINNER[0]);
    const filled = span('t-user', '');
    const empty = span('t-dim', '━'.repeat(BAR));
    const percent = span('t-dim', '0%');
    // Screen readers hear "opening github" once, not every frame of the animation.
    for (const part of [spin, filled, empty, percent]) part.setAttribute('aria-hidden', 'true');
    const nameLink = link(name, href, true); // stays clickable, just in case
    const line = print(spin, ' opening ', nameLink, ' ', filled, empty, ' ', percent);
    line.className = 't-loader';

    const steps = stutter();
    const state = { line, name: nameLink, frame: 0, open: 0 };
    const start = performance.now();
    const draw = (now) => {
      const elapsed = now - start;
      let done = 0;
      for (const [time, value] of steps) if (time <= elapsed) done = value;
      const cells = Math.round((done / 100) * BAR);
      filled.textContent = '━'.repeat(cells);
      empty.textContent = '━'.repeat(BAR - cells);
      percent.textContent = `${done}%`;
      spin.textContent = SPINNER[Math.floor(elapsed / 70) % SPINNER.length];
      state.frame = requestAnimationFrame(draw);
    };
    state.frame = requestAnimationFrame(draw);

    // Scheduled right away (not from the animation), so the browser still counts it as part of the tap.
    state.open = setTimeout(() => {
      cancelAnimationFrame(state.frame);
      pending = null;
      let tab = null;
      try {
        tab = window.open(href, '_blank');
        if (tab) tab.opener = null;
      } catch {}
      if (tab) line.replaceChildren(span('t-user', '✓'), ' opened ', nameLink, span('t-dim', ' in a new tab'));
      else line.replaceChildren(span('t-error', '✗'), ' new tab blocked. tap ', nameLink);
    }, OPEN_DELAY);
    pending = state;
  }

  function echo(cmd) {
    print(span('t-user', 'amir@dbamir'), ' ', span('t-path', '~'), ' % ', span('t-cmd', cmd));
  }

  const commands = {
    hello() {
      print('hi! type a command, or tap one below.');
    },
    help() {
      print(span('t-key', 'contact:'), '  ', span('t-cmd', 'email  github  linkedin  instagram  whatsapp'));
      print(span('t-key', 'other:'), '    ', span('t-cmd', 'whoami  ls  clear  crash'));
    },
    email() {
      const line = print(arrow(), link(email, 'mailto:' + email));
      navigator.clipboard?.writeText(email).then(() => {
        line.append(span('t-comment', '  // copied'));
        trim();
      }, () => {});
    },
    github() {
      openProfile('github', github);
    },
    linkedin() {
      openProfile('linkedin', linkedin);
    },
    instagram() {
      openProfile('instagram', instagram);
    },
    whatsapp() {
      openProfile('whatsapp', whatsapp);
    },
    whoami() {
      print(span('t-type', 'Amir Arsalan Pajouhi'));
      print('Computer Engineering student · Istanbul, Turkey');
    },
    ls() {
      print(span('t-path', 'email  github  linkedin  instagram  whatsapp'));
    },
    clear() {
      out.replaceChildren();
    },
    exit() {
      print("you can't leave yet. try: ", span('t-cmd', 'email'));
    },
    crash() {
      print(span('t-error', 'zsh: segmentation fault (core dumped)'));
      // Spaced out so visitors can read each line before the page starts glitching
      setTimeout(() => print(span('t-error', 'kernel panic - not syncing: fatal exception')), 600);
      setTimeout(() => print(span('t-comment', '// rebooting reality...')), 1200);
      setTimeout(() => window.crashSite?.(), 2300);
    },
  };
  commands.mail = commands.email;
  commands.ig = commands.instagram;
  commands.wa = commands.whatsapp;
  commands.gh = commands.github;
  commands.git = commands.github;

  const history = [];
  let historyIndex = 0;

  function run(raw) {
    cancelPending();
    const cmd = raw.trim();
    echo(cmd);
    if (!cmd) return;
    history.push(cmd);
    historyIndex = history.length;
    const name = cmd.split(/\s+/)[0].toLowerCase();
    if (name === 'sudo') {
      print(span('t-error', 'nice try.'));
    } else if (Object.hasOwn(commands, name)) {
      commands[name]();
    } else {
      print(span('t-error', `zsh: command not found: ${name}`));
      print(span('t-comment', "// type 'help' to see what works"));
    }
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    run(input.value);
    input.value = '';
  });

  // Up and down arrows scroll through earlier commands, like a real shell.
  input.addEventListener('keydown', (event) => {
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
    if (!history.length) return;
    event.preventDefault();
    historyIndex += event.key === 'ArrowUp' ? -1 : 1;
    historyIndex = Math.max(0, Math.min(history.length, historyIndex));
    input.value = history[historyIndex] ?? '';
  });

  for (const button of document.querySelectorAll('[data-cmd]')) {
    button.addEventListener('click', () => run(button.dataset.cmd));
  }

  // On a computer, clicking the terminal puts the cursor in it. Skipped on phones so the keyboard doesn't pop up.
  out.addEventListener('click', (event) => {
    if (event.target.closest('a') || getSelection().toString()) return;
    if (matchMedia('(pointer: fine)').matches) input.focus();
  });

  cli.hidden = false;
  echo('hello');
  commands.hello();
})();
