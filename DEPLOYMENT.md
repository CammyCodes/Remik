# How to Host Remik Multiplayer Online

Since you are behind CGNAT and cannot open ports, you cannot host the game directly from your computer for external friends using just your IP. You need a **Tunnel** or a **Cloud Host**.

GitHub Pages **cannot** host this game because it only supports "static" sites (HTML/CSS), but Remik requires a **Node.js Server** for the real-time multiplayer logic.

Here are the two best free ways to get your game online:

---

## Option 1: Render.com (Recommended for "Real" Hosting)
This uploads your code to a free server in the cloud. It stays online even when your computer is off.

1.  **Push to GitHub:** Ensure your latest code is committed and pushed to your GitHub repository (`soloRemik`).
2.  **Sign up for [Render.com](https://render.com/)** (you can log in with your GitHub account).
3.  Click **"New +"** → **"Web Service"**.
4.  Select **"Build and deploy from a Git repository"** and choose `soloRemik`.
5.  **Configure the service:**
    *   **Name:** `remik-game` (or whatever you like)
    *   **Region:** Choose one close to you (e.g., Ohio, Frankfurt).
    *   **Branch:** `main` (or `master`)
    *   **Runtime:** `Node`
    *   **Build Command:** `npm install && npm run build`
        *   *(This installs dependencies and builds the optimized frontend)*
    *   **Start Command:** `npm start`
6.  **Free Tier:** Select "Free".
7.  Click **"Create Web Service"**.

Render will now build your app. It might take a few minutes. Once done, it will give you a URL (like `https://remik-game.onrender.com`). Send this to your friends!

> **Note:** The free tier on Render "sleeps" after inactivity. The first time you load it, it might take 30-60 seconds to wake up.

---

## Option 2: ngrok (Quick Local Tunnel)
Expected behavior: This gives you a public URL that tunnels directly to your *currently running* local server.
**Pros:** Instant, no deployment.
**Cons:** URL changes every restart, your PC must stay on.

1.  **Download ngrok:** Go to [ngrok.com](https://ngrok.com/download), sign up (free), and download the Windows version.
2.  **Connect Account:** Run the command ngrok gives you to connect your account (it looks like `ngrok config add-authtoken ...`).
3.  **Start your Game:** Run `run.bat` to start your server on port 3000.
4.  **Start the Tunnel:** Open a *new* terminal window (Command Prompt or PowerShell) and run:
    ```bash
    ngrok http 3000
    ```
5.  **Copy the Link:** ngrok will show a "Forwarding" URL (e.g., `https://a1b2-c3d4.ngrok-free.app`).
6.  **Share:** Give that link to your friend. They can play with you instantly!

---

## Troubleshooting

### "vite: Permission denied" or "vite: not found"
If your deploy fails with `sh: 1: vite: Permission denied`, it means Render didn't install the build tools because it thought they were only for "development".

**Fix:**
Ensure `vite` is listed in `"dependencies"` (not `"devDependencies"`) in your `package.json`.
(I have already verified and updated your `package.json` to fix this!)
