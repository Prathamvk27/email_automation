# Goodsend

Goodsend is a local-first cold outreach drafting workspace designed to run as a static GitHub Pages site. It helps you prepare separate, personal email drafts, review and copy them, and keep a lightweight follow-up list.

## Run it

Open `index.html` in a modern browser, or serve this folder with any static web server. There is no build step.

To connect a writing model, open **API settings** and enter:

- An OpenAI-compatible chat completions API base URL, such as `https://api.openai.com/v1`
- A model name supported by that provider
- Your own API key

Use **Test connection**, then **Save settings**. By default, the key remains in JavaScript memory for the current tab and clears on reload. To keep from entering it again, select **Remember API key on this device** before saving; the key is then stored in this browser's local storage. Anyone using this browser profile or scripts running on the site could access a remembered key, so leave the option off on shared devices and use a personal key with suitable limits. The key is never written into this repository. Some providers block browser requests unless they enable CORS.

Each person is drafted with two API calls: the first extracts grounded facts and missing-information constraints; the second writes a subject and body. The app processes contacts one at a time and never sends an email automatically. After a successful draft, its contact entry clears from Compose and the complete message is saved under **Outreach** for later review, copying, or opening in your email app. Generated drafts and contact/profile information are stored in the browser's local storage. Use **Export list** to save a CSV backup.

## GitHub Pages

The repository includes a GitHub Actions workflow to publish this folder as a Pages site. Push the files to the `main` branch of the `email_automation` repository, then in GitHub open **Settings → Pages** and select **GitHub Actions** as the build and deployment source. The workflow publishes on future pushes to `main`.

GitHub Pages serves the HTML, CSS, and JavaScript; the browser runs the app. That is enough for this version to save your workspace locally, call a model provider directly from your browser, and open your mail app with a prepared message. Your provider must allow browser requests from the site (CORS). The site has no backend, so it cannot safely keep a shared API secret, send messages in the background, or check Gmail for replies on a schedule. The API key stays in the current tab by default, or in this browser's local storage if you explicitly choose the remember option. The follow-up list becomes due after two days when you return; it does not send background notifications. Gmail sending/reply sync would need a backend and explicit account authorization.

## Data and privacy

- Contacts, base profile, role-specific project profiles, custom writing methods, selected style, prompts, and drafts stay in this browser's local storage until cleared.
- API keys are held in page memory by default; the explicit remember option stores the key in this browser's local storage until you uncheck the option and save or clear browser data.
- When you generate a draft, the sender profile, recipient name/role/company/context, and custom direction are sent to the API endpoint you configured. The recipient email address stays in this browser and is not sent to the model. Review the provider's data handling terms before adding resume details.
- Do not put secrets in the source code or commit an API key.

## Features

- Up to 25 separate recipients; write a note for one person or generate the whole batch.
- Successful drafts move out of the Compose form into Outreach, where the full message remains available after a refresh.
- Role, company, recipient context, sender profile, and optional writing direction.
- A separate Writing styles library with Natural and Abigayle framing methods, plus up to 20 editable custom methods. The selected style is applied to single-person and batch drafts.
- A separate **My profile** page for reusable project stories by target role.
- Editable subject and body with copy buttons and `mailto:` handoff.
- Local outreach tracker with a two-day follow-up date, reply status, and CSV export.
