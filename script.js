const sectionMap = {
  hero: "hero",
  projects: "projects",
  about: "about",
};

function initSiteLoading() {
  const loadingLayer = document.querySelector(".site-loading");
  const progressBar = loadingLayer?.querySelector(".site-loading-track");

  if (!loadingLayer) {
    return;
  }

  const startedAt = Date.now();
  const showDelay = 450;
  const minimumVisibleTime = 520;
  const maximumVisibleTime = 3600;
  let progress = 0;
  let loadingComplete = false;
  let loadingVisible = false;
  let progressTimer = 0;

  function setProgress(value) {
    progress = Math.max(progress, Math.min(value, 100));
    loadingLayer.style.setProperty("--loading-progress", `${progress}%`);

    if (progressBar) {
      progressBar.setAttribute("aria-valuenow", String(Math.round(progress)));
    }
  }

  function startProgress() {
    if (progressTimer) {
      return;
    }

    progressTimer = window.setInterval(() => {
      if (loadingComplete) {
        return;
      }

      const nextProgress = progress + Math.max(2, (88 - progress) * 0.12);
      setProgress(Math.min(nextProgress, 88));
    }, 130);
  }

  function showLoading() {
    if (loadingComplete || loadingVisible) {
      return;
    }

    loadingVisible = true;
    loadingLayer.hidden = false;
    document.body.classList.add("is-loading");
    setProgress(56);
    startProgress();
  }

  function waitForImage(image) {
    if (image.complete && image.naturalWidth > 0) {
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      image.addEventListener("load", resolve, { once: true });
      image.addEventListener("error", resolve, { once: true });
    });
  }

  function waitForObject(objectElement) {
    if (objectElement.contentDocument?.documentElement) {
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      objectElement.addEventListener("load", resolve, { once: true });
      objectElement.addEventListener("error", resolve, { once: true });
      window.setTimeout(resolve, 1800);
    });
  }

  function waitForMainResources() {
    const criticalResources = Array.from(
      document.querySelectorAll(".topbar img, .hero img, .hero object")
    );

    const resourcePromises = criticalResources.map((resource) => {
      if (resource instanceof HTMLImageElement) {
        return waitForImage(resource);
      }

      if (resource instanceof HTMLObjectElement) {
        return waitForObject(resource);
      }

      return Promise.resolve();
    });

    if (document.fonts?.ready) {
      resourcePromises.push(document.fonts.ready.catch(() => {}));
    }

    return Promise.allSettled(resourcePromises);
  }

  function hideLoading() {
    if (loadingComplete) {
      return;
    }

    loadingComplete = true;
    window.clearTimeout(showTimer);
    window.clearTimeout(maximumTimer);
    window.clearInterval(progressTimer);

    if (!loadingVisible) {
      loadingLayer.remove();
      return;
    }

    setProgress(100);

    const elapsed = Date.now() - startedAt;
    const waitTime = Math.max(0, minimumVisibleTime - elapsed);

    window.setTimeout(() => {
      loadingLayer.classList.add("is-hiding");
      document.body.classList.remove("is-loading");
      loadingLayer.addEventListener("transitionend", () => {
        loadingLayer.remove();
      }, { once: true });
    }, waitTime);
  }

  const showTimer = window.setTimeout(showLoading, showDelay);
  const maximumTimer = window.setTimeout(hideLoading, maximumVisibleTime);

  waitForMainResources().then(hideLoading);
}

initSiteLoading();

const CLICK_EFFECT_DEFAULT_COLOR = "#b9372e";
const CLICK_EFFECT_FALLBACK_COLOR = "#b8b8b8";
const CLICK_EFFECT_CONFLICT_RGB = [185, 55, 46];
const CLICK_EFFECT_IMAGE_TOLERANCE = 18;
const CLICK_EFFECT_COLOR_PROPS = [
  "backgroundColor",
  "color",
  "borderTopColor",
  "borderRightColor",
  "borderBottomColor",
  "borderLeftColor",
  "outlineColor",
  "textDecorationColor",
  "fill",
  "stroke",
];
const CLICK_EFFECT_RED_IMAGE_MARKERS = [
  "nav-tab-active.svg",
  "nav-tab-wide-active.svg",
  "detail-nav-fill.svg",
  "detail-home-hover.svg",
];

const navLinks = Array.from(document.querySelectorAll(".nav-link"));
const observedSections = Array.from(document.querySelectorAll("[data-section]"));
const revealItems = Array.from(document.querySelectorAll(".reveal"));
const aboutSection = document.querySelector("#about");
const aboutHeading = aboutSection?.querySelector(".section-head");
const clickEffectCanvas = document.createElement("canvas");
const clickEffectContext = clickEffectCanvas.getContext("2d", { willReadFrequently: true });

function parseColorChannels(value) {
  if (!value) {
    return null;
  }

  const normalized = value.trim().toLowerCase();

  if (normalized.startsWith("#")) {
    let hex = normalized.slice(1);
    if (hex.length === 3) {
      hex = hex.split("").map((char) => char + char).join("");
    }

    if (hex.length !== 6 || /[^0-9a-f]/.test(hex)) {
      return null;
    }

    return [
      Number.parseInt(hex.slice(0, 2), 16),
      Number.parseInt(hex.slice(2, 4), 16),
      Number.parseInt(hex.slice(4, 6), 16),
    ];
  }

  const match = normalized.match(/^rgba?\(([^)]+)\)$/);
  if (!match) {
    return null;
  }

  const channels = match[1]
    .split(",")
    .slice(0, 3)
    .map((part) => Number.parseFloat(part.trim()));

  if (channels.length !== 3 || channels.some((channel) => !Number.isFinite(channel))) {
    return null;
  }

  return channels.map((channel) => Math.round(channel));
}

function isConflictClickColor(value) {
  const channels = parseColorChannels(value);
  if (!channels) {
    return false;
  }

  return channels.every((channel, index) => channel === CLICK_EFFECT_CONFLICT_RGB[index]);
}

function isNearConflictClickColor(channels) {
  if (!channels || channels.length < 3) {
    return false;
  }

  return channels.slice(0, 3).every((channel, index) => {
    return Math.abs(channel - CLICK_EFFECT_CONFLICT_RGB[index]) <= CLICK_EFFECT_IMAGE_TOLERANCE;
  });
}

function hasConflictBackgroundImage(value) {
  if (!value || value === "none") {
    return false;
  }

  const normalized = value.toLowerCase();
  return CLICK_EFFECT_RED_IMAGE_MARKERS.some((marker) => normalized.includes(marker));
}

function hasConflictVisualStyle(node, pseudoElement = null) {
  const computedStyle = window.getComputedStyle(node, pseudoElement);

  if (CLICK_EFFECT_COLOR_PROPS.some((prop) => isConflictClickColor(computedStyle[prop]))) {
    return true;
  }

  return hasConflictBackgroundImage(computedStyle.backgroundImage);
}

function sampleImageConflictAtPoint(image, clientX, clientY) {
  if (!clickEffectContext || !image?.complete || !image.naturalWidth || !image.naturalHeight) {
    return false;
  }

  const rect = image.getBoundingClientRect();
  if (!rect.width || !rect.height) {
    return false;
  }

  const relativeX = (clientX - rect.left) / rect.width;
  const relativeY = (clientY - rect.top) / rect.height;

  if (relativeX < 0 || relativeX > 1 || relativeY < 0 || relativeY > 1) {
    return false;
  }

  const sampleX = Math.max(0, Math.min(image.naturalWidth - 1, Math.round(relativeX * (image.naturalWidth - 1))));
  const sampleY = Math.max(0, Math.min(image.naturalHeight - 1, Math.round(relativeY * (image.naturalHeight - 1))));

  clickEffectCanvas.width = 3;
  clickEffectCanvas.height = 3;

  try {
    clickEffectContext.clearRect(0, 0, 3, 3);
    clickEffectContext.drawImage(image, sampleX - 1, sampleY - 1, 3, 3, 0, 0, 3, 3);
    const pixels = clickEffectContext.getImageData(0, 0, 3, 3).data;

    for (let index = 0; index < pixels.length; index += 4) {
      const alpha = pixels[index + 3];
      if (alpha < 32) {
        continue;
      }

      if (isNearConflictClickColor([pixels[index], pixels[index + 1], pixels[index + 2]])) {
        return true;
      }
    }
  } catch {
    return false;
  }

  return false;
}

function shouldUseFallbackClickColor(target, event) {
  let node = target instanceof Element ? target : target?.parentElement;

  while (node) {
    if (hasConflictVisualStyle(node) || hasConflictVisualStyle(node, "::before") || hasConflictVisualStyle(node, "::after")) {
      return true;
    }

    if (node instanceof HTMLImageElement && sampleImageConflictAtPoint(node, event.clientX, event.clientY)) {
      return true;
    }

    node = node.parentElement;
  }

  return false;
}

function syncDetailObjectAspectRatio() {
  const detailObject = document.querySelector(".detail-object");
  if (!detailObject || detailObject.tagName !== "OBJECT") {
    return;
  }

  function applyAspectRatio(width, height) {
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
      return false;
    }

    detailObject.style.setProperty("--detail-object-aspect", `${width} / ${height}`);
    return true;
  }

  function parseSvgRoot(svgRoot) {
    if (!svgRoot) {
      return false;
    }

    const viewBox = svgRoot.getAttribute("viewBox");
    if (viewBox) {
      const parts = viewBox.trim().split(/[\s,]+/).map(Number);
      if (parts.length === 4 && applyAspectRatio(parts[2], parts[3])) {
        return true;
      }
    }

    const width = Number.parseFloat(svgRoot.getAttribute("width") || "");
    const height = Number.parseFloat(svgRoot.getAttribute("height") || "");
    return applyAspectRatio(width, height);
  }

  function updateFromLoadedObject() {
    const svgRoot = detailObject.contentDocument?.documentElement;
    parseSvgRoot(svgRoot);
  }

  detailObject.addEventListener("load", updateFromLoadedObject);

  if (detailObject.contentDocument?.documentElement) {
    updateFromLoadedObject();
  } else if (
    detailObject.data &&
    !detailObject.style.getPropertyValue("--detail-object-aspect").trim()
  ) {
    fetch(detailObject.data)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Failed to load SVG: ${response.status}`);
        }
        return response.text();
      })
      .then((svgText) => {
        const svgDoc = new DOMParser().parseFromString(svgText, "image/svg+xml");
        parseSvgRoot(svgDoc.documentElement);
      })
      .catch(() => {
        // Keep the fallback aspect ratio when the SVG cannot be inspected.
      });
  }
}

function initDynamicDetailNavBackground() {
  if (document.body.dataset.detailNavGradient !== "tencent-xr") {
    return;
  }

  const detailImage = document.querySelector(".detail-image, .detail-object");
  if (!detailImage) {
    return;
  }

  const gradientStops = [
    [0, [0, 9, 22]],
    [0.256586, [0, 9, 22]],
    [0.327872, [26, 117, 239]],
    [0.386189, [160, 201, 255]],
    [0.6875, [219, 231, 255]],
    [1, [226, 236, 255]],
  ];

  function interpolateColor(progress) {
    const nextIndex = gradientStops.findIndex(([offset]) => offset >= progress);
    if (nextIndex <= 0) {
      return gradientStops[0][1];
    }

    if (nextIndex === -1) {
      return gradientStops[gradientStops.length - 1][1];
    }

    const [startOffset, startColor] = gradientStops[nextIndex - 1];
    const [endOffset, endColor] = gradientStops[nextIndex];
    const amount = (progress - startOffset) / (endOffset - startOffset);

    return startColor.map((channel, index) => {
      return Math.round(channel + (endColor[index] - channel) * amount);
    });
  }

  function relativeLuminance(color) {
    const channels = color.map((channel) => {
      const value = channel / 255;
      return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    });

    return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
  }

  function contrastRatio(firstColor, secondColor) {
    const lighter = Math.max(relativeLuminance(firstColor), relativeLuminance(secondColor));
    const darker = Math.min(relativeLuminance(firstColor), relativeLuminance(secondColor));
    return (lighter + 0.05) / (darker + 0.05);
  }

  function getForegroundColor(backgroundColor) {
    const lightForeground = [244, 248, 255];
    const darkForeground = [28, 45, 70];
    const lightContrast = contrastRatio(backgroundColor, lightForeground);
    const darkContrast = contrastRatio(backgroundColor, darkForeground);

    return lightContrast >= darkContrast ? lightForeground : darkForeground;
  }

  let frameId = 0;

  function updateHeaderColor() {
    frameId = 0;
    const imageTop = detailImage.offsetTop;
    const imageHeight = detailImage.offsetHeight;
    const sampleY = window.scrollY + 34 - imageTop;
    const progress = Math.max(0, Math.min(1, sampleY / imageHeight));
    const color = interpolateColor(progress);
    const foregroundColor = getForegroundColor(color);

    document.body.style.setProperty("--detail-header-bg", `rgb(${color.join(", ")})`);
    document.body.style.setProperty("--detail-header-bg-rgb", color.join(", "));
    document.body.style.setProperty("--detail-nav-fg", `rgb(${foregroundColor.join(", ")})`);
    document.body.style.setProperty(
      "--detail-home-normal-dynamic",
      foregroundColor[0] === 244
        ? 'url("./assets/detail-nav/home-normal-light.svg")'
        : 'url("./assets/detail-nav/home-normal-dark.svg")',
    );
  }

  function requestHeaderUpdate() {
    if (!frameId) {
      frameId = window.requestAnimationFrame(updateHeaderColor);
    }
  }

  window.addEventListener("scroll", requestHeaderUpdate, { passive: true });
  window.addEventListener("resize", requestHeaderUpdate);
  detailImage.addEventListener("load", requestHeaderUpdate);
  requestHeaderUpdate();
}

function setActiveNav(key) {
  navLinks.forEach((link) => {
    const isActive = link.dataset.nav === key;
    link.classList.toggle("active", isActive);
    if (isActive) {
      link.setAttribute("aria-current", "page");
    } else {
      link.removeAttribute("aria-current");
    }
  });
}

function updateActiveNavByScroll() {
  const checkpoint = window.innerHeight * 0.36;
  let currentSection = "hero";

  observedSections.forEach((section) => {
    if (section.hidden || section.getClientRects().length === 0) {
      return;
    }

    const rect = section.getBoundingClientRect();
    if (rect.top <= checkpoint) {
      currentSection = section.dataset.section;
    }
  });

  const mapped = sectionMap[currentSection];
  if (mapped) {
    setActiveNav(mapped);
  } else {
    navLinks.forEach((link) => {
      link.classList.remove("active");
      link.removeAttribute("aria-current");
    });
  }
}

updateActiveNavByScroll();
window.addEventListener("scroll", updateActiveNavByScroll, { passive: true });
window.addEventListener("resize", updateActiveNavByScroll);

const revealObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add("visible");
      revealObserver.unobserve(entry.target);
    });
  },
  {
    threshold: 0.18,
    rootMargin: "0px 0px -8% 0px",
  }
);

if (aboutSection && aboutHeading) {
  const rabbitObserver = new IntersectionObserver(
    (entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) {
        return;
      }

      aboutSection.classList.add("rabbit-playing");
      rabbitObserver.disconnect();
    },
    {
      threshold: 0.2,
      rootMargin: "0px 0px -12% 0px",
    }
  );

  rabbitObserver.observe(aboutHeading);
}

function initGlobalClickEffect() {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    return;
  }

  const layer = document.createElement("div");
  layer.className = "click-effect-layer";
  layer.setAttribute("aria-hidden", "true");
  document.body.appendChild(layer);

  const burstMarkup = `
    <svg viewBox="0 0 72 72" aria-hidden="true">
      <path d="M35.6 24.2 C35.9 21.9 36.3 20.1 36.8 18.3" />
      <path d="M43.8 27.2 C45.3 25.4 46.9 24.1 48.9 22.8" />
      <path d="M47.7 35.1 C50 34.6 51.9 34.4 54 34.4" />
      <path d="M24.2 36.8 C21.9 36.9 20.1 36.7 18.1 36.1" />
      <path d="M26.9 28.1 C25.3 26.8 24 25.5 22.8 23.5" />
    </svg>
  `;

  document.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 || event.pointerType === "touch") {
      return;
    }

    const burst = document.createElement("div");
    burst.className = "click-effect-burst";
    burst.style.left = `${event.clientX}px`;
    burst.style.top = `${event.clientY}px`;
    burst.style.color = shouldUseFallbackClickColor(event.target, event)
      ? CLICK_EFFECT_FALLBACK_COLOR
      : CLICK_EFFECT_DEFAULT_COLOR;
    burst.innerHTML = burstMarkup;
    layer.appendChild(burst);

    burst.addEventListener("animationend", () => {
      burst.remove();
    }, { once: true });
  });
}

function initLockedProjectStatus() {
  document.querySelectorAll(".project-cover-locked").forEach((cover) => {
    cover.addEventListener("pointermove", (event) => {
      if (event.pointerType === "touch") {
        return;
      }

      const rect = cover.getBoundingClientRect();
      cover.style.setProperty("--project-status-x", `${event.clientX - rect.left}px`);
      cover.style.setProperty("--project-status-y", `${event.clientY - rect.top}px`);
      cover.classList.add("is-pointer-active");
    });

    cover.addEventListener("pointerleave", () => {
      cover.classList.remove("is-pointer-active");
    });
  });
}

initGlobalClickEffect();
initLockedProjectStatus();
syncDetailObjectAspectRatio();
initDynamicDetailNavBackground();

revealItems.forEach((item, index) => {
  item.style.transitionDelay = `${Math.min(index % 4, 3) * 70}ms`;
  revealObserver.observe(item);
});
