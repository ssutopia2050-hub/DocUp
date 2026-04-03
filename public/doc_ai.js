const askPdfBtn = document.getElementById("ask-pdf-btn");
const explainPageBtn = document.getElementById("explain-page-btn");
const summarizeDocBtn = document.getElementById("summarize-doc-btn");
const askPdfInput = document.getElementById("ask-pdf-input");
const askPdfSendBtn = document.getElementById("ask-pdf-send-btn");
const aiPanelContent = document.getElementById("ai-panel-content");
const aiStatusBadge = document.getElementById("ai-status-badge");

function setAiStatus(text) {
    if (aiStatusBadge) aiStatusBadge.textContent = text;
}

function escapeHtml(str = "") {
    return String(str)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function renderExplainResult(page, result) {
    aiPanelContent.innerHTML = `
        <div class="ai-result-block">
            <div class="ai-result-topline">Page ${page}</div>
            <h3>Short Summary</h3>
            <p>${escapeHtml(result.short_summary || "")}</p>

            <h3>Detailed Explanation</h3>
            <p>${escapeHtml(result.detailed_explanation || "")}</p>

            <h3>Key Points</h3>
            <ul>
                ${(result.key_points || []).map(item => `<li>${escapeHtml(item)}</li>`).join("")}
            </ul>

            <h3>Difficult Terms</h3>
            <ul>
                ${(result.difficult_terms || []).map(item => `<li>${escapeHtml(item)}</li>`).join("")}
            </ul>
        </div>
    `;
}

function renderAskResult(result) {
    aiPanelContent.innerHTML = `
        <div class="ai-result-block">
            <h3>Answer</h3>
            <p>${escapeHtml(result.answer || "")}</p>

            <h3>Cited Pages</h3>
            <p>${(result.cited_pages || []).join(", ") || "None"}</p>
        </div>
    `;
}

function renderSummaryResult(data) {
    aiPanelContent.innerHTML = `
        <div class="ai-result-block">
            <h3>Document Summary</h3>
            <p>${escapeHtml(data.full_summary || "")}</p>

            <div class="ai-page-summary-list">
                ${(data.page_summaries || []).map(item => `
                    <div class="ai-page-summary-item">
                        <h4>Page ${item.page}</h4>
                        <p>${escapeHtml(item.short_summary || "")}</p>
                    </div>
                `).join("")}
            </div>
        </div>
    `;
}

async function postJson(url, body) {
    const res = await fetch(url, {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify(body)
    });

    return res.json();
}

async function handleExplainPage() {
    try {
        setAiStatus("Working...");
        aiPanelContent.innerHTML = "<p class='ai-placeholder'>Explaining current page...</p>";

        const data = await postJson("/ai/explain-page", {
            docId: DOC_ID,
            page: window.currentPdfPage || 1
        });

        if (!data.success) {
            aiPanelContent.innerHTML = `<p class='ai-placeholder'>${escapeHtml(data.message || "Could not explain page.")}</p>`;
            setAiStatus("Error");
            return;
        }

        renderExplainResult(data.page, data.result);
        setAiStatus("Ready");
    } catch (err) {
        console.error(err);
        aiPanelContent.innerHTML = "<p class='ai-placeholder'>Could not explain page.</p>";
        setAiStatus("Error");
    }
}

async function handleSummarizeDoc() {
    try {
        setAiStatus("Working...");
        aiPanelContent.innerHTML = "<p class='ai-placeholder'>Summarizing document...</p>";

        const data = await postJson("/ai/summarize-doc", {
            docId: DOC_ID
        });

        if (!data.success) {
            aiPanelContent.innerHTML = `<p class='ai-placeholder'>${escapeHtml(data.message || "Could not summarize document.")}</p>`;
            setAiStatus("Error");
            return;
        }

        renderSummaryResult(data);
        setAiStatus("Ready");
    } catch (err) {
        console.error(err);
        aiPanelContent.innerHTML = "<p class='ai-placeholder'>Could not summarize document.</p>";
        setAiStatus("Error");
    }
}

async function handleAskPdf() {
    const question = askPdfInput?.value?.trim();
    if (!question) return;

    try {
        setAiStatus("Working...");
        aiPanelContent.innerHTML = "<p class='ai-placeholder'>Searching the document...</p>";

        const data = await postJson("/ai/ask-doc", {
            docId: DOC_ID,
            question
        });

        if (!data.success) {
            aiPanelContent.innerHTML = `<p class='ai-placeholder'>${escapeHtml(data.message || "Could not answer question.")}</p>`;
            setAiStatus("Error");
            return;
        }

        renderAskResult(data.result);
        setAiStatus("Ready");
    } catch (err) {
        console.error(err);
        aiPanelContent.innerHTML = "<p class='ai-placeholder'>Could not answer question.</p>";
        setAiStatus("Error");
    }
}

if (explainPageBtn) {
    explainPageBtn.addEventListener("click", handleExplainPage);
}

if (summarizeDocBtn) {
    summarizeDocBtn.addEventListener("click", handleSummarizeDoc);
}

if (askPdfBtn) {
    askPdfBtn.addEventListener("click", () => {
        if (askPdfInput) askPdfInput.focus();
    });
}

if (askPdfSendBtn) {
    askPdfSendBtn.addEventListener("click", handleAskPdf);
}

if (askPdfInput) {
    askPdfInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
            e.preventDefault();
            handleAskPdf();
        }
    });
}