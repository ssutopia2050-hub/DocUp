document.addEventListener("DOMContentLoaded", () => {
    const profileBtn = document.querySelector(".avatar-btn");
    const dropdown = document.querySelector(".avatar-dropdown");

    const notificationBtn = document.querySelector(".notification-btn");
    const notificationDropdown = document.querySelector(".notification-dropdown");

    let hoverTimeout;
    let notificationTimeout;

    // Profile dropdown
    if (profileBtn && dropdown) {
        function openDropdown() {
            clearTimeout(hoverTimeout);
            dropdown.classList.add("active");
        }

        function closeDropdown() {
            hoverTimeout = setTimeout(() => {
                dropdown.classList.remove("active");
            }, 120);
        }

        profileBtn.addEventListener("mouseenter", openDropdown);
        profileBtn.addEventListener("mouseleave", closeDropdown);

        dropdown.addEventListener("mouseenter", openDropdown);
        dropdown.addEventListener("mouseleave", closeDropdown);

        profileBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            dropdown.classList.toggle("active");
            notificationDropdown?.classList.remove("active");
        });
    }

    // Notification dropdown
    if (notificationBtn && notificationDropdown) {
        function openNotificationDropdown() {
            clearTimeout(notificationTimeout);
            notificationDropdown.classList.add("active");
        }

        function closeNotificationDropdown() {
            notificationTimeout = setTimeout(() => {
                notificationDropdown.classList.remove("active");
            }, 120);
        }

        notificationBtn.addEventListener("mouseenter", openNotificationDropdown);
        notificationBtn.addEventListener("mouseleave", closeNotificationDropdown);

        notificationDropdown.addEventListener("mouseenter", openNotificationDropdown);
        notificationDropdown.addEventListener("mouseleave", closeNotificationDropdown);

        notificationBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            notificationDropdown.classList.toggle("active");
            dropdown?.classList.remove("active");
        });
    }

    // Close both when clicking outside
    document.addEventListener("click", (e) => {
        if (profileBtn && dropdown && !profileBtn.contains(e.target) && !dropdown.contains(e.target)) {
            dropdown.classList.remove("active");
        }

        if (
            notificationBtn &&
            notificationDropdown &&
            !notificationBtn.contains(e.target) &&
            !notificationDropdown.contains(e.target)
        ) {
            notificationDropdown.classList.remove("active");
        }
    });
});