# Trust-Building AI Avatar Conversations for Youth Justice

[![Demo](https://img.shields.io/badge/Demo-Live-brightgreen)](https://aiavatarchatbot.vercel.app)
[![Build Status](https://img.shields.io/badge/Build-Passing-success)]()
[![License](https://img.shields.io/badge/License-MIT-blue)]()
[![Next.js](https://img.shields.io/badge/Next.js-14-black)]()
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue)]()

> An empathetic, trauma-informed AI chatbot using lifelike 3D avatars to build trust and provide safe, supportive conversations for youth in the justice system.

## Table of Contents

- [Project Overview](#-project-overview)
- [Key Features](#-key-features)
- [How It Works](#-how-it-works)
- [Technology Stack](#-technology-stack)
- [Quick Start](#-quick-start)
- [Project Structure](#-project-structure)
- [Configuration](#-configuration)
- [Usage Examples](#-usage-examples)
- [API Documentation](#-api-documentation)
- [Contributing](#-contributing)
- [License](#-license)
- [Acknowledgments](#-acknowledgments)

## Project Overview

**Trust-Building AI Avatar Conversations** is a Studio 3 (DECO3801) project developed at **The University of Queensland**. It explores how **AI avatars**, **ethical design** and **trauma-informed responses** can create emotionally safe, trustworthy digital interactions for vulnerable youth.

### Problem Statement
Youth in the justice system often face barriers to accessing mental health support due to stigma, trust issues, and lack of culturally appropriate resources. Traditional text-based chatbots can feel impersonal and fail to build the necessary trust for meaningful therapeutic conversations.

### Our Solution
The system combines **natural language understanding**, **3D visual empathy** and **context-aware reasoning** through Retrieval-Augmented Generation (RAG). It ensures every response is **grounded**, **private**, and **emotionally sensitive**.

### Goals
- Create a safe, non-judgmental space for youth to express themselves
- Build trust through empathetic AI avatars and trauma-informed responses  
- Provide 24/7 accessible mental health support
- Maintain strict privacy and security standards

## Key Features

### AI & Conversation
- **Conversational AI Core:** GPT-4o mini + RAG using `text-embedding-3-small`
- **Context-Aware Responses:** Retrieval-Augmented Generation for grounded answers
- **Trauma-Informed Design:** CARE framework (Collaboration, Autonomy, Respect, Empowerment)
- **Safety Filtering:** Advanced risk classification and content moderation

### 3D Avatar System
- **Realistic Avatars:** Ready Player Me integration with customizable appearances
- **Interactive Animations:** React Three Fiber for smooth 3D rendering
- **Emotion Expression:** Avatar facial expressions and gestures match conversation tone
- **Accessibility:** Multiple avatar options to represent diverse identities

### Privacy & Security
- **Row-Level Security:** Supabase RLS for data protection
- **Anonymous Sessions:** No personal data required to use the system
- **End-to-End Encryption:** Secure data transmission and storage
- **GDPR Compliant:** Privacy-first approach with data minimization

### Technical Architecture
- **Tech Stack:** Next.js • Supabase • TailwindCSS • OpenAI API • Vercel
- **Real-time Chat:** WebSocket connections for instant messaging
- **Responsive Design:** Works seamlessly across desktop and mobile
- **PWA Ready:** Progressive Web App capabilities for offline access

## How It Works

<img width="182" height="612" alt="Screenshot 2025-10-08 at 5 45 16 PM" src="https://github.com/user-attachments/assets/cc7ca4ed-4eab-46a4-9708-a8812675a9c2" />

1. **Input Processing**: User messages are processed through safety filters
2. **Context Retrieval**: RAG pipeline finds relevant information from knowledge base
3. **Response Generation**: GPT-4o mini generates contextually appropriate responses
4. **Safety Validation**: CARE framework ensures trauma-informed approach
5. **Avatar Rendering**: 3D avatar displays response with appropriate emotions
6. **Feedback Loop**: System learns from interactions to improve responses

## Technology Stack

### Frontend
- **Framework**: Next.js 14 with App Router
- **Language**: TypeScript
- **Styling**: TailwindCSS + Shadcn/ui components
- **3D Rendering**: React Three Fiber + Three.js
- **State Management**: Zustand
- **Forms**: React Hook Form + Zod validation

### Backend
- **Database**: Supabase (PostgreSQL)
- **Authentication**: Supabase Auth
- **API**: Next.js API routes
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
git clone https://github.com/aiavatarchatbot-404FoundPath/Deco.git
cd Deco

2. **Install dependencies**
npm install

3. **Set up environment variables**
cp .env.example .env.local

Edit `.env.local` with your credentials:

Supabase
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

OpenAI
OPENAI_API_KEY=your_openai_api_key

Ready Player Me
NEXT_PUBLIC_RPM_APP_ID=your_rpm_app_id

App Configuration
NEXT_PUBLIC_APP_URL=http://localhost:3000


4. **Set up the database**
cd chatbot-app
npm db:setup

5. **Start the development server**
npm run dev


6. **Open your browser**
Navigate to [http://localhost:3000](http://localhost:3000)





