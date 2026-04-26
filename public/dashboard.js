document.addEventListener("DOMContentLoaded", function () {
    const filterBtn = document.getElementById("filter-toggle");
    const filterDropdown = document.getElementById("filter-dropdown");
    const streamSelect = document.getElementById("stream");
    const branchSelect = document.getElementById("branch");
    const searchInput = document.getElementById("search_parameter_text");
    const suggestionsBox = document.getElementById("college-suggestions");
    const searchForm = document.querySelector(".search-form");
    const resultsContainer = document.getElementById("search-results-container");
    const yearSelect = document.querySelector('select[name="year"]');
    const collegeResultsStrip = document.getElementById("college-results-strip");
    const collegeResultsStripInner = document.getElementById("college-results-strip-inner");
    const searchBtn = document.querySelector(".search-btn");

    const suggestionBar = document.getElementById("search-suggestion-bar");
    const suggestionBtn = document.getElementById("search-suggestion-btn");

    const backToTopBtn = document.getElementById("backToTopBtn");
    const searchBar = document.querySelector(".search-param-container");
    const progressCircle = document.querySelector(".progress-ring-circle");

    const radius = 26;
    const circumference = 2 * Math.PI * radius;

    if (progressCircle) {
        progressCircle.style.strokeDasharray = circumference;
    }

    function updateScrollProgress() {
        const scrollTop = window.scrollY;
        const docHeight = document.documentElement.scrollHeight - window.innerHeight;

        const progress = scrollTop / docHeight;
        const offset = circumference - progress * circumference;

        if (progressCircle) {
            progressCircle.style.strokeDashoffset = offset;
        }
    }

    function toggleBackToTop() {
        if (!searchBar || !backToTopBtn) return;

        const rect = searchBar.getBoundingClientRect();

        if (rect.bottom < 0) {
            backToTopBtn.classList.add("show");
        } else {
            backToTopBtn.classList.remove("show");
        }
    }

    window.addEventListener("scroll", () => {
        toggleBackToTop();
        updateScrollProgress();
    });

    /* ===== Click scroll ===== */
    if (backToTopBtn) {
        backToTopBtn.addEventListener("click", () => {
            window.scrollTo({
                top: 0,
                behavior: "smooth"
            });
        });
    }

    // /* ===== Magnetic Hover ===== */
    // if (backToTopBtn) {
    //     backToTopBtn.addEventListener("mousemove", (e) => {
    //         const rect = backToTopBtn.getBoundingClientRect();
    //         const x = e.clientX - rect.left - rect.width / 2;
    //         const y = e.clientY - rect.top - rect.height / 2;
    //
    //         backToTopBtn.style.transform =
    //             `translate(${x * 0.25}px, ${y * 0.25}px) scale(1.05)`;
    //     });
    //
    //     backToTopBtn.addEventListener("mouseleave", () => {
    //         backToTopBtn.style.transform = "";
    //     });
    // }
    const colleges = JSON.parse(
        document.getElementById("colleges-data").textContent
    );

    const collegeSpecificData = JSON.parse(
        document.getElementById("college-specific-data").textContent
    );

    const branchData = {
        engineering: [
            "CSE",
            "Information Technology",
            "Electronics & Communication",
            "Electrical Engineering",
            "Mechanical Engineering",
            "Civil Engineering",
            "Chemical Engineering",
            "Aerospace Engineering",
            "AI & Data Science",
            "Robotics"
        ],
        mbbs: [
            "Anatomy",
            "Physiology",
            "Biochemistry",
            "Pathology",
            "Pharmacology",
            "Microbiology"
        ],
        bpharma: [
            "Pharmaceutics",
            "Pharmacology",
            "Pharmaceutical Chemistry",
            "Pharmacognosy"
        ],
        mba: [
            "Finance",
            "Marketing",
            "Human Resources",
            "Operations",
            "Business Analytics"
        ],
        bba: [
            "Business Management",
            "Entrepreneurship",
            "International Business"
        ],
        bcom: [
            "Accounting",
            "Taxation",
            "Banking & Finance",
            "Economics"
        ]
    };

    function capitalizeFirst(str) {
        if (!str) return "";
        return str.charAt(0).toUpperCase() + str.slice(1);
    }

    function escapeHTML(str) {
        const div = document.createElement("div");
        div.textContent = str || "";
        return div.innerHTML;
    }

    function getCollegeLogoMap(data) {
        const map = {};
        (data || []).forEach(clg => {
            if (clg.college_name && clg.image) {
                map[clg.college_name.trim().toLowerCase()] = clg.image;
            }
        });
        return map;
    }

    function hideSuggestions() {
        if (!suggestionsBox) return;
        suggestionsBox.style.display = "none";
        suggestionsBox.innerHTML = "";
    }

    function showSuggestions(matches) {
        if (!suggestionsBox) return;

        suggestionsBox.innerHTML = "";

        if (!matches || matches.length === 0) {
            hideSuggestions();
            return;
        }

        matches.forEach((college, index) => {
            const item = document.createElement("div");
            item.textContent = college;
            item.style.padding = "12px 16px";
            item.style.cursor = "pointer";
            item.style.color = "white";
            item.style.fontFamily = "'Saira', sans-serif";
            item.style.borderBottom = "1px solid rgba(255,255,255,0.06)";
            item.style.transition = "0.2s";

            if (index === matches.length - 1) {
                item.style.borderBottom = "none";
            }

            item.addEventListener("mouseenter", () => {
                item.style.background = "rgba(255,255,255,0.08)";
            });

            item.addEventListener("mouseleave", () => {
                item.style.background = "transparent";
            });

            item.addEventListener("click", () => {
                searchInput.value = `/c ${college}`;
                hideSuggestions();
                hideSearchSuggestion();
                searchInput.focus();
            });

            suggestionsBox.appendChild(item);
        });

        suggestionsBox.style.display = "block";
    }

    function hideSearchSuggestion() {
        if (!suggestionBar || !suggestionBtn) return;
        suggestionBar.style.display = "none";
        suggestionBtn.textContent = "";
        suggestionBtn.dataset.value = "";
    }

    function showSearchSuggestion(value) {
        if (!suggestionBar || !suggestionBtn || !value) return;
        suggestionBtn.textContent = value;
        suggestionBtn.dataset.value = value;
        suggestionBar.style.display = "flex";
    }

    function populateBranches(stream) {
        if (!branchSelect) return;

        branchSelect.innerHTML = `<option value="all">All Branches</option>`;

        if (!branchData[stream]) return;

        branchData[stream].forEach(branch => {
            const option = document.createElement("option");
            option.value = branch;
            option.textContent = branch;
            branchSelect.appendChild(option);
        });
    }

    function setSearchButtonLoading(isLoading) {
        if (!searchBtn) return;

        if (isLoading) {
            searchBtn.disabled = true;
            searchBtn.style.opacity = "0.7";
            searchBtn.style.cursor = "not-allowed";
            searchBtn.textContent = "Searching...";
        } else {
            searchBtn.disabled = false;
            searchBtn.style.opacity = "1";
            searchBtn.style.cursor = "pointer";
            searchBtn.textContent = "Search";
        }
    }

    function showLoading() {
        // ✅ Hide initial college grid
        const grid = document.getElementById("initial-college-grid");
        if (grid) grid.style.display = "none";

        // ✅ Hide college strip (search suggestions row)
        if (collegeResultsStrip) {
            collegeResultsStrip.style.display = "none";
        }

        // ✅ Disable search button
        setSearchButtonLoading(true);

        // ✅ Show loading UI
        if (resultsContainer) {
            resultsContainer.innerHTML = `
            <div class="search-ui-state search-loader-state">
                <div class="search-ui-glow"></div>

                <div class="search-loader-orb">
                    <span></span>
                    <span></span>
                    <span></span>
                </div>

                <p class="search-ui-eyebrow">DocUp Search</p>
                <h2 style="font-family: 'DM Sans', sans-serif;">
                    Searching through documents
                </h2>
                <p class="search-ui-text">
                    Finding notes, PYQs, semester material and useful docs for you...
                </p>
            </div>
        `;
        }
    }

    function showInputHintState() {
        setSearchButtonLoading(false);

        // ✅ Show initial college grid again
        const grid = document.getElementById("initial-college-grid");
        if (grid) grid.style.display = "grid";

        // ✅ Hide college strip
        if (collegeResultsStrip) {
            collegeResultsStrip.style.display = "none";
        }

        // ✅ Clear results instead of showing empty state UI
        if (resultsContainer) {
            resultsContainer.innerHTML = "";
        }

        // ✅ Save state
        saveDashboardState();
    }

    function showErrorState(title, text) {
        setSearchButtonLoading(false);

        if (collegeResultsStrip) {
            collegeResultsStrip.style.display = "none";
        }

        resultsContainer.innerHTML = `
            <div class="search-ui-state no-results-state">
                <div class="search-ui-glow"></div>

                <div class="no-results-icon">
                    <svg xmlns="http://www.w3.org/2000/svg" width="54" height="54" viewBox="0 0 24 24" fill="none">
                        <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.7"/>
                        <path d="M12 8V13" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>
                        <circle cx="12" cy="16.5" r="0.8" fill="currentColor"/>
                    </svg>
                </div>

                <p class="search-ui-eyebrow">Search Error</p>
                <h2>${escapeHTML(title)}</h2>
                <p class="search-ui-text">${escapeHTML(text)}</p>
            </div>
        `;

        saveDashboardState();
    }

    function saveDashboardState() {
        const state = {
            resultsHTML: resultsContainer ? resultsContainer.innerHTML : "",
            collegeStripHTML: collegeResultsStripInner ? collegeResultsStripInner.innerHTML : "",
            collegeStripVisible: collegeResultsStrip ? collegeResultsStrip.style.display : "none",
            searchValue: searchInput ? searchInput.value : "",
            selectedYear: yearSelect ? yearSelect.value : "all",
            selectedStream: streamSelect ? streamSelect.value : "all",
            selectedBranch: branchSelect ? branchSelect.value : "all",
            suggestionVisible: suggestionBar ? suggestionBar.style.display : "none",
            suggestionText: suggestionBtn ? suggestionBtn.textContent : ""
        };

        sessionStorage.setItem("dashboardState", JSON.stringify(state));
    }

    function restoreDashboardState() {
        const rawState = sessionStorage.getItem("dashboardState");
        if (!rawState) return;

        try {
            const state = JSON.parse(rawState);

            if (typeof state.searchValue === "string" && searchInput) {
                searchInput.value = state.searchValue;
            }

            if (typeof state.selectedYear === "string" && yearSelect) {
                yearSelect.value = state.selectedYear;
            }

            if (typeof state.selectedStream === "string" && streamSelect) {
                streamSelect.value = state.selectedStream;
                populateBranches(state.selectedStream);
            }

            if (typeof state.selectedBranch === "string" && branchSelect) {
                branchSelect.value = state.selectedBranch;
            }

            if (state.collegeStripHTML && collegeResultsStripInner) {
                collegeResultsStripInner.innerHTML = state.collegeStripHTML;
            }

            if (collegeResultsStrip) {
                collegeResultsStrip.style.display = state.collegeStripVisible || "none";
            }

            if (state.resultsHTML && resultsContainer) {
                resultsContainer.innerHTML = state.resultsHTML;
            }

            if (state.suggestionVisible === "flex" && state.suggestionText) {
                showSearchSuggestion(state.suggestionText);
            } else {
                hideSearchSuggestion();
            }
        } catch (err) {
            console.log("Failed to restore dashboard state:", err);
        }
    }

    async function refreshDocScore() {
        try {
            const response = await fetch("/api/docscore");
            const result = await response.json();

            if (response.ok && result.success) {
                const scoreEl = document.getElementById("docscore-value");
                if (scoreEl) {
                    scoreEl.textContent = result.Doc_score;
                }
            }
        } catch (err) {
            console.log("Failed to refresh DocScore:", err);
        }
    }

    function renderCollegeCards(results) {
        if (!collegeResultsStrip || !collegeResultsStripInner) return;

        const collegeLogoMap = getCollegeLogoMap(collegeSpecificData);
        collegeResultsStripInner.innerHTML = "";

        if (!results || results.length === 0) {
            collegeResultsStrip.style.display = "none";
            return;
        }

        const uniqueColleges = [];
        const seen = new Set();

        results.forEach(doc => {
            const collegeName = (doc.college || "").trim();
            if (!collegeName) return;

            const key = collegeName.toLowerCase();
            if (!seen.has(key)) {
                seen.add(key);
                uniqueColleges.push(collegeName);
            }
        });

        if (uniqueColleges.length === 0) {
            collegeResultsStrip.style.display = "none";
            return;
        }

        uniqueColleges.forEach(collegeName => {
            const logoUrl =
                collegeLogoMap[collegeName.trim().toLowerCase()] ||
                "/images/default.png";

            const anchor = document.createElement("a");
            anchor.className = "college-result-card";
            anchor.href = `/college/${encodeURIComponent(collegeName)}`;

            anchor.innerHTML = `
                <div class="college-result-card-logo">
                    <img
                        src="${logoUrl}"
                        alt="${escapeHTML(collegeName)} logo"
                        onerror="this.onerror=null; this.src='/images/default.png';"
                    >
                </div>
                <div class="college-result-card-text">
                    <span class="college-result-card-label"></span>
                    <p>${escapeHTML(collegeName)}</p>
                </div>
            `;

            collegeResultsStripInner.appendChild(anchor);
        });

        collegeResultsStrip.style.display = "block";
    }

    function renderResults(results) {
        const collegeLogoMap = getCollegeLogoMap(collegeSpecificData);

        // ✅ Always hide initial grid when results are being rendered
        const grid = document.getElementById("initial-college-grid");
        if (grid) grid.style.display = "none";

        // ✅ Reset container + button
        if (resultsContainer) resultsContainer.innerHTML = "";
        setSearchButtonLoading(false);

        // ✅ Render top college strip
        renderCollegeCards(results);

        // =========================
        // ❌ NO RESULTS STATE
        // =========================
        if (!results || results.length === 0) {
            if (collegeResultsStrip) {
                collegeResultsStrip.style.display = "none";
            }

            if (resultsContainer) {
                resultsContainer.innerHTML = `
                <div class="search-ui-state no-results-state">
                    <div class="search-ui-glow"></div>

                    <div class="no-results-icon">
                        <svg xmlns="http://www.w3.org/2000/svg" width="54" height="54" viewBox="0 0 24 24" fill="none">
                            <path d="M10 17a7 7 0 1 1 4.95-2.05L21 21" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>
                            <path d="M9 9h2v5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>
                            <circle cx="10" cy="7" r="0.8" fill="currentColor"/>
                        </svg>
                    </div>

                    <p class="search-ui-eyebrow">No Match Found</p>
                    <h2>Could not find any docs for this search</h2>
                    <p class="search-ui-text">
                        Try a college name, subject, chapter, or use filters to narrow things better.
                    </p>

                    <div class="no-results-tips">
                        <div class="no-results-tip"><span>/c</span> College Name</div>
                        <div class="no-results-tip"><span>/s</span> Subject Name</div>
                        <div class="no-results-tip"><span>/ch</span> Chapter Name</div>
                    </div>
                </div>
            `;
            }

            saveDashboardState();
            return;
        }

        // =========================
        // ✅ RESULTS FOUND
        // =========================
        results.forEach(doc => {
            const logoUrl =
                collegeLogoMap[(doc.college || "").trim().toLowerCase()] ||
                "/images/default.png";

            const card = document.createElement("div");
            card.className = "result-tab-container";

            const isEdDoc = doc.doc_type === "ed_doc";

            card.innerHTML = `
            <div class="result-tab">
                <div class="result-tab-top">
                    <div class="result-tab-identity">
                        ${isEdDoc ? `
                        <div class="result-tab-title-wrap">
                            <p class="result-tab-label">Entrance Exam</p>
                            <span style="font-weight:600;font-size:0.95rem;">${escapeHTML(doc.college || "")}</span>
                            <p class="result-tab-label" style="color:white;">
                                ${escapeHTML(capitalizeFirst(doc.chapter || ""))}
                            </p>
                        </div>
                        ` : `
                        <div class="college-logo">
                            <img
                                src="${logoUrl}"
                                alt="${escapeHTML(doc.college || "College Logo")}"
                                onerror="this.onerror=null; this.src='/images/default.png';"
                            >
                        </div>

                        <div class="result-tab-title-wrap">
                            <p class="result-tab-label">Institution</p>
                            <a href="/college/${encodeURIComponent(doc.college || "")}">
                                ${escapeHTML(doc.college || "")}
                            </a>
                            <p class="result-tab-label" style="color:white;">
                                ${escapeHTML(capitalizeFirst(doc.chapter || ""))}
                            </p>
                        </div>
                        `}
                    </div>

                    <div class="result-tab-badge">
                        ${escapeHTML(doc.special_tag || "")}
                    </div>
                </div>

                <div class="result-tab-body">
                    <div class="file-link-result-tab">
                        <a href="/view/${doc._id}" class="view-doc-link"
                           style="display:flex;justify-content:center;align-items:center;gap:4%;width:150px;">
                            Open Doc
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"
                                      stroke="currentColor" stroke-width="1.7"
                                      stroke-linecap="round" stroke-linejoin="round"/>
                                <circle cx="12" cy="12" r="3"
                                        stroke="currentColor" stroke-width="1.7"/>
                            </svg>
                        </a>
                    </div>
                </div>

                <div class="result-tab-footer">
                    <div class="tags-container">
                        ${isEdDoc ? `
                        ${doc.branch ? `<div class="tags tag-clickable" data-tag-search="${escapeHTML(doc.branch)}">${escapeHTML(doc.branch)}</div>` : ""}
                        ${doc.year ? `<div class="tags tag-clickable" data-tag-search="${escapeHTML(capitalizeFirst(doc.year))}">${escapeHTML(capitalizeFirst(doc.year))}</div>` : ""}
                        ${doc.subject ? `<div class="tags tag-clickable" data-tag-search="/s ${escapeHTML(capitalizeFirst(doc.subject))}">${escapeHTML(capitalizeFirst(doc.subject))}</div>` : ""}
                        ${doc.chapter ? `<div class="tags tag-clickable" data-tag-search="/ch ${escapeHTML(capitalizeFirst(doc.chapter))}">${escapeHTML(capitalizeFirst(doc.chapter))}</div>` : ""}
                        ` : `
                        ${doc.branch ? `<div class="tags tag-clickable" data-tag-search="${escapeHTML(doc.branch)}">${escapeHTML(doc.branch)}</div>` : ""}
                        ${doc.year ? `<div class="tags tag-clickable" data-tag-search="${escapeHTML(capitalizeFirst(doc.year))}">${escapeHTML(capitalizeFirst(doc.year))}</div>` : ""}
                        ${doc.semester ? `<div class="tags tag-clickable" data-tag-search="${escapeHTML(capitalizeFirst(doc.semester))}">${escapeHTML(capitalizeFirst(doc.semester))}</div>` : ""}
                        ${doc.subject ? `<div class="tags tag-clickable" data-tag-search="/s ${escapeHTML(capitalizeFirst(doc.subject))}">${escapeHTML(capitalizeFirst(doc.subject))}</div>` : ""}
                        ${doc.chapter ? `<div class="tags tag-clickable" data-tag-search="/ch ${escapeHTML(capitalizeFirst(doc.chapter))}">${escapeHTML(capitalizeFirst(doc.chapter))}</div>` : ""}
                        `}

                        ${doc.reviewed
                ? `<div class="verif-status verified">Verified</div>`
                : `<div class="verif-status not-verified">To be Verified</div>`
            }

                        <div style="display:flex;align-items:center;gap:8px;" class="tags">
                            ${escapeHTML(String(doc.likes ?? 0))}
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="#FF4500FF">
                                <path d="M15.9 4.5C15.9 3 14.418 2 13.26 2c-.806 0-.869.612-.993 1.82-.055.53-.121 1.174-.267 1.93-.386 2.002-1.72 4.56-2.996 5.325V17C9 19.25 9.75 20 13 20h3.773c2.176 0 2.703-1.433 2.899-1.964l.013-.036c.114-.306.358-.547.638-.82.31-.306.664-.653.927-1.18.311-.623.27-1.177.233-1.67-.023-.299-.044-.575.017-.83.064-.27.146-.475.225-.671.143-.356.275-.686.275-1.329 0-1.5-.748-2.498-2.315-2.498H15.5S15.9 6 15.9 4.5z"/>
                            </svg>
                        </div>
                    </div>
                </div>
            </div>
        `;

            resultsContainer.appendChild(card);
        });

        saveDashboardState();
    }

    restoreDashboardState();
    refreshDocScore();

    if (filterBtn && filterDropdown) {
        filterBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            filterDropdown.style.display =
                filterDropdown.style.display === "flex" ? "none" : "flex";
        });
    }

    document.addEventListener("click", (e) => {
        if (
            filterBtn &&
            filterDropdown &&
            !filterBtn.contains(e.target) &&
            !filterDropdown.contains(e.target)
        ) {
            filterDropdown.style.display = "none";
        }

        if (
            suggestionsBox &&
            searchInput &&
            !suggestionsBox.contains(e.target) &&
            e.target !== searchInput
        ) {
            hideSuggestions();
        }
    });

    if (streamSelect) {
        streamSelect.addEventListener("change", function () {
            populateBranches(this.value);
        });
    }

    if (searchInput) {
        searchInput.addEventListener("input", function () {
            const value = this.value.trim();

            hideSearchSuggestion();

            if (value.startsWith("/s") || value.startsWith("/ch")) {
                hideSuggestions();
                return;
            }

            if (value.startsWith("/c")) {
                const query = value.slice(2).trim().toLowerCase();

                if (!query) {
                    showSuggestions(colleges.slice(0, 8));
                    return;
                }

                const matches = colleges
                    .filter(college => college.toLowerCase().includes(query))
                    .slice(0, 8);

                showSuggestions(matches);
                return;
            }

            hideSuggestions();
        });

        searchInput.addEventListener("focus", function () {
            const value = this.value.trim();

            if (value === "/c" || value === "/c ") {
                showSuggestions(colleges.slice(0, 8));
            }
        });
    }

    if (suggestionBtn) {
        suggestionBtn.addEventListener("click", () => {
            const suggestedValue = suggestionBtn.dataset.value;
            if (!suggestedValue) return;

            searchInput.value = suggestedValue;
            hideSearchSuggestion();

            if (searchForm) {
                searchForm.dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
            }
        });
    }

    if (resultsContainer) {
        resultsContainer.addEventListener("click", function (e) {
            const link = e.target.closest(".view-doc-link");
            if (link) {
                saveDashboardState();
                return;
            }

            // Tag click → trigger search
            const tag = e.target.closest(".tag-clickable");
            if (!tag) return;

            const searchValue = tag.dataset.tagSearch;
            if (!searchValue) return;

            if (searchInput) {
                searchInput.value = searchValue;
                window.scrollTo({ top: 0, behavior: "smooth" });
            }

            if (searchForm) {
                searchForm.dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
            }
        });
    }

    if (searchForm) {
        searchForm.addEventListener("submit", async function (e) {
            e.preventDefault();

            const formData = new FormData(searchForm);

            const payload = {
                search_parameter_text: formData.get("search_parameter_text"),
                year: formData.get("year"),
                stream: formData.get("stream"),
                branch: formData.get("branch")
            };

            const rawSearch = (formData.get("search_parameter_text") || "").trim();

            if (
                rawSearch === "/c" || rawSearch === "/c " ||
                rawSearch === "/s" || rawSearch === "/s " ||
                rawSearch === "/ch" || rawSearch === "/ch "
            ) {
                showInputHintState();
                hideSearchSuggestion();
                return;
            }

            try {
                hideSuggestions();
                hideSearchSuggestion();
                showLoading();

                const response = await fetch("/api/dashboard-search", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify(payload)
                });

                const result = await response.json();

                if (!response.ok || !result.success) {
                    showErrorState(
                        "Failed to fetch results",
                        "The search request could not be completed right now. Please try again."
                    );
                    hideSearchSuggestion();
                    return;
                }

                if (result.suggestion) {
                    showSearchSuggestion(result.suggestion);
                } else {
                    hideSearchSuggestion();
                }

                renderResults(result.results);

            } catch (err) {
                console.log(err);
                hideSearchSuggestion();
                showErrorState(
                    "Something went wrong",
                    "An unexpected error occurred while searching. Please try again."
                );
            }
        });
    }
    // =========================================================
    // Auto-trigger search if coming from another page (like Saved Docs)
    // =========================================================
    const urlParams = new URLSearchParams(window.location.search);
    const searchQuery = urlParams.get("search");

    if (searchQuery && searchInput && searchForm) {
        // 1. Put the search term into the input box
        searchInput.value = searchQuery;

        // 2. Show the clear "X" button
        const clearBtn = document.getElementById("clear-search");
        if (clearBtn) clearBtn.style.display = "block";

        // 3. Remove the ?search= parameter from the URL so if the user refreshes, it resets cleanly
        window.history.replaceState({}, document.title, window.location.pathname);

        // 4. Wait a tiny moment, then trigger the form submission exactly as if the user pressed "Enter"
        setTimeout(() => {
            searchForm.dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
        }, 50);
    }
});