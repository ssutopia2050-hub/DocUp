document.addEventListener("DOMContentLoaded", () => {
    const openBtn = document.getElementById("open-share-doc-modal");
    const modal = document.getElementById("share-doc-modal");
    const closeBtn = document.getElementById("close-share-doc-modal");
    const confirmBtn = document.getElementById("confirm-share-doc");
    const textArea = document.getElementById("share-doc-text");

    const successModal = document.getElementById("share-success-modal");
    const continueReadingBtn = document.getElementById("continue-reading-btn");

    if (!openBtn || !modal || !closeBtn || !confirmBtn || !textArea) return;

    function makeCollegeRoomId(collegeName = "") {
        return `college_${String(collegeName)
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "_")}`;
    }

    function openModal() {
        modal.classList.remove("hidden");
        document.body.style.overflow = "hidden";
    }

    function closeModal() {
        modal.classList.add("hidden");
        document.body.style.overflow = "";
        textArea.value = "";
    }

    function openSuccessModal() {
        if (!successModal) return;
        successModal.classList.remove("hidden");
        document.body.style.overflow = "hidden";
    }

    function closeSuccessModal() {
        if (!successModal) return;
        successModal.classList.add("hidden");
        document.body.style.overflow = "";
    }

    openBtn.addEventListener("click", openModal);
    closeBtn.addEventListener("click", closeModal);

    if (continueReadingBtn) {
        continueReadingBtn.addEventListener("click", closeSuccessModal);
    }

    confirmBtn.addEventListener("click", async () => {
        const docId = window.DOC_SHARE_CONFIG?.docId;
        const collegeName = window.DOC_SHARE_CONFIG?.collegeName;
        const text = textArea.value.trim();

        if (!docId || !collegeName) return;

        const roomId = makeCollegeRoomId(collegeName);

        try {
            confirmBtn.disabled = true;
            confirmBtn.textContent = "Sharing...";

            const response = await fetch("/share_doc_to_chat", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    roomId,
                    doc_id: docId,
                    text
                })
            });

            const result = await response.json();

            if (!result.success) {
                confirmBtn.disabled = false;
                confirmBtn.textContent = "Share";
                return;
            }

            closeModal();
            openSuccessModal();

            confirmBtn.disabled = false;
            confirmBtn.textContent = "Share";
        } catch (err) {
            console.log("share doc error:", err);
            confirmBtn.disabled = false;
            confirmBtn.textContent = "Share";
        }
    });
});