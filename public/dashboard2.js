document.addEventListener("DOMContentLoaded", () => {
    const profileBtn = document.querySelector(".profile-btn");
    const dropdown = document.querySelector(".profile-btn-dropdown");

    if (!profileBtn || !dropdown) return;

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
});