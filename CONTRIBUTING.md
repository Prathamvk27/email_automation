# Contributing to GodSend

GodSend is a static browser app. Keep the source dependency-light, preserve the local-first data model, and make every generated email reviewable before it reaches Gmail.

## Local setup

1. Install Git, Node.js 20 or newer, and npm.
2. Clone the repository and enter it:

   ```bash
   git clone https://github.com/Prathamvk27/email_automation.git
   cd email_automation
   ```

3. Start the local app:

   ```bash
   npm run dev
   ```

4. Open `http://127.0.0.1:4173`. Stop the server with `Ctrl+C`.

The project has no npm dependencies, so `npm install` is not needed. `npm run dev` builds the static files and serves them on loopback only.

## Before opening a pull request

Run the same offline checks used by GitHub Actions:

```bash
npm run verify
```

This checks JavaScript syntax and release metadata, runs the offline writing-agent fixtures, and builds the static site. The offline fixtures need no API key and make no network requests.

For browser checks, use `npm run dev`, verify the main Compose flow and the pages touched by the change, and confirm the browser console has no new errors. Do not use real recipient data or a production API key in fixtures or screenshots.

## Version and release policy

- `package.json` is the single source of the product version. The UI receives it from generated `app-version.json`.
- Use `MAJOR.MINOR.PATCH` and record every user-visible release in `CHANGELOG.md`.
- Bump the fixture suite version in `harness/cases.json` when adding or changing evaluation cases.
- While the product is below `1.0.0`, use `0.MINOR.PATCH`: increase MINOR for a feature and PATCH for a compatible fix. A breaking change should be clearly called out in the changelog.
- A release tag uses the `v` prefix, such as `v0.1.0`. Update the package version and changelog together before creating a tag.
- GitHub Actions validates pull requests targeting `main`. A merge or manual run on `main` builds and deploys the site. Do not tag or deploy until the checks pass and the release candidate has been reviewed.

## Product constraints

- Do not add automatic email sending or background Gmail access without a separately reviewed backend and authorization design.
- Gmail draft integration requests the restricted `gmail.compose` scope. Public OAuth use needs the applicable Google verification; keep deployments in testing limited to configured test users until verified.
- Never commit model API keys, OAuth client secrets, recipient lists, resumes, or browser storage exports.
- Keep recipient email addresses and resume files out of model prompts and test fixtures.
- Keep the job title, job ID, and job description optional. The recipient's valid email address is required for drafting.
- Preserve contacts when staged outreach is removed, and keep user approval before applying bulk revisions.
