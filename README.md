# 🔥 FIREARENA — Free Fire Tournament Platform

A production-ready, full-stack tournament management platform for Free Fire esports. Built with security-first architecture, escrow-based payments, and OCR-powered player verification.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | Next.js 15 (App Router, React 19), Tailwind CSS v4, Framer Motion, Lucide React |
| **Backend** | Node.js, Express.js, TypeScript |
| **Database** | PostgreSQL with Prisma ORM |
| **Security** | JWT Auth, Helmet, Express Rate Limit, bcryptjs, Zod validation |
| **Cache** | Redis (optional) |

## Project Structure

```
firearena-app/
├── backend/          # Express API server
│   ├── src/
│   │   ├── config/       # Database, Passport, Redis
│   │   ├── controllers/  # Route handlers
│   │   ├── middleware/   # Auth, rate limiting, validation
│   │   ├── models/       # Prisma client exports
│   │   ├── routes/       # API endpoint mappings
│   │   ├── services/     # OCR, Escrow, Payment Gateway
│   │   └── app.ts        # Server entry point
│   └── prisma/           # Database schema & seed
├── frontend/         # Next.js web application
│   └── src/
│       ├── app/          # Pages (dashboard, admin, wallet, tournaments)
│       ├── components/   # UI components
│       ├── hooks/        # Custom React hooks
│       └── lib/          # API client & services
└── README.md
```

## Prerequisites

- **Node.js** 18+
- **PostgreSQL** 14+
- **Redis** 6+ (optional, for caching)

## Quick Start

### 1. Clone & Install

```bash
cd firearena-app

# Backend
cd backend
cp .env.example .env
npm install

# Frontend
cd ../frontend
cp .env.example .env.local
npm install
```

### 2. Configure Database

Edit `backend/.env`:

```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/firearena?schema=public
JWT_SECRET=your-super-secret-jwt-key-min-32-chars
JWT_REFRESH_SECRET=your-refresh-secret-key-min-32-chars
```

### 3. Initialize Database

```bash
cd backend
npm run db:generate
npm run db:push
npm run db:seed
```

### 4. Start Development Servers

```bash
# Terminal 1 — Backend (port 4000)
cd backend
npm run dev

# Terminal 2 — Frontend (port 3000)
cd frontend
npm run dev
```

Open **http://localhost:3000**

## Seed Accounts

| Role | Email | Password |
|------|-------|----------|
| Admin | admin@firearena.gg | Admin@123456 |
| Player | player1@firearena.gg | Player@123456 |

## API Endpoints

### Authentication
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/register` | Register new account |
| POST | `/api/auth/login` | Login |
| POST | `/api/auth/refresh` | Refresh access token |
| GET | `/api/auth/me` | Get current user |

### Tournaments
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/tournaments` | List tournaments |
| GET | `/api/tournaments/:id` | Get tournament details |
| POST | `/api/tournaments/register` | Register for tournament |
| POST | `/api/tournaments` | Create tournament (Admin) |

### Wallet
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/wallet` | Get wallet & transactions |
| POST | `/api/wallet/deposit` | Deposit funds |
| POST | `/api/wallet/withdraw` | Withdraw funds |

### Teams
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/teams` | List teams |
| POST | `/api/teams` | Create team |
| POST | `/api/teams/join` | Join a team |

### Verification
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/verification/submit` | Submit Free Fire ID verification |
| GET | `/api/verification/pending` | List pending (Admin) |
| PATCH | `/api/verification/:id/review` | Approve/reject (Admin) |

### Admin
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/admin/stats` | Dashboard statistics |
| GET | `/api/admin/users` | List all users |
| POST | `/api/admin/tournaments/:id/release-prizes` | Release escrow prizes |
| POST | `/api/admin/tournaments/:id/refund` | Refund tournament escrows |

## Security Features

- **JWT Authentication** with refresh token rotation
- **bcryptjs** password hashing (12 rounds)
- **Helmet** HTTP security headers
- **Express Rate Limiting** on auth, wallet, and tournament endpoints
- **Zod** input validation on all endpoints
- **Escrow system** for tournament entry fees
- **Role-based access control** (Player, Moderator, Admin)

## Architecture Highlights

- **Escrow Service**: Entry fees are held in escrow until tournament completion, then released to winners or refunded on cancellation
- **OCR Engine**: Mock OCR service for Free Fire profile verification (integrate Tesseract.js or cloud OCR in production)
- **Payment Gateway**: Simulated payment processor (integrate Stripe/Razorpay in production)
- **Redis Caching**: Tournament listings cached with TTL for performance

## Production Deployment

```bash
# Build backend
cd backend
npm run build
npm start

# Build frontend
cd frontend
npm run build
npm start
```

Set production environment variables:
- Use strong, unique `JWT_SECRET` and `JWT_REFRESH_SECRET`
- Configure production `DATABASE_URL`
- Set `CORS_ORIGIN` to your frontend domain
- Enable Redis for caching

## License

MIT
