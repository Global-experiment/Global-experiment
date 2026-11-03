# Global experiment

The website of the Global experiment (<https://globalexperiment.org>) and its
admin: People, Organizations, Treasury, Documentation, donations.

- **Website and admin**: Next.js (`src/`)
- **API**: NestJS with PostgreSQL (`apps/api/`)

## Start working on it

You need Node.js 22 or later and Git. No production key or password is
needed.

```bash
git clone https://github.com/Global-experiment/Global-experiment.git
cd Global-experiment
git checkout develop
npm ci
npm run setup        # local settings, local database, sample data, your local admin login
npm run dev:local    # the site and the API together
```

Open <http://localhost:3000>, and <http://localhost:3000/admin> to sign in
with the login `npm run setup` printed.

Read [CONTRIBUTING.md](CONTRIBUTING.md) before your first change: branches,
commit messages, pull requests, tests and design rules.

## Documentation

- [docs/architecture](docs/architecture) — how it is built, and why
- [.env.example](.env.example) — every setting, explained
