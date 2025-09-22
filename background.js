const ENV_CONFIG = {
  GEMINI_API_KEY_STORAGE_KEY: 'gemini_api_key',
  DEVELOPMENT: chrome.runtime.getManifest().name.includes('(Dev)'),
  PRODUCTION_DOMAIN: 'linkedin.com'
};

const getApiKey = async () => {
  try {
    const result = await chrome.storage.local.get(['gemini_api_key']);
    return result.gemini_api_key || null;
  } catch (error) {
    return null;
  }
};

let extensionEnabled = true;

chrome.runtime.onMessage.addListener(async (msg, sender, sendResponse) => {
  if (msg.action === "generateDescription") {
    const apiKey = await getApiKey();
    if (!apiKey) {
      chrome.runtime.sendMessage({ action: "descriptionGenerated", response: { error: "API key bulunamadı. Lütfen ayarlardan API key'inizi girin." } });
      return true;
    }
    const systemInstruction = "Sen bir LinkedIn Proje Açıklaması Uzmanı'sın. GitHub repo bilgilerini kullanarak, profesyonel ve LinkedIn standartlarına uygun proje açıklaması oluşturacaksın. KURALLAR: 1. SADECE JSON formatında çıktı ver. Başka hiçbir şey yazma. 2. JSON'da şu alanlar MUTLAKA olacak: - project_name: Projenin adı (orijinal repo adından daha açıklayıcı olabilir) - description: LinkedIn'de kullanılacak profesyonel açıklama (150-300 karakter arası) - skills: Projede kullanılan teknolojiler, diller ve yetenekler dizisi (max 5 adet, README ve açıklamadan en alakalı 2-3 tanesini ekle) - project_url: GitHub repo URL'i 3. Açıklama kuralları: - Professional ve iş odaklı dil kullan - Projenin iş değerini ve teknik özelliklerini vurgula - 2-3 cümle ile sınırla - Türkçe yaz 4. Skills kuralları: - En önemli 5 teknolojiyi seç - README ve açıklamadan en alakalı 2-3 teknolojiyi/dili/anahtar kelimeyi mutlaka ekle - Programlama dilleri, framework'ler, araçlar dahil - LinkedIn'de aranabilir terimler kullan ÖRNEK JSON ÇIKTISI: { \"project_name\": \"E-Ticaret Yönetim Sistemi\", \"description\": \"Çoklu mağaza desteğiyle envanter, sipariş ve müşteri yönetimini merkezi olarak sağlayan gelişmiş e-ticaret platformu. RESTful API, real-time bildirimler ve güvenli ödeme sistemi içerir.\", \"skills\": [\"PHP\", \"Laravel\", \"Vue.js\", \"MySQL\", \"API Development\"], \"project_url\": \"https://github.com/user/repo\" }";
    let readmeContent = '';
    try {
      if (msg.repo.full_name) {
        const storage = await chrome.storage.local.get(['github_token']);
        const headers = {
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'LinkedIn-Project-Filler-Extension'
        };
        if (storage.github_token) {
          headers['Authorization'] = `token ${storage.github_token}`;
        }
        const treeUrl = `https://api.github.com/repos/${msg.repo.full_name}/git/trees/${msg.repo.default_branch}?recursive=1`;
        const treeResp = await fetch(treeUrl, { headers });
        if (treeResp.ok) {
          const treeData = await treeResp.json();
          const readmeFiles = treeData.tree.filter(item =>
            item.path.match(/^README(\..*)?$/i) || item.path.match(/\/README(\..*)?$/i)
          );
          for (const file of readmeFiles) {
            const fileUrl = `https://raw.githubusercontent.com/${msg.repo.full_name}/${msg.repo.default_branch}/${file.path}`;
            const fileResp = await fetch(fileUrl);
            if (fileResp.ok) {
              const fileText = await fileResp.text();
              readmeContent += `\n\n--- ${file.path} ---\n\n` + fileText;
            }
          }
        }
        if (!readmeContent) {
          const readmeUrl = `https://api.github.com/repos/${msg.repo.full_name}/readme`;
          const readmeResponse = await fetch(readmeUrl, { headers });
          if (readmeResponse.ok) {
            const readmeData = await readmeResponse.json();
            readmeContent = decodeURIComponent(escape(atob(readmeData.content.replace(/\s/g, ''))));
          }
        }
      }
    } catch (error) {
    }
    const userPrompt = `Proje Bilgileri:\nRepo Adı: ${msg.repo.name}\nTam Adı: ${msg.repo.full_name}\nAçıklama: ${msg.repo.description || 'Açıklama yok'}\nAna Dil: ${msg.repo.language || 'Belirtilmemiş'}\nGitHub URL: ${msg.repo.html_url}\nYıldız Sayısı: ${msg.repo.stargazers_count || 0}\nFork Sayısı: ${msg.repo.forks_count || 0}${readmeContent ? `\nREADME İçeriği:\n${readmeContent}` : ''}\n\nYukarıdaki bilgileri kullanarak LinkedIn projesi için JSON formatında çıktı oluştur.`;
    try {
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
      const res = await fetch(
        endpoint,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: userPrompt }] }],
            system_instruction: { parts: [{ text: systemInstruction }] },
            generationConfig: { temperature: 0.7, maxOutputTokens: 256 }
          })
        }
      );
      if (!res.ok) {
        throw new Error(`API çağrısı başarısız: ${res.status}`);
      }
      const data = await res.json();
      let responseText = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
      let parsedResponse = null;
      try {
        responseText = responseText.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
        parsedResponse = JSON.parse(responseText);
      } catch (parseError) {
        chrome.runtime.sendMessage({ action: "descriptionGenerated", response: { success: false, error: 'AI yanıtı JSON formatında değil', fallback: { project_name: msg.repo.name || 'Proje adı yok', description: responseText || msg.repo.description || 'Proje açıklaması oluşturulamadı', skills: msg.repo.language ? [msg.repo.language] : ['Web Development'], project_url: msg.repo.html_url, readme: readmeContent } } });
        return true;
      }
      if (parsedResponse && parsedResponse.project_name && parsedResponse.description && parsedResponse.skills) {
        chrome.runtime.sendMessage({ action: "descriptionGenerated", response: { success: true, data: { ...parsedResponse, readme: readmeContent } } });
      } else {
        chrome.runtime.sendMessage({ action: "descriptionGenerated", response: { success: false, error: 'AI yanıtı eksik veya hatalı', fallback: { project_name: msg.repo.name || 'Proje adı yok', description: responseText || msg.repo.description || 'Proje açıklaması oluşturulamadı', skills: msg.repo.language ? [msg.repo.language] : ['Web Development'], project_url: msg.repo.html_url, readme: readmeContent } } });
      }
      return true;
    } catch (error) {
      chrome.runtime.sendMessage({ action: "descriptionGenerated", response: { success: false, error: error.message || 'AI açıklama oluşturulamadı', fallback: { project_name: msg.repo.name || 'Proje adı yok', description: msg.repo.description || 'Proje açıklaması oluşturulamadı', skills: msg.repo.language ? [msg.repo.language] : ['Web Development'], project_url: msg.repo.html_url, readme: readmeContent } } });
      return true;
    }
  }
  else if (msg.action === "fillLinkedIn") {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      chrome.scripting.executeScript({
        target: { tabId: tabs[0].id },
        func: (projectData) => {
          try {
            const titleInput = document.querySelector('input[id*="title"]') ||
                              document.querySelector('input[id*="single-line-text-form-component"]') ||
                              document.querySelector('input[class*="artdeco-text-input--input"]');
            if (titleInput) {
              titleInput.value = projectData.project_name || projectData.name;
              titleInput.dispatchEvent(new Event('input', { bubbles: true }));
              titleInput.dispatchEvent(new Event('change', { bubbles: true }));
            }
            const descInput = document.querySelector('textarea[id*="description"]') ||
                             document.querySelector('textarea[id*="multiline-text-form-component"]') ||
                             document.querySelector('textarea[class*="artdeco-text-input__textarea"]');
            if (descInput) {
              descInput.value = projectData.description;
              descInput.dispatchEvent(new Event('input', { bubbles: true }));
              descInput.dispatchEvent(new Event('change', { bubbles: true }));
            }
            const addSkills = async () => {
              if (!projectData.skills || !Array.isArray(projectData.skills)) return;
              for (const skill of projectData.skills.slice(0, 5)) {
                try {
                  const addSkillBtn = document.querySelector('button[id*="typeahead-cta"][id*="button"]') ||
                                     document.querySelector('button[data-test-typeahead-cta__button=""]') ||
                                     document.querySelector('button[class*="typeahead-cta__button"]') ||
                                     document.querySelector('button[aria-label*="Yetenek ekle"]');
                  if (addSkillBtn) {
                    addSkillBtn.click();
                    await new Promise(resolve => setTimeout(resolve, 500));
                    const skillInput = document.querySelector('input[placeholder*="Yetenek"]') ||
                                      document.querySelector('input[aria-label*="Yetenek"]') ||
                                      document.querySelector('input[id*="typeahead"]');
                    if (skillInput) {
                      skillInput.value = skill;
                      skillInput.dispatchEvent(new Event('input', { bubbles: true }));
                      skillInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
                      await new Promise(resolve => setTimeout(resolve, 300));
                      const firstOption = document.querySelector('div[role="option"]') ||
                                         document.querySelector('li[role="option"]') ||
                                         document.querySelector('.typeahead-option');
                      if (firstOption) {
                        firstOption.click();
                      }
                    }
                    await new Promise(resolve => setTimeout(resolve, 500));
                  }
                } catch (skillError) {
                }
              }
            };
            addSkills();
          } catch (error) {
          }
        },
        args: [msg.projectData]
      });
    });
    return true;
  }
});