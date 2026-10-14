# Changelog

GodSend uses [Semantic Versioning](https://semver.org/). Version `0.1.0` is the first tracked product version and is still pre-1.0, so features and data formats may change as the product develops.

## [0.1.0] - Preview

### Added

- Local-first outreach drafting for up to 25 people, including one-person drafting and a paced queue.
- Evidence-guided messages based on the user's saved profile and role-specific stories.
- Editable writing methods, reusable voice guidance, and contact-specific instructions.
- Separate Compose, Contacts, Outreach, My profile, and Writing styles areas.
- Reviewable Gmail drafts with an optional resume attachment.
- A two-day follow-up tracker, reply status, contact stars, bulk actions, and CSV exports.
- Static GitHub Pages deployment and local laptop setup instructions.

### Known limits

- Contact, profile, and outreach data are stored in the current browser; they do not sync between devices.
- Gmail draft creation requires the owner to configure Google OAuth. GodSend does not send messages automatically.
- Reply checking and follow-up reminders are not background services; the user checks them in the app.
- The model provider must allow browser requests from the app's origin.
