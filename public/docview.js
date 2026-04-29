pdfjsLib.GlobalWorkerOptions.workerSrc =
    "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

const pdfContainer = document.getElementById("pdf-container");
const pageStatus = document.getElementById("page-status");
const zoomInBtn = document.getElementById("zoom-in");
const zoomOutBtn = document.getElementById("zoom-out");
const fitWidthBtn = document.getElementById("fit-width");

const currentPageNumberEl = document.getElementById("current-page-number");
const totalPageNumberEl = document.getElementById("total-page-number");
const zoomPercentageEl = document.getElementById("zoom-percentage");
const pageJumpInput = document.getElementById("page-jump-input");
const pageJumpTotal = document.getElementById("page-jump-total");

let pdfDoc = null;
let currentScale = 1.15;
let renderVersion = 0;
let pageElements = [];
let visibleRenderScheduled = false;
window.currentPdfPage = 1;

const PRELOAD_PAGE_BUFFER = 2; // render 2 pages before and after visible range

function updateZoomUI() {
    if (zoomPercentageEl) {
        zoomPercentageEl.textContent = `${Math.round(currentScale * 100)}%`;
    }
}

function clearActivePage() {
    pageElements.forEach((pageObj) => {
        pageObj.wrap.classList.remove("active-page");
    });
}

function updateCurrentPageOnScroll() {
    if (!pageElements.length) return;

    const viewportMiddle = window.innerHeight / 2;
    let closestPage = 1;
    let closestDistance = Infinity;
    let closestWrap = null;

    pageElements.forEach((pageObj) => {
        const rect = pageObj.wrap.getBoundingClientRect();
        const pageCenter = rect.top + rect.height / 2;
        const distance = Math.abs(pageCenter - viewportMiddle);

        if (distance < closestDistance) {
            closestDistance = distance;
            closestPage = pageObj.pageNum;
            closestWrap = pageObj.wrap;
        }
    });

    currentPageNumberEl.textContent = closestPage;
    window.currentPdfPage = closestPage;

    if (pageJumpInput && document.activeElement !== pageJumpInput) {
        pageJumpInput.value = closestPage;
    }

    clearActivePage();
    if (closestWrap) {
        closestWrap.classList.add("active-page");
    }
}

function scrollToPage(pageNumber) {
    const target = pageElements.find((page) => page.pageNum === pageNumber);
    if (!target) return;

    const top = target.wrap.getBoundingClientRect().top + window.scrollY - 120;

    window.scrollTo({
        top,
        behavior: "smooth"
    });
}

async function calculateFitWidthScale() {
    if (!pdfDoc) return currentScale;

    const firstPage = await pdfDoc.getPage(1);
    const unscaledViewport = firstPage.getViewport({ scale: 1 });

    const scrollArea = document.getElementById("pdf-scroll-area");
    const scrollAreaStyle = window.getComputedStyle(scrollArea);
    const scrollPaddingLeft = parseFloat(scrollAreaStyle.paddingLeft || "0");
    const scrollPaddingRight = parseFloat(scrollAreaStyle.paddingRight || "0");

    const availableWidth =
        scrollArea.clientWidth - scrollPaddingLeft - scrollPaddingRight - 8;

    if (availableWidth <= 0) return currentScale;

    const fittedScale = availableWidth / unscaledViewport.width;
    return Math.max(0.5, Math.min(fittedScale, 3));
}

function estimatePageHeight(page) {
    return page.baseViewport.height * currentScale;
}

function createPageSkeleton(pageNum, baseViewport) {
    const wrap = document.createElement("div");
    wrap.className = "pdf-page-wrap pdf-page-placeholder";
    wrap.dataset.pageNumber = pageNum;

    const canvas = document.createElement("canvas");
    canvas.className = "pdf-page-canvas";
    canvas.dataset.pageNumber = pageNum;

    const estimatedWidth = baseViewport.width * currentScale;
    const estimatedHeight = baseViewport.height * currentScale;

    canvas.width = Math.floor(estimatedWidth);
    canvas.height = Math.floor(estimatedHeight);

    canvas.style.width = `${estimatedWidth}px`;
    canvas.style.height = `${estimatedHeight}px`;
    canvas.style.background = "white";

    wrap.appendChild(canvas);

    return {
        pageNum,
        wrap,
        canvas,
        renderedScale: null,
        rendering: false,
        renderTask: null,
        baseViewport,
    };
}

function buildPageSkeletons() {
    if (!pdfDoc || !pageElements.length) return;

    pdfContainer.innerHTML = "";

    const fragment = document.createDocumentFragment();

    pageElements.forEach((pageObj) => {
        const estimatedWidth = pageObj.baseViewport.width * currentScale;
        const estimatedHeight = pageObj.baseViewport.height * currentScale;

        pageObj.canvas.width = Math.floor(estimatedWidth);
        pageObj.canvas.height = Math.floor(estimatedHeight);
        pageObj.canvas.style.width = `${estimatedWidth}px`;
        pageObj.canvas.style.height = `${estimatedHeight}px`;

        pageObj.wrap.classList.add("pdf-page-placeholder");
        pageObj.renderedScale = null;
        pageObj.rendering = false;
        pageObj.renderTask = null;

        const ctx = pageObj.canvas.getContext("2d");
        ctx.clearRect(0, 0, pageObj.canvas.width, pageObj.canvas.height);

        fragment.appendChild(pageObj.wrap);
    });

    pdfContainer.appendChild(fragment);
}

function getVisiblePageRange() {
    if (!pageElements.length) {
        return { start: 1, end: 1 };
    }

    let firstVisible = null;
    let lastVisible = null;

    pageElements.forEach((pageObj) => {
        const rect = pageObj.wrap.getBoundingClientRect();
        const isVisible = rect.bottom > 0 && rect.top < window.innerHeight;

        if (isVisible) {
            if (firstVisible === null) firstVisible = pageObj.pageNum;
            lastVisible = pageObj.pageNum;
        }
    });

    if (firstVisible === null || lastVisible === null) {
        let closestPage = 1;
        let closestDistance = Infinity;
        const viewportMiddle = window.innerHeight / 2;

        pageElements.forEach((pageObj) => {
            const rect = pageObj.wrap.getBoundingClientRect();
            const pageCenter = rect.top + rect.height / 2;
            const distance = Math.abs(pageCenter - viewportMiddle);

            if (distance < closestDistance) {
                closestDistance = distance;
                closestPage = pageObj.pageNum;
            }
        });

        firstVisible = closestPage;
        lastVisible = closestPage;
    }

    return {
        start: Math.max(1, firstVisible - PRELOAD_PAGE_BUFFER),
        end: Math.min(pageElements.length, lastVisible + PRELOAD_PAGE_BUFFER),
    };
}

async function renderPage(pageObj, versionAtStart) {
    if (!pdfDoc) return;
    if (versionAtStart !== renderVersion) return;
    if (pageObj.rendering) return;
    if (pageObj.renderedScale === currentScale) return;

    pageObj.rendering = true;

    try {
        const page = await pdfDoc.getPage(pageObj.pageNum);
        if (versionAtStart !== renderVersion) return;

        const viewport = page.getViewport({ scale: currentScale });
        const canvas = pageObj.canvas;
        const context = canvas.getContext("2d");

        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;

        context.clearRect(0, 0, canvas.width, canvas.height);

        const task = page.render({
            canvasContext: context,
            viewport: viewport
        });

        pageObj.renderTask = task;
        await task.promise;

        if (versionAtStart !== renderVersion) return;

        pageObj.renderedScale = currentScale;
        pageObj.wrap.classList.remove("pdf-page-placeholder");
    } catch (error) {
        if (error?.name !== "RenderingCancelledException") {
            console.error(`Error rendering page ${pageObj.pageNum}:`, error);
        }
    } finally {
        pageObj.rendering = false;
        pageObj.renderTask = null;
    }
}

async function renderVisiblePages() {
    if (!pdfDoc || !pageElements.length) return;

    const versionAtStart = renderVersion;
    const range = getVisiblePageRange();

    const pagesToRender = pageElements.filter(
        (pageObj) => pageObj.pageNum >= range.start && pageObj.pageNum <= range.end
    );

    for (const pageObj of pagesToRender) {
        if (versionAtStart !== renderVersion) return;
        await renderPage(pageObj, versionAtStart);
    }

    pageStatus.textContent = `${pdfDoc.numPages} page${pdfDoc.numPages > 1 ? "s" : ""}`;
}

function scheduleVisibleRender() {
    if (visibleRenderScheduled) return;

    visibleRenderScheduled = true;

    requestAnimationFrame(async () => {
        visibleRenderScheduled = false;
        await renderVisiblePages();
        updateCurrentPageOnScroll();
    });
}

async function initializeLazyPages() {
    if (!pdfDoc) return;

    renderVersion += 1;
    const myVersion = renderVersion;

    pageStatus.textContent = "Preparing pages...";
    pageElements = [];

    const fragment = document.createDocumentFragment();

    for (let pageNum = 1; pageNum <= pdfDoc.numPages; pageNum++) {
        if (myVersion !== renderVersion) return;

        const page = await pdfDoc.getPage(pageNum);
        const baseViewport = page.getViewport({ scale: 1 });

        const pageObj = createPageSkeleton(pageNum, baseViewport);
        pageElements.push(pageObj);
        fragment.appendChild(pageObj.wrap);
    }

    pdfContainer.innerHTML = "";
    pdfContainer.appendChild(fragment);

    totalPageNumberEl.textContent = pdfDoc.numPages;
    if (pageJumpTotal) {
        pageJumpTotal.textContent = `/ ${pdfDoc.numPages}`;
    }

    updateZoomUI();
    updateCurrentPageOnScroll();
    scheduleVisibleRender();
}

async function rerenderForNewScale() {
    if (!pdfDoc || !pageElements.length) return;

    renderVersion += 1;

    pageElements.forEach((pageObj) => {
        if (pageObj.renderTask && typeof pageObj.renderTask.cancel === "function") {
            try {
                pageObj.renderTask.cancel();
            } catch (err) {
                console.warn("Render cancel warning:", err);
            }
        }
    });

    buildPageSkeletons();
    updateZoomUI();
    updateCurrentPageOnScroll();
    scheduleVisibleRender();
}

/* ═══════════════════════════════════════════════
   PREMIUM PDF LOADER CONTROLLER
═══════════════════════════════════════════════ */
const PdfLoader = (() => {
    const loaderEl  = document.getElementById("pdf-loader");
    const barEl     = document.getElementById("pl-bar");
    const trackEl   = barEl ? barEl.closest(".pl-track") : null;
    const pctEl     = document.getElementById("pl-pct");
    const sizeEl    = document.getElementById("pl-size");
    const labelEl   = document.getElementById("pl-label");
    const etaEl     = document.getElementById("pl-eta");
    const stepEls   = document.querySelectorAll(".pl-step");

    let startTime   = 0;
    let lastPct     = 0;

    function formatBytes(bytes) {
        if (!bytes) return "";
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    }

    function setStep(index) {
        stepEls.forEach((el, i) => {
            el.classList.remove("pl-step--active", "pl-step--done");
            if (i < index)  el.classList.add("pl-step--done");
            if (i === index) el.classList.add("pl-step--active");
        });
    }

    function setIndeterminate(on) {
        if (!trackEl) return;
        if (on) trackEl.classList.add("pl-indeterminate");
        else    trackEl.classList.remove("pl-indeterminate");
    }

    function setProgress(pct, loaded, total) {
        if (!barEl) return;
        const p = Math.min(Math.max(pct, 0), 100);
        barEl.style.width = `${p}%`;
        if (pctEl) pctEl.textContent = `${Math.round(p)}%`;

        if (total && sizeEl) {
            sizeEl.textContent = `${formatBytes(loaded)} / ${formatBytes(total)}`;
        }

        // ETA calculation
        const elapsed = (Date.now() - startTime) / 1000;
        if (p > 5 && p < 100 && elapsed > 0.5) {
            const rate = p / elapsed;           // % per second
            const remaining = (100 - p) / rate; // seconds remaining
            if (etaEl && remaining > 0.5) {
                const secs = Math.round(remaining);
                etaEl.textContent = secs <= 3
                    ? "Almost there…"
                    : `~${secs}s remaining`;
                etaEl.classList.add("pl-eta--active");
            }
        }

        lastPct = p;
    }

    function show() {
        if (!loaderEl) return;
        startTime = Date.now();
        loaderEl.classList.remove("pl-hidden");
        setIndeterminate(true);
        setStep(0);
        if (labelEl) labelEl.textContent = "Fetching document…";
        if (etaEl)   { etaEl.textContent = "\u00a0"; etaEl.classList.remove("pl-eta--active"); }
        if (pctEl)   pctEl.textContent = "0%";
        if (sizeEl)  sizeEl.textContent = "\u00a0";
        if (barEl)   barEl.style.width = "0%";
    }

    function onProgress(loaded, total) {
        setIndeterminate(false);
        setStep(1);
        if (labelEl) labelEl.textContent = "Downloading PDF…";
        const pct = total ? (loaded / total) * 100 : 0;
        setProgress(pct, loaded, total);
    }

    function onRendering() {
        setIndeterminate(false);
        setStep(2);
        if (labelEl) labelEl.textContent = "Rendering pages…";
        if (etaEl)   { etaEl.textContent = "Almost there…"; etaEl.classList.add("pl-eta--active"); }
        setProgress(95, 0, 0);
    }

    function hide() {
        if (!loaderEl) return;
        setProgress(100, 0, 0);
        setStep(3); // all done
        if (labelEl) labelEl.textContent = "Document ready";
        if (etaEl)   { etaEl.textContent = "Enjoy reading!"; etaEl.classList.add("pl-eta--active"); }
        setTimeout(() => loaderEl.classList.add("pl-hidden"), 480);
    }

    return { show, onProgress, onRendering, hide };
})();

async function loadPdf() {
    try {
        pageStatus.textContent = "Loading PDF...";
        PdfLoader.show();

        const loadingTask = pdfjsLib.getDocument(pdfUrl);

        loadingTask.onProgress = ({ loaded, total }) => {
            PdfLoader.onProgress(loaded, total);
        };

        pdfDoc = await loadingTask.promise;

        PdfLoader.onRendering();

        totalPageNumberEl.textContent = pdfDoc.numPages;
        if (pageJumpTotal) {
            pageJumpTotal.textContent = `/ ${pdfDoc.numPages}`;
        }

        await initializeLazyPages();

        PdfLoader.hide();
    } catch (error) {
        console.error("PDF load error:", error);
        pageStatus.textContent = "Failed to load PDF";
        PdfLoader.hide();
    }
}

zoomInBtn.addEventListener("click", async () => {
    if (!pdfDoc) return;
    currentScale = Math.min(currentScale + 0.1, 3);
    await rerenderForNewScale();
});

zoomOutBtn.addEventListener("click", async () => {
    if (!pdfDoc) return;
    currentScale = Math.max(currentScale - 0.1, 0.5);
    await rerenderForNewScale();
});

fitWidthBtn.addEventListener("click", async () => {
    if (!pdfDoc) return;
    currentScale = await calculateFitWidthScale();
    await rerenderForNewScale();
});

if (pageJumpInput) {
    pageJumpInput.addEventListener("keydown", (e) => {
        if (e.key !== "Enter") return;

        const targetPage = Number(pageJumpInput.value);

        if (!pdfDoc || !Number.isInteger(targetPage)) {
            pageJumpInput.value = currentPageNumberEl.textContent || "1";
            return;
        }

        if (targetPage < 1) {
            pageJumpInput.value = 1;
            scrollToPage(1);
            return;
        }

        if (targetPage > pdfDoc.numPages) {
            pageJumpInput.value = pdfDoc.numPages;
            scrollToPage(pdfDoc.numPages);
            return;
        }

        scrollToPage(targetPage);
        setTimeout(scheduleVisibleRender, 120);
    });

    pageJumpInput.addEventListener("blur", () => {
        const value = Number(pageJumpInput.value);

        if (!pdfDoc || !Number.isInteger(value)) {
            pageJumpInput.value = currentPageNumberEl.textContent || "1";
            return;
        }

        if (value < 1) pageJumpInput.value = 1;
        if (value > pdfDoc.numPages) pageJumpInput.value = pdfDoc.numPages;
    });
}

window.addEventListener("scroll", () => {
    updateCurrentPageOnScroll();
    scheduleVisibleRender();
});

window.addEventListener("resize", () => {
    updateCurrentPageOnScroll();
    scheduleVisibleRender();
});
document.addEventListener("mousemove", (e) => {
    document.documentElement.style.setProperty("--mx", `${e.clientX}px`);
    document.documentElement.style.setProperty("--my", `${e.clientY}px`);
});

/* ═══════════════════════════════════════════════
   PAGE ROTATION
   Stores per-page rotation (0/90/180/270) and
   re-renders only the current page with the new angle.
═══════════════════════════════════════════════ */
const pageRotations = {}; // { pageNum: degrees }

function getPageRotation(pageNum) {
    return pageRotations[pageNum] || 0;
}

async function renderPageWithRotation(pageObj) {
    if (!pdfDoc) return;
    if (pageObj.rendering) return;

    pageObj.rendering = true;
    const versionAtStart = renderVersion;

    try {
        const page = await pdfDoc.getPage(pageObj.pageNum);
        if (versionAtStart !== renderVersion) return;

        const rotation = getPageRotation(pageObj.pageNum);
        const viewport = page.getViewport({ scale: currentScale, rotation });

        const canvas = pageObj.canvas;
        const context = canvas.getContext("2d");

        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;

        context.clearRect(0, 0, canvas.width, canvas.height);

        const task = page.render({ canvasContext: context, viewport });
        pageObj.renderTask = task;
        await task.promise;

        if (versionAtStart !== renderVersion) return;

        pageObj.renderedScale = currentScale;
        pageObj.wrap.classList.remove("pdf-page-placeholder");
    } catch (err) {
        if (err?.name !== "RenderingCancelledException") {
            console.error(`Rotation render error on page ${pageObj.pageNum}:`, err);
        }
    } finally {
        pageObj.rendering = false;
        pageObj.renderTask = null;
    }
}

const rotatePageBtn = document.getElementById("rotate-page-btn");
rotatePageBtn?.addEventListener("click", async () => {
    if (!pdfDoc || !pageElements.length) return;

    const currentPage = window.currentPdfPage || 1;
    const current = getPageRotation(currentPage);
    pageRotations[currentPage] = (current + 90) % 360;

    const pageObj = pageElements.find(p => p.pageNum === currentPage);
    if (!pageObj) return;

    // Force re-render by clearing cached scale
    pageObj.renderedScale = null;
    if (pageObj.renderTask?.cancel) {
        try { pageObj.renderTask.cancel(); } catch (_) {}
    }

    await renderPageWithRotation(pageObj);
});

loadPdf();