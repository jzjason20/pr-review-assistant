// TL;DR this PR - Content Script
// Handles GitHub's SPA navigation and injects PR analysis UI

let currentUrl = location.href;
let injectedButton = null;
let analysisPanel = null;

// Initialize on load and URL changes
function init() {
  console.log('[TL;DR PR] Initializing on:', location.href);

  if (isPullRequestPage() || isIssuePage()) {
    injectUI();
  } else if (isPullRequestListPage()) {
    injectListButtons();
  } else {
    cleanupUI();
  }
}

// Detect if we're on the PR list page
function isPullRequestListPage() {
  const url = location.pathname;
  return url.match(/^\/[\w-]+\/[\w-]+\/pulls\/?$/);
}

// Detect if we're on a PR page (open PRs only)
function isPullRequestPage() {
  const url = location.pathname;
  const isPR = url.match(/^\/[\w-]+\/[\w-]+\/pull\/\d+/);

  if (!isPR) return false;

  // Check if PR is open (not merged/closed)
  const statusBadge = document.querySelector('.State');
  if (!statusBadge) return true; // Default to true if we can't find status yet

  const isOpen = statusBadge.textContent.trim().toLowerCase() === 'open';
  return isOpen;
}

// Detect if we're on an issue page (open issues only)
function isIssuePage() {
  const url = location.pathname;
  const isIssue = url.match(/^\/[\w-]+\/[\w-]+\/issues\/\d+/);

  if (!isIssue) return false;

  // Check if issue is open
  const statusBadge = document.querySelector('.State');
  if (!statusBadge) return true;

  const isOpen = statusBadge.textContent.trim().toLowerCase() === 'open';
  return isOpen;
}

// Inject the "Summarize" button and results panel
function injectUI() {
  // Avoid double injection
  if (injectedButton) return;

  // Try multiple possible selectors for GitHub's evolving UI
  const possibleSelectors = [
    '.gh-header-actions',
    '[data-target="react-app.embeddedData"] .ButtonGroup',
    '.gh-header-meta .flex-items-center',
    '.gh-header .d-flex',
    'div[data-hpc] .d-flex.flex-items-center.flex-wrap.gap-2'
  ];

  let header = null;
  for (const selector of possibleSelectors) {
    header = document.querySelector(selector);
    if (header) {
      console.log('[TL;DR PR] Found header with selector:', selector);
      break;
    }
  }

  // Fallback: look for any element near the PR title that could host our button
  if (!header) {
    // Try to find the area with "Merge conflicts" or "Code" buttons
    const prHeader = document.querySelector('.gh-header');
    if (prHeader) {
      // Create our own container
      const existingContainer = prHeader.querySelector('#tldr-pr-container');
      if (!existingContainer) {
        const container = document.createElement('div');
        container.id = 'tldr-pr-container';
        container.style.cssText = 'margin-top: 16px; display: flex; gap: 8px;';

        // Insert after PR title
        const prTitle = prHeader.querySelector('.gh-header-title');
        if (prTitle) {
          prTitle.after(container);
          header = container;
          console.log('[TL;DR PR] Created custom container');
        }
      } else {
        header = existingContainer;
      }
    }
  }

  if (!header) {
    console.log('[TL;DR PR] Header not found, retrying...');
    setTimeout(injectUI, 500);
    return;
  }

  // Create summarize button
  injectedButton = document.createElement('button');
  injectedButton.id = 'tldr-pr-button';
  injectedButton.className = 'btn btn-sm';
  injectedButton.textContent = '✨ TL;DR this PR';
  injectedButton.onclick = handleSummarize;

  header.insertBefore(injectedButton, header.firstChild);
  console.log('[TL;DR PR] UI injected');
}

// Inject buttons on PR list page
function injectListButtons() {
  console.log('[TL;DR PR] Injecting list buttons');

  // Find all PR rows - try multiple possible selectors
  const prRows = document.querySelectorAll('[id^="issue_"], .js-issue-row');

  prRows.forEach(row => {
    // Skip if already injected
    if (row.querySelector('.tldr-list-btn')) return;

    // Get PR number from the row
    const prLink = row.querySelector('a[href*="/pull/"]');
    if (!prLink) return;

    const prUrl = prLink.getAttribute('href');
    if (!prUrl || !prUrl.includes('/pull/')) return;

    // Find the comment icon (speech bubble SVG) - it's always on the right
    const commentIcon = row.querySelector('svg.octicon-comment-discussion, svg.octicon-comment');

    if (commentIcon) {
      // Get the parent link/container
      const commentLink = commentIcon.closest('a');

      if (commentLink) {
        // Create small TL;DR button
        const btn = document.createElement('button');
        btn.className = 'tldr-list-btn';
        btn.textContent = '✨';
        btn.title = 'TL;DR this PR';
        btn.setAttribute('data-pr-url', prUrl);
        btn.onclick = (e) => {
          e.preventDefault();
          e.stopPropagation();
          handleListSummarize(prUrl, btn);
        };

        // Insert button right before the comment link
        commentLink.parentElement.insertBefore(btn, commentLink);
        console.log('[TL;DR PR] Button injected for', prUrl);
      }
    } else {
      console.log('[TL;DR PR] Comment icon not found for', prUrl);
    }
  });
}

// Handle summarize from list page
async function handleListSummarize(prUrl, button) {
  console.log('[TL;DR PR] Summarizing from list:', prUrl);

  // Check cache first
  const cacheKey = `tldr_${prUrl}`;
  const cached = localStorage.getItem(cacheKey);

  if (cached) {
    console.log('[TL;DR PR] Using cached summary');
    showCompactModal(JSON.parse(cached), prUrl);
    return;
  }

  // Show loading
  button.disabled = true;
  button.textContent = '⏳';

  try {
    // Fetch PR data from API
    const prData = await fetchPRDataFromAPI(prUrl);

    // Analyze
    const analysis = await analyzePR(prData);

    // Cache
    localStorage.setItem(cacheKey, JSON.stringify(analysis));

    // Show modal
    showCompactModal(analysis, prUrl);

  } catch (error) {
    console.error('[TL;DR PR] Error:', error);
    showError(error.message);
  } finally {
    button.disabled = false;
    button.textContent = '✨';
  }
}

// Fetch PR data using GitHub API
async function fetchPRDataFromAPI(prUrl) {
  console.log('[TL;DR PR] Fetching PR data from API:', prUrl);

  // Parse URL: /owner/repo/pull/number
  const pathParts = prUrl.split('/');
  const owner = pathParts[1];
  const repo = pathParts[2];
  const prNumber = pathParts[4];

  // Fetch PR data
  const apiUrl = `https://api.github.com/repos/${owner}/${repo}/pulls/${prNumber}`;
  const response = await fetch(apiUrl);

  if (!response.ok) {
    throw new Error(`Failed to fetch PR data: ${response.status}`);
  }

  const prInfo = await response.json();

  // Fetch diff
  const diffResponse = await fetch(apiUrl, {
    headers: {
      'Accept': 'application/vnd.github.v3.diff'
    }
  });

  const diff = diffResponse.ok ? await diffResponse.text() : 'Diff not available';

  // Extract file changes from diff
  const fileChanges = extractFilesFromDiff(diff);

  // Get commits
  const commitsResponse = await fetch(`${apiUrl}/commits`);
  const commits = commitsResponse.ok ? await commitsResponse.json() : [];
  const commitMessages = commits.map(c => c.commit.message);

  return {
    title: prInfo.title,
    description: prInfo.body || '',
    commitMessages,
    fileChanges,
    diff,
    url: `https://github.com${prUrl}`
  };
}

// Show compact modal for list view
function showCompactModal(analysis, prUrl) {
  // Remove existing modal
  const existing = document.querySelector('.tldr-modal');
  if (existing) existing.remove();

  // Create modal overlay
  const modal = document.createElement('div');
  modal.className = 'tldr-modal';

  const modalContent = document.createElement('div');
  modalContent.className = 'tldr-modal-content';

  // Header
  const header = document.createElement('div');
  header.className = 'tldr-header';

  const title = document.createElement('h3');
  title.textContent = 'TL;DR this PR';
  header.appendChild(title);

  const closeBtn = document.createElement('button');
  closeBtn.className = 'tldr-close';
  closeBtn.textContent = '×';
  closeBtn.onclick = () => modal.remove();
  header.appendChild(closeBtn);

  // Content
  const content = document.createElement('div');
  content.className = 'tldr-content';

  // Summary
  const summarySection = document.createElement('div');
  summarySection.className = 'tldr-section';
  const summaryTitle = document.createElement('strong');
  summaryTitle.textContent = 'Summary:';
  summarySection.appendChild(summaryTitle);
  const summaryList = document.createElement('ul');
  analysis.summary.forEach(item => {
    const li = document.createElement('li');
    li.textContent = item;
    summaryList.appendChild(li);
  });
  summarySection.appendChild(summaryList);

  // Size & Risk
  const sizeEmoji = {
    'trivial': '🟢',
    'medium': '🟡',
    'large': '🔴',
    'nuke-it': '💀'
  }[analysis.size] || '⚪';

  const riskEmoji = {
    'low': '🟢',
    'medium': '🟡',
    'high': '🔴'
  }[analysis.risk] || '⚪';

  const metaSection = document.createElement('div');
  metaSection.className = 'tldr-section tldr-meta';

  const sizeLabel = document.createElement('strong');
  sizeLabel.textContent = 'Size: ';
  metaSection.appendChild(sizeLabel);
  metaSection.appendChild(document.createTextNode(`${analysis.size} ${sizeEmoji} (${analysis.loc} LoC)   |   `));

  const riskLabel = document.createElement('strong');
  riskLabel.textContent = 'Risk: ';
  metaSection.appendChild(riskLabel);
  metaSection.appendChild(document.createTextNode(`${analysis.risk} ${riskEmoji}`));

  // Concerns
  if (analysis.concerns && analysis.concerns.length > 0) {
    const concernsSection = document.createElement('div');
    concernsSection.className = 'tldr-section tldr-concerns';
    const concernsTitle = document.createElement('strong');
    concernsTitle.textContent = '⚠️ Concerns:';
    concernsSection.appendChild(concernsTitle);
    const concernsList = document.createElement('ul');
    analysis.concerns.forEach(concern => {
      const li = document.createElement('li');
      li.textContent = concern;
      concernsList.appendChild(li);
    });
    concernsSection.appendChild(concernsList);
    content.appendChild(concernsSection);
  }

  // AI crap detection
  if (analysis.aiCrapDetection && analysis.aiCrapDetection.detected) {
    const aiSection = document.createElement('div');
    aiSection.className = 'tldr-section tldr-ai-warning';
    const aiTitle = document.createElement('strong');
    aiTitle.textContent = '🤖 AI-Generated Code Detected:';
    aiSection.appendChild(aiTitle);
    const aiList = document.createElement('ul');
    analysis.aiCrapDetection.reasons.forEach(reason => {
      const li = document.createElement('li');
      li.textContent = reason;
      aiList.appendChild(li);
    });
    aiSection.appendChild(aiList);
    content.appendChild(aiSection);
  }

  // View full PR link
  const viewLink = document.createElement('a');
  viewLink.href = prUrl;
  viewLink.className = 'tldr-view-link';
  viewLink.textContent = '→ View full PR';

  content.appendChild(summarySection);
  content.appendChild(metaSection);
  content.appendChild(viewLink);

  modalContent.appendChild(header);
  modalContent.appendChild(content);
  modal.appendChild(modalContent);

  // Add to page
  document.body.appendChild(modal);

  // Close on overlay click
  modal.onclick = (e) => {
    if (e.target === modal) modal.remove();
  };
}

// Clean up injected UI when navigating away
function cleanupUI() {
  if (injectedButton) {
    injectedButton.remove();
    injectedButton = null;
  }

  if (analysisPanel) {
    analysisPanel.remove();
    analysisPanel = null;
  }

  // Clean up custom container if it exists and is empty
  const customContainer = document.querySelector('#tldr-pr-container');
  if (customContainer && customContainer.children.length === 0) {
    customContainer.remove();
  }

  // Clean up list buttons
  document.querySelectorAll('.tldr-list-btn').forEach(btn => btn.remove());

  // Clean up modal
  const modal = document.querySelector('.tldr-modal');
  if (modal) modal.remove();
}

// Handle summarize button click
async function handleSummarize(forceRefresh = false) {
  console.log('[TL;DR PR] Summarize clicked, forceRefresh:', forceRefresh);

  // Check if we already have a cached summary
  const cacheKey = `tldr_${location.pathname}`;
  const cached = localStorage.getItem(cacheKey);

  if (cached && !forceRefresh) {
    console.log('[TL;DR PR] Using cached summary');
    displayAnalysis(JSON.parse(cached));
    return;
  }

  if (forceRefresh) {
    console.log('[TL;DR PR] Bypassing cache, re-analyzing...');
  }

  // Show loading state
  injectedButton.disabled = true;
  injectedButton.textContent = '⏳ Analyzing...';

  try {
    // Extract PR data
    const prData = await extractPRData();

    // Call LLM for analysis
    const analysis = await analyzePR(prData);

    // Cache the result
    localStorage.setItem(cacheKey, JSON.stringify(analysis));

    // Display results
    displayAnalysis(analysis);

  } catch (error) {
    console.error('[TL;DR PR] Error:', error);
    showError(error.message);
  } finally {
    injectedButton.disabled = false;
    injectedButton.textContent = '✨ TL;DR this PR';
  }
}

// Extract PR data from the page
async function extractPRData() {
  console.log('[TL;DR PR] Extracting PR data...');

  const title = document.querySelector('.js-issue-title')?.textContent.trim() || 'No title';
  const description = document.querySelector('.comment-body')?.textContent.trim() || '';

  // Get commit messages
  const commitMessages = Array.from(document.querySelectorAll('.commit-message'))
    .map(el => el.textContent.trim())
    .filter(msg => msg.length > 0);

  // Get diff first (most reliable)
  const diff = await getDiff();

  // Get file changes from DOM or parse from diff
  let fileChanges = await getFileChanges();

  // If no files found in DOM, extract from diff
  if (fileChanges.length === 0 && diff !== 'Diff not available') {
    fileChanges = extractFilesFromDiff(diff);
    console.log('[TL;DR PR] Extracted', fileChanges.length, 'files from diff');
  }

  return {
    title,
    description,
    commitMessages,
    fileChanges,
    diff,
    url: location.href
  };
}

// Extract file paths from diff text
function extractFilesFromDiff(diff) {
  const files = [];
  const lines = diff.split('\n');

  for (const line of lines) {
    // Look for diff headers: "diff --git a/path/to/file b/path/to/file"
    if (line.startsWith('diff --git')) {
      const match = line.match(/diff --git a\/(.*?) b\//);
      if (match && match[1]) {
        files.push(match[1]);
      }
    }
  }

  return files;
}

// Get list of changed files with stats
async function getFileChanges() {
  const files = [];

  // Try multiple selectors for file names
  const selectors = [
    '.file-info .Link--primary',
    '[data-target="react-app.embeddedData"] a[title*="/"]',
    '.file-header [data-path]'
  ];

  for (const selector of selectors) {
    const fileElements = document.querySelectorAll(selector);
    fileElements.forEach(el => {
      const path = el.textContent?.trim() || el.getAttribute('data-path') || el.getAttribute('title');
      if (path && !files.includes(path)) {
        files.push(path);
      }
    });

    if (files.length > 0) break;
  }

  // If still no files, try getting from the API response we'll fetch
  if (files.length === 0) {
    console.log('[TL;DR PR] No files found in DOM, will extract from diff');
  }

  return files;
}

// Get the full diff
async function getDiff() {
  // Method 1: Use GitHub's API to get diff (no CORS issues)
  console.log('[TL;DR PR] Fetching diff from GitHub API');
  try {
    // Parse PR URL: /owner/repo/pull/number
    const pathParts = location.pathname.split('/');
    const owner = pathParts[1];
    const repo = pathParts[2];
    const prNumber = pathParts[4];

    // GitHub API endpoint for PR diff
    const apiUrl = `https://api.github.com/repos/${owner}/${repo}/pulls/${prNumber}`;

    const response = await fetch(apiUrl, {
      headers: {
        'Accept': 'application/vnd.github.v3.diff'
      }
    });

    if (response.ok) {
      const diffText = await response.text();
      console.log('[TL;DR PR] Got diff from GitHub API');
      return diffText;
    } else {
      console.error('[TL;DR PR] API request failed:', response.status);
    }
  } catch (error) {
    console.error('[TL;DR PR] Failed to fetch diff from API:', error);
  }

  // Method 2: Try to scrape from DOM as fallback
  console.log('[TL;DR PR] Trying DOM extraction as fallback');

  // Try to get the actual diff content from various possible DOM structures
  let fullDiff = '';

  // Method 2a: Look for individual blob-code lines (new GitHub UI)
  const codeLines = document.querySelectorAll('.blob-code-addition, .blob-code-deletion, .blob-code-context');
  codeLines.forEach(el => {
    const line = el.textContent || '';
    const type = el.classList.contains('blob-code-addition') ? '+' :
                 el.classList.contains('blob-code-deletion') ? '-' : ' ';
    fullDiff += type + line + '\n';
  });

  // Method 2b: Look for split diff view
  if (!fullDiff.trim()) {
    const splitDiff = document.querySelectorAll('[data-hunk]');
    splitDiff.forEach(hunk => {
      fullDiff += hunk.textContent + '\n';
    });
  }

  // Method 2c: Try getting raw text from file-diff containers
  if (!fullDiff.trim()) {
    const fileDiffs = document.querySelectorAll('.js-file-content');
    fileDiffs.forEach(container => {
      const text = container.textContent || '';
      // Only include if it looks like diff content
      if (text.includes('@@') || text.includes('diff --git')) {
        fullDiff += text + '\n';
      }
    });
  }

  if (fullDiff.trim()) {
    console.log('[TL;DR PR] Got diff from DOM (', fullDiff.length, 'chars)');
    return fullDiff;
  }

  console.warn('[TL;DR PR] Could not extract diff - GitHub API rate limited and no DOM content found');
  return 'Diff not available - GitHub API rate limited. Try viewing the Files changed tab first, then click TL;DR again.';
}

// Call LLM API for analysis (OpenRouter or OpenAI)
async function analyzePR(prData) {
  // Get API key and settings from storage
  const result = await chrome.storage.sync.get(['apiKey', 'model', 'provider']);
  const apiKey = result.apiKey;
  const provider = result.provider || 'openrouter';
  const model = result.model || (provider === 'openai' ? 'gpt-4o-mini' : 'deepseek/deepseek-chat');

  if (!apiKey) {
    throw new Error('Please set your API key in the extension settings');
  }

  // Build prompt
  const prompt = buildAnalysisPrompt(prData);

  // Determine API endpoint and headers based on provider
  let apiUrl, headers, requestBody;

  if (provider === 'openai') {
    apiUrl = 'https://api.openai.com/v1/chat/completions';
    headers = {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    };
    requestBody = {
      model: model,
      messages: [
        {
          role: 'system',
          content: 'You are a code review assistant. Analyze PRs and provide structured JSON responses with explainability.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      response_format: { type: 'json_object' },
      max_tokens: 2000  // Reasonable limit for PR summaries
    };
  } else {
    // OpenRouter
    apiUrl = 'https://openrouter.ai/api/v1/chat/completions';
    headers = {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://github.com',
      'X-Title': 'TL;DR this PR'
    };
    requestBody = {
      model: model,
      messages: [
        {
          role: 'system',
          content: 'You are a code review assistant. Analyze PRs and provide structured JSON responses with explainability.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      response_format: { type: 'json_object' },
      max_tokens: 2000
    };
  }

  // Call API
  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: headers,
    body: JSON.stringify(requestBody)
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`${provider} API error: ${error}`);
  }

  const data = await response.json();
  const content = data.choices[0].message.content;

  return JSON.parse(content);
}

// Build the analysis prompt
function buildAnalysisPrompt(prData) {
  const loc = estimateLoC(prData.diff);

  return `Analyze this GitHub Pull Request and return a JSON object with the following structure:

{
  "summary": ["bullet point 1", "bullet point 2", "bullet point 3"],
  "size": "trivial|medium|large|nuke-it",
  "sizeReason": "explanation with numbers",
  "loc": ${loc},
  "risk": "low|medium|high",
  "riskReason": "explanation",
  "evidence": "specific quote from code or commit",
  "concerns": ["concern 1", "concern 2"],
  "fileCategories": [
    {"category": "auth/", "count": 3, "purpose": "Login flow changes"},
    {"category": "db/", "count": 1, "purpose": "Schema migration"}
  ],
  "aiCrapDetection": {
    "detected": true|false,
    "reasons": ["reason 1", "reason 2"]
  }
}

AI Crap Detection Rules:
1. Generic variable names (foo, temp, data, result used excessively)
2. Over-descriptive names like "handleUserAuthenticationProcessAndValidation"
3. Meaningless commit messages ("fix", "update") on large PRs (>200 LoC)
4. Over-commented code or comments that just restate the code
5. Suspicious uniformity in code style (no human quirks)

PR Data:
Title: ${prData.title}
Description: ${prData.description}
Commit Messages: ${prData.commitMessages.join(', ')}
Files Changed: ${prData.fileChanges.join(', ')}
Lines of Code: ~${loc}

Diff:
${prData.diff.slice(0, 8000)} ${prData.diff.length > 8000 ? '...(truncated)' : ''}

Categorize file paths into logical groups (auth/, db/, tests/, ui/, etc.) and provide PURPOSE for each category.
Be specific with evidence - quote line numbers or code snippets when raising concerns.
`;
}

// Estimate lines of code from diff
function estimateLoC(diff) {
  if (!diff || diff === 'Diff not available') return 0;

  const lines = diff.split('\n');
  let addedLines = 0;
  let removedLines = 0;

  for (const line of lines) {
    // Skip diff metadata lines
    if (line.startsWith('diff --git') ||
        line.startsWith('index ') ||
        line.startsWith('---') ||
        line.startsWith('+++') ||
        line.startsWith('@@')) {
      continue;
    }

    // Count actual additions and deletions
    if (line.startsWith('+')) {
      addedLines++;
    } else if (line.startsWith('-')) {
      removedLines++;
    }
  }

  console.log('[TL;DR PR] LoC estimate: +', addedLines, '-', removedLines, '=', addedLines + removedLines);
  return addedLines + removedLines;
}

// Helper to create element with text content
function createElement(tag, className, textContent) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (textContent) el.textContent = textContent;
  return el;
}

// Display analysis results using safe DOM methods
function displayAnalysis(analysis) {
  console.log('[TL;DR PR] Displaying analysis:', analysis);

  // Remove existing panel if any
  if (analysisPanel) {
    analysisPanel.remove();
  }

  // Create panel
  analysisPanel = createElement('div', 'tldr-panel');
  analysisPanel.id = 'tldr-pr-panel';

  // Header
  const header = createElement('div', 'tldr-header');
  const title = createElement('h3', null, 'TL;DR this PR');

  // Button group
  const btnGroup = createElement('div', 'tldr-header-btns');

  const reanalyzeBtn = createElement('button', 'tldr-reanalyze', '🔄 Re-analyze');
  reanalyzeBtn.title = 'Clear cache and re-analyze this PR';
  reanalyzeBtn.onclick = () => {
    analysisPanel.remove();
    handleSummarize(true);
  };

  const closeBtn = createElement('button', 'tldr-close', '×');
  closeBtn.onclick = () => analysisPanel.remove();

  btnGroup.appendChild(reanalyzeBtn);
  btnGroup.appendChild(closeBtn);

  header.appendChild(title);
  header.appendChild(btnGroup);

  // Content container
  const content = createElement('div', 'tldr-content');

  // Summary section
  const summarySection = createElement('div', 'tldr-section');
  const summaryTitle = createElement('strong', null, 'Summary:');
  summarySection.appendChild(summaryTitle);
  const summaryList = createElement('ul');
  analysis.summary.forEach(item => {
    const li = createElement('li', null, item);
    summaryList.appendChild(li);
  });
  summarySection.appendChild(summaryList);

  // Size section
  const sizeEmoji = {
    'trivial': '🟢',
    'medium': '🟡',
    'large': '🔴',
    'nuke-it': '💀'
  }[analysis.size] || '⚪';

  const sizeSection = createElement('div', 'tldr-section');
  const sizeTitle = createElement('strong', null, 'Size: ');
  sizeSection.appendChild(sizeTitle);
  sizeSection.appendChild(document.createTextNode(`${analysis.size} ${sizeEmoji} (${analysis.loc} LoC)`));
  sizeSection.appendChild(createElement('br'));
  const sizeReason = createElement('small', null, analysis.sizeReason);
  sizeSection.appendChild(sizeReason);

  // Risk section
  const riskEmoji = {
    'low': '🟢',
    'medium': '🟡',
    'high': '🔴'
  }[analysis.risk] || '⚪';

  const riskSection = createElement('div', 'tldr-section');
  const riskTitle = createElement('strong', null, 'Risk: ');
  riskSection.appendChild(riskTitle);
  riskSection.appendChild(document.createTextNode(`${analysis.risk} ${riskEmoji}`));
  riskSection.appendChild(createElement('br'));
  const riskReason = createElement('small', null, analysis.riskReason);
  riskSection.appendChild(riskReason);
  if (analysis.evidence) {
    riskSection.appendChild(createElement('br'));
    const evidence = createElement('code', null, analysis.evidence);
    riskSection.appendChild(evidence);
  }

  // File categories section
  const filesSection = createElement('div', 'tldr-section');
  const filesTitle = createElement('strong', null, 'Files changed:');
  filesSection.appendChild(filesTitle);
  analysis.fileCategories.forEach(cat => {
    const catDiv = createElement('div', 'tldr-file-cat');
    catDiv.textContent = `${cat.category} (${cat.count} files) - ${cat.purpose}`;
    filesSection.appendChild(catDiv);
  });

  // Concerns section
  if (analysis.concerns && analysis.concerns.length > 0) {
    const concernsSection = createElement('div', 'tldr-section tldr-concerns');
    const concernsTitle = createElement('strong', null, '⚠️ Concerns:');
    concernsSection.appendChild(concernsTitle);
    const concernsList = createElement('ul');
    analysis.concerns.forEach(concern => {
      const li = createElement('li', null, concern);
      concernsList.appendChild(li);
    });
    concernsSection.appendChild(concernsList);
    content.appendChild(concernsSection);
  }

  // AI crap detection section
  if (analysis.aiCrapDetection && analysis.aiCrapDetection.detected) {
    const aiSection = createElement('div', 'tldr-section tldr-ai-warning');
    const aiTitle = createElement('strong', null, '🤖 AI-Generated Code Patterns Detected:');
    aiSection.appendChild(aiTitle);
    const aiList = createElement('ul');
    analysis.aiCrapDetection.reasons.forEach(reason => {
      const li = createElement('li', null, reason);
      aiList.appendChild(li);
    });
    aiSection.appendChild(aiList);
    content.appendChild(aiSection);
  }

  // Caveat
  const caveat = createElement('div', 'tldr-caveat', 'ℹ️ Analysis based on diff only, no runtime context');

  // Assemble everything
  content.appendChild(summarySection);
  content.appendChild(sizeSection);
  content.appendChild(riskSection);
  content.appendChild(filesSection);
  content.appendChild(caveat);

  analysisPanel.appendChild(header);
  analysisPanel.appendChild(content);

  // Insert panel after PR header - try multiple possible locations
  const possibleLocations = [
    document.querySelector('.gh-header-meta'),
    document.querySelector('.gh-header'),
    document.querySelector('[data-hpc]'),
    document.querySelector('.merge-pr'),
    document.querySelector('.discussion-timeline-actions')
  ];

  let inserted = false;
  for (const location of possibleLocations) {
    if (location) {
      location.after(analysisPanel);
      inserted = true;
      console.log('[TL;DR PR] Panel inserted after', location.className || location.tagName);
      break;
    }
  }

  if (!inserted) {
    console.error('[TL;DR PR] Could not find insertion point for panel');
    // Fallback: insert at beginning of main content
    const main = document.querySelector('main') || document.querySelector('#js-repo-pjax-container');
    if (main) {
      main.insertBefore(analysisPanel, main.firstChild);
      console.log('[TL;DR PR] Panel inserted at fallback location');
    }
  }
}

// Show error message using safe DOM methods
function showError(message) {
  if (analysisPanel) {
    analysisPanel.remove();
  }

  analysisPanel = createElement('div', 'tldr-panel tldr-error');
  analysisPanel.id = 'tldr-pr-panel';

  const header = createElement('div', 'tldr-header');
  const title = createElement('h3', null, 'TL;DR this PR - Error');

  const btnGroup = createElement('div', 'tldr-header-btns');

  const reanalyzeBtn = createElement('button', 'tldr-reanalyze', '🔄 Retry');
  reanalyzeBtn.title = 'Clear cache and try again';
  reanalyzeBtn.onclick = () => {
    analysisPanel.remove();
    handleSummarize(true);
  };

  const closeBtn = createElement('button', 'tldr-close', '×');
  closeBtn.onclick = () => analysisPanel.remove();

  btnGroup.appendChild(reanalyzeBtn);
  btnGroup.appendChild(closeBtn);

  header.appendChild(title);
  header.appendChild(btnGroup);

  const content = createElement('div', 'tldr-content');
  const errorMsg = createElement('p', null, `❌ ${message}`);
  content.appendChild(errorMsg);

  analysisPanel.appendChild(header);
  analysisPanel.appendChild(content);

  // Insert panel - same logic as displayAnalysis
  const possibleLocations = [
    document.querySelector('.gh-header-meta'),
    document.querySelector('.gh-header'),
    document.querySelector('[data-hpc]'),
    document.querySelector('.merge-pr'),
    document.querySelector('.discussion-timeline-actions')
  ];

  let inserted = false;
  for (const location of possibleLocations) {
    if (location) {
      location.after(analysisPanel);
      inserted = true;
      break;
    }
  }

  if (!inserted) {
    const main = document.querySelector('main') || document.querySelector('#js-repo-pjax-container');
    if (main) {
      main.insertBefore(analysisPanel, main.firstChild);
    }
  }
}

// Handle SPA navigation
let lastUrl = location.href;
new MutationObserver(() => {
  const url = location.href;
  if (url !== lastUrl) {
    lastUrl = url;
    console.log('[TL;DR PR] URL changed to:', url);
    cleanupUI();
    setTimeout(init, 500); // Give GitHub time to render
  } else if (isPullRequestListPage()) {
    // Re-inject list buttons if DOM updated on list page
    injectListButtons();
  }
}).observe(document, { subtree: true, childList: true });

// Also listen for popstate (back/forward navigation)
window.addEventListener('popstate', () => {
  console.log('[TL;DR PR] popstate event');
  cleanupUI();
  setTimeout(init, 500);
});

// Initial run
init();
