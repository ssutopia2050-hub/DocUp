document.addEventListener("DOMContentLoaded", () => {

    const profileBtn = document.querySelector(".profile-btn");
    const dropdown = document.querySelector(".profile-btn-dropdown");

    if (!profileBtn || !dropdown) return;

    let hoverTimeout;

    function openDropdown() {
        clearTimeout(hoverTimeout);
        dropdown.style.display = "flex";
    }

    function closeDropdown() {
        hoverTimeout = setTimeout(() => {
            dropdown.style.display = "none";
        }, 120); // small delay prevents flicker
    }

    // hover on icon
    profileBtn.addEventListener("mouseenter", openDropdown);
    profileBtn.addEventListener("mouseleave", closeDropdown);

    // hover on dropdown itself
    dropdown.addEventListener("mouseenter", openDropdown);
    dropdown.addEventListener("mouseleave", closeDropdown);

    //click
    profileBtn.addEventListener("click", () => {
        window.location.href="/profile";
    });

});