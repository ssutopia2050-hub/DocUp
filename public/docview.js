pdfjsLib.GlobalWorkerOptions.workerSrc =
    "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

const pdfContainer = document.getElementById("pdf-container");
const pageStatus = document.getElementById("page-status");
const zoomInBtn = document.getElementById("zoom-in");
const zoomOutBtn = document.getElementById("zoom-out");
const fitWidthBtn = document.getElementById("fit-width");
const ghost_btn = document.querySelector(".ghost-btn");

let pdfDoc = null;
let currentScale = 1.15;
let isRendering = false;
let pendingRender = false;
let renderToken = 0;

async function renderAllPages() {
    if (!pdfDoc) return;

    if (isRendering) {
        pendingRender = true;
        return;
    }

    isRendering = true;
    const myToken = ++renderToken;

    try {
        pageStatus.textContent = "Rendering...";

        const fragment = document.createDocumentFragment();

        for (let pageNum = 1; pageNum <= pdfDoc.numPages; pageNum++) {
            if (myToken !== renderToken) {
                return;
            }

            const page = await pdfDoc.getPage(pageNum);
            const viewport = page.getViewport({ scale: currentScale });

            const wrap = document.createElement("div");
            wrap.className = "pdf-page-wrap";

            const canvas = document.createElement("canvas");
            canvas.className = "pdf-page-canvas";

            const context = canvas.getContext("2d");
            canvas.width = viewport.width;
            canvas.height = viewport.height;

            wrap.appendChild(canvas);
            fragment.appendChild(wrap);

            await page.render({
                canvasContext: context,
                viewport: viewport
            }).promise;
        }

        if (myToken === renderToken) {
            pdfContainer.innerHTML = "";
            pdfContainer.appendChild(fragment);
            pageStatus.textContent = `${pdfDoc.numPages} page${pdfDoc.numPages > 1 ? "s" : ""}`;
        }
    } catch (error) {
        console.error("PDF render error:", error);
        pageStatus.textContent = "Failed to render PDF";
    } finally {
        isRendering = false;

        if (pendingRender) {
            pendingRender = false;
            renderAllPages();
        }
    }
}

async function loadPdf() {
    try {
        pageStatus.textContent = "Loading PDF...";
        pdfDoc = await pdfjsLib.getDocument(pdfUrl).promise;
        await renderAllPages();
    } catch (error) {
        console.error("PDF load error:", error);
        pageStatus.textContent = "Failed to load PDF";
    }
}

zoomInBtn.addEventListener("click", async () => {
    if (!pdfDoc) return;
    currentScale += 0.1;
    renderAllPages();
});

zoomOutBtn.addEventListener("click", async () => {
    if (!pdfDoc) return;
    if (currentScale > 0.6) {
        currentScale -= 0.1;
        renderAllPages();
    }
});

fitWidthBtn.addEventListener("click", async () => {
    if (!pdfDoc) return;
    currentScale = 1.15;
    renderAllPages();
});

loadPdf();