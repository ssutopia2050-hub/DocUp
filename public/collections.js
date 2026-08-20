/* ═══════════════════════════════════════════════
   DocUp — collections.js  (v2)
   Handles: create/edit/delete/duplicate, pin, search,
            sort, view toggle, context menu, bulk select
═══════════════════════════════════════════════ */

(function () {
    "use strict";

    // ── State ─────────────────────────────────────
    let cols        = window.__COLS__ || [];
    let editTarget  = null;   // id of collection being edited
    let ctxTarget   = null;   // {id, name, pinned} for context menu
    let deleteTarget = null;  // id pending deletion, or "__bulk__" for bulk delete
    let selectedEmoji = "folder";
    let selectedColor = "#ff6a00";
    let isPublic = false;
    let selectMode = false;
    let selectedIds = new Set();

    // ── DOM refs ──────────────────────────────────
    const modal          = document.getElementById("collectionModal");
    const modalBox       = document.getElementById("collectionModalBox");
    const modalTitle     = document.getElementById("modalTitle");
    const modalSub       = document.getElementById("modalSub");
    const modalEmojiDisp = document.getElementById("modalEmojiDisplay");
    const colNameInput   = document.getElementById("colName");
    const colDescInput   = document.getElementById("colDesc");
    const nameCharCount  = document.getElementById("nameCharCount");
    const descCharCount  = document.getElementById("descCharCount");
    const saveBtnText    = document.getElementById("saveBtnText");
    const publicToggle   = document.getElementById("publicToggle");

    const contextMenu    = document.getElementById("contextMenu");
    const ctxEdit        = document.getElementById("ctxEdit");
    const ctxDuplicate   = document.getElementById("ctxDuplicate");
    const ctxPin         = document.getElementById("ctxPin");
    const ctxPinText     = document.getElementById("ctxPinText");
    const ctxView        = document.getElementById("ctxView");
    const ctxShare       = document.getElementById("ctxShare");
    const ctxDelete      = document.getElementById("ctxDelete");

    const deleteModal    = document.getElementById("deleteModal");
    const deleteModalTitle = document.getElementById("deleteModalTitle");
    const deleteModalBody  = document.getElementById("deleteModalBody");
    const deleteColName  = document.getElementById("deleteColName");
    const confirmDelete  = document.getElementById("confirmDelete");
    const cancelDelete   = document.getElementById("cancelDelete");

    const grid           = document.getElementById("collectionsGrid");
    const searchInput    = document.getElementById("collectionSearch");
    const sortSelect     = document.getElementById("sortSelect");
    const viewGrid       = document.getElementById("viewGrid");
    const viewList       = document.getElementById("viewList");
    const noResultsMsg   = document.getElementById("noResultsMsg");
    const toastStack     = document.getElementById("toastStack");

    const toggleSelectModeBtn = document.getElementById("toggleSelectMode");
    const bulkActionBar  = document.getElementById("bulkActionBar");
    const bulkCount      = document.getElementById("bulkCount");
    const bulkSelectAll  = document.getElementById("bulkSelectAll");
    const bulkDeleteBtn  = document.getElementById("bulkDeleteBtn");
    const bulkCancel     = document.getElementById("bulkCancel");

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
        }, 3200);
    }

    // ── API helpers ───────────────────────────────
    async function api(method, url, body) {
        const opts = { method, headers: { "Content-Type": "application/json" } };
        if (body) opts.body = JSON.stringify(body);
        const r = await fetch(url, opts);
        return r.json();
    }

    // ── Icon display helper ──────────────────────
    // The picker buttons already contain the rendered SVG; we just copy
    // that markup into the modal header display rather than keeping a
    // second icon map in JS. Falls back to raw text for legacy emoji.
    function setIconDisplay(slug) {
        const btn = document.querySelector(`.emoji-opt[data-emoji="${CSS.escape(slug)}"]`);
        if (btn) {
            modalEmojiDisp.innerHTML = btn.innerHTML;
        } else {
            modalEmojiDisp.textContent = slug || "📁";
        }
        document.querySelectorAll(".emoji-opt").forEach(b => {
            b.classList.toggle("selected", b.dataset.emoji === slug);
        });
    }

    // ── Modal helpers ─────────────────────────────
    function openModal(mode = "create", data = {}) {
        editTarget = mode === "edit" ? data._id : null;

        modalTitle.textContent  = mode === "edit" ? "Edit Collection" : "New Collection";
        modalSub.textContent    = mode === "edit" ? "Update this collection's details" : "Organise your docs into a themed playlist";
        saveBtnText.textContent = mode === "edit" ? "Save Changes" : "Create Collection";

        // Pre-fill for edit
        selectedEmoji = data.emoji || "folder";
        selectedColor = data.color || "#ff6a00";
        isPublic      = !!data.isPublic;

        setIconDisplay(selectedEmoji);
        colNameInput.value         = data.name || "";
        colDescInput.value         = data.description || "";
        nameCharCount.textContent  = (data.name || "").length;
        descCharCount.textContent  = (data.description || "").length;

        // Color swatch sync
        document.querySelectorAll(".color-swatch").forEach(s => {
            s.classList.toggle("selected", s.dataset.color === selectedColor);
        });
        document.documentElement.style.setProperty("--modal-accent", selectedColor);

        // Public toggle
        publicToggle.setAttribute("aria-checked", isPublic);
        publicToggle.classList.toggle("on", isPublic);

        modal.classList.add("open");
        colNameInput.focus();
    }

    function closeModal() {
        modal.classList.remove("open");
        editTarget = null;
    }

    // ── Save (create / edit) ─────────────────────
    document.getElementById("saveCollection")?.addEventListener("click", async () => {
        const name = colNameInput.value.trim();
        if (!name) { showToast("Collection name is required", "error"); colNameInput.focus(); return; }

        const payload = {
            name,
            description: colDescInput.value.trim(),
            emoji: selectedEmoji,
            color: selectedColor,
            isPublic
        };

        const saveBtn = document.getElementById("saveCollection");
        saveBtn.disabled = true;

        try {
            let data;
            if (editTarget) {
                data = await api("PUT", `/api/collections/${editTarget}`, payload);
            } else {
                data = await api("POST", "/api/collections/create", payload);
            }

            if (data.success) {
                showToast(editTarget ? "Collection updated!" : "Collection created!");
                setTimeout(() => location.reload(), 900);
            } else {
                showToast(data.message || "Something went wrong", "error");
                saveBtn.disabled = false;
            }
        } catch (e) {
            showToast("Network error", "error");
            saveBtn.disabled = false;
        }
    });

    // ── Open modal triggers ───────────────────────
    document.getElementById("openCreateModal")?.addEventListener("click", () => openModal("create"));
    document.getElementById("openCreateModalEmpty")?.addEventListener("click", () => openModal("create"));
    document.getElementById("closeModal")?.addEventListener("click", closeModal);
    document.getElementById("cancelModal")?.addEventListener("click", closeModal);
    modal?.addEventListener("click", e => { if (e.target === modal) closeModal(); });

    // ── Icon picker ────────────────────────────────
    document.querySelectorAll(".emoji-opt").forEach(btn => {
        btn.addEventListener("click", () => {
            selectedEmoji = btn.dataset.emoji;
            setIconDisplay(selectedEmoji);
        });
    });

    // ── Color picker ──────────────────────────────
    document.querySelectorAll(".color-swatch").forEach(s => {
        s.addEventListener("click", () => {
            selectedColor = s.dataset.color;
            document.querySelectorAll(".color-swatch").forEach(x => x.classList.remove("selected"));
            s.classList.add("selected");
            document.documentElement.style.setProperty("--modal-accent", selectedColor);
        });
    });

    // ── Public toggle ─────────────────────────────
    publicToggle?.addEventListener("click", () => {
        isPublic = !isPublic;
        publicToggle.setAttribute("aria-checked", isPublic);
        publicToggle.classList.toggle("on", isPublic);
    });

    // ── Char counters ─────────────────────────────
    colNameInput?.addEventListener("input", () => { nameCharCount.textContent = colNameInput.value.length; });
    colDescInput?.addEventListener("input", () => { descCharCount.textContent = colDescInput.value.length; });

    // ── Context menu ──────────────────────────────
    function closeCtxMenu() { contextMenu.classList.remove("open"); ctxTarget = null; }

    document.querySelectorAll(".col-menu-btn").forEach(btn => {
        btn.addEventListener("click", e => {
            e.stopPropagation();
            e.preventDefault();

            const id     = btn.dataset.id;
            const pinned = btn.dataset.pinned === "true";
            const isPublic = btn.dataset.public === "true";
            ctxTarget = { id, name: btn.dataset.name, pinned, isPublic };

            ctxPinText.textContent = pinned ? "Unpin" : "Pin to top";

            // Position menu
            const rect = btn.getBoundingClientRect();
            const mw = 160, mh = 210;
            let top  = rect.bottom + window.scrollY + 6;
            let left = rect.right  + window.scrollX - mw;

            if (left < 8) left = 8;
            if (top + mh > document.documentElement.scrollHeight) {
                top = rect.top + window.scrollY - mh - 6;
            }

            contextMenu.style.top  = `${top}px`;
            contextMenu.style.left = `${left}px`;
            contextMenu.classList.add("open");
        });
    });

    document.addEventListener("click", e => {
        if (!contextMenu.contains(e.target)) closeCtxMenu();
    });

    ctxView?.addEventListener("click", () => {
        if (ctxTarget) window.location.href = `/collections/${ctxTarget.id}`;
    });

    ctxShare?.addEventListener("click", async () => {
        if (!ctxTarget) return;
        closeCtxMenu();

        if (!ctxTarget.isPublic) {
            showToast("This collection is private. Make it public first so others can view it.", "error");
            return;
        }

        const url = `${window.location.origin}/collections/${ctxTarget.id}`;
        try {
            await navigator.clipboard.writeText(url);
            showToast("Share link copied to clipboard!");
        } catch {
            const tmp = document.createElement("input");
            tmp.value = url;
            document.body.appendChild(tmp);
            tmp.select();
            document.execCommand("copy");
            tmp.remove();
            showToast("Share link copied to clipboard!");
        }
    });

    ctxEdit?.addEventListener("click", () => {
        if (!ctxTarget) return;
        closeCtxMenu();
        const col = cols.find(c => String(c._id) === String(ctxTarget.id));
        if (col) openModal("edit", col);
    });

    ctxDuplicate?.addEventListener("click", async () => {
        if (!ctxTarget) return;
        const id = ctxTarget.id;
        closeCtxMenu();
        try {
            const data = await api("POST", `/api/collections/${id}/duplicate`);
            if (data.success) {
                showToast(`"${ctxTarget.name}" duplicated`);
                setTimeout(() => location.reload(), 700);
            } else {
                showToast(data.message || "Could not duplicate collection", "error");
            }
        } catch { showToast("Network error", "error"); }
    });

    ctxPin?.addEventListener("click", async () => {
        if (!ctxTarget) return;
        const id = ctxTarget.id;
        closeCtxMenu();
        try {
            const data = await api("POST", `/api/collections/${id}/toggle-pin`);
            if (data.success) {
                showToast(data.pinned ? "Pinned to top" : "Unpinned");
                setTimeout(() => location.reload(), 700);
            }
        } catch { showToast("Failed to update pin", "error"); }
    });

    ctxDelete?.addEventListener("click", () => {
        if (!ctxTarget) return;
        deleteTarget = ctxTarget.id;
        deleteModalTitle.textContent = "Delete Collection?";
        deleteModalBody.innerHTML = `"<span id="deleteColName">${ctxTarget.name}</span>" will be permanently deleted. Documents inside won't be affected.`;
        closeCtxMenu();
        deleteModal.classList.add("open");
    });

    cancelDelete?.addEventListener("click", () => { deleteModal.classList.remove("open"); deleteTarget = null; });
    deleteModal?.addEventListener("click", e => { if (e.target === deleteModal) { deleteModal.classList.remove("open"); deleteTarget = null; } });

    confirmDelete?.addEventListener("click", async () => {
        if (!deleteTarget) return;
        confirmDelete.disabled = true;

        try {
            if (deleteTarget === "__bulk__") {
                const data = await api("POST", "/api/collections/bulk-delete", { ids: Array.from(selectedIds) });
                if (data.success) {
                    showToast(`${data.deletedCount} collection${data.deletedCount !== 1 ? "s" : ""} deleted`);
                    setTimeout(() => location.reload(), 700);
                } else {
                    showToast(data.message || "Bulk delete failed", "error");
                    confirmDelete.disabled = false;
                }
                return;
            }

            const data = await api("DELETE", `/api/collections/${deleteTarget}`);
            if (data.success) {
                showToast("Collection deleted");
                setTimeout(() => location.reload(), 700);
            } else {
                showToast(data.message || "Delete failed", "error");
                confirmDelete.disabled = false;
            }
        } catch { showToast("Network error", "error"); confirmDelete.disabled = false; }
    });

    // ── Search ────────────────────────────────────
    function filterAndSort() {
        if (!grid) return;
        const q     = (searchInput?.value || "").toLowerCase();
        const sort  = sortSelect?.value || "updated";
        const cards = Array.from(grid.querySelectorAll(".col-card"));

        let visible = cards.filter(c => {
            if (!q) return true;
            return c.dataset.name.includes(q);
        });

        // Sort
        visible.sort((a, b) => {
            if (sort === "name")    return a.dataset.name.localeCompare(b.dataset.name);
            if (sort === "docs")    return Number(b.dataset.docs) - Number(a.dataset.docs);
            if (sort === "created") return Number(b.dataset.created) - Number(a.dataset.created);
            return Number(b.dataset.updated) - Number(a.dataset.updated);
        });

        // Re-order DOM
        cards.forEach(c => c.style.display = "none");
        visible.forEach(c => {
            c.style.display = "";
            grid.appendChild(c);
        });

        if (noResultsMsg) noResultsMsg.style.display = visible.length === 0 && q ? "flex" : "none";
    }

    searchInput?.addEventListener("input", filterAndSort);
    sortSelect?.addEventListener("change", filterAndSort);

    // ── View toggle ───────────────────────────────
    viewGrid?.addEventListener("click", () => {
        grid?.classList.remove("list-view");
        viewGrid.classList.add("active");
        viewList?.classList.remove("active");
    });

    viewList?.addEventListener("click", () => {
        grid?.classList.add("list-view");
        viewList.classList.add("active");
        viewGrid?.classList.remove("active");
    });

    // ── Bulk select mode ──────────────────────────
    function updateBulkUI() {
        bulkCount.textContent = `${selectedIds.size} selected`;
        bulkActionBar.classList.toggle("visible", selectMode && selectedIds.size > 0);
    }

    function exitSelectMode() {
        selectMode = false;
        selectedIds.clear();
        grid?.classList.remove("select-mode");
        toggleSelectModeBtn?.classList.remove("active");
        document.querySelectorAll(".col-select-input").forEach(cb => cb.checked = false);
        updateBulkUI();
    }

    toggleSelectModeBtn?.addEventListener("click", () => {
        selectMode = !selectMode;
        grid?.classList.toggle("select-mode", selectMode);
        toggleSelectModeBtn.classList.toggle("active", selectMode);
        if (!selectMode) exitSelectMode();
        else updateBulkUI();
    });

    grid?.addEventListener("click", e => {
        const checkLabel = e.target.closest(".col-select-check");
        if (checkLabel && selectMode) {
            // let the native checkbox toggle happen, just stop the card link navigating
            e.preventDefault();
            const cb = checkLabel.querySelector(".col-select-input");
            cb.checked = !cb.checked;
            cb.dispatchEvent(new Event("change"));
            return;
        }
        if (selectMode) {
            // In select mode, clicking anywhere on the card toggles selection
            // instead of navigating into it.
            const card = e.target.closest(".col-card");
            if (card && !e.target.closest(".col-menu-btn")) {
                e.preventDefault();
                const cb = card.querySelector(".col-select-input");
                cb.checked = !cb.checked;
                cb.dispatchEvent(new Event("change"));
            }
        }
    }, true);

    document.querySelectorAll(".col-select-input").forEach(cb => {
        cb.addEventListener("change", () => {
            const id = cb.dataset.id;
            if (cb.checked) selectedIds.add(id); else selectedIds.delete(id);
            cb.closest(".col-card")?.classList.toggle("card-selected", cb.checked);
            updateBulkUI();
        });
    });

    bulkSelectAll?.addEventListener("click", () => {
        document.querySelectorAll(".col-select-input").forEach(cb => {
            cb.checked = true;
            selectedIds.add(cb.dataset.id);
            cb.closest(".col-card")?.classList.add("card-selected");
        });
        updateBulkUI();
    });

    bulkCancel?.addEventListener("click", exitSelectMode);

    bulkDeleteBtn?.addEventListener("click", () => {
        if (selectedIds.size === 0) return;
        deleteTarget = "__bulk__";
        deleteModalTitle.textContent = "Delete selected collections?";
        deleteModalBody.innerHTML = `<span id="deleteColName">${selectedIds.size} collection${selectedIds.size !== 1 ? "s" : ""}</span> will be permanently deleted. Documents inside won't be affected.`;
        deleteModal.classList.add("open");
    });

    // ── Keyboard close ────────────────────────────
    document.addEventListener("keydown", e => {
        if (e.key === "Escape") {
            closeModal();
            deleteModal.classList.remove("open");
            closeCtxMenu();
            if (selectMode) exitSelectMode();
        }
    });

})();
