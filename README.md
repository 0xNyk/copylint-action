# Copylint GitHub Action

Scans the Markdown a pull request changed with the Copylint API, annotates each finding inline, and fails the job when a file scores at or above the floor.

```yaml
# .github/workflows/copy.yml
name: copy
on: [pull_request]
permissions:
  contents: read
jobs:
  copylint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: 0xNyk/copylint-action@v1
        with:
          api-key: ${{ secrets.COPYLINT_KEY }}
          threshold: 40      # optional
          personal: false    # Team plan: apply the org voice profile
```

Outside a pull request it scans `files` (default `**/*.md`). No dependencies; Node 20 runtime. Findings become inline warnings, minors become notices, and a failing file adds an error on line 1 plus a job summary.
