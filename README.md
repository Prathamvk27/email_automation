# god send

god send is a local-first cold outreach drafting workspace designed to run as a static GitHub Pages site. It helps you prepare separate, personal email drafts, review and copy them, and keep a lightweight follow-up list.

## Run it

Open `index.html` in a modern browser, or serve this folder with any static web server. There is no build step.

To connect a writing model, open **API settings** and enter:

- An OpenAI-compatible chat completions API base URL, such as `https://api.openai.com/v1`
- A model name supported by that provider
- Your own API key

Use **Test connection**, then **Save settings**. By default, the key remains in JavaScript memory for the current tab and clears on reload. To keep from entering it again, select **Remember API key on this device** before saving; the key is then stored in this browser's local storage. Anyone using this browser profile or scripts running on the site could access a remembered key, so leave the option off on shared devices and use a personal key with suitable limits. The key is never written into this repository. Some providers block browser requests unless they enable CORS.

Each person is drafted with two API calls: the first extracts grounded facts and missing-information constraints; the second writes a subject and body. The app processes contacts one at a time and never sends an email automatically. After a successful draft, its contact entry clears from Compose and the complete message is saved under **Outreach** for later review, copying, or opening in a prefilled Gmail compose window. Generated drafts and contact/profile information are stored in the browser's local storage. Use **Export list** to save a CSV backup.

Use **Rework** on any saved draft to request a one-off revision or ask for a fresh rewrite. The revised subject and body appear for review first; the saved version changes only after you choose **Use this version**. Reworking uses the same contact, job details, profile, and writing style, and makes two more model calls. In **Outreach**, select any combination of drafts, sent emails, and replies, or use **Select visible emails** to select the current filtered/search results. Bulk **Rework** and **Mark sent** apply only to eligible unsent drafts. Rework uses one shared instruction, runs contact by contact with the saved queue delay, previews each result, and lets you choose which revisions to apply. **Open in Gmail** displays a prefilled compose link for every selected email; open each link from the list because browsers may block batch pop-up tabs. **Create Gmail drafts + resume** creates reviewable Gmail drafts for selected valid messages that do not already have a Gmail draft, and reports partial success. It never sends messages. Star an Outreach contact to keep it easy to find; use the **Starred** filter to see those contacts. Star status is saved with your local outreach data. The **Contacts** page stores contact details independently from staged emails: removing one email or clearing Outreach preserves its contact, and **Add to Compose** can restore it for a new message. **Outreach** also has search, status filters, a contact count summary, individual removal, and a clear-list action that leaves Contacts, Compose contacts, and profile data intact.

For job outreach, enter the contact and company, then add the exact job title, job ID, and (optionally) paste the job description. The writing agent treats the posting as the employer's requirements, matches one relevant requirement to evidence from your profile, and states your intent to be considered for that opening. It does not treat the job description as proof of your experience. Set a reusable signature in **My profile**; the app appends it exactly after generation, or uses `Best,` and your saved name if you leave the signature blank. The pasted job description is sent to your selected model provider when you generate the email.

## Evaluate the writing agent

god send shares its two-step prompt and JSON parsing code with a small command-line evaluation harness. From the repository root, run the offline fixture first:

```bash
node harness/run.mjs
```

The offline fixture makes no network calls or model claims. It checks that both agent stages execute, the output parses, and the scorer/report path works. To evaluate a configured OpenAI-compatible model on the same synthetic cases, opt in explicitly:

```bash
GOODSEND_API_KEY='your-personal-key' \
GOODSEND_API_BASE='https://api.openai.com/v1' \
GOODSEND_MODEL='gpt-4o-mini' \
node harness/run.mjs --live
```

Each live case makes two sequential completion calls, so the included four-case suite uses eight calls. Results are written under the ignored `artifacts/goodsend-evals/` folder and include generated text for human review; fixture data is invented. The rule-based checks cover JSON shape, length bounds, required personalization, disallowed claims, and the two-stage path. They are a regression aid, not a reliable semantic judge or evidence of production quality. Review the generated messages before comparing models. Use only a personal key with suitable limits.

## GitHub Pages

The repository includes a GitHub Actions workflow to publish this folder as a Pages site. Push the files to the `main` branch of the `email_automation` repository, then in GitHub open **Settings → Pages** and select **GitHub Actions** as the build and deployment source. The workflow publishes on future pushes to `main`.

GitHub Pages serves the HTML, CSS, and JavaScript; the browser runs the app. The Gmail draft feature needs a Google Cloud project with Gmail API enabled and a Web application OAuth client. Add the deployed site origin shown on **My profile** to its authorized JavaScript origins, configure the OAuth consent screen, and add your Google account as a test user while the app is in testing. Paste the client ID into **My profile → Resume attachment**, save it, and select **Connect Gmail**. god send requests `gmail.compose`; Google describes this scope as allowing draft management and sending, but god send only calls the draft-creation API. The client ID is saved in this browser and the access token stays in memory for the session. Click **Create Gmail draft + resume** to create a draft containing the recipient, subject, body, and saved resume. Review and send from Gmail yourself. The resume is sent to Gmail only for that explicit action. A static site has no backend for sending messages in the background or checking Gmail replies on a schedule.

The model provider must allow browser requests from the site (CORS). The API key stays in the current tab by default, or in this browser's local storage if you explicitly choose the remember option. The follow-up list becomes due after two days when you return; it does not send background notifications.

## Data and privacy

- The contact directory, Compose contacts, staged emails, base profile, role-specific project profiles, custom writing methods, selected style, and prompts stay in this browser's local storage until cleared.
- The optional resume file is stored in this browser's IndexedDB and is not sent to the model. It is attached only when you explicitly create a Gmail draft.
- API keys are held in page memory by default; the explicit remember option stores the key in this browser's local storage until you uncheck the option and save or clear browser data.
- When you generate a draft, the sender profile, role stories you entered, recipient name/role/company/context, and custom direction are sent to the API endpoint you configured. The recipient email address and uploaded resume file stay in this browser and are not sent to the model. Review the provider's data handling terms before adding resume details to your profile.
- Do not put secrets in the source code or commit an API key.

## Features

- Up to 25 separate recipients; write a note for one person or generate the whole batch.
- Successful drafts move out of the Compose form into Outreach, where the full message remains available after a refresh.
- Rework an individual saved draft with an optional revision instruction, review the proposed version, then apply it.
- Select any outreach records and bulk rework eligible drafts, mark drafts sent, open per-message Gmail compose links, or create Gmail drafts with the saved resume.
- Star contacts in Outreach and use the Starred filter; star status is stored with the contact on this device.
- Keep a separate Contacts address book when removing one staged email or clearing Outreach; add a saved contact back to Compose for a fresh message, or export the directory as a CSV backup.
- Role, company, recipient context, sender profile, and optional writing direction.
- A separate Writing styles library with Natural and Abigayle framing methods, plus up to 20 editable custom methods. The selected style is applied to single-person and batch drafts.
- A separate **My profile** page for up to 10 reusable project stories per target role; the writer selects at most one relevant story per email.
- An optional saved resume, Gmail OAuth connection, and a Gmail API action to create a reviewable draft with the resume attached.
- Editable subject and body with copy buttons and a prefilled Gmail compose link (recipient, subject, and body).
- Local outreach tracker with a two-day follow-up date, reply status, and CSV export.
