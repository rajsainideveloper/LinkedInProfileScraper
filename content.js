(async function autoScrapeAndPaginate() {
    const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));
    const profiles = [];
    let totalScraped = 0;
    let vipScraped = 0;

    // UI Setup
    const ui = document.createElement("div");
    Object.assign(ui.style, {
        position: "fixed", top: "20px", right: "20px", padding: "20px",
        background: "linear-gradient(135deg, #ffffff, #f8fafc)",
        border: "1px solid #e2e8f0", borderRadius: "12px",
        boxShadow: "0 4px 16px rgba(0,0,0,0.1)", zIndex: "9999",
        fontFamily: "'Inter', sans-serif", color: "#333",
        minWidth: "250px", minHeight: "150px",
        display: "flex", flexDirection: "column", gap: "10px"
    });

    const progress = document.createElement("div");
    const vipProgress = document.createElement("div");
    const status = document.createElement("div");
    const startBtn = document.createElement("button");
    const downloadBtn = document.createElement("button");
    const restartBtn = document.createElement("button");
    const closeBtn = document.createElement("button");

    function styleBtn(btn, bgColor) {
        Object.assign(btn.style, {
            display: "inline-block", margin: "5px 2px", padding: "10px 16px",
            background: bgColor, color: "#fff", border: "none", borderRadius: "6px",
            cursor: "pointer", fontSize: "14px", fontWeight: "500",
            transition: "background 0.2s ease"
        });
        btn.onmouseover = () => btn.style.background = darkenColor(bgColor, 10);
        btn.onmouseout = () => btn.style.background = bgColor;
    }

    function darkenColor(hex, percent) {
        hex = hex.replace('#', '');
        const factor = (100 - percent) / 100;
        return `#${[hex.slice(0,2),hex.slice(2,4),hex.slice(4,6)]
            .map(c => Math.floor(parseInt(c,16)*factor).toString(16).padStart(2,'0')).join('')}`;
    }

    // Setup UI
    progress.textContent = "Profiles scraped: 0";
    vipProgress.textContent = "VIP profiles scraped: 0";
    status.textContent = "Ready to start";

    Object.assign(progress.style, { fontSize: "16px", fontWeight: "600" });
    Object.assign(vipProgress.style, { fontSize: "16px", fontWeight: "600", color: "#059669" });
    Object.assign(status.style, { fontSize: "14px", color: "#6b7280", fontStyle: "italic" });

    styleBtn(startBtn, "#3b82f6"); startBtn.textContent = "▶ Start Scraping";
    styleBtn(downloadBtn, "#0073b1"); downloadBtn.textContent = "⬇ Download CSV"; downloadBtn.style.display = "none";
    styleBtn(restartBtn, "#28a745"); restartBtn.textContent = "🔄 Restart"; restartBtn.style.display = "none";
    styleBtn(closeBtn, "#ef4444"); closeBtn.textContent = "⨯ Close Extension";

    ui.append(progress, vipProgress, status, startBtn, downloadBtn, restartBtn, closeBtn);
    document.body.appendChild(ui);

    // Button actions
    downloadBtn.onclick = () => {
        if (!profiles.length) {
            console.error("Download failed: No profiles scraped.");
            alert("No profiles scraped to download.");
            return;
        }
        try {
            // Collect all unique contact info keys across profiles
            const contactKeys = Array.from(
                new Set(
                    profiles.flatMap(p => Object.keys(p.contactInfo || {}))
                )
            ).map(key => key.toLowerCase().replace(/\s+/g, '_')); // Normalize keys
            // Fixed headers plus dynamic contact info keys
            const headers = [
                "urn", "profileUrl", "profileImageUrl", "firstName", "lastName",
                "fullName", "connectionDegree", "jobTitle", "location",
                "contactInfoError", "contactInfoRaw", "errorReason",
                ...contactKeys
            ];
            const rows = profiles.map(p => {
                const profile = {
                    urn: "", profileUrl: "", profileImageUrl: "",
                    firstName: "", lastName: "", fullName: "",
                    connectionDegree: "", jobTitle: "", location: "",
                    contactInfoError: "false", contactInfoRaw: "", errorReason: "",
                    contactInfo: {},
                };
                Object.assign(profile, p);
                return headers.map(h => {
                    let value;
                    if (contactKeys.includes(h)) {
                        value = profile.contactInfo[h.replace(/_/g, ' ')] || "";
                    } else {
                        value = profile[h] || "";
                    }
                    return `"${String(value).replace(/"/g, '""').replace(/\n/g, ' ')}"`;
                }).join(",");
            });
            const csvContent = [headers.join(","), ...rows].join("\n");
            const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
            const a = document.createElement("a");
            a.href = URL.createObjectURL(blob);
            a.download = `linkedin_profiles_${new Date().toISOString().split("T")[0]}.csv`;
            a.click();
            URL.revokeObjectURL(a.href);
            restartBtn.style.display = "inline-block";
            status.textContent = "Data downloaded. Click Restart to begin again.";
        } catch (err) {
            console.error("CSV download error:", err);
            alert("Failed to download CSV. Check console for details.");
        }
    };

    restartBtn.onclick = () => {
        profiles.length = 0; totalScraped = vipScraped = 0;
        progress.textContent = "Profiles scraped: 0";
        vipProgress.textContent = "VIP profiles scraped: 0";
        downloadBtn.style.display = restartBtn.style.display = "none";
        startBtn.style.display = "inline-block";
        status.textContent = "Ready to start";
    };

    closeBtn.onclick = () => {
        ui.remove();
        console.log("Extension closed.");
    };

    // Contact Info Fetcher
    async function fetchContactInfo(profileUrl) {
        try {
            // Open new tab for contact info page
            const newWindow = window.open(profileUrl + '/overlay/contact-info/', '_blank');
            if (!newWindow) {
                throw new Error('Failed to open new tab. Ensure pop-ups are allowed.');
            }

            // Wait for page to load and click the contact info button
            let attempts = 0;
            const maxAttempts = 16; // Timeout after ~5 seconds (16 * 300ms)
            let clickAttempts = 0;
            const maxClickAttempts = 3; // Retry click up to 3 times
            let buttonClicked = false;
            let contactInfo = { contactInfoError: "true", contactInfoRaw: "", errorReason: "" };

            await new Promise((resolve) => {
                const interval = setInterval(() => {
                    try {
                        if (newWindow.closed) {
                            contactInfo.errorReason = "Tab closed prematurely";
                            clearInterval(interval);
                            resolve();
                            return;
                        }
                        // Check for CAPTCHA or login page
                        if (newWindow.document.querySelector('.checkpoint-container') ||
                            newWindow.document.querySelector('#login')) {
                            console.warn(`CAPTCHA or login detected for ${profileUrl}`);
                            contactInfo.errorReason = "CAPTCHA or login required";
                            newWindow.close();
                            clearInterval(interval);
                            resolve();
                            return;
                        }
                        // Attempt to click the contact info button
                        const contactButton = newWindow.document.getElementById('top-card-text-details-contact-info');
                        if (contactButton && !buttonClicked && clickAttempts < maxClickAttempts) {
                            if (contactButton.offsetParent !== null) { // Check if button is visible
                                contactButton.dispatchEvent(new Event('click', { bubbles: true }));
                                buttonClicked = true;
                                console.log(`Clicked contact button for ${profileUrl}`);
                                // Wait briefly for DOM to update after click
                                setTimeout(() => {}, 500);
                            }
                            clickAttempts++;
                        }
                        // Try primary selector, then fallback
                        let section = newWindow.document.querySelector('.pv-profile-section__section-info.section-info');
                        if (!section) {
                            section = newWindow.document.querySelector('.pv-contact-info');
                        }
                        if (section) {
                            // Extract key-value pairs from <dt> and <dd> elements
                            let rawText = section.textContent?.trim() || "";
                            
                            // const contactData = {};
                            // const sections = section.querySelectorAll('.pv-contact-info__contact-type');

                            // sections.forEach((s, i) => {
                            //     const keyEl = s.querySelector('.pv-contact-info__header');
                            //     let keyText = keyEl?.textContent?.trim() || `UnknownKey${i}`;
                            //     keyText = keyText.toLowerCase().replace(/\s+/g, '_');

                            //     let valueText = '';
                            //     const linkEl = s.querySelector('a');
                            //     const spanEl = s.querySelector('span');

                            //     if (linkEl) {
                            //         valueText = linkEl.href?.trim() || linkEl.textContent?.trim() || '';
                            //     } else if (spanEl) {
                            //         valueText = spanEl.textContent?.trim() || '';
                            //     } else {
                            //         valueText = s.textContent?.trim() || '';
                            //     }

                            //     // Check for suspicious strings in key or value
                            //     const suspiciousStrings = ['s_profile'];
                            //     const isSuspicious = str =>
                            //         suspiciousStrings.some(bad => str.includes(bad)) ||
                            //         str.length < 3 || !/[a-z]/i.test(str);

                            //     if (!isSuspicious(keyText) && !isSuspicious(valueText)) {
                            //         contactData[keyText] = valueText;

                            //         chrome.runtime.sendMessage({
                            //             type: "new_one_profile_scraped",
                            //             payload: { [keyText]: valueText }
                            //         });
                            //     }
                            // });



                            const contactData = {};
                            const sections = section.querySelectorAll('.pv-contact-info__contact-type');

                            sections.forEach((s, i) => {
                                const keyEl = s.querySelector('.pv-contact-info__header');
                                let keyText = keyEl?.textContent?.trim() || `UnknownKey${i}`;
                                keyText = keyText.toLowerCase().replace(/\s+/g, '_');

                                let valueText = '';
                                const linkEl = s.querySelector('a');
                                const spanEl = s.querySelector('span');

                                if (linkEl) {
                                    const href = linkEl.href?.trim() || '';
                                    const text = linkEl.textContent?.trim() || '';
                                    valueText = href.startsWith("mailto:") ? href.replace(/^mailto:/, '') : href || text;
                                } else if (spanEl) {
                                    valueText = spanEl.textContent?.trim() || '';
                                } else {
                                    valueText = s.textContent?.trim() || '';
                                }

                                // Check for suspicious strings in key or value
                                const suspiciousStrings = ['s_profile'];
                                const isSuspicious = str =>
                                    suspiciousStrings.some(bad => str.includes(bad)) ||
                                    str.length < 3 || !/[a-z]/i.test(str);

                                if (!isSuspicious(keyText) && !isSuspicious(valueText)) {
                                    contactData[keyText] = valueText;

                                    chrome.runtime.sendMessage({
                                        type: "new_one_profile_scraped",
                                        payload: { [keyText]: valueText }
                                    });
                                }
                            });

                            contactInfo = {
                                contactInfo: contactData,
                                contactInfoRaw: rawText,
                                contactInfoError: "false",
                                errorReason: ""
                            };
                            newWindow.close();
                            clearInterval(interval);
                            resolve();
                        } else if (attempts >= maxAttempts) {
                            console.warn(`Timeout: Could not find contact section for ${profileUrl}`);
                            contactInfo.errorReason = "Contact section not found after click";
                            newWindow.close();
                            clearInterval(interval);
                            resolve();
                        }
                        attempts++;
                    } catch (e) {
                        console.error(`Error accessing contact section for ${profileUrl}:`, e);
                        contactInfo.errorReason = e.message;
                        newWindow.close();
                        clearInterval(interval);
                        resolve();
                    }
                }, 300); // Check every 300ms
            });

            // Delay to prevent rate limiting
            await wait(1000);
            return contactInfo;
        } catch (e) {
            console.error(`Failed to fetch contact info for ${profileUrl}:`, e);
            return { contactInfoError: "true", contactInfoRaw: "", errorReason: e.message, contactInfo: {} };
        }
    }

    async function scrapeCurrentPage() {
        await wait(2000);
        const results = document.querySelectorAll('li > div[data-chameleon-result-urn]');
        for (const li of results) {
            const profile = {
                urn: "", profileUrl: "", profileImageUrl: "",
                firstName: "", lastName: "", fullName: "",
                connectionDegree: "", jobTitle: "", location: "",
                contactInfo: {}, contactInfoError: "false", contactInfoRaw: "", errorReason: "", Email: ""
            };
            profile.urn = li.getAttribute('data-chameleon-result-urn') || "";
            const link = li.querySelector('a[data-test-app-aware-link]');
            profile.profileUrl = link?.href || "";

            const img = li.querySelector('.presence-entity__image');
            if (img) {
                profile.profileImageUrl = img.src || "";
                const parts = (img.alt || "").split(/\s+/);
                profile.firstName = parts[0] || "";
                profile.lastName = parts.slice(1).join(" ") || "";
            }

            profile.fullName = li.querySelector('.entity-result__title span[aria-hidden="true"]')?.textContent.trim() || "";
            profile.connectionDegree = li.querySelector('.entity-result__badge-text span[aria-hidden="true"]')?.textContent.trim() || "";
            profile.jobTitle = li.querySelector('.t-14.t-black.t-normal')?.textContent.trim() || "";
            profile.location = li.querySelector('.t-14.t-normal:not(.t-black)')?.textContent.trim() || "";

            if (profile.connectionDegree.includes('1st') || li.querySelector('.entity-result__badge--premium')) {
                vipScraped++;
            }

            // Fetch contact info
            if (profile.profileUrl) {
                const contact = await fetchContactInfo(profile.profileUrl);
                profile.Email = contact.contactInfo.email || "";
                Object.assign(profile, contact);
                // Send profile data to background script
                chrome.runtime.sendMessage({
                    type: "PROFILE_SCRAPED",
                    payload: {
                        fullName: profile.fullName,
                        email: profile.Email,
                        dob: profile.contactInfo.dob || "",
                        phone: profile.contactInfo.phone || "",
                        profileUrl: profile.profileUrl,
                        jobTitle: profile.jobTitle,
                        location: profile.location,
                        connectionDegree: profile.connectionDegree
                    }
                });
            }

            profiles.push(profile);
            totalScraped++;
            progress.textContent = `Profiles scraped: ${totalScraped}`;
            vipProgress.textContent = `VIP profiles scraped: ${vipScraped}`;
        }
    }

    async function startScraping() {
        startBtn.style.display = "none";
        status.textContent = "Scraping in progress...";
        try {
            let page = 1;
            while (true) {
                status.textContent = `Scraping page ${page}...`;
                window.scrollTo(0, document.body.scrollHeight);
                await scrapeCurrentPage();
                await wait(2000);
                const nextBtn = document.querySelector('.artdeco-pagination__button--next:not([disabled])');
                if (nextBtn) {
                    nextBtn.click();
                    await wait(3000);
                    page++;
                } else {
                    break;
                }
            }
            // Send all profiles to background script
            chrome.runtime.sendMessage({
                type: "ALL_PROFILES_SCRAPED",
                payload: profiles.map(p => ({
                    fullName: p.fullName,
                    email: p.Email,
                    dob: p.contactInfo.dob || "",
                    phone: p.contactInfo.phone || "",
                    profileUrl: p.profileUrl,
                    jobTitle: p.jobTitle,
                    location: p.location,
                    connectionDegree: p.connectionDegree
                }))
            });
            downloadBtn.style.display = "inline-block";
            status.textContent = "Scraping complete. Download CSV to save data.";
            alert("Scraping complete. Click '⬇ Download CSV' to save data.");
        } catch (err) {
            console.error("Scraping error:", err);
            status.textContent = "Error occurred. Check console for details.";
            if (profiles.length) {
                // Send partial profiles on error
                chrome.runtime.sendMessage({
                    type: "ALL_PROFILES_SCRAPED",
                    payload: profiles.map(p => ({
                        fullName: p.fullName,
                        email: p.Email,
                        dob: p.contactInfo.dob || "",
                        phone: p.contactInfo.phone || "",
                        profileUrl: p.profileUrl,
                        jobTitle: p.jobTitle,
                        location: p.location,
                        connectionDegree: p.connectionDegree
                    }))
                });
                downloadBtn.style.display = "inline-block";
                alert("Scraping stopped due to error. Partial data available.");
            }
        }
    }

    startBtn.onclick = startScraping;
})();