// Parallax, scroll reveal, header state, reading progress and the motion toggle.
// Elements with [data-speed] move relative to their parent's position in the
// viewport: positive values drift up faster than the scroll, negative values lag.
// [data-speed-x] adds sideways drift (negative = left, positive = right) as the
// section scrolls up.
(function () {
  const root = document.documentElement;
  const systemReduce = window.matchMedia("(prefers-reduced-motion: reduce)");
  const STORAGE_KEY = "reduce-motion";

  // The visitor's own choice wins; otherwise follow the OS setting.
  function storedChoice() {
    try { return localStorage.getItem(STORAGE_KEY); } catch (e) { return null; }
  }
  function motionReduced() {
    const choice = storedChoice();
    return choice === null ? systemReduce.matches : choice === "1";
  }

  const header = document.querySelector(".site-header");
  const progress = document.querySelector(".progress");
  const layers = Array.from(document.querySelectorAll("[data-speed]"));
  const panels = Array.from(document.querySelectorAll(".case-panel"));
  const panelInners = panels.map((p) => p.querySelector(".case-panel__inner"));

  // Reveal on scroll
  const revealables = document.querySelectorAll(".reveal, .bars");
  let io = null;
  if ("IntersectionObserver" in window && !motionReduced()) {
    io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            io.unobserve(entry.target);
          }
        });
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0 }
    );
    const vh = window.innerHeight;
    revealables.forEach((el) => {
      // Anything already on screen at load shows straight away.
      if (el.getBoundingClientRect().top < vh) el.classList.add("is-visible");
      else io.observe(el);
    });
  } else {
    revealables.forEach((el) => el.classList.add("is-visible"));
  }

  let ticking = false;

  function update() {
    ticking = false;
    const vh = window.innerHeight;
    const y = window.scrollY;

    if (header) header.classList.toggle("is-scrolled", y > 24);

    if (progress) {
      const max = document.documentElement.scrollHeight - vh;
      progress.style.transform = `scaleX(${max > 0 ? Math.min(y / max, 1) : 0})`;
    }

    if (motionReduced()) return;

    // Stacked case study panels: the one being covered recedes as the next slides over it
    for (let i = 0; i < panels.length - 1; i++) {
      const nextTop = panels[i + 1].getBoundingClientRect().top;
      const p = Math.min(Math.max(1 - nextTop / vh, 0), 1);
      const inner = panelInners[i];
      if (!inner) continue;
      inner.style.transform = p > 0 ? `scale(${(1 - 0.06 * p).toFixed(4)})` : "";
      inner.style.opacity = p > 0 ? (1 - 0.55 * p).toFixed(3) : "";
    }

    for (const el of layers) {
      // Measure the parent so the element's own transform doesn't feed back.
      const rect = el.parentElement.getBoundingClientRect();
      if (rect.bottom < -vh * 0.5 || rect.top > vh * 1.5) continue;
      const speed = parseFloat(el.dataset.speed) || 0;
      const speedX = parseFloat(el.dataset.speedX) || 0; // optional sideways drift
      const offset = rect.top + rect.height / 2 - vh / 2;
      const base = el.dataset.rotate ? ` rotate(${el.dataset.rotate}deg)` : "";
      el.style.transform = `translate3d(${(-offset * speedX).toFixed(1)}px, ${(-offset * speed).toFixed(1)}px, 0)${base}`;
    }
  }

  function onScroll() {
    if (!ticking) {
      ticking = true;
      requestAnimationFrame(update);
    }
  }

  // Motion toggle: fixed switch on every page
  function applyMotion(reduced) {
    root.classList.toggle("reduce-motion", reduced);
    if (reduced) {
      // Drop parallax offsets and show anything still waiting to reveal.
      layers.forEach((el) => {
        el.style.transform = el.dataset.rotate ? `rotate(${el.dataset.rotate}deg)` : "";
      });
      revealables.forEach((el) => el.classList.add("is-visible"));
      if (io) io.disconnect();
      panelInners.forEach((el) => { if (el) { el.style.transform = ""; el.style.opacity = ""; } });
    } else {
      update();
    }
  }

  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "motion-toggle";
  toggle.setAttribute("role", "switch");
  toggle.innerHTML = '<span class="motion-toggle__track" aria-hidden="true"><span class="motion-toggle__thumb"></span></span><span>Reduce motion</span>';
  const syncToggle = () => toggle.setAttribute("aria-checked", String(motionReduced()));
  toggle.addEventListener("click", () => {
    const next = !motionReduced();
    try { localStorage.setItem(STORAGE_KEY, next ? "1" : "0"); } catch (e) { /* not persisted */ }
    applyMotion(next);
    syncToggle();
  });
  document.body.appendChild(toggle);
  syncToggle();
  applyMotion(motionReduced());
  if (systemReduce.addEventListener) {
    systemReduce.addEventListener("change", () => {
      if (storedChoice() === null) { applyMotion(motionReduced()); syncToggle(); }
    });
  }

  // Resume: play an exit sequence before following internal links
  const resume = document.querySelector(".resume");
  if (resume) {
    document.addEventListener("click", (e) => {
      if (motionReduced()) return;
      const link = e.target.closest("a[href]");
      if (!link || e.defaultPrevented || e.button !== 0) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || link.target === "_blank") return;
      const url = new URL(link.href, location.href);
      if (url.origin !== location.origin || !/^https?:|^file:/.test(url.protocol)) return;
      if (url.pathname === location.pathname && url.search === location.search) return; // same page
      e.preventDefault();
      document.body.classList.add("is-leaving");
      const side = document.querySelector(".resume__side");
      let done = false;
      const go = () => { if (!done) { done = true; location.href = url.href; } };
      side.addEventListener("animationend", (ev) => { if (ev.animationName === "resume-side-out") go(); });
      setTimeout(go, 1100); // fallback if animationend doesn't fire
    });
    // Coming back via the back button restores the page from cache: reset it.
    window.addEventListener("pageshow", (e) => { if (e.persisted) document.body.classList.remove("is-leaving"); });
  }

  // Case studies: click an image to view it larger, step through the images in
  // the same section with the arrows, keyboard (← → Esc) or a swipe.
  if (document.querySelector(".next")) {
    const images = Array.from(document.querySelectorAll("main section:not(.next) img"));
    images.forEach((img) => {
      img.classList.add("zoomable");
      img.setAttribute("tabindex", "0");
      img.setAttribute("role", "button");
      img.setAttribute("aria-label", `View larger: ${img.alt || "image"}`);
    });

    const box = document.createElement("div");
    box.className = "lightbox";
    box.setAttribute("role", "dialog");
    box.setAttribute("aria-modal", "true");
    box.setAttribute("aria-label", "Image viewer");
    box.hidden = true;
    box.innerHTML = `
      <button type="button" class="lightbox__close" aria-label="Close">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>
      </button>
      <button type="button" class="lightbox__nav lightbox__nav--prev" aria-label="Previous image">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>
      </button>
      <figure class="lightbox__frame">
        <img class="lightbox__img" alt="">
        <figcaption class="lightbox__caption"><span class="lightbox__text"></span><span class="lightbox__count"></span></figcaption>
      </figure>
      <button type="button" class="lightbox__nav lightbox__nav--next" aria-label="Next image">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg>
      </button>`;
    document.body.appendChild(box);

    const big = box.querySelector(".lightbox__img");
    const text = box.querySelector(".lightbox__text");
    const count = box.querySelector(".lightbox__count");
    const prevBtn = box.querySelector(".lightbox__nav--prev");
    const nextBtn = box.querySelector(".lightbox__nav--next");
    let group = [];
    let index = 0;
    let opener = null;

    const show = (i) => {
      index = (i + group.length) % group.length;
      const img = group[index];
      big.src = img.currentSrc || img.src;
      big.alt = img.alt;
      text.textContent = img.alt;
      count.textContent = group.length > 1 ? `${index + 1} / ${group.length}` : "";
      prevBtn.hidden = nextBtn.hidden = group.length < 2;
    };
    const open = (img) => {
      group = images.filter((other) => other.closest("section") === img.closest("section"));
      opener = img;
      show(group.indexOf(img));
      box.hidden = false;
      root.classList.add("lightbox-open");
      requestAnimationFrame(() => box.classList.add("is-open"));
      box.querySelector(".lightbox__close").focus();
    };
    const close = () => {
      box.classList.remove("is-open");
      root.classList.remove("lightbox-open");
      const finish = () => { box.hidden = true; if (opener) opener.focus(); };
      if (motionReduced()) finish(); else setTimeout(finish, 200);
    };

    images.forEach((img) => {
      img.addEventListener("click", () => open(img));
      img.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(img); }
      });
    });
    box.querySelector(".lightbox__close").addEventListener("click", close);
    prevBtn.addEventListener("click", () => show(index - 1));
    nextBtn.addEventListener("click", () => show(index + 1));
    box.addEventListener("click", (e) => { if (e.target === box) close(); }); // backdrop
    document.addEventListener("keydown", (e) => {
      if (box.hidden) return;
      if (e.key === "Escape") close();
      else if (e.key === "ArrowLeft" && group.length > 1) show(index - 1);
      else if (e.key === "ArrowRight" && group.length > 1) show(index + 1);
      else if (e.key === "Tab") {
        // Keep focus inside the viewer
        const focusables = Array.from(box.querySelectorAll("button:not([hidden])"));
        const first = focusables[0], last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    });
    let touchX = null;
    box.addEventListener("touchstart", (e) => { touchX = e.touches[0].clientX; }, { passive: true });
    box.addEventListener("touchend", (e) => {
      if (touchX === null || group.length < 2) return;
      const dx = e.changedTouches[0].clientX - touchX;
      if (Math.abs(dx) > 50) show(index + (dx < 0 ? 1 : -1));
      touchX = null;
    });
  }

  // Scale embedded 1440px-wide prototypes to the width of their frame
  const protoFrames = Array.from(document.querySelectorAll(".proto__frame"));
  if (protoFrames.length && "ResizeObserver" in window) {
    const ro = new ResizeObserver((entries) => {
      entries.forEach((entry) => {
        entry.target.style.setProperty("--proto-scale", (entry.contentRect.width / 1440).toFixed(4));
      });
    });
    protoFrames.forEach((frame) => ro.observe(frame));
  }

  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll);
  update();
})();
