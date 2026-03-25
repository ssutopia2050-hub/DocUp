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
        suggestionsBox.style.display = "none";
        suggestionsBox.innerHTML = "";
    }

    function showSuggestions(matches) {
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
                searchInput.focus();
            });

            suggestionsBox.appendChild(item);
        });

        suggestionsBox.style.display = "block";
    }

    function populateBranches(stream) {
        branchSelect.innerHTML = `<option value="all">All Branches</option>`;

        if (!branchData[stream]) return;

        branchData[stream].forEach(branch => {
            const option = document.createElement("option");
            option.value = branch;
            option.textContent = branch;
            branchSelect.appendChild(option);
        });
    }

    function showLoading() {
        if (collegeResultsStrip) {
            collegeResultsStrip.style.display = "none";
        }

        resultsContainer.innerHTML = `
            <p style="color:white; opacity:.7; margin-top:40px; font-size:1.4rem;">
                Searching...
            </p>
        `;
    }

    function saveDashboardState() {
        const state = {
            resultsHTML: resultsContainer.innerHTML,
            collegeStripHTML: collegeResultsStripInner ? collegeResultsStripInner.innerHTML : "",
            collegeStripVisible: collegeResultsStrip ? collegeResultsStrip.style.display : "none",
            searchValue: searchInput.value,
            selectedYear: yearSelect.value,
            selectedStream: streamSelect.value,
            selectedBranch: branchSelect.value
        };

        sessionStorage.setItem("dashboardState", JSON.stringify(state));
    }

    function restoreDashboardState() {
        const rawState = sessionStorage.getItem("dashboardState");
        if (!rawState) return;

        try {
            const state = JSON.parse(rawState);

            if (typeof state.searchValue === "string") {
                searchInput.value = state.searchValue;
            }

            if (typeof state.selectedYear === "string") {
                yearSelect.value = state.selectedYear;
            }

            if (typeof state.selectedStream === "string") {
                streamSelect.value = state.selectedStream;
                populateBranches(state.selectedStream);
            }

            if (typeof state.selectedBranch === "string") {
                branchSelect.value = state.selectedBranch;
            }

            if (state.collegeStripHTML && collegeResultsStripInner) {
                collegeResultsStripInner.innerHTML = state.collegeStripHTML;
            }

            if (collegeResultsStrip) {
                collegeResultsStrip.style.display = state.collegeStripVisible || "none";
            }

            if (state.resultsHTML) {
                resultsContainer.innerHTML = state.resultsHTML;
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
                    <span class="college-result-card-label">College</span>
                    <p>${escapeHTML(collegeName)}</p>
                </div>
            `;

            collegeResultsStripInner.appendChild(anchor);
        });

        collegeResultsStrip.style.display = "block";
    }
    function renderResults(results) {
        const collegeLogoMap = getCollegeLogoMap(collegeSpecificData);
        resultsContainer.innerHTML = "";

        renderCollegeCards(results);

        if (!results || results.length === 0) {
            if (collegeResultsStrip) {
                collegeResultsStrip.style.display = "none";
            }

            resultsContainer.innerHTML = `
            <p style="color:rgba(255,255,255,0.18); opacity:.6; margin-top:40px;font-size:2rem">
                No results found
            </p>
        `;
            saveDashboardState();
            return;
        }

        results.forEach(doc => {
            const logoUrl =
                collegeLogoMap[(doc.college || "").trim().toLowerCase()] ||
                "/images/default.png";

            const card = document.createElement("div");
            card.className = "result-tab-container";

            card.innerHTML = `
<div class="result-tab">

    <div class="result-tab-top">
        <div class="result-tab-identity">
            <div class="college-logo">
                <img src="${logoUrl}" alt="College Logo">
            </div>

            <div class="result-tab-title-wrap">
                <p class="result-tab-label">Institution</p>
                <a href="/college/${encodeURIComponent(doc.college || "")}">
                    ${escapeHTML(doc.college || "")}
                </a>
            </div>
        </div>

        <div class="result-tab-badge">DOC</div>
    </div>

    <div class="result-tab-body">

        <p class="result-tab-body-label">Open Document</p>

        <div class="file-link-result-tab">
            <a href="/view/${doc._id}" class="view-doc-link">
                Click here to view the doc on your browser
            </a>
        </div>

    </div>

    <div class="result-tab-footer">
        <div class="tags-container">

            <div class="tags">${escapeHTML(doc.branch || "")}</div>
            <div class="tags">${escapeHTML(capitalizeFirst(doc.year || ""))}</div>
            <div class="tags">${escapeHTML(capitalizeFirst(doc.subject || ""))}</div>
            <div class="tags">${escapeHTML(capitalizeFirst(doc.chapter || ""))}</div>
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

            <div style="display:flex;align-items:center;gap:8px;" class="tags">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="#FF4500FF">
                    <path d="M8.1 19.5C8.1 21 9.582 22 10.74 22c.806 0 .869-.612.993-1.82.055-.53.121-1.174.267-1.93.386-2.002 1.72-4.56 2.996-5.325V7C15 4.75 14.25 4 11 4H7.227c-2.176 0-2.703 1.433-2.899 1.964l-.013.036c-.114.306-.358.547-.638.82-.31.306-.664.653-.927 1.18-.311.623-.27 1.177-.233 1.67.023.299.044.575-.017.83-.064.27-.146.475-.225.671-.143.356-.275.686-.275 1.329 0 1.5.748 2.498 2.315 2.498H8.5s-.4 3-.4 4.5z"/>
                </svg>
                ${escapeHTML(String(doc.dislikes ?? 0))}
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

    filterBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        filterDropdown.style.display =
            filterDropdown.style.display === "flex" ? "none" : "flex";
    });

    document.addEventListener("click", (e) => {
        if (!filterBtn.contains(e.target) && !filterDropdown.contains(e.target)) {
            filterDropdown.style.display = "none";
        }

        if (!suggestionsBox.contains(e.target) && e.target !== searchInput) {
            hideSuggestions();
        }
    });

    streamSelect.addEventListener("change", function () {
        populateBranches(this.value);
    });

    searchInput.addEventListener("input", function () {
        const value = this.value.trim();

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

    resultsContainer.addEventListener("click", function (e) {
        const link = e.target.closest(".view-doc-link");
        if (!link) return;
        saveDashboardState();
    });

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
            resultsContainer.innerText = "Enter a search parameter to get Results";
            resultsContainer.style.color = "grey";
            resultsContainer.style.fontFamily = "Saira, sans-serif";
            saveDashboardState();
            return;
        }

        try {
            hideSuggestions();
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
                resultsContainer.innerHTML = `
                    <p style="color:red; margin-top:40px; font-size:1.2rem;">
                        Failed to fetch results
                    </p>
                `;
                saveDashboardState();
                return;
            }

            renderResults(result.results);

        } catch (err) {
            console.log(err);
            resultsContainer.innerHTML = `
                <p style="color:red; margin-top:40px; font-size:1.2rem;">
                    Something went wrong
                </p>
            `;
            saveDashboardState();
        }
    });
});