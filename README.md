# god send

**GodSend v0.1.0** is a local-first workspace for writing and tracking thoughtful outreach. It creates drafts for you to review; it never sends an email automatically.

## Run it on your laptop

You need Git, Node.js 20 or newer, and npm. The app has no npm dependencies, so you do not need to run `npm install`.

```bash
git clone https://github.com/Prathamvk27/email_automation.git
cd email_automation
npm run dev
```

Open **http://127.0.0.1:4173**. The development server listens on your computer only. Stop it with `Ctrl+C`.

This local copy is separate from the hosted site. Contact, profile, and draft data are saved in the browser profile you use at this address.

## First-time setup

1. Open **API settings** and enter an OpenAI-compatible chat completions API URL, model name, and your own API key. Select **Test connection**, then **Save settings**. The key stays in page memory unless you explicitly choose **Remember API key on this device**. A remembered key is accessible to anyone using that browser profile or scripts running on the site; do not use it on a shared device.
2. Open **My profile** and add your name, background, and reusable signature. Add role-specific project stories if you want the drafts to use them.
3. In **Compose**, add a valid email address for each person. A name, role, company, job title, job ID, job description, and contact-specific direction can be left blank when you do not have them.
4. Write one note or start a paced run. Review and edit every draft before copying it or creating a Gmail draft.

The model receives your profile, role stories, recipient name/role/company/context, supplied job details, and writing instructions. Recipient email addresses and resume files stay in the browser and are not sent to the model. Review the model provider’s data terms before adding personal details.

## Optional Gmail drafts and resume

Gmail integration is opt-in. In **My profile → Resume attachment**, add a resume and your Google OAuth web client ID. In Google Cloud, enable the Gmail API, configure the OAuth consent screen, and create a Web application client. Add the app origin to the client's authorized JavaScript origins. For local use, add `http://127.0.0.1:4173`; for a hosted copy, add its origin too. During OAuth testing, add the Google accounts that will test the app to the test-user list.

Each person deploying a copy must use their own OAuth client. GodSend requests Google's `gmail.compose` scope, which can manage Gmail drafts and send email. Google classifies that scope as restricted; public use requires the applicable OAuth verification. In the external-app Testing state, only listed test users can connect. See Google's [Gmail scope guide](https://developers.google.com/workspace/gmail/api/auth/scopes) and [OAuth app-state overview](https://developers.google.com/identity/protocols/oauth2/production-readiness/overview). This Google requirement is separate from GitHub Pages deployment.

Connect Gmail, then choose **Create Gmail draft + resume**. GodSend creates a draft containing the recipient, subject, body, and saved resume. Review and send it yourself in Gmail. The access token stays in memory and clears when the page reloads. Gmail permissions can allow draft management and sending, but this app only creates drafts.

## What this static app does not do

- It has no server or shared database. Browser data does not sync across devices or between different site origins.
- It does not send mail automatically, check replies in the background, or run while the browser is closed.
- The paced queue waits between drafts but cannot bypass a provider’s rate limits. Keep the tab open while it runs.
- Your model provider must allow browser requests from the app’s origin. Some providers require CORS configuration.

## Product version

The current preview is **v0.1.0**. The product version follows `MAJOR.MINOR.PATCH`; while GodSend is below 1.0, changes may still affect saved data or workflows. The version shown in the app is built from `package.json`. See [CHANGELOG.md](CHANGELOG.md) for the release notes and [CONTRIBUTING.md](CONTRIBUTING.md) for the release and contribution process.

## Verify changes

Install Node.js 20 or newer, then run:

```bash
npm run verify
```

This checks JavaScript syntax and release metadata, runs the offline writing-agent fixtures, and builds the static site into `public-site/`. It needs no API key and makes no network calls. To run just the fixtures, use `npm test`.

## Reuse and licensing

This repository does not currently include a `LICENSE` file. The setup below explains how to run or deploy a copy technically; the repository owner should choose a license before inviting others to reuse or redistribute the code.

## Deploy your own copy with GitHub Pages

1. Fork this repository and make your changes on a branch.
2. In the fork, open **Settings → Pages** and choose **GitHub Actions** as the deployment source.
3. Open a pull request targeting `main`. GitHub Actions runs the same verification used locally; pull requests do not deploy.
4. Merge to `main` after the checks pass. The workflow builds and deploys the site. You can also run **Validate and deploy GodSend** manually from the Actions tab on `main`.
5. If using Gmail drafts, add the deployed site origin to your Google OAuth client's authorized JavaScript origins. The model provider must allow requests from that origin.

GitHub Pages hosts only the static interface and browser code. It does not keep your contacts or credentials for you. The repository's main branch deploys to its configured Pages site when a verified change is pushed; this workspace has not been deployed as part of the v0.1.0 readiness work.

## Main features

- One-person or paced outreach drafting for up to 25 contacts.
- Saved contacts, independent of staged emails, with search and stars.
- A reusable profile, multiple stories per role, and custom writing styles.
- Individual and bulk rework with review before a revision is applied.
- Outreach status, reply notes, two-day follow-up dates, and CSV export.
- Optional Gmail drafts with a resume attached.
