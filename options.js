document.addEventListener('DOMContentLoaded', async () => {
  const apiKeyInput = document.getElementById('apiKey');
  const githubTokenInput = document.getElementById('githubToken');
  const saveButton = document.getElementById('saveButton');
  const clearButton = document.getElementById('clearButton');
  const backButton = document.getElementById('backButton');
  const statusDiv = document.getElementById('status');
  const toggleVisibility = document.getElementById('toggleVisibility');
  const toggleGithubVisibility = document.getElementById('toggleGithubVisibility');

  backButton.addEventListener('click', () => {
    chrome.action.openPopup().catch(() => {
      chrome.tabs.create({ url: 'chrome://extensions/' });
    });
  });

  try {
    const result = await chrome.storage.local.get(['gemini_api_key', 'github_token']);
    if (result.gemini_api_key) {
      apiKeyInput.value = result.gemini_api_key;
    }
    if (result.github_token) {
      githubTokenInput.value = result.github_token;
    }
    if (result.gemini_api_key || result.github_token) {
      showStatus('Ayarlar yüklendi', 'success');
    }
  } catch (error) {
    showStatus('Ayarlar yüklenemedi: ' + error.message, 'error');
  }

  saveButton.addEventListener('click', async () => {
    const apiKey = apiKeyInput.value.trim();
    const githubToken = githubTokenInput.value.trim();

    if (!apiKey) {
      showStatus('Lütfen geçerli bir Gemini API key girin', 'error');
      return;
    }

    if (!apiKey.startsWith('AIza') || apiKey.length < 35) {
      showStatus('Geçersiz Gemini API key formatı', 'error');
      return;
    }

    if (githubToken && (!githubToken.startsWith('ghp_') && !githubToken.startsWith('github_pat_'))) {
      showStatus('Geçersiz GitHub token formatı', 'error');
      return;
    }

    try {
      const dataToSave = { gemini_api_key: apiKey };
      if (githubToken) {
        dataToSave.github_token = githubToken;
      } else {
        await chrome.storage.local.remove(['github_token']);
      }

      await chrome.storage.local.set(dataToSave);
      showStatus('Ayarlar başarıyla kaydedildi', 'success');

      chrome.runtime.sendMessage({ action: 'enableExtension' });

      setTimeout(() => {
        if (document.referrer.includes('chrome-extension://')) {
          window.close();
        }
      }, 2000);

    } catch (error) {
      showStatus('Ayarlar kaydedilemedi: ' + error.message, 'error');
    }
  });

  clearButton.addEventListener('click', async () => {
    if (confirm('Tüm ayarları silmek istediğinizden emin misiniz?')) {
      try {
        await chrome.storage.local.remove(['gemini_api_key', 'github_token']);
        apiKeyInput.value = '';
        githubTokenInput.value = '';
        showStatus('Tüm ayarlar temizlendi', 'success');
      } catch (error) {
        showStatus('Ayarlar temizlenemedi: ' + error.message, 'error');
      }
    }
  });

  function showStatus(message, type) {
    statusDiv.textContent = message;
    statusDiv.className = `status ${type}`;

    setTimeout(() => {
      statusDiv.textContent = '';
      statusDiv.className = 'status';
    }, 3000);
  }

  toggleVisibility.addEventListener('click', () => {
    if (apiKeyInput.type === 'password') {
      apiKeyInput.type = 'text';
      toggleVisibility.textContent = '🙈';
    } else {
      apiKeyInput.type = 'password';
      toggleVisibility.textContent = '👁️';
    }
  });

  toggleGithubVisibility.addEventListener('click', () => {
    if (githubTokenInput.type === 'password') {
      githubTokenInput.type = 'text';
      toggleGithubVisibility.textContent = '🙈';
    } else {
      githubTokenInput.type = 'password';
      toggleGithubVisibility.textContent = '👁️';
    }
  });

  let devToolsWarningShown = false;
  const detectDevTools = () => {
    const threshold = 160;
    if ((window.outerHeight - window.innerHeight > threshold ||
         window.outerWidth - window.innerWidth > threshold) &&
        !devToolsWarningShown) {
      alert('⚠️ Güvenlik Uyarısı: Geliştirici araçları algılandı. API key\'inizi korumak için bu sayfayı kapatın.');
      devToolsWarningShown = true;
      apiKeyInput.value = '';
    }
  };

  setInterval(detectDevTools, 1000);
});