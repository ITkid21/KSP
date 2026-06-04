# Deployment Guide: GitHub & Zoho Catalyst AppSail

This guide explains how to push the **KSP Crime Intelligence Platform** to GitHub and deploy it to **Zoho Catalyst AppSail**.

---

## 1. Push to GitHub

Since git has already been initialized locally and the initial files configured, you can push the project to your GitHub repository by running the following commands in your terminal:

```bash
# 1. Add your remote GitHub repository URL
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git

# 2. Rename branch to main (standard)
git branch -M main

# 3. Push the repository to GitHub
git push -u origin main
```

---

## 2. Prepare and Build the App Locally

The application is structured to serve the React frontend directly from the Express backend in production. To build the application:

1. **Install dependencies:**
   ```bash
   npm run install:all
   ```
2. **Build and package the app:**
   ```bash
   npm run build
   ```
   *This command compiles the React assets into `client/dist/` and runs the cross-platform copy script to move them to `server/dist/`.*

---

## 3. Deploy to Zoho Catalyst AppSail

Since you already have `zcatalyst-cli` installed globally, you can deploy the app to Zoho Catalyst by following these steps:

### Step A: Login to Zoho Catalyst
Authenticate your local CLI session:
```bash
catalyst login
```
*(This will open a browser window for you to log into your Zoho account and grant CLI access).*

### Step B: Initialize Catalyst (Link to your Project)
Run the initialization command in the project root:
```bash
catalyst init
```
1. Select your **Zoho Catalyst Project** when prompted.
2. Select **AppSail** as the resource to initialize.
3. Select `nodejs20` as the stack runtime.
4. When asked for the AppSail source directory, choose `server` (or type `server` if prompted).
5. Specify the target AppSail service name (e.g., `ksp-crime-intel`).

*Note: Since we have already created the `catalyst.json` and `server/app-config.json` files, the CLI will automatically detect them and link your project details.*

### Step C: Deploy
Build the project (if you haven't already) and run:
```bash
catalyst deploy
```
This command will zip the `server/` directory (excluding ignored files) and deploy it to Zoho Catalyst. Once complete, the CLI will output a live URL (e.g., `https://ksp-crime-intel.catalystserverless.com`) where your app is hosted.

---

## 4. Architecture and Limitations

### relational database
- The app uses a local JSON file database (`server/models/database.js`) pre-seeded in the `server/data/db/` folder.
- **Serverless Ephemerality:** Because Zoho Catalyst AppSail instances are serverless, writing/updating the database will persist within active container sessions, but the data will reset to the initial seed state when the server scales down or restarts.
- For a persistent, production-ready backend, the model layers in `server/models/` should be migrated to the **Zoho Catalyst Data Store** (which provides a persistent database managed via ZCQL).
