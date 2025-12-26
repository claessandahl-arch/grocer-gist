# Receipt Insights (grocer-gist)

A smart grocery spending tracker that uses AI to parse receipt images and PDFs, providing insights into spending habits and price comparisons across stores.

## Features

- 📷 **Receipt Parsing** - Upload receipt images or PDFs, AI extracts items automatically
- 📊 **Spending Dashboard** - Visualize spending by category, store, and time period
- 💰 **Price Comparison** - Compare prices across stores to find the best deals
- 🏷️ **Smart Categorization** - AI-powered product categorization with learning from corrections
- 🔄 **Product Grouping** - Automatically group similar products for better tracking

## Tech Stack

- **Frontend**: React + TypeScript + Vite
- **UI**: shadcn/ui + Tailwind CSS
- **Backend**: Supabase (Database, Auth, Storage, Edge Functions)
- **AI**: Google Gemini API (Receipt parsing, categorization)
- **Hosting**: Lovable Cloud (frontend) / Supabase (backend)

## Development

### Prerequisites

- Node.js 18+ (install via [nvm](https://github.com/nvm-sh/nvm))
- npm

### Getting Started

```sh
# Clone the repository
git clone https://github.com/claessandahl-arch/grocer-gist.git

# Navigate to project directory
cd grocer-gist

# Install dependencies
npm install

# Start development server
npm run dev
```

The app will be available at `http://localhost:8080`.

### Environment Variables

Create a `.env` file in the root directory:

```env
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_PUBLISHABLE_KEY=your_supabase_anon_key
```

### Edge Functions

The app uses Supabase Edge Functions for AI-powered features:

| Function | Purpose |
|----------|---------|
| `parse-receipt` | Parse receipt images/PDFs using Gemini AI |
| `suggest-categories` | AI category suggestions for products |
| `suggest-product-groups` | AI product grouping suggestions |
| `suggest-group-merges` | AI merge suggestions for product groups |
| `auto-map-products` | Auto-map products to groups |
| `admin-delete-all` | Admin utility for data cleanup |

Edge Functions require `GEMINI_API_KEY` to be set as a secret.

## Project Structure

```
├── src/
│   ├── components/     # React components
│   ├── pages/          # Page components
│   ├── hooks/          # Custom React hooks
│   ├── integrations/   # Supabase client & types
│   └── lib/            # Utility functions
├── supabase/
│   ├── functions/      # Edge Functions
│   └── migrations/     # Database migrations
└── public/             # Static assets
```

## Documentation

- [CLAUDE.md](./CLAUDE.md) - Detailed project documentation and guidelines
- [TODO.md](./TODO.md) - Roadmap and planned features
- [TECH_STACK.md](./TECH_STACK.md) - Technology stack details

## License

Private project - All rights reserved.
