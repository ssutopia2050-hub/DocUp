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

async function loadPdf() {
    try {
        pageStatus.textContent = "Loading PDF...";
        pdfDoc = await pdfjsLib.getDocument(pdfUrl).promise;

        totalPageNumberEl.textContent = pdfDoc.numPages;
        if (pageJumpTotal) {
            pageJumpTotal.textContent = `/ ${pdfDoc.numPages}`;
        }

        await initializeLazyPages();
    } catch (error) {
        console.error("PDF load error:", error);
        pageStatus.textContent = "Failed to load PDF";
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

loadPdf();