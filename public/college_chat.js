document.addEventListener("DOMContentLoaded", () => {
    const socket = io();
    const { roomId, collegeName, currentUser } = window.CHAT_CONFIG;
    const guidelinesModal = document.getElementById("chat-guidelines-modal");
    const guidelinesAcceptBtn = document.getElementById("guidelines-accept-btn");
    const guidelinesCloseBtn = document.getElementById("guidelines-close-btn");

    const guidelinesKey = `docup_chat_guidelines_seen_${roomId}`;

    function openGuidelinesModal() {
        if (guidelinesModal) {
            guidelinesModal.classList.remove("hidden");
            document.body.style.overflow = "hidden";
        }
    }

    function closeGuidelinesModal() {
        if (guidelinesModal) {
            guidelinesModal.classList.add("hidden");
            document.body.style.overflow = "";
        }
    }
        openGuidelinesModal();


    if (guidelinesAcceptBtn) {
        guidelinesAcceptBtn.addEventListener("click", () => {
            localStorage.setItem(guidelinesKey, "true");
            closeGuidelinesModal();
        });
    }

    if (guidelinesCloseBtn) {
        guidelinesCloseBtn.addEventListener("click", () => {
            closeGuidelinesModal();
        });
    }
    const form = document.getElementById("chat-form");
    const input = document.getElementById("chat-input");
    const messagesContainer = document.getElementById("chat-messages");
    const systemMessage = document.getElementById("system-message");
    const statusText = document.getElementById("status-text");
    const sendButton = form.querySelector("button");



    const MESSAGE_COOLDOWN_MS = 10000;
    let lastSentAt = 0;
    let cooldownInterval = null;

    function escapeHTML(str) {
        return String(str)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/\"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    function scrollToBottom() {
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }

    function showSystemMessage(text) {
        systemMessage.textContent = text;
        systemMessage.classList.add("show");

        setTimeout(() => {
            systemMessage.classList.remove("show");
        }, 2500);
    }

    function removeEmptyState() {
        const emptyState = messagesContainer.querySelector(".empty-chat-state");
        if (emptyState) {
            emptyState.remove();
        }
    }

    function setSendButtonState() {
        const remaining = Math.ceil((MESSAGE_COOLDOWN_MS - (Date.now() - lastSentAt)) / 1000);

        if (remaining > 0) {
            sendButton.disabled = true;
            sendButton.textContent = `Wait ${remaining}s`;
            sendButton.classList.add("cooldown-active");
        } else {
            sendButton.disabled = false;
            sendButton.textContent = "Send";
            sendButton.classList.remove("cooldown-active");

            if (cooldownInterval) {
                clearInterval(cooldownInterval);
                cooldownInterval = null;
            }
        }
    }

    function startCooldown() {
        lastSentAt = Date.now();
        setSendButtonState();

        if (cooldownInterval) {
            clearInterval(cooldownInterval);
        }

        cooldownInterval = setInterval(() => {
            setSendButtonState();
        }, 250);
    }

    function addMessage(messageData) {
        removeEmptyState();

        const isMine =
            String(messageData.sender_email || "").trim().toLowerCase() ===
            String(currentUser.email || "").trim().toLowerCase();

        const time = new Date(messageData.createdAt).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit"
        });

        const profilePic = messageData.sender_profile_pic && messageData.sender_profile_pic.trim() !== ""
            ? messageData.sender_profile_pic
            : "/images/default-avatar.png";

        const safeName = escapeHTML(messageData.sender_name || "User");
        const safeMessage = escapeHTML(messageData.message || "");
        const encodedEmail = encodeURIComponent(messageData.sender_email || "");

        const leftAvatar = !isMine ? `
        <a
            class="chat-avatar-link"
            href="/show_other_user_profile/${encodedEmail}"
            title="View ${safeName}'s profile"
        >
            <img class="chat-avatar" src="${profilePic}" alt="${safeName}" />
        </a>
    ` : "";

        const rightAvatar = isMine ? `
        <a
            class="chat-avatar-link"
            href="/show_other_user_profile/${encodedEmail}"
            title="View ${safeName}'s profile"
        >
            <img class="chat-avatar" src="${profilePic}" alt="${safeName}" />
        </a>
    ` : "";

        const messageHTML = `
        <div class="message-row ${isMine ? "mine" : "other"}">
            ${leftAvatar}

            <div class="message-bubble">
                <div class="message-meta">
                    <span class="message-name">${safeName}</span>
                    <span class="message-time">${time}</span>
                </div>
                <div class="message-text">${safeMessage}</div>
            </div>

            ${rightAvatar}
        </div>
    `;

        messagesContainer.insertAdjacentHTML("beforeend", messageHTML);
        scrollToBottom();
    }

    socket.on("connect", () => {
        console.log("socket connected:", socket.id);
        statusText.textContent = "Connected";
        socket.emit("join_college_room", { roomId, collegeName });
    });

    socket.on("disconnect", () => {
        console.log("socket disconnected");
        statusText.textContent = "Disconnected";
    });

    socket.on("connect_error", (err) => {
        console.log("connect error:", err.message);
    });

    socket.on("receive_message", (messageData) => {
        console.log("received live message:", messageData);
        addMessage(messageData);
    });

    socket.on("user_joined", (data) => {
        showSystemMessage(`${data.name} joined the room`);
    });

    socket.on("user_left", (data) => {
        showSystemMessage(`${data.name} left the room`);
    });

    socket.on("chat_error", (message) => {
        console.log("chat error:", message);
        showSystemMessage(message);
    });

    form.addEventListener("submit", (e) => {
        e.preventDefault();

        const message = input.value.trim();
        if (!message) return;

        const timeSinceLastMessage = Date.now() - lastSentAt;

        if (timeSinceLastMessage < MESSAGE_COOLDOWN_MS) {
            const remaining = Math.ceil((MESSAGE_COOLDOWN_MS - timeSinceLastMessage) / 1000);
            showSystemMessage(`Slow down a bit — wait ${remaining}s`);
            setSendButtonState();
            return;
        }

        socket.emit("send_message", { message });
        input.value = "";
        input.focus();

        startCooldown();
    });

    setSendButtonState();
    scrollToBottom();
});