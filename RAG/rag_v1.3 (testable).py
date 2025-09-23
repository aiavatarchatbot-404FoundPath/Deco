import os
import faiss
import numpy as np
from pypdf import PdfReader
from openai import OpenAI
import json
import re

# OPTIONAL (only if using CSV word chunks)
try:
    import pandas as pd
except ImportError:
    pd = None  # won't be needed if you use PDFs

# =========================
# Config: choose ONE input
# =========================
USE_CSV_CHUNKS = True   # True = load from Excel; False = parse PDFs
CSV_PATH = ""  # columns: file, chunk_id, content

PDF_FOLDER = ""

# --- OpenAI ---
# Prefer env var: export OPENAI_API_KEY="..."
client = OpenAI(api_key="")  # replace with your actual key


# --- Step 1a: Load PDFs ---
def load_pdfs(folder):
    texts = []
    for file in os.listdir(folder):
        if file.lower().endswith(".pdf"):
            reader = PdfReader(os.path.join(folder, file))
            text = ""
            for page in reader.pages:
                try:
                    t = page.extract_text()
                    if t:
                        text += t + "\n"
                except Exception:
                    pass
            if text.strip():
                texts.append(text)
    return texts

# --- Step 1b: Load chunks from CSV (file,chunk_id,content) ---
def load_chunks_from_csv(csv_path):
    df = pd.read_csv(csv_path)
    required = {"file", "chunk_id", "content"}
    if not required.issubset(df.columns):
        raise ValueError(f"CSV must contain columns: {required}")
    # return just the chunk texts
    return [str(c) for c in df["content"].fillna("") if str(c).strip()]

# --- Step 2: Chunk text (only used for PDFs) ---
def chunk_text(text, size=500, overlap=50):
    words = text.split()
    step = max(1, size - overlap)
    return [" ".join(words[i:i+size]) for i in range(0, len(words), step)]

# --- Step 3: Embed chunks (with batching for stability) ---
def embed(texts, batch_size=128):
    out = []
    for i in range(0, len(texts), batch_size):
        batch = texts[i:i+batch_size]
        resp = client.embeddings.create(model="text-embedding-3-small", input=batch)
        out.extend([d.embedding for d in resp.data])
    return out

# -------------------------
# Build corpus (chunks)
# -------------------------
if USE_CSV_CHUNKS:
    print(f" Using chunks from CSV: {CSV_PATH}")
    chunks = load_chunks_from_csv(CSV_PATH)
else:
    print(" Parsing PDFs and creating chunks...")
    docs = load_pdfs(PDF_FOLDER)
    chunks = [c for doc in docs for c in chunk_text(doc)]

if not chunks:
    raise SystemExit("No text chunks found. Check your input settings/paths.")

print(f"✅ Loaded {len(chunks)} text chunks")

# -------------------------
# Embeddings + FAISS
# -------------------------
print("Creating embeddings...")
embeddings = embed(chunks)
dimension = len(embeddings[0])

index = faiss.IndexFlatL2(dimension)
index.add(np.array(embeddings, dtype="float32"))

# -------------------------
# Retrieval
# -------------------------
def retrieve(query, k=3):
    q_emb = embed([query])[0]
    D, I = index.search(np.array([q_emb], dtype="float32"), k)
    return [chunks[i] for i in I[0]]

# -------------------------
# Chatbot
# -------------------------
def ask(query, session_memory):
    # Retrieve RAG context
    context = "\n".join(retrieve(query))

    # Build conversation history
    history_text = ""  
    history = session_memory.get("history", [])
    for turn in history:
        user_turn = turn.get("You", "")
        bot_turn = turn.get("Bot", "")
        history_text += f"You: {user_turn}\nBot: {bot_turn}\n"
    
    response = client.chat.completions.create(
        model="gpt-5-nano",
        # This part is how to change the tone and control the responses of the model
        messages=[
            {"role":"system","content": (
                     "You are a helpful, supportive chatbot for young people in Queensland's youth justice system." 
                     "Prioritise the provided context when answering." 
                     "Be concise and empathetic."
                     "If the context is incomplete, you may also use your general knowledge, at max 3 sentences in this case." 
                     "Detect the user's emotion (Positive, Neutral, Negative) and the intensity of any negative emotions (Low, Moderate, High, Imminent Danger)." 
                     "Return JSON with keys: 'answer', 'emotion', 'tier', 'suggestions'."
                     "Do not provide suggestions in the answer."
                     )
            },
            {"role":"user","content": f"Previous Conversation:\n{history_text}\n\nContext:\n{context}\n\nQuestion: {query}"}
        ]
        
    )
    try:
        return json.loads(response.choices[0].message.content)
    except json.JSONDecodeError:
        return {
            "answer": response.choices[0].message.content,
            "emotion": "Neutral",
            "tier": "None",
            "suggestions": []
        }

def continue_conversation():
    return input("Do you want to continue? Type 'Yes' or 'No': ")

def escalate_to_safety_protocol():
    return ("🤖 I’m really concerned about your safety. "
        "If you are in immediate danger, please call 000 (Australia) or your local emergency services. "
        "You are not alone — you can also reach out to Lifeline on 13 11 14 for 24/7 support.")

def session_closure():
    return ("Thank you for sharing with me today. You are not alone, and support is available whenever you need it." 
            " Take care of yourself and goodbye. 👋")

DANGER_PATTERNS = [
    r"\bsuicid(e|al)\b",                    # suicide, suicidal
    r"\bdie\b",                             # die
    r"\bdying\b",                           # dying
    r"\bkill(ing)? myself\b",               # kill myself, killing myself
    r"\bend(ing)? my life\b",               # end my life, ending my life
    r"\bdeath\b",                           # death
    r"\bmurder myself\b",                   # murder myself
    r"\bwant to die\b",                     # want to die
    r"\bcan't go on\b",                     # can't go on
    r"\bi feel hopeless\b",                  # i feel hopeless
    r"\bi want to disappear\b",             # i want to disappear
    r"\bno reason to live\b",               # no reason to live
    r"\bi wish i was dead\b",               # i wish i was dead
    r"\bi am worthless\b",                  # i am worthless
    r"\bi am a burden\b",                   # i am a burden
]

# Precompile regex patterns
COMPILED_DANGER_PATTERNS = [re.compile(p, re.IGNORECASE) for p in DANGER_PATTERNS]

def check_filters(user_input):
    for pattern in COMPILED_ADVICE_PATTERNS:
        if pattern.search(user_input):
            return "Imminent Danger"
    return None

def clear_session_memory(session_memory):
    session_memory["history"] = []
    session_memory["last_emotion"] = None
    session_memory["last_tier"] = None
    session_memory["last_suggestions"] = []

# List of keywords/phrases indicating the user wants advice
ADVICE_PATTERNS = [
    r"\badvice\b",
    r"\bsuggest(ion|ions)?\b",        # suggest, suggestion, suggestions
    r"\brecommend(ation|ations)?\b",  # recommend, recommendations
    r"\btips?\b",                      # tip or tips
    r"what should i do",
    r"how do i",
    r"how should i",
    r"\bideas?\b",                     # idea or ideas
    r"\boptions?\b",                   # option or options
    r"\bhelp (me)\b"
]

# Precompile regex patterns for efficiency
COMPILED_ADVICE_PATTERNS = [re.compile(p, re.IGNORECASE) for p in ADVICE_PATTERNS]

def wants_advice(user_input: str) -> bool:
    for pattern in COMPILED_DANGER_PATTERNS:
        if pattern.search(user_input):
            return True
    return False
    
def rag_ai_pipeline(session_memory):
    print("\n 🤖 “Hey, I’m Adam. I can share information about youth justice, your rights, and where to find support. What would you like to talk about?” (Type 'exit' to quit)\n")
    
    while True:
        query = input("You: ")
        if query.lower() == "exit":
            print("👋 Goodbye!")
            clear_session_memory(session_memory)
            break
            
        # Step 1/2. Detect emotion + risk level
        analysis = ask(query, session_memory)
        
        emotion = analysis.get("emotion")
        tier = analysis.get("tier")
        answer = analysis.get("answer")
        suggestions = analysis.get("suggestions") or []

        # Check filters for any danger words
        tier = check_filters(query) or tier
        
        # Step 3. Safety escalation
        if tier == "Imminent Danger":
            safety_msg = escalate_to_safety_protocol()
            print(safety_msg)
    
            user_choice = continue_conversation()
            if user_choice.lower() == "no":
                closure_msg = session_closure()
                print(closure_msg)
                break

        # Step 4. Print answer to user's problem
        print(f"🤖 {answer}")

        # Step 5. Providing suggestions to the user
        if wants_advice(query): 
            print("🤖 Here are some suggestions that might help:")
            for s in analysis['suggestions']:
                print(f"- {s}")
                  
        # Step 5. Update session memory after providing a solution and suggestions to the user
        session_memory["history"].append(
            {"You": query,
             "Bot": answer
            }
        )
        session_memory["last_emotion"] = emotion
        session_memory["last_tier"] = tier
        session_memory["last_suggestions"] = suggestions

    # Step 7. Return session memory once conversation is finished
    return session_memory

# -------------------------
# Run Chat Loop
# -------------------------
session_memory = {
        "history": [], 
        "last_emotion": None, 
        "last_tier": None, 
        "last_suggestions": []
    }
rag_ai_pipeline(session_memory)

