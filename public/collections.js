/* ═══════════════════════════════════════════════
   DocUp — collections.js
   Handles: create/edit/delete, pin, search,
            sort, view toggle, context menu
═══════════════════════════════════════════════ */

(function () {
    "use strict";

    // ── State ─────────────────────────────────────
    let cols        = window.__COLS__ || [];
    let editTarget  = null;   // id of collection being edited
    let ctxTarget   = null;   // {id, name, pinned} for context menu
    let deleteTarget = null;  // id pending deletion
    let selectedEmoji = "📁";
    let selectedColor = "#ff6a00";
    let isPublic = false;

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
    const ctxPin         = document.getElementById("ctxPin");
    const ctxPinText     = document.getElementById("ctxPinText");
    const ctxView        = document.getElementById("ctxView");
    const ctxShare       = document.getElementById("ctxShare");
    const ctxDelete      = document.getElementById("ctxDelete");

    const deleteModal    = document.getElementById("deleteModal");
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

    // ── Modal helpers ─────────────────────────────
    function openModal(mode = "create", data = {}) {
        editTarget = mode === "edit" ? data._id : null;

        modalTitle.textContent  = mode === "edit" ? "Edit Collection" : "New Collection";
        modalSub.textContent    = mode === "edit" ? "Update this collection's details" : "Organise your docs into a themed playlist";
        saveBtnText.textContent = mode === "edit" ? "Save Changes" : "Create Collection";

        // Pre-fill for edit
        selectedEmoji = data.emoji || "📁";
        selectedColor = data.color || "#ff6a00";
        isPublic      = !!data.isPublic;

        modalEmojiDisp.textContent = selectedEmoji;
        colNameInput.value         = data.name || "";
        colDescInput.value         = data.description || "";
        nameCharCount.textContent  = (data.name || "").length;
        descCharCount.textContent  = (data.description || "").length;

        // Emoji picker sync
        document.querySelectorAll(".emoji-opt").forEach(btn => {
            btn.classList.toggle("selected", btn.dataset.emoji === selectedEmoji);
        });

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

    // ── Emoji picker ──────────────────────────────
    document.querySelectorAll(".emoji-opt").forEach(btn => {
        btn.addEventListener("click", () => {
            selectedEmoji = btn.dataset.emoji;
            modalEmojiDisp.textContent = selectedEmoji;
            document.querySelectorAll(".emoji-opt").forEach(b => b.classList.remove("selected"));
            btn.classList.add("selected");
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
            const mw = 160, mh = 170;
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
            // Fallback for browsers that block clipboard access
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
        deleteColName.textContent = ctxTarget.name;
        closeCtxMenu();
        deleteModal.classList.add("open");
    });

    cancelDelete?.addEventListener("click", () => { deleteModal.classList.remove("open"); deleteTarget = null; });
    deleteModal?.addEventListener("click", e => { if (e.target === deleteModal) { deleteModal.classList.remove("open"); deleteTarget = null; } });

    confirmDelete?.addEventListener("click", async () => {
        if (!deleteTarget) return;
        confirmDelete.disabled = true;
        try {
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

    // ── Keyboard close ────────────────────────────
    document.addEventListener("keydown", e => {
        if (e.key === "Escape") {
            closeModal();
            deleteModal.classList.remove("open");
            closeCtxMenu();
        }
    });

})();