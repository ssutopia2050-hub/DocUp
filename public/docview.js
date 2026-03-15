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

async function renderAllPages() {
    pdfContainer.innerHTML = "";

    for (let pageNum = 1; pageNum <= pdfDoc.numPages; pageNum++) {
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
        pdfContainer.appendChild(wrap);

        await page.render({
            canvasContext: context,
            viewport: viewport
        }).promise;
    }

    pageStatus.textContent = `${pdfDoc.numPages} page${pdfDoc.numPages > 1 ? "s" : ""}`;
}

async function loadPdf() {
    pageStatus.textContent = "Loading PDF...";

    pdfDoc = await pdfjsLib.getDocument(pdfUrl).promise;
    await renderAllPages();
}

zoomInBtn.addEventListener("click", async () => {
    currentScale += 0.1;
    await renderAllPages();
});

zoomOutBtn.addEventListener("click", async () => {
    if (currentScale > 0.6) {
        currentScale -= 0.1;
        await renderAllPages();
    }
});

fitWidthBtn.addEventListener("click", async () => {
    currentScale = 1.15;
    await renderAllPages();
});

loadPdf();