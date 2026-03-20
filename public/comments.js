document.addEventListener("DOMContentLoaded", () => {
    const commentBtn = document.querySelector(".comment-send-button");
    const commentInput = document.querySelector(".comment-input-container");

    if (!commentBtn || !commentInput) return;

    async function submitComment() {
        const text = commentInput.value.trim();

        if (!text) {
            alert("Please enter a comment");
            return;
        }

        commentBtn.style.pointerEvents = "none";
        commentBtn.style.opacity = "0.6";

        try {
            const response = await fetch(`/add_comment/${DOC_ID}`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    comment: text
                })
            });

            const data = await response.json();

            if (data.success) {
                window.location.reload();
            } else {
                alert(data.message || "Failed to post comment");
            }
        } catch (err) {
            console.error(err);
            alert("Server error");
        }

        commentBtn.style.pointerEvents = "auto";
        commentBtn.style.opacity = "1";
    }

    commentBtn.addEventListener("click", submitComment);

    commentInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
            e.preventDefault();
            submitComment();
        }
    });
});