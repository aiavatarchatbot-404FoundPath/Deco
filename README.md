# Deco - AI Avatar Chatbot Platform

[![Next.js](https://img.shields.io/badge/Next.js-14-black)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue)](https://www.typescriptlang.org/)
[![Supabase](https://img.shields.io/badge/Supabase-Backend-green)](https://supabase.com/)

This is an AI-powered chatbot platform featuring customizable 3D avatars, real-time conversations and intelligent document processing through RAG (Retrieval-Augmented Generation).

## Features

### Core Capabilities
- **3D Avatar Integration**: Customizable avatars powered by Ready Player Me
- **Intelligent Conversations**: Context-aware responses using GPT-4o mini
- **Document Intelligence**: RAG system for processing and querying uploaded documents
- **Real-time Interaction**: Instant message delivery and updates
- **Safety First**: Built-in content moderation and risk classification
- **Responsive Design**: Seamless experience across all devices

### Advanced Features
- Vector similarity search for relevant context retrieval
- Conversation history management
- Multi-document support
- Avatar emotion synchronization
- Custom personality configuration

## Architecture

### Frontend
- **Framework**: Next.js 14 with App Router
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **3D Rendering**: Three.js with Ready Player Me SDK
- **State Management**: React Context + Hooks
- **UI Components**: Shadcn/ui

### Backend
- **Database**: Supabase (PostgreSQL)
- **Authentication**: Supabase Auth
- **File Storage**: Supabase Storage
- **Real-time**: Supabase Realtime

### AI & ML
- **LLM**: OpenAI GPT-4o mini
- **Embeddings**: OpenAI text-embedding-3-small
- **Vector Database**: Supabase pgvector
- **Safety**: Custom risk classification model

### Deployment
- **Hosting**: Vercel
- **CDN**: Vercel Edge Network
- **Monitoring**: Vercel Analytics
- **Environment**: Production, Staging, Development

## Quick Start

### Prerequisites
- Node.js 18+
- pnpm (recommended) or npm
- Supabase account
- OpenAI API key
- Ready Player Me developer account

### Installation

1. **Clone the repository**
```bash
git clone https://github.com/aiavatarchatbot-404FoundPath/Deco.git
cd Deco
```

2. **Install dependencies**
```bash
npm install
```

3. **Set up environment variables**
```bash
cp .env.example .env.local
```

Edit `.env.local` with your credentials:

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# OpenAI
OPENAI_API_KEY=your_openai_api_key

# Ready Player Me
NEXT_PUBLIC_RPM_APP_ID=your_rpm_app_id

# App Configuration
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

4. **Set up the database**
```bash
cd chatbot-app
npm db:setup
```

5. **Start the development server**
```bash
npm run dev
```

6. **Open your browser**
Navigate to [http://localhost:3000](http://localhost:3000)

## Documentation

For detailed documentation, visit our [Wiki](https://github.com/aiavatarchatbot-404FoundPath/Deco/wiki):

- [Getting Started Guide](https://github.com/aiavatarchatbot-404FoundPath/Deco/wiki/Getting-Started)
- [Architecture Overview](https://github.com/aiavatarchatbot-404FoundPath/Deco/wiki/Architecture)
- [API Reference](https://github.com/aiavatarchatbot-404FoundPath/Deco/wiki/API-Reference)
- [Deployment Guide](https://github.com/aiavatarchatbot-404FoundPath/Deco/wiki/Deployment)
- [Troubleshooting](https://github.com/aiavatarchatbot-404FoundPath/Deco/wiki/Troubleshooting)

## Development

### Project Structure
```
Deco/
├── chatbot-app/          # Main Next.js application
│   ├── app/              # App router pages
│   ├── components/       # React components
│   ├── lib/              # Utility functions
│   └── public/           # Static assets
├── RAG/                  # RAG system implementation
│   ├── embeddings/       # Document processing
│   └── retrieval/        # Vector search logic
└── .idea/                # IDE configuration
```

### Available Scripts
```bash
npm run dev          # Start development server
npm run build        # Build for production
npm run start        # Start production server
npm run lint         # Run ESLint
npm run type-check   # Run TypeScript compiler
```

### Development Workflow
1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License
This repository and its documentation are for academic use only as part of a University of Queensland course DECO3801. Redistribution, reuse or adaptation of this codebase and materials outside of the original student team and assessment context is not permitted without written approval from the University and project authors.

## Acknowledgments

- [Ready Player Me](https://readyplayer.me/) for avatar technology
- [OpenAI](https://openai.com/) for AI capabilities
- [Supabase](https://supabase.com/) for backend infrastructure
- [Vercel](https://vercel.com/) for hosting

---

Built with ❤️ by the 404FoundPath Team
