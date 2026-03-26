// TL;DR this PR - Settings Popup Script

const providerSelect = document.getElementById('provider');
const apiKeyInput = document.getElementById('apiKey');
const apiKeyHelp = document.getElementById('apiKeyHelp');
const modelSelect = document.getElementById('model');
const saveBtn = document.getElementById('saveBtn');
const status = document.getElementById('status');

// Load saved settings on popup open
chrome.storage.sync.get(['apiKey', 'model', 'provider'], (result) => {
  const provider = result.provider || 'openai';

  providerSelect.value = provider;
  updateProviderUI(provider);

  if (result.apiKey) {
    apiKeyInput.value = result.apiKey;
  }
  if (result.model) {
    modelSelect.value = result.model;
  } else {
    // Set default model based on provider
    modelSelect.value = provider === 'openai' ? 'gpt-4o-mini' : 'deepseek/deepseek-chat';
  }
});

// Update UI when provider changes
providerSelect.addEventListener('change', (e) => {
  const provider = e.target.value;
  updateProviderUI(provider);

  // Update default model
  if (provider === 'openai') {
    modelSelect.value = 'gpt-4o-mini';
  } else {
    modelSelect.value = 'deepseek/deepseek-chat';
  }
});

function updateProviderUI(provider) {
  // Clear existing content
  apiKeyHelp.textContent = '';

  if (provider === 'openai') {
    apiKeyHelp.textContent = 'Get your API key at ';
    const link = document.createElement('a');
    link.href = 'https://platform.openai.com/api-keys';
    link.target = '_blank';
    link.textContent = 'platform.openai.com/api-keys';
    apiKeyHelp.appendChild(link);
    apiKeyInput.placeholder = 'sk-proj-...';

    // Show only OpenAI models
    document.getElementById('openaiModels').style.display = '';
    document.getElementById('openrouterModels').style.display = 'none';
  } else {
    apiKeyHelp.textContent = 'Get your free API key at ';
    const link = document.createElement('a');
    link.href = 'https://openrouter.ai/keys';
    link.target = '_blank';
    link.textContent = 'openrouter.ai/keys';
    apiKeyHelp.appendChild(link);
    apiKeyInput.placeholder = 'sk-or-v1-...';

    // Show only OpenRouter models
    document.getElementById('openaiModels').style.display = 'none';
    document.getElementById('openrouterModels').style.display = '';
  }
}

// Save settings
saveBtn.addEventListener('click', () => {
  const provider = providerSelect.value;
  const apiKey = apiKeyInput.value.trim();
  const model = modelSelect.value;

  if (!apiKey) {
    showStatus('Please enter an API key', 'error');
    return;
  }

  if (!apiKey.startsWith('sk-')) {
    showStatus('Invalid API key format (should start with sk-)', 'error');
    return;
  }

  chrome.storage.sync.set({ provider, apiKey, model }, () => {
    showStatus('Settings saved successfully!', 'success');
    setTimeout(() => {
      status.style.display = 'none';
    }, 2000);
  });
});

function showStatus(message, type) {
  status.textContent = message;
  status.className = `status ${type}`;
}

// Clear cache button
const clearCacheBtn = document.getElementById('clearCacheBtn');
clearCacheBtn.addEventListener('click', () => {
  // Get all localStorage keys that start with 'tldr_'
  const keys = Object.keys(localStorage);
  const tldrKeys = keys.filter(key => key.startsWith('tldr_'));

  if (tldrKeys.length === 0) {
    showStatus('No cached summaries found', 'success');
    return;
  }

  // Remove all cached summaries
  tldrKeys.forEach(key => localStorage.removeItem(key));

  showStatus(`Cleared ${tldrKeys.length} cached summaries!`, 'success');
  setTimeout(() => {
    status.style.display = 'none';
  }, 2000);
});
