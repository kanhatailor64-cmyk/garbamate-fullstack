# GarbaMate (Frontend + Backend)

Garba & Dandiya partner finder for college students (Tinder-style swipe, Navratri theme).

## Local Development
1. Install Node.js 18+ (nodejs.org)
2. In this folder:
   ```bash
   npm install
   npm start
   ```
3. Open `http://localhost:3000`

---

## Deploying to Vercel

The project has been adapted for Vercel Serverless:
- **Serverless API**: `api/index.js` mounts the Express application.
- **Routing**: `vercel.json` routes `/api/*` to the serverless function and serves static files from `public/`.
- **Database**: Uses `@libsql/client` (pure JavaScript, no native C++ bindings).
  - Out of the box, Vercel will use an ephemeral database in `/tmp` seeded with demo profiles.
  - For persistent, production storage across all users, connect a free [Turso](https://turso.tech) SQLite database.
- **Real-time Chat**: Client uses Socket.IO with automatic 3-second HTTP polling fallback for serverless compatibility.

### Method 1: Deploy with Vercel CLI
1. Log in to Vercel in your terminal:
   ```bash
   npx vercel login
   ```
2. Deploy to production:
   ```bash
   npx vercel --prod
   ```

### Method 2: Deploy via GitHub (Recommended)
1. Push this folder to a GitHub repository:
   ```bash
   git add .
   git commit -m "feat: configure for Vercel deployment"
   git remote add origin https://github.com/<your-username>/<your-repo>.git
   git push -u origin main
   ```
2. Go to [vercel.com/new](https://vercel.com/new).
3. Import your repository and click **Deploy**.

### Environment Variables (Optional)
In your Vercel Project Settings > Environment Variables:
- `JWT_SECRET`: Random string for JWT tokens.
- `ADMIN_EMAIL`: Email of admin user (enables `/api/admin/reports` and ban features).
- `TURSO_DATABASE_URL`: (Recommended for production persistence) e.g., `libsql://your-db.turso.io`.
- `TURSO_AUTH_TOKEN`: Auth token from Turso.

---

## Credits
Crafted with ❤️ for Navratri by:
- **Athrva tailor**
- **Varshith reddy**
- **Anuvesha rastogi**
- **Viraj salunkhe (oreo)**

