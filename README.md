<img src="assets/images/example.png" alt="Example Template Screenshots">

<p>A minimal Expo template to create a LightOS-inspired app.</p>

> [!NOTE]
> This is very much a WIP. There's a lot of things I want to add but it'll take me a bit of time :)

## Quick Start

1. Update `app.json` with your app name, slug, and package name
2. Run `bun dev`

## Commands

```bash
bun dev  # Build and run
bun run sync-version   # Sync version across files
bun run generate-icon  # Generate icon from app name
bun run generate-readme-image  # Generate README example image
```

## GitHub Releases

Trigger the workflow manually in Actions tab. It builds an APK and creates a GitHub release tagged with the version from `app.json`. Changelog is auto-generated from commits since the last release.

Requires `EXPO_TOKEN` secret in repo settings.

## Detailed Docs

See [AGENTS.md](./AGENTS.md) for complete component reference, patterns, and examples.
