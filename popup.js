const repoUrlInput = document.getElementById("repoUrl");
const fetchBtn = document.getElementById("fetchBtn");
const genDescBtn = document.getElementById("genDescBtn");
const fillBtn = document.getElementById("fillBtn");
const repoCard = document.getElementById("repoCard");
const statusMessage = document.getElementById("statusMessage");
const optionsBtn = document.getElementById("optionsBtn");
const apiStatus = document.getElementById("apiStatus");
const apiStatusText = document.getElementById("apiStatusText");

let currentRepo = null;
let generatedProjectData = null;
let apiKeyAvailable = false;

async function checkApiKeyStatus() {
  try {
    apiStatus.className = 'api-status loading';
    apiStatusText.textContent = '🔄 API durumu kontrol ediliyor...';

    const result = await chrome.storage.local.get(['gemini_api_key', 'github_token']);

    if (result.gemini_api_key && result.gemini_api_key.length > 30) {
      apiKeyAvailable = true;
      const githubStatus = result.github_token ? ' + GitHub Token' : '';
      apiStatus.className = 'api-status connected';
      apiStatusText.textContent = `✅ Gemini API bağlı${githubStatus}`;
    } else {
      apiKeyAvailable = false;
      apiStatus.className = 'api-status disconnected';
      apiStatusText.innerHTML = '❌ API key gerekli <span style="font-size: 11px; opacity: 0.8;">(Ayarlara tıklayın)</span>';
      genDescBtn.disabled = true;
    }
  } catch (error) {
    apiKeyAvailable = false;
    apiStatus.className = 'api-status disconnected';
    apiStatusText.textContent = '❌ API durumu kontrol edilemedi';
  }
}

optionsBtn.addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
});

function showStatus(message, type = 'success') {
  statusMessage.textContent = message;
  statusMessage.className = `status-message status-${type}`;
  statusMessage.classList.remove('hidden');

  setTimeout(() => {
    statusMessage.classList.add('hidden');
  }, 3000);
}

fetchBtn.addEventListener("click", async () => {
  const repoUrl = repoUrlInput.value.trim();
  if (!repoUrl) {
    showStatus("Repository URL'i girin!", 'error');
    return;
  }

  try {
    fetchBtn.disabled = true;
    fetchBtn.textContent = "Yükleniyor...";

    let repoName;
    if (repoUrl.includes('github.com/')) {
      repoName = repoUrl.split("github.com/")[1].replace('.git', '').replace(/\/$/, '');
    } else {
      repoName = repoUrl;
    }

    if (!repoName.includes('/') || repoName.split('/').length !== 2) {
      throw new Error('Geçersiz GitHub URL. Format: github.com/kullanici/repo');
    }

    showStatus('🔍 Repository bilgileri alınıyor...', 'info');

    const storage = await chrome.storage.local.get(['github_token']);
    const headers = {
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'LinkedIn-Project-Filler-Extension'
    };

    if (storage.github_token) {
      headers['Authorization'] = `token ${storage.github_token}`;
    }

    const resp = await fetch(`https://api.github.com/repos/${repoName}`, { headers });

    if (!resp.ok) {
      if (resp.status === 403) {
        const resetTime = resp.headers.get('X-RateLimit-Reset');
        const remaining = resp.headers.get('X-RateLimit-Remaining');

        if (remaining === '0' && resetTime) {
          const resetDate = new Date(parseInt(resetTime) * 1000);
          const waitMinutes = Math.ceil((resetDate - new Date()) / 60000);
          throw new Error(`GitHub API limiti. ${waitMinutes} dakika sonra tekrar deneyin.`);
        } else {
          throw new Error('GitHub API erişim engellendi. Personal Access Token eklemeyi deneyin.');
        }
      } else if (resp.status === 404) {
        throw new Error('Repository bulunamadı. URL doğru mu kontrol edin.');
      } else {
        throw new Error(`GitHub API hatası: ${resp.status} - ${resp.statusText}`);
      }
    }

    const data = await resp.json();
    currentRepo = data;

    document.getElementById("repoName").textContent = data.name;
    document.getElementById("repoDesc").textContent = data.description || "Açıklama bulunmuyor";
    document.getElementById("repoLang").textContent = `💻 ${data.language || "Belirsiz"}`;
    document.getElementById("repoStars").textContent = `⭐ ${data.stargazers_count || 0}`;

    repoCard.classList.remove("hidden");

    try {
      const storage = await chrome.storage.local.get(['github_token']);
      const headers = {
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'LinkedIn-Project-Filler-Extension'
      };
      if (storage.github_token) {
        headers['Authorization'] = `token ${storage.github_token}`;
      }
      const readmeResp = await fetch(`https://api.github.com/repos/${repoName}/readme`, { headers });
      if (readmeResp.ok) {
        const readmeData = await readmeResp.json();
        const readmeContent = decodeURIComponent(escape(atob(readmeData.content.replace(/\s/g, ''))));
        const readmeDiv = document.getElementById("repoReadme");
        readmeDiv.innerHTML = `
          <details>
            <summary>📄 README İçeriği</summary>
            <pre>${readmeContent}</pre>
          </details>
        `;
        readmeDiv.classList.remove("hidden");
      }
    } catch (readmeError) {
    }

    if (apiKeyAvailable) {
      genDescBtn.disabled = false;
    } else {
      genDescBtn.disabled = true;
      showStatus("⚠️ AI açıklama için API key gerekli (Ayarlara tıklayın)", 'error');
    }

    showStatus(`✅ ${data.name} repository başarıyla yüklendi!`);

  } catch (error) {
    showStatus(`❌ Hata: ${error.message}`, 'error');
  } finally {
    fetchBtn.disabled = false;
    fetchBtn.textContent = "📥 Repo Getir";
  }
});

genDescBtn.addEventListener("click", async () => {
  if (!currentRepo) {
    showStatus("Önce bir repository yükleyin!", 'error');
    return;
  }

  if (!apiKeyAvailable) {
    showStatus("API key gerekli! Ayarlardan API key'inizi girin.", 'error');
    optionsBtn.click();
    return;
  }

  genDescBtn.disabled = true;
  genDescBtn.textContent = "AI çalışıyor...";
  showStatus("🤖 AI açıklama oluşturuluyor... Lütfen popup'u kapatmayın!", 'info');
  chrome.runtime.sendMessage({ action: "generateDescription", repo: currentRepo });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "descriptionGenerated") {
    const response = message.response;
    let safeProjectData = response.data || {};
    if (!safeProjectData.project_name) safeProjectData.project_name = currentRepo?.name || 'Proje adı yok';
    if (!safeProjectData.description) safeProjectData.description = currentRepo?.description || 'Açıklama yok';
    if (!safeProjectData.skills || !Array.isArray(safeProjectData.skills)) safeProjectData.skills = [currentRepo?.language || 'Web Development'];
    if (!safeProjectData.project_url) safeProjectData.project_url = currentRepo?.html_url || '';
    generatedProjectData = safeProjectData;
    const resultDiv = document.getElementById("genResult");
    resultDiv.innerHTML = `
      <div class="project-preview">
        <h4>${response.success ? '🎯' : '⚠️'} ${safeProjectData.project_name}</h4>
        <p><strong>Açıklama:</strong> ${safeProjectData.description}</p>
        <p><strong>Yetenekler:</strong> ${safeProjectData.skills.join(', ')}</p>
        <div style="margin-top: 8px; font-size: 11px; opacity: 0.8;">
          <strong>URL:</strong> <a href="${safeProjectData.project_url}" target="_blank">${safeProjectData.project_url}</a>
        </div>
      </div>
    `;
    resultDiv.classList.remove("hidden");
    fillBtn.disabled = false;
    showStatus(response.success ? "🎉 AI açıklama başarıyla oluşturuldu!" : `⚠️ ${response.error || "Basit açıklama oluşturuldu"}`, response.success ? 'success' : 'error');
    genDescBtn.disabled = false;
    genDescBtn.textContent = "✨ AI Oluştur";
  }
});

fillBtn.addEventListener("click", () => {
  if (!generatedProjectData) {
    showStatus("Önce AI açıklama oluşturun!", 'error');
    return;
  }

  try {
    fillBtn.disabled = true;
    fillBtn.textContent = "Doldruluyor...";
    chrome.runtime.sendMessage({
      action: "fillLinkedIn",
      projectData: generatedProjectData
    }, (response) => {
      if (chrome.runtime.lastError) {
        showStatus(`❌ ${chrome.runtime.lastError.message}`, 'error');
      } else {
        showStatus("✅ LinkedIn formu dolduruldu! Sekmeyi kontrol edin.");
      }
      fillBtn.disabled = false;
      fillBtn.textContent = "LinkedIn'e Doldur";
    });
  } catch (error) {
    showStatus(`❌ Form doldurma hatası: ${error.message}`, 'error');
    fillBtn.disabled = false;
    fillBtn.textContent = "LinkedIn'e Doldur";
  }
});

checkApiKeyStatus();
