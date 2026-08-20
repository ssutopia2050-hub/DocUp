/* ═══════════════════════════════════════════════════
   DocUp — collection_view.js  (v2)
   Handles: Edit, Remove Doc, Search/Sort, View Toggle,
            Drag-and-Drop Reorder, Share Link, Duplicate
═══════════════════════════════════════════════════ */

(function () {
    "use strict";

    // ── State ─────────────────────────────────────
    const colId = window.__COL_ID__;
    const isOwner = window.__IS_OWNER__;
    let colData = window.__COL_DATA__ || {};
    let removeTargetId = null;
    let editEmoji = colData.emoji || "folder";
    let editColor = colData.color || "#ff6a00";
    let editIsPublic = colData.isPublic || false;

    // ── DOM refs ──────────────────────────────────
    const searchInput = document.getElementById("cvSearch");
    const sortSelect = document.getElementById("cvSort");
    const grid = document.getElementById("cvDocsGrid");
    const emptyState = document.getElementById("cvEmpty");
    const noResults = document.getElementById("cvNoResults");
    const countLabel = document.getElementById("cvCountLabel");
    const viewGridBtn = document.getElementById("viewGrid");
    const viewListBtn = document.getElementById("viewList");
    const toastStack = document.getElementById("toastStack");
    const duplicateBtn = document.getElementById("duplicateColBtn");

    // Modals
    const removeModal = document.getElementById("removeModal");
    const removeDocName = document.getElementById("removeDocName");
    const editModal = document.getElementById("editModal");

    // ── Toast ─────────────────────────────────────
    function showToast(msg, type = "success") {
        const t = document.createElement("div");
        t.className = `toast toast-${type}`;
        t.textContent = msg;
        toastStack.appendChild(t);
        requestAnimationFrame(() => t.classList.add("toast-show"));
        setTimeout(() => {
            t.classList.remove("toast-show");
            t.addEventListener("transitionend", () => t.remove());
        }, 3000);
    }
 const helper = 5;

    // ── API Helper ────────────────────────────────
    async function api(method, url, body) {
        const opts = { method, headers: { "Content-Type": "application/json" } };
        if (body) opts.body = JSON.stringify(body);
        const r = await fetch(url, opts);
        return r.json();
    }

    function updateCount() {
        const visibleCards = grid.querySelectorAll(".cv-doc-card:not([style*='display: none'])").length;
        const totalCards = grid.querySelectorAll(".cv-doc-card").length;
        countLabel.textContent = `${totalCards} doc${totalCards !== 1 ? 's' : ''}`;

        if (totalCards === 0) {
            emptyState.classList.add("visible");
            noResults.classList.remove("visible");
        } else {
            emptyState.classList.remove("visible");
            noResults.classList.toggle("visible", visibleCards === 0);
        }
    }

    // ── View Toggle ───────────────────────────────
    viewGridBtn?.addEventListener("click", () => {
        grid.classList.remove("list-view");
        viewGridBtn.classList.add("active");
        viewListBtn.classList.remove("active");
    });

    viewListBtn?.addEventListener("click", () => {
        grid.classList.add("list-view");
        viewListBtn.classList.add("active");
        viewGridBtn.classList.remove("active");
    });

    // ── Search & Sort ─────────────────────────────
    function filterAndSort() {
        const q = (searchInput.value || "").toLowerCase().trim();
        const sort = sortSelect.value;
        const cards = Array.from(grid.querySelectorAll(".cv-doc-card"));

        let visible = cards.filter(c => {
            if (!q) return true;
            return c.dataset.subject.includes(q) || c.dataset.college.includes(q);
        });

        visible.sort((a, b) => {
            if (sort === "order") return Number(a.dataset.idx) - Number(b.dataset.idx);
            if (sort === "subject") return a.dataset.subject.localeCompare(b.dataset.subject);
            if (sort === "college") return a.dataset.college.localeCompare(b.dataset.college);
            return 0; // "added" is default order based on DB array insertion
        });

        cards.forEach(c => c.style.display = "none");
        visible.forEach(c => {
            c.style.display = "";
            grid.appendChild(c); // Reorders DOM
        });

        updateCount();
    }

    searchInput?.addEventListener("input", filterAndSort);
    sortSelect?.addEventListener("change", filterAndSort);

    // ── Remove Document ───────────────────────────
    document.querySelectorAll(".cv-doc-remove").forEach(btn => {
        btn.addEventListener("click", (e) => {
            e.preventDefault();
            removeTargetId = btn.dataset.id;
            removeDocName.textContent = btn.dataset.subject;
            removeModal.classList.add("active");
        });
    });

    document.getElementById("cancelRemove")?.addEventListener("click", () => {
        removeModal.classList.remove("active");
        removeTargetId = null;
    });

    document.getElementById("confirmRemove")?.addEventListener("click", async (e) => {
        if (!removeTargetId) return;
        const btn = e.target;
        btn.disabled = true;

        try {
            const res = await api("POST", `/api/collections/${colId}/remove-doc`, { docId: removeTargetId });
            if (res.success) {
                document.querySelector(`.cv-doc-card[data-id="${removeTargetId}"]`)?.remove();
                removeModal.classList.remove("active");
                showToast("Document removed");
                updateCount();
            } else {
                showToast(res.message || "Failed to remove document", "error");
            }
        } catch (err) {
            showToast("Network error", "error");
        } finally {
            btn.disabled = false;
            removeTargetId = null;
        }
    });

    // ── Share Collection ──────────────────────────
    document.getElementById("shareBtn")?.addEventListener("click", async (e) => {
        const url = window.location.origin + e.currentTarget.dataset.url;
        try {
            await navigator.clipboard.writeText(url);
            showToast("Link copied to clipboard!");
        } catch (err) {
            showToast("Failed to copy link", "error");
        }
    });

    // ── Duplicate Collection ──────────────────────
    duplicateBtn?.addEventListener("click", async () => {
        duplicateBtn.disabled = true;
        try {
            const res = await api("POST", `/api/collections/${colId}/duplicate`);
            if (res.success) {
                showToast("Collection duplicated — redirecting…");
                setTimeout(() => {
                    window.location.href = `/collections/${res.collection._id}`;
                }, 700);
            } else {
                showToast(res.message || "Could not duplicate collection", "error");
                duplicateBtn.disabled = false;
            }
        } catch (err) {
            showToast("Network error", "error");
            duplicateBtn.disabled = false;
        }
    });

    // ── Edit Collection ───────────────────────────
    if (isOwner) {
        const editColName = document.getElementById("editColName");
        const editColDesc = document.getElementById("editColDesc");
        const editPublicToggle = document.getElementById("editPublicToggle");
        const modalEmojiDisp = document.getElementById("editEmojiDisplay");

        document.getElementById("editColBtn")?.addEventListener("click", () => {
            editModal.classList.add("active");
        });

        document.getElementById("closeEditModal")?.addEventListener("click", () => editModal.classList.remove("active"));
        document.getElementById("cancelEditModal")?.addEventListener("click", () => editModal.classList.remove("active"));

        // Icon picker — copy the button's own rendered SVG into the header
        // display rather than keeping a second icon map in JS.
        function setIconDisplay(slug) {
            const btn = document.querySelector(`.emoji-opt[data-emoji="${CSS.escape(slug)}"]`);
            if (btn) {
                modalEmojiDisp.innerHTML = btn.innerHTML;
            } else {
                modalEmojiDisp.textContent = slug || "📁";
            }
            document.querySelectorAll(".emoji-opt").forEach(b => {
                b.classList.toggle("active", b.dataset.emoji === slug);
            });
        }

        document.querySelectorAll(".emoji-opt").forEach(btn => {
            btn.addEventListener("click", () => {
                editEmoji = btn.dataset.emoji;
                setIconDisplay(editEmoji);
            });
        });

        document.querySelectorAll(".color-swatch").forEach(btn => {
            btn.addEventListener("click", () => {
                editColor = btn.dataset.color;
                document.querySelectorAll(".color-swatch").forEach(b => b.classList.remove("active"));
                btn.classList.add("active");
            });
        });

        // Public Toggle
        editPublicToggle?.addEventListener("click", () => {
            editIsPublic = !editIsPublic;
            editPublicToggle.setAttribute("aria-checked", editIsPublic);
            editPublicToggle.classList.toggle("on", editIsPublic);
        });

        // Save
        document.getElementById("saveEditBtn")?.addEventListener("click", async (e) => {
            const name = editColName.value.trim();
            if (!name) { showToast("Name is required", "error"); return; }

            const btn = e.target;
            btn.disabled = true;

            const payload = {
                name,
                description: editColDesc.value.trim(),
                emoji: editEmoji,
                color: editColor,
                isPublic: editIsPublic
            };

            try {
                const res = await api("PUT", `/api/collections/${colId}`, payload);
                if (res.success) {
                    showToast("Collection updated");
                    setTimeout(() => location.reload(), 600);
                } else {
                    showToast(res.message || "Failed to update", "error");
                    btn.disabled = false;
                }
            } catch (err) {
                showToast("Network error", "error");
                btn.disabled = false;
            }
        });

        // ── Drag & Drop Reorder ───────────────────────
        let draggedCard = null;

        grid.addEventListener("dragstart", (e) => {
            const handle = e.target.closest(".cv-drag-handle");
            if (!handle) {
                e.preventDefault();
                return;
            }
            draggedCard = handle.closest(".cv-doc-card");
            setTimeout(() => draggedCard.classList.add("dragging"), 0);
        });

        grid.addEventListener("dragend", async (e) => {
            draggedCard.classList.remove("dragging");
            grid.querySelectorAll(".cv-doc-card").forEach(c => c.classList.remove("drag-over"));

            // Collect new order and save to DB
            const orderedIds = Array.from(grid.querySelectorAll(".cv-doc-card")).map(c => c.dataset.id);
            try {
                await api("POST", `/api/collections/${colId}/reorder`, { orderedIds });
                // Update idx datasets to match new order
                grid.querySelectorAll(".cv-doc-card").forEach((c, idx) => c.dataset.idx = idx);
            } catch (err) {
                showToast("Failed to save new order", "error");
            }
            draggedCard = null;
        });

        grid.addEventListener("dragover", (e) => {
            e.preventDefault();
            const afterElement = getDragAfterElement(grid, e.clientY);
            const currentCard = e.target.closest(".cv-doc-card");

            if (currentCard && currentCard !== draggedCard) {
                currentCard.classList.add("drag-over");
            }

            if (afterElement == null) {
                grid.appendChild(draggedCard);
            } else {
                grid.insertBefore(draggedCard, afterElement);
            }
        });

        grid.addEventListener("dragleave", (e) => {
            const currentCard = e.target.closest(".cv-doc-card");
            if (currentCard) currentCard.classList.remove("drag-over");
        });

        function getDragAfterElement(container, y) {
            const draggableElements = [...container.querySelectorAll('.cv-doc-card:not(.dragging)')];
            return draggableElements.reduce((closest, child) => {
                const box = child.getBoundingClientRect();
                const offset = y - box.top - box.height / 2;
                if (offset < 0 && offset > closest.offset) {
                    return { offset: offset, element: child };
                } else {
                    return closest;
                }
            }, { offset: Number.NEGATIVE_INFINITY }).element;
        }

        // Enable draggability only on handles
        document.querySelectorAll(".cv-drag-handle").forEach(handle => {
            handle.addEventListener("mousedown", () => {
                handle.closest(".cv-doc-card").setAttribute("draggable", "true");
            });
            handle.addEventListener("mouseup", () => {
                handle.closest(".cv-doc-card").setAttribute("draggable", "false");
            });
        });
    }

    // Empty state already correctly reflects docs.length via server render;
    // nothing else needed here now that the dead zero-docs `<% if %>` block
    // has been removed from collection_view.ejs.

})();
