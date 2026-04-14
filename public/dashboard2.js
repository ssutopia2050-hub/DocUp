document.addEventListener("DOMContentLoaded", () => {
    const profileBtn = document.querySelector(".avatar-btn");
    const dropdown = document.querySelector(".avatar-dropdown");

    if (profileBtn && dropdown) {
        let hoverTimeout;

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

        profileBtn.addEventListener("click", () => {
            window.location.href = "/profile";
        });
    }

    const notificationBtn = document.querySelector(".notification-btn");
    const notificationDropdown = document.querySelector(".notification-dropdown");

    if (notificationBtn && notificationDropdown) {
        let notificationTimeout;

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
    }
});