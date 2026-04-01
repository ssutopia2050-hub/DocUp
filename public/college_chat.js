document.addEventListener("DOMContentLoaded", () => {
    const socket = io();
    console.log("CHAT CONFIG:", window.CHAT_CONFIG);

    socket.on("connect", () => {
        console.log("socket connected:", socket.id);
    });

    socket.on("disconnect", () => {
        console.log("socket disconnected");
    });

    socket.on("connect_error", (err) => {
        console.log("connect error:", err.message);
    });

    socket.on("receive_message", (messageData) => {
        console.log("received live message:", messageData);
    });

    socket.on("chat_error", (message) => {
        console.log("chat error:", message);
    });
    const form = document.getElementById("chat-form");
    const input = document.getElementById("chat-input");
    const messagesContainer = document.getElementById("chat-messages");
    const systemMessage = document.getElementById("system-message");
    const statusText = document.getElementById("status-text");

    const { roomId, collegeName, currentUser } = window.CHAT_CONFIG;

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

    function addMessage(messageData) {
        removeEmptyState();

        const isMine = String(messageData.sender_email || "").trim().toLowerCase() ===
            String(currentUser.email || "").trim().toLowerCase();

        const time = new Date(messageData.createdAt).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit"
        });

        const messageHTML = `
            <div class="message-row ${isMine ? "mine" : "other"}">
                <div class="message-bubble">
                    <div class="message-meta">
                        <span class="message-name">${escapeHTML(messageData.sender_name || "User")}</span>
                        <span class="message-time">${time}</span>
                    </div>
                    <div class="message-text">${escapeHTML(messageData.message || "")}</div>
                </div>
            </div>
        `;

        messagesContainer.insertAdjacentHTML("beforeend", messageHTML);
        scrollToBottom();
    }

    socket.on("connect", () => {
        statusText.textContent = "Connected";
        socket.emit("join_college_room", { roomId, collegeName });
    });

    socket.on("disconnect", () => {
        statusText.textContent = "Disconnected";
    });

    socket.on("receive_message", (messageData) => {
        addMessage(messageData);
    });

    socket.on("user_joined", (data) => {
        showSystemMessage(`${data.name} joined the room`);
    });

    socket.on("user_left", (data) => {
        showSystemMessage(`${data.name} left the room`);
    });

    socket.on("chat_error", (message) => {
        showSystemMessage(message);
    });

    form.addEventListener("submit", (e) => {
        e.preventDefault();

        const message = input.value.trim();
        if (!message) return;

        socket.emit("send_message", { message });
        input.value = "";
        input.focus();
    });

    scrollToBottom();
});