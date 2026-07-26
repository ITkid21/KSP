# Karnataka State Police (KSP) - Crime Intelligence & Predictive Policing Platform

![KSP Crime Intelligence Platform](https://img.shields.io/badge/KSP-Crime%20Intelligence%20Platform-navy?style=for-the-badge&logo=shield)
![Node.js](https://img.shields.io/badge/Node.js-v18%2B-green?style=for-the-badge&logo=node.js)
![React](https://img.shields.io/badge/React-v18-blue?style=for-the-badge&logo=react)
![Vite](https://img.shields.io/badge/Vite-v5-purple?style=for-the-badge&logo=vite)
![Express](https://img.shields.io/badge/Express.js-Backend-black?style=for-the-badge&logo=express)

An advanced, data-driven Crime Intelligence, Predictive Policing, and Spatial Analytics Platform built for the **Karnataka State Police (KSP)**. The platform combines real-time incident tracking, spatial-temporal DBSCAN cluster analysis, automated crime hotspot identification, AI-assisted investigation tools, and executive reporting.

---

## 🌟 Key Features

- 📍 **Interactive Spatial Crime Mapping**: Real-time Leaflet map visualization of crime locations, high-density heatmaps, and station jurisdiction boundaries across Karnataka.
- 🎯 **DBSCAN Hotspot Analytics**: Spatial-temporal density clustering algorithm for automated hotspot identification and risk level classification.
- 🔮 **Predictive Policing Engine**: Forecast crime trends, high-risk time windows, and spatial probability for proactive resource allocation.
- 🤖 **Investigation Copilot & AI Analyst**: Automated insight generation, evidence correlations, and pattern recognition for active cases.
- 📊 **Executive Dashboard & Analytics**: Interactive Chart.js breakdown of crime categories, year-over-year trends, district comparisons, and resolution metrics.
- 📁 **CSV Data Import & Validation**: High-performance batch CSV parser with data validation, deduplication, and progress tracking.
- 🔐 **Role-Based Access Control (RBAC)**: Secure JWT authentication supporting Admin, Analyst, and Field Officer roles.

---

## 🏗️ Architecture & Technology Stack

| Layer | Technology / Framework | Description |
| :--- | :--- | :--- |
| **Frontend** | React 18, Vite, React Router v7 | Responsive SPA with glassmorphism dark theme UI |
| **Mapping & Dataviz** | Leaflet, React-Leaflet, Chart.js | Spatial mapping, heatmaps, interactive charts |
| **Backend API** | Node.js, Express.js | Modular RESTful API architecture |
| **Authentication** | JWT (JSON Web Tokens), bcryptjs | Token-based security and password hashing |
| **Database** | Embedded JSON DB / Zoho Catalyst ZCQL | Dual storage mode for standalone & cloud runs |
| **Deployment** | Zoho Catalyst AppSail | Cloud serverless container environment |

---

## 📋 Prerequisites

Before running the project locally, ensure you have the following installed:

- **Node.js**: `v18.x` or higher (v20 recommended)
- **npm**: `v9.x` or higher (comes bundled with Node.js)
- **Git**: Installed and configured

---

## 🚀 Quick Start: Running Locally

Follow these step-by-step instructions to set up and run the platform on your local machine.

### Step 1: Clone the Repository

```bash
git clone https://github.com/ITkid21/KSP.git
cd KSP
```

### Step 2: Environment Configuration

Copy the example environment file to create your local `.env` configuration:

```bash
# Windows PowerShell / Command Prompt or Bash
cp server/.env.example server/.env
```

*(The default configuration in `.env.example` works out-of-the-box for local execution).*

### Step 3: Install Dependencies

Install required npm packages for the root project, client, and server:

```bash
npm run install:all
```

*Alternatively, install manually:*
```bash
npm install
cd client && npm install && cd ..
cd server && npm install && cd ..
```

### Step 4: Seed Initial Data (Recommended)

Populate the local database with pre-configured Karnataka crime records and initial admin credentials:

```bash
npm run seed
```

---

## 🏃 Running the Application

You can run the application locally using either **Full Development Mode** (with instant hot-reloading) or **Single-Process Production Mode**.

### Option A: Development Mode (Recommended for Developers)

Run backend and frontend concurrently in two separate terminal windows:

1. **Terminal 1 (Backend Server - Port 5000):**
   ```bash
   npm run dev:server
   ```

2. **Terminal 2 (Frontend Client - Port 5173):**
   ```bash
   npm run dev:client
   ```

3. Open your browser and navigate to: **`http://localhost:5173`**

---

### Option B: Production Mode Local Run (Single Process)

Build the React client and serve everything from the unified Express backend:

1. **Build and package the frontend:**
   ```bash
   npm run build
   ```

2. **Start the Express server:**
   ```bash
   npm start
   ```

3. Open your browser and navigate to: **`http://localhost:5000`**

---

## 🔑 Default Login Credentials

Upon running `npm run seed` (or on first server launch), default system accounts are automatically created:

| Role | Username / Email | Password | Access Level |
| :--- | :--- | :--- | :--- |
| **System Admin** | `admin` *(or `admin@ksp.gov.in`)* | `admin123` | Full Access (User Management, Import, All Analytics) |
| **Crime Analyst** | `analyst` *(or `analyst@ksp.gov.in`)* | `analyst123` | Read/Write (Analytics, Hotspots, Reports, Copilot) |
| **Field Officer** | `officer` *(or `officer@ksp.gov.in`)* | `officer123` | Read-only (Incident Map, Crime Records) |

---

## 🛠️ Package Scripts Summary

| Command | Description |
| :--- | :--- |
| `npm run install:all` | Installs dependencies for root, `client`, and `server`. |
| `npm run dev:client` | Starts Vite dev server for frontend with hot-reload. |
| `npm run dev:server` | Starts Express backend server in development mode. |
| `npm run build` | Compiles Vite frontend assets and copies them to `server/dist`. |
| `npm start` | Launches production Node.js Express server on port 5000. |
| `npm run seed` | Resets and seeds the local database with sample crime datasets. |

---

## 🌐 Deploying to Cloud (Zoho Catalyst)

For details on deploying the application to **Zoho Catalyst AppSail**, refer to the detailed [DEPLOYMENT.md](file:///c:/Users/Atharva/OneDrive/Desktop/KSP/DEPLOYMENT.md) guide included in this repository.

---

## 📄 License

This project is developed for the Karnataka State Police (KSP) Crime Intelligence Initiative.
