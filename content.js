(function() {
  'use strict';

  const isProjectForm = () => {
    return window.location.href.includes('linkedin.com') &&
           (document.querySelector('input[id*="title"]') ||
            document.querySelector('textarea[id*="description"]'));
  };

  const formHelpers = {
    fillProjectTitle: (title) => {
      const selectors = [
        'input[id*="title"]',
        'input[id*="profileProject"]',
        'input[class*="artdeco-text-input--input"]'
      ];

      for (const selector of selectors) {
        const input = document.querySelector(selector);
        if (input && input.id.includes('title')) {
          input.value = title;
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
          return true;
        }
      }
      return false;
    },

    fillProjectDescription: (description) => {
      const selectors = [
        'textarea[id*="description"]',
        'textarea[id*="profileProject"]',
        'textarea[class*="artdeco-text-input__textarea"]'
      ];

      for (const selector of selectors) {
        const textarea = document.querySelector(selector);
        if (textarea && textarea.id.includes('description')) {
          textarea.value = description;
          textarea.dispatchEvent(new Event('input', { bubbles: true }));
          textarea.dispatchEvent(new Event('change', { bubbles: true }));
          return true;
        }
      }
      return false;
    },

    addSkill: async (skillName) => {
      return new Promise((resolve) => {
        try {
          const addButtons = [
            'button[data-test-typeahead-cta__button=""]',
            'button[class*="typeahead-cta__button"]',
            'button:contains("Yetenek ekle")',
            'button[aria-label*="Yetenek"]'
          ];

          let addButton = null;
          for (const selector of addButtons) {
            addButton = document.querySelector(selector);
            if (addButton) break;
          }

          if (!addButton) {
            resolve(false);
            return;
          }

          addButton.click();

          setTimeout(() => {
            const skillInputs = [
              'input[placeholder*="Yetenek"]',
              'input[aria-label*="Yetenek"]',
              'input[role="combobox"]',
              'div[data-test-typeahead-cta] input'
            ];

            let skillInput = null;
            for (const selector of skillInputs) {
              skillInput = document.querySelector(selector);
              if (skillInput) break;
            }

            if (skillInput) {
              skillInput.value = skillName;
              skillInput.dispatchEvent(new Event('input', { bubbles: true }));

              setTimeout(() => {
                skillInput.dispatchEvent(new KeyboardEvent('keydown', {
                  key: 'Enter',
                  bubbles: true,
                  cancelable: true
                }));

                setTimeout(() => {
                  const option = document.querySelector('div[role="option"]') ||
                                document.querySelector('li[role="option"]');
                  if (option) {
                    option.click();
                  }
                  resolve(true);
                }, 300);
              }, 300);
            } else {
              resolve(false);
            }
          }, 500);
        } catch (error) {
          resolve(false);
        }
      });
    }
  };

  if (typeof chrome !== 'undefined' && chrome.runtime) {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.action === 'fillProjectForm') {
        const { projectData } = message;

        if (isProjectForm()) {
          setTimeout(async () => {
            try {
              if (projectData.project_name) {
                formHelpers.fillProjectTitle(projectData.project_name);
              }

              if (projectData.description) {
                formHelpers.fillProjectDescription(projectData.description);
              }

              if (projectData.skills && Array.isArray(projectData.skills)) {
                for (const skill of projectData.skills.slice(0, 5)) {
                  await formHelpers.addSkill(skill);
                  await new Promise(resolve => setTimeout(resolve, 1000));
                }
              }

              sendResponse({ success: true });
            } catch (error) {
              sendResponse({ success: false, error: error.message });
            }
          }, 1000);

          return true;
        } else {
          sendResponse({ success: false, error: 'LinkedIn proje formu bulunamadı' });
        }
      }
    });
  }

  const initializePage = () => {
    if (isProjectForm()) {
      const indicator = document.createElement('div');
      indicator.innerHTML = '🚀 LinkedIn Project Filler Aktif';
      indicator.style.cssText = `
        position: fixed;
        top: 10px;
        right: 10px;
        background: linear-gradient(45deg, #4CAF50, #45a049);
        color: white;
        padding: 8px 12px;
        border-radius: 20px;
        font-size: 12px;
        font-weight: bold;
        z-index: 10000;
        box-shadow: 0 2px 10px rgba(0,0,0,0.3);
        animation: slideIn 0.5s ease-out;
      `;

      const style = document.createElement('style');
      style.textContent = `
        @keyframes slideIn {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
      `;
      document.head.appendChild(style);
      document.body.appendChild(indicator);

      setTimeout(() => {
        indicator.style.animation = 'slideIn 0.5s ease-out reverse';
        setTimeout(() => indicator.remove(), 500);
      }, 3000);
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializePage);
  } else {
    initializePage();
  }
})();