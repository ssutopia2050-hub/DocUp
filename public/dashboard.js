document.addEventListener("DOMContentLoaded", function () {
    const filterBtn = document.getElementById("filter-toggle");
    const filterDropdown = document.getElementById("filter-dropdown");
    const streamSelect = document.getElementById("stream");
    const branchSelect = document.getElementById("branch");
    const searchInput = document.getElementById("search_parameter_text");
    const suggestionsBox = document.getElementById("college-suggestions");
    const searchForm = document.querySelector(".search-form");
    const resultsContainer = document.getElementById("search-results-container");

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

    function renderResults(results) {
        const collegeLogoMap = getCollegeLogoMap(collegeSpecificData);
        resultsContainer.innerHTML = "";

        if (!results || results.length === 0) {
            resultsContainer.innerHTML = `
                <p style="color:rgba(255,255,255,0.18); opacity:.6; margin-top:40px;font-size:2rem">
                    No results found
                </p>
            `;
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
                    <div class="top-result-tab">
                        ${escapeHTML(doc.college || "")}
                        <div class="tags-container">
                            <div class="tags">${escapeHTML(doc.branch || "")}</div>
                            <div class="tags">${escapeHTML(capitalizeFirst(doc.year || ""))}</div>
                            <div class="tags">${escapeHTML(capitalizeFirst(doc.subject || ""))}</div>
                        </div>
                    </div>

                    <div class="file-link-result-tab">
                        <a href="${doc.file_url}" target="_blank">
                            Click here to view the doc on your browser
                        </a>
                    </div>
                </div>

                <div class="college-logo">
                    <img
                        src="${logoUrl}"
                        alt="college logo"
                        onerror="this.onerror=null; this.src='/images/default.png';"
                    >
                </div>
            `;

            resultsContainer.appendChild(card);
        });
    }

    function showLoading() {
        resultsContainer.innerHTML = `
            <p style="color:white; opacity:.7; margin-top:40px; font-size:1.4rem;">
                Searching...
            </p>
        `;
    }

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

        if (value.startsWith("/s")) {
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

    searchForm.addEventListener("submit", async function (e) {
        e.preventDefault();

        const formData = new FormData(searchForm);

        const payload = {
            search_parameter_text: formData.get("search_parameter_text"),
            year: formData.get("year"),
            stream: formData.get("stream"),
            branch: formData.get("branch")
        };
        if(formData.get("search_parameter_text") === "/c" || formData.get("search_parameter_text") === "/s") {
            resultsContainer.innerText = "Enter a search parameter to get Results";
            resultsContainer.style.color="grey";
            resultsContainer.style.fontFamily = "Saira ,sans-serif";

        }
        else{
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
            }
        }


    });
})