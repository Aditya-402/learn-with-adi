# Learn with Adi

Free, hands-on, self-study courses for graduate engineers. Static site — no build step, no framework; every page is plain HTML/CSS/JS.

**Track 01 — Build an LLM from Scratch**: a guided companion to *Build a Large Language Model (From Scratch)* by Sebastian Raschka (Manning, 2024). The book is the course's hero reference and sets the pathway; these pages add the teaching layer — deeper explanations, interactive labs, worked numbers, quizzes. All book content is taught in our own words and cited; the book itself is not reproduced here.

## Layout

```
index.html                    platform home (course catalog + journey)
privacy.html
assets/                       shared css, wordmark, progress engine, config
courses/llm-from-scratch/     course hub + chapter pages (ch01…)
setup/                        one-time GitHub Pages + Supabase setup guide
```

## Progress & sign-in

`assets/progress.js` keeps each visitor's journey in `localStorage`; when `assets/site-config.js` is filled in (see `setup/SETUP.md`) it also offers Google sign-in via Supabase and syncs progress across devices. Content is never behind the login.

## Publishing

GitHub Pages, deploy-from-branch. Edit → commit → push → live.
