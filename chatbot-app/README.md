# 12P – Trust-Building AI Avatar Conversations for Youth Justice 
> **Note**: This is a **university project** for the course **DECO3801 – Studio 3: Build** at the University of Queensland.  
> It is a research and educational prototype only, not intended for production use. 
## Team Name: 404 Found path
  - Sai Raghavi Koganti
  - Shafa Kirana Mulia
  - Arunkumar
  - Jiwhan Oh
  - Ong Pin Kang
  - Praneel Guptan

Mentor: People Technology Revolution

An **AI-powered avatar chatbot** designed to help young people in the **youth justice system** express themselves safely and build trust through **trauma-informed, culturally inclusive, and engaging conversations**.  

---

## About the Project  

Many young people in youth justice find it difficult or distressing to speak directly with official services due to trauma, distrust, or past experiences. Traditional intake and support processes often feel impersonal and intimidating.  

This project provides a **safe, avatar-based conversational space** where users can:  
- Create and personalise their own avatar (via **Ready Player Me**)  
- Chat with **Adam**, a supportive AI avatar powered by **Retrieval-Augmented Generation (RAG)**  
- Reflect on their mood with a **Mood Check-In**  
- Optionally **save/share transcripts** with caseworkers or mentors  

The system prioritises **trauma-informed design**, **youth-friendly UX**, and **ethical safeguards** to ensure anonymity, trust, and accessibility:contentReference[oaicite:2]{index=2}.  

---

## Key Features  

- **Avatar Creation** – Youth can design their own digital identity or choose from safe defaults.  
- **Conversational AI (Adam)** – RAG chatbot grounded in vetted wellbeing resources.  
- **Mood Check-In** – Gamified, supportive way to reflect before each chat.  
- **Privacy & Consent** – Anonymous by default, with opt-in transcript sharing.  
- **Trauma-Informed Design** – Calming colors, clear consent flows, neutral tone, and cultural sensitivity.  
- **Transcripts & Summaries** – Sessions can be anonymised and exported to help professionals support youth better.  

---

## Tech Stack  

- **Frontend:** Next.js (React), Tailwind CSS, ShadCN components, Three.js / Ready Player Me API  
- **Backend:** Serverless APIs (Vercel), Supabase (Auth, DB, Storage)  
- **AI Integration:** OpenAI API (chat + moderation), LangChain RAG pipeline  
- **Avatar System:** Ready Player Me (custom & default avatars)  
- **Deployment:** Vercel + Supabase (AU regions for data residency)  
- **Security:** JWT Auth, RLS policies, HTTPS/TLS encryption  

---
## Setup 
**1. Clone Repository**
```
  git clone https://github.com/<org>/<repo>.git
  cd ai-avatar-chatbot
```

**2. Install Dependencies**

  `npm install`

**3. Environment Variables**
  Create a .env.local file:
```
  NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
  NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_key
  OPENAI_API_KEY=your_openai_api_key
```

**4. Run Locally**

  `npm run dev`


App runs on `http://localhost:3000`

---
## License & IP

**IP Agreement**: Teams may be required to agree to a UQ project IP agreement.

**Moral Rights**: Teams retain rights to showcase the project in their portfolios.
