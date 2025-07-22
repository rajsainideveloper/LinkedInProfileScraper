chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === "PROFILE_SCRAPED") {
      console.log("🔹 Scraped profile:", message.payload.fullName || "No name");
    }
  
    if (message.type === "new_one_profile_scraped") {
        console.log("🔹 Scraped profile:", message.payload || "No name");
    }

    if (message.type === "new_one_profile_scraped_mew") {
        console.log("new_one_profile_scraped_mew", message.payload || "No name");
    }
    

    if (message.type === "ALL_PROFILES_SCRAPED") {
      console.log(`✅ All profiles scraped. Total: ${message.payload.length}`);
      console.table(message.payload);
    }
  });
  