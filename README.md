# TL;DR this PR

**Lightweight Chrome extension for AI-powered GitHub PR reviews**

Chrome webstore link: [link](https://chromewebstore.google.com/detail/tldr-this-pr/mpgekicmpbnkcpjpjadjhiblcbpdlknl?authuser=0&hl=en-GB)

Born from [Theo's T3 OSS maintainer rant](https://youtu.be/l8pQeVVaqpY?t=1964) - the exact pain point is real. Existing alternatives (PR Agent, etc.) are heavy/self-hosted. This is a minimal-setup, lightweight extension that gives you instant PR analysis.

## Features

- **Instant PR Summaries**: 3-4 bullet point TL;DR of what the PR does
- **Size & Risk Analysis**: Labels PRs as trivial/medium/large/nuke-it with risk indicators
- **File Categorization**: Groups changed files by purpose (auth/, db/, tests/, etc.)
- **AI Crap Detection**: Flags suspicious patterns:
  - Generic variable names
  - Over-descriptive function names (`handleUserAuthenticationProcessAndValidation`)
  - Meaningless commit messages ("fix", "update") on large PRs
  - Over-commented code
- **Explainability**: Every judgment comes with evidence and reasoning
- **Epistemic Humility**: Shows "analysis based on diff only, no runtime context"
- **Smart Caching**: Saves summaries to avoid re-analyzing the same PR
- **SPA Navigation**: Works seamlessly with GitHub's single-page app navigation

## Installation

### 1. Get an OpenRouter API Key

1. Go to [openrouter.ai/keys](https://openrouter.ai/keys)
2. Sign up and create a free API key
3. Free tier includes DeepSeek and Llama models (fine for this use case)

### 2. Load the Extension

1. Clone this repo or download it
2. Add icon files to the `icons/` directory (see Icons section below)
3. Open Chrome and go to `chrome://extensions`
4. Enable "Developer mode" (toggle in top right)
5. Click "Load unpacked"
6. Select the `pr-review-assistant` folder
7. Click the extension icon and enter your OpenRouter API key

### 3. Use It

1. Navigate to any open GitHub PR
2. Click the "✨ TL;DR this PR" button in the PR header
3. Wait a few seconds for analysis
4. Review the summary, risk assessment, and file breakdown

## How It Works

1. **Content Script** runs on all GitHub pages
2. **Detects PR pages** (only open PRs)
3. **Injects UI** - adds "Summarize" button to PR header
4. **Extracts data**:
   - PR title, description
   - Commit messages
   - Full diff
   - Changed files list
   - Lines of code
5. **Calls LLM** via OpenRouter with structured prompt
6. **Displays results** with explainability and evidence

## Tech Stack

- **Manifest V3** Chrome Extension
- **Vanilla JS** - no framework bloat
- **OpenRouter API** - model-agnostic LLM access
- **OpenAI API** - if you want to use OpenAI models instead of OpenRouter
- **GitHub DOM scraping** - extracts PR data from page

## Roadmap

### V1 (Current)

- [x] PR summary & analysis
- [x] File categorization
- [x] AI crap detection
- [x] Risk & size indicators
- [x] Explainability
- [x] Caching

### V2 (Future)

- [ ] Issue triage helper ("is this worth looking at?")
- [ ] Support for GitHub Enterprise
- [ ] Custom prompt templates
- [ ] Export summaries to markdown
- [ ] Team sharing of summaries

## Development

```bash
# Structure
pr-review-assistant/
├── manifest.json       # Extension manifest
├── content.js          # Main content script (SPA handling, data extraction, UI)
├── popup.html          # Settings page
├── popup.js            # Settings logic
├── styles.css          # Injected UI styles
├── icons/              # Extension icons (add your own)
└── README.md           # This file
```

## Contributing

This is a prototype inspired by real maintainer pain. If you want to contribute:

1. Fork it
2. Make it better
3. PR it

## License

MIT - do whatever you want with it

## Credits

Inspired by [@t3dotgg](https://twitter.com/t3dotgg)'s OSS maintainer rant about needing better PR triage tools.

Built because existing solutions are too heavy for "I just want to know if this PR is worth my time."
