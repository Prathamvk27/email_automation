# Goodsend

Goodsend is a local-first cold outreach drafting workspace designed to run as a static GitHub Pages site. It helps you prepare separate, personal email drafts, review and copy them, and keep a lightweight follow-up list.

## Run it

Open `index.html` in a modern browser, or serve this folder with any static web server. There is no build step.

To connect a writing model, open **API settings** and enter:

- An OpenAI-compatible chat completions API base URL, such as `https://api.openai.com/v1`
- A model name supported by that provider
- Your own API key

Use **Test connection**, then **Save settings**. The key remains in JavaScript memory for the current tab and is never written into this repository or local storage. Anyone with access to the running browser can still inspect requests and the key, so use a personal key with suitable limits. Some providers block browser requests unless they enable CORS.

Each person is drafted with two API calls: the first extracts grounded facts and missing-information constraints; the second writes a subject and body. The app processes contacts one at a time and never sends an email automatically. Review each note, then copy it or open your email app. Generated drafts and contact/profile information are stored in the browser's local storage. Use **Export list** to save a CSV backup.

## GitHub Pages

The repository includes a GitHub Actions workflow to publish this folder as a Pages site. Push the files to the `main` branch of the `email_automation` repository, then in GitHub open **Settings → Pages** and select **GitHub Actions** as the build and deployment source. The workflow publishes on future pushes to `main`.

GitHub Pages is static hosting. The site cannot safely keep a shared API secret, send messages in the background, or check Gmail for replies on a schedule. This version keeps the API key in the visitor's tab, opens the user's own mail app to send, and tracks replies only when the user records them. The follow-up list becomes due after two days when the site is open; it does not send background notifications. Gmail sending/reply sync would need a backend and explicit account authorization.

## Data and privacy

- Contacts, profile notes, prompts, and drafts stay in this browser's local storage until cleared.
- API keys are held only in the current page's memory and are discarded on reload/close.
- When you generate a draft or test the connection, the relevant profile and recipient details are sent to the API endpoint you configured. Review that provider's data handling terms.
- Do not put secrets in the source code or commit an API key.

## Features

- Up to 25 separate recipients; each note is addressed individually.
- Role, company, recipient context, sender profile, and optional writing direction.
- Editable subject and body with copy buttons and `mailto:` handoff.
- Local outreach tracker with a two-day follow-up date, reply status, and CSV export.
