# Mahdiye Pourmatin — Personal CV Agent

A small web app: a chat interface where recruiters can ask questions about
Mahdiye and get answers generated from her CV. The link goes on her CV.

It has a tiny backend so the AI API key stays secret on the server — which is
why this works as a real public link (a plain HTML file on a static host can't
do that safely).

```
cv-agent/
├── server.js              backend: serves the UI + proxies chat to Gemini
├── public/index.html      the chat interface
├── package.json           no dependencies — uses only Node built-ins
├── Dockerfile             how the app is containerized
├── fly.toml               Fly.io settings
└── .github/workflows/     optional auto-deploy from GitHub
```

---

## Step 1 — Get a free AI API key (Google Gemini)

1. Go to **https://aistudio.google.com/apikey**
2. Sign in with a Google account and click **Create API key**.
3. Copy the key somewhere safe. The Gemini free tier is enough for a CV agent.

> The key is **never** put in the code or on GitHub — it's stored as a Fly.io
> secret in Step 4.

## Step 2 — Put the code on GitHub

1. Create a free account at **https://github.com** if you don't have one.
2. Create a new **empty** repository, e.g. `mahdiye-cv-agent`.
3. Upload this whole `cv-agent` folder. Easiest way without the command line:
   on the new repo page click **uploading an existing file**, then drag in all
   the files and folders, and **Commit changes**.

   Or, with Git installed:
   ```bash
   cd cv-agent
   git init
   git add .
   git commit -m "CV agent"
   git branch -M main
   git remote add origin https://github.com/YOUR-USERNAME/mahdiye-cv-agent.git
   git push -u origin main
   ```

## Step 3 — Install the Fly.io CLI and sign in

1. Create an account at **https://fly.io** (a credit card is required, but a
   small auto-sleeping app like this costs roughly nothing).
2. Install the `fly` command:
   - **macOS / Linux:** `curl -L https://fly.io/install.sh | sh`
   - **Windows (PowerShell):** `pwr -Command "iwr https://fly.io/install.sh -useb | iex"`
3. Sign in: `fly auth login`

## Step 4 — Launch and deploy

From inside the `cv-agent` folder:

```bash
fly launch --no-deploy
```

- Accept using the existing `fly.toml`.
- It will pick a unique app name (or let you choose one) and a region.
- Say **no** to databases / Redis — this app needs none.

Add your API key as a secret:

```bash
fly secrets set GEMINI_API_KEY=paste-your-key-here
```

Deploy:

```bash
fly deploy
```

When it finishes, your agent is live at:

```
https://YOUR-APP-NAME.fly.dev
```

Open it, test a few questions, and you're done.

## Step 5 — Put the link in the CV

Add the URL to Mahdiye's CV, e.g. under her name or contact details:
**"Ask my AI agent: https://YOUR-APP-NAME.fly.dev"**

---

## Updating the agent later

Edit the `SYSTEM_PROMPT` text in `server.js` (that's the agent's knowledge and
rules), then run `fly deploy` again.

If you set up the optional GitHub Action (see `.github/workflows/fly-deploy.yml`),
just pushing to GitHub redeploys automatically.

## Notes

- **Model:** defaults to `gemini-2.5-flash`. To change it without editing code:
  `fly secrets set GEMINI_MODEL=gemini-2.0-flash`
- **Abuse protection:** the server limits each visitor to 15 messages per
  minute and caps message size, to protect the free-tier API quota.
- **Run locally first (optional):** with Node 20+ installed —
  `GEMINI_API_KEY=your-key npm start`, then open `http://localhost:8080`.
- **Prefer a different AI provider** (e.g. Anthropic Claude or OpenAI)? Only the
  `fetch(...)` call and the request format inside `server.js` need to change;
  the rest stays the same.
